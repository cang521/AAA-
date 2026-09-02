import React, { useState, useEffect } from 'react';
import {
  AppIconConfig,
  WidgetConfig,
  AiCharacter,
  ChatMessage,
  MomentPost,
  UserProfile,
  MenstrualData,
  ApiConfig,
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
  loadApiConfig,
  saveApiConfig,
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
} from './lib/storage';

import { PhoneContainer } from './components/PhoneContainer';
import { LockScreen } from './components/LockScreen';
import { LauncherHome } from './components/LauncherHome';

import { WeChatApp } from './components/apps/WeChatApp';
import { MenstrualApp } from './components/apps/MenstrualApp';
import { SettingsApp } from './components/apps/SettingsApp';
import { BeautificationApp } from './components/apps/BeautificationApp';
import { ConnectivityApp } from './components/apps/ConnectivityApp';
import { PermissionsApp } from './components/apps/PermissionsApp';
import { ApiMonitorApp } from './components/apps/ApiMonitorApp';
import { MemoApp } from './components/apps/MemoApp';
import { WorldBookApp } from './components/apps/WorldBookApp';
import { GameCenterApp } from './components/apps/GameCenterApp';
import { WeatherApp } from './components/apps/WeatherApp';
import { weatherService } from './lib/weatherService';

export function App() {
  // Lock state
  const [isLocked, setIsLocked] = useState(true);

  // Settings & Beautification state
  const [settings, setSettingsState] = useState(loadSettings());
  const [icons, setIconsState] = useState<AppIconConfig[]>(loadIcons());
  const [widgets, setWidgetsState] = useState<WidgetConfig[]>(loadWidgets());

  // App Data states
  const [characters, setCharactersState] = useState<AiCharacter[]>(loadCharacters());
  const [messages, setMessagesState] = useState<ChatMessage[]>(loadMessages());
  const [moments, setMomentsState] = useState<MomentPost[]>(loadMoments());
  const [userProfile, setUserProfileState] = useState<UserProfile>(loadUserProfile());
  const [menstrualData, setMenstrualDataState] = useState<MenstrualData>(loadMenstrualData());
  const [apiConfig, setApiConfigState] = useState<ApiConfig>(loadApiConfig());
  const [aiControls, setAiControlsState] = useState<AiControls>(loadAiControls());
  const [permissions, setPermissionsState] = useState<AiPermissions>(loadPermissions());
  const [apiLogs, setApiLogsState] = useState<ApiLog[]>(loadApiLogs());
  const [memos, setMemosState] = useState<Memo[]>(loadMemos());
  const [worldBooks, setWorldBooksState] = useState<WorldBook[]>(loadWorldBooks());

  // Active sub-app state
  const [activeAppId, setActiveAppId] = useState<string | null>(null);

  // State Updaters with localStorage Persistence
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

  const updateApiConfig = (newConfig: ApiConfig) => {
    setApiConfigState(newConfig);
    saveApiConfig(newConfig);
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
      apiConfig,
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
      if (parsed.apiConfig) updateApiConfig(parsed.apiConfig);
      if (parsed.aiControls) updateAiControls(parsed.aiControls);
      if (parsed.permissions) updatePermissions(parsed.permissions);
      if (parsed.memos) updateMemos(parsed.memos);
      if (parsed.worldBooks) updateWorldBooks(parsed.worldBooks);

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

  return (
    <div className="w-full h-screen bg-zinc-950 flex items-center justify-center select-none overflow-hidden">
      <PhoneContainer
        onLockClick={() => setIsLocked(true)}
        customCss={settings?.customCss}
      >
        {/* LOCK SCREEN LAYER */}
        {isLocked ? (
          <LockScreen
            wallpaperUrl={settings.lockWallpaper}
            wallpaper={settings.lockWallpaper}
            correctPin={settings.pinCode}
            pinCode={settings.pinCode}
            isPinEnabled={settings.isPinEnabled}
            onUnlock={() => setIsLocked(false)}
          />
        ) : activeAppId ? (
          /* SUB-APP ACTIVE VIEW LAYER */
          <div className="w-full h-full relative">
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
                apiConfig={apiConfig}
                worldBooks={worldBooks}
                onUpdateCharacters={updateCharacters}
                onUpdateMessages={updateMessages}
                onUpdateMoments={updateMoments}
                onUpdateUserProfile={updateUserProfile}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'worldbook' && (
              <WorldBookApp
                onBackToLauncher={() => setActiveAppId(null)}
                worldBooks={worldBooks}
                characters={characters}
                apiConfig={apiConfig}
                onUpdateWorldBooks={updateWorldBooks}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'gamecenter' && (
              <GameCenterApp
                onBackToLauncher={() => setActiveAppId(null)}
                characters={characters}
                apiConfig={apiConfig}
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
                apiConfig={apiConfig}
                aiControls={aiControls}
                onSaveApiConfig={updateApiConfig}
                onSaveAiControls={updateAiControls}
                onClearChats={() => updateMessages([])}
                onExportData={handleExportData}
                onImportData={handleImportData}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'beautification' && (
              <BeautificationApp
                onBackToLauncher={() => setActiveAppId(null)}
                desktopWallpaper={settings.desktopWallpaper}
                lockWallpaper={settings.lockWallpaper}
                customCss={settings.customCss}
                pinCode={settings.pinCode}
                isPinEnabled={settings.isPinEnabled}
                icons={icons}
                apiConfig={apiConfig}
                onUpdateDesktopWallpaper={(url) => {
                  const updated = { ...settings, desktopWallpaper: url };
                  setSettingsState(updated);
                  saveSettings(updated);
                }}
                onUpdateLockWallpaper={(url) => {
                  const updated = { ...settings, lockWallpaper: url };
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
                apiConfig={apiConfig}
                onSaveMemo={saveMemo}
                onAddApiLog={addApiLog}
              />
            )}

            {activeAppId === 'permissions' && (
              <PermissionsApp
                onBackToLauncher={() => setActiveAppId(null)}
                permissions={permissions}
                onUpdatePermissions={updatePermissions}
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

            {/* Fallback for unhandled or custom app IDs */}
            {![
              'wechat',
              'weather',
              'worldbook',
              'gamecenter',
              'menstrual',
              'settings',
              'beautification',
              'connectivity',
              'permissions',
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
            wallpaperUrl={settings.desktopWallpaper}
            wallpaper={settings.desktopWallpaper}
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
      </PhoneContainer>
    </div>
  );
}

export default App;
