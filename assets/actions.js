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
  bindDetailScrollMemory,
  bindChatScrollMemory,
  bindChatDisclosureMemory,
}) {

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
    bindDetailScrollMemory(root);
    bindChatScrollMemory(root);
    bindChatDisclosureMemory(root);
  }

  return { bindActions };
}
