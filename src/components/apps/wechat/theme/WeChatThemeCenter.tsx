import React, { useState } from 'react';
import { ChevronLeft, Check, Palette } from 'lucide-react';
import { WeChatThemeId, WeChatThemeOption } from './types';
import { PressableButton } from '../../../ui/interaction';

interface WeChatThemeCenterProps {
  currentTheme: WeChatThemeId;
  onSelectTheme: (themeId: WeChatThemeId) => void;
  onBack: () => void;
}

const WECHAT_THEMES: WeChatThemeOption[] = [
  {
    id: 'default',
    name: '默认主题',
    description: '保留小手机原有视觉风格，圆润卡片与渐变气泡体验。',
  },
  {
    id: 'classic',
    name: '经典微信',
    description: '参考经典微信布局，简洁列表、微信绿和气泡聊天。',
  },
];

export const WeChatThemeCenter: React.FC<WeChatThemeCenterProps> = ({
  currentTheme,
  onSelectTheme,
  onBack,
}) => {
  const [appliedToast, setAppliedToast] = useState<string | null>(null);

  const handleApplyTheme = (theme: WeChatThemeOption) => {
    onSelectTheme(theme.id);
    setAppliedToast(`已应用${theme.name}主题`);
    setTimeout(() => {
      setAppliedToast(null);
    }, 2200);
  };

  return (
    <div className="wx-theme-center w-full h-full flex flex-col overflow-hidden">
      {/* Top Bar: Left back, Center title "主题", no fake right button */}
      <div className="wx-header h-12 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between shrink-0 z-20">
        <PressableButton
          onClick={onBack}
          expandHitArea
          className="wx-header-back flex items-center gap-1 text-xs text-zinc-300 hover:text-white transition cursor-pointer w-14"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>返回</span>
        </PressableButton>

        <h2 className="wx-header-title text-sm font-semibold tracking-wide flex items-center gap-1.5">
          <span>主题</span>
        </h2>

        <div className="w-14" aria-hidden="true" />
      </div>

      {/* Applied Feedback Banner */}
      {appliedToast && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-xs font-medium flex items-center gap-2 wx-toast-success shrink-0">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{appliedToast}</span>
        </div>
      )}

      {/* Theme Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        <div className="flex items-center gap-2 px-0.5 text-[11px] text-zinc-400 wx-secondary-text">
          <Palette className="w-3.5 h-3.5 shrink-0" />
          <span>仅影响微信内部界面与聊天样式，不会修改聊天记录或全局桌面主题</span>
        </div>

        <div className="space-y-3">
          {WECHAT_THEMES.map((theme) => {
            const isActive = currentTheme === theme.id;
            const isClassicCard = theme.id === 'classic';

            return (
              <div
                key={theme.id}
                className={`wx-theme-card rounded-2xl border p-3.5 space-y-3 transition ${
                  isActive
                    ? 'wx-theme-card--active bg-zinc-800/90 border-emerald-500/60 shadow-sm'
                    : 'bg-zinc-850 border-zinc-800'
                }`}
              >
                {/* Pure HTML/CSS Chat Preview */}
                <div
                  className={`rounded-xl overflow-hidden border ${
                    isClassicCard
                      ? 'border-[#DCDCDC] bg-[#EDEDED]'
                      : 'border-zinc-700/70 bg-zinc-950'
                  }`}
                >
                  {/* Preview Top Bar */}
                  <div
                    className={`h-6 px-2.5 flex items-center justify-between text-[10px] font-semibold border-b ${
                      isClassicCard
                        ? 'bg-[#F7F7F7] border-[#E5E5E5] text-[#191919]'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-100'
                    }`}
                  >
                    <span>‹</span>
                    <span>AI 好友</span>
                    <span>···</span>
                  </div>

                  {/* Preview Messages */}
                  <div className="p-2.5 space-y-2 text-[10px]">
                    {/* AI Bubble */}
                    <div className="flex items-start gap-1.5">
                      <div
                        className={`w-5 h-5 shrink-0 flex items-center justify-center text-[9px] font-bold ${
                          isClassicCard
                            ? 'rounded bg-[#07C160]/15 text-[#07C160]'
                            : 'rounded-lg bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        AI
                      </div>
                      <div
                        className={`px-2 py-1 max-w-[68%] leading-snug ${
                          isClassicCard
                            ? 'rounded bg-[#FFFFFF] text-[#191919] border border-[#E5E5E5]'
                            : 'rounded-xl rounded-tl-xs bg-zinc-800 text-zinc-100 border border-zinc-700'
                        }`}
                      >
                        今天过得怎么样？
                      </div>
                    </div>

                    {/* User Bubble */}
                    <div className="flex items-start justify-end gap-1.5">
                      <div
                        className={`px-2 py-1 max-w-[68%] leading-snug ${
                          isClassicCard
                            ? 'rounded bg-[#95EC69] text-[#191919]'
                            : 'rounded-xl rounded-tr-xs bg-emerald-600 text-white'
                        }`}
                      >
                        刚换上新界面，清爽好多！
                      </div>
                      <div
                        className={`w-5 h-5 shrink-0 flex items-center justify-center text-[9px] font-bold ${
                          isClassicCard
                            ? 'rounded bg-[#576B95]/15 text-[#576B95]'
                            : 'rounded-lg bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        我
                      </div>
                    </div>
                  </div>

                  {/* Preview Composer */}
                  <div
                    className={`h-7 px-2 flex items-center gap-1.5 border-t ${
                      isClassicCard
                        ? 'bg-[#F7F7F7] border-[#E5E5E5]'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                        isClassicCard
                          ? 'border border-[#CCCCCC] text-[#191919]'
                          : 'bg-zinc-800 text-sky-400 border border-zinc-700'
                      }`}
                    >
                      +
                    </div>
                    <div
                      className={`flex-1 h-4 rounded ${
                        isClassicCard ? 'bg-[#FFFFFF] border border-[#E5E5E5]' : 'bg-zinc-800 border border-zinc-700'
                      }`}
                    />
                    <div
                      className={`px-2 h-4 rounded text-[8px] font-semibold flex items-center justify-center text-white ${
                        isClassicCard ? 'bg-[#07C160]' : 'bg-emerald-600'
                      }`}
                    >
                      发送
                    </div>
                  </div>
                </div>

                {/* Metadata + Action */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="wx-primary-text text-sm font-bold text-zinc-100">
                        {theme.name}
                      </h3>
                      {isActive && (
                        <span className="wx-theme-status-badge px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          使用中
                        </span>
                      )}
                    </div>
                    <p className="wx-secondary-text text-[11px] text-zinc-400 leading-snug">
                      {theme.description}
                    </p>
                  </div>

                  <PressableButton
                    onClick={() => handleApplyTheme(theme)}
                    disabled={isActive}
                    withRipple={false}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition cursor-pointer ${
                      isActive
                        ? 'wx-theme-apply-btn--active bg-zinc-700 text-zinc-400 cursor-default'
                        : 'wx-theme-apply-btn bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {isActive ? '使用中' : '应用'}
                  </PressableButton>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
