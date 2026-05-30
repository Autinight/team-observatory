export function createApiClient({ root, getCurrentHref = () => window.location.href, authSearch = '' } = {}) {
  function sourceSearchParams() {
    const params = [];
    for (const source of [authSearch, new URL(getCurrentHref()).search]) {
      const text = String(source || '');
      if (!text) continue;
      params.push(new URLSearchParams(text.startsWith('?') ? text.slice(1) : text));
    }
    return params;
  }

  function apiUrl(path) {
    const current = new URL(getCurrentHref());
    const url = new URL(path, current.origin);
    for (const params of sourceSearchParams()) {
      for (const key of ['token', 'agentId', 'sessionPath', 'hana-theme']) {
        const value = params.get(key);
        if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  async function apiJson(path, options = {}) {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const message = typeof data === 'object' && data
        ? (data.error || data.message || data.result || `${res.status} ${res.statusText}`)
        : (data || `${res.status} ${res.statusText}`);
      throw new Error(String(message));
    }
    return data;
  }

  function pluginPath(path) {
    return `/api/plugins/${root?.dataset.pluginId || 'team-observatory'}${path}`;
  }

  function agentAvatarUrl(agentId) {
    return apiUrl(`/api/agents/${encodeURIComponent(agentId)}/avatar`);
  }

  async function abortTaskLikeChatCard(taskId) {
    // Keep aligned with desktop SubagentCard: POST /api/task/:taskId/abort.
    return apiJson(`/api/task/${encodeURIComponent(taskId)}/abort`, { method: 'POST' });
  }

  return {
    apiUrl,
    apiJson,
    pluginPath,
    agentAvatarUrl,
    abortTaskLikeChatCard,
  };
}
