import {
  loadProactiveSettings,
  saveProactiveSettings,
  loadProactiveRuntimeState,
  saveProactiveRuntimeState,
  CharacterProactiveRuntime,
  ProactiveSettings,
} from './proactiveStore';
import { loadCharacters, loadUserProfile, loadMenstrualData, loadApiConfig, loadMemos } from '../storage';
import { weatherService } from '../weatherService';
import { systemNativeService } from '../systemNativeService';
import { chatMessageBridge } from '../agent/ChatMessageBridge';
import { proactiveGate } from './ProactiveGate';
import { apiFetch } from '../localBackend';

import { getLifeEventsSync, updateLifeEvent } from '../lifeState/lifeStateStore';

export interface ProactiveTriggerCandidate {
  characterId: string;
  triggerType: 'inactivity_timeout' | 'weather_alert' | 'menstrual_care' | 'greeting' | 'important_event' | 'followup_topic' | 'device_life_event' | 'life_event_followup';
  priority: 'high' | 'medium' | 'low';
  eventId: string; // Unique deduplication ID
  eventData: any;
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
   * Main Evaluation Loop: Checks all triggers and dispatches highest priority message
   */
  public async checkAndTriggerProactiveMessages(): Promise<{ triggeredCount: number }> {
    if (this.isChecking) return { triggeredCount: 0 };
    this.isChecking = true;

    try {
      const settings = loadProactiveSettings();
      if (!settings.enabled) {
        return { triggeredCount: 0 };
      }

      const runtimeState = loadProactiveRuntimeState();
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Check Quiet Hours
      const isQuietHours = this.isInQuietHours(currentTimeStr, settings.quietHours);

      const characters = loadCharacters();
      if (!characters || characters.length === 0) return { triggeredCount: 0 };

      // Pre-fetch async shared facts once (Weather, Battery, Menstrual)
      const weatherData = settings.weather.enabled
        ? await weatherService.getWeather(false).catch(() => null)
        : null;
      const batteryData = settings.deviceEvents.enabled
        ? await systemNativeService.getBattery().catch(() => ({ level: 100, isCharging: false, isSupported: false }))
        : { level: 100, isCharging: false, isSupported: false };
      const menstrualData = settings.menstrual.enabled ? loadMenstrualData() : null;
      const userProfile = loadUserProfile();
      const apiConfig = loadApiConfig();

      let triggeredCount = 0;

      for (const char of characters) {
        // Permission check for this AI
        const perAiConfig = settings.perAiConfigs[char.id];
        const isCharAllowed =
          perAiConfig?.enabled !== undefined
            ? perAiConfig.enabled
            : settings.allowAllCharacters || settings.allowedCharacterIds.includes(char.id);

        if (!isCharAllowed) continue;

        // Load or initialize character runtime
        let charRuntime = runtimeState.characterStates[char.id] || {
          lastUserMsgAt: Date.now() - 3600000 * 24, // default 1 day ago
          lastConversationAt: Date.now() - 3600000 * 24,
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

        // Check Daily Cap limit
        if (charRuntime.dailyProactiveCount >= (settings.dailyCap || 3)) {
          continue;
        }

        // Check Minimum Cooldown (unless high priority bypass)
        const timeSinceLastProactiveMinutes = (Date.now() - charRuntime.lastProactiveMsgAt) / 60000;

        // Evaluate candidates for this character
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

        // 2. Menstrual Care Candidate (Checks explicit AI authorization)
        const isMenstrualAuthorized =
          settings.menstrual.enabled &&
          (settings.menstrual.allowedCharacterIds.includes(char.id) || settings.allowAllCharacters);

        const lastPeriodStart = (menstrualData as any)?.lastPeriodStartDate || (menstrualData?.records && menstrualData.records.length > 0 ? menstrualData.records[menstrualData.records.length - 1].startDate : undefined);
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
        if (settings.inactivity.enabled) {
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
                    hoursInactive: Math.floor(hoursInactive),
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
          } else if (settings.greetings.night && currentHour >= 21 && (currentHour < 23 || (currentHour === 23 && currentMin <= 30))) {
            greetingType = 'night';
          }

          if (greetingType) {
            const eventId = `greeting_${greetingType}_${todayStr}_${char.id}`;
            const chattedRecently = (Date.now() - charRuntime.lastConversationAt) < 30 * 60000;

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

        // 8. Life State Continuity Follow-up Candidate
        if (settings.lifeState?.enabled !== false && settings.lifeState?.allowProactiveFollowup !== false) {
          const activeEvents = getLifeEventsSync({
            status: ['pending', 'ongoing', 'waiting'],
            characterId: char.id,
          });

          const nowMs = Date.now();
          for (const lifeEvt of activeEvents) {
            if (lifeEvt.followUpCount >= 5) continue;
            const dueTime = lifeEvt.nextFollowUpAt || (lifeEvt.createdAt + 3600000 * 4);
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
                break; // Process top matching life event per AI
              }
            }
          }
        }

        if (candidates.length === 0) continue;

        // Sort candidates by priority (high > medium > low)
        candidates.sort((a, b) => {
          const weight = { high: 3, medium: 2, low: 1 };
          return weight[b.priority] - weight[a.priority];
        });

        const selected = candidates[0];

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
          continue;
        }

        // 2. Generate proactive message via API
        const generated = await this.generateProactiveMessage(char, selected, userProfile, apiConfig);

        if (generated.text) {
          // 3. Dispatch through Unified ProactiveGate
          const dispatchRes = await proactiveGate.dispatchProactiveMessage({
            aiId: char.id,
            triggerType: selected.triggerType,
            priority: selected.priority,
            eventId: selected.eventId,
            sourceSystem: 'proactiveEngine',
            eventData: selected.eventData,
            proposedText: generated.text,
            contextSummary: generated.thinkingProcess || `【主动触发器: ${selected.triggerType}】`,
          });

          if (dispatchRes.sent) {
            triggeredCount++;

            // Update LifeEvent state if this was a life_event_followup
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

      return { triggeredCount };
    } catch (e) {
      console.error('Proactive engine execution error:', e);
      return { triggeredCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Helper: Generate proactive message text via backend API
   */
  public async generateProactiveMessage(
    character: any,
    candidate: ProactiveTriggerCandidate,
    userProfile: any,
    apiConfig: any
  ): Promise<{ text: string; thinkingProcess?: string }> {
    try {
      const res = await apiFetch('/api/gemini/proactive-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          triggerType: candidate.triggerType,
          eventData: candidate.eventData,
          userProfile,
          apiConfig,
        }),
      });

      const data = await res.json();
      if (data.success && data.text) {
        return {
          text: data.text,
          thinkingProcess: data.thinkingProcess,
        };
      }
    } catch (e) {
      console.warn('API call failed for proactive generation:', e);
    }

    // Fallback text if API offline
    const fallbackText = this.getFallbackProactiveText(character.name, candidate);
    return { text: fallbackText };
  }

  /**
   * Helper to trigger system / Android notification
   */
  public showSystemNotification(title: string, body: string, charId: string): void {
    if (typeof window === 'undefined') return;

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
        notif.onclick = () => {
          window.focus();
          window.dispatchEvent(new CustomEvent('open_ai_chat', { detail: { charId } }));
        };
      } catch {}
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          this.showSystemNotification(title, body, charId);
        }
      });
    }
  }

  private isInQuietHours(currentHM: string, quietConfig: { enabled: boolean; startStr: string; endStr: string }): boolean {
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
    const startDateStr = data.lastPeriodStartDate || (data.records && data.records.length > 0 ? data.records[data.records.length - 1].startDate : undefined);
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

  private getFallbackProactiveText(charName: string, candidate: ProactiveTriggerCandidate): string {
    switch (candidate.triggerType) {
      case 'weather_alert':
        return `${charName}: 看到气象预报有天气变化，记得多加衣服或带好雨具防护哦！🌸`;
      case 'menstrual_care':
        return `${charName}: 过两天可能要来例假啦，这几天多喝点温水、别吹冷风受凉哦！❤️`;
      case 'greeting':
        return `${charName}: 嗨，今天过得开心吗？想你啦！`;
      case 'important_event':
        return `${charName}: 提醒一下你，重要的日程快到了，加油冲，相信你一定能顺顺利利！💪`;
      default:
        return `${charName}: 忙完工作了吗？累了就歇会儿，随时有我陪你唠嗑呢。✨`;
    }
  }
}

export const proactiveEngine = ProactiveEngine.getInstance();
