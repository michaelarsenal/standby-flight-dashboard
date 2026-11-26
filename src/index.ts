import { expandAirportInput } from "./airports.ts";
import { sendStandbyAlert } from "./alerts.ts";
import {
  deleteWatch,
  getLatestExpertFlyerSnapshots,
  getSnapshots,
  listWatches,
  recordSnapshot,
  updateWatchStatus,
  upsertWatch,
} from "./db.ts";
import { buildDemoCandidates } from "./providers/demo.ts";
import { fetchDuffelCandidates } from "./providers/duffel.ts";
import {
  fetchAirportDelaySignal,
  fetchFlightAwareDisruptions,
  fetchInboundAircraftSignal,
} from "./providers/flightaware.ts";
import { fetchAirportWeatherRisk } from "./providers/weather.ts";
import {
  computePredictiveDisruptionRisk,
  computeStandbyScore,
  parseFareBuckets,
} from "./scoring.ts";
import type { CabinKey, CabinSeatSummary, Env, FlightCandidate, RouteDisruption, SeatSnapshot } from "./types.ts";
import { MANIFEST_JSON, renderHtml } from "./ui.ts";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function cabinFromSnapshot(
  open: number,
  occupied: number,
  blocked: number,
  fallbackTotal: number
): CabinSeatSummary {
  const sum = open + occupied + blocked;
  return {
    available: open,
    occupied,
    blocked,
    total: sum > 0 ? sum : fallbackTotal,
  };
}

function applyExpertFlyerSnapshot(
  c: { cabins: Record<CabinKey, CabinSeatSummary> },
  snap: SeatSnapshot | undefined
): Record<CabinKey, CabinSeatSummary> {
  if (!snap) return c.cabins;
  return {
    first: cabinFromSnapshot(snap.first_open, snap.first_occupied, snap.first_blocked, c.cabins.first.total),
    business: cabinFromSnapshot(snap.business_open, snap.business_occupied, snap.business_blocked, c.cabins.business.total),
    prem_econ: cabinFromSnapshot(snap.prem_econ_open, snap.prem_econ_occupied, snap.prem_econ_blocked, c.cabins.prem_econ.total),
    economy: cabinFromSnapshot(snap.economy_open, snap.economy_occupied, snap.economy_blocked, c.cabins.economy.total),
  };
}

function hoursUntilDeparture(date: string, time: string): number | null {
  if (!date) return null;
  const hhmm = /^\d{2}:\d{2}$/.test(time) ? time : "18:00";
  const dt = new Date(`${date}T${hhmm}:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return (dt.getTime() - Date.now()) / 3600000;
}

async function runFlightSearch(params: {
  env: Env;
  originsRaw: string;
  destinationsRaw: string;
  date: string;
  airlinesRaw: string;
  targetCabin: CabinKey;
}): Promise<{
  mode: "live" | "demo";
  expandedOrigins: string[];
  expandedDestinations: string[];
  disruptions: RouteDisruption[];
  candidates: FlightCandidate[];
}> {
  const { env, originsRaw, destinationsRaw, date, airlinesRaw, targetCabin } = params;
  const origins = expandAirportInput(originsRaw);
  const destinations = expandAirportInput(destinationsRaw);
  const airlines = airlinesRaw
    .toUpperCase()
    .split(/[,\s]+/)
    .filter((a) => /^[A-Z0-9]{2}$/.test(a));

  const watchedKeys = new Set<string>();
  let efSnapshots = new Map<string, SeatSnapshot>();
  if (env.DB) {
    try {
      const watches = await listWatches(env.DB);
      for (const w of watches) watchedKeys.add(w.flight_key);
      efSnapshots = await getLatestExpertFlyerSnapshots(env.DB);
    } catch {
      // D1 not yet bound in local preview
    }
  }

  // Fetch Open-Meteo predictive weather risk for all queried origins & destinations
  const weatherByAirport = new Map<string, Awaited<ReturnType<typeof fetchAirportWeatherRisk>>>();
  const uniqueAirports = Array.from(new Set([...origins, ...destinations]));
  await Promise.all(
    uniqueAirports.map(async (code) => {
      weatherByAirport.set(code, await fetchAirportWeatherRisk(code, date));
    })
  );

  // Fetch FlightAware hub delay status if API key is configured
  const hubDelayByAirport = new Map<string, { riskPoints: number; signal: string | null }>();
  if (env.FLIGHTAWARE_API_KEY) {
    await Promise.all(
      uniqueAirports.map(async (code) => {
        hubDelayByAirport.set(code, await fetchAirportDelaySignal(env.FLIGHTAWARE_API_KEY!, code));
      })
    );
  }

  if (env.DUFFEL_API_TOKEN) {
    const rawCandidates = await fetchDuffelCandidates({
      token: env.DUFFEL_API_TOKEN,
      origins,
      destinations,
      date,
      airlines,
    });

    const allDisruptions: RouteDisruption[] = [];
    if (env.FLIGHTAWARE_API_KEY) {
      for (const o of origins) {
        for (const d of destinations) {
          if (o === d) continue;
          const pairDisruptions = await fetchFlightAwareDisruptions({
            apiKey: env.FLIGHTAWARE_API_KEY,
            origin: o,
            destination: d,
            date,
            airlines,
          });
          allDisruptions.push(...pairDisruptions);
        }
      }
    }

    const candidates: FlightCandidate[] = await Promise.all(
      rawCandidates.map(async (c) => {
        const routeDisruptions = allDisruptions.filter(
          (d) => d.airline === c.airline && d.origin === c.origin && d.destination === c.destination
        );
        const hrs = hoursUntilDeparture(c.departureDate, c.departureTime);

        const origWx = weatherByAirport.get(c.origin);
        const destWx = weatherByAirport.get(c.destination);
        const weatherSignals = [...(origWx?.signals ?? []), ...(destWx?.signals ?? [])];
        const weatherRiskPoints = (origWx?.riskPoints ?? 0) + (destWx?.riskPoints ?? 0);

        const origHub = hubDelayByAirport.get(c.origin);
        const destHub = hubDelayByAirport.get(c.destination);
        const hubSignals = [origHub?.signal, destHub?.signal].filter((s): s is string => Boolean(s));
        const hubRiskPoints = (origHub?.riskPoints ?? 0) + (destHub?.riskPoints ?? 0);

        let inboundSignal: string | null = null;
        let inboundRiskPoints = 0;
        if (env.FLIGHTAWARE_API_KEY && hrs !== null && hrs <= 24 && hrs >= -2) {
          const inb = await fetchInboundAircraftSignal(env.FLIGHTAWARE_API_KEY, c.flightNumber);
          inboundSignal = inb.signal;
          inboundRiskPoints = inb.riskPoints;
        }

        const disruptionRisk = computePredictiveDisruptionRisk({
          disruptions: routeDisruptions,
          weatherSignals,
          weatherRiskPoints,
          hubSignals,
          hubRiskPoints,
          inboundSignal,
          inboundRiskPoints,
        });

        const efSnap = efSnapshots.get(c.flightKey);
        const cabins = applyExpertFlyerSnapshot(c, efSnap);
        const { score, readiness, reasons } = computeStandbyScore({
          cabins,
          targetCabin,
          fareBuckets: c.fareBuckets,
          disruptions: routeDisruptions,
          predictiveRiskPoints: weatherRiskPoints + hubRiskPoints + inboundRiskPoints,
          hoursToDeparture: hrs,
        });
        return {
          ...c,
          cabins,
          disruptions: routeDisruptions,
          disruptionRisk,
          standbyScore: score,
          readiness,
          reasons: efSnap ? [`ExpertFlyer seat map (${efSnap.captured_at.slice(0, 16)}Z)`, ...reasons] : reasons,
          watched: watchedKeys.has(c.flightKey),
        };
      })
    );

    candidates.sort((a, b) => b.standbyScore - a.standbyScore);
    return {
      mode: "live",
      expandedOrigins: origins,
      expandedDestinations: destinations,
      disruptions: allDisruptions,
      candidates,
    };
  }

  const demo = buildDemoCandidates({ origins, destinations, date, airlines });
  const candidates: FlightCandidate[] = demo.candidates.map((c) => {
    const hrs = hoursUntilDeparture(c.departureDate, c.departureTime);
    const origWx = weatherByAirport.get(c.origin);
    const destWx = weatherByAirport.get(c.destination);
    const weatherSignals = [...(origWx?.signals ?? []), ...(destWx?.signals ?? [])];
    const weatherRiskPoints = (origWx?.riskPoints ?? 0) + (destWx?.riskPoints ?? 0);

    const disruptionRisk = computePredictiveDisruptionRisk({
      disruptions: c.disruptions,
      weatherSignals,
      weatherRiskPoints,
      hubSignals: [],
      hubRiskPoints: 0,
    });

    const { score, readiness, reasons } = computeStandbyScore({
      cabins: c.cabins,
      targetCabin,
      fareBuckets: c.fareBuckets,
      disruptions: c.disruptions,
      predictiveRiskPoints: weatherRiskPoints,
      hoursToDeparture: hrs,
    });
    return {
      ...c,
      disruptionRisk,
      standbyScore: score,
      readiness,
      reasons,
      watched: watchedKeys.has(c.flightKey),
    };
  });

  candidates.sort((a, b) => b.standbyScore - a.standbyScore);
  return {
    mode: "demo",
    expandedOrigins: origins,
    expandedDestinations: destinations,
    disruptions: demo.disruptions,
    candidates,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (path === "/" || path === "/index.html") {
      return new Response(renderHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/manifest.json") {
      return new Response(MANIFEST_JSON, {
        headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
      });
    }

    if (path === "/api/health") {
      return jsonResponse({
        ok: true,
        mode: env.DUFFEL_API_TOKEN ? "live" : "demo",
        hasFlightAware: Boolean(env.FLIGHTAWARE_API_KEY),
        hasD1: Boolean(env.DB),
        hasAlerts: Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL_TO),
      });
    }

    if (path === "/api/search" && request.method === "GET") {
      const originsRaw = url.searchParams.get("origins") || "WAS";
      const destinationsRaw = url.searchParams.get("destinations") || "LHR";
      const date = url.searchParams.get("date") || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const airlinesRaw = url.searchParams.get("airlines") || "BA,VS";
      const targetCabin = (url.searchParams.get("targetCabin") || "economy") as CabinKey;

      const result = await runFlightSearch({
        env,
        originsRaw,
        destinationsRaw,
        date,
        airlinesRaw,
        targetCabin,
      });
      return jsonResponse(result);
    }

    if (path === "/api/score" && request.method === "POST") {
      const body = (await request.json()) as {
        candidate: FlightCandidate;
        targetCabin: CabinKey;
        efBuckets?: string;
      };
      const fareBuckets = parseFareBuckets(body.efBuckets, body.candidate.airline);
      const hrs = hoursUntilDeparture(body.candidate.departureDate, body.candidate.departureTime);
      const { score, readiness, reasons } = computeStandbyScore({
        cabins: body.candidate.cabins,
        targetCabin: body.targetCabin || "economy",
        fareBuckets,
        disruptions: body.candidate.disruptions || [],
        hoursToDeparture: hrs,
      });
      return jsonResponse({
        ...body.candidate,
        fareBuckets,
        standbyScore: score,
        readiness,
        reasons,
      });
    }

    if (path === "/api/watches" && request.method === "GET") {
      if (!env.DB) return jsonResponse({ watches: [] });
      const watches = await listWatches(env.DB);
      return jsonResponse({ watches });
    }

    if (path === "/api/watches" && request.method === "POST") {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const body = (await request.json()) as {
        candidate: FlightCandidate;
        targetCabin?: CabinKey;
        efBuckets?: string | null;
      };
      await upsertWatch(env.DB, body.candidate, body.targetCabin || "economy", body.efBuckets);
      const hrs = hoursUntilDeparture(body.candidate.departureDate, body.candidate.departureTime);
      await recordSnapshot(env.DB, body.candidate, hrs, "Initial watch");
      return jsonResponse({ ok: true });
    }

    if (path.startsWith("/api/watches/") && request.method === "DELETE") {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const flightKey = decodeURIComponent(path.slice("/api/watches/".length));
      await deleteWatch(env.DB, flightKey);
      return jsonResponse({ ok: true });
    }

    if (path.startsWith("/api/history/") && request.method === "GET") {
      if (!env.DB) return jsonResponse({ snapshots: [] });
      const flightKey = decodeURIComponent(path.slice("/api/history/".length));
      const snapshots = await getSnapshots(env.DB, flightKey);
      return jsonResponse({ snapshots });
    }

    if (path === "/api/expertflyer/ingest" && request.method === "POST") {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const body = (await request.json()) as {
        flightKey: string;
        aircraft?: string;
        status?: "ok" | "unavailable";
        cabins?: Record<CabinKey, CabinSeatSummary>;
        note?: string;
      };
      if (!body.flightKey) {
        return jsonResponse({ error: "Missing flightKey" }, 400);
      }
      const watches = await listWatches(env.DB);
      const w = watches.find((x) => x.flight_key === body.flightKey);
      if (!w) {
        return jsonResponse({ error: "Watch not found" }, 404);
      }

      if (body.status === "unavailable" || !body.cabins) {
        // Preserve last-known-good snapshot when seat map locks inside T-60m
        return jsonResponse({
          ok: true,
          flightKey: w.flight_key,
          preservedLastKnownGood: true,
          note: body.note || "Seat map unavailable; preserved last known snapshot",
        });
      }

      const fareBuckets = parseFareBuckets(w.ef_buckets, w.airline);
      const hrs = hoursUntilDeparture(w.departure_date, w.departure_time || "");
      const rescored = computeStandbyScore({
        cabins: body.cabins,
        targetCabin: (w.target_cabin || "economy") as CabinKey,
        fareBuckets,
        disruptions: [],
        hoursToDeparture: hrs,
      });

      const candidate: FlightCandidate = {
        flightKey: w.flight_key,
        airline: w.airline,
        flightNumber: w.flight_number,
        origin: w.origin,
        destination: w.destination,
        departureDate: w.departure_date,
        departureTime: w.departure_time || "",
        arrivalTime: "",
        duration: "",
        aircraft: body.aircraft || w.aircraft || "",
        dataSource: "live",
        cabins: body.cabins,
        fareBuckets,
        disruptions: [],
        standbyScore: rescored.score,
        readiness: rescored.readiness,
        reasons: rescored.reasons,
        watched: true,
      };

      const note = body.note || (hrs !== null && hrs <= 1.6 ? "ExpertFlyer pre-close seat map" : "ExpertFlyer seat map");
      await recordSnapshot(env.DB, candidate, hrs, note);

      if (w.last_status && w.last_status !== rescored.readiness) {
        await sendStandbyAlert(
          env,
          candidate,
          w.last_status,
          rescored.reasons.join("; ")
        );
      }

      await updateWatchStatus(env.DB, w.flight_key, rescored.readiness, rescored.score);
      return jsonResponse({
        ok: true,
        flightKey: w.flight_key,
        score: rescored.score,
        readiness: rescored.readiness,
        hoursToDeparture: hrs,
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (!env.DB) return;
    const watches = await listWatches(env.DB);
    const today = new Date().toISOString().slice(0, 10);

    for (const w of watches) {
      if (w.departure_date < today) continue;

      const result = await runFlightSearch({
        env,
        originsRaw: w.origin,
        destinationsRaw: w.destination,
        date: w.departure_date,
        airlinesRaw: w.airline,
        targetCabin: (w.target_cabin || "economy") as CabinKey,
      });

      const match = result.candidates.find((c) => c.flightKey === w.flight_key);
      if (!match) continue;

      const fareBuckets = parseFareBuckets(w.ef_buckets, w.airline);
      const hrs = hoursUntilDeparture(match.departureDate, match.departureTime);
      const rescored = computeStandbyScore({
        cabins: match.cabins,
        targetCabin: (w.target_cabin || "economy") as CabinKey,
        fareBuckets,
        disruptions: match.disruptions,
        hoursToDeparture: hrs,
      });

      const updated: FlightCandidate = {
        ...match,
        fareBuckets,
        standbyScore: rescored.score,
        readiness: rescored.readiness,
        reasons: rescored.reasons,
      };

      await recordSnapshot(env.DB, updated, hrs);

      if (w.last_status && w.last_status !== updated.readiness) {
        await sendStandbyAlert(
          env,
          updated,
          w.last_status,
          updated.reasons.join("; ")
        );
      }

      await updateWatchStatus(env.DB, w.flight_key, updated.readiness, updated.standbyScore);
    }
  },
};
