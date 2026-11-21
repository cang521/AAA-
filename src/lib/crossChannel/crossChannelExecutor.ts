/**
 * crossChannelExecutor.ts
 * Delayed & crash-recoverable executor for Group-to-Private `continue_in_private` actions.
 *
 * Guarantees:
 * - Waits a natural 2–6s random delay AFTER the AI posts its group message(s).
 * - Persists pending transitions in localStorage so killing/restarting the app does not lose them.
 * - Strictly idempotent by `eventId` (deterministic message IDs `msg_ccp_${eventId}_${idx}` + executed ledger).
 * - Updates unreadAiCount cleanly and sends a native notification via NativeNotificationService.
 * - ZERO extra model API calls.
 */

import { ChatMessage } from '../../types';
import { hasChatMessage, saveChatMessage } from '../chatDb';
import { loadCharacters } from '../storage';
import { updateCharacterByIdIfExists } from '../characterPersistence';
import { NativeNotificationService } from '../NativeNotificationService';
import { markCrossChannelTransitionStarted } from './crossChannelStore';

const STORAGE_KEY_PENDING_CCP = 'phone_pending_cross_channel_v1';
const STORAGE_KEY_EXECUTED_CCP = 'phone_executed_cross_channel_events_v1';

export interface PendingContinueInPrivateTask {
  eventId: string;
  roundId: string;
  groupId: string;
  groupName: string;
  characterId: string;
  reason: string;
  triggerSummary?: string;
  privateOpeningMessages: string[];
  recentGroupSnippet: string[];
  createdAt: number;
  executeAt: number;
}

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
let activePrivateChatIdProvider: (() => string | null) | null = null;
let recoveryInitialized = false;

export function registerActivePrivateChatIdProvider(provider: () => string | null): () => void {
  activePrivateChatIdProvider = provider;
  return () => {
    if (activePrivateChatIdProvider === provider) {
      activePrivateChatIdProvider = null;
    }
  };
}

function readPendingTasks(): PendingContinueInPrivateTask[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_CCP);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => t && t.eventId && t.characterId) : [];
  } catch {
    return [];
  }
}

function writePendingTasks(tasks: PendingContinueInPrivateTask[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PENDING_CCP, JSON.stringify(tasks.slice(-40)));
  } catch {
    // ignore storage quota errors
  }
}

function readExecutedLedger(): string[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXECUTED_CCP);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function markEventIdExecuted(eventId: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const current = readExecutedLedger();
    if (current.includes(eventId)) return;
    current.push(eventId);
    localStorage.setItem(STORAGE_KEY_EXECUTED_CCP, JSON.stringify(current.slice(-200)));
  } catch {
    // ignore
  }
}

export function isContinueInPrivateExecuted(eventId: string): boolean {
  return readExecutedLedger().includes(eventId);
}

export async function executeContinueInPrivateTask(
  task: PendingContinueInPrivateTask
): Promise<{ executed: boolean; skippedReason?: string }> {
  if (!task || !task.eventId || !task.characterId) {
    return { executed: false, skippedReason: 'invalid_task' };
  }

  if (isContinueInPrivateExecuted(task.eventId)) {
    writePendingTasks(readPendingTasks().filter((t) => t.eventId !== task.eventId));
    return { executed: false, skippedReason: 'already_executed' };
  }

  const targetChar = loadCharacters().find((c) => c.id === task.characterId);
  if (!targetChar) {
    markEventIdExecuted(task.eventId);
    writePendingTasks(readPendingTasks().filter((t) => t.eventId !== task.eventId));
    return { executed: false, skippedReason: 'character_not_found' };
  }

  const openings = (task.privateOpeningMessages || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  if (openings.length === 0) {
    markEventIdExecuted(task.eventId);
    writePendingTasks(readPendingTasks().filter((t) => t.eventId !== task.eventId));
    return { executed: false, skippedReason: 'empty_messages' };
  }

  const baseTs = Date.now();
  const savedMsgs: ChatMessage[] = [];
  let newlyInsertedCount = 0;

  for (let idx = 0; idx < openings.length; idx++) {
    const msgId = `msg_ccp_${task.eventId}_${idx}`;
    const alreadyExists = await hasChatMessage(msgId);
    if (alreadyExists) continue;

    const msg: ChatMessage = {
      id: msgId,
      characterId: targetChar.id,
      sender: 'ai',
      text: openings[idx],
      messageType: 'text',
      type: 'text',
      timestamp: baseTs + idx * 15,
      turnId: `ccp_${task.roundId || task.eventId}`,
      turnBubbleIndex: idx,
      turnTotalBubbles: openings.length,
    };
    await saveChatMessage(msg);
    savedMsgs.push(msg);
    newlyInsertedCount += 1;
  }

  markCrossChannelTransitionStarted({
    characterId: targetChar.id,
    eventId: task.eventId,
    groupId: task.groupId,
    groupName: task.groupName,
    reason: task.reason,
    triggerSummary: task.triggerSummary,
    privateOpeningMessages: openings,
    recentGroupSnippet: task.recentGroupSnippet,
  });

  if (newlyInsertedCount > 0) {
    const currentViewingCharId = activePrivateChatIdProvider ? activePrivateChatIdProvider() : null;
    if (currentViewingCharId !== targetChar.id) {
      await updateCharacterByIdIfExists(targetChar.id, (c) => ({
        ...c,
        unreadAiCount: Math.max(0, c.unreadAiCount || 0) + newlyInsertedCount,
      })).catch(() => {});
    }

    const previewText = openings[openings.length - 1];
    try {
      await NativeNotificationService.getInstance().notifyAiMessage(targetChar, previewText, {
        messageId: savedMsgs[savedMsgs.length - 1]?.id || `msg_ccp_${task.eventId}_0`,
        bubbleIndex: Math.max(0, openings.length - 1),
        timestamp: baseTs,
        triggerSource: 'group_continue_in_private',
      });
    } catch {
      // non-fatal
    }
  }

  markEventIdExecuted(task.eventId);
  writePendingTasks(readPendingTasks().filter((t) => t.eventId !== task.eventId));
  activeTimers.delete(task.eventId);

  return { executed: newlyInsertedCount > 0 };
}

function scheduleTimerForTask(task: PendingContinueInPrivateTask): void {
  const existingTimer = activeTimers.get(task.eventId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const waitMs = Math.max(0, task.executeAt - Date.now());
  const handle = setTimeout(() => {
    void executeContinueInPrivateTask(task).catch((err) => {
      console.warn('[crossChannelExecutor] Failed executing continue_in_private:', err);
    });
  }, waitMs);
  activeTimers.set(task.eventId, handle);
}

/**
 * Enqueue a delayed (2-6s random) Group-to-Private continuation message.
 */
export function scheduleContinueInPrivate(params: {
  eventId: string;
  roundId: string;
  groupId: string;
  groupName: string;
  characterId: string;
  reason: string;
  triggerSummary?: string;
  privateOpeningMessages: string[];
  recentGroupSnippet: string[];
  delayMsOverride?: number;
}): { scheduled: boolean; executeAt?: number; skippedReason?: string } {
  const { eventId, characterId } = params;
  if (!eventId || !characterId) {
    return { scheduled: false, skippedReason: 'invalid_params' };
  }

  if (isContinueInPrivateExecuted(eventId)) {
    return { scheduled: false, skippedReason: 'already_executed' };
  }

  const pending = readPendingTasks();
  if (pending.some((t) => t.eventId === eventId)) {
    return { scheduled: false, skippedReason: 'already_pending' };
  }

  const openings = (params.privateOpeningMessages || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (openings.length === 0) {
    return { scheduled: false, skippedReason: 'empty_messages' };
  }

  const randomDelay =
    typeof params.delayMsOverride === 'number' && params.delayMsOverride >= 0
      ? params.delayMsOverride
      : 2000 + Math.floor(Math.random() * 4001); // 2s ~ 6s

  const now = Date.now();
  const task: PendingContinueInPrivateTask = {
    eventId,
    roundId: params.roundId,
    groupId: params.groupId,
    groupName: params.groupName,
    characterId,
    reason: params.reason || '有些话想私下跟你说',
    triggerSummary: params.triggerSummary,
    privateOpeningMessages: openings,
    recentGroupSnippet: (params.recentGroupSnippet || []).slice(-30),
    createdAt: now,
    executeAt: now + randomDelay,
  };

  writePendingTasks([...pending, task]);
  scheduleTimerForTask(task);

  return { scheduled: true, executeAt: task.executeAt };
}

/**
 * Recover any pending continue_in_private tasks that survived an app restart/kill.
 */
export function initCrossChannelRecovery(): void {
  if (recoveryInitialized) return;
  recoveryInitialized = true;

  const pending = readPendingTasks();
  if (pending.length === 0) return;

  for (const task of pending) {
    if (isContinueInPrivateExecuted(task.eventId)) continue;
    scheduleTimerForTask(task);
  }
}
