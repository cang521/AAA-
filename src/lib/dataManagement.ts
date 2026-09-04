import JSZip from 'jszip';
import {
  AiCharacter,
  ChatMessage,
  GroupChat,
  UserProfile,
  MenstrualData,
  ApiConfig,
  AiControls,
  AiPermissions,
  Memo,
  WorldBook,
} from '../types';
import {
  loadCharacters,
  saveCharacters,
  loadGroupChats,
  saveGroupChats,
  loadUserProfile,
  saveUserProfile,
  loadSettings,
  saveSettings,
  loadMenstrualData,
  saveMenstrualData,
  loadApiConfig,
  saveApiConfig,
  loadAiControls,
  saveAiControls,
  loadPermissions,
  savePermissions,
  loadMemos,
  saveMemos,
  loadWorldBooks,
  saveWorldBooks,
} from './storage';
import {
  getAllChatMessages,
  saveChatMessagesBulk,
  restoreChatMessages,
  clearAllChatMessages,
} from './chatDb';

export type ExportCategory = 'characters' | 'messages' | 'memories' | 'groups' | 'settings' | 'all';
export type ExportFormat = 'json' | 'jsonl' | 'txt' | 'zip';
export type ConflictResolutionStrategy = 'merge' | 'keep_existing' | 'import_as_new';

export type RecognitionMode =
  | 'auto' // 智能多维自适应识别 (推荐)
  | 'tavern_card' // 酒馆角色卡专属深度剖析 (SillyTavern / TavernAI)
  | 'chat_transcript' // 聊天记录会话流剖析 (微信 / QQ / ChatGPT)
  | 'full_backup' // 应用系统全量备份恢复包
  | 'character_dossier'; // 角色人设档案与长期记忆 (TXT / Markdown)

export interface ImportParseOptions {
  recognitionMode?: RecognitionMode;
  enableDeepAnalysis?: boolean;
  fuzzyNameMatch?: boolean;
  autoDetectAiSender?: boolean;
}

export interface FileIntelligenceReport {
  confidence: number; // 0 - 100
  confidenceLevel: 'high' | 'medium' | 'low';
  identifiedFormat: string; // 标准规范名称
  category: 'tavern_card' | 'chat_transcript' | 'full_backup' | 'character_dossier' | 'generic';
  categoryLabel: string;
  formatSignature: string; // 核心指纹
  featuresDetected: string[]; // 检测到的核心特征项
  turnStats?: {
    totalDialogueLines: number;
    participants: {
      name: string;
      isAi: boolean;
      count: number;
      percentage: number;
      matchedLocalName?: string;
    }[];
    timeSpan?: string;
  };
  tavernDetails?: {
    spec?: string;
    hasCharacterBook: boolean;
    characterBookEntriesCount: number;
    alternateGreetingsCount: number;
    hasScenario: boolean;
  };
  zipDetails?: {
    totalFiles: number;
    fileTypes: Record<string, number>;
    hasManifest: boolean;
    isBatchCards: boolean;
  };
  analysisSummary: string; // 一句话深度分析结论
  actionSuggestion: string; // 推荐的落地操作建议
}

export interface ExportOptions {
  categories: ExportCategory[];
  format: ExportFormat;
  characterIds?: string[]; // empty means all
  includeThinkingProcess?: boolean;
}

export interface CharacterConflictInfo {
  existingCharacterId: string;
  existingCharacterName: string;
  importedCharacter: AiCharacter;
  matchingField: 'id' | 'name' | 'wxid' | 'fuzzy';
}

export interface CharacterMatchDetail {
  importedCharacter: AiCharacter;
  isNameMatched: boolean;
  matchedLocalCharacter?: AiCharacter;
  matchingField: 'name' | 'fuzzy' | 'id' | 'wxid' | 'none';
  suggestedTargetId: string; // existing character id or '__CREATE_NEW__'
  messageCount: number;
  memoryCount: number;
}

export interface ImportParsedResult {
  fileName: string;
  fileType: 'zip' | 'json' | 'jsonl' | 'txt';
  fileSize: number;
  detectedSource: string; // e.g. 'SillyTavern 酒馆角色卡' | 'ChatGPT / OpenAI 导出会话' | '全量备份包' | '聊天记录转录 (TXT)'
  intelligenceReport: FileIntelligenceReport;
  report: FileIntelligenceReport;
  characters: AiCharacter[];
  messages: ChatMessage[];
  groups: GroupChat[];
  memories: { characterId?: string; characterName?: string; text: string }[];
  settings?: {
    settings?: any;
    userProfile?: UserProfile;
    menstrualData?: MenstrualData;
    apiConfig?: ApiConfig;
    aiControls?: AiControls;
    permissions?: AiPermissions;
    memos?: Memo[];
    worldBooks?: WorldBook[];
  };
  stats: {
    characterCount: number;
    messageCount: number;
    groupCount: number;
    memoryCount: number;
    hasSettings: boolean;
  };
  conflicts: CharacterConflictInfo[];
  characterMatches: CharacterMatchDetail[];
  warnings: string[];
}

export interface ImportExecutionOptions {
  conflictStrategy: ConflictResolutionStrategy;
  importCharacters: boolean;
  importMessages: boolean;
  importMemories: boolean;
  importGroups: boolean;
  importSettings: boolean;
  selectedCharacterIds?: string[];
  // Mapping of imported character id -> target local character id, '__CREATE_NEW__', or '__SKIP__'
  characterMapping?: Record<string, string>;
  // Optional unified target: when set, all imported characters and chat messages are merged/assigned to this single character
  unifiedTargetCharacterId?: string;
}

export interface DataSnapshot {
  id: string;
  timestamp: number;
  note: string;
  localStorageDump: Record<string, string>;
  messagesDump: ChatMessage[];
  stats: {
    characterCount: number;
    messageCount: number;
    groupCount: number;
  };
}

const SNAPSHOTS_KEY = 'phone_data_snapshots_v1';

// =========================================================================
// 1. Snapshot & Rollback Helpers (Local-only, Safe)
// =========================================================================

export function listDataSnapshots(): DataSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to list snapshots', e);
    return [];
  }
}

export async function createDataSnapshot(note = '导入前自动备份'): Promise<DataSnapshot> {
  const keysToBackup = [
    'phone_pin_code',
    'phone_pin_enabled',
    'phone_is_locked',
    'phone_desktop_wallpaper',
    'phone_lock_wallpaper',
    'phone_custom_css',
    'phone_ai_characters',
    'phone_moment_posts',
    'phone_user_profile',
    'phone_menstrual_data',
    'phone_memos',
    'phone_world_books',
    'phone_ai_permissions',
    'phone_api_config',
    'phone_ai_controls',
    'phone_group_chats',
  ];

  const localStorageDump: Record<string, string> = {};
  for (const k of keysToBackup) {
    const val = localStorage.getItem(k);
    if (val !== null) {
      localStorageDump[k] = val;
    }
  }

  const allMsgs = await getAllChatMessages();
  const characters = loadCharacters();
  const groups = loadGroupChats();

  const snapshot: DataSnapshot = {
    id: 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    note,
    localStorageDump,
    messagesDump: allMsgs,
    stats: {
      characterCount: characters.length,
      messageCount: allMsgs.length,
      groupCount: groups.length,
    },
  };

  try {
    const existing = listDataSnapshots();
    // Keep max 6 snapshots to conserve browser storage
    const updated = [snapshot, ...existing].slice(0, 6);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save snapshot metadata to localStorage', e);
  }

  return snapshot;
}

export async function restoreDataSnapshot(snapshotId: string): Promise<boolean> {
  const snapshots = listDataSnapshots();
  const snap = snapshots.find((s) => s.id === snapshotId);
  if (!snap) {
    throw new Error('未找到指定备份快照数据');
  }

  // Restore LocalStorage
  for (const [key, val] of Object.entries(snap.localStorageDump)) {
    localStorage.setItem(key, val);
  }

  // Restore IndexedDB
  await restoreChatMessages(snap.messagesDump, true);
  return true;
}

export function deleteDataSnapshot(snapshotId: string): void {
  const snapshots = listDataSnapshots();
  const updated = snapshots.filter((s) => s.id !== snapshotId);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
}

// =========================================================================
// 2. Data Deduplication Helpers
// =========================================================================

export function deduplicateMemories(existingMemories: string[] = [], newMemories: string[] = []): string[] {
  const set = new Set<string>();
  const result: string[] = [];

  for (const m of existingMemories) {
    const trimmed = (m || '').trim();
    if (trimmed && !set.has(trimmed)) {
      set.add(trimmed);
      result.push(trimmed);
    }
  }

  for (const m of newMemories) {
    const trimmed = (m || '').trim();
    if (trimmed && !set.has(trimmed)) {
      set.add(trimmed);
      result.push(trimmed);
    }
  }

  return result;
}

export function deduplicateMessages(existingMessages: ChatMessage[], incomingMessages: ChatMessage[]): ChatMessage[] {
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  for (const m of existingMessages) {
    if (m.id) seenIds.add(m.id);
    const fp = `${m.characterId || ''}|${m.sender || ''}|${m.timestamp || 0}|${(m.text || '').trim()}`;
    seenFingerprints.add(fp);
  }

  const toAdd: ChatMessage[] = [];
  for (const m of incomingMessages) {
    if (!m.text || !m.characterId) continue;
    const fp = `${m.characterId}|${m.sender || 'user'}|${m.timestamp || 0}|${(m.text || '').trim()}`;
    if (m.id && seenIds.has(m.id)) continue;
    if (seenFingerprints.has(fp)) continue;

    seenFingerprints.add(fp);
    if (m.id) seenIds.add(m.id);
    toAdd.push(m);
  }

  return toAdd;
}

// =========================================================================
// 3. File Parsing & Multi-format Normalization Engine
// =========================================================================

export async function parseImportFile(file: File, options?: ImportParseOptions): Promise<ImportParsedResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const currentMode = options?.recognitionMode || 'auto';

  const warnings: string[] = [];
  let parsedChars: AiCharacter[] = [];
  let parsedMsgs: ChatMessage[] = [];
  let parsedGroups: GroupChat[] = [];
  let parsedMemories: { characterId?: string; characterName?: string; text: string }[] = [];
  let parsedSettings: any = undefined;
  let fileType: 'zip' | 'json' | 'jsonl' | 'txt' = 'json';

  let rawReport: Partial<FileIntelligenceReport> = {};

  if (ext === 'zip') {
    fileType = 'zip';
    const zipResult = await parseZipFile(file, options);
    parsedChars = zipResult.characters;
    parsedMsgs = zipResult.messages;
    parsedGroups = zipResult.groups;
    parsedMemories = zipResult.memories;
    parsedSettings = zipResult.settings;
    warnings.push(...zipResult.warnings);
    rawReport = zipResult.report;
  } else if (ext === 'jsonl') {
    fileType = 'jsonl';
    const text = await file.text();
    const jsonlResult = parseJsonlText(text, options);
    parsedChars = jsonlResult.characters;
    parsedMsgs = jsonlResult.messages;
    parsedGroups = jsonlResult.groups;
    parsedMemories = jsonlResult.memories;
    parsedSettings = jsonlResult.settings;
    warnings.push(...jsonlResult.warnings);
    rawReport = jsonlResult.report;
  } else if (ext === 'txt') {
    fileType = 'txt';
    const text = await file.text();
    const txtResult = parseTxtContent(text, fileName, options);
    parsedChars = txtResult.characters;
    parsedMsgs = txtResult.messages;
    parsedMemories = txtResult.memories;
    warnings.push(...txtResult.warnings);
    rawReport = txtResult.report;
  } else {
    // Default JSON
    fileType = 'json';
    const text = await file.text();
    const jsonResult = parseJsonContent(text, fileName, options);
    parsedChars = jsonResult.characters;
    parsedMsgs = jsonResult.messages;
    parsedGroups = jsonResult.groups;
    parsedMemories = jsonResult.memories;
    parsedSettings = jsonResult.settings;
    warnings.push(...jsonResult.warnings);
    rawReport = jsonResult.report;
  }

  // Detect conflicts against existing AI characters & perform Character Name Matching
  const existingChars = loadCharacters();
  const conflicts: CharacterConflictInfo[] = [];
  const characterMatches: CharacterMatchDetail[] = [];
  const fuzzy = !!options?.fuzzyNameMatch;

  for (const incChar of parsedChars) {
    const incName = incChar.name.trim();

    // Associated message count in parsed data
    const associatedMsgs = parsedMsgs.filter(
      (m) => m.characterId === incChar.id || (m as any).characterName?.trim().toLowerCase() === incName.toLowerCase()
    );
    // Associated memory count in parsed data
    const associatedMems = (incChar.memories?.length || 0) + parsedMemories.filter(
      (mem) => mem.characterId === incChar.id || mem.characterName?.trim().toLowerCase() === incName.toLowerCase()
    ).length;

    // 1. Primary Match: Exact name match
    let matchedLocal = existingChars.find(
      (c) => c.name.trim().toLowerCase() === incName.toLowerCase()
    );
    let matchingField: 'name' | 'fuzzy' | 'id' | 'wxid' | 'none' = matchedLocal ? 'name' : 'none';

    // 2. ID Match
    if (!matchedLocal) {
      matchedLocal = existingChars.find((c) => c.id === incChar.id);
      if (matchedLocal) matchingField = 'id';
    }

    // 3. WXID Match
    if (!matchedLocal && incChar.wxid) {
      matchedLocal = existingChars.find((c) => c.wxid === incChar.wxid);
      if (matchedLocal) matchingField = 'wxid';
    }

    // 4. Fuzzy Name Match (if option enabled and not matched yet)
    if (!matchedLocal && fuzzy && incName.length >= 2) {
      matchedLocal = existingChars.find(
        (c) => c.name.includes(incName) || incName.includes(c.name)
      );
      if (matchedLocal) matchingField = 'fuzzy';
    }

    const isNameMatched = matchingField === 'name' || matchingField === 'fuzzy';

    if (matchedLocal) {
      conflicts.push({
        existingCharacterId: matchedLocal.id,
        existingCharacterName: matchedLocal.name,
        importedCharacter: incChar,
        matchingField: matchingField === 'none' ? 'name' : matchingField,
      });
    }

    characterMatches.push({
      importedCharacter: incChar,
      isNameMatched,
      matchedLocalCharacter: matchedLocal,
      matchingField,
      suggestedTargetId: matchedLocal ? matchedLocal.id : '__CREATE_NEW__',
      messageCount: associatedMsgs.length,
      memoryCount: associatedMems,
    });
  }

  // Compile Comprehensive Intelligence Report
  const confidence = rawReport.confidence ?? 90;
  const confidenceLevel: 'high' | 'medium' | 'low' =
    confidence >= 90 ? 'high' : confidence >= 70 ? 'medium' : 'low';

  const intelligenceReport: FileIntelligenceReport = {
    confidence,
    confidenceLevel,
    identifiedFormat: rawReport.identifiedFormat || '通用数据文件',
    category: rawReport.category || 'generic',
    categoryLabel: rawReport.categoryLabel || '标准数据包',
    formatSignature: rawReport.formatSignature || `${fileType.toUpperCase()} 数据`,
    featuresDetected: rawReport.featuresDetected || [],
    turnStats: rawReport.turnStats,
    tavernDetails: rawReport.tavernDetails,
    zipDetails: rawReport.zipDetails,
    analysisSummary: rawReport.analysisSummary || `已成功识别并提取 ${parsedChars.length} 个角色、${parsedMsgs.length} 条消息。`,
    actionSuggestion: rawReport.actionSuggestion || '建议点击下方「立即执行数据导入」完成合并。',
  };

  // Synchronize detectedSource label
  const detectedSource = `${intelligenceReport.categoryLabel} (${fileType.toUpperCase()})`;

  return {
    fileName,
    fileType,
    fileSize,
    detectedSource,
    intelligenceReport,
    report: intelligenceReport,
    characters: parsedChars,
    messages: parsedMsgs,
    groups: parsedGroups,
    memories: parsedMemories,
    settings: parsedSettings,
    stats: {
      characterCount: parsedChars.length,
      messageCount: parsedMsgs.length,
      groupCount: parsedGroups.length,
      memoryCount: parsedMemories.length + parsedChars.reduce((acc, c) => acc + (c.memories?.length || 0), 0),
      hasSettings: !!parsedSettings,
    },
    conflicts,
    characterMatches,
    warnings,
  };
}

// -------------------------------------------------------------------------
// ZIP Parser & Multi-File Inspector
// -------------------------------------------------------------------------
async function parseZipFile(file: File, options?: ImportParseOptions) {
  const zip = new JSZip();
  const loaded = await zip.loadAsync(file);
  const warnings: string[] = [];

  let characters: AiCharacter[] = [];
  let messages: ChatMessage[] = [];
  let groups: GroupChat[] = [];
  let memories: { characterId?: string; characterName?: string; text: string }[] = [];
  let settings: any = undefined;

  const rootFiles = Object.keys(loaded.files);
  const fileTypesCount: Record<string, number> = {};
  let hasManifest = false;
  let hasBackupJson = false;
  let batchCardCount = 0;

  for (const f of rootFiles) {
    const ext = f.split('.').pop()?.toLowerCase() || 'unknown';
    fileTypesCount[ext] = (fileTypesCount[ext] || 0) + 1;
    if (f.toLowerCase() === 'manifest.json') hasManifest = true;
    if (f.toLowerCase() === 'backup.json' || f.toLowerCase() === 'full_backup.json') hasBackupJson = true;
  }

  // 1. App full backup in zip
  for (const name of rootFiles) {
    const fileObj = loaded.file(name);
    if (!fileObj || fileObj.dir) continue;

    const lower = name.toLowerCase();

    if (lower === 'backup.json' || lower === 'app_data.json' || lower === 'full_backup.json') {
      const str = await fileObj.async('text');
      const res = parseJsonContent(str, name, options);
      characters.push(...res.characters);
      messages.push(...res.messages);
      groups.push(...res.groups);
      memories.push(...res.memories);
      if (res.settings) settings = res.settings;
    } else if (lower === 'characters.json' || lower === 'ai_characters.json') {
      const str = await fileObj.async('text');
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          characters.push(...parsed.map(normalizeCharacterSchema));
        }
      } catch (e) {
        warnings.push(`解析 ${name} 失败`);
      }
    } else if (lower === 'groups.json' || lower === 'group_chats.json') {
      const str = await fileObj.async('text');
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          groups.push(...parsed);
        }
      } catch (e) {
        warnings.push(`解析 ${name} 失败`);
      }
    } else if (lower === 'messages.json' || lower === 'all_messages.json') {
      const str = await fileObj.async('text');
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          messages.push(...parsed.map(normalizeChatMessageSchema));
        }
      } catch (e) {
        warnings.push(`解析 ${name} 失败`);
      }
    } else if (lower === 'settings.json') {
      const str = await fileObj.async('text');
      try {
        const parsed = JSON.parse(str);
        settings = parsed;
      } catch (e) {
        warnings.push(`解析 ${name} 失败`);
      }
    } else if (lower.startsWith('messages/') && lower.endsWith('.json')) {
      const str = await fileObj.async('text');
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          messages.push(...parsed.map(normalizeChatMessageSchema));
        }
      } catch (e) {}
    } else if (lower.startsWith('messages/') && lower.endsWith('.txt')) {
      const str = await fileObj.async('text');
      const res = parseTxtContent(str, name, options);
      messages.push(...res.messages);
    } else if (lower.startsWith('memories/') && lower.endsWith('.txt')) {
      const str = await fileObj.async('text');
      const lines = str.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-') || l.startsWith('*') || l.length > 2);
      for (const line of lines) {
        const clean = line.replace(/^[-*•\d.]\s*/, '').trim();
        if (clean) memories.push({ text: clean });
      }
    } else if (lower.endsWith('.json') && !lower.includes('manifest.json')) {
      // Could be standalone Tavern / AI character card inside ZIP
      try {
        const str = await fileObj.async('text');
        const res = parseJsonContent(str, name, options);
        if (res.characters.length > 0) {
          characters.push(...res.characters);
          messages.push(...res.messages);
          memories.push(...res.memories);
          batchCardCount += res.characters.length;
        }
      } catch (e) {}
    }
  }

  const isFullBackup = hasBackupJson || (characters.length > 0 && messages.length > 0 && !!settings);
  const isBatchCards = batchCardCount > 0 && messages.length === 0;

  const featuresDetected: string[] = [];
  featuresDetected.push(`压缩包包含 ${rootFiles.length} 个文件/目录节点`);
  if (hasManifest) featuresDetected.push('包含标准 manifest.json 清单');
  if (hasBackupJson) featuresDetected.push('包含全量 backup.json 数据快照');
  if (characters.length > 0) featuresDetected.push(`识别出 ${characters.length} 个角色定义`);
  if (messages.length > 0) featuresDetected.push(`识别出 ${messages.length} 条聊天记录`);
  if (settings) featuresDetected.push('识别出系统偏好与配置');

  const report: Partial<FileIntelligenceReport> = {
    confidence: isFullBackup ? 99 : isBatchCards ? 96 : 92,
    identifiedFormat: isFullBackup
      ? 'VirtualPhoneSim 完整系统备份包 (ZIP)'
      : isBatchCards
      ? 'SillyTavern 多角色卡合集压缩包 (ZIP)'
      : '数据模块归档压缩包 (ZIP)',
    category: isFullBackup ? 'full_backup' : isBatchCards ? 'tavern_card' : 'generic',
    categoryLabel: isFullBackup ? '系统全量备份包' : isBatchCards ? '角色卡批量合集' : '综合归档压缩包',
    formatSignature: `ZIP [${Object.entries(fileTypesCount).map(([k, v]) => `${k}:${v}`).join(', ')}]`,
    featuresDetected,
    zipDetails: {
      totalFiles: rootFiles.length,
      fileTypes: fileTypesCount,
      hasManifest,
      isBatchCards,
    },
    analysisSummary: isFullBackup
      ? `已准确识别出包含角色(${characters.length})、消息(${messages.length})与系统设置的完整备份包。`
      : `深度解包完成，成功提取 ${characters.length} 个角色与 ${messages.length} 条对话。`,
    actionSuggestion: isFullBackup
      ? '建议采用「⚡ 智能合并」或「🛡️ 保留原设定」无缝导入。'
      : '可在下方逐一确认导入角色的本地归属。',
  };

  return { characters, messages, groups, memories, settings, warnings, report };
}

// -------------------------------------------------------------------------
// JSON Parser & SillyTavern / ChatGPT / Backup Deep Adapter
// -------------------------------------------------------------------------
function parseJsonContent(text: string, fileName: string, options?: ImportParseOptions) {
  const warnings: string[] = [];
  let characters: AiCharacter[] = [];
  let messages: ChatMessage[] = [];
  let groups: GroupChat[] = [];
  let memories: { characterId?: string; characterName?: string; text: string }[] = [];
  let settings: any = undefined;

  let identifiedFormat = '标准 JSON 数据';
  let category: 'tavern_card' | 'chat_transcript' | 'full_backup' | 'character_dossier' | 'generic' = 'generic';
  let categoryLabel = '通用 JSON 数据';
  let confidence = 85;
  let formatSignature = 'JSON Object';
  const featuresDetected: string[] = [];
  let tavernDetails: any = undefined;
  let analysisSummary = '';
  let actionSuggestion = '';

  const mode = options?.recognitionMode || 'auto';

  try {
    const data = JSON.parse(text);

    // 1. SillyTavern / Character Card Spec V1 / V2 / V3 Detection
    const isTavernCard =
      data.spec === 'chara_card_v2' ||
      data.spec === 'chara_card_v3' ||
      !!data.data?.character_book ||
      !!data.data?.first_mes ||
      !!data.char_persona ||
      (data.data?.name && (data.data?.description || data.data?.personality)) ||
      (data.name && (data.description || data.first_mes || data.personality));

    // 2. OpenAI / ChatGPT Conversation Export Detection
    const isChatGptBatch = Array.isArray(data) && data.length > 0 && (data[0]?.mapping || (data[0]?.title && data[0]?.create_time));
    const isChatGptSingle = !Array.isArray(data) && data.title && (data.mapping || Array.isArray(data.messages));

    // 3. Full App Backup Detection
    const isFullBackup =
      data.app === 'VirtualPhoneSim' ||
      (data.characters && (data.messages || data.settings || data.userProfile));

    if ((mode === 'tavern_card' || isTavernCard) && !isFullBackup && !isChatGptBatch) {
      // === Case Tavern Card ===
      category = 'tavern_card';
      categoryLabel = 'SillyTavern 酒馆角色卡';
      formatSignature = data.spec ? `${data.spec} 规范` : 'TavernAI V1/V2 规范';

      const norm = normalizeTavernCharacter(data);
      characters.push(norm.character);
      norm.extractedMemories.forEach((mem) => {
        memories.push({ characterId: norm.character.id, characterName: norm.character.name, text: mem });
      });

      featuresDetected.push(`角色名称: ${norm.character.name}`);
      featuresDetected.push(...norm.features);
      if (norm.character.greeting) {
        featuresDetected.push(`包含初始开场白 (${norm.character.greeting.slice(0, 20)}...)`);
      }
      if (norm.extractedMemories.length > 0) {
        featuresDetected.push(`提取出 ${norm.extractedMemories.length} 条世界观设定与深度记忆`);
      }

      tavernDetails = norm.tavernMeta;
      confidence = data.spec ? 99 : 95;
      identifiedFormat = `SillyTavern 角色卡 (${norm.tavernMeta.spec || 'V2'})`;
      analysisSummary = `准确识别出角色「${norm.character.name}」的人设、开场白与 ${norm.extractedMemories.length} 条扩展设定记忆。`;
      actionSuggestion = '系统已自动比对本地通讯录同名角色，可直接合并到已有角色或作为全新AI存入。';
    } else if ((mode === 'chat_transcript' || isChatGptBatch || isChatGptSingle) && !isFullBackup) {
      // === Case ChatGPT / OpenAI Conversation ===
      category = 'chat_transcript';
      categoryLabel = 'ChatGPT / OpenAI 导出会话';
      confidence = 96;
      formatSignature = isChatGptBatch ? 'OpenAI conversations.json (数组)' : 'OpenAI 单会话 mapping 结构';
      identifiedFormat = 'ChatGPT 导出会话数据';

      if (isChatGptBatch) {
        featuresDetected.push(`包含 ${data.length} 个 ChatGPT 历史会话`);
        for (const conv of data) {
          const charName = (conv.title || 'ChatGPT 对话角色').trim();
          const charId = 'char_gpt_' + Math.random().toString(36).slice(2, 7);
          const newChar: AiCharacter = {
            id: charId,
            name: charName,
            wxid: 'chat_' + Math.random().toString(36).slice(2, 6),
            avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80',
            persona: `从 ChatGPT 导出会话 [${charName}] 提取的 AI 对话角色。`,
            greeting: '你好！这是从 ChatGPT 导入的会话。',
            memories: [],
            tags: ['ChatGPT', '导入'],
            isLocked: false,
            isCustom: true,
          };
          characters.push(newChar);

          if (conv.mapping) {
            for (const [, node] of Object.entries(conv.mapping)) {
              const msg = (node as any)?.message;
              if (!msg || !msg.content?.parts) continue;
              const role = msg.author?.role;
              if (role !== 'user' && role !== 'assistant') continue;
              const text = msg.content.parts.filter((p: any) => typeof p === 'string').join('\n');
              if (!text.trim()) continue;

              messages.push({
                id: 'msg_gpt_' + (msg.id || Math.random().toString(36).slice(2, 7)),
                characterId: charId,
                sender: role === 'user' ? 'user' : 'ai',
                text,
                timestamp: msg.create_time ? Math.round(msg.create_time * 1000) : Date.now(),
              });
            }
          }
        }
        featuresDetected.push(`共提取出 ${messages.length} 条对话记录`);
      } else {
        const charName = (data.title || '导入对话角色').trim();
        const charId = 'char_gpt_' + Date.now();
        const newChar: AiCharacter = {
          id: charId,
          name: charName,
          wxid: 'chat_' + Math.random().toString(36).slice(2, 6),
          avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80',
          persona: `从 ChatGPT 导出会话 [${charName}] 提取的 AI 对话角色。`,
          greeting: '你好！我是从导入会话中提取的角色。',
          memories: [],
          tags: ['ChatGPT', '导入'],
          isLocked: false,
          isCustom: true,
        };
        characters.push(newChar);

        if (data.mapping) {
          for (const [, node] of Object.entries(data.mapping)) {
            const msg = (node as any)?.message;
            if (!msg || !msg.content?.parts) continue;
            const role = msg.author?.role;
            if (role !== 'user' && role !== 'assistant') continue;
            const text = msg.content.parts.filter((p: any) => typeof p === 'string').join('\n');
            if (!text.trim()) continue;

            messages.push({
              id: 'msg_gpt_' + (msg.id || Math.random().toString(36).slice(2, 7)),
              characterId: charId,
              sender: role === 'user' ? 'user' : 'ai',
              text,
              timestamp: msg.create_time ? Math.round(msg.create_time * 1000) : Date.now(),
            });
          }
        } else if (Array.isArray(data.messages)) {
          for (const m of data.messages) {
            messages.push({
              id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              characterId: charId,
              sender: m.role === 'user' || m.sender === 'user' ? 'user' : 'ai',
              text: m.content || m.text || '',
              timestamp: m.timestamp || Date.now(),
            });
          }
        }
        featuresDetected.push(`提取出 ${messages.length} 条双向对话记录`);
      }

      analysisSummary = `准确还原了 ${characters.length} 个对话主题、共 ${messages.length} 条完整问答流。`;
      actionSuggestion = '可将问答历史归入本地对应同名 AI 角色。';
    } else if (isFullBackup || data.characters || data.messages) {
      // === Case App Full Backup ===
      category = 'full_backup';
      categoryLabel = '应用系统全量备份';
      confidence = 99;
      identifiedFormat = 'VirtualPhoneSim 系统全量备份 (JSON)';
      formatSignature = '根节点包含 characters + messages + settings';

      if (Array.isArray(data.characters)) {
        characters.push(...data.characters.map(normalizeCharacterSchema));
        featuresDetected.push(`包含 ${data.characters.length} 位 AI 角色`);
      }
      if (Array.isArray(data.messages)) {
        messages.push(...data.messages.map(normalizeChatMessageSchema));
        featuresDetected.push(`包含 ${data.messages.length} 条完整对话`);
      }
      if (Array.isArray(data.groupChats) || Array.isArray(data.groups)) {
        const grps = data.groupChats || data.groups;
        groups.push(...grps);
        featuresDetected.push(`包含 ${grps.length} 个群聊空间`);
      }
      if (data.userProfile || data.settings || data.apiConfig || data.memos || data.worldBooks) {
        settings = {
          userProfile: data.userProfile,
          settings: data.settings,
          apiConfig: data.apiConfig,
          aiControls: data.aiControls,
          permissions: data.permissions,
          memos: data.memos,
          worldBooks: data.worldBooks,
          menstrualData: data.menstrualData,
        };
        featuresDetected.push('包含用户资料、API密钥与系统偏好');
      }

      analysisSummary = `精准识别出全量备份文件，涵盖通讯录、聊天记忆及系统偏好。`;
      actionSuggestion = '推荐选择「⚡ 智能合并」一键恢复或更新本地数据。';
    } else if (Array.isArray(data)) {
      // === Case Array of items ===
      confidence = 90;
      if (data.length > 0) {
        const first = data[0];
        if (first.persona || first.char_persona || first.greeting || first.wxid || first.name) {
          category = 'character_dossier';
          categoryLabel = 'AI 角色档案列表';
          formatSignature = 'Array<Character>';
          characters.push(...data.map(normalizeCharacterSchema));
          featuresDetected.push(`包含 ${data.length} 个角色的结构化定义`);
          analysisSummary = `识别出包含 ${data.length} 个 AI 角色的独立档案列表。`;
        } else if (first.sender || first.characterId || (first.role && first.content)) {
          category = 'chat_transcript';
          categoryLabel = '聊天消息历史序列';
          formatSignature = 'Array<ChatMessage>';
          messages.push(...data.map(normalizeChatMessageSchema));
          featuresDetected.push(`包含 ${data.length} 条聊天记录`);
          analysisSummary = `识别出包含 ${data.length} 条对话的序列记录。`;
        } else if (first.members && first.inviteCode) {
          category = 'generic';
          categoryLabel = '群聊列表定义';
          groups.push(...data);
        }
      }
    } else {
      warnings.push(`无法自动匹配 ${fileName} 的专有规范，已采用通用对象映射。`);
      confidence = 70;
      category = 'generic';
      categoryLabel = '通用结构化数据';
      formatSignature = 'Generic JSON Object';
      featuresDetected.push('未检测到专有酒馆卡或会话树签名');
      analysisSummary = '已按通用格式载入数据，建议在下方确认映射规则。';
    }
  } catch (e: any) {
    warnings.push(`JSON 格式解析错误: ${e?.message || '未知错误'}`);
    confidence = 40;
    category = 'generic';
    categoryLabel = '格式损坏或异常文件';
    formatSignature = 'Invalid JSON';
    analysisSummary = `解析异常: ${e?.message || '未知错误'}`;
  }

  return {
    characters,
    messages,
    groups,
    memories,
    settings,
    warnings,
    report: {
      confidence,
      identifiedFormat,
      category,
      categoryLabel,
      formatSignature,
      featuresDetected,
      tavernDetails,
      analysisSummary,
      actionSuggestion,
    },
  };
}

// -------------------------------------------------------------------------
// JSONL Parser
// -------------------------------------------------------------------------
function parseJsonlText(text: string, options?: ImportParseOptions) {
  const warnings: string[] = [];
  const characters: AiCharacter[] = [];
  const messages: ChatMessage[] = [];
  const groups: GroupChat[] = [];
  const memories: { characterId?: string; characterName?: string; text: string }[] = [];
  let settings: any = undefined;

  const lines = text.split('\n');
  let charLines = 0;
  let msgLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'character' || obj.persona || obj.char_name || obj.char_persona) {
        characters.push(normalizeCharacterSchema(obj.data || obj));
        charLines++;
      } else if (obj.type === 'message' || obj.sender || obj.text || (obj.role && obj.content)) {
        messages.push(normalizeChatMessageSchema(obj.data || obj));
        msgLines++;
      } else if (obj.type === 'group' || (obj.members && obj.inviteCode)) {
        groups.push(obj.data || obj);
      } else if (obj.type === 'memory' || obj.memory) {
        memories.push({
          characterId: obj.characterId,
          characterName: obj.characterName,
          text: obj.memory || obj.text || '',
        });
      } else if (obj.type === 'settings') {
        settings = obj.data || obj;
      }
    } catch (e) {
      warnings.push(`第 ${i + 1} 行 JSONL 解析错误`);
    }
  }

  const featuresDetected: string[] = [
    `有效解析 ${lines.length} 行 JSONL 流式数据`,
    `提取 ${charLines} 个角色条目、${msgLines} 条消息记录`,
  ];

  const report: Partial<FileIntelligenceReport> = {
    confidence: 93,
    identifiedFormat: 'JSONL 流式行记录数据集',
    category: charLines > msgLines ? 'character_dossier' : 'chat_transcript',
    categoryLabel: 'JSONL 流式行记录',
    formatSignature: 'application/x-jsonlines',
    featuresDetected,
    analysisSummary: `已按行解析出 ${characters.length} 个角色与 ${messages.length} 条对话。`,
    actionSuggestion: '数据已规范化，可选择目标本地角色进行导入。',
  };

  return { characters, messages, groups, memories, settings, warnings, report };
}

// -------------------------------------------------------------------------
// TXT / Markdown Deep Parser & Heuristic Dialogue Analyzer
// -------------------------------------------------------------------------
function parseTxtContent(text: string, fileName: string, options?: ImportParseOptions) {
  const warnings: string[] = [];
  const characters: AiCharacter[] = [];
  const messages: ChatMessage[] = [];
  const memories: { characterId?: string; characterName?: string; text: string }[] = [];
  const existingChars = loadCharacters();
  const currentUserProfile = loadUserProfile();

  const cleanFileName = fileName.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
  const mode = options?.recognitionMode || 'auto';

  // Heuristic Checks: Dialogue vs Character Dossier
  const lines = text.split('\n');
  let dialogueLineHits = 0;
  let dossierKeywordHits = 0;

  const dossierKeywords = ['【角色', '姓名', '名字', '性格', '人设', '背景', '设定', '开场白', '问候语', '第一句话', '长期记忆'];
  for (const kw of dossierKeywords) {
    if (text.includes(kw)) dossierKeywordHits++;
  }

  // Regex patterns for chat lines
  // Format 1: [2024-03-01 10:20:30] Sender: Message or 2024-03-01 10:20:30 Sender: Message
  const chatRegexTimestamped = /^(\[?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]\d{1,2}:\d{1,2}(?::\d{1,2})?)\]?\s*)(?:\[([^\]]+)\]|([^:：\n\r]{1,20}))[:：]\s*(.+)$/;
  // Format 2: Simple dialogue (Sender: Message)
  const chatRegexSimple = /^([^:：\n\r]{1,16})[:：]\s*(.+)$/;

  const senderCounts = new Map<string, number>();
  let earliestTime = Infinity;
  let latestTime = -Infinity;

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) continue;

    const m1 = l.match(chatRegexTimestamped);
    if (m1) {
      dialogueLineHits++;
      const s = (m1[3] || m1[4] || '').trim();
      if (s) senderCounts.set(s, (senderCounts.get(s) || 0) + 1);
      if (m1[2]) {
        const t = Date.parse(m1[2].replace(/\./g, '-'));
        if (!isNaN(t)) {
          if (t < earliestTime) earliestTime = t;
          if (t > latestTime) latestTime = t;
        }
      }
      continue;
    }

    const m2 = l.match(chatRegexSimple);
    if (m2 && !l.startsWith('http') && !l.includes('：') === false) {
      const s = m2[1].trim();
      if (s.length <= 15 && !dossierKeywords.some((k) => s.includes(k))) {
        dialogueLineHits++;
        senderCounts.set(s, (senderCounts.get(s) || 0) + 1);
      }
    }
  }

  // Determine whether this text is predominantly a Dialogue Stream or a Character Dossier
  const isDialogue =
    mode === 'chat_transcript' ||
    (mode !== 'character_dossier' && dialogueLineHits >= 3 && dialogueLineHits > dossierKeywordHits * 1.5);

  let detectedCharId = 'char_txt_' + Date.now();
  const matchedCharByFile = existingChars.find((c) => cleanFileName.includes(c.name));
  let detectedCharName = matchedCharByFile ? matchedCharByFile.name : (cleanFileName || '导入角色');

  const featuresDetected: string[] = [];
  let turnStats: any = undefined;

  if (isDialogue) {
    // === Parse as Chat Transcript ===
    featuresDetected.push(`匹配到 ${dialogueLineHits} 轮对话语句`);

    // Classify user vs AI among senders
    const participantsList: {
      name: string;
      isAi: boolean;
      count: number;
      percentage: number;
      matchedLocalName?: string;
    }[] = [];

    const totalLines = Array.from(senderCounts.values()).reduce((a, b) => a + b, 0) || 1;

    for (const [senderName, count] of senderCounts.entries()) {
      const isUser =
        senderName === (currentUserProfile.name || '').trim() ||
        senderName.includes('我') ||
        senderName.toLowerCase().includes('user') ||
        senderName.toLowerCase().includes('me') ||
        senderName.includes('用户');

      let matchedLocalName: string | undefined;
      if (!isUser) {
        const local = existingChars.find((c) =>
          c.name.trim().toLowerCase() === senderName.trim().toLowerCase() ||
          (options?.fuzzyNameMatch && (c.name.includes(senderName) || senderName.includes(c.name)))
        );
        if (local) matchedLocalName = local.name;
      }

      participantsList.push({
        name: senderName,
        isAi: !isUser,
        count,
        percentage: Math.round((count / totalLines) * 100),
        matchedLocalName,
      });
    }

    // Sort by count descending
    participantsList.sort((a, b) => b.count - a.count);

    // Primary AI sender is the highest count non-user participant
    const primaryAi = participantsList.find((p) => p.isAi);
    if (primaryAi) {
      detectedCharName = primaryAi.name;
      if (primaryAi.matchedLocalName) {
        featuresDetected.push(`识别出主要对话角色: 「${primaryAi.name}」已精准匹配本地「${primaryAi.matchedLocalName}」`);
      } else {
        featuresDetected.push(`识别出主要对话角色: 「${primaryAi.name}」(${primaryAi.count} 条发言)`);
      }
    }

    let timeSpanStr: string | undefined;
    if (earliestTime < Infinity && latestTime > -Infinity) {
      timeSpanStr = `${new Date(earliestTime).toLocaleDateString()} 至 ${new Date(latestTime).toLocaleDateString()}`;
      featuresDetected.push(`会话时间跨度: ${timeSpanStr}`);
    }

    turnStats = {
      totalDialogueLines: dialogueLineHits,
      participants: participantsList,
      timeSpan: timeSpanStr,
    };

    // Extract message objects
    let currentMsg: (ChatMessage & { rawSenderName?: string }) | null = null;
    let parsedMsgCount = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const m1 = line.match(chatRegexTimestamped);
      const m2 = line.match(chatRegexSimple);

      if (m1 || (m2 && !line.startsWith('http') && !dossierKeywords.some((k) => m2[1].includes(k)))) {
        if (currentMsg) messages.push(currentMsg);

        const senderName = (m1 ? m1[3] || m1[4] : m2![1]).trim();
        const content = (m1 ? m1[5] : m2![2]).trim();

        const isUser =
          senderName === (currentUserProfile.name || '').trim() ||
          senderName.includes('我') ||
          senderName.toLowerCase().includes('user') ||
          senderName.toLowerCase().includes('me') ||
          senderName.includes('用户');

        let timestamp = Date.now();
        if (m1 && m1[2]) {
          const parsed = Date.parse(m1[2].replace(/\./g, '-'));
          if (!isNaN(parsed)) timestamp = parsed;
        }

        currentMsg = {
          id: 'msg_txt_' + Date.now() + '_' + parsedMsgCount++,
          characterId: detectedCharId,
          sender: isUser ? 'user' : 'ai',
          text: content,
          timestamp,
          rawSenderName: isUser ? undefined : senderName,
        };
      } else if (currentMsg) {
        currentMsg.text += '\n' + line;
      }
    }

    if (currentMsg) messages.push(currentMsg);

    // Create / anchor character entry
    const localMatched = existingChars.find((c) =>
      c.name.trim().toLowerCase() === detectedCharName.trim().toLowerCase() ||
      (options?.fuzzyNameMatch && (c.name.includes(detectedCharName) || detectedCharName.includes(c.name)))
    );

    const assignedCharId = localMatched ? localMatched.id : detectedCharId;
    for (const m of messages) {
      m.characterId = assignedCharId;
    }

    characters.push({
      id: assignedCharId,
      name: detectedCharName,
      wxid: localMatched?.wxid || 'chat_' + Math.random().toString(36).slice(2, 6),
      avatar: localMatched?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      persona: localMatched?.persona || `从聊天记录文本 [${cleanFileName}] 智能分析提取的对话角色。`,
      greeting: messages[0]?.text || '你好呀！很高兴认识你~',
      memories: [],
      tags: ['聊天记录', '文本分析'],
      isLocked: false,
      isCustom: true,
    });
  } else {
    // === Parse as Character Profile / Dossier ===
    featuresDetected.push('识别为角色设定与人设档案文本');
    let detectedPersona = '';
    let detectedGreeting = '你好！很高兴遇见你。';
    const detectedMemories: string[] = [];

    let readingMemories = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('名称：') || trimmed.startsWith('名字：') || trimmed.startsWith('角色：') || trimmed.startsWith('姓名：')) {
        detectedCharName = trimmed.replace(/^[^：:]*[：:]\s*/, '').trim();
      } else if (trimmed.startsWith('人设：') || trimmed.startsWith('背景：') || trimmed.startsWith('设定：') || trimmed.startsWith('简介：') || trimmed.startsWith('性格：')) {
        detectedPersona += trimmed.replace(/^[^：:]*[：:]\s*/, '').trim() + ' ';
      } else if (trimmed.startsWith('问候：') || trimmed.startsWith('问候语：') || trimmed.startsWith('第一句话：') || trimmed.startsWith('开场白：')) {
        detectedGreeting = trimmed.replace(/^[^：:]*[：:]\s*/, '').trim();
      } else if (trimmed.includes('记忆') || trimmed.includes('长期记忆') || trimmed.includes('喜好') || trimmed.includes('经历')) {
        readingMemories = true;
      } else if (readingMemories && (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•') || /^\d+\./.test(trimmed))) {
        const memClean = trimmed.replace(/^[-*•\d.]\s*/, '').trim();
        if (memClean) detectedMemories.push(memClean);
      }
    }

    if (!detectedPersona) {
      detectedPersona = text.slice(0, 300);
    }

    featuresDetected.push(`提取角色姓名: 「${detectedCharName}」`);
    if (detectedMemories.length > 0) {
      featuresDetected.push(`提取出 ${detectedMemories.length} 条设定记忆点`);
    }

    const localMatch = existingChars.find((c) =>
      c.name.trim().toLowerCase() === detectedCharName.trim().toLowerCase() ||
      (options?.fuzzyNameMatch && (c.name.includes(detectedCharName) || detectedCharName.includes(c.name)))
    );

    characters.push({
      id: localMatch ? localMatch.id : detectedCharId,
      name: detectedCharName,
      wxid: localMatch?.wxid || 'ai_' + Math.random().toString(36).slice(2, 6),
      avatar: localMatch?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      persona: detectedPersona.trim(),
      greeting: detectedGreeting,
      memories: detectedMemories,
      tags: ['人设档案', '文本解析'],
      isLocked: false,
      isCustom: true,
    });
  }

  const confidence = isDialogue ? (dialogueLineHits >= 10 ? 95 : 88) : 90;
  const report: Partial<FileIntelligenceReport> = {
    confidence,
    identifiedFormat: isDialogue ? '微信 / QQ 标准对话转录文本' : 'Markdown / 角色人设档案文档',
    category: isDialogue ? 'chat_transcript' : 'character_dossier',
    categoryLabel: isDialogue ? '聊天记录会话流' : '角色人设档案',
    formatSignature: isDialogue ? `对话语句 (${dialogueLineHits} 轮)` : '结构化人设段落',
    featuresDetected,
    turnStats,
    analysisSummary: isDialogue
      ? `准确剖析出与「${detectedCharName}」的 ${messages.length} 条对话流。`
      : `准确提炼出「${detectedCharName}」的角色人设背景与设定记忆。`,
    actionSuggestion: isDialogue
      ? '已自动与本地同名角色比对，点击合并即可增量追加聊天记录。'
      : '可直接存入通讯录作为全新 AI 或更新已有角色的设定。',
  };

  return { characters, messages, memories, warnings, report };
}

// -------------------------------------------------------------------------
// Normalizer Helpers
// -------------------------------------------------------------------------
function normalizeCharacterSchema(raw: any): AiCharacter {
  return {
    id: raw.id || 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: raw.name || raw.char_name || raw.characterName || '未命名AI',
    wxid: raw.wxid || raw.handle || 'ai_' + Math.random().toString(36).slice(2, 7),
    relationship: raw.relationship || '好友',
    avatar:
      raw.avatar ||
      raw.avatarUrl ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    persona: raw.persona || raw.description || raw.char_persona || '贴心温暖的AI好友。',
    personality: raw.personality || raw.personalityTraits || '温柔、细致',
    greeting: raw.greeting || raw.first_mes || '你好呀！很高兴认识你~',
    memories: Array.isArray(raw.memories) ? raw.memories : [],
    tags: Array.isArray(raw.tags) ? raw.tags : ['导入角色'],
    isLocked: !!raw.isLocked,
    isCustom: true,
    customBackground: raw.customBackground,
    modelConfig: raw.modelConfig,
    menstrualCare: raw.menstrualCare || { enabled: true, notificationFrequency: 'daily' },
  };
}

function normalizeTavernCharacter(rawCard: any): {
  character: AiCharacter;
  extractedMemories: string[];
  features: string[];
  tavernMeta: any;
} {
  const d = rawCard.data || rawCard;
  const spec = rawCard.spec || d.spec || (d.character_book ? 'chara_card_v2' : 'chara_card_v1');
  const name = (d.name || d.char_name || '酒馆角色').trim();
  const persona = (d.description || d.char_persona || d.persona || '').trim();
  const greeting = (d.first_mes || d.greeting || '你好！很高兴认识你~').trim();
  const personality = (d.personality || '').trim();
  const avatar =
    d.avatar ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';

  const extractedMemories: string[] = [];
  const features: string[] = [];

  features.push(`规范: ${spec}`);

  if (d.scenario) {
    extractedMemories.push(`[场景剧情设定] ${d.scenario}`);
    features.push('包含场景剧情设定');
  }

  if (d.system_prompt) {
    extractedMemories.push(`[系统指令预设] ${d.system_prompt}`);
    features.push('包含专用系统指令 (System Prompt)');
  }

  if (d.post_history_instructions) {
    extractedMemories.push(`[回复指引] ${d.post_history_instructions}`);
  }

  // Alternate Greetings
  let alternateGreetingsCount = 0;
  if (Array.isArray(d.alternate_greetings) && d.alternate_greetings.length > 0) {
    alternateGreetingsCount = d.alternate_greetings.length;
    features.push(`包含 ${alternateGreetingsCount} 组备选问候语`);
    d.alternate_greetings.forEach((g: string, idx: number) => {
      if (typeof g === 'string' && g.trim()) {
        extractedMemories.push(`[备选问候语 #${idx + 1}] ${g.trim()}`);
      }
    });
  }

  // Character Book / Lorebook
  let characterBookEntriesCount = 0;
  const charBook = d.character_book || rawCard.character_book;
  if (charBook && Array.isArray(charBook.entries) && charBook.entries.length > 0) {
    characterBookEntriesCount = charBook.entries.length;
    features.push(`包含世界书知识库 (${characterBookEntriesCount} 条核心条目)`);
    for (const entry of charBook.entries) {
      const keys = Array.isArray(entry.keys) ? entry.keys.join('/') : (entry.key || '');
      const comment = entry.comment || entry.name || keys || '背景设定';
      const content = entry.content || '';
      if (content.trim()) {
        extractedMemories.push(`[世界书·${comment}] ${content.trim()}`);
      }
    }
  }

  if (d.mes_example) {
    features.push('包含角色对话示范范例');
    extractedMemories.push(`[对话示范范例] ${d.mes_example}`);
  }

  if (d.creator_notes) {
    extractedMemories.push(`[创作者寄语] ${d.creator_notes}`);
  }

  const character: AiCharacter = {
    id: 'char_tavern_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name,
    wxid: 'tavern_' + Math.random().toString(36).slice(2, 6),
    avatar,
    persona: persona || '来自 SillyTavern/酒馆规范的角色设定。',
    personality,
    greeting,
    memories: extractedMemories,
    tags: ['酒馆卡', spec.includes('v2') ? 'Card V2' : 'Card V1'],
    isLocked: false,
    isCustom: true,
  };

  return {
    character,
    extractedMemories,
    features,
    tavernMeta: {
      spec,
      hasCharacterBook: characterBookEntriesCount > 0,
      characterBookEntriesCount,
      alternateGreetingsCount,
      hasScenario: !!d.scenario,
    },
  };
}

function normalizeChatMessageSchema(raw: any): ChatMessage {
  const sender = raw.sender === 'ai' || raw.role === 'assistant' || raw.isAi ? 'ai' : 'user';
  return {
    id: raw.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    characterId: raw.characterId || 'char_1',
    sender,
    text: raw.text || raw.content || '',
    timestamp: raw.timestamp || raw.time || Date.now(),
    thinkingProcess: raw.thinkingProcess || raw.reasoning || undefined,
    quoteMessageId: raw.quoteMessageId,
  };
}

// =========================================================================
// 4. Import Execution Engine (Conflict Resolution, Deduplication & Atomic Safe Write)
// =========================================================================

export async function executeImport(
  parsed: ImportParsedResult,
  options: ImportExecutionOptions
): Promise<{
  success: boolean;
  importedCharacterCount: number;
  importedMessageCount: number;
  importedGroupCount: number;
  importedMemoryCount: number;
  snapshotId: string;
}> {
  // 1. Automatically create safety snapshot before any write
  const snapshot = await createDataSnapshot(`导入文件: ${parsed.fileName}`);

  try {
    const existingChars = loadCharacters();
    const existingGroups = loadGroupChats();
    const existingMessages = await getAllChatMessages();

    // Map of old characterId -> new resolved characterId
    const charIdMapping = new Map<string, string>();
    const finalChars: AiCharacter[] = [...existingChars];

    let importedCharacterCount = 0;
    let importedMemoryCount = 0;

    // Handle unified target character if requested by user
    const isUnifiedMode = !!options.unifiedTargetCharacterId && options.unifiedTargetCharacterId !== '__NONE__';
    let unifiedLocalChar: AiCharacter | undefined;

    if (isUnifiedMode) {
      if (options.unifiedTargetCharacterId === '__CREATE_NEW__') {
        const firstChar = parsed.characters[0];
        const newId = 'char_uni_' + Date.now();
        const baseName = firstChar ? firstChar.name : (parsed.fileName?.replace(/\.[^/.]+$/, '') || '统一归入角色');
        unifiedLocalChar = {
          id: newId,
          name: baseName,
          wxid: 'ai_uni_' + Math.random().toString(36).slice(2, 6),
          avatar: firstChar?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
          persona: firstChar?.persona || '统一归入导入的对话角色。',
          greeting: firstChar?.greeting || '你好！',
          memories: [],
          tags: ['统一归入'],
          isLocked: false,
          isCustom: true,
        };
        finalChars.push(unifiedLocalChar);
        importedCharacterCount++;
      } else {
        unifiedLocalChar = finalChars.find((c) => c.id === options.unifiedTargetCharacterId);
      }
    }

    if (options.importCharacters) {
      for (const incChar of parsed.characters) {
        // If user filtered specific characters, respect selection
        if (options.selectedCharacterIds && !options.selectedCharacterIds.includes(incChar.id)) {
          continue;
        }

        // If unified mode is active, directly map to the unified target
        if (isUnifiedMode && unifiedLocalChar) {
          const explicitTarget = options.characterMapping ? options.characterMapping[incChar.id] : undefined;
          if (explicitTarget === '__SKIP__') {
            charIdMapping.set(incChar.id, '__SKIP__');
            continue;
          }
          charIdMapping.set(incChar.id, unifiedLocalChar.id);
          const targetIndex = finalChars.findIndex((c) => c.id === unifiedLocalChar!.id);
          if (targetIndex !== -1) {
            const existing = finalChars[targetIndex];
            const mergedMemories = deduplicateMemories(existing.memories, incChar.memories);
            finalChars[targetIndex] = {
              ...existing,
              persona: existing.persona || incChar.persona,
              personality: existing.personality || incChar.personality,
              greeting: existing.greeting || incChar.greeting,
              memories: mergedMemories,
              tags: Array.from(new Set([...(existing.tags || []), ...(incChar.tags || [])])),
            };
            importedMemoryCount += mergedMemories.length - (existing.memories?.length || 0);
          }
          continue;
        }

        // 1. Check user-defined character mapping if provided
        const explicitTarget = options.characterMapping ? options.characterMapping[incChar.id] : undefined;

        if (explicitTarget === '__SKIP__') {
          charIdMapping.set(incChar.id, '__SKIP__');
          continue;
        }

        if (explicitTarget === '__CREATE_NEW__') {
          // Explicitly requested to create as a new AI character
          const newId = 'char_imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          const nameExists = finalChars.some((c) => c.name.trim().toLowerCase() === incChar.name.trim().toLowerCase());
          const newChar: AiCharacter = {
            ...incChar,
            id: newId,
            name: nameExists ? `${incChar.name} (新)` : incChar.name,
            wxid: (incChar.wxid || 'ai') + '_new',
            isCustom: true,
          };
          finalChars.push(newChar);
          charIdMapping.set(incChar.id, newId);
          importedCharacterCount++;
          importedMemoryCount += newChar.memories?.length || 0;
          continue;
        }

        // 2. Identify target character: either explicit target or automatic matching by character name
        let targetLocalChar: AiCharacter | undefined;
        if (explicitTarget && explicitTarget !== '__CREATE_NEW__') {
          targetLocalChar = finalChars.find((c) => c.id === explicitTarget);
        } else {
          // Automatic matching by name first, then ID or WXID
          targetLocalChar =
            finalChars.find((c) => c.name.trim().toLowerCase() === incChar.name.trim().toLowerCase()) ||
            finalChars.find((c) => c.id === incChar.id) ||
            (incChar.wxid ? finalChars.find((c) => c.wxid === incChar.wxid) : undefined);
        }

        if (!targetLocalChar) {
          // No match -> Append directly as new character
          finalChars.push(incChar);
          charIdMapping.set(incChar.id, incChar.id);
          importedCharacterCount++;
          importedMemoryCount += incChar.memories?.length || 0;
        } else {
          // Match found -> Resolve according to conflictStrategy
          const targetIndex = finalChars.findIndex((c) => c.id === targetLocalChar!.id);

          if (options.conflictStrategy === 'merge') {
            if (targetIndex !== -1) {
              const existing = finalChars[targetIndex];
              const mergedMemories = deduplicateMemories(existing.memories, incChar.memories);
              const merged: AiCharacter = {
                ...existing,
                persona: existing.persona || incChar.persona,
                personality: existing.personality || incChar.personality,
                greeting: existing.greeting || incChar.greeting,
                memories: mergedMemories,
                tags: Array.from(new Set([...(existing.tags || []), ...(incChar.tags || [])])),
              };
              finalChars[targetIndex] = merged;
              charIdMapping.set(incChar.id, existing.id);
              importedMemoryCount += mergedMemories.length - (existing.memories?.length || 0);
            }
          } else if (options.conflictStrategy === 'keep_existing') {
            // Keep existing character intact, merge new memories without overwriting persona
            if (targetIndex !== -1) {
              const existing = finalChars[targetIndex];
              const mergedMemories = deduplicateMemories(existing.memories, incChar.memories);
              finalChars[targetIndex] = {
                ...existing,
                memories: mergedMemories,
              };
              importedMemoryCount += mergedMemories.length - (existing.memories?.length || 0);
            }
            charIdMapping.set(incChar.id, targetLocalChar.id);
          } else if (options.conflictStrategy === 'import_as_new') {
            // Generate new ID and distinct name
            const newId = 'char_imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            const newChar: AiCharacter = {
              ...incChar,
              id: newId,
              name: `${incChar.name} (导入)`,
              wxid: (incChar.wxid || 'ai') + '_new',
              isCustom: true,
            };
            finalChars.push(newChar);
            charIdMapping.set(incChar.id, newId);
            importedCharacterCount++;
            importedMemoryCount += newChar.memories?.length || 0;
          }
        }
      }

      // Save Characters
      saveCharacters(finalChars);
    }

    // 2. Import Standalone Memories
    if (options.importMemories && parsed.memories.length > 0) {
      for (const mem of parsed.memories) {
        // Resolve target character ID by unified mode, mapping, or character name
        let targetId: string | undefined = isUnifiedMode && unifiedLocalChar
          ? unifiedLocalChar.id
          : (mem.characterId ? charIdMapping.get(mem.characterId) || mem.characterId : undefined);
        if ((!targetId || targetId === '__SKIP__') && mem.characterName) {
          const match = finalChars.find((c) => c.name.trim().toLowerCase() === mem.characterName!.trim().toLowerCase());
          if (match) targetId = match.id;
        }
        if (!targetId || targetId === '__SKIP__') {
          targetId = finalChars[0]?.id;
        }

        if (targetId && targetId !== '__SKIP__') {
          const idx = finalChars.findIndex((c) => c.id === targetId);
          if (idx !== -1) {
            const cur = finalChars[idx];
            if (!cur.memories?.includes(mem.text)) {
              finalChars[idx] = {
                ...cur,
                memories: [...(cur.memories || []), mem.text],
              };
              importedMemoryCount++;
            }
          }
        }
      }
      saveCharacters(finalChars);
    }

    // 3. Import Chat Messages
    let importedMessageCount = 0;
    if (options.importMessages && parsed.messages.length > 0) {
      const mappedMessages: ChatMessage[] = [];

      for (const m of parsed.messages) {
        let targetCharId = isUnifiedMode && unifiedLocalChar
          ? unifiedLocalChar.id
          : (charIdMapping.get(m.characterId) || m.characterId);
        if (targetCharId === '__SKIP__') continue;

        // If target ID not found in finalChars, attempt name lookup
        if (!finalChars.some((c) => c.id === targetCharId)) {
          const rawName = (m as any).characterName || (m as any).rawSenderName;
          if (rawName) {
            const found = finalChars.find((c) => c.name.trim().toLowerCase() === rawName.trim().toLowerCase());
            if (found) targetCharId = found.id;
          }
        }

        if (!finalChars.some((c) => c.id === targetCharId)) {
          targetCharId = finalChars[0]?.id || 'char_1';
        }

        mappedMessages.push({
          ...m,
          characterId: targetCharId,
        });
      }

      const dedupedMessages = deduplicateMessages(existingMessages, mappedMessages);
      if (dedupedMessages.length > 0) {
        await saveChatMessagesBulk(dedupedMessages);
        importedMessageCount = dedupedMessages.length;
      }
    }

    // 4. Import Group Chats
    let importedGroupCount = 0;
    if (options.importGroups && parsed.groups.length > 0) {
      const groupMap = new Map<string, GroupChat>();
      for (const g of existingGroups) groupMap.set(g.id, g);

      for (const incGroup of parsed.groups) {
        if (!groupMap.has(incGroup.id)) {
          groupMap.set(incGroup.id, incGroup);
          importedGroupCount++;
        } else {
          // Merge group messages
          const existingG = groupMap.get(incGroup.id)!;
          const mergedMsgs = [...(existingG.messages || [])];
          const existingMsgIds = new Set(mergedMsgs.map((m) => m.id));

          for (const gm of incGroup.messages || []) {
            if (!existingMsgIds.has(gm.id)) {
              mergedMsgs.push(gm);
            }
          }
          groupMap.set(incGroup.id, {
            ...existingG,
            messages: mergedMsgs,
          });
        }
      }
      saveGroupChats(Array.from(groupMap.values()));
    }

    // 5. Import System Settings & User Profile if present
    if (options.importSettings && parsed.settings) {
      const s = parsed.settings;
      if (s.settings) saveSettings({ ...loadSettings(), ...s.settings });
      if (s.userProfile) saveUserProfile({ ...loadUserProfile(), ...s.userProfile });
      if (s.menstrualData) saveMenstrualData({ ...loadMenstrualData(), ...s.menstrualData });
      if (s.apiConfig) saveApiConfig({ ...loadApiConfig(), ...s.apiConfig });
      if (s.aiControls) saveAiControls({ ...loadAiControls(), ...s.aiControls });
      if (s.permissions) savePermissions({ ...loadPermissions(), ...s.permissions });
      if (Array.isArray(s.memos)) saveMemos([...loadMemos(), ...s.memos]);
      if (Array.isArray(s.worldBooks)) saveWorldBooks([...loadWorldBooks(), ...s.worldBooks]);
    }

    return {
      success: true,
      importedCharacterCount,
      importedMessageCount,
      importedGroupCount,
      importedMemoryCount,
      snapshotId: snapshot.id,
    };
  } catch (err: any) {
    console.error('Import execution error, attempting automatic rollback...', err);
    try {
      await restoreDataSnapshot(snapshot.id);
    } catch (rbErr) {
      console.error('Rollback failed:', rbErr);
    }
    throw new Error(`写入导入数据失败，已自动恢复至备份状态: ${err?.message || '未知错误'}`);
  }
}

// =========================================================================
// 5. Export Engine (JSON, JSONL, TXT, ZIP)
// =========================================================================

export async function exportData(options: ExportOptions): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const isAll = options.categories.includes('all');
  const includeChars = isAll || options.categories.includes('characters');
  const includeMsgs = isAll || options.categories.includes('messages');
  const includeMemories = isAll || options.categories.includes('memories');
  const includeGroups = isAll || options.categories.includes('groups');
  const includeSettings = isAll || options.categories.includes('settings');

  // Load Source Data
  let allChars = loadCharacters();
  if (options.characterIds && options.characterIds.length > 0) {
    allChars = allChars.filter((c) => options.characterIds!.includes(c.id));
  }

  const allMsgs = await getAllChatMessages();
  const filteredMsgs =
    options.characterIds && options.characterIds.length > 0
      ? allMsgs.filter((m) => options.characterIds!.includes(m.characterId))
      : allMsgs;

  const allGroups = loadGroupChats();
  const settings = loadSettings();
  const userProfile = loadUserProfile();
  const menstrualData = loadMenstrualData();
  const apiConfig = loadApiConfig();
  const aiControls = loadAiControls();
  const permissions = loadPermissions();
  const memos = loadMemos();
  const worldBooks = loadWorldBooks();

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().slice(0, 10);

  // 1. ZIP Export
  if (options.format === 'zip') {
    const zip = new JSZip();

    const manifest = {
      app: 'VirtualPhoneSim',
      exportVersion: '2.0.0',
      exportedAt: new Date(timestamp).toISOString(),
      scope: options.categories,
      characterCount: includeChars ? allChars.length : 0,
      messageCount: includeMsgs ? filteredMsgs.length : 0,
      groupCount: includeGroups ? allGroups.length : 0,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    if (includeChars) {
      zip.file('characters.json', JSON.stringify(allChars, null, 2));
    }

    if (includeGroups) {
      zip.file('groups.json', JSON.stringify(allGroups, null, 2));
    }

    if (includeSettings) {
      const settingsDump = {
        settings,
        userProfile,
        menstrualData,
        apiConfig,
        aiControls,
        permissions,
        memos,
        worldBooks,
      };
      zip.file('settings.json', JSON.stringify(settingsDump, null, 2));
    }

    if (includeMsgs) {
      const msgFolder = zip.folder('messages');
      if (msgFolder) {
        msgFolder.file('all_messages.json', JSON.stringify(filteredMsgs, null, 2));

        // Also split by character for ease of manual reading
        for (const char of allChars) {
          const charMsgs = filteredMsgs.filter((m) => m.characterId === char.id);
          if (charMsgs.length > 0) {
            msgFolder.file(`${char.name}_${char.id}_messages.json`, JSON.stringify(charMsgs, null, 2));
          }
        }
      }
    }

    if (includeMemories) {
      const memFolder = zip.folder('memories');
      if (memFolder) {
        for (const char of allChars) {
          if (char.memories && char.memories.length > 0) {
            const memText = `【${char.name} 的长期记忆库】\n\n` + char.memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
            memFolder.file(`${char.name}_memories.txt`, memText);
          }
        }
      }
    }

    // Full backup bundle for instant restore
    const fullBackup = {
      manifest,
      characters: includeChars ? allChars : undefined,
      messages: includeMsgs ? filteredMsgs : undefined,
      groups: includeGroups ? allGroups : undefined,
      userProfile: includeSettings ? userProfile : undefined,
      settings: includeSettings ? settings : undefined,
      apiConfig: includeSettings ? apiConfig : undefined,
      aiControls: includeSettings ? aiControls : undefined,
      permissions: includeSettings ? permissions : undefined,
      memos: includeSettings ? memos : undefined,
      worldBooks: includeSettings ? worldBooks : undefined,
      menstrualData: includeSettings ? menstrualData : undefined,
    };
    zip.file('backup.json', JSON.stringify(fullBackup, null, 2));

    // README file
    const readme = `=== 数据备份包说明 ===\n导出时间: ${new Date(timestamp).toLocaleString()}\n包含模块: ${options.categories.join(', ')}\n\n此 ZIP 压缩包可直接在本 App 的「数据管理 -> 导入数据」中选择导入，完整恢复所有角色、聊天与设定。`;
    zip.file('README.txt', readme);

    const blob = await zip.generateAsync({ type: 'blob' });
    return {
      blob,
      fileName: `phone_data_backup_${dateStr}.zip`,
      mimeType: 'application/zip',
    };
  }

  // 2. JSONL Export
  if (options.format === 'jsonl') {
    const lines: string[] = [];

    lines.push(
      JSON.stringify({
        type: 'manifest',
        app: 'VirtualPhoneSim',
        exportedAt: new Date(timestamp).toISOString(),
        categories: options.categories,
      })
    );

    if (includeChars) {
      for (const c of allChars) {
        lines.push(JSON.stringify({ type: 'character', data: c }));
      }
    }

    if (includeMsgs) {
      for (const m of filteredMsgs) {
        lines.push(JSON.stringify({ type: 'message', data: m }));
      }
    }

    if (includeGroups) {
      for (const g of allGroups) {
        lines.push(JSON.stringify({ type: 'group', data: g }));
      }
    }

    if (includeSettings) {
      lines.push(
        JSON.stringify({
          type: 'settings',
          data: {
            settings,
            userProfile,
            menstrualData,
            apiConfig,
            aiControls,
            permissions,
            memos,
            worldBooks,
          },
        })
      );
    }

    const blob = new Blob([lines.join('\n')], { type: 'application/x-jsonlines;charset=utf-8' });
    return {
      blob,
      fileName: `phone_data_${dateStr}.jsonl`,
      mimeType: 'application/x-jsonlines',
    };
  }

  // 3. TXT Export
  if (options.format === 'txt') {
    const sections: string[] = [];

    sections.push(`========================================`);
    sections.push(`📱 手机模拟器 数据导出报告`);
    sections.push(`导出时间: ${new Date(timestamp).toLocaleString()}`);
    sections.push(`导出模块: ${options.categories.join(', ')}`);
    sections.push(`========================================\n`);

    if (includeChars) {
      sections.push(`【AI 角色列表】(共 ${allChars.length} 个角色)`);
      for (const c of allChars) {
        sections.push(`----------------------------------------`);
        sections.push(`名称: ${c.name}`);
        sections.push(`微信号: ${c.wxid || '无'}`);
        sections.push(`关系/身份: ${c.relationship || '好友'}`);
        sections.push(`人设背景: ${c.persona}`);
        if (c.personality) sections.push(`性格特征: ${c.personality}`);
        if (c.greeting) sections.push(`初始问候: ${c.greeting}`);
        if (includeMemories && c.memories && c.memories.length > 0) {
          sections.push(`长期记忆库:`);
          c.memories.forEach((m, idx) => sections.push(`  ${idx + 1}. ${m}`));
        }
      }
      sections.push('\n');
    }

    if (includeGroups) {
      sections.push(`【群聊列表】(共 ${allGroups.length} 个群聊)`);
      for (const g of allGroups) {
        sections.push(`----------------------------------------`);
        sections.push(`群名称: ${g.name}`);
        sections.push(`群成员数: ${g.members?.length || 0}`);
        sections.push(`群公告: ${g.notice || '暂无'}`);
      }
      sections.push('\n');
    }

    if (includeMsgs) {
      sections.push(`【聊天记录全文】(共 ${filteredMsgs.length} 条)`);
      for (const char of allChars) {
        const charMsgs = filteredMsgs.filter((m) => m.characterId === char.id);
        if (charMsgs.length > 0) {
          sections.push(`\n>>> 与「${char.name}」的对话记录 (${charMsgs.length} 条) <<<`);
          for (const m of charMsgs) {
            const timeStr = new Date(m.timestamp).toLocaleString();
            const sender = m.sender === 'user' ? (userProfile.name || '我') : char.name;
            sections.push(`[${timeStr}] ${sender}: ${m.text}`);
            if (options.includeThinkingProcess && m.thinkingProcess) {
              sections.push(`  (🧠 推理过程: ${m.thinkingProcess.replace(/\n/g, ' ')})`);
            }
          }
        }
      }
      sections.push('\n');
    }

    const blob = new Blob([sections.join('\n')], { type: 'text/plain;charset=utf-8' });
    return {
      blob,
      fileName: `phone_data_transcript_${dateStr}.txt`,
      mimeType: 'text/plain',
    };
  }

  // 4. Default JSON Export
  const fullBackupData = {
    app: 'VirtualPhoneSim',
    schemaVersion: 2,
    exportedAt: new Date(timestamp).toISOString(),
    categories: options.categories,
    characters: includeChars ? allChars : undefined,
    messages: includeMsgs ? filteredMsgs : undefined,
    groups: includeGroups ? allGroups : undefined,
    userProfile: includeSettings ? userProfile : undefined,
    settings: includeSettings ? settings : undefined,
    apiConfig: includeSettings ? apiConfig : undefined,
    aiControls: includeSettings ? aiControls : undefined,
    permissions: includeSettings ? permissions : undefined,
    memos: includeSettings ? memos : undefined,
    worldBooks: includeSettings ? worldBooks : undefined,
    menstrualData: includeSettings ? menstrualData : undefined,
  };

  const jsonStr = JSON.stringify(fullBackupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  return {
    blob,
    fileName: `phone_backup_${dateStr}.json`,
    mimeType: 'application/json',
  };
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
