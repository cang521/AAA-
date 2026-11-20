import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  shouldShowTimeDivider,
  formatMessageTimeDivider,
  getMessageTimestamp,
} from '../../../lib/timeUtils';
import { DEFAULT_USER_AVATAR, waitForGroupChatSave } from '../../../lib/storage';
import {
  groupReplyTaskManager,
  GroupReplyTaskStatus,
} from '../../../lib/group/GroupReplyTaskManager';
import {
  ChevronLeft,
  MoreHorizontal,
  Send,
  Sparkles,
  AtSign,
  Quote,
  Copy,
  Trash2,
  Brain,
  X,
  Users,
  Bot,
  User,
  Shield,
  MessageCircle,
  Plus,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import {
  GroupChat,
  GroupChatMessage,
  GroupMember,
  GroupPollPayload,
  GroupRandomDrawPayload,
  GroupRelayPayload,
  AiCharacter,
  UserProfile,
  ApiConfig,
  ApiLog,
} from '../../../types';
import { GroupSettingsModal } from './GroupSettingsModal';
import { GroupAvatar } from './GroupAvatar';
import { syncGroupToServer } from '../../../lib/groupService';
import { PressableButton } from '../../ui/interaction';
import { useStableTextEditing } from '../../../hooks/useStableTextEditing';
import { compressImage } from '../../../lib/imageCompressor';
import { appendGroupRelayEntry, castGroupPollVote } from '../../../lib/groupTools';
import { onGroupInteractionSocialTick } from '../../../lib/social/socialEngine';
import { GroupPlusMenuSheet } from './tools/GroupPlusMenuSheet';
import { GroupRelayModal } from './tools/GroupRelayModal';
import { GroupRelayCard } from './tools/GroupRelayCard';
import { GroupPollModal } from './tools/GroupPollModal';
import { GroupPollCard } from './tools/GroupPollCard';
import { GroupRandomDrawModal } from './tools/GroupRandomDrawModal';
import { GroupRandomDrawCard } from './tools/GroupRandomDrawCard';
import { runAiPollVotesForGroup } from './tools/groupPollAiHelper';

interface GroupChatViewProps {
  group: GroupChat;
  onBack: () => void;
  allCharacters: AiCharacter[];
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onUpdateGroup: (updatedGroup: GroupChat) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddApiLog?: (log: ApiLog) => void;
}

export const GroupChatView: React.FC<GroupChatViewProps> = ({
  group,
  onBack,
  allCharacters,
  userProfile,
  apiConfig,
  onUpdateGroup,
  onDeleteGroup,
  onAddApiLog,
}) => {
  const [messages, setMessages] = useState<GroupChatMessage[]>(group.messages || []);
  const [hasDraftText, setHasDraftText] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState<GroupChatMessage | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [taskStatusInfo, setTaskStatusInfo] = useState<{
    status: GroupReplyTaskStatus;
    targetAiId?: string;
  } | null>(null);
  const [activeLongPressMsg, setActiveLongPressMsg] = useState<GroupChatMessage | null>(null);
  const [showCoTModal, setShowCoTModal] = useState<string | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showRelayModal, setShowRelayModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showRandomDrawModal, setShowRandomDrawModal] = useState(false);
  const [aiVotingPollMsgId, setAiVotingPollMsgId] = useState<string | null>(null);
  const [localErrorMsg, setLocalErrorMsg] = useState<string | null>(null);
  const [failedTaskError, setFailedTaskError] = useState<string | null>(null);
  const [groupToast, setGroupToast] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const webPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const isSendingUserMsgRef = useRef<boolean>(false);
  const inFlightUserSaveRef = useRef<Promise<GroupChatMessage | null> | null>(null);
  const lastSendBtnClickTimeRef = useRef<number>(0);
  const messagesRef = useRef<GroupChatMessage[]>(group.messages || []);
  const groupRef = useRef<GroupChat>(group);
  groupRef.current = group;
  const prevDraftLengthRef = useRef<number>(0);

  const syncInputValue = useCallback((nextValue: string) => {
    const prevLen = prevDraftLengthRef.current;
    prevDraftLengthRef.current = nextValue.length;

    if (nextValue.length > prevLen) {
      const el = inputRef.current;
      const caret = el && typeof el.selectionStart === 'number' ? el.selectionStart : nextValue.length;
      if (nextValue.endsWith('@') || (caret > 0 && nextValue[caret - 1] === '@')) {
        setShowMentionPicker(true);
      }
    }
  }, []);

  const composerEditor = useStableTextEditing<HTMLInputElement>({
    defaultValue: '',
    onValueChange: syncInputValue,
    onHasTextChange: setHasDraftText,
    externalRef: inputRef,
  });

  const clearComposerInput = useCallback(() => {
    prevDraftLengthRef.current = 0;
    composerEditor.clear();
    setHasDraftText(false);
  }, [composerEditor]);

  const appendMentionText = useCallback(
    (mentionText: string) => {
      composerEditor.insertAtCursor(mentionText, {
        replacePrecedingChar: '@',
        focus: true,
      });
    },
    [composerEditor]
  );

  // Sync messages from group prop whenever IndexedDB / GroupReplyTaskManager updates the group
  useEffect(() => {
    const next = group.messages || [];
    messagesRef.current = next;
    setMessages(next);
  }, [group.id, group.updatedAt, group.messages?.length]);

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      if (messageListRef.current) {
        messageListRef.current.scrollTo({
          top: messageListRef.current.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    });
  }, []);

  useEffect(() => {
    prevDraftLengthRef.current = 0;
    setHasDraftText(false);
    setQuoteMsg(null);
    setShowMentionPicker(false);
    setLocalErrorMsg(null);
    setGroupToast(null);
    scrollToBottom(false);
  }, [group.id, scrollToBottom]);

  // Subscribe to persistent GroupReplyTaskManager so waking/generating/failure/retry survive tab switches
  useEffect(() => {
    groupReplyTaskManager.setApiLogHandler(onAddApiLog || null);
    groupReplyTaskManager.init();

    const syncFromManager = () => {
      setTaskStatusInfo(groupReplyTaskManager.getGroupTaskState(group.id));
      const failed = groupReplyTaskManager.getGroupFailedTask(group.id);
      setFailedTaskError(failed ? failed.error : null);
    };

    syncFromManager();
    const unsub = groupReplyTaskManager.subscribe(syncFromManager);
    return () => {
      unsub();
    };
  }, [group.id, onAddApiLog]);

  // Save updated messages into group and verify local persistence
  const persistMessages = useCallback(
    async (newMessages: GroupChatMessage[]): Promise<boolean> => {
      const prevMessages = messagesRef.current;
      messagesRef.current = newMessages;
      setMessages(newMessages);

      const currentGroup = groupRef.current;
      const updatedGroup = {
        ...currentGroup,
        messages: newMessages,
        updatedAt: Date.now(),
      };

      try {
        await Promise.resolve(onUpdateGroup(updatedGroup));
        const persisted = await waitForGroupChatSave();
        if (!persisted) {
          throw new Error('群聊消息写入本地数据库失败');
        }
        try {
          void syncGroupToServer(updatedGroup);
        } catch {
          // Non-fatal background sync
        }
        return true;
      } catch (err: any) {
        console.error('Failed to persist group messages:', err);
        messagesRef.current = prevMessages;
        setMessages(prevMessages);
        setLocalErrorMsg(err?.message || '用户消息保存失败，请检查存储空间后重试');
        return false;
      }
    },
    [onUpdateGroup]
  );

  const scheduleGroupSocialTick = useCallback(
    (triggerId: string, latestMessages: GroupChatMessage[]) => {
      const updatedGroupSnapshot: GroupChat = {
        ...group,
        messages: latestMessages,
      };
      void onGroupInteractionSocialTick({
        group: updatedGroupSnapshot,
        triggerId,
        allCharacters,
        userProfile,
        apiConfig,
        onAddApiLog,
        onGroupRandomMessage: (targetGroupId, aiChar, text) => {
          if (targetGroupId !== group.id || !text.trim()) return;
          const randomMsg: GroupChatMessage = {
            id: 'gmsg_soc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            groupId: group.id,
            senderId: aiChar.id,
            senderName: aiChar.name,
            senderAvatar: aiChar.avatar,
            senderType: 'ai',
            text,
            timestamp: Date.now(),
          };
          persistMessages([...messagesRef.current, randomMsg]);
          scrollToBottom(true);
        },
      });
    },
    [allCharacters, apiConfig, group, onAddApiLog, persistMessages, scrollToBottom, userProfile]
  );

  // Helper to extract @mentions from message text
  const extractMentionedIds = (text: string): string[] => {
    const activeGroup = groupRef.current;
    const mentioned: string[] = [];
    if (text.includes('@所有人') || text.includes('@all')) {
      mentioned.push('@all');
    }
    for (const member of activeGroup.members) {
      if (text.includes(`@${member.name}`) || text.includes(`@${member.name.replace(/\s*\(.*?\)/, '')}`)) {
        mentioned.push(member.id);
      }
    }
    return Array.from(new Set(mentioned));
  };

  // Resolve target AI ID from a user message's @mentions
  const resolveTargetAiForMessage = (msg: GroupChatMessage | undefined): {
    targetAiId?: string;
    mentionedTargets: string[];
  } => {
    const activeGroup = groupRef.current;
    const mentioned = msg?.mentionedMemberIds || (msg?.text ? extractMentionedIds(msg.text) : []);
    if (mentioned.includes('@all')) {
      return { targetAiId: '@all', mentionedTargets: mentioned };
    }
    const mentionedAiTarget = mentioned.find((id) =>
      activeGroup.members.some((m) => m.id === id && m.memberType !== 'human' && !m.isMuted)
    );
    return { targetAiId: mentionedAiTarget, mentionedTargets: mentioned };
  };

  // 1. Single-click / Enter: send and persist user's own message ONLY (never auto-triggers AI)
  const handleSendUserOnlyMessage = async (): Promise<GroupChatMessage | null> => {
    if (isSendingUserMsgRef.current) {
      return inFlightUserSaveRef.current ? await inFlightUserSaveRef.current : null;
    }

    const rawText = inputRef.current?.value ?? '';
    const text = rawText.trim();
    if (!text) return null;

    isSendingUserMsgRef.current = true;
    const activeGroup = groupRef.current;
    const mentioned = extractMentionedIds(text);

    const userMsg: GroupChatMessage = {
      id: 'gmsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      groupId: activeGroup.id,
      senderId: 'user_main',
      senderName: userProfile.name || '小清',
      senderAvatar: userProfile.avatar || DEFAULT_USER_AVATAR,
      senderType: 'human',
      text,
      timestamp: Date.now(),
      mentionedMemberIds: mentioned.length > 0 ? mentioned : undefined,
      quoteMessage: quoteMsg
        ? {
            id: quoteMsg.id,
            senderName: quoteMsg.senderName,
            text: quoteMsg.text,
          }
        : undefined,
    };

    // Clear input immediately so rapid 2nd tap will not re-read the same text
    clearComposerInput();
    setQuoteMsg(null);
    setShowMentionPicker(false);
    setLocalErrorMsg(null);
    groupReplyTaskManager.clearFailedTask(activeGroup.id);

    const savePromise = (async (): Promise<GroupChatMessage | null> => {
      const newHistory = [...messagesRef.current, userMsg];
      const saved = await persistMessages(newHistory);
      if (!saved) return null;
      scrollToBottom(true);
      return userMsg;
    })();

    inFlightUserSaveRef.current = savePromise;
    try {
      return await savePromise;
    } finally {
      isSendingUserMsgRef.current = false;
      inFlightUserSaveRef.current = null;
    }
  };

  // 2. Trigger one group AI reply round for trailing unreplied user message(s)
  const triggerGroupAiForPendingUserMessages = async () => {
    const activeGroup = groupRef.current;
    const aiMembers = activeGroup.members.filter((m) => m.memberType !== 'human' && !m.isMuted);
    if (aiMembers.length === 0) {
      setLocalErrorMsg('当前群内暂无未静音的 AI 成员可回复');
      return;
    }

    if (groupReplyTaskManager.getGroupTaskState(activeGroup.id)) {
      setGroupToast('群内 AI 正在准备回复中，请稍候...');
      setTimeout(() => setGroupToast(null), 2000);
      return;
    }

    const currentHistory = messagesRef.current;
    const pendingUserMsgs: GroupChatMessage[] = [];
    for (let i = currentHistory.length - 1; i >= 0; i--) {
      if (currentHistory[i].senderType === 'human') {
        pendingUserMsgs.unshift(currentHistory[i]);
      } else {
        break;
      }
    }

    if (pendingUserMsgs.length === 0) {
      setGroupToast('当前没有待回复的用户消息，可点击右上角“召唤讨论”');
      setTimeout(() => setGroupToast(null), 2200);
      return;
    }

    const latestUserMsg = pendingUserMsgs[pendingUserMsgs.length - 1];
    // Combine @mentions across all trailing user messages in this turn
    let targetAiId: string | undefined;
    const combinedMentions = new Set<string>();
    for (const m of pendingUserMsgs) {
      const resolved = resolveTargetAiForMessage(m);
      resolved.mentionedTargets.forEach((t) => combinedMentions.add(t));
      if (resolved.targetAiId === '@all') {
        targetAiId = '@all';
      } else if (resolved.targetAiId && targetAiId !== '@all') {
        targetAiId = resolved.targetAiId;
      }
    }

    const dedupeKey = `${activeGroup.id}:${pendingUserMsgs.map((m) => m.id).join(',')}`;
    await groupReplyTaskManager.enqueueTask({
      groupId: activeGroup.id,
      targetAiId,
      latestUserMessageId: latestUserMsg.id,
      latestUserText: pendingUserMsgs.map((m) => m.text).join('\n'),
      mentionedTargets: Array.from(combinedMentions),
      chainDepth: 0,
      dedupeKey,
    });
  };

  // 3. WeChat-parity Send Button Click Router:
  //    Single-click -> sends & persists user message ONLY
  //    Double-click (within 320ms) -> deduplicates save, wakes backend & triggers ONE group AI reply
  const handleSendButtonClick = async () => {
    const now = Date.now();
    const timeDelta = now - lastSendBtnClickTimeRef.current;

    if (timeDelta > 0 && timeDelta < 320) {
      // === DOUBLE CLICK ===
      lastSendBtnClickTimeRef.current = 0;

      // Wait if Click 1's IndexedDB write is still finishing so Click 2 sees the saved message
      if (inFlightUserSaveRef.current) {
        await inFlightUserSaveRef.current;
      }

      // If input still holds unsent text (e.g. direct double-tap), send it once
      const remainingText = inputRef.current?.value ?? '';
      if (remainingText.trim()) {
        const saved = await handleSendUserOnlyMessage();
        if (!saved) return;
      }

      await triggerGroupAiForPendingUserMessages();
    } else {
      // === SINGLE CLICK ===
      lastSendBtnClickTimeRef.current = now;
      const rawText = inputRef.current?.value ?? '';
      if (rawText.trim()) {
        await handleSendUserOnlyMessage();
      }
    }
  };

  // Explicit "召唤讨论" header button
  const handleSummonDiscussion = () => {
    const activeGroup = groupRef.current;
    const aiMembers = activeGroup.members.filter((m) => m.memberType !== 'human' && !m.isMuted);
    if (aiMembers.length === 0) {
      setLocalErrorMsg('当前群内暂无未静音的 AI 成员可响应讨论');
      return;
    }
    if (groupReplyTaskManager.getGroupTaskState(activeGroup.id)) {
      setGroupToast('群内 AI 正在生成回复中，请稍候...');
      setTimeout(() => setGroupToast(null), 2000);
      return;
    }
    const lastHuman = [...messagesRef.current].reverse().find((m) => m.senderType === 'human');
    void groupReplyTaskManager.enqueueTask({
      groupId: activeGroup.id,
      targetAiId: undefined,
      latestUserMessageId: lastHuman?.id,
      latestUserText: lastHuman?.text,
      mentionedTargets: [],
      chainDepth: 0,
      dedupeKey: `summon:${activeGroup.id}:${messagesRef.current.length}:${Math.floor(Date.now() / 1500)}`,
    });
  };

  const handleInsertMention = (member: GroupMember | 'all') => {
    if (member === 'all') {
      appendMentionText('@所有人 ');
    } else {
      appendMentionText(`@${member.name} `);
    }
    setShowMentionPicker(false);
  };

  const handleDeleteMessage = (msgId: string) => {
    const updated = messagesRef.current.filter((m) => m.id !== msgId);
    void persistMessages(updated);
    setActiveLongPressMsg(null);
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard?.writeText(text);
    setActiveLongPressMsg(null);
  };

  // ==================== Group '+' Tool Handlers ====================
  const createUserToolMessage = (
    overrides: Partial<GroupChatMessage> & { text: string; messageType: GroupChatMessage['messageType'] }
  ): GroupChatMessage => ({
    id: 'gmsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    groupId: group.id,
    senderId: 'user_main',
    senderName: userProfile.name || '小清',
    senderAvatar: userProfile.avatar || DEFAULT_USER_AVATAR,
    senderType: 'human',
    timestamp: Date.now(),
    ...overrides,
  });

  const handlePublishRelay = (payload: GroupRelayPayload) => {
    const msg = createUserToolMessage({
      messageType: 'relay',
      text: `[群接龙] ${payload.title}`,
      payload,
    });
    const next = [...messagesRef.current, msg];
    persistMessages(next);
    scrollToBottom(true);
    scheduleGroupSocialTick(`grp_relay_${msg.id}`, next);
  };

  const handleJoinRelay = (msgId: string, content: string) => {
    const targetMsg = messagesRef.current.find((m) => m.id === msgId);
    if (!targetMsg || targetMsg.messageType !== 'relay' || !targetMsg.payload) {
      return { error: '未找到该群接龙' };
    }
    const res = appendGroupRelayEntry(
      targetMsg.payload as GroupRelayPayload,
      {
        id: 'user_main',
        name: userProfile.name || '小清',
        avatar: userProfile.avatar || DEFAULT_USER_AVATAR,
      },
      content
    );
    if (res.error) return { error: res.error };

    const next = messagesRef.current.map((m) =>
      m.id === msgId ? { ...m, payload: res.payload } : m
    );
    persistMessages(next);
    return {};
  };

  const handleCloseRelay = (msgId: string) => {
    const next = messagesRef.current.map((m) => {
      if (m.id === msgId && m.messageType === 'relay' && m.payload) {
        return { ...m, payload: { ...(m.payload as GroupRelayPayload), closed: true } };
      }
      return m;
    });
    persistMessages(next);
  };

  const handlePublishPoll = (payload: GroupPollPayload) => {
    const msg = createUserToolMessage({
      messageType: 'poll',
      text: `[群投票] ${payload.title}`,
      payload,
    });
    const next = [...messagesRef.current, msg];
    persistMessages(next);
    scrollToBottom(true);
    scheduleGroupSocialTick(`grp_poll_${msg.id}`, next);
  };

  const handleCastPollVote = (msgId: string, selectedOptionIds: string[]) => {
    const targetMsg = messagesRef.current.find((m) => m.id === msgId);
    if (!targetMsg || targetMsg.messageType !== 'poll' || !targetMsg.payload) {
      return { error: '未找到该投票' };
    }
    const res = castGroupPollVote(
      targetMsg.payload as GroupPollPayload,
      { id: 'user_main', name: userProfile.name || '小清' },
      selectedOptionIds
    );
    if (res.error) return { error: res.error };
    const next = messagesRef.current.map((m) =>
      m.id === msgId ? { ...m, payload: res.payload } : m
    );
    persistMessages(next);
    return {};
  };

  const handleClosePoll = (msgId: string) => {
    const next = messagesRef.current.map((m) => {
      if (m.id === msgId && m.messageType === 'poll' && m.payload) {
        return { ...m, payload: { ...(m.payload as GroupPollPayload), closed: true } };
      }
      return m;
    });
    persistMessages(next);
  };

  const handleRequestAiPollVotes = async (msgId: string) => {
    if (aiVotingPollMsgId) return;
    const targetMsg = messagesRef.current.find((m) => m.id === msgId);
    if (!targetMsg || targetMsg.messageType !== 'poll' || !targetMsg.payload) return;

    setAiVotingPollMsgId(msgId);
    try {
      const { updatedPayload, comments } = await runAiPollVotesForGroup({
        group,
        pollPayload: targetMsg.payload as GroupPollPayload,
        allCharacters,
        userProfile,
        apiConfig,
        onAddApiLog,
      });

      const updatedMsgs = messagesRef.current.map((m) =>
        m.id === msgId ? { ...m, payload: updatedPayload } : m
      );

      // Append optional brief AI comments after voting
      const commentMessages: GroupChatMessage[] = comments.map((c, idx) => ({
        id: `gmsg_pv_${Date.now()}_${idx}`,
        groupId: group.id,
        senderId: c.aiMemberId,
        senderName: c.aiName,
        senderAvatar: c.aiAvatar,
        senderType: 'ai',
        text: c.comment,
        timestamp: Date.now() + idx * 50,
      }));

      persistMessages([...updatedMsgs, ...commentMessages]);
      if (commentMessages.length > 0) scrollToBottom(true);
    } finally {
      setAiVotingPollMsgId(null);
    }
  };

  const handlePublishRandomDraw = (payload: GroupRandomDrawPayload) => {
    const winnersSummary = payload.winners.map((w) => w.memberName).join('、');
    const msg = createUserToolMessage({
      messageType: 'random_draw',
      text: `[随机抽人] 抽中：${winnersSummary}`,
      payload,
    });
    const next = [...messagesRef.current, msg];
    persistMessages(next);
    scrollToBottom(true);
    scheduleGroupSocialTick(`grp_draw_${msg.id}`, next);
  };

  const handleSendGroupPhotoDataUrl = async (dataUrl: string) => {
    const msg = createUserToolMessage({
      messageType: 'image',
      imageUrl: dataUrl,
      text: '[图片]',
    });
    const next = [...messagesRef.current, msg];
    const saved = await persistMessages(next);
    if (!saved) return;
    scrollToBottom(true);
    setShowPlusMenu(false);
    void groupReplyTaskManager.enqueueTask({
      groupId: groupRef.current.id,
      latestUserMessageId: msg.id,
      latestUserText: '[图片]',
      mentionedTargets: [],
      chainDepth: 0,
      dedupeKey: `${groupRef.current.id}:${msg.id}`,
    });
  };

  const handleTriggerWebFilePicker = (useCameraCapture: boolean) => {
    const inputEl = webPhotoInputRef.current;
    if (!inputEl) return;
    if (useCameraCapture) {
      inputEl.setAttribute('capture', 'environment');
    } else {
      inputEl.removeAttribute('capture');
    }
    inputEl.click();
  };

  const handleWebPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        maxFileSizeBytes: 320 * 1024,
      });
      handleSendGroupPhotoDataUrl(compressed.dataUrl);
    } catch (err) {
      console.warn('Group photo compression error:', err);
    }
  };

  return (
    <div
      data-global-font-excluded="true"
      className="wx-chat-viewport wechat-chat-font-isolated flex flex-col h-full bg-[#EDEDED] dark:bg-zinc-950 select-none relative overflow-hidden font-sans"
    >
      {/* Top Header */}
      <div className="wx-header h-12 bg-[#EDEDED] dark:bg-zinc-900 border-b border-zinc-300/70 dark:border-zinc-800 px-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={onBack}
            className="wx-header-back p-1 -ml-1 text-zinc-800 dark:text-zinc-200 hover:text-emerald-600 transition flex items-center shrink-0"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <GroupAvatar
            members={group.members}
            avatarMode={group.avatarMode}
            customAvatar={group.customAvatar}
            legacyAvatar={group.avatar}
            allCharacters={allCharacters}
            userProfile={userProfile}
            size={30}
            alt={group.name}
            className="border border-zinc-300/60 dark:border-zinc-700"
          />
          <div className="min-w-0 flex items-center gap-1">
            <h2 className="wx-header-title text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[160px]">
              {group.name}
            </h2>
            <span className="wx-muted-text text-xs font-semibold text-zinc-500 shrink-0">
              ({group.members.length})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleSummonDiscussion}
            title="召唤群内AI讨论"
            className="wx-header-action wx-green-text p-1.5 rounded-full text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition flex items-center gap-1 text-[11px] font-bold"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">召唤讨论</span>
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="wx-header-action p-1.5 rounded-full text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Group Notice Bar */}
      {group.notice && (
        <div className="wx-group-notice px-3 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/20 text-[10px] text-amber-800 dark:text-amber-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold shrink-0">群公告:</span>
            <span className="truncate">{group.notice}</span>
          </div>
        </div>
      )}

      {/* Message List */}
      <div
        ref={messageListRef}
        className="flex-1 overflow-y-auto p-3 space-y-3.5 scroll-smooth"
        onClick={() => {
          if (showMentionPicker) setShowMentionPicker(false);
          if (activeLongPressMsg) setActiveLongPressMsg(null);
        }}
      >
        {messages.map((msg, index) => {
          const isMe = msg.senderId === 'user_main';
          const isSystem = msg.senderId === 'system';
          const prevMsg = index > 0 ? messages[index - 1] : undefined;
          const showDivider = shouldShowTimeDivider(msg, prevMsg);
          const ts = getMessageTimestamp(msg);

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2 select-none">
                <span className="wx-history-pill px-2.5 py-0.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800/80 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {msg.text}
                </span>
              </div>
            );
          }

          // Check for @mention highlighting
          const hasMentionMe =
            msg.mentionedMemberIds?.includes('user_main') || msg.mentionedMemberIds?.includes('@all');

          return (
            <React.Fragment key={msg.id}>
              {showDivider && ts && (
                <div className="flex justify-center my-2 select-none">
                  <span className="wx-time-divider px-2.5 py-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800/80 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 shadow-2xs">
                    {formatMessageTimeDivider(ts)}
                  </span>
                </div>
              )}
              <div
                className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
              {/* Avatar */}
              <div
                onClick={() => {
                  if (isMe) return;
                  if (msg.senderType === 'ai' || msg.thinkingProcess) {
                    setShowCoTModal(msg.thinkingProcess || '该条消息生成时暂未附带详细思考链数据。');
                  } else {
                    appendMentionText(`@${msg.senderName} `);
                  }
                }}
                className="relative cursor-pointer shrink-0"
                title={msg.senderType === 'ai' || msg.thinkingProcess ? '点击查看 AI 思考链 (CoT)' : `点击快捷@${msg.senderName}`}
              >
                <img
                  src={
                    msg.senderAvatar ||
                    group.members.find((m) => m.id === msg.senderId)?.avatar ||
                    (isMe
                      ? userProfile.avatar
                      : allCharacters.find((c) => c.id === msg.senderId)?.avatar) ||
                    DEFAULT_USER_AVATAR
                  }
                  alt={msg.senderName}
                  className="wx-avatar w-9 h-9 rounded-lg object-cover shadow-sm border border-black/5 dark:border-white/10"
                />
                {(msg.senderType === 'ai' || msg.thinkingProcess) && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-400 rounded-full border border-zinc-900 flex items-center justify-center shadow-xs">
                    <Brain className="w-2.5 h-2.5 text-zinc-950" />
                  </span>
                )}
              </div>

              {/* Message Content & Name */}
              <div className={`flex flex-col max-w-[76%] ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Sender Name & Role Tag */}
                <div className="flex items-center gap-1 mb-0.5 px-0.5">
                  <span className="wx-secondary-text text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                    {msg.senderName}
                  </span>
                  {msg.senderType === 'ai' ? (
                    <span className="wx-group-tag-ai px-1 rounded bg-purple-500/20 text-purple-600 dark:text-purple-300 text-[8px] font-bold leading-tight">
                      AI
                    </span>
                  ) : msg.senderType === 'npc' ? (
                    <span className="wx-group-tag-ai px-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-300 text-[8px] font-bold leading-tight">
                      NPC
                    </span>
                  ) : (
                    <span className="wx-group-tag-human px-1 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[8px] font-bold leading-tight">
                      真人
                    </span>
                  )}
                </div>

                {/* Quoted Message Preview */}
                {msg.quoteMessage && (
                  <div
                    className={`wx-quote-preview mb-1 p-1.5 rounded-lg text-[10px] border line-clamp-2 max-w-full ${
                      isMe
                        ? 'bg-emerald-600/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                        : 'bg-zinc-200/80 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    <span className="font-bold">{msg.quoteMessage.senderName}: </span>
                    <span>{msg.quoteMessage.text}</span>
                  </div>
                )}

                {/* Main Bubble or Structured Card */}
                {msg.messageType === 'relay' && msg.payload ? (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveLongPressMsg(msg);
                    }}
                  >
                    <GroupRelayCard
                      payload={msg.payload as GroupRelayPayload}
                      currentUserId="user_main"
                      canClose={isMe}
                      onJoinRelay={(content) => handleJoinRelay(msg.id, content)}
                      onCloseRelay={() => handleCloseRelay(msg.id)}
                    />
                  </div>
                ) : msg.messageType === 'poll' && msg.payload ? (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveLongPressMsg(msg);
                    }}
                  >
                    <GroupPollCard
                      payload={msg.payload as GroupPollPayload}
                      currentUserId="user_main"
                      canManage={isMe}
                      hasAiMembers={group.members.some((m) => m.memberType === 'ai' && !m.isMuted)}
                      isAiVoting={aiVotingPollMsgId === msg.id}
                      onCastVote={(optionIds) => handleCastPollVote(msg.id, optionIds)}
                      onClosePoll={() => handleClosePoll(msg.id)}
                      onRequestAiVotes={() => handleRequestAiPollVotes(msg.id)}
                    />
                  </div>
                ) : msg.messageType === 'random_draw' && msg.payload ? (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveLongPressMsg(msg);
                    }}
                  >
                    <GroupRandomDrawCard payload={msg.payload as GroupRandomDrawPayload} />
                  </div>
                ) : msg.messageType === 'image' && msg.imageUrl ? (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveLongPressMsg(msg);
                    }}
                    onClick={() => setZoomedImageUrl(msg.imageUrl || null)}
                    className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm cursor-pointer max-w-[210px] bg-white dark:bg-zinc-900"
                  >
                    <img
                      src={msg.imageUrl}
                      alt="群聊图片"
                      className="w-full max-h-60 object-cover block"
                    />
                  </div>
                ) : (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveLongPressMsg(msg);
                    }}
                    className={`wx-message-bubble relative px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words shadow-sm ${
                      isMe
                        ? 'wx-message-bubble-user bg-[#95EC69] dark:bg-emerald-600 text-black dark:text-white rounded-tr-none'
                        : hasMentionMe
                        ? 'wx-message-bubble-ai bg-amber-50 dark:bg-amber-950/40 text-zinc-900 dark:text-zinc-100 border border-amber-400 rounded-tl-none ring-1 ring-amber-400/40'
                        : 'wx-message-bubble-ai bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-black/5 dark:border-white/5 rounded-tl-none'
                    }`}
                  >
                    {/* Mention Badge if targeting user */}
                    {hasMentionMe && !isMe && (
                      <div className="text-[9px] font-bold text-amber-600 dark:text-amber-400 mb-0.5 flex items-center gap-0.5">
                        <AtSign className="w-2.5 h-2.5" />
                        <span>提到了你</span>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                )}
              </div>
            </div>
          </React.Fragment>
        );
        })}

        {/* Multi-AI Waking / Typing Indicator */}
        {taskStatusInfo && (
          <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 animate-pulse px-2 py-1">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <span className="text-[11px] font-semibold">
              {taskStatusInfo.status === 'waking_backend'
                ? '正在唤醒 Android 内置后端...'
                : taskStatusInfo.status === 'queued'
                  ? '已加入群聊回复队列，等待执行...'
                  : `${
                      (taskStatusInfo.targetAiId &&
                        taskStatusInfo.targetAiId !== '@all' &&
                        group.members.find((m) => m.id === taskStatusInfo.targetAiId)?.name) ||
                      '群内AI伙伴'
                    } 正在输入...`}
            </span>
          </div>
        )}

        {/* Ephemeral Status Toast */}
        {groupToast && (
          <div className="flex justify-center">
            <span className="px-3 py-1 rounded-full bg-zinc-800/80 text-white text-[11px] shadow-xs">
              {groupToast}
            </span>
          </div>
        )}

        {/* Visible Group AI Error Banner with Retry */}
        {(failedTaskError || localErrorMsg) && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/40 text-xs flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
              <span className="text-rose-700 dark:text-rose-200 break-words whitespace-pre-wrap">
                {failedTaskError || localErrorMsg}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {failedTaskError && (
                <button
                  type="button"
                  onClick={() => void groupReplyTaskManager.retryFailedTask(group.id)}
                  className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>重试</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setLocalErrorMsg(null);
                  groupReplyTaskManager.clearFailedTask(group.id);
                }}
                className="p-1 rounded-lg text-rose-500/80 hover:text-rose-700 dark:hover:text-rose-200 transition cursor-pointer"
                title="关闭提示"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quote Preview in Input Bar */}
      {quoteMsg && (
        <div className="wx-composer-quote px-3 py-1.5 bg-zinc-200/80 dark:bg-zinc-850 border-t border-zinc-300 dark:border-zinc-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 truncate">
            <Quote className="w-3 h-3 text-emerald-600" />
            <span className="font-bold text-[11px]">{quoteMsg.senderName}:</span>
            <span className="truncate text-[11px]">{quoteMsg.text}</span>
          </div>
          <button
            onClick={() => setQuoteMsg(null)}
            className="wx-muted-text text-zinc-400 hover:text-zinc-600 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mention Picker Popover */}
      {showMentionPicker && (
        <div className="wx-dropdown absolute bottom-14 left-3 right-3 bg-white dark:bg-zinc-850 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 p-2 z-30 space-y-1 max-h-48 overflow-y-auto animate-in slide-in-from-bottom-2">
          <div className="wx-muted-text text-[10px] font-bold text-zinc-400 px-2 py-0.5 flex items-center justify-between">
            <span>选择要 @ 提醒的群成员</span>
            <button onClick={() => setShowMentionPicker(false)}>
              <X className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={() => handleInsertMention('all')}
            className="wx-dropdown-item w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 text-left"
          >
            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
            <span>@所有人 (全员关注)</span>
          </button>
          {group.members
            .filter((m) => m.id !== 'user_main')
            .map((member) => (
              <button
                key={member.id}
                onClick={() => handleInsertMention(member)}
                className="wx-dropdown-item w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-200 text-left"
              >
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="wx-avatar w-6 h-6 rounded-full object-cover"
                />
                <span className="font-bold">{member.name}</span>
                <span className="wx-muted-text text-[9px] text-zinc-400 ml-auto">
                  {member.memberType === 'ai' ? 'AI' : member.memberType === 'npc' ? 'NPC' : '真人'}
                </span>
              </button>
            ))}
        </div>
      )}

      {/* Input Bar */}
      <div className="wx-composer p-2.5 bg-[#F7F7F7] dark:bg-zinc-900 border-t border-zinc-300/70 dark:border-zinc-800 flex items-center gap-1.5 shrink-0">
        <PressableButton
          onClick={() => {
            setShowPlusMenu(false);
            setShowMentionPicker(!showMentionPicker);
          }}
          title="@群成员"
          className="wx-header-action w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-emerald-600 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0"
        >
          <AtSign className="w-5 h-5" />
        </PressableButton>

        <input
          key={group.id}
          ref={composerEditor.mergedRef}
          type="text"
          defaultValue=""
          onFocus={() => setShowPlusMenu(false)}
          {...composerEditor.eventProps}
          onKeyDown={(e) => {
            composerEditor.eventProps.onKeyDown(e);
            const isComposing = composerEditor.isCompositionActive(e.nativeEvent);

            if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
              e.preventDefault();
              void handleSendUserOnlyMessage();
            }
          }}
          placeholder="发送群消息，输入 @ 提及成员..."
          className="wx-composer-input flex-1 min-w-0 px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300/70 dark:border-zinc-700 focus:outline-none focus:border-emerald-500"
        />

        <PressableButton
          onClick={() => {
            setShowMentionPicker(false);
            setShowPlusMenu((v) => !v);
          }}
          title="更多群聊工具（接龙、投票、抽人、图片）"
          className={`wx-header-action w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer shrink-0 ${
            showPlusMenu
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          <Plus className="w-5 h-5" />
        </PressableButton>

        <PressableButton
          type="button"
          onClick={() => void handleSendButtonClick()}
          withRipple={false}
          title="单击发送群消息 | 快速双击触发 AI 回复"
          className={`wx-send-button ${
            hasDraftText
              ? 'wx-send-button--active bg-[#07C160] hover:bg-[#06ad56] text-white'
              : 'bg-zinc-400/80 dark:bg-zinc-700 hover:bg-zinc-500/80 text-white/90'
          } px-3 py-2 rounded-xl font-bold text-xs shadow-sm transition flex items-center justify-center shrink-0 cursor-pointer`}
        >
          <Send className="w-4 h-4" />
        </PressableButton>
      </div>

      {/* Group "+" Tools Sheet */}
      {showPlusMenu && (
        <GroupPlusMenuSheet
          onSelectRelay={() => setShowRelayModal(true)}
          onSelectPoll={() => setShowPollModal(true)}
          onSelectRandomDraw={() => setShowRandomDrawModal(true)}
          onPhotoPickedDataUrl={(dataUrl) => handleSendGroupPhotoDataUrl(dataUrl)}
          onTriggerWebFilePicker={handleTriggerWebFilePicker}
          onClose={() => setShowPlusMenu(false)}
        />
      )}

      {/* Hidden Web Photo Fallback Input */}
      <input
        ref={webPhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleWebPhotoFileChange}
      />

      {/* Context / Long Press Menu Modal */}
      {activeLongPressMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setActiveLongPressMsg(null)}
        >
          <div
            className="wx-dropdown w-52 bg-white dark:bg-zinc-850 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-750 p-1.5 space-y-1 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setQuoteMsg(activeLongPressMsg);
                setActiveLongPressMsg(null);
                if (inputRef.current) inputRef.current.focus();
              }}
              className="wx-dropdown-item w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <Quote className="w-3.5 h-3.5 text-emerald-600" />
              <span>引用回复</span>
            </button>
            <button
              onClick={() => {
                appendMentionText(`@${activeLongPressMsg.senderName} `);
                setActiveLongPressMsg(null);
              }}
              className="wx-dropdown-item w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <AtSign className="w-3.5 h-3.5 text-purple-600" />
              <span>@{activeLongPressMsg.senderName}</span>
            </button>
            <button
              onClick={() => handleCopyMessage(activeLongPressMsg.text)}
              className="wx-dropdown-item w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5 text-blue-600" />
              <span>复制文本</span>
            </button>
            <button
              onClick={() => handleDeleteMessage(activeLongPressMsg.id)}
              className="wx-dropdown-item w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除消息</span>
            </button>
          </div>
        </div>
      )}

      {/* Thinking Process Modal */}
      {showCoTModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="wx-modal-card w-full max-w-xs bg-white dark:bg-zinc-900 rounded-3xl p-4 shadow-2xl border border-purple-500/30 space-y-3">
            <div className="wx-primary-text flex items-center justify-between font-bold text-xs text-purple-600 dark:text-purple-400">
              <div className="flex items-center gap-1.5">
                <Brain className="w-4 h-4" />
                <span>AI 心理活动与推理决策</span>
              </div>
              <button
                onClick={() => setShowCoTModal(null)}
                className="wx-muted-text text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="wx-sub-card wx-primary-text p-3 rounded-2xl bg-purple-500/10 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
              {showCoTModal}
            </div>
          </div>
        </div>
      )}

      {/* Group Tool Modals */}
      <GroupRelayModal
        isOpen={showRelayModal}
        onClose={() => setShowRelayModal(false)}
        creator={{
          id: 'user_main',
          name: userProfile.name || '小清',
          avatar: userProfile.avatar || DEFAULT_USER_AVATAR,
        }}
        onSubmit={handlePublishRelay}
      />

      <GroupPollModal
        isOpen={showPollModal}
        onClose={() => setShowPollModal(false)}
        onSubmit={handlePublishPoll}
      />

      <GroupRandomDrawModal
        isOpen={showRandomDrawModal}
        onClose={() => setShowRandomDrawModal(false)}
        members={group.members}
        onSubmit={handlePublishRandomDraw}
      />

      {zoomedImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setZoomedImageUrl(null)}
        >
          <img
            src={zoomedImageUrl}
            alt="查看大图"
            className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <GroupSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          group={group}
          allCharacters={allCharacters}
          userProfile={userProfile}
          onUpdateGroup={onUpdateGroup}
          onDeleteGroup={(id) => {
            onDeleteGroup(id);
            onBack();
          }}
          onClearHistory={(id) => {
            persistMessages([]);
          }}
        />
      )}
    </div>
  );
};
