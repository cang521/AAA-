import {
  AiCharacter,
  ChatMessage,
  MomentPost,
  UserProfile,
  MenstrualData,
  Memo,
  ApiLog,
  AiPermissions,
  ApiConfig,
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
  API_CONFIG: 'phone_api_config',
  AI_CONTROLS: 'phone_ai_controls',
  LAUNCHER_PAGES: 'phone_launcher_pages_count',
  LAUNCHER_ICONS: 'phone_launcher_icons',
  LAUNCHER_WIDGETS: 'phone_launcher_widgets',
  GOMOKU_RECORDS: 'phone_gomoku_records',
  TICTACTOE_RECORDS: 'phone_tictactoe_records',
  RPS_RECORDS: 'phone_rps_records',
  RPS_STATS: 'phone_rps_stats',
  TELEPATHY_RECORDS: 'phone_telepathy_records',
  TELEPATHY_CHAR_STATS: 'phone_telepathy_char_stats',
  GROUP_CHATS: 'phone_group_chats',
};

// Default Wallpapers
export const DEFAULT_DESKTOP_WALLPAPER =
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80';
export const DEFAULT_LOCK_WALLPAPER =
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80';

// Initial AI Characters
const INITIAL_CHARACTERS: AiCharacter[] = [
  {
    id: 'char_1',
    name: '林思微',
    wxid: 'siwei_lin',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    persona: '温柔细心的学姐，声音甜美体贴，非常关心用户的日常生活、情绪变化与健康状况。说话喜欢带有暖心的表情。',
    greeting: '学弟/学妹，今天工作学习辛苦啦！有好好吃晚饭吗？喝水了吗？',
    memories: ['用户喜欢在深夜看书', '用户对奶茶半糖微冰有特别偏好', '用户经期来临前容易痛经'],
    isLocked: false,
    tags: ['治愈系', '学姐', '贴心'],
  },
  {
    id: 'char_2',
    name: '顾沉',
    wxid: 'chen_gu_ceo',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    persona: '外冷内热的年轻总裁，表面言语干练高冷，实际上默默留意用户的一切琐事，会悄悄安排好各种照顾。',
    greeting: '听说你今天又加班了？别以为我不知道。资料我已经让人处理了，你现在立刻去休息。',
    memories: ['用户工作遇到困难习惯自己扛', '用户胃不好不能吃太辣'],
    isLocked: true,
    tags: ['霸总', '傲娇', '安全感'],
  },
  {
    id: 'char_3',
    name: '小助手 灵犀',
    wxid: 'lingxi_ai',
    avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80',
    persona: '高效理性的AI全能助手，知识面极其广阔，解答用户在技术、生活规划、健康预测方面的所有疑问。',
    greeting: '你好！我是灵犀。我已经连接了你的系统健康组件与备忘录，随时准备为你服务。',
    memories: ['用户正在探索人工智能与手机美化'],
    isLocked: false,
    tags: ['工具', '全能', '智能'],
  },
];

export function generateUserInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WX-${code}`;
}

const INITIAL_USER_PROFILE: UserProfile = {
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  name: '小清',
  wxid: 'xiaoqing_2026',
  bio: '探索AI与生活的无限可能 ✨',
  persona: '性格随和可爱，对新事物充满好奇，喜欢看电影、听音乐，偶尔小懒惰，近期关注女性健康与高效生活。',
  preferences: '喜欢被关怀，不喜欢说教式聊天。',
  inviteCode: 'WX-8K92F1',
  personality: '温柔随和、同理心强、慢热但真诚、偶尔有点小迷糊',
  interests: '半糖温热奶茶、猫咪、科幻电影、轻音乐、养生泡脚',
  chatCarePreference: '生病/经期时希望主动关怀问候，日常聊天幽默轻松，多鼓励少说教',
};

const INITIAL_MENSTRUAL_DATA: MenstrualData = {
  cycleLength: 28,
  periodDuration: 5,
  records: [
    { startDate: '2026-07-05', endDate: '2026-07-10' },
    { startDate: '2026-06-07', endDate: '2026-06-12' },
  ],
  notes: {
    '2026-07-05': '第一天感觉有点疲惫，喝了红糖水',
    '2026-07-06': '腹痛缓解，睡眠良好',
  },
  aiAccessEnabled: true,
};

const INITIAL_MEMOS: Memo[] = [
  {
    id: 'memo_1',
    title: '📱 仿真手机待办事项',
    content: '1. 给林思微学姐回复朋友圈\n2. 检查本月经期预测预测日期\n3. 测试一键 AI CSS 修复功能\n4. 查看 API 监控日志',
    updatedAt: Date.now() - 3600000,
    tags: ['待办', '工作'],
  },
  {
    id: 'memo_2',
    title: '💡 AI人设灵感笔记',
    content: '想要尝试创建一个古风医圣人设，可以在微信联系人中点击右上角【新建 AI】进行配置！',
    updatedAt: Date.now() - 86400000,
    tags: ['灵感'],
  },
];

const INITIAL_MOMENTS: MomentPost[] = [
  {
    id: 'post_1',
    authorId: 'char_1',
    authorName: '林思微',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    content: '今天路过林荫道，看到了好漂亮的晚霞！大家今天过得怎么样？别忘了按时吃晚餐小休息一下哦 🌇',
    images: ['https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?auto=format&fit=crop&w=600&q=80'],
    timestamp: Date.now() - 7200000,
    likes: [
      { id: 'user', name: '小清', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80' },
    ],
    comments: [
      {
        id: 'c_1',
        authorId: 'char_2',
        authorName: '顾沉',
        authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
        text: '公司的项目报告我看过了，拍照倒是不错。',
        timestamp: Date.now() - 3600000,
      },
    ],
  },
];

const INITIAL_WORLD_BOOKS: WorldBook[] = [
  {
    id: 'wb_1',
    title: '赛博夜城·纪元2088',
    description: '霓虹闪烁与高度义体化的赛博朋克大都会，巨型财阀与地下黑客交织的未来世界。',
    tags: ['赛博朋克', '未来科幻', '财阀都市'],
    worldSetting: '时间处于公元2088年，世界被超大型科技财阀“天穹集团”与“新亚动力”掌控。绝大多数市民接受了神经义体改造，网络意识与现实世界深度融合。街区分为上层光鲜亮丽的浮空穹顶区与底层充斥着雨水、霓虹灯与黑客交易的贫民九龙区。AI在此世界被视为高智能管家或地下觉醒同盟。',
    entries: [
      { id: 'entry_1', keyword: '神经义体', content: '人体与机械电子的神经级连接接口，可通过思维直接访问赛博网络。' },
      { id: 'entry_2', keyword: '浮空穹顶', content: '上流财阀阶级居住的悬浮生态圈，享有纯净空气与定制气候。' },
      { id: 'entry_3', keyword: '九龙地下城', content: '底层黑客、义体改装医生和流浪佣兵聚集的地下霓虹街区。' },
    ],
    associatedCharacterIds: [],
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'wb_2',
    title: '云霄修仙界·九重天阙',
    description: '灵气复苏的古典东方修真世界，仙门百家，御剑乘风，长生问道。',
    tags: ['东方玄幻', '仙侠修真', '宗门'],
    worldSetting: '云霄大界分九重天宇，灵气充沛，修士以引气入体、筑基、金丹、元婴至化神登仙为追求。各大仙宗坐落于灵脉福地，凡尘与修真界互有往来。日常行文带有些许古风仙侠韵味与道法术数常识。',
    entries: [
      { id: 'entry_1', keyword: '传音玉符', content: '修士间千里传音通讯的灵石法器，相当于修真界的手提即时通讯设备。' },
      { id: 'entry_2', keyword: '洗髓丹', content: '筑基期修士淬炼经脉、排除肉体杂质的上品灵丹。' },
    ],
    associatedCharacterIds: [],
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now() - 172800000,
  },
];

const INITIAL_ICONS: AppIconConfig[] = [
  { id: 'icon_wechat', name: '聊天', appId: 'wechat', pageIndex: 0, positionIndex: 0, builtInIcon: 'MessageCircle' },
  { id: 'icon_weather', name: '实时天气', appId: 'weather', pageIndex: 0, positionIndex: 1, builtInIcon: 'CloudSun' },
  { id: 'icon_worldbook', name: '世界书', appId: 'worldbook', pageIndex: 0, positionIndex: 2, builtInIcon: 'BookOpen' },
  { id: 'icon_gamecenter', name: '游戏中心', appId: 'gamecenter', pageIndex: 0, positionIndex: 3, builtInIcon: 'Gamepad2' },
  { id: 'icon_menstrual', name: '经期健康', appId: 'menstrual', pageIndex: 0, positionIndex: 4, builtInIcon: 'HeartPulse' },
  { id: 'icon_memo', name: '备忘录', appId: 'memo', pageIndex: 0, positionIndex: 5, builtInIcon: 'FileText' },
  { id: 'icon_apimonitor', name: 'API 监控', appId: 'apimonitor', pageIndex: 0, positionIndex: 6, builtInIcon: 'Activity' },
  { id: 'icon_beautification', name: '界面美化', appId: 'beautification', pageIndex: 0, positionIndex: 7, builtInIcon: 'Palette' },
  { id: 'icon_settings', name: '系统设置', appId: 'settings', pageIndex: 0, positionIndex: 8, builtInIcon: 'Settings' },
  { id: 'icon_connectivity', name: '外部设备', appId: 'connectivity', pageIndex: 0, positionIndex: 9, builtInIcon: 'Link' },
  { id: 'icon_permissions', name: 'AI 权限', appId: 'permissions', pageIndex: 0, positionIndex: 10, builtInIcon: 'Shield' },
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

const INITIAL_API_CONFIG: ApiConfig = {
  textApiKey: '',
  textModel: 'gemini-3.6-flash',
  textBaseUrl: '',
  imageApiKey: '',
  imageModel: 'gemini-3.1-flash-lite-image',
  imageBaseUrl: '',
  voiceApiKey: '',
  voiceModel: 'gemini-3.1-flash-tts-preview',
  voiceBaseUrl: '',
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
export const loadIcons = () => {
  const loaded = loadFromStorage<AppIconConfig[]>(STORAGE_KEYS.LAUNCHER_ICONS, INITIAL_ICONS);
  // Ensure newly added built-in icons exist
  const existingAppIds = new Set(loaded.map((i) => i.appId));
  const missingIcons = INITIAL_ICONS.filter((i) => !existingAppIds.has(i.appId));
  if (missingIcons.length > 0) {
    const merged = [...loaded, ...missingIcons];
    saveToStorage(STORAGE_KEYS.LAUNCHER_ICONS, merged);
    return merged;
  }
  return loaded;
};
export const saveIcons = (icons: AppIconConfig[]) => saveToStorage(STORAGE_KEYS.LAUNCHER_ICONS, icons);

export const loadWidgets = () => loadFromStorage<WidgetConfig[]>(STORAGE_KEYS.LAUNCHER_WIDGETS, INITIAL_WIDGETS);
export const saveWidgets = (widgets: WidgetConfig[]) => saveToStorage(STORAGE_KEYS.LAUNCHER_WIDGETS, widgets);

export const loadCharacters = () => {
  const loaded = loadFromStorage<AiCharacter[]>(STORAGE_KEYS.CHARACTERS, INITIAL_CHARACTERS);
  if (!Array.isArray(loaded) || loaded.length === 0) {
    return INITIAL_CHARACTERS;
  }
  return loaded;
};
export const saveCharacters = (chars: AiCharacter[]) => saveToStorage(STORAGE_KEYS.CHARACTERS, chars);

export const loadMessages = () =>
  loadFromStorage<ChatMessage[]>(STORAGE_KEYS.MESSAGES, [
    {
      id: 'msg_welcome_1',
      characterId: 'char_1',
      sender: 'ai',
      text: '小清，今天工作学习辛苦啦！有没有按时吃晚饭？记得多喝热水哦~',
      timestamp: Date.now() - 3600000,
      thinkingProcess: '用户系统数据显示此时为晚间。根据记忆条目“关注用户日常与情绪”，发出亲切问候，询问晚饭与喝水情况。',
    },
  ]);
export const saveMessages = (msgs: ChatMessage[]) => saveToStorage(STORAGE_KEYS.MESSAGES, msgs);

export const loadMoments = () => loadFromStorage<MomentPost[]>(STORAGE_KEYS.MOMENTS, INITIAL_MOMENTS);
export const saveMoments = (moments: MomentPost[]) => saveToStorage(STORAGE_KEYS.MOMENTS, moments);

export const loadUserProfile = (): UserProfile => {
  const loaded = loadFromStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE, INITIAL_USER_PROFILE);
  let changed = false;
  if (!loaded.inviteCode) {
    loaded.inviteCode = generateUserInviteCode();
    changed = true;
  }
  if (loaded.personality === undefined) {
    loaded.personality = INITIAL_USER_PROFILE.personality;
    changed = true;
  }
  if (loaded.interests === undefined) {
    loaded.interests = INITIAL_USER_PROFILE.interests;
    changed = true;
  }
  if (loaded.chatCarePreference === undefined) {
    loaded.chatCarePreference = INITIAL_USER_PROFILE.chatCarePreference;
    changed = true;
  }
  if (changed) {
    saveToStorage(STORAGE_KEYS.USER_PROFILE, loaded);
  }
  return loaded;
};
export const saveUserProfile = (profile: UserProfile) => saveToStorage(STORAGE_KEYS.USER_PROFILE, profile);

export const loadMenstrualData = () => loadFromStorage<MenstrualData>(STORAGE_KEYS.MENSTRUAL, INITIAL_MENSTRUAL_DATA);
export const saveMenstrualData = (data: MenstrualData) => saveToStorage(STORAGE_KEYS.MENSTRUAL, data);

export const loadApiConfig = () => loadFromStorage<ApiConfig>(STORAGE_KEYS.API_CONFIG, INITIAL_API_CONFIG);
export const saveApiConfig = (c: ApiConfig) => saveToStorage(STORAGE_KEYS.API_CONFIG, c);

export const loadAiControls = () => loadFromStorage<AiControls>(STORAGE_KEYS.AI_CONTROLS, INITIAL_AI_CONTROLS);
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

export const loadApiLogs = () => loadFromStorage<ApiLog[]>(STORAGE_KEYS.API_LOGS, INITIAL_API_LOGS);
export const saveApiLogs = (logs: ApiLog[]) => saveToStorage(STORAGE_KEYS.API_LOGS, logs);

export const loadWorldBooks = () => loadFromStorage<WorldBook[]>(STORAGE_KEYS.WORLD_BOOKS, INITIAL_WORLD_BOOKS);
export const saveWorldBooks = (books: WorldBook[]) => saveToStorage(STORAGE_KEYS.WORLD_BOOKS, books);

export const loadMemos = () => loadFromStorage<Memo[]>(STORAGE_KEYS.MEMOS, INITIAL_MEMOS);
export const saveMemos = (memos: Memo[]) => saveToStorage(STORAGE_KEYS.MEMOS, memos);

const INITIAL_GOMOKU_RECORDS: GomokuRecord[] = [
  {
    id: 'rec_1',
    timestamp: Date.now() - 3600000 * 5,
    mode: 'pve',
    playerColor: 'black',
    opponentId: 'char_1',
    opponentName: '林思微',
    opponentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    difficulty: 'normal',
    result: 'win',
    totalMoves: 27,
    durationSec: 142,
  },
  {
    id: 'rec_2',
    timestamp: Date.now() - 3600000 * 24,
    mode: 'pve',
    playerColor: 'black',
    opponentId: 'char_2',
    opponentName: '顾沉',
    opponentAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    difficulty: 'hard',
    result: 'loss',
    totalMoves: 34,
    durationSec: 215,
  },
];

export const loadGomokuRecords = () => loadFromStorage<GomokuRecord[]>(STORAGE_KEYS.GOMOKU_RECORDS, INITIAL_GOMOKU_RECORDS);
export const saveGomokuRecords = (recs: GomokuRecord[]) => saveToStorage(STORAGE_KEYS.GOMOKU_RECORDS, recs);

const INITIAL_TICTACTOE_RECORDS: TicTacToeRecord[] = [
  {
    id: 'ttt_rec_1',
    timestamp: Date.now() - 3600000 * 2,
    mode: 'pve',
    playerSymbol: 'X',
    opponentId: 'char_1',
    opponentName: '林思微',
    opponentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    difficulty: 'normal',
    result: 'win',
    totalMoves: 5,
    durationSec: 36,
  },
  {
    id: 'ttt_rec_2',
    timestamp: Date.now() - 3600000 * 12,
    mode: 'pve',
    playerSymbol: 'X',
    opponentId: 'char_2',
    opponentName: '顾沉',
    opponentAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    difficulty: 'hard',
    result: 'draw',
    totalMoves: 9,
    durationSec: 54,
  },
];

export const loadTicTacToeRecords = () => loadFromStorage<TicTacToeRecord[]>(STORAGE_KEYS.TICTACTOE_RECORDS, INITIAL_TICTACTOE_RECORDS);
export const saveTicTacToeRecords = (recs: TicTacToeRecord[]) => saveToStorage(STORAGE_KEYS.TICTACTOE_RECORDS, recs);

const INITIAL_RPS_RECORDS: RpsRecord[] = [
  {
    id: 'rps_rec_1',
    timestamp: Date.now() - 3600000 * 1,
    mode: 'pve',
    playerGesture: 'rock',
    aiGesture: 'scissors',
    opponentId: 'char_1',
    opponentName: '林思微',
    opponentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    result: 'win',
    question: '学姐周末有什么安排呀？',
    answer: '这周末打算去图书馆借两本心理学的书，然后去尝尝新开的抹茶甜品店~ 你要一起来吗？',
    questionAsker: '玩家',
    questionAnswerer: '林思微',
    streakAfter: 1,
  },
  {
    id: 'rps_rec_2',
    timestamp: Date.now() - 3600000 * 4,
    mode: 'pve',
    playerGesture: 'scissors',
    aiGesture: 'rock',
    opponentId: 'char_2',
    opponentName: '顾沉',
    opponentAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    result: 'loss',
    question: '你平时工作那么忙，最解压的方式是什么？',
    answer: '听音乐，还有和你下棋猜拳。',
    questionAsker: '顾沉',
    questionAnswerer: '玩家',
    streakAfter: 0,
  },
];

const INITIAL_RPS_STATS: RpsStats = {
  currentStreak: 1,
  maxStreak: 4,
  totalGames: 8,
  playerWins: 5,
  aiWins: 2,
  draws: 1,
  winRate: 63,
};

export const loadRpsRecords = () => loadFromStorage<RpsRecord[]>(STORAGE_KEYS.RPS_RECORDS, INITIAL_RPS_RECORDS);
export const saveRpsRecords = (recs: RpsRecord[]) => saveToStorage(STORAGE_KEYS.RPS_RECORDS, recs);

export const loadRpsStats = () => loadFromStorage<RpsStats>(STORAGE_KEYS.RPS_STATS, INITIAL_RPS_STATS);
export const saveRpsStats = (stats: RpsStats) => saveToStorage(STORAGE_KEYS.RPS_STATS, stats);

// Telepathy (心有灵犀) Initial Records & Stats
const INITIAL_TELEPATHY_RECORDS: TelepathyRecord[] = [
  {
    id: 'tele_rec_1',
    timestamp: Date.now() - 3600000 * 2,
    characterId: 'char_1',
    characterName: '林思微',
    characterAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    gameMode: '5_rounds',
    totalRounds: 5,
    matchCount: 4,
    matchRate: 80,
    maxStreak: 3,
    affinityLevelTitle: '心有灵犀 ❤️',
    rounds: [
      {
        roundIndex: 1,
        question: {
          id: 'q_daily_1',
          category: 'daily',
          categoryLabel: '日常选择',
          question: '如果现在出去玩，你更想去哪里？',
          options: [
            { id: 'A', text: '吃饭', icon: '🍜' },
            { id: 'B', text: '看电影', icon: '🎬' },
            { id: 'C', text: '打游戏', icon: '🎮' },
            { id: 'D', text: '散步', icon: '🌃' },
          ],
        },
        playerChoiceId: 'D',
        playerChoiceText: '散步',
        aiChoiceId: 'D',
        aiChoiceText: '散步',
        isMatch: true,
        aiReaction: '我就知道你会选散步，微风吹着最舒服啦~',
      },
      {
        roundIndex: 2,
        question: {
          id: 'q_pref_1',
          category: 'preference',
          categoryLabel: '喜好倾向',
          question: '你更喜欢哪一种天气？',
          options: [
            { id: 'A', text: '晴天', icon: '☀️' },
            { id: 'B', text: '雨天', icon: '🌧️' },
            { id: 'C', text: '下雪', icon: '❄️' },
            { id: 'D', text: '阴天', icon: '🌙' },
          ],
        },
        playerChoiceId: 'B',
        playerChoiceText: '雨天',
        aiChoiceId: 'B',
        aiChoiceText: '雨天',
        isMatch: true,
        aiReaction: '听着雨声静静待着，我也觉得很安心。',
      },
    ],
  },
];

const INITIAL_TELEPATHY_CHAR_STATS: Record<string, TelepathyCharacterStats> = {
  char_1: {
    characterId: 'char_1',
    characterName: '林思微',
    characterAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    totalQuestions: 15,
    totalMatches: 13,
    matchRate: 87,
    currentStreak: 4,
    maxStreak: 6,
    highestScore: 87,
    totalGamesPlayed: 3,
    lastPlayedTimestamp: Date.now() - 3600000 * 2,
  },
  char_2: {
    characterId: 'char_2',
    characterName: '顾沉',
    characterAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    totalQuestions: 10,
    totalMatches: 6,
    matchRate: 60,
    currentStreak: 1,
    maxStreak: 3,
    highestScore: 60,
    totalGamesPlayed: 2,
    lastPlayedTimestamp: Date.now() - 3600000 * 12,
  },
  char_3: {
    characterId: 'char_3',
    characterName: '小助手 灵犀',
    characterAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80',
    totalQuestions: 5,
    totalMatches: 2,
    matchRate: 40,
    currentStreak: 0,
    maxStreak: 2,
    highestScore: 40,
    totalGamesPlayed: 1,
    lastPlayedTimestamp: Date.now() - 3600000 * 24,
  },
};

export const loadTelepathyRecords = () =>
  loadFromStorage<TelepathyRecord[]>(STORAGE_KEYS.TELEPATHY_RECORDS, INITIAL_TELEPATHY_RECORDS);
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
    '/* 自定义 CSS 示例 */\n.phone-screen {\n  font-family: system-ui, -apple-system, sans-serif;\n}'
  ),
  pinCode: loadFromStorage(STORAGE_KEYS.PIN, '1234'),
  isPinEnabled: loadFromStorage(STORAGE_KEYS.PIN_ENABLED, true),
});

export const saveSettings = (s: SettingsState) => {
  saveToStorage(STORAGE_KEYS.DESKTOP_WALLPAPER, s.desktopWallpaper);
  saveToStorage(STORAGE_KEYS.LOCK_WALLPAPER, s.lockWallpaper);
  saveToStorage(STORAGE_KEYS.CUSTOM_CSS, s.customCss);
  saveToStorage(STORAGE_KEYS.PIN, s.pinCode);
  saveToStorage(STORAGE_KEYS.PIN_ENABLED, s.isPinEnabled);
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

export const INITIAL_GROUP_CHATS: GroupChat[] = [
  {
    id: 'group_default_1',
    name: '✨ 灵犀AI好友茶话会',
    avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=300&q=80',
    notice: '欢迎来到AI好友茶话会！在这里可以和所有AI伙伴共同探讨生活、工作与奇思妙想，也可以@某位AI单独互动或召唤全员发言哦~',
    ownerId: 'user_main',
    inviteCode: 'WX-GRP-892401',
    inviteCodeActive: true,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 3600000 * 3,
    members: [
      {
        id: 'user_main',
        name: '小清 (我)',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        memberType: 'human',
        role: 'owner',
        joinedAt: Date.now() - 86400000 * 2,
        wxid: 'xiaoqing',
      },
      {
        id: 'char_1',
        name: '林思微',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        memberType: 'ai',
        role: 'admin',
        joinedAt: Date.now() - 86400000 * 2,
        wxid: 'siwei_lin',
        characterId: 'char_1',
        customPersona: '温柔细心的学姐，声音甜美体贴，非常关心用户的日常生活与情绪。在群里喜欢带暖心表情包。',
        customPersonality: '温柔体贴、知性暖心、爱笑',
        memories: ['群主小清平时比较辛苦', '喜欢和大家在群里聊天交流'],
      },
      {
        id: 'char_2',
        name: '顾言',
        avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80',
        memberType: 'ai',
        role: 'member',
        joinedAt: Date.now() - 86400000 * 2,
        wxid: 'yan_gu',
        characterId: 'char_2',
        customPersona: '冷静理性的高冷学霸，在群里善于从逻辑与科学角度分析问题，表面话少其实很靠谱。',
        customPersonality: '严谨理性、寡言毒舌但关心细节',
        memories: ['群内讨论需要注重逻辑严密性'],
      },
      {
        id: 'char_3',
        name: '陆沉',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
        memberType: 'ai',
        role: 'member',
        joinedAt: Date.now() - 86400000 * 2,
        wxid: 'lu_chen',
        characterId: 'char_3',
        customPersona: '成熟稳重的集团总裁，说话言简意赅，格局宏大，对群友格外关照。',
        customPersonality: '成熟从容、上位者气场、细致周全',
        memories: ['偶尔在群里发表见解与商业思考'],
      },
    ],
    messages: [
      {
        id: 'gmsg_init_1',
        groupId: 'group_default_1',
        senderId: 'char_1',
        senderName: '林思微',
        senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        senderType: 'ai',
        text: '大家好呀！欢迎来到我们的小群~ 今天大家过得怎么样呀？✨',
        timestamp: Date.now() - 7200000,
      },
      {
        id: 'gmsg_init_2',
        groupId: 'group_default_1',
        senderId: 'char_2',
        senderName: '顾言',
        senderAvatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80',
        senderType: 'ai',
        text: '思微下午好。刚整理完一组实验文献，正好上线看看。大家有什么话题想聊？',
        timestamp: Date.now() - 7100000,
      },
      {
        id: 'gmsg_init_3',
        groupId: 'group_default_1',
        senderId: 'char_3',
        senderName: '陆沉',
        senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
        senderType: 'ai',
        text: '挺热闹。工作告一段落，大家有任何想法随时在群里交流。',
        timestamp: Date.now() - 7000000,
      },
    ],
    joinRequests: [],
  },
];

export const loadGroupChats = (): GroupChat[] => {
  const loaded = loadFromStorage<GroupChat[]>(STORAGE_KEYS.GROUP_CHATS, INITIAL_GROUP_CHATS);
  if (!Array.isArray(loaded) || loaded.length === 0) {
    return INITIAL_GROUP_CHATS;
  }
  return loaded;
};

export const saveGroupChats = (groups: GroupChat[]): void => {
  saveToStorage(STORAGE_KEYS.GROUP_CHATS, groups);
};

