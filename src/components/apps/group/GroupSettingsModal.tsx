import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Users,
  Plus,
  Minus,
  Settings,
  KeyRound,
  Copy,
  Check,
  Shield,
  Bot,
  User,
  Trash2,
  Bell,
  Sparkles,
  Info,
  Edit2,
  Save,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Upload,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react';
import { GroupChat, GroupMember, GroupJoinRequest, AiCharacter, UserProfile } from '../../../types';
import { DEFAULT_AI_AVATAR } from '../../../lib/storage';
import { generateGroupInviteCode } from '../../../lib/storage';
import { syncGroupToServer } from '../../../lib/groupService';
import { resolveGroupAvatarState } from '../../../lib/groupAvatar';
import { EditGroupAiMemberModal } from './EditGroupAiMemberModal';
import { GroupAvatar } from './GroupAvatar';
import { StableTextInput } from '../../common/StableTextInput';
import { StableTextarea } from '../../common/StableTextarea';

interface GroupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: GroupChat;
  allCharacters: AiCharacter[];
  userProfile: UserProfile;
  onUpdateGroup: (updatedGroup: GroupChat) => void;
  onDeleteGroup: (groupId: string) => void;
  onClearHistory: (groupId: string) => void;
}

export const GroupSettingsModal: React.FC<GroupSettingsModalProps> = ({
  isOpen,
  onClose,
  group,
  allCharacters,
  userProfile,
  onUpdateGroup,
  onDeleteGroup,
  onClearHistory,
}) => {
  const resolvedAvatarState = resolveGroupAvatarState(group);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);
  const [noticeInput, setNoticeInput] = useState(group.notice || '');
  const [avatarInput, setAvatarInput] = useState(
    resolvedAvatarState.mode === 'custom' ? resolvedAvatarState.customAvatar || '' : ''
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sub-modals & states
  const [selectedMemberToEdit, setSelectedMemberToEdit] = useState<GroupMember | null>(null);
  const [showAddMemberSelector, setShowAddMemberSelector] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'requests' | 'network_notice'>('info');

  useEffect(() => {
    const nextState = resolveGroupAvatarState(group);
    setNameInput(group.name);
    setNoticeInput(group.notice || '');
    setAvatarInput(nextState.mode === 'custom' ? nextState.customAvatar || '' : '');
  }, [group.id, group.name, group.notice, group.avatar, group.avatarMode, group.customAvatar]);

  if (!isOpen) return null;

  const isOwner = group.ownerId === 'user_main';
  const pendingRequests = (group.joinRequests || []).filter((r) => r.status === 'pending');

  const handleUpdateGroupAndSync = (updatedGroup: GroupChat) => {
    onUpdateGroup(updatedGroup);
    syncGroupToServer(updatedGroup);
  };

  const handleUploadCustomAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.trim()) {
        const dataUrl = reader.result;
        setAvatarInput(dataUrl);
        handleUpdateGroupAndSync({
          ...group,
          avatar: dataUrl,
          avatarMode: 'custom',
          customAvatar: dataUrl,
          updatedAt: Date.now(),
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRestoreAutoAvatar = () => {
    setAvatarInput('');
    handleUpdateGroupAndSync({
      ...group,
      avatar: '',
      avatarMode: 'auto',
      updatedAt: Date.now(),
    });
  };

  const handleSaveInfo = () => {
    const trimmedUrl = avatarInput.trim();
    const shouldUseCustom = Boolean(trimmedUrl);
    handleUpdateGroupAndSync({
      ...group,
      name: nameInput.trim() || group.name,
      notice: noticeInput.trim(),
      avatar: shouldUseCustom ? trimmedUrl : '',
      avatarMode: shouldUseCustom ? 'custom' : 'auto',
      customAvatar: shouldUseCustom ? trimmedUrl : group.customAvatar,
      updatedAt: Date.now(),
    });
    setIsEditingInfo(false);
  };

  const handleCopyInviteCode = () => {
    navigator.clipboard?.writeText(
      `【微信群聊邀请】诚邀您加入群聊 “${group.name}”！\n群邀请码：${group.inviteCode}\n打开应用在微信中点击“+” -> “输入群邀请码”即可加入。`
    );
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleRegenerateCode = () => {
    const newCode = generateGroupInviteCode();
    handleUpdateGroupAndSync({
      ...group,
      inviteCode: newCode,
      updatedAt: Date.now(),
    });
  };

  const handleToggleInviteCode = () => {
    handleUpdateGroupAndSync({
      ...group,
      inviteCodeActive: !group.inviteCodeActive,
      updatedAt: Date.now(),
    });
  };

  const handleApproveRequest = (request: GroupJoinRequest) => {
    // Add applicant as group member
    const newMember: GroupMember = {
      id: request.userId === 'user_main' ? 'user_' + Date.now() : request.userId,
      name: request.userName,
      avatar: request.userAvatar,
      memberType: 'human',
      role: 'member',
      joinedAt: Date.now(),
    };

    const updatedRequests = (group.joinRequests || []).map((r) =>
      r.id === request.id ? { ...r, status: 'approved' as const, reviewedAt: Date.now() } : r
    );

    const now = Date.now();
    const systemNoticeMsg = {
      id: 'gmsg_' + now + '_join',
      groupId: group.id,
      senderId: 'system',
      senderName: '系统消息',
      senderAvatar: DEFAULT_AI_AVATAR,
      senderType: 'human' as const,
      text: `🎉 欢迎新成员 “${request.userName}” 加入群聊！`,
      timestamp: now,
    };

    handleUpdateGroupAndSync({
      ...group,
      members: [...group.members, newMember],
      messages: [...group.messages, systemNoticeMsg],
      joinRequests: updatedRequests,
      updatedAt: now,
    });
  };

  const handleRejectRequest = (request: GroupJoinRequest) => {
    const updatedRequests = (group.joinRequests || []).map((r) =>
      r.id === request.id ? { ...r, status: 'rejected' as const, reviewedAt: Date.now() } : r
    );
    handleUpdateGroupAndSync({
      ...group,
      joinRequests: updatedRequests,
      updatedAt: Date.now(),
    });
  };

  const handleSaveMemberEdit = (updatedMember: GroupMember) => {
    const updatedMembers = group.members.map((m) => (m.id === updatedMember.id ? updatedMember : m));
    handleUpdateGroupAndSync({
      ...group,
      members: updatedMembers,
      updatedAt: Date.now(),
    });
  };

  const handleRemoveMember = (memberId: string) => {
    const targetMember = group.members.find((m) => m.id === memberId);
    const updatedMembers = group.members.filter((m) => m.id !== memberId);
    const now = Date.now();
    const systemNoticeMsg = {
      id: 'gmsg_' + now + '_leave',
      groupId: group.id,
      senderId: 'system',
      senderName: '系统消息',
      senderAvatar: DEFAULT_AI_AVATAR,
      senderType: 'human' as const,
      text: `“${targetMember?.name || '成员'}” 已离开群聊`,
      timestamp: now,
    };

    handleUpdateGroupAndSync({
      ...group,
      members: updatedMembers,
      messages: [...group.messages, systemNoticeMsg],
      updatedAt: now,
    });
  };

  const handleAddAiCharacterToGroup = (char: AiCharacter) => {
    if (group.members.some((m) => m.characterId === char.id || m.id === char.id)) {
      alert('该角色已在群聊中');
      return;
    }

    const newMember: GroupMember = {
      id: char.id,
      name: char.name,
      avatar: char.avatar,
      memberType: char.isCustom ? 'ai' : 'npc',
      role: 'member',
      joinedAt: Date.now(),
      wxid: char.wxid,
      characterId: char.id,
      customPersona: char.persona,
      customPersonality: char.personality,
      memories: [...(char.memories || [])],
    };

    const now = Date.now();
    const systemNoticeMsg = {
      id: 'gmsg_' + now + '_add',
      groupId: group.id,
      senderId: 'system',
      senderName: '系统消息',
      senderAvatar: DEFAULT_AI_AVATAR,
      senderType: 'human' as const,
      text: `“${userProfile.name || '小清'}” 邀请 “${char.name}” 加入了群聊`,
      timestamp: now,
    };

    handleUpdateGroupAndSync({
      ...group,
      members: [...group.members, newMember],
      messages: [...group.messages, systemNoticeMsg],
      updatedAt: now,
    });
    setShowAddMemberSelector(false);
  };

  // Available characters not yet in this group
  const availableCharactersToAdd = allCharacters.filter(
    (c) => !group.members.some((m) => m.characterId === c.id || m.id === c.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="wx-modal-card w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="wx-modal-header px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-850">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center wx-green-text">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="wx-primary-text text-sm font-bold text-zinc-900 dark:text-zinc-100">群聊信息与设置</h3>
              <p className="wx-muted-text text-[10px] text-zinc-400">共 {group.members.length} 位成员</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="wx-header-action wx-muted-text w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="wx-sub-card wx-divider flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-800/40 p-1">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'info'
                ? 'wx-card wx-primary-text bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'wx-secondary-text text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            群成员与设置
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
              activeTab === 'requests'
                ? 'wx-card wx-primary-text bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'wx-secondary-text text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <span>入群申请</span>
            {pendingRequests.length > 0 && (
              <span className="wx-unread-badge px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('network_notice')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
              activeTab === 'network_notice'
                ? 'wx-card wx-primary-text bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'wx-secondary-text text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Info className="w-3 h-3 text-blue-500" />
            <span>架构说明</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {activeTab === 'info' && (
            <>
              {/* Member Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="wx-primary-text text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-500 wx-green-text" />
                    <span>群成员 ({group.members.length})</span>
                  </span>
                  <span className="wx-muted-text text-[10px] text-zinc-400">点击 AI 成员可编辑专属人设与记忆</span>
                </div>

                <div className="wx-sub-card grid grid-cols-4 gap-2.5 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-750">
                  {group.members.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => {
                        if (member.memberType !== 'human') {
                          setSelectedMemberToEdit(member);
                        }
                      }}
                      className="flex flex-col items-center text-center cursor-pointer group"
                    >
                      <div className="relative">
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="wx-avatar w-11 h-11 rounded-2xl object-cover border border-zinc-200 dark:border-zinc-700 group-hover:scale-105 transition"
                        />
                        {member.role === 'owner' ? (
                          <span className="absolute -bottom-1 -right-1 px-1 rounded-full bg-amber-500 text-white text-[8px] font-bold">
                            群主
                          </span>
                        ) : member.memberType === 'human' ? (
                          <span className="absolute -bottom-1 -right-1 px-1 rounded-full bg-emerald-500 text-white text-[8px] font-bold">
                            真人
                          </span>
                        ) : (
                          <span className="absolute -bottom-1 -right-1 px-1 rounded-full bg-purple-500 text-white text-[8px] font-bold">
                            AI
                          </span>
                        )}
                      </div>
                      <span className="wx-primary-text text-[10px] font-bold text-zinc-800 dark:text-zinc-200 truncate w-14 mt-1">
                        {member.name}
                      </span>
                    </div>
                  ))}

                  {/* Add Member Button */}
                  <div
                    onClick={() => setShowAddMemberSelector(true)}
                    className="flex flex-col items-center text-center cursor-pointer group"
                  >
                    <div className="wx-divider w-11 h-11 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-500 hover:border-emerald-500 transition group-hover:scale-105">
                      <Plus className="w-5 h-5" />
                    </div>
                    <span className="wx-secondary-text text-[10px] text-zinc-500 mt-1">添加</span>
                  </div>
                </div>
              </div>

              {/* Add Member Dropdown/List Modal */}
              {showAddMemberSelector && (
                <div className="wx-sub-card p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 animate-in fade-in">
                  <div className="wx-primary-text flex items-center justify-between font-bold text-xs text-emerald-800 dark:text-emerald-300">
                    <span>邀请新的 AI 伙伴入群</span>
                    <button
                      onClick={() => setShowAddMemberSelector(false)}
                      className="wx-muted-text text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {availableCharactersToAdd.length === 0 ? (
                    <p className="wx-muted-text text-[10px] text-zinc-500">所有 AI 伙伴均已在群聊中</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {availableCharactersToAdd.map((char) => (
                        <div
                          key={char.id}
                          className="wx-card flex items-center justify-between p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={char.avatar}
                              alt={char.name}
                              className="wx-avatar w-7 h-7 rounded-full object-cover"
                            />
                            <span className="wx-primary-text font-bold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                              {char.name}
                            </span>
                          </div>
                          <button
                            onClick={() => handleAddAiCharacterToGroup(char)}
                            className="wx-btn-primary px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition"
                          >
                            添加进群
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Group Avatar Management Card */}
              <div className="wx-sub-card p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-750 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="wx-primary-text font-bold text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-500 wx-green-text" />
                    <span>群头像</span>
                  </span>
                  <span className="wx-muted-text text-[10px] text-zinc-400">
                    {resolvedAvatarState.mode === 'custom' ? '自定义群头像' : '自动组合（成员九宫格）'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <GroupAvatar
                    members={group.members}
                    avatarMode={group.avatarMode}
                    customAvatar={group.customAvatar}
                    legacyAvatar={group.avatar}
                    allCharacters={allCharacters}
                    userProfile={userProfile}
                    size={56}
                    alt={group.name}
                    className="border border-zinc-300/70 dark:border-zinc-700 shadow-xs"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="wx-btn-secondary px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-[11px] font-semibold flex items-center gap-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />
                        <span>上传自定义头像</span>
                      </button>
                      {resolvedAvatarState.mode === 'custom' && (
                        <button
                          type="button"
                          onClick={handleRestoreAutoAvatar}
                          className="wx-btn-secondary px-2.5 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-500/20 transition cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>恢复自动组合头像</span>
                        </button>
                      )}
                    </div>
                    <p className="wx-muted-text text-[10px] text-zinc-400 leading-snug">
                      {resolvedAvatarState.mode === 'custom'
                        ? '增减群成员不会覆盖当前自定义头像，点击“恢复自动组合头像”可切回九宫格拼图。'
                        : '增删群成员或修改成员头像时，群头像将实时自动同步更新。'}
                    </p>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadCustomAvatar}
                  className="hidden"
                />
              </div>

              {/* Group Info & Edit */}
              <div className="wx-sub-card p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-750 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="wx-primary-text font-bold text-xs text-zinc-800 dark:text-zinc-200">群聊基础信息</span>
                  <button
                    onClick={() => {
                      if (isEditingInfo) handleSaveInfo();
                      else setIsEditingInfo(true);
                    }}
                    className="wx-green-text text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"
                  >
                    {isEditingInfo ? (
                      <>
                        <Save className="w-3 h-3" />
                        <span>保存</span>
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-3 h-3" />
                        <span>编辑</span>
                      </>
                    )}
                  </button>
                </div>

                {isEditingInfo ? (
                  <div className="space-y-2">
                    <div>
                      <label className="wx-secondary-text text-[10px] text-zinc-400 block mb-1">群名称</label>
                      <StableTextInput
                        type="text"
                        value={nameInput}
                        onValueChange={setNameInput}
                        className="wx-modal-input w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-750 text-xs text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700"
                      />
                    </div>
                    <div>
                      <label className="wx-secondary-text text-[10px] text-zinc-400 block mb-1">自定义群头像 URL（留空恢复自动组合）</label>
                      <StableTextInput
                        type="text"
                        value={avatarInput}
                        onValueChange={setAvatarInput}
                        placeholder="留空则使用成员自动组合九宫格头像"
                        className="wx-modal-input w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-750 text-xs text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700"
                      />
                    </div>
                    <div>
                      <label className="wx-secondary-text text-[10px] text-zinc-400 block mb-1">群公告</label>
                      <StableTextarea
                        value={noticeInput}
                        onValueChange={setNoticeInput}
                        rows={2}
                        className="wx-modal-input w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-750 text-xs text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="wx-secondary-text text-zinc-500 text-[11px]">群名称</span>
                      <span className="wx-primary-text font-bold text-zinc-800 dark:text-zinc-200">{group.name}</span>
                    </div>
                    <div className="flex items-start justify-between">
                      <span className="wx-secondary-text text-zinc-500 text-[11px]">群公告</span>
                      <span className="wx-primary-text text-zinc-700 dark:text-zinc-300 text-[11px] max-w-[200px] text-right">
                        {group.notice || '未设置公告'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Invite Code & Real User Invitation */}
              <div className="wx-sub-card p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="wx-primary-text font-bold text-xs text-zinc-800 dark:text-zinc-200">群邀请码 (真人加入)</span>
                  </div>
                  <button
                    onClick={handleToggleInviteCode}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                      group.inviteCodeActive
                        ? 'wx-btn-primary bg-amber-500 text-white'
                        : 'wx-btn-secondary bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {group.inviteCodeActive ? '已开启' : '已关闭'}
                  </button>
                </div>

                <div className="wx-card flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-amber-500/30">
                  <span className="font-mono font-black text-sm tracking-wider text-amber-600 dark:text-amber-400">
                    {group.inviteCode}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleRegenerateCode}
                      title="刷新邀请码"
                      className="wx-header-action wx-muted-text p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleCopyInviteCode}
                      className="wx-btn-primary px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] transition flex items-center gap-1"
                    >
                      {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? '已复制' : '复制邀请'}</span>
                    </button>
                  </div>
                </div>

                <p className="wx-secondary-text text-[10px] text-zinc-500 leading-relaxed">
                  分享邀请码给好友，对方在微信应用右上角点击 <strong>“+” ➔ “输入群邀请码”</strong> 即可申请加入本群！
                </p>
              </div>

              {/* Danger Actions */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    if (confirm('确定要清空本群聊的所有聊天记录吗？此操作不可恢复。')) {
                      onClearHistory(group.id);
                      alert('已清空群聊天记录');
                    }
                  }}
                  className="wx-btn-secondary w-full py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold text-xs transition"
                >
                  清空聊天记录
                </button>

                {isOwner ? (
                  <button
                    onClick={() => {
                      if (confirm(`确定要解散群聊 “${group.name}” 吗？群聊和所有聊天记录将被删除。`)) {
                        onDeleteGroup(group.id);
                        onClose();
                      }
                    }}
                    className="wx-btn-danger w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30 transition flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>解散群聊</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`确定要退出群聊 “${group.name}” 吗？`)) {
                        handleRemoveMember('user_main');
                        onClose();
                      }
                    }}
                    className="wx-btn-danger w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30 transition"
                  >
                    退出群聊
                  </button>
                )}
              </div>
            </>
          )}

          {activeTab === 'requests' && (
            <div className="space-y-3">
              <div className="wx-primary-text flex items-center justify-between font-bold text-xs text-zinc-800 dark:text-zinc-200">
                <span>待审核入群申请 ({pendingRequests.length})</span>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 space-y-1.5">
                  <div className="wx-sub-card w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 wx-green-text" />
                  </div>
                  <p className="wx-primary-text font-bold text-xs text-zinc-700 dark:text-zinc-300">暂无待审核申请</p>
                  <p className="wx-muted-text text-[10px] text-zinc-400">当外部好友使用邀请码申请入群时将在此显示</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="wx-sub-card p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-750 space-y-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={req.userAvatar}
                          alt={req.userName}
                          className="wx-avatar w-9 h-9 rounded-full object-cover border border-zinc-200"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="wx-primary-text font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {req.userName}
                          </div>
                          <div className="wx-muted-text text-[10px] text-zinc-400 truncate">
                            申请说明: {req.userBio || '无'}
                          </div>
                        </div>
                      </div>
                      <div className="wx-divider flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-700/60">
                        <span className="wx-muted-text text-[9px] text-zinc-400 font-mono">
                          邀请码: {req.inviteCodeUsed}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRejectRequest(req)}
                            className="wx-btn-secondary px-2.5 py-1 rounded-xl bg-zinc-200 dark:bg-zinc-700 hover:bg-rose-500 hover:text-white text-zinc-700 dark:text-zinc-300 text-[10px] font-bold transition"
                          >
                            拒绝
                          </button>
                          <button
                            onClick={() => handleApproveRequest(req)}
                            className="wx-btn-primary px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-sm transition"
                          >
                            同意入群
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'network_notice' && (
            <div className="space-y-3 leading-relaxed">
              <div className="wx-sub-card p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                <div className="wx-primary-text flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs">
                  <Info className="w-4 h-4" />
                  <span>群聊架构与联网机制说明</span>
                </div>
                <p className="wx-secondary-text text-[11px] text-blue-900 dark:text-blue-200">
                  当前群聊系统支持 <strong>“真人用户 + 多个自定义AI + 系统NPC”</strong> 的独立群聊架构。
                </p>
              </div>

              <div className="space-y-2 text-zinc-600 dark:text-zinc-400 text-[11px]">
                <div className="wx-sub-card wx-secondary-text p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-750">
                  <strong className="wx-primary-text text-zinc-900 dark:text-zinc-100 block mb-0.5">1. 本机拟真多人群聊（当前运行模式）</strong>
                  支持多位 AI 好友基于自身独立人设、独立性格及长期记忆在同一群内自然交互，支持 @ 提及、邀请码申请与审批流程。
                </div>
                <div className="wx-sub-card wx-secondary-text p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-750">
                  <strong className="wx-primary-text text-zinc-900 dark:text-zinc-100 block mb-0.5">2. 跨设备真实联网方案架构</strong>
                  若需让不同物理手机上的真人通过邀请码实时进入同一个多人群聊，需接入 Firebase Firestore / WebSocket 实时消息同步服务。本系统已设计完备的邀请码、审核队列与动态成员数据结构，可无缝平滑接入。
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="wx-modal-footer p-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end bg-zinc-50 dark:bg-zinc-850">
          <button
            onClick={onClose}
            className="wx-btn-primary px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition"
          >
            完成
          </button>
        </div>
      </div>

      {/* Edit AI Member Submodal */}
      {selectedMemberToEdit && (
        <EditGroupAiMemberModal
          isOpen={!!selectedMemberToEdit}
          onClose={() => setSelectedMemberToEdit(null)}
          member={selectedMemberToEdit}
          onSaveMember={handleSaveMemberEdit}
          onRemoveMember={handleRemoveMember}
          isOwnerOrAdmin={isOwner}
        />
      )}
    </div>
  );
};
