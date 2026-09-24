import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  FileText,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Filter,
  Search,
  ChevronRight,
  Info,
  X,
  Smartphone,
  Sparkles,
  Sliders,
  History,
  Lock,
} from 'lucide-react';
import {
  AiActivityLog,
  ActivityEventType,
  ActivityPermissionResult,
  ActivityExecutionResult,
} from '../../lib/agent/types';
import { activityLogger } from '../../lib/agent/ActivityLogger';
import { loadCharacters } from '../../lib/storage';
import { AiCharacter } from '../../types';

interface AiActivityLogsAppProps {
  onBackToLauncher: () => void;
  onOpenPermissions?: () => void;
}

export const AiActivityLogsApp: React.FC<AiActivityLogsAppProps> = ({
  onBackToLauncher,
  onOpenPermissions,
}) => {
  const [logs, setLogs] = useState<AiActivityLog[]>([]);
  const [characters, setCharacters] = useState<AiCharacter[]>([]);
  const [selectedLog, setSelectedLog] = useState<AiActivityLog | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Filters
  const [dateFilter, setDateFilter] = useState<'today' | '3days' | 'all'>('today');
  const [aiFilter, setAiFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    setCharacters(loadCharacters());
    setLogs(activityLogger.getAllLogs());

    const unsub = activityLogger.subscribe(() => {
      setLogs(activityLogger.getAllLogs());
    });

    return unsub;
  }, []);

  // Filter logs based on selection
  const filteredLogs = logs.filter((log) => {
    // Date filter
    const now = Date.now();
    const logDate = new Date(log.timestamp);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateFilter === 'today') {
      if (log.timestamp < today.getTime()) return false;
    } else if (dateFilter === '3days') {
      const threeDaysAgo = today.getTime() - 2 * 24 * 60 * 60 * 1000;
      if (log.timestamp < threeDaysAgo) return false;
    }

    // AI filter
    if (aiFilter !== 'all' && log.aiId !== aiFilter) {
      return false;
    }

    // Type filter
    if (typeFilter !== 'all' && log.eventType !== typeFilter) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAction = log.requestedAction.toLowerCase().includes(q);
      const matchTrigger = log.trigger.toLowerCase().includes(q);
      const matchAi = (log.aiName || '').toLowerCase().includes(q);
      const matchReason = (log.failureReason || '').toLowerCase().includes(q);
      if (!matchAction && !matchTrigger && !matchAi && !matchReason) {
        return false;
      }
    }

    return true;
  });

  // Today Statistics
  const todayLogs = activityLogger.getTodayLogs();
  const allowedCount = todayLogs.filter(
    (l) => l.permissionResult === 'ALLOW' || l.permissionResult === 'PASSED'
  ).length;
  const blockedCount = todayLogs.filter(
    (l) => l.permissionResult === 'DENY' || l.permissionResult === 'BLOCKED'
  ).length;
  const askPendingCount = todayLogs.filter((l) => l.permissionResult === 'ASK_PENDING').length;

  const renderResultBadge = (
    permRes: ActivityPermissionResult,
    execRes: ActivityExecutionResult
  ) => {
    if (permRes === 'ALLOW' || permRes === 'PASSED') {
      if (execRes === 'SUCCESS') {
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium flex items-center gap-1 shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>执行允许</span>
          </span>
        );
      }
      return (
        <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[10px] font-medium flex items-center gap-1 shrink-0">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
          <span>允许但执行失败</span>
        </span>
      );
    }

    if (permRes === 'DENY' || permRes === 'BLOCKED') {
      return (
        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-medium flex items-center gap-1 shrink-0">
          <XCircle className="w-3 h-3 text-rose-400" />
          <span>权限拦截</span>
        </span>
      );
    }

    if (permRes === 'ASK_PENDING') {
      return (
        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-medium flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3 text-amber-400" />
          <span>等待询问用户</span>
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded-full bg-zinc-700/30 text-zinc-400 text-[10px] font-medium">
        已记录
      </span>
    );
  };

  const renderEventTypeTag = (type: ActivityEventType) => {
    switch (type) {
      case 'PERMISSION_CHECK':
        return <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 text-[9px] border border-indigo-500/30">权限检查</span>;
      case 'PERMISSION_CHANGED':
        return <span className="px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 text-[9px] border border-purple-500/30">权限变更</span>;
      case 'ACTION_REQUEST':
        return <span className="px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 text-[9px] border border-blue-500/30">动作请求</span>;
      case 'CAPABILITY_CHECK':
        return <span className="px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-300 text-[9px] border border-teal-500/30">能力检测</span>;
      case 'DIAGNOSTIC':
        return <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[9px] border border-amber-500/30">环境诊断</span>;
      default:
        return <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 text-[9px]">事件记录</span>;
    }
  };

  const handleClearByUser = () => {
    activityLogger.clearAllLogsByUser();
    setShowClearConfirm(false);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Header */}
      <div className="h-13 px-3 bg-zinc-900/95 border-b border-zinc-800/80 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white font-medium px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 transition active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>桌面</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <FileText className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-zinc-100 leading-tight">AI 活动记录</h2>
            <p className="text-[10px] text-zinc-400 leading-tight">系统审计中心 · AI不可篡改</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenPermissions && (
            <button
              onClick={onOpenPermissions}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800/80 transition"
              title="切换至 AI 权限配置"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 transition"
            title="清空记录 (仅用户可操作)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Audit Banner & Concept distinction */}
      <div className="p-3 bg-zinc-900/60 border-b border-zinc-800/60 shrink-0 space-y-2.5">
        <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 leading-relaxed space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>AI权限 vs AI活动记录 核心分工：</span>
          </div>
          <p className="text-[10px] text-zinc-400">
            • <strong className="text-zinc-200">AI权限</strong> 回答：“AI 可以做什么？”<br />
            • <strong className="text-zinc-200">AI活动记录</strong> 回答：“AI 实际做过什么？”<br />
            所有记录由系统内核直写，AI 自身绝对无权修改、删除或隐瞒其任何行为。
          </p>
        </div>

        {/* Today Audit Statistics Row */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="text-xs font-mono font-bold text-zinc-100">{todayLogs.length}</div>
            <div className="text-[9px] text-zinc-400 mt-0.5">今日总活动</div>
          </div>
          <div className="p-2 rounded-xl bg-zinc-900 border border-emerald-500/20">
            <div className="text-xs font-mono font-bold text-emerald-400">{allowedCount}</div>
            <div className="text-[9px] text-emerald-300 mt-0.5">允许执行</div>
          </div>
          <div className="p-2 rounded-xl bg-zinc-900 border border-rose-500/20">
            <div className="text-xs font-mono font-bold text-rose-400">{blockedCount}</div>
            <div className="text-[9px] text-rose-300 mt-0.5">权限拦截</div>
          </div>
          <div className="p-2 rounded-xl bg-zinc-900 border border-amber-500/20">
            <div className="text-xs font-mono font-bold text-amber-300">{askPendingCount}</div>
            <div className="text-[9px] text-amber-300 mt-0.5">待用户确认</div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="搜索动作名称、触发原因或AI角色..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Quick Filter Pills */}
          <div className="flex items-center justify-between gap-1 text-[10px]">
            {/* Date filter */}
            <div className="flex rounded-lg bg-zinc-950 p-0.5 border border-zinc-800">
              <button
                onClick={() => setDateFilter('today')}
                className={`px-2 py-1 rounded-md transition ${dateFilter === 'today' ? 'bg-zinc-800 text-indigo-300 font-medium' : 'text-zinc-400'}`}
              >
                今天
              </button>
              <button
                onClick={() => setDateFilter('3days')}
                className={`px-2 py-1 rounded-md transition ${dateFilter === '3days' ? 'bg-zinc-800 text-indigo-300 font-medium' : 'text-zinc-400'}`}
              >
                近3天
              </button>
              <button
                onClick={() => setDateFilter('all')}
                className={`px-2 py-1 rounded-md transition ${dateFilter === 'all' ? 'bg-zinc-800 text-indigo-300 font-medium' : 'text-zinc-400'}`}
              >
                全部
              </button>
            </div>

            {/* AI Selector */}
            <select
              value={aiFilter}
              onChange={(e) => setAiFilter(e.target.value)}
              className="h-7 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 focus:outline-none"
            >
              <option value="all">全部 AI</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Event Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-7 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 focus:outline-none"
            >
              <option value="all">全部类型</option>
              <option value="ACTION_REQUEST">动作请求</option>
              <option value="PERMISSION_CHECK">权限检查</option>
              <option value="PERMISSION_CHANGED">权限变更</option>
              <option value="CAPABILITY_CHECK">能力检测</option>
              <option value="DIAGNOSTIC">环境诊断</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Activity Log List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">暂无符合筛选条件的活动记录</p>
            <p className="text-[10px] text-zinc-500">所有 AI 的底层行为都将实时透明记录于此处</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            const dateStr = new Date(log.timestamp).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2 hover:border-zinc-700/80 transition cursor-pointer active:scale-[0.99]"
              >
                {/* Header: AI Name + Time + Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      {log.aiName || 'AI Agent'}
                    </span>
                    {renderEventTypeTag(log.eventType)}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {renderResultBadge(log.permissionResult, log.executionResult)}
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {timeStr}
                    </span>
                  </div>
                </div>

                {/* Requested Action */}
                <div className="space-y-0.5">
                  <div className="text-xs text-zinc-200 font-medium leading-snug">
                    {log.requestedAction}
                  </div>
                  <div className="text-[10px] text-zinc-400 flex items-start gap-1">
                    <span className="text-zinc-500 shrink-0">触发情景:</span>
                    <span className="line-clamp-1">{log.trigger}</span>
                  </div>
                </div>

                {/* Failure / Block Reason if any */}
                {log.failureReason && (
                  <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{log.failureReason}</span>
                  </div>
                )}

                {/* Footer hint */}
                <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-1 border-t border-zinc-800/60">
                  <span>{dateStr} · 编号: {log.id.slice(-8)}</span>
                  <span className="flex items-center gap-0.5 text-indigo-400">
                    <span>查看详情</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================== */}
      {/* MODAL: 审计详情弹窗 (Audit Detail Modal)   */}
      {/* ========================================== */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-4 space-y-3 shadow-2xl text-xs max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 shrink-0">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-purple-400" />
                活动记录审计详情
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-zinc-300 text-[11px]">
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">关联 AI 角色:</span>
                <span className="font-medium text-indigo-300">{selectedLog.aiName} ({selectedLog.aiId})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">发生时间:</span>
                <span className="font-mono text-zinc-200">{new Date(selectedLog.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">事件类型:</span>
                <div>{renderEventTypeTag(selectedLog.eventType)}</div>
              </div>

              <div className="space-y-1 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400 block">请求执行动作:</span>
                <p className="text-zinc-100 font-medium leading-relaxed">{selectedLog.requestedAction}</p>
              </div>

              <div className="space-y-1 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400 block">触发情景 / 上下文:</span>
                <p className="text-zinc-300 leading-relaxed">{selectedLog.trigger}</p>
              </div>

              {/* 4-tier checks outcome */}
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 text-[10px]">
                <div className="font-semibold text-zinc-200 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  四层安全拦截判定：
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">权限判定结果:</span>
                  <span className="font-semibold">{selectedLog.permissionResult}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">实际执行结果:</span>
                  <span className="font-semibold">{selectedLog.executionResult}</span>
                </div>
              </div>

              {selectedLog.failureReason && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[10px] space-y-1">
                  <span className="font-semibold text-rose-400 block">拦截或失败详细原因：</span>
                  <p className="leading-relaxed">{selectedLog.failureReason}</p>
                </div>
              )}

              {selectedLog.relatedMessageId && (
                <div className="flex justify-between py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-400">关联微信消息 ID:</span>
                  <span className="font-mono text-indigo-300">{selectedLog.relatedMessageId}</span>
                </div>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-zinc-400 block text-[10px]">事件元数据 (JSON):</span>
                  <pre className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-400 overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedLog(null)}
              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition shrink-0"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: 清空确认 (User Only Clear Confirmation) */}
      {/* ========================================== */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-rose-500/30 p-4 space-y-3 shadow-2xl text-xs text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-zinc-100">确认清空所有活动记录？</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              此操作为<strong>用户独占特权</strong>，AI 无法发起此操作。清空后所有历史审计记录将被永久抹除。
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleClearByUser}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition"
              >
                确认清空
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
