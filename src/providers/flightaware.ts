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

export async function fetchInboundAircraftSignal(
  apiKey: string,
  flightNumber: string
): Promise<{ riskPoints: number; signal: string | null }> {
  try {
    const res = await fetch(`${AEROAPI_BASE}/flights/${encodeURIComponent(flightNumber)}?max_pages=1`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
    });
    if (!res.ok) return { riskPoints: 0, signal: null };
    const data = (await res.json()) as { flights?: any[] };
    const upcoming = (data.flights ?? [])[0];
    if (!upcoming?.inbound_fa_flight_id) return { riskPoints: 0, signal: null };

    const inRes = await fetch(
      `${AEROAPI_BASE}/flights/${encodeURIComponent(upcoming.inbound_fa_flight_id)}`,
      { headers: { "x-apikey": apiKey, Accept: "application/json" } }
    );
    if (!inRes.ok) return { riskPoints: 0, signal: null };
    const inData = (await inRes.json()) as { flights?: any[] };
    const inbound = (inData.flights ?? [])[0];
    if (!inbound) return { riskPoints: 0, signal: null };

    if (inbound.cancelled) {
      return {
        riskPoints: 28,
        signal: `Inbound aircraft (${inbound.ident || "rotation"}) cancelled`,
      };
    }
    const delayMins = typeof inbound.arrival_delay === "number" ? Math.round(inbound.arrival_delay / 60) : 0;
    if (delayMins >= 45) {
      return {
        riskPoints: delayMins >= 90 ? 20 : 12,
        signal: `Inbound aircraft (${inbound.ident || "rotation"}) running ${delayMins}m late`,
      };
    }
  } catch {
    // Ignore
  }
  return { riskPoints: 0, signal: null };
}
