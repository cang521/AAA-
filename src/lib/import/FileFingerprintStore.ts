/**
 * FileFingerprintStore.ts
 * Reliable content hashing & import tracking for AI memory files.
 * Tracks per character:
 * - Content hash (SHA-256 or fast fallback)
 * - File size & name
 * - First imported timestamp & last updated timestamp
 * - Whether 7-day chat restoration was executed
 * - Number of chat messages restored and restored time range
 */

export interface FileImportRecord {
  characterId: string;
  fileHash: string;
  fileName: string;
  fileSizeBytes: number;
  importedAt: number;
  updatedAt: number;
  chatRestored: boolean;
  chatRestoredCount: number;
  chatRestoredRange?: string;
  chatRestoredEndTime?: number;
  chatRestoredStartTime?: number;
}

const STORAGE_KEY_FILE_FINGERPRINTS = 'ai_memory_file_fingerprints_v1';

export function loadAllImportRecords(): Record<string, FileImportRecord> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILE_FINGERPRINTS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('[FileFingerprintStore] Failed to load import records:', e);
    return {};
  }
}

export function saveImportRecord(record: FileImportRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const all = loadAllImportRecords();
    const key = `${record.characterId}::${record.fileHash}`;
    all[key] = record;
    localStorage.setItem(STORAGE_KEY_FILE_FINGERPRINTS, JSON.stringify(all));
  } catch (e) {
    console.error('[FileFingerprintStore] Failed to save import record:', e);
  }
}

export function getImportRecord(characterId: string, fileHash: string): FileImportRecord | null {
  const all = loadAllImportRecords();
  return all[`${characterId}::${fileHash}`] || null;
}

/**
 * Fast & robust content hashing (supports Web Crypto SHA-256 with fallback)
 */
export async function computeFileHash(fileOrContent: File | string): Promise<string> {
  try {
    let buffer: ArrayBuffer;
    if (typeof fileOrContent === 'string') {
      const enc = new TextEncoder();
      buffer = enc.encode(fileOrContent).buffer as ArrayBuffer;
    } else {
      buffer = await fileOrContent.arrayBuffer();
    }

    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('[FileFingerprintStore] Web Crypto failed, falling back to checksum:', e);
  }

  // Fallback 64-bit-like string hash
  const str = typeof fileOrContent === 'string' ? fileOrContent : (fileOrContent as File).name + (fileOrContent as File).size;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
