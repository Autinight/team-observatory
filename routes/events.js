// Events — SSE stream for real-time snapshot updates.
import { readRuntimeConfig } from "../lib/team-snapshot.js";

export function handleEvents(c, ctx) {
  const config = readRuntimeConfig(ctx);
  if (!config.enableSse) return c.json({ error: "SSE disabled" }, 409);

  const runtime = ctx._teamObservatory;
  if (!runtime) return c.json({ error: "runtime not ready" }, 503);

  const encoder = new TextEncoder();
  let send = null;
  let heartbeat = null;
  let streamController = null;
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (send) { runtime.subscribers.delete(send); send = null; }
  };
  const safeSend = (payload) => {
    if (closed || !streamController) return false;
    try {
      streamController.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      return true;
    } catch {
      cleanup();
      return false;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;
      send = safeSend;
      runtime.subscribers.add(send);
      send({ type: "hello", ts: Date.now(), dirtyAt: runtime.dirtyAt || null });
      heartbeat = setInterval(() => {
        if (!safeSend({ type: "heartbeat", ts: Date.now() })) cleanup();
      }, 15000);
    },
    cancel() { cleanup(); },
  });

  c.header("Content-Type", "text/event-stream; charset=utf-8");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("Connection", "keep-alive");
  return c.body(stream);
}
