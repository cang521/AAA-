import React, { useState } from 'react';
import { X, ListOrdered } from 'lucide-react';
import { StableTextInput } from '../../../common/StableTextInput';
import { StableTextarea } from '../../../common/StableTextarea';
import { createGroupRelayPayload } from '../../../../lib/groupTools';
import { GroupRelayPayload } from '../../../../types';

interface GroupRelayModalProps {
  isOpen: boolean;
  onClose: () => void;
  creator: { id: string; name: string; avatar?: string };
  onSubmit: (payload: GroupRelayPayload) => void;
}

export const GroupRelayModal: React.FC<GroupRelayModalProps> = ({
  isOpen,
  onClose,
  creator,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [deadlineHours, setDeadlineHours] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const deadline = deadlineHours > 0 ? Date.now() + deadlineHours * 3600 * 1000 : undefined;
      const payload = createGroupRelayPayload({
        title,
        description,
        allowDuplicate,
        deadline,
        initialMember: initialContent.trim() ? creator : undefined,
        initialContent,
      });
      onSubmit(payload);
      setTitle('');
      setDescription('');
      setInitialContent('');
      setErrorMsg(null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '创建群接龙失败');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="wx-modal-card w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-2xl space-y-3 text-xs"
      >
        <div className="wx-divider flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
            <ListOrdered className="w-4 h-4" />
            <span>发起群接龙</span>
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
          <label className="wx-secondary-text block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">
            接龙主题 <span className="text-rose-500">*</span>
          </label>
          <StableTextInput
            type="text"
            value={title}
            onValueChange={setTitle}
            placeholder="例如：周末喝奶茶接龙 / 今日打卡接龙"
            className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="wx-secondary-text block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">
            补充说明（可选）
          </label>
          <StableTextarea
            rows={2}
            value={description}
            onValueChange={setDescription}
            placeholder="补充接龙规则或注意事项..."
            className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="wx-secondary-text block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">
            由我填报第 1 条（可选）
          </label>
          <StableTextInput
            type="text"
            value={initialContent}
            onValueChange={setInitialContent}
            placeholder="不填则发起空白接龙等待成员参与"
            className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">
            允许同一成员重复接龙
          </span>
          <button
            type="button"
            onClick={() => setAllowDuplicate((v) => !v)}
            className={`w-10 h-5 rounded-full transition relative cursor-pointer ${
              allowDuplicate ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all ${
                allowDuplicate ? 'right-1' : 'left-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">
            截止时间
          </span>
          <div className="flex gap-1">
            {[
              { label: '不限', hours: 0 },
              { label: '1小时', hours: 1 },
              { label: '6小时', hours: 6 },
              { label: '24小时', hours: 24 },
            ].map((opt) => (
              <button
                key={opt.hours}
                type="button"
                onClick={() => setDeadlineHours(opt.hours)}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border ${
                  deadlineHours === opt.hours
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            className="wx-btn-primary flex-1 min-h-[40px] rounded-xl bg-[#07C160] hover:bg-[#06ad56] text-white font-semibold cursor-pointer"
          >
            发布接龙
          </button>
        </div>
      </form>
    </div>
  );
};
