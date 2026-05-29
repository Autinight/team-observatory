// Chat — subagent conversation panel API.
import { buildTeamSnapshot, safeBusRequest } from "../lib/team-snapshot.js";

export async function handleSubagentChat(c, ctx) {
  const taskId = String(c.req.query("taskId") || "").trim();
  const limit = clampHistoryLimit(c.req.query("limit"));
  if (!taskId) return c.json({ error: "taskId is required" }, 400);

  const snapshot = await buildTeamSnapshot(ctx, { taskLimit: 200, subagentLimit: 200 });
  const task = (snapshot.subagents || []).find((item) => item.taskId === taskId);
  if (!task) return c.json({ error: "subagent task not found" }, 404);

  const childHistory = await readSessionHistory(ctx, task.childSessionPath, limit);

  return c.json({
    taskId,
    task,
    main: {
      kind: "main",
      agentId: task.dispatchingAgentId || task.executorAgentId || null,
      agentName: task.dispatchingAgentName || task.executorAgentName || null,
      sessionPath: task.parentSessionPath || null,
      sessionTitle: task.parentSessionTitle || null,
    },
    child: {
      kind: "subagent",
      agentId: task.subagentAgentId || task.requestedAgentId || task.agentId || null,
      agentName: task.subagentAgentName || task.requestedAgentName || task.agentName || null,
      sessionPath: task.childSessionPath || null,
      sessionTitle: task.summary || task.taskId,
      ...childHistory,
    },
    snapshotTs: snapshot.ts,
  });
}

async function readSessionHistory(ctx, sessionPath, limit) {
  if (!sessionPath) {
    return { available: false, messages: [], error: "session path unavailable" };
  }
  const result = await safeBusRequest(ctx, "session:history", { sessionPath, limit }, null);
  if (!result || !Array.isArray(result.messages)) {
    return { available: false, messages: [], error: result?.error || "session history unavailable" };
  }
  return {
    available: true,
    messages: result.messages.map(normalizeHistoryMessage),
    error: null,
  };
}

function normalizeHistoryMessage(message) {
  const content = typeof message?.content === "string" ? message.content : JSON.stringify(message?.content ?? "");
  return {
    role: message?.role || "unknown",
    content,
    thinking: typeof message?.thinking === "string" ? message.thinking : null,
    toolCalls: Array.isArray(message?.toolCalls) ? message.toolCalls : [],
    images: Array.isArray(message?.images) ? message.images : [],
  };
}

function clampHistoryLimit(value) {
  const n = Number(value || 80);
  if (!Number.isFinite(n)) return 80;
  return Math.max(10, Math.min(200, Math.round(n)));
}
