import React, { useState, useEffect } from 'react';
import { BarChart3, Check, Sparkles, Lock } from 'lucide-react';
import { AiCharacter, GroupMember, GroupPollPayload } from '../../../../types';
import { buildGroupPollStats } from '../../../../lib/groupTools';

interface GroupPollCardProps {
  payload: GroupPollPayload;
  currentUserId: string;
  canManage: boolean;
  hasAiMembers: boolean;
  isAiVoting?: boolean;
  votingActorName?: string | null;
  members?: GroupMember[];
  allCharacters?: AiCharacter[];
  userAvatar?: string;
  onCastVote: (selectedOptionIds: string[]) => { error?: string } | void;
  onClosePoll: () => void;
  onRequestAiVotes?: () => void;
}

export const GroupPollCard: React.FC<GroupPollCardProps> = ({
  payload,
  currentUserId,
  canManage,
  hasAiMembers,
  isAiVoting = false,
  votingActorName = null,
  members = [],
  allCharacters = [],
  userAvatar,
  onCastVote,
  onClosePoll,
  onRequestAiVotes,
}) => {
  const myCurrentIds = payload.options
    .filter((o) => o.voterIds.includes(currentUserId))
    .map((o) => o.id);
  const [draftIds, setDraftIds] = useState<string[]>(myCurrentIds);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraftIds(
      payload.options.filter((o) => o.voterIds.includes(currentUserId)).map((o) => o.id)
    );
  }, [payload, currentUserId]);

  const stats = buildGroupPollStats(payload, members);
  const isExpired = Boolean(payload.deadline && Date.now() > payload.deadline);
  const isClosed = Boolean(payload.closed || isExpired);
  const alreadyVoted = myCurrentIds.length > 0;
  const canVote = !isClosed && (!alreadyVoted || payload.allowChange);
  const maxAllowed = payload.multiSelect
    ? Math.max(1, payload.maxSelections || payload.options.length)
    : 1;

  const resolveVoterAvatar = (voterId: string): string | undefined => {
    if (voterId === currentUserId && userAvatar) return userAvatar;
    const member = members.find((m) => m.id === voterId || m.characterId === voterId);
    if (member?.avatar) return member.avatar;
    const char = allCharacters.find((c) => c.id === voterId);
    if (char?.avatar) return char.avatar;
    return undefined;
  };

  const resolveVoterName = (opt: GroupPollPayload['options'][number], voterId: string): string => {
    if (opt.voterNames?.[voterId]) return opt.voterNames[voterId];
    const member = members.find((m) => m.id === voterId || m.characterId === voterId);
    if (member?.name) return member.name;
    return voterId;
  };

  const toggleOption = (optId: string) => {
    if (!canVote) return;
    setErrorMsg(null);
    if (!payload.multiSelect) {
      const res = onCastVote([optId]);
      if (res && res.error) setErrorMsg(res.error);
      return;
    }
    setDraftIds((prev) => {
      if (prev.includes(optId)) {
        return prev.filter((id) => id !== optId);
      }
      if (prev.length >= maxAllowed) {
        setErrorMsg(`最多只能选择 ${maxAllowed} 项`);
        return prev;
      }
      return [...prev, optId];
    });
  };

  const handleSubmitMulti = () => {
    const res = onCastVote(draftIds);
    if (res && res.error) setErrorMsg(res.error);
  };

  return (
    <div className="wx-card w-64 sm:w-72 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 shadow-xs space-y-2.5 text-xs text-zinc-900 dark:text-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
            <BarChart3 className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="wx-primary-text font-bold text-[13px] leading-snug break-words">
              {payload.title}
            </div>
            <div className="wx-muted-text text-[10px] text-zinc-400 mt-0.5 flex flex-wrap items-center gap-x-1">
              <span>{payload.multiSelect ? `多选(最多${maxAllowed}项)` : '单选'}</span>
              <span>·</span>
              <span>{payload.anonymous ? '匿名' : '实名'}</span>
              <span>·</span>
              <span>{stats.totalVoters}人参与</span>
              {stats.aiVoterCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    已有{stats.aiVoterCount}位AI参与
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {isClosed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 shrink-0">
            已结束
          </span>
        )}
      </div>

      {!isClosed && votingActorName && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium animate-pulse">
          <Sparkles className="w-3 h-3 shrink-0" />
          <span className="truncate">{votingActorName} 正在选择……</span>
        </div>
      )}

      <div className="space-y-1.5">
        {payload.options.map((opt) => {
          const stat = stats.optionStats.find((s) => s.optionId === opt.id);
          const count = stat?.count || 0;
          const percent = stat?.percent || 0;
          const isSelected = payload.multiSelect
            ? draftIds.includes(opt.id)
            : myCurrentIds.includes(opt.id);
          const showVoterDetails = !payload.anonymous && opt.voterIds.length > 0;
          const displayedVoterIds = showVoterDetails ? opt.voterIds.slice(0, 5) : [];
          const voterNames = showVoterDetails
            ? opt.voterIds
                .map((id) => resolveVoterName(opt, id))
                .slice(0, 6)
                .join('、')
            : '';

          return (
            <button
              key={opt.id}
              type="button"
              disabled={!canVote}
              onClick={() => toggleOption(opt.id)}
              className={`w-full text-left relative overflow-hidden rounded-xl border p-2 transition ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/5'
                  : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800/50'
              } ${canVote ? 'cursor-pointer hover:border-blue-400' : 'cursor-default'}`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-blue-500/12 dark:bg-blue-400/15 transition-all duration-300 pointer-events-none"
                style={{ width: `${percent}%` }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-100 break-words">
                    {opt.text}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">
                  {count}票 ({percent}%)
                </span>
              </div>
              {showVoterDetails && (
                <div className="relative mt-1.5 pl-5 flex items-center gap-1.5 min-w-0">
                  <div className="flex items-center -space-x-1 shrink-0">
                    {displayedVoterIds.map((vid) => {
                      const av = resolveVoterAvatar(vid);
                      const label = resolveVoterName(opt, vid);
                      return av ? (
                        <img
                          key={vid}
                          src={av}
                          alt={label}
                          title={label}
                          className="w-4 h-4 rounded-full object-cover border border-white dark:border-zinc-900"
                        />
                      ) : (
                        <span
                          key={vid}
                          title={label}
                          className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[8px] font-bold flex items-center justify-center border border-white dark:border-zinc-900"
                        >
                          {label.slice(0, 1)}
                        </span>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {voterNames}
                    {opt.voterIds.length > 6 ? ` 等${opt.voterIds.length}人` : ''}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {errorMsg && <p className="text-[10px] text-rose-500">{errorMsg}</p>}

      {payload.multiSelect && canVote && (
        <button
          type="button"
          onClick={handleSubmitMulti}
          disabled={draftIds.length === 0}
          className="wx-btn-primary w-full py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-[11px] cursor-pointer"
        >
          确认投票 ({draftIds.length}/{maxAllowed})
        </button>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800 text-[10px]">
        {hasAiMembers && !isClosed && onRequestAiVotes ? (
          <button
            type="button"
            disabled={isAiVoting}
            onClick={onRequestAiVotes}
            className="wx-green-text flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer disabled:opacity-50 py-0.5"
          >
            <Sparkles className="w-3 h-3" />
            <span>
              {votingActorName
                ? `${votingActorName} 正在选择……`
                : isAiVoting
                  ? '群内AI正在参与投票...'
                  : '邀请群内AI参与投票'}
            </span>
          </button>
        ) : (
          <span className="wx-muted-text text-zinc-400">
            {payload.allowChange ? '支持改选' : '提交后不可改选'}
          </span>
        )}

        {canManage && !isClosed && (
          <button
            type="button"
            onClick={onClosePoll}
            className="wx-secondary-text flex items-center gap-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer py-0.5"
          >
            <Lock className="w-3 h-3" />
            <span>结束</span>
          </button>
        )}
      </div>
    </div>
  );
};
