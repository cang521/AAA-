import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeExportDeliveryMode = 'auto' | 'save_as' | 'downloads' | 'share';

export type ExportProgressStage =
  | 'reading'
  | 'generating'
  | 'writing'
  | 'awaiting_user_save';

export type ExportFailureStage =
  | 'data_read'
  | 'file_generate'
  | 'native_write'
  | 'system_share';

export interface ExportProgressInfo {
  stage: ExportProgressStage;
  stageLabel: string;
  detail?: string;
  percentage?: number;
}

export interface ExportDeliveryResult {
  status: 'success' | 'cancelled';
  fileName: string;
  fileSizeBytes: number;
  formattedSize: string;
  deliveryMethod: 'web_download' | 'system_document_picker' | 'system_share' | 'downloads';
  locationLabel: string;
  uri?: string;
  warnings?: string[];
}

export interface NativeFileExportPluginInterface {
  beginCacheFile(options: { fileName: string }): Promise<{
    success: boolean;
    fileName: string;
    absolutePath: string;
    bytesWritten: number;
  }>;
  appendCacheFileChunk(options: {
    fileName: string;
    base64Chunk?: string;
    textChunk?: string;
  }): Promise<{
    success: boolean;
    fileName: string;
    chunkBytes: number;
    totalBytes: number;
  }>;
  verifyCacheFile(options: { fileName: string }): Promise<{
    exists: boolean;
    size: number;
    fileName: string;
    absolutePath: string;
  }>;
  presentSaveAs(options: {
    fileName: string;
    mimeType?: string;
    allowDownloadsFallback?: boolean;
  }): Promise<{
    status: 'saved' | 'cancelled' | 'unavailable';
    deliveryMethod?: 'system_document_picker' | 'downloads';
    fileName?: string;
    bytesWritten?: number;
    locationLabel?: string;
    uri?: string;
    reason?: string;
  }>;
  shareCacheFile(options: {
    fileName: string;
    mimeType?: string;
    title?: string;
    allowDownloadsFallback?: boolean;
  }): Promise<{
    status: 'shared' | 'cancelled' | 'unavailable';
    deliveryMethod?: 'system_share' | 'downloads';
    fileName?: string;
    bytesWritten?: number;
    locationLabel?: string;
    uri?: string;
    reason?: string;
  }>;
  saveToDownloads(options: {
    fileName: string;
    mimeType?: string;
  }): Promise<{
    status: 'saved';
    deliveryMethod: 'downloads';
    fileName: string;
    bytesWritten: number;
    locationLabel: string;
    uri?: string;
  }>;
}

const NativeFileExport = registerPlugin<NativeFileExportPluginInterface>('NativeFileExport');

const STAGE_LABEL_MAP: Record<ExportFailureStage, string> = {
  data_read: '数据读取失败',
  file_generate: '文件生成失败',
  native_write: '原生写入失败',
  system_share: '系统分享失败',
};

export class ExportStageError extends Error {
  public readonly stage: ExportFailureStage;
  public readonly stageLabel: string;
  public readonly isMemoryOrSizeLimit: boolean;
  public readonly suggestion?: string;

  constructor(
    stage: ExportFailureStage,
    message: string,
    opts?: { isMemoryOrSizeLimit?: boolean; suggestion?: string; cause?: unknown }
  ) {
    super(message);
    this.name = 'ExportStageError';
    this.stage = stage;
    this.stageLabel = STAGE_LABEL_MAP[stage];
    this.isMemoryOrSizeLimit = !!opts?.isMemoryOrSizeLimit;
    this.suggestion = opts?.suggestion;
    if (opts?.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

export function formatBytesHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isMemoryOrSizeError(err: unknown): boolean {
  if (err instanceof ExportStageError && err.isMemoryOrSizeLimit) return true;
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    err instanceof RangeError ||
    msg.includes('invalid string length') ||
    msg.includes('out of memory') ||
    msg.includes('outofmemory') ||
    msg.includes('allocation failed') ||
    msg.includes('memory') ||
    msg.includes('quota')
  );
}

const CHUNK_SIZE_BYTES = 256 * 1024; // 256KB per bridge transfer avoids WebView/JNI OOM

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Encode in small 8KB slices so String.fromCharCode never overflows the call stack
  const subChunk = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += subChunk) {
    const slice = bytes.subarray(i, Math.min(i + subChunk, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function canUseNativeAndroidExport(pluginOverride?: NativeFileExportPluginInterface): boolean {
  if (pluginOverride) return true;
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NativeFileExport');
  } catch {
    return false;
  }
}

export async function deliverExportBlob(
  blob: Blob,
  fileName: string,
  mimeType: string,
  options?: {
    deliveryMode?: NativeExportDeliveryMode;
    onProgress?: (info: ExportProgressInfo) => void;
    nativePluginOverride?: NativeFileExportPluginInterface;
    isNativeOverride?: boolean;
  }
): Promise<ExportDeliveryResult> {
  if (!blob || blob.size <= 0) {
    throw new ExportStageError('file_generate', '生成的导出文件内容为空（0 字节），已中止导出');
  }

  const formattedSize = formatBytesHuman(blob.size);
  const isNative =
    typeof options?.isNativeOverride === 'boolean'
      ? options.isNativeOverride
      : Capacitor.isNativePlatform();

  // Web Preview / Desktop browser compatibility path
  if (!isNative) {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new ExportStageError('file_generate', '当前运行环境不支持浏览器文件下载');
    }

    options?.onProgress?.({
      stage: 'writing',
      stageLabel: '正在触发浏览器下载...',
      detail: `${fileName} (${formattedSize})`,
      percentage: 92,
    });

    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 5000);
    }

    return {
      status: 'success',
      fileName,
      fileSizeBytes: blob.size,
      formattedSize,
      deliveryMethod: 'web_download',
      locationLabel: '浏览器默认下载目录',
    };
  }

  // Android Native Capacitor Export Pipeline
  const plugin = options?.nativePluginOverride || NativeFileExport;
  if (!options?.nativePluginOverride && !Capacitor.isPluginAvailable('NativeFileExport')) {
    throw new ExportStageError(
      'native_write',
      'Android 原生导出插件 NativeFileExport 未就绪，请重新同步并构建 APK 后再试'
    );
  }

  // 1. Write file in chunks into App Cache directory
  let verifiedFileName = fileName;
  try {
    options?.onProgress?.({
      stage: 'writing',
      stageLabel: '正在写入 App 本地缓存...',
      detail: `准备写入 ${fileName} (${formattedSize})`,
      percentage: 72,
    });

    const beginRes = await plugin.beginCacheFile({ fileName });
    if (beginRes?.fileName) {
      verifiedFileName = beginRes.fileName;
    }

    let offset = 0;
    while (offset < blob.size) {
      const end = Math.min(offset + CHUNK_SIZE_BYTES, blob.size);
      const sliceBuf = await blob.slice(offset, end).arrayBuffer();
      const base64Chunk = uint8ArrayToBase64(new Uint8Array(sliceBuf));
      await plugin.appendCacheFileChunk({
        fileName: verifiedFileName,
        base64Chunk,
      });
      offset = end;

      const pct = 72 + Math.round((offset / blob.size) * 18); // 72% -> 90%
      options?.onProgress?.({
        stage: 'writing',
        stageLabel: '正在写入原生缓存...',
        detail: `${formatBytesHuman(offset)} / ${formattedSize}`,
        percentage: pct,
      });

      if (offset < blob.size) {
        await yieldToMain();
      }
    }

    const verifyRes = await plugin.verifyCacheFile({ fileName: verifiedFileName });
    if (!verifyRes?.exists || !verifyRes.size || verifyRes.size <= 0) {
      throw new ExportStageError('native_write', '缓存文件写入完成但校验为空或不存在');
    }
  } catch (err: any) {
    if (err instanceof ExportStageError) throw err;
    const isOom = isMemoryOrSizeError(err);
    throw new ExportStageError(
      'native_write',
      err?.message || '写入 Android 缓存目录失败',
      {
        isMemoryOrSizeLimit: isOom,
        suggestion: isOom
          ? '文件体积过大，建议按单个角色或分批勾选分类后重新导出。'
          : undefined,
        cause: err,
      }
    );
  }

  // 2. Present system Save As / Share / Downloads fallback
  const mode: NativeExportDeliveryMode = options?.deliveryMode || 'auto';
  options?.onProgress?.({
    stage: 'awaiting_user_save',
    stageLabel:
      mode === 'downloads'
        ? '正在保存到系统下载目录...'
        : mode === 'share'
        ? '正在调起 Android 系统分享面板...'
        : '等待用户确认保存位置...',
    detail: `${verifiedFileName} (${formattedSize})`,
    percentage: 95,
  });

  try {
    if (mode === 'downloads') {
      const dlRes = await plugin.saveToDownloads({
        fileName: verifiedFileName,
        mimeType,
      });
      const finalBytes = dlRes.bytesWritten || blob.size;
      return {
        status: 'success',
        fileName: dlRes.fileName || verifiedFileName,
        fileSizeBytes: finalBytes,
        formattedSize: formatBytesHuman(finalBytes),
        deliveryMethod: 'downloads',
        locationLabel: dlRes.locationLabel || `Download/AiPhoneExports/${verifiedFileName}`,
        uri: dlRes.uri,
      };
    }

    if (mode === 'share') {
      const shareRes = await plugin.shareCacheFile({
        fileName: verifiedFileName,
        mimeType,
        title: `导出备份: ${verifiedFileName}`,
        allowDownloadsFallback: true,
      });
      if (shareRes.status === 'cancelled') {
        return {
          status: 'cancelled',
          fileName: shareRes.fileName || verifiedFileName,
          fileSizeBytes: blob.size,
          formattedSize,
          deliveryMethod: 'system_share',
          locationLabel: '已取消系统分享',
        };
      }
      if (shareRes.status === 'unavailable') {
        const dlRes = await plugin.saveToDownloads({ fileName: verifiedFileName, mimeType });
        const finalBytes = dlRes.bytesWritten || blob.size;
        return {
          status: 'success',
          fileName: dlRes.fileName || verifiedFileName,
          fileSizeBytes: finalBytes,
          formattedSize: formatBytesHuman(finalBytes),
          deliveryMethod: 'downloads',
          locationLabel: dlRes.locationLabel || `Download/AiPhoneExports/${verifiedFileName}`,
          uri: dlRes.uri,
        };
      }
      const finalBytes = shareRes.bytesWritten || blob.size;
      return {
        status: 'success',
        fileName: shareRes.fileName || verifiedFileName,
        fileSizeBytes: finalBytes,
        formattedSize: formatBytesHuman(finalBytes),
        deliveryMethod: shareRes.deliveryMethod === 'downloads' ? 'downloads' : 'system_share',
        locationLabel: shareRes.locationLabel || '已通过系统分享面板发送',
        uri: shareRes.uri,
      };
    }

    // Default 'auto' or 'save_as': launch SAF "Save As" picker first, fallback to share/downloads if unavailable
    const saveRes = await plugin.presentSaveAs({
      fileName: verifiedFileName,
      mimeType,
      allowDownloadsFallback: false,
    });

    if (saveRes.status === 'cancelled') {
      return {
        status: 'cancelled',
        fileName: saveRes.fileName || verifiedFileName,
        fileSizeBytes: blob.size,
        formattedSize,
        deliveryMethod: 'system_document_picker',
        locationLabel: '已取消文件保存',
      };
    }

    if (saveRes.status === 'unavailable') {
      // Fallback 1: System Share
      const shareRes = await plugin.shareCacheFile({
        fileName: verifiedFileName,
        mimeType,
        title: `导出备份: ${verifiedFileName}`,
        allowDownloadsFallback: true,
      });
      if (shareRes.status === 'cancelled') {
        return {
          status: 'cancelled',
          fileName: shareRes.fileName || verifiedFileName,
          fileSizeBytes: blob.size,
          formattedSize,
          deliveryMethod: 'system_share',
          locationLabel: '已取消系统分享',
        };
      }
      if (shareRes.status === 'unavailable') {
        // Fallback 2: Downloads directory
        const dlRes = await plugin.saveToDownloads({ fileName: verifiedFileName, mimeType });
        const finalBytes = dlRes.bytesWritten || blob.size;
        return {
          status: 'success',
          fileName: dlRes.fileName || verifiedFileName,
          fileSizeBytes: finalBytes,
          formattedSize: formatBytesHuman(finalBytes),
          deliveryMethod: 'downloads',
          locationLabel: dlRes.locationLabel,
          uri: dlRes.uri,
        };
      }
      const finalBytes = shareRes.bytesWritten || blob.size;
      return {
        status: 'success',
        fileName: shareRes.fileName || verifiedFileName,
        fileSizeBytes: finalBytes,
        formattedSize: formatBytesHuman(finalBytes),
        deliveryMethod: shareRes.deliveryMethod === 'downloads' ? 'downloads' : 'system_share',
        locationLabel: shareRes.locationLabel || '已通过系统分享发送',
        uri: shareRes.uri,
      };
    }

    const finalBytes = saveRes.bytesWritten || blob.size;
    if (finalBytes <= 0) {
      throw new ExportStageError('native_write', '目标文件写入完成后字节数为 0');
    }

    return {
      status: 'success',
      fileName: saveRes.fileName || verifiedFileName,
      fileSizeBytes: finalBytes,
      formattedSize: formatBytesHuman(finalBytes),
      deliveryMethod: saveRes.deliveryMethod || 'system_document_picker',
      locationLabel: saveRes.locationLabel || `已保存文件: ${verifiedFileName}`,
      uri: saveRes.uri,
    };
  } catch (err: any) {
    if (err instanceof ExportStageError) throw err;
    const rawMsg = String(err?.message || err || '');
    const stage: ExportFailureStage = rawMsg.includes('NATIVE_WRITE_FAILED')
      ? 'native_write'
      : 'system_share';
    throw new ExportStageError(
      stage,
      rawMsg.replace(/^(NATIVE_WRITE_FAILED|SYSTEM_SHARE_FAILED):\s*/i, '') || '系统保存/分享调起失败',
      { cause: err }
    );
  }
}

export async function saveCachedExportToDownloadsFallback(
  fileName: string,
  mimeType: string,
  nativePluginOverride?: NativeFileExportPluginInterface
): Promise<ExportDeliveryResult> {
  const plugin = nativePluginOverride || NativeFileExport;
  try {
    const verifyRes = await plugin.verifyCacheFile({ fileName });
    if (!verifyRes.exists || verifyRes.size <= 0) {
      throw new ExportStageError('native_write', '缓存文件已失效，请重新点击导出');
    }
    const dlRes = await plugin.saveToDownloads({ fileName: verifyRes.fileName || fileName, mimeType });
    const bytes = dlRes.bytesWritten || verifyRes.size;
    return {
      status: 'success',
      fileName: dlRes.fileName || fileName,
      fileSizeBytes: bytes,
      formattedSize: formatBytesHuman(bytes),
      deliveryMethod: 'downloads',
      locationLabel: dlRes.locationLabel,
      uri: dlRes.uri,
    };
  } catch (err: any) {
    if (err instanceof ExportStageError) throw err;
    throw new ExportStageError(
      'native_write',
      String(err?.message || err || '保存到下载目录失败').replace(/^NATIVE_WRITE_FAILED:\s*/i, ''),
      { cause: err }
    );
  }
}
