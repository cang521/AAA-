import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Sparkles,
  Settings,
  X,
  Brain,
  Trash2,
  Lock,
  Unlock,
  MoreHorizontal,
  ChevronLeft,
  UserPlus,
  RefreshCw,
  Copy,
  Quote,
  Search,
  BookOpen,
  ImageIcon,
  MessageCircle,
  Users,
  Compass,
  User,
  HeartPulse,
  HardDrive,
  FileSearch,
  ChevronUp,
  ChevronDown,
  Folder,
  FolderOpen,
  CheckCircle2,
  CloudSun,
  Plus,
  KeyRound,
  MessageSquarePlus,
  Palette,
  Check,
  Tag,
  Smile,
  ShieldCheck,
} from 'lucide-react';
import {
  AiCharacter,
  ChatMessage,
  MomentPost,
  UserProfile,
  MenstrualData,
  ApiConfig,
  AiPermissions,
  ApiLog,
  Memo,
  WorldBook,
  WeatherEvent,
  GroupChat,
  GroupMember,
  GroupChatMessage,
  GroupJoinRequest,
} from '../../types';
import { ImagePickerModal } from '../ImagePickerModal';
import { CustomAiCreatorModal } from './CustomAiCreatorModal';
import { ChatBackgroundModal } from './ChatBackgroundModal';
import { ChatSearchModal } from './ChatSearchModal';
import { calculateCycleStats } from '../../lib/menstrual';
import { weatherService } from '../../lib/weatherService';
import { deviceService } from '../../lib/deviceService';
import { systemNativeService } from '../../lib/systemNativeService';
import { loadGroupChats, saveGroupChats } from '../../lib/storage';
import { CreateGroupModal } from './group/CreateGroupModal';
import { GroupChatView } from './group/GroupChatView';
import { JoinGroupByCodeModal } from './group/JoinGroupByCodeModal';
import {
  getMessagesPaged,
  saveChatMessage,
  deleteChatMessage,
  updateChatMessage,
  searchCharacterMessages,
  recallCharacterMemories,
  getCharacterMetaSync,
  subscribeChatDb,
  clearCharacterMessages,
} from '../../lib/chatDb';
import { ChatMessageBubble } from './ChatMessageBubble';

interface WeChatAppProps {
  onBackToLauncher: () => void;
  characters: AiCharacter[];
  messages?: ChatMessage[];
  moments: MomentPost[];
  userProfile: UserProfile;
  menstrualData: MenstrualData;
  memos: Memo[];
  permissions: AiPermissions;
  apiConfig?: ApiConfig;
  worldBooks?: WorldBook[];
  onUpdateCharacters: (chars: AiCharacter[]) => void;
  onUpdateMessages?: (msgs: ChatMessage[]) => void;
  onUpdateMoments: (posts: MomentPost[]) => void;
  onUpdateUserProfile: (profile: UserProfile) => void;
  onAddApiLog: (log: ApiLog) => void;
}

const PAGE_SIZE = 40;

export const WeChatApp: React.FC<WeChatAppProps> = ({
  onBackToLauncher,
  characters = [],
  moments = [],
  userProfile,
  menstrualData,
  memos = [],
  permissions,
  apiConfig,
  worldBooks = [],
  onUpdateCharacters,
  onUpdateMoments,
  onUpdateUserProfile,
  onAddApiLog,
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'moments' | 'me'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Group Chat State
  const [groupChats, setGroupChats] = useState<GroupChat[]>(() => loadGroupChats());
  const [activeGroupChatId, setActiveGroupChatId] = useState<string | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showJoinGroupByCodeModal, setShowJoinGroupByCodeModal] = useState(false);
  const [showTopPlusMenu, setShowTopPlusMenu] = useState(false);

  // Unread AI messages tracking (Requirement 9)
  const [unreadAiCounts, setUnreadAiCounts] = useState<Record<string, number>>({});

  // Active chat paginated messages state
  const [displayedMessages, setDisplayedMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [dbVersionKey, setDbVersionKey] = useState(0);

  // Input & quote states
  const [inputText, setInputText] = useState('');
  const [quoteMsgId, setQuoteMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showWorldBookModal, setShowWorldBookModal] = useState<WorldBook | null>(null);

  // Double click detection on Send Button
  const lastSendClickTimeRef = useRef<number>(0);
  const sendClickTimerRef = useRef<any>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Modals & Drawers
  const [showCoTModal, setShowCoTModal] = useState<string | null>(null);
  const [msgLongPressMenu, setMsgLongPressMenu] = useState<ChatMessage | null>(null);
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [showChatOptionsMenu, setShowChatOptionsMenu] = useState(false);
  const [showNewAiModal, setShowNewAiModal] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [swipedContactId, setSwipedContactId] = useState<string | null>(null);

  // Memory management collapsible folder (Requirement 5)
  const [isMemoryFolderOpen, setIsMemoryFolderOpen] = useState(false);
  const [newMemoryInput, setNewMemoryInput] = useState('');
  const [autoExtractMemoryEnabled, setAutoExtractMemoryEnabled] = useState(true);

  // Real user invite code adding state (Requirement 12)
  const [realUserInviteInput, setRealUserInviteInput] = useState('');
  const [addRealUserFeedback, setAddRealUserFeedback] = useState<string | null>(null);
  const [addFriendActiveTab, setAddFriendActiveTab] = useState<'ai' | 'real_user'>('ai');

  // "Me" Self Persona Adjustment State (Requirement 13)
  const [selfPersonalityInput, setSelfPersonalityInput] = useState(userProfile.personality || '');
  const [selfPreferencesInput, setSelfPreferencesInput] = useState(userProfile.preferences || '');
  const [selfCarePrefInput, setSelfCarePrefInput] = useState(userProfile.chatCarePreference || '');
  const [selfBioInput, setSelfBioInput] = useState(userProfile.bio || '');
  const [selfNameInput, setSelfNameInput] = useState(userProfile.name || '');
  const [copiedInviteCode, setCopiedInviteCode] = useState(false);
  const [meSaveFeedback, setMeSaveFeedback] = useState(false);

  // Image pickers
  const [imagePickerTarget, setImagePickerTarget] = useState<'user' | 'aiAvatar' | 'moment' | 'chatBg' | null>(null);

  // Moments post creation & comments
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImages, setNewPostImages] = useState<string[]>([]);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [openCommentPostId, setOpenCommentPostId] = useState<string | null>(null);

  // Active AI Character
  const activeCharacter = characters.find((c) => c.id === activeChatId) || characters[0];

  // Form states for AI character editing
  const [editedName, setEditedName] = useState('');
  const [editedWxid, setEditedWxid] = useState('');
  const [editedPersona, setEditedPersona] = useState('');
  const [editedPersonality, setEditedPersonality] = useState('');
  const [editedRelationship, setEditedRelationship] = useState('');
  const [editedModelName, setEditedModelName] = useState('');
  const [editedAvatar, setEditedAvatar] = useState('');
  const [editedMenstrualCareEnabled, setEditedMenstrualCareEnabled] = useState(true);
  const [addFriendSearchQuery, setAddFriendSearchQuery] = useState('');

  // Group Chat Handlers
  const handleCreateGroup = (newGroup: GroupChat) => {
    const updated = [newGroup, ...groupChats];
    setGroupChats(updated);
    saveGroupChats(updated);
    setActiveGroupChatId(newGroup.id);
    setActiveTab('chats');
  };

  const handleUpdateGroup = (updatedGroup: GroupChat) => {
    const updated = groupChats.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));
    setGroupChats(updated);
    saveGroupChats(updated);
  };

  const handleDeleteGroup = (groupId: string) => {
    const updated = groupChats.filter((g) => g.id !== groupId);
    setGroupChats(updated);
    saveGroupChats(updated);
    if (activeGroupChatId === groupId) {
      setActiveGroupChatId(null);
    }
  };

  const handleJoinGroupSuccess = (targetGroup: GroupChat, newReq?: GroupJoinRequest) => {
    if (newReq) {
      const existing = groupChats.find((g) => g.id === targetGroup.id) || targetGroup;
      const updatedReqs = [...(existing.joinRequests || []), newReq];
      const updatedGroup = { ...existing, joinRequests: updatedReqs };
      handleUpdateGroup(updatedGroup);
    } else {
      const exists = groupChats.find((g) => g.id === targetGroup.id);
      if (!exists) {
        const updated = [targetGroup, ...groupChats];
        setGroupChats(updated);
        saveGroupChats(updated);
      }
      setActiveGroupChatId(targetGroup.id);
      setActiveTab('chats');
    }
  };

  const handleSimulateIncomingRequest = (
    groupId: string,
    fakeUser: { name: string; avatar: string; bio: string }
  ) => {
    const target = groupChats.find((g) => g.id === groupId);
    if (!target) return;

    const newReq: GroupJoinRequest = {
      id: 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      groupId,
      userId: 'sim_user_' + Date.now(),
      userName: fakeUser.name,
      userAvatar: fakeUser.avatar,
      userBio: fakeUser.bio,
      inviteCodeUsed: target.inviteCode,
      status: 'pending',
      requestedAt: Date.now(),
    };

    const updatedGroup = {
      ...target,
      joinRequests: [...(target.joinRequests || []), newReq],
      updatedAt: Date.now(),
    };
    handleUpdateGroup(updatedGroup);
  };

  // Subscribe to DB updates for real-time contact list previews
  useEffect(() => {
    const unsubscribe = subscribeChatDb(() => {
      setDbVersionKey((k) => k + 1);
    });
    return () => unsubscribe();
  }, []);

  // Sync AI character editing form values
  useEffect(() => {
    if (activeCharacter) {
      setEditedName(activeCharacter.name || '');
      setEditedWxid(activeCharacter.wxid || '');
      setEditedPersona(activeCharacter.persona || '');
      setEditedPersonality(activeCharacter.personality || '');
      setEditedRelationship(activeCharacter.relationship || '好友');
      setEditedModelName(activeCharacter.modelConfig?.modelName || '');
      setEditedAvatar(activeCharacter.avatar || '');
      setEditedMenstrualCareEnabled(activeCharacter.menstrualCare?.enabled !== false);
    }
  }, [activeCharacter?.id, showAiSettingsModal]);

  // Sync self persona form values from userProfile
  useEffect(() => {
    if (userProfile) {
      setSelfPersonalityInput(userProfile.personality || '');
      setSelfPreferencesInput(userProfile.preferences || '');
      setSelfCarePrefInput(userProfile.chatCarePreference || '');
      setSelfBioInput(userProfile.bio || '');
      setSelfNameInput(userProfile.name || '');
    }
  }, [userProfile]);

  // Clear unread count when opening a chat (Requirement 9)
  const handleOpenChat = (charId: string) => {
    setActiveChatId(charId);
    setUnreadAiCounts((prev) => ({
      ...prev,
      [charId]: 0,
    }));
  };

  // Load initial page of messages when opening a chat
  useEffect(() => {
    if (!activeChatId) {
      setDisplayedMessages([]);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const result = await getMessagesPaged(activeChatId, PAGE_SIZE);
        if (isMounted) {
          setDisplayedMessages(result.messages);
          setHasMoreOlder(result.hasMore);
          setTotalHistoryCount(result.totalCount);
          // Auto scroll to bottom
          requestAnimationFrame(() => {
            if (messageListRef.current) {
              messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
            }
          });
        }
      } catch (err) {
        console.error('Failed to load chat messages from DB', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeChatId]);

  // Load older messages on demand (Pagination / Scroll Up)
  const handleLoadOlderMessages = async () => {
    if (!activeChatId || isLoadingOlder || !hasMoreOlder || displayedMessages.length === 0) return;

    const oldestTimestamp = displayedMessages[0].timestamp;
    const container = messageListRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    setIsLoadingOlder(true);
    try {
      const result = await getMessagesPaged(activeChatId, PAGE_SIZE, oldestTimestamp);
      setDisplayedMessages((prev) => [...result.messages, ...prev]);
      setHasMoreOlder(result.hasMore);
      setTotalHistoryCount(result.totalCount);

      // Preserve exact scroll position after prepending older items
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
        }
      });
    } catch (e) {
      console.error('Failed to load older messages', e);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Scroll to bottom helper
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

  // Map of quoted messages for quick lookup
  const quotesMap = new Map<string, string>();
  displayedMessages.forEach((m) => {
    quotesMap.set(m.id, m.text);
  });

  // 1. Single User Message Send (Queues without immediate AI reply)
  const handleSendUserOnlyMessage = async (text: string) => {
    if (!text.trim() || !activeCharacter) return;

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      characterId: activeCharacter.id,
      sender: 'user',
      text: text.trim(),
      timestamp: Date.now(),
      quoteMessageId: quoteMsgId || undefined,
    };

    setInputText('');
    setQuoteMsgId(null);
    setDisplayedMessages((prev) => [...prev, userMsg]);
    setTotalHistoryCount((c) => c + 1);
    scrollToBottom(true);

    try {
      await saveChatMessage(userMsg);
    } catch (e) {
      console.error('Save chat message error', e);
    }
  };

  // 2. Trigger AI Reply for all pending consecutive user messages
  const handleTriggerAiReply = async (optionalImmediateUserText?: string) => {
    if (!activeCharacter || isLoading) return;

    let currentDisplayed = [...displayedMessages];

    // If there's pending input in text box, send it first
    if (optionalImmediateUserText && optionalImmediateUserText.trim()) {
      const userMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        characterId: activeCharacter.id,
        sender: 'user',
        text: optionalImmediateUserText.trim(),
        timestamp: Date.now(),
        quoteMessageId: quoteMsgId || undefined,
      };
      setInputText('');
      setQuoteMsgId(null);
      currentDisplayed.push(userMsg);
      setDisplayedMessages(currentDisplayed);
      setTotalHistoryCount((c) => c + 1);
      scrollToBottom(true);
      saveChatMessage(userMsg).catch((e) => console.error('Save user msg error', e));
    }

    // Find all consecutive unreplied user messages
    const pendingUserMsgs: ChatMessage[] = [];
    for (let i = currentDisplayed.length - 1; i >= 0; i--) {
      if (currentDisplayed[i].sender === 'user') {
        pendingUserMsgs.unshift(currentDisplayed[i]);
      } else {
        break;
      }
    }

    const combinedUserText =
      pendingUserMsgs.length > 1
        ? pendingUserMsgs.map((m, idx) => `[第 ${idx + 1} 句] ${m.text}`).join('\n')
        : pendingUserMsgs.length === 1
        ? pendingUserMsgs[0].text
        : '你好呀！';

    // Find associated WorldBook for this character
    const associatedWorldBook = (worldBooks || []).find((wb) =>
      wb.associatedCharacterIds?.includes(activeCharacter.id)
    );

    // Calculate menstrual stats
    const cycleStats = calculateCycleStats(menstrualData);

    // Fetch Weather Data if permitted
    const weatherInfo =
      permissions?.appAccess?.weatherData !== false
        ? await weatherService.getWeather().catch(() => null)
        : null;

    setIsLoading(true);

    try {
      // Intelligently recall historical memories from IndexedDB using RAG engine
      const { recalledText } = await recallCharacterMemories(activeCharacter.id, combinedUserText, 4);

      // Fetch External Devices Summary if permitted
      const devicesSummary =
        permissions?.deviceAccess?.viewStatus !== false
          ? deviceService.getSanitizedDevicesSummary(permissions)
          : undefined;

      const recentHistoryWindow = currentDisplayed.slice(-16);

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: activeCharacter,
          userMessage: combinedUserText,
          conversationHistory: recentHistoryWindow,
          recalledMemoriesSummary: recalledText || undefined,
          userProfile,
          systemTime: systemNativeService.getRealSystemTime().summaryString,
          locationCity: weatherInfo?.city,
          menstrualInfo: cycleStats,
          weatherInfo,
          devicesSummary,
          memosSummary: memos.map((m) => `- ${m.title}: ${m.content}`).join('\n'),
          associatedWorldBook:
            permissions?.appAccess?.worldBookData !== false && associatedWorldBook
              ? {
                  title: associatedWorldBook.title,
                  description: associatedWorldBook.description,
                  worldSetting: associatedWorldBook.worldSetting,
                  entries: associatedWorldBook.entries,
                }
              : null,
          permissions,
          apiConfig,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.deviceActions && Array.isArray(data.deviceActions) && data.deviceActions.length > 0) {
          for (const devAct of data.deviceActions) {
            if (devAct.deviceId && devAct.actionId) {
              deviceService.executeAction(devAct.deviceId, devAct.actionId, devAct.params || {}, {
                source: 'ai',
                aiCharacterName: activeCharacter.name,
                permissions,
              }).catch((err) => console.warn('AI device action execution error:', err));
            }
          }
        }

        const aiMsg: ChatMessage = {
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          characterId: activeCharacter.id,
          sender: 'ai',
          text: data.text,
          timestamp: Date.now(),
          thinkingProcess:
            data.thinkingProcess ||
            `【推理分析】:\n1. 结合角色人设 [${activeCharacter.persona}]\n2. ${
              associatedWorldBook ? `融入世界书设定 [《${associatedWorldBook.title}》]` : '无关联世界书，按日常设定回复'
            }\n3. 检索长期记忆 [${activeCharacter.memories?.join('; ')}]\n4. 形成专属口吻回复。`,
        };

        // Update local displayed state
        setDisplayedMessages((prev) => [...prev, aiMsg]);
        setTotalHistoryCount((c) => c + 1);
        scrollToBottom(true);

        // Save to IndexedDB
        saveChatMessage(aiMsg).catch((e) => console.error('Save AI msg error', e));

        if (data.apiLog) onAddApiLog(data.apiLog);

        // Vibration
        if (permissions?.realDevice?.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([60, 40, 60]);
        }

        // Auto Extract Memory
        if (autoExtractMemoryEnabled && combinedUserText.length > 5) {
          const autoMem = `对话提及: "${combinedUserText.slice(0, 20)}..."`;
          if (!activeCharacter.memories?.includes(autoMem)) {
            const updatedMem = [...(activeCharacter.memories || []), autoMem];
            onUpdateCharacters(
              characters.map((c) =>
                c.id === activeCharacter.id ? { ...c, memories: updatedMem } : c
              )
            );
          }
        }
      }
    } catch (e) {
      console.error('Chat error', e);
      const fallbackMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        characterId: activeCharacter.id,
        sender: 'ai',
        text: `${activeCharacter.name}: 刚刚网络开小差了，不过我已经收到你的消息啦！随时跟我说说你的近况吧~`,
        timestamp: Date.now(),
        thinkingProcess: `【离线本地思考模式】:\n网络异常，触发备用温情回复。`,
      };
      setDisplayedMessages((prev) => [...prev, fallbackMsg]);
      setTotalHistoryCount((c) => c + 1);
      scrollToBottom(true);
      saveChatMessage(fallbackMsg).catch((err) => console.error(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger Proactive Care Message based on Menstrual Health Status (Requirement 7)
  const handleTriggerProactiveCare = async () => {
    if (!activeCharacter) return;
    const cycleStats = calculateCycleStats(menstrualData);
    const weatherInfo =
      permissions?.appAccess?.weatherData !== false
        ? await weatherService.getWeather().catch(() => null)
        : null;
    setIsLoading(true);

    try {
      const res = await fetch('/api/gemini/proactive-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: activeCharacter,
          userProfile,
          cycleStats,
          weatherInfo,
          recentMessages: displayedMessages.slice(-8),
        }),
      });

      const data = await res.json();
      if (data.success && data.text) {
        const aiMsg: ChatMessage = {
          id: 'msg_' + Date.now(),
          characterId: activeCharacter.id,
          sender: 'ai',
          text: data.text,
          timestamp: Date.now(),
          thinkingProcess:
            data.thinkingProcess ||
            `【生理周期关怀思考】:\n1. 感知用户生理阶段：${cycleStats.phaseTitle}\n2. 阶段关怀建议：${cycleStats.phaseAdvice}\n3. 结合【${activeCharacter.name}】人设严防OOC输出。`,
        };
        setDisplayedMessages((prev) => [...prev, aiMsg]);
        setTotalHistoryCount((c) => c + 1);
        scrollToBottom(true);
        saveChatMessage(aiMsg).catch((e) => console.error(e));
        if (data.apiLog) onAddApiLog(data.apiLog);

        if (permissions?.realDevice?.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([80, 50, 80]);
        }
      }
    } catch (e) {
      console.error('Proactive care error', e);
      const fallbackText =
        cycleStats.currentPeriodDay !== null
          ? `${activeCharacter.name}: 看到你今天在经期第 ${cycleStats.currentPeriodDay} 天，肚子会不会不舒服？一定要多喝温水、注意保暖，别太累了哦，有任何事随时跟我说。🌸`
          : `${activeCharacter.name}: 提醒你一下哦，还有 ${cycleStats.daysUntilNextPeriod} 天就要来例假了，提前备好温水和保暖物品，这几天别贪凉啦！❤️`;
      const fallbackMsg: ChatMessage = {
        id: 'msg_' + Date.now(),
        characterId: activeCharacter.id,
        sender: 'ai',
        text: fallbackText,
        timestamp: Date.now(),
        thinkingProcess: `【本地经期关怀引擎】:\n1. 捕获经期数据\n2. 触发人设主动问候。`,
      };
      setDisplayedMessages((prev) => [...prev, fallbackMsg]);
      setTotalHistoryCount((c) => c + 1);
      scrollToBottom(true);
      saveChatMessage(fallbackMsg).catch((err) => console.error(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Send Button Double Click / Single Click Router
  const handleSendButtonClick = () => {
    const now = Date.now();
    const timeSinceLast = now - lastSendClickTimeRef.current;
    lastSendClickTimeRef.current = now;

    if (timeSinceLast < 380) {
      if (sendClickTimerRef.current) {
        clearTimeout(sendClickTimerRef.current);
        sendClickTimerRef.current = null;
      }
      lastSendClickTimeRef.current = 0;
      handleTriggerAiReply(inputText.trim());
    } else {
      if (sendClickTimerRef.current) clearTimeout(sendClickTimerRef.current);
      sendClickTimerRef.current = setTimeout(() => {
        handleSendUserOnlyMessage(inputText.trim());
        sendClickTimerRef.current = null;
      }, 220);
    }
  };

  // Jump to specific message and highlight (Requirement 6)
  const handleSelectSearchedMessage = (msgId: string) => {
    setHighlightedMsgId(msgId);
    setTimeout(() => {
      const el = document.getElementById(`msg-bubble-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    setTimeout(() => {
      setHighlightedMsgId(null);
    }, 3000);
  };

  // Add/Delete Memory in Collapsible Folder
  const handleAddMemory = () => {
    if (!newMemoryInput.trim() || !activeCharacter) return;
    const updated = [...(activeCharacter.memories || []), newMemoryInput.trim()];
    onUpdateCharacters(
      characters.map((c) => (c.id === activeCharacter.id ? { ...c, memories: updated } : c))
    );
    setNewMemoryInput('');
  };

  const handleDeleteMemory = (index: number) => {
    if (!activeCharacter) return;
    const updated = (activeCharacter.memories || []).filter((_, i) => i !== index);
    onUpdateCharacters(
      characters.map((c) => (c.id === activeCharacter.id ? { ...c, memories: updated } : c))
    );
  };

  // Save Custom Chat Background (Requirement 4)
  const handleSaveChatBackground = (bgUrl: string | undefined) => {
    if (!activeCharacter) return;
    onUpdateCharacters(
      characters.map((c) =>
        c.id === activeCharacter.id ? { ...c, customBackground: bgUrl } : c
      )
    );
  };

  // Save "Me" profile self persona (Requirement 13)
  const handleSaveSelfPersona = () => {
    onUpdateUserProfile({
      ...userProfile,
      name: selfNameInput.trim() || userProfile.name,
      bio: selfBioInput.trim(),
      personality: selfPersonalityInput.trim(),
      preferences: selfPreferencesInput.trim(),
      chatCarePreference: selfCarePrefInput.trim(),
    });
    setMeSaveFeedback(true);
    setTimeout(() => setMeSaveFeedback(false), 2500);
  };

  // Copy User Personal Invite Code
  const handleCopyUserInviteCode = () => {
    const code = userProfile.inviteCode || 'US-888888';
    navigator.clipboard?.writeText(
      `【微信名片邀请】这是我的专属个人微信号邀请码：${code}，在微信添加朋友页面输入即可添加我为好友！`
    );
    setCopiedInviteCode(true);
    setTimeout(() => setCopiedInviteCode(false), 2000);
  };

  // Handle Add Real User by Invite Code (Requirement 12)
  const handleAddRealUserByCode = () => {
    const code = realUserInviteInput.trim().toUpperCase();
    if (!code) return;

    if (code === userProfile.inviteCode) {
      setAddRealUserFeedback('这是您自己的专属邀请码哦！');
      return;
    }

    setAddRealUserFeedback(`已通过邀请码 [${code}] 发送好友申请，对方确认后将自动添加至通讯录！`);
    setTimeout(() => {
      setRealUserInviteInput('');
      setAddRealUserFeedback(null);
      setShowAddFriendModal(false);
    }, 2000);
  };

  // Clear history for active character
  const handleClearHistory = async () => {
    if (!activeCharacter) return;
    if (window.confirm(`确定要清空与「${activeCharacter.name}」的所有聊天记录吗？此操作无法撤销。`)) {
      await clearCharacterMessages(activeCharacter.id);
      setDisplayedMessages([]);
      setTotalHistoryCount(0);
      setShowAiSettingsModal(false);
    }
  };

  // Delete single message
  const handleDeleteMessage = async (msgId: string) => {
    if (!activeCharacter) return;
    await deleteChatMessage(msgId, activeCharacter.id);
    setDisplayedMessages((prev) => prev.filter((m) => m.id !== msgId));
    setTotalHistoryCount((c) => Math.max(0, c - 1));
    setMsgLongPressMenu(null);
  };

  // Refresh / Regenerate AI response
  const handleRefreshAiResponse = async (aiMsg: ChatMessage) => {
    if (!activeCharacter) return;
    setMsgLongPressMenu(null);
    setDisplayedMessages((prev) => prev.filter((m) => m.id !== aiMsg.id));
    setTotalHistoryCount((c) => Math.max(0, c - 1));
    await deleteChatMessage(aiMsg.id, activeCharacter.id);
    handleTriggerAiReply();
  };

  // Context Menu handlers
  const handleMessageContextMenu = (msg: ChatMessage) => {
    setMsgLongPressMenu(msg);
  };

  const handleOpenCoT = (msgId: string) => {
    setShowCoTModal(msgId);
  };

  // Add custom AI character (Requirement 11)
  const handleAddCustomCharacter = (newChar: AiCharacter) => {
    onUpdateCharacters([...characters, newChar]);
    setShowNewAiModal(false);
    setActiveChatId(newChar.id);
    setActiveTab('chats');
  };

  // Add preset AI character
  const handleAddPresetAi = (preset: any) => {
    const newChar: AiCharacter = {
      id: 'char_preset_' + Date.now(),
      name: preset.name,
      wxid: preset.wxid || 'ai_' + Math.random().toString(36).slice(2, 7),
      relationship: preset.relationship,
      avatar: preset.avatar,
      persona: preset.persona,
      personality: preset.personality,
      greeting: preset.greeting,
      memories: preset.memories || [],
      tags: preset.tags || [],
      isLocked: false,
      isCustom: true,
      menstrualCare: {
        enabled: true,
        notificationFrequency: 'daily',
      },
    };
    onUpdateCharacters([...characters, newChar]);
    setShowAddFriendModal(false);
    setActiveChatId(newChar.id);
    setActiveTab('chats');
  };

  // Create Moments Post
  const handleCreatePost = () => {
    if (!newPostContent.trim()) return;
    const newPost: MomentPost = {
      id: 'post_' + Date.now(),
      authorId: 'user_main',
      authorName: userProfile.name,
      authorAvatar: userProfile.avatar,
      content: newPostContent.trim(),
      images: newPostImages,
      timestamp: Date.now(),
      likes: [],
      comments: [],
    };
    onUpdateMoments([newPost, ...moments]);
    setNewPostContent('');
    setNewPostImages([]);
    setShowCreatePostModal(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-900 text-white select-none overflow-hidden font-sans">
      {/* Top Navigation Bar Header */}
      {!activeGroupChatId && (
        <div className="h-12 bg-zinc-850 border-b border-zinc-800 px-3 flex items-center justify-between shrink-0 z-20">
          <button
            onClick={() => {
              if (activeChatId) {
                setActiveChatId(null);
              } else {
                onBackToLauncher();
              }
            }}
            className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{activeChatId ? '微信' : '返回'}</span>
          </button>

          <div className="flex flex-col items-center">
            <h2 className="text-sm font-semibold tracking-wide flex items-center gap-1.5">
              {activeTab === 'chats' && (activeChatId ? activeCharacter.name : '微信')}
              {activeTab === 'contacts' && '通讯录'}
              {activeTab === 'moments' && '朋友圈'}
              {activeTab === 'me' && '我'}
            </h2>
            {activeTab === 'chats' && activeChatId && (
              <span className="text-[9px] text-zinc-500 font-mono">
                {totalHistoryCount > 0 ? `${totalHistoryCount} 条历史` : '在线'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {activeTab === 'chats' && activeChatId && (
              <div className="relative">
                <button
                  onClick={() => setShowChatOptionsMenu(!showChatOptionsMenu)}
                  className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                  title="聊天设置与背景"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {/* Chat Top-Right Options Dropdown */}
                {showChatOptionsMenu && (
                  <div
                    className="absolute right-0 top-10 w-44 bg-zinc-850 rounded-2xl shadow-2xl border border-zinc-750 p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setShowChatOptionsMenu(false);
                        setShowSearchModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-amber-400 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-amber-400" />
                      <span>查找聊天记录</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowChatOptionsMenu(false);
                        setShowBackgroundModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Palette className="w-3.5 h-3.5 text-emerald-400" />
                      <span>自定义聊天背景</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowChatOptionsMenu(false);
                        setShowAiSettingsModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-indigo-400 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-indigo-400" />
                      <span>AI 人设与记忆管理</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'chats' && !activeChatId && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTopPlusMenu(!showTopPlusMenu);
                  }}
                  className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 hover:text-emerald-300 transition flex items-center justify-center cursor-pointer"
                  title="群聊与功能菜单"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* Plus Dropdown Menu (Requirement 1: Group Chat reminder moved here) */}
                {showTopPlusMenu && (
                  <div
                    className="absolute right-0 top-10 w-48 bg-zinc-850 rounded-2xl shadow-2xl border border-zinc-750 p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Group Chat Space Entry */}
                    <button
                      onClick={() => {
                        setShowTopPlusMenu(false);
                        if (groupChats.length > 0) {
                          setActiveGroupChatId(groupChats[0].id);
                        } else {
                          setShowCreateGroupModal(true);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center justify-between transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <span>群聊空间</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 font-mono">
                        {groupChats.length}个群
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setShowTopPlusMenu(false);
                        setShowCreateGroupModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center gap-2.5 transition"
                    >
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                      </div>
                      <span>发起群聊</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowTopPlusMenu(false);
                        setShowJoinGroupByCodeModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-amber-400 flex items-center gap-2.5 transition"
                    >
                      <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <KeyRound className="w-3.5 h-3.5" />
                      </div>
                      <span>输入群邀请码</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowTopPlusMenu(false);
                        setShowNewAiModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-teal-400 flex items-center gap-2.5 transition"
                    >
                      <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span>创建专属 AI 好友</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowTopPlusMenu(false);
                        setShowAddFriendModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-indigo-400 flex items-center gap-2.5 transition"
                    >
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                        <UserPlus className="w-3.5 h-3.5" />
                      </div>
                      <span>添加朋友</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contacts' && (
              <button
                onClick={() => setShowAddFriendModal(true)}
                className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1 text-xs font-medium cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>加好友</span>
              </button>
            )}

            {activeTab === 'moments' && (
              <button
                onClick={() => setShowCreatePostModal(true)}
                className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>发动态</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Body View */}
      <div className="flex-1 overflow-hidden relative">
        {/* Active Group Chat View (Requirement 2: Full screen view, bottom bar is hidden) */}
        {activeGroupChatId ? (
          <GroupChatView
            group={groupChats.find((g) => g.id === activeGroupChatId) || groupChats[0]}
            onBack={() => setActiveGroupChatId(null)}
            allCharacters={characters}
            userProfile={userProfile}
            apiConfig={apiConfig}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={handleDeleteGroup}
            onAddApiLog={onAddApiLog}
          />
        ) : (
          <>
            {/* TAB 1: CHATS (聊天) */}
            {activeTab === 'chats' && (
              <div className="w-full h-full flex flex-col">
                {activeChatId ? (
                  // Active 1-on-1 Conversation View with Custom Background Support (Requirement 4)
                  <div
                    className="w-full h-full flex flex-col bg-zinc-950 relative"
                    style={
                      activeCharacter?.customBackground
                        ? {
                            backgroundImage: `url(${activeCharacter.customBackground})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : {}
                    }
                  >
                    {/* Semi-transparent backdrop blur overlay if custom background is present */}
                    {activeCharacter?.customBackground && (
                      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] pointer-events-none z-0" />
                    )}

                    {/* Message Log Container */}
                    <div
                      ref={messageListRef}
                      className="flex-1 overflow-y-auto p-3 space-y-3 overscroll-contain z-10"
                    >
                      {/* Load More Older Messages Button / Indicator */}
                      {hasMoreOlder && (
                        <div className="flex justify-center py-1">
                          <button
                            onClick={handleLoadOlderMessages}
                            disabled={isLoadingOlder}
                            className="px-3 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-50 text-zinc-400 hover:text-zinc-200 text-[11px] font-medium border border-zinc-750 flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                          >
                            <ChevronUp className={`w-3.5 h-3.5 ${isLoadingOlder ? 'animate-bounce' : ''}`} />
                            <span>
                              {isLoadingOlder
                                ? '正在加载更早历史...'
                                : `加载更早历史 (${displayedMessages.length} / ${totalHistoryCount})`}
                            </span>
                          </button>
                        </div>
                      )}

                      {!hasMoreOlder && totalHistoryCount > 0 && (
                        <div className="text-center py-1 text-[10px] text-zinc-500 font-mono">
                          — 已加载全部 {totalHistoryCount} 条历史消息 —
                        </div>
                      )}

                      {/* Rendered Messages with Search Highlight (Requirement 6) */}
                      {displayedMessages.map((msg) => (
                        <ChatMessageBubble
                          key={msg.id}
                          msg={msg}
                          isUser={msg.sender === 'user'}
                          avatar={msg.sender === 'user' ? userProfile.avatar : activeCharacter.avatar}
                          name={msg.sender === 'user' ? userProfile.name : activeCharacter.name}
                          quoteText={msg.quoteMessageId ? quotesMap.get(msg.quoteMessageId) : undefined}
                          onOpenCoT={handleOpenCoT}
                          onContextMenu={handleMessageContextMenu}
                          isHighlighted={highlightedMsgId === msg.id}
                        />
                      ))}

                      {isLoading && (
                        <div className="flex gap-2.5 items-center text-xs text-zinc-300 pt-1">
                          <div className="w-8 h-8 rounded-xl bg-zinc-800/90 flex items-center justify-center animate-pulse">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="animate-pulse">{activeCharacter.name} 正在思考中...</span>
                        </div>
                      )}
                    </div>

                    {/* Quote Indicator */}
                    {quoteMsgId && (
                      <div className="px-3 py-1.5 bg-zinc-850/90 backdrop-blur-xs border-t border-zinc-750 flex items-center justify-between text-xs text-zinc-300 z-10">
                        <span className="truncate max-w-[80%] text-[11px]">
                          引用: {quotesMap.get(quoteMsgId) || '已选消息'}
                        </span>
                        <button
                          onClick={() => setQuoteMsgId(null)}
                          className="text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Message Input Box */}
                    {(() => {
                      let unrepliedCount = 0;
                      for (let i = displayedMessages.length - 1; i >= 0; i--) {
                        if (displayedMessages[i].sender === 'user') unrepliedCount++;
                        else break;
                      }

                      return (
                        <div className="p-2 bg-zinc-850/90 backdrop-blur-xs border-t border-zinc-800 flex items-center gap-1.5 shrink-0 z-10">
                          <input
                            ref={inputRef}
                            type="text"
                            placeholder={`给 ${activeCharacter.name} 发送消息... (Enter发送)`}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (e.shiftKey) {
                                  handleTriggerAiReply(inputText.trim());
                                } else {
                                  handleSendUserOnlyMessage(inputText.trim());
                                }
                              }
                            }}
                            className="flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                          <button
                            onClick={handleSendButtonClick}
                            onDoubleClick={() => handleTriggerAiReply(inputText.trim())}
                            disabled={isLoading || (!inputText.trim() && unrepliedCount === 0)}
                            title="单击发送当前消息（可连发多句）；快速双击直接召唤 AI 综合回复"
                            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 text-white font-medium text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>发送</span>
                          </button>
                          <button
                            onClick={() => handleTriggerAiReply(inputText.trim())}
                            disabled={isLoading || (unrepliedCount === 0 && !inputText.trim())}
                            title="立即召唤 AI 结合上下文与记忆开始思考回复"
                            className="px-2.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-30 text-white font-medium text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                            <span className="hidden sm:inline">召唤回复</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  // Chat List View (Includes Group Chats + 1-on-1 Character Chats)
                  <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80">
                    {/* Group Chats Section */}
                    {groupChats.map((group) => {
                      const lastMsg =
                        group.messages && group.messages.length > 0
                          ? group.messages[group.messages.length - 1]
                          : null;

                      return (
                        <div
                          key={group.id}
                          onClick={() => setActiveGroupChatId(group.id)}
                          className="p-3 flex items-center gap-3 hover:bg-zinc-800/60 active:bg-zinc-800 cursor-pointer transition bg-zinc-900/40"
                        >
                          <div className="relative shrink-0">
                            <img
                              src={group.avatar}
                              alt={group.name}
                              className="w-12 h-12 rounded-2xl object-cover border border-emerald-500/40 shadow-xs"
                            />
                            <span className="absolute -bottom-1 -right-1 px-1 rounded-full bg-emerald-600 text-white text-[8px] font-bold">
                              群
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <h4 className="font-semibold text-sm text-zinc-100 truncate">
                                  {group.name}
                                </h4>
                                <span className="text-xs text-zinc-500 font-bold shrink-0">
                                  ({group.members.length})
                                </span>
                              </div>
                              <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-1">
                                {lastMsg
                                  ? new Date(lastMsg.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '刚刚'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="text-xs text-zinc-400 truncate flex-1">
                                {lastMsg ? (
                                  <>
                                    <span className="text-emerald-400/90 font-medium">
                                      {lastMsg.senderName}:{' '}
                                    </span>
                                    <span>{lastMsg.text}</span>
                                  </>
                                ) : (
                                  group.notice || '群聊已创建，开启畅聊吧'
                                )}
                              </p>
                              {group.messages && group.messages.length > 0 && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 shrink-0 font-mono">
                                  {group.messages.length}条
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* 1-on-1 Character Chats Section with Requirement 9: AI sent message notification */}
                    {characters.map((char) => {
                      const meta = getCharacterMetaSync(char.id);
                      const lastMsg = meta.lastMessage;
                      const unreadCount = unreadAiCounts[char.id] || 0;

                      return (
                        <div
                          key={char.id}
                          onClick={() => handleOpenChat(char.id)}
                          className="p-3 flex items-center gap-3 hover:bg-zinc-800/60 active:bg-zinc-800 cursor-pointer transition"
                        >
                          <div className="relative shrink-0">
                            <img
                              src={char.avatar}
                              alt=""
                              className="w-12 h-12 rounded-2xl object-cover border border-zinc-700 shrink-0"
                            />
                            {unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                                {unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-sm text-zinc-100">{char.name}</h4>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                {lastMsg
                                  ? new Date(lastMsg.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '刚刚'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="text-xs text-zinc-400 truncate flex-1">
                                {lastMsg ? lastMsg.text : char.greeting}
                              </p>
                              {/* Requirement 9: Show "AI发来了几条消息" when unread, disappearing after view */}
                              {unreadCount > 0 ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 font-medium animate-pulse">
                                  AI发来 {unreadCount} 条消息
                                </span>
                              ) : meta.totalCount > 0 ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0 font-mono">
                                  {meta.totalCount}条
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CONTACTS (通讯录) */}
            {activeTab === 'contacts' && (
              <div className="w-full h-full overflow-y-auto p-3 space-y-2">
                {/* Top Action Entry: Group Chats */}
                <div
                  onClick={() => setShowCreateGroupModal(true)}
                  className="p-3 rounded-2xl bg-gradient-to-r from-zinc-800 to-zinc-800/80 border border-zinc-750 hover:border-emerald-500/40 flex items-center justify-between cursor-pointer transition shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-100">群聊 ({groupChats.length})</h4>
                      <p className="text-[10px] text-zinc-400">发起或管理多人群聊空间</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCreateGroupModal(true);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition"
                  >
                    发起群聊
                  </button>
                </div>

                {/* Top Action Entry: Add Friend (Requirement 11 & 12) */}
                <div
                  onClick={() => setShowAddFriendModal(true)}
                  className="p-3 rounded-2xl bg-zinc-800/60 border border-zinc-750 hover:border-indigo-500/40 flex items-center justify-between cursor-pointer transition shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-100">新的朋友</h4>
                      <p className="text-[10px] text-zinc-400">创建专属 AI 或通过邀请码加真人</p>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 rotate-180 text-zinc-500" />
                </div>

                <div className="flex items-center justify-between px-1 pt-2 mb-1">
                  <h3 className="text-xs font-semibold text-zinc-400">
                    好友列表 ({characters.length})
                  </h3>
                  <span className="text-[10px] text-zinc-500">向左轻扫卡片显示「锁定」与「删除」</span>
                </div>

                {/* Friend List with Swipe Left Actions (Requirement 10) */}
                {characters.map((char) => {
                  const isSwiped = swipedContactId === char.id;

                  return (
                    <div
                      key={char.id}
                      className="relative overflow-hidden rounded-2xl bg-zinc-800/80 border border-zinc-750 hover:border-zinc-650 transition shadow-xs"
                    >
                      <div
                        onClick={() => {
                          handleOpenChat(char.id);
                          setActiveTab('chats');
                        }}
                        className={`p-3 flex items-center gap-3 transition-transform duration-200 cursor-pointer ${
                          isSwiped ? '-translate-x-32' : 'translate-x-0'
                        }`}
                      >
                        <img
                          src={char.avatar}
                          alt=""
                          className="w-12 h-12 rounded-2xl object-cover border border-zinc-700 shrink-0 shadow-xs"
                        />
                        <div className="flex-1 min-w-0">
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

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSwipedContactId(isSwiped ? null : char.id);
                          }}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                          title="展开快捷操作"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Requirement 10: Swipe Left Actions (Hidden by default, revealed on swipe/click) */}
                      <div className="absolute right-0 top-0 bottom-0 flex items-center">
                        {char.isLocked ? (
                          <button
                            onClick={() => {
                              onUpdateCharacters(
                                characters.map((c) => (c.id === char.id ? { ...c, isLocked: false } : c))
                              );
                              setSwipedContactId(null);
                            }}
                            className="h-full px-4 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition"
                          >
                            <Unlock className="w-4 h-4" /> 解锁
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                onUpdateCharacters(
                                  characters.map((c) => (c.id === char.id ? { ...c, isLocked: true } : c))
                                );
                                setSwipedContactId(null);
                              }}
                              className="h-full px-3 bg-zinc-700 hover:bg-zinc-600 text-amber-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition"
                            >
                              <Lock className="w-4 h-4" /> 锁定
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`确定要删除好友「${char.name}」吗？`)) {
                                  onUpdateCharacters(characters.filter((c) => c.id !== char.id));
                                  setSwipedContactId(null);
                                }
                              }}
                              className="h-full px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition"
                            >
                              <Trash2 className="w-4 h-4" /> 删除
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB 3: MOMENTS (朋友圈) */}
        {activeTab === 'moments' && (
          <div className="w-full h-full overflow-y-auto p-3 space-y-4">
            {moments.map((post) => (
              <div
                key={post.id}
                className="p-3.5 rounded-2xl bg-zinc-800/80 border border-zinc-750 text-xs space-y-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <img src={post.authorAvatar} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  <div>
                    <h4 className="font-semibold text-sm text-emerald-400">{post.authorName}</h4>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(post.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>

                <p className="text-zinc-200 leading-relaxed text-xs">{post.content}</p>

                {post.images && post.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl overflow-hidden">
                    {post.images.map((img, i) => (
                      <img key={i} src={img} alt="" className="w-full h-24 object-cover rounded-lg" />
                    ))}
                  </div>
                )}

                {/* Likes & Comments */}
                <div className="pt-2 border-t border-zinc-700/60 space-y-2">
                  <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                    <span>❤️ {post.likes.length} 赞</span>
                    <span>💬 {post.comments.length} 条评论</span>
                  </div>

                  {post.likes.length > 0 && (
                    <div className="text-[11px] text-zinc-400 bg-zinc-850 p-2 rounded-xl">
                      ❤️ {post.likes.map((l) => l.name).join('、')} 觉得很赞
                    </div>
                  )}

                  {post.comments.length > 0 && (
                    <div className="space-y-1.5 bg-zinc-850 p-2.5 rounded-xl text-[11px]">
                      {post.comments.map((c) => (
                        <div key={c.id} className="leading-snug">
                          <span className="font-semibold text-emerald-400">{c.authorName}: </span>
                          <span className="text-zinc-300">{c.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: ME (我) with Self-Persona Adjustments (Requirement 13) */}
        {activeTab === 'me' && (
          <div className="w-full h-full overflow-y-auto p-4 space-y-4 text-xs">
            {/* User Profile Card */}
            <div className="p-4 rounded-3xl bg-zinc-800/90 border border-zinc-750 flex items-center gap-3.5">
              <div className="relative">
                <img
                  src={userProfile.avatar}
                  alt=""
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/60 shadow-md"
                />
                <button
                  onClick={() => setImagePickerTarget('user')}
                  className="absolute -bottom-1 -right-1 p-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-emerald-400 cursor-pointer"
                  title="更换头像"
                >
                  <ImageIcon className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base text-zinc-100">{userProfile.name}</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">微信号: {userProfile.wxid}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                    专属邀请码: {userProfile.inviteCode || 'US-888888'}
                  </span>
                  <button
                    onClick={handleCopyUserInviteCode}
                    className="p-1 rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white transition cursor-pointer"
                    title="复制邀请码"
                  >
                    {copiedInviteCode ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Requirement 13: Self Persona Adjustment Form */}
            <div className="p-4 rounded-3xl bg-zinc-850 border border-zinc-750 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <User className="w-4 h-4" />
                  <span>自身人设与偏好调节 (Self Persona)</span>
                </div>
                <span className="text-[10px] text-zinc-500">影响全部 AI 对你的理解与互动口吻</span>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">我的昵称</label>
                <input
                  type="text"
                  value={selfNameInput}
                  onChange={(e) => setSelfNameInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">个性签名 / 个人简介</label>
                <input
                  type="text"
                  value={selfBioInput}
                  onChange={(e) => setSelfBioInput(e.target.value)}
                  placeholder="如: 热爱生活、在代码与设计之间穿梭的设计师"
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">
                  👤 我的性格特征 (Personality)
                </label>
                <textarea
                  rows={2}
                  value={selfPersonalityInput}
                  onChange={(e) => setSelfPersonalityInput(e.target.value)}
                  placeholder="例如: 慢热、容易情绪内耗、喜欢真诚直率的沟通方式、对细节敏感..."
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed text-xs"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">
                  🌟 我的兴趣爱好与关注主题 (Interests & Topics)
                </label>
                <textarea
                  rows={2}
                  value={selfPreferencesInput}
                  onChange={(e) => setSelfPreferencesInput(e.target.value)}
                  placeholder="例如: 喜欢猫咪、手冲咖啡、二次元动漫、科幻小说、下雨天的安静音乐..."
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed text-xs"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">
                  💬 聊天与关怀偏好 (Care Preferences)
                </label>
                <input
                  type="text"
                  value={selfCarePrefInput}
                  onChange={(e) => setSelfCarePrefInput(e.target.value)}
                  placeholder="例如: 疲惫时希望得到安静陪伴与温暖鼓励，不喜讲大道理"
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                {meSaveFeedback ? (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> 人设配置已实时保存并同步至所有 AI！
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-500">
                    AI 在对话中会自动结合你的人设进行个性化回答
                  </span>
                )}
                <button
                  onClick={handleSaveSelfPersona}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition active:scale-95 cursor-pointer"
                >
                  保存人设配置
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Requirement 2: Bottom Navigation Bar is automatically HIDDEN when in 1-on-1 chat or group chat */}
      {!activeChatId && !activeGroupChatId && (
        <div className="h-14 bg-zinc-850 border-t border-zinc-800 grid grid-cols-4 items-center shrink-0 z-20">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'chats' ? 'text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span>微信</span>
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'contacts' ? 'text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>通讯录</span>
          </button>
          <button
            onClick={() => setActiveTab('moments')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'moments' ? 'text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span>朋友圈</span>
          </button>
          <button
            onClick={() => setActiveTab('me')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'me' ? 'text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="w-5 h-5" />
            <span>我</span>
          </button>
        </div>
      )}

      {/* Thinking Process / Chain-of-Thought (CoT) Modal */}
      {showCoTModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-amber-500/40 p-4 text-white shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-sm text-amber-300">AI 思考与推理链路 (CoT)</h3>
              </div>
              <button
                onClick={() => setShowCoTModal(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto bg-zinc-950 p-3 rounded-2xl border border-zinc-800 text-xs font-mono leading-relaxed text-zinc-300 whitespace-pre-wrap">
              {displayedMessages.find((m) => m.id === showCoTModal)?.thinkingProcess ||
                '该条消息生成时暂未附带详细思考链数据。'}
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-[10px] text-zinc-500">
              <span>基于 Gemini 深度推理引擎分析</span>
              <button
                onClick={() => setShowCoTModal(null)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Long Press Menu */}
      {msgLongPressMenu && (
        <div
          onClick={() => setMsgLongPressMenu(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-64 rounded-3xl bg-zinc-900 border border-zinc-750 p-3 shadow-2xl text-xs space-y-1"
          >
            <button
              onClick={() => {
                navigator.clipboard.writeText(msgLongPressMenu.text);
                setMsgLongPressMenu(null);
              }}
              className="w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2 text-zinc-200 cursor-pointer"
            >
              <Copy className="w-4 h-4 text-blue-400" />
              <span>复制消息</span>
            </button>

            <button
              onClick={() => {
                setQuoteMsgId(msgLongPressMenu.id);
                setMsgLongPressMenu(null);
              }}
              className="w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2 text-zinc-200 cursor-pointer"
            >
              <Quote className="w-4 h-4 text-emerald-400" />
              <span>引用回答</span>
            </button>

            {msgLongPressMenu.sender === 'ai' && (
              <button
                onClick={() => handleRefreshAiResponse(msgLongPressMenu)}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2 text-amber-300 font-medium cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>重新生成本次回答</span>
              </button>
            )}

            <button
              onClick={() => handleDeleteMessage(msgLongPressMenu.id)}
              className="w-full p-2.5 rounded-xl hover:bg-rose-950/40 flex items-center gap-2 text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>删除此条记录</span>
            </button>
          </div>
        </div>
      )}

      {/* AI Settings & Memory Folder Modal */}
      {showAiSettingsModal && activeCharacter && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-emerald-400">
                <Settings className="w-4 h-4" />
                <span>{activeCharacter.name} - 详细设置</span>
              </h3>
              <button
                onClick={() => setShowAiSettingsModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1. AI Avatar & Basic Info */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <img
                  src={editedAvatar || activeCharacter.avatar}
                  alt=""
                  className="w-14 h-14 rounded-2xl object-cover border border-emerald-500 shadow-md"
                />
                <button
                  onClick={() => setImagePickerTarget('aiAvatar')}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>更换 AI 头像</span>
                </button>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">AI 名字</label>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">微信号</label>
                <input
                  type="text"
                  value={editedWxid}
                  onChange={(e) => setEditedWxid(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">与用户的关系</label>
                <input
                  type="text"
                  placeholder="例如: 恋人 / 青梅竹马 / 导师"
                  value={editedRelationship}
                  onChange={(e) => setEditedRelationship(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">人设背景与设定经历 (System Persona)</label>
                <textarea
                  rows={3}
                  value={editedPersona}
                  onChange={(e) => setEditedPersona(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">性格特征与说话风格 (Personality & Tone)</label>
                <textarea
                  rows={2}
                  value={editedPersonality}
                  onChange={(e) => setEditedPersonality(e.target.value)}
                  placeholder="如: 温柔体贴，常带波浪号，喜欢鼓励用户"
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">指定专用模型 (留空使用全局默认)</label>
                <input
                  type="text"
                  placeholder="如: gemini-2.5-flash"
                  value={editedModelName}
                  onChange={(e) => setEditedModelName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Requirement 5: Long-term Memory Packaged into a Collapsible Folder Accordion */}
            <div className="pt-3 border-t border-zinc-800 text-xs">
              <div
                onClick={() => setIsMemoryFolderOpen(!isMemoryFolderOpen)}
                className="p-3 rounded-2xl bg-zinc-850 border border-zinc-750 hover:border-emerald-500/40 flex items-center justify-between cursor-pointer transition shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    {isMemoryFolderOpen ? (
                      <FolderOpen className="w-4 h-4" />
                    ) : (
                      <Folder className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-zinc-200">
                      长期记忆库文件夹 ({activeCharacter.memories?.length || 0} 条记忆)
                    </h4>
                    <p className="text-[10px] text-zinc-400">已折叠收纳，点击展开管理</p>
                  </div>
                </div>
                {isMemoryFolderOpen ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </div>

              {isMemoryFolderOpen && (
                <div className="mt-2 p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-medium">记忆管理</span>
                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoExtractMemoryEnabled}
                        onChange={(e) => setAutoExtractMemoryEnabled(e.target.checked)}
                        className="rounded accent-emerald-500"
                      />
                      <span>允许 AI 自行提取记忆</span>
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="手动添加记忆项..."
                      value={newMemoryInput}
                      onChange={(e) => setNewMemoryInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
                    />
                    <button
                      onClick={handleAddMemory}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium shrink-0 cursor-pointer"
                    >
                      添加
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {activeCharacter.memories && activeCharacter.memories.length > 0 ? (
                      activeCharacter.memories.map((mem, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 rounded-xl bg-zinc-850 text-[11px] border border-zinc-750"
                        >
                          <span className="truncate max-w-[85%] text-zinc-200">{mem}</span>
                          <button
                            onClick={() => handleDeleteMemory(i)}
                            className="text-rose-400 hover:text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-zinc-500 py-2 text-center">暂无长期记忆条目</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Requirement 7: Menstrual Cycle Sensing & Proactive Care with Toggle Switch */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-rose-300 font-semibold">
                  <HeartPulse className="w-4 h-4 text-rose-400" />
                  <span>生理周期感知与主动关怀</span>
                </div>
                {/* Switch Toggle */}
                <button
                  onClick={() => setEditedMenstrualCareEnabled(!editedMenstrualCareEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    editedMenstrualCareEnabled ? 'bg-rose-500' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      editedMenstrualCareEnabled ? 'right-1' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-1.5 text-[11px] text-zinc-300 leading-relaxed bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-400 shrink-0">🌸</span>
                  <span><b>经期前3天</b>：触发经期开始提醒，备好温水与保暖物品（严禁OOC）</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-400 shrink-0">💖</span>
                  <span><b>经期中</b>：若感知到情绪低落或身体不舒服，主动递上温暖关怀</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-400 shrink-0">✨</span>
                  <span><b>经期结束前1天</b>：触发经期结束与饮食起居调养问候</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-400 shrink-0">🌿</span>
                  <span><b>排卵期前后</b>：提供温和的日常健康关怀</span>
                </div>
              </div>

              {editedMenstrualCareEnabled && (
                <button
                  onClick={() => {
                    setShowAiSettingsModal(false);
                    handleTriggerProactiveCare();
                  }}
                  disabled={isLoading}
                  className="w-full py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-rose-400" />
                  <span>发送一次阶段主动关怀测试</span>
                </button>
              )}
            </div>

            {/* Clear History Danger Zone */}
            <div className="pt-2 border-t border-zinc-800">
              <button
                onClick={handleClearHistory}
                className="w-full py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空该 AI 角色的所有聊天记录</span>
              </button>
            </div>

            {/* Save Button */}
            <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  onUpdateCharacters(
                    characters.map((c) =>
                      c.id === activeCharacter.id
                        ? {
                            ...c,
                            name: editedName,
                            wxid: editedWxid,
                            relationship: editedRelationship,
                            persona: editedPersona,
                            personality: editedPersonality,
                            modelConfig: editedModelName
                              ? { ...c.modelConfig, modelName: editedModelName }
                              : c.modelConfig,
                            avatar: editedAvatar || c.avatar,
                            menstrualCare: {
                              ...(c.menstrualCare || {}),
                              enabled: editedMenstrualCareEnabled,
                            },
                          }
                        : c
                    )
                  );
                  setShowAiSettingsModal(false);
                }}
                className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-semibold text-xs text-white shadow-md transition active:scale-95 cursor-pointer"
              >
                保存所有配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirement 4: Custom Chat Background Modal */}
      {showBackgroundModal && activeCharacter && (
        <ChatBackgroundModal
          isOpen={showBackgroundModal}
          onClose={() => setShowBackgroundModal(false)}
          character={activeCharacter}
          onSaveBackground={handleSaveChatBackground}
          onOpenImagePicker={() => setImagePickerTarget('chatBg')}
        />
      )}

      {/* Requirement 6: Interactive Chat Search Modal */}
      {showSearchModal && activeCharacter && (
        <ChatSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          character={activeCharacter}
          userProfile={userProfile}
          onSelectMessage={handleSelectSearchedMessage}
        />
      )}

      {/* Add Friend Modal with Custom AI and Real User Invite Code (Requirements 11 & 12) */}
      {showAddFriendModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 text-zinc-100">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                添加朋友
              </h3>
              <button
                onClick={() => setShowAddFriendModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab switch between AI Friends and Real Users */}
            <div className="grid grid-cols-2 p-1 bg-zinc-800 rounded-xl text-xs text-center font-medium">
              <button
                onClick={() => setAddFriendActiveTab('ai')}
                className={`py-1.5 rounded-lg transition ${
                  addFriendActiveTab === 'ai'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                AI 伙伴
              </button>
              <button
                onClick={() => setAddFriendActiveTab('real_user')}
                className={`py-1.5 rounded-lg transition ${
                  addFriendActiveTab === 'real_user'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                真人好友 (邀请码)
              </button>
            </div>

            {addFriendActiveTab === 'ai' ? (
              <>
                {/* Primary Action Card: Create Custom AI Friend (Requirement 11) */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600/30 via-teal-600/20 to-emerald-600/10 border border-emerald-500/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-md">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-white">创建全新自定义 AI 好友</h4>
                        <p className="text-[10px] text-emerald-300">完全自定义头像·人设·性格·记忆</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    打破模板束缚，你可以随意设定心仪的专属聊天搭子、理想恋人、知心密友或灵感助手。
                  </p>
                  <button
                    onClick={() => {
                      setShowAddFriendModal(false);
                      setShowNewAiModal(true);
                    }}
                    className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>立即开始自由设定 AI</span>
                  </button>
                </div>

                {/* Preset AI Friends Recommendation */}
                <div className="space-y-2.5 text-xs pt-1 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-300 font-semibold flex items-center gap-1">
                      <span>灵感推荐 AI 好友</span>
                    </p>
                    <span className="text-[10px] text-zinc-500">点击一键添加</span>
                  </div>

                  <input
                    type="text"
                    placeholder="搜索推荐角色名或风格关键词..."
                    value={addFriendSearchQuery}
                    onChange={(e) => setAddFriendSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-750 text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {[
                      {
                        name: '顾言',
                        wxid: 'guyan_scholar',
                        relationship: '学长/学术伙伴',
                        avatar:
                          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
                        persona: '严谨冷静的高冷学霸，表面冷淡，实则观察细致，擅长理性分析与学业指导。',
                        personality: '言简意赅，逻辑清晰，在深夜自习室时会悄悄给你递一杯热咖啡。',
                        greeting: '你好，我是顾言。请问今天有什么学术或逻辑上的疑问？',
                        memories: ['用户也是求知者', '喜欢有条理的沟通'],
                        tags: ['高冷', '学霸', '导师'],
                      },
                      {
                        name: '陆沉',
                        wxid: 'luchen_ceo',
                        relationship: '兄长/同行伙伴',
                        avatar:
                          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
                        persona: '沉稳优雅的企业执行官，富有魅力，言谈得体，时刻关注用户的安全与成长。',
                        personality: '温柔且有极强掌控力，富有成熟魅力，善于倾听和给予最切实的保护。',
                        greeting: '晚好，工作或生活上有任何困难，随时告诉我。',
                        memories: ['注重效率与品味'],
                        tags: ['沉稳', '精英', '安全感'],
                      },
                      {
                        name: '小葵',
                        wxid: 'xiaokui_sun',
                        relationship: '元气闺蜜',
                        avatar:
                          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
                        persona: '充满能量的元气少女，美食与旅行达人，擅长情感倾听和正能量鼓励。',
                        personality: '古灵精怪，热情洋溢，爱发颜文字和可爱的日常分享。',
                        greeting: '嗨呀！今天天气超棒，有没有吃好吃的？要保持好心情哦！✨',
                        memories: ['喜欢分享美食与日常'],
                        tags: ['元气', '治愈', '闺蜜'],
                      },
                      {
                        name: '苏若浅',
                        wxid: 'ruoqian_doc',
                        relationship: '温柔知己',
                        avatar:
                          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
                        persona: '温婉细腻的心理咨询师与茶艺师，擅长抚平焦虑情绪，给予最细腻的关怀与倾听。',
                        personality: '说话轻柔如春风，总能在第一时间捕捉到你字里行间的疲惫与情绪起伏。',
                        greeting: '今天辛苦啦~ 无论外面发生了什么，回到这里都可以卸下所有防备。',
                        memories: ['用户容易在深夜感到疲惫', '喜好温暖舒适的环境'],
                        tags: ['知性', '治愈', '心理师'],
                      },
                      {
                        name: '江寻',
                        wxid: 'jiangxun_cat',
                        relationship: '傲娇恋人',
                        avatar:
                          'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80',
                        persona: '有点小傲娇的年轻设计师，表面上经常吐槽你笨手笨脚，实际上每天都在默默关注你。',
                        personality: '口嫌体正直，“我才没有特意在等你呢”，但秒回消息的速度出卖了他。',
                        greeting: '喂，今天降温多穿衣服没有？别以为我不知道你又只要风度不要温度……笨蛋。',
                        memories: ['用户经常忘记带伞', '用户一着凉就容易感冒'],
                        tags: ['傲娇', '恋人', '口嫌体正直'],
                      },
                    ]
                      .filter((p) => {
                        if (!addFriendSearchQuery.trim()) return true;
                        const q = addFriendSearchQuery.toLowerCase();
                        return (
                          p.name.toLowerCase().includes(q) ||
                          p.persona.toLowerCase().includes(q) ||
                          p.relationship.toLowerCase().includes(q)
                        );
                      })
                      .map((p, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-2xl bg-zinc-800 border border-zinc-750 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <img src={p.avatar} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <h5 className="font-semibold text-zinc-100 text-xs truncate">{p.name}</h5>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-700 text-zinc-300">
                                  {p.relationship}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-400 truncate">{p.persona}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddPresetAi(p)}
                            className="ml-2 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] shrink-0 cursor-pointer shadow-xs transition active:scale-95"
                          >
                            添加
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              // Requirement 12: Add Real User via Unique Invite Code + Private AI Protection Notice
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                    <KeyRound className="w-4 h-4" />
                    <span>输入真人的专属微信号邀请码</span>
                  </div>
                  <input
                    type="text"
                    placeholder="如: US-928410"
                    value={realUserInviteInput}
                    onChange={(e) => setRealUserInviteInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono uppercase placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                  <button
                    onClick={handleAddRealUserByCode}
                    disabled={!realUserInviteInput.trim()}
                    className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs shadow-md transition active:scale-95 cursor-pointer"
                  >
                    发送好友申请
                  </button>
                  {addRealUserFeedback && (
                    <p className="text-[11px] text-emerald-400 bg-emerald-950/40 p-2 rounded-xl border border-emerald-500/30">
                      {addRealUserFeedback}
                    </p>
                  )}
                </div>

                {/* Security and Privacy Protection Rule (Requirement 12) */}
                <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-1.5 text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>私有 AI 好友安全保护机制</span>
                  </div>
                  <p className="text-[10px] text-amber-300/80 leading-relaxed">
                    在群聊和私聊中，所有私有 AI 均为创作者的专属角色伙伴，严格禁止其他真人私自添加或盗用人设设定。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom AI Creator Full Modal */}
      {showNewAiModal && (
        <CustomAiCreatorModal
          isOpen={showNewAiModal}
          onClose={() => setShowNewAiModal(false)}
          onCreateCharacter={handleAddCustomCharacter}
        />
      )}

      {/* Create Moment Post Modal */}
      {showCreatePostModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3 text-xs">
            <h3 className="font-semibold text-sm">发布朋友圈</h3>
            <textarea
              rows={4}
              placeholder="这一刻的想法..."
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setImagePickerTarget('moment')}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center gap-1.5 text-zinc-300 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <span>添加图片 ({newPostImages.length})</span>
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowCreatePostModal(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleCreatePost}
                className="px-4 py-1.5 font-medium rounded-xl bg-emerald-500 text-white cursor-pointer"
              >
                发布并触发 AI 互动
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Picker Modal */}
      {imagePickerTarget && (
        <ImagePickerModal
          isOpen={Boolean(imagePickerTarget)}
          onClose={() => setImagePickerTarget(null)}
          onSelectImage={(url) => {
            if (imagePickerTarget === 'user') {
              onUpdateUserProfile({ ...userProfile, avatar: url });
            } else if (imagePickerTarget === 'aiAvatar') {
              setEditedAvatar(url);
            } else if (imagePickerTarget === 'moment') {
              setNewPostImages([...newPostImages, url]);
            } else if (imagePickerTarget === 'chatBg') {
              handleSaveChatBackground(url);
            }
          }}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <CreateGroupModal
          isOpen={showCreateGroupModal}
          onClose={() => setShowCreateGroupModal(false)}
          characters={characters}
          userProfile={userProfile}
          onCreateGroup={handleCreateGroup}
        />
      )}

      {/* Join Group By Invite Code Modal */}
      {showJoinGroupByCodeModal && (
        <JoinGroupByCodeModal
          isOpen={showJoinGroupByCodeModal}
          onClose={() => setShowJoinGroupByCodeModal(false)}
          groupChats={groupChats}
          userProfile={userProfile}
          onJoinGroupSuccess={handleJoinGroupSuccess}
          onSimulateIncomingRequest={handleSimulateIncomingRequest}
        />
      )}
    </div>
  );
};
