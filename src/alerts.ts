import { recordTrigger } from "./db.ts";
import type { Env, FlightCandidate, InboundFlightInfo, ReadinessLevel, WatchedFlight } from "./types.ts";

export async function generateGeminiBriefingWithDebug(
  env: Env,
  context: string
): Promise<{ text: string | null; error: string | null }> {
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return { text: null, error: "GEMINI_API_KEY not set" };
  for (const model of ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are a concise airline standby travel assistant. Summarize this flight alert in 1-2 short plain-text sentences (no markdown, max 220 chars) with actionable standby advice:\n\n${context}`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 200,
              temperature: 0.2,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }
      );
      if (res.status === 404 || res.status === 429 || res.status >= 500) continue;
      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        return { text: null, error: `HTTP ${res.status} (${model}): ${errTxt.slice(0, 160)}` };
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const txt = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
      if (txt) return { text: txt, error: null };
      return { text: null, error: `Empty response from ${model}` };
    } catch (e: any) {
      return { text: null, error: String(e?.message || e || "Request failed") };
    }
  }
  return { text: null, error: "No supported Gemini Flash model found (404)" };
}

export async function generateGeminiBriefing(env: Env, context: string): Promise<string | null> {
  const res = await generateGeminiBriefingWithDebug(env, context);
  return res.text;
}

export async function sendNtfyPush(
  topic: string,
  title: string,
  message: string,
  opts?: { priority?: string; tags?: string; clickUrl?: string }
): Promise<boolean> {
  const clean = topic.trim();
  if (!clean) return false;
  const asciiTitle = title
    .replace(/→/g, "->")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
  const headers: Record<string, string> = {
    Title: asciiTitle || "Standby Flight Alert",
    Priority: opts?.priority || "default",
  };
  if (opts?.tags) headers.Tags = opts.tags;
  if (opts?.clickUrl) headers.Click = opts.clickUrl;

  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(clean)}`, {
      method: "POST",
      headers,
      body: message,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendStagePushAlert(
  env: Env,
  ntfyTopic: string | null,
  watch: WatchedFlight,
  inbound: InboundFlightInfo,
  stageLabel: string
): Promise<boolean> {
  const title = `${watch.flight_number} Inbound ${inbound.inboundFlight}: ${stageLabel}`;
  const baseBody = [
    `${inbound.inboundFlight} (${inbound.origin} → ${inbound.destination}${inbound.registration ? `, ${inbound.registration}` : ""})`,
    inbound.impactSummary,
    inbound.surfaceCongestion ? inbound.surfaceCongestion.summary : "",
    inbound.arrivalCongestion ? inbound.arrivalCongestion.summary : "",
    inbound.estimatedArrival ? `ETA: ${inbound.estimatedArrival}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const isMajorInbound =
    inbound.stage === "cancelled" ||
    inbound.stage === "diverted" ||
    inbound.outboundImpact === "high" ||
    inbound.delayMins >= 45;
  const aiBrief = isMajorInbound
    ? await generateGeminiBriefing(env, `${title}\n${baseBody}`)
    : null;
  const body = aiBrief ? `${baseBody}\nGemini: ${aiBrief}` : baseBody;

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
  const aiBrief = await generateGeminiBriefing(env, `${title}\n${message}`);
  const finalMsg = aiBrief ? `${message}\nGemini: ${aiBrief}` : message;
  const topic = ntfyTopic || env.NTFY_TOPIC || "";
  let sent = false;
  if (topic) {
    sent = await sendNtfyPush(topic, title, finalMsg, {
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
  const aiBrief = urgent ? await generateGeminiBriefing(env, `${title}\n${message}`) : null;
  const finalMsg = aiBrief ? `${message}\nGemini: ${aiBrief}` : message;
  const topic = ntfyTopic || env.NTFY_TOPIC || "";
  let sent = false;
  if (topic) {
    sent = await sendNtfyPush(topic, title, finalMsg, {
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

  const badge = flight.readiness.toUpperCase();
  const aiBrief = await generateGeminiBriefing(
    env,
    `${flight.flightNumber} ${flight.origin}->${flight.destination} (${flight.departureDate} ${flight.departureTime}) flipped ${previousStatus ?? "NEW"} -> ${badge} (${flight.standbyScore}/100). Reasons: ${reasonSummary}. Economy open: ${flight.cabins.economy.available} avail / ${flight.cabins.economy.blocked} blk.`
  );
  const fullSummary = aiBrief ? `${reasonSummary}\nGemini: ${aiBrief}` : reasonSummary;

  if (env.NTFY_TOPIC) {
    await sendNtfyPush(
      env.NTFY_TOPIC,
      `[Standby ${badge}] ${flight.flightNumber} (${flight.standbyScore}/100)`,
      `${previousStatus ?? "NEW"} → ${badge}: ${fullSummary}`,
      { priority: flight.readiness === "red" ? "high" : "default", tags: "airplane" }
    );
  }

  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO) {
    return false;
  }

  const from = env.ALERT_EMAIL_FROM || "Standby Monitor <onboarding@resend.dev>";
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
