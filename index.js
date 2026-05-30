export default class SubagentObservatoryPlugin {
  async onload() {
    const ctx = this.ctx;
    const runtime = {
      startedAt: Date.now(),
      dirtyAt: Date.now(),
      lastEvent: null,
      subscribers: new Set(),
      stats: {
        eventCount: 0,
        snapshotCount: 0,
      },
    };

    ctx._teamObservatory = runtime;

    if (ctx?.bus && typeof ctx.bus.subscribe === "function") {
      const off = ctx.bus.subscribe((event, sessionPath) => {
        if (!isRelevantEvent(event)) return;
        runtime.stats.eventCount += 1;
        runtime.dirtyAt = Date.now();
        runtime.lastEvent = sanitizeEvent(event, sessionPath);
        broadcast(runtime, {
          type: "dirty",
          ts: runtime.dirtyAt,
          event: runtime.lastEvent,
        });
      });

      if (typeof off === "function") this.register(off);
    } else {
      ctx.log?.warn?.("Subagent Observatory event subscription unavailable; polling only");
    }

    this.register(() => {
      for (const send of runtime.subscribers) {
        try { send({ type: "closed", ts: Date.now() }); } catch {}
      }
      runtime.subscribers.clear();
    });

    ctx.log.info("Subagent Observatory loaded");
  }

  async onunload() {
    this.ctx?.log?.info?.("Subagent Observatory unloaded");
  }
}

function isRelevantEvent(event) {
  if (!event || typeof event !== "object") return false;
  const type = event.type || "";
  return (
    type === "deferred_result" ||
    type === "token_usage" ||
    type === "llm_usage" ||
    type === "activity_update" ||
    type === "block_update" ||
    type === "session_created" ||
    type === "session_title" ||
    type === "session_user_message" ||
    type === "agent-created" ||
    type === "agent-updated" ||
    type === "agent-switched" ||
    type === "models-changed" ||
    type === "skills-changed" ||
    type.startsWith("task:")
  );
}

function sanitizeEvent(event, sessionPath) {
  return {
    type: event.type || "unknown",
    sessionPath: sessionPath || event.sessionPath || null,
    taskId: event.taskId || null,
    status: event.status || null,
    agentId: event.agentId || event.meta?.agentId || null,
  };
}

function broadcast(runtime, payload) {
  const stale = [];
  for (const send of runtime.subscribers) {
    try {
      send(payload);
    } catch {
      stale.push(send);
    }
  }
  for (const send of stale) runtime.subscribers.delete(send);
}
