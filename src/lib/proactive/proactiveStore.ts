import {
  ProactiveSettings,
  ProactiveEpisode,
  ProactiveEpisodeStatus,
  ProactiveFollowUpStep,
  ProactiveRejectedAttempt,
  ProactiveAction,
} from '../../types';
import { clampAiPauseMinutes } from './proactiveSchema';
import { parseUserBusyPauseIntent } from './proactiveBusyParser';
export type { ProactiveSettings };

export const PROACTIVE_SETTINGS_KEY = 'phone_proactive_settings_v2';
export const PROACTIVE_RUNTIME_STATE_KEY = 'phone_proactive_runtime_state_v2';
export const PROACTIVE_EPISODES_KEY = 'phone_proactive_episodes_v1';

const MAX_EXECUTED_IDS = 300;

export interface CharacterProactiveRuntime {
  lastUserMsgAt: number;
  lastConversationAt: number;
  lastProactiveMsgAt: number;
  lastUnrepliedProactiveAt?: number;
  dailyProactiveCount: number; // Counts daily proactive EPISODES (not individual bubbles)
  lastCountResetDateStr: string; // YYYY-MM-DD
  handledEventIds: string[];
}

export interface ProactiveRuntimeState {
  lastGlobalCheckAt: number;
  lastAppOpenedAt: number;
  quotaExhaustedUntil?: number;
  backoffUntil?: number;
  consecutiveFailures?: number;
  executedMessageIds?: string[];
  executedStepIds?: string[];
  characterStates: Record<string, CharacterProactiveRuntime>;
}

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  enabled: true,
  allowAllCharacters: true,
  allowedCharacterIds: [],
  perAiConfigs: {},

  inactivity: {
    enabled: true,
    hours: 12,
  },
  weather: {
    enabled: true,
    rainSoon: true,
    snowSoon: true,
    tempDrop: true,
    heatWave: true,
    severeWeather: true,
  },
  menstrual: {
    enabled: true,
    daysBefore: 2,
    allowedCharacterIds: [], // Default empty array; women's health data must be explicitly granted
  },
  greetings: {
    enabled: true,
    morning: true,
    noon: true,
    night: true,
  },
  importantEvents: {
    enabled: true,
    notifyBeforeDays: 1,
    notifyOnDay: true,
    allowFollowup: true,
    customEvents: [], // Clean default; no fake demo events
  },
  followupTopics: {
    enabled: true,
    items: [], // Clean default
  },
  deviceEvents: {
    enabled: true,
    lowBattery: true,
    lateNightUsage: true,
    appUnopenedDays: true,
  },
  appUsage: {
    enabled: true,
  },
  lifeState: {
    enabled: true,
    autoExtractFromChat: true,
    allowProactiveFollowup: true,
    sensitivity: 'medium',
  },

  quietHours: {
    enabled: true,
    startStr: '23:30',
    endStr: '08:00',
  },
  dailyCap: 3,
  minCooldownMinutes: 120,
  allowHighPriorityBypassQuiet: true,

  systemNotificationsEnabled: true,
  androidBackgroundEnabled: true,
  followUpEnabled: true,
  pausedUntil: undefined,
  pauseReason: undefined,
};

// Optional hook registered by proactiveNativeBridge to cancel WorkManager tasks without circular imports
let onEpisodeCancelledHook: ((episodeId: string) => void) | null = null;
let onStateMutatedHook: ((opts?: { pauseExplicitlyCleared?: boolean }) => void) | null = null;

export function registerProactiveStoreNativeHooks(hooks: {
  onEpisodeCancelled?: (episodeId: string) => void;
  onStateMutated?: (opts?: { pauseExplicitlyCleared?: boolean }) => void;
}): void {
  if (hooks.onEpisodeCancelled) onEpisodeCancelledHook = hooks.onEpisodeCancelled;
  if (hooks.onStateMutated) onStateMutatedHook = hooks.onStateMutated;
}

function notifyProactiveStateMutated(opts?: { pauseExplicitlyCleared?: boolean }): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('proactive_settings_updated'));
  }
  if (onStateMutatedHook) {
    try {
      onStateMutatedHook(opts);
    } catch {
      // ignore native bridge sync errors
    }
  }
}

export function isEpisodeActiveStatus(status: ProactiveEpisodeStatus): boolean {
  return status === 'active' || status === 'waiting_for_user' || status === 'scheduled';
}

export function loadProactiveSettings(): ProactiveSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_PROACTIVE_SETTINGS;
  try {
    const raw = localStorage.getItem(PROACTIVE_SETTINGS_KEY);
    if (!raw) return DEFAULT_PROACTIVE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PROACTIVE_SETTINGS,
      ...parsed,
      androidBackgroundEnabled:
        parsed.androidBackgroundEnabled !== undefined ? Boolean(parsed.androidBackgroundEnabled) : true,
      followUpEnabled:
        parsed.followUpEnabled !== undefined ? Boolean(parsed.followUpEnabled) : true,
      inactivity: { ...DEFAULT_PROACTIVE_SETTINGS.inactivity, ...parsed.inactivity },
      weather: { ...DEFAULT_PROACTIVE_SETTINGS.weather, ...parsed.weather },
      menstrual: { ...DEFAULT_PROACTIVE_SETTINGS.menstrual, ...parsed.menstrual },
      greetings: { ...DEFAULT_PROACTIVE_SETTINGS.greetings, ...parsed.greetings },
      importantEvents: { ...DEFAULT_PROACTIVE_SETTINGS.importantEvents, ...parsed.importantEvents },
      followupTopics: { ...DEFAULT_PROACTIVE_SETTINGS.followupTopics, ...parsed.followupTopics },
      deviceEvents: { ...DEFAULT_PROACTIVE_SETTINGS.deviceEvents, ...parsed.deviceEvents },
      quietHours: { ...DEFAULT_PROACTIVE_SETTINGS.quietHours, ...parsed.quietHours },
    };
  } catch (e) {
    console.error('Failed to load proactive settings', e);
    return DEFAULT_PROACTIVE_SETTINGS;
  }
}

export function saveProactiveSettings(
  settings: ProactiveSettings,
  options?: { pauseExplicitlyCleared?: boolean }
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROACTIVE_SETTINGS_KEY, JSON.stringify(settings));
    notifyProactiveStateMutated(options);
  } catch (e) {
    console.error('Failed to save proactive settings', e);
  }
}

/**
 * Apply AI-requested temporary DND (clamped to 15 min .. 24h).
 * NEVER shortens an already-longer active pausedUntil!
 */
export function applyAiTemporaryPause(
  rawMinutes: number,
  reason: string = 'AI开启临时免打扰',
  nowMs: number = Date.now()
): { applied: boolean; pausedUntil?: number; clampedMinutes: number } {
  const clampedMinutes = clampAiPauseMinutes(rawMinutes);
  if (clampedMinutes <= 0) {
    return { applied: false, clampedMinutes: 0 };
  }
  const settings = loadProactiveSettings();
  const targetUntil = nowMs + clampedMinutes * 60000;
  const existing = settings.pausedUntil && settings.pausedUntil > nowMs ? settings.pausedUntil : 0;

  if (targetUntil <= existing) {
    return { applied: false, pausedUntil: existing, clampedMinutes };
  }

  saveProactiveSettings({
    ...settings,
    pausedUntil: targetUntil,
    pauseReason: reason,
  });
  return { applied: true, pausedUntil: targetUntil, clampedMinutes };
}

/**
 * Apply user-explicit or busy-parsed temporary DND.
 * Allowed to exceed 24h if explicitly requested by the user (e.g. "30小时后").
 * NEVER shortens an already-longer active pausedUntil!
 */
export function applyUserTemporaryPause(
  targetUntilMs: number,
  reason: string = '用户开启临时免打扰',
  nowMs: number = Date.now()
): { applied: boolean; pausedUntil?: number } {
  if (!Number.isFinite(targetUntilMs) || targetUntilMs <= nowMs) {
    return { applied: false };
  }
  const settings = loadProactiveSettings();
  const existing = settings.pausedUntil && settings.pausedUntil > nowMs ? settings.pausedUntil : 0;
  const nextUntil = Math.max(existing, targetUntilMs);

  saveProactiveSettings({
    ...settings,
    pausedUntil: nextUntil,
    pauseReason: nextUntil === targetUntilMs ? reason : settings.pauseReason || reason,
  });
  return { applied: nextUntil === targetUntilMs, pausedUntil: nextUntil };
}

/**
 * Manually clear temporary DND early (only via explicit user action in Settings).
 */
export function clearTemporaryPause(): void {
  const settings = loadProactiveSettings();
  saveProactiveSettings(
    {
      ...settings,
      pausedUntil: undefined,
      pauseReason: undefined,
    },
    { pauseExplicitlyCleared: true }
  );
}

export function loadProactiveRuntimeState(): ProactiveRuntimeState {
  const defaultState: ProactiveRuntimeState = {
    lastGlobalCheckAt: 0,
    lastAppOpenedAt: Date.now(),
    quotaExhaustedUntil: 0,
    backoffUntil: 0,
    consecutiveFailures: 0,
    executedMessageIds: [],
    executedStepIds: [],
    characterStates: {},
  };
  if (typeof localStorage === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(PROACTIVE_RUNTIME_STATE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      executedMessageIds: Array.isArray(parsed.executedMessageIds) ? parsed.executedMessageIds : [],
      executedStepIds: Array.isArray(parsed.executedStepIds) ? parsed.executedStepIds : [],
      characterStates: parsed.characterStates && typeof parsed.characterStates === 'object' ? parsed.characterStates : {},
    };
  } catch {
    return defaultState;
  }
}

export function saveProactiveRuntimeState(state: ProactiveRuntimeState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROACTIVE_RUNTIME_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save proactive runtime state', e);
  }
}

export function isMessageIdExecuted(messageId: string): boolean {
  if (!messageId) return false;
  const runtime = loadProactiveRuntimeState();
  return (runtime.executedMessageIds || []).includes(messageId);
}

export function markMessageIdExecuted(messageId: string): void {
  if (!messageId) return;
  const runtime = loadProactiveRuntimeState();
  const list = runtime.executedMessageIds || [];
  if (!list.includes(messageId)) {
    runtime.executedMessageIds = [...list, messageId].slice(-MAX_EXECUTED_IDS);
    saveProactiveRuntimeState(runtime);
  }
}

export function isStepIdExecuted(episodeId: string, stepId: string): boolean {
  if (!episodeId || !stepId) return false;
  const key = `${episodeId}:${stepId}`;
  const runtime = loadProactiveRuntimeState();
  return (runtime.executedStepIds || []).includes(key);
}

export function markStepIdExecuted(episodeId: string, stepId: string): void {
  if (!episodeId || !stepId) return;
  const key = `${episodeId}:${stepId}`;
  const runtime = loadProactiveRuntimeState();
  const list = runtime.executedStepIds || [];
  if (!list.includes(key)) {
    runtime.executedStepIds = [...list, key].slice(-MAX_EXECUTED_IDS);
    saveProactiveRuntimeState(runtime);
  }
}

/**
 * Get or initialize runtime state for a character without fake default timestamps.
 * If never interacted before, lastUserMsgAt and lastConversationAt remain 0.
 */
export function getCharacterProactiveRuntime(
  characterId: string,
  state?: ProactiveRuntimeState
): CharacterProactiveRuntime {
  const runtime = state || loadProactiveRuntimeState();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const charRuntime = runtime.characterStates[characterId] || {
    lastUserMsgAt: 0,
    lastConversationAt: 0,
    lastProactiveMsgAt: 0,
    dailyProactiveCount: 0,
    lastCountResetDateStr: todayStr,
    handledEventIds: [],
  };

  // Reset daily count if date changed
  if (charRuntime.lastCountResetDateStr !== todayStr) {
    charRuntime.dailyProactiveCount = 0;
    charRuntime.lastCountResetDateStr = todayStr;
  }

  return charRuntime;
}

/**
 * Synchronize proactive runtime timestamps whenever a message is confirmed saved in ChatDB.
 * Updates lastUserMsgAt (if sender === 'user') and lastConversationAt (user or AI).
 */
export function syncProactiveRuntimeOnMessageSaved(
  characterId: string,
  sender: 'user' | 'ai',
  timestamp: number
): void {
  if (!characterId || !timestamp) return;
  try {
    const runtimeState = loadProactiveRuntimeState();
    const charRuntime = getCharacterProactiveRuntime(characterId, runtimeState);

    if (sender === 'user') {
      if (timestamp > (charRuntime.lastUserMsgAt || 0)) {
        charRuntime.lastUserMsgAt = timestamp;
      }
    }

    if (timestamp > (charRuntime.lastConversationAt || 0)) {
      charRuntime.lastConversationAt = timestamp;
    }

    runtimeState.characterStates[characterId] = charRuntime;
    saveProactiveRuntimeState(runtimeState);
  } catch (e) {
    console.error('[ProactiveStore] Failed to sync runtime on message saved:', e);
  }
}

// ============================================================================
// Continuous Proactive Episode Store (At most 1 active episode per character)
// ============================================================================

const VALID_EPISODE_STATUSES = new Set<ProactiveEpisodeStatus>([
  'active',
  'waiting_for_user',
  'scheduled',
  'answered',
  'completed',
  'cancelled',
  'closed',
]);

export function normalizeProactiveEpisode(raw: any): ProactiveEpisode | null {
  if (!raw || typeof raw !== 'object' || !raw.episodeId || !raw.characterId) {
    return null;
  }
  const now = Date.now();
  const status: ProactiveEpisodeStatus = VALID_EPISODE_STATUSES.has(raw.status)
    ? raw.status
    : 'closed';

  const followUpPlan: ProactiveFollowUpStep[] = Array.isArray(raw.followUpPlan)
    ? raw.followUpPlan
        .filter((s: any) => s && typeof s === 'object' && typeof s.stepId === 'string')
        .map((s: any) => ({
          stepId: String(s.stepId),
          delayMinutes: typeof s.delayMinutes === 'number' ? s.delayMinutes : undefined,
          delayAfterPreviousMinutes:
            typeof s.delayAfterPreviousMinutes === 'number' ? s.delayAfterPreviousMinutes : undefined,
          scheduledAt: typeof s.scheduledAt === 'number' ? s.scheduledAt : undefined,
          messages: Array.isArray(s.messages)
            ? s.messages.filter((m: any) => typeof m === 'string' && m.trim().length > 0)
            : [],
          status:
            s.status === 'pending' || s.status === 'sent' || s.status === 'cancelled'
              ? s.status
              : 'pending',
          executedAt: typeof s.executedAt === 'number' ? s.executedAt : undefined,
          messageIds: Array.isArray(s.messageIds)
            ? s.messageIds.filter((id: any) => typeof id === 'string')
            : undefined,
          workTag: typeof s.workTag === 'string' ? s.workTag : undefined,
        }))
    : [];

  return {
    episodeId: String(raw.episodeId),
    characterId: String(raw.characterId),
    status,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    closedAt: typeof raw.closedAt === 'number' ? raw.closedAt : undefined,
    triggerSource: typeof raw.triggerSource === 'string' ? raw.triggerSource : 'unknown',
    eventId: typeof raw.eventId === 'string' ? raw.eventId : undefined,
    currentIntent: typeof raw.currentIntent === 'string' ? raw.currentIntent : '',
    currentTopic: typeof raw.currentTopic === 'string' ? raw.currentTopic : '',
    inferredUserState: typeof raw.inferredUserState === 'string' ? raw.inferredUserState : undefined,
    baseMessageIds: Array.isArray(raw.baseMessageIds)
      ? raw.baseMessageIds.filter((id: any) => typeof id === 'string')
      : [],
    proactiveMessageIds: Array.isArray(raw.proactiveMessageIds)
      ? raw.proactiveMessageIds.filter((id: any) => typeof id === 'string')
      : [],
    rejectedAttempts: Array.isArray(raw.rejectedAttempts)
      ? raw.rejectedAttempts.filter((item: any) => item && typeof item === 'object')
      : [],
    attemptCount: typeof raw.attemptCount === 'number' ? raw.attemptCount : 0,
    sentCount: typeof raw.sentCount === 'number' ? raw.sentCount : 0,
    nextCheckAt: typeof raw.nextCheckAt === 'number' ? raw.nextCheckAt : undefined,
    followUpAt: typeof raw.followUpAt === 'number' ? raw.followUpAt : null,
    followUpPlan,
    executedStepIds: Array.isArray(raw.executedStepIds)
      ? raw.executedStepIds.filter((id: any) => typeof id === 'string')
      : [],
    executedMessageIds: Array.isArray(raw.executedMessageIds)
      ? raw.executedMessageIds.filter((id: any) => typeof id === 'string')
      : [],
    pauseProactiveMinutes:
      typeof raw.pauseProactiveMinutes === 'number' ? raw.pauseProactiveMinutes : undefined,
    lastAction: raw.lastAction,
    lastDecisionSummary: typeof raw.lastDecisionSummary === 'string' ? raw.lastDecisionSummary : undefined,
    suggestedNextAction: typeof raw.suggestedNextAction === 'string' ? raw.suggestedNextAction : undefined,
    answeredAt: typeof raw.answeredAt === 'number' ? raw.answeredAt : undefined,
    answeredByMessageId: typeof raw.answeredByMessageId === 'string' ? raw.answeredByMessageId : undefined,
    cancelReason: typeof raw.cancelReason === 'string' ? raw.cancelReason : undefined,
  };
}

export function loadProactiveEpisodes(): ProactiveEpisode[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROACTIVE_EPISODES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeProactiveEpisode)
      .filter((ep): ep is ProactiveEpisode => ep !== null);
  } catch (e) {
    console.warn('[ProactiveStore] Failed to load episodes:', e);
    return [];
  }
}

export function saveProactiveEpisodes(episodes: ProactiveEpisode[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const active = episodes.filter((e) => isEpisodeActiveStatus(e.status));
    const history = episodes
      .filter((e) => !isEpisodeActiveStatus(e.status))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 24);
    const trimmed = [...active, ...history];
    localStorage.setItem(PROACTIVE_EPISODES_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[ProactiveStore] Failed to save episodes:', e);
  }
}

export function getActiveProactiveEpisode(characterId: string): ProactiveEpisode | null {
  if (!characterId) return null;
  const episodes = loadProactiveEpisodes();
  const matches = episodes
    .filter((e) => e.characterId === characterId && isEpisodeActiveStatus(e.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return matches[0] || null;
}

export function getProactiveEpisodeById(episodeId: string): ProactiveEpisode | null {
  if (!episodeId) return null;
  const episodes = loadProactiveEpisodes();
  return episodes.find((e) => e.episodeId === episodeId) || null;
}

export function startOrGetActiveEpisode(params: {
  characterId: string;
  triggerSource: string;
  eventId?: string;
  initialIntent?: string;
  initialTopic?: string;
  inferredUserState?: string;
  baseMessageIds?: string[];
}): ProactiveEpisode {
  const episodes = loadProactiveEpisodes();

  // EventId deduplication: never create multiple episodes for the same eventId
  if (params.eventId) {
    const byEvent = episodes.find(
      (e) => e.characterId === params.characterId && e.eventId === params.eventId
    );
    if (byEvent) {
      return byEvent;
    }
  }

  const activeList = episodes
    .filter((e) => e.characterId === params.characterId && isEpisodeActiveStatus(e.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const now = Date.now();

  if (activeList.length > 0) {
    const existing = activeList[0];
    const baseMessageIds =
      existing.baseMessageIds.length > 0
        ? existing.baseMessageIds
        : (params.baseMessageIds || []).slice(-30);

    const updated: ProactiveEpisode = {
      ...existing,
      eventId: existing.eventId || params.eventId,
      baseMessageIds,
      updatedAt: now,
    };

    const cleaned = episodes.map((e) => {
      if (e.episodeId === existing.episodeId) return updated;
      if (e.characterId === params.characterId && isEpisodeActiveStatus(e.status)) {
        return { ...e, status: 'closed' as ProactiveEpisodeStatus, closedAt: now, updatedAt: now };
      }
      return e;
    });
    saveProactiveEpisodes(cleaned);
    return updated;
  }

  const episodeId = `ep_${params.characterId}_${now}_${Math.random().toString(36).slice(2, 6)}`;
  const newEpisode: ProactiveEpisode = {
    episodeId,
    characterId: params.characterId,
    status: 'waiting_for_user',
    startedAt: now,
    updatedAt: now,
    triggerSource: params.triggerSource || 'proactiveEngine',
    eventId: params.eventId,
    currentIntent: params.initialIntent || params.triggerSource || '主动关怀',
    currentTopic: params.initialTopic || params.triggerSource || '日常近况',
    inferredUserState: params.inferredUserState,
    baseMessageIds: (params.baseMessageIds || []).slice(-30),
    proactiveMessageIds: [],
    rejectedAttempts: [],
    followUpPlan: [],
    executedStepIds: [],
    executedMessageIds: [],
    attemptCount: 0,
    sentCount: 0,
  };

  saveProactiveEpisodes([...episodes, newEpisode]);
  return newEpisode;
}

export function appendProactiveMessagesToEpisode(
  episodeId: string,
  messageIds: string[],
  meta: {
    intent?: string;
    topic?: string;
    inferredUserState?: string;
    action?: ProactiveAction;
    decisionSummary?: string;
    suggestedNextAction?: string;
    nextCheckAt?: number;
    status?: ProactiveEpisodeStatus;
    followUpPlan?: ProactiveFollowUpStep[];
    followUpAt?: number | null;
    pauseProactiveMinutes?: number;
    stepId?: string;
  }
): ProactiveEpisode | null {
  if (!episodeId) return null;
  const episodes = loadProactiveEpisodes();
  const idx = episodes.findIndex((e) => e.episodeId === episodeId);
  if (idx === -1) return null;

  const ep = episodes[idx];
  const mergedIds = [...ep.proactiveMessageIds];
  const executedMsgIds = [...(ep.executedMessageIds || [])];
  for (const id of messageIds) {
    if (id && !mergedIds.includes(id)) mergedIds.push(id);
    if (id && !executedMsgIds.includes(id)) executedMsgIds.push(id);
  }

  const executedStepIds = [...(ep.executedStepIds || [])];
  if (meta.stepId && !executedStepIds.includes(meta.stepId)) {
    executedStepIds.push(meta.stepId);
  }

  const now = Date.now();
  const updated: ProactiveEpisode = {
    ...ep,
    status: meta.status || ep.status,
    updatedAt: now,
    currentIntent: meta.intent || ep.currentIntent,
    currentTopic: meta.topic || ep.currentTopic,
    inferredUserState: meta.inferredUserState ?? ep.inferredUserState,
    proactiveMessageIds: mergedIds,
    executedMessageIds: executedMsgIds,
    executedStepIds,
    followUpPlan: meta.followUpPlan !== undefined ? meta.followUpPlan : ep.followUpPlan,
    followUpAt: meta.followUpAt !== undefined ? meta.followUpAt : ep.followUpAt,
    pauseProactiveMinutes:
      meta.pauseProactiveMinutes !== undefined
        ? meta.pauseProactiveMinutes
        : ep.pauseProactiveMinutes,
    attemptCount: ep.attemptCount + 1,
    sentCount: ep.sentCount + 1,
    lastAction: meta.action || ep.lastAction,
    lastDecisionSummary: meta.decisionSummary || ep.lastDecisionSummary,
    suggestedNextAction: meta.suggestedNextAction ?? ep.suggestedNextAction,
    nextCheckAt: meta.nextCheckAt,
  };

  episodes[idx] = updated;
  saveProactiveEpisodes(episodes);
  notifyProactiveStateMutated();
  return updated;
}

export function updateEpisodeFollowUpStep(
  episodeId: string,
  stepId: string,
  updates: Partial<ProactiveFollowUpStep>,
  episodeUpdates?: Partial<ProactiveEpisode>
): ProactiveEpisode | null {
  if (!episodeId || !stepId) return null;
  const episodes = loadProactiveEpisodes();
  const idx = episodes.findIndex((e) => e.episodeId === episodeId);
  if (idx === -1) return null;

  const ep = episodes[idx];
  const now = Date.now();
  const nextPlan = (ep.followUpPlan || []).map((step) =>
    step.stepId === stepId ? { ...step, ...updates } : step
  );

  const executedStepIds = [...(ep.executedStepIds || [])];
  if (updates.status === 'sent' && !executedStepIds.includes(stepId)) {
    executedStepIds.push(stepId);
  }

  const updated: ProactiveEpisode = {
    ...ep,
    ...(episodeUpdates || {}),
    followUpPlan: nextPlan,
    executedStepIds,
    updatedAt: now,
  };

  episodes[idx] = updated;
  saveProactiveEpisodes(episodes);
  notifyProactiveStateMutated();
  return updated;
}

export function appendRejectedAttemptToEpisode(
  episodeId: string,
  attempt: Omit<ProactiveRejectedAttempt, 'id' | 'timestamp'> & { timestamp?: number },
  episodeUpdates?: {
    action?: ProactiveAction;
    inferredUserState?: string;
    decisionSummary?: string;
    suggestedNextAction?: string;
    nextCheckAt?: number;
    closeEpisode?: boolean;
    cancelEpisode?: boolean;
    followUpAt?: number | null;
  }
): ProactiveEpisode | null {
  if (!episodeId) return null;
  const episodes = loadProactiveEpisodes();
  const idx = episodes.findIndex((e) => e.episodeId === episodeId);
  if (idx === -1) return null;

  const ep = episodes[idx];
  const now = attempt.timestamp || Date.now();
  const record: ProactiveRejectedAttempt = {
    id: `rej_${now}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    triggerType: attempt.triggerType,
    candidateText: attempt.candidateText || '',
    candidateIntent: attempt.candidateIntent,
    proposedAction: attempt.proposedAction,
    rejectReason: attempt.rejectReason,
    suggestedNextAction: attempt.suggestedNextAction,
    source: attempt.source,
  };

  const nextRejected = [...ep.rejectedAttempts, record].slice(-25);
  const shouldCancel = Boolean(episodeUpdates?.cancelEpisode);
  const shouldClose = Boolean(episodeUpdates?.closeEpisode || episodeUpdates?.action === 'END_EPISODE');

  let nextStatus = ep.status;
  if (shouldCancel) nextStatus = 'cancelled';
  else if (shouldClose) nextStatus = 'completed';
  else if (episodeUpdates?.followUpAt) nextStatus = 'scheduled';

  const updated: ProactiveEpisode = {
    ...ep,
    updatedAt: now,
    status: nextStatus,
    closedAt: shouldClose || shouldCancel ? now : ep.closedAt,
    followUpPlan:
      shouldClose || shouldCancel
        ? (ep.followUpPlan || []).map((s) => (s.status === 'pending' ? { ...s, status: 'cancelled' } : s))
        : ep.followUpPlan,
    followUpAt: episodeUpdates?.followUpAt !== undefined ? episodeUpdates.followUpAt : ep.followUpAt,
    rejectedAttempts: nextRejected,
    attemptCount: ep.attemptCount + 1,
    inferredUserState: episodeUpdates?.inferredUserState ?? ep.inferredUserState,
    lastAction: episodeUpdates?.action || attempt.proposedAction || ep.lastAction,
    lastDecisionSummary: episodeUpdates?.decisionSummary || attempt.rejectReason,
    suggestedNextAction: episodeUpdates?.suggestedNextAction ?? attempt.suggestedNextAction ?? ep.suggestedNextAction,
    nextCheckAt: episodeUpdates?.nextCheckAt ?? ep.nextCheckAt,
  };

  episodes[idx] = updated;
  saveProactiveEpisodes(episodes);
  if ((shouldClose || shouldCancel) && onEpisodeCancelledHook) {
    try {
      onEpisodeCancelledHook(ep.episodeId);
    } catch {
      // ignore
    }
  }
  notifyProactiveStateMutated();
  return updated;
}

export function closeActiveProactiveEpisode(characterId: string, reason?: string): ProactiveEpisode | null {
  if (!characterId) return null;
  const episodes = loadProactiveEpisodes();
  const now = Date.now();
  let closedTarget: ProactiveEpisode | null = null;

  const next = episodes.map((ep) => {
    if (ep.characterId === characterId && isEpisodeActiveStatus(ep.status)) {
      const updated: ProactiveEpisode = {
        ...ep,
        status: 'completed',
        closedAt: now,
        updatedAt: now,
        followUpPlan: (ep.followUpPlan || []).map((s) =>
          s.status === 'pending' ? { ...s, status: 'cancelled' } : s
        ),
        lastAction: 'END_EPISODE',
        lastDecisionSummary: reason || ep.lastDecisionSummary || '主动会话自然结束',
      };
      closedTarget = updated;
      if (onEpisodeCancelledHook) {
        try {
          onEpisodeCancelledHook(ep.episodeId);
        } catch {
          // ignore
        }
      }
      return updated;
    }
    return ep;
  });

  if (closedTarget) {
    saveProactiveEpisodes(next);
    notifyProactiveStateMutated();
  }
  return closedTarget;
}

/**
 * Settle active proactive episode when user sends a genuine reply to the character.
 * 1. Marks active episode status = 'answered', cancels ALL pending followUpPlan steps,
 *    and cancels any native Android WorkManager follow-up tasks for that episode.
 * 2. Parses userText for work/sleep/busy/explicit DND intents and activates temporary pausedUntil.
 * 3. Never blocks the user's own normal chat reply flow.
 */
export function settleActiveEpisodeByUserMessage(
  characterId: string,
  userMessageId: string,
  timestamp: number = Date.now(),
  userText?: string
): ProactiveEpisode | null {
  if (!characterId || !userMessageId) return null;
  const episodes = loadProactiveEpisodes();
  let settled: ProactiveEpisode | null = null;
  const cancelledEpisodeIds: string[] = [];

  const next = episodes.map((ep) => {
    if (ep.characterId === characterId && isEpisodeActiveStatus(ep.status)) {
      cancelledEpisodeIds.push(ep.episodeId);
      const updatedPlan = (ep.followUpPlan || []).map((step) =>
        step.status === 'pending' ? { ...step, status: 'cancelled' as const } : step
      );
      const updated: ProactiveEpisode = {
        ...ep,
        status: 'answered',
        answeredAt: timestamp,
        answeredByMessageId: userMessageId,
        closedAt: timestamp,
        updatedAt: timestamp,
        followUpPlan: updatedPlan,
        lastDecisionSummary: '用户已发送真实回复，已取消后续追问并完成本轮结算',
      };
      settled = updated;
      return updated;
    }
    return ep;
  });

  if (settled) {
    saveProactiveEpisodes(next);
  }

  for (const epId of cancelledEpisodeIds) {
    if (onEpisodeCancelledHook) {
      try {
        onEpisodeCancelledHook(epId);
      } catch {
        // ignore
      }
    }
  }

  // Parse user message for busy/work/sleep/explicit temporary pause intent
  if (typeof userText === 'string' && userText.trim().length > 0) {
    const busyIntent = parseUserBusyPauseIntent(userText, timestamp);
    if (busyIntent.matched && busyIntent.pauseUntilMs) {
      applyUserTemporaryPause(
        busyIntent.pauseUntilMs,
        busyIntent.reason || '用户表示暂时没空',
        timestamp
      );
    } else if (settled) {
      notifyProactiveStateMutated();
    }
  } else if (settled) {
    notifyProactiveStateMutated();
  }

  return settled;
}

/**
 * Retrieve active or recently answered episode so immediate normal AI replies
 * retain full visibility into the proactive message chain the user is responding to.
 */
export function getRecentEpisodeForNormalReply(
  characterId: string,
  maxAgeMs: number = 12 * 3600 * 1000
): ProactiveEpisode | null {
  if (!characterId) return null;
  const episodes = loadProactiveEpisodes();
  const cutoff = Date.now() - maxAgeMs;
  const relevant = episodes
    .filter(
      (ep) =>
        ep.characterId === characterId &&
        ep.proactiveMessageIds.length > 0 &&
        (isEpisodeActiveStatus(ep.status) ||
          (ep.status === 'answered' && (ep.answeredAt || ep.updatedAt) >= cutoff))
    )
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return relevant[0] || null;
}
