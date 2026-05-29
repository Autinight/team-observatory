export function createUtils({ t }) {

  function formatTokens(n) {
    n = Number(n || 0);
    return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k'
      : String(Math.round(n));
  }

  function timeAgo(value) {
    const t0 = new Date(value || 0).getTime();
    if (!t0) return t('unknown');
    const s = Math.max(0, Math.round((Date.now() - t0) / 1000));
    if (s < 60) return t('secondsAgo', { n: s });
    const m = Math.round(s / 60);
    return m < 60 ? t('minutesAgo', { n: m }) : t('hoursAgo', { n: Math.round(m / 60) });
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function compactPath(value) {
    if (!value) return '';
    const parts = String(value).replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.slice(-2).join('/');
  }

  return { formatTokens, timeAgo, esc, compactPath };
}
