import React from 'react';
import { User, Sparkles, Check, ArrowRight, Lock } from 'lucide-react';
import { AiCharacter } from '../../types';

interface OfflineAiSelectorProps {
  characters: AiCharacter[];
  selectedCharacterId: string | null;
  onSelectCharacter: (char: AiCharacter) => void;
  onNext: () => void;
}

export const OfflineAiSelector: React.FC<OfflineAiSelectorProps> = ({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onNext,
}) => {
  return (
    <div className="w-full max-w-lg mx-auto space-y-4 text-zinc-100">
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          步骤 1/2：选择进行线下相处的 AI 角色
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">直接继承该 AI 已有的全部人设、长期记忆与聊天背景</p>
      </div>

      {/* Character Grid / List */}
      <div className="grid grid-cols-1 gap-2.5 max-h-[55vh] overflow-y-auto pr-1">
        {characters.map((char) => {
          const isSelected = selectedCharacterId === char.id;
          return (
            <div
              key={char.id}
              onClick={() => onSelectCharacter(char)}
              className={`p-3.5 rounded-2xl border transition cursor-pointer select-none flex items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-gradient-to-r from-indigo-950/70 to-purple-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                  : 'bg-zinc-850/80 border-zinc-750 hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={char.avatar}
                  alt={char.name}
                  className="w-12 h-12 rounded-2xl object-cover border border-zinc-700 shrink-0 shadow-xs"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-zinc-100">{char.name}</h4>
                    {char.relationship && (
                      <span className="px-1.5 py-0.2 text-[9px] rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {char.relationship}
                      </span>
                    )}
                    {char.isLocked && (
                      <span className="px-1.5 py-0.2 text-[9px] rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> 已锁
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">{char.persona}</p>
                </div>
              </div>

              <div className="shrink-0">
                {isSelected ? (
                  <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-xs">
                    <Check className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border border-zinc-700" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Next Step Button */}
      <button
        onClick={onNext}
        disabled={!selectedCharacterId}
        className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition"
      >
        <span>下一步：选择线下场景</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};
