# Standby Flight Dashboard (BA & Virgin Atlantic)

Interactive **Cloudflare Workers + D1 + Cron** web app (PWA-ready for desktop & Android) for checking standby flight loads, seat-map fill velocity, and Day -1 / Day 0 route cancellations.

## Features
- **Interactive Multi-Airport Search:** Query any origin(s), co-terminals (`WAS` → `IAD, BWI, DCA`; `LON` → `LHR, LGW, LCY`), destination(s), date, and airline (`BA`, `VS`, or both).
- **Standby Readiness Score (`Green` / `Amber` / `Red`):** Combines open seat-map counts, T-24h check-in fill velocity, Day -1 / Day 0 route disruptions, and optional ExpertFlyer/`myIDTravel` fare buckets.
- **Quick-Paste EF / myIDTravel Parser:** Paste `F5 A5 J9 C9 D9 R8 I0 W8 E7 T7 Y9 B9...` on any flight card to layer GDS buckets into the score.
- **Watchlist & Cron Alerts:** Pin any candidate flight to record 30-minute seat-map snapshots in Cloudflare D1 and receive email alerts via Resend when availability tightens or an earlier flight cancels.
- **Demo Mode Out of the Box:** Works immediately before adding API keys so you can test querying and watching flights.

## Setup (CLI-First)

1. **Create the Cloudflare D1 database** and copy the returned `database_id` into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create standby-flight-db
   npx wrangler d1 execute standby-flight-db --remote --file=schema.sql
   ```
2. **Add Worker secrets** (optional for Demo Mode; required for live data & alerts):
   ```bash
   npx wrangler secret put DUFFEL_API_TOKEN
   npx wrangler secret put FLIGHTAWARE_API_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ALERT_EMAIL_TO
   ```
3. **Deploy:**
   ```bash
   npm run deploy
   ```
   Or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Secrets for automatic deploys on push to `main`.

## REST JSON Endpoints (for Browser & Future Android App)
- `GET /api/search?origins=WAS&destinations=LHR&date=2026-11-27&airlines=BA,VS&targetCabin=economy`
- `POST /api/score` — Re-score a flight candidate with pasted ExpertFlyer/`myIDTravel` buckets
- `GET /api/watches` / `POST /api/watches` / `DELETE /api/watches/:flightKey`
- `GET /api/history/:flightKey` — T-24h seat-map snapshot history
- `GET /api/health`
