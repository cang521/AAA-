import React from 'react';
import { Heart, Lock, Unlock } from 'lucide-react';
import {
  AiCharacter,
  AiRomanticState,
  AiRomanticStatus,
  USER_ENTITY_ID,
  UserProfile,
} from '../../../types';

interface AiRomanticSettingsSectionProps {
  character: AiCharacter;
  allCharacters: AiCharacter[];
  userProfile: UserProfile;
  value: AiRomanticState;
  onChange: (next: AiRomanticState) => void;
}

const ROMANTIC_STATUS_OPTIONS: Array<{ value: AiRomanticStatus; label: string }> = [
  { value: 'none', label: '无特定感情倾向' },
  { value: 'crush', label: '暗生喜欢 / 在意' },
  { value: 'confession_planned', label: '考虑表白' },
  { value: 'confessed', label: '已表白待回应' },
  { value: 'dating', label: '恋爱关系中' },
  { value: 'rejected', label: '曾被拒绝' },
  { value: 'heartbroken', label: '失恋整理中' },
];

export const AiRomanticSettingsSection: React.FC<AiRomanticSettingsSectionProps> = ({
  character,
  allCharacters,
  userProfile,
  value,
  onChange,
}) => {
  const peerOptions = allCharacters.filter((c) => c.id !== character.id);

  return (
    <div className="wx-sub-card p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="wx-primary-text flex items-center gap-1.5 text-rose-300 font-semibold">
          <Heart className="w-4 h-4 text-rose-500" />
          <span>感情目标与锁定规则</span>
        </div>
        <span className="wx-muted-text text-[10px] text-zinc-400">
          {value.romanticTargetLocked ? '已硬锁定' : '未锁定'}
        </span>
      </div>

      <div>
        <label className="wx-secondary-text block text-zinc-400 mb-1">喜欢对象（支持用户与其他 AI）</label>
        <select
          value={value.romanticTargetId || ''}
          onChange={(e) => {
            const targetId = e.target.value ? e.target.value : null;
            onChange({
              ...value,
              romanticTargetId: targetId,
              status: targetId && value.status === 'none' ? 'crush' : !targetId ? 'none' : value.status,
              updatedAt: Date.now(),
            });
          }}
          className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
        >
          <option value="">暂不指定喜欢对象</option>
          <option value={USER_ENTITY_ID}>{userProfile.name || '山雨'}（你本人）</option>
          {peerOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}（AI 角色）
            </option>
          ))}
        </select>
      </div>

      {/* Lock Romantic Target Toggle */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <div className="wx-primary-text font-medium flex items-center gap-1 text-zinc-200">
            {value.romanticTargetLocked ? (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span>锁定喜欢对象</span>
          </div>
          <p className="wx-secondary-text text-[10px] text-zinc-400 leading-relaxed mt-0.5">
            开启锁定后，该角色不会因与其他人聊天好感上升而转移心动，也不会答应其他人的表白。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.romanticTargetLocked}
          onClick={() =>
            onChange({
              ...value,
              romanticTargetLocked: !value.romanticTargetLocked,
              updatedAt: Date.now(),
            })
          }
          className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
            value.romanticTargetLocked ? 'bg-amber-500' : 'wx-toggle-off bg-zinc-700'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
              value.romanticTargetLocked ? 'right-1' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Allow Natural Romance Toggle */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-zinc-800/70">
        <div className="min-w-0">
          <div className="wx-primary-text font-medium text-zinc-200">
            允许自然产生新的喜欢对象
          </div>
          <p className="wx-secondary-text text-[10px] text-zinc-400 leading-relaxed mt-0.5">
            关闭时（或目标已锁定时），普通日常友好互动绝不会自动转化为爱情。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.allowNaturalRomance}
          disabled={value.romanticTargetLocked}
          onClick={() =>
            onChange({
              ...value,
              allowNaturalRomance: !value.allowNaturalRomance,
              updatedAt: Date.now(),
            })
          }
          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
            value.romanticTargetLocked ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
          } ${value.allowNaturalRomance && !value.romanticTargetLocked ? 'wx-toggle-on bg-emerald-500' : 'wx-toggle-off bg-zinc-700'}`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
              value.allowNaturalRomance && !value.romanticTargetLocked ? 'right-1' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Current Emotion Status */}
      <div>
        <label className="wx-secondary-text block text-zinc-400 mb-1">当前感情状态</label>
        <select
          value={value.status}
          onChange={(e) =>
            onChange({
              ...value,
              status: e.target.value as AiRomanticStatus,
              updatedAt: Date.now(),
            })
          }
          className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
        >
          {ROMANTIC_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
