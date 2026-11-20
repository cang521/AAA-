import React, { useState } from 'react';
import {
  Heart,
  Activity,
  Sparkles,
  X,
  Shield,
  Eye,
  Smile,
  Thermometer,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';
import { CharacterState, OfflineStateEngine } from '../../lib/offline/OfflineStateEngine';
import { OfflineFontScaleClasses, getOfflineFontScaleClasses } from '../../lib/offline/offlineDisplaySettings';

interface OfflineStateMiniPanelProps {
  state: CharacterState;
  characterName: string;
  fontScale?: OfflineFontScaleClasses;
  showIntimateState?: boolean;
}

export const OfflineStateMiniPanel: React.FC<OfflineStateMiniPanelProps> = ({
  state: rawState,
  characterName,
  fontScale,
  showIntimateState = true,
}) => {
  const [showFullModal, setShowFullModal] = useState(false);
  const [intimateExpanded, setIntimateExpanded] = useState(false);

  const state = OfflineStateEngine.hydrateState(rawState);
  const scale = fontScale || getOfflineFontScaleClasses('lg');
  const hasActiveIntimate = Boolean(showIntimateState && state.intimateState?.active);

  const getBlushLabel = (b: number) => {
    if (b >= 70) return '通红发烫';
    if (b >= 40) return '脸颊泛红';
    if (b >= 20) return '微红';
    return '正常';
  };

  return (
    <>
      {/* Compact Mini Panel */}
      <button
        type="button"
        onClick={() => setShowFullModal(true)}
        className={`max-w-full inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-xl bg-zinc-900/90 backdrop-blur-md border border-zinc-750/80 ${scale.stateMini} text-zinc-200 cursor-pointer hover:border-indigo-500/50 transition shadow-sm select-none text-left`}
        title="点击查看角色详细身体与情绪状态"
      >
        <span className="inline-flex items-center gap-1 font-mono text-rose-500 font-bold">
          <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 animate-pulse" />
          <span>{state.heartRate}</span>
        </span>

        <span className="text-zinc-500">·</span>

        <span className="text-zinc-300">呼吸 {state.breathing}</span>

        <span className="text-zinc-500">·</span>

        <span className="inline-flex items-center gap-0.5 font-mono text-sky-500 font-medium">
          <Thermometer className="w-3 h-3" />
          {state.bodyTemp.toFixed(1)}°C
        </span>

        <span className="text-zinc-500">·</span>

        <span className="text-amber-500">脸颊 {getBlushLabel(state.blush)}</span>

        {state.emotion && state.emotion.length > 0 && (
          <>
            <span className="text-zinc-500">·</span>
            <span className="text-emerald-500 font-medium">{state.emotion.join(' · ')}</span>
          </>
        )}

        {hasActiveIntimate && (
          <>
            <span className="text-zinc-500">·</span>
            <span className="text-pink-500 font-medium inline-flex items-center gap-0.5">
              <Lock className="w-2.5 h-2.5" />
              私密状态
            </span>
          </>
        )}
      </button>

      {/* Full State Dashboard Modal */}
      {showFullModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowFullModal(false)}
        >
          <div
            className={`w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-750 p-5 space-y-4 text-zinc-100 shadow-2xl max-h-[85vh] overflow-y-auto ${scale.stateModalText}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-500/30" />
                <h3 className="font-bold text-zinc-100">{characterName} 的当前状态</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFullModal(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Regular Metrics */}
            <div className="space-y-3">
              {/* Row 1: Heart Rate, Breathing, Body Temp */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Heart className="w-3 h-3 text-rose-500" /> 心率
                  </span>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-lg font-bold font-mono text-rose-500">{state.heartRate}</span>
                    <span className="text-[10px] text-zinc-500">bpm</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, ((state.heartRate - 50) / 110) * 100))}%` }}
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Thermometer className="w-3 h-3 text-sky-500" /> 体温
                  </span>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-lg font-bold font-mono text-sky-500">{state.bodyTemp.toFixed(1)}</span>
                    <span className="text-[10px] text-zinc-500">°C</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, ((state.bodyTemp - 36.0) / 2.5) * 100))}%` }}
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Activity className="w-3 h-3 text-indigo-500" /> 呼吸
                  </span>
                  <div className="font-bold text-indigo-500 pt-1 leading-tight break-words">{state.breathing}</div>
                </div>
              </div>

              {/* Row 2: Blush & Emotion */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Sparkles className="w-3 h-3 text-amber-500" /> 脸红程度
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold font-mono text-amber-500">{state.blush}%</span>
                    <span className="text-[11px] text-zinc-500">({getBlushLabel(state.blush)})</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-rose-400 transition-all duration-300"
                      style={{ width: `${state.blush}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-semibold">
                    <Smile className="w-3 h-3 text-emerald-500" /> 当前情绪
                  </span>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {state.emotion.map((e, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[11px] font-medium"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 3: Tension & Energy */}
              <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">紧张度</span>
                    <span className="font-mono text-purple-500 font-bold">{state.tension}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${state.tension}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">体力精力</span>
                    <span className="font-mono text-emerald-500 font-bold">{state.energy}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${state.energy}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Physical State & Behavior */}
              <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-start gap-2 text-zinc-300">
                  <Shield className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    <strong className="text-zinc-100">身体状态：</strong>
                    {state.physicalState}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-zinc-300">
                  <Eye className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    <strong className="text-zinc-100">当前行为：</strong>
                    {state.behavior}
                  </span>
                </div>
              </div>

              {/* Optional Collapsible Intimate State (ONLY when active AND enabled in Display Settings) */}
              {hasActiveIntimate && state.intimateState && (
                <div className="rounded-2xl bg-zinc-950 border border-pink-500/35 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIntimateExpanded((prev) => !prev)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-pink-500 font-semibold cursor-pointer hover:bg-pink-500/10 transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>私密状态</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-normal">
                      {intimateExpanded ? '收起' : '展开查看'}
                      {intimateExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>

                  {intimateExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-pink-500/20">
                      {typeof state.intimateState.arousal === 'number' && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">亲密唤起</span>
                            <span className="font-mono text-pink-500 font-bold">{state.intimateState.arousal}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-pink-500 transition-all duration-300"
                              style={{ width: `${state.intimateState.arousal}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {typeof state.intimateState.sensitivity === 'number' && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">敏感度</span>
                            <span className="font-mono text-rose-500 font-bold">
                              {state.intimateState.sensitivity}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-rose-500 transition-all duration-300"
                              style={{ width: `${state.intimateState.sensitivity}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {state.intimateState.physiologicalState && (
                        <p className="text-zinc-300 leading-relaxed">
                          <strong className="text-zinc-100">实时感受：</strong>
                          {state.intimateState.physiologicalState}
                        </p>
                      )}

                      {state.intimateState.notes && (
                        <p className="text-zinc-400 leading-relaxed text-[12px]">{state.intimateState.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
              状态随当前剧情与对话自然连续变化，仅用于本场相处呈现。
            </p>
          </div>
        </div>
      )}
    </>
  );
};
