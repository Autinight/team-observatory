// Agent health computation, alerts, recommendations, and agent-matching helpers.
import { isActiveStatus, isFailedStatus } from "./status.js";
import { toIso, toTime } from "./utils.js";

const MINUTE = 60 * 1000;

// ── agent status projection ──────────────────────────────────────────────────

/**
 * Build a per-agent status object from sessions, tasks, subagents, and usage data.
 */
export function buildAgentStatus({ agent, sessions, tasks, subagents, usage, now, config }) {
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

// ── alerts ────────────────────────────────────────────────────────────────────

export function buildAlerts({ agents, tasks, subagents, now }) {
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

// ── health score ──────────────────────────────────────────────────────────────

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

// ── helpers ────────────────────────────────────────────────────────────────────

export function severityRank(severity) {
  return severity === "critical" ? 4 : severity === "warning" ? 3 : severity === "info" ? 2 : 1;
}

export function taskMatchesAgent(task, agentId) {
  return task.agentId === agentId || task.executorAgentId === agentId || task.requestedAgentId === agentId;
}

export function pickTargetAgent(snapshot, input) {
  const id = typeof input.agentId === "string" && input.agentId.trim() ? input.agentId.trim() : null;
  if (id && id !== "all" && id !== "current") {
    return snapshot.agents.find((agent) => agent.id === id || agent.name === id) || null;
  }
  if (id === "current") return snapshot.agents.find((agent) => agent.isCurrent) || null;
  const weak = [...snapshot.agents].sort((a, b) => a.health.score - b.health.score)[0];
  return weak || null;
}
