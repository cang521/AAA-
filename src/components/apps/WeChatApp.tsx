import React, { useState, useEffect, useRef, useCallback } from 'react';
import { compressImage, globalImageTaskQueue } from '../../lib/imageCompressor';
import { getMessageWithSurroundingContext } from '../../lib/chatSearchEngine';
import {
  shouldShowTimeDivider,
  formatMessageTimeDivider,
  getMessageTimestamp,
} from '../../lib/timeUtils';
import { apiFetch } from '../../lib/localBackend';
import { sanitizeReplyText } from '../../lib/thinkCleaner';
import { getLifeContextForPrompt } from '../../lib/lifeState/lifeStateStore';
import { triggerLifeStateExtraction } from '../../lib/lifeState/lifeStateExtractor';
import {
  Send,
  Heart,
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
  Database,
  Download,
  Upload,
  History,
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
import { DataManagementModal } from '../data/DataManagementModal';
import { calculateCycleStats } from '../../lib/menstrual';
import { weatherService } from '../../lib/weatherService';
import { deviceService } from '../../lib/deviceService';
import { systemNativeService } from '../../lib/systemNativeService';
import { loadGroupChats, saveGroupChats, DEFAULT_AI_AVATAR, DEFAULT_USER_AVATAR } from '../../lib/storage';
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
  getRecentChatMessages,
} from '../../lib/chatDb';
import {
  splitMessageIntoSentenceBubbles,
  calculateTypingDelay,
  getMultiBubbleConfig,
  saveMultiBubbleConfig,
  MultiBubbleConfig,
} from '../../lib/wechatMultiBubble';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ContactSwipeRow } from './ContactSwipeRow';
import { AiMemoryVaultModal } from './memory/AiMemoryVaultModal';
import { searchAiMemoryChunks, deleteAiMemoryVault } from '../../lib/aiMemoryVaultDb';
import { recallArchivedHistory, getAiArchiveConfig } from '../../lib/chatArchiveDb';
import { OfflineModeHome } from '../offline/OfflineModeHome';
import { OfflineHistoryDetailModal } from '../offline/OfflineHistoryDetailModal';

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
  onDataChanged?: () => void;
}

interface MemoryNeedsDecision {
  shouldRecallChatHistory: boolean;
  shouldRecallVault: boolean;
}

/**
 * Evaluates whether chat history or AI memory vault retrieval is actually needed for this turn.
 * Uses lightweight local rules to avoid extra LLM API latency.
 */
function evaluateMemoryNeeds(
  userText: string,
  searchMode: 'off' | 'auto' | 'deep',
  recentMessages: ChatMessage[]
): MemoryNeedsDecision {
  const trimmed = userText.trim();
  if (!trimmed) {
    return { shouldRecallChatHistory: false, shouldRecallVault: false };
  }

  // 1. Check for casual short phrases & continuous chit-chat ("哈哈", "困了", "亲亲", "然后呢", "刚吃完饭")
  const isShortGreeting = /^(在吗|早|早安|晚安|嗯|嗯嗯|好的|好|哈哈|哈哈哈|收到|对|是的|拜拜|再见|666|okk?|hi|hello|hey|yo|\?|？|！|!|我困了|好累|刚吃完|在干嘛|笑死|好吧|然后呢|去哪|好呀)$/i.test(trimmed);
  if (trimmed.length <= 6 && isShortGreeting) {
    return { shouldRecallChatHistory: false, shouldRecallVault: false };
  }

  // 2. Extract key topic tokens and check if they are ALREADY present in the recent context window
  const keywords = trimmed
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const contextText = recentMessages.slice(-20).map((m) => m.text || '').join('\n');
  const isCoveredInContext = keywords.length > 0 && keywords.some((kw) => kw.length >= 2 && contextText.includes(kw));

  // 3. Independent Decision: Chat History Retrieval (Controlled by searchMode & context sufficiency)
  let shouldRecallChatHistory = false;
  if (searchMode !== 'off') {
    const hasHistoryIntent = /[？\?怎么什么哪谁为何几干嘛回忆记得以前上次曾经那个之前当初过去那时那天那次想念那会儿记不记聊过说过提过]/i.test(trimmed);

    if (searchMode === 'auto') {
      if (hasHistoryIntent && !isCoveredInContext) {
        shouldRecallChatHistory = true;
      } else if (trimmed.length > 30 && !isCoveredInContext) {
        shouldRecallChatHistory = true;
      }
    } else if (searchMode === 'deep') {
      if (!isCoveredInContext && (hasHistoryIntent || trimmed.length > 12)) {
        shouldRecallChatHistory = true;
      }
    }
  }

  // 4. Independent Decision: AI Memory Vault / Background Retrieval (Independent of searchMode === 'off')
  let shouldRecallVault = false;
  const hasVaultIntent = /(设定|背景|档案|记忆库|资料|文件|世界观|剧本|人设|故事|秘密|能力|职业|小说|大纲|自述|身世)/i.test(trimmed);
  if (hasVaultIntent && !isCoveredInContext) {
    shouldRecallVault = true;
  }

  return { shouldRecallChatHistory, shouldRecallVault };
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
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'moments' | 'me'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Data Management Modal State
  const [showDataModal, setShowDataModal] = useState(false);
  const [dataModalTab, setDataModalTab] = useState<'import' | 'export' | 'snapshots'>('import');

  // Group Chat State
  const [groupChats, setGroupChats] = useState<GroupChat[]>(() => loadGroupChats());
  const [activeGroupChatId, setActiveGroupChatId] = useState<string | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showJoinGroupByCodeModal, setShowJoinGroupByCodeModal] = useState(false);
  const [showTopPlusMenu, setShowTopPlusMenu] = useState(false);

  // Unread AI & Group messages tracking
  const [unreadAiCounts, setUnreadAiCounts] = useState<Record<string, number>>({});
  const [unreadGroupCounts, setUnreadGroupCounts] = useState<Record<string, number>>({});

  // Active chat paginated messages state
  const [displayedMessages, setDisplayedMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [dbVersionKey, setDbVersionKey] = useState(0);

  // Input & quote & image attachment states
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [quoteMsgId, setQuoteMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showWorldBookModal, setShowWorldBookModal] = useState<WorldBook | null>(null);

  // Double click detection on Send Button & refs
  const lastSendClickTimeRef = useRef<number>(0);
  const sendClickTimerRef = useRef<any>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef<boolean>(false);

  const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const minHeight = 36;
    const maxHeight = 132; // ~5.5 lines
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';

    // Auto-scroll caret into view if user is typing near the end
    if (textarea.scrollHeight > maxHeight) {
      const isAtEnd = textarea.selectionStart >= textarea.value.length - 2;
      if (isAtEnd) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    }
  };

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

  // Human-like Multi-Bubble Messaging Engine States (一句话一条消息，一整段分割连发)
  const [multiBubbleConfig, setMultiBubbleConfig] = useState<MultiBubbleConfig>(() => getMultiBubbleConfig());
  const [isAiMultiTyping, setIsAiMultiTyping] = useState(false);
  const [multiTypingName, setMultiTypingName] = useState<string | null>(null);
  const [multiBubbleToast, setMultiBubbleToast] = useState<string | null>(null);

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

  // AI Independent Memory Vault Modal State
  const [showMemoryVaultModal, setShowMemoryVaultModal] = useState(false);
  const [memoryVaultTargetChar, setMemoryVaultTargetChar] = useState<AiCharacter | null>(null);

  // Offline mode overlay state
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  // Character Deletion with Memory Space Option Modal (Requirement 8)
  const [characterToDelete, setCharacterToDelete] = useState<AiCharacter | null>(null);
  const [deleteMemoryVaultWithChar, setDeleteMemoryVaultWithChar] = useState(true);

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

  const activeChatIdRef = useRef<string | null>(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (activeChatId) {
      setUnreadAiCounts((prev) => ({
        ...prev,
        [activeChatId]: 0,
      }));
    }
  }, [activeChatId]);

  const activeGroupChatIdRef = useRef<string | null>(activeGroupChatId);
  useEffect(() => {
    activeGroupChatIdRef.current = activeGroupChatId;
    if (activeGroupChatId) {
      setUnreadGroupCounts((prev) => ({
        ...prev,
        [activeGroupChatId]: 0,
      }));
    }
  }, [activeGroupChatId]);

  // Clear unread count when opening a chat
  const handleOpenChat = (charId: string) => {
    setActiveChatId(charId);
    setActiveGroupChatId(null);
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

  // Adjust input textarea height on draft or chat change
  useEffect(() => {
    adjustTextareaHeight(inputRef.current);
  }, [inputText, activeChatId]);

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

  // Track latest messages for immediate synchronous access without stale closure issues
  const latestMessagesRef = useRef<ChatMessage[]>(displayedMessages);
  useEffect(() => {
    latestMessagesRef.current = displayedMessages;
  }, [displayedMessages]);

  const lastUserMsgSubmitRef = useRef<{ text: string; image?: string | null; time: number }>({
    text: '',
    image: null,
    time: 0,
  });

  // 1. Single User Message Send (Queues without immediate AI reply)
  const handleSendUserOnlyMessage = async (text: string, imageToSendArg?: string | null) => {
    const cleanText = text.trim();
    const imageToSend = imageToSendArg !== undefined ? imageToSendArg : selectedImage;
    if (!cleanText && !imageToSend) return;
    if (!activeCharacter) return;

    // Defense-in-depth: Prevent duplicate user message submission within 1200ms window
    const now = Date.now();
    if (
      lastUserMsgSubmitRef.current.text === cleanText &&
      lastUserMsgSubmitRef.current.image === (imageToSend || null) &&
      now - lastUserMsgSubmitRef.current.time < 1200
    ) {
      console.warn('[Chat] Blocked duplicate user message creation within 1200ms window');
      return;
    }
    lastUserMsgSubmitRef.current = { text: cleanText, image: imageToSend || null, time: now };

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      characterId: activeCharacter.id,
      sender: 'user',
      text: cleanText,
      imageUrl: imageToSend || undefined,
      timestamp: Date.now(),
      quoteMessageId: quoteMsgId || undefined,
    };

    setInputText('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setSelectedImage(null);
    setQuoteMsgId(null);

    // Synchronously update latest messages ref before React state re-renders
    latestMessagesRef.current = [...latestMessagesRef.current, userMsg];
    setDisplayedMessages((prev) => [...prev, userMsg]);
    setTotalHistoryCount((c) => c + 1);
    scrollToBottom(true);

    try {
      await saveChatMessage(userMsg);
    } catch (e) {
      console.error('Save chat message error', e);
    }

    // Call Vision API asynchronously if an image was attached
    if (imageToSend) {
      try {
        const visionRes = await apiFetch('/api/gemini/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: imageToSend,
            prompt: '请用中文详细识别并总结描述这张图片中的事物、文字、场景以及主要细节。',
            apiConfig,
          }),
        });
        const visionData = await visionRes.json();
        if (visionData.success && visionData.description) {
          userMsg.imageAnalysis = visionData.description;
          userMsg.imageAnalysisStatus = 'success';
        } else {
          userMsg.imageAnalysisStatus = 'failed';
        }
      } catch (e) {
        console.warn('Vision API call error:', e);
        userMsg.imageAnalysisStatus = 'failed';
      }

      try {
        await saveChatMessage(userMsg);
        setDisplayedMessages((prev) =>
          prev.map((m) => (m.id === userMsg.id ? { ...userMsg } : m))
        );
      } catch (e) {
        console.warn('Failed to save image analysis to DB:', e);
      }
    }
  };

  // Deliver AI message bubbles sequentially like real WeChat typing (一句话一条消息，连发四五条)
  const deliverAiMessagesInSequence = async (
    rawText: string,
    thinkingProcess: string,
    character: AiCharacter,
    options?: {
      vibrationPattern?: number[];
    }
  ) => {
    const cleanRawText = sanitizeReplyText(rawText);
    const shouldSplit = multiBubbleConfig.enabled;
    const rawBubbles = shouldSplit
      ? splitMessageIntoSentenceBubbles(cleanRawText, { maxBubbles: multiBubbleConfig.maxBubbles })
      : [cleanRawText];

    const bubbles = rawBubbles.map((b) => sanitizeReplyText(b)).filter((s) => s.trim().length > 0);

    if (!bubbles || bubbles.length === 0) return;

    if (bubbles.length === 1) {
      const aiMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        characterId: character.id,
        sender: 'ai',
        text: bubbles[0],
        timestamp: Date.now(),
        thinkingProcess,
      };
      setDisplayedMessages((prev) => [...prev, aiMsg]);
      setTotalHistoryCount((c) => c + 1);
      scrollToBottom(true);
      await saveChatMessage(aiMsg).catch((e) => console.error('Save AI msg error', e));
      if (permissions?.realDevice?.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(options?.vibrationPattern || [50]);
      }
      if (activeChatIdRef.current !== character.id) {
        setUnreadAiCounts((prev) => ({
          ...prev,
          [character.id]: (prev[character.id] || 0) + 1,
        }));
      }
      return;
    }

    // Multi-bubble human typing experience
    setIsAiMultiTyping(true);
    setMultiTypingName(character.name);

    for (let i = 0; i < bubbles.length; i++) {
      const bubbleText = bubbles[i];
      if (i > 0) {
        // Natural human typing latency based on sentence character length
        const delay = calculateTypingDelay(bubbleText, multiBubbleConfig.speed);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const bubbleMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
        characterId: character.id,
        sender: 'ai',
        text: bubbleText,
        timestamp: Date.now() + i * 15,
        thinkingProcess:
          i === 0
            ? thinkingProcess
            : `${thinkingProcess}\n\n[连发第 ${i + 1}/${bubbles.length} 条消息]`,
      };

      setDisplayedMessages((prev) => [...prev, bubbleMsg]);
      setTotalHistoryCount((c) => c + 1);
      scrollToBottom(true);
      saveChatMessage(bubbleMsg).catch((e) => console.error('Save AI bubble msg error', e));

      if (permissions?.realDevice?.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([35]);
      }
    }

    if (activeChatIdRef.current !== character.id) {
      setUnreadAiCounts((prev) => ({
        ...prev,
        [character.id]: (prev[character.id] || 0) + 1,
      }));
    }

    setIsAiMultiTyping(false);
    setMultiTypingName(null);
  };

  // 2. Trigger AI Reply for all pending consecutive user messages
  const handleTriggerAiReply = async (optionalImmediateUserText?: string) => {
    if (!activeCharacter || isLoading) return;

    const tTotalStart = Date.now();
    let currentDisplayed = [
      ...(latestMessagesRef.current.length > 0 ? latestMessagesRef.current : displayedMessages),
    ];

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

    // Find all consecutive unreplied user messages waiting for AI response in this turn
    const pendingUserMsgs: ChatMessage[] = [];
    for (let i = currentDisplayed.length - 1; i >= 0; i--) {
      if (currentDisplayed[i].sender === 'user') {
        pendingUserMsgs.unshift(currentDisplayed[i]);
      } else {
        break;
      }
    }

    const currentTurnMessageIds = pendingUserMsgs.map((m) => m.id).filter(Boolean);
    const currentTurnMsgIdSet = new Set(currentTurnMessageIds);

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

    setIsLoading(true);

    try {
      // Fetch AI archive config to determine search mode ('off' | 'auto' | 'deep') & context message limit
      const archiveConfig = await getAiArchiveConfig(activeCharacter.id).catch(() => ({ searchMode: 'auto' as const, contextMessageCount: 100 }));
      const searchMode = archiveConfig.searchMode || 'auto';
      const contextLimit = typeof archiveConfig.contextMessageCount === 'number' && archiveConfig.contextMessageCount > 0
        ? archiveConfig.contextMessageCount
        : 100;

      // 1. Fetch recent raw history and exclude current turn pending user messages strictly by ID
      const rawHistory = await getRecentChatMessages(activeCharacter.id, contextLimit).catch(() => currentDisplayed.slice(-contextLimit));
      const conversationHistory = rawHistory.filter((msg) => !currentTurnMsgIdSet.has(msg.id));

      // 2. Evaluate memory needs independently per source using prior history (0ms API latency)
      const { shouldRecallChatHistory, shouldRecallVault } = evaluateMemoryNeeds(
        combinedUserText,
        searchMode,
        conversationHistory
      );

      // 3. Parallelize independent pre-tasks (History Recall, Archived History Recall, Vault Recall, Weather)
      const [historyResult, archiveResult, vaultRecall, weatherInfo] = await Promise.all([
        shouldRecallChatHistory
          ? recallCharacterMemories(activeCharacter.id, combinedUserText, 4).catch(() => ({
              recalledText: '',
              matchedCount: 0,
              durationMs: 0,
            }))
          : Promise.resolve({ recalledText: '', matchedCount: 0, durationMs: 0 }),
        shouldRecallChatHistory
          ? recallArchivedHistory(activeCharacter.id, combinedUserText, searchMode).catch(() => ({
              recalledText: '',
              matchedCount: 0,
              durationMs: 0,
            }))
          : Promise.resolve({ recalledText: '', matchedCount: 0, durationMs: 0 }),
        shouldRecallVault
          ? searchAiMemoryChunks(activeCharacter.id, combinedUserText, 4).catch((err) => {
              console.warn('AI memory vault recall error:', err);
              return { recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs: 0 };
            })
          : Promise.resolve({ recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs: 0 }),
        permissions?.appAccess?.weatherData !== false
          ? weatherService.getWeather(false).catch(() => null)
          : Promise.resolve(null),
      ]);

      console.log(`[ChatPerf] recallHistory=${shouldRecallChatHistory} recallVault=${shouldRecallVault}`);
      console.log(`[ChatPerf] historyRecall=${historyResult.durationMs ?? 0}ms archiveRecall=${archiveResult.durationMs ?? 0}ms vaultRecall=${vaultRecall.durationMs ?? 0}ms`);
      console.log(`[ChatPerf] historyCount=${conversationHistory.length}/${contextLimit}`);

      let combinedRecalledMemories = historyResult.recalledText || '';
      if (archiveResult.recalledText) {
        combinedRecalledMemories = combinedRecalledMemories
          ? `${combinedRecalledMemories}\n\n${archiveResult.recalledText}`
          : archiveResult.recalledText;
      }
      if (vaultRecall.recalledText) {
        combinedRecalledMemories = combinedRecalledMemories
          ? `${combinedRecalledMemories}\n\n${vaultRecall.recalledText}`
          : vaultRecall.recalledText;
      }

      // Fetch External Devices Summary if permitted
      const devicesSummary =
        permissions?.deviceAccess?.viewStatus !== false
          ? deviceService.getSanitizedDevicesSummary(permissions)
          : undefined;

      const lastUserMsgWithImage = [...currentDisplayed].reverse().find((m) => m.sender === 'user' && m.imageAnalysis);
      const currentImageAnalysis = lastUserMsgWithImage?.imageAnalysis;

      const tApiStart = Date.now();
      const res = await apiFetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: activeCharacter,
          userMessage: combinedUserText,
          currentTurnMessageIds,
          currentImageAnalysis,
          conversationHistory,
          recalledMemoriesSummary: combinedRecalledMemories || undefined,
          userProfile,
          systemTime: systemNativeService.getRealSystemTime().summaryString,
          locationCity: weatherInfo?.city,
          menstrualInfo: cycleStats,
          weatherInfo,
          devicesSummary,
          memosSummary: memos.map((m) => `- ${m.title}: ${m.content}`).join('\n'),
          lifeStateContext: getLifeContextForPrompt(activeCharacter.id),
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

      const tApiTTFB = Date.now() - tApiStart;
      console.log(`[ChatPerf] apiTTFB=${tApiTTFB}ms`);

      const data = await res.json();
      const tApiTotal = Date.now() - tApiStart;
      console.log(`[ChatPerf] apiTotal=${tApiTotal}ms`);

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

        const memoryRecallNote =
          vaultRecall.matchedChunks.length > 0
            ? `调阅专属记忆空间 (${vaultRecall.matchedChunks.length} 处匹配片段，来源: ${vaultRecall.matchedFileNames.join('、')})`
            : `检索长期记忆 [${activeCharacter.memories?.slice(0, 3).join('; ') || '日常记忆'}]`;

        const thinkingProcess =
          data.thinkingProcess ||
          `【推理分析】:\n1. 结合角色人设 [${activeCharacter.persona}]\n2. ${
            associatedWorldBook ? `融入世界书设定 [《${associatedWorldBook.title}》]` : '无关联世界书，按日常设定回复'
          }\n3. ${memoryRecallNote}\n4. 形成专属口吻回复。`;

        const tBubbleStart = Date.now();
        await deliverAiMessagesInSequence(data.text, thinkingProcess, activeCharacter, {
          vibrationPattern: [60, 40, 60],
        });
        const bubbleDelivery = Date.now() - tBubbleStart;
        console.log(`[ChatPerf] bubbleDelivery=${bubbleDelivery}ms`);

        const totalPerf = Date.now() - tTotalStart;
        console.log(`[ChatPerf] total=${totalPerf}ms`);

        if (data.apiLog) onAddApiLog(data.apiLog);

        // Background Life State Extraction
        triggerLifeStateExtraction(
          [
            { id: 'user_' + Date.now(), characterId: activeCharacter.id, sender: 'user', text: combinedUserText, timestamp: Date.now() },
            { id: 'ai_' + Date.now(), characterId: activeCharacter.id, sender: 'ai', text: data.text || '', timestamp: Date.now() },
          ],
          activeCharacter.id
        ).catch(() => {});

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
      const fallbackText = `${activeCharacter.name}: 刚刚网络开小差了，不过我已经收到你的消息啦！随时跟我说说你的近况吧~`;
      const fallbackThinking = `【离线本地思考模式】:\n网络异常，触发备用温情回复。`;
      await deliverAiMessagesInSequence(fallbackText, fallbackThinking, activeCharacter);
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
      const res = await apiFetch('/api/gemini/proactive-period', {
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
        const thinkingProcess =
          data.thinkingProcess ||
          `【生理周期关怀思考】:\n1. 感知用户生理阶段：${cycleStats.phaseTitle}\n2. 阶段关怀建议：${cycleStats.phaseAdvice}\n3. 结合【${activeCharacter.name}】人设严防OOC输出。`;

        await deliverAiMessagesInSequence(data.text, thinkingProcess, activeCharacter, {
          vibrationPattern: [80, 50, 80],
        });

        if (data.apiLog) onAddApiLog(data.apiLog);
      }
    } catch (e) {
      console.error('Proactive care error', e);
      const fallbackText =
        cycleStats.currentPeriodDay !== null
          ? `${activeCharacter.name}: 看到你今天在经期第 ${cycleStats.currentPeriodDay} 天，肚子会不会不舒服？一定要多喝温水、注意保暖，别太累了哦，有任何事随时跟我说。🌸`
          : `${activeCharacter.name}: 提醒你一下哦，还有 ${cycleStats.daysUntilNextPeriod} 天就要来例假了，提前备好温水和保暖物品，这几天别贪凉啦！❤️`;
      const fallbackThinking = `【本地经期关怀引擎】:\n1. 捕获经期数据\n2. 触发人设主动问候。`;
      await deliverAiMessagesInSequence(fallbackText, fallbackThinking, activeCharacter);
    } finally {
      setIsLoading(false);
    }
  };

  // Send Button Single Click (Send User Msg) & Double Click (Trigger AI Reply) Router
  const handleSendButtonClick = () => {
    const now = Date.now();
    const lastTime = lastSendClickTimeRef.current;
    const timeSinceLast = lastTime > 0 ? now - lastTime : Infinity;

    const doubleClickWindow = 350; // ms

    if (timeSinceLast < doubleClickWindow) {
      // Rapid second click detected: Trigger AI reply ONLY (Do NOT send duplicate user message)
      lastSendClickTimeRef.current = 0;

      // Force-clear input DOM and state so no draft can be re-consumed
      setInputText('');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setSelectedImage(null);

      if (!isLoading) {
        handleTriggerAiReply();
      }
      return;
    }

    // Single click (or 1st click of a double click)
    lastSendClickTimeRef.current = now;

    const rawVal = inputRef.current?.value !== undefined ? inputRef.current.value : inputText;
    const textToSend = rawVal.trim();
    const imageToSend = selectedImage;

    if (textToSend || imageToSend) {
      // Immediately clear DOM and React state BEFORE dispatching to prevent stale closures or duplicate reads
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setInputText('');
      setSelectedImage(null);

      handleSendUserOnlyMessage(textToSend, imageToSend);
    } else {
      if (!isLoading) {
        handleTriggerAiReply();
      }
    }
  };

  // Jump to specific message and highlight (Requirement 6)
  const handleSelectSearchedMessage = async (msgId: string) => {
    const exists = (latestMessagesRef.current || displayedMessages).some((m) => m.id === msgId);
    if (!exists && activeCharacter) {
      try {
        const { messages: surrounding } = await getMessageWithSurroundingContext(activeCharacter.id, msgId, 25);
        if (surrounding.length > 0) {
          setDisplayedMessages(surrounding);
          latestMessagesRef.current = surrounding;
        }
      } catch (e) {
        console.error('Failed to load surrounding context for searched message:', e);
      }
    }

    setHighlightedMsgId(msgId);
    setTimeout(() => {
      const el = document.getElementById(`msg-bubble-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 200);

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
    const targetMsg = (latestMessagesRef.current || displayedMessages).find((m) => m.id === msgId);
    if (!targetMsg || !targetMsg.thinkingProcess) {
      setMultiBubbleToast('该条消息暂无思考记录');
      setTimeout(() => setMultiBubbleToast(null), 2000);
      return;
    }
    setShowCoTModal(msgId);
  };

  // Add custom AI character (Requirement 11)
  const handleAddCustomCharacter = (newChar: AiCharacter) => {
    onUpdateCharacters([...characters, newChar]);
    setShowNewAiModal(false);
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
        <div className="h-12 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between shrink-0 z-20">
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
              {activeTab === 'chats' && (activeChatId ? (isAiMultiTyping ? `${activeCharacter.name} 正在输入...` : activeCharacter.name) : '微信')}
              {activeTab === 'contacts' && '通讯录'}
              {activeTab === 'moments' && '朋友圈'}
              {activeTab === 'me' && '我'}
            </h2>
            {activeTab === 'chats' && activeChatId && (
              <span className="text-[9px] text-zinc-500 font-mono">
                {isAiMultiTyping ? (
                  <span className="text-emerald-400 font-sans flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    正在连发多条短消息...
                  </span>
                ) : totalHistoryCount > 0 ? (
                  `${totalHistoryCount} 条历史`
                ) : (
                  '在线'
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {activeTab === 'chats' && activeChatId && (
              <div className="flex items-center gap-1.5">
                {/* Direct quick shortcut to AI's isolated memory vault */}
                <button
                  onClick={() => {
                    setMemoryVaultTargetChar(activeCharacter);
                    setShowMemoryVaultModal(true);
                  }}
                  className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 hover:text-emerald-300 transition cursor-pointer flex items-center gap-1 text-xs"
                  title={`${activeCharacter.name} 的专属本地记忆空间（导入/管理知识库）`}
                >
                  <Database className="w-4 h-4" />
                </button>

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
                      className="absolute right-0 top-10 w-52 bg-zinc-850 rounded-2xl shadow-2xl border border-zinc-750 p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setShowChatOptionsMenu(false);
                          setMemoryVaultTargetChar(activeCharacter);
                          setShowMemoryVaultModal(true);
                        }}
                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center justify-between transition cursor-pointer bg-emerald-950/20 border border-emerald-500/20"
                      >
                        <div className="flex items-center gap-2.5">
                          <Database className="w-3.5 h-3.5 text-emerald-400" />
                          <span>专属独立记忆空间</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                          完全隔离
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          const next = !multiBubbleConfig.enabled;
                          const updated = saveMultiBubbleConfig({ enabled: next });
                          setMultiBubbleConfig(updated);
                          setMultiBubbleToast(
                            next
                              ? '已开启：AI 拟真分句连发（一句话发一条消息）'
                              : '已切换为：AI 单条长段发送模式'
                          );
                          setTimeout(() => setMultiBubbleToast(null), 2500);
                          setShowChatOptionsMenu(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center justify-between transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <MessageSquarePlus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>分句连发模式</span>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                            multiBubbleConfig.enabled
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {multiBubbleConfig.enabled ? '已开启' : '已关闭'}
                        </span>
                      </button>
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
                          setShowOfflineModal(true);
                        }}
                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-rose-400 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <Heart className="w-3.5 h-3.5 text-rose-400" />
                        <span>进入线下模式</span>
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
                    <button
                      onClick={() => {
                        setShowTopPlusMenu(false);
                        setDataModalTab('import');
                        setShowDataModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-blue-400 flex items-center gap-2.5 transition border-t border-zinc-750/80 pt-2"
                    >
                      <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                        <Database className="w-3.5 h-3.5" />
                      </div>
                      <span>数据管理中心</span>
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

                      {/* Rendered Messages with Search Highlight & Dynamic Time Dividers */}
                      {displayedMessages.map((msg, idx) => {
                        const prevMsg = idx > 0 ? displayedMessages[idx - 1] : undefined;
                        const showDivider = shouldShowTimeDivider(msg, prevMsg);
                        const ts = getMessageTimestamp(msg);

                        return (
                          <React.Fragment key={msg.id}>
                            {showDivider && ts && (
                              <div className="flex justify-center my-3 select-none">
                                <span className="px-2.5 py-0.5 rounded-md bg-zinc-800/60 text-[11px] font-medium text-zinc-400 shadow-2xs">
                                  {formatMessageTimeDivider(ts)}
                                </span>
                              </div>
                            )}
                            <ChatMessageBubble
                              msg={msg}
                              isUser={msg.sender === 'user'}
                              avatar={msg.sender === 'user' ? userProfile.avatar : activeCharacter.avatar}
                              name={msg.sender === 'user' ? userProfile.name : activeCharacter.name}
                              quoteText={msg.quoteMessageId ? quotesMap.get(msg.quoteMessageId) : undefined}
                              onOpenCoT={handleOpenCoT}
                              onContextMenu={handleMessageContextMenu}
                              isHighlighted={highlightedMsgId === msg.id}
                            />
                          </React.Fragment>
                        );
                      })}

                      {isLoading && (
                        <div className="flex gap-2.5 items-center text-xs text-zinc-300 pt-1">
                          <div className="w-8 h-8 rounded-xl bg-zinc-800/90 flex items-center justify-center animate-pulse">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="animate-pulse">{activeCharacter.name} 正在思考中...</span>
                        </div>
                      )}

                      {/* Real-time typing bubble for multi-sentence sequential delivery */}
                      {isAiMultiTyping && !isLoading && (
                        <div className="flex gap-2.5 items-center text-xs text-zinc-300 pt-1 animate-in fade-in duration-200">
                          <img
                            src={activeCharacter.avatar}
                            alt=""
                            className="w-8 h-8 rounded-xl object-cover border border-zinc-750 shrink-0"
                          />
                          <div className="px-3 py-2 rounded-2xl bg-zinc-800/90 border border-zinc-750 text-zinc-300 flex items-center gap-2 shadow-xs">
                            <span className="text-[11px] text-zinc-400">{activeCharacter.name} 正在输入</span>
                            <span className="inline-flex gap-1 items-center">
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Multi-bubble toast notification */}
                    {multiBubbleToast && (
                      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 bg-zinc-900/95 border border-emerald-500/40 rounded-full text-xs text-emerald-300 shadow-xl flex items-center gap-1.5 pointer-events-none animate-in fade-in slide-in-from-top-2">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{multiBubbleToast}</span>
                      </div>
                    )}

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

                    {/* Message Input Box with Attachment Preview & Plus Button */}
                    {(() => {
                      return (
                        <div className="flex flex-col shrink-0 z-10">
                          {/* Image Attachment Preview Bar */}
                          {selectedImage && (
                            <div className="px-3 py-1.5 bg-zinc-850/95 border-t border-zinc-750 flex items-center justify-between text-xs animate-fadeIn">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={selectedImage}
                                  alt="待发送图片"
                                  className="w-9 h-9 rounded-lg object-cover border border-emerald-500/60 shadow-xs"
                                />
                                <div>
                                  <p className="text-zinc-200 font-medium text-xs">已选择 1 张图片</p>
                                  <p className="text-[10px] text-zinc-400">发送时将自动调用 AI 视觉识别分析</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedImage(null)}
                                className="p-1 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition cursor-pointer"
                                title="移除当前选中的图片"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          <div className="p-2 bg-zinc-850/90 backdrop-blur-xs border-t border-zinc-800 flex items-end gap-1.5 shrink-0">
                            {/* Hidden Image File Input */}
                            <input
                              ref={imageFileInputRef}
                              type="file"
                              accept="image/png, image/jpeg, image/jpg, image/webp"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await globalImageTaskQueue.enqueue(() =>
                                      compressImage(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.8, maxFileSizeBytes: 300 * 1024 })
                                    );
                                    setSelectedImage(compressed.dataUrl);
                                  } catch (err) {
                                    console.error('Image compression failed:', err);
                                    alert('图片处理失败，请选择其他图片重试');
                                  }
                                }
                                e.target.value = '';
                              }}
                            />

                            {/* Left-side "+" Button to select image */}
                            <button
                              type="button"
                              onClick={() => imageFileInputRef.current?.click()}
                              title="选择并发送图片"
                              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 active:scale-95 text-sky-400 hover:text-sky-300 border border-zinc-700 transition cursor-pointer shrink-0 self-end mb-0.5"
                            >
                              <Plus className="w-4 h-4" />
                            </button>

                            {/* Auto-growing Multi-line Textarea */}
                            <textarea
                              ref={inputRef}
                              rows={1}
                              placeholder={`给 ${activeCharacter.name} 发送消息... (Enter发送)`}
                              value={inputText}
                              onChange={(e) => {
                                setInputText(e.target.value);
                                adjustTextareaHeight(e.currentTarget);
                              }}
                              onInput={(e) => {
                                setInputText(e.currentTarget.value);
                                adjustTextareaHeight(e.currentTarget);
                              }}
                              onCompositionStart={() => {
                                isComposingRef.current = true;
                              }}
                              onCompositionEnd={(e) => {
                                isComposingRef.current = false;
                                setInputText(e.currentTarget.value);
                                adjustTextareaHeight(e.currentTarget);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isComposingRef.current) {
                                  e.preventDefault();
                                  const rawVal = inputRef.current?.value !== undefined ? inputRef.current.value : inputText;
                                  const val = rawVal.trim();
                                  if (e.shiftKey) {
                                    handleTriggerAiReply();
                                  } else {
                                    if (val || selectedImage) {
                                      handleSendUserOnlyMessage(val, selectedImage);
                                    } else {
                                      handleTriggerAiReply();
                                    }
                                  }
                                }
                              }}
                              className="flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none overflow-y-auto leading-relaxed max-h-[132px] min-h-[36px]"
                            />

                            {/* Send Button */}
                            <button
                              onClick={handleSendButtonClick}
                              disabled={isLoading}
                              style={{ touchAction: 'manipulation' }}
                              title="单击发送当前消息/图片（可连发多句）；快速双击直接召唤 AI 综合回复"
                              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 text-white font-medium text-xs flex items-center gap-1 shadow-xs transition cursor-pointer shrink-0 self-end mb-0.5"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>发送</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  // Chat List View (Includes Group Chats + 1-on-1 Character Chats)
                  <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80">
                    {groupChats.length === 0 && characters.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center text-center px-4 space-y-3">
                        <div className="w-14 h-14 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center shadow-inner">
                          <MessageCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-200">暂无聊天消息</h4>
                          <p className="text-xs text-zinc-400 mt-1">前往通讯录添加好友或创建 AI 开启交流</p>
                        </div>
                        <button
                          onClick={() => setActiveTab('contacts')}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium text-xs shadow-md hover:brightness-110 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>添加好友 / 创建 AI</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Group Chats Section */}
                    {groupChats.map((group) => {
                      const lastMsg =
                        group.messages && group.messages.length > 0
                          ? group.messages[group.messages.length - 1]
                          : null;
                      const unreadCount = unreadGroupCounts[group.id] || 0;

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
                            {unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs animate-pulse">
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
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
                              {unreadCount > 0 && (
                                <span className="text-[10px] min-w-[18px] h-4 px-1.5 rounded-full bg-emerald-500 text-white font-bold shrink-0 flex items-center justify-center animate-pulse">
                                  {unreadCount > 99 ? '99+' : unreadCount}
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
                              <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs animate-pulse">
                                {unreadCount > 99 ? '99+' : unreadCount}
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
                              {unreadCount > 0 && (
                                <span className="text-[10px] min-w-[18px] h-4 px-1.5 rounded-full bg-emerald-500 text-white font-bold shrink-0 flex items-center justify-center animate-pulse">
                                  {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                      </>
                    )}
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

                {/* Friend List with Swipe Left Actions */}
                {characters.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center px-4 space-y-3">
                    <div className="w-14 h-14 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center shadow-inner">
                      <UserPlus className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-200">还没有好友</h4>
                      <p className="text-xs text-zinc-400 mt-1">点击上方「新的朋友」创建专属 AI 或添加好友</p>
                    </div>
                    <button
                      onClick={() => setShowAddFriendModal(true)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium text-xs shadow-md hover:brightness-110 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>添加好友 / 创建 AI</span>
                    </button>
                  </div>
                ) : (
                  characters.map((char) => (
                    <ContactSwipeRow
                      key={char.id}
                      char={char}
                      isOpen={swipedContactId === char.id}
                      onOpen={(id) => setSwipedContactId(id)}
                      onClose={() => setSwipedContactId(null)}
                      onOpenChat={(id) => {
                        handleOpenChat(id);
                        setActiveTab('chats');
                      }}
                      onToggleLock={(targetChar) => {
                        onUpdateCharacters(
                          characters.map((c) => (c.id === targetChar.id ? { ...c, isLocked: !c.isLocked } : c))
                        );
                      }}
                      onRequestDelete={(targetChar) => {
                        setCharacterToDelete(targetChar);
                        setDeleteMemoryVaultWithChar(true);
                      }}
                      onOpenMemoryVault={(targetChar) => {
                        setMemoryVaultTargetChar(targetChar);
                        setShowMemoryVaultModal(true);
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* TAB 3: MOMENTS (朋友圈) */}
        {activeTab === 'moments' && (
          <div className="w-full h-full overflow-y-auto p-3 space-y-4">
            {moments.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center px-4 space-y-3">
                <div className="w-14 h-14 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center shadow-inner">
                  <Compass className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">暂无朋友圈动态</h4>
                  <p className="text-xs text-zinc-400 mt-1">发一条新动态表达当下的心情与生活吧</p>
                </div>
                <button
                  onClick={() => setShowCreatePostModal(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition cursor-pointer"
                >
                  <span>发一条动态</span>
                </button>
              </div>
            ) : (
              moments.map((post) => (
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
            )))}
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

            {/* Data Management & Backup Center Card */}
            <div className="p-4 rounded-3xl bg-zinc-850 border border-zinc-750 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                  <Database className="w-4 h-4" />
                  <span>数据管理中心 (Data Management)</span>
                </div>
                <span className="text-[10px] text-zinc-500">导入/导出/去重合并/快照回滚</span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                全量备份所有 AI 人设档案、聊天记录、长期记忆库和群聊数据。支持导入 ZIP/JSON/TXT 格式并自动安全去重。
              </p>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  onClick={() => {
                    setDataModalTab('import');
                    setShowDataModal(true);
                  }}
                  className="p-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 transition active:scale-95"
                >
                  <Upload className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-[11px]">导入数据</span>
                  <span className="text-[9px] text-zinc-400">ZIP/JSON/TXT</span>
                </button>

                <button
                  onClick={() => {
                    setDataModalTab('export');
                    setShowDataModal(true);
                  }}
                  className="p-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 transition active:scale-95"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-[11px]">导出数据</span>
                  <span className="text-[9px] text-zinc-400">4种格式可选</span>
                </button>

                <button
                  onClick={() => {
                    setDataModalTab('snapshots');
                    setShowDataModal(true);
                  }}
                  className="p-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 transition active:scale-95"
                >
                  <History className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-[11px]">备份回滚</span>
                  <span className="text-[9px] text-zinc-400">安全快照</span>
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

            {/* Independent Local Memory Space Entry (独立专属记忆空间) */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>{activeCharacter.name} 专属本地记忆空间</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                  严格隔离
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                每个 AI 拥有完全独立的本地记忆库。支持导入 ZIP、JSON、JSONL、TXT 等文件，AI 将在聊天中按需智能检索回忆，绝不会污染当前聊天窗口。
              </p>
              <button
                onClick={() => {
                  setShowAiSettingsModal(false);
                  setMemoryVaultTargetChar(activeCharacter);
                  setShowMemoryVaultModal(true);
                }}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>进入「{activeCharacter.name}」专属记忆空间</span>
              </button>
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

            {/* Multi-Bubble Messaging Settings (一句话发一条消息，分句连发) */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                  <MessageSquarePlus className="w-4 h-4 text-emerald-400" />
                  <span>真人打字分句连发（一句话一条消息）</span>
                </div>
                <button
                  onClick={() => {
                    const next = !multiBubbleConfig.enabled;
                    const updated = saveMultiBubbleConfig({ enabled: next });
                    setMultiBubbleConfig(updated);
                  }}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    multiBubbleConfig.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      multiBubbleConfig.enabled ? 'right-1' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                像真人发微信一样，把整段回复智能切分成 2~5 条自然短句连续发送，带打字状态与震动反馈，彻底告别单条大长段。
              </p>

              {multiBubbleConfig.enabled && (
                <div className="space-y-2 pt-1 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-[11px]">打字间隔节奏</span>
                    <div className="flex gap-1">
                      {(['fast', 'normal', 'slow'] as const).map((spd) => (
                        <button
                          key={spd}
                          onClick={() => {
                            const updated = saveMultiBubbleConfig({ speed: spd });
                            setMultiBubbleConfig(updated);
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer ${
                            multiBubbleConfig.speed === spd
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {spd === 'fast' ? '快 (轻快)' : spd === 'normal' ? '标准 (自然)' : '稍慢 (悠闲)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-[11px]">单次连发上限</span>
                    <div className="flex gap-1.5">
                      {[3, 4, 5, 6].map((cnt) => (
                        <button
                          key={cnt}
                          onClick={() => {
                            const updated = saveMultiBubbleConfig({ maxBubbles: cnt });
                            setMultiBubbleConfig(updated);
                          }}
                          className={`w-7 h-6 rounded-lg text-[10px] font-mono font-medium transition cursor-pointer flex items-center justify-center ${
                            multiBubbleConfig.maxBubbles === cnt
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {cnt}句
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
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
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>立即开始自由设定 AI</span>
                  </button>
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

      {/* Full-featured Data Management Modal */}
      <DataManagementModal
        isOpen={showDataModal}
        onClose={() => setShowDataModal(false)}
        initialTab={dataModalTab}
        onDataChanged={() => {
          setGroupChats(loadGroupChats());
          setDbVersionKey((prev) => prev + 1);
          if (onDataChanged) onDataChanged();
        }}
      />

      {/* Delete Character with Memory Vault Choice Modal (Requirement 8) */}
      {characterToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-rose-500/30 p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>删除好友确认</span>
              </div>
              <button
                onClick={() => setCharacterToDelete(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-800/80 border border-zinc-750">
              <img
                src={characterToDelete.avatar}
                alt=""
                className="w-12 h-12 rounded-xl object-cover border border-zinc-700 shrink-0"
              />
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-zinc-100">{characterToDelete.name}</h4>
                <p className="text-xs text-zinc-400 font-mono">微信号: {characterToDelete.wxid}</p>
                <p className="text-[11px] text-zinc-500 truncate">{characterToDelete.persona}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              确定要删除该 AI 好友吗？删除后将无法通过好友列表与其发起私聊。
            </p>

            {/* Requirement 8: Checkbox to choose whether to delete memory vault */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-850 border border-zinc-750 cursor-pointer hover:bg-zinc-800 transition">
              <input
                type="checkbox"
                checked={deleteMemoryVaultWithChar}
                onChange={(e) => setDeleteMemoryVaultWithChar(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-zinc-700 border-zinc-600 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-zinc-200 block">
                  同时彻底清除该 AI 的独立本地记忆空间
                </span>
                <span className="text-[10px] text-zinc-400 leading-normal block mt-0.5">
                  包括该 AI 名下已导入的全部资料文件、切片与检索索引（IndexedDB 永久擦除）。取消勾选可保留文件记忆。
                </span>
              </div>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setCharacterToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const target = characterToDelete;
                  if (!target) return;
                  try {
                    await deleteAiMemoryVault(target.id, deleteMemoryVaultWithChar);
                  } catch (e) {
                    console.error('Delete memory vault failed:', e);
                  }
                  onUpdateCharacters(characters.filter((c) => c.id !== target.id));
                  if (activeChatId === target.id) {
                    setActiveChatId(null);
                  }
                  setCharacterToDelete(null);
                  setSwipedContactId(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Memory Vault Full Management Modal */}
      {showMemoryVaultModal && memoryVaultTargetChar && (
        <AiMemoryVaultModal
          isOpen={showMemoryVaultModal}
          onClose={() => setShowMemoryVaultModal(false)}
          currentCharacter={memoryVaultTargetChar}
          allCharacters={characters}
          onSelectCharacter={(char) => setMemoryVaultTargetChar(char)}
        />
      )}

      {/* Offline Mode Screen Modal Overlay */}
      {showOfflineModal && activeCharacter && (
        <div className="fixed inset-0 z-50 bg-zinc-950">
          <OfflineModeHome
            characters={characters}
            userProfile={userProfile}
            apiConfig={apiConfig}
            initialCharacterId={activeCharacter.id}
            onUpdateCharacters={onUpdateCharacters}
            onBack={() => setShowOfflineModal(false)}
          />
        </div>
      )}
    </div>
  );
};
