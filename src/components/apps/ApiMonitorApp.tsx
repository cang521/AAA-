import React, { useState } from 'react';
import { ApiLog } from '../../types';
import { StableTextInput } from '../common/StableTextInput';
import { normalizeApiLogCategory } from '../../lib/apiLogger';
import { sanitizeSensitiveText } from '../../lib/apiCapabilities';
import {
  ArrowLeft,
  Activity,
  Search,
  Trash2,
  Calendar,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  MessageSquare,
  Image as ImageIcon,
  ScanEye,
  Mic,
  AudioLines,
  AlertTriangle,
  Server,
  Hash,
} from 'lucide-react';

interface ApiMonitorAppProps {
  onBackToLauncher: () => void;
  apiLogs: ApiLog[];
  onClearLogs: () => void;
}

type MonitorFilterKey =
  | 'all'
  | 'text_generation'
  | 'image_generation'
  | 'image_recognition'
  | 'speech_generation'
  | 'speech_recognition'
  | 'failed';

const CATEGORY_BADGE_MAP: Record<
  'text_generation' | 'image_generation' | 'image_recognition' | 'speech_generation' | 'speech_recognition',
  { label: string; colorClass: string }
> = {
  text_generation: { label: '语言生成', colorClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  image_generation: { label: '图像生成', colorClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  image_recognition: { label: '图像识别', colorClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  speech_generation: { label: '语音生成', colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  speech_recognition: { label: '语音识别', colorClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
};

export const ApiMonitorApp: React.FC<ApiMonitorAppProps> = ({
  onBackToLauncher,
  apiLogs,
  onClearLogs,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MonitorFilterKey>('all');

  const isToday = (timestamp: number) => {
    const today = new Date();
    const logDate = new Date(timestamp);
    return (
      today.getFullYear() === logDate.getFullYear() &&
      today.getMonth() === logDate.getMonth() &&
      today.getDate() === logDate.getDate()
    );
  };

  const getNormalizedCat = (log: ApiLog) =>
    normalizeApiLogCategory(log.category, log.interfaceType) as
      | 'text_generation'
      | 'image_generation'
      | 'image_recognition'
      | 'speech_generation'
      | 'speech_recognition';

  const todayLogs = apiLogs.filter((log) => isToday(log.timestamp));
  const successLogs = apiLogs.filter((log) => log.status !== 'failed');
  const failedLogs = apiLogs.filter((log) => log.status === 'failed');

  const textGenCount = apiLogs.filter((l) => getNormalizedCat(l) === 'text_generation').length;
  const imageGenCount = apiLogs.filter((l) => getNormalizedCat(l) === 'image_generation').length;
  const imageRecCount = apiLogs.filter((l) => getNormalizedCat(l) === 'image_recognition').length;
  const speechGenCount = apiLogs.filter((l) => getNormalizedCat(l) === 'speech_generation').length;
  const speechRecCount = apiLogs.filter((l) => getNormalizedCat(l) === 'speech_recognition').length;

  const filteredLogs = apiLogs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      (log.purpose || '').toLowerCase().includes(term) ||
      (log.appName || '').toLowerCase().includes(term) ||
      (log.modelName || '').toLowerCase().includes(term) ||
      (log.provider || '').toLowerCase().includes(term) ||
      (log.requestId || '').toLowerCase().includes(term) ||
      (log.errorMessage || '').toLowerCase().includes(term);

    const cat = getNormalizedCat(log);
    let matchesCategory = true;
    if (categoryFilter === 'failed') {
      matchesCategory = log.status === 'failed';
    } else if (categoryFilter !== 'all') {
      matchesCategory = cat === categoryFilter;
    }

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回桌面</span>
        </button>
        <span className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-blue-400" />
          API 调用监控中心
        </span>
        <button
          onClick={onClearLogs}
          className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition cursor-pointer"
          title="清空日志"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Stat Banner */}
      <div className="p-3 bg-zinc-900 border-b border-zinc-800 grid grid-cols-3 gap-2 shrink-0">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <span className="block text-[10px] text-blue-300 font-semibold">今日调用</span>
            <span className="text-base font-bold text-white leading-none mt-0.5 block">
              {todayLogs.length} <span className="text-[10px] font-normal text-blue-200">次</span>
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <span className="block text-[10px] text-emerald-300 font-semibold">成功 / 失败</span>
            <span className="text-base font-bold text-white leading-none mt-0.5 block">
              <span className="text-emerald-400">{successLogs.length}</span>
              <span className="text-zinc-500 mx-0.5">/</span>
              <span className={failedLogs.length > 0 ? 'text-rose-400' : 'text-zinc-400'}>{failedLogs.length}</span>
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-850 border border-zinc-750 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-semibold">历史总计</span>
            <span className="text-base font-bold text-zinc-100 leading-none mt-0.5 block">
              {apiLogs.length} <span className="text-[10px] font-normal text-zinc-400">次</span>
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="p-2.5 bg-zinc-900 border-b border-zinc-800 space-y-2 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5" />
          <StableTextInput
            type="text"
            placeholder="搜索模型、供应商、来源、requestId 或错误..."
            value={searchTerm}
            onValueChange={setSearchTerm}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2 py-1 text-[11px] rounded-lg transition shrink-0 cursor-pointer ${
              categoryFilter === 'all' ? 'bg-blue-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            全部 ({apiLogs.length})
          </button>
          <button
            onClick={() => setCategoryFilter('text_generation')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer ${
              categoryFilter === 'text_generation' ? 'bg-sky-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>语言生成 ({textGenCount})</span>
          </button>
          <button
            onClick={() => setCategoryFilter('image_generation')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer ${
              categoryFilter === 'image_generation' ? 'bg-purple-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>图像生成 ({imageGenCount})</span>
          </button>
          <button
            onClick={() => setCategoryFilter('image_recognition')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer ${
              categoryFilter === 'image_recognition' ? 'bg-teal-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ScanEye className="w-3 h-3" />
            <span>图像识别 ({imageRecCount})</span>
          </button>
          <button
            onClick={() => setCategoryFilter('speech_generation')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer ${
              categoryFilter === 'speech_generation' ? 'bg-amber-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Mic className="w-3 h-3" />
            <span>语音生成 ({speechGenCount})</span>
          </button>
          <button
            onClick={() => setCategoryFilter('speech_recognition')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer ${
              categoryFilter === 'speech_recognition' ? 'bg-orange-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <AudioLines className="w-3 h-3" />
            <span>语音识别 ({speechRecCount})</span>
          </button>
          {failedLogs.length > 0 && (
            <button
              onClick={() => setCategoryFilter('failed')}
              className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer ${
                categoryFilter === 'failed' ? 'bg-rose-600 text-white font-medium' : 'bg-zinc-800 text-rose-400 hover:text-rose-200'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>失败 ({failedLogs.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Log Details List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 px-1 mb-1">
          <span>API 实时请求与能力分类记录（已自动脱敏）</span>
          <span>共 {filteredLogs.length} 条</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900/50 rounded-2xl border border-zinc-850">
            暂无符合条件的 API 调用记录
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isTodayLog = isToday(log.timestamp);
            const isFailed = log.status === 'failed';
            const cat = getNormalizedCat(log);
            const badge = CATEGORY_BADGE_MAP[cat];

            let categoryIcon = <MessageSquare className="w-3 h-3 text-sky-400" />;
            if (cat === 'image_generation') categoryIcon = <ImageIcon className="w-3 h-3 text-purple-400" />;
            if (cat === 'image_recognition') categoryIcon = <ScanEye className="w-3 h-3 text-teal-400" />;
            if (cat === 'speech_generation') categoryIcon = <Mic className="w-3 h-3 text-amber-400" />;
            if (cat === 'speech_recognition') categoryIcon = <AudioLines className="w-3 h-3 text-orange-400" />;

            const costStr =
              log.costDisplay ||
              (log.estimatedCost !== null && log.estimatedCost !== undefined ? `￥${log.estimatedCost}` : '未提供');

            return (
              <div
                key={log.id}
                className={`p-3 rounded-2xl bg-zinc-900 border transition space-y-2.5 ${
                  isFailed ? 'border-rose-500/40 bg-rose-950/10' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Header line */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-lg font-semibold text-[10px] border flex items-center gap-1 ${badge.colorClass}`}>
                      {categoryIcon}
                      <span>{badge.label}</span>
                    </span>

                    <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-200 font-medium text-[10px] border border-zinc-750">
                      {log.appName}
                    </span>

                    {isFailed ? (
                      <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/40 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-400" />
                        <span>失败{log.httpStatus ? ` (${log.httpStatus})` : ''}</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold text-[10px] border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>成功{log.httpStatus ? ` (${log.httpStatus})` : ''}</span>
                      </span>
                    )}

                    {isTodayLog && (
                      <span className="px-1.5 py-0.2 text-[9px] rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        今日
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                {/* Purpose text (sanitized) */}
                <div className="text-zinc-100 font-medium text-xs leading-relaxed">
                  {sanitizeSensitiveText(log.purpose, 160)}
                </div>

                {/* Error message box if failed */}
                {isFailed && log.errorMessage && (
                  <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300 space-y-1">
                    <div className="font-semibold flex items-center justify-between gap-1 text-rose-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{log.errorType || '异常原因'}:</span>
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {log.protocol && (
                          <span className="px-1.5 py-0.2 rounded bg-zinc-900/80 text-sky-300 border border-sky-500/30 text-[9px] font-mono">
                            {log.protocol}
                          </span>
                        )}
                        {log.causeCode && (
                          <span className="px-1.5 py-0.2 rounded bg-zinc-900/80 text-amber-300 border border-amber-500/30 text-[9px] font-mono">
                            {log.causeCode}
                          </span>
                        )}
                        {log.mayHaveBeenCharged && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[9px]">
                            上游可能已扣费（未自动重试）
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="break-all font-mono text-[10px] text-rose-200/90 leading-normal">
                      {sanitizeSensitiveText(log.errorMessage, 240)}
                    </div>
                  </div>
                )}

                {/* Footer line: Provider, Model, RequestId, Latency */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-400">
                  <div className="flex items-center gap-1 overflow-hidden">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate">
                      模型: <strong className="text-zinc-200 font-mono">{log.modelName}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 justify-end font-mono text-zinc-400">
                    <Clock className="w-3 h-3 text-sky-400 shrink-0" />
                    <span>{log.durationMs ? `${log.durationMs}ms` : '未知'}</span>
                  </div>

                  {(log.provider || log.requestId) && (
                    <div className="col-span-2 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                      {log.provider ? (
                        <span className="flex items-center gap-1 truncate">
                          <Server className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>供应商: <strong className="text-zinc-300 font-mono">{log.provider}</strong></span>
                        </span>
                      ) : <span />}
                      {log.requestId && (
                        <span className="flex items-center gap-1 font-mono text-zinc-500 truncate max-w-[55%]">
                          <Hash className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{log.requestId}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Token breakdown */}
                  <div className="col-span-2 flex items-center justify-between text-[10px] bg-zinc-950/60 px-2 py-1 rounded-lg border border-zinc-850">
                    <div className="flex items-center gap-1 text-zinc-300 font-mono">
                      <span className="text-zinc-500 font-sans">Token用量:</span>
                      {log.promptTokens !== null &&
                      log.promptTokens !== undefined &&
                      log.completionTokens !== null &&
                      log.completionTokens !== undefined ? (
                        <span>
                          输入<strong className="text-emerald-300 mx-0.5">{log.promptTokens}</strong>
                          + 输出<strong className="text-sky-300 mx-0.5">{log.completionTokens}</strong>
                          = <strong className="text-white">{log.totalTokens ?? log.promptTokens + log.completionTokens}</strong>
                        </span>
                      ) : log.totalTokens !== null && log.totalTokens !== undefined ? (
                        <span>
                          总计 <strong className="text-white">{log.totalTokens}</strong> (未拆分)
                        </span>
                      ) : (
                        <span className="text-zinc-500">未提供 / 无Token统计</span>
                      )}
                      {log.isRealTokens && (
                        <span className="ml-1 text-[9px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20 font-sans">
                          真实返回
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 font-mono shrink-0">
                      <Coins className="w-3 h-3 text-amber-400" />
                      <span className="text-zinc-400">费用:</span>
                      <strong className={costStr === '免费/内置' ? 'text-emerald-400' : 'text-zinc-300'}>
                        {costStr}
                      </strong>
                    </div>
                  </div>

                  {typeof log.contextRawCount === 'number' && (
                    <div className="col-span-2 flex items-center justify-between text-[10px] bg-zinc-950/40 px-2 py-1 rounded-lg border border-zinc-850/80 text-zinc-400">
                      <span>
                        上下文窗口: <strong className="text-zinc-200 font-mono">{log.contextRawCount}</strong> 条原样
                        {log.contextCompressed && typeof log.contextSummarizedCount === 'number' && log.contextSummarizedCount > 0 ? (
                          <span className="ml-1.5 text-amber-300">
                            · 已启用超长保护（前 {log.contextSummarizedCount} 条已自动折叠摘要）
                          </span>
                        ) : null}
                      </span>
                      {typeof log.contextEstimatedTokens === 'number' && (
                        <span className="font-mono text-zinc-500">~{log.contextEstimatedTokens} tok</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
