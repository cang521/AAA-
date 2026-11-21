/**
 * forwardBundleService.ts
 * Pure WeChat-style message snapshot bundling, AI prompt serialization, and local batch forwarding.
 *
 * Guarantees:
 * - ZERO model API calls when creating or sending merge-forward / item-by-item forwards.
 * - Strictly immutable forward_bundle snapshots (subsequent deletion of original messages never mutates the bundle).
 * - Strictly excludes thinkingProcess (CoT), API keys, internal task IDs, unshared memories, or unselected messages.
 * - Per-target error isolation: if one target fails, others still succeed cleanly.
 */

import {
  AiCharacter,
  ChatMessage,
  ForwardBundleItem,
  ForwardBundlePayload,
  GroupChat,
  GroupChatMessage,
  GroupPollPayload,
  GroupRandomDrawPayload,
  GroupRelayPayload,
  UserProfile,
} from '../../types';

export interface ForwardTargetDescriptor {
  targetType: 'private' | 'group';
  targetId: string;
  targetName: string;
}

export interface ForwardTargetResult {
  targetType: 'private' | 'group';
  targetId: string;
  targetName: string;
  ok: boolean;
  error?: string;
}

function formatBundleTime(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MM}-${DD} ${hh}:${mm}`;
}

function toLightweightAvatarRef(avatar?: string): string | undefined {
  if (!avatar || typeof avatar !== 'string') return undefined;
  const trimmed = avatar.trim();
  if (!trimmed) return undefined;
  // Keep lightweight URLs / short SVG defaults, avoid duplicating giant >24KB base64 blobs per item
  if (trimmed.startsWith('data:image/') && !trimmed.startsWith('data:image/svg+xml') && trimmed.length > 24000) {
    return undefined;
  }
  return trimmed;
}

export function cloneForwardBundle(bundle: ForwardBundlePayload): ForwardBundlePayload {
  return {
    version: 1,
    bundleId: bundle.bundleId,
    sourceType: bundle.sourceType,
    sourceId: bundle.sourceId,
    sourceName: bundle.sourceName,
    title: bundle.title,
    createdAt: bundle.createdAt,
    items: (bundle.items || []).map((item) => ({
      ...item,
      structuredData: item.structuredData ? { ...item.structuredData } : undefined,
      quoteSummary: item.quoteSummary ? { ...item.quoteSummary } : undefined,
    })),
  };
}

function summarizeGroupCardForBundle(msg: GroupChatMessage): {
  cardSummary?: string;
  structuredData?: Record<string, unknown>;
} {
  if (msg.messageType === 'relay' && msg.payload) {
    const p = msg.payload as GroupRelayPayload;
    const entriesText = (p.entries || [])
      .slice(0, 10)
      .map((e, i) => `${i + 1}.${e.memberName}:${e.content}`)
      .join('；');
    return {
      cardSummary: `[群接龙] ${p.title}${entriesText ? ` (${entriesText})` : ' (暂无成员接龙)'}`,
      structuredData: {
        kind: 'relay',
        title: p.title,
        description: p.description,
        closed: Boolean(p.closed),
        entryCount: p.entries?.length || 0,
        entries: (p.entries || []).slice(0, 12).map((e) => ({
          memberName: e.memberName,
          content: e.content,
        })),
      },
    };
  }

  if (msg.messageType === 'poll' && msg.payload) {
    const p = msg.payload as GroupPollPayload;
    const opts = (p.options || [])
      .map((o) => `${o.text}(${o.voterIds?.length || 0}票)`)
      .join(' / ');
    return {
      cardSummary: `[群投票] ${p.title}${opts ? `：${opts}` : ''}`,
      structuredData: {
        kind: 'poll',
        title: p.title,
        closed: Boolean(p.closed),
        anonymous: Boolean(p.anonymous),
        options: (p.options || []).map((o) => ({
          text: o.text,
          votes: o.voterIds?.length || 0,
        })),
      },
    };
  }

  if (msg.messageType === 'random_draw' && msg.payload) {
    const p = msg.payload as GroupRandomDrawPayload;
    const winners = (p.winners || []).map((w) => w.memberName).join('、');
    return {
      cardSummary: `[随机抽人] ${p.taskDescription || '随机抽签'}${winners ? `：抽中 ${winners}` : ''}`,
      structuredData: {
        kind: 'random_draw',
        taskDescription: p.taskDescription,
        winners: (p.winners || []).map((w) => w.memberName),
      },
    };
  }

  const nestedBundle =
    msg.forwardBundle ||
    (msg.messageType === 'forward_bundle' && msg.payload && 'items' in (msg.payload as any)
      ? (msg.payload as ForwardBundlePayload)
      : undefined);

  if (nestedBundle) {
    return {
      cardSummary: `[聊天记录] ${nestedBundle.title}（共${nestedBundle.items?.length || 0}条）`,
      structuredData: {
        kind: 'forward_bundle',
        title: nestedBundle.title,
        itemCount: nestedBundle.items?.length || 0,
        previewLines: (nestedBundle.items || []).slice(0, 3).map((it) => `${it.senderName}: ${it.text || it.cardSummary || '[消息]'}`),
      },
    };
  }

  return {};
}

export function createForwardBundleFromPrivate(params: {
  messages: ChatMessage[];
  allMessagesLookup?: ChatMessage[];
  character: AiCharacter;
  userProfile: UserProfile;
}): ForwardBundlePayload {
  const { messages, allMessagesLookup, character, userProfile } = params;
  const userName = (userProfile?.name || '我').trim() || '我';
  const aiName = (character?.name || 'AI').trim() || 'AI';
  const sorted = [...messages]
    .filter((m) => m && !m.isSystemEvent && m.type !== 'offline_session_event')
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const quoteMap = new Map<string, ChatMessage>();
  for (const m of allMessagesLookup || sorted) {
    quoteMap.set(m.id, m);
  }

  const items: ForwardBundleItem[] = sorted.map((m) => {
    const isUser = m.sender === 'user';
    const senderName = isUser ? userName : aiName;
    const senderId = isUser ? 'user_main' : character.id;
    const senderAvatar = toLightweightAvatarRef(isUser ? userProfile?.avatar : character.avatar);

    let msgType: ForwardBundleItem['messageType'] = 'text';
    let cardSummary: string | undefined;
    let structuredData: Record<string, unknown> | undefined;

    if (m.type === 'forward_bundle' || m.messageType === 'forward_bundle' || m.forwardBundle) {
      msgType = 'forward_bundle';
      const nested = m.forwardBundle;
      cardSummary = nested
        ? `[聊天记录] ${nested.title}（共${nested.items?.length || 0}条）`
        : m.text || '[聊天记录]';
      if (nested) {
        structuredData = {
          kind: 'forward_bundle',
          title: nested.title,
          itemCount: nested.items?.length || 0,
        };
      }
    } else if (m.type === 'offline_share_card' && m.offlineCardData) {
      msgType = 'offline_share_card';
      cardSummary = `[线下经历卡] ${m.offlineCardData.sceneName} (${m.offlineCardData.dateStr})`;
      structuredData = {
        kind: 'offline_share_card',
        sceneName: m.offlineCardData.sceneName,
        summaryText: m.offlineCardData.summaryText,
      };
    } else if (m.messageType === 'generated_image' || m.type === 'generated_image') {
      msgType = 'generated_image';
    } else if (m.messageType === 'image' || m.type === 'image' || m.imageUrl) {
      msgType = 'image';
    }

    const quoted = m.quoteMessageId ? quoteMap.get(m.quoteMessageId) : undefined;
    const quoteSummary = quoted
      ? {
          senderName: quoted.sender === 'user' ? userName : aiName,
          text: String(quoted.text || (quoted.imageUrl ? '[图片]' : '')).slice(0, 80),
        }
      : undefined;

    const imageDescription = (m.imageDescription || m.imageAnalysis || m.revisedPrompt || '').trim() || undefined;
    const detectedText = (m.detectedText || '').trim() || undefined;

    return {
      id: m.id,
      senderId,
      senderName,
      senderAvatar,
      timestamp: m.timestamp,
      messageType: msgType,
      text: m.text || '',
      imageUrl: m.imageUrl || undefined,
      imageDescription,
      detectedText,
      cardSummary,
      structuredData,
      quoteSummary,
      sourceType: 'private',
      sourceName: `${userName}与${aiName}的聊天`,
    };
  });

  const now = Date.now();
  return {
    version: 1,
    bundleId: `fb_${now}_${Math.random().toString(36).slice(2, 7)}`,
    sourceType: 'private',
    sourceId: character.id,
    sourceName: `${userName}与${aiName}`,
    title: `${userName}与${aiName}的聊天记录`,
    createdAt: now,
    items,
  };
}

export function createForwardBundleFromGroup(params: {
  messages: GroupChatMessage[];
  group: GroupChat;
}): ForwardBundlePayload {
  const { messages, group } = params;
  const sorted = [...messages]
    .filter((m) => m && m.senderId !== 'system' && m.messageType !== 'system' && !m.isRecalled)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const items: ForwardBundleItem[] = sorted.map((m) => {
    const member = group.members.find((gm) => gm.id === m.senderId);
    const senderAvatar = toLightweightAvatarRef(m.senderAvatar || member?.avatar);
    const rawType = m.messageType || 'text';

    let msgType: ForwardBundleItem['messageType'] = 'text';
    if (rawType === 'image' || (m.imageUrl && rawType === 'text')) msgType = 'image';
    else if (rawType === 'relay') msgType = 'relay';
    else if (rawType === 'poll') msgType = 'poll';
    else if (rawType === 'random_draw') msgType = 'random_draw';
    else if (rawType === 'forward_bundle') msgType = 'forward_bundle';

    const { cardSummary, structuredData } = summarizeGroupCardForBundle(m);

    return {
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      senderAvatar,
      timestamp: m.timestamp,
      messageType: msgType,
      text: m.text || '',
      imageUrl: m.imageUrl || undefined,
      imageDescription: (m.imageAnalysisText || '').trim() || undefined,
      cardSummary,
      structuredData,
      quoteSummary: m.quoteMessage
        ? {
            senderName: m.quoteMessage.senderName,
            text: String(m.quoteMessage.text || '').slice(0, 80),
          }
        : undefined,
      sourceType: 'group',
      sourceName: group.name,
    };
  });

  const now = Date.now();
  return {
    version: 1,
    bundleId: `fb_${now}_${Math.random().toString(36).slice(2, 7)}`,
    sourceType: 'group',
    sourceId: group.id,
    sourceName: group.name,
    title: `“${group.name}”的聊天记录`,
    createdAt: now,
    items,
  };
}

/**
 * Serialize a forward_bundle into readable multi-line context for AI prompts
 * (NEVER returns merely "[聊天记录]").
 */
export function serializeForwardBundleForAi(bundle?: ForwardBundlePayload | null): string {
  if (!bundle || !Array.isArray(bundle.items) || bundle.items.length === 0) {
    return bundle?.title ? `[转发的聊天记录：${bundle.title}（无明细）]` : '[转发的聊天记录]';
  }

  const lines = bundle.items.slice(0, 60).map((item, idx) => {
    const t = formatBundleTime(item.timestamp);
    const quotePart = item.quoteSummary
      ? `[引用 ${item.quoteSummary.senderName}: ${item.quoteSummary.text}] `
      : '';
    let contentPart = item.cardSummary || item.text || '';
    if (item.messageType === 'image' || item.messageType === 'generated_image') {
      const desc = item.imageDescription ? `画面: ${item.imageDescription}` : '图片内容未识别';
      const ocr = item.detectedText ? ` | 文字: ${item.detectedText}` : '';
      contentPart = `[图片(${desc}${ocr})]${item.text ? ` ${item.text}` : ''}`;
    } else if (!contentPart && item.imageDescription) {
      contentPart = `[图片: ${item.imageDescription}]`;
    }
    return `  ${idx + 1}. ${t ? `[${t}] ` : ''}${item.senderName}: ${quotePart}${contentPart || '[空消息]'}`;
  });

  const extraNote =
    bundle.items.length > 60 ? `\n  ...(共 ${bundle.items.length} 条记录，以上展示前 60 条)` : '';

  return `[转发的聊天记录：${bundle.title}（共 ${bundle.items.length} 条）]\n${lines.join('\n')}${extraNote}`;
}

export async function forwardBundleToTargets(params: {
  bundle: ForwardBundlePayload;
  targets: ForwardTargetDescriptor[];
  userProfile: UserProfile;
  savePrivateMessage: (msg: ChatMessage) => Promise<void>;
  appendGroupMessages: (groupId: string, msgs: GroupChatMessage[]) => Promise<void>;
}): Promise<ForwardTargetResult[]> {
  const { bundle, targets, userProfile, savePrivateMessage, appendGroupMessages } = params;
  const senderName = (userProfile?.name || '我').trim() || '我';
  const senderAvatar = userProfile?.avatar || '';
  const results: ForwardTargetResult[] = [];
  const baseTs = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const ts = baseTs + i * 10;
    const cloned = cloneForwardBundle(bundle);
    try {
      if (target.targetType === 'private') {
        const msg: ChatMessage = {
          id: `msg_fwd_${ts}_${Math.random().toString(36).slice(2, 6)}`,
          characterId: target.targetId,
          sender: 'user',
          text: `[聊天记录] ${cloned.title}`,
          messageType: 'forward_bundle',
          type: 'forward_bundle',
          forwardBundle: cloned,
          timestamp: ts,
        };
        await savePrivateMessage(msg);
      } else {
        const gMsg: GroupChatMessage = {
          id: `gmsg_fwd_${ts}_${Math.random().toString(36).slice(2, 6)}`,
          groupId: target.targetId,
          senderId: 'user_main',
          senderName,
          senderAvatar,
          senderType: 'human',
          text: `[聊天记录] ${cloned.title}`,
          messageType: 'forward_bundle',
          payload: cloned,
          forwardBundle: cloned,
          timestamp: ts,
        };
        await appendGroupMessages(target.targetId, [gMsg]);
      }
      results.push({ ...target, ok: true });
    } catch (err: any) {
      results.push({
        ...target,
        ok: false,
        error: err?.message || '写入失败',
      });
    }
  }

  return results;
}

export async function forwardMessagesIndividuallyToTargets(params: {
  sourceType: 'private' | 'group';
  sourceMessages: Array<ChatMessage | GroupChatMessage>;
  sourceCharacter?: AiCharacter;
  sourceGroup?: GroupChat;
  targets: ForwardTargetDescriptor[];
  userProfile: UserProfile;
  savePrivateMessage: (msg: ChatMessage) => Promise<void>;
  appendGroupMessages: (groupId: string, msgs: GroupChatMessage[]) => Promise<void>;
}): Promise<ForwardTargetResult[]> {
  const {
    sourceType,
    sourceMessages,
    sourceCharacter,
    sourceGroup,
    targets,
    userProfile,
    savePrivateMessage,
    appendGroupMessages,
  } = params;

  const senderName = (userProfile?.name || '我').trim() || '我';
  const senderAvatar = userProfile?.avatar || '';

  const sorted = [...sourceMessages]
    .filter((m: any) => m && !m.isSystemEvent && m.senderId !== 'system' && m.type !== 'offline_session_event' && !m.isRecalled)
    .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

  const results: ForwardTargetResult[] = [];
  const baseTs = Date.now();

  for (let tIdx = 0; tIdx < targets.length; tIdx++) {
    const target = targets[tIdx];
    try {
      if (target.targetType === 'private') {
        for (let mIdx = 0; mIdx < sorted.length; mIdx++) {
          const src = sorted[mIdx] as any;
          const ts = baseTs + tIdx * 100 + mIdx * 10;
          const isBundle =
            src.messageType === 'forward_bundle' || src.type === 'forward_bundle' || Boolean(src.forwardBundle);
          const bundleData: ForwardBundlePayload | undefined =
            src.forwardBundle ||
            (src.messageType === 'forward_bundle' && src.payload && 'items' in src.payload
              ? (src.payload as ForwardBundlePayload)
              : undefined);

          if (isBundle && bundleData) {
            const cloned = cloneForwardBundle(bundleData);
            await savePrivateMessage({
              id: `msg_fwd1_${ts}_${Math.random().toString(36).slice(2, 6)}`,
              characterId: target.targetId,
              sender: 'user',
              text: `[聊天记录] ${cloned.title}`,
              messageType: 'forward_bundle',
              type: 'forward_bundle',
              forwardBundle: cloned,
              timestamp: ts,
            });
            continue;
          }

          let textToSend = String(src.text || '');
          let msgType: ChatMessage['messageType'] = 'text';
          let typeField: ChatMessage['type'] = 'text';
          let imageUrl: string | undefined = src.imageUrl;
          let imageDescription: string | undefined = src.imageDescription || src.imageAnalysis || src.imageAnalysisText;
          let detectedText: string | undefined = src.detectedText;

          if (sourceType === 'group') {
            if (src.messageType === 'relay' || src.messageType === 'poll' || src.messageType === 'random_draw') {
              const summary = summarizeGroupCardForBundle(src as GroupChatMessage);
              textToSend = summary.cardSummary || textToSend;
            } else if (src.messageType === 'image' || imageUrl) {
              msgType = 'image';
              typeField = 'image';
            }
          } else {
            if (src.type === 'offline_share_card' && src.offlineCardData) {
              typeField = 'offline_share_card';
            } else if (src.messageType === 'generated_image' || src.type === 'generated_image' || src.messageType === 'image' || imageUrl) {
              msgType = 'image';
              typeField = 'image';
            }
          }

          await savePrivateMessage({
            id: `msg_fwd1_${ts}_${Math.random().toString(36).slice(2, 6)}`,
            characterId: target.targetId,
            sender: 'user',
            text: textToSend,
            messageType: msgType,
            type: typeField,
            imageUrl,
            imageDescription,
            detectedText,
            recognitionStatus: imageDescription ? 'success' : undefined,
            offlineCardData: src.offlineCardData ? { ...src.offlineCardData } : undefined,
            timestamp: ts,
          });
        }
      } else {
        const groupMsgs: GroupChatMessage[] = sorted.map((src: any, mIdx: number) => {
          const ts = baseTs + tIdx * 100 + mIdx * 10;
          const isBundle =
            src.messageType === 'forward_bundle' || src.type === 'forward_bundle' || Boolean(src.forwardBundle);
          const bundleData: ForwardBundlePayload | undefined =
            src.forwardBundle ||
            (src.messageType === 'forward_bundle' && src.payload && 'items' in src.payload
              ? (src.payload as ForwardBundlePayload)
              : undefined);

          if (isBundle && bundleData) {
            const cloned = cloneForwardBundle(bundleData);
            return {
              id: `gmsg_fwd1_${ts}_${Math.random().toString(36).slice(2, 6)}`,
              groupId: target.targetId,
              senderId: 'user_main',
              senderName,
              senderAvatar,
              senderType: 'human',
              text: `[聊天记录] ${cloned.title}`,
              messageType: 'forward_bundle',
              payload: cloned,
              forwardBundle: cloned,
              timestamp: ts,
            };
          }

          if (sourceType === 'group' && (src.messageType === 'relay' || src.messageType === 'poll' || src.messageType === 'random_draw') && src.payload) {
            return {
              id: `gmsg_fwd1_${ts}_${Math.random().toString(36).slice(2, 6)}`,
              groupId: target.targetId,
              senderId: 'user_main',
              senderName,
              senderAvatar,
              senderType: 'human',
              text: String(src.text || ''),
              messageType: src.messageType,
              payload: JSON.parse(JSON.stringify(src.payload)),
              timestamp: ts,
            };
          }

          if (src.imageUrl) {
            return {
              id: `gmsg_fwd1_${ts}_${Math.random().toString(36).slice(2, 6)}`,
              groupId: target.targetId,
              senderId: 'user_main',
              senderName,
              senderAvatar,
              senderType: 'human',
              text: String(src.text || '[图片]'),
              messageType: 'image',
              imageUrl: src.imageUrl,
              imageAnalysisText: src.imageDescription || src.imageAnalysis || src.imageAnalysisText,
              timestamp: ts,
            };
          }

          let textToSend = String(src.text || '');
          if (src.type === 'offline_share_card' && src.offlineCardData) {
            textToSend = `[线下经历卡] ${src.offlineCardData.sceneName} (${src.offlineCardData.dateStr})${src.offlineCardData.summaryText ? `：${src.offlineCardData.summaryText}` : ''}`;
          } else if (sourceType === 'private' && src.sender === 'ai' && sourceCharacter?.name) {
            textToSend = `${sourceCharacter.name}: ${textToSend}`;
          } else if (sourceType === 'group' && src.senderId !== 'user_main' && src.senderName && sourceGroup) {
            textToSend = `${src.senderName}: ${textToSend}`;
          }

          return {
            id: `gmsg_fwd1_${ts}_${Math.random().toString(36).slice(2, 6)}`,
            groupId: target.targetId,
            senderId: 'user_main',
            senderName,
            senderAvatar,
            senderType: 'human',
            text: textToSend,
            messageType: 'text',
            timestamp: ts,
          };
        });

        await appendGroupMessages(target.targetId, groupMsgs);
      }

      results.push({ ...target, ok: true });
    } catch (err: any) {
      results.push({
        ...target,
        ok: false,
        error: err?.message || '转发失败',
      });
    }
  }

  return results;
}
