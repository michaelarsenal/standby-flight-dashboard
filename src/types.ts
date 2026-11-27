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

export type InboundStage = "scheduled" | "taxiing" | "enroute" | "landed" | "parked" | "diverted" | "cancelled";

export interface AlertStages {
  etd: boolean;
  taxiing: boolean;
  enroute: boolean;
  landed: boolean;
  disruption: boolean;
  diversion: boolean;
}

export interface SurfaceCongestion {
  airport: string;
  level: "light" | "moderate" | "heavy";
  activeDepartures: number;
  avgDelayMins: number;
  estimatedTaxiMins: number;
  weatherSummary?: string;
  summary: string;
}

export interface OutboundFlightInfo {
  flightNumber: string;
  gate: string;
  terminal: string;
  status: string;
  scheduledOut: string;
  estimatedOut: string;
  originTimezone?: string;
  delayMins: number;
  cancelled: boolean;
  diverted: boolean;
}

export interface InboundFlightInfo {
  inboundFlight: string;
  inboundIdent: string;
  origin: string;
  destination: string;
  destinationTimezone?: string;
  registration: string;
  status: string;
  stage: InboundStage;
  adsbLive?: boolean;
  departInMins: number | null;
  arriveInMins?: number | null;
  taxiMins?: number | null;
  surfaceCongestion?: SurfaceCongestion | null;
  arrivalCongestion?: SurfaceCongestion | null;
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

export interface WatchLoadSummary {
  total: number;
  open: number;
  occupied: number;
  available: number;
  blocked: number;
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
  last_inbound_milestones?: string | null;
  last_outbound_state?: string | null;
  assigned_seat?: string | null;
  last_seat_state?: string | null;
  archived?: number;
  created_at: string;
  updated_at: string;
  inbound?: InboundFlightInfo | null;
  outbound?: OutboundFlightInfo | null;
  alertStages?: AlertStages;
  seatMonitor?: SeatMonitorStatus | null;
  targetCabinSummary?: WatchLoadSummary | null;
  flightTotalSummary?: WatchLoadSummary | null;
  cabinLoads?: Array<{ code: string; bucket: string; total: number; open: number; occupied: number }>;
  economyComfort?: EconomySeatStats | null;
  lastSeatmapAt?: string | null;
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
  empty_rows_total?: number | null;
  adjacent_spare?: number | null;
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
  GITHUB_TOKEN?: string;
}
