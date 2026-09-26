import React, { useState } from 'react';
import { Heart, Activity, Sparkles, X, Zap, Shield, Eye, Smile } from 'lucide-react';
import { CharacterState } from '../../lib/offline/OfflineStateEngine';

interface OfflineStateMiniPanelProps {
  state: CharacterState;
  characterName: string;
}

export const OfflineStateMiniPanel: React.FC<OfflineStateMiniPanelProps> = ({ state, characterName }) => {
  const [showFullModal, setShowFullModal] = useState(false);

  // Blush label helper
  const getBlushLabel = (b: number) => {
    if (b >= 70) return '通红发烫';
    if (b >= 40) return '脸颊泛红';
    if (b >= 20) return '微红';
    return '正常';
  };

  return (
    <>
      {/* Compact Mini Panel (Top-Left Content Area) */}
      <div
        onClick={() => setShowFullModal(true)}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-zinc-750/80 text-[11px] text-zinc-200 cursor-pointer hover:bg-zinc-800/90 transition shadow-sm select-none"
        title="点击查看角色详细心理与生理状态仪表盘"
      >
        <div className="flex items-center gap-1 font-mono text-rose-400 font-bold">
          <Heart className="w-3 h-3 text-rose-500 fill-rose-500 animate-pulse" />
          <span>{state.heartRate}</span>
        </div>

        <span className="text-zinc-600">·</span>

        <span className="text-zinc-300">呼吸 {state.breathing}</span>

        <span className="text-zinc-600">·</span>

        <span className="text-amber-300">脸颊 {getBlushLabel(state.blush)}</span>

        {state.emotion && state.emotion.length > 0 && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-300 font-medium">{state.emotion.join(' · ')}</span>
          </>
        )}
      </div>

      {/* Full State Dashboard Modal */}
      {showFullModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-750 p-5 space-y-4 text-zinc-100 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-500/30" />
                <h3 className="font-bold text-sm text-zinc-100">{characterName} 的实时模拟状态</h3>
              </div>
              <button
                onClick={() => setShowFullModal(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Core Metrics Meters */}
            <div className="space-y-3 text-xs">
              {/* Heart Rate & Breathing */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Heart className="w-3 h-3 text-rose-400" /> 心率 BPM
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-rose-400">{state.heartRate}</span>
                    <span className="text-[10px] text-zinc-500">次/分</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, ((state.heartRate - 50) / 100) * 100))}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Activity className="w-3 h-3 text-blue-400" /> 呼吸状态
                  </span>
                  <div className="text-sm font-bold text-blue-300 pt-1">{state.breathing}</div>
                  <span className="text-[10px] text-zinc-500 block truncate">胸口微起伏</span>
                </div>
              </div>

              {/* Blush & Emotion */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Sparkles className="w-3 h-3 text-amber-400" /> 脸红红润度
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-amber-300">{state.blush}%</span>
                    <span className="text-[10px] text-zinc-500">({getBlushLabel(state.blush)})</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-rose-400 transition-all duration-300"
                      style={{ width: `${state.blush}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Smile className="w-3 h-3 text-emerald-400" /> 心理情绪
                  </span>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {state.emotion.map((e, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tension, Arousal & Energy */}
              <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">紧绷 / 戒备程度:</span>
                    <span className="font-mono text-purple-300 font-bold">{state.tension}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${state.tension}%` }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">兴奋 / 心动指数:</span>
                    <span className="font-mono text-pink-300 font-bold">{state.arousal}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${state.arousal}%` }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">体力精力状态:</span>
                    <span className="font-mono text-emerald-300 font-bold">{state.energy}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${state.energy}%` }} />
                  </div>
                </div>
              </div>

              {/* Physical State & Behavior Descriptions */}
              <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1.5 text-[11px]">
                <div className="flex items-start gap-2 text-zinc-300">
                  <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <span><strong>肢体表现：</strong>{state.physicalState}</span>
                </div>
                <div className="flex items-start gap-2 text-zinc-300">
                  <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span><strong>举止神态：</strong>{state.behavior}</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
              * 状态数据由 AI 根据场景氛围、对话走势与情绪起伏实时推演呈现，继承前一轮状态连续变化。
            </p>
          </div>
        </div>
      )}
    </>
  );
};
