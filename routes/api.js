// routes/api.js — route wiring (thin orchestrator).
import { buildTeamSnapshot, readRuntimeConfig, safeBusRequest } from "../lib/team-snapshot.js";
import { diagnoseAgent } from "../lib/diagnose.js";
import { buildDispatchPrompt } from "../lib/dispatch-prompt.js";
import { renderShell } from "./shell.js";
import { ASSET_ALLOWLIST, serveAsset } from "./assets.js";
import { handleEvents } from "./events.js";
import { handleSubagentChat } from "./chat.js";

export default function registerSubagentObservatoryRoutes(app, ctx) {
  // shell
  app.get("/dashboard", (c) => c.html(renderShell(c, ctx, "dashboard")));
  app.get("/widget", (c) => c.html(renderShell(c, ctx, "widget")));

  // assets
  app.get("/assets/:fileName", (c) => {
    const fileName = c.req.param("fileName");
    const contentType = ASSET_ALLOWLIST.get(fileName);
    if (!contentType) return c.text("not found", 404);
    return serveAsset(c, fileName, contentType);
  });

  // snapshot
  app.get("/api/snapshot", async (c) => {
    try {
      return c.json(await buildTeamSnapshot(ctx));
    } catch (err) {
      const message = err?.message || String(err);
      ctx?.log?.error?.("Subagent Observatory snapshot failed", message);
      return c.json({ error: message, code: "snapshot_failed" }, 500);
    }
  });

  // chat
  app.get("/api/subagent-chat", (c) => handleSubagentChat(c, ctx));

  // agent detail
  app.get("/api/agents/:id", async (c) => {
    const snapshot = await buildTeamSnapshot(ctx);
    const id = c.req.param("id");
    const agent = snapshot.agents.find((item) => item.id === id || item.name === id);
    if (!agent) return c.json({ error: "agent not found" }, 404);
    return c.json({ agent, snapshotTs: snapshot.ts });
  });

  // raw task list (passthrough to Hana core)
  app.get("/api/tasks", async (c) => {
    const type = c.req.query("type") || undefined;
    const tasks = await safeBusRequest(ctx, "task:list", type ? { type } : {}, []);
    return c.json(Array.isArray(tasks) ? tasks : []);
  });

  // actions
  app.post("/api/actions/diagnose", async (c) => {
    const input = await c.req.json().catch(() => ({}));
    return c.json(await diagnoseAgent(ctx, input));
  });

  app.post("/api/actions/dispatch-review", async (c) => {
    const input = await c.req.json().catch(() => ({}));
    const config = readRuntimeConfig(ctx);
    const result = await buildDispatchPrompt(ctx, input);
    const sessionPath = typeof input.sessionPath === "string" && input.sessionPath.trim()
      ? input.sessionPath.trim()
      : null;

    if (!config.enableAgentDispatch) {
      return c.json({ ...result, sent: false, reason: "agent dispatch is disabled in plugin config" });
    }
    if (!sessionPath) {
      return c.json({ ...result, sent: false, reason: "sessionPath was not provided; copy the prompt manually" });
    }

    const sendResult = await safeBusRequest(ctx, "session:send", {
      sessionPath,
      text: result.prompt,
    }, { accepted: false, error: "session:send unavailable" });

    return c.json({ ...result, sent: !!sendResult?.accepted, sendResult });
  });

  // events
  app.get("/api/events", (c) => handleEvents(c, ctx));
}
