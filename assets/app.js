const root = document.getElementById('app');
const surface = root?.dataset.surface || document.body.dataset.surface || 'dashboard';

const LANG_KEY = 'team-observatory.lang';
const DEFAULT_LANG = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

const I18N = {
  en: {
    opening: 'Opening observatory...',
    offlineTitle: 'Observatory offline',
    retry: 'Retry',
    eyebrow: 'Subagent Observatory',
    title: 'Team Observatory',
    subtitle: 'Watch subagents as first-class runtime objects: lifecycle, ownership, stale runs, failures, and result flow.',
    running: 'running',
    refresh: 'Refresh',
    subagentRuns: 'Subagent Runs',
    subagentInspector: 'Subagent Inspector',
    noSubagent: 'No subagent selected.',
    noSubagents: 'No subagent runs. The backstage is quiet.',
    blackboxSignals: 'Blackbox Signals',
    agents: 'Agents',
    agentContext: 'Agent Context',
    alerts: 'Alerts',
    quiet: 'No alerts. The team is quiet.',
    usagePressure: 'Usage Pressure',
    last24h: 'last 24h',
    noUsage: 'No usage records.',
    observing: 'Observing...',
    offline: 'Offline',
    team: 'Team',
    healthScore: 'health',
    tasks: 'Tasks',
    subagents: 'subagents',
    tokens: 'Tokens',
    total: 'Total',
    stale: 'Stale',
    failed: 'Failed',
    completed: 'Completed',
    active: 'Active',
    requested: 'Requested',
    executor: 'Executor',
    status: 'Status',
    task: 'Task',
    preview: 'Preview',
    viewDetails: 'View details',
    hideDetails: 'Hide details',
    taskId: 'Task ID',
    parent: 'Parent',
    created: 'Created',
    updated: 'Updated',
    completedAt: 'Completed',
    duration: 'Duration',
    reason: 'Reason',
    noReason: 'No error reason.',
    noParent: 'No parent session.',
    unknown: 'unknown',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    secondsAgo: '{n}s ago',
  },
  zh: {
    opening: '正在打开观测面板...',
    offlineTitle: '观测面板离线',
    retry: '重试',
    eyebrow: 'Subagent 观测',
    title: 'Team Observatory',
    subtitle: '把 subagent 当作一等运行对象监看：生命周期、归属、卡住、失败与结果流。',
    running: '运行中',
    refresh: '刷新',
    subagentRuns: 'Subagent 运行',
    subagentInspector: 'Subagent 检查器',
    noSubagent: '未选择 subagent。',
    noSubagents: '暂无 subagent 运行，后台很安静。',
    blackboxSignals: '黑箱信号',
    agents: 'Agent',
    agentContext: 'Agent 上下文',
    alerts: '提醒',
    quiet: '没有提醒，团队很安静。',
    usagePressure: '用量压力',
    last24h: '最近 24 小时',
    noUsage: '没有用量记录。',
    observing: '观测中...',
    offline: '离线',
    team: '团队',
    healthScore: '健康分',
    tasks: '任务',
    subagents: 'Subagent',
    tokens: 'Token',
    total: '总数',
    stale: '停滞',
    failed: '失败',
    completed: '完成',
    active: '活跃',
    requested: '请求目标',
    executor: '执行者',
    status: '状态',
    task: '任务',
    preview: '预览',
    viewDetails: '查看详情',
    hideDetails: '收起详情',
    taskId: '任务 ID',
    parent: '父会话',
    created: '创建',
    updated: '更新',
    completedAt: '完成',
    duration: '耗时',
    reason: '原因',
    noReason: '没有错误原因。',
    noParent: '没有父会话。',
    unknown: '未知',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    secondsAgo: '{n} 秒前',
  },
};

const state = {
  snapshot: null,
  selectedSubagentId: null,
  expandedDetailTaskId: null,
  loading: true,
  error: null,
  lastRefresh: null,
  refreshTimer: null,
  refreshIntervalMs: 5000,
  isRefreshing: false,
  refreshQueued: false,
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
  if (state.isRefreshing) {
    state.refreshQueued = true;
    return;
  }
  state.isRefreshing = true;
  try {
    state.loading = !state.snapshot;
    state.error = null;
    render();
    state.snapshot = await apiJson(pluginPath('/api/snapshot'));
    state.lastRefresh = Date.now();
    if (state.snapshot?.config?.refreshIntervalMs) {
      state.refreshIntervalMs = state.snapshot.config.refreshIntervalMs;
    }
    const subagents = state.snapshot.subagents || [];
    if (subagents.length && !subagents.some(task => task.taskId === state.selectedSubagentId)) {
      state.selectedSubagentId = subagents[0].taskId;
    }
  } catch (err) {
    state.error = err.message || String(err);
  } finally {
    state.loading = false;
    state.isRefreshing = false;
    render();
    if (state.refreshQueued) {
      state.refreshQueued = false;
      setTimeout(() => refresh(), 0);
    }
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

  const subagents = snap.subagents || [];
  const selected = subagents.find(task => task.taskId === state.selectedSubagentId) || subagents[0] || null;
  const alerts = snap.alerts || [];
  const stats = subagentStats(subagents);

  return `
    <main class="shell dashboard subagentFirst">
      <header class="hero">
        <div class="heroIntro">
          <div class="heroTop"><div class="eyebrow">${t('eyebrow')}</div></div>
          <h1>${t('title')}</h1>
          <p>${t('subtitle')}</p>
        </div>
        <div class="heroAside">
          ${languageSwitch()}
          <div class="heroStats subagentStats">
            ${metric(t('active'), stats.active)}
            ${metric(t('stale'), stats.stale)}
            ${metric(t('failed'), stats.failed)}
            ${metric(t('completed'), stats.completed, t('last24h'))}
          </div>
        </div>
      </header>

      ${state.error ? `<div class="inlineError">${esc(state.error)}</div>` : ''}

      <section class="subagentLayout">
        <div class="card subagentMainCard">
          <div class="cardHead">
            <div><h2>${t('subagentRuns')}</h2><p class="muted">${t('blackboxSignals')}</p></div>
            <button data-action="refresh">${t('refresh')}</button>
          </div>
          ${subagentGrid(subagents)}
        </div>
        <aside class="card inspectorCard">
          ${renderSubagentInspector(selected)}
        </aside>
      </section>

      <section class="contextGrid">
        <div class="card agentContextCard">
          <div class="cardHead"><h2>${t('agentContext')}</h2><span class="pill">${snap.summary.agentCount}</span></div>
          <div class="agentStrip">${snap.agents.map(agentContextCard).join('')}</div>
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
  const stats = subagentStats(snap.subagents || []);
  return `
    <main class="widget">
      <header><strong>${t('subagents')}</strong><button data-action="refresh">↻</button></header>
      <div class="scoreRing ${stats.stale || stats.failed ? 'warn' : 'ok'}"><span>${stats.active}</span><small>${t('running')}</small></div>
      <footer>
        <span>${stats.stale} ${t('stale')}</span>
        <span>${stats.failed} ${t('failed')}</span>
        <span>${stats.completed} ${t('completed')}</span>
      </footer>
    </main>
  `;
}

function metric(label, value, suffix = '') {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${suffix ? `<em>${esc(suffix)}</em>` : ''}</div>`;
}

function subagentGrid(tasks) {
  const visible = (tasks || []).slice(0, 12);
  if (!visible.length) return `<p class="muted emptySubagents">${t('noSubagents')}</p>`;
  return `<div class="subagentGrid">${visible.map(subagentCard).join('')}</div>`;
}

function subagentCard(task) {
  const agent = subagentDisplayAgent(task);
  const observed = observedSubagentStatus(task);
  const title = task.summary || task.taskId;
  const age = timeAgo(task.updatedAt || task.createdAt);
  const selected = task.taskId === state.selectedSubagentId ? ' selected' : '';
  return `<button class="subagentCard ${esc(observed)}${selected}" data-action="selectSubagent" data-task-id="${esc(task.taskId)}">
    ${agentAvatar(agent, 'subagent')}
    <div class="subagentBody">
      <strong>${esc(agent.name || agent.id)}</strong>
      <span class="subagentStatus ${esc(observed)}">${esc(statusLabel(observed))}</span>
      <small class="subagentParentTitle">${esc(task.parentSessionTitle || compactPath(task.parentSessionPath) || t('noParent'))}</small>
      <small>${esc(title)}</small>
      <em>${esc(age)}</em>
    </div>
  </button>`;
}

function renderSubagentInspector(task) {
  if (!task) return `<div class="inspectorEmpty"><h2>${t('subagentInspector')}</h2><p class="muted">${t('noSubagent')}</p></div>`;
  const agent = subagentDisplayAgent(task);
  const observed = observedSubagentStatus(task);
  const title = task.summary || task.taskId;
  return `
    <div class="inspectorHead">
      ${agentAvatar(agent, 'big')}
      <div>
        <h2>${t('subagentInspector')}</h2>
        <p>${esc(agent.name || agent.id)} · ${esc(statusLabel(observed))}</p>
      </div>
    </div>
    ${detailPreview(task, title)}
    <div class="timeline">
      ${timelineRow(t('created'), task.createdAt)}
      ${timelineRow(t('updated'), task.updatedAt)}
      ${task.completedAt ? timelineRow(t('completedAt'), task.completedAt) : ''}
    </div>
    <div class="kvList">
      ${kv(t('executor'), agent.name || agent.id)}
      ${kv(t('requested'), task.requestedAgentName || task.requestedAgentId || t('unknown'))}
      ${kv(t('status'), statusLabel(observed))}
      ${kv(t('duration'), durationLabel(task))}
      ${kv(t('parent'), task.parentSessionTitle || compactPath(task.parentSessionPath) || t('noParent'))}
      ${kv(t('taskId'), task.taskId)}
      ${task.reason ? kv(t('reason'), task.reason) : kv(t('reason'), t('noReason'))}
    </div>
  `;
}

function detailPreview(task, text) {
  const value = String(text || task.taskId || '');
  const expanded = state.expandedDetailTaskId === task.taskId;
  const isLong = value.length > 180 || value.includes('\n');
  return `<div class="inspectorTask ${expanded ? 'expanded' : ''}">
    <div class="inspectorTaskHead">
      <span>${t('preview')}</span>
      ${isLong ? `<button data-action="toggleDetails" data-task-id="${esc(task.taskId)}">${expanded ? t('hideDetails') : t('viewDetails')}</button>` : ''}
    </div>
    ${expanded ? `<pre class="detailText">${esc(value)}</pre>` : `<p class="previewText">${esc(value)}</p>`}
  </div>`;
}

function timelineRow(label, value) {
  return `<div class="timelineRow"><span></span><div><strong>${esc(label)}</strong><small>${esc(value ? timeAgo(value) : t('unknown'))}</small></div></div>`;
}

function kv(label, value) {
  return `<div class="kv"><span>${esc(label)}</span><strong title="${esc(value)}">${esc(value)}</strong></div>`;
}

function agentContextCard(agent) {
  return `<div class="agentContextItem">
    ${agentAvatar(agent, 'mini')}
    <div><strong>${esc(agent.name)}</strong><small>${esc(agent.status)} · ${agent.health.score}</small></div>
  </div>`;
}

function agentAvatar(agent, size = '') {
  const initial = avatarInitial(agent);
  const src = agent.id && agent.id !== 'unknown' ? agentAvatarUrl(agent.id) : null;
  return `<span class="agentAvatar ${size} ${esc(agent.status || '')}" aria-hidden="true">
    <span class="avatarFallback">${esc(initial)}</span>
    ${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
  </span>`;
}

function agentAvatarUrl(agentId) {
  return apiUrl(`/api/agents/${encodeURIComponent(agentId)}/avatar`);
}

function avatarInitial(agent) {
  const text = String(agent.name || agent.id || '?').trim();
  return Array.from(text)[0]?.toUpperCase?.() || '?';
}

function subagentDisplayAgent(task) {
  const id = task.executorAgentId || task.requestedAgentId || task.agentId || 'unknown';
  const name = task.executorAgentName || task.requestedAgentName || id;
  return { id, name, status: observedSubagentStatus(task) };
}

function subagentStats(tasks) {
  const stats = { total: 0, active: 0, stale: 0, failed: 0, completed: 0 };
  for (const task of tasks || []) {
    stats.total += 1;
    const status = observedSubagentStatus(task);
    if (['running', 'pending', 'blocked', 'recovering'].includes(status)) stats.active += 1;
    if (status === 'stale') stats.stale += 1;
    if (['failed', 'aborted', 'canceled'].includes(status)) stats.failed += 1;
    if (['completed', 'resolved'].includes(status)) stats.completed += 1;
  }
  return stats;
}

function observedSubagentStatus(task) {
  const status = String(task?.status || 'unknown');
  if (['running', 'pending', 'blocked', 'recovering'].includes(status) && lastUpdateAgeMs(task) > staleThresholdMs()) {
    return 'stale';
  }
  return status;
}

function lastUpdateAgeMs(task) {
  const ts = new Date(task?.updatedAt || task?.createdAt || 0).getTime();
  return ts ? Date.now() - ts : 0;
}

function statusLabel(status) {
  if (status === 'stale') return t('stale');
  if (status === 'failed') return t('failed');
  if (status === 'completed' || status === 'resolved') return t('completed');
  if (status === 'running') return t('running');
  return status || t('unknown');
}

function durationLabel(task) {
  const start = new Date(task?.createdAt || 0).getTime();
  const end = new Date(task?.completedAt || task?.updatedAt || Date.now()).getTime();
  if (!start || !end || end < start) return t('unknown');
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  return minutes < 1 ? '<1m' : `${minutes}m`;
}

function compactPath(value) {
  if (!value) return '';
  const parts = String(value).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(-2).join('/');
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
      if (action === 'refresh') refresh();
      if (action === 'selectSubagent') { state.selectedSubagentId = el.dataset.taskId; state.expandedDetailTaskId = null; render(); }
      if (action === 'toggleDetails') { state.expandedDetailTaskId = state.expandedDetailTaskId === el.dataset.taskId ? null : el.dataset.taskId; render(); }
      if (action === 'setLang') setLang(el.dataset.lang);
    });
  });
}

function tryResize() {
  const height = Math.min(window.innerHeight || 900, Math.max(260, document.documentElement.scrollHeight));
  window.parent?.postMessage?.({ type: 'resize-request', payload: { height } }, '*');
  window.parent?.postMessage?.({ type: 'ready' }, '*');
}

function formatTokens(n) { n = Number(n || 0); return n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'k' : String(Math.round(n)); }
function timeAgo(value) { const t0 = new Date(value || 0).getTime(); if (!t0) return t('unknown'); const s = Math.max(0, Math.round((Date.now() - t0)/1000)); if (s < 60) return t('secondsAgo', { n: s }); const m = Math.round(s/60); return m < 60 ? t('minutesAgo', { n: m }) : t('hoursAgo', { n: Math.round(m/60) }); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function staleThresholdMs() {
  const minutes = Number(state.snapshot?.config?.staleAfterMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : DEFAULT_STALE_AFTER_MS;
}

function scheduleRefresh() {
  const ms = Math.max(2000, Math.min(60000, state.refreshIntervalMs || 5000));
  state.refreshIntervalMs = ms;
  if (state.refreshTimer) clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(async () => {
    await refresh();
    scheduleRefresh();
  }, ms);
}

refresh().then(() => scheduleRefresh());
connectEvents();
