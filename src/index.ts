import { expandAirportInput } from "./airports.ts";
import { generateGeminiBriefingWithDebug, sendNtfyPush, sendOutboundAlert, sendSeatMonitorAlert, sendStagePushAlert, sendStandbyAlert } from "./alerts.ts";
import {
  archiveOldWatches,
  deleteWatch,
  getEfSeatmap,
  getEfSeatmapsByKeys,
  getLatestExpertFlyerSnapshots,
  getSetting,
  getSnapshots,
  listEfFlights,
  listRecentTriggers,
  listWatches,
  parseAlertStages,
  recordSnapshot,
  setSetting,
  updateWatchAlerts,
  updateWatchInboundStage,
  updateWatchMilestones,
  updateWatchOutboundState,
  updateWatchSeat,
  updateWatchSeatState,
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
  fetchWatchedFlightTelemetry,
} from "./providers/flightaware.ts";
import { fetchAirportWeatherRisk } from "./providers/weather.ts";
import {
  computeEconomySeatStats,
  computePredictiveDisruptionRisk,
  computeStandbyScore,
  inspectAssignedSeat,
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

function reclassifyFirstToBusinessIfNoFirst(
  cabins: Record<CabinKey, CabinSeatSummary>,
  fareBuckets?: { firstMax: number | null; businessMax: number | null } | null
): Record<CabinKey, CabinSeatSummary> {
  if (
    fareBuckets &&
    fareBuckets.firstMax === null &&
    fareBuckets.businessMax !== null &&
    cabins.first.total > 0 &&
    cabins.business.total === 0
  ) {
    return {
      ...cabins,
      business: { ...cabins.first },
      first: { available: 0, occupied: 0, blocked: 0, total: 0 },
    };
  }
  return cabins;
}

function applyExpertFlyerSnapshot(
  c: { cabins: Record<CabinKey, CabinSeatSummary>; fareBuckets?: { firstMax: number | null; businessMax: number | null } | null },
  snap: SeatSnapshot | undefined
): Record<CabinKey, CabinSeatSummary> {
  if (!snap) return c.cabins;
  const cabins = {
    first: cabinFromSnapshot(snap.first_open, snap.first_occupied, snap.first_blocked, c.cabins.first.total),
    business: cabinFromSnapshot(snap.business_open, snap.business_occupied, snap.business_blocked, c.cabins.business.total),
    prem_econ: cabinFromSnapshot(snap.prem_econ_open, snap.prem_econ_occupied, snap.prem_econ_blocked, c.cabins.prem_econ.total),
    economy: cabinFromSnapshot(snap.economy_open, snap.economy_occupied, snap.economy_blocked, c.cabins.economy.total),
  };
  return reclassifyFirstToBusinessIfNoFirst(cabins, c.fareBuckets);
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

  const weatherByAirport = new Map<string, Awaited<ReturnType<typeof fetchAirportWeatherRisk>>>();
  const hubDelayByAirport = new Map<string, { riskPoints: number; signal: string | null }>();
  const uniqueAirports = Array.from(new Set([...origins, ...destinations]));

  const routePairs: Array<{ o: string; d: string }> = [];
  for (const o of origins) {
    for (const d of destinations) {
      if (o !== d) routePairs.push({ o, d });
    }
  }

  const [rawCandidates, allDisruptionsNested] = await Promise.all([
    env.DUFFEL_API_TOKEN
      ? fetchDuffelCandidates({
          token: env.DUFFEL_API_TOKEN,
          origins,
          destinations,
          date,
          airlines,
          skipSeatmapKeys: new Set(efSnapshots.keys()),
        })
      : Promise.resolve([]),
    env.FLIGHTAWARE_API_KEY && env.DUFFEL_API_TOKEN
      ? Promise.all(
          routePairs.map(({ o, d }) =>
            fetchFlightAwareDisruptions({
              apiKey: env.FLIGHTAWARE_API_KEY!,
              origin: o,
              destination: d,
              date,
              airlines,
            })
          )
        )
      : Promise.resolve([]),
    Promise.all(
      uniqueAirports.map(async (code) => {
        weatherByAirport.set(code, await fetchAirportWeatherRisk(code, date));
      })
    ),
    env.FLIGHTAWARE_API_KEY
      ? Promise.all(
          uniqueAirports.map(async (code) => {
            hubDelayByAirport.set(code, await fetchAirportDelaySignal(env.FLIGHTAWARE_API_KEY!, code));
          })
        )
      : Promise.resolve([]),
  ]);

  if (env.DUFFEL_API_TOKEN) {

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

    const allDisruptions: RouteDisruption[] = allDisruptionsNested.flat();

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

    if ((path === "/api/summary.json" || path === "/api/data.json") && request.method === "GET") {
      const generatedAt = new Date().toISOString();
      const dashboardUrl = `${url.protocol}//${url.host}`;
      if (!env.DB) {
        return jsonResponse({ generatedAt, dashboardUrl, watchedCount: 0, watchedFlights: [], recentTriggers: [] });
      }
      const cutoff = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const [watches, efMap, recentTriggers] = await Promise.all([
        listWatches(env.DB),
        getLatestExpertFlyerSnapshots(env.DB),
        listRecentTriggers(env.DB, 25),
      ]);

      const watchedFlights = await Promise.all(
        watches.map(async (w) => {
          const snap = efMap.get(w.flight_key);
          const cabins = snap
            ? {
                first: cabinFromSnapshot(snap.first_open, snap.first_occupied, snap.first_blocked, 0),
                business: cabinFromSnapshot(snap.business_open, snap.business_occupied, snap.business_blocked, 0),
                prem_econ: cabinFromSnapshot(snap.prem_econ_open, snap.prem_econ_occupied, snap.prem_econ_blocked, 0),
                economy: cabinFromSnapshot(snap.economy_open, snap.economy_occupied, snap.economy_blocked, 0),
              }
            : null;
          let seatState: Record<string, any> | null = null;
          if (w.last_seat_state) {
            try { seatState = JSON.parse(w.last_seat_state); } catch {}
          }
          let telemetry: { inbound: any; outbound: any } = { inbound: null, outbound: null };
          if (env.FLIGHTAWARE_API_KEY && w.departure_date >= cutoff && !w.archived) {
            try {
              telemetry = await fetchWatchedFlightTelemetry(
                env.FLIGHTAWARE_API_KEY,
                w.flight_number,
                w.departure_date,
                w.departure_time || undefined
              );
            } catch {}
          }
          if (path === "/api/data.json") {
            return {
              ...w,
              cabins,
              seatState,
              lastSeatmapAt: snap?.captured_at || null,
              inbound: telemetry.inbound,
              outbound: telemetry.outbound,
            };
          }
          const fmtCab = (c: CabinSeatSummary | undefined) =>
            c && c.total > 0 ? `${c.total}/${c.available + c.blocked} (${c.available} avail, ${c.blocked} blk)` : null;
          const totalCap = cabins
            ? cabins.first.total + cabins.business.total + cabins.prem_econ.total + cabins.economy.total
            : 0;
          const totalOpen = cabins
            ? (cabins.first.available + cabins.first.blocked) +
              (cabins.business.available + cabins.business.blocked) +
              (cabins.prem_econ.available + cabins.prem_econ.blocked) +
              (cabins.economy.available + cabins.economy.blocked)
            : 0;
          return {
            flightKey: w.flight_key,
            flightNumber: w.flight_number,
            route: `${w.origin} -> ${w.destination}`,
            departureDate: w.departure_date,
            departureTime: w.departure_time,
            aircraft: w.aircraft,
            readiness: w.last_status,
            standbyScore: w.last_score,
            efBuckets: w.ef_buckets,
            totalCapOpen: totalCap > 0 ? `${totalCap}/${totalOpen}` : null,
            cabins: cabins
              ? {
                  F: fmtCab(cabins.first),
                  J: fmtCab(cabins.business),
                  W: fmtCab(cabins.prem_econ),
                  Y: fmtCab(cabins.economy),
                }
              : null,
            assignedSeat: w.assigned_seat || null,
            seatStatus: seatState?.seatStatus || null,
            unseatedFrom: seatState?.unseatedFrom || null,
            lastSeatmapAt: snap?.captured_at || null,
            inbound: telemetry.inbound
              ? {
                  flight: telemetry.inbound.inboundFlight,
                  status: telemetry.inbound.status,
                  delayMins: telemetry.inbound.delayMins,
                  turnaroundMins: telemetry.inbound.turnaroundMins,
                  impactSummary: telemetry.inbound.impactSummary,
                }
              : null,
            outbound: telemetry.outbound
              ? {
                  status: telemetry.outbound.status,
                  gate: telemetry.outbound.gate || null,
                  delayMins: telemetry.outbound.delayMins,
                  cancelled: telemetry.outbound.cancelled,
                }
              : null,
          };
        })
      );

      if (path === "/api/data.json") {
        const todayStr = new Date().toISOString().slice(0, 10);
        const tomStr = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        const [efToday, efTomorrow] = await Promise.all([
          listEfFlights(env.DB, todayStr),
          listEfFlights(env.DB, tomStr),
        ]);
        return jsonResponse({
          generatedAt,
          dashboardUrl,
          watchedFlights,
          recentTriggers,
          efFlights: [...efToday, ...efTomorrow],
        });
      }

      return jsonResponse({
        generatedAt,
        dashboardUrl,
        watchedCount: watchedFlights.length,
        watchedFlights,
        recentTriggers: recentTriggers.slice(0, 15).map((t) => ({
          flightNumber: t.flight_number,
          category: t.category,
          title: t.title,
          detail: t.detail,
          triggeredAt: t.triggered_at,
        })),
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

      let efSyncTriggered = false;
      const missingEf = result.candidates.some((c) => !c.fareBuckets);
      if (missingEf && env.GITHUB_TOKEN && env.DB && result.mode === "live" && result.candidates.length > 0) {
        const dispatchKey = `auto_ef_avail:${result.expandedOrigins.join(",")}:${result.expandedDestinations.join(",")}:${date}`;
        const lastRaw = await getSetting(env.DB, dispatchKey);
        const lastMs = lastRaw ? Number(lastRaw) : 0;
        if (!lastMs || Date.now() - lastMs > 120_000) {
          try {
            const ghRes = await fetch(
              "https://api.github.com/repos/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml/dispatches",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                  Accept: "application/vnd.github+json",
                  "User-Agent": "standby-flight-dashboard-worker",
                },
                body: JSON.stringify({
                  ref: "main",
                  inputs: {
                    origins: result.expandedOrigins.join(","),
                    destinations: result.expandedDestinations.join(","),
                    date,
                    mode: "avail_only",
                  },
                }),
              }
            );
            if (ghRes.ok) {
              efSyncTriggered = true;
              await setSetting(env.DB, dispatchKey, String(Date.now()));
            }
          } catch {}
        } else {
          efSyncTriggered = true;
        }
      }

      return jsonResponse({ ...result, efSyncTriggered });
    }

    if (path === "/api/ef-status" && request.method === "GET") {
      if (!env.DB) return jsonResponse({ items: {} });
      const keysParam = url.searchParams.get("keys") || "";
      const date = url.searchParams.get("date") || "";
      const originsRaw = url.searchParams.get("origins") || "";
      const destinationsRaw = url.searchParams.get("destinations") || "";
      const airlinesRaw = url.searchParams.get("airlines") || "BA,VS";
      const targetCabin = (url.searchParams.get("targetCabin") || "economy") as CabinKey;
      const keys = keysParam.split(",").map((k) => k.trim()).filter(Boolean);
      if (keys.length === 0) return jsonResponse({ items: {}, routeKeys: [] });

      const normKey = (k: string) => k.replace(/^([A-Z0-9]{2})-\1(\d+-)/, "$1$2");
      const lookupKeys = Array.from(new Set(keys.flatMap((k) => [k, normKey(k)])));
      const [efFlights, efSnapshots, seatmapMap] = await Promise.all([
        date ? listEfFlights(env.DB, date) : Promise.resolve([]),
        getLatestExpertFlyerSnapshots(env.DB),
        getEfSeatmapsByKeys(env.DB, lookupKeys),
      ]);
      const efFlightByKey = new Map(efFlights.map((f) => [f.flight_key, f]));
      const expOrigins = originsRaw ? expandAirportInput(originsRaw) : [];
      const expDests = destinationsRaw ? expandAirportInput(destinationsRaw) : [];
      const airlineSet = new Set(
        airlinesRaw
          .toUpperCase()
          .split(/[,\s]+/)
          .filter((a) => /^[A-Z0-9]{2}$/.test(a))
      );
      const routeKeys =
        expOrigins.length > 0 && expDests.length > 0
          ? efFlights
              .filter(
                (ef) =>
                  expOrigins.includes(ef.origin) &&
                  expDests.includes(ef.destination) &&
                  (airlineSet.size === 0 || airlineSet.has(ef.airline))
              )
              .map((ef) => ef.flight_key)
          : [];
      const items: Record<string, any> = {};

      for (const fk of keys) {
        const nk = normKey(fk);
        const efFlight = efFlightByKey.get(fk) || efFlightByKey.get(nk);
        const snap = efSnapshots.get(fk) || efSnapshots.get(nk);
        const smJson = seatmapMap.get(fk) || seatmapMap.get(nk);
        const parts = nk.split("-");
        const airline = efFlight?.airline || parts[0]?.slice(0, 2) || "";
        const fareBuckets = efFlight?.ef_buckets ? parseFareBuckets(efFlight.ef_buckets, airline) : null;
        let cabins: Record<CabinKey, CabinSeatSummary> | null = null;
        if (snap) {
          cabins = reclassifyFirstToBusinessIfNoFirst(
            {
              first: cabinFromSnapshot(snap.first_open, snap.first_occupied, snap.first_blocked, 0),
              business: cabinFromSnapshot(snap.business_open, snap.business_occupied, snap.business_blocked, 0),
              prem_econ: cabinFromSnapshot(snap.prem_econ_open, snap.prem_econ_occupied, snap.prem_econ_blocked, 0),
              economy: cabinFromSnapshot(snap.economy_open, snap.economy_occupied, snap.economy_blocked, 0),
            },
            fareBuckets
          );
        }
        const economyComfort = computeEconomySeatStats(smJson);
        const hasSeatmap = Boolean(cabins && (cabins.economy.total > 0 || cabins.business.total > 0));
        let scored: { score: number; readiness: string; reasons: string[] } | null = null;
        if (cabins) {
          const depDate = efFlight?.departure_date || parts.slice(-3).join("-");
          const depTime = efFlight?.departure_time || "18:00";
          const hrs = hoursUntilDeparture(depDate, depTime);
          scored = computeStandbyScore({
            cabins,
            targetCabin,
            fareBuckets,
            disruptions: [],
            hoursToDeparture: hrs,
          });
        }
        items[fk] = {
          canonicalKey: nk,
          hasEfBuckets: Boolean(fareBuckets),
          hasSeatmap,
          fareBuckets,
          cabins,
          economyComfort,
          standbyScore: scored?.score ?? null,
          readiness: scored?.readiness ?? null,
          reasons: snap && scored ? [`ExpertFlyer seat map (${snap.captured_at.slice(0, 16)}Z)`, ...scored.reasons] : null,
          lastSeatmapAt: snap?.captured_at || null,
        };
      }
      return jsonResponse({ items, routeKeys });
    }

    if (path === "/api/expertflyer/seatmap-trigger" && request.method === "POST") {
      if (!env.GITHUB_TOKEN) {
        return jsonResponse({ ok: false, error: "GITHUB_TOKEN not configured" }, 400);
      }
      const body = (await request.json()) as { flightKey?: string };
      const flightKey = String(body.flightKey || "").trim().toUpperCase();
      if (!flightKey) return jsonResponse({ ok: false, error: "Missing flightKey" }, 400);
      if (env.DB) {
        const cdKey = `seatmap_dispatch:${flightKey}`;
        const lastRaw = await getSetting(env.DB, cdKey);
        const lastMs = lastRaw ? Number(lastRaw) : 0;
        if (lastMs && Date.now() - lastMs <= 60_000) {
          return jsonResponse({ ok: true, flightKey, deduplicated: true });
        }
        await setSetting(env.DB, cdKey, String(Date.now()));
      }
      const ghRes = await fetch(
        "https://api.github.com/repos/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml/dispatches",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "standby-flight-dashboard-worker",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: { mode: "seatmap_only", flight_key: flightKey },
          }),
        }
      );
      if (!ghRes.ok) {
        const errTxt = await ghRes.text();
        return jsonResponse({ ok: false, error: `GitHub dispatch failed (${ghRes.status}): ${errTxt.slice(0, 120)}` }, 502);
      }
      return jsonResponse({ ok: true, flightKey });
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
      let geminiOk = false;
      let geminiError: string | null = null;
      if (body.test && topic) {
        const ai = await generateGeminiBriefingWithDebug(
          env,
          "Test alert: BA292 IAD->LHR (Score 90/100, GREEN, 95 open seats, inbound BA293 delayed)."
        );
        geminiOk = Boolean(ai.text);
        geminiError = ai.error;
        const msg =
          "You will now receive stage alerts (ETD, Enroute, Landed, Delay/Cancel) for your watched flights." +
          (ai.text ? `\nGemini: ${ai.text}` : `\n(Gemini briefing error: ${ai.error})`);
        testSent = await sendNtfyPush(
          topic,
          "Standby Flight Dashboard - Push Alerts Active",
          msg,
          { tags: "airplane,white_check_mark" }
        );
      }
      return jsonResponse({ ok: true, ntfyTopic: topic, testSent, geminiOk, geminiError });
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
        taxiing: body.taxiing !== undefined ? Boolean(body.taxiing) : current.taxiing,
        enroute: body.enroute !== undefined ? Boolean(body.enroute) : current.enroute,
        landed: body.landed !== undefined ? Boolean(body.landed) : current.landed,
        disruption: body.disruption !== undefined ? Boolean(body.disruption) : current.disruption,
        diversion: body.diversion !== undefined ? Boolean(body.diversion) : current.diversion,
      };
      await updateWatchAlerts(env.DB, flightKey, updated);
      return jsonResponse({ ok: true, alertStages: updated });
    }

    if (path.startsWith("/api/watches/") && path.endsWith("/seat") && (request.method === "PATCH" || request.method === "POST")) {
      if (!env.DB) return jsonResponse({ error: "D1 database not bound" }, 500);
      const flightKey = decodeURIComponent(path.slice("/api/watches/".length, -"/seat".length));
      const body = (await request.json()) as { assignedSeat?: string | null };
      const rawSeat = String(body.assignedSeat || "").trim().toUpperCase();
      if (rawSeat && !/^\d{1,3}[A-Z]$/.test(rawSeat)) {
        return jsonResponse({ error: "Invalid seat format (e.g. 72A)" }, 400);
      }
      const assignedSeat = rawSeat || null;
      let seatMonitor = null;
      let stateJson: string | null = null;
      if (assignedSeat) {
        const smRow = await getEfSeatmap(env.DB, flightKey);
        if (smRow?.seatmap_json) {
          seatMonitor = inspectAssignedSeat(smRow.seatmap_json, assignedSeat);
          if (seatMonitor) {
            stateJson = JSON.stringify({
              seatStatus: seatMonitor.seatStatus,
              rowOccupied: seatMonitor.rowOccupied,
            });
          }
        }
      }
      await updateWatchSeat(env.DB, flightKey, assignedSeat, stateJson);
      return jsonResponse({ ok: true, assignedSeat, seatMonitor });
    }

    if (path === "/api/watches" && request.method === "GET") {
      if (!env.DB) return jsonResponse({ watches: [], ntfyTopic: env.NTFY_TOPIC || "" });
      const cutoff = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      await archiveOldWatches(env.DB, cutoff);
      const [watches, savedTopic, efMap] = await Promise.all([
        listWatches(env.DB),
        getSetting(env.DB, "ntfy_topic"),
        getLatestExpertFlyerSnapshots(env.DB),
      ]);
      const seatKeys = watches.map((w) => w.flight_key);
      const seatmapMap = seatKeys.length > 0 ? await getEfSeatmapsByKeys(env.DB, seatKeys) : new Map<string, string>();
      const ntfyTopic = savedTopic || env.NTFY_TOPIC || "";
      const enriched = await Promise.all(
        watches.map(async (w) => {
          let nextWatch = w;
          const snap = efMap.get(w.flight_key);
          const smJson = seatmapMap.get(w.flight_key);
          const economyComfort = smJson ? computeEconomySeatStats(smJson) : null;
          if (snap) {
            const fareBuckets = parseFareBuckets(w.ef_buckets, w.airline);
            const cabins = reclassifyFirstToBusinessIfNoFirst(
              {
                first: cabinFromSnapshot(snap.first_open, snap.first_occupied, snap.first_blocked, 0),
                business: cabinFromSnapshot(snap.business_open, snap.business_occupied, snap.business_blocked, 0),
                prem_econ: cabinFromSnapshot(snap.prem_econ_open, snap.prem_econ_occupied, snap.prem_econ_blocked, 0),
                economy: cabinFromSnapshot(snap.economy_open, snap.economy_occupied, snap.economy_blocked, 0),
              },
              fareBuckets
            );
            const targetKey = ((w.target_cabin || "economy") as CabinKey);
            const tc = cabins[targetKey];
            const targetCabinSummary = tc && tc.total > 0
              ? { total: tc.total, open: tc.available + tc.blocked, occupied: tc.occupied, available: tc.available, blocked: tc.blocked }
              : null;
            const allCabs = [cabins.first, cabins.business, cabins.prem_econ, cabins.economy].filter((c) => c.total > 0);
            const flightTotalSummary = allCabs.length > 0
              ? allCabs.reduce<{ total: number; open: number; occupied: number; available: number; blocked: number }>(
                  (acc, c) => ({
                    total: acc.total + c.total,
                    open: acc.open + c.available + c.blocked,
                    occupied: acc.occupied + c.occupied,
                    available: acc.available + c.available,
                    blocked: acc.blocked + c.blocked,
                  }),
                  { total: 0, open: 0, occupied: 0, available: 0, blocked: 0 }
                )
              : null;
            const cabinDefs: Array<{ key: CabinKey; code: string; max: number | null | undefined }> = [
              { key: "first", code: "F", max: fareBuckets?.firstMax },
              { key: "business", code: "J", max: fareBuckets?.businessMax },
              { key: "prem_econ", code: "W", max: fareBuckets?.premEconMax },
              { key: "economy", code: "Y", max: fareBuckets?.economyMax },
            ];
            const preservedMatch = String(snap.raw_note || "").match(/\(preserved ([A-Z,]+)\)/);
            const preservedSet = new Set(preservedMatch ? preservedMatch[1].split(",") : []);
            const cabinLoads = cabinDefs
              .filter((d) => cabins[d.key].total > 0)
              .map((d) => ({
                code: d.code,
                bucket: d.max !== null && d.max !== undefined ? `${d.code}${d.max}` : d.code,
                total: cabins[d.key].total,
                open: cabins[d.key].available + cabins[d.key].blocked,
                occupied: cabins[d.key].occupied,
                preserved: preservedSet.has(d.code),
              }));
            const hrs = hoursUntilDeparture(w.departure_date, w.departure_time || "18:00");
            const rescored = computeStandbyScore({
              cabins,
              targetCabin: targetKey,
              fareBuckets,
              disruptions: [],
              hoursToDeparture: hrs,
            });
            if (w.last_status !== rescored.readiness || w.last_score !== rescored.score) {
              await updateWatchStatus(env.DB!, w.flight_key, rescored.readiness, rescored.score);
            }
            nextWatch = {
              ...w,
              last_status: rescored.readiness,
              last_score: rescored.score,
              targetCabinSummary,
              flightTotalSummary,
              cabinLoads,
              economyComfort,
              lastSeatmapAt: snap.captured_at,
            };
          } else if (economyComfort) {
            nextWatch = { ...w, economyComfort };
          }
          if (w.assigned_seat) {
            const seatMonitor = inspectAssignedSeat(smJson, w.assigned_seat);
            nextWatch = { ...nextWatch, seatMonitor };
          }
          if (!env.FLIGHTAWARE_API_KEY || w.departure_date < cutoff || w.archived) return nextWatch;
          try {
            const telemetry = await fetchWatchedFlightTelemetry(
              env.FLIGHTAWARE_API_KEY!,
              w.flight_number,
              w.departure_date,
              w.departure_time,
            );
            return { ...nextWatch, inbound: telemetry.inbound, outbound: telemetry.outbound };
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
        seatmapAlreadyRequested?: boolean;
      };
      const flightKey = body.candidate.flightKey;
      const cdKey = `seatmap_dispatch:${flightKey}`;
      const [existingSeatmap, lastRaw] = await Promise.all([
        getEfSeatmap(env.DB, flightKey),
        getSetting(env.DB, cdKey),
      ]);
      const hasSeatData = Boolean(
        body.candidate.cabins &&
        (body.candidate.cabins.economy.total > 0 || body.candidate.cabins.business.total > 0)
      );
      const watchCandidate =
        existingSeatmap || hasSeatData
          ? body.candidate
          : { ...body.candidate, readiness: "pending" as any };
      await upsertWatch(env.DB, watchCandidate, body.targetCabin || "economy", body.efBuckets);
      const hrs = hoursUntilDeparture(body.candidate.departureDate, body.candidate.departureTime);
      await recordSnapshot(env.DB, watchCandidate, hrs, "Initial watch");
      const lastMs = lastRaw ? Number(lastRaw) : 0;
      const recentlyRequested = Boolean(body.seatmapAlreadyRequested) || (lastMs > 0 && Date.now() - lastMs <= 300_000);
      const shouldTrigger = !existingSeatmap && !recentlyRequested && Boolean(env.GITHUB_TOKEN);
      let seatmapTriggered = false;
      if (shouldTrigger) {
        await setSetting(env.DB, cdKey, String(Date.now()));
        try {
          const ghRes = await fetch(
            "https://api.github.com/repos/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml/dispatches",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "standby-flight-dashboard-worker",
              },
              body: JSON.stringify({
                ref: "main",
                inputs: { mode: "seatmap_only", flight_key: flightKey },
              }),
            }
          );
          seatmapTriggered = ghRes.ok;
        } catch {}
      }
      return jsonResponse({
        ok: true,
        seatmapTriggered,
        seatmapAlreadyCached: Boolean(existingSeatmap),
        seatmapAlreadyRequested: recentlyRequested,
      });
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
        readiness: "pending" as any,
        reasons: ["Manual ExpertFlyer watch (awaiting sync)"],
        watched: true,
      };
      await upsertWatch(env.DB, candidate, body.targetCabin || "economy", null);
      const cdKey = `seatmap_dispatch:${flightKey}`;
      const [existingSeatmap, lastRaw] = await Promise.all([
        getEfSeatmap(env.DB, flightKey),
        getSetting(env.DB, cdKey),
      ]);
      const lastMs = lastRaw ? Number(lastRaw) : 0;
      const recentlyRequested = lastMs > 0 && Date.now() - lastMs <= 300_000;
      let seatmapTriggered = false;
      if (!existingSeatmap && !recentlyRequested && env.GITHUB_TOKEN) {
        await setSetting(env.DB, cdKey, String(Date.now()));
        try {
          const ghRes = await fetch(
            "https://api.github.com/repos/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml/dispatches",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "standby-flight-dashboard-worker",
              },
              body: JSON.stringify({
                ref: "main",
                inputs: { mode: "seatmap_only", flight_key: flightKey },
              }),
            }
          );
          seatmapTriggered = ghRes.ok;
        } catch {}
      }
      return jsonResponse({ ok: true, flightKey, seatmapTriggered });
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

      const [prevEfMap, prevSeatmapRow] = await Promise.all([
        getLatestExpertFlyerSnapshots(env.DB),
        getEfSeatmap(env.DB, body.flightKey),
      ]);
      const prevSnap = prevEfMap.get(body.flightKey);
      const mergedCabins: Record<CabinKey, CabinSeatSummary> = {
        first: { ...body.cabins.first },
        business: { ...body.cabins.business },
        prem_econ: { ...body.cabins.prem_econ },
        economy: { ...body.cabins.economy },
      };
      const preservedCabins: string[] = [];
      if (prevSnap) {
        const prevFirst = cabinFromSnapshot(prevSnap.first_open, prevSnap.first_occupied, prevSnap.first_blocked, 0);
        if (mergedCabins.first.total === 0 && prevFirst.total > 0) {
          mergedCabins.first = prevFirst;
          preservedCabins.push("F");
        }
        const prevBiz = cabinFromSnapshot(prevSnap.business_open, prevSnap.business_occupied, prevSnap.business_blocked, 0);
        if (mergedCabins.business.total === 0 && prevBiz.total > 0) {
          mergedCabins.business = prevBiz;
          preservedCabins.push("J");
        }
        const prevPe = cabinFromSnapshot(prevSnap.prem_econ_open, prevSnap.prem_econ_occupied, prevSnap.prem_econ_blocked, 0);
        if (mergedCabins.prem_econ.total === 0 && prevPe.total > 0) {
          mergedCabins.prem_econ = prevPe;
          preservedCabins.push("W");
        }
        const prevEcon = cabinFromSnapshot(prevSnap.economy_open, prevSnap.economy_occupied, prevSnap.economy_blocked, 0);
        if (mergedCabins.economy.total === 0 && prevEcon.total > 0) {
          mergedCabins.economy = prevEcon;
          preservedCabins.push("Y");
        }
      }

      let mergedSeatmap: any = body.seatmap;
      if (mergedSeatmap && Array.isArray(mergedSeatmap.sections) && prevSeatmapRow?.seatmap_json) {
        try {
          const prevSm = JSON.parse(prevSeatmapRow.seatmap_json) as { sections?: Array<{ cabin?: string; rows?: unknown[] }> };
          const prevSections = prevSm.sections || [];
          const curByCabin = new Map<string, any>();
          for (const sec of mergedSeatmap.sections as Array<{ cabin?: string; rows?: unknown[] }>) {
            if (sec?.cabin && (sec.rows?.length || 0) > 0) {
              curByCabin.set(sec.cabin, sec);
            }
          }
          const prevByCabin = new Map<string, any>();
          for (const sec of prevSections) {
            if (sec?.cabin && (sec.rows?.length || 0) > 0) {
              prevByCabin.set(sec.cabin, sec);
            }
          }
          const orderedSections: any[] = [];
          for (const cKey of ["first", "business", "prem_econ", "economy"]) {
            if (curByCabin.has(cKey)) orderedSections.push(curByCabin.get(cKey));
            else if (prevByCabin.has(cKey)) orderedSections.push(prevByCabin.get(cKey));
          }
          if (orderedSections.length > 0) {
            mergedSeatmap = { ...mergedSeatmap, sections: orderedSections };
          }
        } catch {}
      }

      const fareBuckets = parseFareBuckets(w?.ef_buckets || body.efBuckets || null, airline);
      if (
        fareBuckets &&
        fareBuckets.firstMax === null &&
        fareBuckets.businessMax !== null &&
        mergedCabins.first.total > 0 &&
        mergedCabins.business.total === 0
      ) {
        mergedCabins.business = { ...mergedCabins.first };
        mergedCabins.first = { available: 0, occupied: 0, blocked: 0, total: 0 };
        if (mergedSeatmap && Array.isArray(mergedSeatmap.sections)) {
          mergedSeatmap = {
            ...mergedSeatmap,
            sections: mergedSeatmap.sections.map((sec: any) =>
              sec?.cabin === "first" ? { ...sec, cabin: "business", code: "J" } : sec
            ),
          };
        }
      }
      const hrs = hoursUntilDeparture(departureDate, departureTime);
      const rescored = computeStandbyScore({
        cabins: mergedCabins,
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
        cabins: mergedCabins,
        fareBuckets,
        disruptions: [],
        standbyScore: rescored.score,
        readiness: rescored.readiness,
        reasons: rescored.reasons,
        watched: Boolean(w),
      };

      const baseNote = body.note || (hrs !== null && hrs <= 1.6 ? "ExpertFlyer pre-close seat map" : "ExpertFlyer seat map");
      const note = preservedCabins.length > 0 ? `${baseNote} (preserved ${preservedCabins.join(",")})` : baseNote;
      const economyComfort = mergedSeatmap ? computeEconomySeatStats(mergedSeatmap) : null;
      await recordSnapshot(env.DB, candidate, hrs, note, economyComfort);
      if (mergedSeatmap) {
        await upsertEfSeatmap(env.DB, body.flightKey, candidate.aircraft, mergedSeatmap);
      }

      if (w) {
        const hadRealBaseline = Boolean(prevSnap) && Boolean(w.last_status) && String(w.last_status) !== "pending";
        if (hadRealBaseline && w.last_status !== rescored.readiness) {
          await sendStandbyAlert(
            env,
            candidate,
            w.last_status!,
            rescored.reasons.join("; ")
          );
        }
        await updateWatchStatus(env.DB, w.flight_key, rescored.readiness, rescored.score);

        if (w.assigned_seat && mergedSeatmap) {
          const mon = inspectAssignedSeat(mergedSeatmap, w.assigned_seat);
          if (mon) {
            const ntfyTopic = await getSetting(env.DB, "ntfy_topic");
            let prev: { seatStatus?: string; rowOccupied?: string[] } | null = null;
            if (w.last_seat_state) {
              try { prev = JSON.parse(w.last_seat_state); } catch {}
            }
            let becameUnseated = false;
            if (prev) {
              const alertsToSend: Array<{ title: string; msg: string }> = [];
              if (prev.seatStatus === "occupied" && mon.seatStatus !== "occupied") {
                becameUnseated = true;
                alertsToSend.push({
                  title: `${w.flight_number} Seat ${mon.seat} Opened — You May Have Been Moved`,
                  msg: `Seat ${mon.seat} changed from occupied to ${mon.seatStatus}. Check your BA boarding pass / app.`,
                });
              }
              const prevOcc = new Set(prev.rowOccupied || []);
              const newAdjacent = mon.sectionSeats.filter((s) => s.isAdjacent && s.status === "occupied" && !prevOcc.has(s.seat)).map((s) => s.seat);
              const newOtherRow = mon.sectionSeats.filter((s) => !s.isAdjacent && s.seat !== mon.seat && s.status === "occupied" && !prevOcc.has(s.seat)).map((s) => s.seat);
              if (!becameUnseated) {
                if (newAdjacent.length > 0) {
                  alertsToSend.push({
                    title: `${w.flight_number} Seat Next to ${mon.seat} Taken (${newAdjacent.join(", ")})`,
                    msg: `Someone was just assigned ${newAdjacent.join(", ")} right next to your seat ${mon.seat}.`,
                  });
                } else if (newOtherRow.length > 0) {
                  alertsToSend.push({
                    title: `${w.flight_number} Row Update Near ${mon.seat} (${newOtherRow.join(", ")} taken)`,
                    msg: `Seat ${newOtherRow.join(", ")} in your row section was just occupied.`,
                  });
                }
              }
              for (const a of alertsToSend) {
                await sendSeatMonitorAlert(env, ntfyTopic, w, a.title, a.msg);
              }
            }
            if (becameUnseated) {
              await updateWatchSeat(
                env.DB,
                w.flight_key,
                null,
                JSON.stringify({
                  unseatedFrom: mon.seat,
                  unseatedStatus: mon.seatStatus,
                  unseatedAt: new Date().toISOString(),
                })
              );
            } else {
              await updateWatchSeatState(
                env.DB,
                w.flight_key,
                JSON.stringify({ seatStatus: mon.seatStatus, rowOccupied: mon.rowOccupied })
              );
            }
          }
        }
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

    if (path === "/api/expertflyer/trigger" && request.method === "POST") {
      if (!env.GITHUB_TOKEN) {
        return jsonResponse({
          ok: false,
          fallbackUrl: "https://github.com/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml",
          error: "Add GITHUB_TOKEN (Actions: Read & Write) to Cloudflare Worker Secrets to enable 1-click EF dispatch.",
        }, 400);
      }
      const ghRes = await fetch(
        "https://api.github.com/repos/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml/dispatches",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "standby-flight-dashboard-worker",
          },
          body: JSON.stringify({ ref: "main" }),
        }
      );
      if (!ghRes.ok) {
        const errTxt = await ghRes.text();
        return jsonResponse({
          ok: false,
          fallbackUrl: "https://github.com/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml",
          error: `GitHub dispatch failed (${ghRes.status}): ${errTxt.slice(0, 120)}`,
        }, 502);
      }
      if (env.DB) await setSetting(env.DB, "last_ef_dispatch", String(Date.now()));
      return jsonResponse({ ok: true, message: "ExpertFlyer sync workflow dispatched — seat maps will update in ~1–2 minutes." });
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
      const parsedSeatmap = JSON.parse(row.seatmap_json) as {
        sections?: Array<{ cabin?: string; code?: string; rows?: any[] }>;
        [key: string]: any;
      };
      const dateMatch = flightKey.match(/(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch && Array.isArray(parsedSeatmap.sections)) {
        const hasFirst = parsedSeatmap.sections.some((s) => s.cabin === "first");
        const hasBiz = parsedSeatmap.sections.some((s) => s.cabin === "business");
        if (hasFirst && !hasBiz) {
          const efFlights = await listEfFlights(env.DB, dateMatch[1]);
          const normKey = flightKey.replace(/^([A-Z0-9]{2})-\1(\d+-)/, "$1$2");
          const efFlight = efFlights.find((f) => f.flight_key === flightKey || f.flight_key === normKey);
          const airline = efFlight?.airline || normKey.slice(0, 2);
          const fb = efFlight?.ef_buckets ? parseFareBuckets(efFlight.ef_buckets, airline) : null;
          if (fb && fb.firstMax === null && fb.businessMax !== null) {
            for (const sec of parsedSeatmap.sections) {
              if (sec.cabin === "first") {
                sec.cabin = "business";
                if (sec.code === "F") sec.code = "J";
              }
            }
          }
        }
      }
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
    const cutoff = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await archiveOldWatches(env.DB, cutoff);
    const watches = await listWatches(env.DB);
    const ntfyTopic = await getSetting(env.DB, "ntfy_topic");
    const utcMin = new Date().getUTCMinutes();
    const runDuffelPoll = utcMin === 0 || utcMin === 30;

    const efMap = await getLatestExpertFlyerSnapshots(env.DB);
    if (env.GITHUB_TOKEN && watches.length > 0) {
      const lastDispatchMs = Number((await getSetting(env.DB, "last_ef_dispatch")) || "0");
      if (Date.now() - lastDispatchMs >= 4 * 60_000) {
        const anyDue = watches.some((w) => {
          if (w.departure_date < cutoff || w.archived) return false;
          const hrs = hoursUntilDeparture(w.departure_date, w.departure_time || "18:00");
          if (hrs === null || hrs < -6 || hrs > 336) return false;
          const snap = efMap.get(w.flight_key);
          const ageMins = snap?.captured_at
            ? (Date.now() - new Date(snap.captured_at.replace(" ", "T") + "Z").getTime()) / 60_000
            : 9999;
          if (hrs <= 2) return ageMins >= 5;
          if (hrs <= 24) return ageMins >= 15;
          return ageMins >= 180;
        });
        if (anyDue) {
          try {
            const ghRes = await fetch(
              "https://api.github.com/repos/michaelarsenal/standby-flight-dashboard/actions/workflows/expertflyer-sync.yml/dispatches",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                  Accept: "application/vnd.github+json",
                  "User-Agent": "standby-flight-dashboard-worker",
                },
                body: JSON.stringify({ ref: "main" }),
              }
            );
            if (ghRes.ok) {
              await setSetting(env.DB, "last_ef_dispatch", String(Date.now()));
            }
          } catch {}
        }
      }
    }
    for (const w of watches) {
      if (w.departure_date < cutoff || w.archived) continue;

      const hrsToOut = hoursUntilDeparture(w.departure_date, w.departure_time || "18:00");
      const lastSt = w.last_inbound_stage || "";
      const isHotWindow =
        (hrsToOut !== null && hrsToOut <= 8 && hrsToOut >= -6) ||
        lastSt.startsWith("taxiing") ||
        lastSt.startsWith("enroute") ||
        lastSt === "landed" ||
        lastSt === "diverted";

      if (env.FLIGHTAWARE_API_KEY && (isHotWindow || utcMin % 5 === 0)) {
        try {
          const telemetry = await fetchWatchedFlightTelemetry(
            env.FLIGHTAWARE_API_KEY,
            w.flight_number,
            w.departure_date,
            w.departure_time
          );
          const inbound = telemetry.inbound;
          const outbound = telemetry.outbound;
          const alerts = parseAlertStages(w.alert_stages);

          if (inbound) {
            const isDelayed = inbound.delayMins >= 15;
            const delayBucket = Math.floor(inbound.delayMins / 15) * 15;
            const stageKey =
              inbound.stage === "cancelled"
                ? "cancelled"
                : inbound.stage === "diverted"
                  ? "diverted"
                  : inbound.stage === "parked"
                    ? "parked"
                    : inbound.stage === "landed"
                      ? "landed"
                      : inbound.stage === "taxiing"
                        ? (isDelayed ? `taxiing_delayed_${delayBucket}` : "taxiing")
                        : inbound.stage === "enroute"
                          ? (isDelayed ? `enroute_delayed_${delayBucket}` : "enroute")
                          : (isDelayed ? `etd_delayed_${delayBucket}` : "etd");

            if (w.last_inbound_stage !== stageKey) {
              const prev = w.last_inbound_stage || "";
              const prevMatch = prev.match(/^(etd|taxiing|enroute)_delayed_(\d+)$/);
              const prevBucket = prevMatch ? Number(prevMatch[2]) : null;
              const isLegacySameStage =
                (prev === "etd_delayed" && stageKey.startsWith("etd_delayed_")) ||
                (prev === "enroute_delayed" && stageKey.startsWith("enroute_delayed_"));
              const isDelayReduced =
                prevBucket !== null &&
                ((prevMatch?.[1] === "etd" && stageKey.startsWith("etd_delayed_")) ||
                  (prevMatch?.[1] === "taxiing" && stageKey.startsWith("taxiing_delayed_")) ||
                  (prevMatch?.[1] === "enroute" && stageKey.startsWith("enroute_delayed_"))) &&
                delayBucket <= prevBucket;

              const shouldAlert =
                !isLegacySameStage &&
                !isDelayReduced &&
                ((stageKey === "cancelled" && alerts.disruption) ||
                  (stageKey === "diverted" && alerts.diversion) ||
                  (stageKey.includes("_delayed") && alerts.disruption) ||
                  (stageKey === "taxiing" && alerts.taxiing) ||
                  ((stageKey === "landed" || stageKey === "parked") && alerts.landed) ||
                  (stageKey === "enroute" && alerts.enroute) ||
                  (stageKey === "etd" && alerts.etd));

              if (shouldAlert && w.last_inbound_stage) {
                const label =
                  stageKey === "cancelled"
                    ? "CANCELLED"
                    : stageKey === "diverted"
                      ? "DIVERTED"
                      : stageKey === "parked"
                        ? "PARKED AT GATE"
                        : stageKey === "landed"
                          ? "LANDED (ON RUNWAY)"
                          : stageKey.startsWith("taxiing")
                            ? `TAXIING / MOVING (ADS-B Live${inbound.taxiMins != null ? `, ${inbound.taxiMins}m` : ""}${isDelayed ? `, +${inbound.delayMins}m delayed` : ""})`
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

            // Arrival milestones: 60 mins and 20 mins from arrival
            if (inbound.stage === "enroute" && inbound.arriveInMins !== null && inbound.arriveInMins !== undefined) {
              let msState: { m60?: boolean; m20?: boolean } = {};
              if (w.last_inbound_milestones) {
                try { msState = JSON.parse(w.last_inbound_milestones); } catch {}
              }
              let msChanged = false;
              if (inbound.arriveInMins <= 20 && inbound.arriveInMins > 0 && !msState.m20) {
                msState.m20 = true;
                msState.m60 = true;
                msChanged = true;
                if (alerts.landed) {
                  await sendStagePushAlert(env, ntfyTopic, w, inbound, `20m TO ARRIVAL (${inbound.destination})`);
                }
              } else if (inbound.arriveInMins <= 60 && inbound.arriveInMins > 20 && !msState.m60) {
                msState.m60 = true;
                msChanged = true;
                if (alerts.landed) {
                  await sendStagePushAlert(env, ntfyTopic, w, inbound, `60m TO ARRIVAL (${inbound.destination})`);
                }
              }
              if (msChanged) {
                await updateWatchMilestones(env.DB, w.flight_key, JSON.stringify(msState));
              }
            }
          }

          if (outbound) {
            const outDelayBucket = outbound.delayMins >= 15 ? Math.floor(outbound.delayMins / 15) * 15 : 0;
            let prevOut: { gate?: string; delayBucket?: number; cancelled?: boolean; diverted?: boolean } | null = null;
            if (w.last_outbound_state) {
              try { prevOut = JSON.parse(w.last_outbound_state); } catch {}
            }
            if (prevOut) {
              if (outbound.cancelled && !prevOut.cancelled && alerts.disruption) {
                await sendOutboundAlert(env, ntfyTopic, w, `${w.flight_number} CANCELLED`, `Outbound ${w.flight_number} (${w.origin} → ${w.destination}) is showing CANCELLED.`, true);
              } else if (outbound.diverted && !prevOut.diverted && alerts.diversion) {
                await sendOutboundAlert(env, ntfyTopic, w, `${w.flight_number} DIVERTED`, `Outbound ${w.flight_number} (${w.origin} → ${w.destination}) is showing DIVERTED.`, true);
              }
              if (outbound.gate && outbound.gate !== prevOut.gate) {
                const msg = prevOut.gate
                  ? `Gate changed from ${prevOut.gate} to ${outbound.gate}${outbound.terminal ? ` (Terminal ${outbound.terminal})` : ""}.`
                  : `Gate ${outbound.gate} assigned${outbound.terminal ? ` (Terminal ${outbound.terminal})` : ""}.`;
                await sendOutboundAlert(env, ntfyTopic, w, `${w.flight_number} Gate ${outbound.gate}`, msg, false);
              }
              if (outDelayBucket >= 15 && outDelayBucket > (prevOut.delayBucket ?? 0) && alerts.disruption) {
                await sendOutboundAlert(
                  env,
                  ntfyTopic,
                  w,
                  `${w.flight_number} Delayed (+${outbound.delayMins}m)`,
                  `Outbound ${w.flight_number} estimated departure ${outbound.estimatedOut} (+${outbound.delayMins}m delay).`,
                  true
                );
              }
            }
            const nextOutStr = JSON.stringify({
              gate: outbound.gate,
              delayBucket: outDelayBucket,
              cancelled: outbound.cancelled,
              diverted: outbound.diverted,
            });
            if (nextOutStr !== w.last_outbound_state) {
              await updateWatchOutboundState(env.DB, w.flight_key, nextOutStr);
            }
          }
        } catch {
          // Ignore inbound/outbound check failure in cron
        }
      }

      if (!runDuffelPoll || efMap.has(w.flight_key)) continue;

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

      if (w.last_status && String(w.last_status) !== "pending" && w.last_status !== updated.readiness) {
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
