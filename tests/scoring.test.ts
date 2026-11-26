import assert from "node:assert/strict";
import test from "node:test";
import { expandAirportInput } from "../src/airports.ts";
import { computeStandbyScore, parseFareBuckets } from "../src/scoring.ts";

test("expandAirportInput expands WAS and LON co-terminals", () => {
  assert.deepEqual(expandAirportInput("WAS"), ["IAD", "BWI", "DCA"]);
  assert.deepEqual(expandAirportInput("IAD, BWI"), ["IAD", "BWI"]);
  assert.deepEqual(expandAirportInput("LON"), ["LHR", "LGW", "LCY"]);
});

test("parseFareBuckets parses ExpertFlyer availability string", () => {
  const parsed = parseFareBuckets(
    "F5 A5 J9 C9 D9 R8 I0 W8 E7 T7 Y9 B9 H9 K9 M9 L9 V9 S9 N9 Q9 O0 G9"
  );
  assert.ok(parsed);
  if (!parsed) throw new Error("Expected parsed fare buckets");
  assert.equal(parsed.firstMax, 5);
  assert.equal(parsed.businessMax, 9);
  assert.equal(parsed.premEconMax, 8);
  assert.equal(parsed.economyMax, 9);
  assert.equal(parsed.classes["I"], 0);
});

test("computeStandbyScore penalizes Day -1 route cancellations and tight seats", () => {
  const cabins = {
    first: { available: 1, occupied: 6, blocked: 1, total: 8 },
    business: { available: 2, occupied: 38, blocked: 8, total: 48 },
    prem_econ: { available: 3, occupied: 29, blocked: 3, total: 35 },
    economy: { available: 3, occupied: 140, blocked: 22, total: 165 },
  };
  const res = computeStandbyScore({
    cabins,
    targetCabin: "economy",
    fareBuckets: parseFareBuckets("Y2 B0 M0"),
    disruptions: [
      {
        flightNumber: "BA214",
        airline: "BA",
        origin: "IAD",
        destination: "LHR",
        scheduledDeparture: "2026-11-26T17:10:00Z",
        dayOffset: -1,
        type: "cancelled",
        detail: "Cancelled",
        impactPenalty: 14,
      },
    ],
    hoursToDeparture: 12,
    velocityDropPerHour: 5,
  });

  assert.equal(res.readiness, "red");
  assert.ok(res.score < 45);
});
