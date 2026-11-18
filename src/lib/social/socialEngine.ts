import {
  AiCharacter,
  AiFriendRequest,
  AiRelationshipEdge,
  AiRomanticState,
  AiSocialEvent,
  AiSocialMomentPost,
  ApiConfig,
  ApiLog,
  GroupChat,
  MomentPost,
  USER_ENTITY_ID,
  UserProfile,
} from '../../types';
import { apiFetch } from '../localBackend';
import { nativeNotificationService } from '../NativeNotificationService';
import {
  canInteractMoments,
  canSendFriendRequest,
  canSendPrivateMessage,
  createDefaultRelationshipEdge,
  detectSharedRomanticTarget,
  enforceDirectionalAttitudeRules,
  evaluateConfessionDecision,
  evaluateConfessionEligibility,
  evaluateConflictOutcome,
  getRelationshipStatusLabel,
  makePairId,
  makeThreadId,
} from './relationshipRules';
import {
  appendPrivateChatTurnAtomic,
  commitSocialTransaction,
  getAllAiMoments,
  getAllFriendRequests,
  getAllRelationshipEdges,
  getEffectiveRomanticState,
  getPrivateMessagesForThread,
  getRelationshipEdge,
  getSocialMeta,
} from './socialDb';
import { getSocialFrequencyPolicy, loadAiSocialSettings } from './socialSettings';

const META_DAILY_QUOTA_PREFIX = 'daily_quota_';
const META_API_BACKOFF_PREFIX = 'api_backoff_';
const META_PROCESSED_TRIGGERS = 'processed_triggers_v1';
const META_LAST_TICK = 'last_social_tick_at';

const inFlightPairs = new Set<string>();
let globalTickInFlight = false;

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getTodayDateKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

async function getDailyQuotaCount(now = Date.now()): Promise<number> {
  const key = `${META_DAILY_QUOTA_PREFIX}${getTodayDateKey(now)}`;
  const val = await getSocialMeta<{ count: number }>(key);
  return val?.count || 0;
}

function buildDailyQuotaMeta(currentCount: number, now = Date.now()) {
  const key = `${META_DAILY_QUOTA_PREFIX}${getTodayDateKey(now)}`;
  return { key, value: { count: currentCount + 1 }, updatedAt: now };
}

async function hasTriggerBeenProcessed(triggerId?: string): Promise<boolean> {
  if (!triggerId) return false;
  const list = (await getSocialMeta<string[]>(META_PROCESSED_TRIGGERS)) || [];
  return list.includes(triggerId);
}

async function buildProcessedTriggerMeta(triggerId?: string, now = Date.now()) {
  if (!triggerId) return null;
  const list = (await getSocialMeta<string[]>(META_PROCESSED_TRIGGERS)) || [];
  const next = Array.from(new Set([...list.slice(-150), triggerId]));
  return { key: META_PROCESSED_TRIGGERS, value: next, updatedAt: now };
}

async function isPairInApiBackoff(pairKey: string, now = Date.now()): Promise<boolean> {
  const until = await getSocialMeta<number>(`${META_API_BACKOFF_PREFIX}${pairKey}`);
  return typeof until === 'number' && until > now;
}

async function recordSocialApiFailure(params: {
  pairKey: string;
  actorIds: string[];
  actionName: string;
  errorMsg: string;
  now?: number;
}) {
  const now = params.now || Date.now();
  const backoffUntil = now + 30 * 60 * 1000; // 30-min API backoff on failure (never spin-retry)
  await commitSocialTransaction({
    events: [
      {
        id: uid('sevt'),
        type: 'api_failed',
        actorIds: params.actorIds,
        pairId: params.pairKey,
        summary: `暂未能完成 ${params.actionName}，已暂停重试等待稍后恢复`,
        isMajor: false,
        createdAt: now,
        metadata: { error: params.errorMsg },
      },
    ],
    metaEntries: [
      {
        key: `${META_API_BACKOFF_PREFIX}${params.pairKey}`,
        value: backoffUntil,
        updatedAt: now,
      },
    ],
  });
}

async function maybeNotifyMajorSocialChange(params: {
  leadCharacter?: AiCharacter;
  title: string;
  body: string;
  eventId: string;
  allowNotifications?: boolean;
}) {
  const settings = loadAiSocialSettings();
  if (!settings.notifyMajorChanges || params.allowNotifications === false || !params.leadCharacter) {
    return;
  }
  try {
    await nativeNotificationService.notifyAiMessage(
      {
        id: params.leadCharacter.id,
        name: params.title,
        avatar: params.leadCharacter.avatar,
        notificationAvatar: params.leadCharacter.notificationAvatar,
      },
      params.body,
      {
        messageId: params.eventId,
        timestamp: Date.now(),
        triggerSource: 'ai_social_major_event',
      }
    );
  } catch (e) {
    console.warn('[socialEngine] notifyMajorChange skipped:', e);
  }
}

async function callSocialTurnApi(payload: Record<string, any>): Promise<{ result: any; log?: ApiLog }> {
  const res = await apiFetch('/api/gemini/ai-social-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data?.success || !data?.result) {
    throw new Error(data?.error || `HTTP ${res.status} AI 社交服务调用失败`);
  }
  return { result: data.result, log: data.log };
}

function summarizeEdgeForPrompt(edge: AiRelationshipEdge | null | undefined, actorAName: string, actorBName: string): string {
  if (!edge) return `${actorAName}与${actorBName}尚未正式熟识`;
  return `当前关系状态：${getRelationshipStatusLabel(edge.status, edge.conflictStage)}；相识方式：${edge.firstMetSource || '群聊'}；近期印象(${actorAName}→${actorBName})：${edge.aToB.lastImpression || '平常'}；(${actorBName}→${actorAName})：${edge.bToA.lastImpression || '平常'}`;
}

function describeRomanticBoundary(
  stateA: AiRomanticState,
  stateB: AiRomanticState,
  charA: AiCharacter,
  charB: AiCharacter,
  userProfile: UserProfile
): string {
  const targetLabel = (id: string | null) => {
    if (!id) return '无明确喜欢对象';
    if (id === USER_ENTITY_ID) return `用户（${userProfile.name || '山雨'}）`;
    if (id === charA.id) return charA.name;
    if (id === charB.id) return charB.name;
    return `角色(${id})`;
  };
  const shared = detectSharedRomanticTarget(stateA, stateB);
  const parts = [
    `${charA.name}喜欢对象：${targetLabel(stateA.romanticTargetId)}（${stateA.romanticTargetLocked ? '已硬锁定' : '未锁定'}）`,
    `${charB.name}喜欢对象：${targetLabel(stateB.romanticTargetId)}（${stateB.romanticTargetLocked ? '已硬锁定' : '未锁定'}）`,
  ];
  if (shared) {
    parts.push(`双方在意同一个对象：${targetLabel(shared)}，彼此不得向对方产生爱情线，仅限友情、竞争、互相试探或吃醋。`);
  }
  return parts.join('；');
}

// =========================================================================
// Core Public Operations
// =========================================================================

/**
 * 1. Ensure two AI characters in the same group become at least 'acquaintances'
 * without forcing instant friendship.
 */
export async function ensureMetInGroup(params: {
  charA: AiCharacter;
  charB: AiCharacter;
  group: GroupChat;
}): Promise<AiRelationshipEdge | null> {
  const settings = loadAiSocialSettings();
  if (settings.paused || !settings.allowMeet) return null;

  const { charA, charB, group } = params;
  const existing = await getRelationshipEdge(charA.id, charB.id);
  if (existing && existing.status !== 'strangers') {
    return existing;
  }

  const now = Date.now();
  const stateA = await getEffectiveRomanticState(charA);
  const stateB = await getEffectiveRomanticState(charB);
  const edge = existing || createDefaultRelationshipEdge(charA.id, charB.id, 'acquaintances', now);
  edge.status = 'acquaintances';
  edge.firstMetAt = edge.firstMetAt || now;
  edge.firstMetSource = `group:${group.name}`;
  edge.sharedRomanticTargetId = detectSharedRomanticTarget(stateA, stateB);
  edge.lastInteractionAt = now;
  edge.updatedAt = now;

  const event: AiSocialEvent = {
    id: uid('sevt'),
    type: 'met_in_group',
    actorIds: [charA.id, charB.id],
    pairId: edge.id,
    groupId: group.id,
    summary: `${charA.name} 和 ${charB.name} 在群聊「${group.name}」中互相认识了`,
    isMajor: false,
    createdAt: now,
  };

  await commitSocialTransaction({ edges: [edge], events: [event] });
  return edge;
}

/**
 * 2. Execute Friend Request Flow (Send + AI Persona Decision + Atomic Persist)
 */
export async function executeFriendRequestFlow(params: {
  sender: AiCharacter;
  receiver: AiCharacter;
  userProfile: UserProfile;
  reasonHint?: string;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}): Promise<{ accepted: boolean; skipped?: boolean; reason?: string }> {
  const settings = loadAiSocialSettings();
  const { sender, receiver, userProfile, reasonHint, apiConfig, onAddApiLog } = params;
  const pairId = makePairId(sender.id, receiver.id);
  if (inFlightPairs.has(pairId)) return { accepted: false, skipped: true, reason: '进行中' };

  const existingEdge = await getRelationshipEdge(sender.id, receiver.id);
  const allRequests = await getAllFriendRequests();
  const eligibility = canSendFriendRequest({
    fromId: sender.id,
    toId: receiver.id,
    edge: existingEdge,
    existingRequests: allRequests,
    settings,
  });
  if (!eligibility.allowed) {
    return { accepted: false, skipped: true, reason: eligibility.reason };
  }

  const now = Date.now();
  if (await isPairInApiBackoff(pairId, now)) {
    return { accepted: false, skipped: true, reason: '处于失败退避期' };
  }

  const policy = getSocialFrequencyPolicy(settings);
  const dailyCount = await getDailyQuotaCount(now);
  if (dailyCount >= policy.dailyMaxAiEvents) {
    return { accepted: false, skipped: true, reason: '达到今日AI社交额度上限' };
  }

  inFlightPairs.add(pairId);
  try {
    const stateA = await getEffectiveRomanticState(sender);
    const stateB = await getEffectiveRomanticState(receiver);

    const { result, log } = await callSocialTurnApi({
      actionType: 'friend_request_decision',
      actorA: sender,
      actorB: receiver,
      edgeSummary: summarizeEdgeForPrompt(existingEdge, sender.name, receiver.name),
      romanticContext: describeRomanticBoundary(stateA, stateB, sender, receiver, userProfile),
      groupContext: { reason: reasonHint || '群里交流后想进一步认识' },
      userProfile,
      apiConfig,
    });
    if (log && onAddApiLog) onAddApiLog(log);

    const accepted = Boolean(result.accepted);
    const greeting = String(result.greeting || `你好，我是${sender.name}，想加个好友。`).trim();
    const reason = String(result.reason || reasonHint || '想在微信多交流').trim();
    const decisionReason = String(
      result.decisionReason || (accepted ? '觉得性格相处得来，同意了好友申请' : '觉得目前还不够熟，暂缓通过')
    ).trim();

    const edge = existingEdge
      ? { ...existingEdge }
      : createDefaultRelationshipEdge(sender.id, receiver.id, 'acquaintances', now);

    const sharedTarget = detectSharedRomanticTarget(stateA, stateB);
    edge.sharedRomanticTargetId = sharedTarget;
    edge.lastInteractionAt = now;
    edge.updatedAt = now;

    if (accepted) {
      edge.status = 'friends';
      edge.conflictStage = 'none';
      edge.unfriendedByIds = [];
      edge.canViewMomentsAtoB = true;
      edge.canViewMomentsBtoA = true;
      edge.becameFriendsAt = edge.becameFriendsAt || now;
      edge.lastMajorChangeAt = now;
      edge.cooldownUntil = now + policy.pairCooldownMs;
      if (edge.entityAId === sender.id) {
        edge.aToB = enforceDirectionalAttitudeRules({
          fromId: sender.id,
          toId: receiver.id,
          proposedDelta: { familiarity: 12, trust: 8, affinity: 10 },
          currentAttitude: edge.aToB,
          fromRomanticState: stateA,
          toRomanticState: stateB,
          globalSettings: settings,
          now,
        });
        edge.bToA = enforceDirectionalAttitudeRules({
          fromId: receiver.id,
          toId: sender.id,
          proposedDelta: { familiarity: 10, trust: 8, affinity: 8 },
          currentAttitude: edge.bToA,
          fromRomanticState: stateB,
          toRomanticState: stateA,
          globalSettings: settings,
          now,
        });
      } else {
        edge.bToA = enforceDirectionalAttitudeRules({
          fromId: sender.id,
          toId: receiver.id,
          proposedDelta: { familiarity: 12, trust: 8, affinity: 10 },
          currentAttitude: edge.bToA,
          fromRomanticState: stateA,
          toRomanticState: stateB,
          globalSettings: settings,
          now,
        });
        edge.aToB = enforceDirectionalAttitudeRules({
          fromId: receiver.id,
          toId: sender.id,
          proposedDelta: { familiarity: 10, trust: 8, affinity: 8 },
          currentAttitude: edge.aToB,
          fromRomanticState: stateB,
          toRomanticState: stateA,
          globalSettings: settings,
          now,
        });
      }
    } else {
      edge.status = existingEdge?.status || 'acquaintances';
      edge.cooldownUntil = now + policy.majorEventCooldownMs;
    }

    const reqRecord: AiFriendRequest = {
      id: uid('freq'),
      fromId: sender.id,
      toId: receiver.id,
      pairId,
      greeting,
      reason,
      sourceContext: reasonHint,
      status: accepted ? 'accepted' : 'rejected',
      decisionReason,
      createdAt: now,
      respondedAt: now + 50,
    };

    const reqEvent: AiSocialEvent = {
      id: uid('sevt'),
      type: accepted ? 'friend_request_accepted' : 'friend_request_rejected',
      actorIds: [sender.id, receiver.id],
      targetId: receiver.id,
      pairId,
      summary:
        String(result.summary || '').trim() ||
        (accepted
          ? `${receiver.name} 通过了 ${sender.name} 的好友申请`
          : `${receiver.name} 婉拒了 ${sender.name} 的好友申请（${decisionReason}）`),
      isMajor: accepted,
      createdAt: now + 60,
    };

    const quotaMeta = buildDailyQuotaMeta(dailyCount, now);

    if (accepted && result.replyIntroText) {
      await appendPrivateChatTurnAtomic({
        participantA: sender.id,
        participantB: receiver.id,
        edge,
        event: reqEvent,
        newMessages: [
          {
            id: uid('pmsg'),
            senderId: sender.id,
            receiverId: receiver.id,
            text: greeting,
            timestamp: now + 20,
            triggerEventId: reqEvent.id,
          },
          {
            id: uid('pmsg'),
            senderId: receiver.id,
            receiverId: sender.id,
            text: String(result.replyIntroText).trim(),
            timestamp: now + 80,
            triggerEventId: reqEvent.id,
          },
        ],
        metaEntries: [quotaMeta],
      });
      // Commit friendRequest record in same logical flow
      await commitSocialTransaction({ friendRequests: [reqRecord] });
      await maybeNotifyMajorSocialChange({
        leadCharacter: sender,
        title: `${sender.name} 与 ${receiver.name} 成为好友`,
        body: reqEvent.summary,
        eventId: reqEvent.id,
      });
    } else {
      await commitSocialTransaction({
        edges: [edge],
        friendRequests: [reqRecord],
        events: [reqEvent],
        metaEntries: [quotaMeta],
      });
    }

    return { accepted, reason: decisionReason };
  } catch (err: any) {
    await recordSocialApiFailure({
      pairKey: pairId,
      actorIds: [sender.id, receiver.id],
      actionName: '好友申请决策',
      errorMsg: err?.message || 'Unknown error',
      now,
    });
    return { accepted: false, skipped: true, reason: err?.message };
  } finally {
    inFlightPairs.delete(pairId);
  }
}

/**
 * 3. Execute Real AI-to-AI Private Chat Burst (2~6 msgs strictly written to ONE shared thread)
 */
export async function executePrivateChatBurst(params: {
  actorA: AiCharacter;
  actorB: AiCharacter;
  userProfile: UserProfile;
  topicHint?: string;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}): Promise<{ ok: boolean; messageCount: number; reason?: string }> {
  const settings = loadAiSocialSettings();
  const { actorA, actorB, userProfile, topicHint, apiConfig, onAddApiLog } = params;
  const pairId = makePairId(actorA.id, actorB.id);
  if (inFlightPairs.has(pairId)) return { ok: false, messageCount: 0, reason: '进行中' };

  const edge = await getRelationshipEdge(actorA.id, actorB.id);
  const perm = canSendPrivateMessage(edge, actorA.id, settings);
  if (!perm.allowed || !edge) {
    return { ok: false, messageCount: 0, reason: perm.reason };
  }

  const now = Date.now();
  const policy = getSocialFrequencyPolicy(settings);
  if (edge.lastPrivateChatAt && now - edge.lastPrivateChatAt < policy.privateChatCooldownMs) {
    return { ok: false, messageCount: 0, reason: '私聊冷却时间内' };
  }
  if (await isPairInApiBackoff(pairId, now)) {
    return { ok: false, messageCount: 0, reason: '接口异常退避期内' };
  }
  const dailyCount = await getDailyQuotaCount(now);
  if (dailyCount >= policy.dailyMaxAiEvents) {
    return { ok: false, messageCount: 0, reason: '达到今日AI社交额度上限' };
  }

  inFlightPairs.add(pairId);
  try {
    const threadId = makeThreadId(actorA.id, actorB.id);
    const recentPrivateMessages = await getPrivateMessagesForThread(threadId);
    const stateA = await getEffectiveRomanticState(actorA);
    const stateB = await getEffectiveRomanticState(actorB);

    const { result, log } = await callSocialTurnApi({
      actionType: 'private_chat_burst',
      actorA,
      actorB,
      edgeSummary: summarizeEdgeForPrompt(edge, actorA.name, actorB.name),
      romanticContext: describeRomanticBoundary(stateA, stateB, actorA, actorB, userProfile),
      recentPrivateMessages,
      groupContext: { topic: topicHint || '聊聊日常与最近想法' },
      userProfile,
      maxMessages: policy.maxMessagesPerPrivateChatTurn,
      apiConfig,
    });
    if (log && onAddApiLog) onAddApiLog(log);

    const rawMsgs = Array.isArray(result.messages) ? result.messages : [];
    const validMsgs = rawMsgs
      .filter((m: any) => m && typeof m.text === 'string' && m.text.trim())
      .slice(0, policy.maxMessagesPerPrivateChatTurn);

    if (validMsgs.length === 0) {
      return { ok: false, messageCount: 0, reason: '未生成有效私聊气泡' };
    }

    const eventId = uid('sevt');
    const formattedMsgs = validMsgs.map((m: any, idx: number) => {
      const senderId = m.senderId === actorB.id ? actorB.id : actorA.id;
      const receiverId = senderId === actorA.id ? actorB.id : actorA.id;
      return {
        id: `${uid('pmsg')}_${idx}`,
        senderId,
        receiverId,
        text: m.text.trim(),
        timestamp: now + idx * 1200,
        triggerEventId: eventId,
        messageType: 'text' as const,
      };
    });

    const isAEntityA = edge.entityAId === actorA.id;
    const nextAToB = enforceDirectionalAttitudeRules({
      fromId: actorA.id,
      toId: actorB.id,
      proposedDelta: result.attitudeDeltaAtoB || { familiarity: 2, affinity: 2 },
      currentAttitude: isAEntityA ? edge.aToB : edge.bToA,
      fromRomanticState: stateA,
      toRomanticState: stateB,
      globalSettings: settings,
      lastImpression: result.impressionAtoB,
      now,
    });
    const nextBToA = enforceDirectionalAttitudeRules({
      fromId: actorB.id,
      toId: actorA.id,
      proposedDelta: result.attitudeDeltaBtoA || { familiarity: 2, affinity: 2 },
      currentAttitude: isAEntityA ? edge.bToA : edge.aToB,
      fromRomanticState: stateB,
      toRomanticState: stateA,
      globalSettings: settings,
      lastImpression: result.impressionBtoA,
      now,
    });

    const updatedEdge: AiRelationshipEdge = {
      ...edge,
      aToB: isAEntityA ? nextAToB : nextBToA,
      bToA: isAEntityA ? nextBToA : nextAToB,
      sharedRomanticTargetId: detectSharedRomanticTarget(stateA, stateB),
      lastPrivateChatAt: now,
      lastInteractionAt: now,
      cooldownUntil: now + policy.pairCooldownMs,
      updatedAt: now,
    };

    // Promote friends -> close_friends naturally if mutual high familiarity & affinity without high tension
    if (
      updatedEdge.status === 'friends' &&
      updatedEdge.aToB.affinity >= 70 &&
      updatedEdge.bToA.affinity >= 70 &&
      updatedEdge.aToB.tension < 20 &&
      updatedEdge.bToA.tension < 20
    ) {
      updatedEdge.status = 'close_friends';
    }

    const socialEvent: AiSocialEvent = {
      id: eventId,
      type: 'private_chat',
      actorIds: [actorA.id, actorB.id],
      pairId,
      threadId,
      summary: String(result.summary || `${actorA.name} 和 ${actorB.name} 在私聊里聊了几句近况`).trim(),
      isMajor: false,
      createdAt: now,
    };

    await appendPrivateChatTurnAtomic({
      participantA: actorA.id,
      participantB: actorB.id,
      newMessages: formattedMsgs,
      edge: updatedEdge,
      event: socialEvent,
      metaEntries: [buildDailyQuotaMeta(dailyCount, now)],
    });

    return { ok: true, messageCount: formattedMsgs.length };
  } catch (err: any) {
    await recordSocialApiFailure({
      pairKey: pairId,
      actorIds: [actorA.id, actorB.id],
      actionName: 'AI私聊回合',
      errorMsg: err?.message || 'Unknown error',
      now,
    });
    return { ok: false, messageCount: 0, reason: err?.message };
  } finally {
    inFlightPairs.delete(pairId);
  }
}

/**
 * 4. Hard-Lock Enforced Confession Flow
 */
export async function executeConfessionFlow(params: {
  sender: AiCharacter;
  receiver: AiCharacter;
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}): Promise<{ accepted: boolean; executed: boolean; reason: string; enforcedByLock: boolean }> {
  const settings = loadAiSocialSettings();
  const { sender, receiver, userProfile, apiConfig, onAddApiLog } = params;
  const senderState = await getEffectiveRomanticState(sender);
  const receiverState = await getEffectiveRomanticState(receiver);
  const edge = await getRelationshipEdge(sender.id, receiver.id);

  const elig = evaluateConfessionEligibility({
    senderState,
    targetId: receiver.id,
    edge,
    globalSettings: settings,
  });
  if (!elig.eligible || !edge) {
    return {
      accepted: false,
      executed: false,
      reason: elig.reason || '不满足表白前提条件',
      enforcedByLock: false,
    };
  }

  const now = Date.now();
  const dailyCount = await getDailyQuotaCount(now);
  const { result, log } = await callSocialTurnApi({
    actionType: 'confession_and_reply',
    actorA: sender,
    actorB: receiver,
    edgeSummary: summarizeEdgeForPrompt(edge, sender.name, receiver.name),
    romanticContext: describeRomanticBoundary(senderState, receiverState, sender, receiver, userProfile),
    userProfile,
    apiConfig,
  });
  if (log && onAddApiLog) onAddApiLog(log);

  // HARD LOCAL ENFORCEMENT — overrides modelSuggestion if locked!
  const localDecision = evaluateConfessionDecision({
    senderId: sender.id,
    receiverId: receiver.id,
    receiverState,
    edge,
    modelSuggestedAccept: Boolean(result.modelSuggestedAccept),
  });

  const accepted = localDecision.accepted;
  const confessionText = String(result.confessionText || `其实我想认真告诉你，我喜欢你。`).trim();
  const replyText = localDecision.enforcedByLock && !accepted
    ? `${localDecision.reason}`
    : String(result.replyText || (accepted ? '其实我也一直在等你说这句话。' : '谢谢你的真诚，但我只能把你当重要朋友。')).trim();

  const nextSenderState: AiRomanticState = {
    ...senderState,
    status: accepted ? 'dating' : 'rejected',
    reason: localDecision.reason,
    updatedAt: now,
  };
  const nextReceiverState: AiRomanticState = accepted
    ? {
        ...receiverState,
        romanticTargetId: sender.id,
        status: 'dating',
        reason: '接受了表白',
        updatedAt: now,
      }
    : receiverState;

  const updatedEdge: AiRelationshipEdge = {
    ...edge,
    status: accepted ? 'close_friends' : edge.status,
    lastInteractionAt: now,
    lastMajorChangeAt: now,
    updatedAt: now,
  };

  const eventId = uid('sevt');
  const event: AiSocialEvent = {
    id: eventId,
    type: accepted ? 'confession_accepted' : 'confession_rejected',
    actorIds: [sender.id, receiver.id],
    targetId: receiver.id,
    pairId: edge.id,
    threadId: makeThreadId(sender.id, receiver.id),
    summary: accepted
      ? `${sender.name} 向 ${receiver.name} 表达了心意，双方正式走到一起`
      : `${sender.name} 向 ${receiver.name} 表达了心意，但被婉拒（${localDecision.reason}）`,
    isMajor: true,
    createdAt: now,
  };

  await appendPrivateChatTurnAtomic({
    participantA: sender.id,
    participantB: receiver.id,
    edge: updatedEdge,
    event,
    romanticStates: [nextSenderState, nextReceiverState],
    newMessages: [
      {
        id: uid('pmsg'),
        senderId: sender.id,
        receiverId: receiver.id,
        text: confessionText,
        timestamp: now,
        triggerEventId: eventId,
        messageType: 'confession',
      },
      {
        id: uid('pmsg'),
        senderId: receiver.id,
        receiverId: sender.id,
        text: replyText,
        timestamp: now + 900,
        triggerEventId: eventId,
        messageType: 'confession',
      },
    ],
    metaEntries: [buildDailyQuotaMeta(dailyCount, now)],
  });

  await maybeNotifyMajorSocialChange({
    leadCharacter: sender,
    title: accepted ? `${sender.name} 表白成功` : `${sender.name} 的表白被拒绝`,
    body: event.summary,
    eventId,
  });

  return {
    accepted,
    executed: true,
    reason: localDecision.reason,
    enforcedByLock: localDecision.enforcedByLock,
  };
}

/**
 * 5. Step-wise Conflict Progression, Reconcile, Unfriend, Block & Re-add
 */
export async function executeUnfriendOrBlock(params: {
  actorId: string;
  targetId: string;
  mode: 'unfriend' | 'block' | 're_add' | 'unblock';
  actorName: string;
  targetName: string;
  reason?: string;
}): Promise<AiRelationshipEdge | null> {
  const settings = loadAiSocialSettings();
  if ((modeRequiresToggle(params.mode)) && !settings.allowUnfriend) {
    return null;
  }

  const now = Date.now();
  const existing =
    (await getRelationshipEdge(params.actorId, params.targetId)) ||
    createDefaultRelationshipEdge(params.actorId, params.targetId, 'friends', now);

  const edge: AiRelationshipEdge = { ...existing, updatedAt: now, lastInteractionAt: now, lastMajorChangeAt: now };
  const blockedSet = new Set(edge.blockedByIds || []);
  const unfriendedSet = new Set(edge.unfriendedByIds || []);

  let evType: AiSocialEvent['type'] = 'unfriended';
  let summary = '';

  if (params.mode === 'block') {
    blockedSet.add(params.actorId);
    unfriendedSet.add(params.actorId);
    edge.blockedByIds = Array.from(blockedSet);
    edge.unfriendedByIds = Array.from(unfriendedSet);
    edge.status = 'blocked';
    edge.canViewMomentsAtoB = false;
    edge.canViewMomentsBtoA = false;
    evType = 'blocked';
    summary = `${params.actorName} 将 ${params.targetName} 加入了黑名单${params.reason ? `（${params.reason}）` : ''}`;
  } else if (params.mode === 'unfriend') {
    unfriendedSet.add(params.actorId);
    edge.unfriendedByIds = Array.from(unfriendedSet);
    edge.status = 'unfriended';
    edge.canViewMomentsAtoB = false;
    edge.canViewMomentsBtoA = false;
    evType = 'unfriended';
    summary = `${params.actorName} 删除了 ${params.targetName} 的好友${params.reason ? `（${params.reason}）` : ''}`;
  } else if (params.mode === 'unblock') {
    blockedSet.delete(params.actorId);
    edge.blockedByIds = Array.from(blockedSet);
    if (edge.blockedByIds.length === 0) {
      edge.status = edge.unfriendedByIds && edge.unfriendedByIds.length > 0 ? 'unfriended' : 'acquaintances';
    }
    evType = 'unblocked';
    summary = `${params.actorName} 将 ${params.targetName} 移出了黑名单`;
  } else {
    // re_add only succeeds if NOT blocked
    if (edge.status === 'blocked' || (edge.blockedByIds && edge.blockedByIds.length > 0)) {
      return edge;
    }
    edge.unfriendedByIds = [];
    edge.status = 'friends';
    edge.conflictStage = 'reconciled';
    edge.canViewMomentsAtoB = true;
    edge.canViewMomentsBtoA = true;
    evType = 're_added_friend';
    summary = `${params.actorName} 与 ${params.targetName} 重新通过了好友验证`;
  }

  const evt: AiSocialEvent = {
    id: uid('sevt'),
    type: evType,
    actorIds: [params.actorId, params.targetId],
    targetId: params.targetId,
    pairId: edge.id,
    summary,
    isMajor: true,
    createdAt: now,
  };

  await commitSocialTransaction({ edges: [edge], events: [evt] });
  return edge;
}

function modeRequiresToggle(mode: 'unfriend' | 'block' | 're_add' | 'unblock'): boolean {
  return mode === 'unfriend' || mode === 'block';
}

export async function executeConflictOrReconcileTurn(params: {
  actorA: AiCharacter;
  actorB: AiCharacter;
  userProfile: UserProfile;
  conflictMode: 'conflict' | 'reconcile';
  reason: string;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}): Promise<{ ok: boolean; stage?: string }> {
  const settings = loadAiSocialSettings();
  if (settings.paused || (!settings.allowConflicts && params.conflictMode === 'conflict')) {
    return { ok: false };
  }

  const { actorA, actorB, userProfile, conflictMode, reason, apiConfig, onAddApiLog } = params;
  const edge = await getRelationshipEdge(actorA.id, actorB.id);
  if (!edge || edge.status === 'blocked' || edge.status === 'unfriended') {
    return { ok: false };
  }

  const now = Date.now();
  const dailyCount = await getDailyQuotaCount(now);
  const policy = getSocialFrequencyPolicy(settings);
  if (dailyCount >= policy.dailyMaxAiEvents) return { ok: false };

  const stateA = await getEffectiveRomanticState(actorA);
  const stateB = await getEffectiveRomanticState(actorB);

  const { result, log } = await callSocialTurnApi({
    actionType: 'conflict_or_reconcile',
    actorA,
    actorB,
    edgeSummary: summarizeEdgeForPrompt(edge, actorA.name, actorB.name),
    romanticContext: describeRomanticBoundary(stateA, stateB, actorA, actorB, userProfile),
    groupContext: { conflictMode, reason },
    userProfile,
    apiConfig,
  });
  if (log && onAddApiLog) onAddApiLog(log);

  const eventId = uid('sevt');
  let nextEdge: AiRelationshipEdge = { ...edge, lastInteractionAt: now, updatedAt: now };
  let evType: AiSocialEvent['type'] = 'bickering';

  if (conflictMode === 'reconcile' || result.shouldReconcile) {
    nextEdge.conflictStage = 'reconciled';
    if (nextEdge.status === 'tense') nextEdge.status = 'friends';
    nextEdge.aToB = enforceDirectionalAttitudeRules({
      fromId: nextEdge.entityAId,
      toId: nextEdge.entityBId,
      proposedDelta: { tension: -28, trust: 6, affinity: 5 },
      currentAttitude: nextEdge.aToB,
      globalSettings: settings,
      now,
    });
    nextEdge.bToA = enforceDirectionalAttitudeRules({
      fromId: nextEdge.entityBId,
      toId: nextEdge.entityAId,
      proposedDelta: { tension: -28, trust: 6, affinity: 5 },
      currentAttitude: nextEdge.bToA,
      globalSettings: settings,
      now,
    });
    evType = 'reconciled';
  } else {
    const severity: 'mild' | 'moderate' | 'severe' =
      result.severity === 'moderate' || result.severity === 'severe' ? result.severity : 'mild';
    const outcome = evaluateConflictOutcome({
      edge: nextEdge,
      actorId: actorA.id,
      triggerReason: reason,
      settings,
      severity,
    });
    nextEdge.status = outcome.nextStatus;
    nextEdge.conflictStage = outcome.nextConflictStage;
    const isSharedRival = Boolean(detectSharedRomanticTarget(stateA, stateB));
    nextEdge.aToB = enforceDirectionalAttitudeRules({
      fromId: nextEdge.entityAId,
      toId: nextEdge.entityBId,
      proposedDelta: { tension: 18, jealousy: isSharedRival ? 12 : 0, affinity: -6 },
      currentAttitude: nextEdge.aToB,
      globalSettings: settings,
      now,
    });
    nextEdge.bToA = enforceDirectionalAttitudeRules({
      fromId: nextEdge.entityBId,
      toId: nextEdge.entityAId,
      proposedDelta: { tension: 16, jealousy: isSharedRival ? 10 : 0, affinity: -5 },
      currentAttitude: nextEdge.bToA,
      globalSettings: settings,
      now,
    });
    evType =
      outcome.nextConflictStage === 'cold_war'
        ? 'cold_war_started'
        : outcome.nextConflictStage === 'serious_conflict'
        ? 'conflict_escalated'
        : 'bickering';
  }

  const lines = Array.isArray(result.lines) ? result.lines.slice(0, 4) : [];
  const privMsgs = lines
    .filter((l: any) => l?.text)
    .map((l: any, idx: number) => {
      const senderId = l.senderId === actorB.id ? actorB.id : actorA.id;
      return {
        id: `${uid('pmsg')}_${idx}`,
        senderId,
        receiverId: senderId === actorA.id ? actorB.id : actorA.id,
        text: String(l.text).trim(),
        timestamp: now + idx * 1000,
        triggerEventId: eventId,
      };
    });

  const socialEvent: AiSocialEvent = {
    id: eventId,
    type: evType,
    actorIds: [actorA.id, actorB.id],
    pairId: nextEdge.id,
    summary: String(result.summary || `${actorA.name} 与 ${actorB.name} 因「${reason}」${conflictMode === 'reconcile' ? '沟通后缓和了关系' : '有些情绪摩擦'}`).trim(),
    isMajor: evType === 'cold_war_started' || evType === 'reconciled' || evType === 'conflict_escalated',
    createdAt: now,
  };

  if (privMsgs.length > 0 && canSendPrivateMessage(nextEdge, actorA.id, settings).allowed) {
    await appendPrivateChatTurnAtomic({
      participantA: actorA.id,
      participantB: actorB.id,
      edge: nextEdge,
      event: socialEvent,
      newMessages: privMsgs,
      metaEntries: [buildDailyQuotaMeta(dailyCount, now)],
    });
  } else {
    await commitSocialTransaction({
      edges: [nextEdge],
      events: [socialEvent],
      metaEntries: [buildDailyQuotaMeta(dailyCount, now)],
    });
  }

  if (socialEvent.isMajor) {
    await maybeNotifyMajorSocialChange({
      leadCharacter: actorA,
      title: `${actorA.name} 与 ${actorB.name} 关系变化`,
      body: socialEvent.summary,
      eventId,
    });
  }

  return { ok: true, stage: nextEdge.conflictStage };
}

/**
 * 6. AI-to-AI & AI-authored Moments Publishing + Permission-Checked Reactions
 */
export async function executeAiMomentReact(params: {
  post: AiSocialMomentPost | MomentPost;
  owner: AiCharacter;
  viewer: AiCharacter;
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}): Promise<boolean> {
  const settings = loadAiSocialSettings();
  const { post, owner, viewer, userProfile, apiConfig, onAddApiLog } = params;
  const edge = await getRelationshipEdge(viewer.id, owner.id);
  if (!canInteractMoments(edge, viewer.id, owner.id, settings) || !edge) {
    return false;
  }

  const now = Date.now();
  const { result, log } = await callSocialTurnApi({
    actionType: 'moments_react',
    actorA: owner,
    actorB: viewer,
    edgeSummary: summarizeEdgeForPrompt(edge, owner.name, viewer.name),
    momentContext: { content: post.content },
    userProfile,
    apiConfig,
  });
  if (log && onAddApiLog) onAddApiLog(log);

  const shouldLike = Boolean(result.shouldLike);
  const commentText = String(result.commentText || '').trim();
  if (!shouldLike && !commentText) return false;

  const updatedPost: AiSocialMomentPost = {
    ...post,
    sourceType: 'ai_social',
    likes: shouldLike && !post.likes.some((l) => l.id === viewer.id)
      ? [...post.likes, { id: viewer.id, name: viewer.name, avatar: viewer.avatar }]
      : post.likes,
    comments: commentText
      ? [
          ...post.comments,
          {
            id: uid('mc'),
            authorId: viewer.id,
            authorName: viewer.name,
            authorAvatar: viewer.avatar,
            text: commentText,
            timestamp: now,
          },
        ]
      : post.comments,
  };

  const event: AiSocialEvent = {
    id: uid('sevt'),
    type: commentText ? 'moments_commented' : 'moments_liked',
    actorIds: [viewer.id, owner.id],
    targetId: owner.id,
    pairId: edge.id,
    momentId: post.id,
    summary:
      String(result.summary || '').trim() ||
      `${viewer.name} ${commentText ? `评论了 ${owner.name} 的朋友圈：“${commentText}”` : `点赞了 ${owner.name} 的朋友圈`}`,
    isMajor: false,
    createdAt: now,
  };

  await commitSocialTransaction({
    aiMoments: [updatedPost],
    events: [event],
  });
  return true;
}

// =========================================================================
// Event-Driven Entry Points (Low-frequency, Gated, Restart-Safe)
// =========================================================================

/**
 * Triggered ONLY when genuine group chat activity completes.
 * Evaluates pair familiarity, occasional friend request, private chat, or gated group random event.
 */
export async function onGroupInteractionSocialTick(params: {
  group: GroupChat;
  triggerId: string;
  allCharacters: AiCharacter[];
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
  onGroupRandomMessage?: (groupId: string, aiMember: AiCharacter, text: string) => void;
}): Promise<void> {
  const settings = loadAiSocialSettings();
  if (settings.paused || globalTickInFlight) return;
  if (await hasTriggerBeenProcessed(params.triggerId)) return;

  const now = Date.now();
  const lastTick = (await getSocialMeta<number>(META_LAST_TICK)) || 0;
  if (now - lastTick < 15_000) return;

  const aiMembersInGroup = (params.group.members || [])
    .filter((m) => m.memberType === 'ai')
    .map((m) => params.allCharacters.find((c) => c.id === (m.characterId || m.id)))
    .filter((c): c is AiCharacter => Boolean(c));

  if (aiMembersInGroup.length < 2) return;

  globalTickInFlight = true;
  try {
    const procMeta = await buildProcessedTriggerMeta(params.triggerId, now);
    if (procMeta) {
      await commitSocialTransaction({
        metaEntries: [
          procMeta,
          { key: META_LAST_TICK, value: now, updatedAt: now },
        ],
      });
    }

    // 1. Ensure AI pairs inside active group recognize each other as acquaintances
    const charA = aiMembersInGroup[0];
    const charB = aiMembersInGroup[Math.floor(Math.random() * (aiMembersInGroup.length - 1)) + 1];
    if (!charA || !charB || charA.id === charB.id) return;

    const edge = await ensureMetInGroup({ charA, charB, group: params.group });
    const policy = getSocialFrequencyPolicy(settings);
    const dailyCount = await getDailyQuotaCount(now);
    if (dailyCount >= policy.dailyMaxAiEvents) return;

    // Roll probability strictly based on user-configured low/medium/high cadence
    const roll = Math.random();
    if (roll > policy.groupRandomEventProbability) return;

    // 2. If not friends yet and requests allowed -> consider friend request
    if (
      (!edge || edge.status === 'acquaintances') &&
      settings.allowFriendRequests &&
      Math.random() < 0.55
    ) {
      await executeFriendRequestFlow({
        sender: charA,
        receiver: charB,
        userProfile: params.userProfile,
        reasonHint: `共同群聊「${params.group.name}」互动`,
        apiConfig: params.apiConfig,
        onAddApiLog: params.onAddApiLog,
      });
      return;
    }

    // 3. If already friends and group random events allowed -> generate a subtle random event
    if (settings.allowGroupRandomEvents && params.onGroupRandomMessage) {
      const stateA = await getEffectiveRomanticState(charA);
      const stateB = await getEffectiveRomanticState(charB);
      const sharedTarget = detectSharedRomanticTarget(stateA, stateB);
      const recentText = (params.group.messages || [])
        .slice(-5)
        .map((m) => `${m.senderName}: ${m.text}`)
        .join(' | ');

      const subtypeHint =
        sharedTarget && settings.allowConflicts && Math.random() < 0.45
          ? 'jealousy_sparked'
          : Math.random() < 0.5
          ? 'shared_interest'
          : 'helped';

      const { result, log } = await callSocialTurnApi({
        actionType: 'group_random_event',
        actorA: charA,
        actorB: charB,
        edgeSummary: summarizeEdgeForPrompt(edge, charA.name, charB.name),
        romanticContext: describeRomanticBoundary(stateA, stateB, charA, charB, params.userProfile),
        groupContext: {
          groupName: params.group.name,
          recentText,
          subtypeHint,
        },
        userProfile: params.userProfile,
        apiConfig: params.apiConfig,
      });
      if (log && params.onAddApiLog) params.onAddApiLog(log);

      const actingAi =
        aiMembersInGroup.find((c) => c.id === result.actingAiId) || charA;
      const msgText = String(result.groupMessageText || '').trim();
      const evt: AiSocialEvent = {
        id: uid('sevt'),
        type:
          result.eventSubtype === 'jealousy_sparked'
            ? 'jealousy_sparked'
            : result.eventSubtype === 'shared_interest'
            ? 'shared_interest'
            : result.eventSubtype === 'helped'
            ? 'helped'
            : 'group_random_event',
        actorIds: [charA.id, charB.id],
        pairId: makePairId(charA.id, charB.id),
        groupId: params.group.id,
        summary: String(result.summary || `${charA.name} 和 ${charB.name} 在群里顺着话题聊了几句`).trim(),
        isMajor: false,
        createdAt: now,
      };
      await commitSocialTransaction({
        events: [evt],
        metaEntries: [buildDailyQuotaMeta(dailyCount, now)],
      });
      if (msgText) {
        params.onGroupRandomMessage(params.group.id, actingAi, msgText);
      }
      return;
    }

    // 4. Otherwise if friends and private chat allowed -> occasional brief private chat
    if (
      edge &&
      (edge.status === 'friends' || edge.status === 'close_friends') &&
      settings.allowPrivateChat
    ) {
      await executePrivateChatBurst({
        actorA: charA,
        actorB: charB,
        userProfile: params.userProfile,
        topicHint: `接着刚才群聊「${params.group.name}」的聊天顺口私聊`,
        apiConfig: params.apiConfig,
        onAddApiLog: params.onAddApiLog,
      });
    }
  } catch (e) {
    console.warn('[socialEngine] onGroupInteractionSocialTick error:', e);
  } finally {
    globalTickInFlight = false;
  }
}

/**
 * Triggered ONLY when user publishes a real Moment or AI publishes an AI Moment.
 * Respects friendship permissions and cooldowns.
 */
export async function onMomentPublishedSocialTick(params: {
  postId: string;
  allCharacters: AiCharacter[];
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}): Promise<void> {
  const settings = loadAiSocialSettings();
  if (settings.paused || !settings.allowMomentsInteraction) return;
  const triggerKey = `moment_${params.postId}`;
  if (await hasTriggerBeenProcessed(triggerKey)) return;

  const now = Date.now();
  const procMeta = await buildProcessedTriggerMeta(triggerKey, now);
  if (procMeta) {
    await commitSocialTransaction({ metaEntries: [procMeta] });
  }

  // Check if any existing AI Moments can be gently reacted to by an AI friend
  const edges = await getAllRelationshipEdges();
  const friendEdges = edges.filter(
    (e) =>
      (e.status === 'friends' || e.status === 'close_friends') &&
      e.entityAId !== USER_ENTITY_ID &&
      e.entityBId !== USER_ENTITY_ID
  );
  if (friendEdges.length === 0) return;

  const aiMoments = await getAllAiMoments();
  if (aiMoments.length === 0) return;
  const latestAiMoment = aiMoments[0];
  const owner = params.allCharacters.find((c) => c.id === latestAiMoment.authorId);
  if (!owner) return;

  for (const edge of friendEdges) {
    const peerId = edge.entityAId === owner.id ? edge.entityBId : edge.entityBId === owner.id ? edge.entityAId : null;
    if (!peerId) continue;
    const viewer = params.allCharacters.find((c) => c.id === peerId);
    if (!viewer) continue;
    if (!latestAiMoment.comments.some((c) => c.authorId === viewer.id)) {
      await executeAiMomentReact({
        post: latestAiMoment,
        owner,
        viewer,
        userProfile: params.userProfile,
        apiConfig: params.apiConfig,
        onAddApiLog: params.onAddApiLog,
      });
      break;
    }
  }
}
