import React, { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Server, Bell, TimerReset, ShieldCheck, Activity, CheckCircle2, XCircle, Vibrate } from 'lucide-react';
import {
  collectTestingSnapshot,
  runApiLogConcurrencyTest,
  runBackendHealthTest,
  runNativeNotificationTest,
  runNativeProactiveTest,
  runVibrationTest,
} from '../../../lib/testing/diagnosticsClient';

interface TestingAppProps {
  onBack: () => void;
}

type ResultTone = 'idle' | 'working' | 'success' | 'error';

export const TestingApp: React.FC<TestingAppProps> = ({ onBack }) => {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [result, setResult] = useState('尚未执行测试');
  const [tone, setTone] = useState<ResultTone>('idle');

  const refresh = async () => {
    setTone('working');
    const next = await collectTestingSnapshot();
    setSnapshot(next);
    setResult('状态已刷新');
    setTone('success');
  };

  useEffect(() => { void refresh(); }, []);

  const run = async (fn: () => Promise<string>) => {
    setTone('working');
    setResult('正在执行真实测试…');
    try {
      const text = await fn();
      setResult(text);
      setTone(/失败|无法|未提交/.test(text) ? 'error' : 'success');
      window.setTimeout(() => { void refresh(); }, 1800);
    } catch (error: any) {
      setResult(error?.message || '测试执行失败');
      setTone('error');
    }
  };

  const native = snapshot?.native;
  const worker = snapshot?.worker;
  const backend = snapshot?.backend;

  const cards = [
    { label: '运行环境', value: snapshot?.isNative ? 'Android APK' : '网页预览', ok: Boolean(snapshot?.isNative) },
    { label: '每小时后台任务', value: native?.workerState || worker?.state || '未知', ok: Boolean(native?.workerRegistered || worker?.registered) },
    { label: '后台状态快照', value: native?.snapshotReady ? '已同步' : '未同步', ok: Boolean(native?.snapshotReady) },
    { label: '系统通知', value: native?.notificationsEnabled ? '已允许' : '未允许', ok: Boolean(native?.notificationsEnabled) },
    { label: '电池后台限制', value: native?.batteryUnrestricted ? '不受限制' : '可能受限', ok: Boolean(native?.batteryUnrestricted) },
    { label: '内置聊天后端', value: backend?.status || '未知', ok: backend?.status === 'ready' },
    { label: 'API监控记录', value: `${snapshot?.apiLogCount || 0} 条`, ok: true },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#f5faff] text-slate-800 overflow-hidden">
      <header className="h-14 px-4 flex items-center justify-between bg-white border-b border-sky-100 shrink-0">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-sky-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h1 className="font-bold text-base">测试</h1>
          <p className="text-[10px] text-slate-400">独立诊断，不混入正式APP</p>
        </div>
        <button onClick={() => void refresh()} className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center">
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <section className="grid grid-cols-2 gap-2">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl bg-white border border-sky-100 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                {card.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                {card.label}
              </div>
              <div className="mt-1.5 text-xs font-semibold break-all">{card.value}</div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-white border border-sky-100 p-3 space-y-2 shadow-sm">
          <h2 className="text-sm font-bold text-sky-900">真实功能测试</h2>
          <button onClick={() => void run(runNativeProactiveTest)} className="test-action-btn">
            <TimerReset className="w-4 h-4" /><span>立即执行一次安卓后台巡检</span>
          </button>
          <button onClick={() => void run(runBackendHealthTest)} className="test-action-btn">
            <Server className="w-4 h-4" /><span>启动并检查聊天后端</span>
          </button>
          <button onClick={() => void run(runNativeNotificationTest)} className="test-action-btn">
            <Bell className="w-4 h-4" /><span>发送真实系统通知</span>
          </button>
          <button onClick={() => void run(runVibrationTest)} className="test-action-btn">
            <Vibrate className="w-4 h-4" /><span>执行真实设备振动</span>
          </button>
          <button onClick={() => void run(runApiLogConcurrencyTest)} className="test-action-btn">
            <Activity className="w-4 h-4" /><span>API监控连续3条完整性测试</span>
          </button>
        </section>

        <section className={`rounded-2xl p-3 border text-xs leading-relaxed ${tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : tone === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-sky-50 border-sky-200 text-sky-700'}`}>
          <div className="font-bold mb-1 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />测试结果</div>
          {result}
        </section>

        <section className="rounded-2xl bg-white border border-sky-100 p-3 text-[11px] text-slate-500 leading-relaxed">
          <div><b>上次后台检查：</b>{native?.lastInspectionAt ? new Date(native.lastInspectionAt).toLocaleString() : '尚无记录'}</div>
          <div className="mt-1"><b>结果：</b>{native?.lastInspectionSummary || worker?.lastInspectionSummary || '等待首次检查'}</div>
          {native?.pauseReason && <div className="mt-1"><b>免打扰：</b>{native.pauseReason}</div>}
          {backend?.failureReason && <div className="mt-1 text-rose-600"><b>后端错误：</b>{backend.failureReason}</div>}
        </section>

        {snapshot?.permissions && (
          <section className="rounded-2xl bg-white border border-sky-100 p-3 shadow-sm">
            <h2 className="text-sm font-bold text-sky-900 mb-2">安卓权限实测</h2>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(snapshot.permissions).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2 py-1.5 text-[10px]">
                  <span className="truncate text-slate-500">{key}</span>
                  <span className={value === 'GRANTED' ? 'text-emerald-600 font-bold' : 'text-rose-500 font-semibold'}>{String(value)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <style>{`.test-action-btn{width:100%;display:flex;align-items:center;gap:.55rem;padding:.75rem;border-radius:1rem;background:#eff8ff;border:1px solid #bae6fd;color:#075985;font-size:.75rem;font-weight:600}.test-action-btn:active{transform:scale(.985);background:#e0f2fe}`}</style>
    </div>
  );
};
