const CONVERSATION_PANEL_KEY = 'subagent-observatory.conversationPanelEnabled';

export function loadConversationPanelEnabled(storage = globalThis.localStorage) {
  return storage?.getItem?.(CONVERSATION_PANEL_KEY) === 'true';
}

export function saveConversationPanelEnabled(enabled, storage = globalThis.localStorage) {
  storage?.setItem?.(CONVERSATION_PANEL_KEY, enabled ? 'true' : 'false');
}

export function createInitialState({ conversationPanelEnabled = loadConversationPanelEnabled(), lang } = {}) {
  return {
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
    conversationPanelEnabled,
    lang,
  };
}
