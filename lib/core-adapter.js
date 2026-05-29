// Hana core bus adapter — centralized bus handler calls with explicit availability and response unwrapping.
// New code should use the domain wrappers (listAgents, etc.). safeBusRequest is kept for backward compatibility.

/** @param {import("../routes/api").HanaContext} ctx */
function resolveBus(ctx) {
  const bus = ctx?.bus;
  if (!bus || typeof bus.request !== "function" || typeof bus.hasHandler !== "function") {
    return null;
  }
  return bus;
}

function capability(ok, error) {
  return { available: ok, error: ok ? null : String(error || "unknown") };
}

/**
 * Low-level bus request with structured result. Prefer the domain wrappers.
 * @returns {Promise<{ available: boolean, value: any, error: string|null }>}
 */
async function request(ctx, type, payload = {}, fallback = null) {
  const bus = resolveBus(ctx);
  if (!bus) {
    return { available: false, value: fallback, error: "bus unavailable" };
  }
  try {
    if (!bus.hasHandler(type)) {
      return { available: false, value: fallback, error: `handler missing: ${type}` };
    }
    const result = await bus.request(type, payload);
    return { available: true, value: result, error: null };
  } catch (err) {
    ctx?.log?.debug?.(`bus request ${type} failed`, err?.message || String(err));
    return { available: false, value: fallback, error: err?.message || String(err) };
  }
}

// ── backward compat ──────────────────────────────────────────────────────────

/**
 * Legacy signature: returns raw value or fallback.
 * @deprecated Use domain wrappers (listAgents etc.) for new code.
 */
export async function safeBusRequest(ctx, type, payload = {}, fallback = null) {
  const { available, value, error } = await request(ctx, type, payload, fallback);
  if (!available) {
    // keep old behavior: just return the fallback silently
    return fallback;
  }
  return value;
}

// ── domain wrappers ──────────────────────────────────────────────────────────

/** @returns {Promise<{ available: boolean, value: Array, error: string|null }>} */
export async function listAgents(ctx) {
  const { available, value, error } = await request(ctx, "agent:list", {}, { agents: [] });
  const agents = Array.isArray(value?.agents) ? value.agents : [];
  return { available, value: agents, error: available ? null : error };
}

/** @returns {Promise<{ available: boolean, value: Array, error: string|null }>} */
export async function listTasks(ctx) {
  const { available, value, error } = await request(ctx, "task:list", {}, []);
  const tasks = Array.isArray(value)
    ? value
    : Array.isArray(value?.tasks)
      ? value.tasks
      : [];
  return { available, value: tasks, error: available ? null : error };
}

/** @returns {Promise<{ available: boolean, value: Array, error: string|null }>} */
export async function listUsage(ctx, since, limit = 2000) {
  const { available, value, error } = await request(ctx, "usage:list", { since, limit }, []);
  const entries = Array.isArray(value) ? value : Array.isArray(value?.entries) ? value.entries : [];
  return { available, value: entries, error: available ? null : error };
}

/** @returns {Promise<{ available: boolean, value: Array, error: string|null }>} */
export async function listSessions(ctx, agentId) {
  const { available, value, error } = await request(ctx, "session:list", { agentId }, { sessions: [] });
  const sessions = Array.isArray(value?.sessions) ? value.sessions : [];
  return { available, value: sessions, error: available ? null : error };
}

/** @returns {Promise<{ available: boolean, value: { messages: Array }, error: string|null }>} */
export async function readSessionHistory(ctx, sessionPath, limit = 400) {
  if (!sessionPath) {
    return { available: false, value: { messages: [] }, error: "session path unavailable" };
  }
  const { available, value, error } = await request(ctx, "session:history", { sessionPath, limit }, null);
  if (!available) {
    return { available: false, value: { messages: [] }, error };
  }
  if (!value || !Array.isArray(value.messages)) {
    return { available: false, value: { messages: [] }, error: value?.error || "session history unavailable" };
  }
  return { available: true, value, error: null };
}

/** @returns {Promise<{ available: boolean, value: { accepted: boolean }, error: string|null }>} */
export async function sendSessionMessage(ctx, sessionPath, text) {
  if (!sessionPath) {
    return { available: false, value: { accepted: false }, error: "sessionPath missing" };
  }
  const { available, value, error } = await request(ctx, "session:send", { sessionPath, text }, { accepted: false });
  if (!available) {
    return { available: false, value: { accepted: false, error }, error };
  }
  return { available: true, value, error: null };
}

// ── capability aggregate ─────────────────────────────────────────────────────

/**
 * Build a capabilities snapshot of all bus-accessible handlers.
 * Call each domain wrapper once to populate availability.
 */
export async function probeCapabilities(ctx) {
  const [agents, tasks, usage, sessions] = await Promise.all([
    listAgents(ctx),
    listTasks(ctx),
    listUsage(ctx, new Date().toISOString(), 1),         // minimal payload
    listSessions(ctx, ""),                                // empty agent → empty sessions, but tests availability
  ]);

  return {
    agents: capability(agents.available, agents.error),
    tasks: capability(tasks.available, tasks.error),
    usage: capability(usage.available, usage.error),
    sessions: capability(sessions.available, sessions.error),
  };
}
