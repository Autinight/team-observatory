// Dispatch prompt builder — construct a review prompt for subagent diagnosis.
import { buildTeamSnapshot } from "./team-snapshot.js";
import { pickTargetAgent } from "./health.js";

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
