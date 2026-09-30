/** Date/time formatting helpers shared across the app. */

export function formatDate(input?: string | number | Date | null): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTime(input?: string | number | Date | null): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(input?: string | number | Date | null): string {
  if (!input) return '—';
  return `${formatDate(input)} ${formatTime(input)}`;
}

/** "3 min ago" style relative label. */
export function timeAgo(input?: string | number | Date | null): string {
  if (!input) return '';
  const t = new Date(input).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
