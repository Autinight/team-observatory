// Smoke tests for subagent run store compatibility and merge logic.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  isArchivedSessionPath,
  isVisibleSubagentRun,
} from "../lib/subagent-runs.js";
import {
  normalizeSubagentRunRecords,
  mergeSubagentRuns,
} from "../lib/team-snapshot.js";

// ── isArchivedSessionPath ─────────────────────────────────────────────────────
assert.equal(isArchivedSessionPath(null), false);
assert.equal(isArchivedSessionPath("/sessions/archived/foo"), true);
assert.equal(isArchivedSessionPath("/Sessions/Archived/foo"), true);  // case-insensitive
assert.equal(isArchivedSessionPath("C:\\Users\\test\\.hanako\\sessions\\archived\\x.jsonl"), true);
assert.equal(isArchivedSessionPath("/sessions/active/foo"), false);

// ── fixture: readSubagentRunRecords shape ─────────────────────────────────────
{
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "subagent-runs-only.json"
  );
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const runs = Object.entries(raw.runs).map(([taskId, value]) => ({ taskId, ...value }));
  assert.equal(runs.length, 3);
  assert.equal(runs[0].taskId, "task-2026-001");
  assert.equal(runs[0].status, "completed");
  assert.equal(runs[1].status, "running");
  assert.equal(runs[2].status, "failed");
}

// ── isVisibleSubagentRun ──────────────────────────────────────────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "obs-test-"));
  const parent = path.join(tmp, "parent.jsonl");
  fs.writeFileSync(parent, "{}");

  // visible when parent exists and is not archived
  const run = { parentSessionPath: parent };
  assert.equal(isVisibleSubagentRun(run), true);

  // invisible when parent doesn't exist
  assert.equal(isVisibleSubagentRun({ parentSessionPath: "/nonexistent/path.jsonl" }), false);

  // invisible when no parent
  assert.equal(isVisibleSubagentRun({}), false);

  // invisible when archived
  const archivedDir = path.join(tmp, "sessions", "archived");
  fs.mkdirSync(archivedDir, { recursive: true });
  const archivedParent = path.join(archivedDir, "parent.jsonl");
  fs.writeFileSync(archivedParent, "{}");
  assert.equal(isVisibleSubagentRun({ parentSessionPath: archivedParent }), false);

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── mergeSubagentRuns: final run status wins ──────────────────────────────────
{
  const tasks = [
    {
      taskId: "m1",
      type: "subagent",
      status: "running",
      createdAt: "2026-05-29T00:00:00.000Z",
      agentId: "shiraha",
    },
  ];
  const runs = [
    {
      taskId: "m1",
      status: "completed",
      createdAt: "2026-05-29T00:05:00.000Z",
      updatedAt: "2026-05-29T00:10:00.000Z",
    },
  ];
  const merged = mergeSubagentRuns(tasks, runs);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].taskId, "m1");
  assert.equal(merged[0].status, "completed");
}

// ── mergeSubagentRuns: no matching run → task as-is ───────────────────────────
{
  const tasks = [
    {
      taskId: "m2",
      type: "subagent",
      status: "pending",
      createdAt: "2026-05-29T00:00:00.000Z",
      agentId: "rihane",
    },
  ];
  const merged = mergeSubagentRuns(tasks, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "pending");
}

// ── mergeSubagentRuns: more recent run wins ───────────────────────────────────
{
  const tasks = [
    {
      taskId: "m3",
      type: "subagent",
      status: "completed",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:05:00.000Z",
      agentId: "shiraha",
    },
  ];
  const runs = [
    {
      taskId: "m3",
      status: "failed",
      reason: "run store says failed, task says completed",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:10:00.000Z",  // more recent
    },
  ];
  const merged = mergeSubagentRuns(tasks, runs);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "failed");
}

// ── normalizeSubagentRunRecords shape ─────────────────────────────────────────
{
  const records = [
    {
      taskId: "nr-001",
      status: "running",
      createdAt: "2026-05-29T00:00:00.000Z",
      executorAgentId: "shiraha",
    },
  ];
  const normalized = normalizeSubagentRunRecords(records, { now: Date.parse("2026-05-29T00:00:00.000Z") });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].taskId, "nr-001");
  assert.equal(normalized[0].type, "subagent");
  assert.equal(normalized[0].observedStatus, "running");
}

console.log("subagent-runs passed");
