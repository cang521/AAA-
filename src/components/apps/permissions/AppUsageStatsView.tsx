import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  Sliders,
  Settings2,
  ExternalLink,
  Layers,
  Smartphone,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { AppUsageDetail, AppUsageMonitoringConfig } from '../../../types';
import { androidPermissionBridgeClient } from '../../../lib/agent/AndroidPermissionBridgeClient';
import { loadFromStorage, saveToStorage } from '../../../lib/storage';

const CONFIG_STORAGE_KEY = 'phone_app_usage_monitoring_config_v1';

interface AppUsageStatsViewProps {
  onBack: () => void;
}

export const AppUsageStatsView: React.FC<AppUsageStatsViewProps> = ({ onBack }) => {
  const [hasUsagePermission, setHasUsagePermission] = useState<boolean | null>(null);
  const [isNative, setIsNative] = useState<boolean>(false);
  const [appList, setAppList] = useState<AppUsageDetail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  // Config State
  const [config, setConfig] = useState<AppUsageMonitoringConfig>(() => {
    return loadFromStorage<AppUsageMonitoringConfig>(CONFIG_STORAGE_KEY, {
      enabled: true,
      monitoredPackages: [],
      autoRefreshIntervalSeconds: 30,
    });
  });

  // UI Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'monitored' | 'usedToday'>('all');
  const [sortBy, setSortBy] = useState<'total' | 'continuous' | 'recent'>('total');

  // Check native status and permission
  const checkPermissionAndFetchData = useCallback(async () => {
    setIsLoading(true);
    const native = androidPermissionBridgeClient.isNativeAndroid();
    setIsNative(native);

    if (native) {
      try {
        const perms = await androidPermissionBridgeClient.checkAllPermissions();
        const granted = perms?.['usage_stats'] === 'GRANTED';
        setHasUsagePermission(granted);

        if (granted) {
          const res = await androidPermissionBridgeClient.getAppUsageList();
          if (res && res.apps) {
            setAppList(
              res.apps.map((app) => ({
                ...app,
                isMonitored: config.monitoredPackages.includes(app.packageName),
              }))
            );
          }
        }
      } catch (e) {
        console.warn('[AppUsageStatsView] Error fetching native app usage:', e);
      }
    } else {
      setHasUsagePermission(false);
      setAppList([]);
    }

    setLastRefreshedAt(Date.now());
    setIsLoading(false);
  }, [config.monitoredPackages]);

  useEffect(() => {
    checkPermissionAndFetchData();
  }, [checkPermissionAndFetchData]);

  // Handle toggle global monitoring
  const handleToggleGlobalMonitoring = (enabled: boolean) => {
    const updated = { ...config, enabled };
    setConfig(updated);
    saveToStorage(CONFIG_STORAGE_KEY, updated);
  };

  // Handle toggle single app monitoring whitelist
  const handleToggleAppMonitored = (packageName: string) => {
    const isCurrentlyMonitored = config.monitoredPackages.includes(packageName);
    const nextPackages = isCurrentlyMonitored
      ? config.monitoredPackages.filter((p) => p !== packageName)
      : [...config.monitoredPackages, packageName];

    const updated = { ...config, monitoredPackages: nextPackages };
    setConfig(updated);
    saveToStorage(CONFIG_STORAGE_KEY, updated);

    setAppList((prev) =>
      prev.map((app) =>
        app.packageName === packageName ? { ...app, isMonitored: !isCurrentlyMonitored } : app
      )
    );
  };

  // Handle open Android system USAGE_ACCESS_SETTINGS page
  const handleOpenSystemSettings = async () => {
    await androidPermissionBridgeClient.requestPermission('usage_stats');
  };

  // Filter & Sort Apps
  const filteredApps = appList
    .filter((app) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = app.appName.toLowerCase().includes(q);
        const matchesPkg = app.packageName.toLowerCase().includes(q);
        if (!matchesName && !matchesPkg) return false;
      }
      if (filterMode === 'monitored') return app.isMonitored;
      if (filterMode === 'usedToday') return app.totalUsageMinutesToday > 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'total') return b.totalUsageMinutesToday - a.totalUsageMinutesToday;
      if (sortBy === 'continuous') return b.continuousUsageMinutes - a.continuousUsageMinutes;
      if (sortBy === 'recent') return b.lastTimeUsed - a.lastTimeUsed;
      return 0;
    });

  const formatMinutes = (mins: number) => {
    if (!mins || mins <= 0) return '0 分钟';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) {
      return `${h} 小时 ${m} 分钟`;
    }
    return `${m} 分钟`;
  };

  const formatLastTime = (ts: number) => {
    if (!ts || ts <= 0) return '今日未打开';
    const now = Date.now();
    const diffMins = Math.floor((now - ts) / (1000 * 60));
    if (diffMins < 1) return '刚刚使用';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    const date = new Date(ts);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `今日 ${hours}:${minutes}`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 transition-colors duration-200 select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-4 py-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-sky-100 dark:border-zinc-800 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-sky-50 dark:bg-zinc-800 text-sky-700 dark:text-zinc-300 hover:bg-sky-100 dark:hover:bg-zinc-700 active:scale-95 transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
              <BarChart3 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <span>应用使用情况监测</span>
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
              真实 Android UsageStats 统计与本地白名单
            </p>
          </div>
        </div>

        <button
          onClick={checkPermissionAndFetchData}
          disabled={isLoading}
          className="p-2 rounded-xl bg-sky-50 dark:bg-zinc-800 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-zinc-700 active:scale-95 transition cursor-pointer disabled:opacity-50"
          title="刷新真实统计"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Environment Badge Card */}
        <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isNative
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold block text-slate-900 dark:text-zinc-100">
                {isNative ? '📱 Android 宿主 OS 连通' : '💻 Web Preview 调试模式'}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                {isNative
                  ? '已连接底层 UsageStatsManager 接口'
                  : '请在 Android APK 真机查看真实系统数据'}
              </span>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isNative
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {isNative ? '原生模式' : ' Web 预览'}
          </span>
        </div>

        {/* Permission Status & Jump Control Banner */}
        <div
          className={`p-3.5 rounded-2xl border transition shadow-xs space-y-2.5 ${
            hasUsagePermission
              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
              : 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              {hasUsagePermission ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h2 className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span>Android 使用情况访问权限</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                      hasUsagePermission
                        ? 'bg-emerald-200/80 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-200/80 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {hasUsagePermission ? '已授权 (GRANTED)' : '未授权 (DENIED)'}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed mt-0.5">
                  {hasUsagePermission
                    ? '系统已获权读取第三方 App 真实前台时长与活动事件。用户可随时前往系统设置撤销。'
                    : '需在 Android 系统设置中开启【使用情况访问权限】，小手机才能精准统计 App 使用时间。'}
                </p>
              </div>
            </div>
          </div>

          {!hasUsagePermission && (
            <button
              onClick={handleOpenSystemSettings}
              className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>前往 Android 系统设置授权【使用情况访问】</span>
            </button>
          )}
        </div>

        {/* Global Monitoring Master Switch Card */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-zinc-800 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-zinc-700 flex items-center justify-center shrink-0">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold block text-slate-900 dark:text-zinc-100">
                开启应用使用情况监测
              </span>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                全局开关：关闭后停止汇总并暂停本地使用情况刷新
              </span>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleToggleGlobalMonitoring(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
          </label>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 shadow-xs space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="搜索应用名称或包名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-sky-600 text-white font-bold'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                全部 App ({appList.length})
              </button>
              <button
                onClick={() => setFilterMode('monitored')}
                className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition cursor-pointer ${
                  filterMode === 'monitored'
                    ? 'bg-sky-600 text-white font-bold'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                授权监测中 ({config.monitoredPackages.length})
              </button>
              <button
                onClick={() => setFilterMode('usedToday')}
                className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition cursor-pointer ${
                  filterMode === 'usedToday'
                    ? 'bg-sky-600 text-white font-bold'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                今日有使用
              </button>
            </div>

            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[11px] text-slate-700 dark:text-zinc-300 focus:outline-none cursor-pointer shrink-0"
            >
              <option value="total">今日累计最高</option>
              <option value="continuous">当次连续最高</option>
              <option value="recent">最近打开</option>
            </select>
          </div>
        </div>

        {/* App Usage List Cards */}
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-zinc-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-500" />
              <p>正在读取 Android 系统使用情况与 UsageEvents 事件流...</p>
            </div>
          ) : !hasUsagePermission && isNative ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="font-bold text-xs text-slate-800 dark:text-zinc-200">
                需开启【使用情况访问权限】
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-xs mx-auto">
                请点击上方按钮跳转系统设置并开启授权，以加载手机上的真实应用统计数据。
              </p>
            </div>
          ) : !isNative ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 text-center space-y-2">
              <Smartphone className="w-8 h-8 text-sky-500 mx-auto" />
              <p className="font-bold text-xs text-slate-800 dark:text-zinc-200">
                当前运行于 Web Preview 模拟环境
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-xs mx-auto">
                为保证数据绝对真实，Web 模拟器不伪造假机系统数据。请打包安装 APK 至真实 Android 手机验证 UsageStats。
              </p>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-zinc-500">
              未搜索到符合条件的应用数据
            </div>
          ) : (
            filteredApps.map((app) => (
              <div
                key={app.packageName}
                className={`p-3 rounded-2xl border transition shadow-xs ${
                  app.isMonitored
                    ? 'bg-white dark:bg-zinc-900 border-sky-200 dark:border-sky-900/50'
                    : 'bg-white/60 dark:bg-zinc-900/60 border-slate-200/80 dark:border-zinc-800/80 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {app.appName ? app.appName.slice(0, 1) : 'A'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 dark:text-zinc-100 truncate">
                          {app.appName}
                        </span>
                        {app.isMonitored && (
                          <span className="px-1.5 py-0.2 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-[9px] font-medium shrink-0">
                            监测中
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono block truncate">
                        {app.packageName}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleAppMonitored(app.packageName)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0 ${
                      app.isMonitored
                        ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800/50'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-800'
                    }`}
                  >
                    {app.isMonitored ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{app.isMonitored ? '已允许监测' : '允许监测'}</span>
                  </button>
                </div>

                {/* Stats Row */}
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-zinc-800/80 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="p-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 block">今日累计</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">
                      {formatMinutes(app.totalUsageMinutesToday)}
                    </span>
                  </div>

                  <div
                    className={`p-1.5 rounded-xl ${
                      app.continuousUsageMinutes > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-zinc-800/50'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 block">当次连续</span>
                    <span className="font-bold">
                      {formatMinutes(app.continuousUsageMinutes)}
                    </span>
                  </div>

                  <div className="p-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 block">最近使用</span>
                    <span className="font-medium text-slate-700 dark:text-zinc-300">
                      {formatLastTime(app.lastTimeUsed)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Guarantee Note */}
        <div className="p-3 rounded-2xl bg-sky-50/50 dark:bg-zinc-900/50 border border-sky-100 dark:border-zinc-800/80 text-[11px] text-sky-800 dark:text-zinc-400 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>真实数据计算说明</span>
          </div>
          <p className="leading-relaxed text-[10px] text-slate-600 dark:text-zinc-400">
            • 今日累计时长依据系统 UsageStats 跨午夜（00:00）自动结算；
            <br />
            • 当次连续时长由 UsageEvents 事件流动态计算，手机锁屏或切换应用时自动结清重置；
            <br />
            • 所有统计数据纯本地保存，随时可撤销授权并关闭监测。
          </p>
        </div>
      </div>
    </div>
  );
};
