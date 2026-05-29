export function createScrollHelpers(state) {

  function bindChatDisclosureMemory(root) {
    root.querySelectorAll('details[data-chat-disclosure-key]').forEach(el => {
      el.addEventListener('toggle', () => {
        state.chatDisclosureOpenByKey.set(el.dataset.chatDisclosureKey, el.open === true);
      });
    });
  }

  function bindDetailScrollMemory(root) {
    root.querySelectorAll('.detailText[data-task-id]').forEach(el => {
      el.addEventListener('scroll', () => {
        state.detailScrollTopByTaskId.set(el.dataset.taskId, el.scrollTop || 0);
      }, { passive: true });
    });
  }

  function bindChatScrollMemory(root) {
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

  function captureDetailScroll(root) {
    if (!root) return;
    root.querySelectorAll('.detailText[data-task-id]').forEach(el => {
      state.detailScrollTopByTaskId.set(el.dataset.taskId, el.scrollTop || 0);
    });
  }

  function restoreDetailScroll(root) {
    if (!root) return;
    root.querySelectorAll('.detailText[data-task-id]').forEach(el => {
      const saved = state.detailScrollTopByTaskId.get(el.dataset.taskId);
      if (typeof saved === 'number') el.scrollTop = saved;
    });
  }

  function captureChatScroll(root) {
    if (!root) return;
    root.querySelectorAll('.chatMessageList[data-chat-scroll-key]').forEach(rememberChatScroll);
  }

  function captureChatDisclosureState(root) {
    if (!root) return;
    root.querySelectorAll('details[data-chat-disclosure-key]').forEach(el => {
      state.chatDisclosureOpenByKey.set(el.dataset.chatDisclosureKey, el.open === true);
    });
  }

  function restoreChatScroll(root) {
    if (!root) return;
    root.querySelectorAll('.chatMessageList[data-chat-scroll-key]').forEach(applyChatScroll);
  }

  function scheduleChatScrollRestore(root) {
    const token = ++state.chatScrollRestoreToken;
    const restoreIfCurrent = () => {
      if (token === state.chatScrollRestoreToken) restoreChatScroll(root);
    };
    requestAnimationFrame(() => {
      restoreIfCurrent();
      requestAnimationFrame(restoreIfCurrent);
    });
    setTimeout(restoreIfCurrent, 80);
  }

  return {
    bindChatDisclosureMemory,
    bindDetailScrollMemory,
    bindChatScrollMemory,
    captureDetailScroll,
    restoreDetailScroll,
    captureChatScroll,
    captureChatDisclosureState,
    restoreChatScroll,
    scheduleChatScrollRestore,
  };
}
