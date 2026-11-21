/**
 * OfflineMemoryBridge.ts
 * Integrates saved Offline Sessions with:
 * 1. AI Long-Term Memory (`character.memories` + `aiMemoryVaultDb`)
 * 2. WeChat Private Chat Unified Timeline (idempotent `offline_session_event` system card)
 *
 * Strict Safety Rules:
 * - NEVER commits generic fallback/template text when summaryStatus === 'summary_pending'.
 * - NEVER copies raw intimate state numbers verbatim into long-term memory.
 * - Respects character's session `awarenessMode` (immersive_character never writes AI/software wording).
 */

import { AiCharacter, ChatMessage } from '../../types';
import { updateCharacterByIdIfExists } from '../characterPersistence';
import { saveAiMemoryChunk, deleteAiMemoryChunk, getAiMemoryChunks } from '../aiMemoryVaultDb';
import { hasChatMessage, saveChatMessage } from '../chatDb';
import { OfflineSession, saveOfflineSession, getSavedSessionsForCharacter } from './OfflineSessionDb';
import {
  computeDurationMinutes,
  formatOfflineFullDateTime,
  formatOfflineDuration,
  formatOfflineDateCN,
} from './offlineTimeFormat';

export interface OfflineSessionSummary {
  title: string;
  summary: string;
  importantEvents: string[];
  keyExpressions?: string[];
  emotionChanges?: string[];
  relationshipChanges: string[];
  unfinishedTopics?: string[];
  followUpWorthyTopics?: string[];
  candidateMemories: string[];
  aiReflection: string;
}

export function buildWeChatOfflineEventMessageId(eventId: string): string {
  return `msg_offline_event_${eventId}`;
}

export class OfflineMemoryBridge {
  /**
   * Commit a completed OfflineSession with a verified AI-generated summary to Long-Term Memory
   * AND idempotently insert ONE timeline event card into WeChat private chat.
   */
  public static async commitSessionToLongTermMemory(
    session: OfflineSession,
    summary: OfflineSessionSummary,
    character: AiCharacter,
    onUpdateCharacters?: (chars: AiCharacter[]) => void
  ): Promise<{ updatedSession: OfflineSession; timelineMessage?: ChatMessage }> {
    if (!summary || !summary.summary || !summary.summary.trim()) {
      throw new Error('经历总结尚未成功生成，无法写入长期记忆，请先重试生成总结。');
    }
    if (session.summaryStatus === 'summary_pending') {
      throw new Error('当前总结处于待重生成状态（summary_pending），已拦截写入长期记忆。');
    }

    const now = Date.now();
    const endedAt = session.endedAt || now;
    const durationMinutes =
      typeof session.durationMinutes === 'number' && session.durationMinutes > 0
        ? session.durationMinutes
        : computeDurationMinutes(session.startedAt, endedAt);
    const eventId = session.eventId || `offline_evt_${session.id}`;
    const wechatEventMessageId = buildWeChatOfflineEventMessageId(eventId);

    const updatedSession: OfflineSession = {
      ...session,
      eventId,
      status: 'saved',
      summaryStatus: 'ready',
      summaryError: undefined,
      eventTitle: summary.title || session.sceneSnapshot.name,
      eventSummary: summary.summary.trim(),
      importantEvents: Array.isArray(summary.importantEvents) ? summary.importantEvents : [],
      keyExpressions: Array.isArray(summary.keyExpressions) ? summary.keyExpressions : [],
      emotionChanges: Array.isArray(summary.emotionChanges) ? summary.emotionChanges : [],
      relationshipChanges: Array.isArray(summary.relationshipChanges) ? summary.relationshipChanges : [],
      unfinishedTopics: Array.isArray(summary.unfinishedTopics) ? summary.unfinishedTopics : [],
      followUpWorthyTopics: Array.isArray(summary.followUpWorthyTopics) ? summary.followUpWorthyTopics : [],
      aiReflection: summary.aiReflection || '',
      candidateMemories: Array.isArray(summary.candidateMemories) ? summary.candidateMemories : [],
      endedAt,
      durationMinutes,
      wechatEventMessageId,
      updatedAt: now,
    };

    // 1. Save session record to OfflineSessionDb
    await saveOfflineSession(updatedSession);

    // 2. Append candidate memories into character.memories list (deduplicated & atomic)
    if (updatedSession.candidateMemories && updatedSession.candidateMemories.length > 0) {
      const nextChars = await updateCharacterByIdIfExists(character.id, (latestChar) => {
        const existingMemories = new Set((latestChar.memories || []).map((m) => m.trim()));
        const nextList = [...(latestChar.memories || [])];
        let added = false;

        for (const mem of updatedSession.candidateMemories || []) {
          const trimmed = (mem || '').trim();
          if (trimmed && !existingMemories.has(trimmed)) {
            existingMemories.add(trimmed);
            nextList.push(trimmed);
            added = true;
          }
        }

        if (!added) return null;
        return {
          ...latestChar,
          memories: nextList,
        };
      });
      if (nextChars && onUpdateCharacters) {
        onUpdateCharacters(nextChars);
      }
    }

    // 3. Inject structured summary file into AI Memory Vault DB (respects awarenessMode, no raw intimate numbers)
    const startFull = formatOfflineFullDateTime(session.startedAt);
    const endFull = formatOfflineFullDateTime(endedAt);
    const durationLabel = formatOfflineDuration(durationMinutes, session.startedAt, endedAt);
    const isSelfAware = session.awarenessMode === 'self_aware_ai';

    const memoryFileName = `[线下经历] ${session.sceneSnapshot.name} (${formatOfflineDateCN(session.startedAt)}_${eventId.slice(-6)}).txt`;
    const headerTitle = isSelfAware ? '【线下沉浸相处记录】' : '【共同见面与相处经历】';

    const sections: string[] = [
      headerTitle,
      `标题: ${updatedSession.eventTitle}`,
      `场景: ${session.sceneSnapshot.name}（地点：${session.sceneSnapshot.location}）`,
      `时间: ${startFull} 开始 — ${endFull} 结束（共持续 ${durationLabel}）`,
      `经过摘要: ${updatedSession.eventSummary}`,
    ];
    if (updatedSession.importantEvents && updatedSession.importantEvents.length > 0) {
      sections.push(`重要事件:\n${updatedSession.importantEvents.map((e) => `- ${e}`).join('\n')}`);
    }
    if (updatedSession.keyExpressions && updatedSession.keyExpressions.length > 0) {
      sections.push(`关键表达与话语:\n${updatedSession.keyExpressions.map((e) => `- ${e}`).join('\n')}`);
    }
    if (updatedSession.emotionChanges && updatedSession.emotionChanges.length > 0) {
      sections.push(`情绪变化: ${updatedSession.emotionChanges.join('；')}`);
    }
    if (updatedSession.relationshipChanges && updatedSession.relationshipChanges.length > 0) {
      sections.push(`关系变化: ${updatedSession.relationshipChanges.join('；')}`);
    }
    if (updatedSession.unfinishedTopics && updatedSession.unfinishedTopics.length > 0) {
      sections.push(`未完话题与约定:\n${updatedSession.unfinishedTopics.map((e) => `- ${e}`).join('\n')}`);
    }
    if (updatedSession.followUpWorthyTopics && updatedSession.followUpWorthyTopics.length > 0) {
      sections.push(`后续微信聊天可自然提及:\n${updatedSession.followUpWorthyTopics.map((e) => `- ${e}`).join('\n')}`);
    }
    if (updatedSession.candidateMemories && updatedSession.candidateMemories.length > 0) {
      sections.push(`核心记忆要点:\n${updatedSession.candidateMemories.map((m) => `- ${m}`).join('\n')}`);
    }
    if (updatedSession.aiReflection) {
      sections.push(`当时感受与回忆: ${updatedSession.aiReflection}`);
    }

    try {
      await saveAiMemoryChunk(character.id, memoryFileName, sections.join('\n'));
    } catch (e) {
      console.warn('[OfflineMemoryBridge] Failed to save offline memory chunk to vault:', e);
    }

    // 4. Idempotently insert ONE WeChat Private Chat Timeline Event Card (keyed by eventId)
    let timelineMessage: ChatMessage | undefined;
    try {
      const alreadyExists = await hasChatMessage(wechatEventMessageId).catch(() => false);
      if (!alreadyExists) {
        timelineMessage = {
          id: wechatEventMessageId,
          characterId: character.id,
          sender: 'ai',
          isSystemEvent: true,
          type: 'offline_session_event',
          text: `【线下经历】你和${character.name}在「${session.sceneSnapshot.name}」度过了一段时间（${startFull}—${endFull}，共${durationLabel}）。摘要：${updatedSession.eventSummary}`,
          timestamp: endedAt,
          offlineEventData: {
            eventId,
            sessionId: session.id,
            characterId: character.id,
            characterName: character.name,
            title: updatedSession.eventTitle || session.sceneSnapshot.name,
            sceneName: session.sceneSnapshot.name,
            location: session.sceneSnapshot.location,
            summary: updatedSession.eventSummary || '',
            startedAt: session.startedAt,
            endedAt,
            durationMinutes,
            timezone: session.timezone,
            clickable: true,
          },
        };
        await saveChatMessage(timelineMessage);
      }
    } catch (e) {
      console.warn('[OfflineMemoryBridge] Failed to insert WeChat timeline event card:', e);
    }

    return { updatedSession, timelineMessage };
  }

  /**
   * Remove a saved session from AI Long-Term Memory (Called when user explicitly deletes history with memory removal)
   */
  public static async removeSessionFromLongTermMemory(
    session: OfflineSession,
    character: AiCharacter,
    onUpdateCharacters?: (chars: AiCharacter[]) => void
  ): Promise<void> {
    if (session.candidateMemories && session.candidateMemories.length > 0) {
      const candidates = new Set(session.candidateMemories.map((m) => m.trim()));
      const nextChars = await updateCharacterByIdIfExists(character.id, (latestChar) => {
        const prevMems = latestChar.memories || [];
        const updatedMemories = prevMems.filter((m) => !candidates.has(m.trim()));
        if (updatedMemories.length === prevMems.length) return null;
        return {
          ...latestChar,
          memories: updatedMemories,
        };
      });
      if (nextChars && onUpdateCharacters) {
        onUpdateCharacters(nextChars);
      }
    }

    const eventSuffix = (session.eventId || '').slice(-6);
    try {
      const vaultChunks = await getAiMemoryChunks(character.id);
      const matched = vaultChunks.find(
        (c) =>
          (eventSuffix && c.fileName.includes(eventSuffix)) ||
          (c.fileName.startsWith('[线下经历]') && c.fileName.includes(session.sceneSnapshot.name))
      );
      if (matched) {
        await deleteAiMemoryChunk(matched.id);
      }
    } catch (e) {
      console.warn('[OfflineMemoryBridge] Failed to delete offline memory chunk from vault:', e);
    }
  }

  /**
   * Relevance search across saved Offline Sessions for insertion into normal WeChat chat or future Offline Mode context
   */
  public static async searchSavedOfflineSessions(
    characterId: string,
    queryText: string,
    limit: number = 3
  ): Promise<string> {
    const savedSessions = await getSavedSessionsForCharacter(characterId);
    if (savedSessions.length === 0) return '';

    const keywords = (queryText || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 0);

    const scored = savedSessions.map((s) => {
      let score = 0;
      const haystack = `${s.sceneSnapshot.name} ${s.sceneSnapshot.location} ${s.eventSummary || ''} ${
        s.candidateMemories?.join(' ') || ''
      } ${s.unfinishedTopics?.join(' ') || ''} ${s.aiReflection || ''}`.toLowerCase();

      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 10;
      }

      const daysDiff = (Date.now() - s.startedAt) / (1000 * 3600 * 24);
      if (daysDiff < 2) score += 6;
      else if (daysDiff < 7) score += 3;

      return { session: s, score };
    });

    scored.sort((a, b) => b.score - a.score || b.session.startedAt - a.session.startedAt);

    const topMatches = scored.slice(0, limit).map((item) => item.session);
    if (topMatches.length === 0) return '';

    const lines: string[] = ['【与用户的历史共同线下经历记录】:'];
    for (const s of topMatches) {
      const timeRange = `${formatOfflineFullDateTime(s.startedAt)}${
        s.endedAt ? `—${formatOfflineFullDateTime(s.endedAt)}` : ''
      }`;
      lines.push(`- [${s.eventTitle || s.sceneSnapshot.name} | ${timeRange} @ ${s.sceneSnapshot.location}]`);
      if (s.eventSummary) {
        lines.push(`  经过摘要: ${s.eventSummary}`);
      }
      if (s.candidateMemories && s.candidateMemories.length > 0) {
        lines.push(`  关键记忆与约定: ${s.candidateMemories.join('；')}`);
      }
      if (s.unfinishedTopics && s.unfinishedTopics.length > 0) {
        lines.push(`  未完话题: ${s.unfinishedTopics.join('；')}`);
      }
      if (s.aiReflection) {
        lines.push(`  当时感受: ${s.aiReflection}`);
      }
    }

    return lines.join('\n');
  }
}
