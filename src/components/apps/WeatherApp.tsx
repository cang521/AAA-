import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Cloud,
  Sun,
  CloudSun,
  CloudRain,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  Snowflake,
  Wind,
  Droplets,
  Compass,
  Eye,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Search,
  Check,
  ChevronRight,
  Shield,
  Clock,
  Sparkles,
  X,
  Navigation,
  LocateFixed,
} from 'lucide-react';
import { WeatherData, WeatherConfig, WeatherCareConfig, WeatherEvent, WeatherEventType, AiCharacter, UserProfile, AiPermissions, Memo } from '../../types';
import { weatherService } from '../../lib/weatherService';
import { systemNativeService, SystemTimeInfo } from '../../lib/systemNativeService';
import { saveChatMessage } from '../../lib/chatDb';

interface WeatherAppProps {
  onBackToLauncher?: () => void;
  characters: AiCharacter[];
  userProfile: UserProfile;
  permissions: AiPermissions;
  memos?: Memo[];
  onTriggerProactiveCare?: (characterId: string, event: WeatherEvent) => Promise<void>;
  onNavigateToPermissions?: () => void;
}

const POPULAR_CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '成都',
  '重庆', '武汉', '西安', '南京', '厦门', '青岛',
  '长沙', '苏州', '天津', '郑州', '香港', '台北',
  '昆明', '三亚', '哈尔滨', '拉萨', '乌鲁木齐', '东京',
  '纽约', '伦敦', '巴黎',
];

export const WeatherApp: React.FC<WeatherAppProps> = ({
  onBackToLauncher,
  characters,
  userProfile,
  permissions,
  memos = [],
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [config, setConfig] = useState<WeatherConfig>(weatherService.getWeatherConfig());
  const [careConfig, setCareConfig] = useState<WeatherCareConfig>(weatherService.getWeatherCareConfig());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showCareSettingsModal, setShowCareSettingsModal] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingCities, setIsSearchingCities] = useState(false);
  const [testSelectedCharId, setTestSelectedCharId] = useState(characters[0]?.id || 'char_1');
  const [testCareStatus, setTestCareStatus] = useState<string | null>(null);
  const [isTestingCare, setIsTestingCare] = useState(false);
  const [currentTimeInfo, setCurrentTimeInfo] = useState<SystemTimeInfo>(systemNativeService.getRealSystemTime());

  // Real-time Native Clock (Updates every second from phone system)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeInfo(systemNativeService.getRealSystemTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live debounce city search (Open Network API, NOT AI API)
  useEffect(() => {
    if (!citySearchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingCities(true);
      const results = await weatherService.searchCities(citySearchQuery.trim());
      setSearchResults(results);
      setIsSearchingCities(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [citySearchQuery]);

  // Load live weather on mount & subscribe to changes
  useEffect(() => {
    let isMounted = true;
    weatherService.getWeather().then((data) => {
      if (isMounted) setWeather(data);
    });

    const unsubscribe = weatherService.subscribeWeather((data) => {
      if (isMounted) setWeather(data);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Refresh Weather
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = await weatherService.fetchWeather(true);
      setWeather(fresh);
      setConfig(weatherService.getWeatherConfig());
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // One-click "Use Current Location" (Native GPS Permission & Geolocation)
  const handleUseCurrentLocation = async () => {
    setIsLocatingGps(true);
    try {
      const fresh = await weatherService.useCurrentLocation();
      setWeather(fresh);
      setConfig(weatherService.getWeatherConfig());
      setShowCityModal(false);
    } catch (e) {
      console.error('Use current location failed', e);
    } finally {
      setIsLocatingGps(false);
    }
  };

  // User selects city from search results or popular grid
  const handleSelectCityItem = async (cityItem: { name: string; latitude?: number; longitude?: number; displayName?: string }) => {
    if (cityItem.latitude !== undefined && cityItem.longitude !== undefined) {
      const fresh = await weatherService.selectCity({
        name: cityItem.name,
        latitude: cityItem.latitude,
        longitude: cityItem.longitude,
        displayName: cityItem.displayName,
      });
      setWeather(fresh);
      setConfig(weatherService.getWeatherConfig());
    } else {
      // If no coordinates provided (e.g. from popular city grid), geocode it
      const searchRes = await weatherService.searchCities(cityItem.name);
      if (searchRes.length > 0) {
        const top = searchRes[0];
        const fresh = await weatherService.selectCity({
          name: top.name || cityItem.name,
          latitude: top.latitude,
          longitude: top.longitude,
          displayName: top.displayName,
        });
        setWeather(fresh);
        setConfig(weatherService.getWeatherConfig());
      } else {
        const updated = weatherService.saveWeatherConfig({
          locationMode: 'manual',
          selectedCity: cityItem.name,
          latitude: undefined,
          longitude: undefined,
        });
        setConfig(updated);
        const fresh = await weatherService.fetchWeather(true);
        setWeather(fresh);
      }
    }

    setShowCityModal(false);
    setCitySearchQuery('');
    setSearchResults([]);
  };

  const handleSaveCareConfig = (partial: Partial<WeatherCareConfig>) => {
    const updated = weatherService.saveWeatherCareConfig(partial);
    setCareConfig(updated);
  };

  // Instant AI Weather Proactive Care Test Trigger
  const handleRunMockWeatherCare = async (eventType: WeatherEventType) => {
    const targetChar = characters.find((c) => c.id === testSelectedCharId) || characters[0];
    if (!targetChar || isTestingCare) return;

    setIsTestingCare(true);
    setTestCareStatus(`正在唤醒【${targetChar.name}】，根据天气事件感知生成微信关怀...`);

    const currentCity = weather?.city || config.selectedCity || '当前城市';
    const mockEvent: WeatherEvent = {
      type: eventType,
      title: eventType === 'rain_soon' ? '即将下雨预警' : eventType === 'high_temp' ? '高温酷热' : '气温骤降预警',
      summary: `检测到 ${currentCity} 出现气象变化`,
      detail: `根据最新气象监测，${currentCity} 出现天气变动。`,
      severity: 'medium',
      timestamp: Date.now(),
      weatherSnapshot: {
        temp: weather?.temp ?? 26,
        feelsLike: weather?.feelsLike ?? 27,
        condition: weather?.condition ?? '多云',
        precipProbability: weather?.precipProbability ?? 80,
        city: currentCity,
      },
    };

    try {
      const memosSummary = (memos || [])
        .map((m) => `- [${m.title || '便签'}] ${m.content}`)
        .join('\n');

      const res = await fetch('/api/gemini/weather-proactive-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: targetChar,
          weatherEvent: mockEvent,
          weatherData: weather,
          userProfile,
          memosSummary,
          permissions,
        }),
      });

      const data = await res.json();
      if (data.success && data.text) {
        const careMsg = {
          id: 'msg_weather_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          characterId: targetChar.id,
          sender: 'ai' as const,
          text: data.text,
          timestamp: Date.now(),
          thinkingProcess: data.thinkingProcess || `感知天气事件 [${mockEvent.title}]，生成针对用户的温暖提醒。`,
        };

        await saveChatMessage(careMsg);
        weatherService.markCareTriggered(eventType);

        setTestCareStatus(`✅ 关怀消息已成功送达！【${targetChar.name}】发来一条微信消息：“${data.text}”`);
      } else {
        setTestCareStatus(`触发失败: ${data.error || '未知错误'}`);
      }
    } catch (err: any) {
      setTestCareStatus(`网络错误: ${err.message}`);
    } finally {
      setIsTestingCare(false);
    }
  };

  const getWeatherIcon = (condition: string = '', code: number = 0, className = 'w-6 h-6') => {
    if (code === 0 || condition.includes('晴')) return <Sun className={`${className} text-amber-500`} />;
    if (code === 1 || code === 2 || condition.includes('多云')) return <CloudSun className={`${className} text-amber-400`} />;
    if (code === 3 || condition.includes('阴')) return <Cloud className={`${className} text-slate-400`} />;
    if ([95, 96, 99].includes(code) || condition.includes('雷')) return <CloudLightning className={`${className} text-purple-400`} />;
    if ([65, 82].includes(code) || condition.includes('大雨') || condition.includes('暴雨')) return <CloudRain className={`${className} text-blue-500`} />;
    if ([61, 63, 80, 81].includes(code) || condition.includes('雨')) return <CloudDrizzle className={`${className} text-blue-400`} />;
    if ([71, 73, 75, 85].includes(code) || condition.includes('雪')) return <Snowflake className={`${className} text-cyan-300`} />;
    if ([45, 48].includes(code) || condition.includes('雾')) return <CloudFog className={`${className} text-slate-300`} />;
    return <CloudSun className={`${className} text-amber-400`} />;
  };

  const isRaining = weather?.conditionCode && [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weather.conditionCode);
  const isNight = currentTimeInfo.now.getHours() >= 19 || currentTimeInfo.now.getHours() < 6;
  const isAutoGps = config.locationMode === 'auto';
  const displayCityName = weather?.city || config.selectedCity || '正在获取定位...';

  return (
    <div id="weather_app_container" className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      {/* Top App Header */}
      <div id="weather_header" className="pt-9 pb-2.5 px-3 flex items-center justify-between bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 z-20 gap-2">
        <div className="flex items-center gap-2">
          {onBackToLauncher && (
            <button
              id="weather_back_to_launcher_btn"
              onClick={onBackToLauncher}
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-medium px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 transition active:scale-95 shadow-sm shrink-0"
              title="返回桌面"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>桌面</span>
            </button>
          )}

          {/* City & Location Mode Button */}
          <button
            id="weather_city_select_btn"
            onClick={() => setShowCityModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 text-slate-100 font-medium text-xs sm:text-sm transition-all active:scale-95 shadow-sm"
          >
            {isAutoGps ? (
              <Navigation className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-pulse" />
            ) : (
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="truncate max-w-[90px] sm:max-w-[130px] font-semibold">{displayCityName}</span>
            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-normal shrink-0 ${isAutoGps ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'}`}>
              {isAutoGps ? 'GPS' : '指定'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 rotate-90 shrink-0" />
          </button>
        </div>

        {/* Action Buttons: Use GPS / Refresh / AI Care */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="weather_use_current_location_btn"
            onClick={handleUseCurrentLocation}
            disabled={isLocatingGps}
            className={`p-1.5 rounded-full border transition-all active:scale-90 ${
              isAutoGps
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700'
            }`}
            title="使用当前位置 (原生 GPS 定位)"
          >
            <LocateFixed className={`w-4 h-4 ${isLocatingGps ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          <button
            id="weather_refresh_location_btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 transition-all active:scale-90"
            title="刷新天气与位置"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          <button
            id="weather_care_settings_btn"
            onClick={() => setShowCareSettingsModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition-all active:scale-95"
            title="AI 天气感知与主动关怀设置"
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span>AI关怀</span>
          </button>
        </div>
      </div>

      {/* Real-time System Time & Location Sub-bar */}
      <div id="weather_realtime_clock_bar" className="px-4 py-1.5 bg-slate-900/40 border-b border-slate-800/40 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-sky-400 shrink-0" />
          <span>{currentTimeInfo.formattedDate} {currentTimeInfo.dayOfWeek} {currentTimeInfo.formattedTime}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">
            {isAutoGps ? '📡 手机 GPS 实时感知' : '📍 手动城市模式'}
          </span>
        </div>
      </div>

      {/* Main Weather Scroll Container */}
      <div id="weather_scroll_content" className="flex-1 overflow-y-auto px-4 py-3 space-y-4 no-scrollbar">
        {/* Real Geolocation Status & Permission Diagnostic Banner */}
        {weather?.locationStatus === 'permission_denied' && (
          <div id="weather_location_denied_warning" className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-amber-200">手机 GPS 定位未授权</div>
              <div className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                当前未能获取到您的经纬度。您可以点击右上角授权定位，或直接在城市列表中手动搜索您所在的城市。
              </div>
            </div>
            <button
              onClick={() => setShowCityModal(true)}
              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-semibold shrink-0"
            >
              搜索城市
            </button>
          </div>
        )}

        {/* Dynamic Hero Weather Card */}
        <div
          id="weather_hero_card"
          className={`relative rounded-3xl p-6 overflow-hidden border shadow-lg transition-all ${
            isRaining
              ? 'bg-gradient-to-b from-blue-900/60 via-slate-900/80 to-slate-950 border-blue-500/30'
              : isNight
              ? 'bg-gradient-to-b from-indigo-950/80 via-slate-900/90 to-slate-950 border-indigo-500/20'
              : 'bg-gradient-to-b from-sky-900/60 via-slate-900/80 to-slate-950 border-sky-500/30'
          }`}
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-light tracking-tight text-white">{weather?.temp ?? '--'}</span>
                <span className="text-3xl text-sky-300 font-light">°C</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-medium text-slate-100">{weather?.condition || '天气获取中...'}</span>
                {weather?.feelsLike !== undefined && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    体感 {weather.feelsLike}°C
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {weather?.tempMax !== undefined ? `最高 ${weather.tempMax}° · 最低 ${weather.tempMin}°` : ''} 
                {weather?.windDirection ? ` · ${weather.windDirection}` : ''}
              </div>
            </div>

            <div className="flex flex-col items-end">
              {getWeatherIcon(weather?.condition, weather?.conditionCode, 'w-16 h-16 drop-shadow-md')}
              <span className="mt-2 text-[11px] text-slate-400">
                更新于 {weather?.updatedAt ? new Date(weather.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '刚刚'}
              </span>
            </div>
          </div>

          {/* Short-term Rain Prediction Banner */}
          {weather?.rainForecastSummary && (
            <div id="weather_rain_prediction_banner" className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-sky-200">
              <CloudRain className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="font-normal">{weather.rainForecastSummary}</span>
            </div>
          )}
        </div>

        {/* Live Weather Warning Alerts */}
        {weather?.alerts && weather.alerts.length > 0 && (
          <div id="weather_alerts_container" className="space-y-2">
            {weather.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3.5 rounded-2xl border flex items-start gap-3 shadow-md ${
                  alert.level === 'orange' || alert.level === 'red'
                    ? 'bg-orange-950/40 border-orange-500/40 text-orange-200'
                    : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                }`}
              >
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{alert.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-medium">
                      {alert.levelText}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{alert.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 24-Hour Hourly Forecast Scroll */}
        {weather?.hourly && weather.hourly.length > 0 && (
          <div id="weather_hourly_card" className="p-4 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>逐小时预报 (24小时)</span>
              </div>
              <span className="text-[11px] text-slate-400">降雨概率</span>
            </div>

            <div className="flex items-center gap-4 overflow-x-auto pt-3 pb-1 no-scrollbar">
              {weather.hourly.slice(0, 24).map((hour, idx) => (
                <div key={idx} className="flex flex-col items-center min-w-[56px] py-1 text-center shrink-0">
                  <span className="text-[11px] text-slate-400 font-medium">{hour.time}</span>
                  <div className="my-2">
                    {getWeatherIcon(hour.condition, hour.conditionCode, 'w-6 h-6')}
                  </div>
                  <span className="text-sm font-semibold text-slate-100">{hour.temp}°</span>
                  <div className="mt-1.5 flex items-center justify-center">
                    {hour.precipProbability > 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">
                        {hour.precipProbability}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-600">-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7-Day Forecast */}
        {weather?.daily && weather.daily.length > 0 && (
          <div id="weather_daily_card" className="p-4 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-md">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800/60 text-xs font-semibold text-slate-300">
              <CloudSun className="w-3.5 h-3.5 text-amber-400" />
              <span>未来 7 天天气预报</span>
            </div>

            <div className="divide-y divide-slate-800/40 pt-1">
              {weather.daily.map((day, idx) => (
                <div key={idx} className="flex items-center justify-between py-2.5 text-xs">
                  <span className={`w-12 font-medium ${idx === 0 ? 'text-sky-400 font-semibold' : 'text-slate-300'}`}>
                    {day.dayOfWeek}
                  </span>

                  <div className="flex items-center gap-2 w-24">
                    {getWeatherIcon(day.condition, day.conditionCode, 'w-4 h-4')}
                    <span className="text-[11px] text-slate-300 truncate">{day.condition}</span>
                  </div>

                  <div className="flex items-center gap-1 w-14 justify-center">
                    {day.precipProbability > 0 ? (
                      <span className="text-[10px] text-blue-300 font-medium">{day.precipProbability}%</span>
                    ) : (
                      <span className="text-[10px] text-slate-600">-</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <span className="text-slate-400 text-[11px]">{day.tempMin}°</span>
                    <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 bg-gradient-to-r from-blue-400 to-amber-400 rounded-full"
                        style={{
                          left: `${Math.max(0, Math.min(60, (day.tempMin - 10) * 3))}%`,
                          right: `${Math.max(0, Math.min(60, (40 - day.tempMax) * 3))}%`,
                        }}
                      />
                    </div>
                    <span className="text-slate-100 font-semibold text-[11px]">{day.tempMax}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offline / Fallback Cache Notice Banner */}
        {weather?.dataSourceInfo?.isFromCache && (
          <div id="weather_cache_warning_banner" className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-amber-200">当前处于离线 / 网络回退缓存状态</div>
              <div className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                未能连接到实时天气服务器，正在显示历史缓存数据（缓存采样时间: {weather.dataSourceInfo.cacheTimestamp ? new Date(weather.dataSourceInfo.cacheTimestamp).toLocaleString() : '旧记录'}）。
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className="px-2.5 py-1 rounded-lg bg-amber-500/25 hover:bg-amber-500/35 text-amber-200 text-[10px] font-semibold shrink-0"
            >
              重新连接
            </button>
          </div>
        )}

        {/* Air Quality (AQI) */}
        <div id="weather_aqi_card" className="p-4 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Wind className="w-3.5 h-3.5 text-emerald-400" />
              <span>空气质量指数 (AQI)</span>
            </div>
            {weather?.airQuality?.aqi !== undefined ? (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  weather.airQuality.aqi <= 50
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : weather.airQuality.aqi <= 100
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {weather.airQuality.label || '优'} ({weather.airQuality.aqi})
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                暂无数据
              </span>
            )}
          </div>

          <div className="mt-3">
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 w-[25%]" />
              <div className="h-full bg-amber-500 w-[25%]" />
              <div className="h-full bg-orange-500 w-[25%]" />
              <div className="h-full bg-rose-500 w-[25%]" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
            {weather?.airQuality?.pm25 !== undefined
              ? `PM2.5: ${weather.airQuality.pm25} μg/m³ · 数据源自欧洲哥白尼大气监测服务 (CAMS)`
              : '当前测站暂未提供 PM2.5 实时监测指标'}
          </p>
        </div>

        {/* 4-Grid Detailed Weather Metrics */}
        <div id="weather_grid_metrics" className="grid grid-cols-2 gap-3 pb-2">
          <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Droplets className="w-3.5 h-3.5 text-blue-400" />
              <span>相对湿度</span>
            </div>
            <div className="mt-2 text-xl font-bold text-slate-100">{weather?.humidity !== undefined ? `${weather.humidity}%` : '暂无数据'}</div>
            <span className="text-[10px] text-slate-400">空气含水量</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span>风速与风向</span>
            </div>
            <div className="mt-2 text-lg font-bold text-slate-100 truncate">{weather?.windDirection || '微风'}</div>
            <span className="text-[10px] text-slate-400">{weather?.windSpeed !== undefined ? `${weather.windSpeed} km/h` : '暂无数据'}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>紫外线指数</span>
            </div>
            <div className="mt-2 text-xl font-bold text-slate-100">{weather?.uvIndex !== undefined ? weather.uvIndex : '暂无数据'}</div>
            <span className="text-[10px] text-slate-400">外出防护参考</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>降雨量与概率</span>
            </div>
            <div className="mt-2 text-xl font-bold text-slate-100">{weather?.precipProbability !== undefined ? `${weather.precipProbability}%` : '暂无数据'}</div>
            <span className="text-[10px] text-slate-400">降雨量 {weather?.precipitation !== undefined ? `${weather.precipitation} mm` : '0 mm'}</span>
          </div>
        </div>

        {/* Developer Mode & Data Source Inspector */}
        <div id="weather_developer_inspector_card" className="p-4 rounded-3xl bg-slate-900/50 border border-slate-800/70 text-xs space-y-2.5 pb-6">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>数据来源与真实性诊断 (开发模式)</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
              REAL LIVE DATA
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/50">
              <span className="text-slate-500 block">手机真实经纬度:</span>
              <span className="font-mono text-slate-200">
                {weather?.latitude !== undefined && weather?.longitude !== undefined
                  ? `${weather.latitude.toFixed(4)}, ${weather.longitude.toFixed(4)}`
                  : '未提供'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/50">
              <span className="text-slate-500 block">定位模式:</span>
              <span className="text-slate-200">
                {isAutoGps ? '📡 手机原生 GPS' : '📍 手动指定城市'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/50">
              <span className="text-slate-500 block">气象预报服务源:</span>
              <span className="text-slate-200 truncate block" title={weather?.dataSourceInfo?.serviceName}>
                {weather?.dataSourceInfo?.serviceName || 'Open-Meteo WMO / ECMWF'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/50">
              <span className="text-slate-500 block">逆地理编码服务:</span>
              <span className="text-slate-200 truncate block">
                {weather?.dataSourceInfo?.geocodingService || 'Open-Meteo & BigDataCloud'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/50">
              <span className="text-slate-500 block">请求耗时 & 网络延时:</span>
              <span className="font-mono text-emerald-400">
                {weather?.dataSourceInfo?.networkLatencyMs !== undefined
                  ? `${weather.dataSourceInfo.networkLatencyMs} ms`
                  : '实时直连'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/50">
              <span className="text-slate-500 block">最新采样更新时间:</span>
              <span className="font-mono text-slate-200">
                {weather?.updatedAt ? new Date(weather.updatedAt).toLocaleTimeString() : '刚刚'}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-1 leading-relaxed border-t border-slate-800/40">
            * 架构合规保证：所有时间均读取手机底层系统时钟；定位直连原生 GPS；天气与地理编码通过普通网络直连气象局公开 API；用户配置的 AI API 绝不介入数据采集与定位，仅用于微信聊天与自然语言智能关怀。
          </div>
        </div>
      </div>

      {/* City Switcher Modal */}
      {showCityModal && (
        <div id="weather_city_modal" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-fadeIn">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-sky-400" />
                <h3 className="font-semibold text-slate-100 text-base">切换与搜索城市</h3>
              </div>
              <button
                onClick={() => setShowCityModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions: "Use Current Location" & "Refresh Location" */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                id="modal_use_gps_btn"
                onClick={handleUseCurrentLocation}
                disabled={isLocatingGps}
                className="p-3 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 flex items-center gap-2.5 transition-all active:scale-98 text-left"
              >
                <LocateFixed className={`w-5 h-5 text-sky-400 shrink-0 ${isLocatingGps ? 'animate-spin' : ''}`} />
                <div>
                  <div className="text-xs font-bold text-sky-200">使用当前位置</div>
                  <div className="text-[10px] text-sky-300/70 mt-0.5">获取手机真实 GPS 坐标</div>
                </div>
              </button>

              <button
                id="modal_refresh_gps_btn"
                onClick={async () => {
                  await handleRefresh();
                  setShowCityModal(false);
                }}
                disabled={isRefreshing}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 flex items-center gap-2.5 transition-all active:scale-98 text-left"
              >
                <RefreshCw className={`w-5 h-5 text-slate-300 shrink-0 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
                <div>
                  <div className="text-xs font-bold text-slate-100">刷新天气数据</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">拉取气象站最新采样</div>
                </div>
              </button>
            </div>

            {/* City Search Bar (Network service) */}
            <div className="mt-4 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={citySearchQuery}
                onChange={(e) => setCitySearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && citySearchQuery.trim()) {
                    handleSelectCityItem({ name: citySearchQuery.trim() });
                  }
                }}
                placeholder="搜索任意城市/区县 (如: 顺德 / 海淀 / 昆明 / 巴黎)"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500 placeholder-slate-500"
              />
              {isSearchingCities && (
                <div className="absolute right-3 top-2.5">
                  <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                </div>
              )}
            </div>

            {/* Live Search Results List */}
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-2xl bg-slate-800/80 border border-slate-700/80">
                <span className="text-[10px] font-semibold text-sky-400 px-1">真实搜索匹配结果:</span>
                {searchResults.map((item, idx) => (
                  <button
                    key={`${item.name}_${item.latitude}_${idx}`}
                    onClick={() =>
                      handleSelectCityItem({
                        name: item.name,
                        latitude: item.latitude,
                        longitude: item.longitude,
                        displayName: item.displayName,
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-sky-950/40 border border-slate-800 hover:border-sky-500/50 flex items-center justify-between text-left transition-all active:scale-98"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-400" />
                        <span>{item.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {[item.admin1, item.country].filter(Boolean).join(' · ') || '中国'} (经纬度: {item.latitude.toFixed(2)}, {item.longitude.toFixed(2)})
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                ))}
              </div>
            )}

            {/* Popular City Grid */}
            <div className="mt-4 flex-1 overflow-y-auto">
              <span className="text-[11px] font-semibold text-slate-400">热门常用城市</span>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {POPULAR_CITIES.filter((c) => !citySearchQuery || c.includes(citySearchQuery)).map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelectCityItem({ name: c })}
                    className={`py-2 px-1 rounded-xl text-xs font-medium border transition-all text-center ${
                      config.selectedCity === c && config.locationMode === 'manual'
                        ? 'bg-sky-500/20 border-sky-500/60 text-sky-300 font-semibold'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Weather Care Settings & Testing Modal */}
      {showCareSettingsModal && (
        <div id="weather_care_modal" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-fadeIn">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 max-h-[88vh] flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                <h3 className="font-semibold text-slate-100 text-base">AI 实时天气感知与主动关怀</h3>
              </div>
              <button
                onClick={() => setShowCareSettingsModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Master Switch */}
            <div className="mt-4 p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-rose-200">启用 AI 天气主动关心</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  突发降雨、恶劣暴雨、高温酷暑时，AI 角色将依据其独特性格主动发来微信贴心提醒
                </div>
              </div>
              <button
                onClick={() => handleSaveCareConfig({ enabled: !careConfig.enabled })}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                  careConfig.enabled ? 'bg-rose-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    careConfig.enabled ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Trigger Conditions */}
            <div className="mt-4">
              <span className="text-[11px] font-semibold text-slate-400">感知触发条件设置</span>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { key: 'rainSoon', label: '🌧️ 即将下雨预警' },
                  { key: 'severeWeather', label: '⛈️ 暴雨与强对流' },
                  { key: 'highRainChance', label: '☔ 全天高降雨率' },
                  { key: 'highTemp', label: '🔥 高温酷热 (>35°)' },
                  { key: 'lowTemp', label: '❄️ 低温寒潮 (<5°)' },
                  { key: 'tempDropOrRise', label: '📉 剧烈升降温' },
                  { key: 'strongWind', label: '💨 大风天气' },
                  { key: 'weatherAlerts', label: '⚠️ 气象灾害预警' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() =>
                      handleSaveCareConfig({
                        triggers: {
                          ...careConfig.triggers,
                          [item.key]: !careConfig.triggers[item.key as keyof typeof careConfig.triggers],
                        },
                      })
                    }
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-all ${
                      careConfig.triggers[item.key as keyof typeof careConfig.triggers]
                        ? 'bg-slate-800 border-sky-500/50 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    <span>{item.label}</span>
                    {careConfig.triggers[item.key as keyof typeof careConfig.triggers] && (
                      <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule & DND settings */}
            <div className="mt-4 space-y-2">
              <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-200">免打扰时间段 (DND)</div>
                  <div className="text-[10px] text-slate-400">
                    夜间安静时段 ({careConfig.dndStart} - {careConfig.dndEnd}) 不主动弹出问候
                  </div>
                </div>
                <button
                  onClick={() => handleSaveCareConfig({ dndEnabled: !careConfig.dndEnabled })}
                  className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                    careConfig.dndEnabled ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      careConfig.dndEnabled ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-200">桌面备忘录与日程联动</div>
                  <div className="text-[10px] text-slate-400">读取户外运动、出差待办等日程，关怀更贴合</div>
                </div>
                <button
                  onClick={() => handleSaveCareConfig({ enableScheduleAwareness: !careConfig.enableScheduleAwareness })}
                  className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                    careConfig.enableScheduleAwareness ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      careConfig.enableScheduleAwareness ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Instant AI Testing Sandbox */}
            <div className="mt-4 p-4 rounded-2xl bg-slate-800/70 border border-slate-700/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-100">🧪 模拟突发天气并触发主动关心</span>
                <span className="text-[10px] text-slate-400">一键测试</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-slate-400 shrink-0">选择角色:</span>
                <select
                  value={testSelectedCharId}
                  onChange={(e) => setTestSelectedCharId(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.persona.slice(0, 12)}...)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <button
                  onClick={() => handleRunMockWeatherCare('rain_soon')}
                  disabled={isTestingCare}
                  className="p-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-200 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                >
                  🌧️ 触发降雨
                </button>
                <button
                  onClick={() => handleRunMockWeatherCare('high_temp')}
                  disabled={isTestingCare}
                  className="p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                >
                  ☀️ 触发高温
                </button>
                <button
                  onClick={() => handleRunMockWeatherCare('temp_drop')}
                  disabled={isTestingCare}
                  className="p-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                >
                  🧣 触发降温
                </button>
              </div>

              {testCareStatus && (
                <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-700 text-xs leading-relaxed text-slate-200 animate-fadeIn">
                  {testCareStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
