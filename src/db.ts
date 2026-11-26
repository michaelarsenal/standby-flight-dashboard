import type { FlightCandidate, ReadinessLevel, SeatSnapshot, WatchedFlight } from "./types.ts";

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
  ]);
}

export async function listWatches(db: D1Database): Promise<WatchedFlight[]> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM watches ORDER BY departure_date ASC, departure_time ASC")
    .all<WatchedFlight>();
  return res.results ?? [];
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

export async function recordSnapshot(
  db: D1Database,
  flight: FlightCandidate,
  hoursToDeparture: number | null,
  note?: string
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
        disruption_count, score, status, raw_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
