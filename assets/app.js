const root = document.getElementById('app');
const surface = root?.dataset.surface || document.body.dataset.surface || 'dashboard';

const state = {
  snapshot: null,
  selectedAgentId: null,
  loading: true,
  error: null,
  lastRefresh: null,
  dispatchPrompt: null,
};

function apiUrl(path) {
  const current = new URL(window.location.href);
  const url = new URL(path, current.origin);
  for (const key of ['token', 'agentId']) {
    const value = current.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
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
  if (!res.ok) throw new Error(await res.text().catch(() => `${res.status} ${res.statusText}`));
  return res.json();
}

function pluginPath(path) {
  return `/api/plugins/${root?.dataset.pluginId || 'team-observatory'}${path}`;
}

async function refresh() {
  try {
    state.loading = !state.snapshot;
    state.error = null;
    render();
    state.snapshot = await apiJson(pluginPath('/api/snapshot'));
    state.lastRefresh = Date.now();
    if (!state.selectedAgentId && state.snapshot.agents?.length) {
      state.selectedAgentId = (state.snapshot.agents.find(a => a.isCurrent) || state.snapshot.agents[0]).id;
    }
  } catch (err) {
    state.error = err.message || String(err);
  } finally {
    state.loading = false;
    render();
  }
}

function connectEvents() {
  try {
    const source = new EventSource(apiUrl(pluginPath('/api/events')));
    source.onmessage = () => setTimeout(refresh, 250);
    source.onerror = () => source.close();
  } catch {
    // Polling remains the stable fallback.
  }
}

function render() {
  if (!root) return;
  root.innerHTML = surface === 'widget' ? renderWidget() : renderDashboard();
  bindActions();
  tryResize();
}

function renderDashboard() {
  const snap = state.snapshot;
  if (state.loading && !snap) return `<main class="shell"><div class="loadingOrb"></div><p class="muted">Opening observatory...</p></main>`;
  if (state.error && !snap) return `<main class="shell"><section class="card danger"><h2>Observatory offline</h2><p>${esc(state.error)}</p><button data-action="refresh">Retry</button></section></main>`;
  if (!snap) return '';

  const selected = snap.agents.find(a => a.id === state.selectedAgentId) || snap.agents[0];
  const alerts = snap.alerts || [];

  return `
    <main class="shell dashboard">
      <header class="hero">
        <div>
          <div class="eyebrow">Hana Agent Team</div>
          <h1>Team Observatory</h1>
          <p>Observe agent load, subagent operations, task failures, and usage pressure without touching core runtime.</p>
        </div>
        <div class="heroStats">
          ${metric('Health', `${snap.summary.healthScore}`, '/100')}
          ${metric('Agents', snap.summary.agentCount)}
          ${metric('Tasks', snap.summary.runningTaskCount, 'running')}
          ${metric('Tokens', formatTokens(snap.summary.token24h), '24h')}
        </div>
      </header>

      ${state.error ? `<div class="inlineError">${esc(state.error)}</div>` : ''}

      <section class="gridTop">
        <div class="card agentGridCard">
          <div class="cardHead"><h2>Agents</h2><button data-action="refresh">Refresh</button></div>
          <div class="agentGrid">${snap.agents.map(agentCard).join('')}</div>
        </div>
        <div class="card detailCard">${selected ? renderAgentDetail(selected) : '<p class="muted">No agent selected.</p>'}</div>
      </section>

      <section class="gridBottom">
        <div class="card">
          <div class="cardHead"><h2>Subagent Runs</h2><span class="pill">${snap.summary.runningSubagentCount} running</span></div>
          ${taskTable(snap.subagents, true)}
        </div>
        <div class="card">
          <div class="cardHead"><h2>Alerts</h2><span class="pill ${alerts.length ? 'warn' : 'ok'}">${alerts.length}</span></div>
          <div class="alertList">${alerts.slice(0, 8).map(alertView).join('') || '<p class="muted">No alerts. The team is quiet.</p>'}</div>
        </div>
      </section>

      <section class="card usageCard">
        <div class="cardHead"><h2>Usage Pressure</h2><span class="muted">last 24h</span></div>
        <div class="usageBars">${(snap.usage.byAgent || []).filter(u => u.agentId !== 'unknown').map(usageBar).join('') || '<p class="muted">No usage records.</p>'}</div>
      </section>

      ${state.dispatchPrompt ? `<section class="card promptCard"><div class="cardHead"><h2>Dispatch / Diagnosis</h2><button data-action="clearPrompt">Close</button></div><pre>${esc(state.dispatchPrompt)}</pre></section>` : ''}
    </main>
  `;
}

function renderWidget() {
  const snap = state.snapshot;
  if (state.loading && !snap) return `<main class="widget"><div class="loadingOrb small"></div><p class="muted">Observing...</p></main>`;
  if (state.error && !snap) return `<main class="widget"><b>Offline</b><button data-action="refresh">Retry</button></main>`;
  if (!snap) return '';
  return `
    <main class="widget">
      <header><strong>Team</strong><button data-action="refresh">↻</button></header>
      <div class="scoreRing ${scoreClass(snap.summary.healthScore)}"><span>${snap.summary.healthScore}</span><small>health</small></div>
      <div class="miniAgents">
        ${snap.agents.slice(0, 5).map(a => `<div class="miniAgent"><span class="dot ${a.status}"></span><span>${esc(a.name)}</span><b>${a.health.score}</b></div>`).join('')}
      </div>
      <footer>
        <span>${snap.summary.runningTaskCount} tasks</span>
        <span>${snap.summary.runningSubagentCount} subagents</span>
        <span>${formatTokens(snap.summary.token24h)}</span>
      </footer>
    </main>
  `;
}

function metric(label, value, suffix = '') {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${suffix ? `<em>${esc(suffix)}</em>` : ''}</div>`;
}

function agentCard(agent) {
  const selected = agent.id === state.selectedAgentId ? ' selected' : '';
  return `<button class="agentCard${selected}" data-action="selectAgent" data-agent-id="${esc(agent.id)}">
    <div class="statusOrbit ${agent.status}"><span></span></div>
    <div><strong>${esc(agent.name)}</strong><small>${esc(agent.id)}</small></div>
    <div class="agentScore ${scoreClass(agent.health.score)}">${agent.health.score}</div>
  </button>`;
}

function renderAgentDetail(agent) {
  return `
    <div class="detailHero">
      <div class="statusOrbit big ${agent.status}"><span></span></div>
      <div><h2>${esc(agent.name)}</h2><p>${esc(agent.status)} · ${agent.isCurrent ? 'current' : agent.isPrimary ? 'primary' : 'team member'}</p></div>
      <div class="agentScore large ${scoreClass(agent.health.score)}">${agent.health.score}</div>
    </div>
    <div class="detailMetrics">
      ${metric('Sessions', agent.sessionCount)}
      ${metric('Tasks', agent.activeTaskCount, 'active')}
      ${metric('Failed', agent.failedTaskCount)}
      ${metric('Tokens', formatTokens(agent.usage24h.totalTokens))}
    </div>
    <div class="recommendations"><h3>Recommendations</h3>${(agent.recommendations || []).map(x => `<p>• ${esc(x)}</p>`).join('')}</div>
    <div class="actions">
      <button data-action="diagnose" data-agent-id="${esc(agent.id)}">Diagnose</button>
      <button data-action="dispatch" data-agent-id="${esc(agent.id)}">Dispatch review</button>
      <button data-action="copyStatus" data-agent-id="${esc(agent.id)}">Copy status</button>
    </div>
    <div class="recentSessions"><h3>Recent sessions</h3>${(agent.recentSessions || []).slice(0, 5).map(session => `<div class="sessionRow"><strong>${esc(session.title || 'Untitled')}</strong><span>${timeAgo(session.modified)}</span></div>`).join('') || '<p class="muted">No sessions.</p>'}</div>
  `;
}

function taskTable(tasks) {
  const visible = (tasks || []).slice(0, 8);
  if (!visible.length) return '<p class="muted">No matching tasks.</p>';
  return `<div class="taskTable">${visible.map(task => `<div class="taskRow">
    <span class="dot ${task.status}"></span>
    <div><strong>${esc(task.summary || task.taskId)}</strong><small>${esc(task.taskId)} · ${esc(task.executorAgentName || task.executorAgentId || task.requestedAgentName || task.type)}</small></div>
    <b class="statusText ${task.status}">${esc(task.status)}</b>
  </div>`).join('')}</div>`;
}

function alertView(alert) {
  return `<div class="alert ${alert.severity}"><strong>${esc(alert.title)}</strong><p>${esc(alert.message)}</p></div>`;
}

function usageBar(usage) {
  const max = Math.max(...(state.snapshot?.usage.byAgent || []).map(u => u.totalTokens || 0), 1);
  const width = Math.max(2, Math.round((usage.totalTokens || 0) / max * 100));
  return `<div class="usageRow"><span>${esc(usage.agentId)}</span><div><i style="width:${width}%"></i></div><b>${formatTokens(usage.totalTokens)}</b></div>`;
}

function bindActions() {
  root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      const agentId = el.dataset.agentId;
      if (action === 'refresh') refresh();
      if (action === 'selectAgent') { state.selectedAgentId = agentId; render(); }
      if (action === 'clearPrompt') { state.dispatchPrompt = null; render(); }
      if (action === 'copyStatus') copyAgentStatus(agentId);
      if (action === 'diagnose') runDiagnose(agentId);
      if (action === 'dispatch') runDispatch(agentId);
    });
  });
}

async function copyAgentStatus(agentId) {
  const agent = state.snapshot?.agents.find(a => a.id === agentId);
  if (!agent) return;
  const text = `${agent.name}: ${agent.status}, health ${agent.health.score}/100, tasks ${agent.activeTaskCount}, failed ${agent.failedTaskCount}`;
  await navigator.clipboard?.writeText?.(text).catch(() => {});
}

async function runDiagnose(agentId) {
  try {
    const res = await apiJson(pluginPath('/api/actions/diagnose'), { method: 'POST', body: JSON.stringify({ agentId }) });
    state.dispatchPrompt = res.text || JSON.stringify(res, null, 2);
    render();
  } catch (err) { state.error = err.message; render(); }
}

async function runDispatch(agentId) {
  try {
    const res = await apiJson(pluginPath('/api/actions/dispatch-review'), { method: 'POST', body: JSON.stringify({ agentId }) });
    state.dispatchPrompt = res.prompt || JSON.stringify(res, null, 2);
    render();
  } catch (err) { state.error = err.message; render(); }
}

function tryResize() {
  const height = Math.min(window.innerHeight || 900, Math.max(260, document.documentElement.scrollHeight));
  window.parent?.postMessage?.({ type: 'resize-request', payload: { height } }, '*');
  window.parent?.postMessage?.({ type: 'ready' }, '*');
}

function scoreClass(score) { return score >= 80 ? 'ok' : score >= 55 ? 'warn' : 'bad'; }
function formatTokens(n) { n = Number(n || 0); return n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'k' : String(Math.round(n)); }
function timeAgo(value) { const t = new Date(value || 0).getTime(); if (!t) return 'unknown'; const m = Math.max(0, Math.round((Date.now() - t)/60000)); return m < 60 ? `${m}m ago` : `${Math.round(m/60)}h ago`; }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

refresh();
connectEvents();
setInterval(refresh, 5000);
