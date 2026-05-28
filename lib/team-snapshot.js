import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export async function buildTeamSnapshot(ctx, options = {}) {
  const now = Date.now();
  const config = readRuntimeConfig(ctx);
  const runtime = ctx._teamObservatory || null;
  if (runtime?.stats) runtime.stats.snapshotCount += 1;

  const [agentResult, allTasks, usageEntries] = await Promise.all([
    safeBusRequest(ctx, "agent:list", {}, { agents: [] }),
    safeBusRequest(ctx, "task:list", {}, []),
    safeBusRequest(ctx, "usage:list", { since: new Date(now - DAY).toISOString(), limit: 2000 }, []),
  ]);

  const agents = Array.isArray(agentResult?.agents) ? agentResult.agents : [];
  const tasks = Array.isArray(allTasks) ? allTasks : (Array.isArray(allTasks?.tasks) ? allTasks.tasks : []);
  const usage = Array.isArray(usageEntries) ? usageEntries : (Array.isArray(usageEntries?.entries) ? usageEntries.entries : []);

  const sessionResults = await Promise.all(agents.map(async (agent) => {
    const res = await safeBusRequest(ctx, "session:list", { agentId: agent.id }, { sessions: [] });
    return [agent.id, Array.isArray(res?.sessions) ? res.sessions : []];
  }));
  const sessionsByAgent = Object.fromEntries(sessionResults);

  const normalizedTasks = normalizeTasks(tasks);
  const subagents = mergeSubagentRuns(
    normalizedTasks.filter((task) => task.type === "subagent"),
    readSubagentRunRecords(ctx).filter((run) => isVisibleSubagentRun(run)),
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
      text: "Team Observatory: no agents found.",
      snapshot,
    };
  }

  const lines = [
    `Team Observatory diagnosis for ${agent.name || agent.id}`,
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
    `请派出 subagent，让 ${reviewer} 做一次 Team Observatory 诊断。`,
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

export async function safeBusRequest(ctx, type, payload = {}, fallback = null) {
  try {
    if (!ctx?.bus?.hasHandler?.(type)) return fallback;
    return await ctx.bus.request(type, payload);
  } catch (err) {
    ctx?.log?.debug?.(`bus request ${type} failed`, err?.message || String(err));
    return fallback;
  }
}

export function readRuntimeConfig(ctx) {
  const values = ctx?.config?.getAll?.({ redacted: false }) || {};
  return {
    refreshIntervalMs: clampNumber(values.refreshIntervalMs, 3000, 1000, 60000),
    staleAfterMinutes: clampNumber(values.staleAfterMinutes, 90, 5, 24 * 60),
    enableSse: values.enableSse !== false,
    enableAgentDispatch: values.enableAgentDispatch !== false,
  };
}

function buildAgentStatus({ agent, sessions, tasks, subagents, usage, now, config }) {
  const sortedSessions = [...sessions].sort((a, b) => toTime(b.modified) - toTime(a.modified));
  const lastSession = sortedSessions[0] || null;
  const lastSeenAt = lastSession?.modified ? new Date(lastSession.modified).toISOString() : null;
  const lastSeenMs = toTime(lastSession?.modified);
  const ageMinutes = lastSeenMs ? (now - lastSeenMs) / MINUTE : Infinity;

  const relatedTasks = tasks.filter((task) => taskMatchesAgent(task, agent.id));
  const activeTasks = relatedTasks.filter((task) => isActiveStatus(task.status));
  const failedTasks = relatedTasks.filter((task) => isFailedStatus(task.status));
  const relatedSubagents = subagents.filter((task) => taskMatchesAgent(task, agent.id));
  const runningSubagents = relatedSubagents.filter((task) => isActiveStatus(task.status));
  const failedSubagents = relatedSubagents.filter((task) => isFailedStatus(task.status));

  const status = failedTasks.length > 0
    ? "error"
    : activeTasks.length > 0
      ? "busy"
      : ageMinutes <= 20 || agent.isCurrent
        ? "active"
        : ageMinutes > config.staleAfterMinutes
          ? "stale"
          : "idle";

  const health = computeHealth({
    status,
    ageMinutes,
    activeTasks,
    failedTasks,
    runningSubagents,
    failedSubagents,
    usage,
    config,
  });

  const recommendations = buildAgentRecommendations({
    status,
    ageMinutes,
    activeTasks,
    failedTasks,
    failedSubagents,
    usage,
    agent,
  });

  return {
    id: agent.id,
    name: agent.name || agent.id,
    isCurrent: !!agent.isCurrent,
    isPrimary: !!agent.isPrimary,
    status,
    lastSeenAt,
    staleMinutes: Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null,
    sessionCount: sessions.length,
    recentSessions: sortedSessions.slice(0, 6).map((session) => ({
      path: session.path,
      title: session.title || session.firstMessage || "Untitled session",
      firstMessage: session.firstMessage || "",
      modified: toIso(session.modified),
      modelId: session.modelId || null,
      cwd: session.cwd || null,
      messageCount: session.messageCount || 0,
    })),
    lastSession: lastSession ? {
      path: lastSession.path,
      title: lastSession.title || lastSession.firstMessage || "Untitled session",
      modified: toIso(lastSession.modified),
      modelId: lastSession.modelId || null,
      cwd: lastSession.cwd || null,
    } : null,
    activeTaskCount: activeTasks.length,
    failedTaskCount: failedTasks.length,
    subagentRunningCount: runningSubagents.length,
    subagentFailedCount: failedSubagents.length,
    usage24h: usage,
    health,
    recommendations,
  };
}

function normalizeTasks(tasks) {
  return [...tasks]
    .map((task) => {
      const meta = task.meta || {};
      return {
        taskId: String(task.taskId || task.id || ""),
        type: String(task.type || meta.type || "unknown"),
        status: normalizeTaskStatus(task.status),
        parentSessionPath: task.parentSessionPath || task.sessionPath || null,
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
      };
    })
    .filter((task) => task.taskId)
    .sort((a, b) => toTime(b.updatedAt || b.createdAt) - toTime(a.updatedAt || a.createdAt));
}

function normalizeSubagentRunRecords(records) {
  return [...records]
    .map((run) => ({
      taskId: String(run.taskId || run.id || ""),
      type: "subagent",
      status: normalizeTaskStatus(run.status),
      parentSessionPath: run.parentSessionPath || null,
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
    }))
    .filter((task) => task.taskId);
}

function mergeSubagentRuns(taskSubagents, runRecords) {
  const map = new Map();
  for (const run of normalizeSubagentRunRecords(runRecords)) {
    map.set(run.taskId, run);
  }
  for (const task of taskSubagents) {
    const existing = map.get(task.taskId);
    if (!existing) {
      map.set(task.taskId, { ...task, source: "task-registry" });
      continue;
    }
    const finalRunStatus = isFinalStatus(existing.status);
    map.set(task.taskId, {
      ...existing,
      ...task,
      status: finalRunStatus ? existing.status : task.status,
      childSessionPath: task.childSessionPath || existing.childSessionPath || null,
      completedAt: task.completedAt || existing.completedAt || null,
      summary: task.summary || existing.summary || null,
      reason: task.reason || existing.reason || null,
      source: "merged",
    });
  }
  return Array.from(map.values())
    .sort((a, b) => toTime(b.updatedAt || b.completedAt || b.createdAt) - toTime(a.updatedAt || a.completedAt || a.createdAt));
}

function readSubagentRunRecords(ctx) {
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

function subagentRunStoreCandidates(ctx) {
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

function isVisibleSubagentRun(run) {
  const parent = run?.parentSessionPath;
  if (!parent) return false;
  if (isArchivedSessionPath(parent)) return false;
  return fs.existsSync(parent);
}

function isArchivedSessionPath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/sessions/archived/");
}

function normalizeUsage(entries) {
  return [...entries]
    .map((entry) => {
      const usage = entry.usage || entry;
      const attribution = entry.attribution || entry.source?.attribution || {};
      return {
        id: entry.id || entry.ts || Math.random().toString(36).slice(2),
        ts: toIso(entry.ts || entry.createdAt || entry.time || Date.now()),
        agentId: entry.agentId || attribution.agentId || entry.source?.agentId || null,
        sessionPath: entry.sessionPath || attribution.sessionPath || null,
        modelId: entry.modelId || entry.model || null,
        provider: entry.provider || entry.modelProvider || null,
        inputTokens: numberOf(usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens),
        outputTokens: numberOf(usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens),
        totalTokens: numberOf(usage.totalTokens ?? usage.total_tokens ?? usage.tokens),
        cost: numberOf(entry.cost ?? entry.estimatedCost ?? usage.cost),
      };
    })
    .map((item) => ({
      ...item,
      totalTokens: item.totalTokens || item.inputTokens + item.outputTokens,
    }))
    .sort((a, b) => toTime(b.ts) - toTime(a.ts));
}

function groupUsageByAgent(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = entry.agentId || "unknown";
    if (!map.has(key)) map.set(key, emptyUsageBucket(key));
    const bucket = map.get(key);
    bucket.inputTokens += entry.inputTokens;
    bucket.outputTokens += entry.outputTokens;
    bucket.totalTokens += entry.totalTokens;
    bucket.estimatedCost += entry.cost;
    bucket.calls += 1;
  }
  return map;
}

function emptyUsageBucket(agentId) {
  return { agentId, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, calls: 0 };
}

function sumUsage(entries) {
  return entries.reduce((acc, entry) => {
    acc.inputTokens += entry.inputTokens;
    acc.outputTokens += entry.outputTokens;
    acc.totalTokens += entry.totalTokens;
    acc.estimatedCost += entry.cost;
    acc.calls += 1;
    return acc;
  }, emptyUsageBucket("all"));
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

function buildAlerts({ agents, tasks, subagents, now }) {
  const alerts = [];
  for (const agent of agents) {
    if (agent.health.score < 60) {
      alerts.push({
        id: `agent-health-${agent.id}`,
        severity: agent.health.score < 40 ? "critical" : "warning",
        agentId: agent.id,
        title: `${agent.name} health is low`,
        message: agent.health.reasons[0] || "Agent health score dropped.",
        ts: now,
      });
    }
    if (agent.status === "stale") {
      alerts.push({
        id: `agent-stale-${agent.id}`,
        severity: "info",
        agentId: agent.id,
        title: `${agent.name} is quiet`,
        message: `No recent session activity for ${agent.staleMinutes ?? "many"} minutes.`,
        ts: now,
      });
    }
  }

  for (const task of tasks.filter((item) => isFailedStatus(item.status)).slice(0, 8)) {
    alerts.push({
      id: `task-failed-${task.taskId}`,
      severity: "warning",
      agentId: task.agentId || task.executorAgentId || task.requestedAgentId || null,
      taskId: task.taskId,
      title: `Task failed: ${task.type}`,
      message: task.reason || task.summary || task.taskId,
      ts: toTime(task.updatedAt || task.completedAt || task.createdAt) || now,
    });
  }

  for (const task of subagents.filter((item) => isActiveStatus(item.status) && item.ageMs > 15 * MINUTE).slice(0, 6)) {
    alerts.push({
      id: `subagent-long-${task.taskId}`,
      severity: "warning",
      agentId: task.executorAgentId || task.requestedAgentId || null,
      taskId: task.taskId,
      title: "Subagent has been running for a while",
      message: `${task.taskId} has been active for ${Math.round(task.ageMs / MINUTE)} minutes.`,
      ts: now,
    });
  }

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.ts - a.ts).slice(0, 24);
}

function computeHealth({ status, ageMinutes, activeTasks, failedTasks, runningSubagents, failedSubagents, usage, config }) {
  let score = 100;
  const reasons = [];

  if (failedTasks.length) {
    const penalty = Math.min(40, failedTasks.length * 15);
    score -= penalty;
    reasons.push(`${failedTasks.length} failed task${failedTasks.length > 1 ? "s" : ""}`);
  }
  if (failedSubagents.length) {
    const penalty = Math.min(30, failedSubagents.length * 12);
    score -= penalty;
    reasons.push(`${failedSubagents.length} failed subagent run${failedSubagents.length > 1 ? "s" : ""}`);
  }
  const longTasks = activeTasks.filter((task) => task.ageMs > 15 * MINUTE).length;
  if (longTasks) {
    score -= Math.min(25, longTasks * 10);
    reasons.push(`${longTasks} long-running task${longTasks > 1 ? "s" : ""}`);
  }
  if (runningSubagents.length > 3) {
    score -= 10;
    reasons.push("subagent concurrency is high");
  }
  if (ageMinutes > config.staleAfterMinutes) {
    score -= status === "stale" ? 8 : 4;
    reasons.push("no recent session activity");
  }
  if (usage.totalTokens > 250000) {
    score -= 8;
    reasons.push("24h token pressure is high");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

function buildAgentRecommendations({ status, activeTasks, failedTasks, failedSubagents, usage, agent }) {
  const recs = [];
  if (failedTasks.length || failedSubagents.length) recs.push("Run a focused diagnosis before dispatching more work.");
  if (activeTasks.length > 3) recs.push("Avoid assigning additional parallel tasks until the queue drains.");
  if (status === "stale" && !agent.isPrimary) recs.push("Keep as reserve reviewer; no intervention required.");
  if (usage.totalTokens > 250000) recs.push("Consider lighter models or shorter context for routine checks.");
  if (!recs.length) recs.push("No intervention needed. Good candidate for ordinary delegation.");
  return recs;
}

function pickTargetAgent(snapshot, input) {
  const id = typeof input.agentId === "string" && input.agentId.trim() ? input.agentId.trim() : null;
  if (id && id !== "all" && id !== "current") {
    return snapshot.agents.find((agent) => agent.id === id || agent.name === id) || null;
  }
  if (id === "current") return snapshot.agents.find((agent) => agent.isCurrent) || null;
  const weak = [...snapshot.agents].sort((a, b) => a.health.score - b.health.score)[0];
  return weak || null;
}

function taskMatchesAgent(task, agentId) {
  return task.agentId === agentId || task.executorAgentId === agentId || task.requestedAgentId === agentId;
}

function isActiveStatus(status) {
  return ["pending", "running", "paused", "blocked", "recovering"].includes(status);
}

function isFailedStatus(status) {
  return ["failed", "aborted", "canceled", "cancelled"].includes(status);
}

function isFinalStatus(status) {
  return ["completed", "resolved", "failed", "aborted", "canceled", "cancelled"].includes(status);
}

function normalizeTaskStatus(status) {
  const text = String(status || "unknown").toLowerCase();
  if (text === "resolved" || text === "completed" || text === "success") return "completed";
  if (text === "cancelled") return "canceled";
  return text;
}

function severityRank(severity) {
  return severity === "critical" ? 4 : severity === "warning" ? 3 : severity === "info" ? 2 : 1;
}

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function numberOf(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function textOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 500);
  try { return JSON.stringify(value).slice(0, 500); } catch { return String(value).slice(0, 500); }
}

function toTime(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function toIso(value) {
  const t = toTime(value);
  return t ? new Date(t).toISOString() : null;
}

function ageMs(value) {
  const t = toTime(value);
  return t ? Math.max(0, Date.now() - t) : 0;
}

function formatTokenCount(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
