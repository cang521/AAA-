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
import { cleanPseudoMemories, triggerSmartMemoryExtraction } from '../../lib/memoryExtractor';
import { aiReplyTaskManager } from '../../lib/aiReply/AiReplyTaskManager';
import { AiReplyTaskStatus } from '../../lib/aiReply/AiReplyTaskStore';
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
  ChevronRight,
  UserPlus,
  RefreshCw,
  Copy,
  Quote,
  Search,
  BookOpen,
  ImageIcon,
  MessageCircle,
  MessageSquare,
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
  AlertCircle,
  RotateCcw,
  Smartphone,
  Globe2,
  Loader2,
  ScanSearch,
} from 'lucide-react';
import {
  recognizeMessageImage,
  generateImageForMessage,
  recoverPendingImageTasks,
  downloadOrSaveImage,
} from '../../lib/image/imageCapabilitiesService';
import { AiPhoneViewerModal } from './social/AiPhoneViewerModal';
import { AiRomanticSettingsSection } from './social/AiRomanticSettingsSection';
import { AiSocialSettingsPanel } from './social/AiSocialSettingsPanel';
import { getEffectiveRomanticState, saveRomanticState } from '../../lib/social/socialDb';
import { onMomentPublishedSocialTick } from '../../lib/social/socialEngine';
import { buildCharacterRomanticDefault } from '../../lib/social/relationshipRules';
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
  AiRomanticState,
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
import { loadCharacters, loadGroupChats, loadGroupChatsAsync, saveGroupChats, DEFAULT_AI_AVATAR, DEFAULT_USER_AVATAR } from '../../lib/storage';
import { hydrateGroupChatsFromDb, subscribeGroupChatDb } from '../../lib/groupChatDb';
import { ensureCharacterNotificationAvatar } from '../../lib/notificationAvatar';
import { CreateGroupModal } from './group/CreateGroupModal';
import { GroupChatView } from './group/GroupChatView';
import { JoinGroupByCodeModal } from './group/JoinGroupByCodeModal';
import { GroupAvatar } from './group/GroupAvatar';
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
import { nativeNotificationService } from '../../lib/NativeNotificationService';
import { StableTextInput } from '../common/StableTextInput';
import { StableTextarea } from '../common/StableTextarea';
import { useStableTextEditing } from '../../hooks/useStableTextEditing';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ContactSwipeRow } from './ContactSwipeRow';
import { AiMemoryVaultModal } from './memory/AiMemoryVaultModal';
import { searchAiMemoryChunks, deleteAiMemoryVault } from '../../lib/aiMemoryVaultDb';
import { recallArchivedHistory, getAiArchiveConfig } from '../../lib/chatArchiveDb';
import { OfflineModeHome } from '../offline/OfflineModeHome';
import { OfflineHistoryDetailModal } from '../offline/OfflineHistoryDetailModal';
import { PressableButton, LikeBurstButton } from '../ui/interaction';
import './wechat/theme/wechatClassicTheme.css';
import {
  WeChatThemeId,
  loadWeChatTheme,
  saveWeChatTheme,
  WeChatThemeCenter,
  WeChatPersonPlusIcon,
  WeChatGroupIcon,
} from './wechat/theme';
import { ChatFontSizePreview } from './wechat/ChatFontSizePreview';
import {
  ChatDisplayPreference,
  ChatFontPresetId,
  MIN_CHAT_MESSAGE_FONT_SIZE,
  MAX_CHAT_MESSAGE_FONT_SIZE,
  clampChatMessageFontSize,
  getDefaultChatMessageFontSize,
  getChatFontPresets,
  loadAllChatDisplayPreferences,
  hasCustomChatDisplayPreference,
  getEffectiveChatMessageFontSize,
  saveChatDisplayPreference,
  resetChatDisplayPreference,
} from '../../lib/chatDisplayPreferences';

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
  pendingChatId?: string | null;
  onConsumePendingChatId?: () => void;
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
  pendingChatId,
  onConsumePendingChatId,
  onUpdateCharacters,
  onUpdateMoments,
  onUpdateUserProfile,
  onAddApiLog,
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'moments' | 'me'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Internal WeChat Theme State (strictly scoped to WeChat app)
  const [wechatTheme, setWechatTheme] = useState<WeChatThemeId>(() => loadWeChatTheme());
  const [meSubView, setMeSubView] = useState<'hub' | 'persona' | 'settings' | 'theme' | 'social'>('hub');
  const [showChatListSearch, setShowChatListSearch] = useState(false);
  const [chatListSearchQuery, setChatListSearchQuery] = useState('');
  const [showGroupListModal, setShowGroupListModal] = useState(false);

  // Data Management Modal State
  const [showDataModal, setShowDataModal] = useState(false);
  const [dataModalTab, setDataModalTab] = useState<'import' | 'export' | 'snapshots'>('import');

  // Group Chat State
  const [groupChats, setGroupChats] = useState<GroupChat[]>(() => loadGroupChats());
  const groupChatsRef = useRef<GroupChat[]>(groupChats);
  groupChatsRef.current = groupChats;
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
  const [hasDraftText, setHasDraftText] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [quoteMsgId, setQuoteMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showWorldBookModal, setShowWorldBookModal] = useState<WorldBook | null>(null);

  // In-flight send guard & rapid click debounce refs
  const isSubmittingRef = useRef<boolean>(false);
  const inFlightUserSaveRef = useRef<Promise<ChatMessage | null> | null>(null);
  const lastSendTimestampRef = useRef<number>(0);
  const lastRerollTimestampRef = useRef<number>(0);
  const [failedTaskInfo, setFailedTaskInfo] = useState<{ task: any; error: string } | null>(null);
  const [, setTaskUpdateTick] = useState<number>(0);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const composerEditor = useStableTextEditing<HTMLTextAreaElement>({
    defaultValue: '',
    onValueChange: (nextValue) => {
      if (isSubmittingRef.current) return;
      setInputText((prev) => (prev === nextValue ? prev : nextValue));
    },
    onHasTextChange: (hasText) => {
      setHasDraftText(hasText);
    },
    externalRef: inputRef,
    autoResize: true,
    minHeightPx: 36,
    maxHeightPx: 132,
  });

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

  const clearComposerInput = useCallback(() => {
    composerEditor.clear();
    setInputText('');
    setHasDraftText(false);
  }, [composerEditor]);

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
  const [aiPhoneViewerChar, setAiPhoneViewerChar] = useState<AiCharacter | null>(null);

  // Human-like Multi-Bubble Messaging Engine States (一句话一条消息，一整段分割连发)
  const [multiBubbleConfig, setMultiBubbleConfig] = useState<MultiBubbleConfig>(() => getMultiBubbleConfig());
  const [activeTaskStatus, setActiveTaskStatus] = useState<AiReplyTaskStatus | null>(null);
  const [isAiMultiTyping, setIsAiMultiTyping] = useState(false);
  const [multiTypingName, setMultiTypingName] = useState<string | null>(null);
  const [multiBubbleToast, setMultiBubbleToast] = useState<string | null>(null);

  // Memory management collapsible folder (Requirement 5)
  const [isMemoryFolderOpen, setIsMemoryFolderOpen] = useState(false);
  const [newMemoryInput, setNewMemoryInput] = useState('');

  // Cleanup Pseudo Memories Modal State
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupPseudoList, setCleanupPseudoList] = useState<string[]>([]);
  const [cleanupValidList, setCleanupValidList] = useState<string[]>([]);
  const [cleanupFeedback, setCleanupFeedback] = useState<string | null>(null);

  const handleOpenCleanupModal = () => {
    if (!activeCharacter) return;
    const { validMemories, removedPseudoMemories } = cleanPseudoMemories(activeCharacter.memories || []);
    setCleanupPseudoList(removedPseudoMemories);
    setCleanupValidList(validMemories);
    setCleanupFeedback(null);
    setShowCleanupModal(true);
  };

  const handleConfirmCleanupMemories = () => {
    if (!activeCharacter) return;
    onUpdateCharacters(
      characters.map((c) =>
        c.id === activeCharacter.id ? { ...c, memories: cleanupValidList } : c
      )
    );
    setCleanupFeedback(`已成功清理 ${cleanupPseudoList.length} 条历史伪记忆！`);
    setTimeout(() => {
      setShowCleanupModal(false);
      setCleanupFeedback(null);
    }, 1200);
  };

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
  const [offlineDetailSessionId, setOfflineDetailSessionId] = useState<string | null>(null);

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
  const [editedRomanticState, setEditedRomanticState] = useState<AiRomanticState | null>(null);
  const [addFriendSearchQuery, setAddFriendSearchQuery] = useState('');

  // Per-AI chat message font size preference & modal draft state
  const [chatDisplayPrefs, setChatDisplayPrefs] = useState<Record<string, ChatDisplayPreference>>(
    () => loadAllChatDisplayPreferences()
  );
  const defaultChatFontSize = getDefaultChatMessageFontSize(wechatTheme);
  const [draftMessageFontSize, setDraftMessageFontSize] = useState<number>(defaultChatFontSize);
  const [draftFontResetPending, setDraftFontResetPending] = useState<boolean>(true);
  const [draftPresetHint, setDraftPresetHint] = useState<ChatFontPresetId | null>(null);
  const activeChatFontSize = activeCharacter
    ? getEffectiveChatMessageFontSize(chatDisplayPrefs, activeCharacter.id, wechatTheme)
    : defaultChatFontSize;
  const chatFontPresets = getChatFontPresets(wechatTheme);

  // Hydrate group chats from IndexedDB (migrating any legacy localStorage copy cleanly)
  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeGroupChatDb((nextGroups) => {
      if (!mounted) return;
      groupChatsRef.current = nextGroups;
      setGroupChats(nextGroups);
    });
    void hydrateGroupChatsFromDb().then((hydrated) => {
      if (!mounted) return;
      groupChatsRef.current = hydrated;
      setGroupChats(hydrated);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Group Chat Handlers
  const handleCreateGroup = (newGroup: GroupChat) => {
    const updated = [newGroup, ...groupChatsRef.current];
    groupChatsRef.current = updated;
    setGroupChats(updated);
    saveGroupChats(updated);
    setActiveGroupChatId(newGroup.id);
    setActiveTab('chats');
  };

  const handleUpdateGroup = (updatedGroup: GroupChat) => {
    const updated = groupChatsRef.current.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));
    groupChatsRef.current = updated;
    setGroupChats(updated);
    saveGroupChats(updated);
  };

  const handleDeleteGroup = (groupId: string) => {
    const updated = groupChatsRef.current.filter((g) => g.id !== groupId);
    groupChatsRef.current = updated;
    setGroupChats(updated);
    saveGroupChats(updated);
    if (activeGroupChatId === groupId) {
      setActiveGroupChatId(null);
    }
  };

  const handleJoinGroupSuccess = (targetGroup: GroupChat, newReq?: GroupJoinRequest) => {
    if (newReq) {
      const existing = groupChatsRef.current.find((g) => g.id === targetGroup.id) || targetGroup;
      const updatedReqs = [...(existing.joinRequests || []), newReq];
      const updatedGroup = { ...existing, joinRequests: updatedReqs };
      handleUpdateGroup(updatedGroup);
    } else {
      const exists = groupChatsRef.current.find((g) => g.id === targetGroup.id);
      if (!exists) {
        const updated = [targetGroup, ...groupChatsRef.current];
        groupChatsRef.current = updated;
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
    const target = groupChatsRef.current.find((g) => g.id === groupId);
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

  const [lightboxImageMsg, setLightboxImageMsg] = useState<ChatMessage | null>(null);
  const [lightboxShowDetails, setLightboxShowDetails] = useState(false);

  const activeChatIdRef = useRef<string | null>(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (activeChatId) {
      setUnreadAiCounts((prev) => ({
        ...prev,
        [activeChatId]: 0,
      }));
      void recoverPendingImageTasks(activeChatId);
    }
  }, [activeChatId]);

  // Subscribe to DB updates for real-time contact list previews & incremental message additions / in-place updates
  useEffect(() => {
    const unsubscribe = subscribeChatDb((event) => {
      setDbVersionKey((k) => k + 1);

      if (event && event.type === 'message_updated') {
        const { characterId, message } = event;
        if (activeChatIdRef.current === characterId) {
          setDisplayedMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === message.id);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = message;
            latestMessagesRef.current = updated;
            return updated;
          });
          setLightboxImageMsg((curr) => (curr && curr.id === message.id ? message : curr));
        }
      } else if (event && event.type === 'message_saved') {
        const { characterId, message } = event;
        if (activeChatIdRef.current === characterId) {
          setDisplayedMessages((prev) => {
            const existingIdx = prev.findIndex((m) => m.id === message.id);
            if (existingIdx !== -1) {
              const updated = [...prev];
              updated[existingIdx] = message;
              latestMessagesRef.current = updated;
              return updated;
            }
            const updated = [...prev, message];
            latestMessagesRef.current = updated;
            setTotalHistoryCount((count) => count + 1);
            return updated;
          });
          setLightboxImageMsg((curr) => (curr && curr.id === message.id ? message : curr));

          const container = messageListRef.current;
          const isNearBottom = container
            ? container.scrollHeight - container.scrollTop - container.clientHeight < 150
            : true;
          if (isNearBottom) {
            scrollToBottom(true);
          }
        } else if (message.sender === 'ai') {
          // AI message delivered in background while user is viewing contact list or another chat
          setUnreadAiCounts((prev) => ({
            ...prev,
            [characterId]: (prev[characterId] || 0) + 1,
          }));
        }
      } else if (event && event.type === 'turn_replaced') {
        const { characterId, oldMessageIds, newMessages } = event;
        if (activeChatIdRef.current === characterId) {
          const oldSet = new Set(oldMessageIds);
          setDisplayedMessages((prev) => {
            const firstOldIdx = prev.findIndex((m) => oldSet.has(m.id));
            if (firstOldIdx === -1) {
              return prev;
            }
            const withoutOld = prev.filter((m) => !oldSet.has(m.id));
            const updated = [
              ...withoutOld.slice(0, firstOldIdx),
              ...newMessages,
              ...withoutOld.slice(firstOldIdx),
            ];
            latestMessagesRef.current = updated;
            return updated;
          });
          setTotalHistoryCount((count) => Math.max(0, count - oldMessageIds.length + newMessages.length));
        }
      } else {
        // Bulk save or DB restore / clear occurred: refresh active chat view if open
        if (activeChatIdRef.current) {
          getMessagesPaged(activeChatIdRef.current, PAGE_SIZE)
            .then((result) => {
              setDisplayedMessages(result.messages);
              latestMessagesRef.current = result.messages;
              setHasMoreOlder(result.hasMore);
              setTotalHistoryCount(result.totalCount);
            })
            .catch((err) => console.error('Failed to reload messages on DB update:', err));
        }
      }
    });
    return () => unsubscribe();
  }, [scrollToBottom]);

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
      setEditedRomanticState(buildCharacterRomanticDefault(activeCharacter));
      void getEffectiveRomanticState(activeCharacter).then((rs) => {
        setEditedRomanticState(rs);
      });

      const defaultSize = getDefaultChatMessageFontSize(wechatTheme);
      const savedPrefs = loadAllChatDisplayPreferences();
      const savedPref = savedPrefs[activeCharacter.id];
      const hasSavedPref = hasCustomChatDisplayPreference(activeCharacter.id);
      setDraftMessageFontSize(
        savedPref ? clampChatMessageFontSize(savedPref.messageFontSize, defaultSize) : defaultSize
      );
      setDraftFontResetPending(!hasSavedPref);
      setDraftPresetHint(null);
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

  // Navigate directly to target AI chat when launched from an Android notification tap
  useEffect(() => {
    if (!pendingChatId) return;
    const targetExists = characters.some((c) => c.id === pendingChatId);
    setActiveTab('chats');
    setMeSubView('hub');
    setShowAiSettingsModal(false);
    setShowOfflineModal(false);
    if (targetExists) {
      handleOpenChat(pendingChatId);
    } else {
      // Target character missing/deleted: stay safely in conversation list (never fallback to characters[0])
      setActiveChatId(null);
      setActiveGroupChatId(null);
    }
    onConsumePendingChatId?.();
  }, [pendingChatId, characters, onConsumePendingChatId]);

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

  // Sync AI typing / thinking state from background AiReplyTaskManager
  useEffect(() => {
    const updateTaskStatusState = () => {
      setTaskUpdateTick((t) => t + 1);
      if (activeCharacter) {
        const state = aiReplyTaskManager.getCharacterTaskState(activeCharacter.id);
        setActiveTaskStatus(state);
        setIsLoading(!!state);
        setFailedTaskInfo(aiReplyTaskManager.getCharacterFailedTask(activeCharacter.id));
      } else {
        setActiveTaskStatus(null);
        setIsLoading(false);
        setFailedTaskInfo(null);
      }
    };
    updateTaskStatusState();
    const unsubscribe = aiReplyTaskManager.subscribe(updateTaskStatusState);
    return () => {
      unsubscribe();
    };
  }, [activeCharacter?.id]);

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

  // 1. Single-Click: Send user message ONLY and persist to DB (Does NOT trigger AI reply)
  const handleSendUserOnlyMessage = async (): Promise<ChatMessage | null> => {
    if (isSubmittingRef.current) {
      return inFlightUserSaveRef.current ? await inFlightUserSaveRef.current : null;
    }
    const now = Date.now();

    const rawVal = inputRef.current?.value ?? '';
    const cleanText = rawVal.trim();
    const imageToSend = selectedImage;
    if (!cleanText && !imageToSend) return null;
    if (!activeCharacter) return null;

    isSubmittingRef.current = true;
    lastSendTimestampRef.current = now;

    // Immediately clear input DOM and React state to prevent duplicate read or ghost typing
    clearComposerInput();
    setSelectedImage(null);
    const quoteId = quoteMsgId;
    setQuoteMsgId(null);

    const userMsg: ChatMessage = {
      id: 'msg_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      characterId: activeCharacter.id,
      sender: 'user',
      text: cleanText,
      messageType: imageToSend ? 'image' : 'text',
      type: imageToSend ? 'image' : 'text',
      imageUrl: imageToSend || undefined,
      recognitionStatus: imageToSend ? 'pending' : undefined,
      imageAnalysisStatus: imageToSend ? 'pending' : undefined,
      timestamp: Date.now(),
      quoteMessageId: quoteId || undefined,
    };

    // Synchronously update latest messages ref before React state re-renders
    const currentList = latestMessagesRef.current.length > 0 ? latestMessagesRef.current : displayedMessages;
    const updatedMessages = [...currentList, userMsg];
    latestMessagesRef.current = updatedMessages;
    setDisplayedMessages(updatedMessages);
    setTotalHistoryCount((c) => c + 1);
    scrollToBottom(true);

    const savePromise = (async (): Promise<ChatMessage | null> => {
      try {
        // Authoritative write to IndexedDB first
        await saveChatMessage(userMsg);

        // Clear any prior failure state for this character
        aiReplyTaskManager.clearFailedTask(activeCharacter.id);

        // Tracked vision recognition strictly bound to userMsg.id (awaited automatically before AI reply)
        if (imageToSend) {
          void recognizeMessageImage(userMsg, { source: '微信用户发图识别' });
        }

        return userMsg;
      } catch (e) {
        console.error('Failed to save user message to DB:', e);
        return null;
      }
    })();

    inFlightUserSaveRef.current = savePromise;
    try {
      return await savePromise;
    } finally {
      isSubmittingRef.current = false;
      inFlightUserSaveRef.current = null;
    }
  };

  // 2. Double-Click Handler: Trigger AI reply for all unreplied user messages in the turn
  const handleTriggerAiReply = async () => {
    if (!activeCharacter) return;

    // Prevent duplicate AI tasks if AI is already thinking or generating for this character
    if (aiReplyTaskManager.isCharacterThinking(activeCharacter.id) || isLoading) {
      setMultiBubbleToast('AI 正在思考回复中，请稍候...');
      setTimeout(() => setMultiBubbleToast(null), 2000);
      return;
    }

    const currentList = latestMessagesRef.current.length > 0 ? latestMessagesRef.current : displayedMessages;

    // Find all consecutive unreplied user messages waiting for AI response
    const pendingUserMsgs: ChatMessage[] = [];
    for (let i = currentList.length - 1; i >= 0; i--) {
      if (currentList[i].sender === 'user') {
        pendingUserMsgs.unshift(currentList[i]);
      } else {
        break;
      }
    }

    if (pendingUserMsgs.length === 0) {
      setMultiBubbleToast('当前没有等待 AI 回复的用户消息');
      setTimeout(() => setMultiBubbleToast(null), 2000);
      return;
    }

    const currentTurnMessageIds = pendingUserMsgs.map((m) => m.id).filter(Boolean);
    const combinedUserText =
      pendingUserMsgs.length > 1
        ? pendingUserMsgs.map((m, idx) => `[第 ${idx + 1} 句] ${m.text}`).join('\n')
        : pendingUserMsgs[0].text;

    try {
      setIsLoading(true);
      await aiReplyTaskManager.enqueueTask({
        characterId: activeCharacter.id,
        userMessages: pendingUserMsgs,
        combinedUserText,
        currentTurnMessageIds,
        options: { vibrationPattern: [60, 40, 60] },
      });
    } catch (e) {
      console.error('Failed to enqueue AI reply task:', e);
    }
  };

  // 3. Send Button Click Router: Single-click sends user message only; Double-click triggers AI reply
  const lastSendBtnClickTimeRef = useRef<number>(0);

  const handleSendButtonClick = async () => {
    const now = Date.now();
    const timeDelta = now - lastSendBtnClickTimeRef.current;

    if (timeDelta > 0 && timeDelta < 320) {
      // === DOUBLE CLICK DETECTED ===
      lastSendBtnClickTimeRef.current = 0;

      // Ensure click 1's user message save completes before reading latest messages
      if (inFlightUserSaveRef.current) {
        await inFlightUserSaveRef.current;
      }

      // 1. If user typed text right before this 2nd click, send that message first
      const rawText = inputRef.current?.value ?? '';
      if (rawText.trim() || selectedImage) {
        await handleSendUserOnlyMessage();
      }
      // 2. Trigger AI to reply to all unreplied user messages in the turn
      await handleTriggerAiReply();
    } else {
      // === SINGLE CLICK ===
      lastSendBtnClickTimeRef.current = now;
      const rawText = inputRef.current?.value ?? '';
      if (rawText.trim() || selectedImage) {
        await handleSendUserOnlyMessage();
      } else {
        // Empty input single-click: do nothing (Requirement 9: "输入框为空时，单击不能直接触发 AI。")
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
      void nativeNotificationService
        .notifyAiMessage(character, aiMsg.text, {
          messageId: aiMsg.id,
          bubbleIndex: 0,
          timestamp: aiMsg.timestamp,
          triggerSource: 'wechat_direct',
        })
        .catch(() => {});
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

      // Trigger Native Android System Notification IF app is in background (isAppActive === false)
      void nativeNotificationService
        .notifyAiMessage(character, bubbleText, {
          messageId: bubbleMsg.id,
          bubbleIndex: i,
          timestamp: bubbleMsg.timestamp,
          triggerSource: 'wechat_direct',
        })
        .catch(() => {});

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

  // Refresh / Regenerate AI response (Whole turn re-roll with data integrity)
  const handleRefreshAiResponse = async (aiMsg: ChatMessage) => {
    if (!activeCharacter) return;
    setMsgLongPressMenu(null);

    const now = Date.now();
    // 1. Prevent duplicate rapid clicks on re-roll
    if (now - lastRerollTimestampRef.current < 800) {
      return;
    }
    lastRerollTimestampRef.current = now;

    // 2. Prevent concurrent task conflicts for this character
    if (aiReplyTaskManager.isCharacterThinking(activeCharacter.id)) {
      setMultiBubbleToast('AI 正在思考回复中，请稍候再重试');
      setTimeout(() => setMultiBubbleToast(null), 2000);
      return;
    }

    const currentList = latestMessagesRef.current.length > 0 ? latestMessagesRef.current : displayedMessages;

    // 3. Identify all AI messages belonging to this entire response turn (Multi-bubble turn detection)
    let turnAiMessages: ChatMessage[] = [];
    if (aiMsg.turnId) {
      turnAiMessages = currentList.filter(
        (m) => m.sender === 'ai' && m.characterId === activeCharacter.id && m.turnId === aiMsg.turnId
      );
    }

    // Fallback if legacy message or turnId was not tagged: find contiguous AI block
    if (turnAiMessages.length === 0) {
      const targetIdx = currentList.findIndex((m) => m.id === aiMsg.id);
      if (targetIdx !== -1) {
        let start = targetIdx;
        while (start > 0 && currentList[start - 1].sender === 'ai' && currentList[start - 1].characterId === activeCharacter.id) {
          start--;
        }
        let end = targetIdx;
        while (end < currentList.length - 1 && currentList[end + 1].sender === 'ai' && currentList[end + 1].characterId === activeCharacter.id) {
          end++;
        }
        turnAiMessages = currentList.slice(start, end + 1);
      } else {
        turnAiMessages = [aiMsg];
      }
    }

    // 4. Find the original user messages that prompted this turn and preceding history context
    const firstAiMsg = turnAiMessages[0];
    const firstAiIdx = currentList.findIndex((m) => m.id === firstAiMsg.id);

    const promptUserMsgs: ChatMessage[] = [];
    let userScanIdx = firstAiIdx !== -1 ? firstAiIdx - 1 : currentList.length - 1;
    while (userScanIdx >= 0 && currentList[userScanIdx].sender === 'user') {
      promptUserMsgs.unshift(currentList[userScanIdx]);
      userScanIdx--;
    }

    const combinedUserText =
      promptUserMsgs.length > 1
        ? promptUserMsgs.map((m, idx) => `[第 ${idx + 1} 句] ${m.text}`).join('\n')
        : promptUserMsgs.length === 1
        ? promptUserMsgs[0].text
        : activeCharacter.greeting || '你好呀！';

    const lastImgMsg = [...promptUserMsgs].reverse().find((m) => m.imageAnalysis);
    const currentImageAnalysis = lastImgMsg?.imageAnalysis;

    // Sliced conversation history preceding this turn (excluding this turn's user messages and everything after)
    const conversationHistoryOverride = currentList.slice(0, userScanIdx + 1);

    // 5. DO NOT delete old messages before new generation succeeds!
    // Enqueue candidate reroll task in background TaskManager
    setIsLoading(true);
    setMultiBubbleToast(`正在重新生成${turnAiMessages.length > 1 ? `整轮(${turnAiMessages.length}条气泡)` : ''}回复...`);
    setTimeout(() => setMultiBubbleToast(null), 2500);

    const replaceMessageIds = turnAiMessages.map((m) => m.id);

    await aiReplyTaskManager.enqueueRerollTask({
      characterId: activeCharacter.id,
      userMessages: promptUserMsgs,
      combinedUserText,
      currentTurnMessageIds: promptUserMsgs.map((m) => m.id),
      currentImageAnalysis,
      replaceTurnId: aiMsg.turnId || undefined,
      replaceMessageIds,
      conversationHistoryOverride,
      options: { vibrationPattern: [60, 40, 60] },
    });
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
    if (!newChar.notificationAvatar && newChar.avatar) {
      void ensureCharacterNotificationAvatar(newChar).then((enriched) => {
        if (enriched.notificationAvatar) {
          const latest = loadCharacters();
          onUpdateCharacters(
            latest.map((c) =>
              c.id === enriched.id
                ? { ...c, notificationAvatar: enriched.notificationAvatar }
                : c
            )
          );
        }
      });
    }
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
    void onMomentPublishedSocialTick({
      postId: newPost.id,
      allCharacters: characters,
      userProfile,
      apiConfig,
      onAddApiLog,
    }).catch(() => {});
  };

  // Toggle Moments Post Like synced strictly to post.likes ('user_main')
  const handleToggleMomentLike = useCallback(
    (postId: string) => {
      const updatedMoments = moments.map((post) => {
        if (post.id !== postId) return post;
        const alreadyLiked = post.likes.some((l) => l.id === 'user_main');
        if (alreadyLiked) {
          return {
            ...post,
            likes: post.likes.filter((l) => l.id !== 'user_main'),
          };
        }
        return {
          ...post,
          likes: [
            ...post.likes.filter((l) => l.id !== 'user_main'),
            {
              id: 'user_main',
              name: userProfile.name,
              avatar: userProfile.avatar,
            },
          ],
        };
      });
      onUpdateMoments(updatedMoments);
    },
    [moments, onUpdateMoments, userProfile.avatar, userProfile.name]
  );

  const handleAddMomentComment = useCallback(
    (postId: string) => {
      const text = (commentInputs[postId] || '').trim();
      if (!text) return;
      const newComment = {
        id: 'comment_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        authorId: 'user_main',
        authorName: userProfile.name,
        authorAvatar: userProfile.avatar,
        text,
        timestamp: Date.now(),
      };
      const updatedMoments = moments.map((post) =>
        post.id === postId
          ? { ...post, comments: [...post.comments, newComment] }
          : post
      );
      onUpdateMoments(updatedMoments);
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      setOpenCommentPostId(null);
    },
    [commentInputs, moments, onUpdateMoments, userProfile.avatar, userProfile.name]
  );

  const totalUnreadCount =
    Object.values(unreadAiCounts).reduce((sum, n) => sum + (n || 0), 0) +
    Object.values(unreadGroupCounts).reduce((sum, n) => sum + (n || 0), 0);

  const normalizedChatQuery =
    wechatTheme === 'classic' && showChatListSearch
      ? chatListSearchQuery.trim().toLowerCase()
      : '';

  const filteredGroupChats = normalizedChatQuery
    ? groupChats.filter((g) => {
        const lastMsg =
          g.messages && g.messages.length > 0 ? g.messages[g.messages.length - 1].text : '';
        return (
          g.name.toLowerCase().includes(normalizedChatQuery) ||
          (g.notice || '').toLowerCase().includes(normalizedChatQuery) ||
          lastMsg.toLowerCase().includes(normalizedChatQuery)
        );
      })
    : groupChats;

  const filteredCharacters = normalizedChatQuery
    ? characters.filter((c) => {
        const meta = getCharacterMetaSync(c.id);
        const lastMsgText = meta.lastMessage?.text || c.greeting || '';
        return (
          c.name.toLowerCase().includes(normalizedChatQuery) ||
          (c.wxid || '').toLowerCase().includes(normalizedChatQuery) ||
          lastMsgText.toLowerCase().includes(normalizedChatQuery)
        );
      })
    : characters;

  return (
    <div
      data-wechat-theme={wechatTheme}
      className="wechat-app wx-shell w-full h-full flex flex-col bg-zinc-900 text-white select-none overflow-hidden font-sans"
    >
      {/* Top Navigation Bar Header */}
      {!activeGroupChatId && !(activeTab === 'me' && meSubView === 'theme') && (
        <div
          data-global-font-excluded={activeTab === 'chats' && activeChatId ? 'true' : undefined}
          className={`wx-header min-h-12 py-1.5 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between shrink-0 z-20 ${
            activeTab === 'chats' && activeChatId ? 'wechat-chat-font-isolated' : ''
          }`}
        >
          <PressableButton
            onClick={() => {
              if (activeChatId) {
                setActiveChatId(null);
              } else if (activeTab === 'me' && meSubView !== 'hub') {
                setMeSubView('hub');
              } else {
                onBackToLauncher();
              }
            }}
            expandHitArea
            className="wx-header-back flex items-center gap-1 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{activeChatId ? '微信' : '返回'}</span>
          </PressableButton>

          <div className="flex flex-col items-center">
            <h2 className="wx-header-title text-sm font-semibold tracking-wide flex items-center gap-1.5">
              {activeTab === 'chats' &&
                (activeChatId
                  ? activeCharacter.name
                  : wechatTheme === 'classic' && totalUnreadCount > 0
                  ? `微信 (${totalUnreadCount})`
                  : '微信')}
              {activeTab === 'contacts' && '通讯录'}
              {activeTab === 'moments' && '朋友圈'}
              {activeTab === 'me' &&
                (meSubView === 'persona'
                  ? '个人资料与人设'
                  : meSubView === 'settings'
                  ? '微信设置'
                  : meSubView === 'social'
                  ? 'AI 社会活动'
                  : '我')}
            </h2>
            {activeTab === 'chats' && activeChatId && (
              <span className="wx-muted-text text-[9px] text-zinc-500 font-mono">
                {activeTaskStatus === 'queued' || activeTaskStatus === 'preparing' || activeTaskStatus === 'generating' ? (
                  <span className="wx-green-text text-emerald-400 font-sans flex items-center gap-1 animate-pulse">
                    <span className="wx-green-dot w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    正在思考中…
                  </span>
                ) : activeTaskStatus === 'generated' || activeTaskStatus === 'delivering' ? (
                  <span className="wx-green-text text-emerald-400 font-sans flex items-center gap-1 animate-pulse">
                    <span className="wx-green-dot w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    正在输入中…
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
                {wechatTheme !== 'classic' && (
                  <PressableButton
                    onClick={() => {
                      setMemoryVaultTargetChar(activeCharacter);
                      setShowMemoryVaultModal(true);
                    }}
                    expandHitArea
                    className="wx-header-action p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 hover:text-emerald-300 transition cursor-pointer flex items-center gap-1 text-xs"
                    title={`${activeCharacter.name} 的专属本地记忆空间（导入/管理知识库）`}
                  >
                    <Database className="w-4 h-4" />
                  </PressableButton>
                )}

                <div className="relative">
                  <PressableButton
                    onClick={() => setShowChatOptionsMenu(!showChatOptionsMenu)}
                    expandHitArea
                    className="wx-header-action p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                    title="聊天设置与背景"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </PressableButton>

                  {/* Chat Top-Right Options Dropdown */}
                  {showChatOptionsMenu && (
                    <div
                      className="wx-dropdown absolute right-0 top-10 w-52 bg-zinc-850 rounded-2xl shadow-2xl border border-zinc-750 p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setShowChatOptionsMenu(false);
                          setMemoryVaultTargetChar(activeCharacter);
                          setShowMemoryVaultModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center justify-between transition cursor-pointer bg-emerald-950/20 border border-emerald-500/20"
                      >
                        <div className="flex items-center gap-2.5">
                          <Database className="wx-green-text w-3.5 h-3.5 text-emerald-400" />
                          <span>专属独立记忆空间</span>
                        </div>
                        <span className="wx-pill-badge text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
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
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center justify-between transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <MessageSquarePlus className="wx-green-text w-3.5 h-3.5 text-emerald-400" />
                          <span>分句连发模式</span>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                            multiBubbleConfig.enabled
                              ? 'wx-pill-badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'wx-sub-card bg-zinc-800 text-zinc-400'
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
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-amber-400 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5 text-amber-400" />
                        <span>查找聊天记录</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowChatOptionsMenu(false);
                          setShowBackgroundModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <Palette className="wx-green-text w-3.5 h-3.5 text-emerald-400" />
                        <span>自定义聊天背景</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowChatOptionsMenu(false);
                          setShowOfflineModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-rose-400 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <Heart className="w-3.5 h-3.5 text-rose-400" />
                        <span>进入线下模式</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowChatOptionsMenu(false);
                          setAiPhoneViewerChar(activeCharacter);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <Smartphone className="wx-green-text w-3.5 h-3.5 text-emerald-400" />
                        <span>查看TA的手机（只读）</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowChatOptionsMenu(false);
                          setShowAiSettingsModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-indigo-400 flex items-center gap-2.5 transition cursor-pointer"
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
              <div className="flex items-center gap-1">
                {wechatTheme === 'classic' && (
                  <button
                    onClick={() => {
                      setShowTopPlusMenu(false);
                      setShowChatListSearch((prev) => {
                        if (prev) setChatListSearchQuery('');
                        return !prev;
                      });
                    }}
                    className="wx-header-action p-1.5 rounded-xl transition flex items-center justify-center cursor-pointer"
                    title="搜索聊天记录与联系人"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                )}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTopPlusMenu(!showTopPlusMenu);
                    }}
                    className="wx-header-action p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 hover:text-emerald-300 transition flex items-center justify-center cursor-pointer"
                    title="群聊与功能菜单"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {/* Plus Dropdown Menu (Requirement 1: Group Chat reminder moved here) */}
                  {showTopPlusMenu && (
                    <div
                      className="wx-dropdown absolute right-0 top-10 w-48 bg-zinc-850 rounded-2xl shadow-2xl border border-zinc-750 p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150"
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
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center justify-between transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="wx-pill-badge w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <span>群聊空间</span>
                        </div>
                        <span className="wx-pill-badge text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 font-mono">
                          {groupChats.length}个群
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setShowTopPlusMenu(false);
                          setShowCreateGroupModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-emerald-400 flex items-center gap-2.5 transition"
                      >
                        <div className="wx-pill-badge w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                        </div>
                        <span>发起群聊</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowTopPlusMenu(false);
                          setShowJoinGroupByCodeModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-amber-400 flex items-center gap-2.5 transition"
                      >
                        <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center">
                          <KeyRound className="w-3.5 h-3.5" />
                        </div>
                        <span>输入群邀请码</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowTopPlusMenu(false);
                          setShowNewAiModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-teal-400 flex items-center gap-2.5 transition"
                      >
                        <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-500 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <span>创建专属 AI 好友</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowTopPlusMenu(false);
                          setShowAddFriendModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-indigo-400 flex items-center gap-2.5 transition"
                      >
                        {wechatTheme === 'classic' ? (
                          <div className="wx-icon-box-new-friend w-6 h-6 flex items-center justify-center">
                            <WeChatPersonPlusIcon className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                            <UserPlus className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <span>添加朋友</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowTopPlusMenu(false);
                          setDataModalTab('import');
                          setShowDataModal(true);
                        }}
                        className="wx-dropdown-item wx-primary-text wx-divider w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-750 hover:text-blue-400 flex items-center gap-2.5 transition border-t border-zinc-750/80 pt-2"
                      >
                        <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-500 flex items-center justify-center">
                          <Database className="w-3.5 h-3.5" />
                        </div>
                        <span>数据管理中心</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'contacts' && (
              <PressableButton
                onClick={() => setShowAddFriendModal(true)}
                withRipple
                rippleTone="light"
                className={`wx-header-cta text-white transition flex items-center gap-1 text-xs font-medium cursor-pointer ${
                  wechatTheme === 'classic'
                    ? 'px-2.5 py-1.5 rounded-[6px]'
                    : 'p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {wechatTheme === 'classic' ? (
                  <WeChatPersonPlusIcon className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                <span>加好友</span>
              </PressableButton>
            )}

            {activeTab === 'moments' && (
              <PressableButton
                onClick={() => setShowCreatePostModal(true)}
                withRipple
                rippleTone="light"
                className="wx-header-cta px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>发动态</span>
              </PressableButton>
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
                    data-global-font-excluded="true"
                    className="wx-chat-viewport wechat-chat-font-isolated w-full h-full flex flex-col bg-zinc-950 relative"
                    style={
                      {
                        '--chat-message-font-size': `${activeChatFontSize}px`,
                        ...(activeCharacter?.customBackground
                          ? {
                              backgroundImage: `url(${activeCharacter.customBackground})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : {}),
                      } as React.CSSProperties
                    }
                  >
                    {/* Semi-transparent backdrop blur overlay if custom background is present */}
                    {activeCharacter?.customBackground && (
                      <div className="wx-chat-bg-overlay absolute inset-0 bg-black/55 backdrop-blur-[1px] pointer-events-none z-0" />
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
                            className="wx-history-pill px-3 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-50 text-zinc-400 hover:text-zinc-200 text-[11px] font-medium border border-zinc-750 flex items-center gap-1.5 transition shadow-xs cursor-pointer"
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
                        <div className="wx-muted-text text-center py-1 text-[10px] text-zinc-500 font-mono">
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
                                <span className="wx-time-divider px-2.5 py-0.5 rounded-md bg-zinc-800/60 text-[11px] font-medium text-zinc-400 shadow-2xs">
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
                              onOpenOfflineDetail={(sid) => setOfflineDetailSessionId(sid)}
                              onPreviewImage={(targetMsg) => {
                                setLightboxShowDetails(false);
                                setLightboxImageMsg(targetMsg);
                              }}
                              onRetryImageRecognition={(targetMsg) => {
                                void recognizeMessageImage(targetMsg, { force: true, source: '微信图片重试识别' });
                              }}
                              onRecognizeImage={(targetMsg) => {
                                setLightboxShowDetails(true);
                                setLightboxImageMsg(targetMsg);
                                void recognizeMessageImage(targetMsg, { force: true, source: '微信按需识别此图' });
                              }}
                              onRegenerateImage={(targetMsg) => {
                                void generateImageForMessage(targetMsg, { isRetry: true });
                              }}
                              onSaveImage={async (targetMsg) => {
                                if (!targetMsg.imageUrl) return;
                                const ok = await downloadOrSaveImage(targetMsg.imageUrl, 'wechat_image');
                                setMultiBubbleToast(ok ? '已触发图片保存' : '图片保存失败，请尝试长按图片');
                                setTimeout(() => setMultiBubbleToast(null), 2200);
                              }}
                              isHighlighted={highlightedMsgId === msg.id}
                            />
                          </React.Fragment>
                        );
                      })}


                      {/* AI Reply Failure & Retry Alert */}
                      {failedTaskInfo && (
                        <div className="wx-alert-danger my-2 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-200 animate-in fade-in duration-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold">
                                {failedTaskInfo.task?.status === 'waiting_backend'
                                  ? '内置后端未就绪（任务已保留）'
                                  : '回复生成失败'}
                              </p>
                              <p className="wx-secondary-text text-[11px] opacity-85 break-words whitespace-pre-wrap">
                                {failedTaskInfo.error || '模型生成失败或响应超时'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                aiReplyTaskManager.clearFailedTask(activeCharacter.id);
                              }}
                              className="wx-secondary-text px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                            >
                              忽略
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (activeCharacter) {
                                  await aiReplyTaskManager.retryFailedTask(activeCharacter.id);
                                }
                              }}
                              className="wx-btn-danger px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-medium text-[11px] flex items-center gap-1 transition cursor-pointer shadow-xs"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>重试</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Multi-bubble toast notification */}
                    {multiBubbleToast && (
                      <div className="wx-toast-float absolute top-2.5 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 bg-zinc-900/95 border border-emerald-500/40 rounded-full text-xs text-emerald-300 shadow-xl flex items-center gap-1.5 pointer-events-none animate-in fade-in slide-in-from-top-2">
                        <Sparkles className="wx-green-text w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{multiBubbleToast}</span>
                      </div>
                    )}

                    {/* Quote Indicator */}
                    {quoteMsgId && (
                      <div className="wx-composer-quote px-3 py-1.5 bg-zinc-850/90 backdrop-blur-xs border-t border-zinc-750 flex items-center justify-between text-xs text-zinc-300 z-10">
                        <span className="truncate max-w-[80%] text-[11px]">
                          引用: {quotesMap.get(quoteMsgId) || '已选消息'}
                        </span>
                        <button
                          onClick={() => setQuoteMsgId(null)}
                          className="wx-muted-text text-zinc-400 hover:text-white cursor-pointer"
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
                            <div className="wx-composer-quote px-3 py-1.5 bg-zinc-850/95 border-t border-zinc-750 flex items-center justify-between text-xs animate-fadeIn">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={selectedImage}
                                  alt="待发送图片"
                                  className="w-9 h-9 rounded-lg object-cover border border-emerald-500/60 shadow-xs"
                                />
                                <div>
                                  <p className="wx-primary-text text-zinc-200 font-medium text-xs">已选择 1 张图片</p>
                                  <p className="wx-secondary-text text-[10px] text-zinc-400">发送时将自动调用 AI 视觉识别分析</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedImage(null)}
                                className="wx-muted-text p-1 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition cursor-pointer"
                                title="移除当前选中的图片"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          <div className="wx-composer p-2 bg-zinc-850/90 backdrop-blur-xs border-t border-zinc-800 flex items-end gap-1.5 shrink-0">
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
                              className="wx-composer-plus p-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 active:scale-95 text-sky-400 hover:text-sky-300 border border-zinc-700 transition cursor-pointer shrink-0 self-end mb-0.5"
                            >
                              <Plus className="w-4 h-4" />
                            </button>

                            {/* Auto-growing Multi-line Textarea */}
                            <textarea
                              key={activeCharacter.id}
                              ref={composerEditor.mergedRef}
                              rows={1}
                              defaultValue=""
                              placeholder={`给 ${activeCharacter.name} 发送消息... (Enter发送)`}
                              {...composerEditor.eventProps}
                              onKeyDown={(e) => {
                                composerEditor.eventProps.onKeyDown(e);
                                const isComposing = composerEditor.isCompositionActive(e.nativeEvent);

                                if (e.key === 'Enter') {
                                  if (isComposing) {
                                    // In Chinese/Japanese IME candidate selection: do NOT send
                                    return;
                                  }
                                  if (!e.shiftKey) {
                                    // Enter alone: single-click send user message ONLY (does NOT trigger AI)
                                    e.preventDefault();
                                    void handleSendUserOnlyMessage();
                                  }
                                }
                              }}
                              className="wx-composer-input flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none overflow-y-auto leading-relaxed max-h-[132px] min-h-[36px]"
                            />

                            {/* Send Button: Single-click sends message, Double-click triggers AI reply */}
                            {(() => {
                              const canSend = hasDraftText || Boolean(selectedImage);
                              return (
                                <PressableButton
                                  type="button"
                                  onClick={() => void handleSendButtonClick()}
                                  pressScale={0.94}
                                  withRipple={false}
                                  title="单击发送消息 | 快速双击触发AI回复"
                                  className={`wx-send-button px-3.5 py-2 rounded-xl text-white font-medium text-xs flex items-center gap-1 shadow-xs transition cursor-pointer shrink-0 self-end mb-0.5 ${
                                    canSend
                                      ? 'wx-send-button--active bg-emerald-600 hover:bg-emerald-500'
                                      : 'bg-zinc-700 hover:bg-zinc-600 opacity-90'
                                  }`}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>发送</span>
                                </PressableButton>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  // Chat List View (Includes Group Chats + 1-on-1 Character Chats)
                  <div
                    className={`wx-list flex-1 overflow-y-auto ${
                      wechatTheme === 'classic' ? '' : 'divide-y divide-zinc-800/80'
                    }`}
                  >
                    {wechatTheme === 'classic' && showChatListSearch && (
                      <div className="wx-search-bar-wrap px-3 py-2 flex items-center gap-2 shrink-0">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 wx-muted-text absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <StableTextInput
                            type="text"
                            value={chatListSearchQuery}
                            onValueChange={setChatListSearchQuery}
                            placeholder="搜索联系人、群聊或最近消息..."
                            className="wx-search-input w-full pl-8 pr-7 py-1.5 text-xs border focus:outline-none"
                          />
                          {chatListSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setChatListSearchQuery('')}
                              className="wx-muted-text absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {groupChats.length === 0 && characters.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center text-center px-4 space-y-3">
                        <div className="w-14 h-14 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center shadow-inner wx-pill-badge">
                          <MessageCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="wx-primary-text text-sm font-semibold text-zinc-200">暂无聊天消息</h4>
                          <p className="wx-secondary-text text-xs text-zinc-400 mt-1">前往通讯录添加好友或创建 AI 开启交流</p>
                        </div>
                        <PressableButton
                          onClick={() => setActiveTab('contacts')}
                          withRipple
                          rippleTone="light"
                          className="wx-btn-primary px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium text-xs shadow-md hover:brightness-110 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          {wechatTheme === 'classic' ? (
                            <WeChatPersonPlusIcon className="w-4 h-4" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                          <span>添加好友 / 创建 AI</span>
                        </PressableButton>
                      </div>
                    ) : filteredGroupChats.length === 0 && filteredCharacters.length === 0 ? (
                      <div className="py-16 text-center px-4 space-y-2">
                        <p className="wx-secondary-text text-xs text-zinc-400">
                          未找到与「{chatListSearchQuery}」匹配的会话
                        </p>
                        <button
                          type="button"
                          onClick={() => setChatListSearchQuery('')}
                          className="wx-link-text text-xs font-medium cursor-pointer"
                        >
                          清除搜索
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Group Chats Section */}
                    {filteredGroupChats.map((group) => {
                      const lastMsg =
                        group.messages && group.messages.length > 0
                          ? group.messages[group.messages.length - 1]
                          : null;
                      const unreadCount = unreadGroupCounts[group.id] || 0;

                      return (
                        <div
                          key={group.id}
                          onClick={() => setActiveGroupChatId(group.id)}
                          className={`wx-conversation-row ${
                            group.isPinned ? 'wx-conversation-row--pinned' : ''
                          } p-3 flex items-center gap-3 cursor-pointer transition ${
                            wechatTheme === 'classic'
                              ? ''
                              : 'hover:bg-zinc-800/60 active:bg-zinc-800 bg-zinc-900/40'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <GroupAvatar
                              members={group.members}
                              avatarMode={group.avatarMode}
                              customAvatar={group.customAvatar}
                              legacyAvatar={group.avatar}
                              allCharacters={characters}
                              userProfile={userProfile}
                              size={48}
                              alt={group.name}
                              className={
                                wechatTheme === 'classic'
                                  ? 'border border-zinc-300/60 dark:border-zinc-700'
                                  : 'border border-emerald-500/40 shadow-xs'
                              }
                            />
                            <span className="wx-group-tag absolute -bottom-1 -right-1 px-1 rounded-full bg-emerald-600 text-white text-[8px] font-bold">
                              群
                            </span>
                            {unreadCount > 0 && (
                              <span
                                className={`wx-unread-badge absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs ${
                                  wechatTheme === 'classic' ? '' : 'animate-pulse'
                                }`}
                              >
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <h4 className="wx-primary-text font-semibold text-sm text-zinc-100 truncate">
                                  {group.name}
                                </h4>
                                <span className="wx-muted-text text-xs text-zinc-500 font-bold shrink-0">
                                  ({group.members.length})
                                </span>
                              </div>
                              <span className="wx-muted-text text-[10px] text-zinc-500 font-mono shrink-0 ml-1">
                                {lastMsg
                                  ? new Date(lastMsg.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '刚刚'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="wx-secondary-text text-xs text-zinc-400 truncate flex-1">
                                {lastMsg ? (
                                  <>
                                    <span className="wx-green-text text-emerald-400/90 font-medium">
                                      {lastMsg.senderName}:{' '}
                                    </span>
                                    <span>
                                      {lastMsg.text ||
                                        (lastMsg.messageType === 'image'
                                          ? '[图片]'
                                          : lastMsg.messageType === 'relay'
                                          ? '[群接龙]'
                                          : lastMsg.messageType === 'poll'
                                          ? '[群投票]'
                                          : lastMsg.messageType === 'random_draw'
                                          ? '[随机抽人]'
                                          : '')}
                                    </span>
                                  </>
                                ) : (
                                  group.notice || '群聊已创建，开启畅聊吧'
                                )}
                              </p>
                              {wechatTheme !== 'classic' && unreadCount > 0 && (
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
                    {filteredCharacters.map((char) => {
                      const meta = getCharacterMetaSync(char.id);
                      const lastMsg = meta.lastMessage;
                      const unreadCount = unreadAiCounts[char.id] || 0;

                      return (
                        <div
                          key={char.id}
                          onClick={() => handleOpenChat(char.id)}
                          className={`wx-conversation-row p-3 flex items-center gap-3 cursor-pointer transition ${
                            wechatTheme === 'classic' ? '' : 'hover:bg-zinc-800/60 active:bg-zinc-800'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <img
                              src={char.avatar}
                              alt=""
                              className={`wx-avatar w-12 h-12 object-cover border shrink-0 ${
                                wechatTheme === 'classic' ? '' : 'rounded-2xl border-zinc-700'
                              }`}
                            />
                            {unreadCount > 0 && (
                              <span
                                className={`wx-unread-badge absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs ${
                                  wechatTheme === 'classic' ? '' : 'animate-pulse'
                                }`}
                              >
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="wx-primary-text font-semibold text-sm text-zinc-100">{char.name}</h4>
                              <span className="wx-muted-text text-[10px] text-zinc-500 font-mono">
                                {lastMsg
                                  ? new Date(lastMsg.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '刚刚'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="wx-secondary-text text-xs text-zinc-400 truncate flex-1">
                                {aiReplyTaskManager.isCharacterThinking(char.id) ? (
                                  <span className="wx-green-text text-emerald-400 font-medium flex items-center gap-1 animate-pulse">
                                    <span className="wx-green-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                    正在输入中…
                                  </span>
                                ) : lastMsg ? (
                                  lastMsg.text
                                ) : (
                                  char.greeting
                                )}
                              </p>
                              {wechatTheme !== 'classic' && unreadCount > 0 && (
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
              wechatTheme === 'classic' ? (
                <div className="wx-contacts-page w-full h-full overflow-y-auto">
                  <div className="wx-settings-group">
                    <button
                      type="button"
                      onClick={() => setShowAddFriendModal(true)}
                      className="wx-settings-row w-full px-3.5 py-2.5 flex items-center justify-between cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="wx-icon-box-new-friend w-10 h-10 flex items-center justify-center shrink-0">
                          <WeChatPersonPlusIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="wx-primary-text text-[13px] font-medium">新的朋友</div>
                          <div className="wx-secondary-text text-[11px]">创建 AI 好友或输入邀请码</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 wx-muted-text" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowGroupListModal(true)}
                      className="wx-settings-row w-full px-3.5 py-2.5 flex items-center justify-between cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="wx-icon-box-group w-10 h-10 flex items-center justify-center shrink-0">
                          <WeChatGroupIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="wx-primary-text text-[13px] font-medium">群聊</div>
                          <div className="wx-secondary-text text-[11px]">
                            {groupChats.length > 0 ? `查看与管理 ${groupChats.length} 个群聊` : '发起或加入多人群聊'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {groupChats.length > 0 && (
                          <span className="wx-muted-text text-xs">{groupChats.length}</span>
                        )}
                        <ChevronRight className="w-4 h-4 wx-muted-text" />
                      </div>
                    </button>
                  </div>

                  <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
                    <span className="wx-secondary-text text-[11px] font-medium">
                      AI 好友 ({characters.length})
                    </span>
                    <span className="wx-muted-text text-[10px]">左滑可锁定或删除</span>
                  </div>

                  {characters.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center px-4 space-y-3">
                      <div className="wx-pill-badge w-12 h-12 rounded-full flex items-center justify-center">
                        <WeChatPersonPlusIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="wx-primary-text text-sm font-semibold">还没有好友</h4>
                        <p className="wx-secondary-text text-xs mt-1">点击上方「新的朋友」创建专属 AI 或添加好友</p>
                      </div>
                      <button
                        onClick={() => setShowAddFriendModal(true)}
                        className="wx-btn-primary px-4 py-2 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <WeChatPersonPlusIcon className="w-4 h-4" />
                        <span>添加好友 / 创建 AI</span>
                      </button>
                    </div>
                  ) : (
                    <div className="wx-settings-group">
                      {characters.map((char) => (
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
                      ))}
                    </div>
                  )}
                </div>
              ) : (
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
              )
            )}
          </>
        )}

        {/* TAB 3: MOMENTS (朋友圈) */}
        {!activeGroupChatId && activeTab === 'moments' && (
          <div className="wx-moments-page w-full h-full overflow-y-auto p-3 space-y-4">
            {moments.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center px-4 space-y-3">
                <div className="wx-pill-badge w-14 h-14 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center shadow-inner">
                  <Compass className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="wx-primary-text text-sm font-semibold text-zinc-200">暂无朋友圈动态</h4>
                  <p className="wx-secondary-text text-xs text-zinc-400 mt-1">发一条新动态表达当下的心情与生活吧</p>
                </div>
                <PressableButton
                  onClick={() => setShowCreatePostModal(true)}
                  withRipple
                  rippleTone="light"
                  className="wx-btn-primary px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition cursor-pointer"
                >
                  <span>发一条动态</span>
                </PressableButton>
              </div>
            ) : (
              moments.map((post) => {
              const isLikedByMe = post.likes.some((l) => l.id === 'user_main');
              const isCommentOpen = openCommentPostId === post.id;
              return (
              <div
                key={post.id}
                className="wx-moment-card p-3.5 rounded-2xl bg-zinc-800/80 border border-zinc-750 text-xs space-y-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <img src={post.authorAvatar} alt="" className="wx-avatar w-10 h-10 rounded-xl object-cover" />
                  <div>
                    <h4 className="wx-link-text font-semibold text-sm text-emerald-400">{post.authorName}</h4>
                    <span className="wx-muted-text text-[10px] text-zinc-500">
                      {new Date(post.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>

                <p className="wx-primary-text text-zinc-200 leading-relaxed text-xs">{post.content}</p>

                {post.images && post.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl overflow-hidden">
                    {post.images.map((img, i) => (
                      <img key={i} src={img} alt="" className="w-full h-24 object-cover rounded-lg" />
                    ))}
                  </div>
                )}

                {/* Likes & Comments */}
                <div className="wx-divider pt-2 border-t border-zinc-700/60 space-y-2">
                  <div className="wx-secondary-text flex items-center justify-between gap-3 text-zinc-400 text-[11px]">
                    <LikeBurstButton
                      liked={isLikedByMe}
                      count={post.likes.length}
                      onToggle={() => handleToggleMomentLike(post.id)}
                    />
                    <button
                      type="button"
                      onClick={() => setOpenCommentPostId(isCommentOpen ? null : post.id)}
                      className="wx-link-text flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{post.comments.length > 0 ? `评论 (${post.comments.length})` : '评论'}</span>
                    </button>
                  </div>

                  {post.likes.length > 0 && (
                    <div className="wx-moment-meta-box text-[11px] text-zinc-400 bg-zinc-850 p-2 rounded-xl">
                      ❤️ <span className="wx-link-text">{post.likes.map((l) => l.name).join('、')}</span> 觉得很赞
                    </div>
                  )}

                  {post.comments.length > 0 && (
                    <div className="wx-moment-meta-box space-y-1.5 bg-zinc-850 p-2.5 rounded-xl text-[11px]">
                      {post.comments.map((c) => (
                        <div key={c.id} className="leading-snug">
                          <span className="wx-link-text font-semibold text-emerald-400">{c.authorName}: </span>
                          <span className="wx-primary-text text-zinc-300">{c.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {isCommentOpen && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <StableTextInput
                        type="text"
                        value={commentInputs[post.id] || ''}
                        onValueChange={(nextVal) =>
                          setCommentInputs((prev) => ({ ...prev, [post.id]: nextVal }))
                        }
                        onKeyDown={(e) => {
                          const native = e.nativeEvent as KeyboardEvent;
                          if (e.key === 'Enter' && !native.isComposing && e.keyCode !== 229) {
                            e.preventDefault();
                            handleAddMomentComment(post.id);
                          }
                        }}
                        placeholder="写一条评论..."
                        className="wx-modal-input flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddMomentComment(post.id)}
                        className={`wx-btn-primary px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium cursor-pointer shrink-0 transition ${
                          !(commentInputs[post.id] || '').trim() ? 'opacity-50' : 'hover:bg-emerald-500'
                        }`}
                      >
                        发送
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
            }))}
          </div>
        )}

        {/* TAB 4: ME (我) with Theme Center & Self-Persona Adjustments (Requirement 13) */}
        {!activeGroupChatId && activeTab === 'me' && (
          meSubView === 'theme' ? (
            <WeChatThemeCenter
              currentTheme={wechatTheme}
              onSelectTheme={(themeId) => setWechatTheme(saveWeChatTheme(themeId))}
              onBack={() => setMeSubView('hub')}
            />
          ) : wechatTheme === 'classic' ? (
            meSubView === 'persona' ? (
              <div className="wx-me-page w-full h-full overflow-y-auto p-3.5 space-y-3 text-xs">
                <div className="wx-card p-4 border space-y-3">
                  <div className="wx-divider flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-1.5 wx-green-text font-semibold">
                      <User className="w-4 h-4" />
                      <span>自身人设与偏好调节</span>
                    </div>
                    <span className="wx-muted-text text-[10px]">影响 AI 对你的互动理解</span>
                  </div>

                  <div className="flex items-center gap-3 pb-1">
                    <img
                      src={userProfile.avatar}
                      alt=""
                      className="wx-avatar w-12 h-12 object-cover border"
                    />
                    <button
                      type="button"
                      onClick={() => setImagePickerTarget('user')}
                      className="wx-btn-secondary px-3 py-1.5 border text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 wx-green-text" />
                      <span>更换头像</span>
                    </button>
                  </div>

                  <div>
                    <label className="wx-secondary-text block mb-1">我的昵称</label>
                    <StableTextInput
                      type="text"
                      value={selfNameInput}
                      onValueChange={setSelfNameInput}
                      className="wx-modal-input w-full px-3 py-1.5 border focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="wx-secondary-text block mb-1">个性签名 / 个人简介</label>
                    <StableTextInput
                      type="text"
                      value={selfBioInput}
                      onValueChange={setSelfBioInput}
                      placeholder="如: 热爱生活、在代码与设计之间穿梭的设计师"
                      className="wx-modal-input w-full px-3 py-1.5 border focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="wx-secondary-text block mb-1">我的性格特征 (Personality)</label>
                    <StableTextarea
                      rows={2}
                      value={selfPersonalityInput}
                      onValueChange={setSelfPersonalityInput}
                      placeholder="例如: 慢热、喜欢真诚直率的沟通方式..."
                      className="wx-modal-input w-full px-3 py-1.5 border focus:outline-none leading-relaxed text-xs"
                    />
                  </div>

                  <div>
                    <label className="wx-secondary-text block mb-1">我的兴趣爱好与关注主题</label>
                    <StableTextarea
                      rows={2}
                      value={selfPreferencesInput}
                      onValueChange={setSelfPreferencesInput}
                      placeholder="例如: 喜欢猫咪、手冲咖啡、动漫、科幻小说..."
                      className="wx-modal-input w-full px-3 py-1.5 border focus:outline-none leading-relaxed text-xs"
                    />
                  </div>

                  <div>
                    <label className="wx-secondary-text block mb-1">聊天与关怀偏好</label>
                    <StableTextInput
                      type="text"
                      value={selfCarePrefInput}
                      onValueChange={setSelfCarePrefInput}
                      placeholder="例如: 疲惫时希望得到安静陪伴与温暖鼓励"
                      className="wx-modal-input w-full px-3 py-1.5 border focus:outline-none text-xs"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    {meSaveFeedback ? (
                      <span className="wx-green-text text-[11px] flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 已保存并同步至所有 AI
                      </span>
                    ) : (
                      <span className="wx-muted-text text-[10px]">
                        AI 对话会自动参考这些设定
                      </span>
                    )}
                    <PressableButton
                      onClick={handleSaveSelfPersona}
                      withRipple={false}
                      className="wx-btn-primary px-4 py-1.5 text-white font-medium text-xs cursor-pointer shrink-0"
                    >
                      保存人设配置
                    </PressableButton>
                  </div>
                </div>
              </div>
            ) : meSubView === 'settings' ? (
              <div className="wx-me-page w-full h-full overflow-y-auto p-3.5 space-y-3 text-xs">
                {/* Real Multi-Bubble Messaging Config */}
                <div className="wx-card p-4 border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 wx-primary-text font-semibold">
                      <MessageSquarePlus className="w-4 h-4 wx-green-text" />
                      <span>真人打字分句连发</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !multiBubbleConfig.enabled;
                        const updated = saveMultiBubbleConfig({ enabled: next });
                        setMultiBubbleConfig(updated);
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                        multiBubbleConfig.enabled ? 'wx-toggle-on bg-emerald-500' : 'wx-toggle-off bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                          multiBubbleConfig.enabled ? 'right-1' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="wx-secondary-text text-[11px] leading-relaxed">
                    将 AI 回复切分为多条短句连续发送，还原真实微信聊天节奏。
                  </p>

                  {multiBubbleConfig.enabled && (
                    <div className="wx-divider space-y-2.5 pt-2 border-t">
                      <div className="flex items-center justify-between gap-2">
                        <span className="wx-secondary-text text-[11px]">打字间隔节奏</span>
                        <div className="flex gap-1">
                          {(['fast', 'normal', 'slow'] as const).map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => {
                                const updated = saveMultiBubbleConfig({ speed: spd });
                                setMultiBubbleConfig(updated);
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-medium cursor-pointer border ${
                                multiBubbleConfig.speed === spd
                                  ? 'wx-btn-primary border-transparent'
                                  : 'wx-btn-secondary'
                              }`}
                            >
                              {spd === 'fast' ? '快' : spd === 'normal' ? '标准' : '稍慢'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="wx-secondary-text text-[11px]">单次连发上限</span>
                        <div className="flex gap-1.5">
                          {[3, 4, 5, 6].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => {
                                const updated = saveMultiBubbleConfig({ maxBubbles: cnt });
                                setMultiBubbleConfig(updated);
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-mono font-medium cursor-pointer border ${
                                multiBubbleConfig.maxBubbles === cnt
                                  ? 'wx-btn-primary border-transparent'
                                  : 'wx-btn-secondary'
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

                {/* Real Data Backup & Restore Center */}
                <div className="wx-card p-4 border space-y-3">
                  <div className="wx-divider flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-1.5 wx-primary-text font-semibold">
                      <Database className="w-4 h-4 wx-green-text" />
                      <span>数据管理中心</span>
                    </div>
                    <span className="wx-muted-text text-[10px]">导入 / 导出 / 快照</span>
                  </div>
                  <p className="wx-secondary-text text-[11px] leading-relaxed">
                    管理所有 AI 角色档案、聊天记录、长期记忆与群聊备份数据。
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDataModalTab('import');
                        setShowDataModal(true);
                      }}
                      className="wx-sub-card p-2.5 border flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-blue-500" />
                      <span className="wx-primary-text font-semibold text-[11px]">导入数据</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDataModalTab('export');
                        setShowDataModal(true);
                      }}
                      className="wx-sub-card p-2.5 border flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-4 h-4 wx-green-text" />
                      <span className="wx-primary-text font-semibold text-[11px]">导出数据</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDataModalTab('snapshots');
                        setShowDataModal(true);
                      }}
                      className="wx-sub-card p-2.5 border flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <History className="w-4 h-4 text-purple-500" />
                      <span className="wx-primary-text font-semibold text-[11px]">备份回滚</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : meSubView === 'social' ? (
              <div className="wx-me-page w-full h-full overflow-y-auto p-3.5 space-y-3 text-xs">
                <AiSocialSettingsPanel isClassic />
              </div>
            ) : (
              /* Classic WeChat "我" Hub: Only Real Functional Entries */
              <div className="wx-me-page w-full h-full overflow-y-auto text-xs space-y-2.5">
                <div
                  onClick={() => setMeSubView('persona')}
                  className="wx-profile-header px-4 py-4 flex items-center gap-3.5 cursor-pointer"
                >
                  <div className="relative shrink-0">
                    <img
                      src={userProfile.avatar}
                      alt=""
                      className="wx-avatar w-14 h-14 object-cover border"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImagePickerTarget('user');
                      }}
                      className="wx-sub-card absolute -bottom-1 -right-1 p-1 rounded border cursor-pointer"
                      title="更换头像"
                    >
                      <ImageIcon className="w-3 h-3 wx-green-text" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="wx-primary-text font-bold text-base truncate">{userProfile.name}</h3>
                    <p className="wx-secondary-text text-[11px] mt-0.5 truncate">
                      微信号: {userProfile.wxid}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyUserInviteCode();
                        }}
                        className="wx-invite-pill px-2 py-0.5 rounded border text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                        title="复制邀请码"
                      >
                        <span>邀请码: {userProfile.inviteCode || 'US-888888'}</span>
                        {copiedInviteCode ? (
                          <Check className="w-3 h-3 wx-green-text" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 wx-muted-text shrink-0" />
                </div>

                {/* Group 1: Real Personal & Theme Items */}
                <div className="wx-settings-group">
                  <button
                    type="button"
                    onClick={() => setMeSubView('persona')}
                    className="wx-settings-row w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 wx-green-text shrink-0" />
                      <span className="wx-primary-text text-[13px] font-medium">个人资料与人设</span>
                    </div>
                    <ChevronRight className="w-4 h-4 wx-muted-text" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('moments')}
                    className="wx-settings-row w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Compass className="w-4 h-4 text-sky-500 shrink-0" />
                      <span className="wx-primary-text text-[13px] font-medium">朋友圈</span>
                    </div>
                    <ChevronRight className="w-4 h-4 wx-muted-text" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setMeSubView('theme')}
                    className="wx-settings-row w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Palette className="w-4 h-4 wx-green-text shrink-0" />
                      <span className="wx-primary-text text-[13px] font-medium">主题</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="wx-secondary-text text-[11px]">经典微信</span>
                      <ChevronRight className="w-4 h-4 wx-muted-text" />
                    </div>
                  </button>
                </div>

                {/* Group 2: Real WeChat Settings */}
                <div className="wx-settings-group">
                  <button
                    type="button"
                    onClick={() => setMeSubView('social')}
                    className="wx-settings-row w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Globe2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="wx-primary-text text-[13px] font-medium">AI 社会活动</span>
                    </div>
                    <ChevronRight className="w-4 h-4 wx-muted-text" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setMeSubView('settings')}
                    className="wx-settings-row w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Settings className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="wx-primary-text text-[13px] font-medium">微信设置</span>
                    </div>
                    <ChevronRight className="w-4 h-4 wx-muted-text" />
                  </button>
                </div>
              </div>
            )
          ) : (
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

              {/* WeChat Internal Theme Entry */}
              <button
                type="button"
                onClick={() => setMeSubView('theme')}
                className="w-full p-3.5 rounded-3xl bg-zinc-850 border border-zinc-750 hover:border-emerald-500/40 flex items-center justify-between transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-zinc-100">主题</h4>
                    <p className="text-[10px] text-zinc-400">切换默认主题或经典微信风格</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <span className="text-[11px]">默认主题</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

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
                  <StableTextInput
                    type="text"
                    value={selfNameInput}
                    onValueChange={setSelfNameInput}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">个性签名 / 个人简介</label>
                  <StableTextInput
                    type="text"
                    value={selfBioInput}
                    onValueChange={setSelfBioInput}
                    placeholder="如: 热爱生活、在代码与设计之间穿梭的设计师"
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">
                    👤 我的性格特征 (Personality)
                  </label>
                  <StableTextarea
                    rows={2}
                    value={selfPersonalityInput}
                    onValueChange={setSelfPersonalityInput}
                    placeholder="例如: 慢热、容易情绪内耗、喜欢真诚直率的沟通方式、对细节敏感..."
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed text-xs"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">
                    🌟 我的兴趣爱好与关注主题 (Interests & Topics)
                  </label>
                  <StableTextarea
                    rows={2}
                    value={selfPreferencesInput}
                    onValueChange={setSelfPreferencesInput}
                    placeholder="例如: 喜欢猫咪、手冲咖啡、二次元动漫、科幻小说、下雨天的安静音乐..."
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed text-xs"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">
                    💬 聊天与关怀偏好 (Care Preferences)
                  </label>
                  <StableTextInput
                    type="text"
                    value={selfCarePrefInput}
                    onValueChange={setSelfCarePrefInput}
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
                  <PressableButton
                    onClick={handleSaveSelfPersona}
                    withRipple
                    rippleTone="light"
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition cursor-pointer"
                  >
                    保存人设配置
                  </PressableButton>
                </div>
              </div>

              {/* AI Social Activity Settings */}
              <AiSocialSettingsPanel isClassic={false} />

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
                  <PressableButton
                    onClick={() => {
                      setDataModalTab('import');
                      setShowDataModal(true);
                    }}
                    withRipple
                    rippleTone="accent"
                    className="p-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-[11px]">导入数据</span>
                    <span className="text-[9px] text-zinc-400">ZIP/JSON/TXT</span>
                  </PressableButton>

                  <PressableButton
                    onClick={() => {
                      setDataModalTab('export');
                      setShowDataModal(true);
                    }}
                    withRipple
                    rippleTone="emerald"
                    className="p-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-[11px]">导出数据</span>
                    <span className="text-[9px] text-zinc-400">4种格式可选</span>
                  </PressableButton>

                  <PressableButton
                    onClick={() => {
                      setDataModalTab('snapshots');
                      setShowDataModal(true);
                    }}
                    withRipple
                    rippleTone="accent"
                    className="p-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 transition cursor-pointer"
                  >
                    <History className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-[11px]">备份回滚</span>
                    <span className="text-[9px] text-zinc-400">安全快照</span>
                  </PressableButton>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Requirement 2: Bottom Navigation Bar is automatically HIDDEN when in 1-on-1 chat, group chat, or Me sub-views */}
      {!activeChatId && !activeGroupChatId && !(activeTab === 'me' && meSubView !== 'hub') && (
        <div className="wx-bottom-nav min-h-14 py-1 bg-zinc-850 border-t border-zinc-800 grid grid-cols-4 items-center shrink-0 z-20">
          <PressableButton
            onClick={() => {
              setActiveTab('chats');
              setMeSubView('hub');
            }}
            pressScale={0.94}
            className={`wx-bottom-tab h-full flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'chats'
                ? 'wx-bottom-tab--active text-emerald-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="relative">
              <MessageCircle className="w-5 h-5" />
              {totalUnreadCount > 0 && (
                <span className="wx-unread-badge absolute -top-1 -right-2 min-w-[15px] h-3.5 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </div>
            <span>微信</span>
          </PressableButton>
          <PressableButton
            onClick={() => {
              setActiveTab('contacts');
              setMeSubView('hub');
            }}
            pressScale={0.94}
            className={`wx-bottom-tab h-full flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'contacts'
                ? 'wx-bottom-tab--active text-emerald-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>通讯录</span>
          </PressableButton>
          <PressableButton
            onClick={() => {
              setActiveTab('moments');
              setMeSubView('hub');
            }}
            pressScale={0.94}
            className={`wx-bottom-tab h-full flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'moments'
                ? 'wx-bottom-tab--active text-emerald-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span>朋友圈</span>
          </PressableButton>
          <PressableButton
            onClick={() => {
              setActiveTab('me');
              setMeSubView('hub');
            }}
            pressScale={0.94}
            className={`wx-bottom-tab h-full flex flex-col items-center justify-center gap-0.5 text-[10px] transition cursor-pointer ${
              activeTab === 'me'
                ? 'wx-bottom-tab--active text-emerald-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="w-5 h-5" />
            <span>我</span>
          </PressableButton>
        </div>
      )}

      {/* Thinking Process / Chain-of-Thought (CoT) Modal */}
      {showCoTModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="wx-modal-card w-full max-w-sm rounded-3xl bg-zinc-900 border border-amber-500/40 p-4 text-white shadow-2xl space-y-3">
            <div className="wx-divider flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-amber-500" />
                <h3 className="wx-primary-text font-semibold text-sm text-amber-300">AI 思考与推理链路 (CoT)</h3>
              </div>
              <button
                onClick={() => setShowCoTModal(null)}
                className="wx-muted-text text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="wx-sub-card wx-primary-text max-h-72 overflow-y-auto bg-zinc-950 p-3 rounded-2xl border border-zinc-800 text-xs font-mono leading-relaxed text-zinc-300 whitespace-pre-wrap">
              {displayedMessages.find((m) => m.id === showCoTModal)?.thinkingProcess ||
                '该条消息生成时暂未附带详细思考链数据。'}
            </div>

            <div className="wx-divider pt-2 border-t border-zinc-800 flex justify-between items-center text-[10px] text-zinc-500">
              <span className="wx-muted-text">基于 Gemini 深度推理引擎分析</span>
              <button
                onClick={() => setShowCoTModal(null)}
                className="wx-btn-secondary px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer"
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
            className="wx-dropdown w-64 rounded-3xl bg-zinc-900 border border-zinc-750 p-3 shadow-2xl text-xs space-y-1"
          >
            <button
              onClick={() => {
                navigator.clipboard.writeText(msgLongPressMenu.text);
                setMsgLongPressMenu(null);
              }}
              className="wx-dropdown-item wx-primary-text w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2 text-zinc-200 cursor-pointer"
            >
              <Copy className="w-4 h-4 text-blue-500" />
              <span>复制消息</span>
            </button>

            <button
              onClick={() => {
                setQuoteMsgId(msgLongPressMenu.id);
                setMsgLongPressMenu(null);
              }}
              className="wx-dropdown-item wx-primary-text w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2 text-zinc-200 cursor-pointer"
            >
              <Quote className="wx-green-text w-4 h-4 text-emerald-400" />
              <span>引用回答</span>
            </button>

            {msgLongPressMenu.sender === 'ai' && (
              <button
                onClick={() => handleRefreshAiResponse(msgLongPressMenu)}
                className="wx-dropdown-item wx-primary-text w-full p-2.5 rounded-xl hover:bg-zinc-800 flex items-center gap-2 text-amber-300 font-medium cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-amber-500" />
                <span>重新生成本次回答</span>
              </button>
            )}

            <button
              onClick={() => handleDeleteMessage(msgLongPressMenu.id)}
              className="wx-dropdown-item w-full p-2.5 rounded-xl hover:bg-rose-950/40 flex items-center gap-2 text-rose-500 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>删除此条记录</span>
            </button>
          </div>
        </div>
      )}

      {/* Group List Modal (from Classic Contacts "群聊") */}
      {showGroupListModal && (
        <div
          onClick={() => setShowGroupListModal(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="wx-modal-card w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3 max-h-[82vh] flex flex-col"
          >
            <div className="wx-divider flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="wx-green-text w-4 h-4 text-emerald-400" />
                <h3 className="wx-primary-text font-semibold text-sm">群聊 ({groupChats.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGroupListModal(false)}
                className="wx-muted-text text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5">
              {groupChats.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="wx-secondary-text text-xs text-zinc-400">暂无群聊</p>
                </div>
              ) : (
                groupChats.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setShowGroupListModal(false);
                      setActiveGroupChatId(g.id);
                    }}
                    className="wx-sub-card w-full p-2.5 border flex items-center gap-3 text-left cursor-pointer"
                  >
                    <GroupAvatar
                      members={g.members}
                      avatarMode={g.avatarMode}
                      customAvatar={g.customAvatar}
                      legacyAvatar={g.avatar}
                      allCharacters={characters}
                      userProfile={userProfile}
                      size={40}
                      alt={g.name}
                      className="border border-zinc-300/60 dark:border-zinc-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="wx-primary-text text-xs font-semibold truncate">
                        {g.name} ({g.members.length})
                      </div>
                      <div className="wx-secondary-text text-[10px] truncate mt-0.5">
                        {g.notice || '点击进入群聊'}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 wx-muted-text shrink-0" />
                  </button>
                ))
              )}
            </div>

            <div className="wx-divider pt-2 border-t border-zinc-800 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowGroupListModal(false);
                  setShowJoinGroupByCodeModal(true);
                }}
                className="wx-btn-secondary py-2 border text-xs font-medium cursor-pointer"
              >
                输入群邀请码
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGroupListModal(false);
                  setShowCreateGroupModal(true);
                }}
                className="wx-btn-primary py-2 text-xs font-medium cursor-pointer"
              >
                发起群聊
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Settings & Memory Folder Modal */}
      {showAiSettingsModal && activeCharacter && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="wx-modal-card w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="wx-divider flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="wx-green-text font-semibold text-sm flex items-center gap-2 text-emerald-400">
                <Settings className="w-4 h-4" />
                <span>{activeCharacter.name} - 详细设置</span>
              </h3>
              <button
                onClick={() => setShowAiSettingsModal(false)}
                className="wx-muted-text text-zinc-400 hover:text-white cursor-pointer"
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
                  className="wx-avatar w-14 h-14 rounded-2xl object-cover border border-emerald-500 shadow-md"
                />
                <button
                  onClick={() => setImagePickerTarget('aiAvatar')}
                  className="wx-btn-secondary px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <ImageIcon className="wx-green-text w-3.5 h-3.5" />
                  <span>更换 AI 头像</span>
                </button>
              </div>

              <div>
                <label className="wx-secondary-text block text-zinc-400 mb-1">AI 名字</label>
                <StableTextInput
                  type="text"
                  value={editedName}
                  onValueChange={setEditedName}
                  className="wx-modal-input w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="wx-secondary-text block text-zinc-400 mb-1">微信号</label>
                <StableTextInput
                  type="text"
                  value={editedWxid}
                  onValueChange={setEditedWxid}
                  className="wx-modal-input w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="wx-secondary-text block text-zinc-400 mb-1">与用户的关系</label>
                <StableTextInput
                  type="text"
                  placeholder="例如: 恋人 / 青梅竹马 / 导师"
                  value={editedRelationship}
                  onValueChange={setEditedRelationship}
                  className="wx-modal-input w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="wx-secondary-text block text-zinc-400 mb-1">人设背景与设定经历 (System Persona)</label>
                <StableTextarea
                  rows={3}
                  value={editedPersona}
                  onValueChange={setEditedPersona}
                  className="wx-modal-input w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="wx-secondary-text block text-zinc-400 mb-1">性格特征与说话风格 (Personality & Tone)</label>
                <StableTextarea
                  rows={2}
                  value={editedPersonality}
                  onValueChange={setEditedPersonality}
                  placeholder="如: 温柔体贴，常带波浪号，喜欢鼓励用户"
                  className="wx-modal-input w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="wx-secondary-text block text-zinc-400 mb-1">指定专用模型 (留空使用全局默认)</label>
                <StableTextInput
                  type="text"
                  placeholder="如: gemini-2.5-flash"
                  value={editedModelName}
                  onValueChange={setEditedModelName}
                  className="wx-modal-input w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Chat Display Settings: Per-AI Message Font Size + Live Preview */}
            <div className="wx-divider pt-3 border-t border-zinc-800 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="wx-primary-text font-semibold text-zinc-100">聊天显示设置</h4>
                <span className="wx-secondary-text text-[11px] text-zinc-400">仅作用于与该 AI 的私聊</span>
              </div>

              <div className="wx-sub-card p-3 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-3">
                {/* Font Size Header & px Badge */}
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="chat-font-size-slider" className="wx-primary-text font-medium text-zinc-200">
                    聊天文字大小
                  </label>
                  <span className="wx-font-size-badge px-2 py-0.5 rounded-md font-mono text-xs font-semibold tabular-nums">
                    {draftMessageFontSize}px
                  </span>
                </div>

                {/* Touch-Friendly Step Buttons & Range Slider */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = clampChatMessageFontSize(draftMessageFontSize - 1, defaultChatFontSize);
                      setDraftMessageFontSize(next);
                      setDraftFontResetPending(false);
                      setDraftPresetHint(null);
                    }}
                    disabled={draftMessageFontSize <= MIN_CHAT_MESSAGE_FONT_SIZE}
                    aria-label="减小聊天文字大小"
                    className="wx-font-step-btn min-w-[40px] min-h-[40px] px-2 rounded-xl text-xs font-semibold flex items-center justify-center transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    A−
                  </button>

                  <input
                    id="chat-font-size-slider"
                    type="range"
                    min={MIN_CHAT_MESSAGE_FONT_SIZE}
                    max={MAX_CHAT_MESSAGE_FONT_SIZE}
                    step={1}
                    value={draftMessageFontSize}
                    aria-label="聊天文字大小"
                    aria-valuemin={MIN_CHAT_MESSAGE_FONT_SIZE}
                    aria-valuemax={MAX_CHAT_MESSAGE_FONT_SIZE}
                    aria-valuenow={draftMessageFontSize}
                    onChange={(e) => {
                      const next = clampChatMessageFontSize(e.target.value, defaultChatFontSize);
                      setDraftMessageFontSize(next);
                      setDraftFontResetPending(false);
                      setDraftPresetHint(null);
                    }}
                    className="wx-font-range flex-1 h-7 cursor-pointer"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const next = clampChatMessageFontSize(draftMessageFontSize + 1, defaultChatFontSize);
                      setDraftMessageFontSize(next);
                      setDraftFontResetPending(false);
                      setDraftPresetHint(null);
                    }}
                    disabled={draftMessageFontSize >= MAX_CHAT_MESSAGE_FONT_SIZE}
                    aria-label="增大聊天文字大小"
                    className="wx-font-step-btn min-w-[40px] min-h-[40px] px-2 rounded-xl text-xs font-semibold flex items-center justify-center transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    A+
                  </button>
                </div>

                {/* Quick Presets & Reset to Default */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {chatFontPresets.map((preset) => {
                      const isActive =
                        preset.size === draftMessageFontSize &&
                        (preset.id === 'small' && defaultChatFontSize === preset.size
                          ? draftPresetHint === 'small'
                          : preset.id === 'standard' && defaultChatFontSize === 12
                          ? draftPresetHint !== 'small'
                          : true);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setDraftMessageFontSize(preset.size);
                            setDraftFontResetPending(false);
                            setDraftPresetHint(preset.id);
                          }}
                          className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-medium transition active:scale-95 cursor-pointer ${
                            isActive ? 'wx-font-preset-btn--active' : 'wx-font-preset-btn'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDraftMessageFontSize(defaultChatFontSize);
                      setDraftFontResetPending(true);
                      setDraftPresetHint('standard');
                    }}
                    className="wx-font-reset-btn min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-medium flex items-center gap-1 transition active:scale-95 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>恢复默认</span>
                  </button>
                </div>
              </div>

              {/* Real-time Chat Effect Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="wx-secondary-text text-[11px] font-medium text-zinc-400">效果预览</span>
                  <span className="wx-muted-text text-[10px] text-zinc-500">跟随当前微信主题与背景实时变化</span>
                </div>
                <ChatFontSizePreview
                  characterName={editedName || activeCharacter.name}
                  characterAvatar={editedAvatar || activeCharacter.avatar}
                  userAvatar={userProfile.avatar}
                  fontSize={draftMessageFontSize}
                  customBackground={activeCharacter.customBackground}
                />
              </div>
            </div>

            {/* Requirement 5: Long-term Memory Packaged into a Collapsible Folder Accordion */}
            <div className="wx-divider pt-3 border-t border-zinc-800 text-xs">
              <div
                onClick={() => setIsMemoryFolderOpen(!isMemoryFolderOpen)}
                className="wx-sub-card p-3 rounded-2xl bg-zinc-850 border border-zinc-750 hover:border-emerald-500/40 flex items-center justify-between cursor-pointer transition shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="wx-pill-badge w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    {isMemoryFolderOpen ? (
                      <FolderOpen className="w-4 h-4" />
                    ) : (
                      <Folder className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h4 className="wx-primary-text font-semibold text-zinc-200">
                      长期记忆库文件夹 ({activeCharacter.memories?.length || 0} 条记忆)
                    </h4>
                    <p className="wx-secondary-text text-[10px] text-zinc-400">已折叠收纳，点击展开管理</p>
                  </div>
                </div>
                {isMemoryFolderOpen ? (
                  <ChevronUp className="wx-muted-text w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="wx-muted-text w-4 h-4 text-zinc-400" />
                )}
              </div>

              {isMemoryFolderOpen && (
                <div className="wx-sub-card mt-2 p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="wx-secondary-text text-[11px] text-zinc-400 font-medium">记忆管理</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenCleanupModal}
                        className="wx-alert-warn flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] cursor-pointer transition shrink-0"
                        title="一键清理历史自动抓取的无意义伪记忆"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>清理伪记忆</span>
                      </button>
                      <label className="wx-secondary-text flex items-center gap-1.5 text-[10px] text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeCharacter.autoExtractMemoryEnabled !== false}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            onUpdateCharacters(
                              characters.map((c) =>
                                c.id === activeCharacter.id ? { ...c, autoExtractMemoryEnabled: enabled } : c
                              )
                            );
                          }}
                          className="rounded accent-emerald-500"
                        />
                        <span>允许 AI 自行提取记忆</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <StableTextInput
                      type="text"
                      placeholder="手动添加记忆项..."
                      value={newMemoryInput}
                      onValueChange={setNewMemoryInput}
                      className="wx-modal-input flex-1 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
                    />
                    <button
                      onClick={handleAddMemory}
                      className="wx-btn-primary px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium shrink-0 cursor-pointer"
                    >
                      添加
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {activeCharacter.memories && activeCharacter.memories.length > 0 ? (
                      activeCharacter.memories.map((mem, i) => (
                        <div
                          key={i}
                          className="wx-card flex items-center justify-between p-2 rounded-xl bg-zinc-850 text-[11px] border border-zinc-750"
                        >
                          <span className="wx-primary-text truncate max-w-[85%] text-zinc-200">{mem}</span>
                          <button
                            onClick={() => handleDeleteMemory(i)}
                            className="text-rose-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="wx-muted-text text-[10px] text-zinc-500 py-2 text-center">暂无长期记忆条目</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Independent Local Memory Space Entry (独立专属记忆空间) */}
            <div className="wx-alert-success p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="wx-green-text flex items-center gap-1.5 text-emerald-300 font-semibold">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>{activeCharacter.name} 专属本地记忆空间</span>
                </div>
                <span className="wx-pill-badge text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                  严格隔离
                </span>
              </div>
              <p className="wx-secondary-text text-[11px] text-zinc-400 leading-relaxed">
                每个 AI 拥有完全独立的本地记忆库。支持导入 ZIP、JSON、JSONL、TXT 等文件，AI 将在聊天中按需智能检索回忆，绝不会污染当前聊天窗口。
              </p>
              <button
                onClick={() => {
                  setShowAiSettingsModal(false);
                  setMemoryVaultTargetChar(activeCharacter);
                  setShowMemoryVaultModal(true);
                }}
                className="wx-btn-primary w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>进入「{activeCharacter.name}」专属记忆空间</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAiSettingsModal(false);
                  setAiPhoneViewerChar(activeCharacter);
                }}
                className="wx-btn-secondary w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Smartphone className="w-4 h-4 wx-green-text text-emerald-400" />
                <span>查看「{activeCharacter.name}」的手机（只读）</span>
              </button>
            </div>

            {/* Requirement 7: Menstrual Cycle Sensing & Proactive Care with Toggle Switch */}
            <div className="wx-sub-card p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="wx-primary-text flex items-center gap-1.5 text-rose-300 font-semibold">
                  <HeartPulse className="w-4 h-4 text-rose-500" />
                  <span>生理周期感知与主动关怀</span>
                </div>
                {/* Switch Toggle */}
                <button
                  onClick={() => setEditedMenstrualCareEnabled(!editedMenstrualCareEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    editedMenstrualCareEnabled ? 'bg-rose-500' : 'wx-toggle-off bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      editedMenstrualCareEnabled ? 'right-1' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="wx-card wx-secondary-text space-y-1.5 text-[11px] text-zinc-300 leading-relaxed bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-500 shrink-0">🌸</span>
                  <span><b>经期前3天</b>：触发经期开始提醒，备好温水与保暖物品（严禁OOC）</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-500 shrink-0">💖</span>
                  <span><b>经期中</b>：若感知到情绪低落或身体不舒服，主动递上温暖关怀</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-500 shrink-0">✨</span>
                  <span><b>经期结束前1天</b>：触发经期结束与饮食起居调养问候</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-rose-500 shrink-0">🌿</span>
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
                  className="wx-alert-danger w-full py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-rose-500" />
                  <span>发送一次阶段主动关怀测试</span>
                </button>
              )}
            </div>

            {/* Multi-Bubble Messaging Settings (一句话发一条消息，分句连发) */}
            <div className="wx-sub-card p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="wx-primary-text flex items-center gap-1.5 text-emerald-300 font-semibold">
                  <MessageSquarePlus className="wx-green-text w-4 h-4 text-emerald-400" />
                  <span>真人打字分句连发（一句话一条消息）</span>
                </div>
                <button
                  onClick={() => {
                    const next = !multiBubbleConfig.enabled;
                    const updated = saveMultiBubbleConfig({ enabled: next });
                    setMultiBubbleConfig(updated);
                  }}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    multiBubbleConfig.enabled ? 'wx-toggle-on bg-emerald-500' : 'wx-toggle-off bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      multiBubbleConfig.enabled ? 'right-1' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <p className="wx-secondary-text text-[11px] text-zinc-400 leading-relaxed">
                像真人发微信一样，把整段回复智能切分成 2~5 条自然短句连续发送，带打字状态与震动反馈，彻底告别单条大长段。
              </p>

              {multiBubbleConfig.enabled && (
                <div className="wx-divider space-y-2 pt-1 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="wx-secondary-text text-zinc-400 text-[11px]">打字间隔节奏</span>
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
                              ? 'wx-btn-primary bg-emerald-600 text-white'
                              : 'wx-btn-secondary bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {spd === 'fast' ? '快 (轻快)' : spd === 'normal' ? '标准 (自然)' : '稍慢 (悠闲)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="wx-secondary-text text-zinc-400 text-[11px]">单次连发上限</span>
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
                              ? 'wx-btn-primary bg-emerald-600 text-white'
                              : 'wx-btn-secondary bg-zinc-800 text-zinc-400 hover:text-zinc-200'
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

            {/* Romantic Target & Hard Lock Settings (Phase 4) */}
            {editedRomanticState && (
              <AiRomanticSettingsSection
                character={activeCharacter}
                allCharacters={characters}
                userProfile={userProfile}
                value={editedRomanticState}
                onChange={setEditedRomanticState}
              />
            )}

            {/* Clear History Danger Zone */}
            <div className="wx-divider pt-2 border-t border-zinc-800">
              <button
                onClick={handleClearHistory}
                className="wx-alert-danger w-full py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空该 AI 角色的所有聊天记录</span>
              </button>
            </div>

            {/* Save Button */}
            <div className="wx-divider pt-2 flex justify-end gap-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  const nextAvatar = editedAvatar || activeCharacter.avatar;
                  const avatarChanged = nextAvatar !== activeCharacter.avatar;
                  const updatedTarget: AiCharacter = {
                    ...activeCharacter,
                    name: editedName,
                    wxid: editedWxid,
                    relationship: editedRelationship,
                    persona: editedPersona,
                    personality: editedPersonality,
                    modelConfig: editedModelName
                      ? { ...activeCharacter.modelConfig, modelName: editedModelName }
                      : activeCharacter.modelConfig,
                    avatar: nextAvatar,
                    notificationAvatar: avatarChanged ? undefined : activeCharacter.notificationAvatar,
                    menstrualCare: {
                      ...(activeCharacter.menstrualCare || {}),
                      enabled: editedMenstrualCareEnabled,
                    },
                    romanticConfig: editedRomanticState
                      ? {
                          romanticTargetId: editedRomanticState.romanticTargetId,
                          romanticTargetLocked: editedRomanticState.romanticTargetLocked,
                          allowNaturalRomance: editedRomanticState.allowNaturalRomance,
                          status: editedRomanticState.status,
                        }
                      : activeCharacter.romanticConfig,
                  };
                  if (editedRomanticState) {
                    void saveRomanticState({
                      ...editedRomanticState,
                      characterId: activeCharacter.id,
                    }).catch(() => {});
                  }
                  onUpdateCharacters(
                    characters.map((c) => (c.id === activeCharacter.id ? updatedTarget : c))
                  );
                  if (avatarChanged || !updatedTarget.notificationAvatar) {
                    void ensureCharacterNotificationAvatar(updatedTarget, { forceRegenerate: avatarChanged }).then(
                      (enriched) => {
                        if (enriched.notificationAvatar) {
                          const latest = loadCharacters();
                          onUpdateCharacters(
                            latest.map((c) =>
                              c.id === enriched.id
                                ? { ...c, notificationAvatar: enriched.notificationAvatar }
                                : c
                            )
                          );
                        }
                      }
                    );
                  }
                  if (draftFontResetPending) {
                    setChatDisplayPrefs(resetChatDisplayPreference(activeCharacter.id));
                  } else {
                    setChatDisplayPrefs(
                      saveChatDisplayPreference(
                        activeCharacter.id,
                        { messageFontSize: draftMessageFontSize },
                        wechatTheme
                      )
                    );
                  }
                  setShowAiSettingsModal(false);
                }}
                className="wx-btn-primary w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-semibold text-xs text-white shadow-md transition active:scale-95 cursor-pointer"
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
          <div className="wx-modal-card w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto">
            <div className="wx-divider flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="wx-primary-text font-semibold text-sm flex items-center gap-1.5 text-zinc-100">
                {wechatTheme === 'classic' ? (
                  <WeChatPersonPlusIcon className="wx-green-text w-4 h-4" />
                ) : (
                  <UserPlus className="wx-green-text w-4 h-4 text-emerald-400" />
                )}
                添加朋友
              </h3>
              <button
                onClick={() => setShowAddFriendModal(false)}
                className="wx-muted-text text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab switch between AI Friends and Real Users */}
            <div className="wx-tab-bar grid grid-cols-2 p-1 bg-zinc-800 rounded-xl text-xs text-center font-medium">
              <button
                onClick={() => setAddFriendActiveTab('ai')}
                className={`py-1.5 rounded-lg transition ${
                  addFriendActiveTab === 'ai'
                    ? 'wx-tab-btn--active bg-emerald-600 text-white shadow-xs'
                    : 'wx-tab-btn text-zinc-400 hover:text-zinc-200'
                }`}
              >
                AI 伙伴
              </button>
              <button
                onClick={() => setAddFriendActiveTab('real_user')}
                className={`py-1.5 rounded-lg transition ${
                  addFriendActiveTab === 'real_user'
                    ? 'wx-tab-btn--active bg-emerald-600 text-white shadow-xs'
                    : 'wx-tab-btn text-zinc-400 hover:text-zinc-200'
                }`}
              >
                真人好友 (邀请码)
              </button>
            </div>

            {addFriendActiveTab === 'ai' ? (
              <>
                {/* Primary Action Card: Create Custom AI Friend (Requirement 11) */}
                <div className="wx-alert-success p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600/30 via-teal-600/20 to-emerald-600/10 border border-emerald-500/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-md">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="wx-primary-text font-bold text-xs text-white">创建全新自定义 AI 好友</h4>
                        <p className="wx-green-text text-[10px] text-emerald-300">完全自定义头像·人设·性格·记忆</p>
                      </div>
                    </div>
                  </div>
                  <p className="wx-secondary-text text-[11px] text-zinc-300 leading-relaxed">
                    打破模板束缚，你可以随意设定心仪的专属聊天搭子、理想恋人、知心密友或灵感助手。
                  </p>
                  <button
                    onClick={() => {
                      setShowAddFriendModal(false);
                      setShowNewAiModal(true);
                    }}
                    className="wx-btn-primary w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>立即开始自由设定 AI</span>
                  </button>
                </div>
              </>
            ) : (
              // Requirement 12: Add Real User via Unique Invite Code + Private AI Protection Notice
              <div className="space-y-3 text-xs">
                <div className="wx-sub-card p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5">
                  <div className="wx-primary-text flex items-center gap-2 text-indigo-400 font-semibold">
                    <KeyRound className="w-4 h-4 text-indigo-500" />
                    <span>输入真人的专属微信号邀请码</span>
                  </div>
                  <StableTextInput
                    type="text"
                    placeholder="如: US-928410"
                    value={realUserInviteInput}
                    onValueChange={setRealUserInviteInput}
                    className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono uppercase placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                  <button
                    onClick={handleAddRealUserByCode}
                    disabled={!realUserInviteInput.trim()}
                    className="wx-btn-primary w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs shadow-md transition active:scale-95 cursor-pointer"
                  >
                    发送好友申请
                  </button>
                  {addRealUserFeedback && (
                    <p className="wx-alert-success wx-green-text text-[11px] text-emerald-400 bg-emerald-950/40 p-2 rounded-xl border border-emerald-500/30">
                      {addRealUserFeedback}
                    </p>
                  )}
                </div>

                {/* Security and Privacy Protection Rule (Requirement 12) */}
                <div className="wx-alert-warn p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-1.5 text-amber-200">
                  <div className="wx-primary-text flex items-center gap-1.5 font-semibold text-[11px]">
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                    <span>私有 AI 好友安全保护机制</span>
                  </div>
                  <p className="wx-secondary-text text-[10px] text-amber-300/80 leading-relaxed">
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
          <div className="wx-modal-card w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3 text-xs">
            <h3 className="wx-primary-text font-semibold text-sm">发布朋友圈</h3>
            <StableTextarea
              rows={4}
              placeholder="这一刻的想法..."
              value={newPostContent}
              onValueChange={setNewPostContent}
              className="wx-modal-input w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setImagePickerTarget('moment')}
                className="wx-btn-secondary px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center gap-1.5 text-zinc-300 cursor-pointer"
              >
                <ImageIcon className="wx-green-text w-4 h-4 text-emerald-400" />
                <span>添加图片 ({newPostImages.length})</span>
              </button>
            </div>
            <div className="wx-divider flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowCreatePostModal(false)}
                className="wx-btn-secondary px-3 py-1.5 rounded-xl bg-zinc-800 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleCreatePost}
                className="wx-btn-primary px-4 py-1.5 font-medium rounded-xl bg-emerald-500 text-white cursor-pointer"
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
          allCharacters={characters}
          onJoinGroupSuccess={handleJoinGroupSuccess}
          onSimulateIncomingRequest={handleSimulateIncomingRequest}
        />
      )}

      {/* Full-featured Data Management Modal */}
      <DataManagementModal
        isOpen={showDataModal}
        onClose={() => setShowDataModal(false)}
        initialTab={dataModalTab}
        characters={characters}
        onDataChanged={() => {
          setGroupChats(loadGroupChats());
          void loadGroupChatsAsync().then((fresh) => {
            groupChatsRef.current = fresh;
            setGroupChats(fresh);
          });
          setDbVersionKey((prev) => prev + 1);
          if (onDataChanged) onDataChanged();
        }}
      />

      {/* Delete Character with Memory Vault Choice Modal (Requirement 8) */}
      {characterToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="wx-modal-card w-full max-w-sm rounded-3xl bg-zinc-900 border border-rose-500/30 p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="wx-divider flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-rose-500 font-semibold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>删除好友确认</span>
              </div>
              <button
                onClick={() => setCharacterToDelete(null)}
                className="wx-muted-text text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="wx-sub-card flex items-center gap-3 p-3 rounded-2xl bg-zinc-800/80 border border-zinc-750">
              <img
                src={characterToDelete.avatar}
                alt=""
                className="wx-avatar w-12 h-12 rounded-xl object-cover border border-zinc-700 shrink-0"
              />
              <div className="min-w-0">
                <h4 className="wx-primary-text font-bold text-sm text-zinc-100">{characterToDelete.name}</h4>
                <p className="wx-secondary-text text-xs text-zinc-400 font-mono">微信号: {characterToDelete.wxid}</p>
                <p className="wx-muted-text text-[11px] text-zinc-500 truncate">{characterToDelete.persona}</p>
              </div>
            </div>

            <p className="wx-primary-text text-xs text-zinc-300 leading-relaxed">
              确定要删除该 AI 好友吗？删除后将无法通过好友列表与其发起私聊。
            </p>

            {/* Requirement 8: Checkbox to choose whether to delete memory vault */}
            <label className="wx-sub-card flex items-start gap-2.5 p-3 rounded-xl bg-zinc-850 border border-zinc-750 cursor-pointer hover:bg-zinc-800 transition">
              <input
                type="checkbox"
                checked={deleteMemoryVaultWithChar}
                onChange={(e) => setDeleteMemoryVaultWithChar(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-zinc-700 border-zinc-600 cursor-pointer"
              />
              <div className="text-xs">
                <span className="wx-primary-text font-semibold text-zinc-200 block">
                  同时彻底清除该 AI 的独立本地记忆空间
                </span>
                <span className="wx-secondary-text text-[10px] text-zinc-400 leading-normal block mt-0.5">
                  包括该 AI 名下已导入的全部资料文件、切片与检索索引（IndexedDB 永久擦除）。取消勾选可保留文件记忆。
                </span>
              </div>
            </label>

            <div className="wx-divider flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setCharacterToDelete(null)}
                className="wx-btn-secondary px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
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
                className="wx-btn-danger px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
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

      {/* Pseudo Memory Cleanup Confirmation Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="wx-modal-card bg-zinc-900 border border-zinc-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="wx-divider flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="wx-primary-text font-semibold text-zinc-100 text-sm">清理无意义伪记忆</h3>
                  <p className="wx-secondary-text text-[10px] text-zinc-400">过滤历史自动产生的截断式伪表达</p>
                </div>
              </div>
              <button
                onClick={() => setShowCleanupModal(false)}
                className="wx-icon-btn p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cleanupFeedback ? (
              <div className="py-6 text-center space-y-2">
                <div className="wx-pill-badge w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="wx-green-text text-xs font-medium text-emerald-400">{cleanupFeedback}</p>
              </div>
            ) : cleanupPseudoList.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <div className="wx-pill-badge w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <p className="wx-primary-text text-xs text-zinc-200 font-medium">当前记忆库非常干净！</p>
                <p className="wx-secondary-text text-[11px] text-zinc-400 px-4">
                  未扫描到任何形如“对话提及: ...”或碎片段等旧版本伪记忆。
                </p>
                <button
                  onClick={() => setShowCleanupModal(false)}
                  className="wx-btn-secondary mt-2 px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs cursor-pointer"
                >
                  知道啦
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="wx-primary-text text-xs text-zinc-300">
                  扫描到以下 <span className="text-rose-500 font-semibold">{cleanupPseudoList.length} 条</span> 旧版无意义伪记忆，清理后将仅保留真实的优质记忆：
                </p>

                {/* Pseudo memories list to be deleted */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />
                    将被清理的伪记忆 ({cleanupPseudoList.length}):
                  </span>
                  <div className="wx-alert-danger max-h-28 overflow-y-auto space-y-1 p-2 rounded-xl bg-rose-950/20 border border-rose-900/40 text-[11px]">
                    {cleanupPseudoList.map((mem, idx) => (
                      <div key={idx} className="p-1.5 rounded-lg bg-rose-500/10 wx-primary-text line-clamp-2">
                        • {mem}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Valid memories list to be kept */}
                <div className="space-y-1.5">
                  <span className="wx-green-text text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    将保留的优质记忆 ({cleanupValidList.length}):
                  </span>
                  <div className="wx-alert-success max-h-24 overflow-y-auto space-y-1 p-2 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-[11px]">
                    {cleanupValidList.length > 0 ? (
                      cleanupValidList.map((mem, idx) => (
                        <div key={idx} className="p-1 rounded bg-emerald-500/10 wx-primary-text truncate">
                          • {mem}
                        </div>
                      ))
                    ) : (
                      <p className="wx-muted-text text-[10px] text-zinc-500 p-1 text-center">清理后无剩余长期记忆</p>
                    )}
                  </div>
                </div>

                <div className="wx-divider flex justify-end gap-2 pt-2 border-t border-zinc-800">
                  <button
                    onClick={() => setShowCleanupModal(false)}
                    className="wx-btn-secondary px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmCleanupMemories}
                    className="wx-btn-danger px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs cursor-pointer shadow-lg shadow-rose-500/20"
                  >
                    确认清理 ({cleanupPseudoList.length} 条)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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

      {/* Offline History Detail Modal (opened when clicking timeline card in WeChat) */}
      <OfflineHistoryDetailModal
        isOpen={!!offlineDetailSessionId}
        sessionId={offlineDetailSessionId}
        character={activeCharacter}
        userProfile={userProfile}
        apiConfig={apiConfig}
        onClose={() => setOfflineDetailSessionId(null)}
        onUpdateCharacters={onUpdateCharacters}
      />

      {/* Read-Only AI Phone Viewer Modal */}
      {aiPhoneViewerChar && (
        <AiPhoneViewerModal
          isOpen={!!aiPhoneViewerChar}
          onClose={() => setAiPhoneViewerChar(null)}
          character={aiPhoneViewerChar}
          allCharacters={characters}
          userProfile={userProfile}
          userMoments={moments}
        />
      )}

      {/* In-App Image Lightbox Modal (View Full, Save, On-Demand Image Recognition) */}
      {lightboxImageMsg && lightboxImageMsg.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/92 backdrop-blur-sm flex flex-col items-center justify-between p-4"
          onClick={() => setLightboxImageMsg(null)}
        >
          <div
            className="w-full max-w-2xl flex items-center justify-between gap-2 text-xs text-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-medium truncate">
              {lightboxImageMsg.messageType === 'generated_image' || lightboxImageMsg.type === 'generated_image'
                ? 'AI 生成图片'
                : '聊天图片预览'}
            </span>
            <button
              type="button"
              onClick={() => setLightboxImageMsg(null)}
              className="p-2 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer"
              title="关闭大图"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="flex-1 w-full max-w-3xl flex items-center justify-center overflow-hidden my-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImageMsg.imageUrl}
              alt={lightboxImageMsg.imageDescription || '图片大图'}
              className="max-w-full max-h-[68vh] object-contain rounded-xl border border-zinc-800 shadow-2xl"
            />
          </div>

          <div
            className="w-full max-w-2xl space-y-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!lightboxImageMsg.imageUrl) return;
                  const ok = await downloadOrSaveImage(lightboxImageMsg.imageUrl, 'wechat_image');
                  setMultiBubbleToast(ok ? '已触发图片保存' : '图片保存失败');
                  setTimeout(() => setMultiBubbleToast(null), 2200);
                }}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>保存图片</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLightboxShowDetails(true);
                  void recognizeMessageImage(lightboxImageMsg, { force: true, source: '大图按需识别' });
                }}
                disabled={(lightboxImageMsg.recognitionStatus || lightboxImageMsg.imageAnalysisStatus) === 'pending'}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                {(lightboxImageMsg.recognitionStatus || lightboxImageMsg.imageAnalysisStatus) === 'pending' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="w-3.5 h-3.5" />
                )}
                <span>
                  {(lightboxImageMsg.recognitionStatus || lightboxImageMsg.imageAnalysisStatus) === 'pending'
                    ? '识别中...'
                    : '识别此图'}
                </span>
              </button>

              {(lightboxImageMsg.messageType === 'generated_image' || lightboxImageMsg.type === 'generated_image') && (
                <button
                  type="button"
                  onClick={() => {
                    void generateImageForMessage(lightboxImageMsg, { isRetry: true });
                    setLightboxImageMsg(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重新生成</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setLightboxShowDetails((v) => !v)}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition cursor-pointer"
              >
                {lightboxShowDetails ? '收起信息' : '查看语义/提示词'}
              </button>
            </div>

            {lightboxShowDetails && (
              <div className="p-3 rounded-xl bg-zinc-900/95 border border-zinc-800 text-[11px] text-zinc-300 space-y-1.5 max-h-40 overflow-y-auto">
                {(lightboxImageMsg.recognitionStatus || lightboxImageMsg.imageAnalysisStatus) === 'pending' && (
                  <p className="text-indigo-300 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    正在调用图像识别模型分析此图...
                  </p>
                )}
                {(lightboxImageMsg.recognitionStatus || lightboxImageMsg.imageAnalysisStatus) === 'failed' && (
                  <p className="text-rose-300">
                    识别失败：{lightboxImageMsg.recognitionError || '未返回有效识别结果'}
                  </p>
                )}
                {(lightboxImageMsg.imageDescription || lightboxImageMsg.imageAnalysis) && (
                  <p>
                    <span className="text-zinc-500">图片语义：</span>
                    {lightboxImageMsg.imageDescription || lightboxImageMsg.imageAnalysis}
                  </p>
                )}
                {lightboxImageMsg.detectedText && (
                  <p>
                    <span className="text-zinc-500">图中文字：</span>
                    {lightboxImageMsg.detectedText}
                  </p>
                )}
                {lightboxImageMsg.imageScene && (
                  <p>
                    <span className="text-zinc-500">场景：</span>
                    {lightboxImageMsg.imageScene}
                  </p>
                )}
                {lightboxImageMsg.generationPrompt && (
                  <p>
                    <span className="text-zinc-500">生图提示词：</span>
                    {lightboxImageMsg.generationPrompt}
                  </p>
                )}
                {lightboxImageMsg.revisedPrompt && (
                  <p>
                    <span className="text-zinc-500">修订提示词：</span>
                    {lightboxImageMsg.revisedPrompt}
                  </p>
                )}
                {(lightboxImageMsg.model || lightboxImageMsg.recognitionModel) && (
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {lightboxImageMsg.model ? `生图模型: ${lightboxImageMsg.model} ` : ''}
                    {lightboxImageMsg.recognitionModel ? `识别模型: ${lightboxImageMsg.recognitionModel}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
