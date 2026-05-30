// Session metadata — title lookup, owner inference, dispatcher attachment,
// and low-level session-file reading utilities.
import fs from "node:fs";
import path from "node:path";
import { isArchivedSessionPath } from "./subagent-runs.js";

// ── text utilities ────────────────────────────────────────────────────────────

function contentText(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return null;
  return content
    .map((part) => typeof part === "string" ? part : part?.type === "text" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim() || null;
}

export function textOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 500);
  try { return JSON.stringify(value).slice(0, 500); } catch { return String(value).slice(0, 500); }
}

export function pathKey(value) {
  const normalized = normalizeSessionPathText(value);
  if (!normalized) return "";
  if (isWindowsAbsolutePath(normalized) || isUncPath(normalized)) {
    return normalized.toLowerCase();
  }
  return path.resolve(normalized).replace(/\\/g, "/").toLowerCase();
}

function normalizeSessionPathText(value) {
  if (!value) return "";
  return String(value).replace(/\\/g, "/");
}

function isWindowsAbsolutePath(value) {
  return /^[a-zA-Z]:\//.test(value);
}

function isUncPath(value) {
  return value.startsWith("//");
}

// ── session title lookup ──────────────────────────────────────────────────────

/**
 * Build a pathKey → session title map from session list results.
 * @param {Array<[agentId:string, sessions:Array]>} sessionResults
 * @returns {Map<string, string>}
 */
export function buildSessionTitleMap(sessionResults) {
  const map = new Map();
  for (const [, sessions] of sessionResults) {
    for (const session of sessions || []) {
      const key = pathKey(session?.path);
      if (!key) continue;
      const title = textOrNull(session.title || session.firstMessage || session.path);
      if (title) map.set(key, title);
    }
  }
  return map;
}

/**
 * Build a pathKey → {id, name} map from session list results,
 * inferring the owner agent for each session path.
 */
export function buildSessionOwnerMap(sessionResults, agents = []) {
  const agentById = new Map((agents || []).map((agent) => [agent.id, agent]));
  const map = new Map();
  for (const [agentId, sessions] of sessionResults) {
    const agent = agentById.get(agentId) || { id: agentId, name: agentId };
    for (const session of sessions || []) {
      const key = pathKey(session?.path);
      if (!key) continue;
      map.set(key, {
        id: agent.id || agentId,
        name: agent.name || agent.agentName || agent.id || agentId,
      });
    }
  }
  return map;
}

// ── attachment ────────────────────────────────────────────────────────────────

/**
 * Attach parent session titles to subagent records, falling back to
 * reading the session file directly.
 */
export function attachParentSessionTitles(subagents, sessionTitleByPath) {
  return subagents.map((task) => {
    const title = task.parentSessionTitle
      || sessionTitleByPath.get(pathKey(task.parentSessionPath))
      || readSessionTitleFromFile(task.parentSessionPath);
    return title ? { ...task, parentSessionTitle: title } : task;
  });
}

/**
 * Attach dispatcher metadata (executor/subagent agent ids and names) to subagent
 * records by looking up the session owner of the parent session path.
 */
export function attachSubagentDispatcherMetadata(subagents, sessionOwnerByPath, agents = []) {
  const agentById = new Map((agents || []).map((agent) => [agent.id, agent]));
  return subagents.map((task) => {
    const dispatcher = sessionOwnerByPath.get(pathKey(task.parentSessionPath))
      || agentForId(agentById, inferAgentIdFromSessionPath(task.parentSessionPath));
    if (!dispatcher?.id) return task;

    const dispatcherName = dispatcher.name || dispatcher.agentName || dispatcher.id;
    return {
      ...task,
      executorAgentId: dispatcher.id,
      executorAgentName: dispatcherName,
      dispatchingAgentId: dispatcher.id,
      dispatchingAgentName: dispatcherName,
      subagentAgentId: task.requestedAgentId || task.agentId || null,
      subagentAgentName: task.requestedAgentName || task.agentName || task.requestedAgentId || task.agentId || null,
    };
  });
}

// ── agent / path helpers ──────────────────────────────────────────────────────

function agentForId(agentById, agentId) {
  if (!agentId) return null;
  const agent = agentById.get(agentId);
  return agent || { id: agentId, name: agentId };
}

/**
 * Heuristic: extract the agent id from a session file path by looking for
 * the "sessions" directory segment and taking the previous segment.
 */
export function inferAgentIdFromSessionPath(sessionPath) {
  if (!sessionPath) return null;
  const parts = String(sessionPath).replace(/\\/g, "/").split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].toLowerCase() === "sessions" && i > 0) return parts[i - 1];
  }
  return null;
}

// ── low-level session file reading ────────────────────────────────────────────

/**
 * Try to read a session title from the first user message in the JSONL file.
 * Falls back to the archived copy if the main file is missing.
 */
function readSessionTitleFromFile(filePath) {
  for (const candidate of sessionTitleFileCandidates(filePath)) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const raw = fs.readFileSync(candidate, "utf-8");
      const lines = raw.split(/\r?\n/).filter(Boolean).slice(0, 40);
      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry?.type !== "message") continue;
        const message = entry.message || {};
        if (message.role !== "user") continue;
        const text = contentText(message.content);
        if (text) return text.slice(0, 80);
      }
    } catch {
      // corrupt line or parse error — skip
    }
  }
  return null;
}

function sessionTitleFileCandidates(filePath) {
  const normalized = normalizeSessionPathText(filePath);
  if (!normalized) return [];
  if (isArchivedSessionPath(normalized)) return [normalized];
  if (isWindowsAbsolutePath(normalized)) {
    const idx = normalized.lastIndexOf("/");
    if (idx === -1) return [normalized];
    const dir = normalized.slice(0, idx);
    const base = normalized.slice(idx + 1);
    return [normalized, `${dir}/archived/${base}`];
  }
  return [normalized, path.join(path.dirname(normalized), "archived", path.basename(normalized))];
}
