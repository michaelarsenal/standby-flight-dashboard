import { expandAirportInput } from "./airports.ts";
import { sendNtfyPush, sendStagePushAlert, sendStandbyAlert } from "./alerts.ts";
import {
  deleteWatch,
  getEfSeatmap,
  getEfSeatmapsByKeys,
  getLatestExpertFlyerSnapshots,
  getSetting,
  getSnapshots,
  listEfFlights,
  listWatches,
  parseAlertStages,
  recordSnapshot,
  setSetting,
  updateWatchAlerts,
  updateWatchInboundStage,
  updateWatchStatus,
  upsertEfFlights,
  upsertEfSeatmap,
  upsertWatch,
  type EfFlightRow,
} from "./db.ts";
import { buildDemoCandidates } from "./providers/demo.ts";
import { fetchDuffelCandidates } from "./providers/duffel.ts";
import {
  fetchAirportDelaySignal,
  fetchFlightAwareDisruptions,
  fetchInboundAircraftSignal,
  fetchInboundDetails,
} from "./providers/flightaware.ts";
import { fetchAirportWeatherRisk } from "./providers/weather.ts";
import {
  computeEconomySeatStats,
  computePredictiveDisruptionRisk,
  computeStandbyScore,
  parseFareBuckets,
} from "./scoring.ts";
import type { AlertStages, CabinKey, CabinSeatSummary, Env, FlightCandidate, RouteDisruption, SeatSnapshot } from "./types.ts";
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
  let efFlights: EfFlightRow[] = [];
  if (env.DB) {
    try {
      const watches = await listWatches(env.DB);
      for (const w of watches) watchedKeys.add(w.flight_key);
      efSnapshots = await getLatestExpertFlyerSnapshots(env.DB);
      efFlights = await listEfFlights(env.DB, date);
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

    // Merge ExpertFlyer operating flight numbers & fare buckets over Duffel codeshares
    const matchedEfKeys = new Set<string>();
    const mergedRaw = rawCandidates.map((c) => {
      const efMatch = efFlights.find(
        (ef) =>
          ef.flight_key === c.flightKey ||
          (ef.airline === c.airline &&
            ef.origin === c.origin &&
            ef.destination === c.destination &&
            ef.departure_time === c.departureTime)
      );
      if (!efMatch) return c;
      matchedEfKeys.add(efMatch.flight_key);
      return {
        ...c,
        flightKey: efMatch.flight_key,
        flightNumber: efMatch.flight_number,
        arrivalTime: efMatch.arrival_time || c.arrivalTime,
        aircraft: efMatch.aircraft || c.aircraft,
        fareBuckets: efMatch.ef_buckets ? parseFareBuckets(efMatch.ef_buckets, c.airline) : c.fareBuckets,
      };
    });

    // Include any ExpertFlyer flights on queried route/airlines that Duffel omitted
    const efRouteFlights = efFlights.filter(
      (ef) =>
        origins.includes(ef.origin) &&
        destinations.includes(ef.destination) &&
        (airlines.length === 0 || airlines.includes(ef.airline))
    );
    const mergedClean = efRouteFlights.length > 0
      ? mergedRaw.filter((c) => matchedEfKeys.has(c.flightKey))
      : mergedRaw;

    for (const ef of efRouteFlights) {
      if (matchedEfKeys.has(ef.flight_key)) continue;
      const empty = { available: 0, occupied: 0, blocked: 0, total: 0 };
      mergedClean.push({
        flightKey: ef.flight_key,
        airline: ef.airline,
        flightNumber: ef.flight_number,
        origin: ef.origin,
        destination: ef.destination,
        departureDate: ef.departure_date,
        departureTime: ef.departure_time,
        arrivalTime: ef.arrival_time || "00:00",
        duration: "",
        aircraft: ef.aircraft || "Widebody",
        dataSource: "live",
        cabins: { first: { ...empty }, business: { ...empty }, prem_econ: { ...empty }, economy: { ...empty } },
        fareBuckets: ef.ef_buckets ? parseFareBuckets(ef.ef_buckets, ef.airline) : null,
      });
    }

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

    const seatmapMap = env.DB
      ? await getEfSeatmapsByKeys(env.DB, mergedClean.map((c) => c.flightKey))
      : new Map<string, string>();

    const candidates: FlightCandidate[] = await Promise.all(
      mergedClean.map(async (c) => {
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
        const economyComfort = computeEconomySeatStats(seatmapMap.get(c.flightKey));
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
          economyComfort,
        };
      })
    );

    candidates.sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
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

  candidates.sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
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

    if (path === "/api/settings/push" && request.method === "GET") {
      const topic = env.DB ? await getSetting(env.DB, "ntfy_topic") : null;
      return jsonResponse({ ntfyTopic: topic || env.NTFY_TOPIC || "" });
    }

    if (path === "/api/settings/push" && request.method === "POST") {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const body = (await request.json()) as { ntfyTopic?: string; test?: boolean };
      const topic = String(body.ntfyTopic || "").trim();
      await setSetting(env.DB, "ntfy_topic", topic);
      let testSent = false;
      if (body.test && topic) {
        testSent = await sendNtfyPush(
          topic,
          "Standby Flight Dashboard — Push Alerts Active",
          "You will now receive stage alerts (ETD, Enroute, Landed, Delay/Cancel) for your watched flights.",
          { tags: "airplane,white_check_mark" }
        );
      }
      return jsonResponse({ ok: true, ntfyTopic: topic, testSent });
    }

    if (path.startsWith("/api/watches/") && path.endsWith("/alerts") && (request.method === "PATCH" || request.method === "POST")) {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const flightKey = decodeURIComponent(path.slice("/api/watches/".length, -"/alerts".length));
      const body = (await request.json()) as Partial<AlertStages>;
      const watches = await listWatches(env.DB);
      const existing = watches.find((w) => w.flight_key === flightKey);
      if (!existing) return jsonResponse({ error: "Watch not found" }, 404);
      const current = parseAlertStages(existing.alert_stages);
      const updated: AlertStages = {
        etd: body.etd !== undefined ? Boolean(body.etd) : current.etd,
        enroute: body.enroute !== undefined ? Boolean(body.enroute) : current.enroute,
        landed: body.landed !== undefined ? Boolean(body.landed) : current.landed,
        disruption: body.disruption !== undefined ? Boolean(body.disruption) : current.disruption,
      };
      await updateWatchAlerts(env.DB, flightKey, updated);
      return jsonResponse({ ok: true, alertStages: updated });
    }

    if (path === "/api/watches" && request.method === "GET") {
      if (!env.DB) return jsonResponse({ watches: [], ntfyTopic: env.NTFY_TOPIC || "" });
      const [watches, savedTopic, efMap] = await Promise.all([
        listWatches(env.DB),
        getSetting(env.DB, "ntfy_topic"),
        getLatestExpertFlyerSnapshots(env.DB),
      ]);
      const ntfyTopic = savedTopic || env.NTFY_TOPIC || "";
      const cutoff = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const enriched = await Promise.all(
        watches.map(async (w) => {
          let nextWatch = w;
          const snap = efMap.get(w.flight_key);
          if (snap) {
            const cabins = {
              first: cabinFromSnapshot(snap.first_open, snap.first_occupied, snap.first_blocked, 0),
              business: cabinFromSnapshot(snap.business_open, snap.business_occupied, snap.business_blocked, 0),
              prem_econ: cabinFromSnapshot(snap.prem_econ_open, snap.prem_econ_occupied, snap.prem_econ_blocked, 0),
              economy: cabinFromSnapshot(snap.economy_open, snap.economy_occupied, snap.economy_blocked, 0),
            };
            const fareBuckets = parseFareBuckets(w.ef_buckets, w.airline);
            const hrs = hoursUntilDeparture(w.departure_date, w.departure_time || "18:00");
            const rescored = computeStandbyScore({
              cabins,
              targetCabin: ((w.target_cabin || "economy") as CabinKey),
              fareBuckets,
              disruptions: [],
              hoursToDeparture: hrs,
            });
            if (w.last_status !== rescored.readiness || w.last_score !== rescored.score) {
              await updateWatchStatus(env.DB!, w.flight_key, rescored.readiness, rescored.score);
            }
            nextWatch = { ...w, last_status: rescored.readiness, last_score: rescored.score };
          }
          if (!env.FLIGHTAWARE_API_KEY || w.departure_date < cutoff) return nextWatch;
          try {
            const inbound = await fetchInboundDetails(
              env.FLIGHTAWARE_API_KEY!,
              w.flight_number,
              w.departure_date,
              w.departure_time,
            );
            return { ...nextWatch, inbound };
          } catch {
            return nextWatch;
          }
        }),
      );
      return jsonResponse({ watches: enriched, ntfyTopic });
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

    if (path === "/api/watches/manual" && request.method === "POST") {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const body = (await request.json()) as {
        flight: string;
        origin: string;
        destination: string;
        departureDate: string;
        targetCabin?: CabinKey;
      };
      const rawFlight = String(body.flight || "").trim().toUpperCase().replace(/\s+/g, "");
      const m = rawFlight.match(/^([A-Z0-9]{2})(\d+)$/);
      const origin = String(body.origin || "").trim().toUpperCase();
      const dest = String(body.destination || "").trim().toUpperCase();
      const date = String(body.departureDate || "").trim();
      if (!m || origin.length !== 3 || dest.length !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return jsonResponse({ error: "Invalid flight, origin, destination, or date" }, 400);
      }
      const airline = m[1];
      const flightNumber = `${airline}${parseInt(m[2], 10)}`;
      const flightKey = `${flightNumber}-${origin}-${dest}-${date}`;
      const empty = { available: 0, occupied: 0, blocked: 0, total: 0 };
      const candidate: FlightCandidate = {
        flightKey,
        airline,
        flightNumber,
        origin,
        destination: dest,
        departureDate: date,
        departureTime: "18:00",
        arrivalTime: "",
        duration: "",
        aircraft: "",
        dataSource: "live",
        cabins: { first: { ...empty }, business: { ...empty }, prem_econ: { ...empty }, economy: { ...empty } },
        fareBuckets: null,
        disruptions: [],
        standbyScore: 50,
        readiness: "amber",
        reasons: ["Manual ExpertFlyer watch (awaiting sync)"],
        watched: true,
      };
      await upsertWatch(env.DB, candidate, body.targetCabin || "economy", null);
      return jsonResponse({ ok: true, flightKey });
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
        airline?: string;
        flightNumber?: string;
        origin?: string;
        destination?: string;
        departureDate?: string;
        departureTime?: string;
        aircraft?: string;
        efBuckets?: string;
        status?: "ok" | "unavailable";
        cabins?: Record<CabinKey, CabinSeatSummary>;
        seatmap?: unknown;
        note?: string;
      };
      if (!body.flightKey) {
        return jsonResponse({ error: "Missing flightKey" }, 400);
      }
      const watches = await listWatches(env.DB);
      const w = watches.find((x) => x.flight_key === body.flightKey);
      const airline = w?.airline || body.airline || "";
      const flightNumber = w?.flight_number || body.flightNumber || "";
      const origin = w?.origin || body.origin || "";
      const destination = w?.destination || body.destination || "";
      const departureDate = w?.departure_date || body.departureDate || "";
      const departureTime = w?.departure_time || body.departureTime || "18:00";

      if (!w && !(airline && flightNumber && origin && destination && departureDate)) {
        return jsonResponse({ error: "Watch not found and flight metadata incomplete" }, 404);
      }

      if (body.status === "unavailable" || !body.cabins) {
        // Preserve last-known-good snapshot when seat map locks inside T-60m
        return jsonResponse({
          ok: true,
          flightKey: body.flightKey,
          preservedLastKnownGood: true,
          note: body.note || "Seat map unavailable; preserved last known snapshot",
        });
      }

      const fareBuckets = parseFareBuckets(w?.ef_buckets || body.efBuckets || null, airline);
      const hrs = hoursUntilDeparture(departureDate, departureTime);
      const rescored = computeStandbyScore({
        cabins: body.cabins,
        targetCabin: ((w?.target_cabin || "economy") as CabinKey),
        fareBuckets,
        disruptions: [],
        hoursToDeparture: hrs,
      });

      const candidate: FlightCandidate = {
        flightKey: body.flightKey,
        airline,
        flightNumber,
        origin,
        destination,
        departureDate,
        departureTime,
        arrivalTime: "",
        duration: "",
        aircraft: body.aircraft || w?.aircraft || "",
        dataSource: "live",
        cabins: body.cabins,
        fareBuckets,
        disruptions: [],
        standbyScore: rescored.score,
        readiness: rescored.readiness,
        reasons: rescored.reasons,
        watched: Boolean(w),
      };

      const note = body.note || (hrs !== null && hrs <= 1.6 ? "ExpertFlyer pre-close seat map" : "ExpertFlyer seat map");
      await recordSnapshot(env.DB, candidate, hrs, note);
      if (body.seatmap) {
        await upsertEfSeatmap(env.DB, body.flightKey, candidate.aircraft, body.seatmap);
      }

      if (w) {
        if (w.last_status && w.last_status !== rescored.readiness) {
          await sendStandbyAlert(
            env,
            candidate,
            w.last_status,
            rescored.reasons.join("; ")
          );
        }
        await updateWatchStatus(env.DB, w.flight_key, rescored.readiness, rescored.score);
      }

      return jsonResponse({
        ok: true,
        flightKey: body.flightKey,
        watched: Boolean(w),
        score: rescored.score,
        readiness: rescored.readiness,
        hoursToDeparture: hrs,
      });
    }

    if (path === "/api/expertflyer/flights" && request.method === "POST") {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const body = (await request.json()) as {
        flights?: Omit<EfFlightRow, "updated_at">[];
      };
      const flights = Array.isArray(body.flights) ? body.flights : [];
      await upsertEfFlights(env.DB, flights);
      return jsonResponse({ ok: true, count: flights.length });
    }

    if (path.startsWith("/api/seatmap/") && request.method === "GET") {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const flightKey = decodeURIComponent(path.slice("/api/seatmap/".length));
      const row = await getEfSeatmap(env.DB, flightKey);
      if (!row) return jsonResponse({ error: "Seat map not cached yet for this flight" }, 404);
      const parsedSeatmap = JSON.parse(row.seatmap_json);
      return jsonResponse({
        flightKey: row.flight_key,
        aircraft: row.aircraft,
        captured_at: row.captured_at,
        seatmap: parsedSeatmap,
        economyComfort: computeEconomySeatStats(parsedSeatmap),
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (!env.DB) return;
    const watches = await listWatches(env.DB);
    const today = new Date().toISOString().slice(0, 10);
    const ntfyTopic = await getSetting(env.DB, "ntfy_topic");

    const efMap = await getLatestExpertFlyerSnapshots(env.DB);
    for (const w of watches) {
      if (w.departure_date < today) continue;

      if (env.FLIGHTAWARE_API_KEY) {
        try {
          const inbound = await fetchInboundDetails(
            env.FLIGHTAWARE_API_KEY,
            w.flight_number,
            w.departure_date,
            w.departure_time
          );
          if (inbound) {
            const isDelayed = inbound.delayMins >= 15;
            const delayBucket = Math.floor(inbound.delayMins / 15) * 15;
            const stageKey =
              inbound.stage === "cancelled"
                ? "cancelled"
                : inbound.stage === "landed"
                  ? "landed"
                  : inbound.stage === "enroute"
                    ? (isDelayed ? `enroute_delayed_${delayBucket}` : "enroute")
                    : (isDelayed ? `etd_delayed_${delayBucket}` : "etd");

            if (w.last_inbound_stage !== stageKey) {
              const prev = w.last_inbound_stage || "";
              const prevMatch = prev.match(/^(etd|enroute)_delayed_(\d+)$/);
              const prevBucket = prevMatch ? Number(prevMatch[2]) : null;
              const isLegacySameStage =
                (prev === "etd_delayed" && stageKey.startsWith("etd_delayed_")) ||
                (prev === "enroute_delayed" && stageKey.startsWith("enroute_delayed_"));
              const isDelayReduced =
                prevBucket !== null &&
                ((prevMatch?.[1] === "etd" && stageKey.startsWith("etd_delayed_")) ||
                  (prevMatch?.[1] === "enroute" && stageKey.startsWith("enroute_delayed_"))) &&
                delayBucket <= prevBucket;

              const alerts = parseAlertStages(w.alert_stages);
              const shouldAlert =
                !isLegacySameStage &&
                !isDelayReduced &&
                ((stageKey === "cancelled" && alerts.disruption) ||
                  (stageKey.includes("_delayed") && alerts.disruption) ||
                  (stageKey === "landed" && alerts.landed) ||
                  (stageKey === "enroute" && alerts.enroute) ||
                  (stageKey === "etd" && alerts.etd));

              if (shouldAlert && w.last_inbound_stage) {
                const label =
                  stageKey === "cancelled"
                    ? "CANCELLED"
                    : stageKey === "landed"
                      ? "LANDED"
                      : stageKey.startsWith("enroute_delayed")
                        ? `ENROUTE (+${inbound.delayMins}m DELAYED)`
                        : stageKey === "enroute"
                          ? "ENROUTE (ON TIME)"
                          : stageKey.startsWith("etd_delayed")
                            ? (prevBucket !== null ? `FURTHER DELAY (+${inbound.delayMins}m)` : `ETD DELAYED (+${inbound.delayMins}m)`)
                            : "ETD SCHEDULED";
                await sendStagePushAlert(env, ntfyTopic, w, inbound, label);
              }
              await updateWatchInboundStage(env.DB, w.flight_key, stageKey);
            }
          }
        } catch {
          // Ignore inbound check failure in cron
        }
      }

      if (efMap.has(w.flight_key)) continue;

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
