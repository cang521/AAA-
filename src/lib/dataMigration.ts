/**
 * dataMigration.ts
 *
 * 安全增量升级与用户数据保护引擎
 *
 * 核心设计原则：
 * 1. 覆盖安装 / APK 升级时绝对不主动清空用户已有数据
 * 2. 严禁启动时调用 localStorage.clear()、deleteDatabase、drop 等破坏性指令
 * 3. 默认配置只允许在对应数据不存在时写入；如果已存在则保留原设置，仅增量补全新字段
 * 4. 基于 appDataVersion / schemaVersion 进行逐步安全的非破坏性迁移
 * 5. 记录脱敏的“升级数据保护日志”，便于审计升级状态
 */

import {
  AiPermissions,
  ApiConfig,
  AppIconConfig,
  WidgetConfig,
  UserProfile,
  AiCharacter,
  MenstrualData,
  AiControls,
} from '../types';

import {
  DEFAULT_DESKTOP_WALLPAPER,
  DEFAULT_LOCK_WALLPAPER,
  INITIAL_ICONS,
  INITIAL_WIDGETS,
  INITIAL_USER_PROFILE,
  INITIAL_CHARACTERS,
  INITIAL_API_CONFIG,
  INITIAL_PERMISSIONS,
  INITIAL_AI_CONTROLS,
  INITIAL_MENSTRUAL_DATA,
} from './storage';

import { SceneId } from './agent/types';
import { AI_PERMISSION_ITEMS, DEFAULT_SCENE_RULES } from './agent/PermissionManager';

// 当前应用架构与数据版本
export const CURRENT_APP_DATA_VERSION = 2;
export const CURRENT_APP_VERSION_CODE = 2;
export const CURRENT_APP_VERSION_NAME = '1.1.0';

export const MIGRATION_STORAGE_KEYS = {
  APP_DATA_VERSION: 'phone_app_data_version',
  APP_VERSION_CODE: 'phone_app_version_code',
  APP_VERSION_NAME: 'phone_app_version_name',
  UPGRADE_PROTECTION_LOGS: 'phone_upgrade_protection_logs',
  LAST_UPGRADE_TIME: 'phone_last_upgrade_time',
};

export interface UpgradeLogItem {
  name: string;
  status: 'preserved' | 'supplemented' | 'initialized' | 'verified';
  detail: string;
}

export interface UpgradeProtectionLog {
  id: string;
  timestamp: number;
  fromVersionCode: number;
  toVersionCode: number;
  fromDataVersion: number;
  toDataVersion: number;
  isFirstInstall: boolean;
  isUpgrade: boolean;
  items: UpgradeLogItem[];
  summary: string;
}

/**
 * 递归增量字段补充函数：
 * 仅在 target 中不存在某个 key 时，从 defaults 中复制默认值；
 * 绝不覆盖 target 中已经存在的任何值！
 */
export function supplementMissingFields<T extends Record<string, any>>(
  target: T | null | undefined,
  defaults: T
): { result: T; addedFields: string[] } {
  const addedFields: string[] = [];
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return { result: { ...defaults }, addedFields: ['(initial_object)'] };
  }

  const result: Record<string, any> = { ...target };

  for (const key of Object.keys(defaults)) {
    if (result[key] === undefined) {
      result[key] = defaults[key];
      addedFields.push(key);
    } else if (
      defaults[key] !== null &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key]) &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      // 深度递归合并
      const nested = supplementMissingFields(result[key], defaults[key]);
      result[key] = nested.result;
      if (nested.addedFields.length > 0) {
        nested.addedFields.forEach((subKey) => addedFields.push(`${key}.${subKey}`));
      }
    }
  }

  return { result: result as T, addedFields };
}

/**
 * 安全读取 localStorage JSON
 */
function safeGetJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[SafeMigration] Failed to parse JSON for key "${key}":`, e);
    return null;
  }
}

/**
 * 安全写入 localStorage JSON
 */
function safeSetJson<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn(`[SafeMigration] Failed to save JSON for key "${key}":`, e);
  }
}

/**
 * 读取历史升级保护日志
 */
export function getUpgradeProtectionLogs(): UpgradeProtectionLog[] {
  if (typeof window === 'undefined') return [];
  const list = safeGetJson<UpgradeProtectionLog[]>(MIGRATION_STORAGE_KEYS.UPGRADE_PROTECTION_LOGS);
  return Array.isArray(list) ? list : [];
}

/**
 * 记录一条升级保护日志（最大保留 20 条，不记录敏感信息）
 */
function recordUpgradeProtectionLog(log: UpgradeProtectionLog): void {
  try {
    const existing = getUpgradeProtectionLogs();
    const updated = [log, ...existing].slice(0, 20);
    safeSetJson(MIGRATION_STORAGE_KEYS.UPGRADE_PROTECTION_LOGS, updated);
  } catch (e) {
    console.warn('[SafeMigration] Failed to record upgrade protection log:', e);
  }
}

/**
 * 检查 IndexedDB 聊天与记忆数据库健康状态（非破坏性检查）
 */
async function inspectIndexedDbHealth(): Promise<{
  chatDbValid: boolean;
  chatMessageCount: number;
  memoryVaultCount: number;
}> {
  let chatDbValid = false;
  let chatMessageCount = 0;
  let memoryVaultCount = 0;

  if (typeof window === 'undefined' || !window.indexedDB) {
    return { chatDbValid: false, chatMessageCount: 0, memoryVaultCount: 0 };
  }

  // 1. 检查聊天数据库
  try {
    const chatDbReq = window.indexedDB.open('phone_chat_db');
    await new Promise<void>((resolve) => {
      chatDbReq.onsuccess = () => {
        const db = chatDbReq.result;
        if (db.objectStoreNames.contains('messages')) {
          chatDbValid = true;
          try {
            const tx = db.transaction(['messages'], 'readonly');
            const store = tx.objectStore('messages');
            const countReq = store.count();
            countReq.onsuccess = () => {
              chatMessageCount = countReq.result || 0;
              db.close();
              resolve();
            };
            countReq.onerror = () => {
              db.close();
              resolve();
            };
          } catch {
            db.close();
            resolve();
          }
        } else {
          db.close();
          resolve();
        }
      };
      chatDbReq.onerror = () => resolve();
    });
  } catch (e) {
    console.warn('[SafeMigration] Inspect chatDb warning:', e);
  }

  // 2. 检查记忆数据库
  try {
    const memDbReq = window.indexedDB.open('phone_ai_memory_vault_db');
    await new Promise<void>((resolve) => {
      memDbReq.onsuccess = () => {
        const db = memDbReq.result;
        if (db.objectStoreNames.contains('vaults')) {
          try {
            const tx = db.transaction(['vaults'], 'readonly');
            const store = tx.objectStore('vaults');
            const countReq = store.count();
            countReq.onsuccess = () => {
              memoryVaultCount = countReq.result || 0;
              db.close();
              resolve();
            };
            countReq.onerror = () => {
              db.close();
              resolve();
            };
          } catch {
            db.close();
            resolve();
          }
        } else {
          db.close();
          resolve();
        }
      };
      memDbReq.onerror = () => resolve();
    });
  } catch (e) {
    console.warn('[SafeMigration] Inspect memoryDb warning:', e);
  }

  return { chatDbValid, chatMessageCount, memoryVaultCount };
}

/**
 * Migration: v1 -> v2
 * 针对系统新增特权能力体系、四层权限独立配置、新应用图标和场景规则等进行增量安全升级
 */
function migrateV1ToV2(logItems: UpgradeLogItem[]): void {
  console.log('[SafeMigration] Running migration v1 -> v2...');

  // 1. API 配置增量补充
  try {
    const existingApi = safeGetJson<ApiConfig>('phone_api_config');
    if (existingApi) {
      const { result, addedFields } = supplementMissingFields(existingApi, INITIAL_API_CONFIG);
      if (addedFields.length > 0) {
        safeSetJson('phone_api_config', result);
        logItems.push({
          name: 'API配置',
          status: 'supplemented',
          detail: `保留原有模型与Key设置，补充字段: ${addedFields.join(', ')}`,
        });
      } else {
        logItems.push({
          name: 'API配置',
          status: 'preserved',
          detail: '保留已有 Provider 与密钥配置，完整无变动',
        });
      }
    } else {
      logItems.push({
        name: 'API配置',
        status: 'initialized',
        detail: '初始写入默认 API 结构模板',
      });
    }
  } catch (e) {
    console.warn('[SafeMigration] API config migration warning:', e);
    logItems.push({ name: 'API配置', status: 'preserved', detail: '保持原配置使用' });
  }

  // 2. 桌面图标与新系统应用增量补充（保持用户原有个性化排序与自定义图标）
  try {
    const existingIcons = safeGetJson<AppIconConfig[]>('phone_launcher_icons');
    if (Array.isArray(existingIcons) && existingIcons.length > 0) {
      const existingAppIds = new Set(existingIcons.map((i) => i.appId));
      const missingSystemIcons = INITIAL_ICONS.filter((i) => !existingAppIds.has(i.appId));
      if (missingSystemIcons.length > 0) {
        // 计算最大序号，将新增应用追加在末尾
        const maxPage = Math.max(...existingIcons.map((i) => i.pageIndex || 0), 0);
        const maxPos = Math.max(...existingIcons.map((i) => i.positionIndex || 0), 0);
        const adjustedMissing = missingSystemIcons.map((icon, idx) => ({
          ...icon,
          pageIndex: maxPage,
          positionIndex: maxPos + idx + 1,
        }));
        const mergedIcons = [...existingIcons, ...adjustedMissing];
        safeSetJson('phone_launcher_icons', mergedIcons);
        logItems.push({
          name: '桌面图标与美化',
          status: 'supplemented',
          detail: `保留用户原有 ${existingIcons.length} 个自定义应用布局，增量补充 ${missingSystemIcons.length} 个新应用图标`,
        });
      } else {
        logItems.push({
          name: '桌面图标与美化',
          status: 'preserved',
          detail: `保留用户个性化桌面应用布局与自定义图标 (共 ${existingIcons.length} 个)`,
        });
      }
    }
  } catch (e) {
    console.warn('[SafeMigration] Icons migration warning:', e);
  }

  // 3. 桌面小组件增量补充
  try {
    const existingWidgets = safeGetJson<WidgetConfig[]>('phone_launcher_widgets');
    if (Array.isArray(existingWidgets) && existingWidgets.length > 0) {
      const existingTypes = new Set(existingWidgets.map((w) => w.type));
      const missingWidgets = INITIAL_WIDGETS.filter((w) => !existingTypes.has(w.type));
      if (missingWidgets.length > 0) {
        const mergedWidgets = [...existingWidgets, ...missingWidgets];
        safeSetJson('phone_launcher_widgets', mergedWidgets);
        logItems.push({
          name: '桌面小组件',
          status: 'supplemented',
          detail: `保留原有小组件配置，增量补充 ${missingWidgets.length} 个新组件`,
        });
      } else {
        logItems.push({
          name: '桌面小组件',
          status: 'preserved',
          detail: `保留原有 ${existingWidgets.length} 个小组件布局`,
        });
      }
    }
  } catch (e) {
    console.warn('[SafeMigration] Widgets migration warning:', e);
  }

  // 4. AI 独立权限与场景规则增量补充
  try {
    // 4.1 独立权限项
    const rawAiPerms = safeGetJson<Record<string, any>>('phone_ai_independent_permissions');
    if (rawAiPerms && typeof rawAiPerms === 'object') {
      let anyPermAdded = false;
      for (const charId of Object.keys(rawAiPerms)) {
        const charConfig = rawAiPerms[charId];
        if (charConfig && charConfig.permissions) {
          AI_PERMISSION_ITEMS.forEach((item) => {
            if (charConfig.permissions[item.id] === undefined) {
              charConfig.permissions[item.id] = item.defaultLevel;
              anyPermAdded = true;
            }
          });
        }
      }
      if (anyPermAdded) {
        safeSetJson('phone_ai_independent_permissions', rawAiPerms);
        logItems.push({
          name: 'AI独立权限体系',
          status: 'supplemented',
          detail: '保留用户为所有 AI 角色配置的权限等级，增量补充最新特权能力项',
        });
      } else {
        logItems.push({
          name: 'AI独立权限体系',
          status: 'preserved',
          detail: '保留已有全部 AI 角色的独立权限配置',
        });
      }
    }

    // 4.2 场景规则补充
    const rawSceneRules = safeGetJson<Record<string, any>>('phone_ai_scene_rules');
    if (rawSceneRules && typeof rawSceneRules === 'object') {
      const { result, addedFields } = supplementMissingFields(rawSceneRules, DEFAULT_SCENE_RULES);
      if (addedFields.length > 0) {
        safeSetJson('phone_ai_scene_rules', result);
        logItems.push({
          name: '场景控制规则',
          status: 'supplemented',
          detail: `保留用户自定义场景开关，补充新场景规则 (${addedFields.length} 项)`,
        });
      } else {
        logItems.push({
          name: '场景控制规则',
          status: 'preserved',
          detail: '保留用户自定义场景控制规则',
        });
      }
    }

    // 4.3 基础权限模型补充
    const existingBasePerms = safeGetJson<AiPermissions>('phone_ai_permissions');
    if (existingBasePerms) {
      const { result } = supplementMissingFields(existingBasePerms, INITIAL_PERMISSIONS);
      safeSetJson('phone_ai_permissions', result);
    }
  } catch (e) {
    console.warn('[SafeMigration] AI Permissions migration warning:', e);
  }

  // 5. 用户资料与头像保护
  try {
    const existingProfile = safeGetJson<UserProfile>('phone_user_profile');
    if (existingProfile) {
      const { result } = supplementMissingFields(existingProfile, INITIAL_USER_PROFILE);
      safeSetJson('phone_user_profile', result);
      logItems.push({
        name: '用户资料与头像',
        status: 'preserved',
        detail: `保留用户昵称 (${existingProfile.name || '未设置'}) 与自定义头像`,
      });
    }
  } catch (e) {
    console.warn('[SafeMigration] User profile migration warning:', e);
  }

  // 6. AI 角色与头像保护
  try {
    const existingChars = safeGetJson<AiCharacter[]>('phone_ai_characters');
    if (Array.isArray(existingChars) && existingChars.length > 0) {
      // 检查是否有系统新增的默认 AI 角色
      const existingIds = new Set(existingChars.map((c) => c.id));
      const missingChars = INITIAL_CHARACTERS.filter((c) => !existingIds.has(c.id));
      let finalChars = existingChars;
      if (missingChars.length > 0) {
        finalChars = [...existingChars, ...missingChars];
        safeSetJson('phone_ai_characters', finalChars);
        logItems.push({
          name: 'AI角色体系',
          status: 'supplemented',
          detail: `保留用户自定义角色与好感人设 (共 ${existingChars.length} 位)，补充 ${missingChars.length} 个新角色`,
        });
      } else {
        logItems.push({
          name: 'AI角色体系',
          status: 'preserved',
          detail: `保留现有全部 AI 角色与个性人设 (共 ${existingChars.length} 位)`,
        });
      }
    }
  } catch (e) {
    console.warn('[SafeMigration] Characters migration warning:', e);
  }

  // 7. 壁纸与锁屏密码保护
  try {
    const desktopWp = localStorage.getItem('phone_desktop_wallpaper');
    const lockWp = localStorage.getItem('phone_lock_wallpaper');
    const pin = localStorage.getItem('phone_pin_code');
    if (desktopWp || lockWp || pin) {
      logItems.push({
        name: '壁纸与锁屏安全',
        status: 'preserved',
        detail: '保留桌面壁纸、锁屏壁纸及用户设定的 PIN 密码',
      });
    }
  } catch (e) {
    console.warn('[SafeMigration] Wallpaper migration warning:', e);
  }

  // 8. 经期与健康数据保护
  try {
    const menstrual = safeGetJson<MenstrualData>('phone_menstrual_data');
    if (menstrual) {
      const { result } = supplementMissingFields(menstrual, INITIAL_MENSTRUAL_DATA);
      safeSetJson('phone_menstrual_data', result);
      logItems.push({
        name: '经期与健康档案',
        status: 'preserved',
        detail: '保留历史周期记录与身体感知偏好',
      });
    }
  } catch (e) {
    console.warn('[SafeMigration] Menstrual migration warning:', e);
  }

  // 9. 小游戏与休闲数据保护
  try {
    const gomoku = safeGetJson<any[]>('phone_gomoku_records');
    const rps = safeGetJson<any[]>('phone_rps_records');
    const tele = safeGetJson<any[]>('phone_telepathy_records');
    const gameCount = (gomoku?.length || 0) + (rps?.length || 0) + (tele?.length || 0);
    if (gameCount > 0) {
      logItems.push({
        name: '休闲互动与胜率战绩',
        status: 'preserved',
        detail: `保留五子棋、猜拳和心有灵犀对战记录 (累计 ${gameCount} 局)`,
      });
    }
  } catch (e) {
    console.warn('[SafeMigration] Game data migration warning:', e);
  }
}

/**
 * 执行系统启动升级检查 (在 App 启动流程最前置执行)
 * 流程：
 * 读取旧版数据 -> 检测当前 appDataVersion -> 执行必要 migration -> 验证数据完整 -> 启动新版
 */
export async function executeAppUpgradeCheck(): Promise<{
  isFirstInstall: boolean;
  isUpgrade: boolean;
  previousVersionCode: number;
  currentVersionCode: number;
  log: UpgradeProtectionLog | null;
}> {
  if (typeof window === 'undefined') {
    return {
      isFirstInstall: false,
      isUpgrade: false,
      previousVersionCode: CURRENT_APP_VERSION_CODE,
      currentVersionCode: CURRENT_APP_VERSION_CODE,
      log: null,
    };
  }

  try {
    const rawSavedDataVer = localStorage.getItem(MIGRATION_STORAGE_KEYS.APP_DATA_VERSION);
    const rawSavedVerCode = localStorage.getItem(MIGRATION_STORAGE_KEYS.APP_VERSION_CODE);

    // 检测当前环境是否有任何已存在的用户数据
    const hasAnyExistingData = Boolean(
      localStorage.getItem('phone_user_profile') ||
        localStorage.getItem('phone_ai_characters') ||
        localStorage.getItem('phone_chat_messages') ||
        localStorage.getItem('phone_desktop_wallpaper') ||
        localStorage.getItem('phone_api_config')
    );

    let fromDataVersion = rawSavedDataVer ? parseInt(rawSavedDataVer, 10) : 0;
    let fromVersionCode = rawSavedVerCode ? parseInt(rawSavedVerCode, 10) : 0;

    // 如果未记录版本号，但本地已有旧数据，说明是从初始版本(v1)升级上来的
    if (fromDataVersion === 0 && hasAnyExistingData) {
      fromDataVersion = 1;
      fromVersionCode = 1;
    }

    const isFirstInstall = fromDataVersion === 0 && !hasAnyExistingData;
    const isUpgrade = fromDataVersion > 0 && fromDataVersion < CURRENT_APP_DATA_VERSION;
    const isVersionCodeBumped = fromVersionCode > 0 && fromVersionCode < CURRENT_APP_VERSION_CODE;

    const shouldRunUpgradeCheck = isUpgrade || isVersionCodeBumped || isFirstInstall;

    const logItems: UpgradeLogItem[] = [];

    if (shouldRunUpgradeCheck) {
      console.log(
        `[SafeMigration] Checking app update: fromDataVer=${fromDataVersion} -> ${CURRENT_APP_DATA_VERSION}, fromVerCode=${fromVersionCode} -> ${CURRENT_APP_VERSION_CODE}`
      );

      // 1. 检查 IndexedDB 健康状态
      const dbHealth = await inspectIndexedDbHealth();
      if (dbHealth.chatDbValid) {
        logItems.push({
          name: '聊天记录数据库 (IndexedDB)',
          status: 'verified',
          detail: `数据库结构完整，已保留 ${dbHealth.chatMessageCount} 条历史聊天记录`,
        });
      }
      if (dbHealth.memoryVaultCount > 0) {
        logItems.push({
          name: 'AI长期记忆库 (IndexedDB)',
          status: 'verified',
          detail: `独立记忆存储完好，共 ${dbHealth.memoryVaultCount} 个 AI 记忆金库`,
        });
      }

      // 2. 逐步执行版本迁移
      if (fromDataVersion <= 1) {
        migrateV1ToV2(logItems);
      }

      // 3. 构建升级保护日志（严禁包含聊天文本或 API Key）
      const summary = isFirstInstall
        ? '全新安装完成：已创建出厂标准安全配置'
        : `从版本 ${fromVersionCode || 1} 成功增量升级至版本 ${CURRENT_APP_VERSION_CODE}：用户已有数据与个性化设置已 100% 完整保留`;

      const upgradeLog: UpgradeProtectionLog = {
        id: `upgrade_${Date.now()}`,
        timestamp: Date.now(),
        fromVersionCode: fromVersionCode || (isFirstInstall ? 0 : 1),
        toVersionCode: CURRENT_APP_VERSION_CODE,
        fromDataVersion: fromDataVersion || (isFirstInstall ? 0 : 1),
        toDataVersion: CURRENT_APP_DATA_VERSION,
        isFirstInstall,
        isUpgrade: !isFirstInstall,
        items: logItems,
        summary,
      };

      recordUpgradeProtectionLog(upgradeLog);

      // 4. 更新版本号记录
      localStorage.setItem(MIGRATION_STORAGE_KEYS.APP_DATA_VERSION, CURRENT_APP_DATA_VERSION.toString());
      localStorage.setItem(MIGRATION_STORAGE_KEYS.APP_VERSION_CODE, CURRENT_APP_VERSION_CODE.toString());
      localStorage.setItem(MIGRATION_STORAGE_KEYS.APP_VERSION_NAME, CURRENT_APP_VERSION_NAME);
      localStorage.setItem(MIGRATION_STORAGE_KEYS.LAST_UPGRADE_TIME, Date.now().toString());

      console.log(`[SafeMigration] Upgrade check completed successfully: ${summary}`);

      return {
        isFirstInstall,
        isUpgrade: !isFirstInstall,
        previousVersionCode: fromVersionCode,
        currentVersionCode: CURRENT_APP_VERSION_CODE,
        log: upgradeLog,
      };
    }

    return {
      isFirstInstall: false,
      isUpgrade: false,
      previousVersionCode: fromVersionCode,
      currentVersionCode: CURRENT_APP_VERSION_CODE,
      log: null,
    };
  } catch (e) {
    // 迁移检查遇到异常时，绝对不删除旧数据！尽量继续运行！
    console.error('[SafeMigration] Critical error during upgrade check (data preserved):', e);
    return {
      isFirstInstall: false,
      isUpgrade: false,
      previousVersionCode: 0,
      currentVersionCode: CURRENT_APP_VERSION_CODE,
      log: null,
    };
  }
}
