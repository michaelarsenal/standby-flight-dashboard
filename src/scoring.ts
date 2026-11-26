import type {
  CabinKey,
  CabinSeatSummary,
  DisruptionRiskSummary,
  FareBuckets,
  ReadinessLevel,
  RouteDisruption,
} from "./types.ts";

/**
 * Parses an ExpertFlyer or myIDTravel fare availability string, e.g.:
 *   "F5 A5 J9 C9 D9 R8 I0 W8 E7 T7 Y9 B9 H9 K9 M9 L9 V9 S9 N9 Q9 O0 G9"
 */
export function parseFareBuckets(
  rawInput: string | null | undefined,
  airline?: string
): FareBuckets | null {
  if (!rawInput || !rawInput.trim()) return null;

  const classes: Record<string, number> = {};
  const matches = rawInput.toUpperCase().matchAll(/\b([A-Z])(\d)\b/g);
  for (const m of matches) {
    classes[m[1]] = Number(m[2]);
  }

  if (Object.keys(classes).length === 0) return null;

  const maxOf = (letters: string[]): number | null => {
    const vals = letters.map((l) => classes[l]).filter((v) => v !== undefined);
    return vals.length > 0 ? Math.max(...vals) : null;
  };

  const carrier = (airline || "").toUpperCase();
  const premEconLetters =
    carrier === "VS" ? ["W", "S", "H", "K"] : ["W", "E", "T", "P"];
  const economyLetters =
    carrier === "VS"
      ? ["Y", "B", "R", "L", "U", "M", "E", "Q", "X", "N", "O", "V", "T"]
      : ["Y", "B", "H", "K", "M", "L", "V", "S", "N", "Q", "O", "G"];

  return {
    raw: rawInput.trim(),
    firstMax: maxOf(["F", "A"]),
    businessMax: maxOf(["J", "C", "D", "R", "I", "Z"]),
    premEconMax: maxOf(premEconLetters),
    economyMax: maxOf(economyLetters),
    classes,
  };
}

export function computePredictiveDisruptionRisk(params: {
  disruptions: RouteDisruption[];
  weatherSignals: string[];
  weatherRiskPoints: number;
  hubSignals: string[];
  hubRiskPoints: number;
  inboundSignal?: string | null;
  inboundRiskPoints?: number;
}): DisruptionRiskSummary {
  const signals: string[] = [];
  let score = params.weatherRiskPoints + params.hubRiskPoints + (params.inboundRiskPoints ?? 0);

  signals.push(...params.weatherSignals, ...params.hubSignals);
  if (params.inboundSignal) signals.push(params.inboundSignal);

  for (const d of params.disruptions) {
    score += d.impactPenalty;
    signals.push(`${d.flightNumber} (Day ${d.dayOffset}): ${d.detail}`);
  }

  score = Math.min(100, Math.round(score));
  const level: "low" | "moderate" | "high" =
    score >= 35 ? "high" : score >= 15 ? "moderate" : "low";

  return { level, score, signals };
}

export function computeStandbyScore(params: {
  cabins: Record<CabinKey, CabinSeatSummary>;
  targetCabin: CabinKey;
  fareBuckets: FareBuckets | null;
  disruptions: RouteDisruption[];
  predictiveRiskPoints?: number;
  hoursToDeparture?: number | null;
  velocityDropPerHour?: number | null;
}): { score: number; readiness: ReadinessLevel; reasons: string[] } {
  const {
    cabins,
    targetCabin,
    fareBuckets,
    disruptions,
    predictiveRiskPoints,
    hoursToDeparture,
    velocityDropPerHour,
  } = params;

  const reasons: string[] = [];
  const cabin = cabins[targetCabin];
  const totalOpenAll =
    cabins.first.available +
    cabins.business.available +
    cabins.prem_econ.available +
    cabins.economy.available;

  // 1. Base score from seat map open seats in target cabin + spillover across cabins
  let score = 50;
  const openRatio = cabin.total > 0 ? cabin.available / cabin.total : 0;

  if (cabin.available >= 25 || openRatio >= 0.28) {
    score += 22;
    reasons.push(`${cabin.available} open seats in ${labelCabin(targetCabin)} (${Math.round(openRatio * 100)}%)`);
  } else if (cabin.available >= 10 || openRatio >= 0.14) {
    score += 8;
    reasons.push(`${cabin.available} open seats in ${labelCabin(targetCabin)}`);
  } else if (cabin.available <= 3) {
    score -= 24;
    reasons.push(`Only ${cabin.available} open seat(s) in ${labelCabin(targetCabin)}`);
  } else {
    score -= 8;
    reasons.push(`Tight seat map: ${cabin.available} open in ${labelCabin(targetCabin)}`);
  }

  if (totalOpenAll >= 45) {
    score += 8;
    reasons.push(`Strong total cabin buffer (${totalOpenAll} open across all cabins)`);
  }

  // 2. BA T-24h caveat & check-in velocity
  if (hoursToDeparture !== undefined && hoursToDeparture !== null) {
    if (hoursToDeparture > 24) {
      reasons.push("T>24h: unpaid seat reservations not yet visible on seat map");
    } else if (hoursToDeparture <= 24 && hoursToDeparture >= 0) {
      reasons.push(`Inside T-24h check-in window (${Math.round(hoursToDeparture)}h to departure)`);
    }
  }

  if (velocityDropPerHour !== undefined && velocityDropPerHour !== null && velocityDropPerHour >= 4) {
    score -= 15;
    reasons.push(`Rapid check-in fill rate (-${velocityDropPerHour.toFixed(1)} seats/hr)`);
  }

  // 3. Fare bucket depth (if ExpertFlyer / myIDTravel buckets were provided)
  if (fareBuckets) {
    const bucketVal =
      targetCabin === "first"
        ? fareBuckets.firstMax
        : targetCabin === "business"
        ? fareBuckets.businessMax
        : targetCabin === "prem_econ"
        ? fareBuckets.premEconMax
        : fareBuckets.economyMax;

    if (bucketVal !== null) {
      if (bucketVal >= 9) {
        score += 18;
        reasons.push(`GDS ${labelCabin(targetCabin)} max bucket at 9 (healthy inventory)`);
      } else if (bucketVal >= 5) {
        score += 8;
        reasons.push(`GDS ${labelCabin(targetCabin)} max bucket at ${bucketVal}`);
      } else if (bucketVal <= 2) {
        score -= 22;
        reasons.push(`GDS ${labelCabin(targetCabin)} max bucket critically low (${bucketVal})`);
      } else {
        score -= 8;
        reasons.push(`GDS ${labelCabin(targetCabin)} max bucket tightening (${bucketVal})`);
      }
    }
  }

  // 4. Day -3..Day 0 route disruption & predictive weather/hub/inbound penalty
  for (const d of disruptions) {
    score -= d.impactPenalty;
    reasons.push(
      `${d.dayOffset === 0 ? "Same-day" : `Day ${d.dayOffset}`} ${d.flightNumber} ${d.type.replace("_", " ")}: ${d.detail}`
    );
  }

  if (predictiveRiskPoints && predictiveRiskPoints > 0) {
    const penalty = Math.min(20, Math.round(predictiveRiskPoints * 0.45));
    score -= penalty;
    reasons.push(`Predictive weather/hub/inbound disruption risk (-${penalty} pts)`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const readiness: ReadinessLevel = score >= 70 ? "green" : score >= 45 ? "amber" : "red";

  return { score, readiness, reasons };
}

function labelCabin(cabin: CabinKey): string {
  switch (cabin) {
    case "first":
      return "First";
    case "business":
      return "Business";
    case "prem_econ":
      return "Prem Econ";
    case "economy":
      return "Economy";
  }
}
