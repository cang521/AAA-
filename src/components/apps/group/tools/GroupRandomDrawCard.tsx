import React from 'react';
import { Dices } from 'lucide-react';
import { GroupRandomDrawPayload } from '../../../../types';
import { DEFAULT_AI_AVATAR } from '../../../../lib/storage';

interface GroupRandomDrawCardProps {
  payload: GroupRandomDrawPayload;
}

export const GroupRandomDrawCard: React.FC<GroupRandomDrawCardProps> = ({ payload }) => {
  return (
    <div className="wx-card w-64 sm:w-72 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-400/40 dark:border-amber-500/30 p-3 shadow-xs space-y-2.5 text-xs text-zinc-900 dark:text-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Dices className="w-3.5 h-3.5" />
          </span>
          <span className="wx-primary-text font-bold text-[13px] truncate">
            群随机抽签结果
          </span>
        </div>
        <span className="wx-muted-text text-[10px] text-zinc-400 shrink-0">
          抽{payload.count}人
        </span>
      </div>

      {payload.taskDescription && (
        <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px] font-medium">
          事项：{payload.taskDescription}
        </div>
      )}

      <div className="space-y-1.5">
        {payload.winners.map((winner) => (
          <div
            key={`${winner.memberId}_${winner.round}`}
            className="wx-sub-card flex items-center gap-2 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200/70 dark:border-zinc-700/60"
          >
            <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 w-4 text-center shrink-0">
              #{winner.round}
            </span>
            <img
              src={winner.memberAvatar || DEFAULT_AI_AVATAR}
              alt={winner.memberName}
              className="w-7 h-7 rounded-lg object-cover border border-black/5 dark:border-white/10 shrink-0"
            />
            <span className="font-semibold text-zinc-800 dark:text-zinc-100 truncate flex-1">
              {winner.memberName}
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">
              {winner.memberType === 'ai' ? 'AI' : winner.memberType === 'npc' ? 'NPC' : '真人'}
            </span>
          </div>
        ))}
      </div>

      <div className="wx-muted-text text-[10px] text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <span>
          范围：{payload.scope === 'ai_only' ? '仅群内 AI' : payload.includeUser ? '含全体成员' : '排除本人'}
        </span>
        <span>{payload.poolMemberIds.length} 人池</span>
      </div>
    </div>
  );
};
