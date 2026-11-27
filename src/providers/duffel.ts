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
  skipSeatmapKeys?: Set<string>;
}): Promise<Omit<FlightCandidate, "disruptions" | "standbyScore" | "readiness" | "reasons">[]> {
  const { token, origins, destinations, date, airlines, skipSeatmapKeys } = params;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Duffel-Version": "v2",
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const pairs: Array<{ origin: string; destination: string }> = [];
  for (const origin of origins) {
    for (const destination of destinations) {
      if (origin !== destination) pairs.push({ origin, destination });
    }
  }

  const pairResults = await Promise.all(
    pairs.map(async ({ origin, destination }) => {
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

      // Deduplicate by operating carrier + departure time, excluding codeshares (>= 4000)
      const seenFlights = new Map<string, { flightNum: string; numVal: number; offer: any }>();
      for (const offer of offers) {
        const seg = offer?.slices?.[0]?.segments?.[0];
        if (!seg) continue;
        const carrier = (seg.operating_carrier?.iata_code || seg.marketing_carrier?.iata_code || "").toUpperCase();
        if (airlines.length > 0 && !airlines.includes(carrier)) continue;
        const rawDigits = String(seg.operating_carrier_flight_number || seg.marketing_carrier_flight_number || "").replace(/\D/g, "");
        if (!rawDigits) continue;
        const numVal = parseInt(rawDigits, 10);
        if (numVal >= 4000) continue;
        const flightNum = `${carrier}${numVal}`;
        const depKey = `${carrier}-${String(seg.departing_at || "").slice(0, 16)}`;
        const existing = seenFlights.get(depKey);
        if (!existing || numVal < existing.numVal) {
          seenFlights.set(depKey, { flightNum, numVal, offer });
        }
      }

      // Fetch seat maps in parallel (skipping flights that already have a cached ExpertFlyer snapshot)
      const uniqueOffers = Array.from(seenFlights.values()).slice(0, 8);
      return Promise.all(
        uniqueOffers.map(async ({ flightNum, offer }) => {
          const seg = offer.slices[0].segments[0];
          const carrier = (seg.operating_carrier?.iata_code || seg.marketing_carrier?.iata_code || "").toUpperCase();
          const cabins = emptyCabins();
          const flightKey = buildFlightKey(carrier, flightNum, origin, destination, date);

          if (!skipSeatmapKeys?.has(flightKey)) {
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
          }

          const depAt = String(seg.departing_at || "");
          const arrAt = String(seg.arriving_at || "");

          return {
            flightKey,
            airline: carrier,
            flightNumber: flightNum,
            origin,
            destination,
            departureDate: date,
            departureTime: depAt.slice(11, 16) || "00:00",
            arrivalTime: arrAt.slice(11, 16) || "00:00",
            duration: formatDuration(seg.duration),
            aircraft: seg.aircraft?.iata_code || seg.aircraft?.name || "Widebody",
            dataSource: "live" as const,
            cabins,
            fareBuckets: null,
          };
        })
      );
    })
  );

  return pairResults.flat();
}
