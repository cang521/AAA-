import React, { useState, useEffect } from 'react';
import {
  AppIconConfig,
  WidgetConfig,
  AppId,
  MenstrualData,
  Memo,
  WeatherData,
} from '../types';
import { computeCycleStats } from '../lib/menstrual';
import { weatherService } from '../lib/weatherService';
import {
  MessageCircle,
  HeartPulse,
  FileText,
  Activity,
  Palette,
  Settings,
  Link,
  Shield,
  FolderArchive,
  Plus,
  Trash2,
  Edit3,
  Move,
  Clock,
  Calendar as CalendarIcon,
  Image as ImageIcon,
  Tag,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Search,
  BookOpen,
  Gamepad2,
  CloudSun,
  CloudRain,
  Sun,
  Cloud,
  Droplets,
  Wind,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { ImagePickerModal } from './ImagePickerModal';

interface LauncherHomeProps {
  icons: AppIconConfig[];
  widgets: WidgetConfig[];
  pagesCount?: number;
  wallpaperUrl?: string;
  wallpaper?: string;
  menstrualData: MenstrualData;
  memos: Memo[];
  onOpenApp?: (appId: AppId) => void;
  onLaunchApp?: (appId: AppId) => void;
  onUpdateIcons: (icons: AppIconConfig[]) => void;
  onUpdateWidgets: (widgets: WidgetConfig[]) => void;
  onUpdatePagesCount?: (count: number) => void;
  onAddMemo?: (title: string, content: string) => void;
  onSaveMemo?: (title: string, content: string) => void;
  onDeleteMemo?: (id: string) => void;
}

export const LauncherHome: React.FC<LauncherHomeProps> = ({
  icons = [],
  widgets = [],
  pagesCount = 1,
  wallpaperUrl,
  wallpaper,
  menstrualData,
  memos = [],
  onOpenApp,
  onLaunchApp,
  onUpdateIcons,
  onUpdateWidgets,
  onUpdatePagesCount,
  onAddMemo,
  onSaveMemo,
  onDeleteMemo,
}) => {
  const actualWallpaper = wallpaperUrl || wallpaper || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80';
  const handleOpenApp = (appId: AppId) => {
    if (onOpenApp) onOpenApp(appId);
    else if (onLaunchApp) onLaunchApp(appId);
  };
  const handleAddMemo = (title: string, content: string) => {
    if (onAddMemo) onAddMemo(title, content);
    else if (onSaveMemo) onSaveMemo(title, content);
  };

  const [currentPage, setCurrentPage] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeIconMenu, setActiveIconMenu] = useState<AppIconConfig | null>(null);
  const [imagePickerTargetIcon, setImagePickerTargetIcon] = useState<AppIconConfig | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [newMemoText, setNewMemoText] = useState('');

  // Sticker widget editing states
  const [editingStickerWidget, setEditingStickerWidget] = useState<WidgetConfig | null>(null);
  const [stickerTitleInput, setStickerTitleInput] = useState('');
  const [stickerDateInput, setStickerDateInput] = useState('');
  const [stickerIsCountdownInput, setStickerIsCountdownInput] = useState(true);

  // Weather state & live subscription
  const [weather, setWeather] = useState<WeatherData | null>(null);
  useEffect(() => {
    let isMounted = true;
    weatherService.getWeather().then((w) => {
      if (isMounted) setWeather(w);
    });
    const unsub = weatherService.subscribeWeather((w) => {
      if (isMounted) setWeather(w);
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Time widget region selection states
  const [editingClockWidget, setEditingClockWidget] = useState<WidgetConfig | null>(null);

  // Helper: Sticker Days Calculation
  const calculateStickerDays = (targetDateStr?: string, isCountdown: boolean = true) => {
    if (!targetDateStr) return 0;
    const target = new Date(targetDateStr).getTime();
    const now = new Date().getTime();
    const diffMs = isCountdown ? target - now : now - target;
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return isNaN(days) ? 0 : Math.max(0, days);
  };

  // Helper: City Time Calculation
  const getCityTime = (offsetHours: number = 8) => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const cityDate = new Date(utc + 3600000 * offsetHours);
    return {
      timeStr: cityDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStr: cityDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }),
    };
  };

  // Built-in App Icon map
  const getBuiltInIconComponent = (iconName?: string) => {
    switch (iconName) {
      case 'MessageCircle':
        return <MessageCircle className="w-6 h-6 text-white" />;
      case 'HeartPulse':
        return <HeartPulse className="w-6 h-6 text-white" />;
      case 'FileText':
        return <FileText className="w-6 h-6 text-white" />;
      case 'Activity':
        return <Activity className="w-6 h-6 text-white" />;
      case 'Palette':
        return <Palette className="w-6 h-6 text-white" />;
      case 'Settings':
        return <Settings className="w-6 h-6 text-white" />;
      case 'Link':
        return <Link className="w-6 h-6 text-white" />;
      case 'Shield':
        return <Shield className="w-6 h-6 text-white" />;
      case 'BookOpen':
        return <BookOpen className="w-6 h-6 text-white" />;
      case 'Gamepad2':
        return <Gamepad2 className="w-6 h-6 text-white" />;
      case 'CloudSun':
        return <CloudSun className="w-6 h-6 text-white" />;
      default:
        return <MessageCircle className="w-6 h-6 text-white" />;
    }
  };

  const getBuiltInIconBg = (appId: AppId) => {
    switch (appId) {
      case 'wechat':
        return 'bg-gradient-to-tr from-emerald-600 to-green-500 shadow-emerald-500/20';
      case 'weather':
        return 'bg-gradient-to-tr from-sky-500 to-blue-600 shadow-sky-500/20';
      case 'worldbook':
        return 'bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-indigo-500/20';
      case 'gamecenter':
        return 'bg-gradient-to-tr from-amber-500 to-orange-500 shadow-orange-500/20';
      case 'menstrual':
        return 'bg-gradient-to-tr from-rose-500 to-pink-400 shadow-rose-500/20';
      case 'memo':
        return 'bg-gradient-to-tr from-amber-500 to-yellow-400 shadow-amber-500/20';
      case 'apimonitor':
        return 'bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-blue-500/20';
      case 'beautification':
        return 'bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-purple-500/20';
      case 'settings':
        return 'bg-gradient-to-tr from-zinc-700 to-zinc-500 shadow-zinc-500/20';
      case 'connectivity':
        return 'bg-gradient-to-tr from-teal-600 to-emerald-400 shadow-teal-500/20';
      case 'permissions':
        return 'bg-gradient-to-tr from-indigo-600 to-blue-500 shadow-indigo-500/20';
      default:
        return 'bg-emerald-600';
    }
  };

  // Menstrual widget calculations
  const cycleStats = computeCycleStats(menstrualData);

  // Long press empty space handler
  let pressTimer: any = null;
  const handleTouchStartBlank = () => {
    pressTimer = setTimeout(() => {
      setIsEditMode(true);
    }, 600);
  };
  const handleTouchEndBlank = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  // Icon Long press
  const handleIconLongPress = (e: React.MouseEvent | React.TouchEvent, icon: AppIconConfig) => {
    e.stopPropagation();
    setActiveIconMenu(icon);
    setEditedName(icon.name);
  };

  // Handle icon click
  const handleIconClick = (icon: AppIconConfig) => {
    if (isEditMode) return;
    onOpenApp(icon.appId);
  };

  // Icon edit actions
  const handleDeleteIcon = (iconId: string) => {
    onUpdateIcons(icons.filter((i) => i.id !== iconId));
    setActiveIconMenu(null);
  };

  const handleSaveIconName = () => {
    if (activeIconMenu && editedName.trim()) {
      onUpdateIcons(
        icons.map((i) => (i.id === activeIconMenu.id ? { ...i, name: editedName.trim() } : i))
      );
      setIsEditingName(false);
      setActiveIconMenu(null);
    }
  };

  const handleMoveIconPosition = (icon: AppIconConfig) => {
    const nextPage = (icon.pageIndex + 1) % pagesCount;
    onUpdateIcons(
      icons.map((i) => (i.id === icon.id ? { ...i, pageIndex: nextPage } : i))
    );
    setActiveIconMenu(null);
  };

  // Add Widget
  const handleAddWidget = (type: WidgetConfig['type']) => {
    const newW: WidgetConfig = {
      id: 'w_' + Date.now(),
      type,
      pageIndex: currentPage,
      stickerTitle: type === 'sticker' ? '恋爱倒计时' : undefined,
      stickerTargetDate: type === 'sticker' ? '2026-12-31' : undefined,
    };
    onUpdateWidgets([...widgets, newW]);
    setShowAddWidgetModal(false);
  };

  const handleDeleteWidget = (wId: string) => {
    onUpdateWidgets(widgets.filter((w) => w.id !== wId));
  };

  const currentPageIcons = icons.filter((i) => i.pageIndex === currentPage);
  const currentPageWidgets = widgets.filter((w) => w.pageIndex === currentPage);

  return (
    <div
      onMouseDown={handleTouchStartBlank}
      onMouseUp={handleTouchEndBlank}
      onTouchStart={handleTouchStartBlank}
      onTouchEnd={handleTouchEndBlank}
      className="relative w-full h-full flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Wallpaper Background */}
      <img
        src={actualWallpaper}
        alt="Desktop Wallpaper"
        className="absolute inset-0 w-full h-full object-cover filter brightness-[0.88]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/60" />

      {/* Edit Mode Top Indicator */}
      {isEditMode && (
        <div className="relative z-30 pt-2 px-4 flex items-center justify-between bg-black/60 backdrop-blur-md py-2 text-white">
          <span className="text-xs font-medium text-emerald-400">✏️ 桌面编辑模式</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdatePagesCount && onUpdatePagesCount(Math.max(1, pagesCount - 1))}
              className="px-2 py-0.5 text-[11px] rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              - 删页
            </button>
            <span className="text-xs text-zinc-400">页数: {pagesCount}</span>
            <button
              onClick={() => onUpdatePagesCount && onUpdatePagesCount(pagesCount + 1)}
              className="px-2 py-0.5 text-[11px] rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              + 加页
            </button>
            <button
              onClick={() => setIsEditMode(false)}
              className="px-3 py-1 text-xs rounded-xl bg-emerald-500 text-white font-medium ml-2 shadow-sm"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* Top Search Bar Widget */}
      {!isEditMode && (
        <div className="relative z-10 pt-3 px-4">
          <div className="w-full h-10 rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 flex items-center px-3 gap-2 text-white/80 shadow-sm">
            <Search className="w-4 h-4 text-white/70" />
            <input
              type="text"
              placeholder="搜索 App、联系人、备忘录..."
              className="w-full bg-transparent text-xs text-white placeholder-white/60 focus:outline-none cursor-pointer"
              readOnly
              onClick={() => handleOpenApp('memo')}
            />
          </div>
        </div>
      )}

      {/* Main Content Area (Widgets + App Icons) */}
      <div className="relative z-10 flex-1 px-4 pt-3 pb-2 overflow-y-auto overflow-x-hidden">
        {/* Desktop Widgets Area */}
        <div className="space-y-3 mb-4">
          {currentPageWidgets.map((widget) => (
            <div key={widget.id} className="relative group">
              {isEditMode && (
                <button
                  onClick={() => handleDeleteWidget(widget.id)}
                  className="absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* 0. Weather Widget */}
              {widget.type === 'weather' && (
                <div
                  onClick={() => handleOpenApp('weather')}
                  className="w-full rounded-3xl bg-gradient-to-r from-sky-600/85 via-blue-600/85 to-indigo-600/85 backdrop-blur-md p-4 text-white shadow-lg border border-white/25 cursor-pointer active:scale-[0.98] transition hover:brightness-105"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CloudSun className="w-4 h-4 text-sky-200" />
                      <span className="font-semibold text-sm">{weather?.city || '实时天气'}</span>
                      {weather?.isAutoLocation && weather?.city && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/20 text-sky-100">GPS</span>
                      )}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-medium flex items-center gap-1">
                      <span>AI 天气感知</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-light tracking-tight">{weather?.temp ?? 28}°</span>
                      <span className="text-sm font-medium text-sky-100">{weather?.condition || '多云'}</span>
                      <span className="text-xs text-sky-200 ml-1">体感 {weather?.feelsLike ?? 30}°</span>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] font-medium text-sky-100">
                        最高 {weather?.tempMax ?? 33}° · 最低 {weather?.tempMin ?? 24}°
                      </div>
                      <div className="text-[10px] text-sky-200 flex items-center justify-end gap-1 mt-0.5">
                        <Droplets className="w-3 h-3 text-sky-300" />
                        <span>降雨率 {weather?.precipProbability ?? 20}%</span>
                        <span className="text-sky-300">·</span>
                        <span>{weather?.windDirection || '东南风 3级'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Warning or Rain prediction banner on widget */}
                  {weather?.alerts && weather.alerts.length > 0 ? (
                    <div className="mt-2.5 pt-2 border-t border-white/15 flex items-center gap-1.5 text-[11px] text-amber-200 font-medium truncate">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span className="truncate">{weather.alerts[0].title}: {weather.alerts[0].description}</span>
                    </div>
                  ) : weather?.rainForecastSummary ? (
                    <div className="mt-2.5 pt-2 border-t border-white/15 flex items-center gap-1.5 text-[11px] text-sky-100 font-normal truncate">
                      <CloudRain className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      <span className="truncate">{weather.rainForecastSummary}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* 1. Menstrual Predictor Widget */}
              {widget.type === 'menstrual' && (
                <div
                  onClick={() => handleOpenApp('menstrual')}
                  className="w-full rounded-3xl bg-gradient-to-r from-rose-500/90 to-pink-500/90 backdrop-blur-md p-4 text-white shadow-lg border border-white/20 cursor-pointer active:scale-[0.98] transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <HeartPulse className="w-5 h-5 text-rose-100 animate-pulse" />
                      <span className="font-semibold text-sm">女性健康经期预测</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-medium">
                      AI 共享数据
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-white/15 rounded-2xl p-2 backdrop-blur-xs">
                      <span className="block text-[10px] text-rose-100">距离下期</span>
                      <span className="text-lg font-bold">
                        {cycleStats.daysUntilNextPeriod}{' '}
                        <span className="text-[10px] font-normal">天</span>
                      </span>
                    </div>
                    <div className="bg-white/15 rounded-2xl p-2 backdrop-blur-xs">
                      <span className="block text-[10px] text-rose-100">当前周期</span>
                      <span className="text-lg font-bold">
                        {cycleStats.currentPeriodDay ? `第 ${cycleStats.currentPeriodDay} 天` : '非经期'}
                      </span>
                    </div>
                    <div className="bg-white/15 rounded-2xl p-2 backdrop-blur-xs">
                      <span className="block text-[10px] text-rose-100">距离排卵</span>
                      <span className="text-lg font-bold">
                        {cycleStats.daysUntilOvulation}{' '}
                        <span className="text-[10px] font-normal">天</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Time Widget */}
              {widget.type === 'time' && (() => {
                const cityTime = getCityTime(widget.timeOffset ?? 8);
                const cityName = widget.timeCity || '北京时间 (GMT+8)';
                return (
                  <div
                    onClick={() => setEditingClockWidget(widget)}
                    className="w-full rounded-3xl bg-black/35 backdrop-blur-md p-4 text-white border border-white/15 shadow-md flex items-center justify-between cursor-pointer hover:bg-black/45 transition active:scale-[0.98]"
                    title="点击选择时区地区"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-8 h-8 text-amber-400" />
                      <div>
                        <div className="text-2xl font-bold tracking-tight">{cityTime.timeStr}</div>
                        <div className="text-[11px] text-zinc-300">{cityTime.dateStr}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 font-medium border border-amber-400/30">
                        {cityName} 🌐
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 3. Calendar Widget */}
              {widget.type === 'calendar' && (
                <div
                  onClick={() => handleOpenApp('menstrual')}
                  className="w-full rounded-3xl bg-white/20 backdrop-blur-md p-3 text-white border border-white/20 shadow-md cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <CalendarIcon className="w-4 h-4 text-emerald-300" />
                      <span>{new Date().getFullYear()}年 {new Date().getMonth() + 1}月</span>
                    </div>
                    <span className="text-[10px] text-white/70">查看完整日历</span>
                  </div>
                  <div className="grid grid-cols-7 text-center text-[10px] gap-1 font-medium text-white/80">
                    {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                    {[...Array(28)].map((_, i) => (
                      <span
                        key={i}
                        className={`py-1 rounded-lg ${
                          i + 1 === new Date().getDate() ? 'bg-emerald-500 font-bold text-white' : 'hover:bg-white/10'
                        }`}
                      >
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Memo Widget */}
              {widget.type === 'memo' && (
                <div
                  onClick={() => handleOpenApp('memo')}
                  className="w-full rounded-3xl bg-amber-500/85 backdrop-blur-md p-3.5 text-zinc-900 border border-white/30 shadow-md cursor-pointer active:scale-[0.98] transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <FileText className="w-4 h-4" />
                      <span>桌面备忘录</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenApp('memo');
                      }}
                      className="text-[10px] font-semibold bg-zinc-900/20 px-2 py-0.5 rounded-full hover:bg-zinc-900/30"
                    >
                      所有便签
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                    {memos.slice(0, 2).map((m) => (
                      <div key={m.id} className="text-xs bg-white/40 p-2 rounded-xl border border-white/20">
                        <div className="font-semibold truncate">{m.title}</div>
                        <div className="text-[11px] opacity-80 truncate">{m.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Date Sticker Widget */}
              {widget.type === 'sticker' && (() => {
                const days = calculateStickerDays(widget.stickerTargetDate || '2026-12-31', widget.stickerIsCountdown ?? true);
                return (
                  <div
                    onClick={() => {
                      setEditingStickerWidget(widget);
                      setStickerTitleInput(widget.stickerTitle || '倒计时贴纸');
                      setStickerDateInput(widget.stickerTargetDate || '2026-12-31');
                      setStickerIsCountdownInput(widget.stickerIsCountdown ?? true);
                    }}
                    className="w-full rounded-3xl bg-black/35 backdrop-blur-md p-3.5 text-white border border-white/15 shadow-md flex items-center justify-between cursor-pointer hover:bg-black/45 transition active:scale-[0.98]"
                    title="点击设置目标/开始日期"
                  >
                    <div className="flex items-center gap-2.5">
                      <Tag className="w-6 h-6 text-purple-400" />
                      <div>
                        <div className="text-xs font-semibold">{widget.stickerTitle || '倒计时贴纸'}</div>
                        <div className="text-[10px] text-zinc-300">
                          {widget.stickerIsCountdown ?? true ? '目标日期' : '起始日期'}: {widget.stickerTargetDate || '2026-12-31'}
                        </div>
                      </div>
                    </div>
                    <div className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-2xl font-bold text-lg flex items-baseline gap-1">
                      {days} <span className="text-[10px] font-normal text-purple-200">天</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}

          {/* Add Widget Button in Edit Mode */}
          {isEditMode && (
            <button
              onClick={() => setShowAddWidgetModal(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-white/40 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center justify-center gap-2 backdrop-blur-xs transition"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>添加桌面小组件</span>
            </button>
          )}
        </div>

        {/* App Icons Grid */}
        <div className="grid grid-cols-4 gap-y-5 gap-x-2 pt-2">
          {currentPageIcons.map((icon) => (
            <div
              key={icon.id}
              onClick={() => handleIconClick(icon)}
              onContextMenu={(e) => handleIconLongPress(e, icon)}
              className="group flex flex-col items-center cursor-pointer active:scale-90 transition relative"
            >
              {/* Custom Image or Built-in Icon */}
              <div
                className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-md border border-white/20 overflow-hidden ${
                  icon.customImage ? 'bg-zinc-800' : getBuiltInIconBg(icon.appId)
                }`}
              >
                {icon.customImage ? (
                  <img src={icon.customImage} alt={icon.name} className="w-full h-full object-cover" />
                ) : (
                  getBuiltInIconComponent(icon.builtInIcon)
                )}

                {/* Edit Mode badge */}
                {isEditMode && (
                  <div className="absolute top-0 right-0 p-0.5 bg-black/60 rounded-bl-lg">
                    <MoreVertical className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>

              {/* App Label */}
              <span className="mt-1.5 text-[11px] font-medium text-white tracking-tight drop-shadow-md truncate max-w-[68px]">
                {icon.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Page Indicators & Controls */}
      <div className="relative z-10 pb-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-1.5">
          {[...Array(pagesCount)].map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPage(idx)}
              className={`h-1.5 rounded-full transition-all ${
                currentPage === idx ? 'w-5 bg-white' : 'w-1.5 bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Icon Long-Press Context Menu Modal */}
      {activeIconMenu && (
        <div
          onClick={() => setActiveIconMenu(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3"
          >
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden ${getBuiltInIconBg(
                  activeIconMenu.appId
                )}`}
              >
                {activeIconMenu.customImage ? (
                  <img src={activeIconMenu.customImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  getBuiltInIconComponent(activeIconMenu.builtInIcon)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm truncate">{activeIconMenu.name}</h4>
                <p className="text-[10px] text-zinc-400">应用布局设置</p>
              </div>
            </div>

            {/* Menu options */}
            <div className="space-y-1 text-xs">
              <button
                onClick={() => {
                  setImagePickerTargetIcon(activeIconMenu);
                  setActiveIconMenu(null);
                }}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2.5 text-zinc-200 transition"
              >
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <span>选取本地图片更换图标</span>
              </button>

              <button
                onClick={() => setIsEditingName(true)}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2.5 text-zinc-200 transition"
              >
                <Edit3 className="w-4 h-4 text-amber-400" />
                <span>修改应用显示名称</span>
              </button>

              <button
                onClick={() => handleMoveIconPosition(activeIconMenu)}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2.5 text-zinc-200 transition"
              >
                <Move className="w-4 h-4 text-blue-400" />
                <span>更换桌面布局位置 (移动到下页)</span>
              </button>

              <button
                onClick={() => handleDeleteIcon(activeIconMenu.id)}
                className="w-full p-2.5 rounded-xl hover:bg-rose-900/30 flex items-center gap-2.5 text-rose-400 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除图标</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit App Name Dialog */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-white">
            <h4 className="text-xs font-semibold text-zinc-300 mb-2">修改应用名称</h4>
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white mb-3 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsEditingName(false)}
                className="px-3 py-1.5 text-xs rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                onClick={handleSaveIconName}
                className="px-3 py-1.5 text-xs font-medium rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Image Picker for Icon */}
      {imagePickerTargetIcon && (
        <ImagePickerModal
          isOpen={Boolean(imagePickerTargetIcon)}
          onClose={() => setImagePickerTargetIcon(null)}
          title={`修改 [${imagePickerTargetIcon.name}] 图标`}
          onSelectImage={(imageUrl) => {
            onUpdateIcons(
              icons.map((i) => (i.id === imagePickerTargetIcon.id ? { ...i, customImage: imageUrl } : i))
            );
          }}
        />
      )}

      {/* Add Widget Selection Modal */}
      {showAddWidgetModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              选择添加桌面小组件
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <button
                onClick={() => handleAddWidget('weather')}
                className="p-3 rounded-2xl bg-sky-500/20 border border-sky-500/40 text-sky-300 font-medium hover:bg-sky-500/30 text-left col-span-2"
              >
                <CloudSun className="w-5 h-5 mb-1 text-sky-400" />
                <div className="font-semibold">实时天气小组件</div>
                <div className="text-[10px] text-sky-200/80">显示气温、天气、降雨预测与灾害预警</div>
              </button>
              <button
                onClick={() => handleAddWidget('menstrual')}
                className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-medium hover:bg-rose-500/30 text-left"
              >
                <HeartPulse className="w-5 h-5 mb-1 text-rose-400" />
                经期预测组件
              </button>
              <button
                onClick={() => handleAddWidget('time')}
                className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium hover:bg-amber-500/30 text-left"
              >
                <Clock className="w-5 h-5 mb-1 text-amber-400" />
                时间组件
              </button>
              <button
                onClick={() => handleAddWidget('calendar')}
                className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-medium hover:bg-emerald-500/30 text-left"
              >
                <CalendarIcon className="w-5 h-5 mb-1 text-emerald-400" />
                月历组件
              </button>
              <button
                onClick={() => handleAddWidget('memo')}
                className="p-3 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-purple-300 font-medium hover:bg-purple-500/30 text-left"
              >
                <FileText className="w-5 h-5 mb-1 text-purple-400" />
                备忘录组件
              </button>
              <button
                onClick={() => handleAddWidget('sticker')}
                className="p-3 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-medium hover:bg-indigo-500/30 text-left col-span-2"
              >
                <Tag className="w-5 h-5 mb-1 text-indigo-400" />
                倒计时贴纸组件
              </button>
            </div>
            <button
              onClick={() => setShowAddWidgetModal(false)}
              className="w-full py-2 text-xs rounded-xl bg-zinc-800 text-zinc-300"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Edit Sticker Date Modal */}
      {editingStickerWidget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-purple-400">
              <Tag className="w-4 h-4" />
              倒计时贴纸设置
            </h3>

            <div className="space-y-1 text-xs">
              <label className="block text-zinc-400">贴纸标题 / 倒计时名称</label>
              <input
                type="text"
                value={stickerTitleInput}
                onChange={(e) => setStickerTitleInput(e.target.value)}
                placeholder="例如: 高考倒计时 / 恋爱纪念日"
                className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1 text-xs">
              <label className="block text-zinc-400">选择目标 / 开始日期</label>
              <input
                type="date"
                value={stickerDateInput}
                onChange={(e) => setStickerDateInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-zinc-300">模式选择</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStickerIsCountdownInput(true)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                    stickerIsCountdownInput ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  目标倒计时
                </button>
                <button
                  type="button"
                  onClick={() => setStickerIsCountdownInput(false)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                    !stickerIsCountdownInput ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  起始已累计
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-zinc-800">
              <button
                onClick={() => setEditingStickerWidget(null)}
                className="px-3 py-1.5 text-xs rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                onClick={() => {
                  onUpdateWidgets(
                    widgets.map((w) =>
                      w.id === editingStickerWidget.id
                        ? {
                            ...w,
                            stickerTitle: stickerTitleInput || '倒计时贴纸',
                            stickerTargetDate: stickerDateInput || '2026-12-31',
                            stickerIsCountdown: stickerIsCountdownInput,
                          }
                        : w
                    )
                  );
                  setEditingStickerWidget(null);
                }}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-500 shadow-md"
              >
                保存贴纸
              </button>
            </div>
          </div>
        </div>
      )}

      {/* World Clock Region Selection Modal */}
      {editingClockWidget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-amber-400">
              <Clock className="w-4 h-4" />
              选择时区地区时间
            </h3>
            <p className="text-[11px] text-zinc-400">
              点击下方地区即可随时切换时间小组件的显示城市与时区：
            </p>

            <div className="space-y-1.5 text-xs max-h-56 overflow-y-auto pr-1">
              {[
                { city: '北京时间 (GMT+8)', offset: 8 },
                { city: '东京 (日本 JST GMT+9)', offset: 9 },
                { city: '伦敦 (英国 GMT+0)', offset: 0 },
                { city: '纽约 (美国 EST GMT-5)', offset: -5 },
                { city: '巴黎 (法国 CET GMT+1)', offset: 1 },
                { city: '悉尼 (澳大利亚 AEST GMT+10)', offset: 10 },
                { city: '曼谷 (泰国 ICT GMT+7)', offset: 7 },
              ].map((region) => {
                const currentOffset = editingClockWidget.timeOffset ?? 8;
                const isSelected = currentOffset === region.offset;
                return (
                  <button
                    key={region.city}
                    onClick={() => {
                      onUpdateWidgets(
                        widgets.map((w) =>
                          w.id === editingClockWidget.id
                            ? { ...w, timeCity: region.city, timeOffset: region.offset }
                            : w
                        )
                      );
                      setEditingClockWidget(null);
                    }}
                    className={`w-full p-2.5 rounded-2xl border text-left flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-750'
                    }`}
                  >
                    <span>{region.city}</span>
                    <span className="text-[10px] opacity-80">{getCityTime(region.offset).timeStr}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setEditingClockWidget(null)}
              className="w-full py-2 text-xs rounded-xl bg-zinc-800 text-zinc-300 mt-2"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
