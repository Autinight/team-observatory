import { diagnoseAgent } from "../lib/diagnose.js";

export const name = "diagnose_agent";
export const description = "Diagnose one Hana agent's current subagent-observatory status: sessions, background tasks, subagents, usage pressure, and recommendations.";
export const parameters = {
  type: "object",
  properties: {
    agentId: {
      type: "string",
      description: "Agent id or name. Use 'current' for the current agent. If omitted, the current/primary agent is selected."
    }
  }
};

export async function execute(input = {}, toolCtx) {
  const result = await diagnoseAgent(toolCtx, input);
  return {
    content: [{ type: "text", text: result.text }],
    details: {
      ok: result.ok,
      agent: result.agent || null,
      snapshotTs: result.snapshot?.ts || null,
    },
  };
}
