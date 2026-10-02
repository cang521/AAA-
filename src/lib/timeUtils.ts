/**
 * Utility functions for WeChat-style message timestamps and time dividers.
 */

/**
 * Safely extract or recover a valid timestamp (ms epoch) from a message object.
 * Checks timestamp, createdAt, create_time, time, date, datetime, etc.
 * Returns undefined if no valid timestamp can be determined.
 */
export function getMessageTimestamp(msg: any): number | undefined {
  if (!msg) return undefined;

  // 1. Existing valid numeric timestamp
  if (typeof msg.timestamp === 'number' && !isNaN(msg.timestamp) && msg.timestamp > 0) {
    return msg.timestamp;
  }

  // 2. String timestamp (e.g. numeric string or ISO string)
  if (typeof msg.timestamp === 'string' && msg.timestamp.trim()) {
    const parsedNum = Number(msg.timestamp);
    if (!isNaN(parsedNum) && parsedNum > 0) return parsedNum;
    const parsedDate = Date.parse(msg.timestamp);
    if (!isNaN(parsedDate) && parsedDate > 0) return parsedDate;
  }

  // 3. Alternative fields: createdAt, create_time, time, date, datetime
  const candidate = msg.createdAt ?? msg.create_time ?? msg.time ?? msg.date ?? msg.datetime;
  if (typeof candidate === 'number' && !isNaN(candidate) && candidate > 0) {
    if (candidate < 10000000000) {
      return candidate * 1000;
    }
    return candidate;
  }

  if (typeof candidate === 'string' && candidate.trim()) {
    const parsedNum = Number(candidate);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      if (parsedNum < 10000000000) return parsedNum * 1000;
      return parsedNum;
    }
    const parsedDate = Date.parse(candidate);
    if (!isNaN(parsedDate) && parsedDate > 0) return parsedDate;
  }

  // 4. Extract from ID if it contains timestamp like msg_1727788800000_abcd
  if (typeof msg.id === 'string' && (msg.id.startsWith('msg_') || msg.id.startsWith('gmsg_'))) {
    const parts = msg.id.split('_');
    if (parts.length >= 2) {
      const idTime = Number(parts[1]);
      if (!isNaN(idTime) && idTime > 1000000000000 && idTime < 2500000000000) {
        return idTime;
      }
    }
  }

  return undefined;
}

/**
 * Format a timestamp into a WeChat-style string:
 * - Same day: "03:44"
 * - Yesterday: "昨天 23:37"
 * - Earlier in current year: "10月1日 23:37"
 * - Different year: "2025年10月1日 23:37"
 */
export function formatMessageTimeDivider(timestamp: number, referenceDate = new Date()): string {
  if (!timestamp || isNaN(timestamp)) return '';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  const timeStr = `${hours}:${minutes}`;

  const todayStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  if (timestamp >= todayStart && timestamp < todayStart + 86400000) {
    return timeStr;
  }

  if (timestamp >= yesterdayStart && timestamp < todayStart) {
    return `昨天 ${timeStr}`;
  }

  if (year === referenceDate.getFullYear()) {
    return `${month}月${day}日 ${timeStr}`;
  }

  return `${year}年${month}月${day}日 ${timeStr}`;
}

/**
 * Format a timestamp for AI model context:
 * [2026-10-02 03:44:12]
 */
export function formatFullDateTime(timestamp?: number | string | Date): string {
  if (!timestamp) return '时间未知';
  let d: Date;
  if (timestamp instanceof Date) {
    d = timestamp;
  } else if (typeof timestamp === 'number') {
    d = new Date(timestamp);
  } else {
    const parsedNum = Number(timestamp);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      d = new Date(parsedNum);
    } else {
      d = new Date(timestamp);
    }
  }

  if (isNaN(d.getTime())) return '时间未知';

  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

/**
 * Determine if a time divider should be shown above `currMsg`.
 * Show time divider if:
 * 1. `prevMsg` is undefined (top message in list) and `currMsg` has a valid timestamp.
 * 2. OR gap between `currMsg` and `prevMsg` is >= 5 minutes (300,000 ms).
 */
export function shouldShowTimeDivider(currMsg: any, prevMsg?: any): boolean {
  const tCurr = getMessageTimestamp(currMsg);
  if (tCurr === undefined) return false;

  if (!prevMsg) return true;

  const tPrev = getMessageTimestamp(prevMsg);
  if (tPrev === undefined) return true;

  const gap = tCurr - tPrev;
  return gap >= 5 * 60 * 1000; // 5 minutes threshold
}
