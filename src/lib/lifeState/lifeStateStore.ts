import { LifeEvent, LifeEventStatus, LifeEventType } from '../../types';

export const LIFE_EVENTS_STORAGE_KEY = 'phone_life_events_v1';

let lifeEventsCache: LifeEvent[] = [];
let isInitialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[LifeStateStore] Listener error:', e);
    }
  });
}

export function subscribeLifeEvents(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function loadLifeEventsSync(): LifeEvent[] {
  if (isInitialized) return lifeEventsCache;
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(LIFE_EVENTS_STORAGE_KEY);
    if (raw) {
      lifeEventsCache = JSON.parse(raw);
    } else {
      // Seed with initial default ongoing life event if empty
      lifeEventsCache = [
        {
          id: 'life_evt_seed_1',
          type: 'future_plan',
          title: '重要项目交付与沟通',
          summary: '近期正在准备重要项目的交付与后续工作汇报',
          status: 'ongoing',
          importance: 4,
          createdAt: Date.now() - 3600000 * 24,
          updatedAt: Date.now() - 3600000 * 24,
          nextFollowUpAt: Date.now() + 3600000 * 6,
          followUpCount: 0,
          sourceType: 'user_manual',
        },
      ];
      localStorage.setItem(LIFE_EVENTS_STORAGE_KEY, JSON.stringify(lifeEventsCache));
    }
  } catch (e) {
    console.error('[LifeStateStore] Failed to parse stored life events:', e);
    lifeEventsCache = [];
  }
  isInitialized = true;
  return lifeEventsCache;
}

export function saveLifeEventsSync(events: LifeEvent[]): void {
  lifeEventsCache = events;
  isInitialized = true;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LIFE_EVENTS_STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
      console.error('[LifeStateStore] Failed to save life events to localStorage:', e);
    }
  }
  notifyListeners();
}

export function getLifeEventsSync(filter?: {
  status?: LifeEventStatus[];
  characterId?: string;
  type?: LifeEventType;
}): LifeEvent[] {
  const all = loadLifeEventsSync();
  return all.filter((evt) => {
    if (filter?.status && filter.status.length > 0 && !filter.status.includes(evt.status)) {
      return false;
    }
    if (filter?.type && evt.type !== filter.type) {
      return false;
    }
    if (filter?.characterId && evt.allowedCharacterIds && evt.allowedCharacterIds.length > 0) {
      if (!evt.allowedCharacterIds.includes(filter.characterId)) {
        return false;
      }
    }
    return true;
  });
}

export async function saveLifeEvent(
  eventInput: Partial<LifeEvent> & { title: string; type: LifeEventType }
): Promise<LifeEvent> {
  const all = loadLifeEventsSync();
  const now = Date.now();

  let target: LifeEvent;

  if (eventInput.id) {
    const idx = all.findIndex((e) => e.id === eventInput.id);
    if (idx >= 0) {
      target = {
        ...all[idx],
        ...eventInput,
        updatedAt: now,
      };
      all[idx] = target;
    } else {
      target = createLifeEventObject(eventInput, now);
      all.unshift(target);
    }
  } else {
    target = createLifeEventObject(eventInput, now);
    all.unshift(target);
  }

  saveLifeEventsSync(all);
  return target;
}

function createLifeEventObject(
  input: Partial<LifeEvent> & { title: string; type: LifeEventType },
  now: number
): LifeEvent {
  return {
    id: input.id || `life_evt_${now}_${Math.random().toString(36).substring(2, 7)}`,
    userId: input.userId || 'default_user',
    type: input.type,
    title: input.title,
    summary: input.summary || input.title,
    status: input.status || 'ongoing',
    importance: input.importance || 3,
    sourceMessageIds: input.sourceMessageIds || [],
    createdAt: input.createdAt || now,
    updatedAt: now,
    startAt: input.startAt,
    expectedEndAt: input.expectedEndAt,
    nextFollowUpAt: input.nextFollowUpAt || now + 3600000 * 12,
    expiresAt: input.expiresAt,
    followUpReason: input.followUpReason,
    latestProgress: input.latestProgress,
    followUpCount: input.followUpCount || 0,
    lastFollowUpAt: input.lastFollowUpAt,
    resolvedAt: input.resolvedAt,
    resolutionSummary: input.resolutionSummary,
    sourceType: input.sourceType || 'user_manual',
    allowedCharacterIds: input.allowedCharacterIds,
    metadata: input.metadata,
  };
}

export async function updateLifeEvent(
  id: string,
  updates: Partial<LifeEvent>
): Promise<LifeEvent | null> {
  const all = loadLifeEventsSync();
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return null;

  const updated: LifeEvent = {
    ...all[idx],
    ...updates,
    updatedAt: Date.now(),
  };

  all[idx] = updated;
  saveLifeEventsSync(all);
  return updated;
}

export async function deleteLifeEvent(id: string): Promise<boolean> {
  const all = loadLifeEventsSync();
  const newEvents = all.filter((e) => e.id !== id);
  if (newEvents.length !== all.length) {
    saveLifeEventsSync(newEvents);
    return true;
  }
  return false;
}

export async function resolveLifeEvent(
  id: string,
  resolutionSummary?: string
): Promise<LifeEvent | null> {
  const now = Date.now();
  return updateLifeEvent(id, {
    status: 'completed',
    resolvedAt: now,
    resolutionSummary: resolutionSummary || '已处理完成',
    latestProgress: resolutionSummary || '已结案完成',
  });
}

/**
 * Returns a concise formatted text summary of active life events
 * for injection into AI system prompt (Context Injection for Life Continuity).
 */
export function getLifeContextForPrompt(characterId?: string): string {
  const activeEvents = getLifeEventsSync({
    status: ['pending', 'ongoing', 'waiting'],
    characterId,
  });

  if (activeEvents.length === 0) {
    return '';
  }

  const typeMap: Record<LifeEventType, string> = {
    future_plan: '【近期计划】',
    waiting_result: '【等待结果】',
    ongoing_issue: '【持续中的事项/困扰】',
    recent_emotion: '【近期情绪/状态】',
    health_status: '【身体健康状况】',
    temporary_goal: '【阶段性目标】',
    custom: '【近况事件】',
  };

  const lines = activeEvents.slice(0, 5).map((evt) => {
    const typeLabel = typeMap[evt.type] || '【近况事件】';
    const progressStr = evt.latestProgress ? ` (最新进展: ${evt.latestProgress})` : '';
    const statusStr = evt.status === 'waiting' ? ' [等待中]' : evt.status === 'pending' ? ' [尚未开始]' : '';
    return `- ${typeLabel} ${evt.title}: ${evt.summary}${progressStr}${statusStr}`;
  });

  return `\n【用户当前生活状态 (Current Life State)】\n${lines.join('\n')}\n(提示: 以上是用户最近正在经历的事情或未完结的动态。在交流或问候中请自然保留这份生活连续性，不需要突兀搬出来，但在合适的时候可以适度关心或跟进。)\n`;
}
