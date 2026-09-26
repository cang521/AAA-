import React, { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, Trash2, Database, MoreHorizontal } from 'lucide-react';
import { AiCharacter } from '../../types';

interface ContactSwipeRowProps {
  char: AiCharacter;
  isOpen: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
  onOpenChat: (id: string) => void;
  onToggleLock: (char: AiCharacter) => void;
  onRequestDelete: (char: AiCharacter) => void;
  onOpenMemoryVault: (char: AiCharacter) => void;
}

const ACTION_WIDTH = 152; // Lock: 72px + Delete: 80px = 152px
const SWIPE_THRESHOLD = 60; // Dragging > 60px snaps open

export const ContactSwipeRow: React.FC<ContactSwipeRowProps> = ({
  char,
  isOpen,
  onOpen,
  onClose,
  onOpenChat,
  onToggleLock,
  onRequestDelete,
  onOpenMemoryVault,
}) => {
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number; startOffset: number }>({
    x: 0,
    y: 0,
    time: 0,
    startOffset: 0,
  });
  const gestureDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);

  // Sync dragOffset with external isOpen prop
  useEffect(() => {
    if (isOpen) {
      setDragOffset(-ACTION_WIDTH);
    } else {
      setDragOffset(0);
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      startOffset: isOpen ? -ACTION_WIDTH : 0,
    };
    gestureDirectionRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Determine gesture direction on initial movement
    if (!gestureDirectionRef.current) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
        gestureDirectionRef.current = 'vertical';
        setIsDragging(false);
        return; // Allow list vertical scrolling
      }
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
        gestureDirectionRef.current = 'horizontal';
      }
    }

    if (gestureDirectionRef.current === 'horizontal') {
      let nextOffset = touchStartRef.current.startOffset + deltaX;
      // Clamp bounds with rubber-band effect
      if (nextOffset < -ACTION_WIDTH) {
        nextOffset = -ACTION_WIDTH + (nextOffset + ACTION_WIDTH) * 0.2;
      } else if (nextOffset > 0) {
        nextOffset = nextOffset * 0.2;
      }
      setDragOffset(nextOffset);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (gestureDirectionRef.current === 'horizontal') {
      if (dragOffset < -SWIPE_THRESHOLD) {
        setDragOffset(-ACTION_WIDTH);
        onOpen(char.id);
      } else {
        setDragOffset(0);
        onClose();
      }
    }
    gestureDirectionRef.current = null;
  };

  const handleContentClick = (e: React.MouseEvent) => {
    // If row is currently open, clicking content snaps it shut
    if (isOpen) {
      e.stopPropagation();
      onClose();
      return;
    }
    // If user dragged horizontally, prevent accidental click
    if (Math.abs(dragOffset) > 10) {
      return;
    }
    onOpenChat(char.id);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-750/80 shadow-xs select-none my-1">
      {/* Action Layer (Bottom Layer - fixed behind content layer at right edge) */}
      <div
        className={`absolute right-0 top-0 bottom-0 flex items-center z-0 h-full select-none transition-opacity duration-150 ${
          dragOffset < 0 || isOpen ? 'opacity-100 pointer-events-auto visible' : 'opacity-0 pointer-events-none invisible'
        }`}
        style={{ width: `${ACTION_WIDTH}px` }}
      >
        {/* Lock / Unlock Button */}
        {char.isLocked ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(char);
              onClose();
            }}
            className="w-[72px] h-full bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs flex flex-col items-center justify-center gap-1 active:opacity-90 cursor-pointer transition-colors shrink-0"
          >
            <Unlock className="w-4 h-4" />
            <span>解锁</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(char);
              onClose();
            }}
            className="w-[72px] h-full bg-zinc-700 hover:bg-zinc-650 text-amber-300 font-medium text-xs flex flex-col items-center justify-center gap-1 active:opacity-90 cursor-pointer transition-colors shrink-0"
          >
            <Lock className="w-4 h-4" />
            <span>锁定</span>
          </button>
        )}

        {/* Delete Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (char.isLocked) {
              alert(`【联系人已锁定】\n"${char.name}" 当前已启用锁定保护，防止误删。\n如需删除，请先点击“解锁”。`);
              return;
            }
            onRequestDelete(char);
            onClose();
          }}
          disabled={char.isLocked}
          className={`w-[80px] h-full font-medium text-xs flex flex-col items-center justify-center gap-1 transition-colors shrink-0 ${
            char.isLocked
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-l border-zinc-700/80'
              : 'bg-rose-600 hover:bg-rose-500 text-white active:opacity-90 cursor-pointer'
          }`}
          title={char.isLocked ? '该联系人已锁定，请先解除锁定' : '删除联系人'}
        >
          <Trash2 className="w-4 h-4" />
          <span>{char.isLocked ? '防误删' : '删除'}</span>
        </button>
      </div>

      {/* Content Layer (Top Layer - z-index: 10, completely opaque bg-zinc-800) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
        className="relative z-10 w-full bg-zinc-800 p-3 flex items-center gap-3 cursor-pointer select-none transition-colors hover:bg-zinc-750/90"
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <img
          src={char.avatar}
          alt=""
          className="w-12 h-12 rounded-2xl object-cover border border-zinc-700 shrink-0 shadow-xs pointer-events-none"
        />

        <div className="flex-1 min-w-0 pointer-events-none">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-semibold text-sm text-zinc-100">{char.name}</h4>
            <span className="text-[10px] text-zinc-500 font-mono">({char.wxid})</span>
            {char.isCustom ? (
              <span className="px-1.5 py-0.2 text-[9px] rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                自定义
              </span>
            ) : (
              <span className="px-1.5 py-0.2 text-[9px] rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                系统
              </span>
            )}
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
          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{char.persona}</p>
          {char.personality && (
            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
              性格: {char.personality}
            </p>
          )}
        </div>

        {/* Database / Memory Vault Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMemoryVault(char);
          }}
          className="p-1.5 rounded-xl bg-zinc-850 hover:bg-zinc-700 text-emerald-400 hover:text-emerald-300 transition cursor-pointer shrink-0 z-20"
          title="进入该 AI 专属独立记忆空间"
        >
          <Database className="w-3.5 h-3.5" />
        </button>

        {/* Action Toggle Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              onClose();
            } else {
              onOpen(char.id);
            }
          }}
          className="p-1 text-zinc-400 hover:text-white cursor-pointer shrink-0 z-20 rounded-lg hover:bg-zinc-700/50"
          title="展开/收起快捷操作"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
