import { AiCharacter, ChatMessage, UserProfile, AiPermissions, WorldBook, Memo } from '../../types';
import { getRecentChatMessages, saveChatMessage, recallCharacterMemories } from '../chatDb';
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
import { loadFromStorage, saveToStorage, loadApiConfig } from '../storage';
import { evaluateWeatherContext, evaluateMenstrualContext } from './contextEvaluator';
import { AiReplyTask } from './AiReplyTaskStore';

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

export async function executeAiReplyTask(task: AiReplyTask): Promise<void> {
  const characters = loadFromStorage<AiCharacter[]>('phone_ai_characters', []);
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
  const rawHistory = await getRecentChatMessages(activeCharacter.id, contextLimit).catch(() => []);
  const conversationHistory = rawHistory.filter((msg) => !currentTurnMsgIdSet.has(msg.id));

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

  const associatedWorldBook = (worldBooks || []).find((wb) =>
    wb.associatedCharacterIds?.includes(activeCharacter.id)
  );

  const devicesSummary =
    permissions?.deviceAccess?.viewStatus !== false
      ? deviceService.getSanitizedDevicesSummary(permissions)
      : undefined;

  // Send request to Gemini API
  const res = await apiFetch('/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      character: activeCharacter,
      userMessage: task.combinedUserText,
      currentTurnMessageIds: task.currentTurnMessageIds,
      currentImageAnalysis: task.currentImageAnalysis,
      conversationHistory,
      recalledMemoriesSummary: combinedRecalledMemories || undefined,
      userProfile,
      systemTime: systemNativeService.getRealSystemTime().summaryString,
      locationCity: weatherInfo?.city,
      menstrualInfo,
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

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Gemini API response failed');
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

  const memoryRecallNote =
    vaultRecall.matchedChunks.length > 0
      ? `调阅专属记忆空间 (${vaultRecall.matchedChunks.length} 处匹配片段，来源: ${vaultRecall.matchedFileNames.join('、')})`
      : `检索长期记忆 [${activeCharacter.memories?.slice(0, 3).join('; ') || '日常记忆'}]`;

  const thinkingProcess =
    data.thinkingProcess ||
    `【推理分析】:\n1. 结合角色人设 [${activeCharacter.persona}]\n2. ${
      associatedWorldBook ? `融入世界书设定 [《${associatedWorldBook.title}》]` : '无关联世界书，按日常设定回复'
    }\n3. ${memoryRecallNote}\n4. 形成专属口吻回复。`;

  // Multi-bubble delivery & save to IndexedDB
  const multiBubbleConfig = getMultiBubbleConfig();

  const cleanRawText = sanitizeReplyText(data.text || '');
  const shouldSplit = multiBubbleConfig.enabled;
  const rawBubbles = shouldSplit
    ? splitMessageIntoSentenceBubbles(cleanRawText, { maxBubbles: multiBubbleConfig.maxBubbles })
    : [cleanRawText];

  const bubbles = rawBubbles.map((b) => sanitizeReplyText(b)).filter((s) => s.trim().length > 0);

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
      timestamp: Date.now() + i * 15,
      thinkingProcess:
        i === 0
          ? thinkingProcess
          : `${thinkingProcess}\n\n[连发第 ${i + 1}/${bubbles.length} 条消息]`,
    };

    await saveChatMessage(bubbleMsg);

    // Trigger Native Notification if app is in background
    nativeNotificationService.notifyAiMessage(activeCharacter, bubbleText);
  }

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
        const currentChars = loadFromStorage<AiCharacter[]>('phone_ai_characters', []);
        const updated = currentChars.map((c) => (c.id === activeCharacter.id ? { ...c, memories: newMemories } : c));
        saveToStorage('phone_ai_characters', updated);
      },
    }).catch((err) => console.warn('[SmartMemoryExtract] error', err));
  }
}
