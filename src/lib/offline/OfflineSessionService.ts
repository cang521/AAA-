/**
 * OfflineSessionService.ts
 * Main orchestrator service for Offline Scene Mode lifecycle & AI interactions.
 *
 * Core Guarantees:
 * - Unified continuous timeline with WeChat private chat, proactive messages & long-term memory.
 * - Dynamic 30..60 message context window + rolling session summary (ZERO extra model calls).
 * - Persona-driven locked awarenessMode ('self_aware_ai' | 'immersive_character').
 * - Idempotent send/retry with stable clientMessageId & requestId (user messages NEVER disappear or duplicate).
 * - Always calls ensureBackendReady() before /api/gemini/offline-* requests on Android embedded backend.
 * - NEVER fabricates fake template summary into long-term memory when summary API fails (marks summary_pending).
 */

import { AiCharacter, UserProfile, ApiConfig } from '../../types';
import { apiFetch, ensureBackendReady } from '../localBackend';
import {
  OfflineSession,
  OfflineMessage,
  saveOfflineSession,
  saveOfflineMessage,
  getAllSessionMessages,
  deleteOfflineSession,
} from './OfflineSessionDb';
import { OfflineStateEngine, CharacterState } from './OfflineStateEngine';
import { OfflineMemoryBridge, OfflineSessionSummary } from './OfflineMemoryBridge';
import { detectAwarenessModeFromPersona } from './offlineAwareness';
import {
  enterOfflineMode,
  exitOfflineMode,
  recordOfflineInteractionTimestamp,
} from './offlineInteractionState';
import {
  selectDynamicOfflineContextMessages,
  formatOfflineMessageForPrompt,
  buildSessionRollingFallbackSummary,
} from './offlineContextBuilder';
import {
  normalizeOfflineSegments,
  segmentsToPlainText,
  extractPrimaryActionFromSegments,
} from './offlineSegments';
import {
  getDeviceTimeZone,
  formatOfflinePromptDateTime,
  computeDurationMinutes,
} from './offlineTimeFormat';
import { recallCharacterMemories } from '../chatDb';
import { searchAiMemoryChunks } from '../aiMemoryVaultDb';
import { getAiArchiveConfig } from '../chatArchiveDb';
import { getLifeContextForPrompt } from '../lifeState/lifeStateStore';
import { triggerLifeStateExtraction } from '../lifeState/lifeStateExtractor';
import { loadWorldBooks, loadPermissions } from '../storage';
import { evaluateWorldBookContext } from '../aiReply/contextEvaluator';

export interface SendOfflineMessageOptions {
  messageId?: string;
  clientMessageId?: string;
  requestId?: string;
}

export interface SendOfflineMessageResult {
  userMessage: OfflineMessage;
  aiMessage: OfflineMessage;
  updatedSession: OfflineSession;
  contextWindowSize: number;
  extendedBeyond30: boolean;
}

export interface EndOfflineSessionResult {
  summary: OfflineSessionSummary | null;
  summaryPending: boolean;
  error?: string;
  updatedSession: OfflineSession;
}

function createUniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export class OfflineSessionService {
  /**
   * Start a new active Offline Session for a character and scene.
   * - Determines and locks awarenessMode from character persona (0 API calls)
   * - Emits OFFLINE_SESSION_STARTED metadata (eventId, startedAt, timezone, interactionMode)
   * - Pauses ONLY this character's WeChat proactive messages & cancels pending 15m/1h follow-ups
   */
  public static async startSession(
    character: AiCharacter,
    scene: { name: string; location: string; atmosphere: string; background: string; defaultOpening?: string },
    sceneTemplateId?: string
  ): Promise<{ session: OfflineSession; firstMessage?: OfflineMessage }> {
    const now = Date.now();
    const sessionId = createUniqueId('offsess');
    const eventId = createUniqueId('evt_offline');
    const timezone = getDeviceTimeZone();
    const initialState = OfflineStateEngine.createInitialState();
    const awareness = detectAwarenessModeFromPersona(character);

    const session: OfflineSession = {
      id: sessionId,
      eventId,
      characterId: character.id,
      characterName: character.name,
      characterAvatar: character.avatar,
      sceneTemplateId,
      sceneName: scene.name,
      sceneSnapshot: {
        name: scene.name,
        location: scene.location,
        atmosphere: scene.atmosphere,
        background: scene.background,
        defaultOpening: scene.defaultOpening,
      },
      startedAt: now,
      timezone,
      awarenessMode: awareness.awarenessMode,
      awarenessSource: awareness.awarenessSource,
      awarenessLocked: awareness.awarenessLocked,
      interactionMode: 'FACE_TO_FACE',
      status: 'active',
      summaryStatus: 'idle',
      stateHistory: [{ timestamp: now, state: initialState }],
      createdAt: now,
      updatedAt: now,
    };

    await saveOfflineSession(session);

    // Immediately switch this AI to 'offline' mode & pause proactive messages / cancel pending follow-ups
    enterOfflineMode(character.id, sessionId, scene.name, now);

    let firstMessage: OfflineMessage | undefined;
    if (scene.defaultOpening && scene.defaultOpening.trim()) {
      const openingSegments = normalizeOfflineSegments(undefined, scene.defaultOpening);
      const openingText = segmentsToPlainText(openingSegments) || scene.defaultOpening.trim();
      const openingAction = extractPrimaryActionFromSegments(openingSegments);
      firstMessage = await saveOfflineMessage({
        id: `offmsg_${now}_init`,
        clientMessageId: `offmsg_${now}_init`,
        sessionId,
        sender: 'ai',
        text: openingText,
        action: openingAction,
        segments: openingSegments,
        status: 'sent',
        timestamp: now,
        createdAt: now,
        updatedAt: now,
        state: initialState,
      });
    }

    return { session, firstMessage };
  }

  /**
   * Discard an active draft session and restore the AI's interaction mode to 'chat' cleanly.
   */
  public static async discardActiveSession(session: OfflineSession): Promise<void> {
    await deleteOfflineSession(session.id);
    exitOfflineMode(session.characterId, Date.now());
  }

  /**
   * Send user message and trigger AI roleplay response in Offline Mode.
   * Uses stable clientMessageId & requestId so retrying never duplicates or drops the user message.
   */
  public static async sendUserMessage(
    session: OfflineSession,
    character: AiCharacter,
    userText: string,
    userProfile: UserProfile,
    apiConfig?: ApiConfig,
    options?: SendOfflineMessageOptions
  ): Promise<SendOfflineMessageResult> {
    const now = Date.now();
    const stableId = options?.clientMessageId || options?.messageId || createUniqueId('offmsg_u');
    const requestId = options?.requestId || createUniqueId('offreq');

    // Keep awarenessMode locked for this session (never flip mid-session)
    const awarenessMode =
      session.awarenessLocked && session.awarenessMode
        ? session.awarenessMode
        : detectAwarenessModeFromPersona(character).awarenessMode;

    // 1. Idempotently save user message with status='sending'
    let persistedUserMsg = await saveOfflineMessage({
      id: stableId,
      clientMessageId: stableId,
      requestId,
      sessionId: session.id,
      sender: 'user',
      text: userText,
      status: 'sending',
      timestamp: now,
      createdAt: now,
      updatedAt: now,
    });

    // Offline interaction counts as real interaction on the shared timeline
    recordOfflineInteractionTimestamp(character.id, now);

    try {
      // 2. Fetch full session history & build dynamic 30..60 context window (excluding current pending user msg)
      const allMessages = await getAllSessionMessages(session.id);
      const priorMessages = allMessages.filter(
        (m) => m.id !== persistedUserMsg.id && m.clientMessageId !== persistedUserMsg.clientMessageId
      );
      const selection = selectDynamicOfflineContextMessages(priorMessages);

      // Determine whether this is the character's first live offline reply in this session
      const priorUserCount = priorMessages.filter((m) => m.sender === 'user' && m.status !== 'failed').length;
      const isFirstTurn = priorUserCount === 0;

      const formattedRecentMessages = selection.selectedMessages.map((m) =>
        formatOfflineMessageForPrompt(m, userProfile?.name || '用户', character.name)
      );

      // Combine persisted rolling summary with deterministic fallback + overlength protection summary
      const summaryChunks: string[] = [];
      if (session.contextSummary && session.contextSummary.trim()) {
        summaryChunks.push(session.contextSummary.trim());
      } else if (selection.droppedOlderMessages.length > 0) {
        summaryChunks.push(
          buildSessionRollingFallbackSummary(
            selection.droppedOlderMessages,
            userProfile?.name || '用户',
            character.name
          )
        );
      }
      if (selection.earlierSummaryText) {
        summaryChunks.push(selection.earlierSummaryText);
      }
      const effectiveContextSummary = summaryChunks.join('\n\n');

      const lastState: CharacterState =
        session.stateHistory.length > 0
          ? OfflineStateEngine.hydrateState(session.stateHistory[session.stateHistory.length - 1].state)
          : OfflineStateEngine.createInitialState();

      // 3. Recall long-term memories, WorldBooks, life state & historical offline experiences
      const archiveConfig = await getAiArchiveConfig(character.id).catch(() => ({ searchMode: 'auto' as const }));
      const searchMode = archiveConfig.searchMode || 'auto';
      const isShort =
        userText.trim().length <= 6 &&
        /^(在吗|早|早安|晚安|嗯|嗯嗯|好的|好|哈哈|哈哈哈|收到|对|是的|拜拜|再见|666|okk?|hi|hello|hey|yo|\?|？|！|!|我困了|好累|刚吃完|在干嘛|笑死|好吧|然后呢|去哪|好呀)$/i.test(
          userText.trim()
        );

      const hasHistoryIntent =
        searchMode !== 'off' &&
        !isShort &&
        /[？\?怎么什么哪谁为何几干嘛回忆记得以前上次曾经那个之前当初过去那时那天那次想念那会儿记不记聊过说过提过]/i.test(
          userText
        );
      const hasVaultIntent =
        !isShort &&
        /(设定|背景|档案|记忆库|资料|文件|世界观|剧本|人设|故事|秘密|能力|职业|小说|大纲|自述|身世)/i.test(
          userText
        );

      const worldBooks = loadWorldBooks();
      const globalPerms = loadPermissions();
      const worldBookEval = evaluateWorldBookContext(character.id, userText, worldBooks, globalPerms);

      // Always include top recent saved offline experiences on first turn or history recall
      const shouldLoadPastOffline = isFirstTurn || hasHistoryIntent;

      const [{ recalledText }, vaultRecall, pastOfflineMemories] = await Promise.all([
        hasHistoryIntent
          ? recallCharacterMemories(character.id, userText, 3).catch(() => ({ recalledText: '' }))
          : Promise.resolve({ recalledText: '' }),
        hasVaultIntent
          ? searchAiMemoryChunks(character.id, userText, 3).catch(() => ({ recalledText: '' }))
          : Promise.resolve({ recalledText: '' }),
        shouldLoadPastOffline
          ? OfflineMemoryBridge.searchSavedOfflineSessions(character.id, userText, 2).catch(() => '')
          : Promise.resolve(''),
      ]);

      const lifeStateContext = getLifeContextForPrompt(character.id);
      const timezone = session.timezone || getDeviceTimeZone();
      const currentTime = formatOfflinePromptDateTime(Date.now());
      const startedAtStr = formatOfflinePromptDateTime(session.startedAt);

      // 4. Ensure embedded Android Node backend is ready BEFORE fetching /api/gemini/offline-chat
      await ensureBackendReady('offline:chat');

      const promptPayload = {
        requestId,
        sessionId: session.id,
        eventId: session.eventId,
        character,
        userProfile,
        sceneSnapshot: session.sceneSnapshot,
        awarenessMode,
        isFirstTurn,
        startedAt: session.startedAt,
        startedAtStr,
        currentTime,
        timezone,
        contextSummary: effectiveContextSummary || undefined,
        contextMetrics: selection.contextMetrics,
        needsSummaryUpdate: selection.droppedOlderMessages.length > 0 && priorMessages.length % 10 === 0,
        recentMessages: formattedRecentMessages,
        recalledMemories: [recalledText, vaultRecall.recalledText, pastOfflineMemories]
          .filter(Boolean)
          .join('\n\n'),
        lifeStateContext,
        worldBookContext: worldBookEval?.promptText,
        previousState: lastState,
        userInput: userText,
        apiConfig,
      };

      const res = await apiFetch('/api/gemini/offline-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptPayload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        const rawMsg = data?.errorMessage || data?.error || data?.message || `AI 线下生成服务异常 (${res.status})`;
        const chargedNotice = data?.mayHaveBeenCharged
          ? `${rawMsg}（请求已发送至上游，可能已产生扣费，如需重发请点击手动重试）`
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

      const normalizedSegments = normalizeOfflineSegments(data.segments, data.reply, data.action);
      if (normalizedSegments.length === 0) {
        throw new Error('模型未返回有效对白或动作内容，请重试');
      }

      const fullReplyText = segmentsToPlainText(normalizedSegments);
      const primaryAction = extractPrimaryActionFromSegments(normalizedSegments);
      const finalState = OfflineStateEngine.normalizeAndSmoothState(data.state, lastState);

      // 5. Mark user message as 'sent' in place (NEVER delete or duplicate!)
      persistedUserMsg = await saveOfflineMessage({
        ...persistedUserMsg,
        status: 'sent',
        updatedAt: Date.now(),
      });

      // 6. Upsert AI message with structured segments & smoothed state
      const aiMsgTimestamp = Math.max(Date.now(), persistedUserMsg.timestamp + 1);
      const aiMsgId = `offmsg_ai_${requestId}`;
      const aiMsg = await saveOfflineMessage({
        id: aiMsgId,
        clientMessageId: aiMsgId,
        requestId,
        sessionId: session.id,
        sender: 'ai',
        text: fullReplyText,
        action: primaryAction,
        segments: normalizedSegments,
        status: 'sent',
        timestamp: aiMsgTimestamp,
        createdAt: aiMsgTimestamp,
        updatedAt: aiMsgTimestamp,
        state: finalState,
      });

      // 7. Update Session State History & optional rolling contextSummary
      const nextContextSummary =
        typeof data.contextSummaryUpdate === 'string' && data.contextSummaryUpdate.trim().length > 10
          ? data.contextSummaryUpdate.trim()
          : session.contextSummary;

      const updatedSession: OfflineSession = {
        ...session,
        awarenessMode,
        awarenessSource: 'persona',
        awarenessLocked: true,
        contextSummary: nextContextSummary,
        updatedAt: aiMsgTimestamp,
        stateHistory: [...session.stateHistory, { timestamp: aiMsgTimestamp, state: finalState }],
      };
      await saveOfflineSession(updatedSession);

      // 8. Background trigger for Life State Event extraction
      triggerLifeStateExtraction(
        [persistedUserMsg, aiMsg].map(
          (m) => ({ id: m.id, sender: m.sender, text: m.text, timestamp: m.timestamp } as any)
        ),
        character.id
      ).catch(() => {});

      return {
        userMessage: persistedUserMsg,
        aiMessage: aiMsg,
        updatedSession,
        contextWindowSize: selection.windowSize,
        extendedBeyond30: selection.extendedBeyond30,
      };
    } catch (err: any) {
      // Keep user message visible & persisted as 'failed' so user can retry idempotently
      const failedUserMsg = await saveOfflineMessage({
        ...persistedUserMsg,
        status: 'failed',
        updatedAt: Date.now(),
      });
      const wrapped: any = new Error(err?.message || '网络连接或模型响应异常，回复生成失败');
      wrapped.failedUserMessage = failedUserMsg;
      if (err?.statusCode !== undefined) wrapped.statusCode = err.statusCode;
      if (err?.mayHaveBeenCharged !== undefined) wrapped.mayHaveBeenCharged = err.mayHaveBeenCharged;
      if (err?.upstreamRequestSent !== undefined) wrapped.upstreamRequestSent = err.upstreamRequestSent;
      if (err?.protocol !== undefined) wrapped.protocol = err.protocol;
      if (err?.causeCode !== undefined) wrapped.causeCode = err.causeCode;
      if (err?.requestId !== undefined) wrapped.requestId = err.requestId;
      throw wrapped;
    }
  }

  /**
   * Regenerate a specific AI message in an active Offline Session in place.
   * Uses dynamic 30..60 context window prior to targetAiMsg and updates targetAiMsg & its state in place.
   */
  public static async regenerateAiMessage(
    session: OfflineSession,
    character: AiCharacter,
    targetAiMsg: OfflineMessage,
    userProfile: UserProfile,
    apiConfig?: ApiConfig
  ): Promise<{ updatedAiMsg: OfflineMessage; updatedSession: OfflineSession }> {
    const allMessages = await getAllSessionMessages(session.id);
    const targetIndex = allMessages.findIndex((m) => m.id === targetAiMsg.id);
    if (targetIndex === -1) {
      throw new Error('未能在本地数据库中找到需要重新生成的AI消息');
    }

    const priorMessages = allMessages.slice(0, targetIndex);
    const lastUserMsg = [...priorMessages].reverse().find((m) => m.sender === 'user' && m.status !== 'failed');
    const userInput = lastUserMsg ? lastUserMsg.text : '（静静与你相处）';

    // Exclude the immediately preceding user message from recentMessages so it is not duplicated in prompt
    const priorBeforeTrigger = lastUserMsg
      ? priorMessages.filter((m) => m.id !== lastUserMsg.id)
      : priorMessages;
    const selection = selectDynamicOfflineContextMessages(priorBeforeTrigger);
    const formattedRecentMessages = selection.selectedMessages.map((m) =>
      formatOfflineMessageForPrompt(m, userProfile?.name || '用户', character.name)
    );

    const lastStateMsg = [...priorMessages].reverse().find((m) => m.state);
    const previousState: CharacterState = OfflineStateEngine.hydrateState(
      lastStateMsg?.state || session.stateHistory[0]?.state
    );

    const archiveConfig = await getAiArchiveConfig(character.id).catch(() => ({ searchMode: 'auto' as const }));
    const searchMode = archiveConfig.searchMode || 'auto';
    const isShort =
      userInput.trim().length <= 6 &&
      /^(在吗|早|早安|晚安|嗯|嗯嗯|好的|好|哈哈|哈哈哈|收到|对|是的|拜拜|再见|666|okk?|hi|hello|hey|yo|\?|？|！|!|我困了|好累|刚吃完|在干嘛|笑死|好吧|然后呢|去哪|好呀)$/i.test(
        userInput.trim()
      );
    const hasHistoryIntent =
      searchMode !== 'off' &&
      !isShort &&
      /[？\?怎么什么哪谁为何几干嘛回忆记得以前上次曾经那个之前当初过去那时那天那次想念那会儿记不记聊过说过提过]/i.test(
        userInput
      );
    const hasVaultIntent =
      !isShort &&
      /(设定|背景|档案|记忆库|资料|文件|世界观|剧本|人设|故事|秘密|能力|职业|小说|大纲|自述|身世)/i.test(
        userInput
      );

    const worldBooks = loadWorldBooks();
    const globalPerms = loadPermissions();
    const worldBookEval = evaluateWorldBookContext(character.id, userInput, worldBooks, globalPerms);

    const [{ recalledText }, vaultRecall, pastOfflineMemories] = await Promise.all([
      hasHistoryIntent
        ? recallCharacterMemories(character.id, userInput, 3).catch(() => ({ recalledText: '' }))
        : Promise.resolve({ recalledText: '' }),
      hasVaultIntent
        ? searchAiMemoryChunks(character.id, userInput, 3).catch(() => ({ recalledText: '' }))
        : Promise.resolve({ recalledText: '' }),
      hasHistoryIntent
        ? OfflineMemoryBridge.searchSavedOfflineSessions(character.id, userInput, 2).catch(() => '')
        : Promise.resolve(''),
    ]);

    const awarenessMode =
      session.awarenessLocked && session.awarenessMode
        ? session.awarenessMode
        : detectAwarenessModeFromPersona(character).awarenessMode;
    const timezone = session.timezone || getDeviceTimeZone();
    const requestId = createUniqueId('offregen');

    await ensureBackendReady('offline:regenerate');

    const promptPayload = {
      requestId,
      sessionId: session.id,
      eventId: session.eventId,
      character,
      userProfile,
      sceneSnapshot: session.sceneSnapshot,
      awarenessMode,
      isFirstTurn: priorBeforeTrigger.filter((m) => m.sender === 'user').length === 0,
      startedAt: session.startedAt,
      startedAtStr: formatOfflinePromptDateTime(session.startedAt),
      currentTime: formatOfflinePromptDateTime(Date.now()),
      timezone,
      contextSummary:
        [session.contextSummary?.trim(), selection.earlierSummaryText]
          .filter(Boolean)
          .join('\n\n') || undefined,
      contextMetrics: selection.contextMetrics,
      recentMessages: formattedRecentMessages,
      recalledMemories: [recalledText, vaultRecall.recalledText, pastOfflineMemories]
        .filter(Boolean)
        .join('\n\n'),
      lifeStateContext: getLifeContextForPrompt(character.id),
      worldBookContext: worldBookEval?.promptText,
      previousState,
      userInput,
      apiConfig,
    };

    const res = await apiFetch('/api/gemini/offline-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptPayload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      const rawMsg = data?.errorMessage || data?.error || data?.message || '重新生成请求失败';
      const chargedNotice = data?.mayHaveBeenCharged
        ? `${rawMsg}（请求已发送至上游，可能已产生扣费，如需重发请点击手动重试）`
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

    const normalizedSegments = normalizeOfflineSegments(data.segments, data.reply, data.action);
    if (normalizedSegments.length === 0) {
      throw new Error('模型未返回有效回复内容');
    }

    const fullReplyText = segmentsToPlainText(normalizedSegments);
    const primaryAction = extractPrimaryActionFromSegments(normalizedSegments);
    const finalState = OfflineStateEngine.normalizeAndSmoothState(data.state, previousState);

    // Update targetAiMsg IN PLACE keeping the exact same id, clientMessageId & timestamp
    const updatedAiMsg = await saveOfflineMessage({
      ...targetAiMsg,
      text: fullReplyText,
      action: primaryAction,
      segments: normalizedSegments,
      state: finalState,
      status: 'sent',
      requestId,
      updatedAt: Date.now(),
    });

    // Update matching stateHistory entry in place
    let matchedState = false;
    const nextStateHistory = session.stateHistory.map((sh) => {
      if (sh.timestamp === targetAiMsg.timestamp) {
        matchedState = true;
        return { timestamp: sh.timestamp, state: finalState };
      }
      return sh;
    });
    if (!matchedState) {
      nextStateHistory.push({ timestamp: targetAiMsg.timestamp, state: finalState });
      nextStateHistory.sort((a, b) => a.timestamp - b.timestamp);
    }

    const updatedSession: OfflineSession = {
      ...session,
      updatedAt: Date.now(),
      stateHistory: nextStateHistory,
    };
    await saveOfflineSession(updatedSession);

    return { updatedAiMsg, updatedSession };
  }

  /**
   * Request AI-generated structured summary for an Offline Session.
   * NEVER fabricates a generic fallback template on error; returns summaryPending=true instead.
   */
  public static async generateSessionSummary(
    session: OfflineSession,
    character: AiCharacter,
    userProfile: UserProfile,
    apiConfig?: ApiConfig
  ): Promise<EndOfflineSessionResult> {
    const allMessages = (await getAllSessionMessages(session.id)).filter((m) => m.status !== 'failed');
    const endedAt = session.endedAt || Date.now();
    const durationMinutes = computeDurationMinutes(session.startedAt, endedAt);
    const timezone = session.timezone || getDeviceTimeZone();
    const awarenessMode =
      session.awarenessLocked && session.awarenessMode
        ? session.awarenessMode
        : detectAwarenessModeFromPersona(character).awarenessMode;

    try {
      await ensureBackendReady('offline:summary');
      const summarySelection = selectDynamicOfflineContextMessages(allMessages, 100, 100);

      const res = await apiFetch('/api/gemini/offline-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemEvent: '[OFFLINE_SESSION_ENDED]',
          eventId: session.eventId,
          awarenessMode,
          startedAt: session.startedAt,
          endedAt,
          startedAtStr: formatOfflinePromptDateTime(session.startedAt),
          endedAtStr: formatOfflinePromptDateTime(endedAt),
          durationMinutes,
          timezone,
          character,
          userProfile,
          sceneSnapshot: session.sceneSnapshot,
          contextSummary: summarySelection.earlierSummaryText || session.contextSummary || undefined,
          sessionMessages: summarySelection.selectedMessages.map((m) =>
            formatOfflineMessageForPrompt(m, userProfile?.name || '用户', character.name)
          ),
          apiConfig,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || data?.summaryPending || !data?.summary?.summary?.trim()) {
        const errMsg = data?.error || data?.message || `总结接口异常 (${res.status})`;
        const pendingSession: OfflineSession = {
          ...session,
          status: session.status === 'saved' ? 'saved' : 'ended_pending_decision',
          endedAt,
          durationMinutes,
          summaryStatus: 'summary_pending',
          summaryError: errMsg,
          updatedAt: Date.now(),
        };
        await saveOfflineSession(pendingSession);
        return {
          summary: null,
          summaryPending: true,
          error: errMsg,
          updatedSession: pendingSession,
        };
      }

      const raw = data.summary;
      const summaryResult: OfflineSessionSummary = {
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : session.sceneSnapshot.name,
        summary: String(raw.summary).trim(),
        importantEvents: Array.isArray(raw.importantEvents) ? raw.importantEvents.filter(Boolean) : [],
        keyExpressions: Array.isArray(raw.keyExpressions) ? raw.keyExpressions.filter(Boolean) : [],
        emotionChanges: Array.isArray(raw.emotionChanges) ? raw.emotionChanges.filter(Boolean) : [],
        relationshipChanges: Array.isArray(raw.relationshipChanges) ? raw.relationshipChanges.filter(Boolean) : [],
        unfinishedTopics: Array.isArray(raw.unfinishedTopics) ? raw.unfinishedTopics.filter(Boolean) : [],
        followUpWorthyTopics: Array.isArray(raw.followUpWorthyTopics)
          ? raw.followUpWorthyTopics.filter(Boolean)
          : [],
        candidateMemories: Array.isArray(raw.candidateMemories) ? raw.candidateMemories.filter(Boolean) : [],
        aiReflection: typeof raw.aiReflection === 'string' ? raw.aiReflection.trim() : '',
      };

      const readySession: OfflineSession = {
        ...session,
        status: session.status === 'saved' ? 'saved' : 'ended_pending_decision',
        endedAt,
        durationMinutes,
        summaryStatus: 'ready',
        summaryError: undefined,
        eventTitle: summaryResult.title,
        eventSummary: summaryResult.summary,
        importantEvents: summaryResult.importantEvents,
        keyExpressions: summaryResult.keyExpressions,
        emotionChanges: summaryResult.emotionChanges,
        relationshipChanges: summaryResult.relationshipChanges,
        unfinishedTopics: summaryResult.unfinishedTopics,
        followUpWorthyTopics: summaryResult.followUpWorthyTopics,
        aiReflection: summaryResult.aiReflection,
        candidateMemories: summaryResult.candidateMemories,
        updatedAt: Date.now(),
      };
      await saveOfflineSession(readySession);

      return {
        summary: summaryResult,
        summaryPending: false,
        updatedSession: readySession,
      };
    } catch (e: any) {
      const errMsg = e?.message || '网络或模型异常，经历总结生成失败';
      const pendingSession: OfflineSession = {
        ...session,
        status: session.status === 'saved' ? 'saved' : 'ended_pending_decision',
        endedAt,
        durationMinutes,
        summaryStatus: 'summary_pending',
        summaryError: errMsg,
        updatedAt: Date.now(),
      };
      await saveOfflineSession(pendingSession);
      return {
        summary: null,
        summaryPending: true,
        error: errMsg,
        updatedSession: pendingSession,
      };
    }
  }

  /**
   * End Offline Session:
   * 1. Records real endedAt & durationMinutes
   * 2. Immediately exits offline mode for this AI (recalculates proactive baseline from endedAt, NO backfill)
   * 3. Triggers [OFFLINE_SESSION_ENDED] summary generation (sets summary_pending on failure, NO fake fallback)
   */
  public static async endSession(
    session: OfflineSession,
    character: AiCharacter,
    userProfile: UserProfile,
    apiConfig?: ApiConfig
  ): Promise<EndOfflineSessionResult> {
    const endedAt = Date.now();
    const durationMinutes = computeDurationMinutes(session.startedAt, endedAt);

    // Immediately restore AI interaction mode to 'chat' and advance baseline from endedAt
    exitOfflineMode(character.id, endedAt);

    const closingSession: OfflineSession = {
      ...session,
      status: 'ended_pending_decision',
      endedAt,
      durationMinutes,
      updatedAt: endedAt,
    };
    await saveOfflineSession(closingSession);

    return OfflineSessionService.generateSessionSummary(closingSession, character, userProfile, apiConfig);
  }
}
