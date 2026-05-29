// Smoke tests for health/alerts/agent helpers.
import assert from "node:assert/strict";
import {
  severityRank,
  taskMatchesAgent,
} from "../lib/health.js";

// severityRank: critical > warning > info > anything else
assert.ok(severityRank("critical") > severityRank("warning"));
assert.ok(severityRank("warning") > severityRank("info"));
assert.equal(severityRank("critical"), 4);
assert.equal(severityRank("warning"), 3);
assert.equal(severityRank("info"), 2);
assert.equal(severityRank("unknown"), 1);

// taskMatchesAgent
assert.equal(taskMatchesAgent({ agentId: "shiraha" }, "shiraha"), true);
assert.equal(taskMatchesAgent({ executorAgentId: "shiraha" }, "shiraha"), true);
assert.equal(taskMatchesAgent({ requestedAgentId: "shiraha" }, "shiraha"), true);
assert.equal(taskMatchesAgent({ agentId: "shiraha" }, "rihane"), false);
assert.equal(taskMatchesAgent({}, "shiraha"), false);
assert.equal(taskMatchesAgent({ agentId: null, executorAgentId: null }, "shiraha"), false);

console.log("health passed");
