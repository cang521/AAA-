/**
 * ImportJournal.ts
 * Import session management, real-time metrics tracking, and batch progress reporter.
 */

export interface ImportProgressState {
  sessionId: string;
  status: 'idle' | 'analyzing' | 'importing' | 'completed' | 'failed' | 'cancelled';
  fileName: string;
  fileSize: number;
  processedBytes: number;
  percentage: number; // 0 - 100
  totalFiles: number;
  processedFiles: number;
  currentFileName: string;
  processedMessagesCount: number;
  processedCharactersCount: number;
  processedMemoriesCount: number;
  processedGroupsCount: number;
  currentBatchIndex: number;
  totalBatchEstimate: number;
  currentStageMessage: string;
  errorMessage?: string;
  warnings: string[];
}

export type ProgressCallback = (state: ImportProgressState) => void;

export class ImportJournal {
  private state: ImportProgressState;
  private listeners: Set<ProgressCallback> = new Set();

  constructor(fileName: string, fileSize: number) {
    this.state = {
      sessionId: `import_session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'idle',
      fileName,
      fileSize,
      processedBytes: 0,
      percentage: 0,
      totalFiles: 0,
      processedFiles: 0,
      currentFileName: '',
      processedMessagesCount: 0,
      processedCharactersCount: 0,
      processedMemoriesCount: 0,
      processedGroupsCount: 0,
      currentBatchIndex: 0,
      totalBatchEstimate: 1,
      currentStageMessage: '准备就绪',
      warnings: [],
    };
  }

  public subscribe(callback: ProgressCallback): () => void {
    this.listeners.add(callback);
    callback({ ...this.state });
    return () => this.listeners.delete(callback);
  }

  public update(patch: Partial<ImportProgressState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  public addWarning(warning: string): void {
    this.state.warnings.push(warning);
    this.notify();
  }

  public addMessages(count: number): void {
    this.state.processedMessagesCount += count;
    this.notify();
  }

  public addCharacters(count: number): void {
    this.state.processedCharactersCount += count;
    this.notify();
  }

  public addMemories(count: number): void {
    this.state.processedMemoriesCount += count;
    this.notify();
  }

  public addGroups(count: number): void {
    this.state.processedGroupsCount += count;
    this.notify();
  }

  private notify(): void {
    const currentState = { ...this.state };
    this.listeners.forEach((fn) => {
      try {
        fn(currentState);
      } catch (e) {
        console.error('Progress callback error', e);
      }
    });
  }

  private abortController: AbortController = new AbortController();

  public getSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public cancel(): void {
    this.abortController.abort();
    this.update({
      status: 'cancelled',
      currentStageMessage: '已取消导入，正在自动回滚撤销本次新增数据...',
    });
  }

  public isCancelled(): boolean {
    return this.abortController.signal.aborted;
  }

  public getSessionId(): string {
    return this.state.sessionId;
  }

  public getState(): ImportProgressState {
    return { ...this.state };
  }
}
