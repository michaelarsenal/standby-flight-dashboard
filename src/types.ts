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
  dayOffset: -3 | -2 | -1 | 0;
  type: "cancelled" | "delayed" | "equipment_swap";
  detail: string;
  impactPenalty: number;
}

export interface DisruptionRiskSummary {
  level: "low" | "moderate" | "high";
  score: number;
  signals: string[];
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
  disruptionRisk?: DisruptionRiskSummary;
  standbyScore: number;
  readiness: ReadinessLevel;
  reasons: string[];
  watched?: boolean;
  economyComfort?: EconomySeatStats | null;
}

export interface EconomySeatStats {
  emptyLeft: number;
  emptyMiddle: number;
  emptyRight: number;
  emptyRowsTotal: number;
  adjacentSpareSeats: number;
  windowAvailable: number;
  aisleAvailable: number;
}

export interface SearchQuery {
  origins: string[];
  destinations: string[];
  date: string;
  airlines: string[];
  targetCabin: CabinKey;
}

export type InboundStage = "scheduled" | "enroute" | "landed" | "cancelled";

export interface AlertStages {
  etd: boolean;
  enroute: boolean;
  landed: boolean;
  disruption: boolean;
}

export interface InboundFlightInfo {
  inboundFlight: string;
  inboundIdent: string;
  origin: string;
  destination: string;
  registration: string;
  status: string;
  stage: InboundStage;
  departInMins: number | null;
  scheduledDeparture?: string;
  estimatedDeparture?: string;
  hasDeparted?: boolean;
  scheduledArrival: string;
  estimatedArrival: string;
  delayMins: number;
  turnaroundMins: number | null;
  outboundImpact: "none" | "watch" | "high";
  impactSummary: string;
  flightRadarUrl: string;
  flightAwareUrl: string;
}

export interface SeatMonitorStatus {
  seat: string;
  seatStatus: "occupied" | "blocked" | "available";
  sectionSeats: Array<{ seat: string; letter: string; status: "occupied" | "blocked" | "available"; isAdjacent: boolean }>;
  adjacentOccupied: string[];
  rowOccupied: string[];
  rowOpenCount: number;
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
  alert_stages?: string | null;
  last_inbound_stage?: string | null;
  assigned_seat?: string | null;
  last_seat_state?: string | null;
  created_at: string;
  updated_at: string;
  inbound?: InboundFlightInfo | null;
  alertStages?: AlertStages;
  seatMonitor?: SeatMonitorStatus | null;
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
  NTFY_TOPIC?: string;
}
