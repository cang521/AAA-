import React, { useState } from 'react';
import { X, Dices } from 'lucide-react';
import { StableTextInput } from '../../../common/StableTextInput';
import { GroupMember, GroupRandomDrawPayload } from '../../../../types';
import { performLocalGroupRandomDraw } from '../../../../lib/groupTools';

interface GroupRandomDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: GroupMember[];
  onSubmit: (payload: GroupRandomDrawPayload) => void;
}

export const GroupRandomDrawModal: React.FC<GroupRandomDrawModalProps> = ({
  isOpen,
  onClose,
  members,
  onSubmit,
}) => {
  const [scope, setScope] = useState<'all' | 'ai_only'>('all');
  const [includeUser, setIncludeUser] = useState(true);
  const [count, setCount] = useState(1);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [taskDescription, setTaskDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectivePoolCount = members.filter((m) => {
    if (scope === 'ai_only' && m.memberType === 'human') return false;
    if (!includeUser && (m.id === 'user_main' || m.memberType === 'human')) return false;
    return true;
  }).length;

  const handleDraw = (e: React.FormEvent) => {
    e.preventDefault();
    const res = performLocalGroupRandomDraw({
      members,
      scope,
      includeUser: scope === 'ai_only' ? false : includeUser,
      count,
      allowDuplicate,
      taskDescription,
    });
    if (res.error || !res.payload) {
      setErrorMsg(res.error || '随机抽取失败');
      return;
    }
    setErrorMsg(null);
    onSubmit(res.payload);
    setTaskDescription('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleDraw}
        onClick={(e) => e.stopPropagation()}
        className="wx-modal-card w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-2xl space-y-3 text-xs"
      >
        <div className="wx-divider flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
            <Dices className="w-4 h-4" />
            <span>随机抽人（本地真随机）</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="wx-muted-text p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-300 text-[11px]">
            {errorMsg}
          </div>
        )}

        <div>
          <label className="wx-secondary-text block text-zinc-600 dark:text-zinc-400 mb-1.5 font-medium">
            抽取对象范围
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`min-h-[38px] rounded-xl border font-semibold cursor-pointer ${
                scope === 'all'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              全员范围内抽取
            </button>
            <button
              type="button"
              onClick={() => {
                setScope('ai_only');
                setIncludeUser(false);
              }}
              className={`min-h-[38px] rounded-xl border font-semibold cursor-pointer ${
                scope === 'ai_only'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              仅群内 AI 成员
            </button>
          </div>
        </div>

        {scope === 'all' && (
          <div className="flex items-center justify-between">
            <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">
              是否包含我自己参与抽签
            </span>
            <button
              type="button"
              onClick={() => setIncludeUser((v) => !v)}
              className={`w-10 h-5 rounded-full transition relative cursor-pointer ${
                includeUser ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all ${
                  includeUser ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">
            抽取人数（当前池共 {effectivePoolCount} 人）
          </span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCount(num)}
                className={`w-8 h-8 rounded-lg font-mono font-bold border cursor-pointer ${
                  count === num
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">
            允许同一人被重复抽中
          </span>
          <button
            type="button"
            onClick={() => setAllowDuplicate((v) => !v)}
            className={`w-10 h-5 rounded-full transition relative cursor-pointer ${
              allowDuplicate ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all ${
                allowDuplicate ? 'right-1' : 'left-1'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="wx-secondary-text block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">
            抽中任务 / 事项备注（可选）
          </label>
          <StableTextInput
            type="text"
            value={taskDescription}
            onValueChange={setTaskDescription}
            placeholder="例如：谁来买下午茶 / 谁负责今日总结"
            className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="pt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="wx-btn-secondary flex-1 min-h-[40px] rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            className="wx-btn-primary flex-1 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold cursor-pointer"
          >
            立即抽取
          </button>
        </div>
      </form>
    </div>
  );
};
