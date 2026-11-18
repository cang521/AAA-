import {
  AiCharacter,
  AiConflictStage,
  AiDirectionalAttitude,
  AiFriendRequest,
  AiRelationshipEdge,
  AiRelationshipStatus,
  AiRomanticState,
  AiSocialActivitySettings,
  GroupChat,
  USER_ENTITY_ID,
} from '../../types';

/**
 * Clamp all attitude scores strictly to [0, 100].
 */
export function clampMetric(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Canonical sorted pair IDs for two distinct entities.
 */
export function sortEntityPair(id1: string, id2: string): [string, string] {
  if (!id1 || !id2 || id1 === id2) {
    throw new Error(`Invalid entity pair: "${id1}" and "${id2}"`);
  }
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

export function makePairId(id1: string, id2: string): string {
  const [a, b] = sortEntityPair(id1, id2);
  return `${a}__${b}`;
}

export function makeThreadId(id1: string, id2: string): string {
  return `pthread_${makePairId(id1, id2)}`;
}

export function createDefaultAttitude(now = Date.now()): AiDirectionalAttitude {
  return {
    familiarity: 0,
    trust: 10,
    affinity: 15,
    romanticAffinity: 0,
    tension: 0,
    jealousy: 0,
    updatedAt: now,
  };
}

export function clampAttitude(att: Partial<AiDirectionalAttitude>, now = Date.now()): AiDirectionalAttitude {
  return {
    familiarity: clampMetric(att.familiarity ?? 0),
    trust: clampMetric(att.trust ?? 10),
    affinity: clampMetric(att.affinity ?? 15),
    romanticAffinity: clampMetric(att.romanticAffinity ?? 0),
    tension: clampMetric(att.tension ?? 0),
    jealousy: clampMetric(att.jealousy ?? 0),
    lastImpression: att.lastImpression,
    updatedAt: att.updatedAt ?? now,
  };
}

export function createDefaultRelationshipEdge(
  id1: string,
  id2: string,
  status: AiRelationshipStatus = 'strangers',
  now = Date.now()
): AiRelationshipEdge {
  const [entityAId, entityBId] = sortEntityPair(id1, id2);
  const areFriends = status === 'friends' || status === 'close_friends';
  return {
    id: `${entityAId}__${entityBId}`,
    entityAId,
    entityBId,
    status,
    conflictStage: 'none',
    aToB: createDefaultAttitude(now),
    bToA: createDefaultAttitude(now),
    sharedRomanticTargetId: null,
    unfriendedByIds: [],
    blockedByIds: [],
    canViewMomentsAtoB: areFriends,
    canViewMomentsBtoA: areFriends,
    firstMetAt: status !== 'strangers' ? now : undefined,
    becameFriendsAt: areFriends ? now : undefined,
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function getDirectionalAttitude(
  edge: AiRelationshipEdge,
  fromId: string
): AiDirectionalAttitude {
  return edge.entityAId === fromId ? edge.aToB : edge.bToA;
}

export function getOtherParticipantId(edge: Pick<AiRelationshipEdge, 'entityAId' | 'entityBId'>, selfId: string): string {
  return edge.entityAId === selfId ? edge.entityBId : edge.entityAId;
}

/**
 * Determine whether two AI characters share the same romantic target (e.g. both like 'user_main').
 */
export function detectSharedRomanticTarget(
  stateA?: AiRomanticState | null,
  stateB?: AiRomanticState | null
): string | null {
  if (!stateA?.romanticTargetId || !stateB?.romanticTargetId) return null;
  if (stateA.romanticTargetId === stateB.romanticTargetId) {
    return stateA.romanticTargetId;
  }
  return null;
}

/**
 * Enforce directional romantic & social rules when updating attitude:
 * 1. Clamp 0..100.
 * 2. Ordinary friendly affinity MUST NOT automatically produce romanticAffinity
 *    if target is locked elsewhere or natural romance is disallowed.
 * 3. Shared romantic target suppresses romanticAffinity between the two rivals to 0.
 */
export function enforceDirectionalAttitudeRules(params: {
  fromId: string;
  toId: string;
  proposedDelta: Partial<Record<'familiarity' | 'trust' | 'affinity' | 'romanticAffinity' | 'tension' | 'jealousy', number>>;
  currentAttitude: AiDirectionalAttitude;
  fromRomanticState?: AiRomanticState | null;
  toRomanticState?: AiRomanticState | null;
  globalSettings: AiSocialActivitySettings;
  lastImpression?: string;
  now?: number;
}): AiDirectionalAttitude {
  const {
    toId,
    proposedDelta,
    currentAttitude,
    fromRomanticState,
    toRomanticState,
    globalSettings,
    lastImpression,
    now = Date.now(),
  } = params;

  const next: AiDirectionalAttitude = {
    familiarity: clampMetric(currentAttitude.familiarity + (proposedDelta.familiarity || 0)),
    trust: clampMetric(currentAttitude.trust + (proposedDelta.trust || 0)),
    affinity: clampMetric(currentAttitude.affinity + (proposedDelta.affinity || 0)),
    romanticAffinity: clampMetric(currentAttitude.romanticAffinity + (proposedDelta.romanticAffinity || 0)),
    tension: clampMetric(currentAttitude.tension + (proposedDelta.tension || 0)),
    jealousy: clampMetric(currentAttitude.jealousy + (proposedDelta.jealousy || 0)),
    lastImpression: lastImpression !== undefined ? lastImpression : currentAttitude.lastImpression,
    updatedAt: now,
  };

  // Shared target rivalry rule: if both A and B love the same third target (e.g., user_main),
  // their romantic feelings toward each other are suppressed to 0 (they remain rivals / friends, never romantic).
  const sharedTarget = detectSharedRomanticTarget(fromRomanticState, toRomanticState);
  if (sharedTarget && sharedTarget !== toId) {
    next.romanticAffinity = 0;
  }

  // Hard romantic lock rule:
  if (fromRomanticState?.romanticTargetLocked) {
    if (fromRomanticState.romanticTargetId && fromRomanticState.romanticTargetId !== toId) {
      next.romanticAffinity = 0;
    }
  }

  // Disallow natural romance escalation unless explicitly allowed by both global & character config
  const canDevelopNaturalRomance =
    globalSettings.allowNaturalRomance &&
    (fromRomanticState?.allowNaturalRomance ?? false) &&
    !fromRomanticState?.romanticTargetLocked;

  if (!canDevelopNaturalRomance && fromRomanticState?.romanticTargetId !== toId) {
    next.romanticAffinity = 0;
  }

  return next;
}

/**
 * Evaluate whether sender -> receiver can send a private message.
 */
export function canSendPrivateMessage(
  edge: AiRelationshipEdge | null | undefined,
  senderId: string,
  settings: AiSocialActivitySettings
): { allowed: boolean; reason?: string } {
  if (settings.paused) return { allowed: false, reason: 'AI 社会活动已暂停' };
  if (!settings.allowPrivateChat) return { allowed: false, reason: '私聊开关已关闭' };
  if (!edge) return { allowed: false, reason: '双方尚未成为好友' };

  if (edge.status === 'blocked' || (edge.blockedByIds && edge.blockedByIds.length > 0)) {
    return { allowed: false, reason: '双方处于拉黑状态，消息无法送达' };
  }
  if (edge.status === 'unfriended' || (edge.unfriendedByIds && edge.unfriendedByIds.includes(senderId))) {
    return { allowed: false, reason: '双方已互删好友，需重新通过验证后才能私聊' };
  }
  if (edge.status !== 'friends' && edge.status !== 'close_friends' && edge.status !== 'tense') {
    return { allowed: false, reason: '仅好友状态下支持发起真实私聊' };
  }
  if (edge.conflictStage === 'cold_war' && edge.aToB.tension >= 75 && edge.bToA.tension >= 75) {
    return { allowed: false, reason: '冷战期间双方暂时互不主动联系' };
  }
  return { allowed: true };
}

/**
 * Evaluate whether viewer can see owner's Moments post published at `postTimestamp`.
 * Rules:
 * - Own posts always visible.
 * - Strangers / blocked / same-group-only acquaintances -> CANNOT see.
 * - Friends / close_friends / tense (while still friend-linked) -> CAN see.
 * - Unfriended -> CANNOT see new posts published after unfriend (existing edge.updatedAt marks cutoff).
 */
export function canViewMoments(params: {
  viewerId: string;
  ownerId: string;
  edge?: AiRelationshipEdge | null;
  postTimestamp?: number;
}): boolean {
  const { viewerId, ownerId, edge, postTimestamp } = params;
  if (viewerId === ownerId) return true;
  if (!edge) return false;
  if (edge.status === 'blocked' || (edge.blockedByIds && edge.blockedByIds.length > 0)) {
    return false;
  }
  if (edge.status === 'unfriended') {
    // Once unfriended, posts made after unfriend cannot be viewed
    if (postTimestamp !== undefined && postTimestamp >= (edge.updatedAt || 0)) {
      return false;
    }
    return false;
  }
  if (edge.status === 'friends' || edge.status === 'close_friends' || edge.status === 'tense') {
    return true;
  }
  // strangers / acquaintances / friend_request_pending (even if same group!) cannot view Moments
  return false;
}

export function canInteractMoments(
  edge: AiRelationshipEdge | null | undefined,
  viewerId: string,
  ownerId: string,
  settings: AiSocialActivitySettings
): boolean {
  if (settings.paused || !settings.allowMomentsInteraction) return false;
  if (!canViewMoments({ viewerId, ownerId, edge })) return false;
  if (!edge) return false;
  // Cold war blocks friendly likes/comments
  if (edge.conflictStage === 'cold_war' || edge.conflictStage === 'serious_conflict') {
    return false;
  }
  return true;
}

export function canSendFriendRequest(params: {
  fromId: string;
  toId: string;
  edge?: AiRelationshipEdge | null;
  existingRequests: AiFriendRequest[];
  settings: AiSocialActivitySettings;
  now?: number;
}): { allowed: boolean; reason?: string } {
  const { fromId, toId, edge, existingRequests, settings, now = Date.now() } = params;
  if (settings.paused) return { allowed: false, reason: 'AI 社会活动已暂停' };
  if (!settings.allowFriendRequests) return { allowed: false, reason: '好友申请开关已关闭' };
  if (fromId === toId) return { allowed: false, reason: '不能向自己发申请' };

  if (edge) {
    if (edge.status === 'friends' || edge.status === 'close_friends' || edge.status === 'tense') {
      return { allowed: false, reason: '双方已经是好友' };
    }
    if (edge.status === 'blocked' || (edge.blockedByIds && edge.blockedByIds.length > 0)) {
      return { allowed: false, reason: '拉黑状态下禁止发送好友申请' };
    }
    if (edge.cooldownUntil && edge.cooldownUntil > now) {
      return { allowed: false, reason: '双方仍处于申请冷却期' };
    }
  }

  const pairId = makePairId(fromId, toId);
  const hasPending = existingRequests.some(
    (r) => r.pairId === pairId && r.status === 'pending'
  );
  if (hasPending) {
    return { allowed: false, reason: '存在待处理的好友申请，禁止重复发送' };
  }

  // Cooldown after recent rejection (default 2 hours)
  const recentRejected = existingRequests.find(
    (r) =>
      r.pairId === pairId &&
      r.status === 'rejected' &&
      now - (r.respondedAt || r.createdAt) < 2 * 60 * 60 * 1000
  );
  if (recentRejected) {
    return { allowed: false, reason: '近期好友申请刚被拒绝，处于冷却中' };
  }

  return { allowed: true };
}

/**
 * Step-wise conflict progression:
 * Never jump directly from friendly state -> serious_conflict/unfriended/blocked in a single event!
 */
export function getNextConflictStage(
  current: AiConflictStage = 'none',
  severity: 'mild' | 'moderate' | 'severe'
): AiConflictStage {
  const order: AiConflictStage[] = [
    'none',
    'dissatisfied',
    'bickering',
    'tense',
    'cold_war',
    'serious_conflict',
  ];
  const idx = Math.max(0, order.indexOf(current === 'reconciled' ? 'none' : current));
  if (severity === 'mild') {
    return order[Math.min(order.length - 1, Math.max(1, idx + 1))];
  }
  if (severity === 'moderate') {
    // At most advance 1 step beyond dissatisfied -> bickering -> tense -> cold_war
    return order[Math.min(order.length - 1, Math.max(2, idx + 1))];
  }
  // Even 'severe' triggers gradual escalation unless already in tense/cold_war
  return order[Math.min(order.length - 1, idx + 1)];
}

/**
 * Derive next relationship status after conflict escalation, honoring graduation rules.
 */
export function evaluateConflictOutcome(params: {
  edge: AiRelationshipEdge;
  actorId: string;
  triggerReason: string;
  settings: AiSocialActivitySettings;
  severity?: 'mild' | 'moderate' | 'severe';
}): {
  nextStatus: AiRelationshipStatus;
  nextConflictStage: AiConflictStage;
  canUnfriendNow: boolean;
  canBlockNow: boolean;
} {
  const { edge, settings, severity = 'mild' } = params;
  const currentStage = edge.conflictStage || 'none';
  const nextStage = getNextConflictStage(currentStage, severity);

  // Forbid single random event jumping directly from friends/close_friends to unfriended/blocked
  const avgTension = (edge.aToB.tension + edge.bToA.tension) / 2;
  const canUnfriendNow =
    settings.allowUnfriend &&
    (currentStage === 'cold_war' || currentStage === 'serious_conflict') &&
    avgTension >= 70;
  const canBlockNow =
    settings.allowUnfriend &&
    currentStage === 'serious_conflict' &&
    avgTension >= 85;

  let nextStatus: AiRelationshipStatus = edge.status;
  if (nextStage === 'tense' || nextStage === 'cold_war' || nextStage === 'serious_conflict') {
    if (edge.status === 'friends' || edge.status === 'close_friends') {
      nextStatus = 'tense';
    }
  }

  return {
    nextStatus,
    nextConflictStage: nextStage,
    canUnfriendNow,
    canBlockNow,
  };
}

/**
 * Check preconditions before an AI can confess to another entity.
 */
export function evaluateConfessionEligibility(params: {
  senderState?: AiRomanticState | null;
  targetId: string;
  edge?: AiRelationshipEdge | null;
  globalSettings: AiSocialActivitySettings;
}): { eligible: boolean; reason?: string } {
  const { senderState, targetId, edge, globalSettings } = params;
  if (!senderState) return { eligible: false, reason: '发送方缺少感情状态记录' };

  if (senderState.romanticTargetLocked) {
    if (senderState.romanticTargetId !== targetId) {
      return { eligible: false, reason: '发送方已锁定其他喜欢对象，禁止向他人表白' };
    }
  }

  if (senderState.romanticTargetId !== targetId) {
    const canNatural =
      globalSettings.allowNaturalRomance && senderState.allowNaturalRomance && !senderState.romanticTargetLocked;
    if (!canNatural) {
      return { eligible: false, reason: '未指定或未允许自然喜欢该对象' };
    }
  }

  if (senderState.status === 'dating' || senderState.status === 'confessed') {
    return { eligible: false, reason: '当前已处于表白/恋爱阶段' };
  }

  if (targetId !== USER_ENTITY_ID) {
    if (!edge || (edge.status !== 'friends' && edge.status !== 'close_friends')) {
      return { eligible: false, reason: '双方需先成为好友后才可表白' };
    }
    const senderAtt = getDirectionalAttitude(edge, senderState.characterId);
    if (senderAtt.romanticAffinity < 55 && senderState.status !== 'confession_planned') {
      return { eligible: false, reason: '心动与积累尚未达到表白条件' };
    }
  }

  return { eligible: true };
}

/**
 * HARD enforcement of confession outcome (Model CANNOT override romantic locks).
 */
export function evaluateConfessionDecision(params: {
  senderId: string;
  receiverId: string;
  receiverState?: AiRomanticState | null;
  edge?: AiRelationshipEdge | null;
  modelSuggestedAccept?: boolean;
}): { accepted: boolean; reason: string; enforcedByLock: boolean } {
  const { senderId, receiverState, edge, modelSuggestedAccept } = params;

  if (!receiverState) {
    return {
      accepted: Boolean(modelSuggestedAccept),
      reason: modelSuggestedAccept ? '双方心意相通' : '目前更适合保持朋友关系',
      enforcedByLock: false,
    };
  }

  // HARD LOCK CHECK: if receiver locked another target (especially 'user_main'), MUST REJECT!
  if (receiverState.romanticTargetLocked) {
    if (receiverState.romanticTargetId !== senderId) {
      return {
        accepted: false,
        reason:
          receiverState.romanticTargetId === USER_ENTITY_ID
            ? '心中已有锁定在意的人（用户），礼貌而坚定地拒绝了这段感情'
            : '心中已锁定其他喜欢对象，因此拒绝了表白',
        enforcedByLock: true,
      };
    }
    // Receiver ALSO locked onto senderId!
    return {
      accepted: true,
      reason: '彼此早已锁定心意，顺理成章答应了对方的表白',
      enforcedByLock: true,
    };
  }

  // Shared non-sender target conflict
  if (receiverState.romanticTargetId && receiverState.romanticTargetId !== senderId) {
    return {
      accepted: false,
      reason: '已有明确的喜欢对象，无法回应这份心意',
      enforcedByLock: false,
    };
  }

  if (edge) {
    const revAtt = getDirectionalAttitude(edge, params.receiverId);
    if (revAtt.tension >= 50 || edge.status === 'blocked' || edge.status === 'unfriended') {
      return {
        accepted: false,
        reason: '当前关系存在嫌隙或冷战，无法接受表白',
        enforcedByLock: false,
      };
    }
  }

  return {
    accepted: Boolean(modelSuggestedAccept),
    reason: modelSuggestedAccept ? '被对方的真诚打动，决定试着在一起' : '珍视这份友情，但还无法迈出恋人那一步',
    enforcedByLock: false,
  };
}

/**
 * Check if two entities share at least one group chat (without fabricating any edge).
 */
export function findCommonGroups(groups: GroupChat[], idA: string, idB: string): GroupChat[] {
  return groups.filter((g) => {
    const ids = new Set(
      (g.members || []).map((m) => m.characterId || m.id)
    );
    return ids.has(idA) && ids.has(idB);
  });
}

/**
 * Helper to derive human-readable status label without leaking internal numeric scores.
 */
export function getRelationshipStatusLabel(
  status: AiRelationshipStatus,
  conflictStage?: AiConflictStage
): string {
  if (status === 'blocked') return '已拉黑';
  if (status === 'unfriended') return '已互删';
  if (status === 'tense') {
    if (conflictStage === 'cold_war') return '冷战中';
    if (conflictStage === 'serious_conflict') return '严重冲突';
    return '关系紧张';
  }
  switch (status) {
    case 'close_friends':
      return '挚友 / 密友';
    case 'friends':
      return '已是好友';
    case 'friend_request_pending':
      return '好友验证中';
    case 'acquaintances':
      return '认识但未加好友';
    default:
      return '陌生人';
  }
}

export function buildCharacterRomanticDefault(char: AiCharacter): AiRomanticState {
  return {
    characterId: char.id,
    romanticTargetId: char.romanticConfig?.romanticTargetId ?? null,
    romanticTargetLocked: Boolean(char.romanticConfig?.romanticTargetLocked),
    allowNaturalRomance: Boolean(char.romanticConfig?.allowNaturalRomance),
    status: char.romanticConfig?.status ?? (char.romanticConfig?.romanticTargetId ? 'crush' : 'none'),
    updatedAt: Date.now(),
  };
}
