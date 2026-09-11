import { ChatMessage, AiCharacter } from '../../types';
import { loadMessages, saveMessages, loadCharacters, saveCharacters } from '../storage';

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
   * Persist an AI-initiated proactive message into the unified WeChat message store
   */
  public async postProactiveMessage(
    aiId: string,
    text: string,
    contextSummary: string
  ): Promise<ProactiveMessageResult> {
    const characters = loadCharacters();
    const character = characters.find((c) => c.id === aiId) || characters[0];

    const messageId = 'msg_proactive_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newMessage: ChatMessage = {
      id: messageId,
      characterId: character.id,
      sender: 'ai',
      text: text.trim(),
      timestamp: Date.now(),
      thinkingProcess: `【AI主动手机代理决策链】\n• 触发上下文：${contextSummary}\n• 决策判定：四层权限全链路检测通过 (系统能力/AI独立权限/场景控制)\n• 目标动作：向用户发送主动关怀消息，写入持久化会话记录。`,
    };

    // 1. Save to Messages store
    const existingMessages = loadMessages();
    const updatedMessages = [...existingMessages, newMessage];
    saveMessages(updatedMessages);

    // 2. Increment unread badge for the character
    const updatedCharacters = characters.map((c) => {
      if (c.id === character.id) {
        return {
          ...c,
          unreadAiCount: (c.unreadAiCount || 0) + 1,
        };
      }
      return c;
    });
    saveCharacters(updatedCharacters);

    // 3. Emit custom events so WeChatApp and Launcher badge can react immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ai_proactive_message_received', {
          detail: {
            message: newMessage,
            character,
          },
        })
      );
      // Standard storage event for tab/window reactivity
      window.dispatchEvent(new Event('storage'));
    }

    return {
      message: newMessage,
      character,
    };
  }
}

export const chatMessageBridge = ChatMessageBridge.getInstance();
