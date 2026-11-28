import { recordTrigger } from "./db.ts";
import type { Env, FlightCandidate, InboundFlightInfo, ReadinessLevel, WatchedFlight } from "./types.ts";

export async function sendNtfyPush(
  topic: string,
  title: string,
  message: string,
  opts?: { priority?: string; tags?: string; clickUrl?: string }
): Promise<boolean> {
  const clean = topic.trim();
  if (!clean) return false;
  const headers: Record<string, string> = {
    Title: title,
    Priority: opts?.priority || "default",
  };
  if (opts?.tags) headers.Tags = opts.tags;
  if (opts?.clickUrl) headers.Click = opts.clickUrl;

  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(clean)}`, {
    method: "POST",
    headers,
    body: message,
  });
  return res.ok;
}

export async function sendStagePushAlert(
  env: Env,
  ntfyTopic: string | null,
  watch: WatchedFlight,
  inbound: InboundFlightInfo,
  stageLabel: string
): Promise<boolean> {
  const title = `${watch.flight_number} Inbound ${inbound.inboundFlight}: ${stageLabel}`;
  const body = [
    `${inbound.inboundFlight} (${inbound.origin} → ${inbound.destination}${inbound.registration ? `, ${inbound.registration}` : ""})`,
    inbound.impactSummary,
    inbound.surfaceCongestion ? inbound.surfaceCongestion.summary : "",
    inbound.arrivalCongestion ? inbound.arrivalCongestion.summary : "",
    inbound.estimatedArrival ? `ETA: ${inbound.estimatedArrival}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const topic = ntfyTopic || env.NTFY_TOPIC || "";
  let sent = false;
  if (topic) {
    const isUrgent = inbound.stage === "cancelled" || inbound.stage === "diverted" || inbound.outboundImpact === "high";
    const tags =
      inbound.stage === "cancelled" || inbound.stage === "diverted"
        ? "rotating_light,airplane"
        : inbound.stage === "landed" || inbound.stage === "parked"
          ? "airplane_arriving,white_check_mark"
          : inbound.stage === "taxiing"
            ? "taxi,airplane_departure"
            : inbound.stage === "enroute"
              ? "airplane_departure"
              : "clock1";
    sent = await sendNtfyPush(topic, title, body, {
      priority: isUrgent ? "high" : "default",
      tags,
      clickUrl: inbound.flightRadarUrl,
    });
  }

  if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO) {
    const from = env.ALERT_EMAIL_FROM || "Standby Monitor <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()),
        subject: `[Inbound ${stageLabel}] ${watch.flight_number} (${inbound.inboundFlight})`,
        html: `<p><strong>${title}</strong></p><p>${body.replace(/\n/g, "<br/>")}</p><p><a href="${inbound.flightRadarUrl}">Track on FlightRadar24</a></p>`,
      }),
    });
    if (res.ok) sent = true;
  }

  if (env.DB) {
    try {
      await recordTrigger(env.DB, {
        flightKey: watch.flight_key,
        flightNumber: watch.flight_number,
        category: "inbound",
        title,
        detail: body.replace(/\n+/g, " · "),
      });
    } catch {}
  }

  return sent;
}

export async function sendSeatMonitorAlert(
  env: Env,
  ntfyTopic: string | null,
  watch: WatchedFlight,
  title: string,
  message: string
): Promise<boolean> {
  const topic = ntfyTopic || env.NTFY_TOPIC || "";
  let sent = false;
  if (topic) {
    sent = await sendNtfyPush(topic, title, message, {
      priority: "high",
      tags: "seat,warning",
    });
  }

  if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO) {
    const from = env.ALERT_EMAIL_FROM || "Standby Monitor <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()),
        subject: title,
        html: `<p><strong>${title}</strong></p><p>${message.replace(/\n/g, "<br/>")}</p><p>Flight: ${watch.flight_number} (${watch.origin} → ${watch.destination}) on ${watch.departure_date}</p>`,
      }),
    });
    if (res.ok) sent = true;
  }

  if (env.DB) {
    try {
      await recordTrigger(env.DB, {
        flightKey: watch.flight_key,
        flightNumber: watch.flight_number,
        category: "seat",
        title,
        detail: message,
      });
    } catch {}
  }

  return sent;
}

export async function sendOutboundAlert(
  env: Env,
  ntfyTopic: string | null,
  watch: WatchedFlight,
  title: string,
  message: string,
  urgent = false
): Promise<boolean> {
  const topic = ntfyTopic || env.NTFY_TOPIC || "";
  let sent = false;
  if (topic) {
    sent = await sendNtfyPush(topic, title, message, {
      priority: urgent ? "high" : "default",
      tags: urgent ? "rotating_light,airplane" : "airplane,information_source",
    });
  }

  if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO) {
    const from = env.ALERT_EMAIL_FROM || "Standby Monitor <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()),
        subject: title,
        html: `<p><strong>${title}</strong></p><p>${message.replace(/\n/g, "<br/>")}</p><p>Flight: ${watch.flight_number} (${watch.origin} → ${watch.destination}) on ${watch.departure_date}</p>`,
      }),
    });
    if (res.ok) sent = true;
  }

  if (env.DB) {
    try {
      await recordTrigger(env.DB, {
        flightKey: watch.flight_key,
        flightNumber: watch.flight_number,
        category: "outbound",
        title,
        detail: message,
      });
    } catch {}
  }

  return sent;
}

export async function sendStandbyAlert(
  env: Env,
  flight: FlightCandidate,
  previousStatus: ReadinessLevel | null,
  reasonSummary: string
): Promise<boolean> {
  if (env.DB) {
    try {
      await recordTrigger(env.DB, {
        flightKey: flight.flightKey,
        flightNumber: flight.flightNumber,
        category: "readiness",
        title: `${flight.flightNumber} ${previousStatus ?? "NEW"} → ${flight.readiness.toUpperCase()} (${flight.standbyScore}/100)`,
        detail: reasonSummary,
      });
    } catch {}
  }

  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO) {
    return false;
  }

  const from = env.ALERT_EMAIL_FROM || "Standby Monitor <onboarding@resend.dev>";
  const badge = flight.readiness.toUpperCase();
  const subject = `[Standby ${badge}] ${flight.flightNumber} ${flight.origin}->${flight.destination} (${flight.departureDate}) - Score ${flight.standbyScore}/100`;

  const html = `
    <h2>Standby Flight Alert: ${flight.flightNumber} (${flight.origin} → ${flight.destination})</h2>
    <p><strong>Date:</strong> ${flight.departureDate} at ${flight.departureTime} (${flight.aircraft})</p>
    <p><strong>Status Change:</strong> ${previousStatus ?? "NEW"} → <strong>${badge}</strong> (Score: ${flight.standbyScore}/100)</p>
    <p><strong>Summary:</strong> ${reasonSummary}</p>
    <h3>Seat Map Open / Occupied / Blocked</h3>
    <ul>
      <li><strong>First:</strong> ${flight.cabins.first.available} open / ${flight.cabins.first.occupied} occupied / ${flight.cabins.first.blocked} blocked</li>
      <li><strong>Business:</strong> ${flight.cabins.business.available} open / ${flight.cabins.business.occupied} occupied / ${flight.cabins.business.blocked} blocked</li>
      <li><strong>Prem Econ:</strong> ${flight.cabins.prem_econ.available} open / ${flight.cabins.prem_econ.occupied} occupied / ${flight.cabins.prem_econ.blocked} blocked</li>
      <li><strong>Economy:</strong> ${flight.cabins.economy.available} open / ${flight.cabins.economy.occupied} occupied / ${flight.cabins.economy.blocked} blocked</li>
    </ul>
    ${
      flight.disruptions.length > 0
        ? `<h3>Route Disruptions (Day -1 / Day 0)</h3><ul>${flight.disruptions
            .map((d) => `<li>${d.flightNumber} (${d.type}): ${d.detail}</li>`)
            .join("")}</ul>`
        : ""
    }
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()),
      subject,
      html,
    }),
  });

  return res.ok;
}
