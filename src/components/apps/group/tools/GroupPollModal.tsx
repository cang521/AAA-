import React, { useState } from 'react';
import { X, BarChart3, Plus, Trash2 } from 'lucide-react';
import { StableTextInput } from '../../../common/StableTextInput';
import { createGroupPollPayload } from '../../../../lib/groupTools';
import { GroupPollPayload } from '../../../../types';

interface GroupPollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: GroupPollPayload) => void;
}

export const GroupPollModal: React.FC<GroupPollModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiSelect, setMultiSelect] = useState(false);
  const [maxSelections, setMaxSelections] = useState(2);
  const [anonymous, setAnonymous] = useState(false);
  const [allowChange, setAllowChange] = useState(true);
  const [deadlineHours, setDeadlineHours] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const updateOption = (idx: number, val: string) => {
    setOptions((prev) => prev.map((item, i) => (i === idx ? val : item)));
  };

  const handleAddOption = () => {
    if (options.length >= 10) return;
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const deadline = deadlineHours > 0 ? Date.now() + deadlineHours * 3600 * 1000 : undefined;
      const payload = createGroupPollPayload({
        title,
        options,
        multiSelect,
        maxSelections: multiSelect ? maxSelections : 1,
        anonymous,
        allowChange,
        deadline,
      });
      onSubmit(payload);
      setTitle('');
      setOptions(['', '']);
      setErrorMsg(null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '发起投票失败');
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
        className="wx-modal-card w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 shadow-2xl space-y-3 text-xs max-h-[86vh] overflow-y-auto"
      >
        <div className="wx-divider flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
            <BarChart3 className="w-4 h-4" />
            <span>发起群投票</span>
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
            投票主题 <span className="text-rose-500">*</span>
          </label>
          <StableTextInput
            type="text"
            value={title}
            onValueChange={setTitle}
            placeholder="例如：这周群聚去哪里吃？"
            className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="wx-secondary-text text-zinc-600 dark:text-zinc-400 font-medium">
              投票选项 ({options.length}/10)
            </label>
            {options.length < 10 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="wx-green-text flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加选项</span>
              </button>
            )}
          </div>
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="wx-muted-text w-5 text-center font-mono text-[11px] text-zinc-400">
                {idx + 1}.
              </span>
              <StableTextInput
                type="text"
                value={opt}
                onValueChange={(val) => updateOption(idx, val)}
                placeholder={`选项 ${idx + 1}`}
                className="wx-modal-input flex-1 px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => handleRemoveOption(idx)}
                  className="p-1.5 text-zinc-400 hover:text-rose-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2.5 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">允许多选</span>
            <button
              type="button"
              onClick={() => setMultiSelect((v) => !v)}
              className={`w-10 h-5 rounded-full transition relative cursor-pointer ${
                multiSelect ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all ${
                  multiSelect ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          {multiSelect && (
            <div className="flex items-center justify-between">
              <span className="wx-secondary-text text-zinc-600 dark:text-zinc-400">最多可选几项</span>
              <select
                value={maxSelections}
                onChange={(e) => setMaxSelections(Number(e.target.value))}
                className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100"
              >
                {Array.from({ length: Math.max(1, options.length - 1) }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    最多 {n} 项
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">匿名投票（隐藏投票人昵称）</span>
            <button
              type="button"
              onClick={() => setAnonymous((v) => !v)}
              className={`w-10 h-5 rounded-full transition relative cursor-pointer ${
                anonymous ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all ${
                  anonymous ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">允许投票后改选</span>
            <button
              type="button"
              onClick={() => setAllowChange((v) => !v)}
              className={`w-10 h-5 rounded-full transition relative cursor-pointer ${
                allowChange ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all ${
                  allowChange ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 font-medium">截止时间</span>
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
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
            className="wx-btn-primary flex-1 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
          >
            发布投票
          </button>
        </div>
      </form>
    </div>
  );
};
