import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  listUsage,
  listSessions,
  probeCapabilities,
  safeBusRequest,
} from "./core-adapter.js";
import {
  isArchivedSessionPath,
  isVisibleSubagentRun,
  readSubagentRunRecords,
  subagentRunStoreCandidates,
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
import { groupUsageByAgent, normalizeUsage, sumUsage } from "./usage.js";
import { buildAgentStatus, buildAlerts, pickTargetAgent, severityRank, taskMatchesAgent } from "./health.js";
import { ageMs, clampNumber, formatTokenCount, numberOf, toIso, toTime } from "./utils.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function collectRunStoreInfo(ctx) {
  for (const candidate of subagentRunStoreCandidates(ctx)) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return { available: true, source: path.basename(candidate), error: null };
      }
    } catch {
      // permissions / broken path — skip
    }
  }
  return { available: false, source: null, error: "no subagent-runs.json found" };
}

export async function buildTeamSnapshot(ctx, options = {}) {
  const now = Date.now();
  const config = readRuntimeConfig(ctx);
  const runtime = ctx._teamObservatory || null;
  if (runtime?.stats) runtime.stats.snapshotCount += 1;

  const [agentResult, taskResult, usageResult] = await Promise.all([
    listAgents(ctx),
    listTasks(ctx),
    listUsage(ctx, new Date(now - DAY).toISOString(), 2000),
  ]);

  const agents = agentResult.value;
  const tasks = taskResult.value;
  const usageEntries = usageResult.value;

  const sessionResults = await Promise.all(agents.map(async (agent) => {
    const res = await listSessions(ctx, agent.id);
    return [agent.id, res.value];
  }));
  const sessionsByAgent = Object.fromEntries(sessionResults);
  const sessionTitleByPath = buildSessionTitleMap(sessionResults);
  const sessionOwnerByPath = buildSessionOwnerMap(sessionResults, agents);

  const usage = usageEntries;
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
  const normalizedUsage = normalizeUsage(usage);
  const usageByAgent = groupUsageByAgent(normalizedUsage);

  const agentStatuses = agents.map((agent) => buildAgentStatus({
    agent,
    sessions: sessionsByAgent[agent.id] || [],
    tasks: normalizedTasks,
    subagents,
    usage: usageByAgent.get(agent.id) || emptyUsageBucket(agent.id),
    now,
    config,
  }));

  const runStoreInfo = collectRunStoreInfo(ctx);
  const coreCapabilities = await probeCapabilities(ctx);

  const alerts = buildAlerts({ agents: agentStatuses, tasks: normalizedTasks, subagents, now });

  return {
    schemaVersion: 1,
    ts: now,
    generatedAt: new Date(now).toISOString(),
    runtime: {
      startedAt: runtime?.startedAt || null,
      dirtyAt: runtime?.dirtyAt || null,
      lastEvent: runtime?.lastEvent || null,
      eventCount: runtime?.stats?.eventCount || 0,
      snapshotCount: runtime?.stats?.snapshotCount || 0,
    },
    config,
    capabilities: {
      ...coreCapabilities,
      runStore: runStoreInfo,
    },
    summary: buildSummary(agentStatuses, normalizedTasks, subagents, normalizedUsage, alerts),
    agents: agentStatuses,
    tasks: normalizedTasks.slice(0, options.taskLimit || 80),
    subagents: subagents.slice(0, options.subagentLimit || 80),
    usage: {
      total24h: sumUsage(normalizedUsage),
      byAgent: Array.from(usageByAgent.values()),
      recent: normalizedUsage.slice(0, 160),
    },
    alerts,
  };
}

export async function diagnoseAgent(ctx, input = {}) {
  const snapshot = await buildTeamSnapshot(ctx, { taskLimit: 120, subagentLimit: 120 });
  const requested = typeof input.agentId === "string" ? input.agentId.trim() : "";
  const agent = requested && requested !== "current"
    ? snapshot.agents.find((item) => item.id === requested || item.name === requested)
    : snapshot.agents.find((item) => item.isCurrent) || snapshot.agents.find((item) => item.isPrimary) || snapshot.agents[0];

  if (!agent) {
    return {
      ok: false,
      text: "Subagent Observatory: no agents found.",
      snapshot,
    };
  }

  const lines = [
    `Subagent Observatory diagnosis for ${agent.name || agent.id}`,
    `status: ${agent.status}, health: ${agent.health.score}/100`,
    `recent sessions: ${agent.sessionCount}, active tasks: ${agent.activeTaskCount}, failed tasks: ${agent.failedTaskCount}`,
    `subagents: ${agent.subagentRunningCount} running, ${agent.subagentFailedCount} failed`,
    `usage 24h: ${formatTokenCount(agent.usage24h.totalTokens)} tokens`,
  ];

  if (agent.health.reasons.length) {
    lines.push("reasons:");
    for (const reason of agent.health.reasons) lines.push(`- ${reason}`);
  }
  if (agent.recommendations.length) {
    lines.push("recommendations:");
    for (const rec of agent.recommendations) lines.push(`- ${rec}`);
  }

  return {
    ok: true,
    agent,
    text: lines.join("\n"),
    snapshot,
  };
}

export async function buildDispatchPrompt(ctx, input = {}) {
  const snapshot = await buildTeamSnapshot(ctx, { taskLimit: 120, subagentLimit: 120 });
  const targetAgent = pickTargetAgent(snapshot, input);
  const reviewer = typeof input.reviewerAgentId === "string" && input.reviewerAgentId.trim()
    ? input.reviewerAgentId.trim()
    : "rihane";
  const focus = typeof input.focus === "string" && input.focus.trim()
    ? input.focus.trim()
    : "检查最近异常任务、subagent 失败和 agent 负载，给出下一步建议";

  const relatedAlerts = snapshot.alerts
    .filter((alert) => !targetAgent || alert.agentId === targetAgent.id || alert.severity === "critical")
    .slice(0, 8);
  const relatedTasks = snapshot.tasks
    .filter((task) => !targetAgent || task.agentId === targetAgent.id || task.executorAgentId === targetAgent.id || task.requestedAgentId === targetAgent.id)
    .slice(0, 8);

  const prompt = [
    `请派出 subagent，让 ${reviewer} 做一次 Subagent Observatory 诊断。`,
    "",
    `目标 agent：${targetAgent ? `${targetAgent.id} (${targetAgent.name})` : "全体 agent team"}`,
    `关注点：${focus}`,
    "",
    "当前观测摘要：",
    `- agent 总数：${snapshot.summary.agentCount}`,
    `- active/busy：${snapshot.summary.activeAgentCount}/${snapshot.summary.busyAgentCount}`,
    `- running tasks：${snapshot.summary.runningTaskCount}`,
    `- failed tasks：${snapshot.summary.failedTaskCount}`,
    `- running subagents：${snapshot.summary.runningSubagentCount}`,
    `- alerts：${snapshot.alerts.length}`,
    "",
    "相关告警：",
    ...(relatedAlerts.length ? relatedAlerts.map((alert) => `- [${alert.severity}] ${alert.title}: ${alert.message}`) : ["- 无显著告警"]),
    "",
    "相关任务：",
    ...(relatedTasks.length ? relatedTasks.map((task) => `- ${task.taskId} (${task.type}/${task.status}): ${task.summary || task.reason || "no summary"}`) : ["- 无相关任务"]),
    "",
    "要求：",
    "1. 只做只读诊断，不修改文件，不发送外部消息。",
    "2. 判断最可能的问题来源。",
    "3. 给出是否需要重试、终止、拆分任务或换 agent 的建议。",
    "4. 输出简短结论和可执行下一步。",
  ].join("\n");

  return {
    prompt,
    snapshot,
    targetAgent,
    reviewer,
  };
}

export { safeBusRequest } from "./core-adapter.js";

export function readRuntimeConfig(ctx) {
  const values = ctx?.config?.getAll?.({ redacted: false }) || {};
  return {
    refreshIntervalMs: clampNumber(values.refreshIntervalMs, 3000, 1000, 60000),
    staleAfterMinutes: clampNumber(values.staleAfterMinutes, 90, 5, 24 * 60),
    enableSse: values.enableSse !== false,
    enableAgentDispatch: values.enableAgentDispatch !== false,
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

function buildSummary(agents, tasks, subagents, usage, alerts) {
  return {
    agentCount: agents.length,
    activeAgentCount: agents.filter((a) => a.status === "active").length,
    busyAgentCount: agents.filter((a) => a.status === "busy").length,
    staleAgentCount: agents.filter((a) => a.status === "stale").length,
    errorAgentCount: agents.filter((a) => a.status === "error").length,
    runningTaskCount: tasks.filter((task) => isActiveStatus(task.status)).length,
    failedTaskCount: tasks.filter((task) => isFailedStatus(task.status)).length,
    runningSubagentCount: subagents.filter((task) => isActiveStatus(task.status)).length,
    failedSubagentCount: subagents.filter((task) => isFailedStatus(task.status)).length,
    token24h: sumUsage(usage).totalTokens,
    alertCount: alerts.length,
    healthScore: agents.length
      ? Math.round(agents.reduce((sum, agent) => sum + agent.health.score, 0) / agents.length)
      : 100,
  };
}
