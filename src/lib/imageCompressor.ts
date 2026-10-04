/**
 * imageCompressor.ts
 * High-performance, Memory-safe Image Compression, Resizing & Concurrency Queue for Android WebView
 * Prevents JS Heap OOM / Renderer Process Crashes on High-res Camera Photos
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxFileSizeBytes?: number;
}

export interface CompressedImageResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

/**
 * Safely compress an image File, Blob, or Data URL using HTML5 Canvas with memory release
 */
export async function compressImage(
  source: File | Blob | string,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const maxWidth = options.maxWidth || 1280;
  const maxHeight = options.maxHeight || 1280;
  let quality = options.quality || 0.8;
  const maxSizeBytes = options.maxFileSizeBytes || 400 * 1024; // Default 400KB limit for API / storage

  let objectUrl = '';
  let img: HTMLImageElement | null = new Image();

  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      img.src = source;
    } else {
      img.src = source;
    }
  } else {
    objectUrl = URL.createObjectURL(source);
    img.src = objectUrl;
  }

  await new Promise<void>((resolve, reject) => {
    if (!img) return reject(new Error('Image instance is null'));
    img.onload = () => resolve();
    img.onerror = (err) => reject(new Error('Failed to load image for compression: ' + String(err)));
  });

  const originalWidth = img.naturalWidth || img.width || 800;
  const originalHeight = img.naturalHeight || img.height || 600;
  const originalSize = typeof source === 'string' ? source.length : source.size;

  // Calculate scaled dimensions keeping aspect ratio
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (targetWidth > maxWidth || targetHeight > maxHeight) {
    const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
    targetWidth = Math.round(targetWidth * ratio);
    targetHeight = Math.round(targetHeight * ratio);
  }

  // Create offscreen Canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw new Error('Failed to create 2D canvas context for image compression');
  }

  // Draw image to canvas
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Release HTMLImageElement & Object URL
  img.onload = null;
  img.onerror = null;
  img.src = '';
  img = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  // Encode to JPEG data URL with adaptive quality
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxSizeBytes * 1.33 && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  // Convert to Blob for memory-friendly storage
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b || new Blob([], { type: 'image/jpeg' })),
      'image/jpeg',
      quality
    );
  });

  // Explicitly free Canvas memory
  canvas.width = 0;
  canvas.height = 0;

  return {
    dataUrl,
    blob,
    width: targetWidth,
    height: targetHeight,
    originalSize,
    compressedSize: blob.size,
  };
}

/**
 * Generate a ultra-lightweight thumbnail (e.g. 600px max, ~30KB) for UI chat bubble display
 */
export async function createImageThumbnail(source: File | Blob | string): Promise<string> {
  const result = await compressImage(source, {
    maxWidth: 600,
    maxHeight: 600,
    quality: 0.7,
    maxFileSizeBytes: 120 * 1024,
  });
  return result.dataUrl;
}

/**
 * Concurrency Queue to process image compressions sequentially (max 1-2 simultaneous)
 * Prevents WebView spike when user attaches or pastes multiple photos
 */
type ImageTask<T> = () => Promise<T>;

export class ImageTaskQueue {
  private queue: Array<{ task: ImageTask<any>; resolve: (v: any) => void; reject: (e: any) => void }> = [];
  private activeCount = 0;
  private maxConcurrency = 2;

  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency;
  }

  public enqueue<T>(task: ImageTask<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}

export const globalImageTaskQueue = new ImageTaskQueue(1);

/**
 * Log sanitizer: Replaces giant Base64 strings with truncated placeholders to prevent console memory bloat
 */
export function sanitizeLogData(obj: any): any {
  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/') || obj.length > 500) {
      return obj.slice(0, 100) + `... [truncated ${obj.length} chars]`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeLogData);
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key of Object.keys(obj)) {
      if (key === 'dataUrl' || key === 'imageUrl' || key === 'base64') {
        const val = obj[key];
        sanitized[key] = typeof val === 'string' ? val.slice(0, 80) + `... [${val.length} bytes]` : val;
      } else {
        sanitized[key] = sanitizeLogData(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
}
