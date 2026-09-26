/**
 * LargeImportManager.ts
 * Streaming & Chunked Import Engine for Large Backup Files (100MB ~ Hundreds of MB).
 * Avoids single-chunk full memory loading, streams data in batches directly into IndexedDB.
 */

import { ChatMessage, AiCharacter, GroupChat, UserProfile, MenstrualData, ApiConfig, AiControls, AiPermissions, Memo, WorldBook } from '../../types';
import { ZipStreamReader, ZipEntry } from './ZipStreamReader';
import { ImportJournal, ImportProgressState, ProgressCallback } from './ImportJournal';
import {
  saveChatMessagesBulk,
  recordImportSessionBatch,
  rollbackImportSession,
  refreshDbMetaAndNotify,
} from '../chatDb';
import {
  loadCharacters,
  saveCharacters,
  loadGroupChats,
  saveGroupChats,
  loadUserProfile,
  saveUserProfile,
  loadSettings,
  saveSettings,
  loadMenstrualData,
  saveMenstrualData,
  loadApiConfig,
  saveApiConfig,
  loadAiControls,
  saveAiControls,
  loadPermissions,
  savePermissions,
  loadMemos,
  saveMemos,
  loadWorldBooks,
  saveWorldBooks,
} from '../storage';
import {
  FileIntelligenceReport,
  ImportParsedResult,
  ImportExecutionOptions,
  RecognitionMode,
  ImportParseOptions,
} from '../dataManagement';

const BATCH_SIZE = 1000; // Batch save every 1000 messages to prevent memory spike and DB lockups

export class LargeImportManager {
  /**
   * Fast Light-weight File Analysis (Reads Central Directory for ZIP / First Chunk for JSON/JSONL/TXT)
   */
  public static async analyzeFile(
    file: File,
    options: ImportParseOptions = {}
  ): Promise<ImportParsedResult> {
    const isZip = file.name.toLowerCase().endsWith('.zip');
    const isJsonl = file.name.toLowerCase().endsWith('.jsonl');
    const isTxt = file.name.toLowerCase().endsWith('.txt');

    if (isZip) {
      return await this.analyzeZipFile(file, options);
    } else if (isJsonl || isTxt) {
      return await this.analyzeTextChunkFile(file, options);
    } else {
      return await this.analyzeJsonChunkFile(file, options);
    }
  }

  /**
   * Analyze ZIP without unpacking all files into memory
   */
  private static async analyzeZipFile(
    file: File,
    options: ImportParseOptions
  ): Promise<ImportParsedResult> {
    const zipReader = new ZipStreamReader(file);
    const entries = await zipReader.parseCentralDirectory();

    let manifestText = '';
    let foundManifest = false;
    const characters: AiCharacter[] = [];
    const characterMatches: any[] = [];
    let estimatedMessageCount = 0;
    const fileTypes: Record<string, number> = {};

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const ext = entry.filename.split('.').pop()?.toLowerCase() || 'other';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;

      if (entry.filename.toLowerCase() === 'manifest.json' || entry.filename.toLowerCase().endsWith('/manifest.json')) {
        foundManifest = true;
        manifestText = await zipReader.readEntryText(entry);
      } else if (entry.filename.toLowerCase().includes('messages') || entry.filename.toLowerCase().includes('chat')) {
        // Rough estimate of messages based on uncompressed file size
        estimatedMessageCount += Math.round(entry.uncompressedSize / 150);
      }
    }

    // If manifest exists, parse system details
    let manifestData: any = null;
    if (foundManifest && manifestText) {
      try {
        manifestData = JSON.parse(manifestText);
        if (Array.isArray(manifestData.characters)) {
          characters.push(...manifestData.characters);
        }
      } catch (e) {
        console.warn('Failed to parse manifest in ZIP analysis', e);
      }
    }

    // Default character if none found in manifest
    if (characters.length === 0) {
      const localChars = loadCharacters();
      if (localChars.length > 0) {
        characters.push(localChars[0]);
      }
    }

    const report: FileIntelligenceReport = {
      confidence: 95,
      confidenceLevel: 'high',
      identifiedFormat: '分块可流式导入 ZIP 备份包',
      category: 'full_backup',
      categoryLabel: '全量备份与多角色压缩包',
      formatSignature: `ZIP Archive (${entries.length} 个文件, 约 ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      featuresDetected: [
        `Central Directory 目录秒解析`,
        `按需流式解压`,
        `估算包含约 ${estimatedMessageCount} 条对话`,
      ],
      zipDetails: {
        totalFiles: entries.length,
        fileTypes,
        hasManifest: foundManifest,
        isBatchCards: false,
      },
      analysisSummary: `捕获到 ${(file.size / 1024 / 1024).toFixed(1)}MB 大容量 ZIP 压缩包，已开启 Large Import Pipeline。`,
      actionSuggestion: '建议选择目标 AI 角色，点击“开始分块流式导入”。',
    };

    return {
      fileName: file.name,
      fileType: 'zip',
      fileSize: file.size,
      detectedSource: '大容量 ZIP 备份包 (Streaming Pipeline)',
      intelligenceReport: report,
      report,
      characters,
      messages: [], // Leave empty during analysis phase to avoid memory spike!
      groups: manifestData?.groups || [],
      memories: [],
      stats: {
        characterCount: characters.length,
        messageCount: estimatedMessageCount,
        groupCount: manifestData?.groups?.length || 0,
        memoryCount: 0,
        hasSettings: !!manifestData?.settings,
      },
      conflicts: [],
      characterMatches,
      warnings: [],
    };
  }

  /**
   * Analyze JSONL or TXT by reading only the first 250KB chunk
   */
  private static async analyzeTextChunkFile(
    file: File,
    options: ImportParseOptions
  ): Promise<ImportParsedResult> {
    const sampleBlob = file.slice(0, 256 * 1024);
    const sampleText = await sampleBlob.text();
    const lines = sampleText.split('\n').filter((l) => l.trim().length > 0);

    const estimatedTotalLines = Math.round((file.size / sampleBlob.size) * lines.length);

    const report: FileIntelligenceReport = {
      confidence: 90,
      confidenceLevel: 'high',
      identifiedFormat: file.name.endsWith('.jsonl') ? 'JSONL 行式聊天记录' : 'TXT 纯文本记录',
      category: 'chat_transcript',
      categoryLabel: '流式按行记录',
      formatSignature: `Line-by-Line Chunk Stream (${estimatedTotalLines} 行)`,
      featuresDetected: ['流式分块读取', '内存零等待'],
      analysisSummary: `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，预估包含 ${estimatedTotalLines} 行记录。`,
      actionSuggestion: '可以直接流式写入数据库。',
    };

    const localChars = loadCharacters();

    return {
      fileName: file.name,
      fileType: file.name.endsWith('.jsonl') ? 'jsonl' : 'txt',
      fileSize: file.size,
      detectedSource: '大文件文本/JSONL 流',
      intelligenceReport: report,
      report,
      characters: localChars,
      messages: [],
      groups: [],
      memories: [],
      stats: {
        characterCount: localChars.length,
        messageCount: estimatedTotalLines,
        groupCount: 0,
        memoryCount: 0,
        hasSettings: false,
      },
      conflicts: [],
      characterMatches: [],
      warnings: [],
    };
  }

  /**
   * Analyze JSON by reading sample header
   */
  private static async analyzeJsonChunkFile(
    file: File,
    options: ImportParseOptions
  ): Promise<ImportParsedResult> {
    const sampleBlob = file.slice(0, 512 * 1024);
    const sampleText = await sampleBlob.text();

    const localChars = loadCharacters();
    const estimatedItems = Math.round(file.size / 300);

    const report: FileIntelligenceReport = {
      confidence: 88,
      confidenceLevel: 'high',
      identifiedFormat: 'JSON 数据流',
      category: 'generic',
      categoryLabel: 'JSON 结构化流',
      formatSignature: `Chunked JSON (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      featuresDetected: ['增量位置解析', '批次落盘'],
      analysisSummary: `检测到 ${(file.size / 1024 / 1024).toFixed(1)}MB 的 JSON 导出的聊天记录。`,
      actionSuggestion: '点击“执行导入”后将进行增量分批写入。',
    };

    return {
      fileName: file.name,
      fileType: 'json',
      fileSize: file.size,
      detectedSource: '大文件 JSON 记录',
      intelligenceReport: report,
      report,
      characters: localChars,
      messages: [],
      groups: [],
      memories: [],
      stats: {
        characterCount: localChars.length,
        messageCount: estimatedItems,
        groupCount: 0,
        memoryCount: 0,
        hasSettings: false,
      },
      conflicts: [],
      characterMatches: [],
      warnings: [],
    };
  }

  /**
   * Main Execution Pipeline: Streams data in batches into IndexedDB without full memory load
   */
  public static async executeStreamingImport(
    file: File,
    executionOptions: ImportExecutionOptions,
    journal: ImportJournal
  ): Promise<void> {
    journal.update({
      status: 'importing',
      currentStageMessage: '正在建立流式导入 Transaction 管道...',
    });

    const targetCharacterId = executionOptions.unifiedTargetCharacterId || loadCharacters()[0]?.id || 'char_1';

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        await this.streamImportZip(file, targetCharacterId, executionOptions, journal);
      } else if (file.name.toLowerCase().endsWith('.jsonl') || file.name.toLowerCase().endsWith('.txt')) {
        await this.streamImportTextLines(file, targetCharacterId, executionOptions, journal);
      } else {
        await this.streamImportJsonChunked(file, targetCharacterId, executionOptions, journal);
      }

      journal.update({
        status: 'completed',
        percentage: 100,
        currentStageMessage: `流式导入完成！成功落盘 ${journal.getState().processedMessagesCount} 条聊天记录。`,
      });
    } catch (e: any) {
      if (e?.message === 'IMPORT_CANCELLED' || journal.isCancelled()) {
        journal.update({
          status: 'cancelled',
          currentStageMessage: '正在撤销回滚本次导入新增的数据...',
        });
        const revertedCount = await rollbackImportSession(journal.getSessionId());
        journal.update({
          status: 'cancelled',
          currentStageMessage: `已取消导入，成功撤销本次写入的 ${revertedCount} 条聊天记录。`,
        });
      } else {
        console.error('Streaming import error:', e);
        journal.update({
          status: 'failed',
          errorMessage: e?.message || '流式导入中断',
        });
        await rollbackImportSession(journal.getSessionId()).catch(() => {});
        throw e;
      }
    }
  }

  /**
   * Stream ZIP files entry by entry with streaming decompression for large entries
   */
  private static async streamImportZip(
    file: File,
    targetCharacterId: string,
    executionOptions: ImportExecutionOptions,
    journal: ImportJournal
  ): Promise<void> {
    const zipReader = new ZipStreamReader(file);
    const entries = await zipReader.parseCentralDirectory();

    const textEntries = entries.filter(
      (e) => !e.isDirectory && (e.filename.endsWith('.json') || e.filename.endsWith('.jsonl') || e.filename.endsWith('.txt'))
    );

    journal.update({
      totalFiles: textEntries.length,
      processedFiles: 0,
    });

    let currentBatch: ChatMessage[] = [];
    const sessionId = journal.getSessionId();

    for (let i = 0; i < textEntries.length; i++) {
      if (journal.isCancelled()) {
        throw new Error('IMPORT_CANCELLED');
      }

      const entry = textEntries[i];
      journal.update({
        currentFileName: entry.filename,
        processedFiles: i,
        percentage: Math.round(((i + 1) / textEntries.length) * 90),
        currentStageMessage: `流式解压解析 [${i + 1}/${textEntries.length}] ${entry.filename}...`,
      });

      if (entry.uncompressedSize > 5 * 1024 * 1024) {
        // Streaming decompression for large entries (>5MB)
        let entryBuffer = '';
        await zipReader.streamEntryTextChunks(
          entry,
          async (chunkText) => {
            if (journal.isCancelled()) throw new Error('IMPORT_CANCELLED');
            entryBuffer += chunkText;

            if (entry.filename.endsWith('.jsonl') || entry.filename.endsWith('.txt')) {
              const lines = entryBuffer.split('\n');
              entryBuffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const msg = this.parseSingleMessageLine(trimmed, targetCharacterId);
                if (msg) {
                  currentBatch.push(msg);
                  if (currentBatch.length >= BATCH_SIZE) {
                    await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
                    await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
                    journal.addMessages(currentBatch.length);
                    currentBatch = [];
                    await new Promise((r) => setTimeout(r, 0));
                  }
                }
              }
            } else {
              // Extract JSON objects incrementally
              const parsedBatch = this.parseMessagesFromText(entryBuffer, targetCharacterId);
              for (const msg of parsedBatch) {
                currentBatch.push(msg);
                if (currentBatch.length >= BATCH_SIZE) {
                  await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
                  await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
                  journal.addMessages(currentBatch.length);
                  currentBatch = [];
                  await new Promise((r) => setTimeout(r, 0));
                }
              }
              entryBuffer = '';
            }
          },
          journal.getSignal()
        );

        if (entryBuffer.trim()) {
          const msg = this.parseSingleMessageLine(entryBuffer.trim(), targetCharacterId);
          if (msg) currentBatch.push(msg);
          entryBuffer = '';
        }
      } else {
        // Small Entry (<5MB): Read entry text
        const entryText = await zipReader.readEntryText(entry);
        if (!entryText) continue;

        const messages = this.parseMessagesFromText(entryText, targetCharacterId);
        for (const msg of messages) {
          currentBatch.push(msg);
          if (currentBatch.length >= BATCH_SIZE) {
            await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
            await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
            journal.addMessages(currentBatch.length);
            currentBatch = [];
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
    }

    if (currentBatch.length > 0) {
      await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
      await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
      journal.addMessages(currentBatch.length);
      currentBatch = [];
    }

    await refreshDbMetaAndNotify();
  }

  /**
   * Stream JSONL or TXT line by line in 2MB chunks
   */
  private static async streamImportTextLines(
    file: File,
    targetCharacterId: string,
    executionOptions: ImportExecutionOptions,
    journal: ImportJournal
  ): Promise<void> {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunk
    let offset = 0;
    let leftoverLine = '';
    let currentBatch: ChatMessage[] = [];
    const sessionId = journal.getSessionId();

    while (offset < file.size) {
      if (journal.isCancelled()) {
        throw new Error('IMPORT_CANCELLED');
      }

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(offset, end);
      const chunkText = await chunkBlob.text();

      const combinedText = leftoverLine + chunkText;
      const lines = combinedText.split('\n');

      if (end < file.size) {
        leftoverLine = lines.pop() || '';
      } else {
        leftoverLine = '';
      }

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const msg = this.parseSingleMessageLine(trimmed, targetCharacterId);
        if (msg) {
          currentBatch.push(msg);

          if (currentBatch.length >= BATCH_SIZE) {
            await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
            await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
            journal.addMessages(currentBatch.length);
            currentBatch = [];
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }

      offset = end;
      const pct = Math.round((offset / file.size) * 95);
      journal.update({
        processedBytes: offset,
        percentage: pct,
        currentStageMessage: `正在分块流式读取文本 (${(offset / 1024 / 1024).toFixed(1)}MB / ${(file.size / 1024 / 1024).toFixed(1)}MB)...`,
      });
    }

    if (leftoverLine.trim()) {
      const msg = this.parseSingleMessageLine(leftoverLine.trim(), targetCharacterId);
      if (msg) currentBatch.push(msg);
    }

    if (currentBatch.length > 0) {
      await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
      await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
      journal.addMessages(currentBatch.length);
      currentBatch = [];
    }

    await refreshDbMetaAndNotify();
  }

  /**
   * Stream JSON chunked using 2MB Blob slices and streaming JSON state machine parser
   * Zero full-file memory allocation
   */
  private static async streamImportJsonChunked(
    file: File | Blob,
    targetCharacterId: string,
    executionOptions: ImportExecutionOptions,
    journal: ImportJournal
  ): Promise<void> {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    let offset = 0;
    let buffer = '';
    let currentBatch: ChatMessage[] = [];

    let inString = false;
    let isEscaped = false;
    let depth = 0;
    let objectStart = -1;

    const sessionId = journal.getSessionId();

    while (offset < file.size) {
      if (journal.isCancelled()) {
        throw new Error('IMPORT_CANCELLED');
      }

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const sliceBlob = file.slice(offset, end);
      const chunkText = await sliceBlob.text();
      buffer += chunkText;

      let lastProcessedPos = 0;

      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];

        if (inString) {
          if (isEscaped) {
            isEscaped = false;
          } else if (char === '\\') {
            isEscaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          isEscaped = false;
          continue;
        }

        if (char === '{') {
          if (depth === 0) {
            objectStart = i;
          }
          depth++;
        } else if (char === '}') {
          if (depth > 0) {
            depth--;
            if (depth === 0 && objectStart !== -1) {
              const jsonString = buffer.slice(objectStart, i + 1);
              lastProcessedPos = i + 1;
              objectStart = -1;

              try {
                const obj = JSON.parse(jsonString);
                const msg = this.normalizeMessageObject(obj, targetCharacterId);
                if (msg) {
                  currentBatch.push(msg);
                  if (currentBatch.length >= BATCH_SIZE) {
                    await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
                    await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
                    journal.addMessages(currentBatch.length);
                    currentBatch = [];
                    await new Promise((r) => setTimeout(r, 0));
                  }
                }
              } catch (e) {
                // Skip unparseable JSON fragment
              }
            }
          }
        }
      }

      if (lastProcessedPos > 0) {
        buffer = buffer.slice(lastProcessedPos);
        if (objectStart !== -1) {
          objectStart -= lastProcessedPos;
        }
      }

      offset = end;
      const pct = Math.round((offset / file.size) * 95);
      journal.update({
        processedBytes: offset,
        percentage: pct,
        currentStageMessage: `正在流式解析并分批落盘 JSON (${(offset / 1024 / 1024).toFixed(1)}MB / ${(file.size / 1024 / 1024).toFixed(1)}MB)...`,
      });
    }

    // Flush remaining batch
    if (currentBatch.length > 0) {
      await saveChatMessagesBulk(currentBatch, { skipMetaReload: true, skipNotify: true });
      await recordImportSessionBatch(sessionId, currentBatch.map((m) => m.id));
      journal.addMessages(currentBatch.length);
      currentBatch = [];
    }

    await refreshDbMetaAndNotify();
  }

  private static parseMessagesFromText(text: string, targetCharacterId: string): ChatMessage[] {
    const results: ChatMessage[] = [];
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.messages) ? parsed.messages : [parsed];
      for (const item of list) {
        const msg = this.normalizeMessageObject(item, targetCharacterId);
        if (msg) results.push(msg);
      }
    } catch (e) {
      // JSONL / TXT fallback
      const lines = text.split('\n');
      for (const line of lines) {
        const msg = this.parseSingleMessageLine(line.trim(), targetCharacterId);
        if (msg) results.push(msg);
      }
    }
    return results;
  }

  private static parseSingleMessageLine(line: string, targetCharacterId: string): ChatMessage | null {
    if (!line) return null;
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const item = JSON.parse(line);
        return this.normalizeMessageObject(item, targetCharacterId);
      } catch (e) {
        return null;
      }
    }
    // Simple transcript text line
    return {
      id: `msg_txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      characterId: targetCharacterId,
      sender: line.startsWith('AI:') || line.startsWith('Bot:') ? 'ai' : 'user',
      text: line.replace(/^(AI:|Bot:|User:|用户:)/i, '').trim(),
      timestamp: Date.now(),
    };
  }

  private static normalizeMessageObject(item: any, targetCharacterId: string): ChatMessage | null {
    if (!item || typeof item !== 'object') return null;
    const text = item.text || item.content || item.message || '';
    if (!text) return null;

    const sender = item.sender === 'ai' || item.isAi || item.role === 'assistant' ? 'ai' : 'user';

    return {
      id: item.id || `msg_stream_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      characterId: item.characterId || targetCharacterId,
      sender,
      text: String(text),
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      thinkingProcess: item.thinkingProcess || item.reasoning,
    };
  }
}
