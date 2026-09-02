import {
  SmartDevice,
  DeviceActionResult,
  DeviceOperationLog,
  DeviceRiskLevel,
  AiPermissions,
  DeviceCategory,
  DeviceProtocol,
} from '../types';

const STORAGE_KEYS = {
  DEVICES: 'wechat_phone_devices_v4',
  DEVICE_LOGS: 'wechat_phone_device_operation_logs_v4',
};

// 预设高拟真模拟测试设备库 (严格划分为 4 大类，明确标记为 isSimulation: true)
const INITIAL_SIMULATION_DEVICES: SmartDevice[] = [
  // 1. 智能家居 (smart_home)
  {
    id: 'dev_ac_1',
    name: '客厅智能变频空调 [模拟]',
    category: 'smart_home',
    subType: '空调',
    protocol: 'wifi',
    room: '客厅',
    status: 'connected',
    signalStrength: 92,
    model: 'Gree-Inverter-Pro-35',
    lastActiveTime: Date.now(),
    capabilities: ['电源开关', '16-30°C控温', '制冷/制热/除湿/送风模式', '风速调节', '节能生态模式'],
    aiAccessAllowed: true,
    isRealHardware: false,
    isSimulation: true,
    state: {
      power: true,
      temperature: 24,
      mode: 'cool',
      fanSpeed: 'auto',
      eco: true,
    },
    supportedActions: [
      {
        id: 'setPower',
        name: '电源开关',
        description: '开启或关闭空调',
        riskLevel: 'low',
        paramsSchema: [{ name: 'power', label: '电源', type: 'boolean', defaultValue: true }],
      },
      {
        id: 'setTemperature',
        name: '调节温度',
        description: '设置目标温度 (16°C ~ 30°C)',
        riskLevel: 'low',
        paramsSchema: [{ name: 'temperature', label: '温度 (°C)', type: 'number', min: 16, max: 30, step: 1, defaultValue: 24 }],
      },
      {
        id: 'setMode',
        name: '切换运行模式',
        description: '切换制冷、制热、除湿、送风或自动模式',
        riskLevel: 'low',
        paramsSchema: [
          {
            name: 'mode',
            label: '模式',
            type: 'enum',
            options: [
              { label: '❄️ 制冷', value: 'cool' },
              { label: '☀️ 制热', value: 'heat' },
              { label: '💧 除湿', value: 'dry' },
              { label: '🍃 送风', value: 'fan' },
              { label: '⚡ 自动', value: 'auto' },
            ],
            defaultValue: 'cool',
          },
        ],
      },
      {
        id: 'setFanSpeed',
        name: '调节风速',
        description: '调节出风风速',
        riskLevel: 'low',
        paramsSchema: [
          {
            name: 'fanSpeed',
            label: '风速',
            type: 'enum',
            options: [
              { label: '自动', value: 'auto' },
              { label: '低速', value: 'low' },
              { label: '中速', value: 'mid' },
              { label: '高速', value: 'high' },
            ],
            defaultValue: 'auto',
          },
        ],
      },
    ],
  },
  {
    id: 'dev_light_1',
    name: '卧室智能主灯 [模拟]',
    category: 'smart_home',
    subType: '智能照明',
    protocol: 'wifi',
    room: '主卧',
    status: 'connected',
    signalStrength: 88,
    model: 'Yeelight-Mesh-Ceiling',
    lastActiveTime: Date.now(),
    capabilities: ['电源开关', '1-100%无极亮度', '2700-6500K冷暖色温', '阅读/夜灯/伴睡情景'],
    aiAccessAllowed: true,
    isRealHardware: false,
    isSimulation: true,
    state: {
      power: true,
      brightness: 75,
      colorTemp: 3800,
      scene: 'read',
    },
    supportedActions: [
      {
        id: 'setPower',
        name: '电源开关',
        description: '开灯或关灯',
        riskLevel: 'low',
        paramsSchema: [{ name: 'power', label: '电源', type: 'boolean', defaultValue: true }],
      },
      {
        id: 'setBrightness',
        name: '调节亮度',
        description: '调节灯光亮度 (1% ~ 100%)',
        riskLevel: 'low',
        paramsSchema: [{ name: 'brightness', label: '亮度 (%)', type: 'number', min: 1, max: 100, step: 1, defaultValue: 75 }],
      },
      {
        id: 'setColorTemp',
        name: '调节色温',
        description: '调节色温 (2700K ~ 6500K)',
        riskLevel: 'low',
        paramsSchema: [{ name: 'colorTemp', label: '色温 (K)', type: 'number', min: 2700, max: 6500, step: 100, defaultValue: 4000 }],
      },
    ],
  },
  {
    id: 'dev_cleaner_1',
    name: '全屋扫地机器人 [模拟]',
    category: 'smart_home',
    subType: '清洁家电',
    protocol: 'wifi',
    room: '全屋',
    status: 'connected',
    battery: 85,
    signalStrength: 90,
    model: 'Roborock-S8-MaxV',
    lastActiveTime: Date.now(),
    capabilities: ['全屋清扫启动', '暂停清扫', '自动回充', '4档吸力调节'],
    aiAccessAllowed: true,
    isRealHardware: false,
    isSimulation: true,
    state: {
      status: 'docked',
      suctionPower: 'standard',
      battery: 85,
    },
    supportedActions: [
      {
        id: 'startCleaning',
        name: '开始全屋清扫',
        description: '启动扫地机器人开始工作',
        riskLevel: 'low',
      },
      {
        id: 'pauseCleaning',
        name: '暂停清扫',
        description: '暂停机器人当前工作',
        riskLevel: 'low',
      },
      {
        id: 'returnToDock',
        name: '返回基站充电',
        description: '命令扫地机回基站回充',
        riskLevel: 'low',
      },
    ],
  },

  // 2. 音频设备 (audio)
  {
    id: 'dev_speaker_1',
    name: '客厅蓝牙智能音箱 [模拟]',
    category: 'audio',
    subType: '蓝牙音箱',
    protocol: 'bluetooth',
    room: '客厅',
    status: 'connected',
    battery: 92,
    signalStrength: 85,
    model: 'Marshall-Emberton-II-BT',
    lastActiveTime: Date.now(),
    capabilities: ['音频播放/暂停', '音量0-100调节', '上一首/下一首切歌'],
    aiAccessAllowed: true,
    isRealHardware: false,
    isSimulation: true,
    state: {
      power: true,
      isPlaying: true,
      volume: 50,
      currentTrack: '晴天 - 周杰伦',
    },
    supportedActions: [
      {
        id: 'setPower',
        name: '音箱开关',
        description: '开机或待机',
        riskLevel: 'low',
        paramsSchema: [{ name: 'power', label: '电源', type: 'boolean', defaultValue: true }],
      },
      {
        id: 'setPlayState',
        name: '播放 / 暂停',
        description: '控制音频播放与暂停',
        riskLevel: 'low',
        paramsSchema: [{ name: 'isPlaying', label: '播放状态', type: 'boolean', defaultValue: true }],
      },
      {
        id: 'setVolume',
        name: '调节音量',
        description: '设置音量大小 (0 ~ 100)',
        riskLevel: 'low',
        paramsSchema: [{ name: 'volume', label: '音量 (%)', type: 'number', min: 0, max: 100, step: 5, defaultValue: 50 }],
      },
    ],
  },

  // 3. 互动设备 (interactive)
  {
    id: 'dev_interactive_1',
    name: '标准个人互动硬件 [模拟]',
    category: 'interactive',
    subType: '互动硬件',
    protocol: 'ble',
    room: '随身',
    status: 'connected',
    battery: 95,
    signalStrength: 90,
    model: 'Intiface-Standard-BLE-Node',
    lastActiveTime: Date.now(),
    capabilities: ['电源开关', '1-5档强度等级调节', '连续/脉冲/波浪/呼吸节律模式', '一键紧急安全急停'],
    aiAccessAllowed: false,
    isRealHardware: false,
    isSimulation: true,
    state: {
      power: false,
      intensityLevel: 0,
      intensityPercent: 0,
      mode: 'continuous',
      isRunning: false,
      isEmergencyStopped: false,
    },
    supportedActions: [
      {
        id: 'setPower',
        name: '设备启停开关',
        description: '开启或停止互动设备运行',
        riskLevel: 'low',
        paramsSchema: [{ name: 'power', label: '开关状态', type: 'boolean', defaultValue: false }],
      },
      {
        id: 'setIntensity',
        name: '调节运行强度 (1~5档)',
        description: '设置标准设备的输出强度等级 (1 ~ 5 档)',
        riskLevel: 'low',
        paramsSchema: [{ name: 'level', label: '强度等级', type: 'number', min: 0, max: 5, step: 1, defaultValue: 1 }],
      },
      {
        id: 'setMode',
        name: '切换节律模式',
        description: '切换标准输出模式 (持续/脉冲/波浪/呼吸)',
        riskLevel: 'low',
        paramsSchema: [
          {
            name: 'mode',
            label: '节律模式',
            type: 'enum',
            options: [
              { label: '〰️ 持续模式 (Steady)', value: 'continuous' },
              { label: '⚡ 脉冲节律 (Pulse)', value: 'pulse' },
              { label: '🌊 波浪起伏 (Wave)', value: 'wave' },
              { label: '🫁 呼吸渐变 (Breath)', value: 'breath' },
            ],
            defaultValue: 'continuous',
          },
        ],
      },
      {
        id: 'emergencyStop',
        name: '一键紧急停止',
        description: '【最高安全优先级】立即将输出强度归零并断开动作',
        riskLevel: 'low',
      },
    ],
  },

  // 4. 其他设备 (other)
  {
    id: 'dev_sensor_1',
    name: '环境温湿度传感器 [模拟]',
    category: 'other',
    subType: '环境感知',
    protocol: 'zigbee',
    room: '客厅',
    status: 'connected',
    battery: 95,
    signalStrength: 92,
    model: 'Mijia-BLE-Hygrothermograph-3',
    lastActiveTime: Date.now(),
    capabilities: ['实时温度采样', '实时湿度采样', '舒适度评估指数'],
    aiAccessAllowed: true,
    isRealHardware: false,
    isSimulation: true,
    state: {
      temperature: 24.5,
      humidity: 58.0,
      comfortLabel: '舒适宜人',
    },
    supportedActions: [
      {
        id: 'readSensorData',
        name: '读取实时温湿度',
        description: '获取当前最新温湿度与舒适度',
        riskLevel: 'low',
      },
    ],
  },
];

// 活跃真实硬件 GATT 设备与 Characteristic 连接映射池 (客户端内存存储，生命周期随页面)
const activeGattServers: Map<string, any> = new Map();

type DeviceEventListener = (devices: SmartDevice[]) => void;

class DeviceService {
  private devices: SmartDevice[] = [];
  private logs: DeviceOperationLog[] = [];
  private listeners: Set<DeviceEventListener> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  // 检测当前运行环境 (Android/Chrome/Edge) 是否原生支持 Web Bluetooth
  public isWebBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator && typeof (navigator as any).bluetooth?.requestDevice === 'function';
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DEVICES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.devices = parsed.map((d: SmartDevice) => {
            let cat: DeviceCategory = d.category;
            if (['climate', 'light', 'cleaner', 'kitchen', 'curtain'].includes(d.category as string)) {
              cat = 'smart_home';
            } else if (['earphone'].includes(d.category as string)) {
              cat = 'audio';
            } else if (['security', 'power', 'sensor'].includes(d.category as string)) {
              cat = 'other';
            }
            return {
              ...d,
              category: cat,
              isRealHardware: Boolean(d.isRealHardware),
              isSimulation: d.isSimulation ?? !d.isRealHardware,
              capabilities: d.capabilities || d.supportedActions?.map((a) => a.name) || ['基础控制'],
            };
          });
        } else {
          this.devices = [...INITIAL_SIMULATION_DEVICES];
          this.saveToStorage();
        }
      } else {
        this.devices = [...INITIAL_SIMULATION_DEVICES];
        this.saveToStorage();
      }

      const logsRaw = localStorage.getItem(STORAGE_KEYS.DEVICE_LOGS);
      if (logsRaw) {
        this.logs = JSON.parse(logsRaw);
      }
    } catch (e) {
      console.warn('Failed to load devices from storage, using initial:', e);
      this.devices = [...INITIAL_SIMULATION_DEVICES];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.DEVICES, JSON.stringify(this.devices));
    } catch (e) {
      console.error('Failed to save devices:', e);
    }
  }

  private saveLogsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.DEVICE_LOGS, JSON.stringify(this.logs.slice(0, 150)));
    } catch (e) {
      console.error('Failed to save device logs:', e);
    }
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((fn) => {
      try {
        fn([...this.devices]);
      } catch (err) {
        console.error('Device listener error:', err);
      }
    });
  }

  public subscribe(listener: DeviceEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getDevices(): SmartDevice[] {
    return [...this.devices];
  }

  public getDevice(id: string): SmartDevice | undefined {
    return this.devices.find((d) => d.id === id);
  }

  public getDevicesByCategory(category: DeviceCategory | 'all'): SmartDevice[] {
    if (category === 'all') return this.getDevices();
    return this.devices.filter((d) => d.category === category);
  }

  public getOperationLogs(): DeviceOperationLog[] {
    return [...this.logs];
  }

  public clearOperationLogs(): void {
    this.logs = [];
    this.saveLogsToStorage();
  }

  // ==================== 1. 真实 Android / Web Bluetooth 硬件设备发现与扫描 ====================
  /**
   * 触发真实系统蓝牙配对弹窗，真实扫描周围广播设备
   */
  public async scanRealBluetoothDevice(): Promise<{ success: boolean; device?: SmartDevice; error?: string }> {
    if (!this.isWebBluetoothSupported()) {
      const errMsg = '当前手机浏览器或运行环境不支持 Web Bluetooth 原生 API。请使用 Android Chrome 浏览器或开启系统蓝牙。';
      this.addLog({
        deviceId: 'real_bt_scan',
        deviceName: 'Android 原生蓝牙扫描',
        actionId: 'scanRealBluetooth',
        actionName: '扫描真实蓝牙硬件',
        source: 'user',
        success: false,
        message: errMsg,
        riskLevel: 'low',
      });
      return { success: false, error: errMsg };
    }

    try {
      // 真实调用浏览器/Android蓝牙设备发现弹窗
      const btDevice = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'generic_access',
          'device_information',
          0x180f, // Battery service
          0x180a, // Device information
          0x1800, // Generic access
          '0000180f-0000-1000-8000-00805f9b34fb',
          '0000180a-0000-1000-8000-00805f9b34fb',
        ],
      });

      if (!btDevice) {
        return { success: false, error: '用户取消了真实蓝牙设备配对' };
      }

      const realName = btDevice.name || '未命名真实蓝牙设备';
      const realId = 'real_ble_' + btDevice.id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);

      // 根据真实设备名称推测 4 大分类
      let category: DeviceCategory = 'other';
      let subType = '蓝牙外设';
      const lowerName = realName.toLowerCase();

      if (lowerName.includes('ear') || lowerName.includes('headphone') || lowerName.includes('pod') || lowerName.includes('speaker') || lowerName.includes('sound') || lowerName.includes('audio') || lowerName.includes('音箱') || lowerName.includes('耳机')) {
        category = 'audio';
        subType = lowerName.includes('耳机') || lowerName.includes('pod') ? '蓝牙耳机' : '蓝牙音箱';
      } else if (lowerName.includes('light') || lowerName.includes('bulb') || lowerName.includes('lamp') || lowerName.includes('plug') || lowerName.includes('ac') || lowerName.includes('air') || lowerName.includes('cleaner') || lowerName.includes('灯') || lowerName.includes('空调')) {
        category = 'smart_home';
        subType = '智能家居设备';
      } else if (lowerName.includes('intiface') || lowerName.includes('buttplug') || lowerName.includes('haptic') || lowerName.includes('vibrate') || lowerName.includes('interactive') || lowerName.includes('lovense') || lowerName.includes('svakom') || lowerName.includes('kizuna')) {
        category = 'interactive';
        subType = 'BLE标准互动设备';
      }

      // 尝试真实建立 GATT 连接获取能力
      let batteryLevel = 100;
      let capabilities = ['蓝牙物理连接', '状态实时读取', '设备通信与控制'];
      let isGattConnected = false;

      try {
        if (btDevice.gatt) {
          const server = await btDevice.gatt.connect();
          isGattConnected = server.connected;
          activeGattServers.set(realId, server);

          // 尝试读取真实电池服务 (0x180F)
          try {
            const batteryService = await server.getPrimaryService('battery_service');
            const batteryChar = await batteryService.getCharacteristic('battery_level');
            const batteryVal = await batteryChar.readValue();
            batteryLevel = batteryVal.getUint8(0);
            capabilities.push(`真实剩余电量读取 (${batteryLevel}%)`);
          } catch (batErr) {
            // 设备无标准电池服务
          }
        }
      } catch (gattErr) {
        console.warn('GATT connection error:', gattErr);
      }

      const existingIndex = this.devices.findIndex((d) => d.id === realId || d.bleDeviceId === btDevice.id);
      const createdDevice: SmartDevice = {
        id: realId,
        name: `${realName} [真实硬件]`,
        category,
        subType,
        protocol: 'ble',
        room: '随身/附近',
        status: isGattConnected ? 'connected' : 'disconnected',
        battery: batteryLevel,
        signalStrength: 95,
        model: btDevice.name,
        lastActiveTime: Date.now(),
        capabilities,
        aiAccessAllowed: false, // 真实硬件默认未授权给 AI，保护物理隐私
        isRealHardware: true,
        isSimulation: false,
        bleDeviceId: btDevice.id,
        state: {
          power: isGattConnected,
          connected: isGattConnected,
          battery: batteryLevel,
          realGattStatus: isGattConnected ? 'Connected' : 'Disconnected',
        },
        supportedActions: [
          {
            id: 'setPower',
            name: '电源/连接状态',
            description: '物理断开或重连硬件',
            riskLevel: 'low',
            paramsSchema: [{ name: 'power', label: '连接状态', type: 'boolean', defaultValue: true }],
          },
          {
            id: 'readRealBattery',
            name: '刷新真实硬件电量',
            description: '通过 GATT Battery Service 读取真实物理电量',
            riskLevel: 'low',
          },
          {
            id: 'sendRawBleCommand',
            name: '发送 BLE 控制指令',
            description: '向蓝牙设备真实特征值发送指令数据',
            riskLevel: 'low',
          },
        ],
      };

      if (category === 'interactive') {
        createdDevice.capabilities.push('1-5档强度输出', '急停安全保护');
        createdDevice.state = {
          ...createdDevice.state,
          intensityLevel: 0,
          intensityPercent: 0,
          mode: 'continuous',
          isRunning: false,
          isEmergencyStopped: false,
        };
        createdDevice.supportedActions.push(
          {
            id: 'setIntensity',
            name: '调节物理强度 (1~5档)',
            description: '向硬件写入强度脉冲',
            riskLevel: 'low',
            paramsSchema: [{ name: 'level', label: '档位', type: 'number', min: 0, max: 5, defaultValue: 1 }],
          },
          {
            id: 'emergencyStop',
            name: '一键紧急停止',
            description: '立即急停输出',
            riskLevel: 'low',
          }
        );
      }

      if (existingIndex >= 0) {
        this.devices[existingIndex] = createdDevice;
      } else {
        this.devices.unshift(createdDevice);
      }

      this.notify();

      this.addLog({
        deviceId: createdDevice.id,
        deviceName: createdDevice.name,
        actionId: 'scanAndPair',
        actionName: '扫描配对真实蓝牙硬件',
        source: 'user',
        success: true,
        message: `成功通过 Android/浏览器 Web Bluetooth 连接真实硬件 [${realName}] (已读取 ${capabilities.length} 项硬件能力)`,
        riskLevel: 'low',
      });

      return { success: true, device: createdDevice };
    } catch (err: any) {
      console.error('Scan Real Bluetooth Error:', err);
      const isUserCancel = err.name === 'NotFoundError' || err.message?.includes('User cancelled');
      const msg = isUserCancel ? '已取消蓝牙设备配对' : `蓝牙扫描连接失败: ${err.message || '未知错误'}`;
      
      this.addLog({
        deviceId: 'real_bt_scan',
        deviceName: 'Android 原生蓝牙扫描',
        actionId: 'scanRealBluetooth',
        actionName: '扫描真实蓝牙硬件',
        source: 'user',
        success: false,
        message: msg,
        riskLevel: 'low',
      });

      return { success: false, error: msg };
    }
  }

  // ==================== 2. 模拟设备扫描生成 (明确标记为模拟) ====================
  public async scanSimulationDevices(options?: { permissions?: AiPermissions; source?: 'user' | 'ai' }): Promise<SmartDevice[]> {
    const isAi = options?.source === 'ai';
    if (isAi && options?.permissions?.deviceAccess?.discoverDevices === false) {
      this.addLog({
        deviceId: 'scan_sys',
        deviceName: '设备扫描中枢',
        actionId: 'scan',
        actionName: '扫描外部设备',
        source: 'ai',
        success: false,
        message: '未获得 [AI发现设备] 权限授权，扫描操作被系统拦截',
        riskLevel: 'low',
      });
      return [];
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    const pool: Partial<SmartDevice>[] = [
      {
        name: '智能超声波加湿器 [模拟]',
        category: 'smart_home',
        subType: '智能环境',
        protocol: 'wifi',
        room: '主卧',
        status: 'disconnected',
        signalStrength: 86,
        model: 'Mijia-Humidifier-Pro',
        capabilities: ['电源开关', '雾量调节(1-3档)', '恒湿设定(40-70%)'],
        state: { power: false, mistLevel: 2, targetHumidity: 55 },
        isRealHardware: false,
        isSimulation: true,
        supportedActions: [
          {
            id: 'setPower',
            name: '开关加湿器',
            description: '开启或关闭加湿器',
            riskLevel: 'low',
            paramsSchema: [{ name: 'power', label: '电源', type: 'boolean', defaultValue: true }],
          },
        ],
      },
      {
        name: '运动骨传导耳机 [模拟]',
        category: 'audio',
        subType: '蓝牙耳机',
        protocol: 'bluetooth',
        room: '随身',
        status: 'disconnected',
        battery: 90,
        signalStrength: 82,
        model: 'Shokz-OpenRun',
        capabilities: ['音频播放/暂停', '音量调节'],
        state: { connected: false, isPlaying: false, volume: 60 },
        isRealHardware: false,
        isSimulation: true,
        supportedActions: [
          {
            id: 'setPlayState',
            name: '播放 / 暂停',
            description: '控制音频播放',
            riskLevel: 'low',
            paramsSchema: [{ name: 'isPlaying', label: '播放状态', type: 'boolean', defaultValue: true }],
          },
        ],
      },
    ];

    const added: SmartDevice[] = [];
    pool.forEach((item) => {
      if (!this.devices.some((d) => d.name === item.name)) {
        const created: SmartDevice = {
          id: 'dev_sim_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          name: item.name!,
          category: item.category!,
          subType: item.subType || '智能硬件',
          protocol: item.protocol || 'wifi',
          room: item.room || '客厅',
          status: 'disconnected',
          battery: item.battery,
          signalStrength: item.signalStrength || 80,
          model: item.model,
          lastActiveTime: Date.now(),
          capabilities: item.capabilities || ['标准控制'],
          aiAccessAllowed: false,
          isRealHardware: false,
          isSimulation: true,
          state: item.state || {},
          supportedActions: item.supportedActions || [],
        };
        added.push(created);
        this.devices.push(created);
      }
    });

    if (added.length > 0) {
      this.notify();
    }

    this.addLog({
      deviceId: 'scan_sys',
      deviceName: '设备管理器',
      actionId: 'scanSimulation',
      actionName: '扫描模拟测试设备',
      source: options?.source || 'user',
      success: true,
      message: `模拟扫描完成，新增了 ${added.length} 台标记为【模拟】的测试设备`,
      riskLevel: 'low',
    });

    return added;
  }

  // ==================== 3. 连接 / 断开设备 (Connection Lifecycle) ====================
  public async connectDevice(
    deviceId: string,
    options?: { permissions?: AiPermissions; source?: 'user' | 'ai' }
  ): Promise<boolean> {
    const dev = this.getDevice(deviceId);
    if (!dev) return false;

    if (options?.source === 'ai') {
      const allowed = options.permissions?.deviceAccess?.connectDevice !== false;
      if (!allowed) {
        this.addLog({
          deviceId,
          deviceName: dev.name,
          actionId: 'connect',
          actionName: '连接设备',
          source: 'ai',
          success: false,
          message: '未获得 [AI连接设备] 权限授权，无法自动发起连接',
          riskLevel: 'low',
        });
        return false;
      }
    }

    dev.status = 'connecting';
    this.notify();

    // 真实硬件尝试 GATT 激活
    if (dev.isRealHardware && activeGattServers.has(deviceId)) {
      const srv = activeGattServers.get(deviceId);
      if (srv && !srv.connected) {
        try {
          await srv.connect();
        } catch (e) {
          console.warn('Re-connect real GATT failed:', e);
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    dev.status = 'connected';
    dev.lastActiveTime = Date.now();
    this.notify();

    this.addLog({
      deviceId,
      deviceName: dev.name,
      actionId: 'connect',
      actionName: '建立连接',
      source: options?.source || 'user',
      success: true,
      message: `已成功连接 [${dev.name}] (${dev.isRealHardware ? '真实蓝牙物理硬件' : '模拟测试设备'})`,
      riskLevel: 'low',
    });

    return true;
  }

  public async disconnectDevice(deviceId: string, source: 'user' | 'ai' = 'user'): Promise<boolean> {
    const dev = this.getDevice(deviceId);
    if (!dev) return false;

    // 真实硬件断开 GATT
    if (dev.isRealHardware && activeGattServers.has(deviceId)) {
      const srv = activeGattServers.get(deviceId);
      try {
        if (srv && srv.disconnect) srv.disconnect();
      } catch (e) {}
    }

    dev.status = 'disconnected';
    if (dev.category === 'interactive' && dev.state.isRunning) {
      dev.state.isRunning = false;
      dev.state.intensityLevel = 0;
      dev.state.power = false;
    }
    this.notify();

    this.addLog({
      deviceId,
      deviceName: dev.name,
      actionId: 'disconnect',
      actionName: '断开连接',
      source,
      success: true,
      message: `已断开与 [${dev.name}] 的连接`,
      riskLevel: 'low',
    });

    return true;
  }

  // ==================== 4. 设备级独立 AI 控制授权开关 ====================
  public setDeviceAiPermission(deviceId: string, allowed: boolean): boolean {
    const dev = this.getDevice(deviceId);
    if (!dev) return false;

    dev.aiAccessAllowed = allowed;
    this.notify();

    this.addLog({
      deviceId,
      deviceName: dev.name,
      actionId: 'setAiPermission',
      actionName: '更新 AI 授权状态',
      source: 'user',
      success: true,
      message: `用户已${allowed ? '【允许】' : '【禁止】'} AI 控制设备 [${dev.name}]`,
      riskLevel: 'low',
    });

    return true;
  }

  // ==================== 5. 立即停止所有设备 (Emergency Stop All) ====================
  public async emergencyStopAll(source: 'user' | 'ai' = 'user', aiCharacterName?: string): Promise<{
    stoppedCount: number;
    stoppedNames: string[];
  }> {
    const stoppedNames: string[] = [];

    this.devices.forEach((dev) => {
      let wasRunning = false;

      // 1. 互动设备急停
      if (dev.category === 'interactive' && (dev.state.isRunning || dev.state.power || dev.state.intensityLevel > 0)) {
        dev.state.power = false;
        dev.state.isRunning = false;
        dev.state.intensityLevel = 0;
        dev.state.intensityPercent = 0;
        dev.state.isEmergencyStopped = true;
        wasRunning = true;
      }

      // 2. 智能家居停止
      if (dev.category === 'smart_home') {
        if (dev.state.isBoiling) {
          dev.state.isBoiling = false;
          dev.state.power = false;
          wasRunning = true;
        }
        if (dev.state.status === 'cleaning') {
          dev.state.status = 'paused';
          wasRunning = true;
        }
      }

      // 3. 音频停止
      if (dev.category === 'audio' && dev.state.isPlaying) {
        dev.state.isPlaying = false;
        wasRunning = true;
      }

      if (wasRunning) {
        stoppedNames.push(dev.name);
      }
    });

    this.notify();

    this.addLog({
      deviceId: 'emergency_all',
      deviceName: '全设备安全熔断中枢',
      actionId: 'emergencyStopAll',
      actionName: '【立即停止所有设备】',
      source,
      aiCharacterName,
      success: true,
      message: `安全急停已执行：立即制动并停止了 ${stoppedNames.length} 台运行中设备 (${stoppedNames.join('、') || '无运行中设备'})`,
      riskLevel: 'low',
    });

    return {
      stoppedCount: stoppedNames.length,
      stoppedNames,
    };
  }

  // ==================== 6. 安全风险等级检测 ====================
  public checkActionRisk(device: SmartDevice, actionId: string, params?: any): { isHighRisk: boolean; riskLevel: DeviceRiskLevel; reason?: string } {
    const actionDef = device.supportedActions.find((a) => a.id === actionId);
    let riskLevel: DeviceRiskLevel = actionDef?.riskLevel || 'low';

    if (actionId === 'remoteUnlock' || actionId.toLowerCase().includes('unlock')) {
      return {
        isHighRisk: true,
        riskLevel: 'high',
        reason: '涉及入户实体安全门锁，属于最高安全等级物理操作，必须获得用户明确安全确认',
      };
    }

    if (actionId === 'startBoil' || (device.subType === '厨房家电' && actionId.includes('Boil'))) {
      return {
        isHighRisk: false,
        riskLevel: 'medium',
        reason: '大功率加热至100°C沸腾存在烫伤与干烧风险',
      };
    }

    return {
      isHighRisk: riskLevel === 'high',
      riskLevel,
    };
  }

  // ==================== 7. 统一设备管理器调用网关 (Device Manager Gateway) ====================
  public async executeAction(
    deviceId: string,
    actionId: string,
    params: Record<string, any> = {},
    options: {
      source?: 'user' | 'ai' | 'automation';
      aiCharacterName?: string;
      permissions?: AiPermissions;
      bypassConfirm?: boolean;
    } = {}
  ): Promise<DeviceActionResult> {
    const source = options.source || 'user';
    const dev = this.getDevice(deviceId);

    if (!dev) {
      return {
        success: false,
        message: `未找到指定设备 (ID: ${deviceId})`,
        deviceId,
        deviceName: '未知设备',
        actionId,
      };
    }

    // 1) 权限检查 (Permission Check)
    if (source === 'ai') {
      const globalControlAllowed = options.permissions?.deviceAccess?.controlDevice !== false;
      if (!globalControlAllowed) {
        const msg = '用户已在系统设置中关闭了【AI 执行设备操作】权限，AI 无法控制外部设备';
        this.addLog({
          deviceId,
          deviceName: dev.name,
          actionId,
          actionName: actionId,
          params,
          source: 'ai',
          aiCharacterName: options.aiCharacterName,
          success: false,
          message: msg,
          riskLevel: 'low',
        });
        return {
          success: false,
          message: msg,
          deviceId,
          deviceName: dev.name,
          actionId,
        };
      }

      if (!dev.aiAccessAllowed) {
        const msg = `设备 [${dev.name}] 尚未被用户单独授权给 AI（当前仅支持手动控制）。请前往外部设备中心开启授权。`;
        this.addLog({
          deviceId,
          deviceName: dev.name,
          actionId,
          actionName: actionId,
          params,
          source: 'ai',
          aiCharacterName: options.aiCharacterName,
          success: false,
          message: msg,
          riskLevel: 'low',
        });
        return {
          success: false,
          message: msg,
          deviceId,
          deviceName: dev.name,
          actionId,
        };
      }
    }

    // 2) 检查设备连接状态
    if (dev.status === 'disconnected' || dev.status === 'offline') {
      if (source === 'ai' && options.permissions?.deviceAccess?.connectDevice === false) {
        return {
          success: false,
          message: `设备 [${dev.name}] 当前处于未连接状态，且 AI 未被授权自动连接外部设备`,
          deviceId,
          deviceName: dev.name,
          actionId,
        };
      }
      dev.status = 'connected';
      dev.lastActiveTime = Date.now();
    }

    // 3) 高风险与安全确认检查
    const riskInfo = this.checkActionRisk(dev, actionId, params);
    if (riskInfo.isHighRisk && !options.bypassConfirm && source === 'ai') {
      const confirmPrompt = `AI 正在尝试执行高风险物理操作：【${dev.name} - ${actionId}】(${riskInfo.reason})，是否确认授权？`;
      return {
        success: false,
        requiresConfirmation: true,
        riskLevel: 'high',
        confirmationPrompt: confirmPrompt,
        message: confirmPrompt,
        deviceId,
        deviceName: dev.name,
        actionId,
      };
    }

    // 4) 执行具体设备能力状态迁移
    let actionDescription = '';
    const newState = { ...dev.state };

    switch (actionId) {
      case 'setPower': {
        const powerVal = params.power !== undefined ? Boolean(params.power) : !dev.state.power;
        newState.power = powerVal;
        if (dev.category === 'interactive') {
          newState.isRunning = powerVal;
          if (!powerVal) newState.intensityLevel = 0;
          if (powerVal && newState.intensityLevel === 0) newState.intensityLevel = 1;
        }
        actionDescription = powerVal ? '已开启电源' : '已关闭电源';
        break;
      }

      case 'setTemperature': {
        const temp = Number(params.temperature);
        if (!isNaN(temp)) {
          newState.temperature = Math.max(16, Math.min(30, temp));
          newState.power = true;
          actionDescription = `已调节温度至 ${newState.temperature}°C`;
        }
        if (params.mode) {
          newState.mode = params.mode;
          actionDescription += ` (模式: ${params.mode})`;
        }
        break;
      }
      case 'setMode': {
        if (params.mode) {
          newState.mode = params.mode;
          newState.power = true;
          actionDescription = `已切换运行模式为 [${params.mode}]`;
        }
        break;
      }
      case 'setFanSpeed': {
        if (params.fanSpeed) {
          newState.fanSpeed = params.fanSpeed;
          actionDescription = `已调整风速为 [${params.fanSpeed}]`;
        }
        break;
      }

      case 'setBrightness': {
        const b = Number(params.brightness);
        if (!isNaN(b)) {
          newState.brightness = Math.max(1, Math.min(100, b));
          newState.power = true;
          actionDescription = `已调节亮度至 ${newState.brightness}%`;
        }
        break;
      }
      case 'setColorTemp': {
        const ct = Number(params.colorTemp);
        if (!isNaN(ct)) {
          newState.colorTemp = Math.max(2700, Math.min(6500, ct));
          newState.power = true;
          actionDescription = `已调节色温至 ${newState.colorTemp}K`;
        }
        break;
      }

      case 'setPlayState': {
        const playVal = params.isPlaying !== undefined ? Boolean(params.isPlaying) : !dev.state.isPlaying;
        newState.isPlaying = playVal;
        newState.power = true;
        actionDescription = playVal ? '已开始音频播放' : '已暂停音频播放';
        break;
      }
      case 'setVolume': {
        const vol = Number(params.volume);
        if (!isNaN(vol)) {
          newState.volume = Math.max(0, Math.min(100, vol));
          actionDescription = `已调节音量至 ${newState.volume}%`;
        }
        break;
      }

      case 'setIntensity': {
        const level = Number(params.level !== undefined ? params.level : params.intensityLevel);
        if (!isNaN(level)) {
          newState.intensityLevel = Math.max(0, Math.min(5, level));
          newState.intensityPercent = Math.round((newState.intensityLevel / 5) * 100);
          newState.isRunning = newState.intensityLevel > 0;
          newState.power = newState.intensityLevel > 0;
          newState.isEmergencyStopped = false;
          actionDescription = `互动设备强度已调整为 [${newState.intensityLevel} 档] (${newState.intensityPercent}%)`;
        }
        break;
      }
      case 'emergencyStop': {
        newState.power = false;
        newState.intensityLevel = 0;
        newState.intensityPercent = 0;
        newState.isRunning = false;
        newState.isEmergencyStopped = true;
        actionDescription = '【急停触发】互动设备已立即停止所有输出动作！';
        break;
      }

      case 'startCleaning': {
        newState.status = 'cleaning';
        actionDescription = '扫地机器人已出发开始全屋清扫';
        break;
      }
      case 'pauseCleaning': {
        newState.status = 'paused';
        actionDescription = '扫地机器人已暂停清扫';
        break;
      }
      case 'returnToDock': {
        newState.status = 'returning';
        actionDescription = '扫地机器人正在返回基站充电';
        break;
      }

      case 'readRealBattery': {
        actionDescription = `已读取真实物理电量：${dev.battery || 100}%`;
        break;
      }

      default: {
        Object.assign(newState, params);
        actionDescription = `已执行操作 ${actionId}`;
        break;
      }
    }

    dev.state = newState;
    dev.lastActiveTime = Date.now();
    this.notify();

    const successMsg = `[${dev.name}] ${actionDescription}`;

    this.addLog({
      deviceId,
      deviceName: dev.name,
      actionId,
      actionName: dev.supportedActions.find((a) => a.id === actionId)?.name || actionId,
      params,
      source,
      aiCharacterName: options.aiCharacterName,
      success: true,
      message: successMsg,
      riskLevel: riskInfo.riskLevel,
    });

    return {
      success: true,
      message: successMsg,
      deviceId,
      deviceName: dev.name,
      actionId,
      newState,
      riskLevel: riskInfo.riskLevel,
    };
  }

  // ==================== 8. 自然语言语义解析匹配器 ====================
  public parseNaturalLanguageCommand(text: string): {
    matchedDevice?: SmartDevice;
    actionId?: string;
    params?: Record<string, any>;
    isQuery?: boolean;
    confidence: number;
  } {
    const clean = text.toLowerCase().trim();
    let bestMatch: SmartDevice | undefined;
    let highestScore = 0;

    for (const dev of this.devices) {
      let score = 0;
      const devName = dev.name.toLowerCase();
      const devRoom = dev.room.toLowerCase();

      if (clean.includes(devName.replace(/\[.*?\]/g, '').trim())) score += 10;
      if (clean.includes(devRoom) && (clean.includes('灯') || clean.includes('空调') || clean.includes('音箱') || clean.includes('扫地'))) {
        score += 8;
      }
      if (dev.category === 'smart_home') {
        if (clean.includes('空调') && dev.name.includes('空调')) score += 6;
        if (clean.includes('灯') && dev.name.includes('灯')) score += 6;
        if (clean.includes('扫地') && dev.name.includes('扫地')) score += 6;
      }
      if (dev.category === 'audio') {
        if ((clean.includes('音箱') || clean.includes('放歌') || clean.includes('音乐')) && dev.name.includes('音箱')) score += 7;
        if (clean.includes('耳机') && dev.name.includes('耳机')) score += 7;
      }
      if (dev.category === 'interactive') {
        if (clean.includes('互动') || clean.includes('震动') || clean.includes('档位') || clean.includes('急停') || clean.includes('互动设备')) {
          score += 8;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = dev;
      }
    }

    if (!bestMatch || highestScore < 3) {
      return { confidence: 0 };
    }

    const isQuery =
      clean.includes('怎么样') ||
      clean.includes('状态') ||
      clean.includes('开了吗') ||
      clean.includes('多少度') ||
      clean.includes('查询') ||
      clean.includes('看看');

    let actionId: string | undefined;
    const params: Record<string, any> = {};

    if (!isQuery) {
      if (clean.includes('急停') || clean.includes('紧急停止') || clean.includes('快停下') || clean.includes('立即停止')) {
        if (bestMatch.category === 'interactive') {
          actionId = 'emergencyStop';
        } else {
          actionId = 'setPower';
          params.power = false;
        }
      } else if (clean.includes('打开') || clean.includes('开启') || clean.includes('启动')) {
        actionId = 'setPower';
        params.power = true;
        if (bestMatch.category === 'smart_home' && bestMatch.name.includes('扫地')) actionId = 'startCleaning';
        if (bestMatch.category === 'audio') {
          actionId = 'setPlayState';
          params.isPlaying = true;
        }
      } else if (clean.includes('关闭') || clean.includes('关掉') || clean.includes('关了') || clean.includes('停止')) {
        actionId = 'setPower';
        params.power = false;
        if (bestMatch.category === 'audio') {
          actionId = 'setPlayState';
          params.isPlaying = false;
        }
      }

      if (bestMatch.category === 'interactive') {
        const levelMatch = clean.match(/(\d)\s*档/);
        if (levelMatch) {
          actionId = 'setIntensity';
          params.level = parseInt(levelMatch[1], 10);
        }
      }

      if (bestMatch.category === 'smart_home' && bestMatch.name.includes('空调')) {
        const tempMatch = clean.match(/(\d{2})\s*(度|°c|°)/i);
        if (tempMatch) {
          actionId = 'setTemperature';
          params.temperature = parseInt(tempMatch[1], 10);
        }
        if (clean.includes('制冷')) {
          actionId = actionId || 'setMode';
          params.mode = 'cool';
        } else if (clean.includes('制热')) {
          actionId = actionId || 'setMode';
          params.mode = 'heat';
        }
      }
    }

    return {
      matchedDevice: bestMatch,
      actionId: actionId || (isQuery ? 'query' : 'setPower'),
      params,
      isQuery,
      confidence: highestScore,
    };
  }

  // ==================== 9. 生成 AI 角色提示词上下文中的设备摘要 ====================
  public getDevicesSummaryForAi(permissions?: AiPermissions): string {
    if (permissions && permissions.deviceAccess?.viewStatus === false) {
      return '(AI 设备状态查看权限已被用户关闭)';
    }

    const list = this.devices.filter((d) => d.status === 'connected' || d.aiAccessAllowed);
    if (list.length === 0) return '(当前暂无已连接或授权给 AI 的设备)';

    return list
      .map((d) => {
        let stateStr = '';
        if (d.category === 'smart_home') {
          if (d.state.temperature) stateStr += `温度: ${d.state.temperature}°C, 模式: ${d.state.mode}, 电源: ${d.state.power ? '开' : '关'}`;
          if (d.state.brightness) stateStr += `亮度: ${d.state.brightness}%, 色温: ${d.state.colorTemp}K, 开关: ${d.state.power ? '开' : '关'}`;
          if (d.state.status) stateStr += `状态: ${d.state.status}, 电量: ${d.state.battery}%`;
        } else if (d.category === 'audio') {
          stateStr += `播放中: ${d.state.isPlaying ? '是' : '否'}, 音量: ${d.state.volume}%, 当前曲目: ${d.state.currentTrack || '无'}`;
        } else if (d.category === 'interactive') {
          stateStr += `运行状态: ${d.state.isRunning ? '运行中' : '待机'}, 输出强度: ${d.state.intensityLevel}档(${d.state.intensityPercent}%), 模式: ${d.state.mode}`;
        } else {
          stateStr += `状态: ${JSON.stringify(d.state)}`;
        }

        return `- [${d.isRealHardware ? '真实蓝牙硬件' : '模拟设备'}] 设备名称: "${d.name}" (ID: ${d.id}, 分类: ${d.category}, 位置: ${d.room}, AI授权状态: ${d.aiAccessAllowed ? '已授权' : '未授权'}) -> 当前状态: [${stateStr}], 支持功能: [${d.capabilities.join('、')}]`;
      })
      .join('\n');
  }

  // ==================== 10. 添加操作审计日志 ====================
  public addLog(entry: Omit<DeviceOperationLog, 'id' | 'timestamp'>) {
    const log: DeviceOperationLog = {
      id: 'dlog_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      ...entry,
    };
    this.logs.unshift(log);
    this.saveLogsToStorage();
  }

  // 添加自定义设备
  public addCustomDevice(device: Partial<SmartDevice>): SmartDevice {
    const newDev: SmartDevice = {
      id: 'dev_custom_' + Date.now(),
      name: device.name || '新智能设备',
      category: device.category || 'other',
      subType: device.subType || '自定义硬件',
      protocol: device.protocol || 'wifi',
      room: device.room || '客厅',
      status: 'connected',
      signalStrength: 85,
      lastActiveTime: Date.now(),
      capabilities: device.capabilities || ['电源开关'],
      aiAccessAllowed: device.aiAccessAllowed ?? false,
      isRealHardware: false,
      isSimulation: true,
      state: device.state || { power: true },
      supportedActions: device.supportedActions || [
        {
          id: 'setPower',
          name: '电源开关',
          description: '开启或关闭设备',
          riskLevel: 'low',
          paramsSchema: [{ name: 'power', label: '电源', type: 'boolean', defaultValue: true }],
        },
      ],
    };

    this.devices.push(newDev);
    this.notify();
    return newDev;
  }

  public removeDevice(deviceId: string) {
    this.devices = this.devices.filter((d) => d.id !== deviceId);
    this.notify();
  }

  // Aliases and helpers for UI components
  public scanForDevices(options?: { permissions?: AiPermissions; source?: 'user' | 'ai' }) {
    return this.scanSimulationDevices(options);
  }

  public addDevice(device: Partial<SmartDevice>) {
    return this.addCustomDevice(device);
  }

  public getSanitizedDevicesSummary(permissions?: AiPermissions) {
    return this.getDevicesSummaryForAi(permissions);
  }

  public updateDevice(deviceId: string, updates: Partial<SmartDevice>) {
    const idx = this.devices.findIndex((d) => d.id === deviceId);
    if (idx !== -1) {
      this.devices[idx] = { ...this.devices[idx], ...updates };
      this.notify();
      return this.devices[idx];
    }
    return null;
  }
}

export const deviceService = new DeviceService();
