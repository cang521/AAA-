import React, { useEffect, useState } from 'react';
import { Globe2, PauseCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { AiSocialActivitySettings, AiSocialFrequency } from '../../../types';
import { loadAiSocialSettings, saveAiSocialSettings } from '../../../lib/social/socialSettings';
import { exportSocialBundle } from '../../../lib/social/socialDb';

interface AiSocialSettingsPanelProps {
  isClassic?: boolean;
}

interface ToggleRowConfig {
  key: keyof Omit<AiSocialActivitySettings, 'paused' | 'frequency'>;
  label: string;
  desc: string;
}

const TOGGLE_ROWS: ToggleRowConfig[] = [
  {
    key: 'allowMeet',
    label: '群内相识与认识建立',
    desc: '同一群聊中的 AI 角色会在互动后逐渐互相认识。',
  },
  {
    key: 'allowFriendRequests',
    label: 'AI 之间发起好友申请',
    desc: '由双方人设与熟悉度决定是否通过好友申请。',
  },
  {
    key: 'allowPrivateChat',
    label: '好友 AI 之间私聊互动',
    desc: '成为好友后在独立私聊线程中产生真实短对话。',
  },
  {
    key: 'allowMomentsInteraction',
    label: '朋友圈互动与可见权限',
    desc: '仅当前好友可查看、点赞或评论彼此动态。',
  },
  {
    key: 'allowGroupRandomEvents',
    label: '群聊低频随机事件',
    desc: '仅受真实群聊互动驱动的低频共同话题、互助或小插曲。',
  },
  {
    key: 'allowConflicts',
    label: '性格摩擦、争吵与冷战',
    desc: '关系变化遵循渐进阶段，不会无端直接跳到绝交。',
  },
  {
    key: 'allowUnfriend',
    label: '允许严重冲突后互删 / 拉黑',
    desc: '仅允许在严重冲突或冷战阶段之后触发，且不影响群成员与群头像。',
  },
  {
    key: 'allowNaturalRomance',
    label: '允许自然好感与表白发展',
    desc: '关闭或处于锁定目标状态时，AI 不会越界发展新恋情。',
  },
  {
    key: 'notifyMajorChanges',
    label: '重大关系变化通知提醒',
    desc: '成为好友、表白结果、互删或拉黑时发送系统/消息通知。',
  },
];

export const AiSocialSettingsPanel: React.FC<AiSocialSettingsPanelProps> = ({
  isClassic = false,
}) => {
  const [settings, setSettings] = useState<AiSocialActivitySettings>(() => loadAiSocialSettings());
  const [stats, setStats] = useState<{
    edges: number;
    threads: number;
    messages: number;
    events: number;
  }>({ edges: 0, threads: 0, messages: 0, events: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    setRefreshing(true);
    try {
      const bundle = await exportSocialBundle();
      setStats({
        edges: bundle.relationships.length,
        threads: bundle.privateThreads.length,
        messages: bundle.privateMessages.length,
        events: bundle.socialEvents.length,
      });
    } catch {
      // Ignore stats error
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const updateField = (patch: Partial<AiSocialActivitySettings>) => {
    const next = saveAiSocialSettings(patch);
    setSettings(next);
  };

  const cardClass = isClassic
    ? 'wx-card p-4 border space-y-3 text-xs'
    : 'p-4 rounded-3xl bg-zinc-850 border border-zinc-750 space-y-3 text-xs';

  const subCardClass = isClassic
    ? 'wx-sub-card p-2.5 border rounded-xl'
    : 'p-2.5 rounded-2xl bg-zinc-800/80 border border-zinc-700';

  const primaryTextClass = isClassic ? 'wx-primary-text font-semibold' : 'text-zinc-100 font-semibold';
  const secondaryTextClass = isClassic ? 'wx-secondary-text text-[11px]' : 'text-zinc-400 text-[11px]';

  return (
    <div className={cardClass}>
      <div className={`${isClassic ? 'wx-divider border-b' : 'border-b border-zinc-800'} flex items-center justify-between pb-2`}>
        <div className="flex items-center gap-1.5">
          <Globe2 className={`w-4 h-4 ${isClassic ? 'wx-green-text' : 'text-emerald-400'}`} />
          <span className={primaryTextClass}>AI 社会活动</span>
        </div>
        <button
          type="button"
          onClick={() => void loadStats()}
          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg cursor-pointer ${
            isClassic
              ? 'wx-btn-secondary border'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
          }`}
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          <span>刷新统计</span>
        </button>
      </div>

      {/* Real persisted counts summary */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { label: '关系记录', value: stats.edges },
          { label: 'AI私聊', value: stats.threads },
          { label: '私聊消息', value: stats.messages },
          { label: '社会事件', value: stats.events },
        ].map((item) => (
          <div key={item.label} className={subCardClass}>
            <div className={`font-mono font-bold text-sm ${isClassic ? 'wx-primary-text' : 'text-emerald-400'}`}>
              {item.value}
            </div>
            <div className={secondaryTextClass}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Global Pause Switch */}
      <div className={`${subCardClass} flex items-center justify-between gap-3`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PauseCircle className={`w-3.5 h-3.5 ${settings.paused ? 'text-amber-500' : 'text-zinc-400'}`} />
            <span className={primaryTextClass}>全局暂停 AI 社交推进</span>
          </div>
          <p className={`${secondaryTextClass} mt-0.5 leading-snug`}>
            开启后暂停所有新社交触发，已保存的历史聊天、关系与事件完整保留。
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateField({ paused: !settings.paused })}
          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
            settings.paused
              ? 'bg-amber-500'
              : isClassic
              ? 'wx-toggle-off bg-zinc-400'
              : 'bg-zinc-700'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
              settings.paused ? 'right-1' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Activity Frequency */}
      <div className={`${subCardClass} flex items-center justify-between gap-2`}>
        <div>
          <div className={primaryTextClass}>社会活动频率</div>
          <div className={secondaryTextClass}>控制每日事件上限与最短冷却间隔</div>
        </div>
        <div className="flex gap-1 shrink-0">
          {(
            [
              { id: 'low', label: '低 (默认)' },
              { id: 'medium', label: '中' },
              { id: 'high', label: '高' },
            ] as Array<{ id: AiSocialFrequency; label: string }>
          ).map((freq) => (
            <button
              key={freq.id}
              type="button"
              onClick={() => updateField({ frequency: freq.id })}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border ${
                settings.frequency === freq.id
                  ? isClassic
                    ? 'wx-btn-primary border-transparent'
                    : 'bg-emerald-600 text-white border-emerald-600'
                  : isClassic
                  ? 'wx-btn-secondary'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
              }`}
            >
              {freq.label}
            </button>
          ))}
        </div>
      </div>

      {/* 9 Granular Switches */}
      <div className="space-y-1.5">
        {TOGGLE_ROWS.map((row) => {
          const checked = settings[row.key];
          return (
            <div
              key={row.key}
              className={`${subCardClass} flex items-center justify-between gap-3`}
            >
              <div className="min-w-0 flex-1">
                <div className={primaryTextClass}>{row.label}</div>
                <p className={`${secondaryTextClass} mt-0.5 leading-snug`}>{row.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => updateField({ [row.key]: !checked })}
                className={`w-10 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                  checked
                    ? isClassic
                      ? 'wx-toggle-on bg-emerald-500'
                      : 'bg-emerald-500'
                    : isClassic
                    ? 'wx-toggle-off bg-zinc-400'
                    : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-[3px] ${
                    checked ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className={`flex items-center gap-1.5 text-[10px] ${secondaryTextClass}`}>
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
        <span>调整任何开关仅限制未来行为，绝不清空已发生的聊天、好友或历史事件。</span>
      </div>
    </div>
  );
};
