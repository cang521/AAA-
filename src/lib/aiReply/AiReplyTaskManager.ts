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

type TaskChangeListener = () => void;

export class AiReplyTaskManager {
  private static instance: AiReplyTaskManager;
  private listeners: Set<TaskChangeListener> = new Set();
  private activeExecutions: Set<string> = new Set(); // characterIds currently processing
  private characterTaskStates: Map<string, AiReplyTaskStatus> = new Map();
  private isInitialized = false;

  private constructor() {}

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

      // Reset stuck running tasks to queued on app restart
      const pendingOrRunning = await getPendingOrRunningTasks();
      for (const task of pendingOrRunning) {
        if (task.status === 'running' || task.status === 'preparing' || task.status === 'generating' || task.status === 'delivering') {
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
    return !!status && status !== 'completed' && status !== 'failed';
  }

  public getCharacterTaskState(characterId: string): AiReplyTaskStatus | null {
    const status = this.characterTaskStates.get(characterId);
    if (status && status !== 'completed' && status !== 'failed') {
      return status;
    }
    return null;
  }

  public async enqueueTask(params: {
    characterId: string;
    userMessages: ChatMessage[];
    combinedUserText: string;
    currentTurnMessageIds: string[];
    currentImageAnalysis?: any;
    options?: { vibrationPattern?: number[] };
  }): Promise<AiReplyTask> {
    const taskId = 'task_' + params.characterId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
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
      await updateTaskStatus(taskId, 'preparing');
      this.notifyListeners();

      await executeAiReplyTask(task, async (status) => {
        this.characterTaskStates.set(characterId, status);
        await updateTaskStatus(taskId, status);
        this.notifyListeners();
      });

      this.characterTaskStates.set(characterId, 'completed');
      await updateTaskStatus(taskId, 'completed');
    } catch (err: any) {
      console.error(`[AiReplyTaskManager] Task ${taskId} failed:`, err);
      const currentRetry = task.retryCount || 0;

      if (currentRetry < task.maxRetries) {
        const nextRetry = currentRetry + 1;
        console.warn(`[AiReplyTaskManager] Retrying task ${taskId} (attempt ${nextRetry}/${task.maxRetries})...`);
        this.characterTaskStates.set(characterId, 'queued');
        await updateTaskStatus(taskId, 'queued', { retryCount: nextRetry, error: err?.message });
        setTimeout(() => this.processQueue(), 2000);
      } else {
        this.characterTaskStates.set(characterId, 'failed');
        await updateTaskStatus(taskId, 'failed', { error: err?.message || 'Execution failed' });

        // Save fallback warm message to IndexedDB so conversation doesn't stall silently
        const characters = loadFromStorage<AiCharacter[]>('phone_ai_characters', []);
        const character = characters.find((c) => c.id === characterId);
        const charName = character?.name || 'AI';

        const fallbackMsg: ChatMessage = {
          id: 'msg_' + Date.now() + '_fallback',
          characterId,
          sender: 'ai',
          text: `${charName}: 刚刚网络开小差了，不过我已经收到你的消息啦！随时跟我说说你的近况吧~`,
          timestamp: Date.now(),
          thinkingProcess: '【网络与系统连接偏离离线恢复预案】',
        };
        await saveChatMessage(fallbackMsg).catch(() => {});
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
