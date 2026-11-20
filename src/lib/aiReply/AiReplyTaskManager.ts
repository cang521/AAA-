import {
  AiReplyTask,
  AiReplyTaskStatus,
  saveReplyTask,
  getPendingOrRunningTasks,
  updateTaskStatus,
  clearCompletedTasks,
} from './AiReplyTaskStore';
import { executeAiReplyTask } from './AiReplyExecutor';
import { ChatMessage, AiCharacter } from '../../types';
import { saveChatMessage } from '../chatDb';
import { loadFromStorage } from '../storage';
import {
  ensureBackendReady,
  isBackendUnavailableError,
  registerBackendResumeHandler,
  registerPendingTaskCountProvider,
} from '../localBackend';

type TaskChangeListener = () => void;

export class AiReplyTaskManager {
  private static instance: AiReplyTaskManager;
  private listeners: Set<TaskChangeListener> = new Set();
  private activeExecutions: Set<string> = new Set(); // characterIds currently processing
  private characterTaskStates: Map<string, AiReplyTaskStatus> = new Map();
  private enqueuedMessageIds: Set<string> = new Set(); // Prevent duplicate tasks for same user messages
  private failedTasks: Map<string, { task: AiReplyTask; error: string }> = new Map();
  private isInitialized = false;
  private lifecycleRegistered = false;

  private constructor() {
    this.registerLifecycleHooks();
  }

  private registerLifecycleHooks(): void {
    if (this.lifecycleRegistered) return;
    this.lifecycleRegistered = true;

    registerPendingTaskCountProvider(() => {
      let count = 0;
      this.characterTaskStates.forEach((status) => {
        if (
          status &&
          status !== 'completed' &&
          status !== 'failed' &&
          status !== 'waiting_backend'
        ) {
          count += 1;
        }
      });
      return count;
    });

    registerBackendResumeHandler(() => {
      if (this.isInitialized) {
        void this.processQueue();
      }
    });
  }

  public static getInstance(): AiReplyTaskManager {
    if (!AiReplyTaskManager.instance) {
      AiReplyTaskManager.instance = new AiReplyTaskManager();
    }
    return AiReplyTaskManager.instance;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) {
      this.processQueue();
      return;
    }
    this.isInitialized = true;

    try {
      // Clear old completed/failed tasks
      await clearCompletedTasks().catch(() => {});

      // Reset stuck running or waiting_backend tasks to queued on next App launch
      const pendingOrRunning = await getPendingOrRunningTasks();
      for (const task of pendingOrRunning) {
        if (
          task.status === 'running' ||
          task.status === 'preparing' ||
          task.status === 'generating' ||
          task.status === 'delivering' ||
          task.status === 'waiting_backend'
        ) {
          await updateTaskStatus(task.id, 'queued');
        }
      }

      // Process queue
      this.processQueue();
    } catch (err) {
      console.error('[AiReplyTaskManager] init error:', err);
    }
  }

  public subscribe(listener: TaskChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('[AiReplyTaskManager] listener error:', e);
      }
    });
  }

  public isCharacterThinking(characterId: string): boolean {
    const status = this.characterTaskStates.get(characterId);
    return (
      !!status &&
      status !== 'completed' &&
      status !== 'failed' &&
      status !== 'waiting_backend'
    );
  }

  public getCharacterTaskState(characterId: string): AiReplyTaskStatus | null {
    const status = this.characterTaskStates.get(characterId);
    if (
      status &&
      status !== 'completed' &&
      status !== 'failed' &&
      status !== 'waiting_backend'
    ) {
      return status;
    }
    return null;
  }

  public getCharacterFailedTask(characterId: string): { task: AiReplyTask; error: string } | null {
    return this.failedTasks.get(characterId) || null;
  }

  public clearFailedTask(characterId: string): void {
    this.failedTasks.delete(characterId);
    this.notifyListeners();
  }

  public async retryFailedTask(characterId: string): Promise<boolean> {
    const failedInfo = this.failedTasks.get(characterId);
    if (!failedInfo) return false;
    this.failedTasks.delete(characterId);

    const task = failedInfo.task;
    task.retryCount = 0;
    task.status = 'queued';
    task.updatedAt = Date.now();
    await updateTaskStatus(task.id, 'queued');
    this.characterTaskStates.set(characterId, 'queued');
    this.notifyListeners();
    this.processQueue();
    return true;
  }

  public async enqueueTask(params: {
    characterId: string;
    userMessages: ChatMessage[];
    combinedUserText: string;
    currentTurnMessageIds: string[];
    currentImageAnalysis?: any;
    options?: { vibrationPattern?: number[] };
  }): Promise<AiReplyTask | null> {
    // Defense-in-depth: Deduplicate tasks for the same user messages
    const newTurnMsgIds = (params.currentTurnMessageIds || []).filter((id) => !this.enqueuedMessageIds.has(id));
    if (newTurnMsgIds.length === 0 && params.userMessages.length > 0) {
      console.warn('[AiReplyTaskManager] 消息已在回复队列中，忽略重复创建任务');
      return null;
    }
    newTurnMsgIds.forEach((id) => this.enqueuedMessageIds.add(id));

    // Clear previous failed task when new task is created
    this.failedTasks.delete(params.characterId);

    const taskId = 'task_' + params.characterId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const turnId = 'turn_ai_' + params.characterId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newTask: AiReplyTask = {
      id: taskId,
      characterId: params.characterId,
      userMessages: params.userMessages,
      combinedUserText: params.combinedUserText,
      currentTurnMessageIds: params.currentTurnMessageIds,
      currentImageAnalysis: params.currentImageAnalysis,
      status: 'queued',
      retryCount: 0,
      maxRetries: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      turnId,
      options: params.options,
    };

    this.characterTaskStates.set(params.characterId, 'queued');
    await saveReplyTask(newTask);
    this.notifyListeners();
    this.processQueue();
    return newTask;
  }

  public async enqueueRerollTask(params: {
    characterId: string;
    userMessages: ChatMessage[];
    combinedUserText: string;
    currentTurnMessageIds: string[];
    currentImageAnalysis?: any;
    replaceTurnId?: string;
    replaceMessageIds: string[];
    conversationHistoryOverride?: ChatMessage[];
    options?: { vibrationPattern?: number[] };
  }): Promise<AiReplyTask | null> {
    if (this.activeExecutions.has(params.characterId) || this.characterTaskStates.get(params.characterId)) {
      console.warn('[AiReplyTaskManager] 角色当前正处于生成/回复中，请勿重复发起重Roll');
      return null;
    }

    this.failedTasks.delete(params.characterId);

    const taskId = 'task_reroll_' + params.characterId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const turnId = 'turn_ai_' + params.characterId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    const newTask: AiReplyTask = {
      id: taskId,
      characterId: params.characterId,
      userMessages: params.userMessages,
      combinedUserText: params.combinedUserText,
      currentTurnMessageIds: params.currentTurnMessageIds,
      currentImageAnalysis: params.currentImageAnalysis,
      status: 'queued',
      retryCount: 0,
      maxRetries: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      turnId,
      isReroll: true,
      replaceTurnId: params.replaceTurnId,
      replaceMessageIds: params.replaceMessageIds,
      conversationHistoryOverride: params.conversationHistoryOverride,
      options: params.options,
    };

    this.characterTaskStates.set(params.characterId, 'queued');
    await saveReplyTask(newTask);
    this.notifyListeners();
    this.processQueue();
    return newTask;
  }

  private async processQueue(): Promise<void> {
    try {
      const pendingTasks = await getPendingOrRunningTasks();
      const nextPending = pendingTasks.filter((t) => t.status === 'queued' || t.status === 'pending');

      for (const task of nextPending) {
        if (this.activeExecutions.has(task.characterId)) {
          // Already running a task for this character, execute sequentially
          continue;
        }

        this.executeTaskInBackground(task);
      }
    } catch (err) {
      console.error('[AiReplyTaskManager] processQueue error:', err);
    }
  }

  private async executeTaskInBackground(task: AiReplyTask): Promise<void> {
    const { characterId, id: taskId } = task;
    this.activeExecutions.add(characterId);
    this.characterTaskStates.set(characterId, 'preparing');
    this.notifyListeners();

    try {
      await ensureBackendReady(`single_chat:${characterId}`);
      await updateTaskStatus(taskId, 'preparing');
      this.notifyListeners();

      await executeAiReplyTask(task, async (status) => {
        this.characterTaskStates.set(characterId, status);
        await updateTaskStatus(taskId, status);
        this.notifyListeners();
      });

      this.characterTaskStates.set(characterId, 'completed');
      this.failedTasks.delete(characterId);
      await updateTaskStatus(taskId, 'completed');
    } catch (err: any) {
      console.error(`[AiReplyTaskManager] Task ${taskId} failed:`, err);
      const errMessage = err?.message || '模型回复请求失败或超时';

      if (isBackendUnavailableError(err)) {
        // Backend unavailable: preserve task in waiting_backend without deleting user messages
        // or blind-retrying Nodejs.start(). Clicking Retry resumes this exact task; next App launch auto-resumes it.
        task.status = 'waiting_backend';
        task.error = errMessage;
        task.updatedAt = Date.now();
        this.characterTaskStates.set(characterId, 'waiting_backend');
        await updateTaskStatus(taskId, 'waiting_backend', { error: errMessage });
        this.failedTasks.set(characterId, {
          task,
          error: errMessage,
        });
      } else {
        const currentRetry = task.retryCount || 0;

        if (currentRetry < task.maxRetries) {
          const nextRetry = currentRetry + 1;
          console.warn(`[AiReplyTaskManager] Retrying task ${taskId} (attempt ${nextRetry}/${task.maxRetries})...`);
          this.characterTaskStates.set(characterId, 'queued');
          await updateTaskStatus(taskId, 'queued', { retryCount: nextRetry, error: errMessage });
          setTimeout(() => this.processQueue(), 2000);
        } else {
          this.characterTaskStates.set(characterId, 'failed');
          await updateTaskStatus(taskId, 'failed', { error: errMessage });

          // Record failed task so UI can show real error and allow user to retry.
          // DO NOT write a fake warm message pretending the model succeeded!
          // The original user message is already securely saved in IndexedDB.
          this.failedTasks.set(characterId, {
            task,
            error: task.isReroll
              ? `重新生成回复失败 (${errMessage})，原回复已完整保留`
              : errMessage,
          });
        }
      }
    } finally {
      this.activeExecutions.delete(characterId);
      this.characterTaskStates.delete(characterId);
      this.notifyListeners();
      // Continue processing next pending task in queue
      this.processQueue();
    }
  }
}

export const aiReplyTaskManager = AiReplyTaskManager.getInstance();
