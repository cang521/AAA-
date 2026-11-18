import { AiCharacter, GroupChat, GroupMember, UserProfile } from '../types';
import { DEFAULT_AI_AVATAR, DEFAULT_USER_AVATAR } from './storage';

export type GroupAvatarMode = 'auto' | 'custom';

export interface ResolvedGroupAvatarMember {
  key: string;
  id: string;
  name: string;
  avatar: string;
  initial: string;
  fallbackBg: string;
}

export interface ResolvedGroupAvatarState {
  mode: GroupAvatarMode;
  customAvatar?: string;
}

const FALLBACK_TILE_COLORS = [
  '#5B8DEF',
  '#42B983',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#EF4444',
  '#6366F1',
  '#0EA5E9',
];

/**
 * Checks whether an avatar string is strictly one of the legacy preset placeholder avatars
 * or empty. Ambiguous URLs and custom uploaded images return false so user avatars are preserved.
 */
export function isLegacyDefaultGroupAvatar(avatar?: string | null): boolean {
  if (typeof avatar !== 'string') return true;
  const trimmed = avatar.trim();
  if (!trimmed) return true;
  return trimmed === DEFAULT_AI_AVATAR || trimmed === DEFAULT_USER_AVATAR;
}

/**
 * Resolves the effective avatar mode and custom avatar URL for a group,
 * maintaining full backward compatibility with legacy GroupChat records.
 */
export function resolveGroupAvatarState(group: {
  avatar?: string;
  avatarMode?: GroupAvatarMode;
  customAvatar?: string;
}): ResolvedGroupAvatarState {
  const customCandidate =
    typeof group.customAvatar === 'string' && group.customAvatar.trim()
      ? group.customAvatar.trim()
      : undefined;
  const legacyCandidate =
    typeof group.avatar === 'string' && group.avatar.trim() ? group.avatar.trim() : undefined;

  if (group.avatarMode === 'custom') {
    const resolvedCustom = customCandidate || legacyCandidate;
    if (resolvedCustom) {
      return { mode: 'custom', customAvatar: resolvedCustom };
    }
    return { mode: 'auto', customAvatar: undefined };
  }

  if (group.avatarMode === 'auto') {
    return { mode: 'auto', customAvatar: customCandidate };
  }

  // Legacy data without explicit avatarMode:
  // - Empty or known built-in placeholder -> upgrade to auto mosaic
  // - Custom uploaded image or any non-default / ambiguous URL -> preserve as custom
  if (customCandidate && !isLegacyDefaultGroupAvatar(customCandidate)) {
    return { mode: 'custom', customAvatar: customCandidate };
  }
  if (legacyCandidate && !isLegacyDefaultGroupAvatar(legacyCandidate)) {
    return { mode: 'custom', customAvatar: legacyCandidate };
  }
  return { mode: 'auto', customAvatar: undefined };
}

/**
 * Normalizes raw/legacy/imported GroupChat objects safely without stripping legacy fields.
 */
export function normalizeGroupChatSchema(raw: any): GroupChat {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const members: GroupMember[] = Array.isArray(safe.members)
    ? safe.members.filter((m: any) => m && typeof m === 'object')
    : [];
  const messages = Array.isArray(safe.messages)
    ? safe.messages.filter((m: any) => m && typeof m === 'object')
    : [];

  const avatar = typeof safe.avatar === 'string' ? safe.avatar : '';
  const state = resolveGroupAvatarState({
    avatar,
    avatarMode: safe.avatarMode === 'auto' || safe.avatarMode === 'custom' ? safe.avatarMode : undefined,
    customAvatar: typeof safe.customAvatar === 'string' ? safe.customAvatar : undefined,
  });

  return {
    ...(safe as GroupChat),
    id: String(safe.id || `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    name: String(safe.name || '未命名群聊'),
    avatar,
    avatarMode: state.mode,
    customAvatar:
      state.mode === 'custom'
        ? state.customAvatar || avatar
        : typeof safe.customAvatar === 'string' && safe.customAvatar.trim()
          ? safe.customAvatar.trim()
          : undefined,
    ownerId: String(safe.ownerId || 'user_main'),
    members,
    messages,
    createdAt: typeof safe.createdAt === 'number' ? safe.createdAt : Date.now(),
    updatedAt: typeof safe.updatedAt === 'number' ? safe.updatedAt : Date.now(),
    inviteCode: String(safe.inviteCode || ''),
    inviteCodeActive: safe.inviteCodeActive !== false,
  };
}

/**
 * Returns deterministic first character for initial-letter fallback tiles.
 */
export function getMemberInitial(name?: string): string {
  const cleaned = (name || '').replace(/\s*\(我\)\s*$/, '').trim();
  if (!cleaned) return '群';
  const chars = Array.from(cleaned);
  return (chars[0] || '群').toUpperCase();
}

/**
 * Returns deterministic muted color for fallback tiles.
 */
export function getMemberFallbackColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_TILE_COLORS[hash % FALLBACK_TILE_COLORS.length];
}

/**
 * Resolves live member avatars (prioritizing live AiCharacter / UserProfile avatars when available)
 * and caps to max 9 tiles while preserving member order.
 */
export function resolveGroupMembersForAvatar(
  members: GroupMember[] = [],
  allCharacters?: AiCharacter[],
  userProfile?: UserProfile
): ResolvedGroupAvatarMember[] {
  if (!Array.isArray(members) || members.length === 0) return [];

  const charMap = new Map<string, AiCharacter>();
  if (Array.isArray(allCharacters)) {
    for (const c of allCharacters) {
      if (c && c.id) charMap.set(c.id, c);
    }
  }

  const validMembers = members.filter(
    (m) => m && typeof m === 'object' && (m.id || m.name || m.avatar)
  );

  return validMembers.slice(0, 9).map((m, idx) => {
    const isMainUser =
      m.id === 'user_main' ||
      (m.memberType === 'human' && userProfile?.wxid && m.wxid === userProfile.wxid);
    const liveChar =
      !isMainUser && m.memberType !== 'human'
        ? charMap.get(m.characterId || m.id) || charMap.get(m.id)
        : undefined;

    const liveAvatar = isMainUser
      ? userProfile?.avatar || m.avatar || ''
      : liveChar?.avatar || m.avatar || '';
    const displayName = m.name || liveChar?.name || `成员${idx + 1}`;
    const seed = String(m.id || displayName || idx);

    return {
      key: `${seed}_${idx}`,
      id: seed,
      name: displayName,
      avatar: typeof liveAvatar === 'string' ? liveAvatar.trim() : '',
      initial: getMemberInitial(displayName),
      fallbackBg: getMemberFallbackColor(seed),
    };
  });
}

/**
 * Exact WeChat-style row distribution for 1 ~ 9 members (10+ members are capped to 9):
 * 1: [1]
 * 2: [2]
 * 3: [1, 2]
 * 4: [2, 2]
 * 5: [2, 3]
 * 6: [3, 3]
 * 7: [2, 3, 2]
 * 8: [3, 2, 3]
 * 9: [3, 3, 3]
 */
export function getGroupAvatarLayoutRows(count: number): number[] {
  const clamped = Math.max(0, Math.min(9, Math.floor(count)));
  switch (clamped) {
    case 0:
      return [];
    case 1:
      return [1];
    case 2:
      return [2];
    case 3:
      return [1, 2];
    case 4:
      return [2, 2];
    case 5:
      return [2, 3];
    case 6:
      return [3, 3];
    case 7:
      return [2, 3, 2];
    case 8:
      return [3, 2, 3];
    case 9:
    default:
      return [3, 3, 3];
  }
}

export interface GroupAvatarMetrics {
  padding: number;
  gap: number;
  tileSize: number;
  borderRadius: number;
  rows: ResolvedGroupAvatarMember[][];
}

/**
 * Computes strict 1:1 square tile geometry for any avatar container size and 0..9 members.
 */
export function computeGroupAvatarLayout(
  members: ResolvedGroupAvatarMember[],
  size: number
): GroupAvatarMetrics {
  const visible = members.slice(0, 9);
  const count = visible.length;
  const rowCounts = getGroupAvatarLayoutRows(count);
  const borderRadius = size <= 32 ? 6 : size >= 52 ? 8 : 7;

  if (count === 0) {
    return {
      padding: 2,
      gap: 2,
      tileSize: Math.max(8, size - 4),
      borderRadius,
      rows: [],
    };
  }

  const padding = size >= 44 ? 2 : 1.5;
  const gap = size >= 44 ? 2 : 1.5;
  const inner = Math.max(8, size - padding * 2);
  const maxCols = count === 1 ? 1 : count <= 4 ? 2 : 3;
  const tileSize = Math.max(4, (inner - gap * (maxCols - 1)) / maxCols);

  const rows: ResolvedGroupAvatarMember[][] = [];
  let cursor = 0;
  for (const rowCount of rowCounts) {
    rows.push(visible.slice(cursor, cursor + rowCount));
    cursor += rowCount;
  }

  return {
    padding,
    gap,
    tileSize,
    borderRadius,
    rows,
  };
}

function loadHtmlImage(src: string, timeoutMs = 4500): Promise<HTMLImageElement | null> {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = src;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const iw = img.naturalWidth || img.width || dw;
  const ih = img.naturalHeight || img.height || dh;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Utility reserved for future Android system notification `largeIcon` generation.
 * Renders either the group's custom avatar or the exact 1~9 member composite grid
 * onto a square canvas bitmap Data URL (leaving monochrome smallIcon untouched).
 */
export async function renderGroupAvatarToDataUrl(params: {
  group: Pick<GroupChat, 'avatar' | 'avatarMode' | 'customAvatar' | 'members'>;
  allCharacters?: AiCharacter[];
  userProfile?: UserProfile;
  size?: number;
}): Promise<string | null> {
  if (typeof document === 'undefined') return null;

  const size = params.size || 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const state = resolveGroupAvatarState(params.group);
  const cornerRadius = Math.round(size * 0.14);

  ctx.save();
  drawRoundedRectPath(ctx, 0, 0, size, size, cornerRadius);
  ctx.clip();

  ctx.fillStyle = '#E5E5E5';
  ctx.fillRect(0, 0, size, size);

  if (state.mode === 'custom' && state.customAvatar) {
    const customImg = await loadHtmlImage(state.customAvatar);
    if (customImg) {
      drawCoverImage(ctx, customImg, 0, 0, size, size);
      ctx.restore();
      try {
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    }
  }

  const resolvedMembers = resolveGroupMembersForAvatar(
    params.group.members,
    params.allCharacters,
    params.userProfile
  );
  const metrics = computeGroupAvatarLayout(resolvedMembers, size);
  const totalHeight =
    metrics.rows.length > 0
      ? metrics.rows.length * metrics.tileSize + (metrics.rows.length - 1) * metrics.gap
      : 0;
  let y = (size - totalHeight) / 2;

  const loadedImages = await Promise.all(
    resolvedMembers.map((m) => (m.avatar ? loadHtmlImage(m.avatar) : Promise.resolve(null)))
  );
  const imageByKey = new Map<string, HTMLImageElement | null>();
  resolvedMembers.forEach((m, i) => imageByKey.set(m.key, loadedImages[i]));

  for (const row of metrics.rows) {
    const rowWidth = row.length * metrics.tileSize + (row.length - 1) * metrics.gap;
    let x = (size - rowWidth) / 2;

    for (const member of row) {
      const img = imageByKey.get(member.key) || null;
      if (img) {
        ctx.save();
        drawRoundedRectPath(ctx, x, y, metrics.tileSize, metrics.tileSize, 2);
        ctx.clip();
        drawCoverImage(ctx, img, x, y, metrics.tileSize, metrics.tileSize);
        ctx.restore();
      } else {
        ctx.fillStyle = member.fallbackBg;
        drawRoundedRectPath(ctx, x, y, metrics.tileSize, metrics.tileSize, 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `600 ${Math.max(10, Math.round(metrics.tileSize * 0.45))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(member.initial, x + metrics.tileSize / 2, y + metrics.tileSize / 2 + 1);
      }
      x += metrics.tileSize + metrics.gap;
    }

    y += metrics.tileSize + metrics.gap;
  }

  ctx.restore();
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
