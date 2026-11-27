import {
  AiCharacter,
  AiRelationshipEdge,
  ForwardBundlePayload,
  GroupChat,
  GroupChatMessage,
  GroupMember,
  GroupPollPayload,
  GroupRandomDrawPayload,
  GroupRelayPayload,
  UserProfile,
} from '../../types';
import { applyOverlengthContextProtection, ContextWindowMetrics, STANDARD_CONTEXT_LIMIT } from '../contextWindow';
import { buildIsolatedPrivateContextForGroup } from '../crossChannel/crossChannelStore';
import { serializeForwardBundleForAi } from '../forward/forwardBundleService';
import { apiFetch } from '../localBackend';
import { getAllRelationshipEdges } from '../social/socialDb';
import { loadApiConfig, loadCharacters, loadUserProfile } from '../storage';
import { sanitizeReplyText } from '../thinkCleaner';
import {
  calculateTypingDelay,
  splitMessageIntoSentenceBubbles,
} from '../wechatMultiBubble';
import {
  GroupContinueInPrivateTimelineEvent,
  GroupJoinRelayTimelineEvent,
  GroupMessageTimelineEvent,
  GroupReplyTask,
  GroupRoundPlan,
  GroupTimelineEvent,
  GroupVotePollTimelineEvent,
  resolveGroupActivityPreset,
} from './groupRoundTypes';

const BASE_CONTEXT_WINDOW = STANDARD_CONTEXT_LIMIT;
const MAX_DYNAMIC_CONTEXT_WINDOW = STANDARD_CONTEXT_LIMIT;

const STATUS_LABEL_MAP: Record<string, string> = {
  strangers: '陌生',
  acquaintances: '认识/点头之交',
  friend_request_pending: '好友申请中',
  friends: '好友',
  close_friends: '挚友/密友',
  tense: '关系紧张',
  unfriended: '已互删',
  blocked: '已拉黑',
};

const CONFLICT_LABEL_MAP: Record<string, string> = {
  none: '',
  dissatisfied: '轻微不满',
  bickering: '拌嘴中',
  tense: '气氛紧张',
  cold_war: '冷战中',
  serious_conflict: '严重矛盾',
  reconciled: '刚和好',
};

/**
 * Strip all binary/data-URL media and avatar fields before sending over HTTP.
 * Keeps avatars/images untouched in IndexedDB while guaranteeing lean payloads.
 */
export function stripBinaryTransportData(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;

  if (typeof value === 'string') {
    if (/^data:(image|audio|video)\//i.test(value)) return '[本地媒体已省略]';
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripBinaryTransportData(item, depth + 1));
  }

  if (typeof value !== 'object') return value;

  const blockedKeys = new Set([
    'avatar',
    'notificationAvatar',
    'senderAvatar',
    'memberAvatar',
    'imageUrl',
    'imageData',
    'dataUrl',
    'base64',
    'audioUrl',
    'videoUrl',
  ]);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (blockedKeys.has(key)) continue;
    output[key] = stripBinaryTransportData(item, depth + 1);
  }
  return output;
}

function sanitizePollPayloadForPrompt(payload: GroupPollPayload): Record<string, unknown> {
  const isExpired = Boolean(payload.deadline && Date.now() > payload.deadline);
  const isClosed = Boolean(payload.closed || isExpired);
  return {
    title: payload.title,
    multiSelect: Boolean(payload.multiSelect),
    maxSelections: payload.multiSelect
      ? Math.max(1, payload.maxSelections || payload.options.length)
      : 1,
    anonymous: Boolean(payload.anonymous),
    closed: isClosed,
    options: (payload.options || []).map((opt) => ({
      id: opt.id,
      text: opt.text,
      votes: opt.voterIds?.length || 0,
      voterNames: payload.anonymous
        ? []
        : (opt.voterIds || []).map((vid) => opt.voterNames?.[vid] || vid),
    })),
  };
}

function resolveForwardBundleFromGroupMsg(message: GroupChatMessage): ForwardBundlePayload | undefined {
  if (message.forwardBundle) return message.forwardBundle;
  if (message.messageType === 'forward_bundle' && message.payload && 'items' in (message.payload as any)) {
    return message.payload as ForwardBundlePayload;
  }
  return undefined;
}

export function buildLeanGroupMessage(message: GroupChatMessage): Record<string, unknown> {
  let text = message.text;
  const bundle = resolveForwardBundleFromGroupMsg(message);
  if (message.messageType === 'forward_bundle' && bundle) {
    text = serializeForwardBundleForAi(bundle);
  } else if (message.messageType === 'image') {
    const desc = (message.imageAnalysisText || '').trim();
    if (desc) {
      text = `[图片消息：${desc}]`;
    } else if (message.text && message.text !== '[图片]') {
      text = `[图片消息：${message.text}]`;
    } else {
      text = '[图片消息]';
    }
  }

  let leanPayload: unknown = undefined;
  if (message.messageType === 'poll' && message.payload) {
    leanPayload = sanitizePollPayloadForPrompt(message.payload as GroupPollPayload);
  } else if (message.messageType === 'forward_bundle' && bundle) {
    leanPayload = {
      title: bundle.title,
      itemCount: bundle.items?.length || 0,
      sourceName: bundle.sourceName,
    };
  } else if (message.payload) {
    leanPayload = stripBinaryTransportData(message.payload);
  }

  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    senderType: message.senderType,
    text,
    timestamp: message.timestamp,
    mentionedMemberIds: message.mentionedMemberIds,
    messageType: message.messageType,
    quoteMessage: message.quoteMessage
      ? {
          id: message.quoteMessage.id,
          senderName: message.quoteMessage.senderName,
          text: message.quoteMessage.text,
        }
      : undefined,
    payload: leanPayload,
  };
}

/**
 * Unified 100-message context window with over-length protection:
 * - Normal case: keep the latest 100 valid messages verbatim in chronological order.
 * - Over-length protection: ONLY when formatted context exceeds token budget, retain the
 *   latest 30 raw messages verbatim and condense earlier (up to 70) into a chronological summary.
 * - Messages earlier than the 100-message window are summarized concisely with zero API calls.
 */
export function selectDynamicGroupContext(allMessages: GroupChatMessage[]): {
  recentMessages: GroupChatMessage[];
  olderContextSummary: string;
  contextMetrics: ContextWindowMetrics;
} {
  const validMessages = (allMessages || []).filter((m) => !m.isRecalled);
  const splitIndex = Math.max(0, validMessages.length - MAX_DYNAMIC_CONTEXT_WINDOW);
  const olderMessages = validMessages.slice(0, splitIndex);
  const candidateRecent = validMessages.slice(splitIndex);

  const protection = applyOverlengthContextProtection<GroupChatMessage>({
    messages: candidateRecent,
    maxRawLimit: BASE_CONTEXT_WINDOW,
    formatForEstimate: (m) => {
      const bundle = resolveForwardBundleFromGroupMsg(m);
      const formattedText =
        m.messageType === 'forward_bundle' && bundle
          ? serializeForwardBundleForAi(bundle)
          : m.messageType === 'image'
            ? `[图片:${m.imageAnalysisText || m.text || '图片'}]`
            : m.text || '';
      return {
        timestamp: m.timestamp,
        senderName: m.senderName,
        text: formattedText,
      };
    },
    cloneWithTruncatedText: (m, truncatedText) => ({
      ...m,
      text: truncatedText,
    }),
  });

  const recentMessages = protection.rawMessages;
  const summaryParts: string[] = [];

  if (olderMessages.length > 0) {
    const toolSummaries: string[] = [];
    const sampleOlderLines: string[] = [];

    for (const m of olderMessages) {
      if (m.messageType === 'poll' && m.payload) {
        const p = m.payload as GroupPollPayload;
        const topOpts = (p.options || [])
          .map((o) => `${o.text}(${o.voterIds?.length || 0}票)`)
          .join('/');
        toolSummaries.push(`历史投票「${p.title}」(${p.closed ? '已结束' : '进行中'}): ${topOpts}`);
      } else if (m.messageType === 'relay' && m.payload) {
        const r = m.payload as GroupRelayPayload;
        toolSummaries.push(`历史接龙「${r.title}」(${r.entries?.length || 0}条)`);
      } else if (m.messageType === 'random_draw' && m.payload) {
        const d = m.payload as GroupRandomDrawPayload;
        const names = (d.winners || []).map((w) => w.memberName).join('、');
        toolSummaries.push(`历史抽人(${d.taskDescription || '随机抽取'}): 抽中${names}`);
      } else if (m.messageType === 'forward_bundle') {
        const b = resolveForwardBundleFromGroupMsg(m);
        if (b) {
          toolSummaries.push(`历史聊天记录「${b.title}」(${b.items?.length || 0}条)`);
        }
      }
    }

    const tailOlder = olderMessages
      .filter((m) => m.senderId !== 'system' && (!m.messageType || m.messageType === 'text'))
      .slice(-6);
    for (const m of tailOlder) {
      const snippet = (m.text || '').replace(/\s+/g, ' ').slice(0, 40);
      if (snippet) {
        sampleOlderLines.push(`${m.senderName}:${snippet}`);
      }
    }

    summaryParts.push(`更早（100条以前）共有 ${olderMessages.length} 条群消息。`);
    if (toolSummaries.length > 0) {
      summaryParts.push(`历史群工具记录：${toolSummaries.slice(-3).join('；')}。`);
    }
    if (sampleOlderLines.length > 0) {
      summaryParts.push(`较早话题片段：${sampleOlderLines.join(' | ')}`);
    }
  }

  if (protection.earlierSummaryText) {
    summaryParts.push(protection.earlierSummaryText);
  }

  return {
    recentMessages,
    olderContextSummary: summaryParts.join('\n'),
    contextMetrics: protection.metrics,
  };
}

function buildRelationshipSummaryLines(
  edges: AiRelationshipEdge[],
  memberMap: Map<string, { id: string; name: string }>
) {
  const summaries: Array<{
    pairId: string;
    memberAId: string;
    memberAName: string;
    memberBId: string;
    memberBName: string;
    status: string;
    conflictStage: string;
    summary: string;
  }> = [];

  for (const edge of edges) {
    const mA = memberMap.get(edge.entityAId);
    const mB = memberMap.get(edge.entityBId);
    if (!mA || !mB) continue;

    const statusLabel = STATUS_LABEL_MAP[edge.status] || edge.status;
    const conflictLabel = edge.conflictStage ? CONFLICT_LABEL_MAP[edge.conflictStage] || '' : '';
    const impAB = edge.aToB?.lastImpression ? `；${mA.name}对${mB.name}印象：${edge.aToB.lastImpression}` : '';
    const impBA = edge.bToA?.lastImpression ? `；${mB.name}对${mA.name}印象：${edge.bToA.lastImpression}` : '';

    summaries.push({
      pairId: edge.id,
      memberAId: mA.id,
      memberAName: mA.name,
      memberBId: mB.id,
      memberBName: mB.name,
      status: edge.status,
      conflictStage: edge.conflictStage || 'none',
      summary: `${mA.name} 与 ${mB.name} 当前关系：${statusLabel}${conflictLabel ? `（${conflictLabel}）` : ''}${impAB}${impBA}`,
    });
  }
  return summaries;
}

function collectActivePolls(group: GroupChat, aiMembers: GroupMember[], targetPollId?: string) {
  const now = Date.now();
  const aiIdLookup = new Set<string>();
  for (const m of aiMembers) {
    aiIdLookup.add(m.id);
    if (m.characterId) aiIdLookup.add(m.characterId);
  }

  const polls: Array<{
    pollId: string;
    title: string;
    multiSelect: boolean;
    maxSelections: number;
    anonymous: boolean;
    isTargetPoll: boolean;
    alreadyVotedAiIds: string[];
    options: Array<{
      id: string;
      text: string;
      votes: number;
      voterNames: string[];
    }>;
  }> = [];

  for (const msg of group.messages || []) {
    if (msg.messageType !== 'poll' || !msg.payload) continue;
    const payload = msg.payload as GroupPollPayload;
    const isExpired = Boolean(payload.deadline && now > payload.deadline);
    if (payload.closed || isExpired) continue;

    const votedAiSet = new Set<string>();
    for (const opt of payload.options || []) {
      for (const vid of opt.voterIds || []) {
        if (aiIdLookup.has(vid)) {
          const matched = aiMembers.find((m) => m.id === vid || m.characterId === vid);
          votedAiSet.add(matched ? matched.id : vid);
        }
      }
    }

    polls.push({
      pollId: msg.id,
      title: payload.title,
      multiSelect: Boolean(payload.multiSelect),
      maxSelections: payload.multiSelect
        ? Math.max(1, payload.maxSelections || payload.options.length)
        : 1,
      anonymous: Boolean(payload.anonymous),
      isTargetPoll: Boolean(targetPollId && msg.id === targetPollId),
      alreadyVotedAiIds: Array.from(votedAiSet),
      options: (payload.options || []).map((o) => ({
        id: o.id,
        text: o.text,
        votes: o.voterIds?.length || 0,
        voterNames: payload.anonymous
          ? []
          : (o.voterIds || []).map((vid) => o.voterNames?.[vid] || vid),
      })),
    });
  }

  // Keep target poll plus at most 2 latest open polls so context stays focused
  polls.sort((a, b) => Number(b.isTargetPoll) - Number(a.isTargetPoll));
  return polls.slice(0, 3);
}

function collectActiveRelays(group: GroupChat, aiMembers: GroupMember[]) {
  const now = Date.now();
  const aiIdLookup = new Set<string>();
  for (const m of aiMembers) {
    aiIdLookup.add(m.id);
    if (m.characterId) aiIdLookup.add(m.characterId);
  }

  const relays: Array<{
    relayMessageId: string;
    title: string;
    description?: string;
    allowDuplicate: boolean;
    alreadyJoinedAiIds: string[];
    entries: Array<{
      memberName: string;
      content: string;
    }>;
  }> = [];

  for (const msg of group.messages || []) {
    if (msg.messageType !== 'relay' || !msg.payload) continue;
    const payload = msg.payload as GroupRelayPayload;
    const isExpired = Boolean(payload.deadline && now > payload.deadline);
    if (payload.closed || isExpired) continue;

    const joinedAiSet = new Set<string>();
    for (const entry of payload.entries || []) {
      if (aiIdLookup.has(entry.memberId)) {
        const matched = aiMembers.find((m) => m.id === entry.memberId || m.characterId === entry.memberId);
        joinedAiSet.add(matched ? matched.id : entry.memberId);
      }
    }

    relays.push({
      relayMessageId: msg.id,
      title: payload.title,
      description: payload.description,
      allowDuplicate: Boolean(payload.allowDuplicate),
      alreadyJoinedAiIds: Array.from(joinedAiSet),
      entries: (payload.entries || []).slice(-20).map((e) => ({
        memberName: e.memberName,
        content: e.content,
      })),
    });
  }

  return relays.slice(-3);
}

function resolveMemberId(
  rawId: string | undefined,
  rawName: string | undefined,
  aiMembers: GroupMember[]
): GroupMember | undefined {
  if (rawId) {
    const byId = aiMembers.find((m) => m.id === rawId || m.characterId === rawId);
    if (byId) return byId;
  }
  if (rawName) {
    const cleanName = rawName.trim();
    const byName = aiMembers.find((m) => m.name === cleanName);
    if (byName) return byName;
  }
  return undefined;
}

function normalizeBubblesForEvent(
  rawBubbles: unknown,
  fallbackText: unknown,
  maxPerEvent: number
): string[] {
  const candidates: string[] = [];

  if (Array.isArray(rawBubbles) && rawBubbles.length > 0) {
    for (const item of rawBubbles) {
      if (typeof item !== 'string') continue;
      const cleaned = sanitizeReplyText(item).trim();
      if (!cleaned) continue;
      // Only split an individual model bubble if it crammed a long paragraph (>85 chars) into one entry
      if (cleaned.length > 85) {
        const sub = splitMessageIntoSentenceBubbles(cleaned, {
          maxBubbles: 2,
          targetMaxChars: 48,
        });
        candidates.push(...sub);
      } else {
        candidates.push(cleaned);
      }
    }
  } else if (typeof fallbackText === 'string' && fallbackText.trim()) {
    const cleaned = sanitizeReplyText(fallbackText).trim();
    if (cleaned.length > 40) {
      candidates.push(
        ...splitMessageIntoSentenceBubbles(cleaned, {
          maxBubbles: Math.max(2, Math.min(3, maxPerEvent)),
          targetMaxChars: 42,
        })
      );
    } else if (cleaned) {
      candidates.push(cleaned);
    }
  }

  const trimmed = candidates.map((b) => b.trim()).filter(Boolean);
  if (trimmed.length <= maxPerEvent) return trimmed;

  // Merge overflow gently into the last allowed bubble instead of losing text
  const kept = trimmed.slice(0, maxPerEvent);
  const overflow = trimmed.slice(maxPerEvent).join('');
  if (overflow) {
    kept[kept.length - 1] = `${kept[kept.length - 1]}${overflow}`;
  }
  return kept;
}

function clampDelayMs(rawDelay: unknown, fallbackText?: string): number {
  if (typeof rawDelay === 'number' && Number.isFinite(rawDelay)) {
    return Math.max(600, Math.min(2200, Math.round(rawDelay)));
  }
  if (fallbackText) {
    return Math.max(600, Math.min(1800, calculateTypingDelay(fallbackText, 'normal')));
  }
  return 850;
}

/**
 * Validate and normalize server response into a strict GroupRoundPlan.
 * Seamlessly supports BOTH new { roundId, events } and legacy { replies } / { text }.
 */
export function normalizeGroupRoundPlan(params: {
  data: any;
  fallbackRoundId: string;
  group: GroupChat;
  aiMembers: GroupMember[];
}): GroupRoundPlan {
  const { data, fallbackRoundId, group, aiMembers } = params;
  const preset = resolveGroupActivityPreset(group.activityLevel);
  const roundId =
    typeof data?.roundId === 'string' && data.roundId.trim()
      ? data.roundId.trim()
      : fallbackRoundId;
  const thinkingSummary =
    typeof data?.thinkingSummary === 'string' ? data.thinkingSummary.trim() : '';
  const realThinkingProcess =
    typeof data?.thinkingProcess === 'string' && data.thinkingProcess.trim()
      ? data.thinkingProcess.trim()
      : undefined;
  const reasoningAvailable = Boolean(data?.reasoningAvailable && realThinkingProcess) || Boolean(realThinkingProcess);
  const reasoningSource = reasoningAvailable ? data?.reasoningSource || 'think_tag' : 'none';

  const rawEvents: any[] = [];

  if (Array.isArray(data?.events) && data.events.length > 0) {
    rawEvents.push(...data.events);
  } else if (Array.isArray(data?.replies) && data.replies.length > 0) {
    // Backward-compatibility adapter: legacy replies[] -> unified message events
    data.replies.forEach((r: any, idx: number) => {
      rawEvents.push({
        eventId: `${roundId}_legacy_r_${idx}`,
        type: 'message',
        senderId: r.responderId || r.senderId,
        senderName: r.responderName || r.senderName,
        bubbles: Array.isArray(r.bubbles) ? r.bubbles : undefined,
        text: r.text,
        delayMs: idx === 0 ? 700 : 950,
        mentionedMemberIds: Array.isArray(r.mentionedMemberIds) ? r.mentionedMemberIds : [],
        thinkingProcess: idx === 0 ? realThinkingProcess || '' : '',
        reasoningAvailable: idx === 0 ? reasoningAvailable : false,
        reasoningSource: idx === 0 ? reasoningSource : 'none',
      });
    });
  } else if (data?.shouldRespond !== false && typeof data?.text === 'string' && data.text.trim()) {
    // Backward-compatibility adapter: legacy single text -> unified message event
    rawEvents.push({
      eventId: `${roundId}_legacy_single_0`,
      type: 'message',
      senderId: data.responderId || data.senderId,
      senderName: data.responderName || data.senderName,
      text: data.text,
      delayMs: 750,
      mentionedMemberIds: Array.isArray(data.mentionedMemberIds) ? data.mentionedMemberIds : [],
      thinkingProcess: realThinkingProcess || '',
      reasoningAvailable,
      reasoningSource,
    });
  }

  if (Array.isArray(data?.actions) && data.actions.length > 0) {
    rawEvents.push(...data.actions);
  }

  const events: GroupTimelineEvent[] = [];
  const seenVoteKeys = new Set<string>();
  const seenRelayContentKeys = new Set<string>();
  const seenPrivateTransitions = new Set<string>();
  const usedEventIds = new Set<string>();
  let totalBubblesPlanned = 0;

  for (let i = 0; i < rawEvents.length; i++) {
    const raw = rawEvents[i];
    if (!raw || typeof raw !== 'object') continue;

    const rawType = String(raw.type || '').trim();
    const baseEventId =
      typeof raw.eventId === 'string' && raw.eventId.trim()
        ? raw.eventId.trim()
        : `${roundId}_ev_${i}`;
    const eventId = usedEventIds.has(baseEventId) ? `${baseEventId}_${i}` : baseEventId;
    usedEventIds.add(eventId);

    if (rawType === 'message') {
      if (totalBubblesPlanned >= preset.maxBubbles) {
        continue;
      }
      const member =
        resolveMemberId(raw.senderId || raw.responderId, raw.senderName || raw.responderName, aiMembers) ||
        aiMembers[0];
      if (!member) continue;

      const remainingBudget = Math.max(1, preset.maxBubbles - totalBubblesPlanned);
      const maxForThisEvent = Math.min(
        Math.max(preset.maxConsecutivePerAi, Array.isArray(raw.bubbles) && raw.bubbles.length === 3 ? 3 : preset.maxConsecutivePerAi),
        remainingBudget
      );
      const bubbles = normalizeBubblesForEvent(raw.bubbles, raw.text, maxForThisEvent);
      if (bubbles.length === 0) continue;

      totalBubblesPlanned += bubbles.length;
      const msgEvent: GroupMessageTimelineEvent = {
        eventId,
        type: 'message',
        senderId: member.id,
        senderName: member.name,
        bubbles,
        delayMs: clampDelayMs(raw.delayMs, bubbles[0]),
        mentionedMemberIds: Array.isArray(raw.mentionedMemberIds)
          ? raw.mentionedMemberIds.map(String)
          : [],
        thinkingProcess:
          typeof raw.thinkingProcess === 'string' && raw.thinkingProcess.trim()
            ? raw.thinkingProcess.trim()
            : undefined,
        reasoningAvailable: Boolean(raw.reasoningAvailable),
        reasoningSource: raw.reasoningSource,
      };
      events.push(msgEvent);
    } else if (rawType === 'vote_poll') {
      const actor = resolveMemberId(raw.actorId || raw.senderId, raw.actorName, aiMembers);
      const pollId = typeof raw.pollId === 'string' ? raw.pollId.trim() : '';
      if (!actor || !pollId) continue;

      const rawOptionIds: string[] = [];
      if (Array.isArray(raw.optionIds)) {
        raw.optionIds.forEach((o: unknown) => {
          if (typeof o === 'string' && o.trim()) rawOptionIds.push(o.trim());
        });
      }
      if (typeof raw.optionId === 'string' && raw.optionId.trim()) {
        rawOptionIds.push(raw.optionId.trim());
      }
      const uniqueOptions = Array.from(new Set(rawOptionIds));
      if (uniqueOptions.length === 0) continue;

      // Prevent same AI from emitting duplicate vote_poll for the same poll within one round
      const voteKey = `${pollId}::${actor.id}`;
      if (seenVoteKeys.has(voteKey)) continue;
      seenVoteKeys.add(voteKey);

      const voteEvent: GroupVotePollTimelineEvent = {
        eventId,
        type: 'vote_poll',
        actorId: actor.id,
        actorName: actor.name,
        pollId,
        optionId: uniqueOptions[0],
        optionIds: uniqueOptions,
        delayMs: Math.max(550, Math.min(1400, Number(raw.delayMs) || 750)),
      };
      events.push(voteEvent);
    } else if (rawType === 'join_relay') {
      const actor = resolveMemberId(raw.actorId || raw.senderId, raw.actorName || raw.senderName, aiMembers);
      const relayMessageId = String(raw.relayMessageId || raw.relayId || raw.messageId || '').trim();
      const content = sanitizeReplyText(String(raw.content || raw.text || '')).trim();
      if (!actor || !relayMessageId || !content) continue;

      const dedupeRelayKey = `${relayMessageId}::${actor.id}::${content}`;
      if (seenRelayContentKeys.has(dedupeRelayKey)) continue;
      seenRelayContentKeys.add(dedupeRelayKey);

      const relayEvent: GroupJoinRelayTimelineEvent = {
        eventId,
        type: 'join_relay',
        actorId: actor.id,
        actorName: actor.name,
        relayMessageId,
        content,
        delayMs: Math.max(600, Math.min(1500, Number(raw.delayMs) || 850)),
      };
      events.push(relayEvent);
    } else if (rawType === 'continue_in_private') {
      const actor = resolveMemberId(
        raw.actorId || raw.characterId || raw.senderId,
        raw.actorName || raw.senderName,
        aiMembers
      );
      if (!actor) continue;

      const targetCharacterId = actor.characterId || actor.id;
      if (seenPrivateTransitions.has(targetCharacterId)) continue;

      const rawList = Array.isArray(raw.privateOpeningMessages)
        ? raw.privateOpeningMessages
        : Array.isArray(raw.messages)
          ? raw.messages
          : Array.isArray(raw.openingMessages)
            ? raw.openingMessages
            : typeof raw.text === 'string'
              ? [raw.text]
              : [];

      const openings = rawList
        .map((s: unknown) => sanitizeReplyText(String(s || '')).trim())
        .filter(Boolean)
        .slice(0, 3);
      if (openings.length === 0) continue;

      seenPrivateTransitions.add(targetCharacterId);
      const ccpEvent: GroupContinueInPrivateTimelineEvent = {
        eventId,
        type: 'continue_in_private',
        actorId: actor.id,
        actorName: actor.name,
        characterId: targetCharacterId,
        reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : '有些话想私下跟你说',
        triggerSummary:
          typeof raw.triggerSummary === 'string' && raw.triggerSummary.trim()
            ? raw.triggerSummary.trim()
            : undefined,
        privateOpeningMessages: openings,
        delayMs: 250,
      };
      events.push(ccpEvent);
    } else {
      // Requirement XI.3: Ignore unknown event types safely and log without crashing
      console.warn('[GroupRoundOrchestrator] Ignoring unknown event type:', rawType, raw);
    }
  }

  return {
    roundId,
    shouldRespond: data?.shouldRespond !== false && events.length > 0,
    thinkingSummary: thinkingSummary || undefined,
    thinkingProcess: realThinkingProcess,
    reasoningAvailable,
    reasoningSource,
    events,
  };
}

/**
 * Single-call Group Round Orchestrator:
 * - Gathers dynamic 30+ message context + older summary (strictly binary/avatar-free)
 * - Gathers active open polls & relevant AI personas/memories/relationships
 * - Calls /api/gemini/group-chat EXACTLY ONCE
 * - Parses and validates the full interleaved timeline plan
 */
export async function orchestrateGroupRound(params: {
  group: GroupChat;
  task: GroupReplyTask;
}): Promise<GroupRoundPlan> {
  const { group, task } = params;
  const aiMembers = (group.members || []).filter((m) => m.memberType !== 'human' && !m.isMuted);
  if (aiMembers.length === 0) {
    throw new Error('当前群内暂无未静音的 AI 成员可回复');
  }

  const allCharacters: AiCharacter[] = loadCharacters();
  const userProfile: UserProfile = loadUserProfile();
  const apiConfig = loadApiConfig();
  const activityLevel = group.activityLevel || 'natural';

  let chosenTargetId = task.targetAiId;
  if (chosenTargetId && chosenTargetId !== '@all') {
    const exists = aiMembers.some((m) => m.id === chosenTargetId || m.characterId === chosenTargetId);
    if (!exists) chosenTargetId = undefined;
  }

  // Only pass relevant concise persona/memory data for active group AI members (never avatars)
  const aiCandidateProfiles = aiMembers.map((m) => {
    const baseChar = allCharacters.find((c) => c.id === m.characterId || c.id === m.id);
    const rawMemories = m.memories || baseChar?.memories || [];
    return {
      id: m.id,
      characterId: m.characterId || baseChar?.id || m.id,
      name: m.name,
      wxid: m.wxid || m.id,
      persona: m.customPersona || baseChar?.persona || '群内AI成员',
      personality: m.customPersonality || baseChar?.personality || '善意、友好、口吻自然',
      memories: Array.isArray(rawMemories) ? rawMemories.slice(-8) : [],
      customPersona: m.customPersona,
      customPersonality: m.customPersonality,
    };
  });

  const memberLookup = new Map<string, { id: string; name: string }>();
  group.members.forEach((m) => {
    memberLookup.set(m.id, { id: m.id, name: m.name });
    if (m.characterId) {
      memberLookup.set(m.characterId, { id: m.id, name: m.name });
    }
  });

  const edges = await getAllRelationshipEdges().catch(() => []);
  const aiRelationships = buildRelationshipSummaryLines(edges, memberLookup);

  const { recentMessages: recentSourceMessages, olderContextSummary, contextMetrics } =
    selectDynamicGroupContext(group.messages || []);

  const latestUserSourceMessage =
    recentSourceMessages
      .slice()
      .reverse()
      .find((m) =>
        task.latestUserMessageId ? m.id === task.latestUserMessageId : m.senderType === 'human'
      ) || null;

  const recentMessages = recentSourceMessages.map(buildLeanGroupMessage);
  const latestUserMessage = latestUserSourceMessage
    ? buildLeanGroupMessage(latestUserSourceMessage)
    : task.latestUserText
      ? {
          id: task.latestUserMessageId,
          senderId: 'user_main',
          senderName: userProfile.name || '用户',
          senderType: 'human',
          text: task.latestUserText,
          timestamp: Date.now(),
        }
      : null;

  const activePolls = collectActivePolls(group, aiMembers, task.targetPollId);
  const activeRelays = collectActiveRelays(group, aiMembers);

  // Strictly isolated 30-message private context + continuity state per AI member
  const userName = (userProfile?.name || '用户').trim() || '用户';
  const aiPrivateContexts = await Promise.all(
    aiMembers.map(async (m) => {
      const charId = m.characterId || m.id;
      const isolated = await buildIsolatedPrivateContextForGroup(
        { id: charId, name: m.name },
        userName
      );
      return {
        memberId: m.id,
        ...isolated,
      };
    })
  );

  const combinedOlderSummary = [olderContextSummary, group.contextSummary]
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .join('\n');

  const requestBody = {
    roundId: task.roundId,
    triggerType: task.triggerType,
    activityLevel,
    targetPollId: task.targetPollId,
    activePolls,
    activeRelays,
    aiPrivateContexts,
    contextMetrics,
    olderContextSummary: combinedOlderSummary || undefined,
    group: {
      id: group.id,
      name: group.name,
      notice: group.notice,
      activityLevel,
      // Strictly identity/type metadata only — never avatars or base64
      members: group.members.map((m) => ({
        id: m.id,
        characterId: m.characterId,
        name: m.name,
        wxid: m.wxid,
        memberType: m.memberType,
        isMuted: m.isMuted,
      })),
    },
    recentMessages,
    latestUserMessage,
    mentionedTargets: task.mentionedTargets,
    aiCandidates: aiCandidateProfiles,
    aiRelationships,
    triggeredAiId: chosenTargetId,
    userProfile: {
      name: userProfile.name,
      wxid: userProfile.wxid,
      bio: userProfile.bio,
      persona: userProfile.persona,
      preferences: userProfile.preferences,
    },
    apiConfig,
  };

  const res = await apiFetch('/api/gemini/group-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.success === false) {
    throw new Error(data?.error || data?.message || `群聊 AI 接口请求失败 (${res.status})`);
  }

  const plan = normalizeGroupRoundPlan({
    data,
    fallbackRoundId: task.roundId,
    group,
    aiMembers,
  });

  if (data.shouldRespond !== false && plan.events.length === 0) {
    throw new Error('模型未返回有效的群聊事件计划，请检查模型配置后重试');
  }

  return plan;
}
