import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/localBackend';
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
  ShieldCheck,
  ShieldAlert,
  Power,
  RotateCw,
  Search,
  Wifi,
  Bluetooth,
  Radio,
  Sliders,
  Play,
  Pause,
  Volume2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Thermometer,
  Zap,
  Send,
  HelpCircle,
  Clock,
  ChevronRight,
  X,
  Battery,
  Settings,
  Cpu,
  Activity,
  Smartphone,
  RefreshCw,
  SlidersHorizontal,
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
}) => {
  // Main Tab Navigation: 'devices' | 'control' | 'ai_hub' | 'settings'
  const [mainTab, setMainTab] = useState<'devices' | 'control' | 'ai_hub' | 'settings'>('devices');

  // Category filter inside Devices Tab
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'smart_home' | 'audio' | 'interactive' | 'other'>('all');

  // States
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<SmartDevice | null>(null);

  // Discovery & Scan Modal
  const [showScanModal, setShowScanModal] = useState(false);
  const [isRealBleScanning, setIsRealBleScanning] = useState(false);

  // Settings & Dev Options
  const [keepaliveInterval, setKeepaliveInterval] = useState<number>(30);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(true);
  const [allowSimulation, setAllowSimulationState] = useState<boolean>(false);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);

  // High-Risk Confirmation Modal
  const [pendingHighRiskAction, setPendingHighRiskAction] = useState<{
    device: SmartDevice;
    actionId: string;
    params?: Record<string, any>;
    prompt: string;
  } | null>(null);

  // NLP Command Console (AI Hub)
  const [nlpCommand, setNlpCommand] = useState('');
  const [isExecutingNlp, setIsExecutingNlp] = useState(false);
  const [nlpFeedback, setNlpFeedback] = useState<{
    success: boolean;
    text: string;
    device?: string;
  } | null>(null);

  // Feedback Toast
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Add Custom Device Modal
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<DeviceCategory>('smart_home');
  const [customRoom, setCustomRoom] = useState('客厅');

  // Logs
  const [logs, setLogs] = useState<DeviceOperationLog[]>([]);

  // Init & Subscribe
  useEffect(() => {
    setDevices(deviceService.getDevices());
    setLogs(deviceService.getOperationLogs());
    setAllowSimulationState(deviceService.isAllowSimulation());

    const unsub = deviceService.subscribe((updated) => {
      setDevices(updated);
      setLogs(deviceService.getOperationLogs());
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

  // Toggle Dev Simulation Mode
  const handleToggleAllowSimulation = (allow: boolean) => {
    deviceService.setAllowSimulation(allow);
    setAllowSimulationState(allow);
    showToast(allow ? '已启用模拟测试模式，加载了演示设备' : '已关闭模拟模式，清除了假设备', 'info');
  };

  // Action Execution Gateway
  const handleExecuteAction = async (
    device: SmartDevice,
    actionId: string,
    params: Record<string, any> = {},
    bypassConfirm: boolean = false
  ) => {
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

  // Real Web Bluetooth Discovery
  const handleScanRealBluetooth = async () => {
    setIsRealBleScanning(true);
    try {
      const res = await deviceService.scanRealBluetoothDevice();
      if (res.success && res.device) {
        showToast(`🎉 成功连接真实设备: ${res.device.name}`, 'success');
        setShowScanModal(false);
      } else if (res.error) {
        showToast(res.error, 'info');
      }
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('cancelled')) {
        showToast('已取消蓝牙设备选择', 'info');
      } else {
        showToast(`蓝牙扫描受限: ${err.message || '未获得系统蓝牙权限'}`, 'error');
      }
    } finally {
      setIsRealBleScanning(false);
    }
  };

  // Add Custom Manual Device
  const handleCreateCustomDevice = () => {
    if (!customName.trim()) return;
    const created = deviceService.addCustomDevice({
      name: customName.trim(),
      category: customCategory,
      room: customRoom,
      aiAccessAllowed: true,
    });
    setShowAddCustomModal(false);
    setCustomName('');
    showToast(`已成功添加设备: ${created.name}`, 'success');
  };

  // Run NLP Command in AI Hub
  const handleRunNlpCommand = async (customPrompt?: string) => {
    const cmdText = (customPrompt || nlpCommand).trim();
    if (!cmdText) return;

    setIsExecutingNlp(true);
    setNlpFeedback(null);

    try {
      const localParsed = deviceService.parseNaturalLanguageCommand(cmdText);

      if (localParsed.matchedDevice && localParsed.actionId) {
        const res = await deviceService.executeAction(
          localParsed.matchedDevice.id,
          localParsed.actionId,
          localParsed.params || {},
          {
            source: 'ai',
            aiCharacterName: 'AI 助手',
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
        const devicesSummary = deviceService.getSanitizedDevicesSummary(permissions);
        const res = await apiFetch('/api/gemini/device-nlp-control', {
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
            text: data.result?.explanation || '未匹配到对应的活动设备，请确保设备已连接',
          });
        }
      }
    } catch (e: any) {
      setNlpFeedback({
        success: false,
        text: e.message || '指令解析执行失败',
      });
    } finally {
      setIsExecutingNlp(false);
      setNlpCommand('');
    }
  };

  // Filtered devices calculation
  const filteredDevices = devices.filter((d) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = d.name.toLowerCase().includes(q) || d.room.toLowerCase().includes(q) || d.category.includes(q);
      if (!match) return false;
    }
    if (categoryFilter === 'smart_home') {
      return ['smart_home', 'climate', 'light', 'cleaner', 'kitchen', 'security', 'curtain', 'power', 'sensor'].includes(d.category);
    }
    if (categoryFilter === 'audio') {
      return ['audio', 'earphone'].includes(d.category);
    }
    if (categoryFilter === 'interactive') {
      return d.category === 'interactive';
    }
    if (categoryFilter === 'other') {
      return d.category === 'other';
    }
    return true;
  });

  const connectedDevices = filteredDevices.filter((d) => d.status === 'connected');
  const unconnectedDevices = filteredDevices.filter((d) => d.status !== 'connected');

  const totalConnectedCount = devices.filter((d) => d.status === 'connected').length;
  const totalDiscoveredCount = devices.length;

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
      case 'interactive':
        return <Zap className="w-5 h-5 text-rose-500" />;
      case 'cleaner':
        return <RotateCw className="w-5 h-5 text-teal-500" />;
      case 'kitchen':
        return <Zap className="w-5 h-5 text-orange-500" />;
      case 'security':
        return <Lock className="w-5 h-5 text-rose-500" />;
      case 'sensor':
        return <Thermometer className="w-5 h-5 text-cyan-500" />;
      default:
        return <Radio className="w-5 h-5 text-zinc-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f8fafc] text-zinc-900 overflow-hidden select-none font-sans relative">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div
          className={`fixed top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-top-3 ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-900/90 text-emerald-100 border border-emerald-700/50'
              : feedbackToast.type === 'error'
              ? 'bg-rose-900/90 text-rose-100 border border-rose-700/50'
              : 'bg-zinc-900/90 text-zinc-100 border border-zinc-700/50'
          }`}
        >
          {feedbackToast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {feedbackToast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
          {feedbackToast.type === 'info' && <Clock className="w-4 h-4 text-sky-400" />}
          <span>{feedbackToast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md border-b border-zinc-200/80 px-4 py-3 flex items-center justify-between shadow-xs z-20 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToLauncher}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 active:scale-95 transition-all"
            title="返回桌面"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              设备中心
              <span className="px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold rounded-full">
                已连接 {totalConnectedCount} · 已发现 {totalDiscoveredCount}
              </span>
            </h1>
            <p className="text-[11px] text-zinc-500">外部硬件与 AI 智能控制</p>
          </div>
        </div>

        <button
          onClick={() => setShowScanModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg active:scale-95 transition-all shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加设备</span>
        </button>
      </div>

      {/* Main Content Area based on Tab */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: 设备 (Device List) */}
        {mainTab === 'devices' && (
          <div className="space-y-4">
            {/* Top Status & Search Header */}
            <div className="bg-white rounded-2xl p-3.5 border border-zinc-200/80 shadow-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-900">
                    实时状态: {totalConnectedCount > 0 ? `${totalConnectedCount} 台设备已在线` : '未连接硬件设备'}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {totalDiscoveredCount === 0 ? '未扫描到活动设备' : `发现 ${totalDiscoveredCount} 台配对设备`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSearchBox(!showSearchBox)}
                  className={`p-2 rounded-lg border text-xs transition-colors ${
                    showSearchBox || searchQuery
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                  }`}
                  title="搜索设备"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowScanModal(true)}
                  className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg hover:bg-zinc-800 transition-colors shrink-0"
                >
                  扫描设备
                </button>
              </div>
            </div>

            {/* Conditional Search Box */}
            {(showSearchBox || searchQuery) && (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="搜索设备名称、房间..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Category Filter segmented tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-200/60 rounded-xl text-xs font-medium overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: '全部' },
                { id: 'smart_home', label: '智能家居' },
                { id: 'audio', label: '音频设备' },
                { id: 'interactive', label: '互动设备' },
                { id: 'other', label: '其他' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCategoryFilter(tab.id as any)}
                  className={`flex-1 min-w-[64px] py-1.5 px-2 rounded-lg text-center transition-all whitespace-nowrap ${
                    categoryFilter === tab.id
                      ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Connected Devices Section */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-zinc-500 tracking-wider px-1 flex items-center justify-between">
                <span>已连接设备 ({connectedDevices.length})</span>
                {connectedDevices.length > 0 && (
                  <button
                    onClick={() => deviceService.emergencyStopAll('user')}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md"
                  >
                    一键急停
                  </button>
                )}
              </div>

              {connectedDevices.length === 0 ? (
                <div className="bg-white border border-dashed border-zinc-200 rounded-2xl p-6 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mx-auto">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-medium text-zinc-700">暂无已连接设备</div>
                  <p className="text-[11px] text-zinc-400 max-w-[240px] mx-auto">
                    开启外部硬件广播模式，点击“添加设备”进行蓝牙配对
                  </p>
                  <button
                    onClick={() => setShowScanModal(true)}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-all inline-flex items-center gap-1 mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    去扫描添加
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {connectedDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className="bg-white rounded-2xl p-3.5 border border-zinc-200/80 shadow-xs hover:border-emerald-300 transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                            {getCategoryIcon(dev.category)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                              {dev.name}
                              {dev.isRealHardware && (
                                <span className="px-1.5 py-0.5 text-[9px] bg-blue-50 text-blue-600 font-semibold rounded">
                                  BLE真实
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                              <span>{dev.room}</span>
                              <span>·</span>
                              <span>{dev.subType}</span>
                              {dev.battery !== undefined && (
                                <>
                                  <span>·</span>
                                  <span className="flex items-center gap-0.5 text-emerald-600">
                                    <Battery className="w-3 h-3" /> {dev.battery}%
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleConnection(dev)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg transition-all"
                          >
                            已连接
                          </button>
                          <button
                            onClick={() => setSelectedDevice(dev)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Interactive Device Quick Controls */}
                      {dev.category === 'interactive' && (
                        <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-2.5 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-rose-900">触觉强度 (1~5档)</span>
                            <span className="text-rose-700 font-bold">
                              {dev.state.intensityLevel || 0} 档 ({dev.state.intensityPercent || 0}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {[0, 1, 2, 3, 4, 5].map((lvl) => (
                              <button
                                key={lvl}
                                onClick={() => handleExecuteAction(dev, 'setIntensity', { level: lvl })}
                                className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                                  dev.state.intensityLevel === lvl
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-white text-zinc-700 border border-rose-200/60 hover:bg-rose-100/50'
                                }`}
                              >
                                {lvl === 0 ? '关' : `${lvl}档`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Power Quick Toggle for non-interactive */}
                      {dev.category !== 'interactive' && dev.supportedActions.some((a) => a.id === 'setPower') && (
                        <div className="flex items-center justify-between bg-zinc-50 rounded-xl px-3 py-2 text-xs">
                          <span className="text-zinc-600 font-medium">设备电源</span>
                          <button
                            onClick={() => handleExecuteAction(dev, 'setPower', { power: !dev.state.power })}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                              dev.state.power
                                ? 'bg-emerald-600 text-white'
                                : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {dev.state.power ? '已开启' : '已关机'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unconnected / Discovered Devices Section */}
            {unconnectedDevices.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-zinc-500 tracking-wider px-1">
                  配对/已保存未连接设备 ({unconnectedDevices.length})
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {unconnectedDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className="bg-white rounded-2xl p-3 border border-zinc-200/80 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-400 shrink-0">
                          {getCategoryIcon(dev.category)}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-800">{dev.name}</div>
                          <div className="text-[11px] text-zinc-400">
                            {dev.room} · {dev.subType}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleConnection(dev)}
                          className="px-3 py-1 bg-zinc-900 text-white text-xs font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                          连接
                        </button>
                        <button
                          onClick={() => deviceService.removeDevice(dev.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg"
                          title="删除设备"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 控制 (Control & Presets) */}
        {mainTab === 'control' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-900 mb-1 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                快捷调档与节律 Preset
              </h2>
              <p className="text-[11px] text-zinc-500">
                对已连接互动设备及智能家居进行即时模式切换与测试
              </p>
            </div>

            {connectedDevices.length === 0 ? (
              <div className="bg-white border border-dashed border-zinc-200 rounded-2xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-zinc-800">未检测到已连接的外部硬件</div>
                <p className="text-[11px] text-zinc-500 max-w-[260px] mx-auto">
                  请先前往【设备】Tab 扫描并连接真实的 BLE 互动硬件或智能家居
                </p>
                <button
                  onClick={() => setMainTab('devices')}
                  className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-zinc-800 transition-all"
                >
                  前往【设备】页面
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {connectedDevices.map((dev) => (
                  <div key={dev.id} className="bg-white rounded-2xl p-4 border border-zinc-200/80 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                          {getCategoryIcon(dev.category)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-zinc-900">{dev.name}</div>
                          <div className="text-[10px] text-zinc-400">{dev.room} · 在线中</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleExecuteAction(dev, 'emergencyStop')}
                        className="px-2.5 py-1 text-[10px] font-bold bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-lg border border-rose-200"
                      >
                        紧急急停
                      </button>
                    </div>

                    {dev.category === 'interactive' && (
                      <div className="space-y-2.5">
                        <div className="text-xs font-semibold text-zinc-700">档位输出调节</div>
                        <div className="grid grid-cols-6 gap-1.5">
                          {[0, 1, 2, 3, 4, 5].map((lvl) => (
                            <button
                              key={lvl}
                              onClick={() => handleExecuteAction(dev, 'setIntensity', { level: lvl })}
                              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                                dev.state.intensityLevel === lvl
                                  ? 'bg-rose-600 text-white shadow-xs scale-105'
                                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                              }`}
                            >
                              {lvl === 0 ? '停' : `${lvl}档`}
                            </button>
                          ))}
                        </div>

                        <div className="text-xs font-semibold text-zinc-700 pt-1">节律 Preset 模式</div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'continuous', label: '〰️ 持续模式 (Steady)' },
                            { id: 'pulse', label: '⚡ 脉冲节律 (Pulse)' },
                            { id: 'wave', label: '🌊 波浪起伏 (Wave)' },
                            { id: 'breath', label: '🫁 呼吸渐变 (Breath)' },
                          ].map((mode) => (
                            <button
                              key={mode.id}
                              onClick={() => handleExecuteAction(dev, 'setMode', { mode: mode.id })}
                              className={`py-2 px-3 text-xs font-medium rounded-xl border text-left transition-all ${
                                dev.state.mode === mode.id
                                  ? 'bg-rose-50 border-rose-300 text-rose-800 font-bold'
                                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {dev.category === 'smart_home' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-600">电源开关</span>
                          <button
                            onClick={() => handleExecuteAction(dev, 'setPower', { power: !dev.state.power })}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              dev.state.power ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {dev.state.power ? '已开启' : '已关机'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AI 联动 (AI Hub) */}
        {mainTab === 'ai_hub' && (
          <div className="space-y-4">
            {/* AI Status Card */}
            <div className="bg-gradient-to-br from-emerald-900 to-zinc-900 rounded-2xl p-4 text-white shadow-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm">AI 智能设备控制中枢</span>
                </div>
                <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold rounded-full">
                  {devPerms.controlDevice ? '已接入' : '未授权'}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                在微信聊天中，AI 能根据对话语义自动匹配意图并向已连接的 BLE 硬件发送调档指令。
              </p>
            </div>

            {/* Individual Device AI Access Toggles */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-zinc-800 tracking-wider">
                设备独立 AI 授权开关 ({devices.filter((d) => d.aiAccessAllowed).length}/{devices.length})
              </h3>
              {devices.length === 0 ? (
                <div className="text-xs text-zinc-400 py-2 text-center">暂无设备可供单独授权</div>
              ) : (
                <div className="space-y-2">
                  {devices.map((dev) => (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/60"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-zinc-600 border border-zinc-200/60">
                          {getCategoryIcon(dev.category)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-zinc-800">{dev.name}</div>
                          <div className="text-[10px] text-zinc-400">{dev.room}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => deviceService.setDeviceAiPermission(dev.id, !dev.aiAccessAllowed)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                          dev.aiAccessAllowed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                        }`}
                      >
                        {dev.aiAccessAllowed ? '允许 AI 控制' : '仅手动'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* NLP Command Console */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-zinc-800 tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-emerald-600" />
                自然语言语义调档测试
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="输入指令（例如: 调整到2档震动 / 开启空调）"
                  value={nlpCommand}
                  onChange={(e) => setNlpCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRunNlpCommand()}
                  className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <button
                  onClick={() => handleRunNlpCommand()}
                  disabled={isExecutingNlp || !nlpCommand.trim()}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-1 shrink-0 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>执行</span>
                </button>
              </div>

              {nlpFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs leading-relaxed border ${
                    nlpFeedback.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {nlpFeedback.device && (
                    <div className="font-bold text-[11px] mb-0.5">目标设备: {nlpFeedback.device}</div>
                  )}
                  <div>{nlpFeedback.text}</div>
                </div>
              )}
            </div>

            {/* Operation Logs List */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-800 tracking-wider">最近 AI 与设备联动日志</h3>
                <button
                  onClick={() => setShowLogsDrawer(true)}
                  className="text-emerald-600 hover:text-emerald-700 text-xs font-semibold"
                >
                  查看全部 ({logs.length})
                </button>
              </div>
              {logs.length === 0 ? (
                <div className="text-xs text-zinc-400 py-3 text-center">暂无日志记录</div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {logs.slice(0, 5).map((log) => (
                    <div key={log.id} className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/60 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-zinc-800">{log.deviceName}</span>
                        <span className="text-zinc-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-zinc-600 text-[11px]">{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: 设置 (Settings) */}
        {mainTab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-zinc-800 tracking-wider flex items-center gap-1.5">
                <Bluetooth className="w-4 h-4 text-blue-600" />
                BLE 系统蓝牙配置与状态
              </h3>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-zinc-800">Web Bluetooth 原生 API</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {deviceService.isWebBluetoothSupported() ? '系统受支持 (Android / Chrome)' : '环境受限 (推荐 Chrome)'}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                    deviceService.isWebBluetoothSupported()
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {deviceService.isWebBluetoothSupported() ? '正常' : '受限'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 text-xs">
                <div>
                  <div className="font-semibold text-zinc-800">自动重连掉线设备</div>
                  <div className="text-[11px] text-zinc-500">外部硬件断开后尝试唤醒重连</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoReconnect}
                  onChange={(e) => setAutoReconnect(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 space-y-2 text-xs">
                <div className="font-semibold text-zinc-800">设备 Keepalive 保活间隔</div>
                <div className="flex items-center gap-2">
                  {[15, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setKeepaliveInterval(sec)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        keepaliveInterval === sec
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {sec} 秒
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Developer & Debug Options */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-zinc-800 tracking-wider flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-purple-600" />
                开发者与调试选项 (Developer Options)
              </h3>

              <div className="flex items-center justify-between p-3 bg-purple-50/50 border border-purple-100 rounded-xl text-xs">
                <div>
                  <div className="font-bold text-purple-900">允许加载模拟设备 (仅测试)</div>
                  <div className="text-[11px] text-purple-700/80 mt-0.5">
                    默认关闭。开启后将允许加载虚拟智能家电及测试模组
                  </div>
                </div>
                <button
                  onClick={() => handleToggleAllowSimulation(!allowSimulation)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    allowSimulation ? 'bg-purple-600 text-white' : 'bg-zinc-200 text-zinc-600'
                  }`}
                >
                  {allowSimulation ? '已开启' : '已关闭'}
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    deviceService.clearOperationLogs();
                    setLogs([]);
                    showToast('日志已清空', 'info');
                  }}
                  className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-xl border border-zinc-200/60"
                >
                  清空日志
                </button>
                <button
                  onClick={() => setShowAddCustomModal(true)}
                  className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-xl border border-zinc-200/60"
                >
                  添加自定义硬件
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="bg-white border-t border-zinc-200/80 px-2 py-1.5 flex items-center justify-around z-20 shrink-0">
        {[
          { id: 'devices', label: '设备', icon: <Radio className="w-4 h-4" /> },
          { id: 'control', label: '控制', icon: <SlidersHorizontal className="w-4 h-4" /> },
          { id: 'ai_hub', label: 'AI 联动', icon: <Sparkles className="w-4 h-4" /> },
          { id: 'settings', label: '设置', icon: <Settings className="w-4 h-4" /> },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setMainTab(item.id as any)}
            className={`flex flex-col items-center gap-0.5 py-1 px-4 rounded-xl transition-all ${
              mainTab === item.id
                ? 'text-emerald-600 font-bold'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {item.icon}
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </div>

      {/* SCAN / PAIRING MODAL */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl border border-zinc-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">扫描外部硬件设备</h3>
                <p className="text-[11px] text-zinc-500">开启外部硬件广播模式进行配对</p>
              </div>
              <button
                onClick={() => setShowScanModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-full bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Radar Animation Area */}
            <div className="bg-zinc-900 rounded-2xl p-6 text-center space-y-3 text-white relative overflow-hidden">
              <div className="w-16 h-16 rounded-full border-2 border-emerald-500/40 flex items-center justify-center mx-auto relative">
                {isRealBleScanning && (
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />
                )}
                <Bluetooth className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-xs font-semibold text-emerald-300">
                {isRealBleScanning ? '正在调起系统蓝牙设备选择器...' : '准备扫描附近 BLE 设备'}
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleScanRealBluetooth}
                disabled={isRealBleScanning}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Bluetooth className="w-4 h-4" />
                <span>{isRealBleScanning ? '扫描中...' : '启动系统蓝牙配对'}</span>
              </button>

              {allowSimulation && (
                <button
                  onClick={async () => {
                    await deviceService.scanSimulationDevices();
                    showToast('已载入测试模拟设备', 'success');
                    setShowScanModal(false);
                  }}
                  className="w-full py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-semibold transition-all border border-purple-200"
                >
                  [开发者模式] 扫描测试模拟设备
                </button>
              )}
            </div>

            <p className="text-[10px] text-zinc-400 text-center">
              注：未发现设备时，请确保硬件已开机并已进入蓝牙可发现模式。
            </p>
          </div>
        </div>
      )}

      {/* DEVICE DETAILS MODAL */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl border border-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                  {getCategoryIcon(selectedDevice.category)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">{selectedDevice.name}</h3>
                  <p className="text-[10px] text-zinc-400">{selectedDevice.room} · {selectedDevice.protocol}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-full bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-zinc-50 rounded-xl space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">设备能力与属性</div>
                <div className="text-zinc-700 font-medium">
                  {selectedDevice.capabilities.join(' · ') || '无限制'}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl flex items-center justify-between">
                <span className="text-zinc-600 font-medium">单独授权给 AI 控制</span>
                <button
                  onClick={() => deviceService.setDeviceAiPermission(selectedDevice.id, !selectedDevice.aiAccessAllowed)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    selectedDevice.aiAccessAllowed ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-600'
                  }`}
                >
                  {selectedDevice.aiAccessAllowed ? '已授权' : '未授权'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  handleToggleConnection(selectedDevice);
                  setSelectedDevice(null);
                }}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold"
              >
                {selectedDevice.status === 'connected' ? '断开连接' : '连接设备'}
              </button>
              <button
                onClick={() => {
                  deviceService.removeDevice(selectedDevice.id);
                  setSelectedDevice(null);
                  showToast('设备已解绑删除', 'info');
                }}
                className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200"
                title="删除设备"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOM DEVICE MODAL */}
      {showAddCustomModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl border border-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-sm font-bold text-zinc-900">手动添加设备</h3>
              <button
                onClick={() => setShowAddCustomModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-full bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-600 font-semibold mb-1">设备名称</label>
                <input
                  type="text"
                  placeholder="例如: 智能落地灯"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900"
                />
              </div>

              <div>
                <label className="block text-zinc-600 font-semibold mb-1">设备分类</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900"
                >
                  <option value="smart_home">智能家居</option>
                  <option value="audio">音频设备</option>
                  <option value="interactive">互动设备</option>
                  <option value="other">其他</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-600 font-semibold mb-1">房间位置</label>
                <input
                  type="text"
                  placeholder="客厅 / 卧室"
                  value={customRoom}
                  onChange={(e) => setCustomRoom(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900"
                />
              </div>
            </div>

            <button
              onClick={handleCreateCustomDevice}
              disabled={!customName.trim()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
            >
              确定添加
            </button>
          </div>
        </div>
      )}

      {/* FULL LOGS DRAWER */}
      {showLogsDrawer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-md h-[80vh] flex flex-col shadow-2xl border border-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-sm font-bold text-zinc-900">完整设备与 AI 审计日志</h3>
              <button
                onClick={() => setShowLogsDrawer(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-full bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-3">
              {logs.length === 0 ? (
                <div className="text-xs text-zinc-400 text-center py-8">无日志记录</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-800">{log.deviceName}</span>
                      <span className="text-[10px] text-zinc-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-zinc-600">{log.message}</div>
                    <div className="text-[10px] text-zinc-400 flex items-center gap-2 pt-0.5">
                      <span>来源: {log.source}</span>
                      {log.aiCharacterName && <span>· 角色: {log.aiCharacterName}</span>}
                      <span>· 风险: {log.riskLevel}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
