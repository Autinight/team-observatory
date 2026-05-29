import assert from "node:assert/strict";
import {
  ACTIVE_STATUSES,
  FAILED_STATUSES,
  FINAL_STATUSES,
  TERMINABLE_STATUSES,
  isActiveStatus,
  isFailedStatus,
  isFinalStatus,
  isTerminableStatus,
  normalizeTaskStatus,
  observedStatus,
} from "../lib/status.js";

assert.deepEqual([...ACTIVE_STATUSES], ["pending", "running", "paused", "blocked", "recovering"]);
assert.deepEqual([...FAILED_STATUSES], ["failed", "aborted", "canceled", "cancelled"]);
assert.deepEqual([...FINAL_STATUSES], ["completed", "resolved", "failed", "aborted", "canceled", "cancelled"]);
assert.deepEqual([...TERMINABLE_STATUSES], ["pending", "running", "paused", "blocked", "recovering", "stale"]);

assert.equal(normalizeTaskStatus("resolved"), "completed");
assert.equal(normalizeTaskStatus("completed"), "completed");
assert.equal(normalizeTaskStatus("success"), "completed");
assert.equal(normalizeTaskStatus("cancelled"), "canceled");
assert.equal(normalizeTaskStatus("RUNNING"), "running");
assert.equal(normalizeTaskStatus(null), "unknown");

assert.equal(isActiveStatus("pending"), true);
assert.equal(isActiveStatus("running"), true);
assert.equal(isActiveStatus("paused"), true);
assert.equal(isActiveStatus("completed"), false);

assert.equal(isFailedStatus("failed"), true);
assert.equal(isFailedStatus("aborted"), true);
assert.equal(isFailedStatus("canceled"), true);
assert.equal(isFailedStatus("cancelled"), true);
assert.equal(isFailedStatus("completed"), false);

assert.equal(isFinalStatus("completed"), true);
assert.equal(isFinalStatus("resolved"), true);
assert.equal(isFinalStatus("failed"), true);
assert.equal(isFinalStatus("running"), false);

assert.equal(isTerminableStatus("running"), true);
assert.equal(isTerminableStatus("paused"), true);
assert.equal(isTerminableStatus("stale"), true);
assert.equal(isTerminableStatus("completed"), false);

const now = Date.parse("2026-05-29T00:20:00.000Z");
assert.equal(observedStatus({ status: "running", updatedAt: "2026-05-29T00:10:01.000Z" }, { now, staleAfterMs: 10 * 60 * 1000 }), "running");
assert.equal(observedStatus({ status: "running", updatedAt: "2026-05-29T00:09:59.000Z" }, { now, staleAfterMs: 10 * 60 * 1000 }), "stale");
assert.equal(observedStatus({ status: "paused", createdAt: "2026-05-29T00:00:00.000Z" }, { now, staleAfterMs: 10 * 60 * 1000 }), "stale");
assert.equal(observedStatus({ status: "success", updatedAt: "2026-05-29T00:00:00.000Z" }, { now, staleAfterMs: 10 * 60 * 1000 }), "completed");
assert.equal(observedStatus({ status: "cancelled", updatedAt: "2026-05-29T00:00:00.000Z" }, { now, staleAfterMs: 10 * 60 * 1000 }), "canceled");

console.log("status semantics ok");
