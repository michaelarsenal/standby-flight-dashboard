import type { RouteDisruption } from "../types.ts";

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

import type { InboundFlightInfo, RouteDisruption } from "../types.ts";

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

    // Pick flight matching departureDate if available, else the next upcoming leg
    const upcoming =
      (departureDate
        ? flights.find((f) => String(f.scheduled_out || "").startsWith(departureDate))
        : null) || flights[0];

    if (!upcoming?.inbound_fa_flight_id) return null;

    const inRes = await fetch(
      `${AEROAPI_BASE}/flights/${encodeURIComponent(upcoming.inbound_fa_flight_id)}`,
      { headers: { "x-apikey": apiKey, Accept: "application/json" } }
    );
    if (!inRes.ok) return null;
    const inData = (await inRes.json()) as { flights?: any[] };
    const inbound = (inData.flights ?? [])[0];
    if (!inbound) return null;

    const inboundFlight = String(inbound.ident_iata || inbound.ident || "Inbound").toUpperCase();
    const inboundIdent = String(inbound.ident || inboundFlight).toUpperCase();
    const origin = String(inbound.origin?.code_iata || inbound.origin?.code || "").toUpperCase();
    const destination = String(inbound.destination?.code_iata || inbound.destination?.code || "").toUpperCase();
    const registration = String(inbound.registration || "").toUpperCase();
    const status = String(inbound.status || (inbound.cancelled ? "Cancelled" : "Scheduled"));
    const scheduledArrival = String(inbound.scheduled_in || "");
    const estimatedArrival = String(inbound.actual_in || inbound.estimated_in || inbound.scheduled_in || "");
    const delayMins = typeof inbound.arrival_delay === "number" ? Math.round(inbound.arrival_delay / 60) : 0;

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
    if (inbound.cancelled) {
      outboundImpact = "high";
      impactSummary = "Inbound cancelled — likely outbound delay or aircraft swap";
    } else if (turnaroundMins !== null && turnaroundMins < 55) {
      outboundImpact = "high";
      impactSummary = `Tight ${turnaroundMins}m turnaround — likely to delay outbound`;
    } else if (delayMins >= 45) {
      outboundImpact = "high";
      impactSummary = `Running ${delayMins}m late — likely to affect outbound`;
    } else if ((turnaroundMins !== null && turnaroundMins < 85) || delayMins >= 20) {
      outboundImpact = "watch";
      impactSummary = delayMins >= 20
        ? `Running ${delayMins}m late${turnaroundMins !== null ? ` (${turnaroundMins}m turn)` : ""}`
        : `Moderate ${turnaroundMins}m turnaround`;
    } else {
      outboundImpact = "none";
      impactSummary = turnaroundMins !== null
        ? `On time (${turnaroundMins}m turnaround) — no outbound impact`
        : "On time — no outbound impact";
    }

    return {
      inboundFlight,
      inboundIdent,
      origin,
      destination,
      registration,
      status,
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
