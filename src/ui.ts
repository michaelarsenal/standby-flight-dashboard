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
      const label = level === "green" ? "LOOKING GOOD" : level === "red" ? "TIGHT" : "CAUTION";
      return label + " · " + score + "/100";
    }

    async function runSearch(e) {
      if (e) e.preventDefault();
      const origins = document.getElementById("origins").value;
      const destinations = document.getElementById("destinations").value;
      const date = document.getElementById("date").value;
      const airlines = document.getElementById("airlines").value;
      const targetCabin = document.getElementById("targetCabin").value;

      document.getElementById("resultsList").innerHTML = '<div class="card subtitle">Querying flights, seat maps, and Day -1 / Day 0 route status...</div>';

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
        const cabins = [
          ["first", "First"],
          ["business", "Business / Club"],
          ["prem_econ", "Prem Econ"],
          ["economy", "Economy"]
        ].map(([key, label]) => {
          const s = c.cabins[key];
          if (!s || s.total === 0) {
            return '<div class="cabin-box"><div class="cabin-name"><span>' + label + '</span><span>—</span></div><div class="cabin-nums">Not fitted</div></div>';
          }
          const openLabel = (s.available === 0 && s.blocked > 0)
            ? s.available + ' open (' + s.blocked + ' blk)'
            : s.available + ' open';
          return '<div class="cabin-box ' + (key === targetCabin ? 'target' : '') + '">' +
            '<div class="cabin-name"><span>' + label + '</span><strong>' + openLabel + '</strong></div>' +
            '<div class="cabin-nums">' + s.occupied + ' occupied · ' + s.blocked + ' blocked (X)</div>' +
          '</div>';
        }).join("");

        const efTag = c.fareBuckets ? '<span class="pill">EF: ' + c.fareBuckets.raw.slice(0, 32) + (c.fareBuckets.raw.length > 32 ? '…' : '') + '</span>' : '';
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
            '<div><span class="score-badge ' + badgeClass(c.readiness) + '">' + badgeText(c.readiness, c.standbyScore) + '</span>' + riskPill + '</div>' +
          '</div>' +
          '<div class="cabins-grid">' + cabins + '</div>' +
          riskNotes +
          '<ul class="reasons">' + c.reasons.map(r => '<li>' + r + '</li>').join("") + '</ul>' +
          '<div class="actions-row">' +
            '<input class="ef-input" id="ef-' + idx + '" placeholder="Paste ExpertFlyer / myIDTravel buckets (e.g. F5 J9 W8 Y9 B9...)" value="' + (c.fareBuckets ? c.fareBuckets.raw : '') + '" />' +
            '<button class="btn-ghost" onclick="recalcWithEf(' + idx + ')">Apply EF Buckets</button>' +
            '<button class="btn-ghost" onclick="openSeatmap(\\'' + c.flightKey + '\\', \\'' + c.flightNumber + '\\')">Seat Map</button>' +
            '<button class="btn-ghost btn-watch ' + (c.watched ? 'active' : '') + '" onclick="toggleWatch(' + idx + ')">' + (c.watched ? 'Watching ✓' : '+ Watch Flight') + '</button>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    async function recalcWithEf(idx) {
      const c = latestCandidates[idx];
      const rawEf = document.getElementById("ef-" + idx).value;
      const targetCabin = document.getElementById("targetCabin").value;
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: c, targetCabin, efBuckets: rawEf })
      });
      latestCandidates[idx] = await res.json();
      renderCandidates(targetCabin);
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

    async function loadWatches() {
      const box = document.getElementById("watchesList");
      const res = await fetch("/api/watches");
      const data = await res.json();
      const watches = data.watches || [];
      if (watches.length === 0) {
        box.innerHTML = '<span class="subtitle">No flights watched yet. Click <strong>+ Watch Flight</strong> on any search result to track T-24h seat-fill velocity and receive alerts.</span>';
        return;
      }
      function fmtUtcTime(iso) {
        if (!iso) return '?';
        var m = String(iso).match(/T(\d{2}:\d{2})/);
        return m ? m[1] + 'Z' : String(iso);
      }
      function impactBadgeClass(impact) {
        if (impact === 'high') return 'score-red';
        if (impact === 'watch') return 'score-amber';
        return 'score-green';
      }
      function renderInboundCell(w) {
        var inb = w.inbound;
        var fallbackFr24 = 'https://www.flightradar24.com/' + encodeURIComponent(w.flight_number || '');
        if (!inb) {
          return '<div style="font-size:12px;color:#64748b">Not yet assigned (check inside T-24h)</div>' +
            '<div style="margin-top:3px"><a href="' + fallbackFr24 + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none">FR24 ↗</a></div>';
        }
        var routeTxt = (inb.origin || '?') + ' → ' + (inb.destination || '?');
        var regTxt = inb.registration ? ' <span style="color:#94a3b8">(' + inb.registration + ')</span>' : '';
        var estTxt = fmtUtcTime(inb.estimatedArrival || inb.scheduledArrival);
        var schedTxt = fmtUtcTime(inb.scheduledArrival);
        var delayTxt = inb.delayMins > 0 ? ' <span style="color:#f87171">(+' + inb.delayMins + 'm)</span>' : '';
        var links = '';
        if (inb.flightRadarUrl) {
          links += '<a href="' + inb.flightRadarUrl + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none;margin-right:8px">FR24 ↗</a>';
        }
        if (inb.flightAwareUrl) {
          links += '<a href="' + inb.flightAwareUrl + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#38bdf8;text-decoration:none">FA ↗</a>';
        }
        return '<div style="font-size:12px"><strong>' + inb.inboundFlight + '</strong> ' + routeTxt + regTxt + '</div>' +
          '<div style="font-size:11px;color:#cbd5e1;margin-top:2px">Est ' + estTxt + ' <span style="color:#64748b">(Sched ' + schedTxt + ')</span>' + delayTxt + '</div>' +
          '<div style="margin-top:3px"><span class="score-badge ' + impactBadgeClass(inb.outboundImpact) + '" style="font-size:10px;padding:2px 6px">' + (inb.impactSummary || 'No impact') + '</span></div>' +
          (links ? '<div style="margin-top:3px">' + links + '</div>' : '');
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
        return '<div class="sm-cabin">' +
          '<div class="sm-cabin-title"><span>' + (cabinNames[sec.cabin] || sec.code) + '</span>' +
          '<span style="font-size:0.78rem;color:var(--muted)">' + counts.a + ' open · ' + counts.o + ' occ · ' + counts.b + ' blk (' + counts.t + ' total)</span></div>' +
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
