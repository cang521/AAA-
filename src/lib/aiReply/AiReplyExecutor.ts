import { AiCharacter, ChatMessage, UserProfile, AiPermissions, WorldBook, Memo } from '../../types';
import { getRecentChatMessages, getMessagesByIds, saveChatMessage, recallCharacterMemories, replaceChatMessagesTurn } from '../chatDb';
import { getRecentEpisodeForNormalReply } from '../proactive/proactiveStore';
import { getAiArchiveConfig, recallArchivedHistory } from '../chatArchiveDb';
import { searchAiMemoryChunks } from '../aiMemoryVaultDb';
import { systemNativeService } from '../systemNativeService';
import { deviceService } from '../deviceService';
import { apiFetch } from '../localBackend';
import { getLifeContextForPrompt } from '../lifeState/lifeStateStore';
import { triggerLifeStateExtraction } from '../lifeState/lifeStateExtractor';
import { triggerSmartMemoryExtraction } from '../memoryExtractor';
import { NativeNotificationService } from '../NativeNotificationService';
import { sanitizeReplyText } from '../thinkCleaner';
import { splitMessageIntoSentenceBubbles, calculateTypingDelay, getMultiBubbleConfig } from '../wechatMultiBubble';
import { loadFromStorage, loadCharacters, loadApiConfig } from '../storage';
import { updateCharacterByIdIfExists } from '../characterPersistence';
import { evaluateWeatherContext, evaluateMenstrualContext, evaluateWorldBookContext } from './contextEvaluator';
import { AiReplyTask, AiReplyTaskStatus } from './AiReplyTaskStore';
import {
  awaitPendingRecognitionsForMessages,
  buildCurrentTurnImageContext,
  generateImageForMessage,
} from '../image/imageCapabilitiesService';
import { applyOverlengthContextProtection, STANDARD_CONTEXT_LIMIT } from '../contextWindow';
import { serializeForwardBundleForAi } from '../forward/forwardBundleService';
import {
  buildGroupToPrivateTransitionPromptBlock,
  markCrossChannelAiRepliedInPrivate,
  markCrossChannelUserReplied,
} from '../crossChannel/crossChannelStore';

const nativeNotificationService = NativeNotificationService.getInstance();

export function evaluateMemoryNeeds(
  userText: string,
  searchMode: 'off' | 'auto' | 'deep',
  recentMessages: ChatMessage[]
): { shouldRecallChatHistory: boolean; shouldRecallVault: boolean } {
  const trimmed = userText.trim();
  if (!trimmed) {
    return { shouldRecallChatHistory: false, shouldRecallVault: false };
  }

  // 1. Check for casual short phrases & continuous chit-chat
  const isShortGreeting = /^(在吗|早|早安|晚安|嗯|嗯嗯|好的|好|哈哈|哈哈哈|收到|对|是的|拜拜|再见|666|okk?|hi|hello|hey|yo|\?|？|！|!|我困了|好累|刚吃完|在干嘛|笑死|好吧|然后呢|去哪|好呀)$/i.test(trimmed);
  if (trimmed.length <= 6 && isShortGreeting) {
    return { shouldRecallChatHistory: false, shouldRecallVault: false };
  }

  // 2. Extract key topic tokens and check if they are ALREADY present in context window
  const keywords = trimmed
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const contextText = recentMessages.slice(-20).map((m) => m.text || '').join('\n');
  const isCoveredInContext = keywords.length > 0 && keywords.some((kw) => kw.length >= 2 && contextText.includes(kw));

  // 3. Chat History Retrieval
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

  // 4. AI Memory Vault Retrieval (Independent of searchMode === 'off')
  let shouldRecallVault = false;
  const hasVaultIntent = /(设定|背景|档案|记忆库|资料|文件|世界观|剧本|人设|故事|秘密|能力|职业|小说|大纲|自述|身世)/i.test(trimmed);
  if (hasVaultIntent && !isCoveredInContext) {
    shouldRecallVault = true;
  }

  return { shouldRecallChatHistory, shouldRecallVault };
}

export async function executeAiReplyTask(
  task: AiReplyTask,
  onStatusChange?: (status: AiReplyTaskStatus) => Promise<void>
): Promise<void> {
  if (onStatusChange) await onStatusChange('preparing');

  const characters = loadCharacters();
  const activeCharacter = characters.find((c) => c.id === task.characterId);
  if (!activeCharacter) {
    throw new Error(`Character ${task.characterId} not found`);
  }

  const userProfile = loadFromStorage<UserProfile | null>('phone_user_profile', null);
  const permissions = loadFromStorage<AiPermissions | null>('phone_ai_permissions', null);
  const apiConfig = loadApiConfig();
  const worldBooks = loadFromStorage<WorldBook[]>('phone_world_books', []);
  const memos = loadFromStorage<Memo[]>('phone_memos', []);

  // Archive & Search Config
  const archiveConfig = await getAiArchiveConfig(activeCharacter.id).catch(() => ({
    searchMode: 'auto' as const,
    contextMessageCount: 100,
  }));
  const searchMode = archiveConfig.searchMode || 'auto';
  const contextLimit =
    typeof archiveConfig.contextMessageCount === 'number' && archiveConfig.contextMessageCount > 0
      ? archiveConfig.contextMessageCount
      : 100;

  // Recent History excluding current turn
  const currentTurnMsgIdSet = new Set(task.currentTurnMessageIds || []);
  let conversationHistory: ChatMessage[];
  if (task.conversationHistoryOverride && Array.isArray(task.conversationHistoryOverride)) {
    conversationHistory = task.conversationHistoryOverride;
  } else {
    const rawHistory = await getRecentChatMessages(activeCharacter.id, contextLimit).catch(() => []);
    conversationHistory = rawHistory.filter((msg) => !currentTurnMsgIdSet.has(msg.id));
  }

  // If this is a reroll task, make sure the old AI messages being replaced are also excluded from prompt context
  const replaceIdSet = new Set(task.replaceMessageIds || []);
  if (replaceIdSet.size > 0) {
    conversationHistory = conversationHistory.filter((msg) => !replaceIdSet.has(msg.id));
  }

  // Ensure any proactive message chain from the active or recently-answered episode remains visible
  // to the normal AI reply so AI clearly knows what proactive message the user is replying to.
  if (!task.conversationHistoryOverride) {
    try {
      const recentEpisode = getRecentEpisodeForNormalReply(activeCharacter.id);
      if (recentEpisode && recentEpisode.proactiveMessageIds.length > 0) {
        const existingIds = new Set(conversationHistory.map((m) => m.id));
        const missingIds = recentEpisode.proactiveMessageIds.filter(
          (id) => !existingIds.has(id) && !currentTurnMsgIdSet.has(id) && !replaceIdSet.has(id)
        );
        if (missingIds.length > 0) {
          const extraMsgs = await getMessagesByIds(activeCharacter.id, missingIds);
          if (extraMsgs.length > 0) {
            conversationHistory = [...conversationHistory, ...extraMsgs].sort(
              (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
            );
          }
        }
      }
    } catch (e) {
      console.warn('[AiReplyExecutor] Failed to merge episode proactive messages:', e);
    }
  }

  // Evaluate memory needs
  const { shouldRecallChatHistory, shouldRecallVault } = evaluateMemoryNeeds(
    task.combinedUserText,
    searchMode,
    conversationHistory
  );

  // Parallel pre-tasks including weather & menstrual context evaluation
  const [historyResult, archiveResult, vaultRecall, weatherInfo, menstrualInfo] = await Promise.all([
    shouldRecallChatHistory
      ? recallCharacterMemories(activeCharacter.id, task.combinedUserText, 4).catch(() => ({
          recalledText: '',
          matchedCount: 0,
          durationMs: 0,
        }))
      : Promise.resolve({ recalledText: '', matchedCount: 0, durationMs: 0 }),
    shouldRecallChatHistory
      ? recallArchivedHistory(activeCharacter.id, task.combinedUserText, searchMode).catch(() => ({
          recalledText: '',
          matchedCount: 0,
          durationMs: 0,
        }))
      : Promise.resolve({ recalledText: '', matchedCount: 0, durationMs: 0 }),
    shouldRecallVault
      ? searchAiMemoryChunks(activeCharacter.id, task.combinedUserText, 4).catch(() => ({
          recalledText: '',
          matchedChunks: [],
          matchedFileNames: [],
          durationMs: 0,
        }))
      : Promise.resolve({ recalledText: '', matchedChunks: [], matchedFileNames: [], durationMs: 0 }),
    evaluateWeatherContext(activeCharacter.id, task.combinedUserText, permissions),
    evaluateMenstrualContext(activeCharacter.id, task.combinedUserText, permissions),
  ]);

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

  const worldBookEval = evaluateWorldBookContext(
    activeCharacter.id,
    task.combinedUserText,
    worldBooks,
    permissions
  );

  const devicesSummary =
    permissions?.deviceAccess?.viewStatus !== false
      ? deviceService.getSanitizedDevicesSummary(permissions)
      : undefined;

  // Wait for any in-flight image recognition on the current turn's user messages
  // to eliminate race conditions between image upload and AI reply generation.
  if (task.currentTurnMessageIds && task.currentTurnMessageIds.length > 0) {
    await awaitPendingRecognitionsForMessages(task.currentTurnMessageIds);
  }
  const freshCurrentTurnUserMsgs =
    task.currentTurnMessageIds && task.currentTurnMessageIds.length > 0
      ? await getMessagesByIds(activeCharacter.id, task.currentTurnMessageIds).catch(() => task.userMessages || [])
      : task.userMessages || [];

  const resolvedCurrentImageAnalysis =
    buildCurrentTurnImageContext(freshCurrentTurnUserMsgs) || task.currentImageAnalysis;

  const effectiveUserMessage =
    task.combinedUserText && task.combinedUserText.trim()
      ? task.combinedUserText
      : resolvedCurrentImageAnalysis
      ? '[用户发送了图片]'
      : '';

  // Strip heavy data:image/* Base64 payloads from historical conversation messages
  // while preserving semantic image metadata and serializing forward_bundle items
  const lightConversationHistory = conversationHistory.map((m) => {
    const base =
      m.imageUrl && m.imageUrl.startsWith('data:image/')
        ? { ...m, imageUrl: undefined }
        : { ...m };
    if (base.type === 'forward_bundle' || base.messageType === 'forward_bundle' || base.forwardBundle) {
      return {
        ...base,
        text: serializeForwardBundleForAi(base.forwardBundle),
      };
    }
    return base;
  });

  // Apply unified 100-message window + over-length protection (30 raw + 70 summary only when over budget)
  const effectiveMaxWindow = Math.min(STANDARD_CONTEXT_LIMIT, Math.max(30, contextLimit));
  const contextProtection = applyOverlengthContextProtection<ChatMessage>({
    messages: lightConversationHistory,
    maxRawLimit: effectiveMaxWindow,
    formatForEstimate: (m) => ({
      timestamp: m.timestamp,
      senderName: m.sender === 'user' ? userProfile?.name || '用户' : activeCharacter.name,
      text: m.text || (m.imageDescription ? `[图片:${m.imageDescription}]` : ''),
    }),
    cloneWithTruncatedText: (m, truncatedText) => ({
      ...m,
      text: truncatedText,
    }),
  });

  if (effectiveUserMessage && !task.isReroll) {
    markCrossChannelUserReplied(activeCharacter.id, effectiveUserMessage);
  }
  const crossChannelTransitionContext = buildGroupToPrivateTransitionPromptBlock(activeCharacter.id);

  // Send request to Gemini API
  if (onStatusChange) await onStatusChange('generating');
  const res = await apiFetch('/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      character: activeCharacter,
      userMessage: effectiveUserMessage,
      currentTurnMessageIds: task.currentTurnMessageIds,
      currentImageAnalysis: resolvedCurrentImageAnalysis,
      conversationHistory: contextProtection.rawMessages,
      earlierContextSummary: contextProtection.earlierSummaryText || undefined,
      contextMetrics: contextProtection.metrics,
      crossChannelTransitionContext,
      recalledMemoriesSummary: combinedRecalledMemories || undefined,
      userProfile,
      systemTime: systemNativeService.getRealSystemTime().summaryString,
      locationCity: weatherInfo?.city,
      menstrualInfo,
      weatherInfo,
      devicesSummary,
      memosSummary: memos.map((m) => `- ${m.title}: ${m.content}`).join('\n'),
      lifeStateContext: getLifeContextForPrompt(activeCharacter.id),
      worldBookContext: worldBookEval ? worldBookEval.promptText : undefined,
      associatedWorldBooks: worldBookEval ? worldBookEval.activeBooks : undefined,
      associatedWorldBook: worldBookEval && worldBookEval.activeBooks[0] ? worldBookEval.activeBooks[0] : null,
      permissions,
      apiConfig,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    const rawMsg = data?.errorMessage || data?.error || data?.message || `模型生成请求失败 (${res.status})`;
    const chargedNotice = data?.mayHaveBeenCharged
      ? `${rawMsg}（请求已发送至上游，可能已产生扣费，已停止自动重试，如需重发请点击手动重试）`
      : rawMsg;
    const err: any = new Error(chargedNotice);
    err.statusCode = res.status;
    err.mayHaveBeenCharged = Boolean(data?.mayHaveBeenCharged);
    err.upstreamRequestSent = data?.upstreamRequestSent;
    err.protocol = data?.protocol;
    err.causeCode = data?.causeCode;
    err.requestId = data?.requestId;
    throw err;
  }

  // Device actions
  if (data.deviceActions && Array.isArray(data.deviceActions) && data.deviceActions.length > 0) {
    for (const devAct of data.deviceActions) {
      if (devAct.deviceId && devAct.actionId) {
        deviceService
          .executeAction(devAct.deviceId, devAct.actionId, devAct.params || {}, {
            source: 'ai',
            aiCharacterName: activeCharacter.name,
            permissions,
          })
          .catch((err) => console.warn('AI device action execution error:', err));
      }
    }
  }

  const rawThinking =
    typeof data.thinkingProcess === 'string' ? data.thinkingProcess.trim() : '';
  const reasoningAvailable = Boolean(data.reasoningAvailable && rawThinking.length > 0) || rawThinking.length > 0;
  const reasoningSource = reasoningAvailable ? data.reasoningSource || 'think_tag' : 'none';
  const reasoningStatus: ChatMessage['reasoningStatus'] = reasoningAvailable ? 'available' : 'empty';

  // Multi-bubble delivery & save to IndexedDB (including optional generate_image actions in same turn)
  const multiBubbleConfig = getMultiBubbleConfig();

  const generateImageActions: Array<{
    type: 'generate_image';
    prompt: string;
    imageDescription?: string;
    aspectRatio?: string;
    negativePrompt?: string;
  }> = Array.isArray(data.actions)
    ? data.actions.filter(
        (act: any) => act && act.type === 'generate_image' && typeof act.prompt === 'string' && act.prompt.trim().length > 0
      )
    : [];

  const cleanRawText = sanitizeReplyText(data.text || '');
  if (!cleanRawText.trim() && generateImageActions.length === 0) {
    throw new Error('模型返回空内容，无法生成有效回复');
  }

  const shouldSplit = multiBubbleConfig.enabled;
  const rawBubbles = cleanRawText.trim()
    ? shouldSplit
      ? splitMessageIntoSentenceBubbles(cleanRawText, { maxBubbles: multiBubbleConfig.maxBubbles })
      : [cleanRawText]
    : [];

  const bubbles = rawBubbles.map((b) => sanitizeReplyText(b)).filter((s) => s.trim().length > 0);
  if (bubbles.length === 0 && generateImageActions.length === 0) {
    throw new Error('模型未生成有效文本气泡');
  }

  const assignedTurnId =
    task.turnId ||
    'turn_ai_' + activeCharacter.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const totalTurnBubbles = bubbles.length + generateImageActions.length;

  const buildGeneratedImageMessage = (
    act: { prompt: string; imageDescription?: string; aspectRatio?: string; negativePrompt?: string },
    idx: number,
    isRefreshed?: boolean
  ): ChatMessage => {
    const bubbleIndex = bubbles.length + idx;
    const msgId = `msg_img_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
    const attachThinkingHere = bubbles.length === 0 && idx === 0 && reasoningAvailable;
    return {
      id: msgId,
      characterId: activeCharacter.id,
      sender: 'ai',
      text: '',
      messageType: 'generated_image',
      type: 'generated_image',
      generationPrompt: act.prompt.trim(),
      imageDescription: (act.imageDescription || act.prompt).trim(),
      aspectRatio: act.aspectRatio || '1:1',
      negativePrompt: act.negativePrompt || '',
      generationStatus: 'pending',
      generationRequestId: `imggen_${assignedTurnId}_${idx}`,
      timestamp: Date.now() + bubbleIndex * 20,
      turnId: assignedTurnId,
      turnBubbleIndex: bubbleIndex,
      turnTotalBubbles: totalTurnBubbles,
      isRefreshed,
      thinkingProcess: attachThinkingHere ? rawThinking : undefined,
      reasoningAvailable,
      reasoningSource,
      reasoningStatus,
    };
  };

  if (onStatusChange) await onStatusChange('delivering');

  if (task.isReroll && task.replaceMessageIds && task.replaceMessageIds.length > 0) {
    // Reroll turn replacement: All bubbles + generated image cards share the same assignedTurnId.
    const newTextMessages: ChatMessage[] = bubbles.map((bubbleText, i) => ({
      id: 'msg_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
      characterId: activeCharacter.id,
      sender: 'ai',
      text: bubbleText,
      messageType: 'text',
      timestamp: Date.now() + i * 15,
      turnId: assignedTurnId,
      turnBubbleIndex: i,
      turnTotalBubbles: totalTurnBubbles,
      isRefreshed: true,
      thinkingProcess: i === 0 && reasoningAvailable ? rawThinking : undefined,
      reasoningAvailable,
      reasoningSource,
      reasoningStatus,
    }));

    const newImageMessages: ChatMessage[] = generateImageActions.map((act, idx) =>
      buildGeneratedImageMessage(act, idx, true)
    );
    const allNewMessages = [...newTextMessages, ...newImageMessages];

    await replaceChatMessagesTurn(activeCharacter.id, task.replaceMessageIds, allNewMessages);

    for (const imgMsg of newImageMessages) {
      void generateImageForMessage(imgMsg);
    }

    for (let i = 0; i < newTextMessages.length; i++) {
      const msg = newTextMessages[i];
      void nativeNotificationService
        .notifyAiMessage(activeCharacter, msg.text, {
          messageId: msg.id,
          bubbleIndex: i,
          timestamp: msg.timestamp,
          triggerSource: 'ai_reply_reroll',
        })
        .then((notifRes) => {
          if (!notifRes.success && notifRes.code !== 'SKIPPED_APP_FOREGROUND' && notifRes.code !== 'NOT_NATIVE_ANDROID') {
            console.warn(
              `[AiReplyExecutor] Notification failed for reroll bubble ${msg.id} (aiId=${activeCharacter.id}, code=${notifRes.code})`
            );
          }
        })
        .catch((err) => {
          console.warn(`[AiReplyExecutor] Notification unexpected error for ${msg.id}:`, err);
        });
    }
  } else {
    for (let i = 0; i < bubbles.length; i++) {
      const bubbleText = bubbles[i];
      if (i > 0) {
        const delay = calculateTypingDelay(bubbleText, multiBubbleConfig.speed);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const bubbleMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
        characterId: activeCharacter.id,
        sender: 'ai',
        text: bubbleText,
        messageType: 'text',
        timestamp: Date.now() + i * 15,
        turnId: assignedTurnId,
        turnBubbleIndex: i,
        turnTotalBubbles: totalTurnBubbles,
        thinkingProcess: i === 0 && reasoningAvailable ? rawThinking : undefined,
        reasoningAvailable,
        reasoningSource,
        reasoningStatus,
      };

      await saveChatMessage(bubbleMsg);

      // Trigger Native Notification per bubble when app is in background (non-blocking for DB flow)
      void nativeNotificationService
        .notifyAiMessage(activeCharacter, bubbleText, {
          messageId: bubbleMsg.id,
          bubbleIndex: i,
          timestamp: bubbleMsg.timestamp,
          triggerSource: 'ai_reply',
        })
        .then((notifRes) => {
          if (!notifRes.success && notifRes.code !== 'SKIPPED_APP_FOREGROUND' && notifRes.code !== 'NOT_NATIVE_ANDROID') {
            console.warn(
              `[AiReplyExecutor] Notification failed for bubble ${bubbleMsg.id} (aiId=${activeCharacter.id}, code=${notifRes.code})`
            );
          }
        })
        .catch((err) => {
          console.warn(`[AiReplyExecutor] Notification unexpected error for ${bubbleMsg.id}:`, err);
        });
    }

    // Create & execute generated_image bubbles in the SAME turnId
    for (let idx = 0; idx < generateImageActions.length; idx++) {
      const imgMsg = buildGeneratedImageMessage(generateImageActions[idx], idx);
      await saveChatMessage(imgMsg);
      void generateImageForMessage(imgMsg);
    }
  }

  // Mark any pending group->private transition as cleanly answered now that AI responded
  markCrossChannelAiRepliedInPrivate(activeCharacter.id, cleanRawText);

  // Background Life State Extraction
  triggerLifeStateExtraction(
    [
      { id: 'user_' + Date.now(), characterId: activeCharacter.id, sender: 'user', text: task.combinedUserText, timestamp: Date.now() },
      { id: 'ai_' + Date.now(), characterId: activeCharacter.id, sender: 'ai', text: data.text || '', timestamp: Date.now() },
    ],
    activeCharacter.id
  ).catch(() => {});

  // Smart Memory Extraction if enabled
  if (activeCharacter.autoExtractMemoryEnabled !== false) {
    triggerSmartMemoryExtraction({
      character: activeCharacter,
      combinedUserText: task.combinedUserText,
      recentMessages: conversationHistory.slice(-6),
      userProfile,
      apiConfig,
      onUpdateCharacterMemories: (newMemories: string[]) => {
        void updateCharacterByIdIfExists(activeCharacter.id, (c) => ({
          ...c,
          memories: newMemories,
        })).catch((err) => {
          console.warn('[SmartMemoryExtract] Persist memories failed:', err);
        });
      },
    }).catch((err) => console.warn('[SmartMemoryExtract] error', err));
  }
}
