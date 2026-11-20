/**
 * offlineTimeFormat.ts
 * Real device local time & timezone formatting helpers for Offline Mode.
 * Never uses fake/hardcoded demo dates.
 */

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  } catch {
    return 'Asia/Shanghai';
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats a timestamp into full local Chinese date+time: e.g. "2026年11月20日 19:36"
 */
export function formatOfflineFullDateTime(ts: number | string | undefined | null): string {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Formats a timestamp into YYYY-MM-DD HH:mm:ss for precise prompt context
 */
export function formatOfflinePromptDateTime(ts: number | string | undefined | null): string {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Formats time only: "19:36"
 */
export function formatOfflineTimeHM(ts: number | string | undefined | null): string {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Formats date only: "2026年11月20日"
 */
export function formatOfflineDateCN(ts: number | string | undefined | null): string {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Calculates non-negative duration in whole minutes
 */
export function computeDurationMinutes(startedAt: number, endedAt: number): number {
  if (!startedAt || !endedAt || endedAt < startedAt) return 0;
  return Math.max(1, Math.round((endedAt - startedAt) / 60000));
}

/**
 * Formats duration minutes into human-readable Chinese: e.g. "1小时32分钟", "28分钟", "不足1分钟"
 */
export function formatOfflineDuration(durationMinutes?: number | null, startedAt?: number, endedAt?: number): string {
  let mins = typeof durationMinutes === 'number' && !Number.isNaN(durationMinutes) ? durationMinutes : -1;
  if (mins < 0 && startedAt && endedAt) {
    mins = Math.max(0, Math.round((endedAt - startedAt) / 60000));
  }
  if (mins <= 0) return '不足1分钟';
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours > 0 && rem > 0) return `${hours}小时${rem}分钟`;
  if (hours > 0) return `${hours}小时`;
  return `${rem}分钟`;
}

/**
 * Formats start-to-end range cleanly for cards:
 * Same day: "2026年11月20日 19:36—21:08"
 * Cross day: "2026年11月20日 23:10—11月21日 00:42"
 */
export function formatOfflineTimeRange(startedAt: number, endedAt?: number): string {
  if (!startedAt) return '';
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return '';
  if (!endedAt) {
    return `${formatOfflineFullDateTime(startedAt)} 开始`;
  }
  const end = new Date(endedAt);
  if (Number.isNaN(end.getTime())) {
    return `${formatOfflineFullDateTime(startedAt)} 开始`;
  }
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    return `${formatOfflineDateCN(startedAt)} ${formatOfflineTimeHM(startedAt)}—${formatOfflineTimeHM(endedAt)}`;
  }
  return `${formatOfflineFullDateTime(startedAt)}—${end.getMonth() + 1}月${end.getDate()}日 ${formatOfflineTimeHM(endedAt)}`;
}

/**
 * Smart time divider rule inside Offline Mode message stream (show divider on first message or >= 5 min gap or date change)
 */
export function shouldShowOfflineTimeDivider(currentTs: number, prevTs?: number): boolean {
  if (!prevTs) return true;
  if (Math.abs(currentTs - prevTs) >= 5 * 60 * 1000) return true;
  const a = new Date(prevTs);
  const b = new Date(currentTs);
  return a.getDate() !== b.getDate() || a.getMonth() !== b.getMonth() || a.getFullYear() !== b.getFullYear();
}

export function formatOfflineMessageDivider(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `今天 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return formatOfflineFullDateTime(ts);
}
