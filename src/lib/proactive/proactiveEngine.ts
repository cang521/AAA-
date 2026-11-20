import {
  loadProactiveSettings,
  loadProactiveRuntimeState,
  saveProactiveRuntimeState,
  getCharacterProactiveRuntime,
  getActiveProactiveEpisode,
  getProactiveEpisodeById,
  startOrGetActiveEpisode,
  appendProactiveMessagesToEpisode,
  appendRejectedAttemptToEpisode,
  applyAiTemporaryPause,
  updateEpisodeFollowUpStep,
  markStepIdExecuted,
} from './proactiveStore';
import {
  validateAndNormalizeProactiveResponse,
  mapStructuredToLegacyAction,
} from './proactiveSchema';
import {
  scheduleNativeFollowUpStep,
  scheduleNativeFollowUpAt,
  syncProactiveStateToNative,
} from './proactiveNativeBridge';
import {
  loadCharacters,
  loadUserProfile,
  loadMenstrualData,
  loadPermissions,
  loadApiConfig,
} from '../storage';
import { weatherService } from '../weatherService';
import { systemNativeService } from '../systemNativeService';
import { proactiveGate } from './ProactiveGate';
import { apiFetch, ensureBackendReady } from '../localBackend';
import {
  getRecentChatMessages,
  getMessagesByIds,
  getLatestInteractionTimestamps,
} from '../chatDb';
import { getLifeEventsSync, updateLifeEvent } from '../lifeState/lifeStateStore';
import { deviceContextManager } from '../agent/DeviceContextManager';
import { permissionManager } from '../agent/PermissionManager';
import { nativeNotificationService } from '../NativeNotificationService';
import { aiReplyTaskManager } from '../aiReply/AiReplyTaskManager';
import { sanitizeReplyText } from '../thinkCleaner';
import { isAiInOfflineMode } from '../offline/offlineInteractionState';
import {
  ChatMessage,
  ProactiveAction,
  ProactiveEpisode,
  ProactiveFollowUpStep,
  ProactivePlanDecision,
  ProactiveStructuredContextMessage,
} from '../../types';

export interface ProactiveTriggerCandidate {
  characterId: string;
  triggerType:
    | 'inactivity_timeout'
    | 'weather_alert'
    | 'menstrual_care'
    | 'greeting'
    | 'important_event'
    | 'followup_topic'
    | 'device_life_event'
    | 'life_event_followup'
    | 'app_usage';
  priority: 'high' | 'medium' | 'low';
  eventId: string; // Unique deduplication ID
  eventData: any;
}

export interface LocalReviewResult {
  approved: boolean;
  rejectReason?: string;
  suggestedNextAction?: string;
  nextCheckDelayMinutes?: number;
}

function normalizeForSimilarity(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[\s~～!！?？。.,，、;；:："'“”‘’()（）\[\]\n\r]/g, '');
}

function computeBigramSimilarity(a: string, b: string): number {
  const s1 = normalizeForSimilarity(a);
  const s2 = normalizeForSimilarity(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length >= 6 && s2.length >= 6 && (s1.includes(s2) || s2.includes(s1))) {
    return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length) >= 0.65 ? 0.85 : 0.4;
  }
  const bigrams1 = new Set<string>();
  const bigrams2 = new Set<string>();
  for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.slice(i, i + 2));
  for (let i = 0; i < s2.length - 1; i++) bigrams2.add(s2.slice(i, i + 2));
  if (bigrams1.size === 0 || bigrams2.size === 0) return 0;
  let intersection = 0;
  for (const bg of bigrams1) {
    if (bigrams2.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

class ProactiveEngine {
  private static instance: ProactiveEngine;
  private isChecking = false;

  private constructor() {}

  public static getInstance(): ProactiveEngine {
    if (!ProactiveEngine.instance) {
      ProactiveEngine.instance = new ProactiveEngine();
    }
    return ProactiveEngine.instance;
  }

  /**
   * Build dynamic episode context:
   * - Frozen base 30 messages from when the episode started (NEVER truncated by slice(-30))
   * - Plus ALL proactive messages sent inside this episode in chronological order
   */
  public async buildEpisodeStructuredContext(
    characterId: string,
    episode?: ProactiveEpisode | null
  ): Promise<{
    baseMessages: ChatMessage[];
    episodeProactiveMessages: ChatMessage[];
    structuredMessages: ProactiveStructuredContextMessage[];
  }> {
    let baseMessages: ChatMessage[] = [];
    let episodeProactiveMessages: ChatMessage[] = [];

    if (episode && episode.baseMessageIds.length > 0) {
      baseMessages = await getMessagesByIds(characterId, episode.baseMessageIds).catch(() => []);
    } else {
      baseMessages = await getRecentChatMessages(characterId, 30).catch(() => []);
    }

    if (episode && episode.proactiveMessageIds.length > 0) {
      episodeProactiveMessages = await getMessagesByIds(
        characterId,
        episode.proactiveMessageIds
      ).catch(() => []);
    }

    const baseIdSet = new Set(baseMessages.map((m) => m.id));
    const episodeProactiveIdSet = new Set(episodeProactiveMessages.map((m) => m.id));

    const combinedMap = new Map<string, ProactiveStructuredContextMessage>();

    for (const msg of baseMessages) {
      const isCurrEp = episodeProactiveIdSet.has(msg.id);
      combinedMap.set(msg.id, {
        id: msg.id,
        sender: msg.sender,
        text: msg.text || '',
        timestamp: msg.timestamp,
        isProactive: Boolean(msg.isProactive),
        proactiveMeta: msg.proactiveMeta,
        turnId: msg.turnId,
        turnBubbleIndex: msg.turnBubbleIndex,
        turnTotalBubbles: msg.turnTotalBubbles,
        sourceType: msg.sourceType,
        contextRole: isCurrEp
          ? 'current_episode_proactive'
          : msg.isProactive
          ? 'prior_proactive'
          : 'base_history',
      });
    }

    for (const msg of episodeProactiveMessages) {
      if (!baseIdSet.has(msg.id) || !combinedMap.has(msg.id)) {
        combinedMap.set(msg.id, {
          id: msg.id,
          sender: msg.sender,
          text: msg.text || '',
          timestamp: msg.timestamp,
          isProactive: true,
          proactiveMeta: {
            ...(msg.proactiveMeta || {}),
            episodeId: msg.proactiveMeta?.episodeId || episode?.episodeId,
          },
          turnId: msg.turnId,
          turnBubbleIndex: msg.turnBubbleIndex,
          turnTotalBubbles: msg.turnTotalBubbles,
          sourceType: msg.sourceType,
          contextRole: 'current_episode_proactive',
        });
      }
    }

    const structuredMessages = Array.from(combinedMap.values()).sort(
      (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
    );

    return {
      baseMessages,
      episodeProactiveMessages,
      structuredMessages,
    };
  }

  /**
   * Local Review Guard ("Review" in Plan-Review-Execute-Reflect):
   * Checks model decision, quiet/sleep guards, repetition vs prior episode & rejected attempts,
   * and ungrounded backward-reference phrases when user has not replied.
   */
  public reviewProactiveCandidateLocally(params: {
    characterId: string;
    candidate: ProactiveTriggerCandidate;
    decision: ProactivePlanDecision;
    episode: ProactiveEpisode;
    baseMessages: ChatMessage[];
    episodeProactiveMessages: ChatMessage[];
    isQuietHours: boolean;
  }): LocalReviewResult {
    const { characterId, candidate, decision, episode, baseMessages, episodeProactiveMessages, isQuietHours } =
      params;

    if (decision.action === 'WAIT') {
      return {
        approved: false,
        rejectReason: decision.decisionSummary || '模型主动决定暂缓发送 (WAIT)',
        suggestedNextAction: decision.suggestedNextAction || '等待合适时机再继续判断',
        nextCheckDelayMinutes: decision.nextCheckAt
          ? Math.max(15, Math.round((decision.nextCheckAt - Date.now()) / 60000))
          : 90,
      };
    }

    if (decision.action === 'END_EPISODE') {
      return {
        approved: false,
        rejectReason: decision.decisionSummary || '模型判定本轮主动会话已可自然结束 (END_EPISODE)',
        suggestedNextAction: decision.suggestedNextAction || '等待用户下次发起新对话',
      };
    }

    const cleanCandidate = sanitizeReplyText(decision.candidateText || '').trim();
    if (!cleanCandidate) {
      return {
        approved: false,
        rejectReason: '候选消息正文为空，禁止发送空消息或模板兜底句',
        suggestedNextAction: '若无合适表达应返回 WAIT，而非空文本',
        nextCheckDelayMinutes: 60,
      };
    }

    // Per-AI Offline Mode Mutual Exclusion
    if (isAiInOfflineMode(characterId)) {
      return {
        approved: false,
        rejectReason: '角色当前正在线下模式共处中，暂停微信主动消息',
        suggestedNextAction: '等待线下模式结束后重新计算间隔',
      };
    }

    // Check if normal AI reply task is running right now
    if (aiReplyTaskManager.isCharacterThinking(characterId)) {
      return {
        approved: false,
        rejectReason: '角色正在进行正常对话回复，暂停插入主动消息',
        suggestedNextAction: '等待正常回复结束后再评估',
        nextCheckDelayMinutes: 15,
      };
    }

    // Quiet / sleeping user state check (allow high-priority alerts only when allowed)
    const userStateLower = (decision.inferredUserState || '').toLowerCase();
    const hour = new Date().getHours();
    const isNightLate = hour >= 23 || hour < 7;
    if (
      candidate.priority !== 'high' &&
      (isQuietHours || (isNightLate && /(睡|休息|sleep|asleep|休息中)/i.test(userStateLower)))
    ) {
      return {
        approved: false,
        rejectReason: '当前处于夜间/免打扰或推测用户已休息状态，避免打扰',
        suggestedNextAction: '推迟至白天活跃时段再发起关怀',
        nextCheckDelayMinutes: 180,
      };
    }

    // Guard ungrounded backward-references when user hasn't replied in this episode
    const userHasNotRepliedInEpisode = !episode.answeredAt;
    if (userHasNotRepliedInEpisode && episode.sentCount > 0) {
      const ungroundedRegex = /(你刚才|刚不是|别生气|生气了吗|别不理我|为什么不回|怎么不理我|怎么又)/;
      const latestUserMsg = [...baseMessages].reverse().find((m) => m.sender === 'user');
      const recentUserText = latestUserMsg?.text || '';
      const userMsgVeryOld = !latestUserMsg || Date.now() - latestUserMsg.timestamp > 30 * 60000;

      if (ungroundedRegex.test(cleanCandidate) && (userMsgVeryOld || !recentUserText)) {
        return {
          approved: false,
          rejectReason: '候选消息出现“你刚才/怎么又/别生气/别不理我”等无根据回溯或施压表达（用户在本轮尚未回复）',
          suggestedNextAction: '去掉无根据的前情臆测与情绪施压，改为独立自然的轻量关心或换个话题',
        };
      }
    }

    // Guard repetition against already-sent messages in this episode
    for (const prevMsg of episodeProactiveMessages) {
      const sim = computeBigramSimilarity(cleanCandidate, prevMsg.text || '');
      if (sim >= 0.52) {
        return {
          approved: false,
          rejectReason: `与本轮已发送主动消息「${(prevMsg.text || '').slice(0, 24)}...」高度重复 (相似度 ${(sim * 100).toFixed(0)}%)`,
          suggestedNextAction: '换一个全新切入点或选择 WAIT，不要反复叮嘱同一件事',
        };
      }
    }

    // Guard repetition against rejected candidates in this episode
    for (const rej of episode.rejectedAttempts) {
      if (!rej.candidateText) continue;
      const sim = computeBigramSimilarity(cleanCandidate, rej.candidateText);
      if (sim >= 0.55) {
        return {
          approved: false,
          rejectReason: `与本轮先前被驳回的候选文案高度相似 (相似度 ${(sim * 100).toFixed(0)}%)`,
          suggestedNextAction: rej.suggestedNextAction || '完全变换表达方向或选择 WAIT',
        };
      }
    }

    // Guard synonymous internal multi-line repeats inside one candidate (e.g. 3 identical reminders)
    const candidateLines = cleanCandidate
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (candidateLines.length >= 2) {
      for (let i = 0; i < candidateLines.length; i++) {
        for (let j = i + 1; j < candidateLines.length; j++) {
          if (computeBigramSimilarity(candidateLines[i], candidateLines[j]) >= 0.65) {
            return {
              approved: false,
              rejectReason: '单次主动消息内出现多句同义重复表达',
              suggestedNextAction: '精简为 1~2 条有递进信息量的自然短句',
            };
          }
        }
      }
    }

    return { approved: true };
  }

  /**
   * Main Evaluation Loop: Checks triggers and executes Plan -> Review -> Execute -> Reflect
   */
  public async checkAndTriggerProactiveMessages(): Promise<{ triggeredCount: number }> {
    if (this.isChecking) return { triggeredCount: 0 };
    this.isChecking = true;

    try {
      const settings = loadProactiveSettings();
      if (!settings.enabled) {
        return { triggeredCount: 0 };
      }

      // Strict early local exits BEFORE touching any network or AI API
      if (permissionManager.isDoNotDisturbToday()) {
        return { triggeredCount: 0 };
      }
      if (settings.pausedUntil && settings.pausedUntil > Date.now()) {
        return { triggeredCount: 0 };
      }
      if (proactiveGate.isQuotaExhausted() || proactiveGate.isInBackoff()) {
        return { triggeredCount: 0 };
      }

      const runtimeState = loadProactiveRuntimeState();
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const isQuietHours = this.isInQuietHours(currentTimeStr, settings.quietHours);

      const characters = loadCharacters();
      if (!characters || characters.length === 0) return { triggeredCount: 0 };

      const weatherData = settings.weather.enabled
        ? await weatherService.getWeather(false).catch(() => null)
        : null;
      const batteryData = settings.deviceEvents.enabled
        ? await systemNativeService.getBattery().catch(() => ({ level: 100, isCharging: false, isSupported: false }))
        : { level: 100, isCharging: false, isSupported: false };
      const deviceContext = settings.appUsage?.enabled !== false
        ? await deviceContextManager.getContext().catch(() => null)
        : null;
      const perms = loadPermissions();
      const isMenstrualPermittedGlobal = Boolean(perms?.appAccess?.menstrualData);
      const menstrualData = settings.menstrual.enabled && isMenstrualPermittedGlobal ? loadMenstrualData() : null;
      const userProfile = loadUserProfile();
      const apiConfig = loadApiConfig();

      let triggeredCount = 0;

      for (const char of characters) {
        // Per-AI Offline Mode Mutual Exclusion: skip ONLY AIs currently in offline mode (0 API calls)
        if (isAiInOfflineMode(char.id)) {
          continue;
        }

        const perAiConfig = settings.perAiConfigs[char.id];
        const isCharAllowed =
          perAiConfig?.enabled !== undefined
            ? perAiConfig.enabled
            : settings.allowAllCharacters || settings.allowedCharacterIds.includes(char.id);

        if (!isCharAllowed) continue;

        let charRuntime = getCharacterProactiveRuntime(char.id, runtimeState);

        if (!charRuntime.lastUserMsgAt || !charRuntime.lastConversationAt) {
          try {
            const realTimestamps = await getLatestInteractionTimestamps(char.id);
            if (realTimestamps.lastUserMsgAt && realTimestamps.lastUserMsgAt > (charRuntime.lastUserMsgAt || 0)) {
              charRuntime.lastUserMsgAt = realTimestamps.lastUserMsgAt;
            }
            if (realTimestamps.lastConversationAt && realTimestamps.lastConversationAt > (charRuntime.lastConversationAt || 0)) {
              charRuntime.lastConversationAt = realTimestamps.lastConversationAt;
            }
          } catch (e) {
            console.warn('[proactiveEngine] Failed to query latest interaction timestamps:', e);
          }
        }

        if (charRuntime.dailyProactiveCount >= (settings.dailyCap || 3)) {
          continue;
        }

        // Evaluate active episode wait schedule (if episode opted for WAIT)
        const existingActiveEpisode = getActiveProactiveEpisode(char.id);
        const isWaitingEpisode = Boolean(
          existingActiveEpisode?.nextCheckAt && existingActiveEpisode.nextCheckAt > Date.now()
        );

        const candidates: ProactiveTriggerCandidate[] = [];

        // 1. Weather Alert Candidate
        if (settings.weather.enabled && weatherData) {
          if (weatherData.alerts && weatherData.alerts.length > 0 && settings.weather.severeWeather) {
            const firstAlert = weatherData.alerts[0];
            const eventId = `weather_alert_${todayStr}_${firstAlert.title}`;
            if (!charRuntime.handledEventIds.includes(eventId)) {
              candidates.push({
                characterId: char.id,
                triggerType: 'weather_alert',
                priority: 'high',
                eventId,
                eventData: {
                  weatherEventTitle: firstAlert.title,
                  weatherSummary: firstAlert.description || '官方发布极端天气预警',
                  weatherData,
                },
              });
            }
          } else if (
            settings.weather.rainSoon &&
            ((weatherData.precipProbability ?? 0) >= 65 || weatherData.condition?.includes('雨'))
          ) {
            const eventId = `weather_rain_${todayStr}_${Math.floor(now.getHours() / 4)}`;
            if (!charRuntime.handledEventIds.includes(eventId)) {
              candidates.push({
                characterId: char.id,
                triggerType: 'weather_alert',
                priority: 'medium',
                eventId,
                eventData: {
                  weatherEventTitle: '即将降雨/出行雨具提醒',
                  weatherSummary: `当前降水概率 ${weatherData.precipProbability ?? 70}%，天气: ${weatherData.condition}`,
                  weatherData,
                },
              });
            }
          }
        }

        // 2. Menstrual Care Candidate
        const menstrualAiPermLevel = permissionManager.checkAiPermission(char.id, 'menstrual_health');
        const isMenstrualAuthorized =
          isMenstrualPermittedGlobal &&
          settings.menstrual.enabled &&
          menstrualAiPermLevel !== 'DENY' &&
          menstrualData?.aiAccessEnabled !== false &&
          (settings.menstrual.allowedCharacterIds.includes(char.id) || settings.allowAllCharacters);

        const lastPeriodStart =
          (menstrualData as any)?.lastPeriodStartDate ||
          (menstrualData?.records && menstrualData.records.length > 0
            ? menstrualData.records[menstrualData.records.length - 1].startDate
            : undefined);
        if (isMenstrualAuthorized && menstrualData && lastPeriodStart) {
          const daysBefore = settings.menstrual.daysBefore ?? 2;
          const nextPeriodEst = this.calculateNextPeriodDays(menstrualData);
          if (nextPeriodEst !== null && nextPeriodEst <= daysBefore && nextPeriodEst >= 0) {
            const eventId = `menstrual_${todayStr}_pre${nextPeriodEst}d`;
            if (!charRuntime.handledEventIds.includes(eventId)) {
              candidates.push({
                characterId: char.id,
                triggerType: 'menstrual_care',
                priority: 'medium',
                eventId,
                eventData: {
                  daysBefore: nextPeriodEst,
                  stage: 'pre_period',
                },
              });
            }
          }
        }

        // 3. Important Events & Dates Candidate
        if (settings.importantEvents.enabled) {
          for (const customEvt of settings.importantEvents.customEvents || []) {
            const daysRemaining = this.calculateDaysToDate(customEvt.date, todayStr);
            if (daysRemaining !== null && daysRemaining <= customEvt.remindBeforeDays && daysRemaining >= 0) {
              const eventId = `important_evt_${customEvt.id}_${todayStr}`;
              if (!charRuntime.handledEventIds.includes(eventId)) {
                candidates.push({
                  characterId: char.id,
                  triggerType: 'important_event',
                  priority: 'medium',
                  eventId,
                  eventData: {
                    eventTitle: customEvt.title,
                    eventDate: customEvt.date,
                    daysRemaining,
                    eventType: customEvt.type,
                  },
                });
              }
            }
          }
        }

        // 4. Follow-up Topics Candidate
        if (settings.followupTopics.enabled) {
          for (const item of settings.followupTopics.items || []) {
            if (item.status === 'pending' && !item.hasFollowedUp && item.targetDateStr <= todayStr) {
              const eventId = `followup_${item.id}`;
              if (!charRuntime.handledEventIds.includes(eventId)) {
                candidates.push({
                  characterId: char.id,
                  triggerType: 'followup_topic',
                  priority: 'medium',
                  eventId,
                  eventData: {
                    topicTitle: item.title,
                    targetDateStr: item.targetDateStr,
                  },
                });
              }
            }
          }
        }

        // 5. Inactivity Timeout Candidate
        if (settings.inactivity.enabled && charRuntime.lastUserMsgAt && charRuntime.lastUserMsgAt > 0) {
          const hoursInactive = (Date.now() - charRuntime.lastUserMsgAt) / 3600000;
          const targetInactivity = perAiConfig?.inactivityHours || settings.inactivity.hours || 12;

          if (hoursInactive >= targetInactivity) {
            const hasUnrepliedInactivity =
              charRuntime.lastUnrepliedProactiveAt &&
              charRuntime.lastUnrepliedProactiveAt > charRuntime.lastUserMsgAt;

            const inactivityCooldownHours = hasUnrepliedInactivity ? targetInactivity * 2 : targetInactivity;
            const hoursSinceLastProactive = (Date.now() - charRuntime.lastProactiveMsgAt) / 3600000;

            if (hoursSinceLastProactive >= inactivityCooldownHours) {
              const eventId = `inactivity_${char.id}_${Math.floor(Date.now() / (6 * 3600000))}`;
              if (!charRuntime.handledEventIds.includes(eventId)) {
                candidates.push({
                  characterId: char.id,
                  triggerType: 'inactivity_timeout',
                  priority: 'low',
                  eventId,
                  eventData: {
                    hoursInactive: Math.max(1, Math.floor(hoursInactive)),
                  },
                });
              }
            }
          }
        }

        // 6. Time Greetings Candidate
        if (settings.greetings.enabled) {
          const currentHour = now.getHours();
          const currentMin = now.getMinutes();

          let greetingType: 'morning' | 'noon' | 'night' | null = null;
          if (settings.greetings.morning && currentHour >= 6 && currentHour < 9) {
            greetingType = 'morning';
          } else if (settings.greetings.noon && currentHour >= 11 && currentMin >= 30 && currentHour <= 13) {
            greetingType = 'noon';
          } else if (
            settings.greetings.night &&
            currentHour >= 21 &&
            (currentHour < 23 || (currentHour === 23 && currentMin <= 30))
          ) {
            greetingType = 'night';
          }

          if (greetingType) {
            const eventId = `greeting_${greetingType}_${todayStr}_${char.id}`;
            const chattedRecently = Date.now() - charRuntime.lastConversationAt < 30 * 60000;

            if (!chattedRecently && !charRuntime.handledEventIds.includes(eventId)) {
              candidates.push({
                characterId: char.id,
                triggerType: 'greeting',
                priority: 'low',
                eventId,
                eventData: {
                  greetingType,
                },
              });
            }
          }
        }

        // 7. Life & Device Events Candidate
        if (settings.deviceEvents.enabled) {
          if (
            settings.deviceEvents.lowBattery &&
            batteryData.level <= 15 &&
            !batteryData.isCharging &&
            batteryData.isSupported
          ) {
            const eventId = `device_battery_${todayStr}_${char.id}`;
            if (!charRuntime.handledEventIds.includes(eventId)) {
              candidates.push({
                characterId: char.id,
                triggerType: 'device_life_event',
                priority: 'low',
                eventId,
                eventData: {
                  deviceSubtype: 'low_battery',
                  batteryLevel: batteryData.level,
                  isCharging: batteryData.isCharging,
                },
              });
            }
          }
        }

        // Screen Usage Duration Candidate
        if (settings.appUsage?.enabled !== false && deviceContext && deviceContext.foregroundDurationMinutes >= 120) {
          const screenUsageEventId = `app_usage_screen_${todayStr}_${Math.floor(Date.now() / (4 * 3600000))}`;
          if (!charRuntime.handledEventIds.includes(screenUsageEventId)) {
            candidates.push({
              characterId: char.id,
              triggerType: 'app_usage',
              priority: 'medium',
              eventId: screenUsageEventId,
              eventData: {
                durationMinutes: deviceContext.foregroundDurationMinutes,
                totalScreenTimeMinutes: deviceContext.totalScreenTimeMinutes,
                appUsageTimeMinutes: deviceContext.appUsageTimeMinutes,
                currentApp: deviceContext.currentApp,
              },
            });
          }
        }

        // 8. Life State Continuity Follow-up Candidate
        if (settings.lifeState?.enabled !== false && settings.lifeState?.allowProactiveFollowup !== false) {
          const activeEvents = getLifeEventsSync({
            status: ['pending', 'ongoing', 'waiting'],
            characterId: char.id,
          });

          const nowMs = Date.now();
          for (const lifeEvt of activeEvents) {
            if (lifeEvt.followUpCount >= 5) continue;
            const dueTime = lifeEvt.nextFollowUpAt || lifeEvt.createdAt + 3600000 * 4;
            if (nowMs >= dueTime) {
              const eventId = `life_evt_follow_${lifeEvt.id}_${todayStr}_${char.id}`;
              if (!charRuntime.handledEventIds.includes(eventId)) {
                candidates.push({
                  characterId: char.id,
                  triggerType: 'life_event_followup',
                  priority: lifeEvt.importance >= 4 ? 'high' : 'medium',
                  eventId,
                  eventData: {
                    id: lifeEvt.id,
                    title: lifeEvt.title,
                    summary: lifeEvt.summary,
                    type: lifeEvt.type,
                    latestProgress: lifeEvt.latestProgress,
                  },
                });
                break;
              }
            }
          }
        }

        if (candidates.length === 0) continue;

        candidates.sort((a, b) => {
          const weight = { high: 3, medium: 2, low: 1 };
          return weight[b.priority] - weight[a.priority];
        });

        const selected = candidates[0];

        // If episode requested WAIT until nextCheckAt, allow only high priority override
        if (isWaitingEpisode && selected.priority !== 'high') {
          continue;
        }

        // 1. Unified Gate Check
        const gateCheck = proactiveGate.canSendProactiveMessage({
          aiId: char.id,
          triggerType: selected.triggerType,
          priority: selected.priority,
          eventId: selected.eventId,
          sourceSystem: 'proactiveEngine',
          eventData: selected.eventData,
        });

        if (!gateCheck.allowed) {
          // Record gate block into active episode if one already exists (without creating a new episode just for a gate block)
          if (existingActiveEpisode) {
            appendRejectedAttemptToEpisode(existingActiveEpisode.episodeId, {
              triggerType: selected.triggerType,
              candidateText: '',
              rejectReason: gateCheck.reason || '被 ProactiveGate 拦截',
              source: 'gate',
            });
          }
          continue;
        }

        // 2. Snapshot or reuse active ProactiveEpisode (frozen base 30 messages on new episode start)
        let episode = existingActiveEpisode;
        if (!episode || episode.baseMessageIds.length === 0) {
          const baseSnapshot = await getRecentChatMessages(char.id, 30).catch(() => []);
          episode = startOrGetActiveEpisode({
            characterId: char.id,
            triggerSource: selected.triggerType,
            eventId: selected.eventId,
            initialIntent: `触发源:${selected.triggerType}`,
            initialTopic:
              selected.eventData?.topicTitle ||
              selected.eventData?.eventTitle ||
              selected.eventData?.weatherEventTitle ||
              selected.eventData?.title ||
              selected.triggerType,
            baseMessageIds: baseSnapshot.map((m) => m.id),
          });
        }

        // 3. Plan -> Review (with max 1 retry upon local review rejection) -> Execute -> Reflect
        let approvedDecision: ProactivePlanDecision | null = null;
        const maxAttempts = 2;

        for (let attemptIdx = 0; attemptIdx < maxAttempts; attemptIdx++) {
          const latestEpisode = getActiveProactiveEpisode(char.id) || episode;
          const generated = await this.generateProactiveMessage(
            char,
            selected,
            userProfile,
            apiConfig,
            latestEpisode
          );

          if (!generated.decision) {
            appendRejectedAttemptToEpisode(latestEpisode.episodeId, {
              triggerType: selected.triggerType,
              candidateText: '',
              rejectReason: generated.errorMessage || '模型生成失败、网络异常或返回非合法 JSON',
              suggestedNextAction: '等待下一次后台巡检再评估',
              source: 'model_plan',
            });
            break;
          }

          // Apply AI-requested temporary DND (15m..24h, never shortens existing pause)
          if (generated.decision.pauseProactiveMinutes && generated.decision.pauseProactiveMinutes > 0) {
            applyAiTemporaryPause(
              generated.decision.pauseProactiveMinutes,
              generated.decision.decisionSummary ||
                `AI开启临时免打扰 (${generated.decision.pauseProactiveMinutes}分钟)`
            );
          }

          // Handle structured cancel / close / defer immediately
          if (
            generated.decision.structuredAction === 'cancel' ||
            generated.decision.structuredAction === 'close'
          ) {
            appendRejectedAttemptToEpisode(
              latestEpisode.episodeId,
              {
                triggerType: selected.triggerType,
                candidateText: '',
                candidateIntent: generated.decision.intent,
                proposedAction: 'END_EPISODE',
                rejectReason:
                  generated.decision.decisionSummary ||
                  `模型返回 ${generated.decision.structuredAction}，结束本次主动流程`,
                source: 'model_plan',
              },
              {
                action: 'END_EPISODE',
                inferredUserState: generated.decision.inferredUserState,
                decisionSummary: generated.decision.decisionSummary,
                closeEpisode: generated.decision.structuredAction === 'close',
                cancelEpisode: generated.decision.structuredAction === 'cancel',
              }
            );
            break;
          }

          if (generated.decision.structuredAction === 'defer') {
            const followUpAtMs = generated.decision.followUpAt || null;
            appendRejectedAttemptToEpisode(
              latestEpisode.episodeId,
              {
                triggerType: selected.triggerType,
                candidateText: '',
                candidateIntent: generated.decision.intent,
                proposedAction: 'WAIT',
                rejectReason: generated.decision.decisionSummary || '模型决定暂缓发送 (defer)',
                suggestedNextAction: generated.decision.suggestedNextAction,
                source: 'model_plan',
              },
              {
                action: 'WAIT',
                inferredUserState: generated.decision.inferredUserState,
                decisionSummary: generated.decision.decisionSummary,
                suggestedNextAction: generated.decision.suggestedNextAction,
                followUpAt: followUpAtMs,
                nextCheckAt: followUpAtMs || generated.decision.nextCheckAt || Date.now() + 90 * 60000,
              }
            );
            if (followUpAtMs && followUpAtMs > Date.now()) {
              void scheduleNativeFollowUpAt({
                episodeId: latestEpisode.episodeId,
                aiId: char.id,
                eventId: selected.eventId,
                targetTimestampMs: followUpAtMs,
              });
            }
            break;
          }

          const { baseMessages, episodeProactiveMessages } = await this.buildEpisodeStructuredContext(
            char.id,
            latestEpisode
          );

          const review = this.reviewProactiveCandidateLocally({
            characterId: char.id,
            candidate: selected,
            decision: generated.decision,
            episode: latestEpisode,
            baseMessages,
            episodeProactiveMessages,
            isQuietHours,
          });

          if (review.approved) {
            approvedDecision = generated.decision;
            break;
          }

          if (generated.decision.action === 'WAIT' || generated.decision.action === 'END_EPISODE') {
            appendRejectedAttemptToEpisode(
              latestEpisode.episodeId,
              {
                triggerType: selected.triggerType,
                candidateText: '',
                candidateIntent: generated.decision.intent,
                proposedAction: generated.decision.action,
                rejectReason: review.rejectReason || `模型决策为 ${generated.decision.action}`,
                suggestedNextAction: generated.decision.suggestedNextAction || review.suggestedNextAction,
                source: 'model_plan',
              },
              {
                action: generated.decision.action,
                inferredUserState: generated.decision.inferredUserState,
                decisionSummary: generated.decision.decisionSummary,
                suggestedNextAction: generated.decision.suggestedNextAction,
                nextCheckAt:
                  generated.decision.action === 'WAIT'
                    ? generated.decision.nextCheckAt ||
                      Date.now() + (review.nextCheckDelayMinutes || 90) * 60000
                    : undefined,
                closeEpisode: generated.decision.action === 'END_EPISODE',
              }
            );
            break;
          }

          const isFinalAttempt = attemptIdx >= maxAttempts - 1;
          const waitDelayMins = review.nextCheckDelayMinutes || 90;
          appendRejectedAttemptToEpisode(
            latestEpisode.episodeId,
            {
              triggerType: selected.triggerType,
              candidateText: generated.decision.candidateText || '',
              candidateIntent: generated.decision.intent,
              proposedAction: generated.decision.action,
              rejectReason: review.rejectReason || '未通过本地语义复核',
              suggestedNextAction: review.suggestedNextAction,
              source: 'local_review',
            },
            isFinalAttempt
              ? {
                  action: 'WAIT',
                  inferredUserState: generated.decision.inferredUserState,
                  decisionSummary: `二次生成仍未通过本地复核，转为 WAIT (${review.rejectReason})`,
                  suggestedNextAction: review.suggestedNextAction,
                  nextCheckAt: Date.now() + waitDelayMins * 60000,
                }
              : {
                  inferredUserState: generated.decision.inferredUserState,
                  suggestedNextAction: review.suggestedNextAction,
                }
          );
        }

        if (approvedDecision && (approvedDecision.messages?.length || approvedDecision.candidateText.trim())) {
          const currentEp = getActiveProactiveEpisode(char.id) || episode;
          const explicitMessages =
            approvedDecision.messages && approvedDecision.messages.length > 0
              ? approvedDecision.messages
              : [approvedDecision.candidateText.trim()];
          const deterministicMessageIds = explicitMessages.map(
            (_, idx) => `msg_proactive_${currentEp.episodeId}_init_${idx}`
          );

          const dispatchRes = await proactiveGate.dispatchProactiveMessage({
            aiId: char.id,
            triggerType: selected.triggerType,
            priority: selected.priority,
            eventId: selected.eventId,
            sourceSystem: 'proactiveEngine',
            eventData: selected.eventData,
            proposedText: explicitMessages.join('\n'),
            explicitMessages,
            deterministicMessageIds,
            contextSummary:
              approvedDecision.thinkingProcess ||
              `【主动会话 ${currentEp.episodeId} | ${approvedDecision.action}】${approvedDecision.decisionSummary || selected.triggerType}`,
            episodeId: currentEp.episodeId,
            stepId: 'initial',
            intent: approvedDecision.intent,
            generatedAt: Date.now(),
          });

          if (dispatchRes.sent) {
            triggeredCount++;
            const persistedIds =
              dispatchRes.messageIds && dispatchRes.messageIds.length > 0
                ? dispatchRes.messageIds
                : dispatchRes.messageId
                ? [dispatchRes.messageId]
                : [];

            const nowSent = Date.now();
            const followUpEnabled = settings.followUpEnabled !== false;
            const plan: ProactiveFollowUpStep[] =
              followUpEnabled && Array.isArray(approvedDecision.followUpPlan)
                ? approvedDecision.followUpPlan.slice(0, 2).map((step, idx) => ({
                    ...step,
                    status: 'pending' as const,
                    scheduledAt:
                      idx === 0 ? nowSent + (step.delayMinutes || 15) * 60000 : undefined,
                    workTag: `proactive_ep_${currentEp.episodeId}`,
                  }))
                : [];

            const nextEpisodeStatus =
              plan.length > 0 && approvedDecision.eventStatus !== 'completed'
                ? 'waiting_for_user'
                : 'completed';

            appendProactiveMessagesToEpisode(currentEp.episodeId, persistedIds, {
              intent: approvedDecision.intent,
              topic: approvedDecision.topic,
              inferredUserState: approvedDecision.inferredUserState,
              action: approvedDecision.action,
              decisionSummary: approvedDecision.decisionSummary,
              suggestedNextAction: approvedDecision.suggestedNextAction,
              nextCheckAt: approvedDecision.nextCheckAt,
              status: nextEpisodeStatus,
              followUpPlan: plan,
              followUpAt: approvedDecision.followUpAt ?? null,
              pauseProactiveMinutes: approvedDecision.pauseProactiveMinutes,
              stepId: 'initial',
            });

            // Schedule first follow-up step (+15m) on Android WorkManager (0 extra API calls when due!)
            if (plan.length > 0 && nextEpisodeStatus === 'waiting_for_user') {
              const firstStep = plan[0];
              void scheduleNativeFollowUpStep({
                episodeId: currentEp.episodeId,
                aiId: char.id,
                stepId: firstStep.stepId,
                delayMinutes: firstStep.delayMinutes || 15,
              });
            } else if (approvedDecision.followUpAt && approvedDecision.followUpAt > nowSent) {
              void scheduleNativeFollowUpAt({
                episodeId: currentEp.episodeId,
                aiId: char.id,
                eventId: selected.eventId,
                targetTimestampMs: approvedDecision.followUpAt,
              });
            }

            if (selected.triggerType === 'life_event_followup' && selected.eventData?.id) {
              const lifeEvtId = selected.eventData.id;
              const currentEvents = getLifeEventsSync();
              const target = currentEvents.find((e) => e.id === lifeEvtId);
              if (target) {
                const count = (target.followUpCount || 0) + 1;
                await updateLifeEvent(lifeEvtId, {
                  followUpCount: count,
                  lastFollowUpAt: Date.now(),
                  nextFollowUpAt: Date.now() + 3600000 * 24 * Math.min(count, 3),
                });
              }
            }
          }
        }
      }

      runtimeState.lastGlobalCheckAt = Date.now();
      saveProactiveRuntimeState(runtimeState);
      void syncProactiveStateToNative();

      return { triggeredCount };
    } catch (e) {
      console.error('Proactive engine execution error:', e);
      return { triggeredCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Execute a pre-generated unreplied follow-up step (+15m -> +60m after previous) locally.
   * Performs ALL 9 local pre-send checks and makes ZERO AI API calls!
   */
  public async executeScheduledFollowUpStep(
    episodeId: string,
    stepId: string,
    nowMs: number = Date.now()
  ): Promise<{ sent: boolean; reason?: string; messageIds?: string[]; nextStepScheduled?: string }> {
    const ep = getProactiveEpisodeById(episodeId);
    if (!ep) {
      return { sent: false, reason: '未找到对应主动会话' };
    }

    const gateCheck = await proactiveGate.canSendFollowUpStep({
      episodeId,
      aiId: ep.characterId,
      stepId,
      nowMs,
    });

    if (!gateCheck.allowed) {
      return { sent: false, reason: gateCheck.reason };
    }

    const plan = ep.followUpPlan || [];
    const stepIndex = plan.findIndex((s) => s.stepId === stepId);
    const step = stepIndex >= 0 ? plan[stepIndex] : null;
    if (!step || step.status !== 'pending' || step.messages.length === 0) {
      return { sent: false, reason: '追问步骤无效或已取消' };
    }

    const deterministicMessageIds = step.messages.map(
      (_, idx) => `msg_proactive_${episodeId}_${stepId}_${idx}`
    );

    const dispatchRes = await proactiveGate.dispatchProactiveMessage({
      aiId: ep.characterId,
      triggerType: ep.triggerSource || 'inactivity_timeout',
      priority: 'low',
      eventId: ep.eventId || `${episodeId}_${stepId}`,
      sourceSystem: 'proactiveEngine',
      proposedText: step.messages.join('\n'),
      explicitMessages: step.messages,
      deterministicMessageIds,
      episodeId,
      stepId,
      intent: ep.currentIntent || '未回复轻量追问',
      generatedAt: nowMs,
      isFollowUpStep: true,
      skipTypingDelay: true,
      nowMs,
    });

    if (!dispatchRes.sent) {
      return { sent: false, reason: dispatchRes.reason };
    }

    markStepIdExecuted(episodeId, stepId);

    // Determine whether a 2nd follow-up step (+60m after previous) remains
    let nextStepScheduled: string | undefined;
    const remainingStep = plan.slice(stepIndex + 1).find((s) => s.status === 'pending');

    updateEpisodeFollowUpStep(
      episodeId,
      stepId,
      {
        status: 'sent',
        executedAt: nowMs,
        messageIds: dispatchRes.messageIds || deterministicMessageIds,
      },
      {
        sentCount: ep.sentCount + 1,
        proactiveMessageIds: [
          ...ep.proactiveMessageIds,
          ...(dispatchRes.messageIds || deterministicMessageIds).filter(
            (id) => !ep.proactiveMessageIds.includes(id)
          ),
        ],
        status: remainingStep ? 'waiting_for_user' : 'completed',
        closedAt: remainingStep ? undefined : nowMs,
      }
    );

    if (remainingStep) {
      const delayMins = remainingStep.delayAfterPreviousMinutes || 60;
      updateEpisodeFollowUpStep(episodeId, remainingStep.stepId, {
        scheduledAt: nowMs + delayMins * 60000,
      });
      nextStepScheduled = remainingStep.stepId;
      void scheduleNativeFollowUpStep({
        episodeId,
        aiId: ep.characterId,
        stepId: remainingStep.stepId,
        delayMinutes: delayMins,
      });
    }

    return {
      sent: true,
      messageIds: dispatchRes.messageIds,
      nextStepScheduled,
    };
  }

  /**
   * Helper: Plan & Generate structured proactive decision via backend API using dynamic episode context.
   * Enforces strict JSON schema validation and handles 429/503/offline/bad-JSON safely.
   */
  public async generateProactiveMessage(
    character: any,
    candidate: ProactiveTriggerCandidate,
    userProfile: any,
    apiConfig: any,
    episodeOverride?: ProactiveEpisode | null
  ): Promise<{
    text: string;
    thinkingProcess?: string;
    decision?: ProactivePlanDecision;
    episodeId?: string;
    errorMessage?: string;
  }> {
    try {
      const episode = episodeOverride ?? getActiveProactiveEpisode(character.id);
      const { structuredMessages } = await this.buildEpisodeStructuredContext(character.id, episode);
      const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });

      await ensureBackendReady(`proactive:${character?.id || 'ai'}`);
      const res = await apiFetch('/api/gemini/proactive-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          triggerType: candidate.triggerType,
          eventData: candidate.eventData,
          userProfile,
          recentMessages: structuredMessages,
          episode,
          rejectedAttempts: episode?.rejectedAttempts || [],
          currentTime: nowStr,
          apiConfig,
        }),
      });

      const data = await res.json().catch(() => null);

      if (
        res.status === 429 ||
        data?.isQuotaExceeded ||
        data?.error?.includes('429') ||
        data?.error?.includes('RESOURCE_EXHAUSTED') ||
        data?.error?.includes('Quota exceeded') ||
        data?.error?.includes('配额用尽')
      ) {
        console.warn('[proactiveEngine] 检测到 AI 模型配额超限(429 RESOURCE_EXHAUSTED)，开启 30 分钟避让保护');
        proactiveGate.markQuotaExhausted(30 * 60 * 1000);
        return { text: '', errorMessage: '模型配额超限，已开启本地冷却保护' };
      }

      if (res.status === 503 || data?.isServiceBusy || data?.error?.includes('503')) {
        proactiveGate.recordServiceBusyBackoff();
        return { text: '', errorMessage: '当前模型繁忙，请稍后重试' };
      }

      if (!data || !data.success || data.schemaError) {
        return {
          text: '',
          thinkingProcess: data?.thinkingProcess,
          errorMessage: data?.error || '模型返回结构校验未通过，已安全丢弃',
        };
      }

      const validated = validateAndNormalizeProactiveResponse(data);
      if (!validated.valid || !validated.data) {
        return {
          text: '',
          thinkingProcess: data?.thinkingProcess,
          errorMessage: validated.error || '结构化 JSON 校验失败',
        };
      }

      proactiveGate.resetServiceBusyBackoff();
      const normalized = validated.data;
      const legacyAction: ProactiveAction = mapStructuredToLegacyAction(
        normalized.action,
        episode?.sentCount || 0
      );
      const candidateText = normalized.messages.join('\n');
      const delayMins =
        typeof data.nextCheckDelayMinutes === 'number' && data.nextCheckDelayMinutes > 0
          ? data.nextCheckDelayMinutes
          : normalized.pauseProactiveMinutes > 0
          ? normalized.pauseProactiveMinutes
          : 90;

      const decision: ProactivePlanDecision = {
        action: legacyAction,
        structuredAction: normalized.action,
        intent: normalized.intent || candidate.triggerType,
        topic: normalized.topic || episode?.currentTopic || candidate.triggerType,
        inferredUserState: normalized.inferredUserState,
        candidateText,
        messages: normalized.messages,
        pauseProactiveMinutes: normalized.pauseProactiveMinutes,
        followUpPlan: normalized.followUpPlan,
        followUpAt: typeof normalized.followUpAt === 'number' ? normalized.followUpAt : null,
        eventStatus: normalized.eventStatus,
        decisionSummary: normalized.decisionSummary || '',
        suggestedNextAction: normalized.suggestedNextAction,
        nextCheckAt:
          normalized.action === 'defer'
            ? (typeof normalized.followUpAt === 'number' ? normalized.followUpAt : Date.now() + delayMins * 60000)
            : undefined,
        thinkingProcess: data.thinkingProcess,
      };

      return {
        text: candidateText,
        thinkingProcess: data.thinkingProcess,
        decision,
        episodeId: episode?.episodeId,
      };
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/503|overloaded|busy/i.test(msg)) {
        proactiveGate.recordServiceBusyBackoff();
        return { text: '', errorMessage: '当前模型繁忙，请稍后重试' };
      }
      console.warn('[proactiveEngine] API call failed for proactive generation');
      return { text: '', errorMessage: '网络暂不可用，事件已保留' };
    }
  }

  /**
   * Helper to trigger system / Android notification
   */
  public showSystemNotification(title: string, body: string, charId: string): void {
    if (typeof window === 'undefined') return;
    const characters = loadCharacters();
    const char = characters.find((c) => c.id === charId);
    const ts = Date.now();
    void nativeNotificationService.notifyAiMessage(
      {
        id: charId,
        name: char?.name || title,
        avatar: char?.avatar,
        notificationAvatar: char?.notificationAvatar,
      },
      body,
      {
        messageId: `proactive_engine_${ts}`,
        bubbleIndex: 0,
        timestamp: ts,
        triggerSource: 'proactive_engine',
      }
    );
  }

  private isInQuietHours(
    currentHM: string,
    quietConfig: { enabled: boolean; startStr: string; endStr: string }
  ): boolean {
    if (!quietConfig.enabled) return false;
    const start = quietConfig.startStr || '23:30';
    const end = quietConfig.endStr || '08:00';

    if (start > end) {
      return currentHM >= start || currentHM <= end;
    } else {
      return currentHM >= start && currentHM <= end;
    }
  }

  private calculateNextPeriodDays(data: any): number | null {
    const startDateStr =
      data.lastPeriodStartDate ||
      (data.records && data.records.length > 0 ? data.records[data.records.length - 1].startDate : undefined);
    if (!startDateStr) return null;
    const lastStart = new Date(startDateStr).getTime();
    if (isNaN(lastStart)) return null;

    const cycleLen = data.avgCycleLength || 28;
    const nextStart = lastStart + cycleLen * 86400000;
    const now = Date.now();
    const diffDays = Math.ceil((nextStart - now) / 86400000);
    return diffDays;
  }

  private calculateDaysToDate(targetDateStr: string, todayStr: string): number | null {
    if (!targetDateStr) return null;
    const target = new Date(targetDateStr).getTime();
    const today = new Date(todayStr).getTime();
    if (isNaN(target) || isNaN(today)) return null;

    const diffMs = target - today;
    return Math.round(diffMs / 86400000);
  }
}

export const proactiveEngine = ProactiveEngine.getInstance();
