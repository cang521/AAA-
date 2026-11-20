/**
 * offlineInteractionState.ts
 * Unified per-AI interaction mode state ('chat' | 'offline') persisted in localStorage
 * and synced with proactive runtime & Android WorkManager native snapshot.
 *
 * Guarantees:
 * - Entering offline mode with AI X pauses ONLY AI X's proactive messages & cancels X's pending 15m/1h follow-ups.
 * - Other AIs continue running normally.
 * - Messages sent inside offline mode update AI X's lastInteractionAt/lastUserMsgAt.
 * - Exiting offline mode resets baseline from endedAt (NO backfilling suppressed proactive messages).
 */

import {
  loadProactiveRuntimeState,
  saveProactiveRuntimeState,
  getCharacterProactiveRuntime,
  loadProactiveEpisodes,
  saveProactiveEpisodes,
  isEpisodeActiveStatus,
} from '../proactive/proactiveStore';
import { cancelNativeEpisodeWork, scheduleDebouncedNativeSync } from '../proactive/proactiveNativeBridge';

export type AiInteractionMode = 'chat' | 'offline';

export interface AiInteractionState {
  mode: AiInteractionMode;
  offlineSessionId: string | null;
  enteredAt: string | null;
  enteredAtMs: number | null;
  sceneName: string | null;
  lastEndedAtMs?: number | null;
}

const INTERACTION_STATE_KEY = 'aiphone_ai_interaction_state_v1';

const DEFAULT_STATE: AiInteractionState = {
  mode: 'chat',
  offlineSessionId: null,
  enteredAt: null,
  enteredAtMs: null,
  sceneName: null,
  lastEndedAtMs: null,
};

export function loadAllAiInteractionStates(): Record<string, AiInteractionState> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(INTERACTION_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAllAiInteractionStates(map: Record<string, AiInteractionState>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(INTERACTION_STATE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[OfflineInteractionState] Failed to save state:', e);
  }
}

export function getAiInteractionState(aiId: string): AiInteractionState {
  if (!aiId) return { ...DEFAULT_STATE };
  const all = loadAllAiInteractionStates();
  return all[aiId] ? { ...DEFAULT_STATE, ...all[aiId] } : { ...DEFAULT_STATE };
}

export function isAiInOfflineMode(aiId: string): boolean {
  if (!aiId) return false;
  return getAiInteractionState(aiId).mode === 'offline';
}

export function getAllOfflineAiIds(): string[] {
  const all = loadAllAiInteractionStates();
  return Object.entries(all)
    .filter(([, st]) => st && st.mode === 'offline')
    .map(([aiId]) => aiId);
}

/**
 * Cancel pending follow-up steps (15m / 1h) for a specific AI when it enters Offline Mode.
 * Only affects this AI; leaves all other AIs completely untouched.
 */
function cancelPendingProactiveFollowUpsForAi(aiId: string, nowMs: number): string[] {
  const episodes = loadProactiveEpisodes();
  const cancelledEpisodeIds: string[] = [];
  let changed = false;

  const updated = episodes.map((ep) => {
    if (ep.characterId !== aiId || !isEpisodeActiveStatus(ep.status)) {
      return ep;
    }

    cancelledEpisodeIds.push(ep.episodeId);
    changed = true;
    const nextPlan = (ep.followUpPlan || []).map((step) =>
      step.status === 'pending'
        ? { ...step, status: 'cancelled' as const, cancelledAt: nowMs }
        : step
    );

    return {
      ...ep,
      status: 'cancelled' as const,
      closedAt: nowMs,
      updatedAt: nowMs,
      followUpPlan: nextPlan,
      nextCheckAt: undefined,
    };
  });

  if (changed) {
    saveProactiveEpisodes(updated);
    for (const epId of cancelledEpisodeIds) {
      void cancelNativeEpisodeWork(epId);
    }
  }

  return cancelledEpisodeIds;
}

/**
 * Enter Offline Mode for a specific AI character.
 * - Sets per-AI mode = 'offline'
 * - Immediately cancels any pending 15m/1h proactive follow-ups for this AI
 * - Records real interaction timestamp
 * - Syncs offlineAiIds to Android WorkManager native snapshot
 */
export function enterOfflineMode(
  aiId: string,
  sessionId: string,
  sceneName: string,
  startedAtMs: number = Date.now()
): AiInteractionState {
  const all = loadAllAiInteractionStates();
  const next: AiInteractionState = {
    mode: 'offline',
    offlineSessionId: sessionId,
    enteredAt: new Date(startedAtMs).toISOString(),
    enteredAtMs: startedAtMs,
    sceneName,
    lastEndedAtMs: all[aiId]?.lastEndedAtMs || null,
  };
  all[aiId] = next;
  saveAllAiInteractionStates(all);

  // Immediately cancel pending proactive follow-up steps for THIS AI only
  cancelPendingProactiveFollowUpsForAi(aiId, startedAtMs);

  // Update lastInteractionAt so entering offline mode counts as active contact
  recordOfflineInteractionTimestamp(aiId, startedAtMs, false);

  // Push updated offlineAiIds immediately to Android native SharedPreferences
  scheduleDebouncedNativeSync();

  return next;
}

/**
 * Record user/AI interaction during Offline Mode so it counts as real interaction on the shared timeline.
 */
export function recordOfflineInteractionTimestamp(
  aiId: string,
  timestampMs: number = Date.now(),
  triggerSync: boolean = true
): void {
  if (!aiId) return;
  try {
    const rt = loadProactiveRuntimeState();
    const charRt = getCharacterProactiveRuntime(aiId, rt);
    if (timestampMs > (charRt.lastUserMsgAt || 0)) {
      charRt.lastUserMsgAt = timestampMs;
    }
    if (timestampMs > (charRt.lastConversationAt || 0)) {
      charRt.lastConversationAt = timestampMs;
    }
    rt.characterStates[aiId] = charRt;
    saveProactiveRuntimeState(rt);
    if (triggerSync) {
      scheduleDebouncedNativeSync();
    }
  } catch (e) {
    console.warn('[OfflineInteractionState] recordOfflineInteractionTimestamp error:', e);
  }
}

/**
 * Exit Offline Mode for a specific AI character.
 * - Resets per-AI mode back to 'chat'
 * - Advances baseline timestamps to endedAtMs so suppressed proactive messages are NEVER backfilled
 *   and next proactive eligibility is calculated freshly from endedAtMs!
 */
export function exitOfflineMode(aiId: string, endedAtMs: number = Date.now()): AiInteractionState {
  const all = loadAllAiInteractionStates();
  const next: AiInteractionState = {
    mode: 'chat',
    offlineSessionId: null,
    enteredAt: null,
    enteredAtMs: null,
    sceneName: null,
    lastEndedAtMs: endedAtMs,
  };
  all[aiId] = next;
  saveAllAiInteractionStates(all);

  // Advance proactive timing baseline to endedAtMs so no suppressed proactive message is backfilled
  try {
    const rt = loadProactiveRuntimeState();
    const charRt = getCharacterProactiveRuntime(aiId, rt);
    charRt.lastUserMsgAt = Math.max(charRt.lastUserMsgAt || 0, endedAtMs);
    charRt.lastConversationAt = Math.max(charRt.lastConversationAt || 0, endedAtMs);
    charRt.lastProactiveMsgAt = Math.max(charRt.lastProactiveMsgAt || 0, endedAtMs);
    rt.characterStates[aiId] = charRt;
    saveProactiveRuntimeState(rt);
  } catch (e) {
    console.warn('[OfflineInteractionState] exitOfflineMode baseline update failed:', e);
  }

  scheduleDebouncedNativeSync();

  return next;
}
