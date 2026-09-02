import React, { useState, useEffect } from 'react';
import { AiPermissions } from '../../types';
import {
  ArrowLeft,
  Shield,
  MapPin,
  Camera,
  Mic,
  Bell,
  HardDrive,
  Compass,
  Navigation,
  Lock,
  HeartPulse,
  FileText,
  Share2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Sparkles,
  RefreshCw,
  Smartphone,
  Tv,
  Eye,
  Hand,
  Info,
  Layers,
  X,
  Play,
  Check,
  Vibrate,
  Volume2,
  Clipboard,
  BatteryCharging,
  Sun,
  CloudSun,
  Send,
  Radio,
  Zap,
  Bluetooth,
} from 'lucide-react';
import { deviceService } from '../../lib/deviceService';

interface PermissionsAppProps {
  onBackToLauncher: () => void;
  permissions: AiPermissions;
  onUpdatePermissions: (p: AiPermissions) => void;
}

type PermStatus = 'granted' | 'prompt' | 'denied' | 'checking';

interface DynamicPermRequest {
  id: string;
  title: string;
  category: string;
  reason: string;
  iconName: string;
  featureKey: string;
  status: 'pending' | 'granted' | 'denied';
}

export const PermissionsApp: React.FC<PermissionsAppProps> = ({
  onBackToLauncher,
  permissions,
  onUpdatePermissions,
}) => {
  const [realMic, setRealMic] = useState<PermStatus>('checking');
  const [realGeo, setRealGeo] = useState<PermStatus>('checking');
  const [realNotif, setRealNotif] = useState<PermStatus>('checking');
  const [realStorage, setRealStorage] = useState<PermStatus>('checking');
  const [realScreenCapture, setRealScreenCapture] = useState<PermStatus>('prompt');
  const [realVibrate, setRealVibrate] = useState<boolean>('vibrate' in navigator);
  const [realClipboard, setRealClipboard] = useState<PermStatus>('granted');
  const [batteryLevel, setBatteryLevel] = useState<string>('检测中');
  const [isWakeLockSupported, setIsWakeLockSupported] = useState<boolean>('wakeLock' in navigator);

  const [accessibilityEnabled, setAccessibilityEnabled] = useState(true);
  const [showAccessibilityGuide, setShowAccessibilityGuide] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Dynamic Permission Request Dialog
  const [activeRequestDialog, setActiveRequestDialog] = useState<DynamicPermRequest | null>(null);

  // Custom generated permission requests list
  const [generatedRequests, setGeneratedRequests] = useState<DynamicPermRequest[]>([
    {
      id: 'req_vibrate',
      title: '手机触觉震动反馈权限',
      category: '硬件触觉',
      reason: 'AI 角色在微信表达情绪（惊喜/心跳/轻拍）时调用真实手机震动马达反馈。',
      iconName: 'Vibrate',
      featureKey: 'vibrate',
      status: 'granted',
    },
    {
      id: 'req_tts',
      title: '语音朗读与音频播放权限',
      category: '音频系统',
      reason: '允许 AI 通过手机扬声器发出语音消息并朗读聊天对话。',
      iconName: 'Volume2',
      featureKey: 'tts',
      status: 'granted',
    },
    {
      id: 'req_battery',
      title: '手机电池与电源感知权限',
      category: '系统感知',
      reason: 'AI 实时感知手机低电量状态并发送温暖的电量关怀提醒。',
      iconName: 'BatteryCharging',
      featureKey: 'battery',
      status: 'granted',
    },
    {
      id: 'req_clipboard',
      title: '系统剪贴板读写权限',
      category: '系统工具',
      reason: 'AI 辅助快速读取剪贴板链接或自动复制重要提醒。',
      iconName: 'Clipboard',
      featureKey: 'clipboard',
      status: 'granted',
    },
  ]);

  // Auto query real phone / browser permissions on mount
  const checkRealPermissions = async () => {
    // 1. Geolocation
    if ('geolocation' in navigator) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          setRealGeo(res.state as PermStatus);
          if (res.state === 'granted' && !permissions.basic.location) {
            onUpdatePermissions({
              ...permissions,
              basic: { ...permissions.basic, location: true },
            });
          }
        } catch {
          setRealGeo('prompt');
        }
      } else {
        setRealGeo('prompt');
      }
    } else {
      setRealGeo('denied');
    }

    // 2. Notification
    if ('Notification' in window) {
      const perm = Notification.permission;
      setRealNotif(perm === 'default' ? 'prompt' : (perm as PermStatus));
    } else {
      setRealNotif('denied');
    }

    // 3. Storage
    if (navigator.storage && navigator.storage.persisted) {
      const persisted = await navigator.storage.persisted();
      setRealStorage(persisted ? 'granted' : 'prompt');
    } else {
      setRealStorage('prompt');
    }

    // 4. Microphone (query or default)
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const micRes = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setRealMic(micRes.state as PermStatus);
      } catch {
        setRealMic('prompt');
      }
    } else {
      setRealMic('prompt');
    }

    // 5. Battery info
    if ('getBattery' in navigator) {
      try {
        const battery: any = await (navigator as any).getBattery();
        setBatteryLevel(`${Math.round(battery.level * 100)}% (${battery.charging ? '充电中' : '放电中'})`);
      } catch {
        setBatteryLevel('100% (正常)');
      }
    } else {
      setBatteryLevel('100% (模拟连接)');
    }
  };

  useEffect(() => {
    checkRealPermissions();
  }, []);

  // Real permission auto-request handler
  const requestRealPermissions = async () => {
    setIsRequesting(true);
    setStatusMsg('正在向手机系统拉取并触发授权申请...');

    let updatedBasicLocation = permissions.basic.location;

    // Request Geolocation
    if ('geolocation' in navigator) {
      try {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              setRealGeo('granted');
              updatedBasicLocation = true;
              resolve(true);
            },
            () => {
              setRealGeo('denied');
              resolve(false);
            },
            { timeout: 5000 }
          );
        });
      } catch (e) {
        console.warn('Geo request failed', e);
      }
    }

    // Request Notification
    if ('Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        setRealNotif(res === 'default' ? 'prompt' : (res as PermStatus));
      } catch (e) {
        console.warn('Notif request failed', e);
      }
    }

    // Request Microphone
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setRealMic('granted');
        micStream.getTracks().forEach((t) => t.stop());
      } catch {
        setRealMic('denied');
      }
    }

    // Request Storage persistence
    if (navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        setRealStorage(isPersisted ? 'granted' : 'prompt');
      } catch {
        setRealStorage('prompt');
      }
    }

    // Update synced app permissions
    onUpdatePermissions({
      ...permissions,
      basic: {
        ...permissions.basic,
        location: updatedBasicLocation,
      },
    });

    setIsRequesting(false);
    setStatusMsg('🎉 真实手机权限拉取与授权处理完成！');
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Test Real Vibration
  const testVibrate = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 200]);
      setStatusMsg('📳 已触发真实手机震动马达反馈！');
    } else {
      setStatusMsg('当前设备不支持 navigator.vibrate，已完成逻辑模拟。');
    }
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // Test Real Speech Synthesis
  const testTts = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('你好，我是你的智能手机AI助手，权限连接正常！');
      utterance.lang = 'zh-CN';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
      setStatusMsg('🔊 正在通过扬声器播放真实语音合成！');
    } else {
      setStatusMsg('当前环境不支持语音合成。');
    }
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // Test Real Clipboard
  const testClipboard = async () => {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText('【AI智能手机助手】已成功写入剪贴板！时间: ' + new Date().toLocaleTimeString());
        setStatusMsg('📋 已成功向系统剪贴板写入测试文本！可去任意输入框粘贴测试。');
      } catch {
        setStatusMsg('剪贴板写入受限。');
      }
    }
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // Create a new dynamic custom permission request
  const [customPermName, setCustomPermName] = useState('');
  const [customPermReason, setCustomPermReason] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreateDynamicPerm = () => {
    if (!customPermName.trim()) return;
    const newReq: DynamicPermRequest = {
      id: 'req_' + Date.now(),
      title: customPermName.trim(),
      category: '自定义AI授权',
      reason: customPermReason.trim() || 'AI 角色根据当前对话情景自主申请执行该项权限。',
      iconName: 'Shield',
      featureKey: 'custom_' + Date.now(),
      status: 'pending',
    };
    setGeneratedRequests([newReq, ...generatedRequests]);
    setCustomPermName('');
    setCustomPermReason('');
    setShowCreateModal(false);
    setActiveRequestDialog(newReq);
  };

  const handleAuthorizeDialog = (approved: boolean) => {
    if (!activeRequestDialog) return;
    setGeneratedRequests((prev) =>
      prev.map((r) =>
        r.id === activeRequestDialog.id
          ? { ...r, status: approved ? 'granted' : 'denied' }
          : r
      )
    );
    setStatusMsg(approved ? `✅ 已正式批准【${activeRequestDialog.title}】` : `❌ 已拒绝【${activeRequestDialog.title}】`);
    setActiveRequestDialog(null);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const toggleBasic = (key: keyof AiPermissions['basic']) => {
    onUpdatePermissions({
      ...permissions,
      basic: {
        ...permissions.basic,
        [key]: !permissions.basic[key],
      },
    });
  };

  const toggleHighLevel = (key: keyof AiPermissions['highLevel']) => {
    onUpdatePermissions({
      ...permissions,
      highLevel: {
        ...permissions.highLevel,
        [key]: !permissions.highLevel[key],
      },
    });
  };

  const toggleAppAccess = (key: keyof AiPermissions['appAccess']) => {
    onUpdatePermissions({
      ...permissions,
      appAccess: {
        ...permissions.appAccess,
        [key]: !permissions.appAccess[key],
      },
    });
  };

  const toggleDeviceAccess = (key: keyof NonNullable<AiPermissions['deviceAccess']>) => {
    const current = permissions.deviceAccess || {
      discoverDevices: true,
      viewStatus: true,
      connectDevice: true,
      controlDevice: true,
      autoExecute: true,
      proactiveUse: true,
    };
    onUpdatePermissions({
      ...permissions,
      deviceAccess: {
        ...current,
        [key]: !current[key],
      },
    });
  };

  const renderBadge = (status: PermStatus) => {
    if (status === 'granted') {
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-[10px] border border-emerald-500/40 flex items-center gap-1 shrink-0">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          已授权
        </span>
      );
    }
    if (status === 'denied') {
      return (
        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold text-[10px] border border-rose-500/40 flex items-center gap-1 shrink-0">
          <XCircle className="w-3 h-3 text-rose-400" />
          已拒绝
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold text-[10px] border border-amber-500/40 flex items-center gap-1 shrink-0">
        <AlertCircle className="w-3 h-3 text-amber-400" />
        待申请
      </span>
    );
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>桌面</span>
        </button>
        <span className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-indigo-400" />
          AI 真实权限调度中心
        </span>
        <button
          onClick={checkRealPermissions}
          className="p-1.5 rounded-xl text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 transition"
          title="重新检测真实权限"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Banner with Real Mobile Device Permission Docking */}
        <div className="p-4 rounded-3xl bg-gradient-to-r from-indigo-700 via-blue-700 to-teal-700 text-white space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Smartphone className="w-4.5 h-4.5 text-indigo-200" />
              真实手机硬件权限智能对接
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-indigo-100 text-[10px] font-mono">
              Web API 真实直连
            </span>
          </div>

          <p className="text-[11px] text-indigo-100 leading-relaxed">
            系统已实现真实硬件与环境感知（麦克风、地理位置、震动马达、扬声器TTS、电池状态与剪贴板）。若设置中未直接开放，AI 可自主生成权限申请单并向用户请求授权。
          </p>

          <div className="flex gap-2">
            <button
              onClick={requestRealPermissions}
              disabled={isRequesting}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-white text-indigo-900 hover:bg-indigo-50 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{isRequesting ? '正在拉取授权...' : '⚡ 一键拉取真实手机权限'}</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="py-2.5 px-3 rounded-2xl bg-indigo-900/60 hover:bg-indigo-900 border border-indigo-300/40 text-white font-bold text-xs flex items-center gap-1 shadow-md transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>生成权限申请</span>
            </button>
          </div>

          {statusMsg && (
            <div className="p-2 rounded-xl bg-black/40 text-amber-200 text-[11px] text-center font-medium animate-pulse">
              {statusMsg}
            </div>
          )}
        </div>

        {/* 1. Real Interactive Hardware Features & Live Test (真实手机硬件互动与落地测试) */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-indigo-400 flex items-center gap-2">
              <Vibrate className="w-4 h-4 text-indigo-400" />
              1. 落地实操与实时硬件交互 (Live Hardware)
            </h3>
            <span className="text-[10px] text-zinc-500">点击按钮立即测试落地效果</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Vibrate */}
            <div className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-750 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Vibrate className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-zinc-200 text-xs">触觉震动马达</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                  真实连接
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">AI 聊天情绪波动时震动反馈</p>
              <button
                onClick={testVibrate}
                className="w-full py-1.5 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] flex items-center justify-center gap-1 shadow transition"
              >
                <Play className="w-3 h-3" />
                <span>测试手机震动</span>
              </button>
            </div>

            {/* TTS Voice */}
            <div className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-750 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-zinc-200 text-xs">语音合成发音</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                  真实连接
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">AI 微信语音消息真实朗读</p>
              <button
                onClick={testTts}
                className="w-full py-1.5 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] flex items-center justify-center gap-1 shadow transition"
              >
                <Play className="w-3 h-3" />
                <span>测试扬声器发音</span>
              </button>
            </div>

            {/* Battery Status */}
            <div className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-750 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-zinc-200 text-xs">电池电量感知</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                  {batteryLevel}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">AI 实时关怀手机低电量状态</p>
              <button
                onClick={checkRealPermissions}
                className="w-full py-1.5 px-2 rounded-xl bg-zinc-700 hover:bg-zinc-650 text-zinc-200 font-medium text-[11px] flex items-center justify-center gap-1 transition"
              >
                <RefreshCw className="w-3 h-3" />
                <span>更新电量读数</span>
              </button>
            </div>

            {/* Clipboard */}
            <div className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-750 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clipboard className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-zinc-200 text-xs">系统剪贴板</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                  真实连接
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">AI 写入与提取文本记录</p>
              <button
                onClick={testClipboard}
                className="w-full py-1.5 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] flex items-center justify-center gap-1 shadow transition"
              >
                <Play className="w-3 h-3" />
                <span>测试写入剪贴板</span>
              </button>
            </div>

            {/* Real Bluetooth BLE */}
            <div className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-750 flex flex-col justify-between space-y-2 col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Bluetooth className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-zinc-200 text-xs">真实蓝牙硬件配对 (Web Bluetooth)</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300">
                  原生硬件权限
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">
                调起系统原生蓝牙配对对话框，连接真实手环/音箱/灯泡并读取实际 GATT 特征与控制能力
              </p>
              <button
                onClick={async () => {
                  try {
                    setStatusMsg('正在调起系统蓝牙设备选择框...');
                    const res = await deviceService.scanRealBluetoothDevice();
                    if (res.success && res.device) {
                      setStatusMsg(`🎉 成功连接真实硬件: ${res.device.name} (${res.device.model || 'BLE'})`);
                    } else if (res.error) {
                      setStatusMsg(res.error);
                    } else {
                      setStatusMsg('未选择真实蓝牙设备');
                    }
                  } catch (e: any) {
                    setStatusMsg(`蓝牙配对未完成: ${e.message || '用户取消或环境不支持'}`);
                  }
                  setTimeout(() => setStatusMsg(''), 4000);
                }}
                className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow transition"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                <span>立即拉起真实蓝牙硬件扫描配对</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Self-Generated AI Permission Requests (AI 自主生成权限申请列表) */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-amber-400 flex items-center gap-2">
              <Send className="w-4 h-4 text-amber-400" />
              2. AI 自主权限申请流 (Permission Requests)
            </h3>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-[10px] text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1 hover:bg-amber-500/30 transition"
            >
              <span>+ 发起新申请</span>
            </button>
          </div>

          <div className="space-y-2">
            {generatedRequests.map((req) => (
              <div
                key={req.id}
                onClick={() => setActiveRequestDialog(req)}
                className="p-3 rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-750 flex items-center justify-between gap-2 cursor-pointer transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-semibold text-zinc-100 text-xs">{req.title}</h5>
                    <p className="text-[10px] text-zinc-400 truncate max-w-[180px]">{req.reason}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                      req.status === 'granted'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : req.status === 'denied'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {req.status === 'granted' ? '已通过' : req.status === 'denied' ? '已拒绝' : '待审批'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. System Level Hardware & Real Access Status (系统级硬件授权状态) */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-blue-400 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            3. 基础系统权限状态 (System Base Access)
          </h3>

          <div className="space-y-3 divide-y divide-zinc-800">
            {/* Geolocation */}
            <div className="flex items-center justify-between pt-1 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <span className="block font-medium text-zinc-200">地理位置权限 (GPS)</span>
                  <span className="text-[10px] text-zinc-400">拉取手机真实坐标与天气感知</span>
                </div>
              </div>
              {renderBadge(realGeo)}
            </div>

            {/* Microphone */}
            <div className="flex items-center justify-between pt-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Mic className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <span className="block font-medium text-zinc-200">手机麦克风权限</span>
                  <span className="text-[10px] text-zinc-400">支持 AI 语音通话与多模态对答</span>
                </div>
              </div>
              {renderBadge(realMic)}
            </div>

            {/* Notifications */}
            <div className="flex items-center justify-between pt-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="block font-medium text-zinc-200">系统级推送通知权限</span>
                  <span className="text-[10px] text-zinc-400">AI 主动关怀提醒与微信消息推送</span>
                </div>
              </div>
              {renderBadge(realNotif)}
            </div>

            {/* Storage */}
            <div className="flex items-center justify-between pt-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="block font-medium text-zinc-200">持久化存储与世界书记忆</span>
                  <span className="text-[10px] text-zinc-400">保存聊天记录、备忘录与世界观词条</span>
                </div>
              </div>
              {renderBadge(realStorage)}
            </div>
          </div>
        </div>

        {/* 4. Cross-App Data Access Permissions */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            4. 应用数据跨模块接入权限
          </h3>

          <div className="space-y-2.5 divide-y divide-zinc-800">
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-rose-400" />
                <div>
                  <span className="block font-medium text-zinc-200">经期健康预测数据</span>
                  <span className="text-[10px] text-zinc-400">AI 可读取经期倒计时并在微信中主动关怀</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.appAccess.menstrualData}
                onChange={() => toggleAppAccess('menstrualData')}
                className="w-5 h-5 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2.5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="block font-medium text-zinc-200">桌面备忘录数据</span>
                  <span className="text-[10px] text-zinc-400">AI 可读取待办并在对话中协助提示</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.appAccess.memosData}
                onChange={() => toggleAppAccess('memosData')}
                className="w-5 h-5 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2.5">
              <div className="flex items-center gap-2">
                <CloudSun className="w-4 h-4 text-sky-400" />
                <div>
                  <span className="block font-medium text-zinc-200">实时天气数据感知</span>
                  <span className="text-[10px] text-zinc-400">AI 在聊天中可感知当前气温、降雨概率与天气状态</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.appAccess.weatherData ?? true}
                onChange={() => toggleAppAccess('weatherData')}
                className="w-5 h-5 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                <div>
                  <span className="block font-medium text-zinc-200">AI 天气主动关心 (下雨/降温/暴雨预警)</span>
                  <span className="text-[10px] text-zinc-400">当检测到即将下雨、恶劣天气或剧烈温差时，AI主动发微信关怀</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.appAccess.weatherCare ?? true}
                onChange={() => toggleAppAccess('weatherCare')}
                className="w-5 h-5 accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 5. Smart External Devices & AI Manager Access (外部设备与 AI 控制权限) */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-cyan-400 flex items-center gap-2">
            <Radio className="w-4 h-4" />
            5. 外部设备与 AI 控制权限 (Device Manager)
          </h3>

          <div className="space-y-2.5 divide-y divide-zinc-800">
            {/* 1. View Device Status */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-sky-400" />
                <div>
                  <span className="block font-medium text-zinc-200">查看设备状态</span>
                  <span className="text-[10px] text-zinc-400">允许 AI 查看空调、灯光、音箱、门锁等设备的当前运行状态</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.deviceAccess?.viewStatus ?? true}
                onChange={() => toggleDeviceAccess('viewStatus')}
                className="w-5 h-5 accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* 2. Connect Device */}
            <div className="flex items-center justify-between pt-2.5">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400" />
                <div>
                  <span className="block font-medium text-zinc-200">连接 / 断开设备</span>
                  <span className="text-[10px] text-zinc-400">允许 AI 自动发起扫描并连接/断开蓝牙与局域网设备</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.deviceAccess?.connectDevice ?? true}
                onChange={() => toggleDeviceAccess('connectDevice')}
                className="w-5 h-5 accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* 3. Control Device */}
            <div className="flex items-center justify-between pt-2.5">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="block font-medium text-zinc-200">控制设备</span>
                  <span className="text-[10px] text-zinc-400">允许 AI 根据用户意图调节开关、温度、亮度、音量与模式</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.deviceAccess?.controlDevice ?? true}
                onChange={() => toggleDeviceAccess('controlDevice')}
                className="w-5 h-5 accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* 4. Auto Execute */}
            <div className="flex items-center justify-between pt-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="block font-medium text-zinc-200">自动执行 (免确认)</span>
                  <span className="text-[10px] text-zinc-400">开启后低风险指令自动生效；关闭时每次控制均需用户确认</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.deviceAccess?.autoExecute ?? true}
                onChange={() => toggleDeviceAccess('autoExecute')}
                className="w-5 h-5 accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* 5. Proactive Use */}
            <div className="flex items-center justify-between pt-2.5">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="block font-medium text-zinc-200">AI 主动使用设备</span>
                  <span className="text-[10px] text-zinc-400">允许 AI 结合高温天气或作息主动关怀并联动开启家电设备</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={permissions.deviceAccess?.proactiveUse ?? true}
                onChange={() => toggleDeviceAccess('proactiveUse')}
                className="w-5 h-5 accent-cyan-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SYSTEM PERMISSION POPUP DIALOG (真实拟真系统权限授权弹窗) */}
      {activeRequestDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-indigo-500/50 p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mx-auto">
              <Shield className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-zinc-100">
                “AI 智能助理” 申请权限
              </h3>
              <p className="text-xs font-semibold text-indigo-300">
                【{activeRequestDialog.title}】
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                {activeRequestDialog.reason}
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-[10px] text-zinc-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>授权后 AI 将能够真实调用对应系统能力为您服务。</span>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleAuthorizeDialog(true)}
                className="w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-bold text-xs text-white shadow-md transition active:scale-98"
              >
                仅在使用中允许 / 确认授权
              </button>
              <button
                onClick={() => handleAuthorizeDialog(false)}
                className="w-full py-2 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition"
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CUSTOM PERMISSION REQUEST MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-semibold text-sm text-amber-300 flex items-center gap-1.5">
                <Send className="w-4 h-4" />
                <span>生成 AI 自主权限申请单</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-zinc-400 mb-1">申请的权限名称</label>
                <input
                  type="text"
                  placeholder="例如: 手机步数读取 / 实时环境光感 / 智能日历日程写入"
                  value={customPermName}
                  onChange={(e) => setCustomPermName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">申请理由与使用场景</label>
                <textarea
                  rows={3}
                  placeholder="说明 AI 角色在什么情况下使用该权限..."
                  value={customPermReason}
                  onChange={(e) => setCustomPermReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300"
              >
                取消
              </button>
              <button
                onClick={handleCreateDynamicPerm}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 font-medium text-zinc-950 shadow-md"
              >
                立即生成并触发申请
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
