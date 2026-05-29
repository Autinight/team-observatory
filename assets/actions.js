export function createActions({
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
}) {
  let rootActionsBound = false;

  const actionMap = {
    refresh: () => refresh(),
    selectSubagent: el => selectSubagent(el.dataset.taskId),
    toggleDetails: el => {
      state.expandedDetailTaskId = state.expandedDetailTaskId === el.dataset.taskId ? null : el.dataset.taskId;
      render();
    },
    toggleChat: el => toggleChatDetails(el.dataset.taskId),
    refreshChat: el => loadChatDetails(el.dataset.taskId, { force: true }),
    terminateSubagent: el => terminateSubagent(el.dataset.taskId),
    toggleSettings: () => {
      state.settingsOpen = !state.settingsOpen;
      render();
    },
    toggleConversationPanel: () => setConversationPanelEnabled(!state.conversationPanelEnabled),
    setLang: el => setLang(el.dataset.lang),
  };

  function bindRootActions() {
    if (!root || rootActionsBound) return;
    rootActionsBound = true;
    root.addEventListener('click', async event => {
      const start = event.target instanceof Element ? event.target : event.target?.parentElement;
      const el = start?.closest?.('[data-action]');
      if (!el || !root.contains(el)) return;
      const handler = actionMap[el.dataset.action];
      if (!handler) return;
      try {
        await handler(el, event);
      } catch (err) {
        console.error('Action handler failed', el?.dataset?.action, err);
      }
    });
  }

  return { bindRootActions };
}
