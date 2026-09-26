/**
 * OfflineSessionService.ts
 * Main orchestrator service for Offline Scene Mode lifecycle & AI interactions.
 */

import { AiCharacter, UserProfile, ApiConfig, AiPermissions } from '../../types';
import { apiFetch } from '../localBackend';
import {
  OfflineSession,
  OfflineMessage,
  SceneTemplate,
  saveOfflineSession,
  saveOfflineMessage,
  getOfflineSession,
  getAllSessionMessages,
} from './OfflineSessionDb';
import { OfflineStateEngine, CharacterState } from './OfflineStateEngine';
import { OfflineMemoryBridge, OfflineSessionSummary } from './OfflineMemoryBridge';
import { recallCharacterMemories } from '../chatDb';
import { searchAiMemoryChunks } from '../aiMemoryVaultDb';

export class OfflineSessionService {
  /**
   * Start a new active Offline Session for a character and scene
   */
  public static async startSession(
    character: AiCharacter,
    scene: { name: string; location: string; atmosphere: string; background: string; defaultOpening?: string },
    sceneTemplateId?: string
  ): Promise<{ session: OfflineSession; firstMessage?: OfflineMessage }> {
    const now = Date.now();
    const sessionId = `offsess_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const initialState = OfflineStateEngine.createInitialState();

    const session: OfflineSession = {
      id: sessionId,
      characterId: character.id,
      characterName: character.name,
      characterAvatar: character.avatar,
      sceneTemplateId,
      sceneSnapshot: {
        name: scene.name,
        location: scene.location,
        atmosphere: scene.atmosphere,
        background: scene.background,
        defaultOpening: scene.defaultOpening,
      },
      startedAt: now,
      status: 'active',
      stateHistory: [{ timestamp: now, state: initialState }],
      createdAt: now,
      updatedAt: now,
    };

    await saveOfflineSession(session);

    let firstMessage: OfflineMessage | undefined;
    if (scene.defaultOpening) {
      const { reply, action } = OfflineStateEngine.normalizeActionText(scene.defaultOpening);
      firstMessage = {
        id: `offmsg_${now}_init`,
        sessionId,
        sender: 'ai',
        text: reply || '（微笑静静看着你）',
        action: action || '',
        timestamp: now,
        state: initialState,
      };
      await saveOfflineMessage(firstMessage);
    }

    return { session, firstMessage };
  }

  /**
   * Send user message and trigger AI roleplay response in Offline Mode
   */
  public static async sendUserMessage(
    session: OfflineSession,
    character: AiCharacter,
    userText: string,
    userProfile: UserProfile,
    apiConfig?: ApiConfig
  ): Promise<{ aiMessage: OfflineMessage; updatedSession: OfflineSession }> {
    const now = Date.now();

    // 1. Save user message to IndexedDB
    const userMsg: OfflineMessage = {
      id: `offmsg_${now}_user`,
      sessionId: session.id,
      sender: 'user',
      text: userText,
      timestamp: now,
    };
    await saveOfflineMessage(userMsg);

    // 2. Fetch session history & current state
    const allMessages = await getAllSessionMessages(session.id);
    const recentMessagesWindow = allMessages.slice(-12);
    const lastState: CharacterState = session.stateHistory.length > 0
      ? session.stateHistory[session.stateHistory.length - 1].state
      : OfflineStateEngine.createInitialState();

    // 3. Recall character's WeChat memories & saved Offline Session memories
    const { recalledText } = await recallCharacterMemories(character.id, userText, 3).catch(() => ({ recalledText: '' }));
    const vaultRecall = await searchAiMemoryChunks(character.id, userText, 3).catch(() => ({ recalledText: '' }));
    const pastOfflineMemories = await OfflineMemoryBridge.searchSavedOfflineSessions(character.id, userText, 2).catch(() => '');

    // 4. Construct AI System Prompt & Payload
    const promptPayload = {
      character,
      userProfile,
      sceneSnapshot: session.sceneSnapshot,
      recentMessages: recentMessagesWindow,
      recalledMemories: [recalledText, vaultRecall.recalledText, pastOfflineMemories].filter(Boolean).join('\n\n'),
      previousState: lastState,
      userInput: userText,
      currentTime: new Date().toLocaleString('zh-CN'),
      apiConfig,
    };

    let aiRawResponse = '';
    try {
      const res = await apiFetch('/api/gemini/offline-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptPayload),
      });
      const data = await res.json();
      if (data.success && data.reply) {
        aiRawResponse = typeof data.reply === 'string' ? data.reply : JSON.stringify(data.reply);
      } else if (data.data) {
        aiRawResponse = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
      }
    } catch (e) {
      console.warn('Offline chat API error, falling back to local engine:', e);
    }

    // Parse AI Structured Output
    let parsedReply = '';
    let parsedAction = '';
    let parsedStateRaw: any = null;

    if (aiRawResponse) {
      try {
        const cleanJson = aiRawResponse.replace(/```json|```/g, '').trim();
        const jsonObj = JSON.parse(cleanJson);
        parsedReply = jsonObj.reply || '';
        parsedAction = jsonObj.action || '';
        parsedStateRaw = jsonObj.state || null;
      } catch {
        // Plain text fallback
        parsedReply = aiRawResponse;
      }
    }

    // Normalization & Fallbacks
    if (!parsedReply && !parsedAction) {
      parsedReply = '（静静看着你，眼中泛起温柔的光）嗯... 我一直在这里听着呢。';
    }

    const normalized = OfflineStateEngine.normalizeActionText(`${parsedReply} ${parsedAction}`);
    const finalState = OfflineStateEngine.normalizeAndSmoothState(parsedStateRaw, lastState);

    // 5. Create AI OfflineMessage & Save
    const aiMsgTimestamp = Date.now();
    const aiMsg: OfflineMessage = {
      id: `offmsg_${aiMsgTimestamp}_ai`,
      sessionId: session.id,
      sender: 'ai',
      text: normalized.reply || '……',
      action: normalized.action || '',
      timestamp: aiMsgTimestamp,
      state: finalState,
    };
    await saveOfflineMessage(aiMsg);

    // 6. Update Session State History & DB
    const updatedSession: OfflineSession = {
      ...session,
      updatedAt: aiMsgTimestamp,
      stateHistory: [...session.stateHistory, { timestamp: aiMsgTimestamp, state: finalState }],
    };
    await saveOfflineSession(updatedSession);

    return { aiMessage: aiMsg, updatedSession };
  }

  /**
   * End Offline Session & trigger system event [OFFLINE_SESSION_ENDED] to generate summary & candidate memories
   */
  public static async endSession(
    session: OfflineSession,
    character: AiCharacter,
    userProfile: UserProfile,
    apiConfig?: ApiConfig
  ): Promise<{ summary: OfflineSessionSummary; updatedSession: OfflineSession }> {
    const allMessages = await getAllSessionMessages(session.id);

    let summaryResult: OfflineSessionSummary = {
      title: `${session.sceneSnapshot.name} 场景经历`,
      summary: `与 ${character.name} 在【${session.sceneSnapshot.name}】进行了一段令人难忘的线下真实互动。`,
      importantEvents: ['两人在特定的场景氛围下共享了心事与陪伴。'],
      relationshipChanges: ['彼此的了解与亲密度进一步加深。'],
      candidateMemories: [
        `用户与 ${character.name} 在 ${new Date(session.startedAt).toLocaleDateString('zh-CN')} 进行了『${session.sceneSnapshot.name}』共同经历。`,
      ],
      aiReflection: `${character.name} 会一直珍惜这次在 ${session.sceneSnapshot.location} 度过的独处时光。`,
    };

    try {
      const res = await apiFetch('/api/gemini/offline-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemEvent: '[OFFLINE_SESSION_ENDED]',
          character,
          userProfile,
          sceneSnapshot: session.sceneSnapshot,
          sessionMessages: allMessages,
          stateHistory: session.stateHistory,
          apiConfig,
        }),
      });

      const data = await res.json();
      if (data.success && data.summary) {
        summaryResult = {
          title: data.summary.title || summaryResult.title,
          summary: data.summary.summary || summaryResult.summary,
          importantEvents: Array.isArray(data.summary.importantEvents) ? data.summary.importantEvents : summaryResult.importantEvents,
          relationshipChanges: Array.isArray(data.summary.relationshipChanges) ? data.summary.relationshipChanges : summaryResult.relationshipChanges,
          candidateMemories: Array.isArray(data.summary.candidateMemories) ? data.summary.candidateMemories : summaryResult.candidateMemories,
          aiReflection: data.summary.aiReflection || summaryResult.aiReflection,
        };
      }
    } catch (e) {
      console.warn('Failed to call offline summary API, using local summary template:', e);
    }

    const updatedSession: OfflineSession = {
      ...session,
      status: 'ended_pending_decision',
      endedAt: Date.now(),
      eventSummary: summaryResult.summary,
      importantEvents: summaryResult.importantEvents,
      relationshipChanges: summaryResult.relationshipChanges,
      aiReflection: summaryResult.aiReflection,
      candidateMemories: summaryResult.candidateMemories,
      updatedAt: Date.now(),
    };

    await saveOfflineSession(updatedSession);

    return { summary: summaryResult, updatedSession };
  }
}
