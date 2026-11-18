import {
  ProactiveSettings,
  ProactiveEpisode,
  ProactiveEpisodeStatus,
  ProactiveRejectedAttempt,
  ProactiveAction,
} from '../../types';
export type { ProactiveSettings };

export const PROACTIVE_SETTINGS_KEY = 'phone_proactive_settings_v2';
export const PROACTIVE_RUNTIME_STATE_KEY = 'phone_proactive_runtime_state_v2';
export const PROACTIVE_EPISODES_KEY = 'phone_proactive_episodes_v1';

export interface CharacterProactiveRuntime {
  lastUserMsgAt: number;
  lastConversationAt: number;
  lastProactiveMsgAt: number;
  lastUnrepliedProactiveAt?: number;
  dailyProactiveCount: number;
  lastCountResetDateStr: string; // YYYY-MM-DD
  handledEventIds: string[];
}

export interface ProactiveRuntimeState {
  lastGlobalCheckAt: number;
  lastAppOpenedAt: number;
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
  pausedUntil: undefined,
};

export function loadProactiveSettings(): ProactiveSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_PROACTIVE_SETTINGS;
  try {
    const raw = localStorage.getItem(PROACTIVE_SETTINGS_KEY);
    if (!raw) return DEFAULT_PROACTIVE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PROACTIVE_SETTINGS,
      ...parsed,
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

export function saveProactiveSettings(settings: ProactiveSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROACTIVE_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('proactive_settings_updated'));
  } catch (e) {
    console.error('Failed to save proactive settings', e);
  }
}

export function loadProactiveRuntimeState(): ProactiveRuntimeState {
  const defaultState: ProactiveRuntimeState = {
    lastGlobalCheckAt: 0,
    lastAppOpenedAt: Date.now(),
    characterStates: {},
  };
  if (typeof localStorage === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(PROACTIVE_RUNTIME_STATE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch (e) {
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

export function normalizeProactiveEpisode(raw: any): ProactiveEpisode | null {
  if (!raw || typeof raw !== 'object' || !raw.episodeId || !raw.characterId) {
    return null;
  }
  const now = Date.now();
  const status: ProactiveEpisodeStatus =
    raw.status === 'answered' || raw.status === 'closed' || raw.status === 'active'
      ? raw.status
      : 'closed';

  return {
    episodeId: String(raw.episodeId),
    characterId: String(raw.characterId),
    status,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    closedAt: typeof raw.closedAt === 'number' ? raw.closedAt : undefined,
    triggerSource: typeof raw.triggerSource === 'string' ? raw.triggerSource : 'unknown',
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
    lastAction: raw.lastAction,
    lastDecisionSummary: typeof raw.lastDecisionSummary === 'string' ? raw.lastDecisionSummary : undefined,
    suggestedNextAction: typeof raw.suggestedNextAction === 'string' ? raw.suggestedNextAction : undefined,
    answeredAt: typeof raw.answeredAt === 'number' ? raw.answeredAt : undefined,
    answeredByMessageId: typeof raw.answeredByMessageId === 'string' ? raw.answeredByMessageId : undefined,
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
    // Keep all active episodes + latest 24 historical (answered/closed) episodes
    const active = episodes.filter((e) => e.status === 'active');
    const history = episodes
      .filter((e) => e.status !== 'active')
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
    .filter((e) => e.characterId === characterId && e.status === 'active')
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
  initialIntent?: string;
  initialTopic?: string;
  inferredUserState?: string;
  baseMessageIds?: string[];
}): ProactiveEpisode {
  const episodes = loadProactiveEpisodes();
  const activeList = episodes
    .filter((e) => e.characterId === params.characterId && e.status === 'active')
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const now = Date.now();

  if (activeList.length > 0) {
    const existing = activeList[0];
    // Freeze baseMessageIds once set; only populate if previously empty
    const baseMessageIds =
      existing.baseMessageIds.length > 0
        ? existing.baseMessageIds
        : (params.baseMessageIds || []).slice(-30);

    const updated: ProactiveEpisode = {
      ...existing,
      baseMessageIds,
      updatedAt: now,
    };

    // Ensure strictly at most ONE active episode per character
    const cleaned = episodes.map((e) => {
      if (e.episodeId === existing.episodeId) return updated;
      if (e.characterId === params.characterId && e.status === 'active') {
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
    status: 'active',
    startedAt: now,
    updatedAt: now,
    triggerSource: params.triggerSource || 'proactiveEngine',
    currentIntent: params.initialIntent || params.triggerSource || '主动关怀',
    currentTopic: params.initialTopic || params.triggerSource || '日常近况',
    inferredUserState: params.inferredUserState,
    baseMessageIds: (params.baseMessageIds || []).slice(-30),
    proactiveMessageIds: [],
    rejectedAttempts: [],
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
  }
): ProactiveEpisode | null {
  if (!episodeId) return null;
  const episodes = loadProactiveEpisodes();
  const idx = episodes.findIndex((e) => e.episodeId === episodeId);
  if (idx === -1) return null;

  const ep = episodes[idx];
  const mergedIds = [...ep.proactiveMessageIds];
  for (const id of messageIds) {
    if (id && !mergedIds.includes(id)) {
      mergedIds.push(id);
    }
  }

  const now = Date.now();
  const updated: ProactiveEpisode = {
    ...ep,
    updatedAt: now,
    currentIntent: meta.intent || ep.currentIntent,
    currentTopic: meta.topic || ep.currentTopic,
    inferredUserState: meta.inferredUserState ?? ep.inferredUserState,
    proactiveMessageIds: mergedIds,
    attemptCount: ep.attemptCount + 1,
    sentCount: ep.sentCount + 1,
    lastAction: meta.action || ep.lastAction,
    lastDecisionSummary: meta.decisionSummary || ep.lastDecisionSummary,
    suggestedNextAction: meta.suggestedNextAction ?? ep.suggestedNextAction,
    nextCheckAt: meta.nextCheckAt,
  };

  episodes[idx] = updated;
  saveProactiveEpisodes(episodes);
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
  const shouldClose = Boolean(episodeUpdates?.closeEpisode || episodeUpdates?.action === 'END_EPISODE');

  const updated: ProactiveEpisode = {
    ...ep,
    updatedAt: now,
    status: shouldClose ? 'closed' : ep.status,
    closedAt: shouldClose ? now : ep.closedAt,
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
  return updated;
}

export function closeActiveProactiveEpisode(characterId: string, reason?: string): ProactiveEpisode | null {
  if (!characterId) return null;
  const episodes = loadProactiveEpisodes();
  const now = Date.now();
  let closedTarget: ProactiveEpisode | null = null;

  const next = episodes.map((ep) => {
    if (ep.characterId === characterId && ep.status === 'active') {
      const updated: ProactiveEpisode = {
        ...ep,
        status: 'closed',
        closedAt: now,
        updatedAt: now,
        lastAction: 'END_EPISODE',
        lastDecisionSummary: reason || ep.lastDecisionSummary || '主动会话自然结束',
      };
      closedTarget = updated;
      return updated;
    }
    return ep;
  });

  if (closedTarget) {
    saveProactiveEpisodes(next);
  }
  return closedTarget;
}

/**
 * Settle active proactive episode when user sends a genuine reply to the character.
 * Marks status = 'answered' and records answeredByMessageId + answeredAt.
 */
export function settleActiveEpisodeByUserMessage(
  characterId: string,
  userMessageId: string,
  timestamp: number = Date.now()
): ProactiveEpisode | null {
  if (!characterId || !userMessageId) return null;
  const episodes = loadProactiveEpisodes();
  let settled: ProactiveEpisode | null = null;

  const next = episodes.map((ep) => {
    if (ep.characterId === characterId && ep.status === 'active') {
      const updated: ProactiveEpisode = {
        ...ep,
        status: 'answered',
        answeredAt: timestamp,
        answeredByMessageId: userMessageId,
        closedAt: timestamp,
        updatedAt: timestamp,
        lastDecisionSummary: '用户已发送真实回复，当前主动会话完成结算',
      };
      settled = updated;
      return updated;
    }
    return ep;
  });

  if (settled) {
    saveProactiveEpisodes(next);
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
        (ep.status === 'active' || (ep.status === 'answered' && (ep.answeredAt || ep.updatedAt) >= cutoff))
    )
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return relevant[0] || null;
}

