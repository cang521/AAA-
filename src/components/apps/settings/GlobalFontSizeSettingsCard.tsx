import React from 'react';
import { Type, RotateCcw, Check } from 'lucide-react';
import {
  GLOBAL_FONT_SCALE_PRESETS,
  MIN_GLOBAL_FONT_PERCENT,
  MAX_GLOBAL_FONT_PERCENT,
  clampGlobalFontScale,
  scaleToPercent,
  percentToScale,
} from '../../../lib/globalDisplayPreferences';
import { PressableButton } from '../../ui/interaction';

interface GlobalFontSizeSettingsCardProps {
  draftFontScale: number;
  savedFontScale: number;
  onDraftChange: (nextScale: number) => void;
  onSave: () => void;
  onReset: () => void;
  feedbackMsg?: string | null;
}

export const GlobalFontSizeSettingsCard: React.FC<GlobalFontSizeSettingsCardProps> = ({
  draftFontScale,
  savedFontScale,
  onDraftChange,
  onSave,
  onReset,
  feedbackMsg,
}) => {
  const safeDraftScale = clampGlobalFontScale(draftFontScale, 1);
  const safeSavedScale = clampGlobalFontScale(savedFontScale, 1);
  const draftPercent = scaleToPercent(safeDraftScale);
  const savedPercent = scaleToPercent(safeSavedScale);
  const isDirty = draftPercent !== savedPercent;

  const handleStep = (deltaPercent: number) => {
    const nextPercent = Math.min(
      MAX_GLOBAL_FONT_PERCENT,
      Math.max(MIN_GLOBAL_FONT_PERCENT, draftPercent + deltaPercent)
    );
    onDraftChange(percentToScale(nextPercent));
  };

  return (
    <section className="space-y-2" aria-label="显示与字体设置">
      <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider px-1 settings-section-heading">
        <Type className="w-3.5 h-3.5 text-sky-400 settings-section-icon" />
        <span>显示与字体</span>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 space-y-4 settings-section-card settings-display-card">
        {/* Card Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-100 settings-card-title flex flex-wrap items-center gap-2">
              <span>全局字体大小</span>
              {isDirty ? (
                <span className="settings-font-dirty-badge text-[10px] font-medium px-2 py-0.5 rounded-full">
                  预览中 · 未保存
                </span>
              ) : (
                <span className="settings-font-saved-badge text-[10px] font-medium px-2 py-0.5 rounded-full">
                  已生效
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 settings-card-subtitle mt-0.5 leading-relaxed">
              按比例缩放桌面、设置、天气、游戏与微信列表等文字；微信私聊气泡与群聊保持独立排版
            </p>
          </div>

          <span
            className="settings-font-percent-badge shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold tabular-nums"
            data-testid="global-font-percent-value"
          >
            {draftPercent}%
          </span>
        </div>

        {/* Slider & A- / A+ Controls */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleStep(-1)}
              disabled={draftPercent <= MIN_GLOBAL_FONT_PERCENT}
              aria-label="减小全局字体大小"
              className="settings-font-step-btn min-w-[44px] min-h-[40px] px-2.5 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0 cursor-pointer"
            >
              A−
            </button>

            <input
              type="range"
              min={MIN_GLOBAL_FONT_PERCENT}
              max={MAX_GLOBAL_FONT_PERCENT}
              step={1}
              value={draftPercent}
              onChange={(e) => onDraftChange(percentToScale(Number(e.target.value)))}
              aria-label="全局字体大小"
              aria-valuemin={MIN_GLOBAL_FONT_PERCENT}
              aria-valuemax={MAX_GLOBAL_FONT_PERCENT}
              aria-valuenow={draftPercent}
              aria-valuetext={`${draftPercent}%`}
              className="settings-font-range flex-1 h-2 rounded-lg cursor-pointer"
            />

            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={draftPercent >= MAX_GLOBAL_FONT_PERCENT}
              aria-label="增大全局字体大小"
              className="settings-font-step-btn min-w-[44px] min-h-[40px] px-2.5 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0 cursor-pointer"
            >
              A+
            </button>
          </div>

          {/* 5 Preset Pills */}
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="全局字体快捷预设">
            {GLOBAL_FONT_SCALE_PRESETS.map((preset) => {
              const isSelected = draftPercent === preset.percent;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onDraftChange(preset.scale)}
                  aria-pressed={isSelected}
                  className={`settings-font-preset-btn py-2 px-1 rounded-xl text-center transition active:scale-95 cursor-pointer min-w-0 ${
                    isSelected ? 'settings-font-preset-btn--active font-bold' : ''
                  }`}
                >
                  <div className="text-[11px] leading-tight truncate">{preset.label}</div>
                  <div className="text-[9px] opacity-80 tabular-nums mt-0.5">{preset.percent}%</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Real-time Draft Effect Preview Area */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 settings-card-subtitle px-0.5">
            <span>显示效果预览</span>
            <span className="tabular-nums">当前预览比例：{draftPercent}%</span>
          </div>

          <div
            className="global-font-preview-box settings-font-preview-card p-3.5 rounded-2xl border space-y-2.5 overflow-hidden"
            style={
              {
                '--global-font-scale': String(safeDraftScale),
              } as React.CSSProperties
            }
          >
            {/* Title & Status Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-zinc-100 settings-card-title leading-snug break-words min-w-0">
                页面标题示例 · 系统与显示
              </div>
              <span className="settings-font-preview-status px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0">
                运行正常
              </span>
            </div>

            {/* Body & Secondary Description */}
            <p className="text-xs text-zinc-200 settings-preview-body leading-relaxed break-words">
              普通正文：全局字体已按 {draftPercent}% 缩放展示，长文本会自动换行且保持卡片边界完整。
            </p>
            <p className="text-[11px] text-zinc-400 settings-card-subtitle leading-relaxed break-words">
              次要说明：不会影响微信私聊消息气泡或群聊窗口的原有字号。
            </p>

            {/* Sample WeChat Conversation Row */}
            <div className="settings-font-preview-row p-2.5 rounded-xl border flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 settings-preview-avatar font-bold text-xs flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                C
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100 settings-card-title truncate">
                    Caelum
                  </span>
                  <span className="text-[10px] text-zinc-400 settings-card-subtitle shrink-0 tabular-nums">
                    14:20
                  </span>
                </div>
                <p className="text-xs text-zinc-400 settings-card-subtitle truncate mt-0.5">
                  最近消息：今天也要开心呀～ ✨
                </p>
              </div>
            </div>

            {/* Sample Button & Hint */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] text-zinc-400 settings-card-subtitle">
                控件排版随文字自然延展
              </span>
              <span className="settings-font-preview-btn px-3 py-1 rounded-lg text-xs font-semibold shrink-0">
                保存设置
              </span>
            </div>
          </div>
        </div>

        {/* Inline Feedback */}
        {feedbackMsg && (
          <div className="settings-feedback-success p-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Action Row: Reset & Save */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-850 settings-card-divider">
          <button
            type="button"
            onClick={onReset}
            className="settings-font-reset-btn py-2 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢复默认</span>
          </button>

          <PressableButton
            type="button"
            withRipple
            rippleTone="light"
            onClick={onSave}
            className="settings-font-save-btn py-2 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isDirty ? '保存并应用' : '保存设置'}</span>
          </PressableButton>
        </div>
      </div>
    </section>
  );
};
