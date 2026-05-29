// Smoke tests for shared utilities.
import assert from "node:assert/strict";
import {
  clampNumber,
  numberOf,
  toTime,
  toIso,
  ageMs,
  formatTokenCount,
} from "../lib/utils.js";

// clampNumber
assert.equal(clampNumber(5, 0, 0, 10), 5);
assert.equal(clampNumber(-1, 0, 0, 10), 0);
assert.equal(clampNumber(100, 0, 0, 10), 10);
assert.equal(clampNumber(NaN, 42, 0, 10), 42);
assert.equal(clampNumber(Infinity, 0, 0, 10), 0);

// numberOf
assert.equal(numberOf(5), 5);
assert.equal(numberOf(0), 0);
assert.equal(numberOf(null), 0);
assert.equal(numberOf(undefined), 0);
assert.equal(numberOf("3.14"), 3.14);
assert.equal(numberOf(NaN), 0);

// toTime
assert.equal(toTime(0), 0);
assert.equal(toTime(null), 0);
assert.equal(toTime("2026-05-29T00:00:00.000Z"), new Date("2026-05-29T00:00:00.000Z").getTime());
assert.ok(toTime(Date.now()) > 0);

// toIso
assert.equal(toIso(null), null);
assert.equal(toIso(0), null);
assert.equal(toIso("2026-05-29T00:00:00.000Z"), "2026-05-29T00:00:00.000Z");

// ageMs
assert.equal(ageMs(null), 0);
assert.ok(ageMs(Date.now()) === 0);  // current time → 0 age
assert.ok(ageMs(Date.now() - 60000) >= 60000);  // 1 minute ago

// formatTokenCount
assert.equal(formatTokenCount(0), "0");
assert.equal(formatTokenCount(500), "500");
assert.equal(formatTokenCount(1500), "1.5k");
assert.equal(formatTokenCount(1000000), "1.00M");
assert.equal(formatTokenCount(2500000), "2.50M");
assert.equal(formatTokenCount(999), "999");
assert.equal(formatTokenCount(null), "0");

console.log("utils passed");
