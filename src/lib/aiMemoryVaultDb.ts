import JSZip from 'jszip';
import {
  AiMemoryVault,
  AiMemoryFileMeta,
  AiMemoryChunk,
  AiMemoryRecallResult,
  AiMemoryRecallMatch,
  MemoryFileType,
  ChatMessage,
} from '../types';
import {
  extractRawChatMessagesFromFileContent,
  syncRecentChatMessagesToChatDb,
  RecentChatSyncResult,
} from './import/RecentChatSyncManager';
import { FieldMappingRule } from './import/AdaptiveFileParser';
import {
  computeFileHash,
  getImportRecord,
  saveImportRecord,
  FileImportRecord,
} from './import/FileFingerprintStore';

export interface ImportSyncOptions {
  restoreRecentChat?: boolean; // User choice checkbox: whether to restore last 7 days of chat
  customRules?: FieldMappingRule; // Rules from AI-assisted analysis if applicable
  characterName?: string; // Target character's name to identify AI vs user
}

export interface ImportAiMemoryResult {
  importedFiles: AiMemoryFileMeta[];
  chatSync?: RecentChatSyncResult;
  fingerprintRecords?: FileImportRecord[];
  memoryStats: {
    filesRecognized: number;
    filesImported: number;
    newChunksCount: number;
    skippedCount: number;
    failedCount: number;
  };
}

/**
 * Bulk import multiple files (or single file) for an AI character.
 * Merges raw chats across all imported files, finds the global conversationEndTime,
 * and restores the exact 7-day window [conversationEndTime - 7 days, conversationEndTime]
 * ONLY IF restoreRecentChat is explicitly true!
 */
export async function importFilesToAiMemoryBulk(
  characterId: string,
  files: File[],
  optionsOrProgress?: ImportSyncOptions | ((percent: number, stepMsg: string) => void),
  maybeOnProgress?: (percent: number, stepMsg: string) => void,
  characterName?: string
): Promise<ImportAiMemoryResult> {
  const options: ImportSyncOptions =
    typeof optionsOrProgress === 'object' && optionsOrProgress !== null
      ? optionsOrProgress
      : { restoreRecentChat: false };
  const onProgress = typeof optionsOrProgress === 'function' ? optionsOrProgress : maybeOnProgress;
  const effectiveCharName = options.characterName || characterName;

  const allImportedFiles: AiMemoryFileMeta[] = [];
  const allCandidateMsgs: ChatMessage[] = [];
  const fingerprintRecords: FileImportRecord[] = [];
  let totalUnrecognized = 0;
  let newChunksTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;

  const totalFiles = files.length;
  for (let i = 0; i < totalFiles; i++) {
    const f = files[i];
    const basePct = Math.round((i / totalFiles) * 70);
    const stepMsg = `正在导入文件 (${i + 1}/${totalFiles}): ${f.name}`;
    onProgress?.(basePct, stepMsg);

    try {
      const fHash = await computeFileHash(f);

      // Single file memory import (saves files & chunks to memory vault)
      const res = await importFileToAiMemory(characterId, f, { restoreRecentChat: false }, (p, m) => {
        onProgress?.(Math.round(basePct + (p / 100) * (70 / totalFiles)), m);
      });
      allImportedFiles.push(...res);
      for (const meta of res) {
        newChunksTotal += meta.chunkCount || 0;
      }

      // Check existing fingerprint
      const existingFp = getImportRecord(characterId, fHash);
      const fpRecord: FileImportRecord = {
        characterId,
        fileHash: fHash,
        fileName: f.name,
        fileSizeBytes: f.size,
        importedAt: existingFp?.importedAt || Date.now(),
        updatedAt: Date.now(),
        chatRestored: existingFp?.chatRestored || false,
        chatRestoredCount: existingFp?.chatRestoredCount || 0,
        chatRestoredRange: existingFp?.chatRestoredRange,
      };
      fingerprintRecords.push(fpRecord);
      saveImportRecord(fpRecord);
    } catch (err) {
      console.error('[importFilesToAiMemoryBulk] Failed to import file', f.name, err);
      failedTotal++;
    }
  }

  let chatSync: RecentChatSyncResult | undefined;

  // ONLY extract & restore recent chat if user explicitly checked the box!
  if (options?.restoreRecentChat) {
    onProgress?.(75, '正在合并与分析所有导入文件中的历史对话记录...');
    for (const fMeta of allImportedFiles) {
      try {
        const fullDoc = await getAiMemoryFileWithContent(fMeta.id);
        if (fullDoc && fullDoc.rawContent) {
          const ext = extractRawChatMessagesFromFileContent(
            fullDoc.rawContent,
            fMeta.fileName,
            characterId,
            effectiveCharName,
            options.customRules
          );
          if (ext.messages && ext.messages.length > 0) {
            allCandidateMsgs.push(...ext.messages);
          }
          totalUnrecognized += ext.unrecognizedCount || 0;
        }
      } catch (e) {
        console.warn('[importFilesToAiMemoryBulk] Extraction failed for', fMeta.fileName, e);
      }
    }

    if (allCandidateMsgs.length > 0) {
      onProgress?.(85, `共提取出 ${allCandidateMsgs.length} 条有效对话记录，正在计算统一的最后 7 天窗口并同步到微信...`);
      chatSync = await syncRecentChatMessagesToChatDb(characterId, allCandidateMsgs, totalUnrecognized);
      // Update fingerprint records with chat restoration info
      for (const fp of fingerprintRecords) {
        fp.chatRestored = true;
        fp.chatRestoredCount = chatSync.syncedCount;
        fp.chatRestoredRange = chatSync.formattedRange;
        fp.chatRestoredEndTime = chatSync.latestMessageTime;
        fp.chatRestoredStartTime = chatSync.windowStartTime;
        saveImportRecord(fp);
      }
    } else {
      chatSync = await syncRecentChatMessagesToChatDb(characterId, [], totalUnrecognized);
    }
  }

  onProgress?.(100, '全部文件导入与处理完成！');
  return {
    importedFiles: allImportedFiles,
    chatSync,
    fingerprintRecords,
    memoryStats: {
      filesRecognized: totalFiles,
      filesImported: allImportedFiles.length,
      newChunksCount: newChunksTotal,
      skippedCount: skippedTotal,
      failedCount: failedTotal,
    },
  };
}

const DB_NAME = 'PhoneSimAiMemoryDB_v1';
const DB_VERSION = 1;
const STORE_VAULTS = 'vaults';
const STORE_FILES = 'files';
const STORE_CHUNKS = 'chunks';

const listeners = new Set<() => void>();

export function subscribeAiMemoryVault(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyMemoryChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Memory listener error', e);
    }
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getMemoryDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // 1. Vaults store (one independent vault per AI character)
      if (!db.objectStoreNames.contains(STORE_VAULTS)) {
        db.createObjectStore(STORE_VAULTS, { keyPath: 'characterId' });
      }

      // 2. Files store (raw files metadata + content preserved locally)
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const fileStore = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        fileStore.createIndex('by_character', 'characterId', { unique: false });
        fileStore.createIndex('by_character_time', ['characterId', 'createdAt'], { unique: false });
      }

      // 3. Chunks store (indexed granular sections for fast on-demand recall)
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
        chunkStore.createIndex('by_character', 'characterId', { unique: false });
        chunkStore.createIndex('by_file', 'fileId', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('IndexedDB open error in aiMemoryVaultDb:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Ensures an independent local memory vault exists for the given character.
 * Automatically initializes if not present.
 */
export async function ensureAiMemoryVault(
  characterId: string,
  characterName: string
): Promise<AiMemoryVault> {
  const db = await getMemoryDb();

  return new Promise<AiMemoryVault>((resolve, reject) => {
    const tx = db.transaction([STORE_VAULTS], 'readwrite');
    const store = tx.objectStore(STORE_VAULTS);
    const getReq = store.get(characterId);

    getReq.onsuccess = () => {
      if (getReq.result) {
        // Vault already exists, update name if changed
        const existing = getReq.result as AiMemoryVault;
        if (existing.characterName !== characterName) {
          existing.characterName = characterName;
          existing.updatedAt = Date.now();
          store.put(existing);
        }
        resolve(existing);
      } else {
        // Create new isolated local memory vault for this AI
        const newVault: AiMemoryVault = {
          characterId,
          characterName: characterName || 'AI',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          fileCount: 0,
          totalSizeBytes: 0,
          description: `${characterName || '该AI'}专属独立本地记忆空间`,
        };
        store.put(newVault);
        resolve(newVault);
      }
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Batch initialize memory vaults for a list of characters on app boot
 */
export async function initAllAiMemoryVaults(
  characters: Array<{ id: string; name: string }>
): Promise<void> {
  for (const char of characters) {
    try {
      await ensureAiMemoryVault(char.id, char.name);
    } catch (e) {
      console.warn('Init vault failed for', char.name, e);
    }
  }
}

/**
 * Retrieve memory vault metadata for a character
 */
export async function getAiMemoryVault(characterId: string): Promise<AiMemoryVault | null> {
  const db = await getMemoryDb();
  return new Promise<AiMemoryVault | null>((resolve, reject) => {
    const tx = db.transaction([STORE_VAULTS], 'readonly');
    const store = tx.objectStore(STORE_VAULTS);
    const req = store.get(characterId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * List all memory files belonging strictly to an AI character.
 * Returns only metadata (without huge rawContent) to protect UI performance.
 */
export async function listAiMemoryFiles(characterId: string): Promise<AiMemoryFileMeta[]> {
  const db = await getMemoryDb();

  return new Promise<AiMemoryFileMeta[]>((resolve, reject) => {
    const tx = db.transaction([STORE_FILES], 'readonly');
    const store = tx.objectStore(STORE_FILES);
    const index = store.index('by_character');
    const request = index.getAll(IDBKeyRange.only(characterId));

    request.onsuccess = () => {
      const records = (request.result || []) as Array<AiMemoryFileMeta & { rawContent?: string }>;
      // Strip rawContent for lightweight React state
      const metaList: AiMemoryFileMeta[] = records.map((r) => ({
        id: r.id,
        characterId: r.characterId,
        fileName: r.fileName,
        fileType: r.fileType,
        fileSizeBytes: r.fileSizeBytes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        chunkCount: r.chunkCount,
        lineCount: r.lineCount,
        previewSnippet: r.previewSnippet,
        zipEntryCount: r.zipEntryCount,
      }));

      // Sort newest first
      metaList.sort((a, b) => b.createdAt - a.createdAt);
      resolve(metaList);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Fetch full file record including rawContent for inspection or export
 */
export async function getAiMemoryFileWithContent(
  fileId: string
): Promise<{ meta: AiMemoryFileMeta; rawContent: string } | null> {
  const db = await getMemoryDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FILES], 'readonly');
    const store = tx.objectStore(STORE_FILES);
    const req = store.get(fileId);

    req.onsuccess = () => {
      if (!req.result) {
        resolve(null);
        return;
      }
      const data = req.result;
      const { rawContent, ...meta } = data;
      resolve({ meta, rawContent: rawContent || '' });
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Get paginated chunks for previewing a large file without UI freezing
 */
export async function getAiMemoryChunksPaged(
  fileId: string,
  page = 1,
  pageSize = 10
): Promise<{ chunks: AiMemoryChunk[]; total: number }> {
  const db = await getMemoryDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CHUNKS], 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);
    const index = store.index('by_file');
    const req = index.getAll(IDBKeyRange.only(fileId));

    req.onsuccess = () => {
      const all = (req.result || []) as AiMemoryChunk[];
      all.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const total = all.length;
      const start = (page - 1) * pageSize;
      const chunks = all.slice(start, start + pageSize);
      resolve({ chunks, total });
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Helper to determine file type from filename
 */
function detectFileType(fileName: string): MemoryFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.jsonl')) return 'jsonl';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.log')) return 'log';
  return 'other';
}

/**
 * Slice text into searchable chunks (e.g. 600 - 1000 characters)
 */
function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const chunks: string[] = [];
  if (!text || !text.trim()) return chunks;

  // Performance & storage optimization: sanitize massive Base64 blocks before creating memory chunks!
  // Prevents hundreds of thousands of Base64 characters from cluttering search chunks
  let cleanText = text;
  if (cleanText.includes('data:image/') || cleanText.includes(';base64,')) {
    cleanText = cleanText.replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]{80,}/g, '[图片附件]');
  }
  if (cleanText.length > 5000) {
    cleanText = cleanText.replace(/[A-Za-z0-9+/=]{500,}/g, '[长Base64二进制数据]');
  }

  // If text is line-delimited (like JSONL or logs), prefer line boundaries
  if (cleanText.includes('\n')) {
    const lines = cleanText.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > chunkSize && currentChunk.length > 100) {
        chunks.push(currentChunk.trim());
        // Keep a little context
        const tail = currentChunk.slice(-overlap);
        currentChunk = tail + '\n' + line;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n' + line : line;
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  } else {
    // Plain stream of characters
    let i = 0;
    while (i < cleanText.length) {
      const piece = cleanText.slice(i, i + chunkSize);
      chunks.push(piece.trim());
      i += chunkSize - overlap;
    }
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Import a file (ZIP, JSON, JSONL, TXT, MD, CSV, LOG) directly into this AI's local memory vault.
 * 100% Client-side, never uploaded. Never added to chat messages.
 */
export async function importFileToAiMemory(
  characterId: string,
  file: File,
  optionsOrProgress?: ImportSyncOptions | ((percent: number, stepMsg: string) => void),
  maybeOnProgress?: (percent: number, stepMsg: string) => void
): Promise<AiMemoryFileMeta[]> {
  const options: ImportSyncOptions = typeof optionsOrProgress === 'object' && optionsOrProgress !== null
    ? optionsOrProgress
    : { restoreRecentChat: false };
  const onProgress = typeof optionsOrProgress === 'function' ? optionsOrProgress : maybeOnProgress;

  const db = await getMemoryDb();
  await ensureAiMemoryVault(characterId, '');

  const fileType = detectFileType(file.name);
  const importedFiles: AiMemoryFileMeta[] = [];

  onProgress?.(10, `正在读取本地文件: ${file.name}...`);

  if (fileType === 'zip') {
    // -------------------------------------------------------------
    // ZIP Handling: Client-side extraction via JSZip
    // -------------------------------------------------------------
    onProgress?.(25, '正在解压 ZIP 归档包...');
    const zip = new JSZip();
    const zipData = await file.arrayBuffer();
    const unzipped = await zip.loadAsync(zipData);

    const validEntries: Array<{ name: string; contentPromise: Promise<string>; size: number }> = [];

    unzipped.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      if (relativePath.includes('__MACOSX') || relativePath.startsWith('.')) return;

      const subType = detectFileType(relativePath);
      // Support text-based files inside zip
      if (['txt', 'md', 'json', 'jsonl', 'csv', 'log', 'other'].includes(subType)) {
        validEntries.push({
          name: relativePath,
          size: (zipEntry as any)._data?.uncompressedSize || 0,
          contentPromise: zipEntry.async('string'),
        });
      }
    });

    if (validEntries.length === 0) {
      throw new Error('ZIP 压缩包中未检测到可读的文本/JSON/Markdown文件');
    }

    const totalEntries = validEntries.length;
    let processed = 0;

    for (const entry of validEntries) {
      processed++;
      const percent = Math.round(30 + (processed / totalEntries) * 60);
      onProgress?.(percent, `正在导入解压文件 (${processed}/${totalEntries}): ${entry.name}`);

      const content = await entry.contentPromise;
      const subType = detectFileType(entry.name);
      const cleanName = entry.name.split('/').pop() || entry.name;
      const fileId = `mem_file_${characterId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const lineCount = content.split('\n').length;
      const preview = content.slice(0, 260).trim();
      const textChunks = chunkText(content);

      const fileRecord = {
        id: fileId,
        characterId,
        fileName: `${cleanName} (来自 ${file.name})`,
        fileType: subType,
        fileSizeBytes: new Blob([content]).size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        chunkCount: textChunks.length,
        lineCount,
        previewSnippet: preview,
        rawContent: content,
      };

      // Save file & chunks in transaction
      await saveFileAndChunks(db, fileRecord, textChunks);

      importedFiles.push({
        id: fileRecord.id,
        characterId: fileRecord.characterId,
        fileName: fileRecord.fileName,
        fileType: fileRecord.fileType,
        fileSizeBytes: fileRecord.fileSizeBytes,
        createdAt: fileRecord.createdAt,
        updatedAt: fileRecord.updatedAt,
        chunkCount: fileRecord.chunkCount,
        lineCount: fileRecord.lineCount,
        previewSnippet: fileRecord.previewSnippet,
      });
    }
  } else {
    // -------------------------------------------------------------
    // Single Text / JSON / JSONL / MD / CSV / LOG file
    // -------------------------------------------------------------
    onProgress?.(35, `正在解析 ${file.name} 内容与切片索引...`);
    const content = await file.text();
    const lineCount = content.split('\n').length;
    const preview = content.slice(0, 260).trim();
    const textChunks = chunkText(content);

    onProgress?.(70, `正在本地保存至专属记忆空间 (${textChunks.length} 个检索切片)...`);

    const fileId = `mem_file_${characterId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fileRecord = {
      id: fileId,
      characterId,
      fileName: file.name,
      fileType,
      fileSizeBytes: file.size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chunkCount: textChunks.length,
      lineCount,
      previewSnippet: preview,
      rawContent: content,
    };

    await saveFileAndChunks(db, fileRecord, textChunks);

    importedFiles.push({
      id: fileRecord.id,
      characterId: fileRecord.characterId,
      fileName: fileRecord.fileName,
      fileType: fileRecord.fileType,
      fileSizeBytes: fileRecord.fileSizeBytes,
      createdAt: fileRecord.createdAt,
      updatedAt: fileRecord.updatedAt,
      chunkCount: fileRecord.chunkCount,
      lineCount: fileRecord.lineCount,
      previewSnippet: fileRecord.previewSnippet,
    });
  }

  // -------------------------------------------------------------
  // Optional Sync: Extract real chat history and restore the last 7 days to ChatDB (ONLY IF REQUESTED)
  // -------------------------------------------------------------
  if (options.restoreRecentChat) {
    try {
      onProgress?.(85, '正在分析记忆文件中的历史对话记录...');
      const allCandidateMsgs: ChatMessage[] = [];
      let totalUnrecognized = 0;

      // Extract raw chat messages across imported files
      for (const fMeta of importedFiles) {
        try {
          const fullDoc = await getAiMemoryFileWithContent(fMeta.id);
          if (fullDoc && fullDoc.rawContent) {
            const res = extractRawChatMessagesFromFileContent(
              fullDoc.rawContent,
              fMeta.fileName,
              characterId,
              options.characterName,
              options.customRules
            );
            if (res.messages && res.messages.length > 0) {
              allCandidateMsgs.push(...res.messages);
            }
            totalUnrecognized += res.unrecognizedCount || 0;
          }
        } catch (docErr) {
          console.warn('[importFileToAiMemory] Failed to extract chat from file', fMeta.fileName, docErr);
        }
      }

      if (allCandidateMsgs.length > 0) {
        onProgress?.(92, `检测到 ${allCandidateMsgs.length} 条原始对话记录，正在同步最近 7 天真实聊天...`);
        const syncRes = await syncRecentChatMessagesToChatDb(characterId, allCandidateMsgs, totalUnrecognized);
        (importedFiles as any).chatSyncResult = syncRes;
        if (syncRes.syncedCount > 0) {
          console.log(`[importFileToAiMemory] Successfully restored ${syncRes.syncedCount} recent chat messages (${syncRes.formattedRange}) to WeChat ChatDB`);
        }
      } else {
        (importedFiles as any).chatSyncResult = await syncRecentChatMessagesToChatDb(characterId, [], totalUnrecognized);
      }
    } catch (chatSyncErr) {
      console.warn('[importFileToAiMemory] 7-day chat sync encountered a non-fatal error:', chatSyncErr);
    }
  }

  // Recalculate vault statistics
  await recalculateVaultStats(db, characterId);

  clearVaultIndexCache(characterId);
  onProgress?.(100, '导入完成！已成功加入该 AI 专属独立记忆空间。');
  notifyMemoryChange();

  return importedFiles;
}

/**
 * Saves a file record and its chunks to IndexedDB in non-blocking batches
 * to prevent UI freezing on large files.
 */
async function saveFileAndChunks(
  db: IDBDatabase,
  fileRecord: any,
  chunks: string[]
): Promise<void> {
  // 1. Save file meta record
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FILES], 'readwrite');
    tx.objectStore(STORE_FILES).put(fileRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // 2. Save chunks in batches of 60 to prevent long main-thread lockups
  const BATCH_SIZE = 60;
  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const slice = chunks.slice(start, start + BATCH_SIZE);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_CHUNKS], 'readwrite');
      const chunkStore = tx.objectStore(STORE_CHUNKS);
      slice.forEach((text, i) => {
        const idx = start + i;
        const chunkRecord: AiMemoryChunk = {
          id: `chunk_${fileRecord.id}_${idx}`,
          characterId: fileRecord.characterId,
          fileId: fileRecord.id,
          fileName: fileRecord.fileName,
          chunkIndex: idx,
          text,
          tokenEstimated: Math.round(text.length / 2),
        };
        chunkStore.put(chunkRecord);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Yield to browser event loop after each batch for large files
    if (chunks.length > BATCH_SIZE) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

/**
 * Replace an existing memory file with an updated version
 */
export async function replaceAiMemoryFile(
  characterId: string,
  oldFileId: string,
  newFile: File,
  onProgress?: (percent: number, msg: string) => void
): Promise<AiMemoryFileMeta> {
  const db = await getMemoryDb();

  onProgress?.(20, '正在读取新文件并清除旧版本切片...');
  // 1. Delete old file and its chunks
  await deleteAiMemoryFile(characterId, oldFileId);

  // 2. Import new file
  const results = await importFileToAiMemory(characterId, newFile, onProgress);
  if (results.length === 0) {
    throw new Error('更换文件失败，未生成有效记忆记录');
  }

  notifyMemoryChange();
  return results[0];
}

/**
 * Delete a specific memory file and its chunks from an AI's vault
 */
export async function deleteAiMemoryFile(characterId: string, fileId: string): Promise<void> {
  const db = await getMemoryDb();

  // Delete all chunks for this file
  const tx = db.transaction([STORE_FILES, STORE_CHUNKS], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const chunkStore = tx.objectStore(STORE_CHUNKS);
  const chunkIndex = chunkStore.index('by_file');

  fileStore.delete(fileId);

  const req = chunkIndex.openCursor(IDBKeyRange.only(fileId));
  req.onsuccess = (e) => {
    const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });

  await recalculateVaultStats(db, characterId);
  notifyMemoryChange();
}

/**
 * Delete an entire AI's memory vault.
 * When deleting an AI character, user can choose whether to also wipe their memory files.
 */
export async function deleteAiMemoryVault(
  characterId: string,
  deleteFiles = true
): Promise<void> {
  const db = await getMemoryDb();

  if (deleteFiles) {
    const tx = db.transaction([STORE_VAULTS, STORE_FILES, STORE_CHUNKS], 'readwrite');
    const vaultStore = tx.objectStore(STORE_VAULTS);
    const fileStore = tx.objectStore(STORE_FILES);
    const chunkStore = tx.objectStore(STORE_CHUNKS);

    vaultStore.delete(characterId);

    // Delete all files belonging to this character
    const fileIndex = fileStore.index('by_character');
    const fileReq = fileIndex.openCursor(IDBKeyRange.only(characterId));
    fileReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Delete all chunks belonging to this character
    const chunkIndex = chunkStore.index('by_character');
    const chunkReq = chunkIndex.openCursor(IDBKeyRange.only(characterId));
    chunkReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } else {
    // Just remove vault registry pointer, keep raw files in DB
    const tx = db.transaction([STORE_VAULTS], 'readwrite');
    tx.objectStore(STORE_VAULTS).delete(characterId);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  notifyMemoryChange();
}

/**
 * Completely wipe all AI memory vaults, files, and chunks from IndexedDB
 * Used for full Factory Reset (恢复出厂设置)
 */
export async function clearAllAiMemoryVaults(): Promise<void> {
  const db = await getMemoryDb();
  const tx = db.transaction([STORE_VAULTS, STORE_FILES, STORE_CHUNKS], 'readwrite');
  tx.objectStore(STORE_VAULTS).clear();
  tx.objectStore(STORE_FILES).clear();
  tx.objectStore(STORE_CHUNKS).clear();

  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });

  notifyMemoryChange();
}

/**
 * Helper function for saving a raw text document to an AI character's memory vault
 */
export async function saveAiMemoryChunk(
  characterId: string,
  fileName: string,
  text: string
): Promise<void> {
  const file = new File([text], fileName, { type: 'text/plain' });
  await importFileToAiMemory(characterId, file);
}

/**
 * Get all files/chunks summary for a character
 */
export async function getAiMemoryChunks(
  characterId: string
): Promise<Array<{ id: string; fileName: string; text?: string }>> {
  const files = await listAiMemoryFiles(characterId);
  return files.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    text: f.previewSnippet,
  }));
}

/**
 * Delete a memory file/chunk from a character's vault
 */
export async function deleteAiMemoryChunk(
  fileId: string,
  characterId?: string
): Promise<void> {
  const db = await getMemoryDb();
  if (characterId) {
    await deleteAiMemoryFile(characterId, fileId);
    return;
  }
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FILES], 'readonly');
    const store = tx.objectStore(STORE_FILES);
    const req = store.get(fileId);
    req.onsuccess = async () => {
      if (req.result && req.result.characterId) {
        await deleteAiMemoryFile(req.result.characterId, fileId);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Recalculate and update the vault file count and total size
 */
async function recalculateVaultStats(db: IDBDatabase, characterId: string): Promise<void> {
  const tx = db.transaction([STORE_VAULTS, STORE_FILES], 'readwrite');
  const vaultStore = tx.objectStore(STORE_VAULTS);
  const fileStore = tx.objectStore(STORE_FILES);
  const index = fileStore.index('by_character');

  const filesReq = index.getAll(IDBKeyRange.only(characterId));
  filesReq.onsuccess = () => {
    const files = (filesReq.result || []) as AiMemoryFileMeta[];
    const fileCount = files.length;
    const totalSizeBytes = files.reduce((acc, f) => acc + (f.fileSizeBytes || 0), 0);

    const vaultReq = vaultStore.get(characterId);
    vaultReq.onsuccess = () => {
      if (vaultReq.result) {
        const vault = vaultReq.result as AiMemoryVault;
        vault.fileCount = fileCount;
        vault.totalSizeBytes = totalSizeBytes;
        vault.updatedAt = Date.now();
        vaultStore.put(vault);
      }
    };
  };

  await new Promise<void>((res) => {
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

// In-memory Inverted Index Cache for O(1) Candidate Lookup
interface InvertedIndexCache {
  chunks: AiMemoryChunk[];
  keywordToChunkIds: Map<string, Set<string>>;
  lastUpdated: number;
}

const vaultIndexCacheMap = new Map<string, InvertedIndexCache>();

export function clearVaultIndexCache(characterId?: string) {
  if (characterId) {
    vaultIndexCacheMap.delete(characterId);
  } else {
    vaultIndexCacheMap.clear();
  }
}

async function getOrBuildVaultIndex(characterId: string, db: IDBDatabase): Promise<InvertedIndexCache> {
  const cached = vaultIndexCacheMap.get(characterId);
  if (cached) {
    return cached;
  }

  return new Promise<InvertedIndexCache>((resolve) => {
    const tx = db.transaction([STORE_CHUNKS], 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);
    const index = store.index('by_character');

    const req = index.getAll(IDBKeyRange.only(characterId));

    req.onsuccess = () => {
      const chunks = (req.result || []) as AiMemoryChunk[];
      const keywordToChunkIds = new Map<string, Set<string>>();

      for (const chunk of chunks) {
        const text = chunk.text.toLowerCase();
        // Tokenize words
        const terms = text
          .replace(/[，。！？、~～…\n\r\t\(\)\[\]\{\}":;]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 2);

        // Add 2-grams
        const chinese = text.replace(/[^\u4e00-\u9fa5]/g, '');
        if (chinese.length >= 2) {
          for (let i = 0; i < chinese.length - 1; i++) {
            terms.push(chinese.slice(i, i + 2));
          }
        }

        const uniqueTerms = new Set(terms);
        for (const term of uniqueTerms) {
          if (!keywordToChunkIds.has(term)) {
            keywordToChunkIds.set(term, new Set());
          }
          keywordToChunkIds.get(term)!.add(chunk.id);
        }
      }

      const cacheEntry: InvertedIndexCache = {
        chunks,
        keywordToChunkIds,
        lastUpdated: Date.now(),
      };

      vaultIndexCacheMap.set(characterId, cacheEntry);
      resolve(cacheEntry);
    };

    req.onerror = () => {
      resolve({ chunks: [], keywordToChunkIds: new Map(), lastUpdated: Date.now() });
    };
  });
}

/**
 * On-demand Retrieval Engine (按需检索):
 * When an AI is chatting and needs to recall background or past information,
 * this function queries candidate chunks using an inverted index cache.
 * Avoids scanning all chunks on every message turn.
 */
export async function searchAiMemoryChunks(
  characterId: string,
  query: string,
  maxResults = 4
): Promise<AiMemoryRecallResult & { durationMs: number }> {
  const startTime = Date.now();
  const db = await getMemoryDb();

  if (!query || !query.trim()) {
    return { recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs: Date.now() - startTime };
  }

  // Tokenize query into meaningful search keywords
  const cleanQuery = query.toLowerCase();
  const rawKeywords = cleanQuery
    .replace(/[，。！？、~～…\n\r\t\(\)\[\]\{\}":;]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  // Extract Chinese 2-grams and 3-grams for richer semantic matching
  const ngrams: string[] = [];
  const chineseChars = cleanQuery.replace(/[^\u4e00-\u9fa5]/g, '');
  if (chineseChars.length >= 2) {
    for (let i = 0; i < chineseChars.length - 1; i++) {
      ngrams.push(chineseChars.slice(i, i + 2));
      if (i < chineseChars.length - 2) {
        ngrams.push(chineseChars.slice(i, i + 3));
      }
    }
  }

  const allSearchTerms = Array.from(new Set([...rawKeywords, ...ngrams])).filter((t) => t.length >= 2);

  if (allSearchTerms.length === 0) {
    return { recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs: Date.now() - startTime };
  }

  const vaultIndex = await getOrBuildVaultIndex(characterId, db);
  if (!vaultIndex.chunks || vaultIndex.chunks.length === 0) {
    return { recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs: Date.now() - startTime };
  }

  // Candidate lookup via inverted index
  const candidateChunkIds = new Set<string>();
  for (const term of allSearchTerms) {
    const chunkIds = vaultIndex.keywordToChunkIds.get(term);
    if (chunkIds) {
      for (const id of chunkIds) {
        candidateChunkIds.add(id);
      }
    }
  }

  if (candidateChunkIds.size === 0) {
    return { recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs: Date.now() - startTime };
  }

  // Map candidates
  const chunkById = new Map<string, AiMemoryChunk>();
  for (const c of vaultIndex.chunks) {
    chunkById.set(c.id, c);
  }

  const matchedCandidates: Array<{ chunk: AiMemoryChunk; score: number }> = [];

  for (const chunkId of candidateChunkIds) {
    const chunk = chunkById.get(chunkId);
    if (!chunk) continue;

    const lowerText = chunk.text.toLowerCase();
    let score = 0;

    for (const term of allSearchTerms) {
      if (lowerText.includes(term)) {
        score += term.length >= 4 ? 4 : term.length >= 3 ? 3 : 2;
        const occurrences = lowerText.split(term).length - 1;
        if (occurrences > 1) {
          score += Math.min(occurrences - 1, 3);
        }
      }
    }

    if (score > 0) {
      matchedCandidates.push({ chunk, score });
    }
  }

  matchedCandidates.sort((a, b) => b.score - a.score);

  const topMatches = matchedCandidates.slice(0, maxResults);
  const durationMs = Date.now() - startTime;

  if (topMatches.length === 0) {
    return { recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs };
  }

  const matchedFileNames = Array.from(new Set(topMatches.map((m) => m.chunk.fileName)));

  const summaryLines = topMatches.map((m, idx) => {
    const cleanExcerpt = m.chunk.text.replace(/\s+/g, ' ').slice(0, 300);
    return `${idx + 1}. [文件: ${m.chunk.fileName} / 片段 #${m.chunk.chunkIndex + 1}]: "${cleanExcerpt}${
      m.chunk.text.length > 300 ? '...' : ''
    }"`;
  });

  const formattedText = `【📁 从该角色专属本地记忆空间调阅到的资料（按需召回）】:\n来源文件: ${matchedFileNames.join(
    '、'
  )}\n${summaryLines.join('\n')}\n（说明：以上是该AI专属记忆空间检索到的相关知识/历史资料片段。请依据此资料并保持该AI的人设口吻自然回应。）`;

  const returnMatches: AiMemoryRecallMatch[] = topMatches.map((m) => ({
    fileId: m.chunk.fileId,
    fileName: m.chunk.fileName,
    chunkIndex: m.chunk.chunkIndex,
    text: m.chunk.text,
    score: m.score,
  }));

  return {
    recalledText: formattedText,
    matchedChunks: returnMatches,
    matchedFileNames,
    durationMs,
  };
}
