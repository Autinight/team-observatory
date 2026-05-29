// Diagnose tool — produce a human-readable diagnosis text for an agent.
import { buildTeamSnapshot } from "./team-snapshot.js";
import { formatTokenCount } from "./utils.js";

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
