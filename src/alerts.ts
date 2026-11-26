import type { Env, FlightCandidate, ReadinessLevel } from "./types.ts";

export async function sendStandbyAlert(
  env: Env,
  flight: FlightCandidate,
  previousStatus: ReadinessLevel | null,
  reasonSummary: string
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO) {
    return false;
  }

  const from = env.ALERT_EMAIL_FROM || "Standby Monitor <alerts@resend.dev>";
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
