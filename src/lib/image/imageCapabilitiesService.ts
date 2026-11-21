import { ChatMessage } from '../../types';
import {
  ApiConnectionConfig,
  getApiConfigForEngine,
  loadApiSettings,
} from '../apiConfigStore';
import { sanitizeSensitiveText } from '../apiCapabilities';
import { apiFetch, ensureBackendReady } from '../localBackend';
import { getMessagesByIds, getRecentChatMessages, updateChatMessage } from '../chatDb';
import { compressImage } from '../imageCompressor';

const PENDING_IMAGE_GEN_STORAGE_KEY = 'aiphone_pending_image_tasks_v1';

interface PersistedPendingImageTask {
  messageId: string;
  characterId: string;
  requestId: string;
  startedAt: number;
}

export interface ImageGenerationTestResult {
  success: boolean;
  imageUrl?: string;
  mimeType?: string;
  revisedPrompt?: string;
  provider?: string;
  protocol?: string;
  model?: string;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
  errorType?: string;
  requestId?: string;
}

export interface ImageRecognitionTestResult {
  success: boolean;
  description?: string;
  detectedText?: string;
  objects?: string[];
  scene?: string;
  provider?: string;
  protocol?: string;
  model?: string;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
  errorType?: string;
  requestId?: string;
}

// Active in-flight trackers keyed by messageId
const inFlightRecognitions = new Map<string, Promise<ChatMessage>>();
const inFlightGenerations = new Map<string, Promise<ChatMessage>>();

function readPersistedPendingTasks(): PersistedPendingImageTask[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(PENDING_IMAGE_GEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePersistedPendingTasks(tasks: PersistedPendingImageTask[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PENDING_IMAGE_GEN_STORAGE_KEY, JSON.stringify(tasks.slice(-50)));
  } catch {
    // ignore storage quota errors
  }
}

function registerPersistedPendingTask(task: PersistedPendingImageTask): void {
  const list = readPersistedPendingTasks().filter((t) => t.messageId !== task.messageId);
  list.push(task);
  writePersistedPendingTasks(list);
}

function removePersistedPendingTask(messageId: string): void {
  const list = readPersistedPendingTasks().filter((t) => t.messageId !== messageId);
  writePersistedPendingTasks(list);
}

async function prepareImagePayloadForRecognition(imageUrl: string): Promise<string> {
  const trimmed = String(imageUrl || '').trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  // Compress large Data URLs in browser environments to keep payload fast & mobile-safe
  if (trimmed.length > 480 * 1024 && typeof document !== 'undefined' && typeof Image !== 'undefined') {
    try {
      const compressed = await compressImage(trimmed, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        maxFileSizeBytes: 380 * 1024,
      });
      if (compressed?.dataUrl) {
        return compressed.dataUrl;
      }
    } catch {
      // Fall back to original data URL if canvas compression fails
    }
  }
  return trimmed;
}

/**
 * Wait for all in-flight image recognitions belonging to the specified message IDs
 * before building the LLM prompt. Eliminates the race condition between image upload
 * recognition and AI reply generation.
 */
export async function awaitPendingRecognitionsForMessages(
  messageIds: string[],
  timeoutMs = 35000
): Promise<void> {
  const ids = Array.from(new Set((messageIds || []).filter(Boolean)));
  if (ids.length === 0) return;

  const promises = ids
    .map((id) => inFlightRecognitions.get(id))
    .filter((p): p is Promise<ChatMessage> => Boolean(p));

  if (promises.length === 0) return;

  await Promise.race([
    Promise.allSettled(promises),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Recognize a chat message's image via the dedicated `recognition.image` API config
 * and bind the structured semantic result strictly to `msg.id`.
 */
export async function recognizeMessageImage(
  msg: ChatMessage,
  options?: { force?: boolean; customPrompt?: string; source?: string }
): Promise<ChatMessage> {
  if (!msg?.id || !msg?.imageUrl) {
    return msg;
  }

  const existingPromise = inFlightRecognitions.get(msg.id);
  if (existingPromise) {
    return existingPromise;
  }

  if (!options?.force && msg.recognitionStatus === 'success' && (msg.imageDescription || msg.imageAnalysis)) {
    return msg;
  }

  const runPromise = (async (): Promise<ChatMessage> => {
    const requestId = `imgrec_${msg.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const pendingMsg: ChatMessage = {
      ...msg,
      messageType: msg.messageType || (msg.type === 'generated_image' ? 'generated_image' : 'image'),
      recognitionStatus: 'pending',
      imageAnalysisStatus: 'pending',
      recognitionError: undefined,
    };

    try {
      await updateChatMessage(pendingMsg);
    } catch {
      // non-fatal if message is transient
    }

    try {
      await ensureBackendReady('image_recognition');

      const settings = loadApiSettings();
      const recCfg = settings.recognition?.image;
      if (!recCfg || !recCfg.apiKey?.trim()) {
        throw new Error('图像识别 API 密钥未配置，请在「设置 → 识别API → 图像识别」中填写密钥与模型');
      }

      const imagePayload = await prepareImagePayloadForRecognition(msg.imageUrl || '');
      const res = await apiFetch('/api/gemini/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          messageId: msg.id,
          imageUrl: imagePayload,
          prompt:
            options?.customPrompt ||
            '请客观、准确、详细地用中文识别这张图片的内容、可见文字、主体与场景细节。不要猜测看不清的信息。',
          apiConfig: getApiConfigForEngine(),
          source: options?.source || '微信图片识别',
        }),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success || !data?.description) {
        const errMsg = sanitizeSensitiveText(
          data?.error || data?.message || `图片识别失败 (HTTP ${res.status})`
        );
        throw new Error(errMsg);
      }

      // Re-read latest message from IndexedDB so we don't clobber concurrent edits
      const freshList = await getMessagesByIds(msg.characterId, [msg.id]).catch(() => []);
      const baseMsg = freshList[0] || pendingMsg;

      const updatedMsg: ChatMessage = {
        ...baseMsg,
        messageType: baseMsg.messageType || (baseMsg.type === 'generated_image' ? 'generated_image' : 'image'),
        imageDescription: String(data.description || '').trim(),
        imageAnalysis: String(data.description || '').trim(),
        detectedText: typeof data.detectedText === 'string' ? data.detectedText.trim() : '',
        imageObjects: Array.isArray(data.objects) ? data.objects : [],
        imageScene: typeof data.scene === 'string' ? data.scene.trim() : '',
        recognitionStatus: 'success',
        imageAnalysisStatus: 'success',
        recognitionError: undefined,
        recognitionProvider: data.provider || recCfg.provider || 'custom',
        recognitionModel: data.model || recCfg.model || '',
      };

      await updateChatMessage(updatedMsg);
      return updatedMsg;
    } catch (err: any) {
      const safeError = sanitizeSensitiveText(err?.message || '图片识别失败');
      const freshList = await getMessagesByIds(msg.characterId, [msg.id]).catch(() => []);
      const baseMsg = freshList[0] || pendingMsg;

      const failedMsg: ChatMessage = {
        ...baseMsg,
        messageType: baseMsg.messageType || (baseMsg.type === 'generated_image' ? 'generated_image' : 'image'),
        recognitionStatus: 'failed',
        imageAnalysisStatus: 'failed',
        recognitionError: safeError,
      };

      try {
        await updateChatMessage(failedMsg);
      } catch {
        // ignore
      }
      return failedMsg;
    } finally {
      inFlightRecognitions.delete(msg.id);
    }
  })();

  inFlightRecognitions.set(msg.id, runPromise);
  return runPromise;
}

/**
 * Generate (or retry) an AI-generated image message in place.
 * Updates the SAME `msg.id` in IndexedDB without creating duplicate bubbles,
 * and never triggers automatic image recognition on AI-generated images.
 */
export async function generateImageForMessage(
  msg: ChatMessage,
  options?: { isRetry?: boolean }
): Promise<ChatMessage> {
  if (!msg?.id) return msg;

  const existing = inFlightGenerations.get(msg.id);
  if (existing) {
    return existing;
  }

  const prompt = (msg.generationPrompt || msg.imageDescription || '').trim();
  if (!prompt) {
    const failedEmpty: ChatMessage = {
      ...msg,
      messageType: 'generated_image',
      type: 'generated_image',
      generationStatus: 'failed',
      generationError: '缺少生图提示词，无法重新生成图片',
    };
    await updateChatMessage(failedEmpty).catch(() => {});
    return failedEmpty;
  }

  const runPromise = (async (): Promise<ChatMessage> => {
    const requestId =
      !options?.isRetry && msg.generationRequestId
        ? msg.generationRequestId
        : `imggen_${msg.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const freshBefore = await getMessagesByIds(msg.characterId, [msg.id]).catch(() => []);
    const baseMsg = freshBefore[0] || msg;

    const pendingMsg: ChatMessage = {
      ...baseMsg,
      messageType: 'generated_image',
      type: 'generated_image',
      generationPrompt: prompt,
      generationRequestId: requestId,
      generationStatus: 'pending',
      generationError: undefined,
    };

    registerPersistedPendingTask({
      messageId: msg.id,
      characterId: msg.characterId,
      requestId,
      startedAt: Date.now(),
    });

    await updateChatMessage(pendingMsg).catch(() => {});

    try {
      await ensureBackendReady('image_generation');

      const settings = loadApiSettings();
      const imgCfg = settings.imageGeneration;
      if (!imgCfg || !imgCfg.apiKey?.trim()) {
        throw new Error('图像生成 API 密钥未配置，请在「设置 → 图像API连接」中填写密钥与模型');
      }

      const res = await apiFetch('/api/provider/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          messageId: msg.id,
          turnId: msg.turnId,
          characterId: msg.characterId,
          prompt,
          negativePrompt: pendingMsg.negativePrompt || '',
          aspectRatio: pendingMsg.aspectRatio || '1:1',
          apiConfig: getApiConfigForEngine(),
          source: options?.isRetry ? '微信AI重绘' : '微信AI画图',
        }),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success || !data?.imageUrl) {
        const errMsg = sanitizeSensitiveText(
          data?.error || data?.message || `图像生成失败 (HTTP ${res.status})`
        );
        throw new Error(errMsg);
      }

      const freshAfter = await getMessagesByIds(msg.characterId, [msg.id]).catch(() => []);
      const latestMsg = freshAfter[0] || pendingMsg;

      const revisedPrompt = typeof data.revisedPrompt === 'string' ? data.revisedPrompt.trim() : '';
      const semanticDesc =
        (latestMsg.imageDescription || '').trim() ||
        revisedPrompt ||
        prompt;

      const successMsg: ChatMessage = {
        ...latestMsg,
        messageType: 'generated_image',
        type: 'generated_image',
        imageUrl: data.imageUrl,
        generationPrompt: prompt,
        revisedPrompt: revisedPrompt || latestMsg.revisedPrompt,
        imageDescription: semanticDesc,
        provider: data.provider || imgCfg.provider || 'custom',
        model: data.model || imgCfg.model || '',
        generationStatus: 'success',
        generationError: undefined,
        generationRequestId: requestId,
      };

      await updateChatMessage(successMsg);
      return successMsg;
    } catch (err: any) {
      const safeErr = sanitizeSensitiveText(err?.message || '图像生成失败');
      const freshAfter = await getMessagesByIds(msg.characterId, [msg.id]).catch(() => []);
      const latestMsg = freshAfter[0] || pendingMsg;

      const failedMsg: ChatMessage = {
        ...latestMsg,
        messageType: 'generated_image',
        type: 'generated_image',
        generationStatus: 'failed',
        generationError: safeErr,
        generationRequestId: requestId,
      };

      await updateChatMessage(failedMsg).catch(() => {});
      return failedMsg;
    } finally {
      inFlightGenerations.delete(msg.id);
      removePersistedPendingTask(msg.id);
    }
  })();

  inFlightGenerations.set(msg.id, runPromise);
  return runPromise;
}

/**
 * Reconcile persisted pending image generation tasks when entering a chat.
 * Active in-flight promises keep running seamlessly; orphaned pending cards from
 * a prior reload/crash are converted to a clean retryable failed state.
 */
export async function recoverPendingImageTasks(characterId: string): Promise<void> {
  if (!characterId) return;

  try {
    const persisted = readPersistedPendingTasks().filter((t) => t.characterId === characterId);
    const recent = await getRecentChatMessages(characterId, 30).catch(() => []);
    const pendingInDb = recent.filter(
      (m) => (m.messageType === 'generated_image' || m.type === 'generated_image') && m.generationStatus === 'pending'
    );

    const candidateMap = new Map<string, ChatMessage>();
    for (const m of pendingInDb) {
      candidateMap.set(m.id, m);
    }

    if (persisted.length > 0) {
      const missingIds = persisted.map((p) => p.messageId).filter((id) => !candidateMap.has(id));
      if (missingIds.length > 0) {
        const fetched = await getMessagesByIds(characterId, missingIds).catch(() => []);
        for (const m of fetched) {
          if (m.generationStatus === 'pending') {
            candidateMap.set(m.id, m);
          }
        }
      }
    }

    for (const [msgId, msg] of candidateMap.entries()) {
      if (inFlightGenerations.has(msgId)) {
        // Still running in memory: it will settle and emit message_updated automatically
        continue;
      }
      const recovered: ChatMessage = {
        ...msg,
        generationStatus: 'failed',
        generationError: '上次生图在页面刷新或离开时中断，请点击「重新生成」继续',
      };
      await updateChatMessage(recovered).catch(() => {});
      removePersistedPendingTask(msgId);
    }

    // Clean any stale persisted entries that are no longer pending
    for (const task of persisted) {
      if (!inFlightGenerations.has(task.messageId) && !candidateMap.has(task.messageId)) {
        removePersistedPendingTask(task.messageId);
      }
    }
  } catch (err) {
    console.warn('[imageCapabilitiesService] recoverPendingImageTasks error:', err);
  }
}

/**
 * Build deterministic, race-free image context for the current turn's user messages.
 * Strictly binds each image's recognition result to its own message and prevents
 * hallucination when recognition failed.
 */
export function buildCurrentTurnImageContext(userMessages: ChatMessage[]): string | undefined {
  const imageMessages = (userMessages || []).filter(
    (m) => Boolean(m.imageUrl) || m.messageType === 'image' || m.type === 'image'
  );
  if (imageMessages.length === 0) return undefined;

  const blocks = imageMessages.map((msg, idx) => {
    const label = imageMessages.length > 1 ? `[本轮用户发送的第 ${idx + 1} 张图片 (ID:${msg.id})]` : `[本轮用户发送的图片 (ID:${msg.id})]`;
    const captionLine = msg.text?.trim() ? `用户附言：${msg.text.trim()}` : '用户附言：（无）';
    const status = msg.recognitionStatus || msg.imageAnalysisStatus;

    if (status === 'success' && (msg.imageDescription || msg.imageAnalysis)) {
      const lines = [
        label,
        `图片内容：${(msg.imageDescription || msg.imageAnalysis || '').trim()}`,
      ];
      if (msg.detectedText && msg.detectedText.trim()) {
        lines.push(`图片文字：${msg.detectedText.trim()}`);
      }
      if (msg.imageScene && msg.imageScene.trim()) {
        lines.push(`画面场景：${msg.imageScene.trim()}`);
      }
      if (Array.isArray(msg.imageObjects) && msg.imageObjects.length > 0) {
        lines.push(`主要元素：${msg.imageObjects.slice(0, 8).join('、')}`);
      }
      lines.push(captionLine);
      return lines.join('\n');
    }

    if (status === 'failed') {
      const reason = sanitizeSensitiveText(msg.recognitionError || '识别接口调用失败');
      return [
        label,
        `识别状态：失败（原因：${reason}）`,
        captionLine,
        '【严格约束】这张图片未能成功识别！你绝对不能编造、猜测或假装看到了图片内容。请自然、坦诚地告知用户当前未能看清/识别这张图片，可以请对方简单描述一下或点击图片下方的「重试识别」。',
      ].join('\n');
    }

    return [
      label,
      '识别状态：尚未完成或未配置图像识别模型',
      captionLine,
      '【严格约束】目前没有这张图片的识别内容，严禁编造图片细节。请如实说明暂时无法读取这张图片的内容。',
    ].join('\n');
  });

  return blocks.join('\n\n');
}

/**
 * Real Image Generation connection test for Settings panel.
 * Always calls the real `/api/provider/generate-image` backend endpoint using ONLY
 * the provided `imageGeneration` config.
 */
export async function testImageGenerationConnection(
  config: ApiConnectionConfig
): Promise<ImageGenerationTestResult> {
  const startedAt = Date.now();
  const requestId = `imgtest_gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    await ensureBackendReady('settings_test_image_generation');

    const res = await apiFetch('/api/provider/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        prompt: '一颗蓝色星星，纯白背景，简洁扁平图标风格。',
        aspectRatio: '1:1',
        source: '设置-图像生成测试',
        providerType: config.provider || 'custom',
        apiProtocol: config.apiProtocol || '',
        baseUrl: config.baseUrl || '',
        apiKey: config.apiKey || '',
        model: config.model || '',
      }),
    });

    const rawText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    const latencyMs = data?.latencyMs ?? Date.now() - startedAt;

    if (!res.ok || !data?.success || !data?.imageUrl) {
      return {
        success: false,
        latencyMs,
        httpStatus: res.status,
        provider: data?.provider || config.provider,
        protocol: data?.protocol || config.apiProtocol,
        model: data?.model || config.model,
        errorType: data?.errorType || 'generation_failed',
        error: sanitizeSensitiveText(
          data?.error || data?.message || `图像生成测试失败 (HTTP ${res.status})`
        ),
        requestId,
      };
    }

    return {
      success: true,
      imageUrl: data.imageUrl,
      mimeType: data.mimeType || 'image/png',
      revisedPrompt: data.revisedPrompt || '',
      provider: data.provider || config.provider,
      protocol: data.protocol || config.apiProtocol,
      model: data.model || config.model,
      latencyMs,
      httpStatus: res.status,
      requestId,
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      provider: config.provider,
      protocol: config.apiProtocol,
      model: config.model,
      errorType: 'network_error',
      error: sanitizeSensitiveText(err?.message || '图像生成测试请求异常'),
      requestId,
    };
  }
}

/**
 * Real Image Recognition connection test for Settings panel.
 * Strictly passes ONLY `recognition.image` config (never reads `imageGeneration`).
 */
export async function testImageRecognitionConnection(
  config: ApiConnectionConfig,
  testImageDataUrl: string
): Promise<ImageRecognitionTestResult> {
  const startedAt = Date.now();
  const requestId = `imgtest_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    if (!testImageDataUrl?.trim()) {
      return {
        success: false,
        latencyMs: 0,
        errorType: 'missing_image',
        error: '请先选择一张测试图片后再发起识别测试',
        requestId,
      };
    }

    await ensureBackendReady('settings_test_image_recognition');

    const payloadUrl = await prepareImagePayloadForRecognition(testImageDataUrl);
    const res = await apiFetch('/api/gemini/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        imageUrl: payloadUrl,
        prompt: '请客观、准确地描述这张测试图片的主要内容、文字信息、物体与场景。',
        source: '设置-图像识别测试',
        apiConfig: {
          apiSettings: {
            recognition: {
              image: {
                provider: config.provider || 'custom',
                apiProtocol: config.apiProtocol || '',
                baseUrl: config.baseUrl || '',
                apiKey: config.apiKey || '',
                model: config.model || '',
              },
            },
          },
        },
      }),
    });

    const rawText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    const latencyMs = data?.latencyMs ?? Date.now() - startedAt;

    if (!res.ok || !data?.success || !data?.description) {
      return {
        success: false,
        latencyMs,
        httpStatus: res.status,
        provider: data?.provider || config.provider,
        protocol: data?.protocol || config.apiProtocol,
        model: data?.model || config.model,
        errorType: data?.errorType || 'recognition_failed',
        error: sanitizeSensitiveText(
          data?.error || data?.message || `图像识别测试失败 (HTTP ${res.status})`
        ),
        requestId,
      };
    }

    return {
      success: true,
      description: data.description,
      detectedText: data.detectedText || '',
      objects: Array.isArray(data.objects) ? data.objects : [],
      scene: data.scene || '',
      provider: data.provider || config.provider,
      protocol: data.protocol || config.apiProtocol,
      model: data.model || config.model,
      latencyMs,
      httpStatus: res.status,
      requestId,
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      provider: config.provider,
      protocol: config.apiProtocol,
      model: config.model,
      errorType: 'network_error',
      error: sanitizeSensitiveText(err?.message || '图像识别测试请求异常'),
      requestId,
    };
  }
}

/**
 * Safe in-app image save helper (never uses window.open).
 */
export async function downloadOrSaveImage(imageUrl: string, filenamePrefix = 'aiphone_image'): Promise<boolean> {
  if (!imageUrl || typeof document === 'undefined') return false;
  try {
    const ext = imageUrl.startsWith('data:image/jpeg')
      ? 'jpg'
      : imageUrl.startsWith('data:image/webp')
      ? 'webp'
      : 'png';
    const filename = `${filenamePrefix}_${Date.now()}.${ext}`;

    if (imageUrl.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    }

    const resp = await fetch(imageUrl);
    if (!resp.ok) return false;
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } finally {
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    }
  } catch {
    return false;
  }
}
