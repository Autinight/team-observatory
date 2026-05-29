const root = document.getElementById('app');
const surface = root?.dataset.surface || document.body.dataset.surface || 'dashboard';

const LANG_KEY = 'subagent-observatory.lang';
const CONVERSATION_PANEL_KEY = 'subagent-observatory.conversationPanelEnabled';
const DEFAULT_LANG = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

const I18N = {
  en: {
    opening: 'Opening observatory...',
    offlineTitle: 'Observatory offline',
    retry: 'Retry',
    eyebrow: 'Subagent Observatory',
    title: 'Subagent Observatory',
    subtitle: 'Monitor the state of subagents that exist in currently managed sessions.',
    running: 'running',
    refresh: 'Refresh',
    subagentRuns: 'Subagent Runs',
    subagentInspector: 'Subagent Inspector',
    noSubagent: 'No subagent selected.',
    noSubagents: 'No subagent runs. The backstage is quiet.',
    noWidgetSubagents: 'No subagent runs in this session.',
    noCurrentSession: 'No current session.',
    blackboxSignals: 'Blackbox Signals',
    agents: 'Agents',
    agentContext: 'Agent Context',
    alerts: 'Alerts',
    quiet: 'No alerts. Subagent runs are quiet.',
    usagePressure: 'Usage Pressure',
    last24h: 'last 24h',
    noUsage: 'No usage records.',
    observing: 'Observing...',
    offline: 'Offline',
    team: 'Subagents',
    healthScore: 'health',
    tasks: 'Tasks',
    subagents: 'subagents',
    tokens: 'Tokens',
    total: 'Total',
    stale: 'Stale',
    failed: 'Failed',
    aborted: 'Aborted',
    canceled: 'Canceled',
    completed: 'Completed',
    active: 'Active',
    requested: 'Requested',
    executor: 'Executor',
    status: 'Status',
    task: 'Task',
    preview: 'Preview',
    viewDetails: 'View details',
    hideDetails: 'Hide details',
    chatDetails: 'Conversation',
    hideChat: 'Hide conversation',
    refreshChat: 'Refresh conversation',
    loadChat: 'Load conversation',
    terminateSubagent: 'Terminate subagent',
    terminatingSubagent: 'Terminating...',
    conversationPanelSetting: 'Conversation panel',
    conversationPanelOn: 'On',
    conversationPanelOff: 'Off',
    settings: 'Settings',
    mainConversation: 'Main agent',
    subagentConversation: 'Subagent',
    noMessages: 'No messages.',
    chatUnavailable: 'Chat history unavailable.',
    thinking: 'Thinking',
    toolCalls: 'Tool calls',
    images: 'Images',
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
    title: 'Subagent Observatory',
    subtitle: '监控当前管理的会话中存在的 subagent 的状态。',
    running: '运行中',
    refresh: '刷新',
    subagentRuns: 'Subagent 运行',
    subagentInspector: 'Subagent 检查器',
    noSubagent: '未选择 subagent',
    noSubagents: '暂无 subagent 运行，后台很安静。',
    noWidgetSubagents: '当前会话暂无 subagent。',
    noCurrentSession: '没有当前会话。',
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
    team: 'Subagent',
    healthScore: '健康分',
    tasks: '任务',
    subagents: 'Subagent',
    tokens: 'Token',
    total: '总数',
    stale: '停滞',
    failed: '失败',
    aborted: '已终止',
    canceled: '已取消',
    completed: '完成',
    active: '活跃',
    requested: '请求目标',
    executor: '执行者',
    status: '状态',
    task: '任务',
    preview: '预览',
    viewDetails: '查看详情',
    hideDetails: '收起详情',
    chatDetails: '对话详情',
    hideChat: '隐藏对话',
    refreshChat: '刷新对话',
    loadChat: '加载对话',
    terminateSubagent: '终止 subagent',
    terminatingSubagent: '正在终止...',
    conversationPanelSetting: '对话面板',
    conversationPanelOn: '开',
    conversationPanelOff: '关',
    settings: '设置',
    mainConversation: 'Main Agent',
    subagentConversation: 'Subagent',
    noMessages: '没有消息。',
    chatUnavailable: '聊天历史不可用。',
    thinking: '思考',
    toolCalls: '工具调用',
    images: '图片',
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
  expandedChatTaskId: null,
  loading: true,
  error: null,
  lastRefresh: null,
  refreshTimer: null,
  lastResizeHeight: 0,
  readyPosted: false,
  settingsOpen: false,
  refreshIntervalMs: 5000,
  isRefreshing: false,
  refreshQueued: false,
  detailScrollTopByTaskId: new Map(),
  chatByTaskId: new Map(),
  chatErrorByTaskId: new Map(),
  chatLoadingTaskId: null,
  chatScrollTopByKey: new Map(),
  chatScrollRestoreToken: 0,
  chatDisclosureOpenByKey: new Map(),
  terminatingTaskId: null,
  avatarCache: new Map(),
  avatarFetches: new Map(),
  conversationPanelEnabled: loadConversationPanelEnabled(),
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

function loadConversationPanelEnabled() {
  return localStorage.getItem(CONVERSATION_PANEL_KEY) === 'true';
}

function setConversationPanelEnabled(enabled) {
  state.conversationPanelEnabled = !!enabled;
  localStorage.setItem(CONVERSATION_PANEL_KEY, state.conversationPanelEnabled ? 'true' : 'false');
  if (!state.conversationPanelEnabled) {
    state.expandedChatTaskId = null;
    state.chatLoadingTaskId = null;
    state.chatErrorByTaskId.clear();
  }
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

async function refresh() {
  if (state.isRefreshing) {
    state.refreshQueued = true;
    return;
  }
  state.isRefreshing = true;
  try {
    const wasInitialLoad = !state.snapshot;
    const hadError = !!state.error;
    state.loading = wasInitialLoad;
    state.error = null;
    if (wasInitialLoad || hadError) render();

    state.snapshot = await apiJson(pluginPath('/api/snapshot'));
    warmAvatarCache(state.snapshot);
    state.lastRefresh = Date.now();
    if (state.snapshot?.config?.refreshIntervalMs) {
      state.refreshIntervalMs = state.snapshot.config.refreshIntervalMs;
    }
    const subagents = state.snapshot.subagents || [];
    if (subagents.length && !subagents.some(task => task.taskId === state.selectedSubagentId)) {
      state.selectedSubagentId = subagents[0].taskId;
      state.expandedChatTaskId = null;
    }
    if (state.expandedChatTaskId && !subagents.some(task => task.taskId === state.expandedChatTaskId)) {
      state.expandedChatTaskId = null;
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

function warmAvatarCache(snap) {
  const ids = new Set();
  for (const agent of snap?.agents || []) {
    if (agent.id && agent.id !== 'unknown') ids.add(agent.id);
  }
  for (const task of snap?.subagents || []) {
    const requestedAgent = subagentDisplayAgent(task);
    const executorAgent = executorDisplayAgent(task);
    for (const agent of [requestedAgent, executorAgent]) {
      if (agent.id && agent.id !== 'unknown') ids.add(agent.id);
    }
  }
  for (const id of ids) ensureAvatarCached(id);
}

function ensureAvatarCached(agentId) {
  if (!agentId || state.avatarCache.has(agentId) || state.avatarFetches.has(agentId)) return;
  const promise = fetch(agentAvatarUrl(agentId))
    .then(res => res.ok ? res.blob() : null)
    .then(blob => {
      state.avatarCache.set(agentId, blob ? URL.createObjectURL(blob) : null);
      state.avatarFetches.delete(agentId);
      render();
    })
    .catch(() => {
      state.avatarCache.set(agentId, null);
      state.avatarFetches.delete(agentId);
    });
  state.avatarFetches.set(agentId, promise);
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
  captureDetailScroll();
  captureChatScroll();
  captureChatDisclosureState();
  root.innerHTML = surface === 'widget' ? renderWidget() : renderDashboard();
  bindActions();
  restoreDetailScroll();
  restoreChatScroll();
  scheduleChatScrollRestore();
  tryResize();
}

function renderDashboard() {
  const snap = state.snapshot;
  if (state.loading && !snap) return `<main class="shell"><div class="loadingOrb"></div><p class="muted">${t('opening')}</p></main>`;
  if (state.error && !snap) return `<main class="shell"><section class="card danger"><h2>${t('offlineTitle')}</h2><p>${esc(state.error)}</p><button data-action="refresh">${t('retry')}</button></section></main>`;
  if (!snap) return '';

  const subagents = snap.subagents || [];
  const selected = subagents.find(task => task.taskId === state.selectedSubagentId) || subagents[0] || null;
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
          <div class="heroControls">
            ${settingsMenu()}
            ${languageSwitch()}
          </div>
          <div class="heroStats subagentStats">
            ${metric(t('active'), stats.active)}
            ${metric(t('stale'), stats.stale)}
            ${metric(t('failed'), stats.failed)}
            ${metric(t('completed'), stats.completed)}
          </div>
        </div>
      </header>

      ${state.error ? `<div class="inlineError">${esc(state.error)}</div>` : ''}

      <section class="subagentLayout">
        <div class="subagentLeftColumn">
          <div class="card subagentMainCard">
            <div class="cardHead">
              <div><h2>${t('subagentRuns')}</h2></div>
              <button data-action="refresh">${t('refresh')}</button>
            </div>
            ${subagentGrid(subagents)}
          </div>
          ${conversationPanelEnabled() ? renderChatBoard(selected) : ''}
        </div>
        <aside class="card inspectorCard">
          ${renderSubagentInspector(selected)}
        </aside>
      </section>
    </main>
  `;
}

function settingsMenu() {
  const open = state.settingsOpen;
  const enabled = conversationPanelEnabled();
  return `<div class="settingsMenu ${open ? 'open' : ''}">
    <button class="settingsIcon" data-action="toggleSettings" aria-label="${t('settings')}" aria-expanded="${open}">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="3.2"></circle>
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2.05 2.05 0 0 1 0 2.9 2.05 2.05 0 0 1-2.9 0l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2.05 2.05 0 0 1-4.1 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2.05 2.05 0 0 1-2.9 0 2.05 2.05 0 0 1 0-2.9l.06-.06A1.7 1.7 0 0 0 4.4 15a1.7 1.7 0 0 0-1.56-1.03H2.75a2.05 2.05 0 0 1 0-4.1h.09A1.7 1.7 0 0 0 4.4 8.84a1.7 1.7 0 0 0-.34-1.87L4 6.91a2.05 2.05 0 0 1 0-2.9 2.05 2.05 0 0 1 2.9 0l.06.06a1.7 1.7 0 0 0 1.87.34A1.7 1.7 0 0 0 9.86 2.85V2.75a2.05 2.05 0 0 1 4.1 0v.09A1.7 1.7 0 0 0 15 4.4a1.7 1.7 0 0 0 1.87-.34l.06-.06a2.05 2.05 0 0 1 2.9 0 2.05 2.05 0 0 1 0 2.9l-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.03h.09a2.05 2.05 0 0 1 0 4.1h-.09A1.7 1.7 0 0 0 19.4 15z"></path>
      </svg>
    </button>
    ${open ? `<div class="settingsPopover">
      <button class="settingsRow" data-action="toggleConversationPanel" aria-pressed="${enabled}">
        <span>${t('conversationPanelSetting')}</span>
        <strong class="settingState ${enabled ? 'on' : 'off'}">${enabled ? t('conversationPanelOn') : t('conversationPanelOff')}</strong>
      </button>
    </div>` : ''}
  </div>`;
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
  const currentSession = currentWidgetSession(snap);
  const subagents = currentSession
    ? (snap.subagents || []).filter(task => samePath(task.parentSessionPath, currentSession.path))
    : [];
  const stats = subagentStats(subagents);
  return `
    <main class="widget subagentWidget">
      <header>
        <div><strong>${t('subagents')}</strong><small>${esc(currentSession?.title || t('noCurrentSession'))}</small></div>
        <button data-action="refresh">↻</button>
      </header>
      <div class="widgetStats">
        <span class="running">${stats.active} ${t('running')}</span>
        <span class="completed">${stats.completed} ${t('completed')}</span>
        <span class="failed">${stats.failed} ${t('failed')}</span>
      </div>
      <div class="widgetSubagentList">
        ${subagents.slice(0, 8).map(widgetSubagentCard).join('') || `<p class="muted">${t('noWidgetSubagents')}</p>`}
      </div>
    </main>
  `;
}

function currentWidgetSession(snap) {
  const params = new URL(window.location.href).searchParams;
  const sessionPath = params.get('sessionPath');
  if (sessionPath) {
    const known = (snap.agents || [])
      .flatMap(agent => [agent.lastSession, ...(agent.recentSessions || [])])
      .find(session => samePath(session?.path, sessionPath));
    return known || { path: sessionPath, title: compactPath(sessionPath) };
  }

  const agentId = params.get('agentId');
  const agent = snap.agents.find(a => a.id === agentId)
    || snap.agents.find(a => a.isCurrent)
    || snap.agents.find(a => a.isPrimary)
    || snap.agents[0];
  const session = agent?.lastSession || agent?.recentSessions?.[0] || null;
  return session?.path ? session : null;
}

function widgetSubagentCard(task) {
  const agent = subagentDisplayAgent(task);
  const observed = observedSubagentStatus(task);
  return `<div class="widgetSubagentCard ${esc(observed)}">
    ${agentAvatar(agent, 'mini')}
    <div>
      <strong>${esc(agent.name || agent.id)}</strong>
      <span>${esc(statusLabel(observed))} · ${esc(timeAgo(task.updatedAt || task.createdAt))}</span>
      <small>${esc(task.summary || task.taskId)}</small>
    </div>
  </div>`;
}

function samePath(a, b) {
  if (!a || !b) return false;
  return String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
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
  const requestedAgent = subagentDisplayAgent(task);
  const executorAgent = executorDisplayAgent(task);
  const observed = observedSubagentStatus(task);
  const title = task.summary || task.taskId;
  return `
    <div class="inspectorHead">
      ${agentAvatar(requestedAgent, 'big')}
      <div>
        <h2>${t('subagentInspector')}</h2>
        <p>${esc(requestedAgent.name || requestedAgent.id)} · ${esc(statusLabel(observed))}</p>
      </div>
    </div>
    ${detailPreview(task, title)}
    ${canTerminateSubagent(task) ? renderTerminateActions(task) : ''}
    <div class="timeline">
      ${timelineRow(t('created'), task.createdAt)}
      ${timelineRow(t('updated'), task.updatedAt)}
      ${task.completedAt ? timelineRow(t('completedAt'), task.completedAt) : ''}
    </div>
    <div class="kvList">
      ${kv(t('executor'), executorAgent.name || executorAgent.id || t('unknown'))}
      ${kv(t('requested'), requestedAgent.name || requestedAgent.id || t('unknown'))}
      ${kv(t('status'), statusLabel(observed))}
      ${kv(t('duration'), durationLabel(task))}
      ${kv(t('parent'), task.parentSessionTitle || compactPath(task.parentSessionPath) || t('noParent'))}
      ${kv(t('taskId'), task.taskId)}
      ${task.reason ? kv(t('reason'), task.reason) : kv(t('reason'), t('noReason'))}
    </div>
  `;
}

function renderTerminateActions(task) {
  const taskId = task.taskId;
  const isTerminating = state.terminatingTaskId === taskId;
  return `<div class="inspectorActions terminateActions">
    <button class="dangerButton" data-action="terminateSubagent" data-task-id="${esc(taskId)}" ${isTerminating ? 'disabled' : ''}>${isTerminating ? t('terminatingSubagent') : t('terminateSubagent')}</button>
  </div>`;
}

function renderChatBoard(task) {
  if (!task) {
    return `<section class="card chatBoard emptyChatBoard">
      <div class="cardHead chatBoardHead">
        <div>
          <h2>${t('chatDetails')}</h2>
          <p class="muted">${t('noSubagent')}</p>
        </div>
      </div>
    </section>`;
  }
  const requestedAgent = subagentDisplayAgent(task);
  const executorAgent = executorDisplayAgent(task);
  const isOpen = state.expandedChatTaskId === task.taskId;
  return `<section class="card chatBoard">
    <div class="cardHead chatBoardHead">
      <div>
        <h2>${t('chatDetails')}</h2>
        <p class="muted">${esc(requestedAgent.name || requestedAgent.id)} ⇄ ${esc(executorAgent.name || executorAgent.id)}</p>
      </div>
      <div class="inspectorActions chatActions ${isOpen ? 'open' : 'closed'}">
        ${isOpen ? `<button data-action="refreshChat" data-task-id="${esc(task.taskId)}">${t('refreshChat')}</button>` : ''}
        <button data-action="toggleChat" data-task-id="${esc(task.taskId)}">${isOpen ? t('hideChat') : t('loadChat')}</button>
      </div>
    </div>
    ${isOpen ? renderChatDetails(task) : ''}
  </section>`;
}

async function toggleChatDetails(taskId) {
  if (!conversationPanelEnabled()) return;
  if (!taskId) return;
  if (state.expandedChatTaskId === taskId) {
    state.expandedChatTaskId = null;
    render();
    return;
  }
  state.expandedChatTaskId = taskId;
  render();
  await loadChatDetails(taskId);
}

async function loadChatDetails(taskId, options = {}) {
  if (!conversationPanelEnabled()) return;
  if (!taskId) return;
  if (!options.force && state.chatByTaskId.has(taskId)) {
    render();
    return;
  }
  state.chatLoadingTaskId = taskId;
  state.chatErrorByTaskId.delete(taskId);
  render();
  try {
    const chat = await apiJson(pluginPath(`/api/subagent-chat?taskId=${encodeURIComponent(taskId)}&limit=120`));
    state.chatByTaskId.set(taskId, chat);
  } catch (err) {
    state.chatErrorByTaskId.set(taskId, err.message || String(err));
  } finally {
    if (state.chatLoadingTaskId === taskId) state.chatLoadingTaskId = null;
    render();
  }
}

function renderChatDetails(task) {
  const taskId = task.taskId;
  const chat = state.chatByTaskId.get(taskId);
  const error = state.chatErrorByTaskId.get(taskId);
  const loading = state.chatLoadingTaskId === taskId;
  if (loading && !chat) return `<div class="chatDetails"><p class="muted">${t('observing')}</p></div>`;
  if (error && !chat) return `<div class="chatDetails"><p class="inlineError">${esc(error)}</p></div>`;
  if (!chat) return `<div class="chatDetails"><p class="muted">${t('chatUnavailable')}</p></div>`;
  const messages = conversationMessages(chat);
  return `<div class="chatDetails ${loading ? 'loading' : ''}">
    ${error ? `<p class="inlineError">${esc(error)}</p>` : ''}
    <div class="chatLegend">
      <span class="legendSubagent">${t('subagentConversation')}: ${esc(chat.child?.agentName || chat.child?.agentId || t('unknown'))}</span>
      <span class="legendMain">${t('mainConversation')}: ${esc(chat.main?.agentName || chat.main?.agentId || t('unknown'))}</span>
    </div>
    ${chat.child?.available === false ? `<p class="muted">${esc(chat.child.error || t('chatUnavailable'))}</p>` : ''}
    <div class="chatMessageList single" data-chat-scroll-key="chat:${esc(taskId)}">
      ${messages.length ? messages.map(message => renderChatMessage(message, taskId)).join('') : `<p class="muted">${t('noMessages')}</p>`}
    </div>
  </div>`;
}

function conversationMessages(chat) {
  const messages = Array.isArray(chat?.child?.messages) ? chat.child.messages : [];
  return messages.map((message, index) => {
    const role = String(message?.role || 'unknown').toLowerCase();
    const isMainPrompt = role === 'user';
    return {
      ...message,
      side: isMainPrompt ? 'main' : 'subagent',
      source: isMainPrompt ? t('mainConversation') : t('subagentConversation'),
      displayRole: isMainPrompt ? 'request' : role,
      order: index,
    };
  });
}

function renderChatMessage(message, taskId) {
  const role = String(message?.role || 'unknown').toLowerCase();
  const side = message?.side === 'main' ? 'main' : 'subagent';
  const displayRole = String(message?.displayRole || role);
  const content = String(message?.content || '').trim();
  const thinking = String(message?.thinking || '').trim();
  const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  const images = Array.isArray(message?.images) ? message.images : [];
  const messageKey = `chat:${taskId}:message:${message?.order ?? 0}`;
  const thinkingKey = `${messageKey}:thinking`;
  const toolCallsKey = `${messageKey}:toolCalls`;
  const thinkingOpen = state.chatDisclosureOpenByKey.get(thinkingKey) === true;
  const toolCallsOpen = state.chatDisclosureOpenByKey.get(toolCallsKey) === true;
  return `<div class="chatRow ${esc(side)}">
    <div class="chatBubble ${esc(role)}">
      <div class="chatRole">${esc(message?.source || side)} · ${esc(displayRole)}</div>
      ${content ? `<pre>${esc(content)}</pre>` : ''}
      ${thinking ? `<details data-chat-disclosure-key="${esc(thinkingKey)}" ${thinkingOpen ? 'open' : ''}><summary>${t('thinking')}</summary><pre>${esc(thinking)}</pre></details>` : ''}
      ${toolCalls.length ? `<details data-chat-disclosure-key="${esc(toolCallsKey)}" ${toolCallsOpen ? 'open' : ''}><summary>${t('toolCalls')} · ${toolCalls.length}</summary><pre>${esc(JSON.stringify(toolCalls, null, 2))}</pre></details>` : ''}
      ${images.length ? `<small class="muted">${t('images')}: ${images.length}</small>` : ''}
    </div>
  </div>`;
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
    ${expanded ? `<pre class="detailText" data-task-id="${esc(task.taskId)}">${esc(value)}</pre>` : `<p class="previewText">${esc(value)}</p>`}
  </div>`;
}

function timelineRow(label, value) {
  return `<div class="timelineRow"><span></span><div><strong>${esc(label)}</strong><small>${esc(value ? timeAgo(value) : t('unknown'))}</small></div></div>`;
}

function kv(label, value) {
  return `<div class="kv"><span>${esc(label)}</span><strong title="${esc(value)}">${esc(value)}</strong></div>`;
}

function agentAvatar(agent, size = '') {
  const initial = avatarInitial(agent);
  const cached = agent.id && state.avatarCache.has(agent.id) ? state.avatarCache.get(agent.id) : undefined;
  const src = agent.id && agent.id !== 'unknown' ? (cached !== undefined ? cached : agentAvatarUrl(agent.id)) : null;
  return `<span class="agentAvatar ${size} ${esc(agent.status || '')}" aria-hidden="true">
    <span class="avatarFallback">${esc(initial)}</span>
    ${src ? `<img src="${esc(src)}" alt="" loading="eager" decoding="async" onerror="this.remove()">` : ''}
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
  const id = task.subagentAgentId || task.requestedAgentId || task.agentId || task.executorAgentId || 'unknown';
  const name = task.subagentAgentName || task.requestedAgentName || task.agentName || id;
  return { id, name, status: observedSubagentStatus(task) };
}

function executorDisplayAgent(task) {
  const id = task.dispatchingAgentId || task.executorAgentId || 'unknown';
  const name = task.dispatchingAgentName || task.executorAgentName || id;
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
  if (status === 'aborted') return t('aborted');
  if (status === 'canceled') return t('canceled');
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

async function selectSubagent(taskId) {
  if (!taskId) return;
  const keepChatOpen = conversationPanelEnabled() && !!state.expandedChatTaskId;
  state.selectedSubagentId = taskId;
  state.expandedDetailTaskId = null;
  state.expandedChatTaskId = keepChatOpen ? taskId : null;
  render();
  if (keepChatOpen) await loadChatDetails(taskId);
}

function canTerminateSubagent(task) {
  return ['running', 'pending', 'blocked', 'recovering', 'stale'].includes(observedSubagentStatus(task));
}

async function terminateSubagent(taskId) {
  if (!taskId || state.terminatingTaskId) return;
  state.terminatingTaskId = taskId;
  state.error = null;
  render();
  try {
    await apiJson(`/api/task/${encodeURIComponent(taskId)}/abort`, { method: 'POST' });
    markSubagentTerminated(taskId);
    render();
    setTimeout(() => { refresh(); }, 600);
  } catch (err) {
    state.error = err.message || String(err);
  } finally {
    state.terminatingTaskId = null;
    render();
  }
}

function markSubagentTerminated(taskId) {
  const now = new Date().toISOString();
  const patch = task => task.taskId === taskId
    ? { ...task, status: 'aborted', reason: task.reason || t('aborted'), updatedAt: now, completedAt: task.completedAt || now }
    : task;
  if (Array.isArray(state.snapshot?.subagents)) state.snapshot.subagents = state.snapshot.subagents.map(patch);
  if (Array.isArray(state.snapshot?.tasks)) state.snapshot.tasks = state.snapshot.tasks.map(patch);
}

function bindActions() {
  root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      if (action === 'refresh') refresh();
      if (action === 'selectSubagent') await selectSubagent(el.dataset.taskId);
      if (action === 'toggleDetails') { state.expandedDetailTaskId = state.expandedDetailTaskId === el.dataset.taskId ? null : el.dataset.taskId; render(); }
      if (action === 'toggleChat') await toggleChatDetails(el.dataset.taskId);
      if (action === 'refreshChat') await loadChatDetails(el.dataset.taskId, { force: true });
      if (action === 'terminateSubagent') await terminateSubagent(el.dataset.taskId);
      if (action === 'toggleSettings') { state.settingsOpen = !state.settingsOpen; render(); }
      if (action === 'toggleConversationPanel') setConversationPanelEnabled(!state.conversationPanelEnabled);
      if (action === 'setLang') setLang(el.dataset.lang);
    });
  });
  bindDetailScrollMemory();
  bindChatScrollMemory();
  bindChatDisclosureMemory();
}

function bindChatDisclosureMemory() {
  root.querySelectorAll('details[data-chat-disclosure-key]').forEach(el => {
    el.addEventListener('toggle', () => {
      state.chatDisclosureOpenByKey.set(el.dataset.chatDisclosureKey, el.open === true);
    });
  });
}

function bindDetailScrollMemory() {
  root.querySelectorAll('.detailText[data-task-id]').forEach(el => {
    el.addEventListener('scroll', () => {
      state.detailScrollTopByTaskId.set(el.dataset.taskId, el.scrollTop || 0);
    }, { passive: true });
  });
}

function bindChatScrollMemory() {
  root.querySelectorAll('.chatMessageList[data-chat-scroll-key]').forEach(el => {
    const remember = () => rememberChatScroll(el);
    el.addEventListener('scroll', remember, { passive: true });
    el.addEventListener('wheel', () => requestAnimationFrame(remember), { passive: true });
    el.addEventListener('touchmove', () => requestAnimationFrame(remember), { passive: true });
  });
}

function rememberChatScroll(el) {
  const key = el?.dataset?.chatScrollKey;
  if (!key) return;
  const top = el.scrollTop || 0;
  const maxTop = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
  state.chatScrollTopByKey.set(key, {
    top,
    bottom: Math.max(0, maxTop - top),
    atBottom: maxTop - top <= 3,
  });
}

function applyChatScroll(el) {
  const saved = state.chatScrollTopByKey.get(el.dataset.chatScrollKey);
  if (saved == null) return;
  if (typeof saved === 'number') {
    el.scrollTop = saved;
    return;
  }
  const maxTop = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
  el.scrollTop = saved.atBottom ? maxTop : Math.min(saved.top || 0, maxTop);
}

function captureDetailScroll() {
  if (!root) return;
  root.querySelectorAll('.detailText[data-task-id]').forEach(el => {
    state.detailScrollTopByTaskId.set(el.dataset.taskId, el.scrollTop || 0);
  });
}

function restoreDetailScroll() {
  if (!root) return;
  root.querySelectorAll('.detailText[data-task-id]').forEach(el => {
    const saved = state.detailScrollTopByTaskId.get(el.dataset.taskId);
    if (typeof saved === 'number') el.scrollTop = saved;
  });
}

function captureChatScroll() {
  if (!root) return;
  root.querySelectorAll('.chatMessageList[data-chat-scroll-key]').forEach(rememberChatScroll);
}

function captureChatDisclosureState() {
  if (!root) return;
  root.querySelectorAll('details[data-chat-disclosure-key]').forEach(el => {
    state.chatDisclosureOpenByKey.set(el.dataset.chatDisclosureKey, el.open === true);
  });
}

function restoreChatScroll() {
  if (!root) return;
  root.querySelectorAll('.chatMessageList[data-chat-scroll-key]').forEach(applyChatScroll);
}

function scheduleChatScrollRestore() {
  const token = ++state.chatScrollRestoreToken;
  const restoreIfCurrent = () => {
    if (token === state.chatScrollRestoreToken) restoreChatScroll();
  };
  requestAnimationFrame(() => {
    restoreIfCurrent();
    requestAnimationFrame(restoreIfCurrent);
  });
  setTimeout(restoreIfCurrent, 80);
}

function tryResize() {
  const height = Math.min(window.innerHeight || 900, Math.max(260, document.documentElement.scrollHeight));
  if (Math.abs(height - (state.lastResizeHeight || 0)) > 2) {
    state.lastResizeHeight = height;
    window.parent?.postMessage?.({ type: 'resize-request', payload: { height } }, '*');
  }
  if (!state.readyPosted) {
    state.readyPosted = true;
    window.parent?.postMessage?.({ type: 'ready' }, '*');
  }
}

function formatTokens(n) { n = Number(n || 0); return n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'k' : String(Math.round(n)); }
function timeAgo(value) { const t0 = new Date(value || 0).getTime(); if (!t0) return t('unknown'); const s = Math.max(0, Math.round((Date.now() - t0)/1000)); if (s < 60) return t('secondsAgo', { n: s }); const m = Math.round(s/60); return m < 60 ? t('minutesAgo', { n: m }) : t('hoursAgo', { n: Math.round(m/60) }); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function conversationPanelEnabled() {
  return state.conversationPanelEnabled === true;
}

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
