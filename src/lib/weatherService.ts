import { WeatherData, WeatherConfig, WeatherCareConfig, WeatherEvent, WeatherEventType, Memo } from '../types';
import { systemNativeService, SystemLocationResult } from './systemNativeService';

const WEATHER_CACHE_KEY = 'wechat_phone_weather_cache_v2';
const WEATHER_CONFIG_KEY = 'wechat_phone_weather_config_v2';
const WEATHER_CARE_CONFIG_KEY = 'wechat_phone_weather_care_config_v2';
const WEATHER_LAST_CARE_PREFIX = 'weather_care_last_v2_';

// Default Weather Configuration (No hardcoded Shenzhen, defaults to auto GPS)
export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  locationMode: 'auto',
  selectedCity: '',
  latitude: undefined,
  longitude: undefined,
  autoRefreshIntervalMinutes: 15,
  lastUpdated: 0,
};

// Default Weather Care Configuration
export const DEFAULT_WEATHER_CARE_CONFIG: WeatherCareConfig = {
  enabled: true,
  dndEnabled: true,
  dndStart: '23:00',
  dndEnd: '07:00',
  cooldownHours: 4,
  enableScheduleAwareness: true,
  triggers: {
    rainSoon: true,
    highRainChance: true,
    severeWeather: true,
    highTemp: true,
    lowTemp: true,
    tempDropOrRise: true,
    strongWind: true,
    weatherAlerts: true,
  },
};

// Initial Placeholder Weather Data (Explicitly unlocated before first GPS or search)
export const INITIAL_EMPTY_WEATHER_DATA: WeatherData = {
  city: '',
  country: '',
  latitude: 0,
  longitude: 0,
  temp: 25,
  feelsLike: 25,
  tempMin: 20,
  tempMax: 30,
  condition: '多云',
  conditionCode: 2,
  humidity: 50,
  windSpeed: 10,
  windDirection: '微风',
  precipProbability: 0,
  precipitation: 0,
  uvIndex: 4.0,
  airQuality: {
    aqi: 35,
    label: '优',
    pm25: 15,
  },
  hourly: [],
  daily: [],
  alerts: [],
  updatedAt: 0,
  isAutoLocation: true,
  locationStatus: 'pending',
  rainForecastSummary: '等待获取实时天气...',
};

class WeatherService {
  private static instance: WeatherService;
  private cachedWeather: WeatherData | null = null;
  private isFetching = false;
  private listeners: Set<(weather: WeatherData) => void> = new Set();
  private autoRefreshTimer: any = null;

  private constructor() {
    this.init();
  }

  public static getInstance(): WeatherService {
    if (!WeatherService.instance) {
      WeatherService.instance = new WeatherService();
    }
    return WeatherService.instance;
  }

  private init() {
    // Load cached weather
    try {
      const saved = localStorage.getItem(WEATHER_CACHE_KEY);
      if (saved) {
        this.cachedWeather = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse weather cache', e);
    }

    // Schedule background auto-refresh
    this.scheduleAutoRefresh();
  }

  private scheduleAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }
    const config = this.getWeatherConfig();
    const intervalMs = Math.max(5, config.autoRefreshIntervalMinutes || 15) * 60 * 1000;
    this.autoRefreshTimer = setInterval(() => {
      this.fetchWeather(true).catch((e) => console.warn('Auto weather refresh error', e));
    }, intervalMs);
  }

  // Get current weather (returns cached if fresh, triggers background refresh if stale)
  public async getWeather(force = false): Promise<WeatherData> {
    const config = this.getWeatherConfig();
    const now = Date.now();
    const maxAgeMs = Math.max(5, config.autoRefreshIntervalMinutes || 15) * 60 * 1000;

    if (this.cachedWeather && !force && now - this.cachedWeather.updatedAt < maxAgeMs && this.cachedWeather.city) {
      return this.cachedWeather;
    }

    if (this.isFetching && this.cachedWeather && this.cachedWeather.city) {
      return this.cachedWeather;
    }

    return this.fetchWeather(force);
  }

  // Force fetch fresh weather data from /api/weather
  public async fetchWeather(force = false): Promise<WeatherData> {
    this.isFetching = true;
    const config = this.getWeatherConfig();

    let lat = config.latitude;
    let lon = config.longitude;
    let city = config.selectedCity;
    const isAuto = config.locationMode === 'auto';

    let locationErrorMsg: string | null = null;
    let locationStatus: 'gps_active' | 'manual_city' | 'permission_denied' | 'error' | 'pending' = isAuto ? 'gps_active' : 'manual_city';

    // 1. If in Auto GPS mode, get real Android / Browser GPS
    if (isAuto) {
      const locResult: SystemLocationResult = await systemNativeService.getRealLocation(force);
      if (locResult.success && locResult.latitude !== undefined && locResult.longitude !== undefined) {
        lat = locResult.latitude;
        lon = locResult.longitude;
        city = locResult.city || locResult.displayName || city;
        locationStatus = 'gps_active';
      } else {
        locationErrorMsg = locResult.error || '获取位置失败';
        if (locResult.errorCode === 'permission_denied') {
          locationStatus = 'permission_denied';
        } else {
          locationStatus = 'error';
        }
      }
    }

    // 2. Fetch real weather data from backend API (Open-Meteo)
    try {
      const url = new URL('/api/weather', window.location.origin);
      if (city) url.searchParams.set('city', city);
      if (lat !== undefined && !isNaN(lat)) url.searchParams.set('lat', lat.toString());
      if (lon !== undefined && !isNaN(lon)) url.searchParams.set('lon', lon.toString());
      url.searchParams.set('auto', isAuto ? 'true' : 'false');

      // If we have neither coordinates nor a city, do not make an invalid request
      if ((lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) && !city) {
        const unlocatedWeather: WeatherData = {
          ...INITIAL_EMPTY_WEATHER_DATA,
          locationStatus: locationStatus === 'permission_denied' ? 'permission_denied' : 'pending',
          locationError: locationErrorMsg || '未开启手机定位且未指定城市',
          updatedAt: Date.now(),
        };
        this.cachedWeather = unlocatedWeather;
        this.notifyListeners(unlocatedWeather);
        this.isFetching = false;
        return unlocatedWeather;
      }

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.weather) {
          const freshWeather: WeatherData = {
            ...data.weather,
            locationStatus: locationErrorMsg ? locationStatus : (isAuto ? 'gps_active' : 'manual_city'),
            locationError: locationErrorMsg || undefined,
            isAutoLocation: isAuto,
          };
          this.cachedWeather = freshWeather;
          try {
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(freshWeather));
          } catch (storageErr) {
            console.warn('Failed to save weather cache', storageErr);
          }
          this.notifyListeners(freshWeather);
          this.isFetching = false;
          return freshWeather;
        }
      }
    } catch (netErr: any) {
      console.warn('Weather fetch network error', netErr);
      locationErrorMsg = netErr.message || '网络连接异常';
    }

    this.isFetching = false;
    if (this.cachedWeather && this.cachedWeather.city) {
      return this.cachedWeather;
    }

    const fallback: WeatherData = {
      ...INITIAL_EMPTY_WEATHER_DATA,
      locationStatus: locationStatus,
      locationError: locationErrorMsg || undefined,
    };
    return fallback;
  }

  /**
   * 切换至“使用当前位置” (Use Current Location)
   * 强制重新请求手机卫星定位与真实逆地理编码
   */
  public async useCurrentLocation(): Promise<WeatherData> {
    this.saveWeatherConfig({
      locationMode: 'auto',
      selectedCity: '',
      latitude: undefined,
      longitude: undefined,
    });
    return this.fetchWeather(true);
  }

  /**
   * 刷新当前位置与天气 (Refresh Location)
   */
  public async refreshLocation(): Promise<WeatherData> {
    return this.fetchWeather(true);
  }

  /**
   * 用户从搜索列表选中城市 (Select Manual City)
   */
  public async selectCity(cityItem: {
    name: string;
    latitude: number;
    longitude: number;
    displayName?: string;
  }): Promise<WeatherData> {
    this.saveWeatherConfig({
      locationMode: 'manual',
      selectedCity: cityItem.name,
      latitude: cityItem.latitude,
      longitude: cityItem.longitude,
    });
    return this.fetchWeather(true);
  }

  // Real multi-level city search from Open-Meteo & Nominatim geocoding (Open Network Service, NOT AI API)
  public async searchCities(query: string): Promise<any[]> {
    if (!query || !query.trim()) return [];
    try {
      const url = new URL('/api/weather/search-city', window.location.origin);
      url.searchParams.set('query', query.trim());
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          return data.results;
        }
      }
    } catch (err) {
      console.warn('Search cities error:', err);
    }
    return [];
  }

  // Subscribe to live weather changes
  public subscribeWeather(callback: (weather: WeatherData) => void): () => void {
    this.listeners.add(callback);
    if (this.cachedWeather) {
      callback(this.cachedWeather);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(weather: WeatherData) {
    this.listeners.forEach((listener) => {
      try {
        listener(weather);
      } catch (e) {
        console.error('Weather listener error', e);
      }
    });
  }

  // Get/Save Weather Config
  public getWeatherConfig(): WeatherConfig {
    try {
      const saved = localStorage.getItem(WEATHER_CONFIG_KEY);
      if (saved) {
        return { ...DEFAULT_WEATHER_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return DEFAULT_WEATHER_CONFIG;
  }

  public saveWeatherConfig(partial: Partial<WeatherConfig>): WeatherConfig {
    const current = this.getWeatherConfig();
    const updated: WeatherConfig = { ...current, ...partial, lastUpdated: Date.now() };
    try {
      localStorage.setItem(WEATHER_CONFIG_KEY, JSON.stringify(updated));
    } catch (e) {}
    this.scheduleAutoRefresh();
    return updated;
  }

  // Get/Save Weather Care Config
  public getWeatherCareConfig(): WeatherCareConfig {
    try {
      const saved = localStorage.getItem(WEATHER_CARE_CONFIG_KEY);
      if (saved) {
        return { ...DEFAULT_WEATHER_CARE_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return DEFAULT_WEATHER_CARE_CONFIG;
  }

  public saveWeatherCareConfig(partial: Partial<WeatherCareConfig>): WeatherCareConfig {
    const current = this.getWeatherCareConfig();
    const updated: WeatherCareConfig = {
      ...current,
      ...partial,
      triggers: {
        ...current.triggers,
        ...(partial.triggers || {}),
      },
    };
    try {
      localStorage.setItem(WEATHER_CARE_CONFIG_KEY, JSON.stringify(updated));
    } catch (e) {}
    return updated;
  }

  // Detect Weather Events for AI Proactive Care
  public detectWeatherEvents(
    weather: WeatherData,
    memos: Memo[] = [],
    careConfig?: WeatherCareConfig
  ): WeatherEvent[] {
    const config = careConfig || this.getWeatherCareConfig();
    if (!config.enabled || !weather || !weather.city) return [];

    const events: WeatherEvent[] = [];
    const hourly = weather.hourly || [];
    const daily = weather.daily || [];

    // Find any relevant user memos / schedules
    const relevantMemos = (memos || []).filter(
      (m) =>
        m.content &&
        (m.content.includes('跑') ||
          m.content.includes('运动') ||
          m.content.includes('出行') ||
          m.content.includes('开会') ||
          m.content.includes('登山') ||
          m.content.includes('野餐') ||
          m.content.includes('出差') ||
          m.content.includes('约会') ||
          m.content.includes('逛街') ||
          m.content.includes('买菜'))
    );
    const relatedSchedule = relevantMemos.length > 0 ? relevantMemos[0].content : undefined;

    // 1. 即将下雨 (Rain Soon in 1~2 hours)
    if (config.triggers.rainSoon) {
      const rainUpcomingHour = hourly.slice(1, 4).find((h) => h.precipProbability >= 60 || h.precipitation >= 0.8);
      if (rainUpcomingHour && weather.precipitation < 1.0) {
        events.push({
          type: 'rain_soon',
          title: '即将降雨预警',
          summary: `预计 ${rainUpcomingHour.time} 开始降水，降雨概率 ${rainUpcomingHour.precipProbability}%`,
          detail: `检测到 ${rainUpcomingHour.time} 附近降雨概率攀升至 ${rainUpcomingHour.precipProbability}%，降雨量约 ${rainUpcomingHour.precipitation}mm。建议出门备伞。`,
          severity: 'medium',
          timestamp: Date.now(),
          relatedSchedule,
          weatherSnapshot: {
            temp: weather.temp,
            feelsLike: weather.feelsLike,
            condition: weather.condition,
            precipProbability: rainUpcomingHour.precipProbability,
            rainStartTime: rainUpcomingHour.time,
            city: weather.city,
          },
        });
      }
    }

    // 2. 暴雨 / 强对流恶劣天气 (Severe Weather)
    if (config.triggers.severeWeather) {
      const isThunder = [95, 96, 99].includes(weather.conditionCode) || hourly.slice(0, 4).some((h) => [95, 96, 99].includes(h.conditionCode));
      const isHeavyRain = weather.precipitation >= 15 || hourly.slice(0, 4).some((h) => h.precipitation >= 10);
      if (isThunder || isHeavyRain) {
        events.push({
          type: 'severe_weather',
          title: '雷暴与强降雨恶劣天气',
          summary: isThunder ? '突发强雷电与短时对流天气' : '强暴雨来袭',
          detail: `当前城市处于强对流/暴雨影响区，伴随强降水与雷暴。提醒尽量在室内避险，关好门窗，注意安全。`,
          severity: 'urgent',
          timestamp: Date.now(),
          relatedSchedule,
          weatherSnapshot: {
            temp: weather.temp,
            feelsLike: weather.feelsLike,
            condition: weather.condition,
            precipProbability: weather.precipProbability,
            alertTitle: isThunder ? '雷电强对流' : '短时强暴雨',
            city: weather.city,
          },
        });
      }
    }

    // 3. 高降雨概率 (High Rain Chance today)
    if (config.triggers.highRainChance && events.every((e) => e.type !== 'rain_soon' && e.type !== 'severe_weather')) {
      const maxDailyPrecipProb = daily[0]?.precipProbability || 0;
      if (maxDailyPrecipProb >= 70 || weather.precipProbability >= 70) {
        events.push({
          type: 'high_rain_chance',
          title: '全天高降雨概率',
          summary: `今日降水概率高达 ${maxDailyPrecipProb || weather.precipProbability}%`,
          detail: `今日受降水云系影响，全天有较高阵雨/降水几率。`,
          severity: 'medium',
          timestamp: Date.now(),
          relatedSchedule,
          weatherSnapshot: {
            temp: weather.temp,
            feelsLike: weather.feelsLike,
            condition: weather.condition,
            precipProbability: maxDailyPrecipProb || weather.precipProbability,
            city: weather.city,
          },
        });
      }
    }

    // 4. 高温天气 (High Temp >= 35°C)
    if (config.triggers.highTemp && (weather.temp >= 35 || weather.tempMax >= 36)) {
      events.push({
        type: 'high_temp',
        title: '高温酷热关照',
        summary: `当前气温 ${weather.temp}°C，今日最高 ${weather.tempMax}°C`,
        detail: `气温较高、紫外线强烈，体感温度达 ${weather.feelsLike}°C。提醒及时补充水分与电解质，避免中暑。`,
        severity: 'medium',
        timestamp: Date.now(),
        relatedSchedule,
        weatherSnapshot: {
          temp: weather.temp,
          feelsLike: weather.feelsLike,
          condition: weather.condition,
          precipProbability: weather.precipProbability,
          city: weather.city,
        },
      });
    }

    // 5. 低温寒潮 (Low Temp <= 5°C)
    if (config.triggers.lowTemp && (weather.temp <= 5 || weather.tempMin <= 3)) {
      events.push({
        type: 'low_temp',
        title: '低温寒冷保暖提示',
        summary: `当前气温 ${weather.temp}°C，最低降至 ${weather.tempMin}°C`,
        detail: `寒潮降温明显，早晚体感较冷。提醒多加一件外套、戴好围巾手套，注意身体保暖防感冒。`,
        severity: 'medium',
        timestamp: Date.now(),
        relatedSchedule,
        weatherSnapshot: {
          temp: weather.temp,
          feelsLike: weather.feelsLike,
          condition: weather.condition,
          precipProbability: weather.precipProbability,
          city: weather.city,
        },
      });
    }

    // 6. 剧烈温差变化 (Temp Drop / Rise >= 6°C)
    if (config.triggers.tempDropOrRise && daily.length >= 2) {
      const todayAvg = (daily[0].tempMax + daily[0].tempMin) / 2;
      const tomorrowAvg = (daily[1].tempMax + daily[1].tempMin) / 2;
      const diff = tomorrowAvg - todayAvg;
      if (diff <= -6) {
        events.push({
          type: 'temp_drop',
          title: '气温骤降预报',
          summary: `明日预计剧烈降温 ${Math.abs(Math.round(diff))}°C`,
          detail: `受冷空气南下影响，明日气温将出现明显断崖式下滑。建议提前准备保暖厚衣物。`,
          severity: 'medium',
          timestamp: Date.now(),
          relatedSchedule,
          weatherSnapshot: {
            temp: weather.temp,
            feelsLike: weather.feelsLike,
            condition: weather.condition,
            precipProbability: weather.precipProbability,
            city: weather.city,
          },
        });
      } else if (diff >= 6) {
        events.push({
          type: 'temp_rise',
          title: '气温明显回升',
          summary: `明日预计升温 ${Math.round(diff)}°C`,
          detail: `暖湿气流增强，明日气温明显回暖。注意适当减少衣物以防闷热。`,
          severity: 'low',
          timestamp: Date.now(),
          relatedSchedule,
          weatherSnapshot: {
            temp: weather.temp,
            feelsLike: weather.feelsLike,
            condition: weather.condition,
            precipProbability: weather.precipProbability,
            city: weather.city,
          },
        });
      }
    }

    // 7. 大风天气 (Strong Wind >= 35 km/h)
    if (config.triggers.strongWind && weather.windSpeed >= 35) {
      events.push({
        type: 'strong_wind',
        title: '大风天气关照',
        summary: `阵风风速达 ${weather.windSpeed} km/h (${weather.windDirection})`,
        detail: `阵风风力较大，室外注意防风防沙，远离老旧广告牌与枯树，关紧窗户。`,
        severity: 'medium',
        timestamp: Date.now(),
        relatedSchedule,
        weatherSnapshot: {
          temp: weather.temp,
          feelsLike: weather.feelsLike,
          condition: weather.condition,
          precipProbability: weather.precipProbability,
          city: weather.city,
        },
      });
    }

    // 8. 重要气象预警 (Weather Alerts)
    if (config.triggers.weatherAlerts && weather.alerts && weather.alerts.length > 0) {
      weather.alerts.forEach((alert) => {
        events.push({
          type: 'weather_alert',
          title: `气象预警·${alert.title}`,
          summary: alert.title,
          detail: alert.description,
          severity: alert.level === 'red' || alert.level === 'orange' ? 'urgent' : 'high',
          timestamp: Date.now(),
          relatedSchedule,
          weatherSnapshot: {
            temp: weather.temp,
            feelsLike: weather.feelsLike,
            condition: weather.condition,
            precipProbability: weather.precipProbability,
            alertTitle: alert.title,
            city: weather.city,
          },
        });
      });
    }

    return events;
  }

  // Check if proactive care can be triggered (Cooldown & DND check)
  public checkShouldTriggerCare(event: WeatherEvent, careConfig?: WeatherCareConfig): boolean {
    const config = careConfig || this.getWeatherCareConfig();
    if (!config.enabled) return false;

    // 1. DND (Do Not Disturb) Check
    if (config.dndEnabled) {
      const now = new Date();
      const curMinutes = now.getHours() * 60 + now.getMinutes();

      const [startH, startM] = (config.dndStart || '23:00').split(':').map(Number);
      const [endH, endM] = (config.dndEnd || '07:00').split(':').map(Number);
      const startMinutes = (startH || 23) * 60 + (startM || 0);
      const endMinutes = (endH || 7) * 60 + (endM || 0);

      if (startMinutes > endMinutes) {
        if (curMinutes >= startMinutes || curMinutes < endMinutes) {
          return false; // In DND
        }
      } else {
        if (curMinutes >= startMinutes && curMinutes < endMinutes) {
          return false; // In DND
        }
      }
    }

    // 2. Cooldown Check per event type
    const cooldownMs = (config.cooldownHours || 4) * 3600 * 1000;
    const lastTimestamp = parseInt(localStorage.getItem(WEATHER_LAST_CARE_PREFIX + event.type) || '0', 10);
    if (Date.now() - lastTimestamp < cooldownMs) {
      return false; // Still in cooldown
    }

    return true;
  }

  // Mark proactive care event as triggered
  public markCareTriggered(eventType: WeatherEventType) {
    try {
      localStorage.setItem(WEATHER_LAST_CARE_PREFIX + eventType, Date.now().toString());
    } catch (e) {}
  }
}

export const weatherService = WeatherService.getInstance();
