export const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;
export const ACTIVE_STATUSES = new Set(['running', 'pending', 'blocked', 'recovering']);
export const FAILED_STATUSES = new Set(['failed', 'aborted', 'canceled']);
export const COMPLETED_STATUSES = new Set(['completed', 'resolved']);
export const TERMINABLE_STATUSES = new Set(['running', 'pending', 'blocked', 'recovering', 'stale']);

export function staleThresholdMs(snapshot, fallbackMs = DEFAULT_STALE_AFTER_MS) {
  const minutes = Number(snapshot?.config?.staleAfterMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : fallbackMs;
}

export function observedSubagentStatus(task, staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  const status = String(task?.status || 'unknown');
  if (ACTIVE_STATUSES.has(status) && lastUpdateAgeMs(task) > staleAfterMs) {
    return 'stale';
  }
  return status;
}

export function lastUpdateAgeMs(task) {
  const ts = new Date(task?.updatedAt || task?.createdAt || 0).getTime();
  return ts ? Date.now() - ts : 0;
}

export function subagentStats(tasks, staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  const stats = { total: 0, active: 0, stale: 0, failed: 0, completed: 0 };
  for (const task of tasks || []) {
    stats.total += 1;
    const status = observedSubagentStatus(task, staleAfterMs);
    if (ACTIVE_STATUSES.has(status)) stats.active += 1;
    if (status === 'stale') stats.stale += 1;
    if (FAILED_STATUSES.has(status)) stats.failed += 1;
    if (COMPLETED_STATUSES.has(status)) stats.completed += 1;
  }
  return stats;
}

export function statusLabel(status, t) {
  if (status === 'stale') return t('stale');
  if (status === 'failed') return t('failed');
  if (status === 'aborted') return t('aborted');
  if (status === 'canceled') return t('canceled');
  if (status === 'completed' || status === 'resolved') return t('completed');
  if (status === 'running') return t('running');
  return status || t('unknown');
}

export function canTerminateSubagent(task, staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  return TERMINABLE_STATUSES.has(observedSubagentStatus(task, staleAfterMs));
}
