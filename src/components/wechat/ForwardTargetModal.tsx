import React, { useMemo, useState } from 'react';
import { Check, Loader2, Search, Send, Users, X } from 'lucide-react';
import { AiCharacter, GroupChat, UserProfile } from '../../types';
import { DEFAULT_AI_AVATAR } from '../../lib/storage';
import { ForwardTargetDescriptor } from '../../lib/forward/forwardBundleService';
import { GroupAvatar } from '../apps/group/GroupAvatar';

interface ForwardTargetModalProps {
  isOpen: boolean;
  mode: 'merged' | 'individual';
  selectedMessageCount: number;
  characters: AiCharacter[];
  groupChats: GroupChat[];
  userProfile: UserProfile;
  onClose: () => void;
  onConfirm: (targets: ForwardTargetDescriptor[]) => Promise<void>;
}

export const ForwardTargetModal: React.FC<ForwardTargetModalProps> = ({
  isOpen,
  mode,
  selectedMessageCount,
  characters,
  groupChats,
  userProfile,
  onClose,
  onConfirm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groupChats;
    return groupChats.filter((g) => g.name.toLowerCase().includes(normalizedQuery));
  }, [groupChats, normalizedQuery]);

  const filteredCharacters = useMemo(() => {
    if (!normalizedQuery) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(normalizedQuery) ||
        (c.wxid || '').toLowerCase().includes(normalizedQuery)
    );
  }, [characters, normalizedQuery]);

  if (!isOpen) return null;

  const makeKey = (type: 'private' | 'group', id: string) => `${type}:${id}`;

  const toggleTarget = (type: 'private' | 'group', id: string) => {
    if (isSubmitting) return;
    const key = makeKey(type, id);
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleConfirm = async () => {
    if (isSubmitting || selectedKeys.length === 0) return;

    const descriptors: ForwardTargetDescriptor[] = [];
    for (const key of selectedKeys) {
      if (key.startsWith('private:')) {
        const id = key.slice('private:'.length);
        const char = characters.find((c) => c.id === id);
        if (char) {
          descriptors.push({ targetType: 'private', targetId: char.id, targetName: char.name });
        }
      } else if (key.startsWith('group:')) {
        const id = key.slice('group:'.length);
        const grp = groupChats.find((g) => g.id === id);
        if (grp) {
          descriptors.push({ targetType: 'group', targetId: grp.id, targetName: grp.name });
        }
      }
    }

    if (descriptors.length === 0) return;

    setIsSubmitting(true);
    try {
      await onConfirm(descriptors);
      setSelectedKeys([]);
      setSearchQuery('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="wx-modal-card w-full max-w-sm max-h-[82vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="wx-divider px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="wx-primary-text text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {mode === 'merged' ? '合并转发聊天记录' : '逐条转发消息'}
            </h3>
            <p className="wx-muted-text text-[10px] text-zinc-400">
              已选 {selectedMessageCount} 条消息 · 选择一个或多个目标会话
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="wx-muted-text p-1 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3.5 py-2 border-b border-zinc-200/70 dark:border-zinc-800/80 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索联系人或群聊..."
              className="wx-search-input w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Targets list */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
          {filteredGroups.length > 0 && (
            <div className="space-y-1">
              <div className="wx-muted-text px-2 text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span>群聊 ({filteredGroups.length})</span>
              </div>
              {filteredGroups.map((group) => {
                const key = makeKey('group', group.id);
                const checked = selectedKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTarget('group', group.id)}
                    className={`wx-dropdown-item w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left transition cursor-pointer ${
                      checked
                        ? 'bg-emerald-500/12 border border-emerald-500/35'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                        checked
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3" />}
                    </div>
                    <GroupAvatar
                      members={group.members}
                      avatarMode={group.avatarMode}
                      customAvatar={group.customAvatar}
                      legacyAvatar={group.avatar}
                      allCharacters={characters}
                      userProfile={userProfile}
                      size={32}
                      alt={group.name}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="wx-primary-text text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {group.name}
                      </div>
                      <div className="wx-muted-text text-[10px] text-zinc-400">
                        群成员 {group.members.length} 人
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filteredCharacters.length > 0 && (
            <div className="space-y-1">
              <div className="wx-muted-text px-2 text-[10px] font-bold text-zinc-400">
                私聊好友 ({filteredCharacters.length})
              </div>
              {filteredCharacters.map((char) => {
                const key = makeKey('private', char.id);
                const checked = selectedKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTarget('private', char.id)}
                    className={`wx-dropdown-item w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left transition cursor-pointer ${
                      checked
                        ? 'bg-emerald-500/12 border border-emerald-500/35'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                        checked
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3" />}
                    </div>
                    <img
                      src={char.avatar || DEFAULT_AI_AVATAR}
                      alt={char.name}
                      className="wx-avatar w-8 h-8 rounded-xl object-cover border border-black/10 dark:border-white/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="wx-primary-text text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {char.name}
                      </div>
                      {char.relationship && (
                        <div className="wx-muted-text text-[10px] text-zinc-400 truncate">
                          {char.relationship}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filteredGroups.length === 0 && filteredCharacters.length === 0 && (
            <div className="py-10 text-center text-xs text-zinc-400">
              未找到匹配的联系人或群聊
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="wx-divider px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="wx-btn-secondary px-3.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSubmitting || selectedKeys.length === 0}
            onClick={() => void handleConfirm()}
            className="wx-btn-primary px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>
              {isSubmitting
                ? '发送中...'
                : selectedKeys.length > 0
                ? `发送 (${selectedKeys.length})`
                : '发送'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
