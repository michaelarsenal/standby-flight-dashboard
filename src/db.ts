import type { AlertStages, FlightCandidate, ReadinessLevel, SeatSnapshot, WatchedFlight } from "./types.ts";

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_key TEXT NOT NULL UNIQUE,
      airline TEXT NOT NULL,
      flight_number TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      departure_time TEXT,
      aircraft TEXT,
      target_cabin TEXT DEFAULT 'economy',
      ef_buckets TEXT,
      last_status TEXT,
      last_score INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_key TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      hours_to_departure REAL,
      first_open INTEGER DEFAULT 0,
      first_occupied INTEGER DEFAULT 0,
      first_blocked INTEGER DEFAULT 0,
      business_open INTEGER DEFAULT 0,
      business_occupied INTEGER DEFAULT 0,
      business_blocked INTEGER DEFAULT 0,
      prem_econ_open INTEGER DEFAULT 0,
      prem_econ_occupied INTEGER DEFAULT 0,
      prem_econ_blocked INTEGER DEFAULT 0,
      economy_open INTEGER DEFAULT 0,
      economy_occupied INTEGER DEFAULT 0,
      economy_blocked INTEGER DEFAULT 0,
      disruption_count INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'amber',
      raw_note TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ef_flights (
      flight_key TEXT PRIMARY KEY,
      airline TEXT NOT NULL,
      flight_number TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT,
      aircraft TEXT,
      ef_buckets TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ef_seatmaps (
      flight_key TEXT PRIMARY KEY,
      aircraft TEXT,
      seatmap_json TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_key TEXT NOT NULL,
      flight_number TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      triggered_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
  ]);
  for (const col of [
    "ALTER TABLE watches ADD COLUMN alert_stages TEXT",
    "ALTER TABLE watches ADD COLUMN last_inbound_stage TEXT",
    "ALTER TABLE watches ADD COLUMN last_inbound_milestones TEXT",
    "ALTER TABLE watches ADD COLUMN last_outbound_state TEXT",
    "ALTER TABLE watches ADD COLUMN assigned_seat TEXT",
    "ALTER TABLE watches ADD COLUMN last_seat_state TEXT",
    "ALTER TABLE watches ADD COLUMN archived INTEGER DEFAULT 0",
    "ALTER TABLE snapshots ADD COLUMN empty_rows_total INTEGER",
    "ALTER TABLE snapshots ADD COLUMN adjacent_spare INTEGER",
  ]) {
    try {
      await db.prepare(col).run();
    } catch {
      // Column already exists
    }
  }
}

export const DEFAULT_ALERT_STAGES: AlertStages = {
  etd: true,
  taxiing: true,
  enroute: true,
  landed: true,
  disruption: true,
  diversion: true,
};

export function parseAlertStages(raw?: string | null): AlertStages {
  if (!raw) return { ...DEFAULT_ALERT_STAGES };
  try {
    const parsed = JSON.parse(raw) as Partial<AlertStages>;
    return {
      etd: parsed.etd !== false,
      taxiing: parsed.taxiing !== false,
      enroute: parsed.enroute !== false,
      landed: parsed.landed !== false,
      disruption: parsed.disruption !== false,
      diversion: parsed.diversion !== false,
    };
  } catch {
    return { ...DEFAULT_ALERT_STAGES };
  }
}

export async function listWatches(db: D1Database): Promise<WatchedFlight[]> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM watches ORDER BY departure_date ASC, departure_time ASC")
    .all<WatchedFlight>();
  return (res.results ?? []).map((w) => ({
    ...w,
    alertStages: parseAlertStages(w.alert_stages),
  }));
}

export async function upsertWatch(
  db: D1Database,
  flight: FlightCandidate,
  targetCabin: string,
  efBuckets?: string | null
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO watches (
        flight_key, airline, flight_number, origin, destination, departure_date,
        departure_time, aircraft, target_cabin, ef_buckets, last_status, last_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(flight_key) DO UPDATE SET
        target_cabin = excluded.target_cabin,
        ef_buckets = COALESCE(excluded.ef_buckets, watches.ef_buckets),
        last_status = excluded.last_status,
        last_score = excluded.last_score,
        updated_at = datetime('now')`
    )
    .bind(
      flight.flightKey,
      flight.airline,
      flight.flightNumber,
      flight.origin,
      flight.destination,
      flight.departureDate,
      flight.departureTime,
      flight.aircraft,
      targetCabin,
      efBuckets ?? flight.fareBuckets?.raw ?? null,
      flight.readiness,
      flight.standbyScore
    )
    .run();
}

export async function deleteWatch(db: D1Database, flightKey: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("DELETE FROM watches WHERE flight_key = ?").bind(flightKey).run();
}

export async function updateWatchStatus(
  db: D1Database,
  flightKey: string,
  status: ReadinessLevel,
  score: number
): Promise<void> {
  await db
    .prepare("UPDATE watches SET last_status = ?, last_score = ?, updated_at = datetime('now') WHERE flight_key = ?")
    .bind(status, score, flightKey)
    .run();
}

export async function updateWatchAlerts(
  db: D1Database,
  flightKey: string,
  alertStages: AlertStages
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE watches SET alert_stages = ?, updated_at = datetime('now') WHERE flight_key = ?")
    .bind(JSON.stringify(alertStages), flightKey)
    .run();
}

export async function updateWatchInboundStage(
  db: D1Database,
  flightKey: string,
  stageKey: string
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE watches SET last_inbound_stage = ?, updated_at = datetime('now') WHERE flight_key = ?")
    .bind(stageKey, flightKey)
    .run();
}

export async function updateWatchSeat(
  db: D1Database,
  flightKey: string,
  assignedSeat: string | null,
  lastSeatState: string | null = null
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE watches SET assigned_seat = ?, last_seat_state = ?, updated_at = datetime('now') WHERE flight_key = ?")
    .bind(assignedSeat, lastSeatState, flightKey)
    .run();
}

export async function updateWatchSeatState(
  db: D1Database,
  flightKey: string,
  lastSeatState: string | null
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE watches SET last_seat_state = ?, updated_at = datetime('now') WHERE flight_key = ?")
    .bind(lastSeatState, flightKey)
    .run();
}

export async function updateWatchMilestones(
  db: D1Database,
  flightKey: string,
  milestonesJson: string
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE watches SET last_inbound_milestones = ?, updated_at = datetime('now') WHERE flight_key = ?")
    .bind(milestonesJson, flightKey)
    .run();
}

export async function updateWatchOutboundState(
  db: D1Database,
  flightKey: string,
  outboundStateJson: string
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE watches SET last_outbound_state = ?, updated_at = datetime('now') WHERE flight_key = ?")
    .bind(outboundStateJson, flightKey)
    .run();
}

export async function archiveOldWatches(db: D1Database, cutoffIsoDate: string): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE watches SET archived = 1 WHERE departure_date < ? AND COALESCE(archived, 0) = 0")
    .bind(cutoffIsoDate)
    .run();
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await ensureSchema(db);
  if (!value.trim()) {
    await db.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
    return;
  }
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value.trim())
    .run();
}

export interface TriggerRecord {
  id: number;
  flight_key: string;
  flight_number: string;
  category: string;
  title: string;
  detail: string;
  triggered_at: string;
}

export async function recordTrigger(
  db: D1Database,
  params: { flightKey: string; flightNumber: string; category: string; title: string; detail: string }
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO triggers (flight_key, flight_number, category, title, detail, triggered_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(params.flightKey, params.flightNumber, params.category, params.title, params.detail)
    .run();
}

export async function listRecentTriggers(db: D1Database, limit = 25): Promise<TriggerRecord[]> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM triggers ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all<TriggerRecord>();
  return res.results ?? [];
}

export async function recordSnapshot(
  db: D1Database,
  flight: FlightCandidate,
  hoursToDeparture: number | null,
  note?: string,
  economyComfort?: { emptyRowsTotal: number; adjacentSpareSeats: number } | null
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO snapshots (
        flight_key, hours_to_departure,
        first_open, first_occupied, first_blocked,
        business_open, business_occupied, business_blocked,
        prem_econ_open, prem_econ_occupied, prem_econ_blocked,
        economy_open, economy_occupied, economy_blocked,
        empty_rows_total, adjacent_spare,
        disruption_count, score, status, raw_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      flight.flightKey,
      hoursToDeparture,
      flight.cabins.first.available,
      flight.cabins.first.occupied,
      flight.cabins.first.blocked,
      flight.cabins.business.available,
      flight.cabins.business.occupied,
      flight.cabins.business.blocked,
      flight.cabins.prem_econ.available,
      flight.cabins.prem_econ.occupied,
      flight.cabins.prem_econ.blocked,
      flight.cabins.economy.available,
      flight.cabins.economy.occupied,
      flight.cabins.economy.blocked,
      economyComfort ? economyComfort.emptyRowsTotal : null,
      economyComfort ? economyComfort.adjacentSpareSeats : null,
      flight.disruptions.length,
      flight.standbyScore,
      flight.readiness,
      note ?? null
    )
    .run();
}

export async function getSnapshots(db: D1Database, flightKey: string): Promise<SeatSnapshot[]> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM snapshots WHERE flight_key = ? ORDER BY captured_at ASC LIMIT 200")
    .bind(flightKey)
    .all<SeatSnapshot>();
  return res.results ?? [];
}

export async function getLatestExpertFlyerSnapshots(
  db: D1Database
): Promise<Map<string, SeatSnapshot>> {
  await ensureSchema(db);
  const res = await db
    .prepare(
      `SELECT s.*
       FROM snapshots s
       INNER JOIN (
         SELECT flight_key, MAX(id) AS max_id
         FROM snapshots
         WHERE raw_note LIKE 'ExpertFlyer%'
         GROUP BY flight_key
       ) latest ON s.id = latest.max_id`
    )
    .all<SeatSnapshot>();
  const map = new Map<string, SeatSnapshot>();
  for (const row of res.results ?? []) {
    map.set(row.flight_key, row);
  }
  return map;
}

export interface EfFlightRow {
  flight_key: string;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_date: string;
  departure_time: string;
  arrival_time: string | null;
  aircraft: string | null;
  ef_buckets: string | null;
  updated_at: string;
}

export async function upsertEfFlights(
  db: D1Database,
  flights: Omit<EfFlightRow, "updated_at">[]
): Promise<void> {
  await ensureSchema(db);
  if (flights.length === 0) return;
  const stmts = flights.map((f) =>
    db
      .prepare(
        `INSERT INTO ef_flights (
          flight_key, airline, flight_number, origin, destination,
          departure_date, departure_time, arrival_time, aircraft, ef_buckets, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(flight_key) DO UPDATE SET
          departure_time = excluded.departure_time,
          arrival_time = COALESCE(excluded.arrival_time, ef_flights.arrival_time),
          aircraft = COALESCE(excluded.aircraft, ef_flights.aircraft),
          ef_buckets = COALESCE(excluded.ef_buckets, ef_flights.ef_buckets),
          updated_at = datetime('now')`
      )
      .bind(
        f.flight_key,
        f.airline,
        f.flight_number,
        f.origin,
        f.destination,
        f.departure_date,
        f.departure_time,
        f.arrival_time,
        f.aircraft,
        f.ef_buckets
      )
  );
  await db.batch(stmts);
}

export async function listEfFlights(
  db: D1Database,
  date: string
): Promise<EfFlightRow[]> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM ef_flights WHERE departure_date = ?")
    .bind(date)
    .all<EfFlightRow>();
  return res.results ?? [];
}

export async function upsertEfSeatmap(
  db: D1Database,
  flightKey: string,
  aircraft: string,
  seatmap: unknown
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO ef_seatmaps (flight_key, aircraft, seatmap_json, captured_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(flight_key) DO UPDATE SET
         aircraft = COALESCE(NULLIF(excluded.aircraft, ''), ef_seatmaps.aircraft),
         seatmap_json = excluded.seatmap_json,
         captured_at = datetime('now')`
    )
    .bind(flightKey, aircraft, JSON.stringify(seatmap))
    .run();
}

export async function getEfSeatmap(
  db: D1Database,
  flightKey: string
): Promise<{ flight_key: string; aircraft: string | null; seatmap_json: string; captured_at: string } | null> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM ef_seatmaps WHERE flight_key = ?")
    .bind(flightKey)
    .first<{ flight_key: string; aircraft: string | null; seatmap_json: string; captured_at: string }>();
  return res ?? null;
}

export async function getEfSeatmapsByKeys(
  db: D1Database,
  keys: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (keys.length === 0) return map;
  await ensureSchema(db);
  const placeholders = keys.map(() => "?").join(", ");
  const res = await db
    .prepare(`SELECT flight_key, seatmap_json FROM ef_seatmaps WHERE flight_key IN (${placeholders})`)
    .bind(...keys)
    .all<{ flight_key: string; seatmap_json: string }>();
  for (const row of res.results ?? []) {
    map.set(row.flight_key, row.seatmap_json);
  }
  return map;
}
