import { AiCharacter } from '../types';
import { loadCharacters, saveCharacters } from './storage';

export type AvatarSourceType =
  | 'empty'
  | 'data_svg'
  | 'data_raster'
  | 'blob'
  | 'http'
  | 'https'
  | 'relative_path'
  | 'unknown';

export interface ThumbnailGenerationResult {
  dataUrl: string;
  sourceType: AvatarSourceType;
  byteSize: number;
  width: number;
  height: number;
  stage: 'ok' | 'skipped_empty' | 'unsupported_env' | 'load_error' | 'timeout' | 'canvas_error' | 'size_exceeded';
  error?: string;
}

const DEFAULT_THUMBNAIL_SIZE = 192;
const MAX_THUMBNAIL_BYTES = 300 * 1024; // <= 300KB Data URL payload limit
const DEFAULT_LOAD_TIMEOUT_MS = 3500;

const inflightBackfills = new Map<string, Promise<string>>();

export function detectAvatarSourceType(source?: string): AvatarSourceType {
  if (!source || typeof source !== 'string') return 'empty';
  const trimmed = source.trim();
  if (!trimmed) return 'empty';
  if (trimmed.startsWith('data:image/svg+xml')) return 'data_svg';
  if (trimmed.startsWith('data:image/')) return 'data_raster';
  if (trimmed.startsWith('blob:')) return 'blob';
  if (trimmed.startsWith('https://')) return 'https';
  if (trimmed.startsWith('http://')) return 'http';
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return 'relative_path';
  }
  return 'unknown';
}

export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const payload = dataUrl.slice(commaIdx + 1);
  if (dataUrl.slice(0, commaIdx).includes(';base64')) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  return payload.length;
}

function resolveAvatarUrl(raw: string): string {
  const trimmed = raw.trim();
  if (typeof window !== 'undefined' && (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../'))) {
    try {
      return new URL(trimmed, window.location.origin).toString();
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Check whether an existing notificationAvatar looks valid and within byte limits.
 */
export function isValidNotificationThumbnail(thumbnail?: string): boolean {
  if (!thumbnail || typeof thumbnail !== 'string') return false;
  const trimmed = thumbnail.trim();
  if (!trimmed.startsWith('data:image/jpeg') && !trimmed.startsWith('data:image/webp') && !trimmed.startsWith('data:image/png')) {
    return false;
  }
  const bytes = estimateDataUrlBytes(trimmed);
  return bytes > 100 && bytes <= MAX_THUMBNAIL_BYTES;
}

/**
 * Render any browser-loadable avatar source (data:image/* including svg+xml, blob:, http/https, relative /)
 * into a center-cropped square 192x192 JPEG Data URL (<= 300KB) dedicated for Android system notifications.
 * Never throws; never logs full Base64 strings.
 */
export async function generateNotificationAvatarThumbnail(
  sourceUrl: string,
  options?: { size?: number; maxBytes?: number; timeoutMs?: number }
): Promise<ThumbnailGenerationResult> {
  const sourceType = detectAvatarSourceType(sourceUrl);
  const targetSize = options?.size || DEFAULT_THUMBNAIL_SIZE;
  const maxBytes = options?.maxBytes || MAX_THUMBNAIL_BYTES;
  const timeoutMs = options?.timeoutMs || DEFAULT_LOAD_TIMEOUT_MS;

  if (sourceType === 'empty') {
    return {
      dataUrl: '',
      sourceType,
      byteSize: 0,
      width: 0,
      height: 0,
      stage: 'skipped_empty',
      error: 'avatar source is empty',
    };
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      dataUrl: '',
      sourceType,
      byteSize: 0,
      width: 0,
      height: 0,
      stage: 'unsupported_env',
      error: 'DOM/Canvas unavailable in current environment',
    };
  }

  const resolvedUrl = resolveAvatarUrl(sourceUrl);

  return await new Promise<ThumbnailGenerationResult>((resolve) => {
    let settled = false;
    const finish = (result: ThumbnailGenerationResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish({
        dataUrl: '',
        sourceType,
        byteSize: 0,
        width: 0,
        height: 0,
        stage: 'timeout',
        error: `image load timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    try {
      const img = new Image();
      if (sourceType === 'http' || sourceType === 'https') {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || img.width || targetSize;
          const naturalH = img.naturalHeight || img.height || targetSize;
          if (naturalW <= 0 || naturalH <= 0) {
            finish({
              dataUrl: '',
              sourceType,
              byteSize: 0,
              width: 0,
              height: 0,
              stage: 'canvas_error',
              error: 'decoded image dimensions are zero',
            });
            return;
          }

          const minEdge = Math.min(naturalW, naturalH);
          const cropX = Math.max(0, Math.floor((naturalW - minEdge) / 2));
          const cropY = Math.max(0, Math.floor((naturalH - minEdge) / 2));

          const renderAttempts: Array<{ dim: number; quality: number }> = [
            { dim: targetSize, quality: 0.86 },
            { dim: targetSize, quality: 0.72 },
            { dim: targetSize, quality: 0.56 },
            { dim: 128, quality: 0.65 },
            { dim: 96, quality: 0.55 },
          ];

          for (const attempt of renderAttempts) {
            const canvas = document.createElement('canvas');
            canvas.width = attempt.dim;
            canvas.height = attempt.dim;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              finish({
                dataUrl: '',
                sourceType,
                byteSize: 0,
                width: naturalW,
                height: naturalH,
                stage: 'canvas_error',
                error: '2D canvas context unavailable',
              });
              return;
            }

            // Fill clean opaque background first so transparent PNG/SVG avatars don't turn black in JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, attempt.dim, attempt.dim);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(
              img,
              cropX,
              cropY,
              minEdge,
              minEdge,
              0,
              0,
              attempt.dim,
              attempt.dim
            );

            const encoded = canvas.toDataURL('image/jpeg', attempt.quality);
            const byteSize = estimateDataUrlBytes(encoded);
            if (byteSize > 0 && byteSize <= maxBytes) {
              finish({
                dataUrl: encoded,
                sourceType,
                byteSize,
                width: attempt.dim,
                height: attempt.dim,
                stage: 'ok',
              });
              return;
            }
          }

          finish({
            dataUrl: '',
            sourceType,
            byteSize: 0,
            width: naturalW,
            height: naturalH,
            stage: 'size_exceeded',
            error: `thumbnail exceeded ${maxBytes} bytes after compression`,
          });
        } catch (err: any) {
          finish({
            dataUrl: '',
            sourceType,
            byteSize: 0,
            width: 0,
            height: 0,
            stage: 'canvas_error',
            error: err?.name || err?.message || 'canvas draw/export error',
          });
        }
      };

      img.onerror = () => {
        finish({
          dataUrl: '',
          sourceType,
          byteSize: 0,
          width: 0,
          height: 0,
          stage: 'load_error',
          error: 'Image onerror triggered while loading avatar source',
        });
      };

      img.src = resolvedUrl;
    } catch (err: any) {
      finish({
        dataUrl: '',
        sourceType,
        byteSize: 0,
        width: 0,
        height: 0,
        stage: 'load_error',
        error: err?.message || 'unexpected thumbnail generation error',
      });
    }
  });
}

/**
 * Generate & persist notificationAvatar for a character without modifying original character.avatar.
 */
export async function ensureCharacterNotificationAvatar(
  char: AiCharacter,
  options?: { forceRegenerate?: boolean }
): Promise<AiCharacter> {
  if (!char || !char.avatar) return char;
  if (!options?.forceRegenerate && isValidNotificationThumbnail(char.notificationAvatar)) {
    return char;
  }

  const res = await generateNotificationAvatarThumbnail(char.avatar);
  if (res.dataUrl) {
    return {
      ...char,
      notificationAvatar: res.dataUrl,
    };
  }
  console.warn(
    `[NotificationAvatar] Failed to generate thumbnail for char=${char.id} sourceType=${res.sourceType} stage=${res.stage} err=${res.error || 'unknown'}`
  );
  return char;
}

/**
 * Lazily ensure a character stored in localStorage has a valid notificationAvatar.
 * Deduplicates concurrent runs per characterId.
 */
export async function getOrBackfillCharacterNotificationAvatar(character: {
  id: string;
  avatar?: string;
  notificationAvatar?: string;
}): Promise<{ thumbnail: string; sourceType: AvatarSourceType; byteSize: number; stage: string }> {
  const charId = character?.id;
  if (isValidNotificationThumbnail(character?.notificationAvatar)) {
    const thumb = character.notificationAvatar!.trim();
    return {
      thumbnail: thumb,
      sourceType: detectAvatarSourceType(character?.avatar),
      byteSize: estimateDataUrlBytes(thumb),
      stage: 'cached_notification_avatar',
    };
  }

  // Also check latest persisted record in case caller passed a stale character reference
  if (charId && typeof localStorage !== 'undefined') {
    const storedChars = loadCharacters();
    const stored = storedChars.find((c) => c.id === charId);
    if (stored && isValidNotificationThumbnail(stored.notificationAvatar)) {
      const thumb = stored.notificationAvatar!.trim();
      return {
        thumbnail: thumb,
        sourceType: detectAvatarSourceType(stored.avatar),
        byteSize: estimateDataUrlBytes(thumb),
        stage: 'stored_notification_avatar',
      };
    }
  }

  const rawAvatar = character?.avatar || '';
  const sourceType = detectAvatarSourceType(rawAvatar);
  if (!rawAvatar.trim()) {
    return { thumbnail: '', sourceType, byteSize: 0, stage: 'empty_avatar' };
  }

  const cacheKey = `${charId || 'anon'}::${rawAvatar.slice(0, 64)}::${rawAvatar.length}`;
  if (inflightBackfills.has(cacheKey)) {
    const dataUrl = await inflightBackfills.get(cacheKey)!;
    return {
      thumbnail: dataUrl,
      sourceType,
      byteSize: estimateDataUrlBytes(dataUrl),
      stage: dataUrl ? 'ok_shared' : 'failed_shared',
    };
  }

  const promise = (async () => {
    const res = await generateNotificationAvatarThumbnail(rawAvatar, { timeoutMs: 2200 });
    if (res.dataUrl && charId && typeof localStorage !== 'undefined') {
      try {
        const chars = loadCharacters();
        const idx = chars.findIndex((c) => c.id === charId);
        if (idx !== -1 && chars[idx].notificationAvatar !== res.dataUrl) {
          const updated = chars.map((c, i) =>
            i === idx ? { ...c, notificationAvatar: res.dataUrl } : c
          );
          saveCharacters(updated);
        }
      } catch (e) {
        console.warn(`[NotificationAvatar] Failed to persist backfilled thumbnail for char=${charId}:`, e);
      }
    } else if (!res.dataUrl) {
      console.warn(
        `[NotificationAvatar] Backfill failed char=${charId || 'unknown'} sourceType=${res.sourceType} stage=${res.stage} err=${res.error || 'unknown'}`
      );
    }
    return res.dataUrl;
  })();

  inflightBackfills.set(cacheKey, promise);
  try {
    const dataUrl = await promise;
    return {
      thumbnail: dataUrl,
      sourceType,
      byteSize: estimateDataUrlBytes(dataUrl),
      stage: dataUrl ? 'generated_and_saved' : 'generation_failed',
    };
  } finally {
    inflightBackfills.delete(cacheKey);
  }
}

/**
 * Startup backfill: asynchronously generate notificationAvatar for any existing characters missing one.
 */
export async function backfillAllCharactersNotificationAvatars(): Promise<boolean> {
  if (typeof localStorage === 'undefined' || typeof document === 'undefined') return false;
  const chars = loadCharacters();
  if (!chars || chars.length === 0) return false;

  let changed = false;
  const nextChars: AiCharacter[] = [...chars];

  for (let i = 0; i < nextChars.length; i++) {
    const c = nextChars[i];
    if (!c.avatar || isValidNotificationThumbnail(c.notificationAvatar)) continue;
    const res = await generateNotificationAvatarThumbnail(c.avatar, { timeoutMs: 2500 });
    if (res.dataUrl) {
      nextChars[i] = { ...c, notificationAvatar: res.dataUrl };
      changed = true;
      console.info(
        `[NotificationAvatar] Startup backfill ok char=${c.id} sourceType=${res.sourceType} bytes=${res.byteSize} dim=${res.width}x${res.height}`
      );
    }
  }

  if (changed) {
    // Re-read latest characters in case user edited anything concurrently
    const latest = loadCharacters();
    const thumbMap = new Map(nextChars.filter((c) => c.notificationAvatar).map((c) => [c.id, c.notificationAvatar]));
    const merged = latest.map((c) =>
      !isValidNotificationThumbnail(c.notificationAvatar) && thumbMap.has(c.id)
        ? { ...c, notificationAvatar: thumbMap.get(c.id) }
        : c
    );
    saveCharacters(merged);
  }

  return changed;
}
