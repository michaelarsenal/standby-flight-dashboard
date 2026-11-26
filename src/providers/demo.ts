import { buildFlightKey } from "../airports.ts";
import { parseFareBuckets } from "../scoring.ts";
import type { FlightCandidate, RouteDisruption } from "../types.ts";

/**
 * Generates realistic BA & Virgin Atlantic standby candidates for any queried
 * origin/destination/date when live Duffel/FlightAware keys are not yet configured.
 */
export function buildDemoCandidates(params: {
  origins: string[];
  destinations: string[];
  date: string;
  airlines: string[];
}): {
  candidates: Omit<FlightCandidate, "standbyScore" | "readiness" | "reasons">[];
  disruptions: RouteDisruption[];
} {
  const { origins, destinations, date, airlines } = params;
  const candidates: Omit<FlightCandidate, "standbyScore" | "readiness" | "reasons">[] = [];
  const disruptions: RouteDisruption[] = [];

  for (const origin of origins) {
    for (const destination of destinations) {
      if (origin === destination) continue;

      // Seeded deterministic variation from route + date
      const seed = hashString(`${origin}-${destination}-${date}`);

      const templates = [
        {
          airline: "BA",
          flightNumber: `BA${210 + (seed % 80)}`,
          departureTime: "18:05",
          arrivalTime: "06:15+1",
          duration: "7h 10m",
          aircraft: "781 (Boeing 787-10)",
          ef: "F5 A5 J9 C9 D9 R8 I0 W8 E7 T7 Y9 B9 H9 K9 M9 L9 V9 S9 N9 Q9 O0 G9",
          cabins: {
            first: { available: 4, occupied: 3, blocked: 1, total: 8 },
            business: { available: 11, occupied: 29, blocked: 8, total: 48 },
            prem_econ: { available: 14, occupied: 18, blocked: 3, total: 35 },
            economy: { available: 38, occupied: 98, blocked: 29, total: 165 },
          },
        },
        {
          airline: "BA",
          flightNumber: `BA${280 + (seed % 18)}`,
          departureTime: "21:45",
          arrivalTime: "10:00+1",
          duration: "7h 15m",
          aircraft: "789 (Boeing 787-9)",
          ef: "F2 A2 J0 C0 D0 R0 I0 W7 E7 T6 Y9 B9 H9 K9 M9 L9 V9 S9 N9 Q9 O0 G9",
          cabins: {
            first: { available: 2, occupied: 5, blocked: 1, total: 8 },
            business: { available: 2, occupied: 34, blocked: 6, total: 42 },
            prem_econ: { available: 9, occupied: 26, blocked: 4, total: 39 },
            economy: { available: 24, occupied: 84, blocked: 19, total: 127 },
          },
        },
        {
          airline: "VS",
          flightNumber: `VS${10 + (seed % 30)}`,
          departureTime: "19:30",
          arrivalTime: "07:55+1",
          duration: "7h 25m",
          aircraft: "333 (Airbus A330-300)",
          ef: "J0 C0 D0 I0 Z0 W2 S2 H0 K0 Y9 B9 R9 L9 U9 M9 E9 Q9 X9 N9 O9 V9 T9",
          cabins: {
            first: { available: 0, occupied: 0, blocked: 0, total: 0 },
            business: { available: 1, occupied: 27, blocked: 3, total: 31 },
            prem_econ: { available: 4, occupied: 38, blocked: 6, total: 48 },
            economy: { available: 31, occupied: 132, blocked: 22, total: 185 },
          },
        },
      ];

      // Add a Day -1 BA disruption on some routes so the user can see how route-disruption scoring works
      if (seed % 2 === 0 && (airlines.length === 0 || airlines.includes("BA"))) {
        disruptions.push({
          flightNumber: `BA${214 + (seed % 20)}`,
          airline: "BA",
          origin,
          destination,
          scheduledDeparture: `${date}T17:10:00Z`,
          dayOffset: -1,
          type: "cancelled",
          detail: `Earlier ${origin}→${destination} departure cancelled (Day -1); rebooking spillover possible`,
          impactPenalty: 14,
        });
      }

      for (const tpl of templates) {
        if (airlines.length > 0 && !airlines.includes(tpl.airline)) continue;
        // Skip VS on BWI/DCA in demo mode for realism
        if (tpl.airline === "VS" && (origin === "BWI" || origin === "DCA")) continue;
        if (tpl.airline === "BA" && origin === "DCA") continue;

        const routeDisruptions = disruptions.filter(
          (d) => d.airline === tpl.airline && d.origin === origin && d.destination === destination
        );

        candidates.push({
          flightKey: buildFlightKey(tpl.airline, tpl.flightNumber, origin, destination, date),
          airline: tpl.airline,
          flightNumber: tpl.flightNumber,
          origin,
          destination,
          departureDate: date,
          departureTime: tpl.departureTime,
          arrivalTime: tpl.arrivalTime,
          duration: tpl.duration,
          aircraft: tpl.aircraft,
          dataSource: "demo",
          cabins: tpl.cabins,
          fareBuckets: parseFareBuckets(tpl.ef, tpl.airline),
          disruptions: routeDisruptions,
        });
      }
    }
  }

  return { candidates, disruptions };
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}
