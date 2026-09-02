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
  const [filterApp, setFilterApp] = useState<string>('all');

  // Filter logs for today
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

  const filteredLogs = apiLogs.filter((log) => {
    const matchesSearch =
      log.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.appName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.modelName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesApp = filterApp === 'all' || log.appName === filterApp;
    return matchesSearch && matchesApp;
  });

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition"
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
          className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition"
          title="清空日志"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Simplified Stat Banner: Today's Calls */}
      <div className="p-4 bg-zinc-900 border-b border-zinc-800 grid grid-cols-2 gap-3 shrink-0">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <span className="block text-[11px] text-blue-300 font-semibold">今日 API 调用次数</span>
            <span className="text-xl font-bold text-white mt-0.5">
              {todayLogs.length} <span className="text-xs font-normal text-blue-200">次</span>
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <span className="block text-[11px] text-zinc-400 font-semibold">历史累计调用</span>
            <span className="text-xl font-bold text-zinc-100 mt-0.5">
              {apiLogs.length} <span className="text-xs font-normal text-zinc-400">次</span>
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex gap-2 shrink-0">
        <div className="flex-1 relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5" />
          <input
            type="text"
            placeholder="搜索 API 用途或位置..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none"
          />
        </div>
        <select
          value={filterApp}
          onChange={(e) => setFilterApp(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white"
        >
          <option value="all">所有位置</option>
          <option value="微信-AI聊天">微信-AI聊天</option>
          <option value="美化-CSS优化">美化-CSS优化</option>
          <option value="外端接入-链接解析">外端接入-链接解析</option>
          <option value="朋友圈AI互动">朋友圈AI互动</option>
          <option value="设置-JSON格式适配">设置-JSON格式适配</option>
        </select>
      </div>

      {/* List: API 用在哪里了 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 px-1 mb-1">
          <span>API 调用位置与用途明细</span>
          <span>共 {filteredLogs.length} 条记录</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900/50 rounded-2xl border border-zinc-850">
            暂无 API 调用记录
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isTodayLog = isToday(log.timestamp);
            return (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2 hover:border-zinc-700 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 font-semibold text-[11px] border border-blue-500/30">
                      📍 {log.appName}
                    </span>
                    {isTodayLog && (
                      <span className="px-1.5 py-0.2 text-[9px] rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        今日调用
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                <div className="text-zinc-100 font-medium text-xs leading-relaxed">
                  {log.purpose}
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1.5 border-t border-zinc-800/80">
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>调用模型: <strong className="text-zinc-200 font-mono">{log.modelName}</strong></span>
                  </div>
                  <div className="text-zinc-500 font-mono">
                    {new Date(log.timestamp).toLocaleDateString()}
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
