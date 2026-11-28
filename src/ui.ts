export const MANIFEST_JSON = JSON.stringify(
  {
    name: "Standby Flight Dashboard",
    short_name: "StandbyFlights",
    description: "Interactive BA & Virgin Atlantic standby availability, seat map velocity, and route disruption tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1120",
    theme_color: "#0b1120",
  },
  null,
  2
);

export function renderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0b1120" />
  <link rel="manifest" href="/manifest.json" />
  <title>Standby Flight Dashboard (BA & VS)</title>
  <style>
    :root {
      --bg: #0b1120;
      --surface: #111827;
      --surface-2: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --green: #22c55e;
      --amber: #f59e0b;
      --red: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }
    .container {
      max-width: 1180px;
      margin: 0 auto;
      padding: 20px 16px 60px;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }
    h1 {
      font-size: 1.4rem;
      margin: 0;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: var(--muted);
      font-size: 0.88rem;
      margin-top: 2px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .pill.live { color: var(--green); border-color: rgba(34,197,94,0.4); }
    .pill.demo { color: var(--amber); border-color: rgba(245,158,11,0.4); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .search-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      align-items: end;
    }
    label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    input, select {
      width: 100%;
      padding: 9px 11px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font-size: 0.92rem;
    }
    button {
      cursor: pointer;
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 0.9rem;
      font-weight: 600;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.9; }
    .btn-primary { background: var(--accent); color: #082f49; }
    .btn-ghost {
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 10px;
      font-size: 0.8rem;
    }
    .btn-watch.active {
      background: rgba(56,189,248,0.18);
      border-color: var(--accent);
      color: var(--accent);
    }
    .disruption-banner {
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.4);
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 16px;
      font-size: 0.88rem;
    }
    .flight-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .flight-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
    }
    .flight-top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .flight-title {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .flight-num { font-size: 1.08rem; font-weight: 700; }
    .route-meta { color: var(--muted); font-size: 0.88rem; }
    .score-badge {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .score-green { background: rgba(34,197,94,0.16); color: #4ade80; border: 1px solid rgba(34,197,94,0.4); }
    .score-amber { background: rgba(245,158,11,0.16); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4); }
    .score-red { background: rgba(239,68,68,0.16); color: #f87171; border: 1px solid rgba(239,68,68,0.4); }
    .cabins-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 8px;
      margin: 10px 0;
    }
    .cabin-box {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 0.82rem;
    }
    .cabin-box.target { border-color: var(--accent); }
    .cabin-name { font-weight: 700; margin-bottom: 3px; display: flex; justify-content: space-between; }
    .cabin-nums { color: var(--muted); }
    .reasons {
      margin: 8px 0 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 0.82rem;
    }
    .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      align-items: center;
    }
    .ef-input {
      flex: 1;
      min-width: 220px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.78rem;
      padding: 7px 10px;
    }
    .section-title {
      font-size: 1rem;
      font-weight: 700;
      margin: 0 0 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2,6,23,0.75);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 50;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      max-width: 680px;
      width: 100%;
      padding: 18px;
      max-height: 85vh;
      overflow-y: auto;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-weight: 600; }
    .sm-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.78rem; margin: 10px 0 14px; color: var(--muted); }
    .sm-legend span { display: inline-flex; align-items: center; gap: 5px; }
    .sm-cabin { margin-bottom: 18px; border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: rgba(2,6,23,0.45); }
    .sm-cabin-title { font-weight: 700; font-size: 0.88rem; margin-bottom: 8px; display: flex; justify-content: space-between; color: var(--text); }
    .sm-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; font-size: 0.72rem; }
    .sm-rownum { width: 24px; text-align: right; color: var(--muted); font-family: monospace; flex-shrink: 0; margin-right: 4px; }
    .sm-seat { width: 24px; height: 24px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.68rem; border: 1px solid transparent; flex-shrink: 0; cursor: default; }
    .sm-a { background: #f8fafc; border-color: #cbd5e1; color: #0f172a; }
    .sm-p { background: #fffbeb; border-color: #f59e0b; color: #92400e; }
    .sm-o { background: #1d4ed8; border-color: #3b82f6; color: #ffffff; }
    .sm-b { background: rgba(100,116,139,0.22); border-color: rgba(100,116,139,0.5); color: #94a3b8; }
    .sm-group { display: inline-flex; align-items: center; gap: 4px; padding: 2px; border-radius: 7px; border: 1px solid transparent; }
    .sm-group.free-row { border-color: rgba(255,255,255,0.88); box-shadow: 0 0 0 1px rgba(255,255,255,0.22); }
    .sm-aisle { width: 12px; height: 24px; display: inline-block; flex-shrink: 0; }
    .sm-exit { font-size: 0.65rem; color: #f87171; font-weight: 700; padding: 0 3px; }
    .score-blue { background: rgba(56,189,248,0.16); color: #38bdf8; border: 1px solid rgba(56,189,248,0.4); }
    .score-slate { background: rgba(148,163,184,0.15); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.35); }
    .stage-pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid rgba(148,163,184,0.28);
      background: rgba(15,23,42,0.55);
      color: #64748b;
      margin-right: 4px;
      margin-top: 3px;
    }
    .stage-pill.on {
      border-color: rgba(56,189,248,0.55);
      background: rgba(56,189,248,0.14);
      color: #7dd3fc;
    }
    @media (max-width: 768px) {
      .container { padding: 12px 10px 40px; }
      header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .search-grid { grid-template-columns: 1fr; }
      .flight-top { flex-direction: column; align-items: flex-start; gap: 8px; }
      .cabins-grid { grid-template-columns: 1fr 1fr; }
      table.watches-table, table.watches-table thead, table.watches-table tbody, table.watches-table th, table.watches-table td, table.watches-table tr {
        display: block;
      }
      table.watches-table thead { display: none; }
      table.watches-table tr {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        margin-bottom: 10px;
        background: rgba(15,23,42,0.55);
      }
      table.watches-table td {
        border-bottom: none;
        padding: 4px 0;
      }
      table.watches-table td::before {
        content: attr(data-label);
        display: block;
        font-size: 10px;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 2px;
      }
      .stage-pill { padding: 4px 9px; font-size: 11px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Standby Flight Dashboard</h1>
        <div class="subtitle">British Airways, Virgin Atlantic &amp; American Airlines — Seat Map Velocity &amp; Route Disruption Monitor</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" class="btn-ghost" onclick="openFaq()" style="padding:5px 12px;font-size:12px;">FAQ</button>
        <div id="modeBadge" class="pill">Checking API mode...</div>
      </div>
    </header>

    <div class="card">
      <form id="searchForm" class="search-grid">
        <div>
          <label for="origins">Origin(s) / City</label>
          <input id="origins" value="WAS" placeholder="e.g. WAS or IAD, BWI" required />
        </div>
        <div>
          <label for="destinations">Destination(s) / City</label>
          <input id="destinations" value="LHR" placeholder="e.g. LHR or LON" required />
        </div>
        <div>
          <label for="date">Departure Date</label>
          <input id="date" type="date" required />
        </div>
        <div style="position:relative;" id="airlinesWrap">
          <label for="airlinesBtn">Airlines</label>
          <input type="hidden" id="airlines" value="BA,VS" />
          <button type="button" id="airlinesBtn" onclick="toggleAirlinesMenu(event)" style="width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:13.5px;cursor:pointer;">
            <span id="airlinesBtnLabel">BA, VS</span>
            <span style="color:var(--muted);font-size:11px;">▾</span>
          </button>
          <div id="airlinesMenu" style="display:none;position:absolute;top:100%;left:0;right:0;min-width:240px;margin-top:4px;background:#0f172a;border:1px solid rgba(148,163,184,0.35);border-radius:10px;padding:8px;z-index:60;box-shadow:0 10px 28px rgba(0,0,0,0.55);">
            <div id="airlinesOptions"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid rgba(148,163,184,0.18);font-size:11px;">
              <button type="button" class="btn-ghost" style="padding:2px 8px;font-size:11px;" onclick="selectAllAirlines()">Select All</button>
              <button type="button" class="btn-ghost" style="padding:2px 8px;font-size:11px;" onclick="closeAirlinesMenu()">Done</button>
            </div>
          </div>
        </div>
        <div>
          <label for="targetCabin">Target Cabin</label>
          <select id="targetCabin">
            <option value="economy">Economy</option>
            <option value="prem_econ">Premium Economy</option>
            <option value="business">Business / Club</option>
            <option value="first">First</option>
          </select>
        </div>
        <div>
          <button type="submit" class="btn-primary" style="width:100%">Search Flights</button>
        </div>
      </form>
    </div>

    <div id="disruptionBox"></div>

    <div id="resultsSection" style="display:none">
      <div class="section-title">
        <span id="resultsHeading">Search Results</span>
        <span id="resultsMeta" class="subtitle"></span>
      </div>
      <div id="searchProgress" style="display:none;margin-bottom:10px;"></div>
      <div id="resultsList" class="flight-list"></div>
    </div>

    <div class="card" style="margin-top: 22px;">
      <div class="section-title">
        <span>Watched Flights (T-24h Polling &amp; Alerts)</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="efRefreshBtn" class="btn-ghost" onclick="triggerEfSync()" title="Trigger immediate ExpertFlyer seat map sync">Refresh EF</button>
          <button class="btn-ghost" onclick="loadWatches()">Refresh</button>
        </div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:12px;">
        <div>
          <label for="mwFlight">Flight (e.g. BA292)</label>
          <input id="mwFlight" type="text" placeholder="BA292" style="width:105px" />
        </div>
        <div>
          <label for="mwOrigin">Origin</label>
          <input id="mwOrigin" type="text" placeholder="IAD" maxlength="3" style="width:72px" />
        </div>
        <div>
          <label for="mwDest">Dest</label>
          <input id="mwDest" type="text" placeholder="LHR" maxlength="3" style="width:72px" />
        </div>
        <div>
          <label for="mwDate">Date</label>
          <input id="mwDate" type="date" style="width:145px" />
        </div>
        <button class="btn-ghost" onclick="addManualWatch()" style="height:36px">+ Watch Flight #</button>
        <div style="margin-left:auto; display:flex; gap:6px; align-items:flex-end;">
          <div>
            <label for="ntfyTopic">Push Alerts (ntfy.sh topic)</label>
            <input id="ntfyTopic" type="text" placeholder="e.g. standby-ba-alerts" style="width:170px" />
          </div>
          <button class="btn-ghost" onclick="savePushTopic(false)" style="height:36px">Save</button>
          <button class="btn-ghost" onclick="savePushTopic(true)" style="height:36px">Test Push</button>
        </div>
      </div>
      <div id="watchesList" class="subtitle">Loading watched flights...</div>
    </div>
  </div>

  <div id="historyModal" class="modal-backdrop">
    <div class="modal">
      <div class="section-title">
        <span id="historyTitle">Seat Map Velocity History</span>
        <button class="btn-ghost" onclick="closeHistory()">Close</button>
      </div>
      <div id="historyBody"></div>
    </div>
  </div>

  <div id="seatmapModal" class="modal-backdrop">
    <div class="modal" style="max-width:760px">
      <div class="section-title">
        <span id="seatmapTitle">Seat Map</span>
        <button class="btn-ghost" onclick="closeSeatmap()">Close</button>
      </div>
      <div class="sm-legend">
        <span><i class="sm-seat sm-a">A</i> Available</span>
        <span><i class="sm-seat sm-p">$</i> Paid / Preferred</span>
        <span><i class="sm-seat sm-o"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></i> Occupied</span>
        <span><i class="sm-seat sm-b">X</i> Blocked</span>
        <span><span class="sm-group free-row" style="padding:2px 6px;font-size:0.72rem;color:#f8fafc;">Empty Row</span></span>
      </div>
      <div id="seatmapBody"></div>
    </div>
  </div>

  <div id="graphModal" class="modal-backdrop">
    <div class="modal" style="max-width:780px">
      <div class="section-title">
        <span id="graphTitle">Seat Availability History</span>
        <button class="btn-ghost" onclick="closeGraph()">Close</button>
      </div>
      <div id="graphMeta" class="subtitle" style="margin-bottom:10px"></div>
      <div id="graphToggles" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
      <div id="graphBody"></div>
    </div>
  </div>

  <div id="faqModal" class="modal-backdrop">
    <div class="modal" style="max-width:740px">
      <div class="section-title">
        <span>Standby Flight Dashboard — FAQ &amp; Data Sources</span>
        <button class="btn-ghost" onclick="closeFaq()">Close</button>
      </div>
      <div style="font-size:12.5px;line-height:1.55;color:#cbd5e1;display:flex;flex-direction:column;gap:12px;">
        <div>
          <strong style="color:#7dd3fc">1. How is the Standby Score calculated?</strong>
          <ul style="margin:4px 0 0;padding-left:18px;color:#94a3b8">
            <li>Starts at <strong>50</strong> baseline. Thresholds: <strong>GREEN</strong> (LOOKING GOOD) ≥ 70, <strong>AMBER</strong> (CAUTION) 45–69, <strong>RED</strong> (TIGHT) &lt; 45.</li>
            <li><strong>Target Cabin Open Seats (Available + Blocked):</strong> ≥25 seats or ≥28% open (+22), 10–24 (+8), 4–9 (-8), ≤3 (-24).</li>
            <li><strong>Free vs Blocked Quality:</strong> ≥15 free available seats or ≥50% free (+5); all open seats blocked (-8).</li>
            <li><strong>Cross-Cabin Buffer:</strong> ≥45 open seats across all cabins (+8).</li>
            <li><strong>Fare Bucket Cross-Check:</strong> Max bucket 9 (+18, +6 extra if ≥20 free seats), 5–8 (+8), 3–4 (-8), 0–2 (-22, -14 extra if ≥20 unassigned seats indicating unseated bookings).</li>
            <li><strong>Velocity &amp; Disruptions:</strong> Rapid fill ≥4 seats/hr (-15), route cancellations/delays, and 45% of predictive weather/hub/inbound risk (up to -20).</li>
          </ul>
        </div>
        <div>
          <strong style="color:#7dd3fc">2. ExpertFlyer (EF) Refresh Intervals</strong>
          <ul style="margin:4px 0 0;padding-left:18px;color:#94a3b8">
            <li>Triggered via GitHub Actions (<code>expertflyer-sync.yml</code>) every <strong>5 minutes</strong> (reusing cached session cookies); suspends automatically once a seat map closes out.</li>
            <li><strong>Inside T-2h</strong> (to closeout): every <strong>5 minutes</strong>.</li>
            <li><strong>T-24h to T-2h:</strong> every <strong>15 minutes</strong>.</li>
            <li><strong>T-48h to T-24h:</strong> every <strong>2 hours</strong>.</li>
            <li><strong>T-72h to T-48h:</strong> every <strong>6 hours</strong>. <strong>T-14d to T-72h:</strong> every <strong>12 hours</strong>.</li>
            <li><em>Note:</em> GitHub Actions <code>schedule</code> triggers can be delayed or coalesced during peak GitHub queue times. If EF closes a cabin or seat map at check-in close, the dashboard preserves the last best-known numbers (marked with a dashed amber border).</li>
          </ul>
        </div>
        <div>
          <strong style="color:#7dd3fc">3. FlightAware (FA) &amp; FlightRadar24 (FR24) Refresh Intervals</strong>
          <ul style="margin:4px 0 0;padding-left:18px;color:#94a3b8">
            <li><strong>Cloudflare Worker Cron:</strong> Runs every <strong>1 minute</strong> when a watched flight is inside T-8h or its inbound aircraft is active (<code>Pushback</code>, <code>Taxiing</code>, <code>Enroute</code>, <code>Landed</code>, <code>Diverted</code>), and every <strong>5 minutes</strong> outside that window.</li>
            <li><strong>Live Dashboard Refresh:</strong> Clicking <strong>Refresh</strong> on Watched Flights queries FlightAware live immediately.</li>
            <li><strong>FR24 Links:</strong> Shows <strong>● FR24 Live</strong> once ADS-B / OOOI pushback (<code>actual_out</code>) is active; before pushback it links to FR24's flight schedule/history page.</li>
          </ul>
        </div>
        <div>
          <strong style="color:#7dd3fc">4. How Arrival &amp; Departure Disruption is Calculated</strong>
          <ul style="margin:4px 0 0;padding-left:18px;color:#94a3b8">
            <li><strong>Departure Ground Congestion:</strong> Queries FA airport delays + scheduled/active departures in a ±30m window. Rates <strong>Light</strong> (~12m taxi), <strong>Moderate</strong> (~18m taxi, ≥10 dep/30m or +12m avg delay), or <strong>Heavy</strong> (~25–45m taxi, ≥18 dep/30m or +25m avg delay).</li>
            <li><strong>Arrival Congestion &amp; Weather:</strong> Combines FA destination airport average delays with Open-Meteo wind/fog/precipitation forecasts (Light / Moderate / Heavy).</li>
            <li><strong>Inbound Turnaround Impact:</strong> Compares inbound ETA vs outbound ETD: &lt;55m turnaround or ≥45m late = High risk; &lt;85m or ≥15m late = Watch.</li>
          </ul>
        </div>
        <div>
          <strong style="color:#7dd3fc">5. Source Datafeeds</strong>
          <ul style="margin:4px 0 0;padding-left:18px;color:#94a3b8">
            <li><strong>Flight Schedules &amp; Fallback Seat Maps:</strong> Duffel API</li>
            <li><strong>Detailed Seat Maps, Occupied/Blocked Counts &amp; Fare Buckets:</strong> ExpertFlyer (cached in Cloudflare D1)</li>
            <li><strong>Live Inbound/Outbound Telemetry, Gates, Delays, ADS-B Stages &amp; Airport Delays:</strong> FlightAware AeroAPI v4</li>
            <li><strong>Airport Weather Forecasts:</strong> Open-Meteo API</li>
            <li><strong>Live Radar Links:</strong> FlightRadar24 &amp; FlightAware</li>
            <li><strong>Alerts:</strong> Push notifications via <code>ntfy.sh</code> &amp; Email via Resend</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <script>
    function openFaq() { document.getElementById("faqModal").classList.add("open"); }
    function closeFaq() { document.getElementById("faqModal").classList.remove("open"); }
    const dateInput = document.getElementById("date");
    const todayLocal = new Date();
    const yyyy = todayLocal.getFullYear();
    const mm = String(todayLocal.getMonth() + 1).padStart(2, "0");
    const dd = String(todayLocal.getDate()).padStart(2, "0");
    dateInput.value = yyyy + "-" + mm + "-" + dd;

    let latestCandidates = [];

    function badgeClass(level) {
      if (level === "green") return "score-green";
      if (level === "red") return "score-red";
      if (!level || level === "pending") return "score-slate";
      return "score-amber";
    }

    function badgeText(level, score) {
      return level === "green" ? "LOOKING GOOD" : level === "red" ? "TIGHT" : "CAUTION";
    }

    let efPollTimer = null;
    let efClockTimer = null;
    let searchStartedAt = 0;

    function fmtElapsed(ms) {
      const secs = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    }

    function saveSearchState(metaText) {
      try {
        localStorage.setItem("standby_last_search_inputs", JSON.stringify({
          origins: document.getElementById("origins").value,
          destinations: document.getElementById("destinations").value,
          date: document.getElementById("date").value,
          airlines: document.getElementById("airlines").value,
          targetCabin: document.getElementById("targetCabin").value
        }));
        localStorage.setItem("standby_last_search_data", JSON.stringify({
          candidates: latestCandidates,
          metaText: metaText || document.getElementById("resultsMeta").textContent || "",
          date: document.getElementById("date").value,
          targetCabin: document.getElementById("targetCabin").value,
          startedAt: searchStartedAt || Date.now()
        }));
      } catch (e) {}
    }

    function renderSearchProgress(steps, showClock) {
      const el = document.getElementById("searchProgress");
      if (!el) return;
      if (!steps || steps.length === 0) {
        el.style.display = "none";
        el.innerHTML = "";
        return;
      }
      el.style.display = "block";
      const elapsedStr = searchStartedAt ? fmtElapsed(Date.now() - searchStartedAt) : "00:00";
      const clockHtml = showClock
        ? '<span style="margin-left:auto;color:#94a3b8;font-variant-numeric:tabular-nums;">Elapsed: <strong id="efElapsed" style="color:#e2e8f0">' + elapsedStr + '</strong> · est. ~1–2m</span>'
        : '';
      el.innerHTML = '<div class="card" style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;font-size:12px;border-color:rgba(56,189,248,0.35);background:rgba(15,23,42,0.72);">' +
        steps.map(function(st) {
          var icon = st.done ? '<span style="color:#4ade80;font-weight:700">✓</span>' : '<span style="color:#38bdf8;font-weight:700">⟳</span>';
          var col = st.done ? '#cbd5e1' : '#7dd3fc';
          return '<span style="color:' + col + '">' + icon + ' ' + st.label + '</span>';
        }).join('') +
        clockHtml +
      '</div>';
    }

    const pendingSeatmapKeys = new Set();

    function stopEfTimers() {
      if (efPollTimer) { clearInterval(efPollTimer); efPollTimer = null; }
      if (efClockTimer) { clearInterval(efClockTimer); efClockTimer = null; }
    }

    function updateProgressFromCandidates(isPolling, pollCount) {
      const total = latestCandidates.length;
      if (total === 0) {
        renderSearchProgress([], false);
        return false;
      }
      const bucketsDone = latestCandidates.filter(function(c) { return Boolean(c.fareBuckets); }).length;
      const seatsDone = latestCandidates.filter(function(c) { return c.cabins && (c.cabins.economy.total > 0 || c.cabins.business.total > 0); }).length;

      // Clear any pending seatmap keys that now have seatmap data
      latestCandidates.forEach(function(c) {
        if (c.cabins && (c.cabins.economy.total > 0 || c.cabins.business.total > 0)) {
          pendingSeatmapKeys.delete(c.flightKey);
        }
      });

      const waitingForBuckets = bucketsDone < total;
      const waitingForRequestedSeats = pendingSeatmapKeys.size > 0;
      const allDone = !waitingForBuckets && !waitingForRequestedSeats;

      const steps = [
        { done: true, label: "Schedule & weather — done" },
        { done: true, label: "FlightAware delays & links — done" },
        { done: !waitingForBuckets, label: !waitingForBuckets ? "EF fare buckets — done (" + bucketsDone + "/" + total + ")" : (isPolling ? "Syncing EF fare buckets (" + bucketsDone + "/" + total + ")..." : "EF fare buckets (" + bucketsDone + "/" + total + ")") },
        {
          done: !waitingForRequestedSeats,
          label: waitingForRequestedSeats
            ? "Loading requested seat map (" + pendingSeatmapKeys.size + " remaining)..."
            : (seatsDone > 0 ? "Seat maps loaded (" + seatsDone + "/" + total + ")" : "Seat maps on demand (+Watch or Load Seat Map)")
        }
      ];
      if (!allDone && !isPolling && pollCount >= 60) {
        steps.push({ done: true, label: "Timed out after 5m — click Refresh EF to retry" });
      }
      renderSearchProgress(steps, !allDone && isPolling);
      return allDone;
    }

    function startEfPolling(date, targetCabin) {
      stopEfTimers();
      if (!searchStartedAt) searchStartedAt = Date.now();
      if (updateProgressFromCandidates(true, 0)) return;
      efClockTimer = setInterval(function() {
        const cel = document.getElementById("efElapsed");
        if (cel && searchStartedAt) cel.textContent = fmtElapsed(Date.now() - searchStartedAt);
      }, 1000);
      let pollCount = 0;
      efPollTimer = setInterval(async function() {
        pollCount++;
        const keys = latestCandidates.map(function(c) { return c.flightKey; }).filter(Boolean);
        if (keys.length === 0 || pollCount > 60) {
          stopEfTimers();
          updateProgressFromCandidates(false, pollCount);
          return;
        }
        try {
          const qs = new URLSearchParams({
            keys: keys.join(","),
            date: date,
            origins: document.getElementById("origins").value,
            destinations: document.getElementById("destinations").value,
            airlines: document.getElementById("airlines").value,
            targetCabin: targetCabin
          });
          const res = await fetch("/api/ef-status?" + qs.toString());
          if (!res.ok) return;
          const data = await res.json();
          const routeKeys = data.routeKeys || [];
          if (routeKeys.length > 0 && !reconciledThisSearch) {
            const curSet = new Set(keys);
            const routeSet = new Set(routeKeys);
            const mismatch = keys.some(function(k) { return !routeSet.has(k); }) || routeKeys.some(function(k) { return !curSet.has(k); });
            if (mismatch) {
              reconciledThisSearch = true;
              stopEfTimers();
              runSearch(null, true);
              return;
            }
          }
          const items = data.items || {};
          let changed = false;
          latestCandidates = latestCandidates.map(function(c) {
            const upd = items[c.flightKey];
            if (!upd) return c;
            const next = Object.assign({}, c);
            if (upd.canonicalKey && upd.canonicalKey !== c.flightKey) {
              next.flightKey = upd.canonicalKey;
            }
            if (upd.fareBuckets && !c.fareBuckets) {
              next.fareBuckets = upd.fareBuckets;
              changed = true;
            }
            if (upd.hasSeatmap && upd.cabins && (pendingSeatmapKeys.has(c.flightKey) || (upd.canonicalKey && pendingSeatmapKeys.has(upd.canonicalKey)) || (c.cabins.economy.total === 0 && c.cabins.business.total === 0))) {
              next.cabins = upd.cabins;
              next.economyComfort = upd.economyComfort;
              if (upd.standbyScore !== null) next.standbyScore = upd.standbyScore;
              if (upd.readiness) next.readiness = upd.readiness;
              if (upd.reasons) next.reasons = upd.reasons;
              pendingSeatmapKeys.delete(c.flightKey);
              pendingSeatmapKeys.delete(next.flightKey);
              changed = true;
            }
            return next;
          });
          if (changed) {
            renderCandidates(targetCabin);
            saveSearchState();
            loadWatches();
          }
          if (updateProgressFromCandidates(true, pollCount)) {
            stopEfTimers();
          }
        } catch (e) {}
      }, 5000);
    }

    let reconciledThisSearch = false;

    async function runSearch(e, isReconcile) {
      if (e) e.preventDefault();
      stopEfTimers();
      if (!isReconcile) {
        searchStartedAt = Date.now();
        reconciledThisSearch = false;
      }
      const origins = document.getElementById("origins").value;
      const destinations = document.getElementById("destinations").value;
      const date = document.getElementById("date").value;
      const airlines = document.getElementById("airlines").value;
      const targetCabin = document.getElementById("targetCabin").value;

      document.getElementById("resultsSection").style.display = "block";
      renderSearchProgress([
        { done: false, label: "Querying flight schedule & weather..." },
        { done: false, label: "Querying FlightAware delays & links..." }
      ], true);
      efClockTimer = setInterval(function() {
        const cel = document.getElementById("efElapsed");
        if (cel && searchStartedAt) cel.textContent = fmtElapsed(Date.now() - searchStartedAt);
      }, 1000);
      document.getElementById("resultsList").innerHTML = '<div class="card subtitle">Querying flights, seat maps, and live route status for ' + date + '...</div>';

      const qs = new URLSearchParams({ origins, destinations, date, airlines, targetCabin });
      const res = await fetch("/api/search?" + qs.toString());
      const data = await res.json();

      const modeBadge = document.getElementById("modeBadge");
      if (data.mode === "live") {
        modeBadge.className = "pill live";
        modeBadge.textContent = "LIVE API (Duffel + FlightAware)";
      } else {
        modeBadge.className = "pill demo";
        modeBadge.textContent = "DEMO MODE (Add API keys for live data)";
      }

      const dBox = document.getElementById("disruptionBox");
      if (data.disruptions && data.disruptions.length > 0) {
        dBox.innerHTML = '<div class="disruption-banner"><strong>Route Disruption Alert (Day -1 / Day 0):</strong><ul style="margin:6px 0 0;padding-left:18px;">' +
          data.disruptions.map(d => '<li><strong>' + d.flightNumber + '</strong> (' + d.origin + '→' + d.destination + ', ' + (d.dayOffset === -1 ? 'Day -1' : 'Day 0') + '): ' + d.detail + '</li>').join("") +
          '</ul></div>';
      } else {
        dBox.innerHTML = "";
      }

      latestCandidates = data.candidates || [];
      const metaText = latestCandidates.length + " flight(s) across " + (data.expandedOrigins || []).join(", ") + " → " + (data.expandedDestinations || []).join(", ");
      document.getElementById("resultsMeta").textContent = metaText;

      renderCandidates(targetCabin);
      saveSearchState(metaText);
      startEfPolling(date, targetCabin);
    }

    function renderCandidates(targetCabin) {
      const list = document.getElementById("resultsList");
      if (latestCandidates.length === 0) {
        list.innerHTML = '<div class="card subtitle">No direct BA/VS flights found for this route and date.</div>';
        return;
      }

      list.innerHTML = latestCandidates.map((c, idx) => {
        const fb = c.fareBuckets;
        const bucketMap = {
          first: fb && fb.firstMax !== null && fb.firstMax !== undefined ? 'F' + fb.firstMax : '',
          business: fb && fb.businessMax !== null && fb.businessMax !== undefined ? 'J' + fb.businessMax : '',
          prem_econ: fb && fb.premEconMax !== null && fb.premEconMax !== undefined ? 'W' + fb.premEconMax : '',
          economy: fb && fb.economyMax !== null && fb.economyMax !== undefined ? 'Y' + fb.economyMax : ''
        };

        let totCap = 0;
        let totOcc = 0;
        let totBlk = 0;
        let totAvail = 0;

        const cabins = [
          ["first", "First"],
          ["business", "Business / Club"],
          ["prem_econ", "Prem Econ"],
          ["economy", "Economy"]
        ].map(([key, label]) => {
          const s = c.cabins[key];
          if (!s || s.total === 0) {
            return '';
          }
          totCap += s.total;
          totOcc += s.occupied;
          totBlk += s.blocked;
          totAvail += s.available;
          const openTotal = s.available + s.blocked;
          const occPct = s.total > 0 ? Math.round((s.occupied / s.total) * 100) : 0;
          const fullColor = occPct >= 88 ? '#f87171' : occPct >= 70 ? '#fbbf24' : '#4ade80';
          const barColor = occPct >= 88 ? '#ef4444' : occPct >= 70 ? '#f59e0b' : '#22c55e';
          const bTag = bucketMap[key] ? ' <span class="pill" style="padding:1px 6px;font-size:10px">' + bucketMap[key] + '</span>' : '';
          return '<div class="cabin-box ' + (key === targetCabin ? 'target' : '') + '">' +
            '<div class="cabin-name"><span>' + label + bTag + '</span><span style="font-size:11px;color:#94a3b8">' + occPct + '% full</span></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 4px;">' +
              '<span style="font-size:19px;font-weight:800;letter-spacing:-0.02em;color:' + fullColor + '">' + s.total + ' / ' + openTotal + '</span>' +
              '<span style="font-size:11px;color:#94a3b8">Cap / Open (' + s.available + ' avail)</span>' +
            '</div>' +
            '<div style="height:4px;background:rgba(148,163,184,0.18);border-radius:999px;overflow:hidden;margin-bottom:5px;">' +
              '<div style="height:100%;width:' + occPct + '%;background:' + barColor + '"></div>' +
            '</div>' +
            '<div class="cabin-nums" style="font-size:11px">Occ ' + s.occupied + ' · Blk ' + s.blocked + ' · Avail ' + s.available + '</div>' +
          '</div>';
        }).join("");

        const totOpen = totBlk + totAvail;
        const totPct = totCap > 0 ? Math.round((totOcc / totCap) * 100) : 0;
        const totColor = totPct >= 88 ? '#f87171' : totPct >= 70 ? '#fbbf24' : '#4ade80';
        const flightTotalsPill = totCap > 0
          ? '<div style="display:flex;align-items:center;gap:10px;padding:5px 12px;border-radius:8px;background:rgba(15,23,42,0.7);border:1px solid var(--border);">' +
              '<span style="font-size:17px;font-weight:800;letter-spacing:-0.02em;color:' + totColor + '">' + totCap + ' / ' + totOpen + '</span>' +
              '<span style="font-size:11px;color:#94a3b8">Cap / Open · ' + totPct + '% full (' + totOcc + ' occ · ' + totAvail + ' avail · ' + totBlk + ' blk)</span>' +
            '</div>'
          : '';

        const ec = c.economyComfort;
        const economyComfortBar = ec
          ? '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:6px 10px;margin:8px 0 10px;border-radius:8px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.22);font-size:11.5px;color:#cbd5e1;">' +
              '<span><strong style="color:#7dd3fc">Economy Comfort:</strong> Empty Rows <strong>L ' + ec.emptyLeft + ' · M ' + ec.emptyMiddle + ' · R ' + ec.emptyRight + '</strong> <span style="color:#94a3b8">(' + ec.emptyRowsTotal + ' total)</span></span>' +
              '<span>Adjacent Spare: <strong>' + ec.adjacentSpareSeats + '</strong> seats</span>' +
              '<span>Window: <strong>' + ec.windowAvailable + '</strong> · Aisle: <strong>' + ec.aisleAvailable + '</strong></span>' +
            '</div>'
          : '';

        const efHtml = c.fareBuckets
          ? c.fareBuckets.raw.trim().split(/ +/).map(function(tok) {
              if (/^[JWY][0-9]+$/i.test(tok)) {
                return '<strong style="color:#38bdf8;background:rgba(56,189,248,0.18);padding:0 4px;border-radius:4px;">' + tok + '</strong>';
              }
              return '<span style="color:#94a3b8">' + tok + '</span>';
            }).join(' ')
          : '';
        const efTag = efHtml ? '<span class="pill" style="flex-wrap:wrap;gap:3px;">EF: ' + efHtml + '</span>' : '';
        const dr = c.disruptionRisk;
        const riskClass = dr && dr.level === "high" ? "score-red" : dr && dr.level === "moderate" ? "score-amber" : "score-green";
        const riskPill = dr ? '<span class="score-badge ' + riskClass + '" style="margin-left:6px;">RISK: ' + dr.level.toUpperCase() + '</span>' : '';
        const riskNotes = (dr && dr.signals && dr.signals.length > 0)
          ? '<div class="subtitle" style="margin-top:6px;"><strong>Predictive Signals:</strong> ' + dr.signals.join(' · ') + '</div>'
          : '';

        const statusBadgesHtml = totCap > 0
          ? '<div style="display:flex;align-items:center;"><span class="score-badge ' + badgeClass(c.readiness) + '" title="Standby Score: ' + c.standbyScore + '/100">' + badgeText(c.readiness, c.standbyScore) + '</span>' + riskPill + '</div>'
          : '<div style="display:flex;align-items:center;"><span class="pill" style="color:' + (c.fareBuckets ? '#7dd3fc' : '#94a3b8') + ';border-color:' + (c.fareBuckets ? 'rgba(56,189,248,0.4)' : 'rgba(148,163,184,0.3)') + ';background:' + (c.fareBuckets ? 'rgba(56,189,248,0.12)' : 'rgba(148,163,184,0.12)') + ';">' + (c.fareBuckets ? 'BUCKETS ONLY' : 'PENDING DATA') + '</span></div>';

        const isLoadingSm = pendingSeatmapKeys.has(c.flightKey);
        const loadSeatmapBtn = totCap === 0
          ? '<button class="btn-ghost" onclick="loadSingleSeatmap(' + idx + ')" ' + (isLoadingSm ? 'disabled' : '') + '>' + (isLoadingSm ? 'Loading Seat Map...' : 'Load Seat Map') + '</button>'
          : '<button class="btn-ghost" onclick="openSeatmap(\\'' + c.flightKey + '\\', \\'' + c.flightNumber + '\\')">Seat Map</button>';

        return '<div class="flight-card">' +
          '<div class="flight-top">' +
            '<div class="flight-title">' +
              '<span class="flight-num">' + c.flightNumber + '</span>' +
              '<span class="route-meta">' + c.origin + ' → ' + c.destination + ' · ' + c.departureTime + '–' + c.arrivalTime + ' (' + c.duration + ') · ' + c.aircraft + '</span>' +
              efTag +
            '</div>' +
            flightTotalsPill +
            statusBadgesHtml +
          '</div>' +
          '<div class="cabins-grid">' + cabins + '</div>' +
          economyComfortBar +
          riskNotes +
          '<div class="actions-row">' +
            loadSeatmapBtn +
            '<button class="btn-ghost btn-watch ' + (c.watched ? 'active' : '') + '" onclick="toggleWatch(' + idx + ')">' + (c.watched ? 'Watching ✓' : '+ Watch Flight') + '</button>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    async function loadSingleSeatmap(idx) {
      const c = latestCandidates[idx];
      if (!c) return;
      const targetCabin = document.getElementById("targetCabin").value;
      const date = c.departureDate || document.getElementById("date").value;
      pendingSeatmapKeys.add(c.flightKey);
      searchStartedAt = Date.now();
      renderCandidates(targetCabin);
      try {
        await fetch("/api/expertflyer/seatmap-trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flightKey: c.flightKey })
        });
      } catch (e) {}
      startEfPolling(date, targetCabin);
    }

    async function toggleWatch(idx) {
      const c = latestCandidates[idx];
      if (!c) return;
      const fk = c.flightKey;
      const targetCabin = document.getElementById("targetCabin").value;
      const efInput = document.getElementById("ef-" + idx);
      const efBuckets = efInput ? efInput.value : null;

      if (c.watched) {
        await fetch("/api/watches/" + encodeURIComponent(fk), { method: "DELETE" });
        c.watched = false;
        const live = latestCandidates.find(function(x) { return x.flightKey === fk; });
        if (live) live.watched = false;
      } else {
        const res = await fetch("/api/watches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate: c,
            targetCabin,
            efBuckets,
            seatmapAlreadyRequested: pendingSeatmapKeys.has(fk)
          })
        });
        const data = await res.json().catch(function() { return {}; });
        c.watched = true;
        const live = latestCandidates.find(function(x) { return x.flightKey === fk; });
        if (live) live.watched = true;
        if (data.seatmapTriggered) {
          pendingSeatmapKeys.add(fk);
          searchStartedAt = Date.now();
          startEfPolling(c.departureDate || document.getElementById("date").value, targetCabin);
        }
        if (data.seatmapTriggered || data.seatmapAlreadyRequested || pendingSeatmapKeys.has(fk)) {
          startWatchSeatmapPolling(fk);
        }
      }
      renderCandidates(targetCabin);
      saveSearchState();
      loadWatches();
    }

    const pendingWatchKeys = new Set();
    let watchPollTimer = null;
    function startWatchSeatmapPolling(flightKey) {
      if (flightKey) pendingWatchKeys.add(flightKey);
      if (watchPollTimer) return;
      let ticks = 0;
      watchPollTimer = setInterval(async function() {
        ticks += 1;
        await loadWatches();
        if (pendingWatchKeys.size === 0 || ticks >= 25) {
          clearInterval(watchPollTimer);
          watchPollTimer = null;
        }
      }, 6000);
    }

    async function addManualWatch() {
      const flight = document.getElementById("mwFlight").value.trim().toUpperCase();
      const origin = document.getElementById("mwOrigin").value.trim().toUpperCase();
      const destination = document.getElementById("mwDest").value.trim().toUpperCase();
      const departureDate = document.getElementById("mwDate").value || document.getElementById("date").value;
      const targetCabin = document.getElementById("targetCabin").value;
      if (!flight || !origin || !destination || !departureDate) {
        alert("Enter flight (e.g. BA292), origin, destination, and date.");
        return;
      }
      const res = await fetch("/api/watches/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flight, origin, destination, departureDate, targetCabin })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to add watch");
        return;
      }
      document.getElementById("mwFlight").value = "";
      if (data.flightKey && data.seatmapTriggered) {
        startWatchSeatmapPolling(data.flightKey);
      }
      loadWatches();
    }

    async function savePushTopic(sendTest) {
      var input = document.getElementById("ntfyTopic");
      var topic = input ? input.value.trim() : "";
      if (sendTest && !topic) {
        alert("Enter a ntfy.sh topic name first (e.g. standby-ba-alerts), then subscribe to it in the ntfy app or at https://ntfy.sh/" );
        return;
      }
      var res = await fetch("/api/settings/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ntfyTopic: topic, test: Boolean(sendTest) })
      });
      var data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save push topic");
        return;
      }
      if (sendTest) {
        alert(data.testSent ? "Test push sent to ntfy.sh/" + topic : "Saved topic, but test push failed.");
      } else {
        alert(topic ? "Push topic saved: ntfy.sh/" + topic : "Push topic cleared.");
      }
    }

    let latestWatches = [];

    async function saveWatchSeat(flightKey, clearSeat) {
      var seatVal = "";
      if (!clearSeat) {
        var inp = document.getElementById("seat-" + flightKey);
        seatVal = inp ? inp.value.trim().toUpperCase() : "";
        if (!seatVal) return;
      }
      var res = await fetch("/api/watches/" + encodeURIComponent(flightKey) + "/seat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedSeat: seatVal || null })
      });
      var data = await res.json();
      if (!res.ok) {
        alert(data.error || "Invalid seat (e.g. 72A)");
        return;
      }
      loadWatches();
    }

    async function toggleStageAlert(flightKey, stageKey, nextVal) {
      var payload = {};
      payload[stageKey] = nextVal;
      var res = await fetch("/api/watches/" + encodeURIComponent(flightKey) + "/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        loadWatches();
      }
    }

    async function toggleAllAlerts(flightKey, enableAll) {
      var payload = {
        etd: enableAll,
        taxiing: enableAll,
        enroute: enableAll,
        landed: enableAll,
        disruption: enableAll,
        diversion: enableAll
      };
      var res = await fetch("/api/watches/" + encodeURIComponent(flightKey) + "/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        loadWatches();
      }
    }

    function toggleAlertMenu(flightKey) {
      var el = document.getElementById("alert-menu-" + flightKey);
      if (!el) return;
      el.style.display = (el.style.display === "none" || !el.style.display) ? "flex" : "none";
    }

    async function triggerEfSync() {
      var btn = document.getElementById("efRefreshBtn");
      if (btn) { btn.disabled = true; btn.textContent = "Syncing EF..."; }
      try {
        var res = await fetch("/api/expertflyer/trigger", { method: "POST" });
        var data = await res.json();
        if (res.ok && data.ok) {
          alert(data.message || "ExpertFlyer sync triggered! Seat maps will refresh in ~1-2 minutes.");
        } else if (data.fallbackUrl) {
          if (confirm((data.error || "GitHub token not set on Worker.") + "\\n\\nOpen GitHub Actions to click Run workflow manually?")) {
            window.open(data.fallbackUrl, "_blank", "noopener,noreferrer");
          }
        } else {
          alert(data.error || "Failed to trigger ExpertFlyer sync");
        }
      } catch (e) {
        alert("Failed to trigger ExpertFlyer sync");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Refresh EF"; }
      }
    }

    async function loadWatches() {
      const box = document.getElementById("watchesList");
      const res = await fetch("/api/watches");
      const data = await res.json();
      const topicEl = document.getElementById("ntfyTopic");
      if (topicEl && typeof data.ntfyTopic === "string" && document.activeElement !== topicEl) {
        topicEl.value = data.ntfyTopic;
      }
      const watches = data.watches || [];
      latestWatches = watches;
      const watchedKeys = new Set(watches.map(function(w) { return w.flight_key; }));
      let watchSyncChanged = false;
      for (let ci = 0; ci < latestCandidates.length; ci++) {
        const isW = watchedKeys.has(latestCandidates[ci].flightKey);
        if (Boolean(latestCandidates[ci].watched) !== isW) {
          latestCandidates[ci].watched = isW;
          watchSyncChanged = true;
        }
      }
      if (watchSyncChanged && latestCandidates.length > 0) {
        renderCandidates(document.getElementById("targetCabin").value);
        saveSearchState();
      }
      for (var wi = 0; wi < watches.length; wi++) {
        var ww = watches[wi];
        if (ww && (ww.lastSeatmapAt || (ww.cabinLoads && ww.cabinLoads.length > 0))) {
          pendingWatchKeys.delete(ww.flight_key);
        }
      }
      if (watches.length === 0) {
        box.innerHTML = '<span class="subtitle">No flights watched yet. Click <strong>+ Watch Flight</strong> on any search result to track T-24h seat-fill velocity and receive alerts.</span>';
        return;
      }
      function fmtUtcTime(iso) {
        if (!iso) return '?';
        var m = String(iso).match(/T([0-9]{2}:[0-9]{2})/);
        return m ? m[1] + 'Z' : String(iso);
      }
      var AIRPORT_TZ = {
        IAD: 'America/New_York', DCA: 'America/New_York', BWI: 'America/New_York',
        JFK: 'America/New_York', EWR: 'America/New_York', BOS: 'America/New_York',
        MIA: 'America/New_York', ATL: 'America/New_York', CLT: 'America/New_York',
        ORD: 'America/Chicago', DFW: 'America/Chicago', IAH: 'America/Chicago',
        DEN: 'America/Denver', LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles',
        SEA: 'America/Los_Angeles', LHR: 'Europe/London', LGW: 'Europe/London',
        MAN: 'Europe/London', EDI: 'Europe/London', DUB: 'Europe/Dublin'
      };
      function fmtLocalTime(iso, tz, airportCode) {
        if (!iso) return '?';
        var zone = tz || (airportCode ? AIRPORT_TZ[String(airportCode).toUpperCase()] : '') || '';
        if (!zone) return fmtUtcTime(iso);
        try {
          var d = new Date(iso);
          if (isNaN(d.getTime())) return fmtUtcTime(iso);
          return new Intl.DateTimeFormat('en-GB', {
            timeZone: zone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(d);
        } catch (e) {
          return fmtUtcTime(iso);
        }
      }
      function fmtMinsCountdown(mins) {
        if (mins === null || mins === undefined) return '';
        if (mins <= 0) return 'due now';
        if (mins < 60) return 'in ' + mins + 'm';
        return 'in ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
      }
      function liveMinsFromIso(iso, fallbackMins) {
        if (!iso) return fallbackMins;
        var ms = new Date(iso).getTime();
        if (isNaN(ms)) return fallbackMins;
        return Math.round((ms - Date.now()) / 60000);
      }
      function stageBadge(inb, estTxt) {
        var st = inb.stage || 'scheduled';
        var turnTxt = inb.turnaroundMins !== null && inb.turnaroundMins !== undefined ? inb.turnaroundMins + 'm turn' : '';
        if (st === 'cancelled') {
          return { cls: 'score-red', text: 'Cancelled' };
        }
        if (st === 'diverted') {
          return { cls: 'score-red', text: 'Diverted' };
        }
        if (st === 'parked') {
          return { cls: 'score-blue', text: 'Parked at Gate ' + estTxt + (turnTxt ? ' · ' + turnTxt : '') };
        }
        if (st === 'landed') {
          return { cls: 'score-blue', text: 'Landed (Runway) ' + estTxt + (turnTxt ? ' · ' + turnTxt : '') };
        }
        if (st === 'taxiing') {
          var taxiLabel = (inb.taxiMins !== null && inb.taxiMins !== undefined && inb.taxiMins <= 4) ? 'Pushback' : 'Taxiing';
          var taxiTxt = inb.taxiMins !== null && inb.taxiMins !== undefined ? ' (' + inb.taxiMins + 'm)' : '';
          if (inb.delayMins >= 15) {
            return { cls: 'score-amber', text: taxiLabel + taxiTxt + ' · +' + inb.delayMins + 'm' };
          }
          return { cls: 'score-blue', text: taxiLabel + taxiTxt };
        }
        if (st === 'enroute') {
          var arrCd = (inb.arriveInMins !== null && inb.arriveInMins !== undefined && inb.arriveInMins > 0) ? ' · ' + fmtMinsCountdown(inb.arriveInMins) : '';
          if (inb.delayMins >= 15) {
            return { cls: 'score-amber', text: 'Enroute · +' + inb.delayMins + 'm delayed' + arrCd + (turnTxt ? ' (' + turnTxt + ')' : '') };
          }
          return { cls: 'score-green', text: 'Enroute · On time' + arrCd + (turnTxt ? ' (' + turnTxt + ')' : '') };
        }
        var depIso = inb.estimatedDeparture || inb.scheduledDeparture || '';
        var etdTxt = fmtUtcTime(depIso);
        var minsLeft = liveMinsFromIso(depIso, inb.departInMins);
        var cd = fmtMinsCountdown(minsLeft);
        var cdHtml = cd ? '<span class="inb-cd" data-iso="' + depIso + '">' + cd + '</span>' : '';
        var extra = [];
        if (cdHtml) extra.push(cdHtml);
        if (inb.delayMins >= 15) extra.push('+' + inb.delayMins + 'm delayed');
        var label = 'At Gate · ETD ' + etdTxt + (extra.length ? ' (' + extra.join(', ') + ')' : '');
        return { cls: inb.delayMins >= 15 ? 'score-amber' : 'score-slate', text: label };
      }
      function renderAlertToggles(w) {
        var a = w.alertStages || { etd: true, taxiing: true, enroute: true, landed: true, disruption: true, diversion: true };
        var stages = [
          { key: 'etd', label: 'ETD' },
          { key: 'taxiing', label: 'Taxi' },
          { key: 'enroute', label: 'E/R' },
          { key: 'landed', label: 'Land' },
          { key: 'disruption', label: 'DLA' },
          { key: 'diversion', label: 'Divert' }
        ];
        var onCount = stages.filter(function(s) { return a[s.key] !== false; }).length;
        var allOn = onCount === stages.length;
        var customLabel = allOn ? 'Custom ▾' : ('Custom (' + onCount + '/' + stages.length + ') ▾');
        var checkboxes = stages.map(function(s) {
          var isOn = a[s.key] !== false;
          return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:#cbd5e1;cursor:pointer;margin:0;">' +
            '<input type="checkbox" ' + (isOn ? 'checked' : '') + ' onchange="toggleStageAlert(\\'' + w.flight_key + '\\', \\'' + s.key + '\\', this.checked)" style="width:auto;margin:0;accent-color:#38bdf8;" />' +
            s.label + '</label>';
        }).join('');
        return '<div style="margin-top:4px;position:relative;">' +
          '<span style="font-size:10px;color:#64748b;margin-right:4px">Alerts:</span>' +
          '<button type="button" class="stage-pill ' + (allOn ? 'on' : '') + '" onclick="toggleAllAlerts(\\'' + w.flight_key + '\\', ' + (!allOn) + ')">' + (allOn ? '🔔 ' : '') + 'ALL</button>' +
          '<button type="button" class="stage-pill ' + (!allOn && onCount > 0 ? 'on' : '') + '" onclick="toggleAlertMenu(\\'' + w.flight_key + '\\')">' + customLabel + '</button>' +
          '<div id="alert-menu-' + w.flight_key + '" style="display:none;flex-wrap:wrap;gap:8px;margin-top:5px;padding:6px 8px;border-radius:7px;background:rgba(15,23,42,0.92);border:1px solid rgba(56,189,248,0.35);">' +
            checkboxes +
          '</div>' +
        '</div>';
      }
      function renderInboundCell(w) {
        var inb = w.inbound;
        var fallbackFr24 = 'https://www.flightradar24.com/' + encodeURIComponent(w.flight_number || '');
        if (!inb) {
          return '<div style="font-size:12px;color:#64748b">Not yet assigned (check inside T-24h)</div>' +
            '<div style="margin-top:3px"><a href="' + fallbackFr24 + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none">FR24 ↗</a></div>' +
            renderAlertToggles(w);
        }
        var routeTxt = (inb.origin || '?') + ' → ' + (inb.destination || '?');
        var regTxt = inb.registration ? ' <span style="color:#94a3b8">(' + inb.registration + ')</span>' : '';
        var depTxt = inb.estimatedDeparture ? (inb.hasDeparted ? 'Dep ' : 'ETD ') + fmtUtcTime(inb.estimatedDeparture) + ' · ' : '';
        var estTxt = fmtLocalTime(inb.estimatedArrival || inb.scheduledArrival, inb.destinationTimezone, inb.destination);
        var schedTxt = fmtLocalTime(inb.scheduledArrival, inb.destinationTimezone, inb.destination);
        var delayTxt = inb.delayMins > 0 ? ' <span style="color:#f87171">(+' + inb.delayMins + 'm)</span>' : '';
        var sb = stageBadge(inb, estTxt);
        var sc = inb.surfaceCongestion;
        var congHtml = sc
          ? '<div style="font-size:10px;margin-top:2px;color:' + (sc.level === 'heavy' ? '#f87171' : sc.level === 'moderate' ? '#fbbf24' : '#4ade80') + '">🛫 ' + sc.summary + '</div>'
          : '';
        var ac = inb.arrivalCongestion;
        var arrCongHtml = ac
          ? '<div style="font-size:10px;margin-top:2px;color:' + (ac.level === 'heavy' ? '#f87171' : ac.level === 'moderate' ? '#fbbf24' : '#4ade80') + '">🛬 ' + ac.summary + '</div>'
          : '';
        var impactNote = (inb.outboundImpact === 'high' || inb.outboundImpact === 'watch')
          ? '<div style="font-size:10px;color:' + (inb.outboundImpact === 'high' ? '#f87171' : '#fbbf24') + ';margin-top:2px">⚠ ' + (inb.impactSummary || '') + '</div>'
          : '';
        var links = '';
        if (inb.flightRadarUrl) {
          if (inb.adsbLive) {
            links += '<a href="' + inb.flightRadarUrl + '" target="_blank" rel="noopener noreferrer" title="ADS-B live — open FlightRadar24 live tracker" style="font-size:11px;color:#38bdf8;text-decoration:none;margin-right:8px"><span style="color:#4ade80">●</span> FR24 Live ↗</a>';
          } else {
            var fr24SchedUrl = 'https://www.flightradar24.com/data/flights/' + encodeURIComponent(String(inb.inboundFlight || '').toLowerCase());
            links += '<a href="' + fr24SchedUrl + '" target="_blank" rel="noopener noreferrer" title="ADS-B not yet live — opens FR24 flight schedule/history" style="font-size:11px;color:#64748b;text-decoration:none;margin-right:8px">○ FR24 (ADS-B offline) ↗</a>';
          }
        }
        if (inb.flightAwareUrl) {
          links += '<a href="' + inb.flightAwareUrl + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none">FA ↗</a>';
        }
        return '<div style="font-size:12px"><strong>' + inb.inboundFlight + '</strong> ' + routeTxt + regTxt + '</div>' +
          '<div style="font-size:11px;color:#cbd5e1;margin-top:2px">' + depTxt + 'ETA ' + estTxt + (estTxt !== schedTxt ? ' <span style="color:#64748b">(Sched ' + schedTxt + ')</span>' : '') + delayTxt + '</div>' +
          '<div style="margin-top:3px"><span class="score-badge ' + sb.cls + '" style="font-size:10px;padding:2px 6px">' + sb.text + '</span></div>' +
          congHtml +
          arrCongHtml +
          impactNote +
          (links ? '<div style="margin-top:3px">' + links + '</div>' : '') +
          renderAlertToggles(w);
      }
      function renderSeatCell(w) {
        if (!w.assigned_seat) {
          var unseatedHtml = '';
          if (w.last_seat_state) {
            try {
              var st = JSON.parse(w.last_seat_state);
              if (st && st.unseatedFrom) {
                unseatedHtml = '<div style="margin-top:4px;">' +
                  '<span class="pill" style="padding:1px 6px;font-size:10px;color:#fbbf24;border-color:rgba(251,191,36,0.5);background:rgba(251,191,36,0.12);" title="Your previous seat ' + st.unseatedFrom + ' became ' + (st.unseatedStatus || 'open') + '">No seat · was ' + st.unseatedFrom + '</span>' +
                '</div>';
              }
            } catch (e) {}
          }
          return unseatedHtml + '<div style="margin-top:4px;display:flex;gap:4px;align-items:center;">' +
            '<input id="seat-' + w.flight_key + '" type="text" placeholder="' + (unseatedHtml ? 'New seat' : 'Seat') + '" maxlength="4" style="width:62px;padding:2px 6px;font-size:11px;text-transform:uppercase;" />' +
            '<button type="button" class="btn-ghost" style="padding:2px 6px;font-size:10px;" onclick="saveWatchSeat(\\'' + w.flight_key + '\\', false)">Set</button>' +
          '</div>';
        }
        var sm = w.seatMonitor;
        var rowHtml = '';
        if (sm && sm.sectionSeats) {
          var pills = sm.sectionSeats.map(function(s) {
            var isMe = s.seat === sm.seat;
            var col = isMe ? '#facc15' : (s.status === 'occupied' ? '#93c5fd' : (s.status === 'blocked' ? '#94a3b8' : '#86efac'));
            var bg = isMe ? 'rgba(250,204,21,0.18)' : 'rgba(15,23,42,0.55)';
            var brd = isMe ? 'rgba(250,204,21,0.75)' : 'rgba(148,163,184,0.25)';
            var tag = isMe ? (s.status === 'occupied' ? 'you' : 'you*') : (s.status === 'occupied' ? 'occ' : (s.status === 'blocked' ? 'blk' : 'open'));
            return '<span style="font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid ' + brd + ';background:' + bg + ';color:' + col + ';margin-right:3px;">' + s.seat + ':' + tag + '</span>';
          }).join('');
          var warn = '';
          if (sm.adjacentOccupied.length > 0) {
            warn = '<div style="font-size:10px;color:#fbbf24;margin-top:2px">⚠ ' + sm.adjacentOccupied.join(', ') + ' occupied next to you</div>';
          } else if (sm.rowOccupied.length > 0) {
            warn = '<div style="font-size:10px;color:#cbd5e1;margin-top:2px">' + sm.rowOccupied.join(', ') + ' occ · adjacent spare</div>';
          } else {
            warn = '<div style="font-size:10px;color:#4ade80;margin-top:2px">✓ Rest of row open</div>';
          }
          rowHtml = '<div style="margin-top:3px">' + pills + '</div>' + warn;
        }
        return '<div style="margin-top:4px;display:flex;align-items:center;gap:4px;">' +
          '<span class="pill" style="padding:1px 6px;font-size:10px;color:#facc15;border-color:rgba(250,204,21,0.5)">Seat ' + w.assigned_seat + '</span>' +
          '<button type="button" class="btn-ghost" style="padding:1px 5px;font-size:10px;" title="Clear seat" onclick="saveWatchSeat(\\'' + w.flight_key + '\\', true)">×</button>' +
        '</div>' + rowHtml;
      }
      function renderStatusCell(w) {
        var badge = '<span class="score-badge ' + badgeClass(w.last_status) + '" title="Standby Score: ' + (w.last_score ?? '?') + '/100">' + (w.last_status || 'pending').toUpperCase() + '</span>';
        var ft = w.flightTotalSummary;
        var loadHtml = '';
        if (ft && ft.total > 0) {
          var ftPct = Math.round((ft.occupied / ft.total) * 100);
          var ftCol = ftPct >= 88 ? '#f87171' : ftPct >= 70 ? '#fbbf24' : '#4ade80';
          loadHtml += '<div style="margin-top:4px;font-size:15px;font-weight:800;color:' + ftCol + '">' + ft.total + ' / ' + ft.open + '</div>' +
            '<div style="font-size:11px;color:#cbd5e1">' + ftPct + '% full</div>';
        }
        if (w.lastSeatmapAt) {
          loadHtml += '<div style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:2px">EF ' + String(w.lastSeatmapAt).slice(11, 16) + 'Z</div>';
        }
        return badge + loadHtml;
      }
      function renderCabinCell(w) {
        var loads = w.cabinLoads || [];
        var ec = w.economyComfort;
        if (loads.length === 0 && !ec) {
          return '<span style="color:#64748b">' + (w.target_cabin || '—') + '</span>';
        }
        var lines = loads.map(function(c) {
          var pct = c.total > 0 ? Math.round((c.occupied / c.total) * 100) : 0;
          var col = pct >= 88 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#4ade80';
          var boxStyle = c.preserved
            ? 'border:1px dashed rgba(251,191,36,0.7);border-radius:4px;padding:1px 4px;margin:1px -4px;background:rgba(251,191,36,0.08);'
            : '';
          var tip = c.preserved ? ' title="Seat map closed for ' + c.code + ' — showing last best-known numbers"' : '';
          return '<div' + tip + ' style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;line-height:1.45;white-space:nowrap;' + boxStyle + '">' +
            '<span style="color:#7dd3fc;font-weight:700;min-width:22px">' + c.bucket + '</span>' +
            '<strong style="color:' + col + '">' + c.total + '/' + c.open + '</strong>' +
          '</div>';
        }).join('');
        var comfortHtml = ec
          ? '<div style="margin-top:3px;border-top:1px solid rgba(148,163,184,0.18);padding-top:2px;font-size:10.5px;color:#94a3b8;font-style:italic;line-height:1.35;">' +
              '<div>Rows=' + ec.emptyRowsTotal + '</div>' +
              '<div>Seats=' + ec.adjacentSpareSeats + '</div>' +
            '</div>'
          : '';
        return '<div style="min-width:74px">' + lines + comfortHtml + '</div>';
      }
      function renderOutboundMeta(w) {
        var out = w.outbound;
        var base = w.departure_date + ' ' + (w.departure_time || '');
        if (!out) {
          return base + '<div style="margin-top:3px;font-size:10.5px;color:#64748b">Live FR24/FA tracking inside T-48h</div>';
        }
        var bits = [];
        if (out.gate) bits.push('<span class="pill" style="padding:1px 5px;font-size:10px;color:#7dd3fc">Gate ' + out.gate + '</span>');
        if (out.delayMins >= 15) {
          var estLocal = out.estimatedOut ? fmtLocalTime(out.estimatedOut, out.originTimezone, w.origin) : '';
          bits.push('<span style="color:#f87171;font-size:10px" title="Published FlightAware outbound departure delay">' + (estLocal ? 'Est ' + estLocal + ' ' : '') + '(+' + out.delayMins + 'm)</span>');
        }
        if (out.cancelled) bits.push('<span style="color:#f87171;font-size:10px;font-weight:700">CANCELLED</span>');
        var outFr24Live = out.adsbLive;
        var outFr24Url = outFr24Live && out.flightRadarUrl
          ? out.flightRadarUrl
          : 'https://www.flightradar24.com/data/flights/' + encodeURIComponent(String(w.flight_number || '').toLowerCase());
        var outFaUrl = out.flightAwareUrl || ('https://www.flightaware.com/live/flight/' + encodeURIComponent(String(w.flight_number || '').toUpperCase()));
        var outLinks = '<div style="margin-top:3px">' +
          (outFr24Live
            ? '<a href="' + outFr24Url + '" target="_blank" rel="noopener noreferrer" title="ADS-B live — open FlightRadar24 live tracker" style="font-size:11px;color:#38bdf8;text-decoration:none;margin-right:8px"><span style="color:#4ade80">●</span> FR24 Live ↗</a>'
            : '<a href="' + outFr24Url + '" target="_blank" rel="noopener noreferrer" title="ADS-B not yet live — opens FR24 flight schedule/history" style="font-size:11px;color:#64748b;text-decoration:none;margin-right:8px">○ FR24 (ADS-B offline) ↗</a>') +
          '<a href="' + outFaUrl + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none">FA ↗</a>' +
        '</div>';
        return base + (bits.length ? '<div style="margin-top:3px">' + bits.join(' ') + '</div>' : '') + outLinks;
      }
      function renderWatchRows(list) {
        var actBtnStyle = 'padding:4px 7px;font-size:11px;white-space:nowrap;';
        return list.map(function(w) {
          return '<tr>' +
            '<td data-label="Flight"><strong>' + w.flight_number + '</strong>' + renderSeatCell(w) + '</td>' +
            '<td data-label="Route">' + w.origin + ' → ' + w.destination + '</td>' +
            '<td data-label="Date">' + renderOutboundMeta(w) + '</td>' +
            '<td data-label="Cabin">' + renderCabinCell(w) + '</td>' +
            '<td data-label="Inbound Aircraft">' + renderInboundCell(w) + '</td>' +
            '<td data-label="Status">' + renderStatusCell(w) + '</td>' +
            '<td data-label="Actions"><div style="display:flex;flex-wrap:nowrap;gap:4px;">' +
              '<button class="btn-ghost" style="' + actBtnStyle + '" onclick="openGraph(\\'' + w.flight_key + '\\', \\'' + w.flight_number + '\\', \\'' + w.departure_date + '\\', \\'' + (w.departure_time || '') + '\\')">Graph</button>' +
              '<button class="btn-ghost" style="' + actBtnStyle + '" onclick="openSeatmap(\\'' + w.flight_key + '\\', \\'' + w.flight_number + '\\')">Seat Map</button>' +
              '<button class="btn-ghost" style="' + actBtnStyle + '" onclick="openHistory(\\'' + w.flight_key + '\\', \\'' + w.flight_number + '\\')">History</button>' +
              '<button class="btn-ghost" style="' + actBtnStyle + '" onclick="removeWatch(\\'' + w.flight_key + '\\')">Remove</button>' +
            '</div></td>' +
          '</tr>';
        }).join('');
      }
      var activeWatches = watches.filter(function(w) { return !w.archived; });
      var archivedWatches = watches.filter(function(w) { return Boolean(w.archived); });
      var thead = '<thead><tr><th>Flight</th><th>Route</th><th>Date</th><th>Cabin</th><th>Inbound Aircraft</th><th>Status</th><th>Actions</th></tr></thead>';
      var html = activeWatches.length > 0
        ? '<table class="watches-table">' + thead + '<tbody>' + renderWatchRows(activeWatches) + '</tbody></table>'
        : '<div class="subtitle">No active watched flights.</div>';
      if (archivedWatches.length > 0) {
        html += '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:12px;color:#94a3b8">Archived / Past Flights (' + archivedWatches.length + ' — full history &amp; graphs preserved)</summary>' +
          '<table class="watches-table" style="margin-top:8px">' + thead + '<tbody>' + renderWatchRows(archivedWatches) + '</tbody></table></details>';
      }
      box.innerHTML = html;
    }

    async function removeWatch(flightKey) {
      await fetch("/api/watches/" + encodeURIComponent(flightKey), { method: "DELETE" });
      loadWatches();
    }

    async function openHistory(flightKey, flightNum) {
      document.getElementById("historyTitle").textContent = flightNum + " — Seat Map Snapshots";
      document.getElementById("historyModal").classList.add("open");
      const res = await fetch("/api/history/" + encodeURIComponent(flightKey));
      const data = await res.json();
      const snaps = data.snapshots || [];
      if (snaps.length === 0) {
        document.getElementById("historyBody").innerHTML = '<p class="subtitle">No snapshots recorded yet. The Cron poller records seat counts every 30 minutes.</p>';
        return;
      }
      const fmtCab = (op, occ, blk) => (blk > 0 && op === 0) ? (op + ' <span style="opacity:.7">(+' + blk + 'b, ' + occ + 'occ)</span>') : (op + ' <span style="opacity:.7">(' + occ + 'occ)</span>');
      document.getElementById("historyBody").innerHTML = '<table><thead><tr><th>Time (UTC)</th><th>T-hrs</th><th>F</th><th>J</th><th>W</th><th>Y</th><th>Score</th></tr></thead><tbody>' +
        snaps.slice().reverse().map(s => '<tr>' +
          '<td>' + s.captured_at + '</td>' +
          '<td>' + (s.hours_to_departure != null ? s.hours_to_departure.toFixed(1) + 'h' : '—') + '</td>' +
          '<td>' + fmtCab(s.first_open, s.first_occupied, s.first_blocked) + '</td>' +
          '<td>' + fmtCab(s.business_open, s.business_occupied, s.business_blocked) + '</td>' +
          '<td>' + fmtCab(s.prem_econ_open, s.prem_econ_occupied, s.prem_econ_blocked) + '</td>' +
          '<td>' + fmtCab(s.economy_open, s.economy_occupied, s.economy_blocked) + '</td>' +
          '<td>' + s.score + ' (' + s.status + ')</td>' +
        '</tr>').join("") +
      '</tbody></table>';
    }

    function closeHistory() {
      document.getElementById("historyModal").classList.remove("open");
    }

    var graphState = { snaps: [], depDate: "", depTime: "", visible: { first: true, business: true, prem_econ: true, economy: true, emptyRows: true, adjSpare: true } };

    function closeGraph() {
      document.getElementById("graphModal").classList.remove("open");
    }

    function toggleGraphSeries(key) {
      graphState.visible[key] = !graphState.visible[key];
      renderGraphChart();
    }

    function renderGraphChart() {
      var snaps = graphState.snaps;
      var seriesDefs = [
        { key: "first", label: "First Open", color: "#c084fc", get: function(s) { return (s.first_open || 0) + (s.first_blocked || 0); } },
        { key: "business", label: "Business Open", color: "#f472b6", get: function(s) { return (s.business_open || 0) + (s.business_blocked || 0); } },
        { key: "prem_econ", label: "Prem Econ Open", color: "#fbbf24", get: function(s) { return (s.prem_econ_open || 0) + (s.prem_econ_blocked || 0); } },
        { key: "economy", label: "Economy Open", color: "#4ade80", get: function(s) { return (s.economy_open || 0) + (s.economy_blocked || 0); } },
        { key: "emptyRows", label: "Empty Rows (L+M+R)", color: "#38bdf8", get: function(s) { return s.empty_rows_total != null ? s.empty_rows_total : null; } },
        { key: "adjSpare", label: "Adjacent Spare", color: "#94a3b8", get: function(s) { return s.adjacent_spare != null ? s.adjacent_spare : null; } }
      ];
      document.getElementById("graphToggles").innerHTML = seriesDefs.map(function(sd) {
        var on = graphState.visible[sd.key];
        return '<button type="button" class="stage-pill ' + (on ? 'on' : '') + '" style="border-color:' + (on ? sd.color : 'rgba(148,163,184,0.28)') + ';color:' + (on ? sd.color : '#64748b') + '" onclick="toggleGraphSeries(\\'' + sd.key + '\\')">' + sd.label + '</button>';
      }).join("");

      if (!snaps || snaps.length === 0) {
        document.getElementById("graphBody").innerHTML = '<p class="subtitle">No snapshots recorded yet.</p>';
        return;
      }

      var maxY = 10;
      seriesDefs.forEach(function(sd) {
        if (!graphState.visible[sd.key]) return;
        snaps.forEach(function(s) {
          var v = sd.get(s);
          if (v !== null && v > maxY) maxY = v;
        });
      });
      maxY = Math.ceil(maxY * 1.1);

      var W = 700, H = 260, padL = 38, padR = 16, padT = 16, padB = 28;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var n = snaps.length;
      var xFor = function(i) { return n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW; };
      var yFor = function(v) { return padT + plotH - (v / maxY) * plotH; };

      var grid = '';
      for (var g = 0; g <= 4; g++) {
        var yVal = Math.round((maxY * g) / 4);
        var yy = yFor(yVal);
        grid += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="rgba(148,163,184,0.18)" stroke-dasharray="3,3" />';
        grid += '<text x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end" fill="#64748b" font-size="10">' + yVal + '</text>';
      }

      var paths = '';
      seriesDefs.forEach(function(sd) {
        if (!graphState.visible[sd.key]) return;
        var pts = [];
        var dots = '';
        snaps.forEach(function(s, i) {
          var v = sd.get(s);
          if (v === null) return;
          var x = xFor(i).toFixed(1), y = yFor(v).toFixed(1);
          pts.push(x + ',' + y);
          dots += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="' + sd.color + '"><title>' + sd.label + ': ' + v + ' at ' + s.captured_at + '</title></circle>';
        });
        if (pts.length >= 2) {
          paths += '<polyline fill="none" stroke="' + sd.color + '" stroke-width="2" points="' + pts.join(' ') + '" />';
        }
        paths += dots;
      });

      var xLabels = '';
      var step = Math.max(1, Math.floor(n / 5));
      for (var i = 0; i < n; i += step) {
        var lbl = String(snaps[i].captured_at || '').slice(11, 16) + 'Z';
        xLabels += '<text x="' + xFor(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" fill="#64748b" font-size="10">' + lbl + '</text>';
      }

      var closeIdx = -1;
      for (var ci = 0; ci < n; ci++) {
        var note = String(snaps[ci].raw_note || '');
        if (note.indexOf('(preserved ') !== -1) {
          closeIdx = ci;
          break;
        }
        if (ci > 0) {
          var prevY = (snaps[ci - 1].economy_open || 0) + (snaps[ci - 1].economy_blocked || 0) + (snaps[ci - 1].economy_occupied || 0);
          var curY = (snaps[ci].economy_open || 0) + (snaps[ci].economy_blocked || 0) + (snaps[ci].economy_occupied || 0);
          if (prevY > 0 && curY === 0) {
            closeIdx = ci;
            break;
          }
        }
      }

      var closeMarker = '';
      if (closeIdx >= 0) {
        var cx = xFor(closeIdx);
        var cTime = String(snaps[closeIdx].captured_at || '').slice(11, 16) + 'Z';
        var anchor = cx > W - 130 ? 'end' : 'start';
        var tx = anchor === 'end' ? cx - 4 : cx + 4;
        closeMarker = '<line x1="' + cx.toFixed(1) + '" y1="' + padT + '" x2="' + cx.toFixed(1) + '" y2="' + (padT + plotH) + '" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4,3"><title>Seatmap closed at ' + cTime + '</title></line>' +
          '<text x="' + tx.toFixed(1) + '" y="' + (padT + 11) + '" text-anchor="' + anchor + '" fill="#fbbf24" font-size="10" font-weight="700">Seatmap closed (' + cTime + ')</text>';
      }

      document.getElementById("graphBody").innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;background:rgba(2,6,23,0.45);border:1px solid var(--border);border-radius:8px;">' +
        grid + closeMarker + paths + xLabels + '</svg>';
    }

    async function openGraph(flightKey, flightNum, depDate, depTime) {
      document.getElementById("graphTitle").textContent = flightNum + " — Seat Availability Over Time";
      document.getElementById("graphMeta").textContent = "Loading snapshots...";
      document.getElementById("graphModal").classList.add("open");
      var res = await fetch("/api/history/" + encodeURIComponent(flightKey));
      var data = await res.json();
      var snaps = data.snapshots || [];
      graphState.snaps = snaps;
      graphState.depDate = depDate;
      graphState.depTime = depTime;
      if (snaps.length > 0) {
        var lastSnap = snaps[snaps.length - 1];
        var lastIso = String(lastSnap.captured_at || '').replace(' ', 'T') + 'Z';
        var lastMs = new Date(lastIso).getTime();
        var schedIso = depDate ? (depDate + 'T' + (depTime || '18:00') + ':00Z') : '';
        var schedMs = schedIso ? new Date(schedIso).getTime() : NaN;
        var diffNote = (!isNaN(lastMs) && !isNaN(schedMs))
          ? ' (' + Math.round((schedMs - lastMs) / 60000) + 'm before ' + (depTime || '18:00') + ' sched)'
          : '';
        document.getElementById("graphMeta").textContent =
          "Snapshots: " + snaps.length + " · Last seat map: " + lastSnap.captured_at + " UTC" + diffNote;
      } else {
        document.getElementById("graphMeta").textContent = "No snapshots recorded yet.";
      }
      renderGraphChart();
    }

    async function openSeatmap(flightKey, flightNum) {
      document.getElementById("seatmapTitle").textContent = flightNum + " — Loading Seat Map...";
      document.getElementById("seatmapBody").innerHTML = '<p class="subtitle">Loading cached ExpertFlyer seat map...</p>';
      document.getElementById("seatmapModal").classList.add("open");
      const res = await fetch("/api/seatmap/" + encodeURIComponent(flightKey));
      const data = await res.json();
      if (!res.ok || !data.seatmap || !data.seatmap.sections) {
        document.getElementById("seatmapTitle").textContent = flightNum + " — Seat Map";
        document.getElementById("seatmapBody").innerHTML = '<p class="subtitle">' + (data.error || "No graphical seat map cached yet. It will populate on the next 15-minute ExpertFlyer sync.") + '</p>';
        return;
      }
      const watchMatch = latestWatches.find(function(x) { return x.flight_key === flightKey; });
      const mySeat = watchMatch && watchMatch.assigned_seat ? watchMatch.assigned_seat.toUpperCase() : '';
      document.getElementById("seatmapTitle").textContent = flightNum + (data.aircraft ? " (" + data.aircraft + ")" : "") + (mySeat ? " · My Seat " + mySeat : "") + " — Captured " + (data.captured_at || "") + " UTC";
      const cabinNames = { first: "First (F)", business: "Business / Club (J)", prem_econ: "Premium Economy (W)", economy: "Economy (Y)" };
      const personSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
      document.getElementById("seatmapBody").innerHTML = data.seatmap.sections.map(function(sec) {
        const rowsHtml = (sec.rows || []).map(function(row) {
          const parts = [];
          let curGroup = [];
          const flushGroup = function() {
            if (curGroup.length === 0) return;
            const isFreeRow = curGroup.every(function(c) { return c.s === "a" || c.s === "b"; });
            const groupHtml = curGroup.map(function(cell) {
              const seatLabel = String(row.n) + String(cell.l || "").toUpperCase();
              const isMine = mySeat && seatLabel === mySeat;
              const statusName = cell.s === "a" ? (cell.p ? "Available (Paid/Pref)" : "Available") : (cell.s === "o" ? "Occupied" : "Blocked");
              const cls = cell.s === "a" ? (cell.p ? "sm-seat sm-p" : "sm-seat sm-a") : (cell.s === "o" ? "sm-seat sm-o" : "sm-seat sm-b");
              const txt = cell.s === "o" ? personSvg : (cell.s === "b" ? "X" : (cell.l || ""));
              const mineStyle = isMine ? ' style="box-shadow:0 0 0 2px #facc15;border-color:#facc15;"' : '';
              return '<span class="' + cls + '"' + mineStyle + ' title="Seat ' + seatLabel + (isMine ? ' (YOUR SEAT)' : '') + ' — ' + statusName + '">' + txt + '</span>';
            }).join("");
            parts.push('<span class="sm-group' + (isFreeRow ? ' free-row' : '') + '">' + groupHtml + '</span>');
            curGroup = [];
          };
          (row.seats || []).forEach(function(cell) {
            if (cell.t === "s") {
              curGroup.push(cell);
            } else {
              flushGroup();
              parts.push('<span class="sm-aisle"></span>');
            }
          });
          flushGroup();
          const cells = parts.join("");
          const exL = row.el ? '<span class="sm-exit">EXIT</span>' : '';
          const exR = row.er ? '<span class="sm-exit">EXIT</span>' : '';
          const wingTag = row.w ? '<span style="font-size:0.65rem;color:#38bdf8;margin-left:4px;">W</span>' : '';
          return '<div class="sm-row"><span class="sm-rownum">' + row.n + '</span>' + exL + cells + exR + wingTag + '</div>';
        }).join("");
        const counts = (sec.rows || []).reduce(function(acc, r) {
          (r.seats || []).forEach(function(c) {
            if (c.t !== "s") return;
            acc.t++;
            if (c.s === "a") acc.a++;
            else if (c.s === "o") acc.o++;
            else if (c.s === "b") acc.b++;
          });
          return acc;
        }, { a: 0, o: 0, b: 0, t: 0 });
        const ec = (sec.cabin === "economy" && data.economyComfort) ? data.economyComfort : null;
        const ecBanner = ec
          ? '<div style="font-size:0.75rem;color:#7dd3fc;margin-bottom:8px;padding:5px 8px;border-radius:6px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.22);">' +
              'Empty Rows: <strong>L ' + ec.emptyLeft + ' · M ' + ec.emptyMiddle + ' · R ' + ec.emptyRight + '</strong> (' + ec.emptyRowsTotal + ' total) · ' +
              'Adjacent Spare: <strong>' + ec.adjacentSpareSeats + '</strong> · ' +
              'Window: <strong>' + ec.windowAvailable + '</strong> · Aisle: <strong>' + ec.aisleAvailable + '</strong>' +
            '</div>'
          : '';
        return '<div class="sm-cabin">' +
          '<div class="sm-cabin-title"><span>' + (cabinNames[sec.cabin] || sec.code) + '</span>' +
          '<span style="font-size:0.78rem;color:var(--muted)">' + (counts.a + counts.b) + ' open (' + counts.a + ' avail, ' + counts.b + ' blk) · ' + counts.o + ' occ (' + counts.t + ' total)</span></div>' +
          ecBanner +
          '<div style="overflow-x:auto">' + rowsHtml + '</div>' +
        '</div>';
      }).join("");
    }

    function closeSeatmap() {
      document.getElementById("seatmapModal").classList.remove("open");
    }

    async function checkMode() {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        const modeBadge = document.getElementById("modeBadge");
        if (data.mode === "live") {
          modeBadge.className = "pill live";
          modeBadge.textContent = "LIVE API (Duffel + FlightAware)";
        } else {
          modeBadge.className = "pill demo";
          modeBadge.textContent = "DEMO MODE (Add API keys for live data)";
        }
      } catch {}
    }

    const AIRLINE_OPTIONS = [
      { code: "BA", name: "British Airways" },
      { code: "VS", name: "Virgin Atlantic" },
      { code: "AA", name: "American Airlines" }
    ];

    function getSelectedAirlines() {
      const raw = document.getElementById("airlines").value || "BA,VS";
      const list = raw.split(",").map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean);
      return list.length > 0 ? list : ["BA", "VS"];
    }

    function setSelectedAirlines(rawOrList) {
      const list = Array.isArray(rawOrList)
        ? rawOrList
        : String(rawOrList || "BA,VS").split(",").map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean);
      const valid = list.length > 0 ? list : ["BA", "VS"];
      document.getElementById("airlines").value = valid.join(",");
      const lbl = document.getElementById("airlinesBtnLabel");
      if (lbl) {
        if (valid.length === AIRLINE_OPTIONS.length) lbl.textContent = valid.join(", ") + " (All)";
        else if (valid.length === 1) lbl.textContent = valid[0] + " only";
        else lbl.textContent = valid.join(", ");
      }
      renderAirlinesMenu();
    }

    function renderAirlinesMenu() {
      const box = document.getElementById("airlinesOptions");
      if (!box) return;
      const sel = new Set(getSelectedAirlines());
      box.innerHTML = AIRLINE_OPTIONS.map(function(opt) {
        const checked = sel.has(opt.code) ? "checked" : "";
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 4px;border-radius:6px;">' +
          '<label style="display:flex;align-items:center;gap:7px;margin:0;text-transform:none;letter-spacing:0;font-size:12.5px;color:#e2e8f0;cursor:pointer;flex:1;">' +
            '<input type="checkbox" ' + checked + ' onchange="toggleAirlineCode(\\'' + opt.code + '\\', this.checked)" style="width:auto;margin:0;cursor:pointer;" />' +
            '<span><strong>' + opt.code + '</strong> · ' + opt.name + '</span>' +
          '</label>' +
          '<button type="button" class="btn-ghost" onclick="selectOnlyAirline(\\'' + opt.code + '\\', event)" style="padding:1px 7px;font-size:10.5px;color:#7dd3fc;">only</button>' +
        '</div>';
      }).join("");
    }

    function toggleAirlineCode(code, isChecked) {
      const cur = new Set(getSelectedAirlines());
      if (isChecked) cur.add(code);
      else if (cur.size > 1) cur.delete(code);
      setSelectedAirlines(Array.from(cur));
    }

    function selectOnlyAirline(code, e) {
      if (e) e.stopPropagation();
      setSelectedAirlines([code]);
      closeAirlinesMenu();
    }

    function selectAllAirlines() {
      setSelectedAirlines(AIRLINE_OPTIONS.map(function(o) { return o.code; }));
    }

    function toggleAirlinesMenu(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById("airlinesMenu");
      if (!menu) return;
      const open = menu.style.display === "block";
      menu.style.display = open ? "none" : "block";
      if (!open) renderAirlinesMenu();
    }

    function closeAirlinesMenu() {
      const menu = document.getElementById("airlinesMenu");
      if (menu) menu.style.display = "none";
    }

    document.addEventListener("click", function(e) {
      const wrap = document.getElementById("airlinesWrap");
      if (wrap && !wrap.contains(e.target)) closeAirlinesMenu();
    });

    function restoreSearchState() {
      try {
        const savedInputs = localStorage.getItem("standby_last_search_inputs");
        if (savedInputs) {
          const inp = JSON.parse(savedInputs);
          if (inp.origins) document.getElementById("origins").value = inp.origins;
          if (inp.destinations) document.getElementById("destinations").value = inp.destinations;
          if (inp.date) document.getElementById("date").value = inp.date;
          if (inp.airlines) setSelectedAirlines(inp.airlines);
          if (inp.targetCabin) document.getElementById("targetCabin").value = inp.targetCabin;
        }
        renderAirlinesMenu();
        const savedData = localStorage.getItem("standby_last_search_data");
        if (savedData) {
          const sd = JSON.parse(savedData);
          if (Array.isArray(sd.candidates) && sd.candidates.length > 0) {
            latestCandidates = sd.candidates;
            searchStartedAt = sd.startedAt || Date.now();
            document.getElementById("resultsSection").style.display = "block";
            document.getElementById("resultsMeta").textContent = sd.metaText || (sd.candidates.length + " flight(s)");
            renderCandidates(sd.targetCabin || "economy");
            startEfPolling(sd.date || document.getElementById("date").value, sd.targetCabin || "economy");
          }
        }
      } catch (e) {}
    }

    document.getElementById("searchForm").addEventListener("submit", runSearch);
    restoreSearchState();
    checkMode();
    loadWatches();
    setInterval(function() {
      document.querySelectorAll(".inb-cd[data-iso]").forEach(function(el) {
        var iso = el.getAttribute("data-iso");
        if (!iso) return;
        var ms = new Date(iso).getTime();
        if (isNaN(ms)) return;
        var mins = Math.round((ms - Date.now()) / 60000);
        if (mins <= 0) el.textContent = "due now";
        else if (mins < 60) el.textContent = "in " + mins + "m";
        else el.textContent = "in " + Math.floor(mins / 60) + "h " + (mins % 60) + "m";
      });
    }, 30000);
  </script>
</body>
</html>`;
}
