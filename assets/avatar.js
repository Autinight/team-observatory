export function createAvatarHelpers({ esc, agentAvatarUrl, getAvatarCache, getAvatarFetches, onAvatarReady }) {

  function avatarInitial(agent) {
    const text = String(agent.name || agent.id || '?').trim();
    return Array.from(text)[0]?.toUpperCase?.() || '?';
  }

  function agentAvatar(agent, size = '') {
    const initial = avatarInitial(agent);
    const cache = getAvatarCache();
    const cached = agent.id && cache.has(agent.id) ? cache.get(agent.id) : undefined;
    const src = agent.id && agent.id !== 'unknown'
      ? (cached !== undefined ? cached : agentAvatarUrl(agent.id))
      : null;
    return `<span class="agentAvatar ${size} ${esc(agent.status || '')}" aria-hidden="true">
      <span class="avatarFallback">${esc(initial)}</span>
      ${src ? `<img src="${esc(src)}" alt="" loading="eager" decoding="async" onerror="this.remove()">` : ''}
    </span>`;
  }

  function warmAvatarCache(snap) {
    const ids = new Set();
    for (const agent of snap?.agents || []) {
      if (agent.id && agent.id !== 'unknown') ids.add(agent.id);
    }
    for (const task of snap?.subagents || []) {
      for (const key of ['subagentAgentId', 'requestedAgentId', 'agentId', 'executorAgentId', 'dispatchingAgentId']) {
        const id = task[key];
        if (id && id !== 'unknown') ids.add(id);
      }
    }
    for (const id of ids) ensureAvatarCached(id);
  }

  function ensureAvatarCached(agentId) {
    const cache = getAvatarCache();
    const fetches = getAvatarFetches();
    if (!agentId || cache.has(agentId) || fetches.has(agentId)) return;
    const promise = fetch(agentAvatarUrl(agentId))
      .then(res => res.ok ? res.blob() : null)
      .then(blob => {
        cache.set(agentId, blob ? URL.createObjectURL(blob) : null);
        fetches.delete(agentId);
        onAvatarReady();
      })
      .catch(() => {
        cache.set(agentId, null);
        fetches.delete(agentId);
      });
    fetches.set(agentId, promise);
  }

  return { avatarInitial, agentAvatar, warmAvatarCache, ensureAvatarCached };
}
