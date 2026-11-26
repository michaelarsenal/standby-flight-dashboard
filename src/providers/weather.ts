export interface PredictiveWeatherRisk {
  airport: string;
  date: string;
  riskPoints: number;
  level: "low" | "moderate" | "high";
  signals: string[];
}

const AIRPORT_COORDS: Record<string, { lat: number; lon: number }> = {
  IAD: { lat: 38.9531, lon: -77.4565 },
  BWI: { lat: 39.1774, lon: -76.6684 },
  DCA: { lat: 38.8512, lon: -77.0402 },
  LHR: { lat: 51.47, lon: -0.4543 },
  LGW: { lat: 51.1537, lon: -0.1821 },
  LCY: { lat: 51.5048, lon: 0.0495 },
  JFK: { lat: 40.6413, lon: -73.7781 },
  EWR: { lat: 40.6895, lon: -74.1745 },
  LGA: { lat: 40.7769, lon: -73.874 },
  BOS: { lat: 42.3656, lon: -71.0096 },
  ORD: { lat: 41.9742, lon: -87.9073 },
  ATL: { lat: 33.6407, lon: -84.4277 },
  DFW: { lat: 32.8998, lon: -97.0403 },
  IAH: { lat: 29.9902, lon: -95.3368 },
  LAX: { lat: 33.9416, lon: -118.4085 },
  SFO: { lat: 37.6213, lon: -122.379 },
  MIA: { lat: 25.7959, lon: -80.287 },
  CDG: { lat: 49.0097, lon: 2.5479 },
  NBO: { lat: -1.3192, lon: 36.9278 },
};

/**
 * Fetches 16-day hourly forecast from Open-Meteo (free, no API key required)
 * and evaluates fog/low visibility, strong wind gusts, snow, and thunderstorms.
 */
export async function fetchAirportWeatherRisk(
  airport: string,
  date: string
): Promise<PredictiveWeatherRisk> {
  const code = airport.toUpperCase();
  const coords = AIRPORT_COORDS[code];
  if (!coords) {
    return { airport: code, date, riskPoints: 0, level: "low", signals: [] };
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&hourly=weathercode,windgusts_10m,visibility,precipitation&start_date=${date}&end_date=${date}&timezone=UTC`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { airport: code, date, riskPoints: 0, level: "low", signals: [] };
    }
    const json = (await res.json()) as {
      hourly?: {
        weathercode?: number[];
        windgusts_10m?: number[];
        visibility?: number[];
        precipitation?: number[];
      };
    };

    const codes = json.hourly?.weathercode ?? [];
    const gusts = json.hourly?.windgusts_10m ?? [];
    const vis = json.hourly?.visibility ?? [];
    const precip = json.hourly?.precipitation ?? [];

    let riskPoints = 0;
    const signals: string[] = [];

    const maxGust = gusts.length > 0 ? Math.max(...gusts) : 0;
    const minVis = vis.length > 0 ? Math.min(...vis) : 10000;
    const maxPrecip = precip.length > 0 ? Math.max(...precip) : 0;
    const hasFog = codes.some((c) => c === 45 || c === 48) || minVis < 1000;
    const hasSnowOrStorm = codes.some((c) => c >= 71);

    if (hasFog) {
      riskPoints += 22;
      signals.push(`${code}: Fog / low visibility forecast (min ${Math.round(minVis)}m)`);
    }
    if (maxGust >= 75) {
      riskPoints += 25;
      signals.push(`${code}: Severe wind gusts forecast (${Math.round(maxGust)} km/h)`);
    } else if (maxGust >= 55) {
      riskPoints += 12;
      signals.push(`${code}: Strong wind gusts forecast (${Math.round(maxGust)} km/h)`);
    }
    if (hasSnowOrStorm) {
      riskPoints += 20;
      signals.push(`${code}: Snow or thunderstorm conditions forecast`);
    } else if (maxPrecip >= 6) {
      riskPoints += 10;
      signals.push(`${code}: Heavy rain forecast (${maxPrecip.toFixed(1)} mm/h)`);
    }

    const level: "low" | "moderate" | "high" =
      riskPoints >= 30 ? "high" : riskPoints >= 12 ? "moderate" : "low";

    return { airport: code, date, riskPoints, level, signals };
  } catch {
    return { airport: code, date, riskPoints: 0, level: "low", signals: [] };
  }
}
