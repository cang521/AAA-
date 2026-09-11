import React from 'react';
import { Shield, Sparkles, Check, X, AlertTriangle } from 'lucide-react';
import { AgentAskPrompt } from '../../lib/agent/types';

interface InPhoneAskDialogProps {
  prompt: AgentAskPrompt;
}

export const InPhoneAskDialog: React.FC<InPhoneAskDialogProps> = ({ prompt }) => {
  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-indigo-500/40 p-4 space-y-3.5 shadow-2xl text-xs text-white">
        {/* Header Icon + Title */}
        <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
            {prompt.aiAvatar ? (
              <img
                src={prompt.aiAvatar}
                alt={prompt.aiName}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <Shield className="w-5 h-5 text-indigo-400" />
            )}
          </div>
          <div className="text-left">
            <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
              <span>系统授权询问 (ASK)</span>
            </h3>
            <p className="text-[10px] text-indigo-300 font-mono">
              角色: {prompt.aiName}
            </p>
          </div>
        </div>

        {/* Content Details */}
        <div className="space-y-2 py-1">
          <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-[11px] leading-relaxed text-zinc-300 space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>请求执行：</span>
              <strong className="text-zinc-100">{prompt.actionTitle}</strong>
            </div>
            <div className="text-[10px] text-zinc-400">
              <span>当前情景：</span>
              <span className="text-indigo-300">【{prompt.sceneName}】场景</span>
            </div>
            <p className="text-[10px] text-zinc-300 pt-1 border-t border-zinc-900">
              {prompt.description}
            </p>
          </div>

          <p className="text-[9px] text-zinc-500 text-center">
            系统权限层 ≠ AI独立权限。未经允许，AI无法越权执行任何主动行为。
          </p>
        </div>

        {/* Action Buttons (Android Style 3 options) */}
        <div className="space-y-1.5 pt-1">
          <button
            onClick={() => prompt.resolve('ALLOW_ONCE')}
            className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-indigo-600/30"
          >
            <Check className="w-3.5 h-3.5" />
            <span>仅此一次允许</span>
          </button>

          <button
            onClick={() => prompt.resolve('ALLOW_ALWAYS')}
            className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-indigo-300 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 border border-indigo-500/20"
          >
            <span>在此场景下始终允许 (更新权限)</span>
          </button>

          <button
            onClick={() => prompt.resolve('DENY')}
            className="w-full py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-rose-400 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 border border-rose-500/20"
          >
            <X className="w-3.5 h-3.5" />
            <span>拒绝本次请求</span>
          </button>
        </div>
      </div>
    </div>
  );
};
