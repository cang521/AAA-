import React, { useState, useEffect } from 'react';
import {
  SmartDevice,
  AiPermissions,
  ApiConfig,
  ApiLog,
  DeviceActionResult,
  DeviceOperationLog,
  DeviceCategory,
  DeviceProtocol,
} from '../../types';
import { deviceService } from '../../lib/deviceService';
import {
  ArrowLeft,
  Tv,
  Wind,
  Lightbulb,
  Speaker,
  Headphones,
  Sparkles,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Power,
  RotateCw,
  Search,
  Wifi,
  Bluetooth,
  Radio,
  Sliders,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  History,
  Plus,
  Trash2,
  Sun,
  Moon,
  Thermometer,
  Droplets,
  Zap,
  Send,
  HelpCircle,
  Clock,
  ChevronRight,
  X,
  Battery,
} from 'lucide-react';

interface ConnectivityAppProps {
  onBackToLauncher: () => void;
  permissions?: AiPermissions;
  onUpdatePermissions?: (perms: AiPermissions) => void;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
  onSaveMemo?: (title: string, content: string) => void;
}

export const ConnectivityApp: React.FC<ConnectivityAppProps> = ({
  onBackToLauncher,
  permissions,
  onUpdatePermissions,
  apiConfig,
  onAddApiLog,
  onSaveMemo,
}) => {
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'smart_home' | 'audio' | 'interactive' | 'other' | 'logs'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<SmartDevice | null>(null);

  // Discovery / Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [isRealBleScanning, setIsRealBleScanning] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<SmartDevice[]>([]);

  // Permissions modal state
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

  // High-Risk Confirmation Modal state
  const [pendingHighRiskAction, setPendingHighRiskAction] = useState<{
    device: SmartDevice;
    actionId: string;
    params?: Record<string, any>;
    prompt: string;
  } | null>(null);

  // NLP Command Console
  const [nlpCommand, setNlpCommand] = useState('');
  const [isExecutingNlp, setIsExecutingNlp] = useState(false);
  const [nlpFeedback, setNlpFeedback] = useState<{
    success: boolean;
    text: string;
    device?: string;
  } | null>(null);

  // Action toast / feedback
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Add Custom Device Modal
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceCategory, setNewDeviceCategory] = useState<DeviceCategory>('light');
  const [newDeviceProtocol, setNewDeviceProtocol] = useState<DeviceProtocol>('wifi');
  const [newDeviceRoom, setNewDeviceRoom] = useState('客厅');

  // Logs
  const [logs, setLogs] = useState<DeviceOperationLog[]>([]);

  // Load and subscribe to device changes
  useEffect(() => {
    setDevices(deviceService.getDevices());
    setLogs(deviceService.getOperationLogs());

    const unsub = deviceService.subscribe((updated) => {
      setDevices(updated);
      setLogs(deviceService.getOperationLogs());
      // Update selected device if open
      if (selectedDevice) {
        const found = updated.find((d) => d.id === selectedDevice.id);
        if (found) setSelectedDevice(found);
      }
    });

    return () => unsub();
  }, [selectedDevice]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setFeedbackToast({ type, message });
    setTimeout(() => {
      setFeedbackToast(null);
    }, 3000);
  };

  // Device Action Execution Gateway
  const handleExecuteAction = async (
    device: SmartDevice,
    actionId: string,
    params: Record<string, any> = {},
    bypassConfirm: boolean = false
  ) => {
    // Check risk level for direct manual triggers
    const riskCheck = deviceService.checkActionRisk(device, actionId, params);
    if (riskCheck.isHighRisk && !bypassConfirm) {
      setPendingHighRiskAction({
        device,
        actionId,
        params,
        prompt: `【高风险操作】即将执行 ${device.name} 的「${actionId}」(${riskCheck.reason || '可能影响物理安全'})，确认继续吗？`,
      });
      return;
    }

    try {
      const res: DeviceActionResult = await deviceService.executeAction(device.id, actionId, params, {
        source: 'user',
        permissions,
        bypassConfirm: true,
      });

      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || '操作执行失败', 'error');
    }
  };

  // Connect / Disconnect toggle
  const handleToggleConnection = async (device: SmartDevice) => {
    if (device.status === 'connected') {
      await deviceService.disconnectDevice(device.id, 'user');
      showToast(`已断开连接: ${device.name}`, 'info');
    } else {
      showToast(`正在连接 ${device.name}...`, 'info');
      const ok = await deviceService.connectDevice(device.id, { source: 'user', permissions });
      if (ok) {
        showToast(`已成功连接 ${device.name}`, 'success');
      } else {
        showToast(`连接失败`, 'error');
      }
    }
  };

  // Scan for discoverable devices (local network & environment)
  const handleStartScan = async () => {
    setIsScanning(true);
    setShowScanModal(true);
    try {
      const found = await deviceService.scanForDevices();
      setDiscoveredDevices(found);
      if (found.length > 0) {
        showToast(`发现 ${found.length} 台可接入设备！`, 'success');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanning(false);
    }
  };

  // Real Web Bluetooth / Android Hardware Discovery & Pairing
  const handleScanRealBluetooth = async () => {
    setIsRealBleScanning(true);
    try {
      showToast('正在调起系统蓝牙配对窗口，请在弹窗中选择附近的真实硬件...', 'info');
      const res = await deviceService.scanRealBluetoothDevice();
      if (res.success && res.device) {
        showToast(`🎉 成功发现并配对真实物理设备: ${res.device.name}！已读取硬件GATT能力。`, 'success');
        setShowScanModal(false);
      } else if (res.error) {
        showToast(res.error, 'info');
      }
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('cancelled')) {
        showToast('已取消蓝牙设备选择', 'info');
      } else {
        showToast(`真实蓝牙扫描受限: ${err.message || '未获得系统蓝牙权限或浏览器不支持 Web Bluetooth'}`, 'error');
      }
    } finally {
      setIsRealBleScanning(false);
    }
  };

  // Add Custom Device
  const handleCreateCustomDevice = () => {
    if (!newDeviceName.trim()) return;
    const created = deviceService.addDevice({
      name: newDeviceName.trim(),
      category: newDeviceCategory,
      protocol: newDeviceProtocol,
      room: newDeviceRoom,
      aiAccessAllowed: true,
      isSimulation: true,
      isRealHardware: false,
    });
    setShowAddDeviceModal(false);
    setNewDeviceName('');
    showToast(`已添加新测试设备: ${created.name} (已标记为虚拟模拟)`, 'success');
  };

  // Natural Language Command Execution
  const handleRunNlpCommand = async (customPrompt?: string) => {
    const cmdText = (customPrompt || nlpCommand).trim();
    if (!cmdText) return;

    setIsExecutingNlp(true);
    setNlpFeedback(null);

    try {
      // 1) First try local fuzzy semantic parser
      const localParsed = deviceService.parseNaturalLanguageCommand(cmdText);

      if (localParsed.matchedDevice && localParsed.actionId) {
        const res = await deviceService.executeAction(
          localParsed.matchedDevice.id,
          localParsed.actionId,
          localParsed.params || {},
          {
            source: 'ai',
            aiCharacterName: '灵犀助手',
            permissions,
          }
        );

        if (res.requiresConfirmation) {
          setPendingHighRiskAction({
            device: localParsed.matchedDevice,
            actionId: localParsed.actionId,
            params: localParsed.params,
            prompt: res.confirmationPrompt || 'AI 请求执行高风险操作，是否授权？',
          });
          setNlpFeedback({
            success: false,
            text: `⚠️ 需要确认高风险权限：${res.message}`,
            device: localParsed.matchedDevice.name,
          });
        } else {
          setNlpFeedback({
            success: res.success,
            text: res.message,
            device: localParsed.matchedDevice.name,
          });
        }
      } else {
        // 2) Fallback to Server Gemini NLP endpoint
        const devicesSummary = deviceService.getSanitizedDevicesSummary(permissions);
        const res = await fetch('/api/gemini/device-nlp-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: cmdText,
            devicesSummary,
            apiConfig,
          }),
        });
        const data = await res.json();
        if (data.success && data.result?.matched && data.result.deviceId) {
          const matchedDev = deviceService.getDevice(data.result.deviceId);
          if (matchedDev && data.result.actionId) {
            const execRes = await deviceService.executeAction(
              matchedDev.id,
              data.result.actionId,
              data.result.params || {},
              {
                source: 'ai',
                aiCharacterName: '灵犀AI',
                permissions,
              }
            );
            setNlpFeedback({
              success: execRes.success,
              text: data.result.explanation || execRes.message,
              device: matchedDev.name,
            });
          }
        } else {
          setNlpFeedback({
            success: false,
            text: data.result?.explanation || '未能准确识别要控制的智能设备，请尝试更清晰的指令',
          });
        }
      }
    } catch (e: any) {
      setNlpFeedback({
        success: false,
        text: e.message || '指令执行失败',
      });
    } finally {
      setIsExecutingNlp(false);
      setNlpCommand('');
    }
  };

  // Toggle individual AI Permission
  const handleToggleAiPermission = (key: keyof NonNullable<AiPermissions['deviceAccess']>) => {
    if (!permissions || !onUpdatePermissions) return;
    const current = permissions.deviceAccess || {
      discoverDevices: true,
      viewStatus: true,
      connectDevice: true,
      controlDevice: true,
      autoExecute: true,
      proactiveUse: true,
    };
    const updated = {
      ...permissions,
      deviceAccess: {
        ...current,
        [key]: !current[key],
      },
    };
    onUpdatePermissions(updated);
    showToast(`AI 权限 [${key}] 已更新`, 'info');
  };

  // Filtered devices with the 4 core categories
  const filteredDevices = devices.filter((d) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = d.name.toLowerCase().includes(q) || d.room.toLowerCase().includes(q) || d.category.includes(q);
      if (!match) return false;
    }
    if (activeTab === 'smart_home') {
      return ['smart_home', 'climate', 'light', 'cleaner', 'kitchen', 'security', 'curtain', 'power', 'sensor'].includes(d.category);
    }
    if (activeTab === 'audio') {
      return ['audio', 'earphone'].includes(d.category);
    }
    if (activeTab === 'interactive') {
      return d.category === 'interactive';
    }
    if (activeTab === 'other') {
      return !['smart_home', 'climate', 'light', 'cleaner', 'kitchen', 'security', 'curtain', 'power', 'sensor', 'audio', 'earphone', 'interactive'].includes(d.category) || d.category === 'other';
    }
    return true;
  });

  const connectedCount = devices.filter((d) => d.status === 'connected').length;
  const aiAllowedCount = devices.filter((d) => d.aiAccessAllowed).length;
  const devPerms = permissions?.deviceAccess || {
    viewStatus: true,
    connectDevice: true,
    controlDevice: true,
    autoExecute: true,
    proactiveUse: true,
  };

  const getCategoryIcon = (category: DeviceCategory) => {
    switch (category) {
      case 'climate':
        return <Wind className="w-5 h-5 text-sky-500" />;
      case 'light':
        return <Lightbulb className="w-5 h-5 text-amber-500" />;
      case 'audio':
        return <Speaker className="w-5 h-5 text-indigo-500" />;
      case 'earphone':
        return <Headphones className="w-5 h-5 text-emerald-500" />;
      case 'cleaner':
        return <RotateCw className="w-5 h-5 text-teal-500" />;
      case 'kitchen':
        return <Zap className="w-5 h-5 text-orange-500" />;
      case 'security':
        return <Lock className="w-5 h-5 text-rose-500" />;
      case 'curtain':
        return <Sliders className="w-5 h-5 text-purple-500" />;
      case 'power':
        return <Zap className="w-5 h-5 text-emerald-500" />;
      case 'sensor':
        return <Thermometer className="w-5 h-5 text-cyan-500" />;
      default:
        return <Radio className="w-5 h-5 text-zinc-500" />;
    }
  };

  const getProtocolBadge = (protocol: DeviceProtocol) => {
    switch (protocol) {
      case 'wifi':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-sky-500/10 text-sky-600 rounded">
            <Wifi className="w-3 h-3" /> Wi-Fi
          </span>
        );
      case 'bluetooth':
      case 'ble':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 rounded">
            <Bluetooth className="w-3 h-3" /> BLE
          </span>
        );
      case 'zigbee':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-600 rounded">
            <Radio className="w-3 h-3" /> Zigbee
          </span>
        );
      case 'matter':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 rounded">
            <Radio className="w-3 h-3" /> Matter
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-zinc-500/10 text-zinc-600 rounded">
            局域网
          </span>
        );
    }
  };

  const getDeviceStatusSummary = (dev: SmartDevice) => {
    if (dev.status === 'disconnected' || dev.status === 'offline') {
      return <span className="text-zinc-400 text-xs">未连接 / 离线</span>;
    }
    if (dev.category === 'climate') {
      return (
        <span className="text-sky-600 text-xs font-medium">
          {dev.state.power ? `已开机 · ${dev.state.temperature}°C · ${dev.state.mode === 'cool' ? '制冷' : dev.state.mode === 'heat' ? '制热' : '送风'}` : '已关机'}
        </span>
      );
    }
    if (dev.category === 'light') {
      return (
        <span className="text-amber-600 text-xs font-medium">
          {dev.state.power ? `已点亮 · 亮度 ${dev.state.brightness}%` : '已关闭'}
        </span>
      );
    }
    if (dev.category === 'audio') {
      return (
        <span className="text-indigo-600 text-xs font-medium truncate max-w-[150px]">
          {dev.state.isPlaying ? `播放中 · ${dev.state.currentTrack || '音乐'}` : '已暂停 · 音量 ' + dev.state.volume + '%'}
        </span>
      );
    }
    if (dev.category === 'earphone') {
      return (
        <span className="text-emerald-600 text-xs font-medium">
          {dev.state.ancMode === 'noise_cancelling' ? '深度主动降噪' : dev.state.ancMode === 'transparency' ? '通透模式' : '标准'} · 电量 {dev.battery || 88}%
        </span>
      );
    }
    if (dev.category === 'cleaner') {
      return (
        <span className="text-teal-600 text-xs font-medium">
          {dev.state.status === 'docked' ? '基站待机中' : dev.state.status === 'cleaning' ? '正在全屋清扫' : '回充中'} · 电量 {dev.battery || 85}%
        </span>
      );
    }
    if (dev.category === 'security') {
      return (
        <span className={`text-xs font-medium ${dev.state.locked ? 'text-emerald-600' : 'text-rose-600'}`}>
          {dev.state.locked ? '门锁已锁闭 (安全)' : '门锁已开启'} · 门闭合
        </span>
      );
    }
    if (dev.category === 'curtain') {
      return (
        <span className="text-purple-600 text-xs font-medium">
          开合度 {dev.state.openPercent}% ({dev.state.openPercent === 100 ? '全开' : dev.state.openPercent === 0 ? '全闭' : '半开'})
        </span>
      );
    }
    if (dev.category === 'kitchen') {
      return (
        <span className="text-orange-600 text-xs font-medium">
          {dev.state.isBoiling ? '正在加热沸腾 (100°C)' : `恒温保温中 (${dev.state.targetTemp || 55}°C)`}
        </span>
      );
    }
    if (dev.category === 'sensor') {
      return (
        <span className="text-cyan-600 text-xs font-medium">
          温度 {dev.state.temperature}°C · 湿度 {dev.state.humidity}% ({dev.state.comfortLabel || '舒适'})
        </span>
      );
    }
    return (
      <span className="text-zinc-600 text-xs font-medium">
        {dev.state.power ? '运行中' : '待机'}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f8fafc] text-zinc-900 overflow-hidden select-none font-sans relative">
      {/* 1. Header */}
      <div className="bg-white/95 backdrop-blur-md border-b border-zinc-200/80 px-4 pt-10 pb-3 flex items-center justify-between shadow-xs z-20">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToLauncher}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 active:scale-95 transition-all"
            title="返回桌面"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-zinc-900 flex items-center gap-1.5">
              外部设备与 AI 控制
              <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-700 font-semibold rounded-full">
                {connectedCount} 在线
              </span>
            </h1>
            <p className="text-[11px] text-zinc-500">统一设备管理器 · 多协议智能中枢</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleStartScan}
            disabled={isScanning}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg active:scale-95 transition-all"
            title="扫描发现附近设备"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-sky-600' : ''}`} />
            <span>扫描</span>
          </button>
          <button
            onClick={() => setShowPermissionsModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg active:scale-95 transition-all"
            title="AI设备权限设置"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>AI权限</span>
          </button>
        </div>
      </div>

      {/* 2. AI Permission Status Strip */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border-b border-emerald-200/50 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-zinc-700">
            {devPerms.controlDevice ? (
              <span>
                AI 已获授权控制 <strong className="text-emerald-700 font-semibold">{aiAllowedCount}</strong> 台设备 · 智能管家在线
              </span>
            ) : (
              <span className="text-amber-700 font-medium">⚠️ AI设备控制权限已关闭</span>
            )}
          </span>
        </div>
        <button
          onClick={() => setShowPermissionsModal(true)}
          className="text-emerald-700 font-medium text-[11px] underline hover:text-emerald-800"
        >
          权限详情
        </button>
      </div>

      {/* 3. Main Scrollable Container */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 pb-24">
        {/* Natural Language AI Device Command Bar */}
        <div className="bg-white rounded-2xl p-3 shadow-xs border border-zinc-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              AI 语音与自然语言设备控制
            </span>
            <span className="text-[10px] text-zinc-400">支持模糊匹配与语义解析</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={nlpCommand}
                onChange={(e) => setNlpCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunNlpCommand()}
                placeholder="例如：把客厅空调调到24度制冷 / 关掉卧室灯..."
                className="w-full pl-3 pr-8 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-zinc-800 placeholder-zinc-400"
              />
              {nlpCommand && (
                <button
                  onClick={() => setNlpCommand('')}
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => handleRunNlpCommand()}
              disabled={isExecutingNlp || !nlpCommand.trim()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center gap-1 shrink-0 shadow-xs active:scale-95 transition-all"
            >
              {isExecutingNlp ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>发送</span>
            </button>
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
            <span className="text-zinc-400 shrink-0 text-[10px]">快捷示例:</span>
            {[
              { label: '❄️ 空调24°C', cmd: '把客厅空调调到24度制冷' },
              { label: '💡 卧室夜灯', cmd: '把卧室灯切换成夜灯模式' },
              { label: '🎵 播放音乐', cmd: '打开客厅音箱播放音乐' },
              { label: '🧹 开始扫地', cmd: '让扫地机器人开始全屋清扫' },
              { label: '🪟 拉开窗帘', cmd: '把客厅窗帘拉开' },
              { label: '🚪 查询门锁', cmd: '看看门锁现在关好了吗' },
            ].map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleRunNlpCommand(chip.cmd)}
                className="px-2.5 py-1 bg-zinc-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-zinc-200/60 rounded-lg text-zinc-600 shrink-0 whitespace-nowrap active:scale-95 transition-all"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* NLP Feedback Box */}
          {nlpFeedback && (
            <div
              className={`p-2.5 rounded-xl text-xs border flex items-start gap-2 animate-in fade-in slide-in-from-top-1 ${
                nlpFeedback.success
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}
            >
              {nlpFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-semibold text-[11px] mb-0.5">
                  {nlpFeedback.device ? `【${nlpFeedback.device}】` : '执行反馈'}
                </div>
                <div className="text-[11px] leading-relaxed">{nlpFeedback.text}</div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Filters with 4 Core Categories */}
        <div className="flex items-center justify-between gap-1 bg-zinc-200/60 p-1 rounded-xl text-[11px] font-medium overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: `全部 (${devices.length})` },
            { id: 'smart_home', label: '智能家居' },
            { id: 'audio', label: '音频设备' },
            { id: 'interactive', label: '互动设备' },
            { id: 'other', label: '其他设备' },
            { id: 'logs', label: `日志 (${logs.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-2.5 py-1.5 rounded-lg text-center whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-zinc-900 shadow-xs font-bold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Add Bar */}
        {activeTab !== 'logs' && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索设备名称、房间或类型..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-zinc-800 placeholder-zinc-400"
              />
            </div>
            <button
              onClick={() => setShowAddDeviceModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-medium shrink-0 active:scale-95 transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加设备</span>
            </button>
          </div>
        )}

        {/* Content: Device Cards or Logs */}
        {activeTab === 'logs' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs px-1 text-zinc-500">
              <span>设备控制与 AI 执行审计记录 ({logs.length} 条)</span>
              {logs.length > 0 && (
                <button
                  onClick={() => {
                    deviceService.clearOperationLogs();
                    setLogs([]);
                    showToast('已清空操作审计日志', 'info');
                  }}
                  className="text-rose-600 hover:underline text-[11px]"
                >
                  清空记录
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-zinc-400 text-xs border border-zinc-200/80">
                暂无操作记录
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-white rounded-xl p-3 border border-zinc-200/80 shadow-xs flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          log.source === 'ai'
                            ? 'bg-purple-100 text-purple-700'
                            : log.source === 'automation'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {log.source === 'ai' ? `AI (${log.aiCharacterName || '管家'})` : log.source === 'automation' ? '环境联动' : '手动'}
                      </span>
                      <span className="font-bold text-zinc-800">{log.deviceName}</span>
                      <span className="text-zinc-400 text-[10px]">· {log.actionName}</span>
                    </div>
                    <p className="text-zinc-600 text-[11px] leading-relaxed">{log.message}</p>
                    <p className="text-[10px] text-zinc-400">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {log.success ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-600 text-[11px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 成功
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-rose-600 text-[11px] font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> 失败
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredDevices.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-zinc-400 text-xs border border-zinc-200/80 space-y-2">
                <p>未找到符合条件的智能设备</p>
                <button
                  onClick={() => setShowAddDeviceModal(true)}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100"
                >
                  添加自定义设备
                </button>
              </div>
            ) : (
              filteredDevices.map((dev) => (
                <div
                  key={dev.id}
                  className={`bg-white rounded-2xl p-3.5 border transition-all shadow-xs ${
                    dev.status === 'connected' ? 'border-zinc-200/90' : 'border-zinc-200/50 opacity-80'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0">
                        {getCategoryIcon(dev.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-sm font-bold text-zinc-900">{dev.name}</h3>
                          {dev.isRealHardware && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded flex items-center gap-0.5 border border-emerald-200">
                              <Bluetooth className="w-2.5 h-2.5" /> 真实硬件
                            </span>
                          )}
                          {dev.isSimulation && !dev.isRealHardware && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-zinc-100 text-zinc-500 font-medium rounded border border-zinc-200">
                              模拟测试
                            </span>
                          )}
                          {getProtocolBadge(dev.protocol)}
                          {dev.room && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded">
                              {dev.room}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5">{getDeviceStatusSummary(dev)}</div>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Connection Toggle */}
                      <button
                        onClick={() => handleToggleConnection(dev)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${
                          dev.status === 'connected'
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                        }`}
                        title={dev.status === 'connected' ? '点击断开连接' : '点击连接设备'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      {/* Detail / Control Panel Button */}
                      <button
                        onClick={() => setSelectedDevice(dev)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium flex items-center gap-1"
                      >
                        <span>控制</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Quick Control Strip */}
                  {dev.status === 'connected' && (
                    <div className="pt-2 mt-2 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
                      {/* Quick action shortcuts based on category */}
                      {dev.category === 'climate' && (
                        <div className="flex items-center gap-1.5 w-full justify-between">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                handleExecuteAction(dev, 'setTemperature', {
                                  temperature: Math.max(16, (dev.state.temperature || 24) - 1),
                                })
                              }
                              className="w-7 h-7 bg-zinc-100 hover:bg-zinc-200 rounded-lg font-bold text-zinc-700 flex items-center justify-center text-xs active:scale-95"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold text-zinc-800 px-1">{dev.state.temperature || 24}°C</span>
                            <button
                              onClick={() =>
                                handleExecuteAction(dev, 'setTemperature', {
                                  temperature: Math.min(30, (dev.state.temperature || 24) + 1),
                                })
                              }
                              className="w-7 h-7 bg-zinc-100 hover:bg-zinc-200 rounded-lg font-bold text-zinc-700 flex items-center justify-center text-xs active:scale-95"
                            >
                              +
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            {['cool', 'heat', 'fan'].map((m) => (
                              <button
                                key={m}
                                onClick={() => handleExecuteAction(dev, 'setMode', { mode: m })}
                                className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                                  dev.state.mode === m
                                    ? 'bg-sky-600 text-white font-bold'
                                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                }`}
                              >
                                {m === 'cool' ? '❄️制冷' : m === 'heat' ? '☀️制热' : '🍃送风'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {dev.category === 'light' && (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-zinc-500 shrink-0">亮度调节:</span>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            value={dev.state.brightness || 50}
                            onChange={(e) =>
                              handleExecuteAction(dev, 'setBrightness', {
                                brightness: parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full accent-amber-500 h-1.5 bg-zinc-200 rounded-lg cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-amber-600 shrink-0 w-8 text-right">
                            {dev.state.brightness || 50}%
                          </span>
                        </div>
                      )}

                      {dev.category === 'audio' && (
                        <div className="flex items-center justify-between w-full gap-2">
                          <button
                            onClick={() => handleExecuteAction(dev, 'prevTrack')}
                            className="p-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-700 active:scale-95"
                            title="上一首"
                          >
                            <SkipBack className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              handleExecuteAction(dev, 'setPlayState', {
                                isPlaying: !dev.state.isPlaying,
                              })
                            }
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 shadow-xs active:scale-95"
                          >
                            {dev.state.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            <span>{dev.state.isPlaying ? '暂停' : '播放'}</span>
                          </button>
                          <button
                            onClick={() => handleExecuteAction(dev, 'nextTrack')}
                            className="p-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-700 active:scale-95"
                            title="下一首"
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {dev.category === 'cleaner' && (
                        <div className="flex items-center justify-between w-full gap-1.5">
                          <button
                            onClick={() => handleExecuteAction(dev, 'startCleaning')}
                            className="flex-1 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 active:scale-95"
                          >
                            <Play className="w-3 h-3" /> 开始清扫
                          </button>
                          <button
                            onClick={() => handleExecuteAction(dev, 'returnToDock')}
                            className="flex-1 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1 active:scale-95"
                          >
                            <RotateCw className="w-3 h-3" /> 返回基站
                          </button>
                        </div>
                      )}

                      {dev.category === 'security' && (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] text-zinc-500">入户安全级别：高危访问</span>
                          <button
                            onClick={() => handleExecuteAction(dev, 'remoteUnlock')}
                            className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 active:scale-95"
                          >
                            <Unlock className="w-3 h-3 text-rose-600" />
                            <span>远程开锁 (需确认)</span>
                          </button>
                        </div>
                      )}

                      {dev.category === 'curtain' && (
                        <div className="flex items-center justify-between w-full gap-2">
                          <button
                            onClick={() => handleExecuteAction(dev, 'openCurtain')}
                            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium active:scale-95"
                          >
                            完全拉开
                          </button>
                          <button
                            onClick={() => handleExecuteAction(dev, 'closeCurtain')}
                            className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium active:scale-95"
                          >
                            完全闭合
                          </button>
                        </div>
                      )}

                      {dev.category === 'kitchen' && (
                        <div className="flex items-center justify-between w-full gap-2">
                          <button
                            onClick={() => handleExecuteAction(dev, 'startBoil')}
                            className="flex-1 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-medium active:scale-95"
                          >
                            🔥 加热沸腾 (100°C)
                          </button>
                          <button
                            onClick={() => handleExecuteAction(dev, 'stopHeating')}
                            className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium active:scale-95"
                          >
                            停止
                          </button>
                        </div>
                      )}

                      {dev.category === 'power' && (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] text-zinc-500">实时功率: {dev.state.currentWatts || 18.5}W</span>
                          <button
                            onClick={() => handleExecuteAction(dev, 'setPower', { power: !dev.state.power })}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold active:scale-95 ${
                              dev.state.power
                                ? 'bg-emerald-600 text-white'
                                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                            }`}
                          >
                            {dev.state.power ? '已通电' : '已断电'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 4. Interactive Device Details / Control Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center shrink-0">
                  {getCategoryIcon(selectedDevice.category)}
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-900">{selectedDevice.name}</h2>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                    {getProtocolBadge(selectedDevice.protocol)}
                    <span>· {selectedDevice.room}</span>
                    <span>· {selectedDevice.model || '标准智能硬件'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* AI Control Authorization Switch */}
            <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-zinc-800 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  独立 AI 控制授权
                </span>
                <p className="text-zinc-500 text-[11px]">开启后允许 AI 在微信聊天中直接控制此设备</p>
              </div>
              <input
                type="checkbox"
                checked={selectedDevice.aiAccessAllowed}
                onChange={(e) => {
                  const updated = deviceService.updateDevice(selectedDevice.id, {
                    aiAccessAllowed: e.target.checked,
                  });
                  if (updated) setSelectedDevice(updated);
                  showToast(`已${e.target.checked ? '授权' : '取消'} AI 控制该设备`, 'info');
                }}
                className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            {/* Device Control Actions Panel */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-800">可执行操作面板</h4>

              {/* Climate Detailed Control */}
              {selectedDevice.category === 'climate' && (
                <div className="bg-sky-50/60 border border-sky-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-700">空调电源</span>
                    <button
                      onClick={() =>
                        handleExecuteAction(selectedDevice, 'setPower', { power: !selectedDevice.state.power })
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        selectedDevice.state.power ? 'bg-sky-600 text-white' : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      {selectedDevice.state.power ? '开机中' : '已关机'}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-zinc-700">
                      目标温度: {selectedDevice.state.temperature}°C
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleExecuteAction(selectedDevice, 'setTemperature', {
                            temperature: Math.max(16, (selectedDevice.state.temperature || 24) - 1),
                          })
                        }
                        className="w-10 h-10 bg-white border border-zinc-200 rounded-xl font-bold text-base text-zinc-800 active:scale-95 shadow-xs"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min="16"
                        max="30"
                        value={selectedDevice.state.temperature || 24}
                        onChange={(e) =>
                          handleExecuteAction(selectedDevice, 'setTemperature', {
                            temperature: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-sky-600 h-2 bg-zinc-200 rounded-lg cursor-pointer"
                      />
                      <button
                        onClick={() =>
                          handleExecuteAction(selectedDevice, 'setTemperature', {
                            temperature: Math.min(30, (selectedDevice.state.temperature || 24) + 1),
                          })
                        }
                        className="w-10 h-10 bg-white border border-zinc-200 rounded-xl font-bold text-base text-zinc-800 active:scale-95 shadow-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-zinc-700">模式切换</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'cool', label: '❄️ 制冷' },
                        { id: 'heat', label: '☀️ 制热' },
                        { id: 'dry', label: '💧 除湿' },
                        { id: 'fan', label: '🍃 送风' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleExecuteAction(selectedDevice, 'setMode', { mode: m.id })}
                          className={`py-2 rounded-xl text-xs font-medium transition-all ${
                            selectedDevice.state.mode === m.id
                              ? 'bg-sky-600 text-white font-bold shadow-xs'
                              : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Light Detailed Control */}
              {selectedDevice.category === 'light' && (
                <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-zinc-700">
                      <span>亮度调节</span>
                      <span className="text-amber-700 font-bold">{selectedDevice.state.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={selectedDevice.state.brightness || 75}
                      onChange={(e) =>
                        handleExecuteAction(selectedDevice, 'setBrightness', {
                          brightness: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-amber-500 h-2 bg-zinc-200 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-zinc-700">
                      <span>色温调节 (暖黄 ~ 冷白)</span>
                      <span className="text-amber-700 font-bold">{selectedDevice.state.colorTemp || 4000}K</span>
                    </div>
                    <input
                      type="range"
                      min="2700"
                      max="6500"
                      step="100"
                      value={selectedDevice.state.colorTemp || 4000}
                      onChange={(e) =>
                        handleExecuteAction(selectedDevice, 'setColorTemp', {
                          colorTemp: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-amber-500 h-2 bg-gradient-to-r from-amber-300 via-orange-100 to-sky-100 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-zinc-700">预设灯光情景</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'read', label: '📖 舒适阅读' },
                        { id: 'night', label: '🌙 温馨夜灯' },
                        { id: 'sleep', label: '💤 伴睡微光' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleExecuteAction(selectedDevice, 'setScene', { scene: s.id })}
                          className={`py-2 rounded-xl text-xs font-medium transition-all ${
                            selectedDevice.state.scene === s.id
                              ? 'bg-amber-600 text-white font-bold shadow-xs'
                              : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Supported Actions List with Risk Badges */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-zinc-400">全部支持的原语指令:</span>
                <div className="space-y-1">
                  {selectedDevice.supportedActions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 border border-zinc-100 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-zinc-800">{action.name}</span>
                          <span className="text-[10px] text-zinc-400">({action.id})</span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                              action.riskLevel === 'high'
                                ? 'bg-rose-100 text-rose-700'
                                : action.riskLevel === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {action.riskLevel === 'high' ? '高风险' : action.riskLevel === 'medium' ? '中风险' : '低风险'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{action.description}</p>
                      </div>
                      <button
                        onClick={() => handleExecuteAction(selectedDevice, action.id)}
                        className="px-2.5 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 shrink-0 active:scale-95"
                      >
                        执行
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Delete Device Option */}
            <div className="pt-3 border-t border-zinc-100 flex justify-end">
              <button
                onClick={() => {
                  deviceService.removeDevice(selectedDevice.id);
                  setSelectedDevice(null);
                  showToast('已移除该设备', 'info');
                }}
                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium p-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>移除该设备</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. AI Device Permissions Modal */}
      {showPermissionsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-zinc-900">AI 设备与智能硬件权限管理</h3>
              </div>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              控制 AI 角色（如微信聊天好友、智能助手）对家庭与个人智能硬件的访问与调用范围。所有操作均通过统一设备管理器安全网关执行。
            </p>

            <div className="space-y-2.5">
              {[
                {
                  key: 'viewStatus' as const,
                  title: '查看设备状态',
                  desc: '允许 AI 读取空调温度、灯光开关、音箱播放内容等设备最新运行状态。',
                  icon: <Tv className="w-4 h-4 text-sky-600" />,
                },
                {
                  key: 'connectDevice' as const,
                  title: '连接 / 断开设备',
                  desc: '允许 AI 自动扫描与连接离线或待机的蓝牙及局域网设备。',
                  icon: <Radio className="w-4 h-4 text-blue-600" />,
                },
                {
                  key: 'controlDevice' as const,
                  title: '控制设备执行',
                  desc: '允许 AI 根据自然语言指令调整设备设置（开关、温度、音量、模式等）。',
                  icon: <Power className="w-4 h-4 text-emerald-600" />,
                },
                {
                  key: 'autoExecute' as const,
                  title: '自动执行 (免弹窗确认)',
                  desc: '开启后低风险操作将静默自动执行；关闭时每次控制均需用户手动二次确认。',
                  icon: <Zap className="w-4 h-4 text-amber-600" />,
                },
                {
                  key: 'proactiveUse' as const,
                  title: 'AI 主动关怀与使用设备',
                  desc: '允许 AI 结合高温天气、入夜时段主动建议或联动开启空调、夜灯等设备。',
                  icon: <Sparkles className="w-4 h-4 text-purple-600" />,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">{item.icon}</div>
                    <div>
                      <h4 className="font-bold text-zinc-800">{item.title}</h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">{item.desc}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={devPerms[item.key] !== false}
                    onChange={() => handleToggleAiPermission(item.key)}
                    className="w-5 h-5 accent-emerald-600 rounded cursor-pointer shrink-0"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold active:scale-95 transition-all"
              >
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. High Risk Operation Confirmation Dialog */}
      {pendingHighRiskAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl border border-rose-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900">高风险操作安全确认</h3>
                <p className="text-xs text-rose-600 font-medium mt-0.5">涉及物理实体安全或生活核心控制</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl text-xs text-rose-900 leading-relaxed">
              {pendingHighRiskAction.prompt}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setPendingHighRiskAction(null)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold active:scale-95"
              >
                取消操作
              </button>
              <button
                onClick={async () => {
                  const target = pendingHighRiskAction;
                  setPendingHighRiskAction(null);
                  await handleExecuteAction(target.device, target.actionId, target.params || {}, true);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold active:scale-95 shadow-xs"
              >
                确认授权执行
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Device Discovery / Radar Scan Modal */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <RotateCw className={`w-5 h-5 text-sky-600 ${isScanning || isRealBleScanning ? 'animate-spin' : ''}`} />
                <h3 className="text-base font-bold text-zinc-900">
                  {isRealBleScanning ? '正在调起系统蓝牙配对...' : isScanning ? '正在扫描发现设备...' : '设备发现与配对中心'}
                </h3>
              </div>
              <button
                onClick={() => setShowScanModal(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Real Hardware Bluetooth Discovery Section */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Bluetooth className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-blue-950">真实物理蓝牙设备配对</h4>
                    <p className="text-[10px] text-blue-700">调用 Android / Web Bluetooth 原生 API 发现周边物理硬件</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleScanRealBluetooth}
                disabled={isRealBleScanning}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xs"
              >
                <Bluetooth className={`w-4 h-4 ${isRealBleScanning ? 'animate-bounce' : ''}`} />
                <span>{isRealBleScanning ? '正在等待系统选择硬件...' : '扫描并配对真实蓝牙硬件'}</span>
              </button>
            </div>

            {isScanning ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-3">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-sky-400/30 animate-ping" />
                  <div className="w-12 h-12 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-600">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>
                </div>
                <p className="text-xs text-zinc-500">正在搜索局域网 Wi-Fi 与智能网关设备...</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-800">
                    发现环境/局域网可接入设备 ({discoveredDevices.length} 台)：
                  </p>
                  <span className="text-[10px] text-zinc-400">已标注模拟属性</span>
                </div>

                {discoveredDevices.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-zinc-900">{d.name}</h4>
                        {d.isRealHardware ? (
                          <span className="text-[9px] px-1 py-0.2 bg-emerald-100 text-emerald-700 font-bold rounded">
                            物理硬件
                          </span>
                        ) : (
                          <span className="text-[9px] px-1 py-0.2 bg-zinc-200 text-zinc-600 font-medium rounded">
                            模拟测试
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {d.protocol.toUpperCase()} · {d.room} · {d.model}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        handleToggleConnection(d);
                        setShowScanModal(false);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium active:scale-95"
                    >
                      连接接入
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={handleStartScan}
                disabled={isScanning}
                className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
              >
                重新扫描
              </button>
              <button
                onClick={() => setShowScanModal(false)}
                className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Add Custom Device Modal */}
      {showAddDeviceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">添加自定义智能设备</h3>
              <button
                onClick={() => setShowAddDeviceModal(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700">设备名称</label>
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="例如：阳台智能加湿器、书房台灯..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700">设备分类</label>
                  <select
                    value={newDeviceCategory}
                    onChange={(e) => setNewDeviceCategory(e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs"
                  >
                    <option value="light">💡 智能照明</option>
                    <option value="climate">❄️ 暖通空调/风扇</option>
                    <option value="audio">🔊 音箱音频</option>
                    <option value="earphone">🎧 耳机穿戴</option>
                    <option value="cleaner">🧹 扫地清洁</option>
                    <option value="kitchen">🫖 厨房家电</option>
                    <option value="security">🔒 安防门禁</option>
                    <option value="curtain">🪟 遮阳窗帘</option>
                    <option value="power">⚡ 插座电源</option>
                    <option value="other">📦 其他智能硬件</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700">连接协议</label>
                  <select
                    value={newDeviceProtocol}
                    onChange={(e) => setNewDeviceProtocol(e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs"
                  >
                    <option value="wifi">Wi-Fi (局域网)</option>
                    <option value="bluetooth">Bluetooth (蓝牙BLE)</option>
                    <option value="zigbee">Zigbee (网关)</option>
                    <option value="matter">Matter (通用标准)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700">所在房间 / 位置</label>
                <input
                  type="text"
                  value={newDeviceRoom}
                  onChange={(e) => setNewDeviceRoom(e.target.value)}
                  placeholder="客厅 / 主卧 / 书房 / 随身..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowAddDeviceModal(false)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
              >
                取消
              </button>
              <button
                onClick={handleCreateCustomDevice}
                disabled={!newDeviceName.trim()}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold active:scale-95"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Feedback Toast */}
      {feedbackToast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 border animate-in fade-in slide-in-from-bottom-2 ${
            feedbackToast.type === 'success'
              ? 'bg-zinc-900 text-white border-zinc-800'
              : feedbackToast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-zinc-800 text-white border-zinc-700'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{feedbackToast.message}</span>
        </div>
      )}
    </div>
  );
};
