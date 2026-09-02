/**
 * Native Android / Browser Device Capabilities
 * Strictly separates native phone hardware (Time, GPS Geolocation, Battery, Vibration)
 * from Internet API services (Weather, Geocoding) and AI services.
 */

export interface SystemLocationResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  displayName?: string;
  error?: string;
  errorCode?: 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported';
  timestamp: number;
}

export interface SystemTimeInfo {
  now: Date;
  isoString: string;
  formattedDate: string;
  formattedTime: string;
  dayOfWeek: string;
  periodOfDay: '凌晨' | '早晨' | '上午' | '中午' | '下午' | '傍晚' | '夜间';
  timeZone: string;
  summaryString: string;
}

export interface BatteryInfo {
  level: number; // 0 ~ 100
  isCharging: boolean;
  isSupported: boolean;
}

export interface NetworkStateInfo {
  isOnline: boolean;
  type: string; // 'wifi' | 'cellular' | '4g' | '5g' | 'ethernet' | 'unknown'
  effectiveType: string; // '4g' | '3g' | '2g' | 'slow-2g'
  downlinkMbps?: number;
  rttMs?: number;
  saveData?: boolean;
}

class SystemNativeService {
  private static instance: SystemNativeService;
  private lastLocation: SystemLocationResult | null = null;
  private isLocating = false;

  private constructor() {}

  public static getInstance(): SystemNativeService {
    if (!SystemNativeService.instance) {
      SystemNativeService.instance = new SystemNativeService();
    }
    return SystemNativeService.instance;
  }

  /**
   * 一、获取真实系统时间 (Native Device System Clock)
   * 直接读取 Android 手机系统底层本地时间与时区，绝不使用 AI API 模拟，绝不写死。
   */
  public getRealSystemTime(): SystemTimeInfo {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dayOfWeek = days[now.getDay()];

    let periodOfDay: SystemTimeInfo['periodOfDay'] = '上午';
    if (hours >= 0 && hours < 6) periodOfDay = '凌晨';
    else if (hours >= 6 && hours < 9) periodOfDay = '早晨';
    else if (hours >= 9 && hours < 12) periodOfDay = '上午';
    else if (hours >= 12 && hours < 14) periodOfDay = '中午';
    else if (hours >= 14 && hours < 18) periodOfDay = '下午';
    else if (hours >= 18 && hours < 22) periodOfDay = '傍晚';
    else periodOfDay = '夜间';

    const formattedDate = `${year}年${String(month).padStart(2, '0')}月${String(date).padStart(2, '0')}日`;
    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    let timeZone = 'Asia/Shanghai';
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    } catch {}

    const summaryString = `${formattedDate} ${dayOfWeek} ${formattedTime} (${periodOfDay}, 时区: ${timeZone})`;

    return {
      now,
      isoString: now.toISOString(),
      formattedDate,
      formattedTime,
      dayOfWeek,
      periodOfDay,
      timeZone,
      summaryString,
    };
  }

  /**
   * 二、获取真实 GPS / 手机卫星定位 (Native Geolocation)
   * 彻底删除任何写死的深圳或固定坐标。
   * 支持真实定位权限请求、刷新位置、逆地理编码获取真实城市名称。
   */
  public async getRealLocation(forceRefresh = false): Promise<SystemLocationResult> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return {
        success: false,
        error: '当前手机或环境不支持 Geolocation 定位接口',
        errorCode: 'unsupported',
        timestamp: Date.now(),
      };
    }

    // Return cached recent GPS if within 30 seconds and not forced
    if (this.lastLocation && !forceRefresh && Date.now() - this.lastLocation.timestamp < 30000) {
      return this.lastLocation;
    }

    this.isLocating = true;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: forceRefresh ? 0 : 20000,
        });
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      // Reverse geocode via public Internet service (not AI API)
      let city = '';
      let district = '';
      let province = '';
      let country = '';
      let displayName = '';

      try {
        const geoRes = await fetch(
          `/api/weather/reverse-geocode?lat=${latitude}&lon=${longitude}`
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.success) {
            city = geoData.city || '';
            district = geoData.district || '';
            province = geoData.province || '';
            country = geoData.country || '';
            displayName = geoData.displayName || city;
          }
        }
      } catch (revErr) {
        console.warn('Reverse geocode failed:', revErr);
      }

      const result: SystemLocationResult = {
        success: true,
        latitude,
        longitude,
        city: city || `经纬度 (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
        district,
        province,
        country,
        displayName: displayName || city,
        timestamp: Date.now(),
      };

      this.lastLocation = result;
      this.isLocating = false;
      return result;
    } catch (err: any) {
      this.isLocating = false;
      let errorCode: SystemLocationResult['errorCode'] = 'position_unavailable';
      let errorMsg = '定位失败';

      if (err.code === 1) {
        errorCode = 'permission_denied';
        errorMsg = '未获得手机 GPS 定位权限。请在手机权限设置中允许位置访问。';
      } else if (err.code === 2) {
        errorCode = 'position_unavailable';
        errorMsg = '手机 GPS 信号弱或位置信息暂不可用。';
      } else if (err.code === 3) {
        errorCode = 'timeout';
        errorMsg = '获取手机卫星定位超时，请重试或手动搜索城市。';
      } else {
        errorMsg = err.message || '获取位置异常';
      }

      const failResult: SystemLocationResult = {
        success: false,
        error: errorMsg,
        errorCode,
        timestamp: Date.now(),
      };

      return failResult;
    }
  }

  /**
   * 三、获取手机真实网络连接状态 (Wi-Fi / 4G / 5G / Cellular)
   */
  public getNetworkState(): NetworkStateInfo {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let type = 'wifi';
    let effectiveType = '4g';
    let downlinkMbps = 10;
    let rttMs = 50;
    let saveData = false;

    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn) {
        type = conn.type || (conn.effectiveType === '4g' ? 'cellular/wifi' : conn.effectiveType || 'wifi');
        effectiveType = conn.effectiveType || '4g';
        downlinkMbps = conn.downlink || 10;
        rttMs = conn.rtt || 50;
        saveData = Boolean(conn.saveData);
      }
    }

    return {
      isOnline,
      type,
      effectiveType,
      downlinkMbps,
      rttMs,
      saveData,
    };
  }

  /**
   * 四、获取手机电池真实硬件状态
   */
  public async getBattery(): Promise<BatteryInfo> {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      try {
        const b = await (navigator as any).getBattery();
        return {
          level: Math.round((b.level || 1) * 100),
          isCharging: Boolean(b.charging),
          isSupported: true,
        };
      } catch {}
    }
    return {
      level: 100,
      isCharging: false,
      isSupported: false,
    };
  }

  /**
   * 五、触发手机振动 (Haptic Vibration)
   */
  public vibrate(pattern: number | number[] = 50): boolean {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        return navigator.vibrate(pattern);
      } catch {}
    }
    return false;
  }
}

export const systemNativeService = SystemNativeService.getInstance();
