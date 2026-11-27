import { ChatMessage, AiCharacter } from '../../types';
import { loadCharacters } from '../storage';
import { updateCharacterByIdIfExists } from '../characterPersistence';
import { hasChatMessage, saveChatMessage } from '../chatDb';
import { sanitizeReplyText } from '../thinkCleaner';
import { splitMessageIntoSentenceBubbles, calculateTypingDelay, getMultiBubbleConfig } from '../wechatMultiBubble';
import { nativeNotificationService } from '../NativeNotificationService';
import { looksLikeRawJsonLeak } from '../proactive/proactiveSchema';
import { isMessageIdExecuted, markMessageIdExecuted } from '../proactive/proactiveStore';

export interface ProactiveMessageResult {
  message: ChatMessage;
  character: AiCharacter;
}

export interface ProactiveBridgeOptions {
  notifySystem?: boolean;
  triggerSource?: string;
  triggerType?: string;
  eventId?: string;
  sourceSystem?: 'proactiveEngine' | 'agent' | 'androidBackgroundWorker';
  priority?: 'high' | 'medium' | 'low';
  episodeId?: string;
  stepId?: string;
  intent?: string;
  generatedAt?: number;
  explicitMessages?: string[];
  deterministicMessageIds?: string[];
  skipTypingDelay?: boolean;
  thinkingProcess?: string;
  reasoningAvailable?: boolean;
  reasoningSource?: import('../../types').ReasoningSource;
}

const SINGLE_BUBBLE_EVENT_TRIGGERS = new Set([
  'weather_alert',
  'device_life_event',
  'app_usage',
  'APP_USAGE_TICK',
  'important_event',
]);

class ChatMessageBridge {
  private static instance: ChatMessageBridge;

  private constructor() {}

  public static getInstance(): ChatMessageBridge {
    if (!ChatMessageBridge.instance) {
      ChatMessageBridge.instance = new ChatMessageBridge();
    }
    return ChatMessageBridge.instance;
  }

  /**
   * Persist an AI-initiated proactive message into the unified WeChat message store (Single Bubble)
   */
  public async postProactiveMessage(
    aiId: string,
    text: string,
    contextSummary: string,
    options?: ProactiveBridgeOptions
  ): Promise<ProactiveMessageResult> {
    const multiResults = await this.postProactiveMultiBubbleMessage(aiId, text, contextSummary, options);
    return multiResults[0];
  }

  /**
   * Persist AI proactive messages with:
   * - Support for explicit structured messages[] array or multi-bubble splitting
   * - Deterministic messageId idempotency (checks executedMessageIds + ChatDB before writing)
   * - Strict persist-first -> confirm saved -> post system notification ordering
   * - Raw JSON leak guard
   */
  public async postProactiveMultiBubbleMessage(
    aiId: string,
    rawText: string,
    contextSummary: string,
    options?: ProactiveBridgeOptions
  ): Promise<ProactiveMessageResult[]> {
    const characters = loadCharacters();
    const character = characters.find((c) => c.id === aiId) || characters[0];
    if (!character) return [];

    const triggerType = options?.triggerType || options?.triggerSource || 'proactive';
    const isSingleBubbleEvent = SINGLE_BUBBLE_EVENT_TRIGGERS.has(triggerType);
    const multiBubbleConfig = getMultiBubbleConfig();

    let bubbles: string[] = [];
    if (Array.isArray(options?.explicitMessages) && options.explicitMessages.length > 0) {
      bubbles = options.explicitMessages
        .map((m) => sanitizeReplyText(m || '').trim())
        .filter((s) => s.length > 0 && !looksLikeRawJsonLeak(s))
        .slice(0, 3);
    } else {
      const cleanRawText = sanitizeReplyText(rawText || '').trim();
      if (!cleanRawText || looksLikeRawJsonLeak(cleanRawText)) {
        return [];
      }
      const shouldSplit = multiBubbleConfig.enabled && !isSingleBubbleEvent;
      const rawBubbles = shouldSplit
        ? splitMessageIntoSentenceBubbles(cleanRawText, {
            maxBubbles: Math.min(3, multiBubbleConfig.maxBubbles || 3),
          })
        : [cleanRawText];

      bubbles = rawBubbles
        .map((b) => sanitizeReplyText(b).trim())
        .filter((s) => s.length > 0 && !looksLikeRawJsonLeak(s));
    }

    if (bubbles.length === 0) {
      return [];
    }

    const results: ProactiveMessageResult[] = [];
    const baseTimestamp = Date.now();
    const shouldNotifySystem = options?.notifySystem ?? false;
    const stepTag = options?.stepId || 'init';
    const turnId = options?.episodeId
      ? `turn_proactive_${options.episodeId}_${stepTag}`
      : `turn_proactive_${character.id}_${baseTimestamp}_${Math.random().toString(36).slice(2, 6)}`;
    const generatedAt = options?.generatedAt || baseTimestamp;

    for (let i = 0; i < bubbles.length; i++) {
      const bubbleText = bubbles[i];

      const messageId =
        options?.deterministicMessageIds?.[i] ||
        (options?.episodeId
          ? `msg_proactive_${options.episodeId}_${stepTag}_${i}`
          : `msg_proactive_${baseTimestamp}_${i}_${Math.random().toString(36).slice(2, 6)}`);

      // Idempotency guard: skip if already executed or already exists in ChatDB
      if (isMessageIdExecuted(messageId)) {
        continue;
      }
      const alreadyInDb = await hasChatMessage(messageId).catch(() => false);
      if (alreadyInDb) {
        markMessageIdExecuted(messageId);
        continue;
      }

      if (i > 0 && !options?.skipTypingDelay) {
        const delay = calculateTypingDelay(bubbleText, multiBubbleConfig.speed);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const rawThinking =
        typeof options?.thinkingProcess === 'string' ? options.thinkingProcess.trim() : '';
      const hasRealThinking = rawThinking.length > 0;
      const realReasoningSource = hasRealThinking
        ? options?.reasoningSource || 'think_tag'
        : 'none';

      const newMessage: ChatMessage = {
        id: messageId,
        characterId: character.id,
        sender: 'ai',
        text: bubbleText.trim(),
        timestamp: baseTimestamp + i * 200,
        turnId,
        turnBubbleIndex: i,
        turnTotalBubbles: bubbles.length,
        isProactive: true,
        proactiveMeta: {
          episodeId: options?.episodeId,
          stepId: options?.stepId,
          triggerType,
          eventId: options?.eventId,
          sourceSystem: options?.sourceSystem || 'proactiveEngine',
          priority: options?.priority,
          intent: options?.intent,
          generatedAt,
          bubbleIndex: i,
          totalBubbles: bubbles.length,
          repliedByUser: false,
        },
        thinkingProcess: i === 0 && hasRealThinking ? rawThinking : undefined,
        reasoningAvailable: hasRealThinking,
        reasoningSource: realReasoningSource,
        reasoningStatus: hasRealThinking ? 'available' : 'empty',
      };

      // 1. Save to Messages store FIRST (Authoritative IndexedDB) and confirm write succeeded
      let persisted = false;
      try {
        await saveChatMessage(newMessage);
        persisted = true;
        markMessageIdExecuted(messageId);
      } catch (e) {
        console.error('[ChatMessageBridge] Failed to save to ChatDB IndexedDB:', e);
      }

      if (!persisted) {
        continue;
      }

      // 2. Post system notification ONLY AFTER confirmed persisted, with identical text
      if (shouldNotifySystem) {
        try {
          const notifRes = await nativeNotificationService.notifyAiMessage(character, newMessage.text, {
            messageId: newMessage.id,
            bubbleIndex: i,
            timestamp: newMessage.timestamp,
            triggerSource: triggerType,
          });
          if (!notifRes.success && notifRes.code !== 'SKIPPED_APP_FOREGROUND' && notifRes.code !== 'NOT_NATIVE_ANDROID') {
            console.warn(
              `[ChatMessageBridge] Notification failed for proactive msg ${newMessage.id} (aiId=${character.id}, code=${notifRes.code})`
            );
          }
        } catch (err) {
          console.warn('[ChatMessageBridge] Unexpected error calling nativeNotificationService:', err);
        }
      }

      results.push({ message: newMessage, character });
    }

    if (results.length === 0) {
      return [];
    }

    // 3. Increment unread badge for the character atomically by ID (no stale snapshot overwrite)
    await updateCharacterByIdIfExists(character.id, (c) => ({
      ...c,
      unreadAiCount: (c.unreadAiCount || 0) + results.length,
    })).catch((err) => {
      console.warn('[ChatMessageBridge] Failed to update unreadAiCount:', err);
    });

    // 4. Emit custom events so UI reflects new messages immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ai_proactive_message_received', {
          detail: {
            messages: results.map((r) => r.message),
            message: results[results.length - 1].message,
            character,
            episodeId: options?.episodeId,
          },
        })
      );
      window.dispatchEvent(new Event('storage'));
    }

    return results;
  }
}

export const chatMessageBridge = ChatMessageBridge.getInstance();
