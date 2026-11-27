import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  shouldShowTimeDivider,
  formatMessageTimeDivider,
  getMessageTimestamp,
} from '../../../lib/timeUtils';
import { DEFAULT_USER_AVATAR, waitForGroupChatSave } from '../../../lib/storage';
import {
  groupReplyTaskManager,
  GroupActivePlaybackIndicator,
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
  User,
  Shield,
  MessageCircle,
  Plus,
  AlertCircle,
  RotateCcw,
  Check,
  CheckSquare,
  Forward,
  Layers,
} from 'lucide-react';
import {
  GroupChat,
  GroupChatMessage,
  GroupMember,
  GroupPollPayload,
  GroupRandomDrawPayload,
  GroupRelayPayload,
  ForwardBundlePayload,
  AiCharacter,
  UserProfile,
  ApiConfig,
  ApiLog,
  ReasoningSource,
} from '../../../types';
import { GroupSettingsModal } from './GroupSettingsModal';
import { GroupAvatar } from './GroupAvatar';
import { syncGroupToServer } from '../../../lib/groupService';
import { PressableButton } from '../../ui/interaction';
import { useStableTextEditing } from '../../../hooks/useStableTextEditing';
import { compressImage } from '../../../lib/imageCompressor';
import { appendGroupRelayEntry, castGroupPollVote } from '../../../lib/groupTools';
import { GroupPlusMenuSheet } from './tools/GroupPlusMenuSheet';
import { GroupRelayModal } from './tools/GroupRelayModal';
import { GroupRelayCard } from './tools/GroupRelayCard';
import { GroupPollModal } from './tools/GroupPollModal';
import { GroupPollCard } from './tools/GroupPollCard';
import { GroupRandomDrawModal } from './tools/GroupRandomDrawModal';
import { GroupRandomDrawCard } from './tools/GroupRandomDrawCard';
import { ForwardBundleCard } from '../../wechat/ForwardBundleCard';
import { ForwardBundleDetailModal } from '../../wechat/ForwardBundleDetailModal';
import { ForwardTargetModal } from '../../wechat/ForwardTargetModal';
import {
  createForwardBundleFromGroup,
  forwardBundleToTargets,
  forwardMessagesIndividuallyToTargets,
  ForwardTargetDescriptor,
} from '../../../lib/forward/forwardBundleService';
import { saveChatMessage } from '../../../lib/chatDb';
import { getCachedGroupChats, hydrateGroupChatsFromDb, saveGroupChatsToDb } from '../../../lib/groupChatDb';

interface GroupChatViewProps {
  group: GroupChat;
  onBack: () => void;
  allCharacters: AiCharacter[];
  allGroups?: GroupChat[];
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
  allGroups,
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
  const [taskStatusInfo, setTaskStatusInfo] = useState<GroupActivePlaybackIndicator | null>(null);
  const [activeLongPressMsg, setActiveLongPressMsg] = useState<GroupChatMessage | null>(null);
  const [showCoTModal, setShowCoTModal] = useState<{
    status: 'available' | 'empty' | 'failed';
    text: string;
    source?: ReasoningSource;
    senderName?: string;
  } | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showRelayModal, setShowRelayModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showRandomDrawModal, setShowRandomDrawModal] = useState(false);
  const [localErrorMsg, setLocalErrorMsg] = useState<string | null>(null);
  const [failedTaskError, setFailedTaskError] = useState<string | null>(null);
  const [groupToast, setGroupToast] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // Multi-select & forwarding state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [forwardTargetRequest, setForwardTargetRequest] = useState<{
    mode: 'merged' | 'individual';
    messages: GroupChatMessage[];
  } | null>(null);
  const [bundleDetailPayload, setBundleDetailPayload] = useState<ForwardBundlePayload | null>(null);

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
  const prevSyncedGroupIdRef = useRef<string>(group.id);
  const prevSyncedUpdatedAtRef = useRef<number>(group.updatedAt || 0);

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

  // Sync messages from group prop whenever IndexedDB / GroupReplyTaskManager updates messages or polls
  useEffect(() => {
    const next = group.messages || [];
    const sameGroup = prevSyncedGroupIdRef.current === group.id;
    const hasUpdate = (group.updatedAt || 0) !== prevSyncedUpdatedAtRef.current;
    messagesRef.current = next;
    setMessages(next);

    if (sameGroup && hasUpdate && next.length > 0) {
      scrollToBottom(true);
    }
    prevSyncedGroupIdRef.current = group.id;
    prevSyncedUpdatedAtRef.current = group.updatedAt || 0;
  }, [group.id, group.updatedAt, group.messages, scrollToBottom]);

  useEffect(() => {
    prevDraftLengthRef.current = 0;
    setHasDraftText(false);
    setQuoteMsg(null);
    setShowMentionPicker(false);
    setLocalErrorMsg(null);
    setGroupToast(null);
    setIsMultiSelectMode(false);
    setSelectedMsgIds([]);
    setShowBatchDeleteConfirm(false);
    setForwardTargetRequest(null);
    setBundleDetailPayload(null);
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

    // Check if an AI discussion timeline is currently playing/generating/paused so user message can interrupt cleanly
    const wasRoundActive = groupReplyTaskManager.hasActiveOrPausedRound(activeGroup.id);

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

      // Requirement VI: User interjection during an active/paused AI round immediately cancels
      // remaining unexecuted events, preserves already-displayed messages & votes, and starts a fresh round
      if (wasRoundActive) {
        const resolvedTarget = resolveTargetAiForMessage(userMsg);
        void groupReplyTaskManager.interruptForUserMessage(activeGroup.id, userMsg, resolvedTarget);
      }

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
      triggerType: 'user_double_click',
      targetAiId,
      latestUserMessageId: latestUserMsg.id,
      latestUserText: pendingUserMsgs.map((m) => m.text).join('\n'),
      mentionedTargets: Array.from(combinedMentions),
      chainDepth: 0,
      dedupeKey,
    });
  };

  // 3. WeChat-parity Send Button Click Router:
  //    Single-click -> sends & persists user message ONLY (or interrupts if AI round is actively playing)
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
    const currentState = groupReplyTaskManager.getGroupTaskState(activeGroup.id);
    if (currentState) {
      if (currentState.status === 'paused') {
        groupReplyTaskManager.resumeGroupDiscussion(activeGroup.id);
        return;
      }
      setGroupToast('群内 AI 正在回复中，请稍候...');
      setTimeout(() => setGroupToast(null), 2000);
      return;
    }
    const lastHuman = [...messagesRef.current].reverse().find((m) => m.senderType === 'human');
    void groupReplyTaskManager.enqueueTask({
      groupId: activeGroup.id,
      triggerType: 'summon_discussion',
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

  const toggleSelectMessage = useCallback((msgId: string) => {
    setSelectedMsgIds((prev) =>
      prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
    );
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode(false);
    setSelectedMsgIds([]);
    setShowBatchDeleteConfirm(false);
  }, []);

  const getSelectedGroupMessages = useCallback((): GroupChatMessage[] => {
    const idSet = new Set(selectedMsgIds);
    return messagesRef.current.filter((m) => idSet.has(m.id) && m.senderId !== 'system');
  }, [selectedMsgIds]);

  const handleConfirmBatchDelete = async () => {
    if (isBatchDeleting || selectedMsgIds.length === 0) return;
    setIsBatchDeleting(true);
    const idSet = new Set(selectedMsgIds);
    const remaining = messagesRef.current.filter((m) => !idSet.has(m.id));
    try {
      const ok = await persistMessages(remaining);
      if (ok) {
        setShowBatchDeleteConfirm(false);
        setIsMultiSelectMode(false);
        setSelectedMsgIds([]);
        setGroupToast(`已删除 ${idSet.size} 条消息`);
        setTimeout(() => setGroupToast(null), 2200);
      } else {
        setShowBatchDeleteConfirm(false);
      }
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const appendGroupMessagesToTarget = useCallback(
    async (targetGroupId: string, newMsgs: GroupChatMessage[]) => {
      const currentList =
        allGroups && allGroups.length > 0
          ? allGroups
          : getCachedGroupChats() || (await hydrateGroupChatsFromDb());
      const targetGroup = currentList.find((g) => g.id === targetGroupId);
      if (!targetGroup) {
        throw new Error('目标群聊不存在');
      }
      const mergedMessages = [...(targetGroup.messages || []), ...newMsgs];
      const updatedTarget: GroupChat = {
        ...targetGroup,
        messages: mergedMessages,
        updatedAt: Date.now(),
      };
      const updatedList = currentList.map((g) => (g.id === targetGroupId ? updatedTarget : g));
      await saveGroupChatsToDb(updatedList);
      const ok = await waitForGroupChatSave();
      if (!ok) {
        throw new Error('群聊记录写入本地存储失败');
      }
      if (targetGroupId === groupRef.current.id) {
        messagesRef.current = mergedMessages;
        setMessages(mergedMessages);
        onUpdateGroup(updatedTarget);
      }
      try {
        void syncGroupToServer(updatedTarget);
      } catch {
        // non-fatal
      }
    },
    [allGroups, onUpdateGroup]
  );

  const handleConfirmForwardTargets = async (targets: ForwardTargetDescriptor[]) => {
    if (!forwardTargetRequest || forwardTargetRequest.messages.length === 0) return;
    const { mode, messages: srcMsgs } = forwardTargetRequest;
    const results =
      mode === 'merged'
        ? await forwardBundleToTargets({
            bundle: createForwardBundleFromGroup({
              messages: srcMsgs,
              group: groupRef.current,
            }),
            targets,
            userProfile,
            savePrivateMessage: saveChatMessage,
            appendGroupMessages: appendGroupMessagesToTarget,
          })
        : await forwardMessagesIndividuallyToTargets({
            sourceType: 'group',
            sourceMessages: srcMsgs,
            sourceGroup: groupRef.current,
            targets,
            userProfile,
            savePrivateMessage: saveChatMessage,
            appendGroupMessages: appendGroupMessagesToTarget,
          });

    const successCount = results.filter((r) => r.ok).length;
    const failCount = results.length - successCount;
    setForwardTargetRequest(null);

    if (successCount > 0) {
      exitMultiSelectMode();
      setGroupToast(
        failCount > 0
          ? `已转发至 ${successCount} 个会话，${failCount} 个发送失败`
          : `已转发至 ${successCount} 个会话`
      );
      setTimeout(() => setGroupToast(null), 2600);
    } else {
      setLocalErrorMsg(results[0]?.error || '转发失败，请检查本地存储后重试');
    }
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
    void persistMessages(next);
    scrollToBottom(true);
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
    void persistMessages(next);
    return {};
  };

  const handleCloseRelay = (msgId: string) => {
    const next = messagesRef.current.map((m) => {
      if (m.id === msgId && m.messageType === 'relay' && m.payload) {
        return { ...m, payload: { ...(m.payload as GroupRelayPayload), closed: true } };
      }
      return m;
    });
    void persistMessages(next);
  };

  const handlePublishPoll = (payload: GroupPollPayload) => {
    const msg = createUserToolMessage({
      messageType: 'poll',
      text: `[群投票] ${payload.title}`,
      payload,
    });
    const next = [...messagesRef.current, msg];
    void persistMessages(next);
    scrollToBottom(true);
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
    void persistMessages(next);
    return {};
  };

  const handleClosePoll = (msgId: string) => {
    const next = messagesRef.current.map((m) => {
      if (m.id === msgId && m.messageType === 'poll' && m.payload) {
        return { ...m, payload: { ...(m.payload as GroupPollPayload), closed: true } };
      }
      return m;
    });
    void persistMessages(next);
  };

  // Unified single-API poll voting round (replaces legacy multi-request loop)
  const handleRequestAiPollVotes = async (msgId: string) => {
    const activeGroup = groupRef.current;
    const targetMsg = messagesRef.current.find((m) => m.id === msgId);
    if (!targetMsg || targetMsg.messageType !== 'poll' || !targetMsg.payload) return;

    const payload = targetMsg.payload as GroupPollPayload;
    const isExpired = Boolean(payload.deadline && Date.now() > payload.deadline);
    if (payload.closed || isExpired) {
      setGroupToast('该投票已结束，无法再邀请 AI 投票');
      setTimeout(() => setGroupToast(null), 2000);
      return;
    }

    const aiMembers = activeGroup.members.filter((m) => m.memberType !== 'human' && !m.isMuted);
    if (aiMembers.length === 0) {
      setLocalErrorMsg('当前群内暂无未静音的 AI 成员可参与投票');
      return;
    }

    if (groupReplyTaskManager.hasActiveOrPausedRound(activeGroup.id)) {
      setGroupToast('群内 AI 正在回复中，请稍候再邀请投票');
      setTimeout(() => setGroupToast(null), 2000);
      return;
    }

    await groupReplyTaskManager.enqueuePollVoteRound(activeGroup.id, msgId);
  };

  const handlePublishRandomDraw = (payload: GroupRandomDrawPayload) => {
    const winnersSummary = payload.winners.map((w) => w.memberName).join('、');
    const msg = createUserToolMessage({
      messageType: 'random_draw',
      text: `[随机抽人] 抽中：${winnersSummary}`,
      payload,
    });
    const next = [...messagesRef.current, msg];
    void persistMessages(next);
    scrollToBottom(true);
  };

  const handleSendGroupPhotoDataUrl = async (dataUrl: string) => {
    const activeGroup = groupRef.current;
    const wasRoundActive = groupReplyTaskManager.hasActiveOrPausedRound(activeGroup.id);
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
    if (wasRoundActive) {
      void groupReplyTaskManager.interruptForUserMessage(activeGroup.id, msg);
    } else {
      void groupReplyTaskManager.enqueueTask({
        groupId: activeGroup.id,
        triggerType: 'image_message',
        latestUserMessageId: msg.id,
        latestUserText: '[图片]',
        mentionedTargets: [],
        chainDepth: 0,
        dedupeKey: `${activeGroup.id}:${msg.id}`,
      });
    }
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

  let lastTypingActorMsgIndex = -1;
  if (taskStatusInfo?.activeActionType === 'typing' && taskStatusInfo.activeActorId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === taskStatusInfo.activeActorId) {
        lastTypingActorMsgIndex = i;
        break;
      }
    }
  }

  return (
    <div
      data-global-font-excluded="true"
      className="wx-chat-viewport wechat-chat-font-isolated flex flex-col h-full bg-[#EDEDED] dark:bg-zinc-950 select-none relative overflow-hidden font-sans"
    >
      {/* Top Header */}
      {isMultiSelectMode ? (
        <div className="wx-header h-12 bg-[#EDEDED] dark:bg-zinc-900 border-b border-zinc-300/70 dark:border-zinc-800 px-3 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="wx-header-title text-sm font-bold text-zinc-900 dark:text-zinc-100">
              已选择 {selectedMsgIds.length} 条
            </span>
          </div>
          <button
            type="button"
            onClick={exitMultiSelectMode}
            className="wx-header-action px-3 py-1 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            取消
          </button>
        </div>
      ) : (
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
      )}

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

          const isSelected = isMultiSelectMode && selectedMsgIds.includes(msg.id);
          const forwardBundlePayload: ForwardBundlePayload | undefined =
            msg.forwardBundle ||
            (msg.messageType === 'forward_bundle' && msg.payload && 'items' in (msg.payload as any)
              ? (msg.payload as ForwardBundlePayload)
              : undefined);

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
                onClick={() => {
                  if (isMultiSelectMode) {
                    toggleSelectMessage(msg.id);
                  }
                }}
                className={`flex items-start gap-2 rounded-2xl transition ${
                  isMultiSelectMode ? 'cursor-pointer px-1 py-0.5' : ''
                } ${isSelected ? 'bg-emerald-500/10' : ''}`}
              >
                {isMultiSelectMode && (
                  <div className="pt-2.5 pr-0.5 shrink-0 flex items-center justify-center">
                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-zinc-400 dark:border-zinc-600 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                  </div>
                )}
                <div className={`flex-1 flex items-start gap-2 min-w-0 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div
                  onClick={(e) => {
                    if (isMultiSelectMode) return;
                    e.stopPropagation();
                    if (isMe) return;
                    if (msg.senderType === 'ai' || msg.thinkingProcess) {
                      const pool = messagesRef.current?.length ? messagesRef.current : messages;
                      const directThinking =
                        typeof msg.thinkingProcess === 'string' ? msg.thinkingProcess.trim() : '';
                      let resolvedText = directThinking;
                      let resolvedSource = msg.reasoningSource;

                      if (!resolvedText && msg.roundId) {
                        const siblingSameSender = pool.find(
                          (m) =>
                            m.roundId === msg.roundId &&
                            m.senderId === msg.senderId &&
                            typeof m.thinkingProcess === 'string' &&
                            m.thinkingProcess.trim().length > 0
                        );
                        const siblingAny =
                          siblingSameSender ||
                          pool.find(
                            (m) =>
                              m.roundId === msg.roundId &&
                              typeof m.thinkingProcess === 'string' &&
                              m.thinkingProcess.trim().length > 0
                          );
                        if (siblingAny?.thinkingProcess) {
                          resolvedText = siblingAny.thinkingProcess.trim();
                          resolvedSource = siblingAny.reasoningSource || resolvedSource;
                        }
                      }

                      if (resolvedText) {
                        setShowCoTModal({
                          status: 'available',
                          text: resolvedText,
                          source: resolvedSource,
                          senderName: msg.senderName,
                        });
                      } else if (msg.reasoningStatus === 'failed') {
                        setShowCoTModal({
                          status: 'failed',
                          text: '',
                          senderName: msg.senderName,
                        });
                      } else {
                        setShowCoTModal({
                          status: 'empty',
                          text: '',
                          senderName: msg.senderName,
                        });
                      }
                    } else {
                      appendMentionText(`@${msg.senderName} `);
                    }
                  }}
                  className="relative cursor-pointer shrink-0"
                  title={msg.senderType === 'ai' || msg.thinkingProcess ? '点击查看 AI 思考与推理' : `点击快捷@${msg.senderName}`}
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
                <div className={`flex flex-col max-w-[76%] ${isMe ? 'items-end' : 'items-start'} ${isMultiSelectMode ? 'pointer-events-none' : ''}`}>
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
                    {!isMe && lastTypingActorMsgIndex === index && (
                      <span className="wx-muted-text text-[10px] text-zinc-400 dark:text-zinc-500 ml-0.5 animate-pulse">
                        正在输入…
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
                  {msg.messageType === 'forward_bundle' && forwardBundlePayload ? (
                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isMultiSelectMode) setActiveLongPressMsg(msg);
                      }}
                    >
                      <ForwardBundleCard
                        bundle={forwardBundlePayload}
                        isMe={isMe}
                        disabled={isMultiSelectMode}
                        onOpen={(bundle) => {
                          if (!isMultiSelectMode) setBundleDetailPayload(bundle);
                        }}
                      />
                    </div>
                  ) : msg.messageType === 'relay' && msg.payload ? (
                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isMultiSelectMode) setActiveLongPressMsg(msg);
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
                        if (!isMultiSelectMode) setActiveLongPressMsg(msg);
                      }}
                    >
                      <GroupPollCard
                        payload={msg.payload as GroupPollPayload}
                        currentUserId="user_main"
                        canManage={isMe}
                        hasAiMembers={group.members.some((m) => m.memberType !== 'human' && !m.isMuted)}
                        isAiVoting={Boolean(taskStatusInfo && taskStatusInfo.activePollId === msg.id)}
                        votingActorName={
                          taskStatusInfo?.activeActionType === 'voting' &&
                          taskStatusInfo.activePollId === msg.id
                            ? taskStatusInfo.activeActorName || null
                            : null
                        }
                        members={group.members}
                        allCharacters={allCharacters}
                        userAvatar={userProfile.avatar || DEFAULT_USER_AVATAR}
                        onCastVote={(optionIds) => handleCastPollVote(msg.id, optionIds)}
                        onClosePoll={() => handleClosePoll(msg.id)}
                        onRequestAiVotes={() => void handleRequestAiPollVotes(msg.id)}
                      />
                    </div>
                  ) : msg.messageType === 'random_draw' && msg.payload ? (
                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isMultiSelectMode) setActiveLongPressMsg(msg);
                      }}
                    >
                      <GroupRandomDrawCard payload={msg.payload as GroupRandomDrawPayload} />
                    </div>
                  ) : msg.messageType === 'image' && msg.imageUrl ? (
                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isMultiSelectMode) setActiveLongPressMsg(msg);
                      }}
                      onClick={() => {
                        if (!isMultiSelectMode) setZoomedImageUrl(msg.imageUrl || null);
                      }}
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
                        if (!isMultiSelectMode) setActiveLongPressMsg(msg);
                      }}
                      className={`wx-message-bubble relative px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words shadow-sm ${
                        isMe
                          ? 'wx-message-bubble-user bg-[#95EC69] dark:bg-emerald-600 text-black dark:text-white rounded-tr-none'
                          : 'wx-message-bubble-ai bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-black/5 dark:border-white/5 rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  )}
                </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

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
                <>
                  <button
                    type="button"
                    onClick={() => setShowCoTModal({ status: 'failed', text: '' })}
                    className="px-2 py-1 rounded-xl text-rose-600 dark:text-rose-300 hover:bg-rose-500/10 font-medium text-[11px] transition cursor-pointer"
                  >
                    思考状态
                  </button>
                  <button
                    type="button"
                    onClick={() => void groupReplyTaskManager.retryFailedTask(group.id)}
                    className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重试</span>
                  </button>
                </>
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

      {/* Bottom Action Bar (Multi-select) OR Standard Input Bar */}
      {isMultiSelectMode ? (
        <div className="wx-composer px-3 py-2.5 bg-[#F7F7F7] dark:bg-zinc-900 border-t border-zinc-300/70 dark:border-zinc-800 flex items-center justify-around gap-2 shrink-0 z-20">
          <button
            type="button"
            disabled={selectedMsgIds.length === 0}
            onClick={() => {
              const selected = getSelectedGroupMessages();
              if (selected.length > 0) {
                setForwardTargetRequest({ mode: 'merged', messages: selected });
              }
            }}
            className="flex-1 py-2 px-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
            <span>合并转发</span>
          </button>
          <button
            type="button"
            disabled={selectedMsgIds.length === 0}
            onClick={() => {
              const selected = getSelectedGroupMessages();
              if (selected.length > 0) {
                setForwardTargetRequest({ mode: 'individual', messages: selected });
              }
            }}
            className="flex-1 py-2 px-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Forward className="w-3.5 h-3.5 text-blue-500" />
            <span>逐条转发</span>
          </button>
          <button
            type="button"
            disabled={selectedMsgIds.length === 0}
            onClick={() => setShowBatchDeleteConfirm(true)}
            className="flex-1 py-2 px-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 disabled:opacity-40 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除</span>
          </button>
        </div>
      ) : (
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
            placeholder={taskStatusInfo ? '对方正在输入……' : '发送群消息，输入 @ 提及成员...'}
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
      )}

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
              onClick={() => {
                const targetId = activeLongPressMsg.id;
                setActiveLongPressMsg(null);
                setShowPlusMenu(false);
                setShowMentionPicker(false);
                setIsMultiSelectMode(true);
                setSelectedMsgIds([targetId]);
              }}
              className="wx-dropdown-item w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>多选</span>
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
        <div
          onClick={() => setShowCoTModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="wx-modal-card w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-4 shadow-2xl border border-purple-500/30 space-y-3"
          >
            <div className="wx-primary-text flex items-center justify-between font-bold text-xs text-purple-600 dark:text-purple-400">
              <div className="flex items-center gap-1.5">
                <Brain className="w-4 h-4" />
                <span>
                  AI 思考与推理{showCoTModal.senderName ? ` · ${showCoTModal.senderName}` : ''}
                </span>
              </div>
              <button
                onClick={() => setShowCoTModal(null)}
                className="wx-muted-text text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="wx-sub-card wx-primary-text p-3 rounded-2xl bg-purple-500/10 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap font-mono">
              {showCoTModal.status === 'available'
                ? showCoTModal.text
                : showCoTModal.status === 'failed'
                ? '本次请求未成功完成，无法获取思考内容。'
                : '当前模型或中转站未返回思考内容。这不代表模型没有进行内部推理，可能是该模型不开放，或中转站未透传相关字段。'}
            </div>
            <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-500">
              <span className="wx-muted-text">
                {showCoTModal.status === 'available'
                  ? showCoTModal.source && showCoTModal.source !== 'none'
                    ? `来源字段: ${showCoTModal.source}`
                    : 'API 原始返回'
                  : showCoTModal.status === 'failed'
                  ? '请求未完成'
                  : '接口未返回思考字段'}
              </span>
              <button
                type="button"
                onClick={() => setShowCoTModal(null)}
                className="wx-btn-secondary px-3 py-1 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs cursor-pointer"
              >
                关闭
              </button>
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

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            if (!isBatchDeleting) setShowBatchDeleteConfirm(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="wx-modal-card w-full max-w-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-3xl p-4 shadow-2xl space-y-3"
          >
            <h3 className="wx-primary-text text-sm font-bold text-zinc-900 dark:text-zinc-100">
              确认删除已选消息
            </h3>
            <p className="wx-secondary-text text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              确定要从当前群聊记录中删除所选的 {selectedMsgIds.length} 条消息吗？删除后仅移除原消息，已转发的聊天记录包不受影响，此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="wx-btn-secondary px-3.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={() => void handleConfirmBatchDelete()}
                className="wx-btn-danger px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {isBatchDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Target Forward Modal */}
      <ForwardTargetModal
        isOpen={Boolean(forwardTargetRequest)}
        mode={forwardTargetRequest?.mode || 'merged'}
        selectedMessageCount={forwardTargetRequest?.messages.length || 0}
        characters={allCharacters}
        groupChats={allGroups && allGroups.length > 0 ? allGroups : getCachedGroupChats() || [group]}
        userProfile={userProfile}
        onClose={() => setForwardTargetRequest(null)}
        onConfirm={handleConfirmForwardTargets}
      />

      {/* Forward Bundle Detail Modal */}
      <ForwardBundleDetailModal
        bundle={bundleDetailPayload}
        onClose={() => setBundleDetailPayload(null)}
      />

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
