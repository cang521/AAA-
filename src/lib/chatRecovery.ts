import { AiCharacter, ChatMessage } from '../types';
import { getAllChatMessages, restoreChatMessages } from './chatDb';

const SNAPSHOTS_KEY = 'phone_data_snapshots_v1';
const LEGACY_MESSAGES_KEY = 'phone_chat_messages';
const CURRENT_CHAT_DB = 'PhoneSimChatDB_v2';

export interface ChatRecoveryReport {
  scannedSources: string[];
  sourceMessageCounts: Record<string, number>;
  foundCandidateCount: number;
  restoredCount: number;
  remappedCount: number;
  unresolvedOrphanCount: number;
  totalMessagesAfterRecovery: number;
}

let recoveryPromise: Promise<ChatRecoveryReport> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.characterId === 'string' &&
    value.characterId.length > 0 &&
    typeof value.text === 'string' &&
    (value.sender === 'user' || value.sender === 'ai') &&
    Number.isFinite(Number(value.timestamp))
  );
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    timestamp: Number(message.timestamp),
  };
}

function collectMessages(value: unknown, output: Map<string, ChatMessage>, depth = 0): void {
  if (depth > 5 || value == null) return;
  if (isChatMessage(value)) {
    output.set(value.id, normalizeMessage(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMessages(item, output, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  // Only descend into fields commonly used by this app and older backup formats.
  // This avoids touching large image/base64 payloads or unrelated private data.
  const messageContainerKeys = [
    'messages',
    'messagesDump',
    'history',
    'chat',
    'conversation',
    'conversations',
    'records',
    'items',
    'data',
  ];
  for (const key of messageContainerKeys) {
    if (key in value) collectMessages(value[key], output, depth + 1);
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function addLegacyCharacterNames(value: unknown, output: Map<string, string>): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (id && name) output.set(id, name);
  }
}

function readLocalStorageCandidates(
  candidates: Map<string, ChatMessage>,
  legacyCharacterNames: Map<string, string>,
  sourceCounts: Record<string, number>,
  scannedSources: string[]
): void {
  if (typeof localStorage === 'undefined') return;

  const legacyBefore = candidates.size;
  collectMessages(parseJson(localStorage.getItem(LEGACY_MESSAGES_KEY)), candidates);
  sourceCounts.localStorage = candidates.size - legacyBefore;
  scannedSources.push('旧版聊天存储');

  const snapshots = parseJson(localStorage.getItem(SNAPSHOTS_KEY));
  const snapshotBefore = candidates.size;
  if (Array.isArray(snapshots)) {
    for (const snapshot of snapshots) {
      if (!isRecord(snapshot)) continue;
      collectMessages(snapshot.messagesDump, candidates);
      const dump = isRecord(snapshot.localStorageDump) ? snapshot.localStorageDump : null;
      const rawCharacters = dump && typeof dump.phone_ai_characters === 'string'
        ? dump.phone_ai_characters
        : null;
      addLegacyCharacterNames(parseJson(rawCharacters), legacyCharacterNames);
    }
  }
  sourceCounts.snapshots = candidates.size - snapshotBefore;
  scannedSources.push('本地安全快照');

  // Capture current character names as another safe ID mapping source.
  addLegacyCharacterNames(parseJson(localStorage.getItem('phone_ai_characters')), legacyCharacterNames);
}

function openExistingDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`无法读取数据库 ${name}`));
  });
}

function readAllFromStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([storeName], 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error(`无法读取数据表 ${storeName}`));
    } catch (error) {
      reject(error);
    }
  });
}

async function scanIndexedDbCandidates(
  candidates: Map<string, ChatMessage>,
  legacyCharacterNames: Map<string, string>,
  sourceCounts: Record<string, number>,
  scannedSources: string[]
): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !window.indexedDB ||
    typeof window.indexedDB.databases !== 'function'
  ) {
    return;
  }

  let databaseNames: string[] = [];
  try {
    databaseNames = (await window.indexedDB.databases())
      .map((item) => item.name)
      .filter((name): name is string => Boolean(name));
  } catch (error) {
    console.warn('[ChatRecovery] Failed to enumerate IndexedDB databases:', error);
    return;
  }

  for (const dbName of databaseNames) {
    // Current ChatDB is already included by getAllChatMessages. Image vaults can
    // contain huge blobs and must never be scanned by a text-history recovery.
    if (dbName === CURRENT_CHAT_DB || /image/i.test(dbName)) continue;

    let db: IDBDatabase | null = null;
    try {
      db = await openExistingDatabase(dbName);
      const storeNames = Array.from(db.objectStoreNames);

      for (const storeName of storeNames) {
        if (dbName === 'PhoneSimAiMemoryDB_v1' && storeName === 'vaults') {
          const vaults = await readAllFromStore(db, storeName);
          for (const vault of vaults) {
            if (!isRecord(vault)) continue;
            const id = typeof vault.characterId === 'string' ? vault.characterId : '';
            const name = typeof vault.characterName === 'string' ? vault.characterName.trim() : '';
            if (id && name) legacyCharacterNames.set(id, name);
          }
          scannedSources.push('AI记忆库角色映射');
          continue;
        }

        if (!/(message|chat|archive|history)/i.test(storeName)) continue;
        const before = candidates.size;
        const values = await readAllFromStore(db, storeName);
        collectMessages(values, candidates);
        const added = candidates.size - before;
        const sourceKey = `${dbName}/${storeName}`;
        sourceCounts[sourceKey] = added;
        scannedSources.push(sourceKey);
      }
    } catch (error) {
      console.warn(`[ChatRecovery] Failed to scan ${dbName}:`, error);
    } finally {
      db?.close();
    }
  }
}

async function performRecovery(characters: AiCharacter[]): Promise<ChatRecoveryReport> {
  const existingMessages = await getAllChatMessages();
  const existingIds = new Set(existingMessages.map((message) => message.id));
  const candidates = new Map<string, ChatMessage>();
  const legacyCharacterNames = new Map<string, string>();
  const sourceMessageCounts: Record<string, number> = {};
  const scannedSources: string[] = [];

  readLocalStorageCandidates(
    candidates,
    legacyCharacterNames,
    sourceMessageCounts,
    scannedSources
  );
  await scanIndexedDbCandidates(
    candidates,
    legacyCharacterNames,
    sourceMessageCounts,
    scannedSources
  );

  const currentIds = new Set(characters.map((character) => character.id));
  const currentNameToIds = new Map<string, string[]>();
  for (const character of characters) {
    const normalizedName = (character.name || '').trim().toLocaleLowerCase();
    if (!normalizedName) continue;
    const ids = currentNameToIds.get(normalizedName) || [];
    ids.push(character.id);
    currentNameToIds.set(normalizedName, ids);
  }

  const orphanThreadIds = new Set<string>();
  for (const message of candidates.values()) {
    if (!currentIds.has(message.characterId)) orphanThreadIds.add(message.characterId);
  }

  // Conservative fallback: only infer a remap when there is exactly one old
  // thread and exactly one current character. Otherwise never guess ownership.
  const onlyFallbackTarget =
    orphanThreadIds.size === 1 && characters.length === 1 ? characters[0].id : null;

  const recoverable: ChatMessage[] = [];
  let remappedCount = 0;
  let unresolvedOrphanCount = 0;

  for (const original of candidates.values()) {
    if (existingIds.has(original.id)) continue;
    let targetCharacterId = original.characterId;

    if (!currentIds.has(targetCharacterId)) {
      const legacyName = legacyCharacterNames.get(targetCharacterId)?.trim().toLocaleLowerCase();
      const matchingIds = legacyName ? currentNameToIds.get(legacyName) || [] : [];
      if (matchingIds.length === 1) {
        targetCharacterId = matchingIds[0];
      } else if (onlyFallbackTarget) {
        targetCharacterId = onlyFallbackTarget;
      }
    }

    if (targetCharacterId !== original.characterId) remappedCount += 1;
    if (!currentIds.has(targetCharacterId)) unresolvedOrphanCount += 1;

    recoverable.push({
      ...original,
      characterId: targetCharacterId,
    });
  }

  if (recoverable.length > 0) {
    // Merge only. Never clear or replace the authoritative message store.
    await restoreChatMessages(recoverable, false);
  }

  const after = await getAllChatMessages();
  return {
    scannedSources: Array.from(new Set(scannedSources)),
    sourceMessageCounts,
    foundCandidateCount: candidates.size,
    restoredCount: recoverable.length,
    remappedCount,
    unresolvedOrphanCount,
    totalMessagesAfterRecovery: after.length,
  };
}

/**
 * Runs once per app process and performs a non-destructive, local-only merge
 * from every known historical store. No source record is deleted.
 */
export function recoverChatHistoryFromLocalSources(
  characters: AiCharacter[]
): Promise<ChatRecoveryReport> {
  if (!recoveryPromise) {
    recoveryPromise = performRecovery(characters).catch((error) => {
      recoveryPromise = null;
      throw error;
    });
  }
  return recoveryPromise;
}

