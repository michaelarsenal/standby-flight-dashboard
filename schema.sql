CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_key TEXT NOT NULL UNIQUE,
  airline TEXT NOT NULL,
  flight_number TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  departure_time TEXT,
  aircraft TEXT,
  target_cabin TEXT DEFAULT 'Economy',
  ef_buckets TEXT,
  last_status TEXT,
  last_score INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots (
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
);

CREATE INDEX IF NOT EXISTS idx_snapshots_flight_key ON snapshots(flight_key, captured_at);
