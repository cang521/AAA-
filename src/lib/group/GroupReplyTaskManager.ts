import { ApiLog, GroupChatMessage } from '../../types';
import {
  isBackendUnavailableError,
  registerBackendResumeHandler,
  registerPendingTaskCountProvider,
} from '../localBackend';
import { executeGroupTimelinePlan, PlaybackControlSignal } from './GroupEventExecutor';
import { orchestrateGroupRound } from './GroupRoundOrchestrator';
import {
  GroupActivePlaybackIndicator,
  GroupReplyTask,
  GroupReplyTaskStatus,
  GroupRoundTriggerType,
} from './groupRoundTypes';
import {
  loadLatestGroupFromStore,
  readPersistedGroupTasks,
  writePersistedGroupTasks,
} from './GroupStateStore';

export type {
  GroupActivePlaybackIndicator,
  GroupReplyTask,
  GroupReplyTaskStatus,
  GroupRoundTriggerType,
} from './groupRoundTypes';

type Listener = () => void;

class GroupPlaybackController {
  public readonly taskId: string;
  public cancelled = false;
  public paused = false;
  public indicator: GroupActivePlaybackIndicator | null = null;

  private wakeWaiters = new Set<() => void>();
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeTimerResolve: (() => void) | null = null;

  constructor(taskId: string, initiallyPaused = false) {
    this.taskId = taskId;
    this.paused = initiallyPaused;
  }

  public pause(): void {
    if (this.cancelled || this.paused) return;
    this.paused = true;
    this.interruptActiveTimer();
    if (this.indicator) {
      this.indicator = { ...this.indicator, status: 'paused' };
    }
  }

  public resume(): void {
    if (this.cancelled || !this.paused) return;
    this.paused = false;
    if (this.indicator) {
      this.indicator = { ...this.indicator, status: 'delivering' };
    }
    this.flushWaiters();
  }

  public cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.paused = false;
    this.indicator = null;
    this.interruptActiveTimer();
    this.flushWaiters();
  }

  private interruptActiveTimer(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.activeTimerResolve) {
      const resolve = this.activeTimerResolve;
      this.activeTimerResolve = null;
      resolve();
    }
  }

  private flushWaiters(): void {
    const waiters = Array.from(this.wakeWaiters);
    this.wakeWaiters.clear();
    waiters.forEach((fn) => fn());
  }

  private waitUntilResumedOrCancelled(): Promise<void> {
    if (!this.paused || this.cancelled) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.wakeWaiters.add(resolve);
    });
  }

  public createSignal(): PlaybackControlSignal {
    return {
      isCancelled: () => this.cancelled,
      isPaused: () => this.paused,
      waitWhilePausedOrSleep: async (ms: number): Promise<'ok' | 'cancelled'> => {
        let remaining = Math.max(0, ms);
        while (remaining > 0) {
          if (this.cancelled) return 'cancelled';
          if (this.paused) {
            await this.waitUntilResumedOrCancelled();
            if (this.cancelled) return 'cancelled';
          }

          const sliceStart = Date.now();
          await new Promise<void>((resolve) => {
            this.activeTimerResolve = resolve;
            this.activeTimer = setTimeout(() => {
              this.activeTimer = null;
              this.activeTimerResolve = null;
              resolve();
            }, remaining);
          });

          if (this.cancelled) return 'cancelled';
          const elapsed = Date.now() - sliceStart;
          if (this.paused) {
            remaining = Math.max(0, remaining - elapsed);
          } else {
            remaining = 0;
          }
        }

        if (this.paused && !this.cancelled) {
          await this.waitUntilResumedOrCancelled();
        }
        return this.cancelled ? 'cancelled' : 'ok';
      },
    };
  }
}

function isRunningStatus(status: GroupReplyTaskStatus): boolean {
  return (
    status === 'queued' ||
    status === 'waking_backend' ||
    status === 'generating' ||
    status === 'delivering'
  );
}

function isActiveOrPausedStatus(status: GroupReplyTaskStatus): boolean {
  return isRunningStatus(status) || status === 'paused';
}

function hasRemainingPlanEvents(task: GroupReplyTask): boolean {
  if (!task.plan || !Array.isArray(task.plan.events) || task.plan.events.length === 0) {
    return false;
  }
  const doneSet = new Set(task.executedEventIds || []);
  return task.plan.events.some((ev) => !doneSet.has(ev.eventId));
}

class GroupReplyTaskManager {
  private static instance: GroupReplyTaskManager;
  private tasks: GroupReplyTask[] = [];
  private listeners = new Set<Listener>();
  private activeGroupIds = new Set<string>();
  private controllersByGroupId = new Map<string, GroupPlaybackController>();
  private recentDedupeTimestamps = new Map<string, number>();
  private initialized = false;
  private lifecycleHooksRegistered = false;

  private constructor() {
    const now = Date.now();
    this.tasks = readPersistedGroupTasks()
      .filter((t) => t.status !== 'completed' && t.status !== 'stopped' && t.status !== 'interrupted')
      .map((t) => {
        if (t.status === 'paused' && hasRemainingPlanEvents(t)) {
          // Keep user-paused rounds paused across restarts without calling the model again
          return { ...t, updatedAt: now };
        }
        if (
          t.status === 'waking_backend' ||
          t.status === 'waiting_backend' ||
          t.status === 'generating' ||
          t.status === 'delivering' ||
          t.status === 'paused'
        ) {
          // If plan already exists with unexecuted events, executeTask will resume locally (0 API calls)
          return { ...t, status: 'queued' as const, updatedAt: now };
        }
        return t;
      });
    writePersistedGroupTasks(this.tasks);
    this.registerLifecycleHooks();
  }

  public static getInstance(): GroupReplyTaskManager {
    if (!GroupReplyTaskManager.instance) {
      GroupReplyTaskManager.instance = new GroupReplyTaskManager();
    }
    return GroupReplyTaskManager.instance;
  }

  private registerLifecycleHooks(): void {
    if (this.lifecycleHooksRegistered) return;
    this.lifecycleHooksRegistered = true;

    registerPendingTaskCountProvider(
      () => this.tasks.filter((t) => isRunningStatus(t.status)).length
    );

    registerBackendResumeHandler(() => {
      const hasWaitingOrQueued = this.tasks.some(
        (t) => t.status === 'queued' || t.status === 'waiting_backend'
      );
      if (hasWaitingOrQueued) {
        this.tasks = this.tasks.map((t) =>
          t.status === 'waiting_backend' ? { ...t, status: 'queued', updatedAt: Date.now() } : t
        );
        this.notify();
        void this.processQueue();
      }
    });
  }

  public init(): void {
    if (this.initialized) {
      void this.processQueue();
      return;
    }
    this.initialized = true;
    const hasPending = this.tasks.some((t) => t.status === 'queued');
    if (hasPending) {
      void this.processQueue();
    }
  }

  /**
   * Preserved for backward API compatibility.
   * Note: `apiFetch` already records the single `/api/gemini/group-chat` API monitor log
   * via `recordApiLog(data.log)`, so we intentionally avoid double-logging here.
   */
  public setApiLogHandler(_cb: ((log: ApiLog) => void) | null): void {
    // Intentionally no-op: apiFetch owns single-entry API monitoring for /api/gemini/group-chat
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    writePersistedGroupTasks(this.tasks);
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[GroupReplyTaskManager] listener error:', e);
      }
    });
  }

  public hasActiveOrPausedRound(groupId: string): boolean {
    return this.tasks.some((t) => t.groupId === groupId && isActiveOrPausedStatus(t.status));
  }

  public getGroupTaskState(groupId: string): GroupActivePlaybackIndicator | null {
    const active = this.tasks.find(
      (t) => t.groupId === groupId && isActiveOrPausedStatus(t.status)
    );
    if (!active) return null;

    const controller = this.controllersByGroupId.get(groupId);
    if (controller && controller.taskId === active.id && controller.indicator) {
      return {
        ...controller.indicator,
        status: controller.paused ? 'paused' : active.status,
        targetAiId: active.targetAiId,
        activePollId: controller.indicator.activePollId || active.targetPollId,
      };
    }

    const totalEventCount = active.plan?.events?.length;
    const executedCount = active.executedEventIds?.length || 0;
    const remainingEventCount =
      typeof totalEventCount === 'number' ? Math.max(0, totalEventCount - executedCount) : undefined;

    return {
      status: active.status,
      roundId: active.roundId,
      targetAiId: active.targetAiId,
      activeActionType:
        active.triggerType === 'invite_poll_vote' && active.status === 'generating'
          ? 'voting'
          : active.status === 'generating'
            ? 'thinking'
            : undefined,
      activePollId: active.targetPollId,
      remainingEventCount,
      totalEventCount,
    };
  }

  public getGroupFailedTask(groupId: string): { task: GroupReplyTask; error: string } | null {
    const failed = [...this.tasks]
      .reverse()
      .find(
        (t) => t.groupId === groupId && (t.status === 'failed' || t.status === 'waiting_backend')
      );
    if (!failed) return null;
    return {
      task: failed,
      error: failed.error || '群聊 AI 回复生成失败，请检查后端或网络后重试',
    };
  }

  public clearFailedTask(groupId: string): void {
    const next = this.tasks.filter(
      (t) => !(t.groupId === groupId && (t.status === 'failed' || t.status === 'waiting_backend'))
    );
    if (next.length !== this.tasks.length) {
      this.tasks = next;
      this.notify();
    }
  }

  public async retryFailedTask(groupId: string): Promise<boolean> {
    const failedIdx = this.tasks.findIndex(
      (t) => t.groupId === groupId && (t.status === 'failed' || t.status === 'waiting_backend')
    );
    if (failedIdx === -1) return false;

    const failedTask = this.tasks[failedIdx];
    this.tasks[failedIdx] = {
      ...failedTask,
      status: 'queued',
      retryCount: 0,
      error: undefined,
      updatedAt: Date.now(),
    };
    this.notify();
    void this.processQueue();
    return true;
  }

  /**
   * Pause the currently playing group discussion timeline locally.
   * Already-displayed messages & votes remain untouched; unexecuted events stay queued.
   */
  public pauseGroupDiscussion(groupId: string): boolean {
    const active = this.tasks.find(
      (t) => t.groupId === groupId && (t.status === 'delivering' || t.status === 'generating')
    );
    if (!active) return false;

    const controller = this.controllersByGroupId.get(groupId);
    if (controller && controller.taskId === active.id) {
      controller.pause();
    }
    this.updateTask(active.id, { status: 'paused' });
    return true;
  }

  /**
   * Resume a paused group discussion timeline locally (ZERO extra model API calls).
   */
  public resumeGroupDiscussion(groupId: string): boolean {
    const pausedTask = this.tasks.find(
      (t) => t.groupId === groupId && t.status === 'paused'
    );
    if (!pausedTask) return false;

    const controller = this.controllersByGroupId.get(groupId);
    if (controller && controller.taskId === pausedTask.id && !controller.cancelled) {
      controller.resume();
      this.updateTask(pausedTask.id, { status: 'delivering' });
      return true;
    }

    // Restored paused task after App restart: queue local playback directly
    this.updateTask(pausedTask.id, { status: 'queued' });
    void this.processQueue();
    return true;
  }

  /**
   * Stop the currently running or paused group discussion immediately.
   * Keeps already-persisted messages & votes and discards remaining unexecuted events.
   */
  public stopGroupDiscussion(groupId: string): boolean {
    const controller = this.controllersByGroupId.get(groupId);
    if (controller) {
      controller.cancel();
      this.controllersByGroupId.delete(groupId);
    }

    const beforeLen = this.tasks.length;
    this.tasks = this.tasks.filter(
      (t) => !(t.groupId === groupId && isActiveOrPausedStatus(t.status))
    );
    if (this.tasks.length !== beforeLen || controller) {
      this.activeGroupIds.delete(groupId);
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * User Mid-Round Interjection (Requirement VI):
   * - Immediately cancels any remaining unexecuted events of the current round
   * - Keeps all already-displayed messages & applied votes
   * - Marks the old roundId as interrupted and removes it from active queue
   * - Enqueues ONE fresh unified round with the user's new message in latest context
   */
  public async interruptForUserMessage(
    groupId: string,
    userMsg: GroupChatMessage,
    options?: {
      targetAiId?: string;
      mentionedTargets?: string[];
    }
  ): Promise<GroupReplyTask | null> {
    const controller = this.controllersByGroupId.get(groupId);
    if (controller) {
      controller.cancel();
      this.controllersByGroupId.delete(groupId);
    }

    // Mark and drop any active/paused round for this group
    this.tasks = this.tasks
      .map((t) =>
        t.groupId === groupId && isActiveOrPausedStatus(t.status)
          ? { ...t, status: 'interrupted' as const, interruptedByUser: true, updatedAt: Date.now() }
          : t
      )
      .filter((t) => t.status !== 'interrupted');

    this.activeGroupIds.delete(groupId);
    this.notify();

    return this.enqueueTask({
      groupId,
      triggerType: 'user_interrupt',
      targetAiId: options?.targetAiId,
      latestUserMessageId: userMsg.id,
      latestUserText: userMsg.text,
      mentionedTargets: options?.mentionedTargets || userMsg.mentionedMemberIds || [],
      chainDepth: 0,
      dedupeKey: `${groupId}:interrupt:${userMsg.id}`,
    });
  }

  /**
   * Invite group AIs to participate in a poll using ONE unified /api/gemini/group-chat round.
   * Replaces legacy per-AI multi-request voting loops.
   */
  public async enqueuePollVoteRound(
    groupId: string,
    pollMessageId: string
  ): Promise<GroupReplyTask | null> {
    return this.enqueueTask({
      groupId,
      triggerType: 'invite_poll_vote',
      targetPollId: pollMessageId,
      mentionedTargets: [],
      chainDepth: 0,
      dedupeKey: `poll:${groupId}:${pollMessageId}:${Math.floor(Date.now() / 1500)}`,
    });
  }

  public async enqueueTask(params: {
    groupId: string;
    triggerType?: GroupRoundTriggerType;
    targetAiId?: string;
    targetPollId?: string;
    latestUserMessageId?: string;
    latestUserText?: string;
    mentionedTargets?: string[];
    chainDepth?: number;
    dedupeKey?: string;
  }): Promise<GroupReplyTask | null> {
    const existingActive = this.tasks.find(
      (t) => t.groupId === params.groupId && isActiveOrPausedStatus(t.status)
    );
    if (existingActive) {
      console.warn('[GroupReplyTaskManager] 当前群聊已有进行中或已暂停的讨论回合，忽略重复触发');
      return null;
    }

    const triggerType: GroupRoundTriggerType = params.triggerType || 'user_double_click';
    const dedupeKey =
      params.dedupeKey ||
      `${params.groupId}:${triggerType}:${params.latestUserMessageId || params.targetPollId || 'summon'}:${
        params.targetAiId || 'auto'
      }`;

    const now = Date.now();
    const lastCreatedAt = this.recentDedupeTimestamps.get(dedupeKey) || 0;
    if (now - lastCreatedAt < 1200) {
      console.warn('[GroupReplyTaskManager] Deduplicated duplicate group trigger:', dedupeKey);
      return null;
    }
    this.recentDedupeTimestamps.set(dedupeKey, now);

    // Clear previous failed task for this group once user triggers a fresh round
    this.tasks = this.tasks.filter(
      (t) => !(t.groupId === params.groupId && (t.status === 'failed' || t.status === 'waiting_backend'))
    );

    const suffix = Math.random().toString(36).slice(2, 6);
    const roundId = `r_${now}_${suffix}`;
    const task: GroupReplyTask = {
      id: `grptask_${params.groupId}_${now}_${suffix}`,
      roundId,
      groupId: params.groupId,
      triggerType,
      targetAiId: params.targetAiId,
      targetPollId: params.targetPollId,
      latestUserMessageId: params.latestUserMessageId,
      latestUserText: params.latestUserText,
      mentionedTargets: params.mentionedTargets || [],
      dedupeKey,
      chainDepth: params.chainDepth || 0,
      status: 'queued',
      retryCount: 0,
      maxRetries: 1,
      executedEventIds: [],
      executedBubbleKeys: [],
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.push(task);
    this.notify();
    void this.processQueue();
    return task;
  }

  private updateTask(taskId: string, patch: Partial<GroupReplyTask>): GroupReplyTask | undefined {
    const idx = this.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    const updated: GroupReplyTask = {
      ...this.tasks[idx],
      ...patch,
      updatedAt: Date.now(),
    };
    this.tasks[idx] = updated;
    this.notify();
    return updated;
  }

  private async processQueue(): Promise<void> {
    const queued = this.tasks.filter((t) => t.status === 'queued');
    for (const task of queued) {
      if (this.activeGroupIds.has(task.groupId)) {
        continue;
      }
      void this.executeTask(task.id);
    }
  }

  private async executeTask(taskId: string): Promise<void> {
    const initial = this.tasks.find((t) => t.id === taskId);
    if (!initial) return;

    this.activeGroupIds.add(initial.groupId);
    const controller = new GroupPlaybackController(taskId, false);
    this.controllersByGroupId.set(initial.groupId, controller);

    try {
      let currentTask = this.tasks.find((t) => t.id === taskId);
      if (!currentTask || controller.cancelled) return;

      // Step 1: Plan the round via ONE unified /api/gemini/group-chat call (skip if plan already persisted!)
      if (!currentTask.plan || !hasRemainingPlanEvents(currentTask)) {
        if (!currentTask.plan) {
          this.updateTask(taskId, { status: 'generating', error: undefined });

          const { group: activeGroup } = await loadLatestGroupFromStore(currentTask.groupId);
          if (!activeGroup) {
            throw new Error('群聊不存在或已被删除');
          }
          if (controller.cancelled) return;

          const plan = await orchestrateGroupRound({
            group: activeGroup,
            task: currentTask,
          });

          if (controller.cancelled) return;

          currentTask = this.updateTask(taskId, {
            plan,
            roundId: plan.roundId,
            status: controller.paused ? 'paused' : 'delivering',
            error: undefined,
          });
          if (!currentTask) return;
        }
      } else {
        // Resuming a persisted timeline after App restart: ZERO model API calls
        currentTask = this.updateTask(taskId, {
          status: controller.paused ? 'paused' : 'delivering',
          error: undefined,
        });
        if (!currentTask) return;
      }

      // Step 2: Purely local timeline playback (messages + real poll votes)
      const outcome = await executeGroupTimelinePlan({
        task: currentTask,
        signal: controller.createSignal(),
        callbacks: {
          onIndicatorChange: (indicator) => {
            if (controller.cancelled) return;
            controller.indicator = indicator
              ? {
                  ...indicator,
                  status: controller.paused ? 'paused' : indicator.status,
                }
              : null;
            this.notify();
          },
          onBubbleExecuted: (bubbleKey) => {
            const idx = this.tasks.findIndex((t) => t.id === taskId);
            if (idx === -1) return;
            const existing = this.tasks[idx].executedBubbleKeys || [];
            if (!existing.includes(bubbleKey)) {
              this.tasks[idx] = {
                ...this.tasks[idx],
                executedBubbleKeys: [...existing, bubbleKey],
                updatedAt: Date.now(),
              };
              writePersistedGroupTasks(this.tasks);
            }
          },
          onEventExecuted: (eventId) => {
            const idx = this.tasks.findIndex((t) => t.id === taskId);
            if (idx === -1) return;
            const existing = this.tasks[idx].executedEventIds || [];
            if (!existing.includes(eventId)) {
              this.tasks[idx] = {
                ...this.tasks[idx],
                executedEventIds: [...existing, eventId],
                updatedAt: Date.now(),
              };
              this.notify();
            }
          },
        },
      });

      if (outcome === 'cancelled' || controller.cancelled) {
        return;
      }

      // Round finished cleanly: remove task from queue (ZERO follow-up/chain API calls!)
      this.updateTask(taskId, { status: 'completed', error: undefined });
      this.tasks = this.tasks.filter((t) => t.id !== taskId);
      this.notify();
    } catch (err: any) {
      if (controller.cancelled) return;
      const current = this.tasks.find((t) => t.id === taskId);
      if (!current) return;

      const message = err?.message || '群聊 AI 回复生成失败，请检查内置后端或 API 配置';
      const lowerMsg = String(message || '').toLowerCase();
      const causeCode = String(err?.causeCode || err?.cause?.code || '').toUpperCase();
      const preventAutoRetry =
        Boolean(err?.mayHaveBeenCharged) ||
        err?.statusCode === 401 ||
        err?.statusCode === 403 ||
        err?.statusCode === 404 ||
        err?.statusCode === 429 ||
        causeCode === 'ECONNRESET' ||
        causeCode === 'UND_ERR_SOCKET' ||
        causeCode === 'UND_ERR_BODY_TIMEOUT' ||
        causeCode === 'ETIMEDOUT' ||
        lowerMsg.includes('fetch failed') ||
        lowerMsg.includes('econnreset') ||
        lowerMsg.includes('und_err_socket') ||
        lowerMsg.includes('请求超时') ||
        lowerMsg.includes('已产生扣费');

      if (isBackendUnavailableError(err)) {
        this.updateTask(taskId, {
          status: 'waiting_backend',
          error: message,
        });
      } else if (!preventAutoRetry && !current.plan && (current.retryCount || 0) < current.maxRetries) {
        const nextRetry = (current.retryCount || 0) + 1;
        this.updateTask(taskId, {
          status: 'queued',
          retryCount: nextRetry,
          error: message,
        });
        setTimeout(() => {
          void this.processQueue();
        }, 1800);
      } else {
        if (preventAutoRetry) {
          console.warn(
            `[GroupReplyTaskManager] Skipping auto-retry for task ${taskId} to avoid duplicate billing (mayHaveBeenCharged=${Boolean(err?.mayHaveBeenCharged)}, causeCode=${causeCode || 'none'}).`
          );
        }
        this.updateTask(taskId, {
          status: 'failed',
          error: message,
        });
      }
    } finally {
      if (this.controllersByGroupId.get(initial.groupId) === controller) {
        this.controllersByGroupId.delete(initial.groupId);
        this.activeGroupIds.delete(initial.groupId);
      }
      void this.processQueue();
    }
  }
}

export const groupReplyTaskManager = GroupReplyTaskManager.getInstance();
