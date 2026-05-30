import {
  isActiveStatus,
  isFailedStatus,
  isFinalStatus,
  isTerminableStatus,
  normalizeTaskStatus,
  observedStatus,
} from "./status.js";
import {
  listAgents,
  listTasks,
  listSessions,
  safeBusRequest,
} from "./core-adapter.js";
import {
  isArchivedSessionPath,
  isVisibleSubagentRun,
  readSubagentRunRecords,
} from "./subagent-runs.js";
import {
  attachParentSessionTitles,
  attachSubagentDispatcherMetadata,
  buildSessionOwnerMap,
  buildSessionTitleMap,
  inferAgentIdFromSessionPath,
  pathKey,
  textOrNull,
} from "./sessions.js";
import { ageMs, clampNumber, numberOf, toIso, toTime } from "./utils.js";

const MINUTE = 60 * 1000;

export async function buildTeamSnapshot(ctx, options = {}) {
  const now = Date.now();
  const config = readRuntimeConfig(ctx);

  const [agentResult, taskResult] = await Promise.all([
    listAgents(ctx),
    listTasks(ctx),
  ]);

  const agents = agentResult.value;
  const tasks = taskResult.value;

  const sessionResults = await Promise.all(agents.map(async (agent) => {
    const res = await listSessions(ctx, agent.id);
    return [agent.id, res.value];
  }));
  const sessionsByAgent = Object.fromEntries(sessionResults);
  const sessionTitleByPath = buildSessionTitleMap(sessionResults);
  const sessionOwnerByPath = buildSessionOwnerMap(sessionResults, agents);

  const normalizedTasks = normalizeTasks(tasks, { now, staleAfterMs: config.staleAfterMinutes * MINUTE });
  const visibleTaskSubagents = normalizedTasks.filter((task) => task.type === "subagent" && isVisibleSubagentRun(task));
  const visibleRunRecords = readSubagentRunRecords(ctx).filter((run) => isVisibleSubagentRun(run));
  const subagents = attachSubagentDispatcherMetadata(
    attachParentSessionTitles(
      mergeSubagentRuns(visibleTaskSubagents, visibleRunRecords, { now, staleAfterMs: config.staleAfterMinutes * MINUTE }),
      sessionTitleByPath,
    ),
    sessionOwnerByPath,
    agents,
  );
  const agentSummaries = agents.map((agent) => buildAgentSummary({
    agent,
    sessions: sessionsByAgent[agent.id] || [],
  }));

  return {
    schemaVersion: 1,
    ts: now,
    generatedAt: new Date(now).toISOString(),
    config,
    agents: agentSummaries,
    tasks: normalizedTasks.slice(0, options.taskLimit || 80),
    subagents: subagents.slice(0, options.subagentLimit || 80),
  };
}

export { safeBusRequest } from "./core-adapter.js";

export { mergeSubagentRuns, normalizeSubagentRunRecords, normalizeTasks, taskStatusFields };

export function readRuntimeConfig(ctx) {
  const values = ctx?.config?.getAll?.({ redacted: false }) || {};
  return {
    refreshIntervalMs: clampNumber(values.refreshIntervalMs, 3000, 1000, 60000),
    staleAfterMinutes: clampNumber(values.staleAfterMinutes, 90, 5, 24 * 60),
    enableSse: values.enableSse !== false,
  };
}

function normalizeTasks(tasks, options = {}) {
  return [...tasks]
    .map((task) => {
      const meta = task.meta || {};
      const normalized = {
        taskId: String(task.taskId || task.id || ""),
        type: String(task.type || meta.type || "unknown"),
        status: normalizeTaskStatus(task.status),
        parentSessionPath: task.parentSessionPath || task.sessionPath || null,
        parentSessionTitle: task.parentSessionTitle || meta.parentSessionTitle || null,
        childSessionPath: task.childSessionPath || meta.childSessionPath || meta.sessionPath || null,
        pluginId: task.pluginId || null,
        agentId: task.agentId || meta.agentId || meta.executorAgentId || null,
        requestedAgentId: task.requestedAgentId || meta.requestedAgentId || null,
        requestedAgentName: task.requestedAgentNameSnapshot || meta.requestedAgentNameSnapshot || null,
        executorAgentId: task.executorAgentId || meta.executorAgentId || null,
        executorAgentName: task.executorAgentNameSnapshot || meta.executorAgentNameSnapshot || null,
        summary: textOrNull(task.summary || meta.summary || task.result?.summary || task.result),
        reason: textOrNull(task.reason || task.error?.message || task.error),
        createdAt: toIso(task.createdAt),
        updatedAt: toIso(task.updatedAt),
        completedAt: toIso(task.completedAt),
        ageMs: ageMs(task.createdAt),
        abortable: String(task.type || meta.type || "unknown") === "subagent" && isActiveStatus(normalizeTaskStatus(task.status)),
        registryStatus: normalizeTaskStatus(task.status),
      };
      return { ...normalized, ...taskStatusFields(normalized, options) };
    })
    .filter((task) => task.taskId)
    .sort((a, b) => toTime(b.updatedAt || b.createdAt) - toTime(a.updatedAt || a.createdAt));
}

function normalizeSubagentRunRecords(records, options = {}) {
  return [...records]
    .map((run) => {
      const normalized = {
        taskId: String(run.taskId || run.id || ""),
        type: "subagent",
        status: normalizeTaskStatus(run.status),
        parentSessionPath: run.parentSessionPath || null,
        parentSessionTitle: run.parentSessionTitle || null,
        childSessionPath: run.childSessionPath || run.sessionPath || null,
        pluginId: null,
        agentId: run.agentId || run.executorAgentId || run.requestedAgentId || null,
        requestedAgentId: run.requestedAgentId || null,
        requestedAgentName: run.requestedAgentNameSnapshot || run.requestedAgentName || null,
        executorAgentId: run.executorAgentId || null,
        executorAgentName: run.executorAgentNameSnapshot || run.executorAgentName || null,
        summary: textOrNull(run.summary || run.result),
        reason: textOrNull(run.reason || run.error?.message || run.error),
        createdAt: toIso(run.createdAt),
        updatedAt: toIso(run.updatedAt),
        completedAt: toIso(run.completedAt),
        ageMs: ageMs(run.createdAt),
        source: "subagent-run-store",
      };
      return { ...normalized, ...taskStatusFields(normalized, options) };
    })
    .filter((task) => task.taskId);
}

function mergeSubagentRuns(taskSubagents, runRecords, options = {}) {
  const map = new Map();
  for (const run of normalizeSubagentRunRecords(runRecords, options)) {
    map.set(run.taskId, run);
  }
  for (const task of taskSubagents) {
    const existing = map.get(task.taskId);
    if (!existing) {
      map.set(task.taskId, { ...task, source: "task-registry", abortable: !!task.abortable });
      continue;
    }
    const finalRunStatus = isFinalStatus(existing.status);
    const merged = {
      ...existing,
      ...task,
      status: finalRunStatus ? existing.status : task.status,
      childSessionPath: task.childSessionPath || existing.childSessionPath || null,
      parentSessionTitle: task.parentSessionTitle || existing.parentSessionTitle || null,
      completedAt: task.completedAt || existing.completedAt || null,
      summary: task.summary || existing.summary || null,
      reason: task.reason || existing.reason || null,
      abortable: !!task.abortable,
      registryStatus: task.registryStatus || null,
      source: "merged",
    };
    map.set(task.taskId, { ...merged, ...taskStatusFields(merged, options) });
  }
  return Array.from(map.values())
    .sort((a, b) => toTime(b.updatedAt || b.completedAt || b.createdAt) - toTime(a.updatedAt || a.completedAt || a.createdAt));
}

function taskStatusFields(task, options = {}) {
  const status = normalizeTaskStatus(task?.status);
  const displayStatus = observedStatus(task, options);
  return {
    observedStatus: displayStatus,
    isActive: isActiveStatus(status),
    isFailed: isFailedStatus(status),
    isFinal: isFinalStatus(status),
    canTerminate: task?.type === "subagent" && isTerminableStatus(displayStatus),
  };
}

function buildAgentSummary({ agent, sessions }) {
  const sortedSessions = [...sessions].sort((a, b) => toTime(b.modified) - toTime(a.modified));
  const lastSession = sortedSessions[0] || null;

  return {
    id: agent.id,
    name: agent.name || agent.id,
    isCurrent: !!agent.isCurrent,
    isPrimary: !!agent.isPrimary,
    lastSession: lastSession ? {
      path: lastSession.path,
      title: lastSession.title || lastSession.firstMessage || "Untitled session",
      modified: toIso(lastSession.modified),
      modelId: lastSession.modelId || null,
      cwd: lastSession.cwd || null,
    } : null,
    recentSessions: sortedSessions.slice(0, 6).map((session) => ({
      path: session.path,
      title: session.title || session.firstMessage || "Untitled session",
      firstMessage: session.firstMessage || "",
      modified: toIso(session.modified),
      modelId: session.modelId || null,
      cwd: session.cwd || null,
      messageCount: session.messageCount || 0,
    })),
  };
}
