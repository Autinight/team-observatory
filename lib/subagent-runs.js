// Subagent run store compatibility — read subagent-runs.json from known paths,
// filter archived/invisible runs, and provide run-store detectors.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── path resolution ──────────────────────────────────────────────────────────

/**
 * Ordered candidate paths for subagent-runs.json.
 * Checks HANAKO_HOME, OPENHANAKO_HOME, ~/.hanako, and walks upward
 * from ctx.dataDir / ctx.pluginDir (max 8 levels).
 */
export function subagentRunStoreCandidates(ctx) {
  const candidates = new Set();
  const addHome = (home) => {
    if (home) candidates.add(path.join(home, "subagent-runs.json"));
  };
  addHome(process.env.HANAKO_HOME);
  addHome(process.env.OPENHANAKO_HOME);
  addHome(path.join(os.homedir(), ".hanako"));
  for (const base of [ctx?.dataDir, ctx?.pluginDir]) {
    if (!base) continue;
    let current = path.resolve(base);
    for (let i = 0; i < 8; i += 1) {
      candidates.add(path.join(current, "subagent-runs.json"));
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return Array.from(candidates);
}

// ── reading ───────────────────────────────────────────────────────────────────

/**
 * Read and parse the first readable subagent-runs.json found.
 * Returns an array of run records with a `taskId` field.
 * Returns empty array on error or when no store is found.
 */
export function readSubagentRunRecords(ctx) {
  for (const filePath of subagentRunStoreCandidates(ctx)) {
    try {
      if (!filePath || !fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const runs = raw?.runs && typeof raw.runs === "object" ? raw.runs : raw;
      return Object.entries(runs || {}).map(([taskId, value]) => ({ taskId, ...(value || {}) }));
    } catch (err) {
      ctx?.log?.debug?.(`read subagent run store failed: ${filePath}`, err?.message || String(err));
    }
  }
  return [];
}

// ── visibility ────────────────────────────────────────────────────────────────

/**
 * A run is visible when its parent session path exists and is not archived.
 */
export function isVisibleSubagentRun(run) {
  const parent = run?.parentSessionPath;
  if (!parent) return false;
  if (isArchivedSessionPath(parent)) return false;
  return fs.existsSync(parent);
}

/**
 * Detect archived session paths: contains "/sessions/archived/"
 * (case-insensitive on all platforms because we normalize before matching).
 */
export function isArchivedSessionPath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/sessions/archived/");
}
