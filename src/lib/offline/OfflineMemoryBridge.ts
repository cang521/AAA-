/**
 * OfflineMemoryBridge.ts
 * Integrates saved Offline Sessions with the AI's long-term memory system.
 * Ensures saved offline experiences are retrievable during normal WeChat AI chats!
 */

import { AiCharacter } from '../../types';
import { saveCharacters, loadCharacters } from '../storage';
import { saveAiMemoryChunk, deleteAiMemoryChunk, getAiMemoryChunks } from '../aiMemoryVaultDb';
import { OfflineSession, saveOfflineSession, getSavedSessionsForCharacter } from './OfflineSessionDb';

export interface OfflineSessionSummary {
  title: string;
  summary: string;
  importantEvents: string[];
  relationshipChanges: string[];
  candidateMemories: string[];
  aiReflection: string;
}

export class OfflineMemoryBridge {
  /**
   * Commit a completed OfflineSession to AI Long-Term Memory (Called when user clicks "保存本次经历")
   */
  public static async commitSessionToLongTermMemory(
    session: OfflineSession,
    summary: OfflineSessionSummary,
    character: AiCharacter,
    onUpdateCharacters?: (chars: AiCharacter[]) => void
  ): Promise<OfflineSession> {
    const updatedSession: OfflineSession = {
      ...session,
      status: 'saved',
      eventSummary: summary.summary,
      importantEvents: summary.importantEvents,
      relationshipChanges: summary.relationshipChanges,
      aiReflection: summary.aiReflection,
      candidateMemories: summary.candidateMemories,
      endedAt: session.endedAt || Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Save session record to OfflineSessionDb
    await saveOfflineSession(updatedSession);

    // 2. Append candidate memories into character.memories list
    if (summary.candidateMemories && summary.candidateMemories.length > 0) {
      const existingMemories = new Set(character.memories || []);
      const newAdditions: string[] = [];

      for (const mem of summary.candidateMemories) {
        const trimmed = mem.trim();
        if (trimmed && !existingMemories.has(trimmed)) {
          existingMemories.add(trimmed);
          newAdditions.push(trimmed);
        }
      }

      if (newAdditions.length > 0) {
        const updatedChar: AiCharacter = {
          ...character,
          memories: Array.from(existingMemories),
        };

        const allChars = loadCharacters();
        const nextChars = allChars.map((c) => (c.id === character.id ? updatedChar : c));
        saveCharacters(nextChars);
        if (onUpdateCharacters) {
          onUpdateCharacters(nextChars);
        }
      }
    }

    // 3. Inject structured summary file into AI Memory Vault DB
    const memoryFileName = `[线下经历] ${session.sceneSnapshot.name} (${new Date(session.startedAt).toLocaleDateString('zh-CN')}).txt`;
    const memoryFileText = `【线下模式记录】
场景名称: ${session.sceneSnapshot.name}
时间: ${new Date(session.startedAt).toLocaleString('zh-CN')}
地点: ${session.sceneSnapshot.location}
氛围: ${session.sceneSnapshot.atmosphere}
重要事件摘要: ${summary.summary}
关键事实与约定:
${summary.candidateMemories.map((m) => `- ${m}`).join('\n')}
关系与情感变化: ${summary.relationshipChanges.join('； ') || '情感加深'}
AI角色感受与回忆: ${summary.aiReflection || ''}`;

    try {
      await saveAiMemoryChunk(character.id, memoryFileName, memoryFileText);
    } catch (e) {
      console.warn('Failed to save offline memory chunk to vault:', e);
    }

    return updatedSession;
  }

  /**
   * Remove a saved session from AI Long-Term Memory (Called when user explicitly deletes history with memory removal)
   */
  public static async removeSessionFromLongTermMemory(
    session: OfflineSession,
    character: AiCharacter,
    onUpdateCharacters?: (chars: AiCharacter[]) => void
  ): Promise<void> {
    // 1. Remove corresponding memories from character.memories
    if (session.candidateMemories && session.candidateMemories.length > 0) {
      const candidates = new Set(session.candidateMemories.map((m) => m.trim()));
      const updatedMemories = (character.memories || []).filter((m) => !candidates.has(m.trim()));

      const updatedChar: AiCharacter = {
        ...character,
        memories: updatedMemories,
      };

      const allChars = loadCharacters();
      const nextChars = allChars.map((c) => (c.id === character.id ? updatedChar : c));
      saveCharacters(nextChars);
      if (onUpdateCharacters) {
        onUpdateCharacters(nextChars);
      }
    }

    // 2. Remove file from AI Memory Vault DB
    const memoryFileName = `[线下经历] ${session.sceneSnapshot.name} (${new Date(session.startedAt).toLocaleDateString('zh-CN')}).txt`;
    try {
      const vaultChunks = await getAiMemoryChunks(character.id);
      const matched = vaultChunks.find((c) => c.fileName === memoryFileName || c.fileName.includes(session.sceneSnapshot.name));
      if (matched) {
        await deleteAiMemoryChunk(matched.id);
      }
    } catch (e) {
      console.warn('Failed to delete offline memory chunk from vault:', e);
    }
  }

  /**
   * Relevance search across saved Offline Sessions for insertion into normal WeChat chat AI prompt context
   */
  public static async searchSavedOfflineSessions(
    characterId: string,
    queryText: string,
    limit: number = 3
  ): Promise<string> {
    const savedSessions = await getSavedSessionsForCharacter(characterId);
    if (savedSessions.length === 0) return '';

    const keywords = (queryText || '').toLowerCase().split(/\s+/).filter((k) => k.length > 0);

    // Score sessions by keyword relevance or recency
    const scored = savedSessions.map((s) => {
      let score = 0;
      const haystack = `${s.sceneSnapshot.name} ${s.sceneSnapshot.location} ${s.eventSummary || ''} ${s.candidateMemories?.join(' ') || ''} ${s.aiReflection || ''}`.toLowerCase();

      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 10;
      }

      // Time proximity boost (recent offline sessions score higher)
      const daysDiff = (Date.now() - s.startedAt) / (1000 * 3600 * 24);
      if (daysDiff < 2) score += 5;
      else if (daysDiff < 7) score += 2;

      return { session: s, score };
    });

    scored.sort((a, b) => b.score - a.score || b.session.startedAt - a.session.startedAt);

    const topMatches = scored.slice(0, limit).map((item) => item.session);
    if (topMatches.length === 0) return '';

    const lines: string[] = ['【与用户的历史线下真实经历与约定记录】:'];
    for (const s of topMatches) {
      const dateStr = new Date(s.startedAt).toLocaleDateString('zh-CN');
      lines.push(`- [经历: ${s.sceneSnapshot.name} (${dateStr}) @ ${s.sceneSnapshot.location}]`);
      if (s.eventSummary) {
        lines.push(`  摘要: ${s.eventSummary}`);
      }
      if (s.candidateMemories && s.candidateMemories.length > 0) {
        lines.push(`  重要事实/约定: ${s.candidateMemories.join('; ')}`);
      }
      if (s.aiReflection) {
        lines.push(`  当时心理体验: ${s.aiReflection}`);
      }
    }

    return lines.join('\n');
  }
}
