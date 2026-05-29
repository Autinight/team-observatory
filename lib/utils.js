// Shared numeric and time utilities used across snapshot modules.

export function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function numberOf(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

export function toTime(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function toIso(value) {
  const t = toTime(value);
  return t ? new Date(t).toISOString() : null;
}

export function ageMs(value) {
  const t = toTime(value);
  return t ? Math.max(0, Date.now() - t) : 0;
}

export function formatTokenCount(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
