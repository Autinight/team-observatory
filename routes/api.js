import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDispatchPrompt, buildTeamSnapshot, diagnoseAgent, readRuntimeConfig, safeBusRequest } from "../lib/team-snapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.dirname(__dirname);
const ASSETS_DIR = path.join(PLUGIN_ROOT, "assets");

export default function registerTeamObservatoryRoutes(app, ctx) {
  app.get("/dashboard", (c) => c.html(renderShell(c, ctx, "dashboard")));
  app.get("/widget", (c) => c.html(renderShell(c, ctx, "widget")));

  app.get("/assets/app.js", (c) => serveAsset(c, "app.js", "text/javascript; charset=utf-8"));
  app.get("/assets/styles.css", (c) => serveAsset(c, "styles.css", "text/css; charset=utf-8"));

  app.get("/api/snapshot", async (c) => c.json(await buildTeamSnapshot(ctx)));

  app.get("/api/agents/:id", async (c) => {
    const snapshot = await buildTeamSnapshot(ctx);
    const id = c.req.param("id");
    const agent = snapshot.agents.find((item) => item.id === id || item.name === id);
    if (!agent) return c.json({ error: "agent not found" }, 404);
    return c.json({ agent, snapshotTs: snapshot.ts });
  });

  app.get("/api/tasks", async (c) => {
    const type = c.req.query("type") || undefined;
    const tasks = await safeBusRequest(ctx, "task:list", type ? { type } : {}, []);
    return c.json(Array.isArray(tasks) ? tasks : []);
  });

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

  app.get("/api/events", (c) => {
    const config = readRuntimeConfig(ctx);
    if (!config.enableSse) return c.json({ error: "SSE disabled" }, 409);

    const runtime = ctx._teamObservatory;
    if (!runtime) return c.json({ error: "runtime not ready" }, 503);

    let send = null;
    let heartbeat = null;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        send = (payload) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        runtime.subscribers.add(send);
        send({ type: "hello", ts: Date.now(), dirtyAt: runtime.dirtyAt || null });
        heartbeat = setInterval(() => send({ type: "heartbeat", ts: Date.now() }), 15000);
      },
      cancel() {
        if (heartbeat) clearInterval(heartbeat);
        if (send) runtime.subscribers.delete(send);
      },
    });

    c.header("Content-Type", "text/event-stream; charset=utf-8");
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("Connection", "keep-alive");
    return c.body(stream);
  });
}

function serveAsset(c, fileName, contentType) {
  const filePath = path.join(ASSETS_DIR, fileName);
  if (!filePath.startsWith(ASSETS_DIR + path.sep)) return c.text("not found", 404);
  if (!fs.existsSync(filePath)) return c.text("not found", 404);
  c.header("Content-Type", contentType);
  c.header("Cache-Control", "no-store");
  return c.body(fs.readFileSync(filePath));
}

function renderShell(c, ctx, surface) {
  const theme = c.req.query("hana-theme") || "inherit";
  const hanaCss = c.req.query("hana-css") || "";
  const title = surface === "widget" ? "Team" : "Team Observatory";
  const cssHref = assetUrl(c, ctx, "/assets/styles.css");
  const jsSrc = assetUrl(c, ctx, "/assets/app.js");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${hanaCss ? `<link rel="stylesheet" href="${escapeAttr(hanaCss)}">` : ""}
  <link rel="stylesheet" href="${escapeAttr(cssHref)}">
</head>
<body data-surface="${escapeAttr(surface)}" data-hana-theme="${escapeAttr(theme)}">
  <div id="app" data-plugin-id="${escapeAttr(ctx.pluginId)}" data-surface="${escapeAttr(surface)}"></div>
  <script type="module" src="${escapeAttr(jsSrc)}"></script>
</body>
</html>`;
}

function assetUrl(c, ctx, subPath) {
  const url = new URL(`/api/plugins/${ctx.pluginId}${subPath}`, new URL(c.req.url).origin);
  for (const key of ["token", "agentId", "hana-theme"]) {
    const value = c.req.query(key);
    if (value) url.searchParams.set(key, value);
  }
  return url.pathname + (url.search ? url.search : "");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
