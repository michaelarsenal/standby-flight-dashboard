import type {
  CabinKey,
  CabinSeatSummary,
  DisruptionRiskSummary,
  EconomySeatStats,
  FareBuckets,
  ReadinessLevel,
  RouteDisruption,
  SeatMonitorStatus,
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
  const businessLetters =
    carrier === "VS" ? ["J", "C", "D", "I", "Z"] : ["J", "C", "D", "R", "I", "Z"];
  const premEconLetters =
    carrier === "VS" ? ["W", "S", "H", "K"] : ["W", "E", "T", "P"];
  const economyLetters =
    carrier === "VS"
      ? ["Y", "B", "R", "L", "U", "M", "E", "Q", "X", "N", "O", "V", "T"]
      : ["Y", "B", "H", "K", "M", "L", "V", "S", "N", "Q", "O", "G"];

  return {
    raw: rawInput.trim(),
    firstMax: maxOf(["F", "A"]),
    businessMax: maxOf(businessLetters),
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
  const cabinUnassigned = cabin.available + cabin.blocked;
  const totalOpenAll =
    cabins.first.available + cabins.first.blocked +
    cabins.business.available + cabins.business.blocked +
    cabins.prem_econ.available + cabins.prem_econ.blocked +
    cabins.economy.available + cabins.economy.blocked;

  // 1. Base score from unassigned seats (available + blocked) in target cabin
  let score = 50;
  const openRatio = cabin.total > 0 ? cabinUnassigned / cabin.total : 0;
  const freeRatio = cabinUnassigned > 0 ? cabin.available / cabinUnassigned : 0;

  if (cabinUnassigned >= 25 || openRatio >= 0.28) {
    score += 22;
    reasons.push(`${cabinUnassigned} open seats (${cabin.available} avail, ${cabin.blocked} blk) in ${labelCabin(targetCabin)} (${Math.round(openRatio * 100)}%)`);
  } else if (cabinUnassigned >= 10 || openRatio >= 0.14) {
    score += 8;
    reasons.push(`${cabinUnassigned} open seats (${cabin.available} avail, ${cabin.blocked} blk) in ${labelCabin(targetCabin)}`);
  } else if (cabinUnassigned <= 3) {
    score -= 24;
    reasons.push(`Only ${cabinUnassigned} open seat(s) in ${labelCabin(targetCabin)}`);
  } else {
    score -= 8;
    reasons.push(`Tight seat map: ${cabinUnassigned} open (${cabin.available} avail) in ${labelCabin(targetCabin)}`);
  }

  if (cabin.available >= 15 || (cabinUnassigned >= 8 && freeRatio >= 0.5)) {
    score += 5;
  } else if (cabin.available === 0 && cabin.blocked > 0) {
    score -= 8;
    reasons.push(`All ${cabin.blocked} open seats in ${labelCabin(targetCabin)} are blocked`);
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

  // 3. Fare bucket depth + seat-map cross-check
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
        if (cabin.available >= 20) score += 6;
        reasons.push(`GDS ${labelCabin(targetCabin)} max bucket at 9 (healthy inventory)`);
      } else if (bucketVal >= 5) {
        score += 8;
        reasons.push(`GDS ${labelCabin(targetCabin)} max bucket at ${bucketVal}`);
      } else if (bucketVal <= 2) {
        score -= 22;
        if (cabinUnassigned >= 20) {
          score -= 14;
          reasons.push(`Low fare bucket (${bucketVal}) despite ${cabinUnassigned} unassigned seats — likely unseated bookings`);
        } else {
          reasons.push(`GDS ${labelCabin(targetCabin)} max bucket critically low (${bucketVal})`);
        }
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

interface SeatCell {
  t?: string;
  s?: string;
}

interface SeatRow {
  seats?: SeatCell[];
}

interface SeatSection {
  cabin?: string;
  rows?: SeatRow[];
}

export function computeEconomySeatStats(
  seatmapInput: string | { sections?: SeatSection[] } | null | undefined
): EconomySeatStats | null {
  if (!seatmapInput) return null;
  let parsed: { sections?: SeatSection[] };
  try {
    parsed = typeof seatmapInput === "string" ? JSON.parse(seatmapInput) : seatmapInput;
  } catch {
    return null;
  }
  const econSections = (parsed.sections ?? []).filter((sec) => sec.cabin === "economy");
  if (econSections.length === 0) return null;

  const isOpen = (c: SeatCell) => c.s === "a" || c.s === "b";

  let emptyLeft = 0;
  let emptyMiddle = 0;
  let emptyRight = 0;
  let adjacentSpareSeats = 0;
  let windowAvailable = 0;
  let aisleAvailable = 0;

  for (const sec of econSections) {
    for (const row of sec.rows ?? []) {
      const groups: SeatCell[][] = [];
      let current: SeatCell[] = [];
      for (const cell of row.seats ?? []) {
        if (cell.t === "s") {
          current.push(cell);
        } else if (current.length > 0) {
          groups.push(current);
          current = [];
        }
      }
      if (current.length > 0) groups.push(current);
      if (groups.length === 0) continue;

      // Empty row segments (Left / Middle / Right)
      if (groups.length >= 3) {
        if (groups[0].every(isOpen)) emptyLeft++;
        for (let g = 1; g < groups.length - 1; g++) {
          if (groups[g].every(isOpen)) emptyMiddle++;
        }
        if (groups[groups.length - 1].every(isOpen)) emptyRight++;
      } else if (groups.length === 2) {
        if (groups[0].every(isOpen)) emptyLeft++;
        if (groups[1].every(isOpen)) emptyRight++;
      } else {
        if (groups[0].every(isOpen)) emptyMiddle++;
      }

      // Seats with an adjacent spare seat in the same section
      for (const group of groups) {
        for (let i = 0; i < group.length; i++) {
          if (!isOpen(group[i])) continue;
          const leftOpen = i > 0 && isOpen(group[i - 1]);
          const rightOpen = i < group.length - 1 && isOpen(group[i + 1]);
          if (leftOpen || rightOpen) adjacentSpareSeats++;
        }
      }

      // Window seats (outermost left and outermost right)
      const firstGroup = groups[0];
      const lastGroup = groups[groups.length - 1];
      if (isOpen(firstGroup[0])) windowAvailable++;
      if (groups.length > 1 || firstGroup.length > 1) {
        if (isOpen(lastGroup[lastGroup.length - 1])) windowAvailable++;
      }

      // Aisle seats (inner edges bordering an aisle)
      if (groups.length >= 2) {
        if (isOpen(firstGroup[firstGroup.length - 1])) aisleAvailable++;
        for (let g = 1; g < groups.length - 1; g++) {
          const mid = groups[g];
          if (isOpen(mid[0])) aisleAvailable++;
          if (mid.length > 1 && isOpen(mid[mid.length - 1])) aisleAvailable++;
        }
        if (isOpen(lastGroup[0])) aisleAvailable++;
      }
    }
  }

  return {
    emptyLeft,
    emptyMiddle,
    emptyRight,
    emptyRowsTotal: emptyLeft + emptyMiddle + emptyRight,
    adjacentSpareSeats,
    windowAvailable,
    aisleAvailable,
  };
}

export function inspectAssignedSeat(
  seatmapInput: string | { sections?: Array<{ cabin?: string; rows?: Array<{ n?: number; seats?: Array<{ t?: string; l?: string; s?: string }> }> }> } | null | undefined,
  assignedSeat: string | null | undefined
): SeatMonitorStatus | null {
  if (!seatmapInput || !assignedSeat) return null;
  const clean = assignedSeat.trim().toUpperCase();
  const m = clean.match(/^(\d{1,3})([A-Z])$/);
  if (!m) return null;
  const rowNum = Number(m[1]);
  const letter = m[2];

  let parsed: { sections?: Array<{ cabin?: string; rows?: Array<{ n?: number; seats?: Array<{ t?: string; l?: string; s?: string }> }> }> };
  try {
    parsed = typeof seatmapInput === "string" ? JSON.parse(seatmapInput) : seatmapInput;
  } catch {
    return null;
  }

  const mapStatus = (s?: string): "occupied" | "blocked" | "available" =>
    s === "o" ? "occupied" : s === "b" ? "blocked" : "available";

  for (const sec of parsed.sections ?? []) {
    for (const row of sec.rows ?? []) {
      if (row.n !== rowNum) continue;
      const groups: Array<Array<{ l: string; s: string }>> = [];
      let current: Array<{ l: string; s: string }> = [];
      for (const cell of row.seats ?? []) {
        if (cell.t === "s" && cell.l) {
          current.push({ l: cell.l.toUpperCase(), s: cell.s || "a" });
        } else if (current.length > 0) {
          groups.push(current);
          current = [];
        }
      }
      if (current.length > 0) groups.push(current);

      for (const group of groups) {
        const idx = group.findIndex((c) => c.l === letter);
        if (idx === -1) continue;

        const seatStatus = mapStatus(group[idx].s);
        const adjacentOccupied: string[] = [];
        const rowOccupied: string[] = [];
        let rowOpenCount = 0;

        const sectionSeats = group.map((c, i) => {
          const st = mapStatus(c.s);
          const seatLabel = `${rowNum}${c.l}`;
          const isAdjacent = Math.abs(i - idx) === 1;
          if (i !== idx) {
            if (st === "occupied") {
              rowOccupied.push(seatLabel);
              if (isAdjacent) adjacentOccupied.push(seatLabel);
            } else {
              rowOpenCount++;
            }
          }
          return { seat: seatLabel, letter: c.l, status: st, isAdjacent };
        });

        return {
          seat: clean,
          seatStatus,
          sectionSeats,
          adjacentOccupied,
          rowOccupied,
          rowOpenCount,
        };
      }
    }
  }
  return null;
}
