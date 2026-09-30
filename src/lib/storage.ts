import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import {
  AppId,
  ThemeId,
  WallpaperSource,
  AiCharacter,
  ChatMessage,
  MomentPost,
  UserProfile,
  MenstrualData,
  Memo,
  ApiLog,
  AiPermissions,
  ApiConfig,
  SingleApiConfig,
  ProviderType,
  AiControls,
  WidgetConfig,
  AppIconConfig,
  WorldBook,
  GomokuRecord,
  TicTacToeRecord,
  RpsRecord,
  RpsStats,
  TelepathyRecord,
  TelepathyCharacterStats,
  GroupChat,
  GroupMember,
  GroupChatMessage,
  GroupJoinRequest,
} from '../types';

const STORAGE_KEYS = {
  PIN: 'phone_pin_code',
  PIN_ENABLED: 'phone_pin_enabled',
  IS_LOCKED: 'phone_is_locked',
  DESKTOP_WALLPAPER: 'phone_desktop_wallpaper',
  LOCK_WALLPAPER: 'phone_lock_wallpaper',
  CUSTOM_CSS: 'phone_custom_css',
  CHARACTERS: 'phone_ai_characters',
  MESSAGES: 'phone_chat_messages',
  MOMENTS: 'phone_moment_posts',
  USER_PROFILE: 'phone_user_profile',
  MENSTRUAL: 'phone_menstrual_data',
  MEMOS: 'phone_memos',
  WORLD_BOOKS: 'phone_world_books',
  API_LOGS: 'phone_api_logs',
  PERMISSIONS: 'phone_ai_permissions',
  TEXT_API_CONFIG: 'new_text_api_config',
  IMAGE_API_CONFIG: 'new_image_api_config',
  VOICE_API_CONFIG: 'new_voice_api_config',
  AI_CONTROLS: 'phone_ai_controls',
  LAUNCHER_PAGES: 'phone_launcher_pages_count',
  LAUNCHER_CURRENT_PAGE: 'phone_launcher_current_page',
  LAUNCHER_ICONS: 'phone_launcher_icons',
  LAUNCHER_WIDGETS: 'phone_launcher_widgets',
  GOMOKU_RECORDS: 'phone_gomoku_records',
  TICTACTOE_RECORDS: 'phone_tictactoe_records',
  RPS_RECORDS: 'phone_rps_records',
  RPS_STATS: 'phone_rps_stats',
  TELEPATHY_RECORDS: 'phone_telepathy_records',
  TELEPATHY_CHAR_STATS: 'phone_telepathy_char_stats',
  GROUP_CHATS: 'phone_group_chats',
  THEME: 'phone_global_theme',
  WALLPAPER_SOURCE: 'phone_wallpaper_source',
  CUSTOM_DESKTOP_WALLPAPER: 'phone_custom_desktop_wallpaper',
  CUSTOM_LOCK_WALLPAPER: 'phone_custom_lock_wallpaper',
};

import { CLOUD_MILK_DESKTOP_WALLPAPER, CLOUD_MILK_LOCK_WALLPAPER } from './themeWallpapers';
export { CLOUD_MILK_DESKTOP_WALLPAPER, CLOUD_MILK_LOCK_WALLPAPER };

// SVG Vector Default Avatars
export const DEFAULT_AI_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="64" fill="%23E0F2FE"/><circle cx="64" cy="64" r="54" fill="%23BAE6FD"/><path d="M64 34C65.5 48 76 58.5 90 60C76 61.5 65.5 72 64 86C62.5 72 52 61.5 38 60C52 58.5 62.5 48 64 34Z" fill="%230284C7"/><circle cx="86" cy="40" r="4" fill="%2338BDF8"/><circle cx="42" cy="80" r="3" fill="%2338BDF8"/></svg>`;

export const DEFAULT_USER_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="64" fill="%23E0F2FE"/><circle cx="64" cy="64" r="54" fill="%23BAE6FD"/><circle cx="64" cy="48" r="20" fill="%230284C7"/><path d="M36 96C36 80.536 48.536 68 64 68C79.464 68 92 80.536 92 96V98H36V96Z" fill="%230284C7"/></svg>`;

// Default Wallpapers
export const DEFAULT_DESKTOP_WALLPAPER = CLOUD_MILK_DESKTOP_WALLPAPER;
export const DEFAULT_LOCK_WALLPAPER = CLOUD_MILK_LOCK_WALLPAPER;

// Known Demo Identifiers for Purging Legacy Pre-populated Storage
const PRESET_DEMO_CHARACTER_IDS = new Set(['char_1', 'char_2', 'char_3']);
const PRESET_DEMO_GROUP_IDS = new Set(['group_default_1']);
const PRESET_DEMO_MOMENT_IDS = new Set(['post_1']);
const PRESET_DEMO_MEMO_IDS = new Set(['memo_1', 'memo_2']);
const PRESET_DEMO_WORLDBOOK_IDS = new Set(['wb_1', 'wb_2']);
const PRESET_DEMO_GAME_RECORD_IDS = new Set(['rec_1', 'rec_2', 'ttt_rec_1', 'ttt_rec_2', 'rps_rec_1', 'rps_rec_2', 'tele_rec_1']);
const PRESET_DEMO_LOG_IDS = new Set(['log_1', 'log_2', 'log_3']);

// Initial AI Characters (Empty by default for production)
const INITIAL_CHARACTERS: AiCharacter[] = [];

export function generateUserInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WX-${code}`;
}

const INITIAL_USER_PROFILE: UserProfile = {
  avatar: DEFAULT_USER_AVATAR,
  name: '我的手机',
  wxid: 'user_main',
  bio: '探索AI与生活的无限可能 ✨',
  persona: '',
  preferences: '',
  inviteCode: 'WX-8K92F1',
};

const INITIAL_MENSTRUAL_DATA: MenstrualData = {
  cycleLength: 28,
  periodDuration: 5,
  records: [],
  notes: {},
  aiAccessEnabled: true,
};

const INITIAL_MEMOS: Memo[] = [];

const INITIAL_MOMENTS: MomentPost[] = [];

const INITIAL_WORLD_BOOKS: WorldBook[] = [];

const INITIAL_ICONS: AppIconConfig[] = [
  { id: 'icon_wechat', name: '聊天', appId: 'wechat', pageIndex: 0, positionIndex: 0, builtInIcon: 'MessageCircle' },
  { id: 'icon_offline', name: '线下模式', appId: 'offline', pageIndex: 0, positionIndex: 1, builtInIcon: 'Heart' },
  { id: 'icon_weather', name: '实时天气', appId: 'weather', pageIndex: 0, positionIndex: 2, builtInIcon: 'CloudSun' },
  { id: 'icon_worldbook', name: '世界书', appId: 'worldbook', pageIndex: 0, positionIndex: 3, builtInIcon: 'BookOpen' },
  { id: 'icon_gamecenter', name: '游戏中心', appId: 'gamecenter', pageIndex: 0, positionIndex: 4, builtInIcon: 'Gamepad2' },
  { id: 'icon_menstrual', name: '经期健康', appId: 'menstrual', pageIndex: 0, positionIndex: 5, builtInIcon: 'HeartPulse' },
  { id: 'icon_memo', name: '备忘录', appId: 'memo', pageIndex: 0, positionIndex: 6, builtInIcon: 'FileText' },
  { id: 'icon_apimonitor', name: 'API 监控', appId: 'apimonitor', pageIndex: 0, positionIndex: 7, builtInIcon: 'Activity' },
  { id: 'icon_beautification', name: '界面美化', appId: 'beautification', pageIndex: 0, positionIndex: 8, builtInIcon: 'Palette' },
  { id: 'icon_settings', name: '系统设置', appId: 'settings', pageIndex: 0, positionIndex: 9, builtInIcon: 'Settings' },
  { id: 'icon_connectivity', name: '外部设备', appId: 'connectivity', pageIndex: 0, positionIndex: 10, builtInIcon: 'Link' },
  { id: 'icon_permissions', name: 'AI 权限', appId: 'permissions', pageIndex: 0, positionIndex: 11, builtInIcon: 'Shield' },
  { id: 'icon_ai_activity_logs', name: 'AI 活动记录', appId: 'ai_activity_logs', pageIndex: 0, positionIndex: 12, builtInIcon: 'FileCheck' },
];

const INITIAL_WIDGETS: WidgetConfig[] = [
  { id: 'w_weather', type: 'weather', pageIndex: 0 },
  { id: 'w_menstrual', type: 'menstrual', pageIndex: 0 },
  { id: 'w_time', type: 'time', pageIndex: 0 },
  { id: 'w_calendar', type: 'calendar', pageIndex: 0 },
  { id: 'w_memo', type: 'memo', pageIndex: 0 },
  { id: 'w_sticker', type: 'sticker', pageIndex: 0, stickerTitle: '倒计时贴纸', stickerTargetDate: '2026-12-31', stickerIsCountdown: true },
];

const INITIAL_API_LOGS: ApiLog[] = [
  {
    id: 'log_1',
    appName: '微信-AI聊天',
    timestamp: Date.now() - 1200000,
    modelName: 'gemini-3.6-flash',
    interfaceType: 'ChatGeneration',
    promptTokens: 320,
    completionTokens: 180,
    estimatedCost: 0.00025,
    purpose: '与林思微学姐对话及提取思考链',
  },
  {
    id: 'log_2',
    appName: '美化-CSS优化',
    timestamp: Date.now() - 5400000,
    modelName: 'gemini-3.6-flash',
    interfaceType: 'CodeRefactor',
    promptTokens: 650,
    completionTokens: 240,
    estimatedCost: 0.00045,
    purpose: '一键自动修复自适应CSS样式',
  },
  {
    id: 'log_3',
    appName: '经期AI主动提醒',
    timestamp: Date.now() - 86400000,
    modelName: 'gemini-3.6-flash',
    interfaceType: 'ProactiveHealthNotice',
    promptTokens: 210,
    completionTokens: 95,
    estimatedCost: 0.00015,
    purpose: 'AI读取经期小组件数据并生成关怀短文',
  },
];

const INITIAL_PERMISSIONS: AiPermissions = {
  realDevice: {
    notifications: true,
    vibration: true,
    geolocation: true,
    clipboard: true,
    microphone: true,
    wakeLock: false,
    batterySense: true,
  },
  basic: {
    location: true,
    floatingWindow: true,
    appList: true,
    gyroscope: false,
  },
  highLevel: {
    virtualAppNav: true,
    appLock: false,
    forceLockScreen: false,
  },
  appAccess: {
    menstrualData: true,
    memosData: true,
    momentsData: true,
    worldBookData: true,
    weatherData: true,
    weatherCare: true,
  },
  deviceAccess: {
    discoverDevices: false,
    viewStatus: false,
    connectDevice: false,
    controlDevice: false,
    proactiveUse: false,
  },
};

export const DEFAULT_TEXT_API_CONFIG: SingleApiConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-3.6-flash',
};

export const DEFAULT_IMAGE_API_CONFIG: SingleApiConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-3.1-flash-lite-image',
};

export const DEFAULT_VOICE_API_CONFIG: SingleApiConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-3.1-flash-tts-preview',
};

export const INITIAL_API_CONFIG: ApiConfig = {
  textApiConfig: DEFAULT_TEXT_API_CONFIG,
  imageApiConfig: DEFAULT_IMAGE_API_CONFIG,
  voiceApiConfig: DEFAULT_VOICE_API_CONFIG,
};

const INITIAL_AI_CONTROLS: AiControls = {
  backgroundActive: true,
  proactivePopups: true,
};

export interface SettingsState {
  desktopWallpaper: string;
  lockWallpaper: string;
  customCss: string;
  pinCode: string;
  isPinEnabled: boolean;
  theme: ThemeId;
  wallpaperSource: WallpaperSource;
  customDesktopWallpaper?: string;
  customLockWallpaper?: string;
}

// Generic Storage Loaders
export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to load key ${key}`, e);
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save key ${key}`, e);
  }
}

// Named Export Loader & Saver Functions for App.tsx
export const loadLauncherPagesCount = (): number => {
  const loaded = loadFromStorage<number>(STORAGE_KEYS.LAUNCHER_PAGES, 2);
  if (typeof loaded !== 'number' || loaded < 1) return 2;
  return loaded;
};

export const saveLauncherPagesCount = (count: number): void => {
  saveToStorage(STORAGE_KEYS.LAUNCHER_PAGES, count);
};

export const loadLauncherCurrentPage = (): number => {
  const loaded = loadFromStorage<number>(STORAGE_KEYS.LAUNCHER_CURRENT_PAGE, 0);
  if (typeof loaded !== 'number' || loaded < 0) return 0;
  return loaded;
};

export const saveLauncherCurrentPage = (page: number): void => {
  saveToStorage(STORAGE_KEYS.LAUNCHER_CURRENT_PAGE, Math.max(0, page));
};

export const BUILTIN_APPS_REGISTRY: { appId: AppId; name: string; builtInIcon: string }[] = [
  { appId: 'wechat', name: '聊天', builtInIcon: 'MessageCircle' },
  { appId: 'offline', name: '线下模式', builtInIcon: 'Heart' },
  { appId: 'weather', name: '实时天气', builtInIcon: 'CloudSun' },
  { appId: 'worldbook', name: '世界书', builtInIcon: 'BookOpen' },
  { appId: 'gamecenter', name: '游戏中心', builtInIcon: 'Gamepad2' },
  { appId: 'menstrual', name: '经期健康', builtInIcon: 'HeartPulse' },
  { appId: 'memo', name: '备忘录', builtInIcon: 'FileText' },
  { appId: 'apimonitor', name: 'API 监控', builtInIcon: 'Activity' },
  { appId: 'beautification', name: '界面美化', builtInIcon: 'Palette' },
  { appId: 'settings', name: '系统设置', builtInIcon: 'Settings' },
  { appId: 'connectivity', name: '外部设备', builtInIcon: 'Link' },
  { appId: 'permissions', name: 'AI 权限', builtInIcon: 'Shield' },
  { appId: 'ai_activity_logs', name: 'AI 活动记录', builtInIcon: 'FileCheck' },
];

export const loadIcons = (): AppIconConfig[] => {
  const raw = localStorage.getItem(STORAGE_KEYS.LAUNCHER_ICONS);
  if (!raw) {
    saveToStorage(STORAGE_KEYS.LAUNCHER_ICONS, INITIAL_ICONS);
    return INITIAL_ICONS;
  }
  try {
    const loaded = JSON.parse(raw);
    if (Array.isArray(loaded)) {
      const existingAppIds = new Set(loaded.map((icon: AppIconConfig) => icon.appId));
      const missingIcons = INITIAL_ICONS.filter((icon) => !existingAppIds.has(icon.appId));
      if (missingIcons.length > 0) {
        const merged = [...loaded, ...missingIcons];
        saveToStorage(STORAGE_KEYS.LAUNCHER_ICONS, merged);
        return merged;
      }
      return loaded;
    }
    return INITIAL_ICONS;
  } catch (e) {
    return INITIAL_ICONS;
  }
};
export const saveIcons = (icons: AppIconConfig[]) => saveToStorage(STORAGE_KEYS.LAUNCHER_ICONS, icons);

export const loadWidgets = (): WidgetConfig[] => {
  const raw = localStorage.getItem(STORAGE_KEYS.LAUNCHER_WIDGETS);
  if (raw === null) {
    saveToStorage(STORAGE_KEYS.LAUNCHER_WIDGETS, INITIAL_WIDGETS);
    return INITIAL_WIDGETS;
  }
  try {
    const loaded = JSON.parse(raw);
    if (Array.isArray(loaded)) {
      return loaded;
    }
    return INITIAL_WIDGETS;
  } catch (e) {
    return INITIAL_WIDGETS;
  }
};
export const saveWidgets = (widgets: WidgetConfig[]) => saveToStorage(STORAGE_KEYS.LAUNCHER_WIDGETS, widgets);

export const loadCharacters = (): AiCharacter[] => {
  const loaded = loadFromStorage<AiCharacter[]>(STORAGE_KEYS.CHARACTERS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((c) => c && c.id && !PRESET_DEMO_CHARACTER_IDS.has(c.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.CHARACTERS, cleaned);
  }
  return cleaned;
};
export const saveCharacters = (chars: AiCharacter[]) => saveToStorage(STORAGE_KEYS.CHARACTERS, chars);

export const loadMessages = (): ChatMessage[] => {
  const loaded = loadFromStorage<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter(
    (m) => m && m.id !== 'msg_welcome_1' && (!m.characterId || !PRESET_DEMO_CHARACTER_IDS.has(m.characterId))
  );
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.MESSAGES, cleaned);
  }
  return cleaned;
};
export const saveMessages = (msgs: ChatMessage[]) => saveToStorage(STORAGE_KEYS.MESSAGES, msgs);

export const loadMoments = (): MomentPost[] => {
  const loaded = loadFromStorage<MomentPost[]>(STORAGE_KEYS.MOMENTS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((p) => p && p.id && !PRESET_DEMO_MOMENT_IDS.has(p.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.MOMENTS, cleaned);
  }
  return cleaned;
};
export const saveMoments = (moments: MomentPost[]) => saveToStorage(STORAGE_KEYS.MOMENTS, moments);

export const loadUserProfile = (): UserProfile => {
  const loaded = loadFromStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE, INITIAL_USER_PROFILE);
  if (!loaded) return INITIAL_USER_PROFILE;
  const merged: UserProfile = {
    ...INITIAL_USER_PROFILE,
    ...loaded,
  };
  let changed = false;
  if (!merged.inviteCode) {
    merged.inviteCode = generateUserInviteCode();
    changed = true;
  }
  if (changed) {
    saveToStorage(STORAGE_KEYS.USER_PROFILE, merged);
  }
  return merged;
};
export const saveUserProfile = (profile: UserProfile) => saveToStorage(STORAGE_KEYS.USER_PROFILE, profile);

export const loadMenstrualData = (): MenstrualData => {
  const loaded = loadFromStorage<MenstrualData>(STORAGE_KEYS.MENSTRUAL, INITIAL_MENSTRUAL_DATA);
  if (!loaded) return INITIAL_MENSTRUAL_DATA;
  return {
    ...INITIAL_MENSTRUAL_DATA,
    ...loaded,
    records: Array.isArray(loaded.records) ? loaded.records : INITIAL_MENSTRUAL_DATA.records,
  };
};
export const saveMenstrualData = (data: MenstrualData) => saveToStorage(STORAGE_KEYS.MENSTRUAL, data);

export interface KeyClearDiagnosticInfo {
  source: string;
  previousKeyLength: number;
  nextKeyLength: number;
  timestamp: string;
}

let lastKeyClearDiagnostic: KeyClearDiagnosticInfo | null = null;

export const recordKeyClearEvent = (source: string, prevLen: number, nextLen: number) => {
  if (prevLen > 0 && nextLen === 0) {
    lastKeyClearDiagnostic = {
      source,
      previousKeyLength: prevLen,
      nextKeyLength: nextLen,
      timestamp: new Date().toLocaleTimeString(),
    };
    console.warn(`[API Key Diagnostic] Key cleared from len=${prevLen} to 0 by source: ${source}`);
  }
};

export const getLastKeyClearDiagnostic = (): KeyClearDiagnosticInfo | null => {
  return lastKeyClearDiagnostic;
};

import {
  loadApiSettings,
  saveApiSettings,
  getApiConfigForEngine,
} from './apiConfigStore';

export function loadApiConfig(): ApiConfig {
  return getApiConfigForEngine();
}

export function saveApiConfig(c: ApiConfig): void {
  const current = loadApiSettings();
  saveApiSettings({
    text: {
      provider: c.textApiConfig?.provider || current.text.provider,
      baseUrl: c.textApiConfig?.baseUrl ?? current.text.baseUrl,
      apiKey: c.textApiConfig?.apiKey ?? current.text.apiKey,
      model: c.textApiConfig?.model || current.text.model,
      apiProtocol: c.textApiConfig?.apiProtocol ?? current.text.apiProtocol,
    },
    image: {
      provider: c.imageApiConfig?.provider || current.image.provider,
      baseUrl: c.imageApiConfig?.baseUrl ?? current.image.baseUrl,
      apiKey: c.imageApiConfig?.apiKey ?? current.image.apiKey,
      model: c.imageApiConfig?.model || current.image.model,
      apiProtocol: c.imageApiConfig?.apiProtocol ?? current.image.apiProtocol,
    },
    voice: {
      provider: c.voiceApiConfig?.provider || current.voice.provider,
      baseUrl: c.voiceApiConfig?.baseUrl ?? current.voice.baseUrl,
      apiKey: c.voiceApiConfig?.apiKey ?? current.voice.apiKey,
      model: c.voiceApiConfig?.model || current.voice.model,
      apiProtocol: c.voiceApiConfig?.apiProtocol ?? current.voice.apiProtocol,
    },
  });
}

export const loadAiControls = (): AiControls => {
  const loaded = loadFromStorage<AiControls>(STORAGE_KEYS.AI_CONTROLS, INITIAL_AI_CONTROLS);
  if (!loaded) return INITIAL_AI_CONTROLS;
  return {
    ...INITIAL_AI_CONTROLS,
    ...loaded,
  };
};
export const saveAiControls = (c: AiControls) => saveToStorage(STORAGE_KEYS.AI_CONTROLS, c);

export const loadPermissions = () => {
  const loaded = loadFromStorage<AiPermissions>(STORAGE_KEYS.PERMISSIONS, INITIAL_PERMISSIONS);
  return {
    realDevice: { ...INITIAL_PERMISSIONS.realDevice, ...(loaded.realDevice || {}) },
    basic: { ...INITIAL_PERMISSIONS.basic, ...(loaded.basic || {}) },
    highLevel: { ...INITIAL_PERMISSIONS.highLevel, ...(loaded.highLevel || {}) },
    appAccess: { ...INITIAL_PERMISSIONS.appAccess, ...(loaded.appAccess || {}) },
    deviceAccess: { ...INITIAL_PERMISSIONS.deviceAccess, ...(loaded.deviceAccess || {}) },
  };
};
export const savePermissions = (p: AiPermissions) => saveToStorage(STORAGE_KEYS.PERMISSIONS, p);

export const loadApiLogs = (): ApiLog[] => {
  const loaded = loadFromStorage<ApiLog[]>(STORAGE_KEYS.API_LOGS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((l) => l && l.id && !PRESET_DEMO_LOG_IDS.has(l.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.API_LOGS, cleaned);
  }
  return cleaned;
};
export const saveApiLogs = (logs: ApiLog[]) => saveToStorage(STORAGE_KEYS.API_LOGS, logs);

export const loadWorldBooks = (): WorldBook[] => {
  const loaded = loadFromStorage<WorldBook[]>(STORAGE_KEYS.WORLD_BOOKS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((w) => w && w.id && !PRESET_DEMO_WORLDBOOK_IDS.has(w.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.WORLD_BOOKS, cleaned);
  }
  return cleaned;
};
export const saveWorldBooks = (books: WorldBook[]) => saveToStorage(STORAGE_KEYS.WORLD_BOOKS, books);

export const loadMemos = (): Memo[] => {
  const loaded = loadFromStorage<Memo[]>(STORAGE_KEYS.MEMOS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((m) => m && m.id && !PRESET_DEMO_MEMO_IDS.has(m.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.MEMOS, cleaned);
  }
  return cleaned;
};
export const saveMemos = (memos: Memo[]) => saveToStorage(STORAGE_KEYS.MEMOS, memos);

const INITIAL_GOMOKU_RECORDS: GomokuRecord[] = [];

export const loadGomokuRecords = (): GomokuRecord[] => {
  const loaded = loadFromStorage<GomokuRecord[]>(STORAGE_KEYS.GOMOKU_RECORDS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((r) => r && r.id && !PRESET_DEMO_GAME_RECORD_IDS.has(r.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.GOMOKU_RECORDS, cleaned);
  }
  return cleaned;
};
export const saveGomokuRecords = (recs: GomokuRecord[]) => saveToStorage(STORAGE_KEYS.GOMOKU_RECORDS, recs);

const INITIAL_TICTACTOE_RECORDS: TicTacToeRecord[] = [];

export const loadTicTacToeRecords = (): TicTacToeRecord[] => {
  const loaded = loadFromStorage<TicTacToeRecord[]>(STORAGE_KEYS.TICTACTOE_RECORDS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((r) => r && r.id && !PRESET_DEMO_GAME_RECORD_IDS.has(r.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.TICTACTOE_RECORDS, cleaned);
  }
  return cleaned;
};
export const saveTicTacToeRecords = (recs: TicTacToeRecord[]) => saveToStorage(STORAGE_KEYS.TICTACTOE_RECORDS, recs);

const INITIAL_RPS_RECORDS: RpsRecord[] = [];

const INITIAL_RPS_STATS: RpsStats = {
  currentStreak: 0,
  maxStreak: 0,
  totalGames: 0,
  playerWins: 0,
  aiWins: 0,
  draws: 0,
  winRate: 0,
};

export const loadRpsRecords = (): RpsRecord[] => {
  const loaded = loadFromStorage<RpsRecord[]>(STORAGE_KEYS.RPS_RECORDS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((r) => r && r.id && !PRESET_DEMO_GAME_RECORD_IDS.has(r.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.RPS_RECORDS, cleaned);
  }
  return cleaned;
};
export const saveRpsRecords = (recs: RpsRecord[]) => saveToStorage(STORAGE_KEYS.RPS_RECORDS, recs);

export const loadRpsStats = () => loadFromStorage<RpsStats>(STORAGE_KEYS.RPS_STATS, INITIAL_RPS_STATS);
export const saveRpsStats = (stats: RpsStats) => saveToStorage(STORAGE_KEYS.RPS_STATS, stats);

// Telepathy (心有灵犀) Initial Records & Stats
const INITIAL_TELEPATHY_RECORDS: TelepathyRecord[] = [];

const INITIAL_TELEPATHY_CHAR_STATS: Record<string, TelepathyCharacterStats> = {};

export const loadTelepathyRecords = (): TelepathyRecord[] => {
  const loaded = loadFromStorage<TelepathyRecord[]>(STORAGE_KEYS.TELEPATHY_RECORDS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((r) => r && r.id && !PRESET_DEMO_GAME_RECORD_IDS.has(r.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.TELEPATHY_RECORDS, cleaned);
  }
  return cleaned;
};
export const saveTelepathyRecords = (recs: TelepathyRecord[]) =>
  saveToStorage(STORAGE_KEYS.TELEPATHY_RECORDS, recs);

export const loadTelepathyCharStats = () =>
  loadFromStorage<Record<string, TelepathyCharacterStats>>(
    STORAGE_KEYS.TELEPATHY_CHAR_STATS,
    INITIAL_TELEPATHY_CHAR_STATS
  );
export const saveTelepathyCharStats = (stats: Record<string, TelepathyCharacterStats>) =>
  saveToStorage(STORAGE_KEYS.TELEPATHY_CHAR_STATS, stats);

export const loadSettings = (): SettingsState => ({
  desktopWallpaper: loadFromStorage(STORAGE_KEYS.DESKTOP_WALLPAPER, DEFAULT_DESKTOP_WALLPAPER),
  lockWallpaper: loadFromStorage(STORAGE_KEYS.LOCK_WALLPAPER, DEFAULT_LOCK_WALLPAPER),
  customCss: loadFromStorage(
    STORAGE_KEYS.CUSTOM_CSS,
    '/* 自定义 CSS */\n.phone-screen {\n  font-family: system-ui, -apple-system, sans-serif;\n}'
  ),
  pinCode: loadFromStorage(STORAGE_KEYS.PIN, '1234'),
  isPinEnabled: loadFromStorage(STORAGE_KEYS.PIN_ENABLED, true),
  theme: loadFromStorage<ThemeId>(STORAGE_KEYS.THEME, 'default'),
  wallpaperSource: loadFromStorage<WallpaperSource>(STORAGE_KEYS.WALLPAPER_SOURCE, 'default'),
  customDesktopWallpaper: loadFromStorage<string | undefined>(STORAGE_KEYS.CUSTOM_DESKTOP_WALLPAPER, undefined),
  customLockWallpaper: loadFromStorage<string | undefined>(STORAGE_KEYS.CUSTOM_LOCK_WALLPAPER, undefined),
});

export const saveSettings = (s: SettingsState) => {
  saveToStorage(STORAGE_KEYS.DESKTOP_WALLPAPER, s.desktopWallpaper);
  saveToStorage(STORAGE_KEYS.LOCK_WALLPAPER, s.lockWallpaper);
  saveToStorage(STORAGE_KEYS.CUSTOM_CSS, s.customCss);
  saveToStorage(STORAGE_KEYS.PIN, s.pinCode);
  saveToStorage(STORAGE_KEYS.PIN_ENABLED, s.isPinEnabled);
  saveToStorage(STORAGE_KEYS.THEME, s.theme || 'default');
  saveToStorage(STORAGE_KEYS.WALLPAPER_SOURCE, s.wallpaperSource || 'default');
  if (s.customDesktopWallpaper !== undefined) {
    saveToStorage(STORAGE_KEYS.CUSTOM_DESKTOP_WALLPAPER, s.customDesktopWallpaper);
  }
  if (s.customLockWallpaper !== undefined) {
    saveToStorage(STORAGE_KEYS.CUSTOM_LOCK_WALLPAPER, s.customLockWallpaper);
  }
};

// ==================== Group Chats Storage ====================

export const generateGroupInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'WX-GRP-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const INITIAL_GROUP_CHATS: GroupChat[] = [];

export const loadGroupChats = (): GroupChat[] => {
  const loaded = loadFromStorage<GroupChat[]>(STORAGE_KEYS.GROUP_CHATS, []);
  if (!Array.isArray(loaded)) return [];
  const cleaned = loaded.filter((g) => g && g.id && !PRESET_DEMO_GROUP_IDS.has(g.id));
  if (cleaned.length !== loaded.length) {
    saveToStorage(STORAGE_KEYS.GROUP_CHATS, cleaned);
  }
  return cleaned;
};

export const saveGroupChats = (groups: GroupChat[]): void => {
  saveToStorage(STORAGE_KEYS.GROUP_CHATS, groups);
};

export {
  INITIAL_CHARACTERS,
  INITIAL_USER_PROFILE,
  INITIAL_MENSTRUAL_DATA,
  INITIAL_MEMOS,
  INITIAL_MOMENTS,
  INITIAL_WORLD_BOOKS,
  INITIAL_ICONS,
  INITIAL_WIDGETS,
  INITIAL_API_LOGS,
  INITIAL_PERMISSIONS,
  INITIAL_AI_CONTROLS,
  INITIAL_GOMOKU_RECORDS,
  INITIAL_TICTACTOE_RECORDS,
  INITIAL_RPS_RECORDS,
  INITIAL_RPS_STATS,
  INITIAL_TELEPATHY_RECORDS,
  INITIAL_TELEPATHY_CHAR_STATS,
};

/**
 * Reset all localStorage items to factory defaults.
 */
export function resetStorageToFactoryDefaults(): void {
  localStorage.clear();

  saveToStorage(STORAGE_KEYS.DESKTOP_WALLPAPER, DEFAULT_DESKTOP_WALLPAPER);
  saveToStorage(STORAGE_KEYS.LOCK_WALLPAPER, DEFAULT_LOCK_WALLPAPER);
  saveToStorage(
    STORAGE_KEYS.CUSTOM_CSS,
    '/* 自定义 CSS */\n.phone-screen {\n  font-family: system-ui, -apple-system, sans-serif;\n}'
  );
  saveToStorage(STORAGE_KEYS.PIN, '1234');
  saveToStorage(STORAGE_KEYS.PIN_ENABLED, true);
  saveToStorage(STORAGE_KEYS.IS_LOCKED, false);

  saveToStorage(STORAGE_KEYS.CHARACTERS, []);
  saveToStorage(STORAGE_KEYS.USER_PROFILE, INITIAL_USER_PROFILE);
  saveToStorage(STORAGE_KEYS.MENSTRUAL, INITIAL_MENSTRUAL_DATA);
  saveToStorage(STORAGE_KEYS.MEMOS, []);
  saveToStorage(STORAGE_KEYS.MOMENTS, []);
  saveToStorage(STORAGE_KEYS.WORLD_BOOKS, []);
  saveToStorage(STORAGE_KEYS.LAUNCHER_PAGES, 2);
  saveToStorage(STORAGE_KEYS.LAUNCHER_ICONS, INITIAL_ICONS);
  saveToStorage(STORAGE_KEYS.LAUNCHER_WIDGETS, INITIAL_WIDGETS);
  saveToStorage(STORAGE_KEYS.API_LOGS, []);
  saveToStorage(STORAGE_KEYS.PERMISSIONS, INITIAL_PERMISSIONS);
  saveApiConfig(INITIAL_API_CONFIG);
  saveToStorage(STORAGE_KEYS.AI_CONTROLS, INITIAL_AI_CONTROLS);
  saveToStorage(STORAGE_KEYS.GOMOKU_RECORDS, []);
  saveToStorage(STORAGE_KEYS.TICTACTOE_RECORDS, []);
  saveToStorage(STORAGE_KEYS.RPS_RECORDS, []);
  saveToStorage(STORAGE_KEYS.RPS_STATS, INITIAL_RPS_STATS);
  saveToStorage(STORAGE_KEYS.TELEPATHY_RECORDS, []);
  saveToStorage(STORAGE_KEYS.TELEPATHY_CHAR_STATS, {});
  saveToStorage(STORAGE_KEYS.GROUP_CHATS, []);
  saveToStorage(STORAGE_KEYS.MESSAGES, []);
}

