import { buildDispatchPrompt, readRuntimeConfig } from "../lib/team-snapshot.js";

export const name = "dispatch_review";
export const description = "Build a structured prompt for the current Hana agent to dispatch a subagent reviewer for team/task diagnosis. This tool does not directly start subagents; it returns the prompt and can send it into the current session when sessionPath is available.";
export const parameters = {
  type: "object",
  properties: {
    agentId: {
      type: "string",
      description: "Target agent id/name, 'current', or 'all'. If omitted, the weakest health agent is selected."
    },
    reviewerAgentId: {
      type: "string",
      description: "Suggested reviewer agent id, e.g. rihane."
    },
    focus: {
      type: "string",
      description: "Specific focus for the review."
    },
    sendToCurrentSession: {
      type: "boolean",
      description: "When true and sessionPath is available, send the generated dispatch prompt into the current session via session:send."
    }
  }
};

export async function execute(input = {}, toolCtx) {
  const result = await buildDispatchPrompt(toolCtx, input);
  const config = readRuntimeConfig(toolCtx);
  let sent = false;
  let sendError = null;

  if (!config.enableAgentDispatch) {
    return {
      content: [{
        type: "text",
        text: `Team Observatory dispatch prompt (agent dispatch is disabled in settings):\n\n${result.prompt}`,
      }],
      details: {
        sent: false,
        reason: "agent dispatch is disabled in plugin config",
        reviewer: result.reviewer,
        targetAgent: result.targetAgent,
        prompt: result.prompt,
        snapshotTs: result.snapshot?.ts || null,
      },
    };
  }

  if (input.sendToCurrentSession === true && toolCtx.sessionPath && toolCtx.bus?.hasHandler?.("session:send")) {
    try {
      const sendResult = await toolCtx.bus.request("session:send", {
        sessionPath: toolCtx.sessionPath,
        text: result.prompt,
      });
      sent = !!sendResult?.accepted;
    } catch (err) {
      sendError = err.message || String(err);
    }
  }

  return {
    content: [{
      type: "text",
      text: sent
        ? "Team Observatory dispatch prompt sent into the current session."
        : `Team Observatory dispatch prompt:\n\n${result.prompt}`,
    }],
    details: {
      sent,
      sendError,
      reviewer: result.reviewer,
      targetAgent: result.targetAgent,
      prompt: result.prompt,
      snapshotTs: result.snapshot?.ts || null,
    },
  };
}
