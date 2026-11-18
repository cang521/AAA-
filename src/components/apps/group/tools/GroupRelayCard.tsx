import React, { useState } from 'react';
import { ListOrdered, Plus, Lock } from 'lucide-react';
import { GroupRelayPayload } from '../../../../types';
import { StableTextInput } from '../../../common/StableTextInput';

interface GroupRelayCardProps {
  payload: GroupRelayPayload;
  currentUserId: string;
  canClose: boolean;
  onJoinRelay: (content: string) => { error?: string } | void;
  onCloseRelay: () => void;
}

export const GroupRelayCard: React.FC<GroupRelayCardProps> = ({
  payload,
  currentUserId,
  canClose,
  onJoinRelay,
  onCloseRelay,
}) => {
  const [entryText, setEntryText] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isExpired = Boolean(payload.deadline && Date.now() > payload.deadline);
  const isClosed = Boolean(payload.closed || isExpired);
  const userAlreadyJoined = payload.entries.some((e) => e.memberId === currentUserId);
  const canJoin = !isClosed && (payload.allowDuplicate || !userAlreadyJoined);

  const handleJoin = () => {
    const res = onJoinRelay(entryText);
    if (res && res.error) {
      setErrorMsg(res.error);
      return;
    }
    setErrorMsg(null);
    setEntryText('');
    setShowInput(false);
  };

  return (
    <div className="wx-card w-64 sm:w-72 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 shadow-xs space-y-2 text-xs text-zinc-900 dark:text-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ListOrdered className="w-3.5 h-3.5" />
          </span>
          <span className="wx-primary-text font-bold text-[13px] leading-snug break-words">
            #接龙 {payload.title}
          </span>
        </div>
        {isClosed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 shrink-0">
            已结束
          </span>
        )}
      </div>

      {payload.description && (
        <p className="wx-secondary-text text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {payload.description}
        </p>
      )}

      {payload.deadline && (
        <p className="wx-muted-text text-[10px] text-zinc-400">
          截止：{new Date(payload.deadline).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div className="wx-sub-card rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200/70 dark:border-zinc-700/60 p-2 space-y-1 max-h-48 overflow-y-auto">
        {payload.entries.length === 0 ? (
          <p className="wx-muted-text text-[11px] text-zinc-400 py-1 text-center">暂无接龙记录，点击下方参与</p>
        ) : (
          payload.entries.map((entry, idx) => (
            <div key={entry.id} className="text-[11px] flex items-start gap-1.5 leading-relaxed">
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                {idx + 1}.
              </span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 shrink-0">
                {entry.memberName}:
              </span>
              <span className="text-zinc-700 dark:text-zinc-300 break-words">{entry.content}</span>
            </div>
          ))
        )}
      </div>

      {errorMsg && (
        <p className="text-[10px] text-rose-500">{errorMsg}</p>
      )}

      {showInput && canJoin && (
        <div className="flex items-center gap-1.5 pt-1">
          <StableTextInput
            type="text"
            value={entryText}
            onValueChange={setEntryText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleJoin();
              }
            }}
            placeholder="输入你的接龙内容..."
            className="wx-modal-input flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleJoin}
            className="wx-btn-primary px-2.5 py-1.5 rounded-lg bg-[#07C160] text-white font-semibold text-[11px] shrink-0 cursor-pointer"
          >
            提交
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        {canJoin ? (
          <button
            type="button"
            onClick={() => setShowInput((v) => !v)}
            className="wx-green-text flex items-center gap-1 text-[11px] font-semibold text-[#07C160] hover:underline cursor-pointer py-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showInput ? '收起输入' : '参与接龙'}</span>
          </button>
        ) : (
          <span className="wx-muted-text text-[10px] text-zinc-400">
            {isClosed ? '接龙已结束' : '你已完成本次接龙'}
          </span>
        )}

        {canClose && !isClosed && (
          <button
            type="button"
            onClick={onCloseRelay}
            className="wx-secondary-text flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer py-1"
          >
            <Lock className="w-3 h-3" />
            <span>结束接龙</span>
          </button>
        )}
      </div>
    </div>
  );
};
