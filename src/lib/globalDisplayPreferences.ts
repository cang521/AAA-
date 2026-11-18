export interface GlobalDisplayPreferences {
  fontScale: number;
}

export const GLOBAL_DISPLAY_PREFERENCES_STORAGE_KEY = 'global_display_preferences_v1';
export const MIN_GLOBAL_FONT_SCALE = 0.85;
export const MAX_GLOBAL_FONT_SCALE = 1.3;
export const DEFAULT_GLOBAL_FONT_SCALE = 1;

export const MIN_GLOBAL_FONT_PERCENT = 85;
export const MAX_GLOBAL_FONT_PERCENT = 130;
export const DEFAULT_GLOBAL_FONT_PERCENT = 100;

export type GlobalFontPresetId = 'small' | 'compact' | 'standard' | 'large' | 'xlarge';

export interface GlobalFontPresetOption {
  id: GlobalFontPresetId;
  label: string;
  percent: number;
  scale: number;
}

export const GLOBAL_FONT_SCALE_PRESETS: GlobalFontPresetOption[] = [
  { id: 'small', label: '小', percent: 85, scale: 0.85 },
  { id: 'compact', label: '较小', percent: 92, scale: 0.92 },
  { id: 'standard', label: '标准', percent: 100, scale: 1 },
  { id: 'large', label: '较大', percent: 112, scale: 1.12 },
  { id: 'xlarge', label: '大', percent: 125, scale: 1.25 },
];

type GlobalDisplayListener = (prefs: GlobalDisplayPreferences) => void;
const listeners = new Set<GlobalDisplayListener>();

function normalizeScaleNumber(scale: number): number {
  const clamped = Math.min(MAX_GLOBAL_FONT_SCALE, Math.max(MIN_GLOBAL_FONT_SCALE, scale));
  return Math.round(clamped * 100) / 100;
}

/**
 * Safely clamps any incoming fontScale value into [0.85, 1.30] with 0.01 step precision.
 * Rejects NaN, Infinity, booleans, objects, arrays, and empty strings by returning fallback.
 */
export function clampGlobalFontScale(
  value: unknown,
  fallback: number = DEFAULT_GLOBAL_FONT_SCALE
): number {
  const safeFallback =
    typeof fallback === 'number' && Number.isFinite(fallback)
      ? normalizeScaleNumber(fallback)
      : DEFAULT_GLOBAL_FONT_SCALE;

  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean' ||
    typeof value === 'object'
  ) {
    return safeFallback;
  }

  let rawNumber: number;
  if (typeof value === 'number') {
    rawNumber = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return safeFallback;
    if (trimmed.endsWith('%')) {
      const pct = Number(trimmed.slice(0, -1).trim());
      if (!Number.isFinite(pct)) return safeFallback;
      rawNumber = pct / 100;
    } else {
      rawNumber = Number(trimmed);
    }
  } else {
    return safeFallback;
  }

  if (!Number.isFinite(rawNumber)) {
    return safeFallback;
  }

  return normalizeScaleNumber(rawNumber);
}

export function scaleToPercent(scale: unknown): number {
  return Math.round(clampGlobalFontScale(scale, DEFAULT_GLOBAL_FONT_SCALE) * 100);
}

export function percentToScale(percent: unknown): number {
  if (
    percent === null ||
    percent === undefined ||
    percent === '' ||
    typeof percent === 'boolean' ||
    typeof percent === 'object'
  ) {
    return DEFAULT_GLOBAL_FONT_SCALE;
  }
  const parsed = typeof percent === 'number' ? percent : Number(String(percent).trim());
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GLOBAL_FONT_SCALE;
  }
  const clampedPct = Math.min(MAX_GLOBAL_FONT_PERCENT, Math.max(MIN_GLOBAL_FONT_PERCENT, Math.round(parsed)));
  return normalizeScaleNumber(clampedPct / 100);
}

export function sanitizeGlobalDisplayPreferences(raw: unknown): GlobalDisplayPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { fontScale: DEFAULT_GLOBAL_FONT_SCALE };
  }
  const obj = raw as Record<string, unknown>;
  return {
    fontScale: clampGlobalFontScale(obj.fontScale, DEFAULT_GLOBAL_FONT_SCALE),
  };
}

export function loadGlobalDisplayPreferences(): GlobalDisplayPreferences {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { fontScale: DEFAULT_GLOBAL_FONT_SCALE };
    }
    const raw = window.localStorage.getItem(GLOBAL_DISPLAY_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return { fontScale: DEFAULT_GLOBAL_FONT_SCALE };
    }
    return sanitizeGlobalDisplayPreferences(JSON.parse(raw));
  } catch {
    return { fontScale: DEFAULT_GLOBAL_FONT_SCALE };
  }
}

function notifyListeners(prefs: GlobalDisplayPreferences): void {
  for (const listener of listeners) {
    try {
      listener(prefs);
    } catch {
      // Protect caller loop from subscriber errors
    }
  }
}

export function saveGlobalDisplayPreferences(
  prefs: Partial<GlobalDisplayPreferences>
): GlobalDisplayPreferences {
  const current = loadGlobalDisplayPreferences();
  const next: GlobalDisplayPreferences = {
    fontScale: clampGlobalFontScale(prefs.fontScale, current.fontScale),
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GLOBAL_DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage write errors in restricted environments
  }
  notifyListeners(next);
  return next;
}

export function resetGlobalDisplayPreferences(): GlobalDisplayPreferences {
  const defaults: GlobalDisplayPreferences = { fontScale: DEFAULT_GLOBAL_FONT_SCALE };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GLOBAL_DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(defaults));
    }
  } catch {
    // Ignore storage write errors
  }
  notifyListeners(defaults);
  return defaults;
}

export function subscribeGlobalDisplayPreferences(listener: GlobalDisplayListener): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === GLOBAL_DISPLAY_PREFERENCES_STORAGE_KEY) {
      listener(loadGlobalDisplayPreferences());
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}
