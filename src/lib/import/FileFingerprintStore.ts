/**
 * FileFingerprintStore.ts
 * Reliable content hashing & import tracking for AI memory files.
 * Tracks per character:
 * - Content hash (SHA-256 on actual file content)
 * - File ID in memory vault
 * - File size & name
 * - First imported timestamp & last updated timestamp
 * - Whether 7-day chat restoration was executed
 * - Number of chat messages restored and restored time range
 */

export interface FileImportRecord {
  characterId: string;
  fileHash: string;
  fileId?: string;
  fileName: string;
  fileSizeBytes: number;
  chunkCount?: number;
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
 * Backward-compatible lookup by character ID and file size/name for files imported before fingerprint tracking
 */
export function findImportRecordByMeta(characterId: string, fileName: string, fileSizeBytes: number): FileImportRecord | null {
  const all = loadAllImportRecords();
  for (const rec of Object.values(all)) {
    if (rec.characterId === characterId && rec.fileSizeBytes === fileSizeBytes && (rec.fileName === fileName || rec.fileName.startsWith(fileName))) {
      return rec;
    }
  }
  return null;
}

/**
 * Fast & robust content hashing (strictly uses Web Crypto SHA-256 on true content with byte-level fallback)
 * Never relies merely on filename + size!
 */
export async function computeFileHash(fileOrContent: File | string): Promise<string> {
  let buffer: ArrayBuffer;
  try {
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
    console.warn('[FileFingerprintStore] Web Crypto failed, falling back to byte hash:', e);
    if (typeof fileOrContent === 'string') {
      buffer = new TextEncoder().encode(fileOrContent).buffer as ArrayBuffer;
    } else {
      buffer = await fileOrContent.arrayBuffer();
    }
  }

  // Fallback 64-bit FNV-1a hash calculated strictly on actual content byte data
  const u8 = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const len = u8.length;
  // If buffer is huge, sample systematically across the entire buffer to remain responsive
  const step = len > 500000 ? Math.floor(len / 500000) : 1;
  for (let i = 0; i < len; i += step) {
    const b = u8[i];
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 ^ b, 0x5bd1e995);
  }
  return `sha256fallback_${Math.abs(h1).toString(16)}_${Math.abs(h2).toString(16)}_${len}`;
}
