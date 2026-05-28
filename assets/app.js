const root = document.getElementById('app');
const surface = root?.dataset.surface || document.body.dataset.surface || 'dashboard';

const LANG_KEY = 'team-observatory.lang';
const DEFAULT_LANG = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';

const I18N = {
  en: {
    opening: 'Opening observatory...',
    offlineTitle: 'Observatory offline',
    retry: 'Retry',
    eyebrow: 'Hana Agent Team',
    title: 'Team Observatory',
    subtitle: 'Observe agent load, subagent operations, task failures, and usage pressure without touching core runtime.',
    health: 'Health',
    agents: 'Agents',
    tasks: 'Tasks',
    tokens: 'Tokens',
    running: 'running',
    refresh: 'Refresh',
    noAgent: 'No agent selected.',
    subagentRuns: 'Subagent Runs',
    alerts: 'Alerts',
    quiet: 'No alerts. The team is quiet.',
    usagePressure: 'Usage Pressure',
    last24h: 'last 24h',
    noUsage: 'No usage records.',
    reviewDispatched: 'Review dispatched',
    reviewPromptNotSent: 'Review prompt (not sent)',
    diagnosis: 'Diagnosis',
    close: 'Close',
    observing: 'Observing...',
    offline: 'Offline',
    team: 'Team',
    current: 'current',
    primary: 'primary',
    teamMember: 'team member',
    sessions: 'Sessions',
    active: 'active',
    failed: 'Failed',
    recommendations: 'Recommendations',
    diagnose: 'Diagnose',
    buildReviewPrompt: 'Build review prompt',
    copyStatus: 'Copy status',
    recentSessions: 'Recent sessions',
    untitled: 'Untitled',
    noSessions: 'No sessions.',
    noTasks: 'No matching tasks.',
    status: 'status',
    subagents: 'subagents',
    unknown: 'unknown',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
  },
  zh: {
    opening: '正在打开观测面板...',
    offlineTitle: '观测面板离线',
    retry: '重试',
    eyebrow: 'Hana Agent 团队',
    title: 'Team Observatory',
    subtitle: '观察 agent 负载、subagent 运行、任务失败和用量压力，不触碰核心运行时。',
    health: '健康度',
    agents: 'Agent',
    tasks: '任务',
    tokens: 'Token',
    running: '运行中',
    refresh: '刷新',
    noAgent: '未选择 agent。',
    subagentRuns: 'Subagent 运行',
    alerts: '提醒',
    quiet: '没有提醒，团队很安静。',
    usagePressure: '用量压力',
    last24h: '最近 24 小时',
    noUsage: '没有用量记录。',
    reviewDispatched: '审查已派发',
    reviewPromptNotSent: '审查 prompt（未发送）',
    diagnosis: '诊断',
    close: '关闭',
    observing: '观测中...',
    offline: '离线',
    team: '团队',
    current: '当前',
    primary: '主 Agent',
    teamMember: '团队成员',
    sessions: '会话',
    active: '活跃',
    failed: '失败',
    recommendations: '建议',
    diagnose: '诊断',
    buildReviewPrompt: '生成审查 prompt',
    copyStatus: '复制状态',
    recentSessions: '最近会话',
    untitled: '未命名',
    noSessions: '没有会话。',
    noTasks: '没有匹配任务。',
    status: '状态',
    subagents: 'Subagent',
    unknown: '未知',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
  },
};

const state = {
  snapshot: null,
  selectedAgentId: null,
  loading: true,
  error: null,
  lastRefresh: null,
  dispatchPrompt: null,
  dispatchResult: null,
  refreshTimer: null,
  refreshIntervalMs: 5000,
  lang: loadLang(),
};

function loadLang() {
  const saved = localStorage.getItem(LANG_KEY);
  return saved === 'zh' || saved === 'en' ? saved : DEFAULT_LANG;
}

function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  state.lang = lang;
  localStorage.setItem(LANG_KEY, lang);
  render();
}

function t(key, vars = {}) {
  const value = I18N[state.lang]?.[key] ?? I18N.en[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

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
  if (state.loading && !snap) return `<main class="shell"><div class="loadingOrb"></div><p class="muted">${t('opening')}</p></main>`;
  if (state.error && !snap) return `<main class="shell"><section class="card danger"><h2>${t('offlineTitle')}</h2><p>${esc(state.error)}</p><button data-action="refresh">${t('retry')}</button></section></main>`;
  if (!snap) return '';

  const selected = snap.agents.find(a => a.id === state.selectedAgentId) || snap.agents[0];
  const alerts = snap.alerts || [];

  return `
    <main class="shell dashboard">
      <header class="hero">
        <div class="heroIntro">
          <div class="heroTop">
            <div class="eyebrow">${t('eyebrow')}</div>
            ${languageSwitch()}
          </div>
          <h1>${t('title')}</h1>
          <p>${t('subtitle')}</p>
        </div>
        <div class="heroStats">
          ${metric(t('health'), `${snap.summary.healthScore}`, '/100')}
          ${metric(t('agents'), snap.summary.agentCount)}
          ${metric(t('tasks'), snap.summary.runningTaskCount, t('running'))}
          ${metric(t('tokens'), formatTokens(snap.summary.token24h), '24h')}
        </div>
      </header>

      ${state.error ? `<div class="inlineError">${esc(state.error)}</div>` : ''}

      <section class="gridTop">
        <div class="card agentGridCard">
          <div class="cardHead"><h2>${t('agents')}</h2><button data-action="refresh">${t('refresh')}</button></div>
          <div class="agentGrid">${snap.agents.map(agentCard).join('')}</div>
        </div>
        <div class="card detailCard">${selected ? renderAgentDetail(selected) : `<p class="muted">${t('noAgent')}</p>`}</div>
      </section>

      <section class="gridBottom">
        <div class="card">
          <div class="cardHead"><h2>${t('subagentRuns')}</h2><span class="pill">${snap.summary.runningSubagentCount} ${t('running')}</span></div>
          ${taskTable(snap.subagents, true)}
        </div>
        <div class="card">
          <div class="cardHead"><h2>${t('alerts')}</h2><span class="pill ${alerts.length ? 'warn' : 'ok'}">${alerts.length}</span></div>
          <div class="alertList">${alerts.slice(0, 8).map(alertView).join('') || `<p class="muted">${t('quiet')}</p>`}</div>
        </div>
      </section>

      <section class="card usageCard">
        <div class="cardHead"><h2>${t('usagePressure')}</h2><span class="muted">${t('last24h')}</span></div>
        <div class="usageBars">${(snap.usage.byAgent || []).filter(u => u.agentId !== 'unknown').map(usageBar).join('') || `<p class="muted">${t('noUsage')}</p>`}</div>
      </section>

      ${state.dispatchPrompt ? `<section class="card promptCard"><div class="cardHead"><h2>${state.dispatchResult?.sent === true ? t('reviewDispatched') : state.dispatchResult?.sent === false ? t('reviewPromptNotSent') : t('diagnosis')}</h2><button data-action="clearPrompt">${t('close')}</button></div>${state.dispatchResult?.reason ? `<p class="muted">${esc(state.dispatchResult.reason)}</p>` : ''}<pre>${esc(state.dispatchPrompt)}</pre></section>` : ''}
    </main>
  `;
}

function languageSwitch() {
  return `<div class="langSwitch" role="group" aria-label="Language">
    <button data-action="setLang" data-lang="zh" class="${state.lang === 'zh' ? 'active' : ''}" aria-pressed="${state.lang === 'zh'}">中</button>
    <button data-action="setLang" data-lang="en" class="${state.lang === 'en' ? 'active' : ''}" aria-pressed="${state.lang === 'en'}">EN</button>
  </div>`;
}

function renderWidget() {
  const snap = state.snapshot;
  if (state.loading && !snap) return `<main class="widget"><div class="loadingOrb small"></div><p class="muted">${t('observing')}</p></main>`;
  if (state.error && !snap) return `<main class="widget"><b>${t('offline')}</b><button data-action="refresh">${t('retry')}</button></main>`;
  if (!snap) return '';
  return `
    <main class="widget">
      <header><strong>${t('team')}</strong><button data-action="refresh">↻</button></header>
      <div class="scoreRing ${scoreClass(snap.summary.healthScore)}"><span>${snap.summary.healthScore}</span><small>${state.lang === 'zh' ? t('health') : 'health'}</small></div>
      <div class="miniAgents">
        ${snap.agents.slice(0, 5).map(a => `<div class="miniAgent"><span class="dot ${a.status}"></span><span>${esc(a.name)}</span><b>${a.health.score}</b></div>`).join('')}
      </div>
      <footer>
        <span>${snap.summary.runningTaskCount} ${t('tasks')}</span>
        <span>${snap.summary.runningSubagentCount} ${t('subagents')}</span>
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
      <div><h2>${esc(agent.name)}</h2><p>${esc(agent.status)} · ${agent.isCurrent ? t('current') : agent.isPrimary ? t('primary') : t('teamMember')}</p></div>
      <div class="agentScore large ${scoreClass(agent.health.score)}">${agent.health.score}</div>
    </div>
    <div class="detailMetrics">
      ${metric(t('sessions'), agent.sessionCount)}
      ${metric(t('tasks'), agent.activeTaskCount, t('active'))}
      ${metric(t('failed'), agent.failedTaskCount)}
      ${metric(t('tokens'), formatTokens(agent.usage24h.totalTokens))}
    </div>
    <div class="recommendations"><h3>${t('recommendations')}</h3>${(agent.recommendations || []).map(x => `<p>• ${esc(x)}</p>`).join('')}</div>
    <div class="actions">
      <button data-action="diagnose" data-agent-id="${esc(agent.id)}">${t('diagnose')}</button>
      <button data-action="dispatch" data-agent-id="${esc(agent.id)}">${t('buildReviewPrompt')}</button>
      <button data-action="copyStatus" data-agent-id="${esc(agent.id)}">${t('copyStatus')}</button>
    </div>
    <div class="recentSessions"><h3>${t('recentSessions')}</h3>${(agent.recentSessions || []).slice(0, 5).map(session => `<div class="sessionRow"><strong>${esc(session.title || t('untitled'))}</strong><span>${timeAgo(session.modified)}</span></div>`).join('') || `<p class="muted">${t('noSessions')}</p>`}</div>
  `;
}

function taskTable(tasks) {
  const visible = (tasks || []).slice(0, 8);
  if (!visible.length) return `<p class="muted">${t('noTasks')}</p>`;
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
      if (action === 'clearPrompt') { state.dispatchPrompt = null; state.dispatchResult = null; render(); }
      if (action === 'setLang') setLang(el.dataset.lang);
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
    state.dispatchResult = { sent: false, reason: null };
    render();
  } catch (err) { state.error = err.message; render(); }
}

async function runDispatch(agentId) {
  try {
    const res = await apiJson(pluginPath('/api/actions/dispatch-review'), { method: 'POST', body: JSON.stringify({ agentId }) });
    state.dispatchPrompt = res.prompt || JSON.stringify(res, null, 2);
    state.dispatchResult = { sent: !!res.sent, reason: res.reason || null };
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
function timeAgo(value) { const t0 = new Date(value || 0).getTime(); if (!t0) return t('unknown'); const m = Math.max(0, Math.round((Date.now() - t0)/60000)); return m < 60 ? t('minutesAgo', { n: m }) : t('hoursAgo', { n: Math.round(m/60) }); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function scheduleRefresh() {
  const ms = Math.max(2000, Math.min(60000, state.refreshIntervalMs || 5000));
  state.refreshIntervalMs = ms;
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(refresh, ms);
}

refresh().then(() => {
  if (state.snapshot?.config?.refreshIntervalMs) {
    state.refreshIntervalMs = state.snapshot.config.refreshIntervalMs;
  }
  scheduleRefresh();
});
connectEvents();
