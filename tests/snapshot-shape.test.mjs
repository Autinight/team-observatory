// Smoke tests for snapshot shape: task normalization, status fields, and summary.
import assert from "node:assert/strict";
import {
  normalizeTasks,
  taskStatusFields,
  buildSummary,
} from "../lib/team-snapshot.js";

// ── normalizeTasks ────────────────────────────────────────────────────────────
{
  const raw = [
    {
      taskId: "t1",
      type: "subagent",
      status: "completed",
      createdAt: "2026-05-29T00:00:00.000Z",
      agentId: "shiraha",
      executorAgentId: "rihane",
    },
    {
      taskId: "t2",
      type: "subagent",
      status: "resolved",  // should normalize to completed
      createdAt: "2026-05-29T00:01:00.000Z",
      agentId: "shiraha",
    },
  ];
  const normalized = normalizeTasks(raw);
  assert.equal(normalized.length, 2);
  // sorted by updatedAt/createdAt desc — t2 is more recent
  assert.equal(normalized[0].taskId, "t2");
  assert.equal(normalized[0].observedStatus, "completed");  // resolved → completed
  assert.equal(normalized[1].taskId, "t1");
}

// ── normalizeTasks: edge cases ────────────────────────────────────────────────
{
  const normalized = normalizeTasks([]);
  assert.deepEqual(normalized, []);
}

// ── taskStatusFields ──────────────────────────────────────────────────────────
{
  const task = {
    taskId: "tsf-001",
    type: "subagent",
    status: "completed",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:10:00.000Z",
  };
  const fields = taskStatusFields(task, { now: Date.parse("2026-05-29T00:15:00.000Z") });
  assert.equal(fields.isActive, false);
  assert.equal(fields.isFailed, false);
  assert.equal(fields.isFinal, true);
  assert.equal(fields.canTerminate, false);
}
{
  // paused = active, terminable
  const task = {
    taskId: "tsf-002",
    type: "subagent",
    status: "paused",
    createdAt: "2026-05-29T00:00:00.000Z",
  };
  const fields = taskStatusFields(task, { now: Date.parse("2026-05-29T00:15:00.000Z") });
  assert.equal(fields.isActive, true);
  assert.equal(fields.canTerminate, true);
}
{
  // non-subagent → canTerminate false
  const task = {
    taskId: "tsf-003",
    type: "image_gen",
    status: "running",
    createdAt: "2026-05-29T00:00:00.000Z",
  };
  const fields = taskStatusFields(task, { now: Date.parse("2026-05-29T00:00:00.000Z") });
  assert.equal(fields.canTerminate, false);
}

// ── buildSummary ──────────────────────────────────────────────────────────────
{
  const tasks = [
    { status: "running" },
    { status: "running" },
    { status: "failed" },
  ];
  const subagents = [
    { status: "running" },
    { status: "completed" },
  ];
  const agents = [
    { status: "busy", health: { score: 70 } },
    { status: "active", health: { score: 90 } },
    { status: "stale", health: { score: 50 } },
  ];
  const usage = [];
  const alerts = [{}, {}, {}, {}];
  
  const summary = buildSummary(agents, tasks, subagents, usage, alerts);
  assert.equal(summary.agentCount, 3);
  assert.equal(summary.activeAgentCount, 1);  // busy
  assert.equal(summary.busyAgentCount, 1);
  assert.equal(summary.runningTaskCount, 2);
  assert.equal(summary.failedTaskCount, 1);
  assert.equal(summary.runningSubagentCount, 1);
  assert.equal(summary.failedSubagentCount, 0);
  assert.equal(summary.alertCount, 4);
}

console.log("snapshot-shape passed");
