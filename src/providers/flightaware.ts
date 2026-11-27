import type { InboundFlightInfo, InboundStage, RouteDisruption, SurfaceCongestion } from "../types.ts";

const AEROAPI_BASE = "https://aeroapi.flightaware.com/aeroapi";

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Checks Day -3 through Day 0 flights on the same origin -> destination route
 * for cancellations or major delays (>60 min) that create rebooking backlogs.
 */
export async function fetchFlightAwareDisruptions(params: {
  apiKey: string;
  origin: string;
  destination: string;
  date: string;
  airlines: string[];
}): Promise<RouteDisruption[]> {
  const { apiKey, origin, destination, date, airlines } = params;
  const headers = { "x-apikey": apiKey, Accept: "application/json" };

  const dayMinus3 = shiftDate(date, -3);
  const dayMinus2 = shiftDate(date, -2);
  const dayMinus1 = shiftDate(date, -1);
  const start = `${dayMinus3}T00:00:00Z`;
  const end = `${date}T23:59:59Z`;

  const disruptions: RouteDisruption[] = [];
  const url = `${AEROAPI_BASE}/schedules/${encodeURIComponent(start)}/${encodeURIComponent(end)}?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&include_codeshares=false`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return disruptions;

    const json = (await res.json()) as { scheduled?: any[] };
    for (const item of json.scheduled ?? []) {
      const ident = String(item.ident_iata || item.ident || "").toUpperCase();
      const airline = ident.slice(0, 2);
      if (airlines.length > 0 && !airlines.includes(airline)) continue;

      const scheduledOut = String(item.scheduled_out || "");
      const dayOffset: -3 | -2 | -1 | 0 = scheduledOut.startsWith(dayMinus3)
        ? -3
        : scheduledOut.startsWith(dayMinus2)
        ? -2
        : scheduledOut.startsWith(dayMinus1)
        ? -1
        : 0;

      if (item.cancelled) {
        disruptions.push({
          flightNumber: ident,
          airline,
          origin,
          destination,
          scheduledDeparture: scheduledOut,
          dayOffset,
          type: "cancelled",
          detail: `Flight cancelled (Day ${dayOffset}) — rebooking backlog risk`,
          impactPenalty: dayOffset === 0 ? 22 : dayOffset === -1 ? 14 : 7,
        });
      } else if (typeof item.departure_delay === "number" && item.departure_delay >= 3600) {
        const mins = Math.round(item.departure_delay / 60);
        disruptions.push({
          flightNumber: ident,
          airline,
          origin,
          destination,
          scheduledDeparture: scheduledOut,
          dayOffset,
          type: "delayed",
          detail: `Delayed ${mins} min (Day ${dayOffset}) — misconnect spillover risk`,
          impactPenalty: dayOffset >= -1 ? 10 : 4,
        });
      }
    }
  } catch {
    // Fail open on transient network errors
  }

  return disruptions;
}

export async function fetchAirportDelaySignal(
  apiKey: string,
  airport: string
): Promise<{ riskPoints: number; signal: string | null }> {
  try {
    const res = await fetch(`${AEROAPI_BASE}/airports/${encodeURIComponent(airport)}/delays`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
    });
    if (!res.ok) return { riskPoints: 0, signal: null };
    const data = (await res.json()) as {
      category?: string;
      color?: string;
      delay_secs?: number;
      reasons?: Array<{ reason?: string }>;
    };
    const delayMins = typeof data.delay_secs === "number" ? Math.round(data.delay_secs / 60) : 0;
    if (delayMins >= 30 || data.color === "red" || data.color === "yellow") {
      const reason = data.reasons?.[0]?.reason || data.category || "Hub ATC/flow delay";
      return {
        riskPoints: delayMins >= 60 || data.color === "red" ? 20 : 12,
        signal: `${airport} hub delays active (${delayMins}m avg — ${reason})`,
      };
    }
  } catch {
    // Ignore
  }
  return { riskPoints: 0, signal: null };
}


export async function fetchInboundDetails(
  apiKey: string,
  flightNumber: string,
  departureDate?: string,
  departureTime?: string | null
): Promise<InboundFlightInfo | null> {
  try {
    const res = await fetch(`${AEROAPI_BASE}/flights/${encodeURIComponent(flightNumber)}?max_pages=1`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { flights?: any[] };
    const flights = data.flights ?? [];
    if (flights.length === 0) return null;

    // Pick flight matching local departureDate/departureTime (accounting for UTC offset, e.g. 21:45 EST = 02:45Z next day)
    let upcoming: any = null;
    if (departureDate) {
      const targetMs = new Date(`${departureDate}T${departureTime || "18:00"}:00Z`).getTime();
      let bestDiff = Infinity;
      for (const f of flights) {
        const outMs = new Date(String(f.scheduled_out || "")).getTime();
        if (Number.isNaN(outMs)) continue;
        const diff = outMs - targetMs;
        if (diff >= -3 * 3600_000 && diff <= 11 * 3600_000 && Math.abs(diff) < bestDiff) {
          bestDiff = Math.abs(diff);
          upcoming = f;
        }
      }
      if (!upcoming) {
        upcoming = flights.find((f) => String(f.scheduled_out || "").startsWith(departureDate)) || null;
      }
    }
    if (!upcoming) upcoming = flights[0];

    let inbound: any = null;
    if (upcoming?.inbound_fa_flight_id) {
      const inRes = await fetch(
        `${AEROAPI_BASE}/flights/${encodeURIComponent(upcoming.inbound_fa_flight_id)}`,
        { headers: { "x-apikey": apiKey, Accept: "application/json" } }
      );
      if (inRes.ok) {
        const inData = (await inRes.json()) as { flights?: any[] };
        inbound = (inData.flights ?? [])[0] ?? null;
      }
    }

    // Fallback: if inbound_fa_flight_id isn't linked yet but registration is assigned, look up tail's previous leg
    if (!inbound && upcoming?.registration && upcoming?.scheduled_out) {
      const regRes = await fetch(
        `${AEROAPI_BASE}/flights/${encodeURIComponent(String(upcoming.registration))}?max_pages=1`,
        { headers: { "x-apikey": apiKey, Accept: "application/json" } }
      );
      if (regRes.ok) {
        const regData = (await regRes.json()) as { flights?: any[] };
        const outMs = new Date(String(upcoming.scheduled_out)).getTime();
        const originCode = String(upcoming.origin?.code_iata || upcoming.origin?.code || "").toUpperCase();
        inbound = (regData.flights ?? []).find((f) => {
          const destCode = String(f.destination?.code_iata || f.destination?.code || "").toUpperCase();
          const inMs = new Date(String(f.estimated_in || f.scheduled_in || "")).getTime();
          return destCode === originCode && !Number.isNaN(inMs) && inMs < outMs && outMs - inMs <= 16 * 3600_000;
        }) ?? null;
      }
    }

    if (!inbound) return null;

    const inboundFlight = String(inbound.ident_iata || inbound.ident || "Inbound").toUpperCase();
    const inboundIdent = String(inbound.ident || inboundFlight).toUpperCase();
    const origin = String(inbound.origin?.code_iata || inbound.origin?.code || "").toUpperCase();
    const destination = String(inbound.destination?.code_iata || inbound.destination?.code || "").toUpperCase();
    const registration = String(inbound.registration || upcoming.registration || "").toUpperCase();
    const status = String(inbound.status || (inbound.cancelled ? "Cancelled" : "Scheduled"));
    const scheduledDeparture = String(inbound.scheduled_out || "");
    const estimatedDeparture = String(inbound.actual_out || inbound.estimated_out || inbound.scheduled_out || "");
    const hasDeparted = Boolean(inbound.actual_out);
    const scheduledArrival = String(inbound.scheduled_in || "");
    const estimatedArrival = String(inbound.actual_in || inbound.estimated_in || inbound.scheduled_in || "");
    const arrDelayMins = typeof inbound.arrival_delay === "number" ? Math.round(inbound.arrival_delay / 60) : 0;
    const depDelayMins = typeof inbound.departure_delay === "number" ? Math.round(inbound.departure_delay / 60) : 0;
    const delayMins = hasDeparted ? arrDelayMins : Math.max(arrDelayMins, depDelayMins);

    const statusLower = status.toLowerCase();
    let stage: InboundStage = "scheduled";
    if (inbound.cancelled || statusLower.includes("cancel")) {
      stage = "cancelled";
    } else if (inbound.actual_in || statusLower.includes("arrived") || statusLower.includes("landed")) {
      stage = "landed";
    } else if (inbound.actual_out && !inbound.actual_off) {
      stage = "taxiing";
    } else if (inbound.actual_off || inbound.actual_out || statusLower.includes("en route")) {
      stage = "enroute";
    }

    let departInMins: number | null = null;
    if (stage === "scheduled" && estimatedDeparture) {
      const depMs = new Date(estimatedDeparture).getTime();
      if (!Number.isNaN(depMs)) {
        departInMins = Math.round((depMs - Date.now()) / 60000);
      }
    }

    let taxiMins: number | null = null;
    if (stage === "taxiing" && inbound.actual_out) {
      const outMs = new Date(String(inbound.actual_out)).getTime();
      if (!Number.isNaN(outMs)) {
        taxiMins = Math.max(0, Math.round((Date.now() - outMs) / 60000));
      }
    }

    let surfaceCongestion: SurfaceCongestion | null = null;
    if (origin && (stage === "taxiing" || (stage === "scheduled" && departInMins !== null && departInMins <= 45))) {
      surfaceCongestion = await fetchSurfaceCongestion(apiKey, origin);
    }

    const outIso = upcoming.scheduled_out || (departureDate ? `${departureDate}T${departureTime || "18:00"}:00Z` : "");
    let turnaroundMins: number | null = null;
    if (outIso && estimatedArrival) {
      const outMs = new Date(outIso).getTime();
      const inMs = new Date(estimatedArrival).getTime();
      if (!Number.isNaN(outMs) && !Number.isNaN(inMs)) {
        turnaroundMins = Math.round((outMs - inMs) / 60000);
      }
    }

    let outboundImpact: "none" | "watch" | "high" = "none";
    let impactSummary = "";
    if (stage === "cancelled") {
      outboundImpact = "high";
      impactSummary = "Inbound cancelled — likely outbound delay or aircraft swap";
    } else if (turnaroundMins !== null && turnaroundMins < 55) {
      outboundImpact = "high";
      impactSummary = `Tight ${turnaroundMins}m turnaround — likely to delay outbound`;
    } else if (delayMins >= 45) {
      outboundImpact = "high";
      impactSummary = `Running ${delayMins}m late — likely to affect outbound`;
    } else if ((turnaroundMins !== null && turnaroundMins < 85) || delayMins >= 15) {
      outboundImpact = "watch";
      impactSummary = delayMins >= 15
        ? `Running ${delayMins}m late${turnaroundMins !== null ? ` (${turnaroundMins}m turn)` : ""}`
        : `Moderate ${turnaroundMins}m turnaround`;
    } else {
      outboundImpact = "none";
      impactSummary = turnaroundMins !== null
        ? `On time (${turnaroundMins}m turnaround) — no outbound impact`
        : "On time — no outbound impact";
    }

    const adsbLive = stage === "taxiing" || stage === "enroute" || stage === "landed" || Boolean(inbound.actual_out || inbound.actual_off);

    return {
      inboundFlight,
      inboundIdent,
      origin,
      destination,
      registration,
      status,
      stage,
      adsbLive,
      departInMins,
      taxiMins,
      surfaceCongestion,
      scheduledDeparture,
      estimatedDeparture,
      hasDeparted,
      scheduledArrival,
      estimatedArrival,
      delayMins,
      turnaroundMins,
      outboundImpact,
      impactSummary,
      flightRadarUrl: `https://www.flightradar24.com/${encodeURIComponent(inboundFlight)}`,
      flightAwareUrl: `https://www.flightaware.com/live/flight/${encodeURIComponent(inboundIdent)}`,
    };
  } catch {
    return null;
  }
}

export async function fetchInboundAircraftSignal(
  apiKey: string,
  flightNumber: string
): Promise<{ riskPoints: number; signal: string | null }> {
  const info = await fetchInboundDetails(apiKey, flightNumber);
  if (!info) return { riskPoints: 0, signal: null };
  if (info.status.toLowerCase().includes("cancel")) {
    return { riskPoints: 28, signal: `Inbound aircraft (${info.inboundFlight}) cancelled` };
  }
  if (info.delayMins >= 45) {
    return {
      riskPoints: info.delayMins >= 90 ? 20 : 12,
      signal: `Inbound aircraft (${info.inboundFlight}) running ${info.delayMins}m late`,
    };
  }
  return { riskPoints: 0, signal: null };
}

export async function fetchSurfaceCongestion(
  apiKey: string,
  airportCode: string
): Promise<SurfaceCongestion | null> {
  const code = airportCode.trim().toUpperCase();
  if (!code) return null;
  try {
    const [delayRes, depRes] = await Promise.all([
      fetch(`${AEROAPI_BASE}/airports/${encodeURIComponent(code)}/delays`, {
        headers: { "x-apikey": apiKey, Accept: "application/json" },
      }),
      fetch(`${AEROAPI_BASE}/airports/${encodeURIComponent(code)}/flights/scheduled_departures?max_pages=1`, {
        headers: { "x-apikey": apiKey, Accept: "application/json" },
      }),
    ]);

    let avgDelayMins = 0;
    if (delayRes.ok) {
      const dData = (await delayRes.json()) as { delay_secs?: number };
      avgDelayMins = typeof dData.delay_secs === "number" ? Math.max(0, Math.round(dData.delay_secs / 60)) : 0;
    }

    let activeDepartures = 0;
    if (depRes.ok) {
      const fData = (await depRes.json()) as { scheduled_departures?: any[]; departures?: any[] };
      const list = fData.scheduled_departures ?? fData.departures ?? [];
      const nowMs = Date.now();
      for (const f of list) {
        const outMs = new Date(String(f.estimated_out || f.scheduled_out || "")).getTime();
        if (!Number.isNaN(outMs) && Math.abs(outMs - nowMs) <= 30 * 60_000) {
          activeDepartures++;
        } else if (f.actual_out && !f.actual_off) {
          activeDepartures++;
        }
      }
    }

    let level: "light" | "moderate" | "heavy" = "light";
    let estimatedTaxiMins = 12;
    if (avgDelayMins >= 25 || activeDepartures >= 18) {
      level = "heavy";
      estimatedTaxiMins = Math.max(25, Math.min(45, 18 + Math.round(avgDelayMins * 0.5)));
    } else if (avgDelayMins >= 12 || activeDepartures >= 10) {
      level = "moderate";
      estimatedTaxiMins = 18;
    }

    const levelLabel = level === "heavy" ? "Heavy" : level === "moderate" ? "Moderate" : "Light";
    const summary = `${code} ground: ${levelLabel} (~${estimatedTaxiMins}m taxi, ${activeDepartures} dep/30m${avgDelayMins > 0 ? `, +${avgDelayMins}m avg delay` : ""})`;
    return {
      airport: code,
      level,
      activeDepartures,
      avgDelayMins,
      estimatedTaxiMins,
      summary,
    };
  } catch {
    return null;
  }
}
