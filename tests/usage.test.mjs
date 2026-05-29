// Smoke tests for usage aggregation.
import assert from "node:assert/strict";
import {
  normalizeUsage,
  groupUsageByAgent,
  emptyUsageBucket,
  sumUsage,
} from "../lib/usage.js";

// normalizeUsage
const raw = [
  {
    id: "u1",
    ts: 1000,
    agentId: "shiraha",
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  },
  {
    id: "u2",
    ts: 2000,
    agentId: "shiraha",
    usage: { prompt_tokens: 200, completion_tokens: 80 },
  },
  {
    id: "u3",
    ts: 3000,
    agentId: "rihane",
    usage: { inputTokens: 10, outputTokens: 0 },
  },
];
const normalized = normalizeUsage(raw);
assert.equal(normalized.length, 3);
assert.deepEqual(normalized[0].agentId, "rihane");  // sorted by ts desc
assert.deepEqual(normalized[1].agentId, "shiraha");
assert.deepEqual(normalized[2].agentId, "shiraha");
assert.equal(normalized[2].inputTokens, 100);
assert.equal(normalized[2].outputTokens, 50);
assert.equal(normalized[2].totalTokens, 150);
assert.equal(normalized[1].inputTokens, 200);
assert.equal(normalized[1].outputTokens, 80);
assert.equal(normalized[1].totalTokens, 280);  // no totalTokens → computed from prompt_tokens + completion_tokens

// groupUsageByAgent
const groups = groupUsageByAgent(normalized);
assert.equal(groups.size, 2);
const s = groups.get("shiraha");
assert.equal(s.calls, 2);
assert.equal(s.inputTokens, 300);
assert.equal(s.outputTokens, 130);
assert.equal(s.totalTokens, 430);

const r = groups.get("rihane");
assert.equal(r.calls, 1);
assert.equal(r.totalTokens, 10);

// emptyUsageBucket
const bucket = emptyUsageBucket("test");
assert.deepEqual(bucket, { agentId: "test", inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, calls: 0 });

// sumUsage
const summed = sumUsage(normalized);
assert.equal(summed.agentId, "all");
assert.equal(summed.calls, 3);
assert.equal(summed.inputTokens, 310);
assert.equal(summed.outputTokens, 130);
assert.equal(summed.totalTokens, 440);

console.log("usage passed");
