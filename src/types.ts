export type AppId =
  | 'wechat'
  | 'menstrual'
  | 'settings'
  | 'beautification'
  | 'connectivity'
  | 'permissions'
  | 'apimonitor'
  | 'memo'
  | 'worldbook'
  | 'gamecenter'
  | 'weather'
  | 'lock';

export interface WorldBookEntry {
  id: string;
  keyword: string;
  content: string;
  enabled?: boolean;
}

export interface WorldBook {
  id: string;
  title: string;
  description: string;
  tags: string[];
  worldSetting: string; // 核心世界观背景、法则设定、时代历史等
  entries: WorldBookEntry[]; // 专有名词与词条设定
  associatedCharacterIds: string[]; // 关联的 AI 角色 ID
  createdAt: number;
  updatedAt: number;
}

export interface AppIconConfig {
  id: string;
  name: string;
  appId: AppId;
  pageIndex: number;
  positionIndex: number;
  customImage?: string;
  builtInIcon?: string;
}

export interface WidgetConfig {
  id: string;
  type: 'time' | 'calendar' | 'memo' | 'photo' | 'sticker' | 'menstrual' | 'weather';
  pageIndex: number;
  title?: string;
  photoList?: string[];
  stickerTitle?: string;
  stickerTargetDate?: string;
  stickerIsCountdown?: boolean;
  timeCity?: string;
  timeOffset?: number; // Offset in hours relative to UTC (e.g. 8 for GMT+8)
}

export interface AiCharacterModelConfig {
  modelName?: string;
  temperature?: number;
  systemPromptPrefix?: string;
}

export interface AiCharacter {
  id: string;
  name: string;
  avatar: string;
  wxid: string;
  persona: string;
  personality?: string;
  greeting: string;
  memories: string[];
  isLocked: boolean;
  tags: string[];
  relationship?: string;
  createdAt?: number;
  isCustom?: boolean;
  modelConfig?: AiCharacterModelConfig;
  customBackground?: string;
  enableMenstrualCare?: boolean;
  menstrualCare?: {
    enabled?: boolean;
    notificationFrequency?: string;
  };
  unreadAiCount?: number;
  lastViewedTimestamp?: number;
}

export interface ChatMessage {
  id: string;
  characterId: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
  thinkingProcess?: string;
  quoteMessageId?: string;
  isRefreshed?: boolean;
}

export type GroupMemberType = 'human' | 'ai' | 'npc';
export type GroupMemberRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  id: string; // Unique member ID within system/group
  name: string; // Display name
  avatar: string; // Avatar URL
  memberType: GroupMemberType; // 'human' | 'ai' | 'npc'
  role: GroupMemberRole; // 'owner' | 'admin' | 'member'
  joinedAt: number;
  wxid?: string;
  characterId?: string; // Links to underlying AiCharacter if AI/NPC
  customPersona?: string; // Group-specific persona override
  customPersonality?: string; // Group-specific personality override
  customModelName?: string; // Group-specific model override
  memories?: string[]; // Independent memories
  isMuted?: boolean;
}

export interface GroupChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderType: GroupMemberType;
  text: string;
  timestamp: number;
  mentionedMemberIds?: string[]; // Member IDs or ['@all']
  quoteMessageId?: string;
  quoteMessage?: {
    id: string;
    senderName: string;
    text: string;
  };
  thinkingProcess?: string;
}

export interface GroupJoinRequest {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userBio?: string;
  inviteCodeUsed: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: number;
  reviewedAt?: number;
}

export interface GroupChat {
  id: string;
  name: string;
  avatar: string;
  notice?: string;
  ownerId: string;
  members: GroupMember[];
  messages: GroupChatMessage[];
  createdAt: number;
  updatedAt: number;
  inviteCode: string;
  inviteCodeActive: boolean;
  inviteCodeExpiresAt?: number;
  joinRequests?: GroupJoinRequest[];
  isPinned?: boolean;
}

export interface MomentPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  images?: string[];
  timestamp: number;
  likes: { id: string; name: string; avatar: string }[];
  comments: { id: string; authorId: string; authorName: string; authorAvatar: string; text: string; timestamp: number }[];
}

export interface UserProfile {
  avatar: string;
  name: string;
  wxid: string;
  bio: string;
  persona: string;
  preferences: string;
  inviteCode?: string;
  personality?: string;
  interests?: string;
  chatCarePreference?: string;
}

export interface MenstrualRecord {
  startDate: string; // YYYY-MM-DD
  endDate?: string;  // YYYY-MM-DD
}

export interface MenstrualData {
  cycleLength: number; // default 28
  periodDuration: number; // default 5
  records: MenstrualRecord[];
  notes: Record<string, string>; // DateStr -> user daily note
  symptoms?: Record<string, string[]>; // DateStr -> ['痛经/腹痛', '腰酸', '疲惫嗜睡', '情绪烦躁', '手脚冰凉']
  aiAccessEnabled: boolean;
}

export interface Memo {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  tags?: string[];
}

export interface ApiLog {
  id: string;
  appName: string;
  timestamp: number;
  modelName: string;
  interfaceType: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  purpose: string;
}

export interface AiDevicePermissions {
  discoverDevices: boolean; // AI发现设备
  viewStatus: boolean; // AI查看设备状态
  connectDevice: boolean; // AI连接设备
  controlDevice: boolean; // AI执行设备操作
  proactiveUse: boolean; // AI主动使用设备
  autoExecute?: boolean; // AI免弹窗自动执行
}

export interface AiPermissions {
  realDevice: {
    notifications: boolean; // 真实系统通知与桌面提醒
    vibration: boolean; // 真实物理振动反馈
    geolocation: boolean; // 真实 GPS 经纬度与定位环境感知
    clipboard: boolean; // 真实系统剪贴板读写
    microphone: boolean; // 真实麦克风与环境音感知
    wakeLock: boolean; // 保持手机屏幕常亮唤醒
    batterySense: boolean; // 真实电量与充电状态感知
  };
  basic: {
    location: boolean;
    floatingWindow: boolean;
    appList: boolean;
    gyroscope: boolean;
  };
  highLevel: {
    virtualAppNav: boolean;
    appLock: boolean;
    forceLockScreen: boolean;
  };
  appAccess: {
    menstrualData: boolean;
    memosData: boolean;
    momentsData: boolean;
    worldBookData: boolean; // 允许基于世界书设定回复
    weatherData: boolean; // 允许读取实时天气数据与预警
    weatherCare: boolean; // 允许 AI 依据突发天气主动关怀问候
  };
  deviceAccess: AiDevicePermissions; // 外部设备与智能硬件管理权限 (默认关闭，需用户主动授权)
}

export type ProviderType =
  | 'google_gemini'
  | 'openai_compatible'
  | 'anthropic_compatible'
  | 'deepseek'
  | 'openrouter'
  | 'groq'
  | 'siliconflow'
  | 'ollama'
  | 'custom';

export interface RemoteModelItem {
  id: string;
  name?: string;
  owned_by?: string;
  created?: number;
  type?: 'text' | 'image' | 'voice' | 'multimodal' | 'embedding';
  description?: string;
  contextWindow?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  statusText?: string;
  providerType: string;
  checkedEndpoint: string;
  message: string;
  error?: string;
  errorType?: 'auth_error' | 'network_error' | 'not_found' | 'rate_limit' | 'server_error' | 'timeout' | 'unknown';
  availableModelsCount?: number;
  maskedKey?: string;
}

export interface ModelFetchResult {
  success: boolean;
  models: RemoteModelItem[];
  supported: boolean;
  message: string;
  error?: string;
  statusCode?: number;
  sourceEndpoint?: string;
}

export interface ModelTestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  reply: string;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
  errorType?: string;
}

export interface ApiConfig {
  // 文本 / 对话 LLM
  textProvider?: ProviderType;
  textApiKey: string;
  textModel: string;
  textBaseUrl?: string;
  textEnableStream?: boolean;

  // 图像生成
  imageProvider?: ProviderType;
  imageApiKey: string;
  imageModel: string;
  imageBaseUrl?: string;

  // 语音合成
  voiceProvider?: ProviderType;
  voiceApiKey: string;
  voiceModel: string;
  voiceBaseUrl?: string;
  voiceVoiceName?: string;

  // 全局网络配置
  timeoutMs?: number;
  customHeaders?: Record<string, string>;
}

export interface AiControls {
  backgroundActive: boolean;
  proactivePopups: boolean;
}

// ==================== 外部设备与智能中心系统 ====================
export type DeviceProtocol = 'wifi' | 'bluetooth' | 'zigbee' | 'matter' | 'ble' | 'cloud';

// 4大核心设备分类体系
export type DeviceCategory =
  | 'smart_home' // 1. 智能家居：空调、灯、扫地机、窗帘、热水壶等
  | 'audio' // 2. 音频设备：蓝牙耳机、蓝牙音箱等
  | 'interactive' // 3. 互动设备：支持标准协议的个人互动设备 (BLE标准振动/节律/强度协议)
  | 'other' // 4. 其他设备：暂时无法分类的兼容设备
  | 'climate' // 兼容子类别
  | 'light'
  | 'earphone'
  | 'cleaner'
  | 'kitchen'
  | 'security'
  | 'curtain'
  | 'power'
  | 'sensor';

export type DeviceConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'offline';

export type DeviceRiskLevel = 'low' | 'medium' | 'high';

export interface DeviceActionParamOption {
  label: string;
  value: any;
}

export interface DeviceActionParamSchema {
  name: string;
  label: string;
  type: 'boolean' | 'number' | 'string' | 'enum';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: DeviceActionParamOption[];
  defaultValue?: any;
}

export interface DeviceActionDefinition {
  id: string;
  name: string;
  description: string;
  riskLevel: DeviceRiskLevel;
  paramsSchema?: DeviceActionParamSchema[];
}

export interface SmartDevice {
  id: string;
  name: string;
  category: DeviceCategory; // 4大核心分类：'smart_home' | 'audio' | 'interactive' | 'other'
  subType?: string; // 具体子类型，如 '智能空调', '蓝牙音箱', '标准互动仪', '智能门锁' 等
  protocol: DeviceProtocol;
  room: string;
  status: DeviceConnectionStatus;
  battery?: number; // 0~100 (if battery-powered)
  signalStrength?: number; // 0~100 (%) or RSSI
  ipOrAddress?: string;
  model?: string;
  firmwareVersion?: string;
  lastActiveTime: number;
  capabilities: string[]; // 支持的功能描述清单，如 ['电源开关', '1-5档强度调节', '波浪/脉冲模式', '急停安全保护']
  aiAccessAllowed: boolean; // 用户授权 AI：设备级独立 AI 控制开关 (设备已连接与 AI 控制独立)
  state: Record<string, any>;
  supportedActions: DeviceActionDefinition[];
  isRealHardware?: boolean; // 是否为真实 Web Bluetooth / 真实物理外设
  isSimulation?: boolean; // 是否为模拟测试设备
  bleDeviceId?: string; // 物理蓝牙硬件 ID
}

export interface DeviceOperationLog {
  id: string;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  actionId: string;
  actionName: string;
  params?: Record<string, any>;
  source: 'user' | 'ai' | 'automation';
  aiCharacterName?: string;
  success: boolean;
  message: string;
  riskLevel: DeviceRiskLevel;
}

export interface DeviceActionResult {
  success: boolean;
  message: string;
  deviceId: string;
  deviceName: string;
  actionId: string;
  newState?: Record<string, any>;
  requiresConfirmation?: boolean;
  riskLevel?: DeviceRiskLevel;
  confirmationPrompt?: string;
}

export interface BluetoothDevice {
  id: string;
  name: string;
  type: 'watch' | 'headphone' | 'health' | 'other';
  connected: boolean;
  rssi: number;
}

export type GomokuPiece = 'black' | 'white' | null;
export type GomokuDifficulty = 'easy' | 'normal' | 'hard';
export type GomokuGameMode = 'pve' | 'eve'; // 玩家vsAI 或 AI vs AI

export interface GomokuMove {
  r: number;
  c: number;
  color: 'black' | 'white';
  order: number;
}

export interface GomokuRecord {
  id: string;
  timestamp: number;
  mode: GomokuGameMode;
  playerColor: 'black' | 'white';
  opponentId: string;
  opponentName: string;
  opponentAvatar: string;
  ai2Id?: string;
  ai2Name?: string;
  ai2Avatar?: string;
  difficulty: GomokuDifficulty;
  result: 'win' | 'loss' | 'draw' | 'ai1_win' | 'ai2_win';
  totalMoves: number;
  durationSec: number;
}

export interface GomokuStats {
  totalGames: number;
  playerWins: number;
  aiWins: number;
  draws: number;
  winRate: number;
}

export type TicTacToePiece = 'X' | 'O' | null;
export type TicTacToeDifficulty = 'easy' | 'normal' | 'hard';
export type TicTacToeGameMode = 'pve' | 'eve';

export interface TicTacToeMove {
  index: number;
  r: number;
  c: number;
  symbol: 'X' | 'O';
  order: number;
}

export interface TicTacToeRecord {
  id: string;
  timestamp: number;
  mode: TicTacToeGameMode;
  playerSymbol: 'X' | 'O';
  opponentId: string;
  opponentName: string;
  opponentAvatar: string;
  ai2Id?: string;
  ai2Name?: string;
  ai2Avatar?: string;
  difficulty: TicTacToeDifficulty;
  result: 'win' | 'loss' | 'draw' | 'ai1_win' | 'ai2_win';
  totalMoves: number;
  durationSec: number;
}

export interface TicTacToeStats {
  totalGames: number;
  playerWins: number;
  aiWins: number;
  draws: number;
  winRate: number;
}

export type RpsGesture = 'rock' | 'paper' | 'scissors';
export type RpsGameMode = 'pve' | 'eve';
export type RpsResult = 'win' | 'loss' | 'draw' | 'ai1_win' | 'ai2_win';

export interface RpsRecord {
  id: string;
  timestamp: number;
  mode: RpsGameMode;
  playerGesture: RpsGesture;
  aiGesture: RpsGesture;
  opponentId: string;
  opponentName: string;
  opponentAvatar: string;
  ai2Id?: string;
  ai2Name?: string;
  ai2Avatar?: string;
  result: RpsResult;
  question?: string;
  answer?: string;
  questionAsker?: string;
  questionAnswerer?: string;
  streakAfter?: number;
}

export interface RpsStats {
  currentStreak: number;
  maxStreak: number;
  totalGames: number;
  playerWins: number;
  aiWins: number;
  draws: number;
  winRate: number;
}

// ==================== 心有灵犀 (Telepathy / Mind Sync Game) ====================
export type TelepathyGameMode = 'single' | '5_rounds' | '10_rounds' | 'endless';

export interface TelepathyQuestionOption {
  id: string; // e.g. 'A', 'B', 'C', 'D'
  text: string;
  icon?: string;
}

export interface TelepathyQuestion {
  id: string;
  category: 'daily' | 'preference' | 'personality' | 'scenario' | 'relationship';
  categoryLabel: string;
  question: string;
  options: TelepathyQuestionOption[];
}

export interface TelepathyRoundResult {
  roundIndex: number;
  question: TelepathyQuestion;
  playerChoiceId: string;
  playerChoiceText: string;
  aiChoiceId: string;
  aiChoiceText: string;
  isMatch: boolean;
  aiReaction: string; // AI 根据自身人设和判定结果生成的即时反应
}

export interface TelepathyRecord {
  id: string;
  timestamp: number;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  gameMode: TelepathyGameMode;
  totalRounds: number;
  matchCount: number;
  matchRate: number; // 0 ~ 100
  maxStreak: number;
  rounds: TelepathyRoundResult[];
  affinityLevelTitle: string; // e.g. '刚认识' | '有点默契' | '挺有默契' | '非常默契' | '心有灵犀 ❤️'
  generatedMemory?: string; // 记忆联动生成的记忆内容 (若玩家允许)
}

export interface TelepathyCharacterStats {
  characterId: string;
  characterName: string;
  characterAvatar: string;
  totalQuestions: number;
  totalMatches: number;
  matchRate: number;
  currentStreak: number;
  maxStreak: number;
  highestScore: number; // 该角色最高单次默契分/局内最高匹配数
  totalGamesPlayed: number;
  lastPlayedTimestamp?: number;
}

// ----------------------------------------------------
// Weather & AI Weather Perception / Proactive Care Types
// ----------------------------------------------------

export interface WeatherAlert {
  id: string;
  title: string;
  level: 'blue' | 'yellow' | 'orange' | 'red' | 'info';
  levelText: string;
  description: string;
  pubTime: string;
}

export interface WeatherHourlyItem {
  time: string; // e.g. "15:00"
  timestamp: number;
  temp: number; // °C
  feelsLike: number; // °C
  condition: string; // "晴", "多云", "小雨", "雷阵雨", etc.
  conditionCode: number; // WMO Code
  precipProbability: number; // 0 - 100 %
  precipitation: number; // mm
  windSpeed: number; // km/h
}

export interface WeatherDailyItem {
  date: string; // "2026-08-16"
  dayOfWeek: string; // "今天", "周一", "周二", etc.
  tempMin: number;
  tempMax: number;
  condition: string;
  conditionCode: number;
  precipProbability: number;
}

export interface WeatherDataSourceInfo {
  serviceName: string; // 气象预报数据源 (e.g. "Open-Meteo WMO / ECMWF Forecast API")
  geocodingService: string; // 地理逆编码/搜索服务 (e.g. "Open-Meteo & BigDataCloud / Nominatim")
  airQualityService?: string; // 空气质量数据源 (e.g. "Open-Meteo European/Copernicus Atmosphere Service")
  requestTimestamp: number; // API 请求发起时间戳
  responseTimestamp: number; // API 响应接收时间戳
  networkLatencyMs: number; // 网络传输耗时 (ms)
  isFromCache: boolean; // 是否是离线/网络失败回退缓存
  cacheTimestamp?: number; // 缓存生成时间
  timezone: string; // 气象站时区 (e.g. "Asia/Shanghai")
  elevation?: number; // 海拔高度 (米)
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface WeatherData {
  city: string;
  country?: string;
  latitude: number;
  longitude: number;
  temp: number; // 当前气温 °C
  feelsLike: number; // 体感温度 °C
  tempMin: number; // 今日最低温
  tempMax: number; // 今日最高温
  condition: string; // 天气现象 (晴, 多云, 阴, 小雨, 大雨, 雷阵雨等)
  conditionCode: number; // WMO 编码
  humidity: number; // 相对湿度 %
  windSpeed: number; // 风速 km/h
  windDirection: string; // 风向 (e.g. "东南风 3级")
  precipProbability: number; // 降雨概率 %
  precipitation: number; // 降雨量 mm
  uvIndex: number; // 紫外线指数 (0-11)
  airQuality?: {
    aqi?: number;
    label?: string; // "优", "良", "轻度污染", "暂无数据" etc.
    pm25?: number;
    pm10?: number;
  };
  hourly: WeatherHourlyItem[];
  daily: WeatherDailyItem[];
  alerts: WeatherAlert[];
  updatedAt: number;
  isAutoLocation: boolean;
  rainForecastSummary?: string; // e.g. "未来2小时无雨" 或 "预计17:00开始降雨，概率85%"
  locationStatus?: 'gps_active' | 'manual_city' | 'permission_denied' | 'pending' | 'error';
  locationError?: string;
  dataSourceInfo?: WeatherDataSourceInfo;
}

export interface WeatherConfig {
  locationMode: 'auto' | 'manual';
  selectedCity: string;
  latitude?: number;
  longitude?: number;
  autoRefreshIntervalMinutes: number; // default 15
  lastUpdated?: number;
}

export interface WeatherCareConfig {
  enabled: boolean; // AI天气主动关心总开关
  dndEnabled: boolean; // 免打扰时间开关
  dndStart: string; // e.g. "23:00"
  dndEnd: string; // e.g. "07:00"
  cooldownHours: number; // 同类天气事件冷却间隔 (默认 4 小时)
  enableScheduleAwareness: boolean; // 结合桌面待办/日程感知
  triggers: {
    rainSoon: boolean; // 即将下雨
    highRainChance: boolean; // 高降雨概率 (>60%)
    severeWeather: boolean; // 暴雨/强对流/雷暴恶劣天气
    highTemp: boolean; // 高温天气 (>35°C)
    lowTemp: boolean; // 低温寒潮 (<5°C)
    tempDropOrRise: boolean; // 剧烈升降温 (温差 ≥ 6°C)
    strongWind: boolean; // 大风天气 (≥ 35km/h)
    weatherAlerts: boolean; // 重要气象灾害预警
  };
}

export type WeatherEventType =
  | 'rain_soon'
  | 'high_rain_chance'
  | 'severe_weather'
  | 'high_temp'
  | 'low_temp'
  | 'temp_drop'
  | 'temp_rise'
  | 'strong_wind'
  | 'weather_alert';

export interface WeatherEvent {
  type: WeatherEventType;
  title: string;
  summary: string;
  detail: string;
  severity: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: number;
  relatedSchedule?: string; // 关联的备忘录/待办日程
  weatherSnapshot: {
    temp: number;
    feelsLike: number;
    condition: string;
    precipProbability: number;
    rainStartTime?: string;
    alertTitle?: string;
    city: string;
  };
}



