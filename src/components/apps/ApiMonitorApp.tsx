import React, { useState } from 'react';
import { ApiLog } from '../../types';
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
  Mic,
  AlertTriangle,
} from 'lucide-react';

interface ApiMonitorAppProps {
  onBackToLauncher: () => void;
  apiLogs: ApiLog[];
  onClearLogs: () => void;
}

export const ApiMonitorApp: React.FC<ApiMonitorAppProps> = ({
  onBackToLauncher,
  apiLogs,
  onClearLogs,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'text' | 'image' | 'voice' | 'failed'>('all');

  const isToday = (timestamp: number) => {
    const today = new Date();
    const logDate = new Date(timestamp);
    return (
      today.getFullYear() === logDate.getFullYear() &&
      today.getMonth() === logDate.getMonth() &&
      today.getDate() === logDate.getDate()
    );
  };

  const todayLogs = apiLogs.filter((log) => isToday(log.timestamp));
  const successLogs = apiLogs.filter((log) => log.status !== 'failed');
  const failedLogs = apiLogs.filter((log) => log.status === 'failed');

  const textLogsCount = apiLogs.filter((l) => !l.category || l.category === 'text').length;
  const imageLogsCount = apiLogs.filter((l) => l.category === 'image').length;
  const voiceLogsCount = apiLogs.filter((l) => l.category === 'voice').length;

  const filteredLogs = apiLogs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (log.purpose || '').toLowerCase().includes(term) ||
      (log.appName || '').toLowerCase().includes(term) ||
      (log.modelName || '').toLowerCase().includes(term) ||
      (log.errorMessage || '').toLowerCase().includes(term);

    let matchesCategory = true;
    if (categoryFilter === 'text') matchesCategory = !log.category || log.category === 'text';
    if (categoryFilter === 'image') matchesCategory = log.category === 'image';
    if (categoryFilter === 'voice') matchesCategory = log.category === 'voice';
    if (categoryFilter === 'failed') matchesCategory = log.status === 'failed';

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
          <span>⬅ 返回桌面</span>
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
      <div className="p-2.5 bg-zinc-900 border-b border-zinc-800 flex gap-2 shrink-0 items-center">
        <div className="flex-1 relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5" />
          <input
            type="text"
            placeholder="搜索模型、位置、错误或用途..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center bg-zinc-800 p-0.5 rounded-xl border border-zinc-700 shrink-0">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2 py-1 text-[11px] rounded-lg transition cursor-pointer ${
              categoryFilter === 'all' ? 'bg-blue-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            全部 ({apiLogs.length})
          </button>
          <button
            onClick={() => setCategoryFilter('text')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer ${
              categoryFilter === 'text' ? 'bg-blue-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>文本 ({textLogsCount})</span>
          </button>
          <button
            onClick={() => setCategoryFilter('image')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer ${
              categoryFilter === 'image' ? 'bg-blue-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>图像 ({imageLogsCount})</span>
          </button>
          <button
            onClick={() => setCategoryFilter('voice')}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer ${
              categoryFilter === 'voice' ? 'bg-blue-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Mic className="w-3 h-3" />
            <span>语音 ({voiceLogsCount})</span>
          </button>
          {failedLogs.length > 0 && (
            <button
              onClick={() => setCategoryFilter('failed')}
              className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer ${
                categoryFilter === 'failed' ? 'bg-rose-600 text-white font-medium' : 'text-rose-400 hover:text-rose-200'
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
          <span>API 实时请求与用量采集记录</span>
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

            let categoryIcon = <MessageSquare className="w-3 h-3 text-sky-400" />;
            if (log.category === 'image') categoryIcon = <ImageIcon className="w-3 h-3 text-purple-400" />;
            if (log.category === 'voice') categoryIcon = <Mic className="w-3 h-3 text-amber-400" />;

            const costStr = log.costDisplay || (log.estimatedCost !== null && log.estimatedCost !== undefined ? `￥${log.estimatedCost}` : '未提供');

            return (
              <div
                key={log.id}
                className={`p-3 rounded-2xl bg-zinc-900 border transition space-y-2.5 ${
                  isFailed ? 'border-rose-500/40 bg-rose-950/10' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Header line: Location, Status, Time */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-200 font-semibold text-[11px] border border-zinc-750 flex items-center gap-1">
                      {categoryIcon}
                      <span>{log.appName}</span>
                    </span>

                    {isFailed ? (
                      <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/40 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-400" />
                        <span>请求失败</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold text-[10px] border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>成功</span>
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

                {/* Purpose text */}
                <div className="text-zinc-100 font-medium text-xs leading-relaxed">
                  {log.purpose}
                </div>

                {/* Error message box if failed */}
                {isFailed && log.errorMessage && (
                  <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300 space-y-0.5">
                    <div className="font-semibold flex items-center gap-1 text-rose-400">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{log.errorType || '异常原因'}:</span>
                    </div>
                    <div className="break-all font-mono text-[10px] text-rose-200/90 leading-normal">
                      {log.errorMessage}
                    </div>
                  </div>
                )}

                {/* Footer line: Model, Tokens, Latency, Cost */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-400">
                  <div className="flex items-center gap-1 overflow-hidden">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate">模型: <strong className="text-zinc-200 font-mono">{log.modelName}</strong></span>
                  </div>

                  <div className="flex items-center gap-1 justify-end font-mono text-zinc-400">
                    <Clock className="w-3 h-3 text-sky-400 shrink-0" />
                    <span>{log.durationMs ? `${log.durationMs}ms` : '未知'}</span>
                  </div>

                  {/* Token breakdown */}
                  <div className="col-span-2 flex items-center justify-between text-[10px] bg-zinc-950/60 px-2 py-1 rounded-lg border border-zinc-850">
                    <div className="flex items-center gap-1 text-zinc-300 font-mono">
                      <span className="text-zinc-500 font-sans">Token用量:</span>
                      {log.promptTokens !== null && log.promptTokens !== undefined && log.completionTokens !== null && log.completionTokens !== undefined ? (
                        <span>
                          输入<strong className="text-emerald-300 mx-0.5">{log.promptTokens}</strong>
                          + 输出<strong className="text-sky-300 mx-0.5">{log.completionTokens}</strong>
                          = <strong className="text-white">{log.totalTokens ?? (log.promptTokens + log.completionTokens)}</strong>
                        </span>
                      ) : log.totalTokens !== null && log.totalTokens !== undefined ? (
                        <span>总计 <strong className="text-white">{log.totalTokens}</strong> (未拆分)</span>
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
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

