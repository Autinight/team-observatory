const moduleSearch = new URL(import.meta.url).search;
const [
  { createApiClient },
  { loadLang, saveLang, translate },
  {
    canTerminateSubagent: canTerminateByStatus,
    observedSubagentStatus: observedStatus,
    staleThresholdMs: resolveStaleThresholdMs,
    statusLabel: labelStatus,
    subagentStats: calculateSubagentStats,
  },
  { currentSearchParams, getRootElement, getSurface, resizeHostFrame },
  { createInitialState, saveConversationPanelEnabled },
  { createAvatarHelpers },
  { createScrollHelpers },
  { createUtils },
  { createActions },
] = await Promise.all([
  import(`./api.js${moduleSearch}`),
  import(`./i18n.js${moduleSearch}`),
  import(`./status.js${moduleSearch}`),
  import(`./platform.js${moduleSearch}`),
  import(`./state.js${moduleSearch}`),
  import(`./avatar.js${moduleSearch}`),
  import(`./scroll.js${moduleSearch}`),
  import(`./utils.js${moduleSearch}`),
  import(`./actions.js${moduleSearch}`),
]);

const root = getRootElement();
const surface = getSurface(root);

const state = createInitialState({ lang: loadLang() });

const {
  apiUrl,
  apiJson,
  pluginPath,
  agentAvatarUrl,
  abortTaskLikeChatCard,
} = createApiClient({ root });

function t(key, vars = {}) {
  return translate(state.lang, key, vars);
}

const { formatTokens, timeAgo, esc, compactPath } = createUtils({ t });

const { avatarInitial, agentAvatar, warmAvatarCache, ensureAvatarCached } = createAvatarHelpers({
  esc,
  agentAvatarUrl,
  getAvatarCache: () => state.avatarCache,
  getAvatarFetches: () => state.avatarFetches,
  onAvatarReady: () => render(),
});

const {
  bindChatDisclosureMemory,
  bindDetailScrollMemory,
  bindChatScrollMemory,
  captureDetailScroll,
  restoreDetailScroll,
  captureChatScroll,
  captureChatDisclosureState,
  restoreChatScroll,
  scheduleChatScrollRestore,
} = createScrollHelpers(state);

const { bindActions } = createActions({
  root,
  state,
  refresh,
  render,
  selectSubagent,
  toggleChatDetails,
  loadChatDetails,
  terminateSubagent,
  setConversationPanelEnabled,
  setLang,
  bindDetailScrollMemory,
  bindChatScrollMemory,
  bindChatDisclosureMemory,
});

function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  state.lang = lang;
  saveLang(lang);
  render();
}

function setConversationPanelEnabled(enabled) {
  state.conversationPanelEnabled = !!enabled;
  saveConversationPanelEnabled(state.conversationPanelEnabled);
  if (!state.conversationPanelEnabled) {
    state.expandedChatTaskId = null;
    state.chatLoadingTaskId = null;
    state.chatErrorByTaskId.clear();
  }
  render();
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
  captureDetailScroll(root);
  captureChatScroll(root);
  captureChatDisclosureState(root);
  root.innerHTML = surface === 'widget' ? renderWidget() : renderDashboard();
  bindActions();
  restoreDetailScroll(root);
  restoreChatScroll(root);
  scheduleChatScrollRestore(root);
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
  const params = currentSearchParams();
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
  return calculateSubagentStats(tasks, staleThresholdMs());
}

function observedSubagentStatus(task) {
  return observedStatus(task, staleThresholdMs());
}

function statusLabel(status) {
  return labelStatus(status, t);
}

function durationLabel(task) {
  const start = new Date(task?.createdAt || 0).getTime();
  const end = new Date(task?.completedAt || task?.updatedAt || Date.now()).getTime();
  if (!start || !end || end < start) return t('unknown');
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  return minutes < 1 ? '<1m' : `${minutes}m`;
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
  return canTerminateByStatus(task, staleThresholdMs());
}

async function terminateSubagent(taskId) {
  if (!taskId || state.terminatingTaskId) return;
  state.terminatingTaskId = taskId;
  state.error = null;
  render();
  try {
    await abortTaskLikeChatCard(taskId);
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

function tryResize() {
  resizeHostFrame(state);
}

function conversationPanelEnabled() {
  return state.conversationPanelEnabled === true;
}

function staleThresholdMs() {
  return resolveStaleThresholdMs(state.snapshot);
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
