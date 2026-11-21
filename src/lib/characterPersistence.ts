import { AiCharacter } from '../types';

export const CHARACTERS_STORAGE_KEY = 'phone_ai_characters';
export const CHARACTERS_CHANGED_EVENT = 'phone_ai_characters_changed';

const LEGACY_DEMO_CHARACTER_IDS = new Set(['char_1', 'char_2', 'char_3']);

let writeQueue: Promise<unknown> = Promise.resolve();

function generateUniqueCustomCharacterId(existingIds: Set<string>): string {
  for (let i = 0; i < 8; i++) {
    const candidate = `char_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `char_custom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCharacterError(err: unknown, actionLabel: string): Error {
  const e = err as { name?: string; code?: number; message?: string } | undefined;
  const msg = e?.message || String(err || '未知存储错误');
  const isQuotaError =
    e?.name === 'QuotaExceededError' ||
    e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e?.code === 22 ||
    e?.code === 1014 ||
    /quota|exceeded|storage/i.test(msg);

  if (isQuotaError) {
    return new Error(
      `${actionLabel}失败：本地持久化存储空间不足（可能是角色头像图片过大或本地缓存已接近上限），请更换较小的头像或清理空间后重试。`
    );
  }
  if (err instanceof Error) {
    return err.message.startsWith(actionLabel)
      ? err
      : new Error(`${actionLabel}失败：${err.message}`);
  }
  return new Error(`${actionLabel}失败：${msg}`);
}

export function notifyCharactersChanged(characters: AiCharacter[]): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(CHARACTERS_CHANGED_EVENT, {
        detail: { characters },
      })
    );
  } catch {
    // Fallback for environments with restricted CustomEvent
  }
}

export function subscribeCharactersChange(
  listener: (characters: AiCharacter[]) => void
): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ characters?: AiCharacter[] }>;
    if (Array.isArray(customEvent?.detail?.characters)) {
      listener(customEvent.detail.characters);
    } else {
      listener(loadCharactersFromStorage());
    }
  };
  const storageHandler = (event: StorageEvent) => {
    if (!event.key || event.key === CHARACTERS_STORAGE_KEY) {
      listener(loadCharactersFromStorage());
    }
  };
  window.addEventListener(CHARACTERS_CHANGED_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(CHARACTERS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

/**
 * Load persisted AI characters safely.
 * Distinguishes empty list (`[]`) from missing key; NEVER overwrites corrupt JSON with `[]`
 * and NEVER restores default/demo characters when the list is empty.
 */
export function loadCharactersFromStorage(): AiCharacter[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  } catch (e) {
    console.error('[CharacterPersistence] Failed to read characters from localStorage:', e);
    return [];
  }

  if (raw === null || raw === '') {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Do NOT overwrite corrupt storage with [] automatically
    console.error('[CharacterPersistence] Failed to parse stored characters JSON:', e);
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.error('[CharacterPersistence] Stored characters value is not an array');
    return [];
  }

  const cleaned = parsed.filter(
    (c): c is AiCharacter => Boolean(c && typeof c === 'object' && c.id && !LEGACY_DEMO_CHARACTER_IDS.has(c.id))
  );

  if (cleaned.length !== parsed.length) {
    try {
      localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(cleaned));
    } catch (e) {
      console.warn('[CharacterPersistence] Failed to persist cleaned legacy character filter:', e);
    }
  }

  return cleaned;
}

/**
 * Strict read for read-modify-write transactions.
 * Throws if existing stored data is corrupted so a bad parse can never overwrite existing characters.
 */
function readCharactersStrictForWrite(): AiCharacter[] {
  if (typeof localStorage === 'undefined') {
    throw new Error('当前环境不支持 localStorage，无法保存角色数据');
  }
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  if (raw === null || raw === '') {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `已有角色数据解析异常（已阻止覆盖原有存储以防数据丢失）：${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('已有角色数据格式异常（非数组），已阻止覆盖写入');
  }

  return parsed.filter(
    (c): c is AiCharacter => Boolean(c && typeof c === 'object' && c.id && !LEGACY_DEMO_CHARACTER_IDS.has(c.id))
  );
}

/**
 * Write character list synchronously to localStorage, immediately read back & verify,
 * and broadcast change event. Never swallows write errors.
 */
export function writeCharactersStrictSync(
  nextChars: AiCharacter[],
  actionLabel = '角色保存',
  verifyFn?: (persisted: AiCharacter[]) => void
): AiCharacter[] {
  if (typeof localStorage === 'undefined') {
    throw new Error(`${actionLabel}失败：当前环境不支持 localStorage`);
  }
  if (!Array.isArray(nextChars)) {
    throw new Error(`${actionLabel}失败：待写入的角色列表格式无效`);
  }

  const sanitized: AiCharacter[] = [];
  const seenIds = new Set<string>();
  for (const ch of nextChars) {
    if (!ch || typeof ch !== 'object' || !ch.id || typeof ch.id !== 'string') {
      throw new Error(`${actionLabel}失败：存在缺少有效 id 的角色数据`);
    }
    if (LEGACY_DEMO_CHARACTER_IDS.has(ch.id)) {
      continue;
    }
    if (seenIds.has(ch.id)) {
      continue;
    }
    seenIds.add(ch.id);
    sanitized.push(ch);
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(sanitized);
  } catch (e) {
    throw normalizeCharacterError(e, actionLabel);
  }

  try {
    localStorage.setItem(CHARACTERS_STORAGE_KEY, serialized);
  } catch (e) {
    throw normalizeCharacterError(e, actionLabel);
  }

  // Immediate read-back verification from authoritative persistent storage
  let readBackRaw: string | null = null;
  try {
    readBackRaw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  } catch (e) {
    throw normalizeCharacterError(e, `${actionLabel}回读校验`);
  }

  if (readBackRaw === null) {
    throw new Error(`${actionLabel}校验失败：写入后未能从本地存储读取到角色数据`);
  }

  let verified: unknown;
  try {
    verified = JSON.parse(readBackRaw);
  } catch (e) {
    throw new Error(
      `${actionLabel}校验失败：写入后的存储内容解析失败 (${e instanceof Error ? e.message : String(e)})`
    );
  }

  if (!Array.isArray(verified)) {
    throw new Error(`${actionLabel}校验失败：回读结果不是有效角色数组`);
  }

  const verifiedChars = verified as AiCharacter[];
  if (verifiedChars.length !== sanitized.length) {
    throw new Error(
      `${actionLabel}校验失败：写入数量 (${sanitized.length}) 与回读数量 (${verifiedChars.length}) 不一致`
    );
  }

  if (verifyFn) {
    verifyFn(verifiedChars);
  }

  notifyCharactersChanged(verifiedChars);
  return verifiedChars;
}

function enqueueCharacterWrite<T>(task: () => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(() => task());
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Create a new AI character atomically against latest persisted storage.
 * Verifies the character ID and key fields exist in localStorage after write.
 */
export function createCharacterAtomic(
  newChar: AiCharacter
): Promise<{ character: AiCharacter; characters: AiCharacter[] }> {
  return enqueueCharacterWrite(() => {
    const latest = readCharactersStrictForWrite();
    const existingIds = new Set(latest.map((c) => c.id));

    const trimmedName = (newChar.name || '').trim() || '自定义 AI';
    const resolvedId =
      newChar.id && typeof newChar.id === 'string' && !existingIds.has(newChar.id)
        ? newChar.id
        : generateUniqueCustomCharacterId(existingIds);

    const characterToSave: AiCharacter = {
      ...newChar,
      id: resolvedId,
      name: trimmedName,
      createdAt: newChar.createdAt || Date.now(),
    };

    const nextChars = [...latest, characterToSave];
    const verified = writeCharactersStrictSync(nextChars, '创建角色保存', (persisted) => {
      const saved = persisted.find((c) => c.id === characterToSave.id);
      if (!saved) {
        throw new Error(`创建角色校验失败：未在持久化存储中找到新建角色 (${characterToSave.id})`);
      }
      if (saved.name !== characterToSave.name) {
        throw new Error(`创建角色校验失败：角色名称未正确写入 (${characterToSave.id})`);
      }
      if ((saved.persona || '') !== (characterToSave.persona || '')) {
        throw new Error(`创建角色校验失败：角色人设未完整写入 (${characterToSave.id})`);
      }
    });

    const verifiedTarget = verified.find((c) => c.id === characterToSave.id) || characterToSave;
    return {
      character: verifiedTarget,
      characters: verified,
    };
  });
}

/**
 * Update an existing character strictly by its ID against latest persisted storage.
 * Throws if target character ID does not exist.
 */
export function updateCharacterById(
  characterId: string,
  updater: Partial<AiCharacter> | ((current: AiCharacter) => AiCharacter)
): Promise<{ character: AiCharacter; characters: AiCharacter[] }> {
  return enqueueCharacterWrite(() => {
    const latest = readCharactersStrictForWrite();
    const idx = latest.findIndex((c) => c.id === characterId);
    if (idx === -1) {
      throw new Error(`更新角色失败：角色 ${characterId} 不存在或已被删除`);
    }

    const current = latest[idx];
    const nextCandidate =
      typeof updater === 'function' ? updater(current) : { ...current, ...updater };
    const updatedCharacter: AiCharacter = {
      ...nextCandidate,
      id: current.id, // Never lose or alter original ID
    };

    const nextChars = latest.map((c, i) => (i === idx ? updatedCharacter : c));
    const verified = writeCharactersStrictSync(nextChars, '更新角色保存', (persisted) => {
      const saved = persisted.find((c) => c.id === current.id);
      if (!saved || saved.name !== updatedCharacter.name) {
        throw new Error(`更新角色校验失败：未能确认角色 ${current.id} 的更新已写入持久化存储`);
      }
    });

    const verifiedTarget = verified.find((c) => c.id === current.id) || updatedCharacter;
    return {
      character: verifiedTarget,
      characters: verified,
    };
  });
}

/**
 * Background-safe update by ID: if the character was deleted while an async job was in flight,
 * returns null cleanly without recreating/resurrecting the deleted character.
 */
export function updateCharacterByIdIfExists(
  characterId: string,
  updater: (current: AiCharacter) => AiCharacter | null
): Promise<AiCharacter[] | null> {
  return enqueueCharacterWrite(() => {
    const latest = readCharactersStrictForWrite();
    const idx = latest.findIndex((c) => c.id === characterId);
    if (idx === -1) {
      return null;
    }

    const current = latest[idx];
    const nextCandidate = updater(current);
    if (!nextCandidate || nextCandidate === current) {
      return latest;
    }

    const updatedCharacter: AiCharacter = {
      ...nextCandidate,
      id: current.id,
    };
    const nextChars = latest.map((c, i) => (i === idx ? updatedCharacter : c));
    return writeCharactersStrictSync(nextChars, '后台更新角色状态');
  });
}

/**
 * Serialized atomic transform for multi-character background operations
 * (e.g., notification thumbnail backfill, background unread count sync).
 */
export function mutateCharactersAtomic(
  mutator: (latest: AiCharacter[]) => AiCharacter[] | null
): Promise<AiCharacter[]> {
  return enqueueCharacterWrite(() => {
    const latest = readCharactersStrictForWrite();
    const nextChars = mutator(latest);
    if (!nextChars) {
      return latest;
    }
    return writeCharactersStrictSync(nextChars, '批量同步角色状态');
  });
}

/**
 * Delete a character strictly by ID from latest persisted storage.
 * Preserves empty array `[]` as valid user state; verifies target ID is absent after write.
 */
export function deleteCharacterById(characterId: string): Promise<AiCharacter[]> {
  return enqueueCharacterWrite(() => {
    const latest = readCharactersStrictForWrite();
    const nextChars = latest.filter((c) => c.id !== characterId);
    return writeCharactersStrictSync(nextChars, '删除角色', (persisted) => {
      if (persisted.some((c) => c.id === characterId)) {
        throw new Error(`删除角色校验失败：角色 ${characterId} 仍存在于持久化存储中`);
      }
    });
  });
}

/**
 * Replace the full character list inside the serialized write queue (for explicit user data import).
 */
export function replaceCharactersAtomic(nextChars: AiCharacter[]): Promise<AiCharacter[]> {
  return enqueueCharacterWrite(() => {
    const expectedIds = nextChars
      .filter((c) => c && c.id && !LEGACY_DEMO_CHARACTER_IDS.has(c.id))
      .map((c) => c.id);
    return writeCharactersStrictSync(nextChars, '导入角色保存', (persisted) => {
      const persistedSet = new Set(persisted.map((c) => c.id));
      for (const id of expectedIds) {
        if (!persistedSet.has(id)) {
          throw new Error(`导入角色校验失败：角色 ${id} 未写入持久化存储`);
        }
      }
    });
  });
}
