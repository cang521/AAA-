import React from 'react';
import { Sparkles, MapPin, ChevronRight, Clock, Heart } from 'lucide-react';

interface OfflineShareCardProps {
  sessionId: string;
  sceneName: string;
  characterName: string;
  characterAvatar?: string;
  dateStr: string;
  summaryText?: string;
  onOpenDetail: (sessionId: string) => void;
}

export const OfflineShareCard: React.FC<OfflineShareCardProps> = ({
  sessionId,
  sceneName,
  characterName,
  characterAvatar,
  dateStr,
  summaryText,
  onOpenDetail,
}) => {
  return (
    <div
      onClick={() => onOpenDetail(sessionId)}
      className="w-full max-w-[260px] my-1.5 p-3.5 rounded-2xl bg-gradient-to-br from-indigo-950/90 via-zinc-900 to-purple-950/80 border border-indigo-500/40 text-zinc-100 shadow-md hover:border-indigo-400 transition cursor-pointer select-none space-y-2.5 active:scale-98"
    >
      {/* Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span>线下经历回忆</span>
        </div>
        <span className="text-[10px] text-zinc-400 font-mono">{dateStr}</span>
      </div>

      {/* Main Content */}
      <div className="space-y-1">
        <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
          <span>{sceneName}</span>
        </h4>
        <p className="text-[11px] text-indigo-200/90">我和 {characterName} 的共同专属剧情</p>
      </div>

      {summaryText && (
        <p className="text-[10px] text-zinc-300 line-clamp-2 leading-relaxed bg-zinc-950/50 p-2 rounded-xl border border-zinc-800/80">
          “{summaryText}”
        </p>
      )}

      {/* Footer Link */}
      <div className="flex items-center justify-between text-[10px] text-indigo-400 font-medium pt-1 border-t border-zinc-800">
        <span className="flex items-center gap-1">
          <Heart className="w-3 h-3 text-pink-400 fill-pink-400/30" /> 点击重温完整过程
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-indigo-300" />
      </div>
    </div>
  );
};
