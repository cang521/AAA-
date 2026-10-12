import { ChatMessage, AiCharacter } from '../../types';
import { loadMessages, saveMessages, loadCharacters, saveCharacters } from '../storage';
import { saveChatMessage } from '../chatDb';
import { sanitizeReplyText } from '../thinkCleaner';
import { splitMessageIntoSentenceBubbles, calculateTypingDelay, getMultiBubbleConfig } from '../wechatMultiBubble';
import { nativeNotificationService } from '../NativeNotificationService';

export interface ProactiveMessageResult {
  message: ChatMessage;
  character: AiCharacter;
}

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
    contextSummary: string
  ): Promise<ProactiveMessageResult> {
    const multiResults = await this.postProactiveMultiBubbleMessage(aiId, text, contextSummary);
    return multiResults[0];
  }

  /**
   * Persist AI proactive messages with support for multi-bubble reply splitting and natural delays
   */
  public async postProactiveMultiBubbleMessage(
    aiId: string,
    rawText: string,
    contextSummary: string
  ): Promise<ProactiveMessageResult[]> {
    const characters = loadCharacters();
    const character = characters.find((c) => c.id === aiId) || characters[0];

    const cleanRawText = sanitizeReplyText(rawText || '');
    const multiBubbleConfig = getMultiBubbleConfig();
    const shouldSplit = multiBubbleConfig.enabled;
    const rawBubbles = shouldSplit
      ? splitMessageIntoSentenceBubbles(cleanRawText, { maxBubbles: multiBubbleConfig.maxBubbles })
      : [cleanRawText];

    const bubbles = rawBubbles.map((b) => sanitizeReplyText(b)).filter((s) => s.trim().length > 0);
    if (bubbles.length === 0) {
      bubbles.push(cleanRawText || '嗨，想你啦！');
    }

    const results: ProactiveMessageResult[] = [];
    const baseTimestamp = Date.now();

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
        thinkingProcess: i === 0 ? `【AI主动手机代理决策链】\n• 触发上下文：${contextSummary}\n• 决策判定：四层权限全链路检测通过 (系统能力/AI独立权限/场景控制)\n• 目标动作：向用户发送主动关怀消息，生成 ${bubbles.length} 条连贯气泡。` : undefined,
      };

      // 1. Save to Messages store
      const existingMessages = loadMessages();
      const updatedMessages = [...existingMessages, newMessage];
      saveMessages(updatedMessages);

      try {
        await saveChatMessage(newMessage);
      } catch (e) {
        console.warn('[ChatMessageBridge] Failed to save to ChatDB IndexedDB:', e);
      }

      results.push({ message: newMessage, character });
    }

    // 2. Increment unread badge for the character by total bubbles count
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

    // 3. Emit custom events and system notification (using last bubble text preview for status bar)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ai_proactive_message_received', {
          detail: {
            messages: results.map((r) => r.message),
            message: results[results.length - 1].message,
            character,
          },
        })
      );
      window.dispatchEvent(new Event('storage'));
    }

    return results;
  }
}

export const chatMessageBridge = ChatMessageBridge.getInstance();
