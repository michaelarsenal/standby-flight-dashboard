import { buildFlightKey } from "../airports.ts";
import type { CabinKey, CabinSeatSummary, FlightCandidate } from "../types.ts";

const DUFFEL_BASE = "https://api.duffel.com";

function emptyCabins(): Record<CabinKey, CabinSeatSummary> {
  return {
    first: { available: 0, occupied: 0, blocked: 0, total: 0 },
    business: { available: 0, occupied: 0, blocked: 0, total: 0 },
    prem_econ: { available: 0, occupied: 0, blocked: 0, total: 0 },
    economy: { available: 0, occupied: 0, blocked: 0, total: 0 },
  };
}

function mapCabinClass(cabinClass: string | undefined): CabinKey {
  switch ((cabinClass || "").toLowerCase()) {
    case "first":
      return "first";
    case "business":
      return "business";
    case "premium_economy":
      return "prem_econ";
    default:
      return "economy";
  }
}

function formatDuration(iso: string | undefined): string {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  const h = m[1] ? `${m[1]}h` : "";
  const min = m[2] ? ` ${m[2]}m` : "";
  return `${h}${min}`.trim();
}

export async function fetchDuffelCandidates(params: {
  token: string;
  origins: string[];
  destinations: string[];
  date: string;
  airlines: string[];
}): Promise<Omit<FlightCandidate, "disruptions" | "standbyScore" | "readiness" | "reasons">[]> {
  const { token, origins, destinations, date, airlines } = params;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Duffel-Version": "v2",
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const results: Omit<
    FlightCandidate,
    "disruptions" | "standbyScore" | "readiness" | "reasons"
  >[] = [];

  for (const origin of origins) {
    for (const destination of destinations) {
      if (origin === destination) continue;

      const offerReqRes = await fetch(`${DUFFEL_BASE}/air/offer_requests`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            slices: [{ origin, destination, departure_date: date }],
            passengers: [{ type: "adult" }],
            cabin_class: "economy",
            max_connections: 0,
          },
        }),
      });

      if (!offerReqRes.ok) {
        const text = await offerReqRes.text();
        throw new Error(`Duffel offer_requests error (${offerReqRes.status}): ${text.slice(0, 200)}`);
      }

      const offerReqJson = (await offerReqRes.json()) as { data?: { offers?: any[] } };
      const offers = offerReqJson.data?.offers ?? [];

      // Deduplicate by operating carrier + flight number
      const seenFlights = new Map<string, any>();
      for (const offer of offers) {
        const seg = offer?.slices?.[0]?.segments?.[0];
        if (!seg) continue;
        const carrier = (seg.operating_carrier?.iata_code || seg.marketing_carrier?.iata_code || "").toUpperCase();
        if (airlines.length > 0 && !airlines.includes(carrier)) continue;
        const flightNum = `${carrier}${seg.operating_carrier_flight_number || seg.marketing_carrier_flight_number || ""}`;
        if (!seenFlights.has(flightNum)) {
          seenFlights.set(flightNum, offer);
        }
      }

      // Fetch seat map for each unique direct flight (capped to 8 per pair)
      const uniqueOffers = Array.from(seenFlights.entries()).slice(0, 8);
      for (const [flightNum, offer] of uniqueOffers) {
        const seg = offer.slices[0].segments[0];
        const carrier = (seg.operating_carrier?.iata_code || seg.marketing_carrier?.iata_code || "").toUpperCase();
        const cabins = emptyCabins();

        const seatRes = await fetch(`${DUFFEL_BASE}/air/seat_maps?offer_id=${encodeURIComponent(offer.id)}`, {
          headers,
        });
        if (seatRes.ok) {
          const seatJson = (await seatRes.json()) as { data?: any[] };
          for (const seatMap of seatJson.data ?? []) {
            for (const cabin of seatMap.cabins ?? []) {
              const key = mapCabinClass(cabin.cabin_class);
              for (const row of cabin.rows ?? []) {
                for (const section of row.sections ?? []) {
                  for (const el of section.elements ?? []) {
                    if (el.type !== "seat") continue;
                    cabins[key].total += 1;
                    if (Array.isArray(el.available_services) && el.available_services.length > 0) {
                      cabins[key].available += 1;
                    } else if (el.disclosures?.includes("blocked")) {
                      cabins[key].blocked += 1;
                    } else {
                      cabins[key].occupied += 1;
                    }
                  }
                }
              }
            }
          }
        }

        const depAt = String(seg.departing_at || "");
        const arrAt = String(seg.arriving_at || "");

        results.push({
          flightKey: buildFlightKey(carrier, flightNum, origin, destination, date),
          airline: carrier,
          flightNumber: flightNum,
          origin,
          destination,
          departureDate: date,
          departureTime: depAt.slice(11, 16) || "00:00",
          arrivalTime: arrAt.slice(11, 16) || "00:00",
          duration: formatDuration(seg.duration),
          aircraft: seg.aircraft?.iata_code || seg.aircraft?.name || "Widebody",
          dataSource: "live",
          cabins,
          fareBuckets: null,
        });
      }
    }
  }

  return results;
}
