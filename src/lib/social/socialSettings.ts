import { AiSocialActivitySettings, AiSocialFrequency } from '../../types';

const STORAGE_KEY = 'phone_ai_social_activity_settings_v1';

export const DEFAULT_AI_SOCIAL_SETTINGS: AiSocialActivitySettings = {
  paused: false,
  frequency: 'low',
  allowMeet: true,
  allowFriendRequests: true,
  allowPrivateChat: true,
  allowMomentsInteraction: true,
  allowGroupRandomEvents: true,
  allowConflicts: true,
  allowUnfriend: true,
  allowNaturalRomance: false,
  notifyMajorChanges: true,
};

export interface SocialFrequencyPolicy {
  dailyMaxAiEvents: number;
  pairCooldownMs: number;
  majorEventCooldownMs: number;
  privateChatCooldownMs: number;
  groupRandomEventProbability: number;
  maxMessagesPerPrivateChatTurn: number;
}

export const FREQUENCY_POLICIES: Record<AiSocialFrequency, SocialFrequencyPolicy> = {
  low: {
    dailyMaxAiEvents: 6,
    pairCooldownMs: 4 * 60 * 60 * 1000, // 4 hours
    majorEventCooldownMs: 6 * 60 * 60 * 1000, // 6 hours
    privateChatCooldownMs: 2 * 60 * 60 * 1000, // 2 hours
    groupRandomEventProbability: 0.22,
    maxMessagesPerPrivateChatTurn: 4,
  },
  medium: {
    dailyMaxAiEvents: 12,
    pairCooldownMs: 90 * 60 * 1000, // 1.5 hours
    majorEventCooldownMs: 2 * 60 * 60 * 1000, // 2 hours
    privateChatCooldownMs: 45 * 60 * 1000, // 45 min
    groupRandomEventProbability: 0.42,
    maxMessagesPerPrivateChatTurn: 5,
  },
  high: {
    dailyMaxAiEvents: 22,
    pairCooldownMs: 25 * 60 * 1000, // 25 min
    majorEventCooldownMs: 45 * 60 * 1000, // 45 min
    privateChatCooldownMs: 15 * 60 * 1000, // 15 min
    groupRandomEventProbability: 0.65,
    maxMessagesPerPrivateChatTurn: 6,
  },
};

export function normalizeAiSocialSettings(
  raw?: Partial<AiSocialActivitySettings> | null
): AiSocialActivitySettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AI_SOCIAL_SETTINGS };
  }
  const freq: AiSocialFrequency =
    raw.frequency === 'low' || raw.frequency === 'medium' || raw.frequency === 'high'
      ? raw.frequency
      : DEFAULT_AI_SOCIAL_SETTINGS.frequency;
  return {
    paused: Boolean(raw.paused ?? DEFAULT_AI_SOCIAL_SETTINGS.paused),
    frequency: freq,
    allowMeet: raw.allowMeet !== undefined ? Boolean(raw.allowMeet) : DEFAULT_AI_SOCIAL_SETTINGS.allowMeet,
    allowFriendRequests:
      raw.allowFriendRequests !== undefined
        ? Boolean(raw.allowFriendRequests)
        : DEFAULT_AI_SOCIAL_SETTINGS.allowFriendRequests,
    allowPrivateChat:
      raw.allowPrivateChat !== undefined
        ? Boolean(raw.allowPrivateChat)
        : DEFAULT_AI_SOCIAL_SETTINGS.allowPrivateChat,
    allowMomentsInteraction:
      raw.allowMomentsInteraction !== undefined
        ? Boolean(raw.allowMomentsInteraction)
        : DEFAULT_AI_SOCIAL_SETTINGS.allowMomentsInteraction,
    allowGroupRandomEvents:
      raw.allowGroupRandomEvents !== undefined
        ? Boolean(raw.allowGroupRandomEvents)
        : DEFAULT_AI_SOCIAL_SETTINGS.allowGroupRandomEvents,
    allowConflicts:
      raw.allowConflicts !== undefined
        ? Boolean(raw.allowConflicts)
        : DEFAULT_AI_SOCIAL_SETTINGS.allowConflicts,
    allowUnfriend:
      raw.allowUnfriend !== undefined
        ? Boolean(raw.allowUnfriend)
        : DEFAULT_AI_SOCIAL_SETTINGS.allowUnfriend,
    allowNaturalRomance:
      raw.allowNaturalRomance !== undefined
        ? Boolean(raw.allowNaturalRomance)
        : DEFAULT_AI_SOCIAL_SETTINGS.allowNaturalRomance,
    notifyMajorChanges:
      raw.notifyMajorChanges !== undefined
        ? Boolean(raw.notifyMajorChanges)
        : DEFAULT_AI_SOCIAL_SETTINGS.notifyMajorChanges,
  };
}

export function loadAiSocialSettings(): AiSocialActivitySettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_AI_SOCIAL_SETTINGS };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SOCIAL_SETTINGS };
    return normalizeAiSocialSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AI_SOCIAL_SETTINGS };
  }
}

export function saveAiSocialSettings(
  next: Partial<AiSocialActivitySettings>
): AiSocialActivitySettings {
  const merged = normalizeAiSocialSettings({
    ...loadAiSocialSettings(),
    ...next,
  });
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }
  } catch (e) {
    console.warn('[socialSettings] Failed to persist settings:', e);
  }
  return merged;
}

export function getSocialFrequencyPolicy(settings?: AiSocialActivitySettings): SocialFrequencyPolicy {
  const effective = settings || loadAiSocialSettings();
  return FREQUENCY_POLICIES[effective.frequency] || FREQUENCY_POLICIES.low;
}
