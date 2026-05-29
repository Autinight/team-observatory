export function getRootElement(documentLike = globalThis.document) {
  return documentLike?.getElementById?.('app') || null;
}

export function getSurface(root, documentLike = globalThis.document) {
  return root?.dataset?.surface || documentLike?.body?.dataset?.surface || 'dashboard';
}

export function currentSearchParams(getCurrentHref = () => globalThis.window?.location?.href || globalThis.location?.href || '') {
  const href = getCurrentHref();
  return new URL(href || 'http://localhost/').searchParams;
}

export function resizeHostFrame(state, {
  windowLike = globalThis.window,
  documentLike = globalThis.document,
  minHeight = 260,
  fallbackInnerHeight = 900,
} = {}) {
  const height = Math.min(
    windowLike?.innerHeight || fallbackInnerHeight,
    Math.max(minHeight, documentLike?.documentElement?.scrollHeight || minHeight),
  );
  if (Math.abs(height - (state.lastResizeHeight || 0)) > 2) {
    state.lastResizeHeight = height;
    windowLike?.parent?.postMessage?.({ type: 'resize-request', payload: { height } }, '*');
  }
  if (!state.readyPosted) {
    state.readyPosted = true;
    windowLike?.parent?.postMessage?.({ type: 'ready' }, '*');
  }
}
