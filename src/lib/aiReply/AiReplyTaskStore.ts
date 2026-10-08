import { ChatMessage } from '../../types';
import { getDb, STORE_REPLY_TASKS } from '../chatDb';

export type AiReplyTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AiReplyTask {
  id: string;
  characterId: string;
  userMessages: ChatMessage[];
  combinedUserText: string;
  currentTurnMessageIds: string[];
  currentImageAnalysis?: any;
  status: AiReplyTaskStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
  options?: {
    vibrationPattern?: number[];
  };
}

export async function saveReplyTask(task: AiReplyTask): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction([STORE_REPLY_TASKS], 'readwrite');
    const store = tx.objectStore(STORE_REPLY_TASKS);
    store.put(task);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[AiReplyTaskStore] saveReplyTask error:', err);
  }
}

export async function getReplyTask(id: string): Promise<AiReplyTask | null> {
  try {
    const db = await getDb();
    const tx = db.transaction([STORE_REPLY_TASKS], 'readonly');
    const store = tx.objectStore(STORE_REPLY_TASKS);
    const req = store.get(id);
    return await new Promise<AiReplyTask | null>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[AiReplyTaskStore] getReplyTask error:', err);
    return null;
  }
}

export async function getAllTasks(): Promise<AiReplyTask[]> {
  try {
    const db = await getDb();
    const tx = db.transaction([STORE_REPLY_TASKS], 'readonly');
    const store = tx.objectStore(STORE_REPLY_TASKS);
    const req = store.getAll();
    return await new Promise<AiReplyTask[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[AiReplyTaskStore] getAllTasks error:', err);
    return [];
  }
}

export async function getPendingOrRunningTasks(): Promise<AiReplyTask[]> {
  try {
    const tasks = await getAllTasks();
    return tasks
      .filter((t) => t.status === 'pending' || t.status === 'running')
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch (err) {
    console.error('[AiReplyTaskStore] getPendingOrRunningTasks error:', err);
    return [];
  }
}

export async function getTasksForCharacter(characterId: string): Promise<AiReplyTask[]> {
  try {
    const tasks = await getAllTasks();
    return tasks
      .filter((t) => t.characterId === characterId)
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch (err) {
    console.error('[AiReplyTaskStore] getTasksForCharacter error:', err);
    return [];
  }
}

export async function updateTaskStatus(
  id: string,
  status: AiReplyTaskStatus,
  extra?: { retryCount?: number; error?: string }
): Promise<void> {
  try {
    const task = await getReplyTask(id);
    if (!task) return;
    task.status = status;
    task.updatedAt = Date.now();
    if (typeof extra?.retryCount === 'number') {
      task.retryCount = extra.retryCount;
    }
    if (extra?.error !== undefined) {
      task.error = extra.error;
    }
    await saveReplyTask(task);
  } catch (err) {
    console.error('[AiReplyTaskStore] updateTaskStatus error:', err);
  }
}

export async function deleteReplyTask(id: string): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction([STORE_REPLY_TASKS], 'readwrite');
    const store = tx.objectStore(STORE_REPLY_TASKS);
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[AiReplyTaskStore] deleteReplyTask error:', err);
  }
}

export async function clearCompletedTasks(): Promise<void> {
  try {
    const tasks = await getAllTasks();
    const now = Date.now();
    // Delete completed or failed tasks older than 1 hour
    for (const t of tasks) {
      if ((t.status === 'completed' || t.status === 'failed') && now - t.updatedAt > 3600000) {
        await deleteReplyTask(t.id);
      }
    }
  } catch (err) {
    console.error('[AiReplyTaskStore] clearCompletedTasks error:', err);
  }
}
