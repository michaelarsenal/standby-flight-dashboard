import type { RouteDisruption } from "../types.ts";

const AEROAPI_BASE = "https://aeroapi.flightaware.com/aeroapi";

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Checks Day -1 and Day 0 flights on the same origin -> destination route
 * for cancellations or major delays (>60 min) that push displaced passengers
 * onto later departures.
 */
export async function fetchFlightAwareDisruptions(params: {
  apiKey: string;
  origin: string;
  destination: string;
  date: string;
  airlines: string[];
}): Promise<RouteDisruption[]> {
  const { apiKey, origin, destination, date, airlines } = params;
  const headers = {
    "x-apikey": apiKey,
    Accept: "application/json",
  };

  const dayBefore = shiftDate(date, -1);
  const start = `${dayBefore}T00:00:00Z`;
  const end = `${date}T23:59:59Z`;

  const disruptions: RouteDisruption[] = [];
  const url = `${AEROAPI_BASE}/schedules/${encodeURIComponent(start)}/${encodeURIComponent(end)}?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&include_codeshares=false`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    return disruptions;
  }

  const json = (await res.json()) as { scheduled?: any[] };
  for (const item of json.scheduled ?? []) {
    const ident = String(item.ident_iata || item.ident || "").toUpperCase();
    const airline = ident.slice(0, 2);
    if (airlines.length > 0 && !airlines.includes(airline)) continue;

    const scheduledOut = String(item.scheduled_out || "");
    const dayOffset: -1 | 0 = scheduledOut.startsWith(dayBefore) ? -1 : 0;

    if (item.cancelled) {
      disruptions.push({
        flightNumber: ident,
        airline,
        origin,
        destination,
        scheduledDeparture: scheduledOut,
        dayOffset,
        type: "cancelled",
        detail: `Flight cancelled — displaced passengers likely rebooking`,
        impactPenalty: dayOffset === 0 ? 22 : 14,
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
        detail: `Delayed ${mins} min — misconnect/rebooking spillover risk`,
        impactPenalty: 10,
      });
    }
  }

  return disruptions;
}
