import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Users,
  Check,
  Search,
  Image as ImageIcon,
  Bot,
  User,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { AiCharacter, UserProfile, GroupChat, GroupMember } from '../../../types';
import { generateGroupInviteCode, DEFAULT_USER_AVATAR, DEFAULT_AI_AVATAR } from '../../../lib/storage';
import { registerGroupOnServer } from '../../../lib/groupService';
import { StableTextInput } from '../../common/StableTextInput';
import { StableTextarea } from '../../common/StableTextarea';
import { GroupAvatar } from './GroupAvatar';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: AiCharacter[];
  userProfile: UserProfile;
  onCreateGroup: (newGroup: GroupChat) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  characters,
  userProfile,
  onCreateGroup,
}) => {
  const [step, setStep] = useState<'select_members' | 'group_details'>('select_members');
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(() => {
    // Select first 2 characters by default
    return characters.slice(0, 2).map((c) => c.id);
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Group Details Form (default avatarMode is 'auto' mosaic)
  const [groupName, setGroupName] = useState('');
  const [avatarMode, setAvatarMode] = useState<'auto' | 'custom'>('auto');
  const [customAvatar, setCustomAvatar] = useState('');
  const [groupNotice, setGroupNotice] = useState('欢迎加入群聊！大家可以自由交流与讨论~');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live member preview list matching final creation order
  const previewMembers = useMemo<GroupMember[]>(() => {
    const selectedChars = characters.filter((c) => selectedCharacterIds.includes(c.id));
    return [
      {
        id: 'user_main',
        name: `${userProfile.name || '小清'} (我)`,
        avatar: userProfile.avatar || DEFAULT_USER_AVATAR,
        memberType: 'human',
        role: 'owner',
        joinedAt: 0,
        wxid: userProfile.wxid || 'xiaoqing',
      },
      ...selectedChars.map((c, index) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        memberType: (c.isCustom ? 'ai' : 'npc') as 'ai' | 'npc',
        role: (index === 0 ? 'admin' : 'member') as 'admin' | 'member',
        joinedAt: 0,
        wxid: c.wxid,
        characterId: c.id,
      })),
    ];
  }, [characters, selectedCharacterIds, userProfile]);

  if (!isOpen) return null;

  const filteredCharacters = characters.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.persona && c.persona.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.tags && c.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const toggleSelectCharacter = (id: string) => {
    setSelectedCharacterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleProceedToDetails = () => {
    if (selectedCharacterIds.length === 0) return;
    if (!groupName) {
      const selectedNames = characters
        .filter((c) => selectedCharacterIds.includes(c.id))
        .map((c) => c.name)
        .slice(0, 3)
        .join('、');
      setGroupName(`${userProfile.name || '我'}、${selectedNames}的群聊`);
    }
    setStep('group_details');
  };

  const handleCustomFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.trim()) {
        setCustomAvatar(reader.result);
        setAvatarMode('custom');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleFinishCreate = () => {
    const finalGroupName = groupName.trim() || `${userProfile.name || '用户'}的群聊`;
    const selectedChars = characters.filter((c) => selectedCharacterIds.includes(c.id));

    // Build unified GroupMember array
    const members: GroupMember[] = [
      // 1. Current user (Human Owner)
      {
        id: 'user_main',
        name: `${userProfile.name || '小清'} (我)`,
        avatar: userProfile.avatar || DEFAULT_USER_AVATAR,
        memberType: 'human',
        role: 'owner',
        joinedAt: Date.now(),
        wxid: userProfile.wxid || 'xiaoqing',
      },
      // 2. Selected AI Members
      ...selectedChars.map((c, index) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        memberType: (c.isCustom ? 'ai' : 'npc') as 'ai' | 'npc',
        role: (index === 0 ? 'admin' : 'member') as 'admin' | 'member',
        joinedAt: Date.now(),
        wxid: c.wxid,
        characterId: c.id,
        customPersona: c.persona,
        customPersonality: c.personality || '善解人意，友好交流',
        customModelName: c.modelConfig?.modelName,
        memories: [...(c.memories || [])],
      })),
    ];

    const trimmedCustom = customAvatar.trim();
    const effectiveMode: 'auto' | 'custom' =
      avatarMode === 'custom' && trimmedCustom ? 'custom' : 'auto';

    const now = Date.now();
    const newGroup: GroupChat = {
      id: 'group_' + now + '_' + Math.random().toString(36).slice(2, 6),
      name: finalGroupName,
      avatar: effectiveMode === 'custom' ? trimmedCustom : '',
      avatarMode: effectiveMode,
      customAvatar: trimmedCustom || undefined,
      notice: groupNotice.trim(),
      ownerId: 'user_main',
      members,
      messages: [
        {
          id: 'gmsg_' + now + '_welcome',
          groupId: '', // will be set
          senderId: 'user_main',
          senderName: `${userProfile.name || '小清'}`,
          senderAvatar: userProfile.avatar || DEFAULT_USER_AVATAR,
          senderType: 'human',
          text: `🎉 创建了群聊 “${finalGroupName}”`,
          timestamp: now,
        },
        {
          id: 'gmsg_' + (now + 1) + '_greet',
          groupId: '',
          senderId: selectedChars[0]?.id || 'char_ai',
          senderName: selectedChars[0]?.name || 'AI成员',
          senderAvatar: selectedChars[0]?.avatar || DEFAULT_AI_AVATAR,
          senderType: 'ai',
          text: `大家好呀！很高兴和大家一起进群交流~ ✨`,
          timestamp: now + 500,
        },
      ],
      createdAt: now,
      updatedAt: now,
      inviteCode: generateGroupInviteCode(),
      inviteCodeActive: true,
      joinRequests: [],
    };

    // Update message groupIds
    newGroup.messages = newGroup.messages.map((m) => ({ ...m, groupId: newGroup.id }));

    // Sync/register to server registry for cross-device support
    registerGroupOnServer(newGroup);

    onCreateGroup(newGroup);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="wx-modal-card w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="wx-modal-header px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-850">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center wx-green-text">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="wx-primary-text text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {step === 'select_members' ? '发起群聊 · 选择成员' : '完善群聊信息'}
              </h3>
              <p className="wx-muted-text text-[10px] text-zinc-500">
                {step === 'select_members'
                  ? `已选 ${selectedCharacterIds.length} 位 AI 伙伴 + 1 位真人(我)`
                  : '设置群名称与群头像'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="wx-header-action wx-muted-text w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'select_members' ? (
          <>
            {/* Search Input */}
            <div className="wx-divider p-3 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400 wx-muted-text" />
                <StableTextInput
                  type="text"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="搜索 AI 伙伴名称、人设、标签..."
                  className="wx-modal-input w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Live Composite Group Avatar Preview Bar */}
            <div className="px-3 pt-2.5">
              <div className="wx-sub-card p-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5">
                <GroupAvatar
                  members={previewMembers}
                  avatarMode={avatarMode}
                  customAvatar={customAvatar}
                  allCharacters={characters}
                  userProfile={userProfile}
                  size={40}
                  alt="群头像实时预览"
                  className="border border-zinc-300/70 dark:border-zinc-700"
                />
                <div className="min-w-0 flex-1">
                  <div className="wx-primary-text text-[11px] font-bold text-zinc-800 dark:text-zinc-200">
                    群头像实时预览（{previewMembers.length}人）
                  </div>
                  <div className="wx-muted-text text-[10px] text-zinc-400 truncate">
                    默认根据群成员头像自动组合九宫格，勾选成员实时更新
                  </div>
                </div>
              </div>
            </div>

            {/* Current User Card (Always included) */}
            <div className="px-3 pt-2">
              <div className="p-2.5 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative">
                    <img
                      src={userProfile.avatar || DEFAULT_USER_AVATAR}
                      alt={userProfile.name}
                      className="w-8 h-8 rounded-full object-cover border border-emerald-400/40"
                    />
                    <span className="absolute -bottom-1 -right-1 px-1 rounded-full bg-emerald-500 text-[8px] font-bold text-white leading-none py-0.5">
                      群主
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <span>{userProfile.name || '小清'} (我)</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[9px] font-semibold">
                        真人用户
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">微信号: {userProfile.wxid || 'xiaoqing'}</div>
                  </div>
                </div>
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              </div>
            </div>

            {/* AI Members List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
              <div className="text-[10px] font-bold text-zinc-400 px-1 pt-1 flex items-center justify-between">
                <span>选择加入群聊的 AI 好友 / NPC ({filteredCharacters.length})</span>
                <button
                  onClick={() => {
                    if (selectedCharacterIds.length === characters.length) {
                      setSelectedCharacterIds([]);
                    } else {
                      setSelectedCharacterIds(characters.map((c) => c.id));
                    }
                  }}
                  className="text-emerald-500 hover:text-emerald-600 font-semibold"
                >
                  {selectedCharacterIds.length === characters.length ? '取消全选' : '全选'}
                </button>
              </div>

              {filteredCharacters.map((char) => {
                const isSelected = selectedCharacterIds.includes(char.id);
                return (
                  <div
                    key={char.id}
                    onClick={() => toggleSelectCharacter(char.id)}
                    className={`wx-sub-card p-2.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-500/50 shadow-sm'
                        : 'bg-zinc-50/50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={char.avatar}
                        alt={char.name}
                        className="wx-avatar w-9 h-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="wx-primary-text font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                            {char.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded-md text-[9px] font-semibold shrink-0 ${
                              char.isCustom
                                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                            }`}
                          >
                            {char.isCustom ? '自定义AI' : '系统NPC'}
                          </span>
                        </div>
                        <p className="wx-secondary-text text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                          {char.persona || '暂无人设'}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition shrink-0 ml-2 ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-zinc-300 dark:border-zinc-600 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="wx-modal-footer p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-850">
              <span className="wx-secondary-text text-[11px] text-zinc-500">
                已选中 <strong className="wx-green-text text-emerald-600 dark:text-emerald-400">{selectedCharacterIds.length}</strong> 位 AI
              </span>
              <button
                disabled={selectedCharacterIds.length === 0}
                onClick={handleProceedToDetails}
                className="wx-btn-primary px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs shadow-md transition"
              >
                下一步 ({selectedCharacterIds.length + 1}人)
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Group Details */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Group Avatar Selection */}
              <div className="space-y-2.5">
                <label className="wx-primary-text text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-500 wx-green-text" />
                    <span>群头像</span>
                  </span>
                  <span className="wx-muted-text text-[10px] font-normal text-zinc-400">
                    {avatarMode === 'custom' && customAvatar.trim() ? '当前：自定义群头像' : '当前：自动组合成员头像'}
                  </span>
                </label>

                <div className="flex items-center gap-3">
                  <GroupAvatar
                    members={previewMembers}
                    avatarMode={avatarMode}
                    customAvatar={customAvatar}
                    allCharacters={characters}
                    userProfile={userProfile}
                    size={56}
                    alt="Group Avatar Preview"
                    className="border border-zinc-300/70 dark:border-zinc-700 shadow-sm"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="wx-btn-secondary px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-[11px] font-semibold flex items-center gap-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                      >
                        <Upload className="w-3 h-3" />
                        <span>上传自定义头像</span>
                      </button>
                      {avatarMode === 'custom' && (
                        <button
                          type="button"
                          onClick={() => setAvatarMode('auto')}
                          className="wx-btn-secondary px-2.5 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-500/20 transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>恢复自动组合</span>
                        </button>
                      )}
                    </div>
                    <p className="wx-muted-text text-[10px] text-zinc-400 leading-snug">
                      默认使用群成员头像自动九宫格拼图，也可上传或粘贴自定义图片。
                    </p>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCustomFileUpload}
                  className="hidden"
                />

                <StableTextInput
                  type="text"
                  value={customAvatar}
                  onValueChange={(nextVal) => {
                    setCustomAvatar(nextVal);
                    if (nextVal.trim()) {
                      setAvatarMode('custom');
                    } else {
                      setAvatarMode('auto');
                    }
                  }}
                  placeholder="可选：粘贴自定义头像图片 URL（留空则保持自动组合）"
                  className="wx-modal-input w-full px-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Group Name */}
              <div className="space-y-1.5">
                <label className="wx-primary-text text-[11px] font-bold text-zinc-700 dark:text-zinc-300">群聊名称</label>
                <StableTextInput
                  type="text"
                  value={groupName}
                  onValueChange={setGroupName}
                  placeholder="给群聊起个响亮的名字..."
                  maxLength={30}
                  className="wx-modal-input w-full px-3 py-2 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                />
              </div>

              {/* Group Notice */}
              <div className="space-y-1.5">
                <label className="wx-primary-text text-[11px] font-bold text-zinc-700 dark:text-zinc-300">群公告 (初始话题)</label>
                <StableTextarea
                  value={groupNotice}
                  onValueChange={setGroupNotice}
                  placeholder="输入群公告或开场讨论主题..."
                  rows={2}
                  className="wx-modal-input w-full px-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              {/* Summary of members */}
              <div className="wx-sub-card p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-750 space-y-2">
                <div className="wx-primary-text flex items-center justify-between font-bold text-[11px] text-zinc-700 dark:text-zinc-300">
                  <span>群成员总计 ({selectedCharacterIds.length + 1}人)</span>
                  <span className="wx-green-text text-emerald-500 text-[10px]">真人1人 · AI {selectedCharacterIds.length}人</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] flex items-center gap-1">
                    <User className="w-2.5 h-2.5" />
                    <span>{userProfile.name || '小清'} (群主)</span>
                  </span>
                  {characters
                    .filter((c) => selectedCharacterIds.includes(c.id))
                    .map((c) => (
                      <span
                        key={c.id}
                        className="wx-card px-2 py-0.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[10px] flex items-center gap-1"
                      >
                        <Bot className="w-2.5 h-2.5 text-purple-400" />
                        <span>{c.name}</span>
                      </span>
                    ))}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="wx-modal-footer p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-850">
              <button
                onClick={() => setStep('select_members')}
                className="wx-btn-secondary px-3.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                返回修改成员
              </button>
              <button
                onClick={handleFinishCreate}
                className="wx-btn-primary px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md transition"
              >
                立即创建群聊 ✨
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

