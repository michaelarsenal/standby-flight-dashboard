export type CabinKey = "first" | "business" | "prem_econ" | "economy";
export type ReadinessLevel = "green" | "amber" | "red";

export interface CabinSeatSummary {
  available: number;
  occupied: number;
  blocked: number;
  total: number;
}

export interface FareBuckets {
  raw: string;
  firstMax: number | null;
  businessMax: number | null;
  premEconMax: number | null;
  economyMax: number | null;
  classes: Record<string, number>;
}

export interface RouteDisruption {
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  scheduledDeparture: string;
  dayOffset: -1 | 0;
  type: "cancelled" | "delayed" | "equipment_swap";
  detail: string;
  impactPenalty: number;
}

export interface FlightCandidate {
  flightKey: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  aircraft: string;
  dataSource: "live" | "demo";
  cabins: Record<CabinKey, CabinSeatSummary>;
  fareBuckets: FareBuckets | null;
  disruptions: RouteDisruption[];
  standbyScore: number;
  readiness: ReadinessLevel;
  reasons: string[];
  watched?: boolean;
}

export interface SearchQuery {
  origins: string[];
  destinations: string[];
  date: string;
  airlines: string[];
  targetCabin: CabinKey;
}

export interface WatchedFlight {
  id: number;
  flight_key: string;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_date: string;
  departure_time: string | null;
  aircraft: string | null;
  target_cabin: string;
  ef_buckets: string | null;
  last_status: ReadinessLevel | null;
  last_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface SeatSnapshot {
  id: number;
  flight_key: string;
  captured_at: string;
  hours_to_departure: number | null;
  first_open: number;
  first_occupied: number;
  first_blocked: number;
  business_open: number;
  business_occupied: number;
  business_blocked: number;
  prem_econ_open: number;
  prem_econ_occupied: number;
  prem_econ_blocked: number;
  economy_open: number;
  economy_occupied: number;
  economy_blocked: number;
  disruption_count: number;
  score: number;
  status: ReadinessLevel;
  raw_note: string | null;
}

export interface Env {
  DB?: D1Database;
  DUFFEL_API_TOKEN?: string;
  FLIGHTAWARE_API_KEY?: string;
  RESEND_API_KEY?: string;
  ALERT_EMAIL_TO?: string;
  ALERT_EMAIL_FROM?: string;
}
