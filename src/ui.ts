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
    .sm-a { background: rgba(34,197,94,0.22); border-color: rgba(34,197,94,0.65); color: #86efac; }
    .sm-p { background: rgba(245,158,11,0.22); border-color: rgba(245,158,11,0.7); color: #fcd34d; }
    .sm-o { background: rgba(59,130,246,0.25); border-color: rgba(59,130,246,0.55); color: #93c5fd; }
    .sm-b { background: rgba(100,116,139,0.22); border-color: rgba(100,116,139,0.5); color: #94a3b8; }
    .sm-aisle { width: 14px; height: 24px; display: inline-block; flex-shrink: 0; }
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
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Standby Flight Dashboard</h1>
        <div class="subtitle">British Airways &amp; Virgin Atlantic — Seat Map Velocity &amp; Route Disruption Monitor</div>
      </div>
      <div id="modeBadge" class="pill">Checking API mode...</div>
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
        <div>
          <label for="airlines">Airlines</label>
          <select id="airlines">
            <option value="BA,VS">BA + Virgin Atlantic</option>
            <option value="BA">British Airways (BA)</option>
            <option value="VS">Virgin Atlantic (VS)</option>
          </select>
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

    <div class="section-title">
      <span id="resultsHeading">Search Results</span>
      <span id="resultsMeta" class="subtitle"></span>
    </div>
    <div id="resultsList" class="flight-list"></div>

    <div class="card" style="margin-top: 22px;">
      <div class="section-title">
        <span>Watched Flights (T-24h Polling &amp; Alerts)</span>
        <button class="btn-ghost" onclick="loadWatches()">Refresh</button>
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
        <span><i class="sm-seat sm-o">×</i> Occupied</span>
        <span><i class="sm-seat sm-b">X</i> Blocked</span>
      </div>
      <div id="seatmapBody"></div>
    </div>
  </div>

  <script>
    const dateInput = document.getElementById("date");
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    dateInput.value = tomorrow;

    let latestCandidates = [];

    function badgeClass(level) {
      if (level === "green") return "score-green";
      if (level === "red") return "score-red";
      return "score-amber";
    }

    function badgeText(level, score) {
      return level === "green" ? "LOOKING GOOD" : level === "red" ? "TIGHT" : "CAUTION";
    }

    async function runSearch(e) {
      if (e) e.preventDefault();
      const origins = document.getElementById("origins").value;
      const destinations = document.getElementById("destinations").value;
      const date = document.getElementById("date").value;
      const airlines = document.getElementById("airlines").value;
      const targetCabin = document.getElementById("targetCabin").value;

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
      document.getElementById("resultsMeta").textContent =
        latestCandidates.length + " flight(s) across " + (data.expandedOrigins || []).join(", ") + " → " + (data.expandedDestinations || []).join(", ");

      renderCandidates(targetCabin);
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
          const bTag = bucketMap[key] ? ' <span class="pill" style="padding:1px 6px;font-size:10px">' + bucketMap[key] + '</span>' : '';
          return '<div class="cabin-box ' + (key === targetCabin ? 'target' : '') + '">' +
            '<div class="cabin-name"><span>' + label + bTag + '</span><span style="font-size:11px;color:#94a3b8">Cap ' + s.total + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 3px;">' +
              '<span style="font-size:13px;font-weight:700;color:#e2e8f0">' + s.occupied + ' occ</span>' +
              '<span style="font-size:13px;font-weight:700;color:' + (openTotal >= 15 ? '#4ade80' : openTotal >= 5 ? '#fbbf24' : '#f87171') + '">' + openTotal + ' open <span style="font-weight:500;font-size:11px;color:#94a3b8">(' + s.available + ' avail)</span></span>' +
            '</div>' +
            '<div style="height:4px;background:rgba(148,163,184,0.18);border-radius:999px;overflow:hidden;margin-bottom:5px;">' +
              '<div style="height:100%;width:' + occPct + '%;background:' + (occPct >= 88 ? '#ef4444' : occPct >= 70 ? '#f59e0b' : '#22c55e') + '"></div>' +
            '</div>' +
            '<div class="cabin-nums" style="font-size:11px">Occ ' + s.occupied + ' · Blk ' + s.blocked + ' · Avail ' + s.available + '</div>' +
          '</div>';
        }).join("");

        const totOpen = totBlk + totAvail;
        const totPct = totCap > 0 ? Math.round((totOcc / totCap) * 100) : 0;
        const flightTotalsPill = totCap > 0
          ? '<div style="display:flex;align-items:center;gap:10px;padding:4px 10px;border-radius:8px;background:rgba(15,23,42,0.65);border:1px solid var(--border);font-size:12px;">' +
              '<span><strong>' + totOcc + ' / ' + totCap + '</strong> occ (' + totPct + '%)</span>' +
              '<span style="color:' + (totOpen >= 35 ? '#4ade80' : totOpen >= 15 ? '#fbbf24' : '#f87171') + ';font-weight:700">' + totOpen + ' open <span style="color:#94a3b8;font-weight:400">(' + totAvail + ' avail · ' + totBlk + ' blk)</span></span>' +
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

        return '<div class="flight-card">' +
          '<div class="flight-top">' +
            '<div class="flight-title">' +
              '<span class="flight-num">' + c.flightNumber + '</span>' +
              '<span class="route-meta">' + c.origin + ' → ' + c.destination + ' · ' + c.departureTime + '–' + c.arrivalTime + ' (' + c.duration + ') · ' + c.aircraft + '</span>' +
              efTag +
            '</div>' +
            flightTotalsPill +
            '<div style="display:flex;align-items:center;"><span class="score-badge ' + badgeClass(c.readiness) + '" title="Standby Score: ' + c.standbyScore + '/100">' + badgeText(c.readiness, c.standbyScore) + '</span>' + riskPill + '</div>' +
          '</div>' +
          '<div class="cabins-grid">' + cabins + '</div>' +
          economyComfortBar +
          riskNotes +
          '<div class="actions-row">' +
            '<button class="btn-ghost" onclick="openSeatmap(\\'' + c.flightKey + '\\', \\'' + c.flightNumber + '\\')">Seat Map</button>' +
            '<button class="btn-ghost btn-watch ' + (c.watched ? 'active' : '') + '" onclick="toggleWatch(' + idx + ')">' + (c.watched ? 'Watching ✓' : '+ Watch Flight') + '</button>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    async function toggleWatch(idx) {
      const c = latestCandidates[idx];
      const targetCabin = document.getElementById("targetCabin").value;
      const efInput = document.getElementById("ef-" + idx);
      const efBuckets = efInput ? efInput.value : null;

      if (c.watched) {
        await fetch("/api/watches/" + encodeURIComponent(c.flightKey), { method: "DELETE" });
        c.watched = false;
      } else {
        await fetch("/api/watches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate: c, targetCabin, efBuckets })
        });
        c.watched = true;
      }
      renderCandidates(targetCabin);
      loadWatches();
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

    async function loadWatches() {
      const box = document.getElementById("watchesList");
      const res = await fetch("/api/watches");
      const data = await res.json();
      const topicEl = document.getElementById("ntfyTopic");
      if (topicEl && typeof data.ntfyTopic === "string" && document.activeElement !== topicEl) {
        topicEl.value = data.ntfyTopic;
      }
      const watches = data.watches || [];
      if (watches.length === 0) {
        box.innerHTML = '<span class="subtitle">No flights watched yet. Click <strong>+ Watch Flight</strong> on any search result to track T-24h seat-fill velocity and receive alerts.</span>';
        return;
      }
      function fmtUtcTime(iso) {
        if (!iso) return '?';
        var m = String(iso).match(/T([0-9]{2}:[0-9]{2})/);
        return m ? m[1] + 'Z' : String(iso);
      }
      function fmtMinsCountdown(mins) {
        if (mins === null || mins === undefined) return '';
        if (mins <= 0) return 'due now';
        if (mins < 60) return 'in ' + mins + 'm';
        return 'in ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
      }
      function stageBadge(inb, estTxt) {
        var st = inb.stage || 'scheduled';
        var turnTxt = inb.turnaroundMins !== null && inb.turnaroundMins !== undefined ? inb.turnaroundMins + 'm turn' : '';
        if (st === 'cancelled') {
          return { cls: 'score-red', text: 'Cancelled' };
        }
        if (st === 'landed') {
          return { cls: 'score-blue', text: 'Landed ' + estTxt + (turnTxt ? ' · ' + turnTxt : '') };
        }
        if (st === 'enroute') {
          if (inb.delayMins >= 15) {
            return { cls: 'score-amber', text: 'Enroute · +' + inb.delayMins + 'm delayed' + (turnTxt ? ' (' + turnTxt + ')' : '') };
          }
          return { cls: 'score-green', text: 'Enroute · On time' + (turnTxt ? ' (' + turnTxt + ')' : '') };
        }
        var etdTxt = fmtUtcTime(inb.estimatedDeparture || inb.scheduledDeparture);
        var cd = fmtMinsCountdown(inb.departInMins);
        var extra = [];
        if (cd) extra.push(cd);
        if (inb.delayMins >= 15) extra.push('+' + inb.delayMins + 'm delayed');
        var label = 'ETD ' + etdTxt + (extra.length ? ' (' + extra.join(', ') + ')' : '');
        return { cls: inb.delayMins >= 15 ? 'score-amber' : 'score-slate', text: label };
      }
      function renderAlertToggles(w) {
        var a = w.alertStages || { etd: true, enroute: true, landed: true, disruption: true };
        var stages = [
          { key: 'etd', label: 'ETD' },
          { key: 'enroute', label: 'Enroute' },
          { key: 'landed', label: 'Landed' },
          { key: 'disruption', label: 'Delay/Cancel' }
        ];
        return '<div style="margin-top:4px">' +
          '<span style="font-size:10px;color:#64748b;margin-right:4px">Alerts:</span>' +
          stages.map(function(s) {
            var isOn = a[s.key] !== false;
            return '<button type="button" class="stage-pill ' + (isOn ? 'on' : '') + '" onclick="toggleStageAlert(\\'' + w.flight_key + '\\', \\'' + s.key + '\\', ' + (!isOn) + ')">' +
              (isOn ? '🔔 ' : '') + s.label + '</button>';
          }).join('') +
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
        var estTxt = fmtUtcTime(inb.estimatedArrival || inb.scheduledArrival);
        var schedTxt = fmtUtcTime(inb.scheduledArrival);
        var delayTxt = inb.delayMins > 0 ? ' <span style="color:#f87171">(+' + inb.delayMins + 'm)</span>' : '';
        var sb = stageBadge(inb, estTxt);
        var impactNote = (inb.outboundImpact === 'high' || inb.outboundImpact === 'watch')
          ? '<div style="font-size:10px;color:' + (inb.outboundImpact === 'high' ? '#f87171' : '#fbbf24') + ';margin-top:2px">⚠ ' + (inb.impactSummary || '') + '</div>'
          : '';
        var links = '';
        if (inb.flightRadarUrl) {
          links += '<a href="' + inb.flightRadarUrl + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none;margin-right:8px">FR24 ↗</a>';
        }
        if (inb.flightAwareUrl) {
          links += '<a href="' + inb.flightAwareUrl + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none">FA ↗</a>';
        }
        return '<div style="font-size:12px"><strong>' + inb.inboundFlight + '</strong> ' + routeTxt + regTxt + '</div>' +
          '<div style="font-size:11px;color:#cbd5e1;margin-top:2px">' + depTxt + 'ETA ' + estTxt + (estTxt !== schedTxt ? ' <span style="color:#64748b">(Sched ' + schedTxt + ')</span>' : '') + delayTxt + '</div>' +
          '<div style="margin-top:3px"><span class="score-badge ' + sb.cls + '" style="font-size:10px;padding:2px 6px">' + sb.text + '</span></div>' +
          impactNote +
          (links ? '<div style="margin-top:3px">' + links + '</div>' : '') +
          renderAlertToggles(w);
      }
      box.innerHTML = '<table><thead><tr><th>Flight</th><th>Route</th><th>Date</th><th>Cabin</th><th>Inbound Aircraft</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        watches.map(w => '<tr>' +
          '<td><strong>' + w.flight_number + '</strong></td>' +
          '<td>' + w.origin + ' → ' + w.destination + '</td>' +
          '<td>' + w.departure_date + ' ' + (w.departure_time || '') + '</td>' +
          '<td>' + w.target_cabin + '</td>' +
          '<td>' + renderInboundCell(w) + '</td>' +
          '<td><span class="score-badge ' + badgeClass(w.last_status) + '">' + (w.last_status || 'pending').toUpperCase() + ' (' + (w.last_score ?? '?') + ')</span></td>' +
          '<td><button class="btn-ghost" onclick="openSeatmap(\\'' + w.flight_key + '\\', \\'' + w.flight_number + '\\')">Seat Map</button> ' +
          '<button class="btn-ghost" onclick="openHistory(\\'' + w.flight_key + '\\', \\'' + w.flight_number + '\\')">History</button> ' +
          '<button class="btn-ghost" onclick="removeWatch(\\'' + w.flight_key + '\\')">Remove</button></td>' +
        '</tr>').join("") +
      '</tbody></table>';
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
      document.getElementById("seatmapTitle").textContent = flightNum + (data.aircraft ? " (" + data.aircraft + ")" : "") + " — Captured " + (data.captured_at || "") + " UTC";
      const cabinNames = { first: "First (F)", business: "Business / Club (J)", prem_econ: "Premium Economy (W)", economy: "Economy (Y)" };
      document.getElementById("seatmapBody").innerHTML = data.seatmap.sections.map(function(sec) {
        const rowsHtml = (sec.rows || []).map(function(row) {
          const cells = (row.seats || []).map(function(cell) {
            if (cell.t !== "s") {
              return '<span class="sm-aisle"></span>';
            }
            const statusName = cell.s === "a" ? (cell.p ? "Available (Paid/Pref)" : "Available") : (cell.s === "o" ? "Occupied" : "Blocked");
            const cls = cell.s === "a" ? (cell.p ? "sm-seat sm-p" : "sm-seat sm-a") : (cell.s === "o" ? "sm-seat sm-o" : "sm-seat sm-b");
            const txt = cell.s === "o" ? "×" : (cell.s === "b" ? "X" : (cell.l || ""));
            return '<span class="' + cls + '" title="Seat ' + row.n + (cell.l || "") + ' — ' + statusName + '">' + txt + '</span>';
          }).join("");
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

    document.getElementById("searchForm").addEventListener("submit", runSearch);
    runSearch();
    loadWatches();
  </script>
</body>
</html>`;
}
