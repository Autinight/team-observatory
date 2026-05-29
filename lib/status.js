export const ACTIVE_STATUSES = new Set(["pending", "running", "paused", "blocked", "recovering"]);
export const FAILED_STATUSES = new Set(["failed", "aborted", "canceled", "cancelled"]);
export const FINAL_STATUSES = new Set(["completed", "resolved", "failed", "aborted", "canceled", "cancelled"]);
export const TERMINABLE_STATUSES = new Set(["pending", "running", "paused", "blocked", "recovering", "stale"]);

export function normalizeTaskStatus(status) {
  const text = String(status || "unknown").toLowerCase();
  if (text === "resolved" || text === "completed" || text === "success") return "completed";
  if (text === "cancelled") return "canceled";
  return text;
}

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(status);
}

export function isFailedStatus(status) {
  return FAILED_STATUSES.has(status);
}

export function isFinalStatus(status) {
  return FINAL_STATUSES.has(status);
}

export function isTerminableStatus(status) {
  return TERMINABLE_STATUSES.has(status);
}

export function observedStatus(task, { now = Date.now(), staleAfterMs = 15 * 60 * 1000 } = {}) {
  const status = normalizeTaskStatus(task?.status);
  if (!isActiveStatus(status)) return status;
  const updatedAt = new Date(task?.updatedAt || task?.createdAt || 0).getTime();
  if (updatedAt && now - updatedAt > staleAfterMs) return "stale";
  return status;
}
