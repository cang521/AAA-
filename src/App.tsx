import React, { useState, useEffect } from 'react';
import {
  AppIconConfig,
  WidgetConfig,
  AiCharacter,
  ChatMessage,
  MomentPost,
  UserProfile,
  MenstrualData,
  AiControls,
  AiPermissions,
  ApiLog,
  Memo,
  WorldBook,
} from './types';
import {
  loadIcons,
  saveIcons,
  loadWidgets,
  saveWidgets,
  loadLauncherPagesCount,
  saveLauncherPagesCount,
  loadCharacters,
  saveCharacters,
  loadMessages,
  saveMessages,
  loadMoments,
  saveMoments,
  loadUserProfile,
  saveUserProfile,
  loadMenstrualData,
  saveMenstrualData,
  loadAiControls,
  saveAiControls,
  loadPermissions,
  savePermissions,
  loadApiLogs,
  saveApiLogs,
  loadMemos,
  saveMemos,
  loadSettings,
  saveSettings,
  loadWorldBooks,
  saveWorldBooks,
  DEFAULT_DESKTOP_WALLPAPER,
  DEFAULT_LOCK_WALLPAPER,
} from './lib/storage';

import { PhoneContainer } from './components/PhoneContainer';
import { LockScreen } from './components/LockScreen';
import { LauncherHome } from './components/LauncherHome';

import { WeChatApp } from './components/apps/WeChatApp';
import { MenstrualApp } from './components/apps/MenstrualApp';
import { SettingsApp } from './components/apps/SettingsApp';
import { BeautificationApp } from './components/apps/BeautificationApp';
import { ConnectivityApp } from './components/apps/ConnectivityApp';
import { AiPermissionsApp } from './components/apps/AiPermissionsApp';
import { AiActivityLogsApp } from './components/apps/AiActivityLogsApp';
import { ApiMonitorApp } from './components/apps/ApiMonitorApp';
import { MemoApp } from './components/apps/MemoApp';
import { WorldBookApp } from './components/apps/WorldBookApp';
import { GameCenterApp } from './components/apps/GameCenterApp';
import { WeatherApp } from './components/apps/WeatherApp';
import { OfflineModeHome } from './components/offline/OfflineModeHome';
import { CLOUD_MILK_DESKTOP_WALLPAPER, CLOUD_MILK_LOCK_WALLPAPER } from './lib/themeWallpapers';
import { initAllAiMemoryVaults } from './lib/aiMemoryVaultDb';
import { checkAndRunScheduledArchives } from './lib/chatArchiveDb';
import { InPhoneAskDialog } from './components/agent/InPhoneAskDialog';
import { InPhoneNotificationBanner } from './components/agent/InPhoneNotificationBanner';
import { agentOrchestrator } from './lib/agent/AgentOrchestrator';
import { proactiveScheduler } from './lib/proactive/ProactiveScheduler';
import { AgentAskPrompt, InPhoneNotification } from './lib/agent/types';
import { getApiConfigForEngine } from './lib/apiConfigStore';
import { autoPaginateLayout } from './lib/layoutPaginator';

export function App() {
  // Lock state
  const [isLocked, setIsLocked] = useState(true);

  // Settings & Beautification state
  const [settings, setSettingsState] = useState(loadSettings());
  const [pagesCount, setPagesCountState] = useState<number>(loadLauncherPagesCount());
  const [icons, setIconsState] = useState<AppIconConfig[]>(loadIcons());
  const [widgets, setWidgetsState] = useState<WidgetConfig[]>(loadWidgets());

  // App Data states
  const [characters, setCharactersState] = useState<AiCharacter[]>(loadCharacters());
  const [messages, setMessagesState] = useState<ChatMessage[]>(loadMessages());
  const [moments, setMomentsState] = useState<MomentPost[]>(loadMoments());
  const [userProfile, setUserProfileState] = useState<UserProfile>(loadUserProfile());
  const [menstrualData, setMenstrualDataState] = useState<MenstrualData>(loadMenstrualData());
  const [aiControls, setAiControlsState] = useState<AiControls>(loadAiControls());
  const [permissions, setPermissionsState] = useState<AiPermissions>(loadPermissions());
  const [apiLogs, setApiLogsState] = useState<ApiLog[]>(loadApiLogs());
  const [memos, setMemosState] = useState<Memo[]>(loadMemos());
  const [worldBooks, setWorldBooksState] = useState<WorldBook[]>(loadWorldBooks());

  // Active sub-app state
  const [activeAppId, setActiveAppId] = useState<string | null>(null);

  // Phase 2: Agent Orchestration states
  const [activeAskPrompt, setActiveAskPrompt] = useState<AgentAskPrompt | null>(null);
  const [activeNotification, setActiveNotification] = useState<InPhoneNotification | null>(null);

  // Subscribe to Agent Orchestrator & Start Background Proactive Scheduler
  useEffect(() => {
    proactiveScheduler.start();

    const unsubAsk = agentOrchestrator.subscribeAskPrompt((prompt) => {
      setActiveAskPrompt(prompt);
    });

    const unsubNotif = agentOrchestrator.subscribeNotification((notif) => {
      setActiveNotification(notif);
    });

    const handleProactiveMsg = () => {
      setMessagesState(loadMessages());
      setCharactersState(loadCharacters());
    };
    window.addEventListener('ai_proactive_message_received', handleProactiveMsg);

    return () => {
      unsubAsk();
      unsubNotif();
      window.removeEventListener('ai_proactive_message_received', handleProactiveMsg);
    };
  }, []);

  // Automatically ensure independent local memory vaults exist for each AI character
  useEffect(() => {
    if (characters && characters.length > 0) {
      initAllAiMemoryVaults(characters).catch((e) => {
        console.warn('Auto initialize AI memory vaults warning:', e);
      });
    }
  }, [characters]);

  // Auto-paginate desktop layout on startup to prevent vertical scrolling overflow
  useEffect(() => {
    const paginated = autoPaginateLayout(widgets, icons, pagesCount);
    if (paginated.hasChanged) {
      setWidgetsState(paginated.widgets);
      saveWidgets(paginated.widgets);
      setIconsState(paginated.icons);
      saveIcons(paginated.icons);
      setPagesCountState(paginated.pagesCount);
      saveLauncherPagesCount(paginated.pagesCount);
    }
  }, []);

  // State Updaters with localStorage Persistence
  const updatePagesCount = (newCount: number) => {
    const valid = Math.max(1, newCount);
    setPagesCountState(valid);
    saveLauncherPagesCount(valid);
  };

  const updateIcons = (newIcons: AppIconConfig[]) => {
    setIconsState(newIcons);
    saveIcons(newIcons);
  };

  const updateWidgets = (newWidgets: WidgetConfig[]) => {
    setWidgetsState(newWidgets);
    saveWidgets(newWidgets);
  };

  const updateCharacters = (newChars: AiCharacter[]) => {
    setCharactersState(newChars);
    saveCharacters(newChars);
  };

  const updateMessages = (newMsgs: ChatMessage[]) => {
    setMessagesState(newMsgs);
    saveMessages(newMsgs);
  };

  const updateMoments = (newMoments: MomentPost[]) => {
    setMomentsState(newMoments);
    saveMoments(newMoments);
  };

  const updateUserProfile = (newProfile: UserProfile) => {
    setUserProfileState(newProfile);
    saveUserProfile(newProfile);
  };

  const updateMenstrualData = (newData: MenstrualData) => {
    setMenstrualDataState(newData);
    saveMenstrualData(newData);
  };

  const updateAiControls = (newControls: AiControls) => {
    setAiControlsState(newControls);
    saveAiControls(newControls);
  };

  const updatePermissions = (newPerms: AiPermissions) => {
    setPermissionsState(newPerms);
    savePermissions(newPerms);
  };

  const addApiLog = (log: ApiLog) => {
    const updated = [log, ...apiLogs];
    setApiLogsState(updated);
    saveApiLogs(updated);
  };

  const clearApiLogs = () => {
    setApiLogsState([]);
    saveApiLogs([]);
  };

  const updateMemos = (newMemos: Memo[]) => {
    setMemosState(newMemos);
    saveMemos(newMemos);
  };

  const updateWorldBooks = (newBooks: WorldBook[]) => {
    setWorldBooksState(newBooks);
    saveWorldBooks(newBooks);
  };

  const saveMemo = (title: string, content: string) => {
    const newMemo: Memo = {
      id: 'memo_' + Date.now(),
      title,
      content,
      updatedAt: Date.now(),
    };
    updateMemos([newMemo, ...memos]);
  };

  // Export / Import JSON Data
  const handleExportData = () => {
    const fullData = {
      settings,
      icons,
      widgets,
      characters,
      userProfile,
      menstrualData,
      aiControls,
      permissions,
      memos,
      worldBooks,
    };
    const jsonStr = JSON.stringify(fullData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mobile_ai_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refreshAllData = () => {
    setSettingsState(loadSettings());
    setPagesCountState(loadLauncherPagesCount());
    setIconsState(loadIcons());
    setWidgetsState(loadWidgets());
    setCharactersState(loadCharacters());
    setMessagesState(loadMessages());
    setMomentsState(loadMoments());
    setUserProfileState(loadUserProfile());
    setMenstrualDataState(loadMenstrualData());
    setAiControlsState(loadAiControls());
    setPermissionsState(loadPermissions());
    setApiLogsState(loadApiLogs());
    setMemosState(loadMemos());
    setWorldBooksState(loadWorldBooks());
  };

  const handleImportData = (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.settings) {
        setSettingsState(parsed.settings);
        saveSettings(parsed.settings);
      }
      if (parsed.icons) updateIcons(parsed.icons);
      if (parsed.characters) updateCharacters(parsed.characters);
      if (parsed.userProfile) updateUserProfile(parsed.userProfile);
      if (parsed.menstrualData) updateMenstrualData(parsed.menstrualData);
      if (parsed.aiControls) updateAiControls(parsed.aiControls);
      if (parsed.permissions) updatePermissions(parsed.permissions);
      if (parsed.memos) updateMemos(parsed.memos);
      if (parsed.worldBooks) updateWorldBooks(parsed.worldBooks);

      refreshAllData();
      alert('数据导入成功！页面已实时更新。');
    } catch (e) {
      alert('解析导入数据失败，请确认文件是否为正确的 JSON 格式。');
    }
  };

  // Inject custom CSS into DOM head with safety filter against screen hiding
  useEffect(() => {
    let styleEl = document.getElementById('user-custom-css');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'user-custom-css';
      document.head.appendChild(styleEl);
    }
    const safeCss = (settings?.customCss || '').replace(
      /(html|body|#root|\.phone-screen)\s*\{[^}]*display\s*:\s*none[^}]*\}/gi,
      ''
    );
    styleEl.innerHTML = safeCss;
  }, [settings?.customCss]);

  // Scheduled background archive trigger
  useEffect(() => {
    if (characters && characters.length > 0) {
      const charIds = characters.map((c) => c.id);
      checkAndRunScheduledArchives(charIds);

      const handleFocus = () => checkAndRunScheduledArchives(charIds);
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          checkAndRunScheduledArchives(charIds);
        }
      };

      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [characters]);

  // Listen for system theme media query changes for 'system' mode
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const currentEngineConfig = getApiConfigForEngine();

  const activeTheme = settings.theme || 'light';
  const effectiveTheme: 'light' | 'dark' =
    activeTheme === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : activeTheme === 'light' || activeTheme === 'cloud_milk'
      ? 'light'
      : 'dark';

  // Synchronize document root attribute for global modal and body styling
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', effectiveTheme);
      if (effectiveTheme === 'light') {
        document.documentElement.classList.add('theme-light', 'theme-cloud-milk');
        document.documentElement.classList.remove('theme-dark');
      } else {
        document.documentElement.classList.add('theme-dark');
        document.documentElement.classList.remove('theme-light', 'theme-cloud-milk');
      }
    }
  }, [effectiveTheme]);

  const activeWallpaperSource = settings.wallpaperSource || 'default';

  let activeDesktopWallpaper = settings.desktopWallpaper || DEFAULT_DESKTOP_WALLPAPER;
  let activeLockWallpaper = settings.lockWallpaper || DEFAULT_LOCK_WALLPAPER;

  if (activeWallpaperSource === 'theme' && effectiveTheme === 'light') {
    activeDesktopWallpaper = CLOUD_MILK_DESKTOP_WALLPAPER;
    activeLockWallpaper = CLOUD_MILK_LOCK_WALLPAPER;
  } else if (activeWallpaperSource === 'custom') {
    if (settings.customDesktopWallpaper) {
      activeDesktopWallpaper = settings.customDesktopWallpaper;
    }
    if (settings.customLockWallpaper) {
      activeLockWallpaper = settings.customLockWallpaper;
    }
  }

  return (
    <div className="w-full h-screen bg-zinc-950 flex items-center justify-center select-none overflow-hidden">
      <PhoneContainer
        onLockClick={() => setIsLocked(true)}
        customCss={settings?.customCss}
        theme={effectiveTheme}
      >
        {/* LOCK SCREEN LAYER */}
        {isLocked ? (
          <LockScreen
            wallpaperUrl={activeLockWallpaper}
            wallpaper={activeLockWallpaper}
            correctPin={settings.pinCode}
            pinCode={settings.pinCode}
            isPinEnabled={settings.isPinEnabled}
            theme={effectiveTheme}
            onUnlock={() => setIsLocked(false)}
          />
        ) : activeAppId ? (
          /* SUB-APP ACTIVE VIEW LAYER */
          <div className="w-full h-full relative flex flex-col pt-safe pb-safe pl-safe pr-safe bg-zinc-900">
            {activeAppId === 'wechat' && (
              <WeChatApp
                onBackToLauncher={() => setActiveAppId(null)}
                characters={characters}
                messages={messages}
                moments={moments}
                userProfile={userProfile}
                menstrualData={menstrualData}
                memos={memos}
                permissions={permissions}
                apiConfig={currentEngineConfig}
                worldBooks={worldBooks}
                onUpdateCharacters={updateCharacters}
                onUpdateMessages={updateMessages}
                onUpdateMoments={updateMoments}
                onUpdateUserProfile={updateUserProfile}
                onAddApiLog={addApiLog}
                onDataChanged={refreshAllData}
              />
            )}

            {activeAppId === 'worldbook' && (
              <WorldBookApp
                onBackToLauncher={() => setActiveAppId(null)}
                worldBooks={worldBooks}
                characters={characters}
                apiConfig={currentEngineConfig}
                onUpdateWorldBooks={updateWorldBooks}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'gamecenter' && (
              <GameCenterApp
                onBackToLauncher={() => setActiveAppId(null)}
                characters={characters}
                apiConfig={currentEngineConfig}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'menstrual' && (
              <MenstrualApp
                onBackToLauncher={() => setActiveAppId(null)}
                menstrualData={menstrualData}
                onUpdateMenstrualData={updateMenstrualData}
              />
            )}

            {activeAppId === 'settings' && (
              <SettingsApp
                onBackToLauncher={() => setActiveAppId(null)}
                aiControls={aiControls}
                onSaveAiControls={updateAiControls}
                onClearChats={() => updateMessages([])}
                onExportData={handleExportData}
                onImportData={handleImportData}
                onAddApiLog={addApiLog}
                onDataChanged={refreshAllData}
              />
            )}

            {activeAppId === 'beautification' && (
              <BeautificationApp
                onBackToLauncher={() => setActiveAppId(null)}
                desktopWallpaper={activeDesktopWallpaper}
                lockWallpaper={activeLockWallpaper}
                customCss={settings.customCss}
                pinCode={settings.pinCode}
                isPinEnabled={settings.isPinEnabled}
                currentTheme={settings.theme || 'default'}
                wallpaperSource={settings.wallpaperSource || 'default'}
                customDesktopWallpaper={settings.customDesktopWallpaper}
                customLockWallpaper={settings.customLockWallpaper}
                icons={icons}
                apiConfig={currentEngineConfig}
                onUpdateTheme={(themeId) => {
                  const updated = { ...settings, theme: themeId };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdateWallpaperSource={(source) => {
                  const updated = { ...settings, wallpaperSource: source };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdateDesktopWallpaper={(url) => {
                  const updated = {
                    ...settings,
                    desktopWallpaper: url,
                    customDesktopWallpaper: url,
                    wallpaperSource: 'custom' as const,
                  };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdateLockWallpaper={(url) => {
                  const updated = {
                    ...settings,
                    lockWallpaper: url,
                    customLockWallpaper: url,
                    wallpaperSource: 'custom' as const,
                  };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdateCustomCss={(css) => {
                  const updated = { ...settings, customCss: css };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdatePinCode={(pin) => {
                  const updated = { ...settings, pinCode: pin };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdatePinEnabled={(enabled) => {
                  const updated = { ...settings, isPinEnabled: enabled };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdateIcons={updateIcons}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'connectivity' && (
              <ConnectivityApp
                onBackToLauncher={() => setActiveAppId(null)}
                permissions={permissions}
                onUpdatePermissions={updatePermissions}
                apiConfig={currentEngineConfig}
                onSaveMemo={saveMemo}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'permissions' && (
              <AiPermissionsApp
                onBackToLauncher={() => setActiveAppId(null)}
                onOpenActivityLogs={() => setActiveAppId('ai_activity_logs')}
              />
            )}

            {activeAppId === 'ai_activity_logs' && (
              <AiActivityLogsApp
                onBackToLauncher={() => setActiveAppId(null)}
                onOpenPermissions={() => setActiveAppId('permissions')}
              />
            )}

            {activeAppId === 'apimonitor' && (
              <ApiMonitorApp
                onBackToLauncher={() => setActiveAppId(null)}
                apiLogs={apiLogs}
                onClearLogs={clearApiLogs}
              />
            )}

            {activeAppId === 'memo' && (
              <MemoApp
                onBackToLauncher={() => setActiveAppId(null)}
                memos={memos}
                onSaveMemo={saveMemo}
                onDeleteMemo={(id) => updateMemos(memos.filter((m) => m.id !== id))}
                onUpdateMemos={updateMemos}
              />
            )}

            {activeAppId === 'weather' && (
              <WeatherApp
                onBackToLauncher={() => setActiveAppId(null)}
                characters={characters}
                userProfile={userProfile}
                permissions={permissions}
                memos={memos}
                onNavigateToPermissions={() => setActiveAppId('permissions')}
              />
            )}

            {activeAppId === 'offline' && (
              <OfflineModeHome
                characters={characters}
                userProfile={userProfile}
                apiConfig={currentEngineConfig}
                onUpdateCharacters={updateCharacters}
                onBack={() => setActiveAppId(null)}
              />
            )}

            {/* Fallback for unhandled or custom app IDs */}
            {![
              'wechat',
              'offline',
              'weather',
              'worldbook',
              'gamecenter',
              'menstrual',
              'settings',
              'beautification',
              'connectivity',
              'permissions',
              'ai_activity_logs',
              'apimonitor',
              'memo',
            ].includes(activeAppId) && (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-white bg-zinc-900">
                <p className="text-sm font-semibold mb-2">应用加载完成</p>
                <p className="text-xs text-zinc-400 mb-4">应用 ID ({activeAppId}) 已自动链接</p>
                <button
                  onClick={() => setActiveAppId(null)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white shadow-md transition"
                >
                  ⬅ 返回桌面
                </button>
              </div>
            )}
          </div>
        ) : (
          /* LAUNCHER HOME SCREEN LAYER */
          <LauncherHome
            icons={icons}
            widgets={widgets}
            pagesCount={pagesCount}
            onUpdatePagesCount={updatePagesCount}
            wallpaperUrl={activeDesktopWallpaper}
            wallpaper={activeDesktopWallpaper}
            menstrualData={menstrualData}
            memos={memos}
            onUpdateIcons={updateIcons}
            onUpdateWidgets={updateWidgets}
            onOpenApp={(appId) => setActiveAppId(appId)}
            onLaunchApp={(appId) => setActiveAppId(appId)}
            onAddMemo={saveMemo}
            onSaveMemo={saveMemo}
            onDeleteMemo={(id) => updateMemos(memos.filter((m) => m.id !== id))}
          />
        )}

        {/* In-Phone Heads-up Notification Banner */}
        {activeNotification && (
          <InPhoneNotificationBanner
            notification={activeNotification}
            onOpenWechat={() => {
              setIsLocked(false);
              setActiveAppId('wechat');
            }}
            onDismiss={() => agentOrchestrator.dismissNotification()}
          />
        )}

        {/* In-Phone Native Style ASK Handshake Dialog */}
        {activeAskPrompt && (
          <InPhoneAskDialog prompt={activeAskPrompt} />
        )}
      </PhoneContainer>
    </div>
  );
}

export default App;
