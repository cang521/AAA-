import { ChatMessage, AiCharacter } from '../../types';
import { loadCharacters, saveCharacters } from '../storage';
import { saveChatMessage } from '../chatDb';
import { sanitizeReplyText } from '../thinkCleaner';
import { splitMessageIntoSentenceBubbles, calculateTypingDelay, getMultiBubbleConfig } from '../wechatMultiBubble';
import { nativeNotificationService } from '../NativeNotificationService';

export interface ProactiveMessageResult {
  message: ChatMessage;
  character: AiCharacter;
}

export interface ProactiveBridgeOptions {
  notifySystem?: boolean;
  triggerSource?: string;
  triggerType?: string;
  eventId?: string;
  sourceSystem?: 'proactiveEngine' | 'agent';
  priority?: 'high' | 'medium' | 'low';
  episodeId?: string;
  intent?: string;
  generatedAt?: number;
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
   * Persist AI proactive messages with support for multi-bubble reply splitting,
   * unified turnId grouping, and complete proactiveMeta persistence.
   */
  public async postProactiveMultiBubbleMessage(
    aiId: string,
    rawText: string,
    contextSummary: string,
    options?: ProactiveBridgeOptions
  ): Promise<ProactiveMessageResult[]> {
    const characters = loadCharacters();
    const character = characters.find((c) => c.id === aiId) || characters[0];

    const cleanRawText = sanitizeReplyText(rawText || '');
    const triggerType = options?.triggerType || options?.triggerSource || 'proactive';
    const isSingleBubbleEvent = SINGLE_BUBBLE_EVENT_TRIGGERS.has(triggerType);

    const multiBubbleConfig = getMultiBubbleConfig();
    const shouldSplit = multiBubbleConfig.enabled && !isSingleBubbleEvent;
    const rawBubbles = shouldSplit
      ? splitMessageIntoSentenceBubbles(cleanRawText, {
          maxBubbles: Math.min(3, multiBubbleConfig.maxBubbles || 3),
        })
      : [cleanRawText];

    const bubbles = rawBubbles.map((b) => sanitizeReplyText(b)).filter((s) => s.trim().length > 0);
    if (bubbles.length === 0) {
      bubbles.push(cleanRawText || '嗨，最近怎么样？');
    }

    const results: ProactiveMessageResult[] = [];
    const baseTimestamp = Date.now();
    const shouldNotifySystem = options?.notifySystem ?? false;
    const turnId = `turn_proactive_${character.id}_${baseTimestamp}_${Math.random().toString(36).slice(2, 6)}`;
    const generatedAt = options?.generatedAt || baseTimestamp;

    for (let i = 0; i < bubbles.length; i++) {
      const bubbleText = bubbles[i];
      if (i > 0) {
        const delay = calculateTypingDelay(bubbleText, multiBubbleConfig.speed);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const messageId = 'msg_proactive_' + baseTimestamp + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
      const newMessage: ChatMessage = {
        id: messageId,
        characterId: character.id,
        sender: 'ai',
        text: bubbleText.trim(),
        timestamp: baseTimestamp + i * 200, // slight sequential timestamp offset
        turnId,
        turnBubbleIndex: i,
        turnTotalBubbles: bubbles.length,
        isProactive: true,
        proactiveMeta: {
          episodeId: options?.episodeId,
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
        thinkingProcess:
          i === 0
            ? `【AI主动消息决策链】\n• 会话ID：${options?.episodeId || 'standalone'}\n• 触发类型：${triggerType}\n• 意图：${options?.intent || '主动关怀'}\n• 触发上下文：${contextSummary}\n• 输出气泡数：${bubbles.length} 条`
            : `${contextSummary}\n\n[主动连发第 ${i + 1}/${bubbles.length} 条气泡]`,
      };

      // 1. Save to Messages store (Authoritative IndexedDB)
      try {
        await saveChatMessage(newMessage);
      } catch (e) {
        console.error('[ChatMessageBridge] Failed to save to ChatDB IndexedDB:', e);
      }

      // 2. Post system notification per bubble when permitted and app is in background
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

    // 3. Increment unread badge for the character by total bubbles count
    const updatedCharacters = characters.map((c) => {
      if (c.id === character.id) {
        return {
          ...c,
          unreadAiCount: (c.unreadAiCount || 0) + bubbles.length,
        };
      }
      return c;
    });
    saveCharacters(updatedCharacters);

    // 4. Emit custom events
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
