/**
 * crossChannelStore.ts
 * Per-AI Cross-Channel Continuity State (version 1) & strictly isolated 30-message
 * private-to-group context builder.
 *
 * Strict Privacy & Compatibility Guarantees:
 * - State is strictly isolated per `characterId` (AI A NEVER accesses AI B's private messages or state).
 * - Private-to-group context reads ONLY the latest 30 messages between the user and that specific AI.
 * - Group-to-private transition context reads ONLY the latest 30 messages around the group trigger.
 * - NEVER stores CoT/thinkingProcess, API keys, internal task IDs, or full chat logs.
 */

import { AiCharacter, ChatMessage } from '../../types';
import { getRecentChatMessages } from '../chatDb';
import { serializeForwardBundleForAi } from '../forward/forwardBundleService';

export const CROSS_CHANNEL_PRIVATE_LIMIT = 30;
export const CROSS_CHANNEL_GROUP_LIMIT = 30;
const STORAGE_KEY_CROSS_CHANNEL_STATES = 'phone_cross_channel_state_v1';

export interface ActiveGroupToPrivateTransition {
  eventId: string;
  groupId: string;
  groupName: string;
  reason: string;
  triggerSummary?: string;
  privateOpeningMessages: string[];
  recentGroupSnippet: string[]; // Max 30 lines from group around trigger
  createdAt: number;
}

export interface CrossChannelContinuityState {
  version: 1;
  characterId: string;
  recentPrivateTopic?: string;
  currentMood?: string;
  unfinishedWords?: string;
  recentPromises?: string;
  privateSecretsHint?: string;
  justTransitionedFromGroup: boolean;
  activeTransition?: ActiveGroupToPrivateTransition;
  userReplied: boolean;
  eventCompleted: boolean;
  updatedAt: number;
}

export interface IsolatedAiPrivateContextForGroup {
  characterId: string;
  characterName: string;
  privateMessageCount: number;
  recentPrivateLines: string[];
  continuitySummary: string;
}

function readAllStatesMap(): Record<string, CrossChannelContinuityState> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CROSS_CHANNEL_STATES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CrossChannelContinuityState>;
  } catch {
    return {};
  }
}

function writeAllStatesMap(map: Record<string, CrossChannelContinuityState>): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CROSS_CHANNEL_STATES, JSON.stringify(map));
  } catch {
    // ignore storage quota warning
  }
}

export function getCrossChannelState(characterId: string): CrossChannelContinuityState {
  if (!characterId) {
    return {
      version: 1,
      characterId: '',
      justTransitionedFromGroup: false,
      userReplied: false,
      eventCompleted: false,
      updatedAt: 0,
    };
  }
  const map = readAllStatesMap();
  const existing = map[characterId];
  if (existing && typeof existing === 'object') {
    return {
      version: 1,
      characterId,
      recentPrivateTopic: existing.recentPrivateTopic,
      currentMood: existing.currentMood,
      unfinishedWords: existing.unfinishedWords,
      recentPromises: existing.recentPromises,
      privateSecretsHint: existing.privateSecretsHint,
      justTransitionedFromGroup: Boolean(existing.justTransitionedFromGroup),
      activeTransition: existing.activeTransition,
      userReplied: Boolean(existing.userReplied),
      eventCompleted: Boolean(existing.eventCompleted),
      updatedAt: typeof existing.updatedAt === 'number' ? existing.updatedAt : 0,
    };
  }
  return {
    version: 1,
    characterId,
    justTransitionedFromGroup: false,
    userReplied: false,
    eventCompleted: false,
    updatedAt: 0,
  };
}

export function updateCrossChannelState(
  characterId: string,
  updater: (prev: CrossChannelContinuityState) => CrossChannelContinuityState
): CrossChannelContinuityState {
  const prev = getCrossChannelState(characterId);
  const next = updater(prev);
  const normalized: CrossChannelContinuityState = {
    ...next,
    version: 1,
    characterId,
    updatedAt: Date.now(),
  };
  const map = readAllStatesMap();
  map[characterId] = normalized;
  writeAllStatesMap(map);
  return normalized;
}

export function markCrossChannelTransitionStarted(params: {
  characterId: string;
  eventId: string;
  groupId: string;
  groupName: string;
  reason: string;
  triggerSummary?: string;
  privateOpeningMessages: string[];
  recentGroupSnippet: string[];
}): CrossChannelContinuityState {
  const snippet = (params.recentGroupSnippet || []).slice(-CROSS_CHANNEL_GROUP_LIMIT);
  return updateCrossChannelState(params.characterId, (prev) => ({
    ...prev,
    unfinishedWords: params.reason || prev.unfinishedWords,
    justTransitionedFromGroup: true,
    userReplied: false,
    eventCompleted: false,
    activeTransition: {
      eventId: params.eventId,
      groupId: params.groupId,
      groupName: params.groupName,
      reason: params.reason,
      triggerSummary: params.triggerSummary,
      privateOpeningMessages: params.privateOpeningMessages.slice(0, 3),
      recentGroupSnippet: snippet,
      createdAt: Date.now(),
    },
  }));
}

export function markCrossChannelUserReplied(characterId: string, userText?: string): void {
  if (!characterId) return;
  const cleanSnippet = (userText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  updateCrossChannelState(characterId, (prev) => ({
    ...prev,
    recentPrivateTopic: cleanSnippet || prev.recentPrivateTopic,
    userReplied: true,
  }));
}

export function markCrossChannelAiRepliedInPrivate(characterId: string, aiReplyText?: string): void {
  if (!characterId) return;
  const cleanSnippet = (aiReplyText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  updateCrossChannelState(characterId, (prev) => {
    const shouldCompleteTransition = Boolean(prev.justTransitionedFromGroup && prev.userReplied);
    return {
      ...prev,
      recentPrivateTopic: cleanSnippet || prev.recentPrivateTopic,
      justTransitionedFromGroup: shouldCompleteTransition ? false : prev.justTransitionedFromGroup,
      eventCompleted: shouldCompleteTransition ? true : prev.eventCompleted,
      activeTransition: shouldCompleteTransition ? undefined : prev.activeTransition,
    };
  });
}

export function updateCrossChannelContinuityHints(
  characterId: string,
  patch: Partial<
    Pick<
      CrossChannelContinuityState,
      'recentPrivateTopic' | 'currentMood' | 'unfinishedWords' | 'recentPromises' | 'privateSecretsHint'
    >
  >
): void {
  if (!characterId) return;
  updateCrossChannelState(characterId, (prev) => ({
    ...prev,
    ...patch,
  }));
}

function formatPrivateMessageBrief(msg: ChatMessage, userName: string, aiName: string): string {
  const who = msg.sender === 'user' ? userName : aiName;
  const d = new Date(msg.timestamp || 0);
  const t = !isNaN(d.getTime())
    ? `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
        d.getHours()
      ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : '';
  let content = '';
  if (msg.type === 'forward_bundle' || msg.messageType === 'forward_bundle' || msg.forwardBundle) {
    content = serializeForwardBundleForAi(msg.forwardBundle);
  } else if (msg.type === 'offline_session_event' && msg.offlineEventData) {
    content = `[线下经历:${msg.offlineEventData.sceneName}] ${msg.offlineEventData.summary}`;
  } else if (msg.imageUrl || msg.messageType === 'image' || msg.messageType === 'generated_image') {
    const desc = (msg.imageDescription || msg.imageAnalysis || msg.revisedPrompt || '').trim();
    content = `[图片${desc ? `:${desc}` : ''}]${msg.text ? ` ${msg.text}` : ''}`;
  } else {
    content = (msg.text || '').replace(/\s+/g, ' ').trim();
  }
  return `${t ? `[${t}] ` : ''}${who}: ${content.slice(0, 260)}`;
}

/**
 * Strictly isolated private-to-group reader:
 * Fetches ONLY the latest 30 private messages + continuity state for THIS specific characterId.
 */
export async function buildIsolatedPrivateContextForGroup(
  character: Pick<AiCharacter, 'id' | 'name'>,
  userName: string
): Promise<IsolatedAiPrivateContextForGroup> {
  const recentPrivate = await getRecentChatMessages(character.id, CROSS_CHANNEL_PRIVATE_LIMIT).catch(() => []);
  const sliced = recentPrivate.slice(-CROSS_CHANNEL_PRIVATE_LIMIT);
  const lines = sliced
    .filter((m) => m && (m.text || m.imageDescription || m.forwardBundle || m.offlineEventData))
    .map((m) => formatPrivateMessageBrief(m, userName, character.name));

  const st = getCrossChannelState(character.id);
  const summaryParts: string[] = [];
  if (st.recentPrivateTopic) summaryParts.push(`最近私聊话题: ${st.recentPrivateTopic}`);
  if (st.currentMood) summaryParts.push(`近期私聊心境: ${st.currentMood}`);
  if (st.unfinishedWords) summaryParts.push(`私聊未完事项: ${st.unfinishedWords}`);
  if (st.recentPromises) summaryParts.push(`近期约定: ${st.recentPromises}`);
  if (st.privateSecretsHint) summaryParts.push(`私密默契/忌讳: ${st.privateSecretsHint}`);
  if (st.justTransitionedFromGroup && !st.userReplied && st.activeTransition) {
    summaryParts.push(
      `注意: 你刚才已因「${st.activeTransition.reason}」转去私聊找过用户，用户暂未回复私聊（在群里不要反复追问刷屏“怎么不回我私聊”）`
    );
  }

  return {
    characterId: character.id,
    characterName: character.name,
    privateMessageCount: lines.length,
    recentPrivateLines: lines,
    continuitySummary: summaryParts.join('；'),
  };
}

/**
 * Format Group-to-Private transition context for `/api/gemini/chat` when the user replies
 * or this AI speaks right after transitioning from a group chat.
 */
export function buildGroupToPrivateTransitionPromptBlock(characterId: string): string | undefined {
  const st = getCrossChannelState(characterId);
  if (!st.activeTransition && !st.justTransitionedFromGroup && !st.recentPrivateTopic && !st.unfinishedWords) {
    return undefined;
  }

  const sections: string[] = [];
  if (st.activeTransition) {
    const tr = st.activeTransition;
    sections.push(`【跨频道连续性：你刚刚从群聊「${tr.groupName}」转到私聊】`);
    sections.push(`- 切私聊原因：${tr.reason}`);
    if (tr.triggerSummary) sections.push(`- 当时触发情景：${tr.triggerSummary}`);
    if (tr.privateOpeningMessages.length > 0) {
      sections.push(`- 你刚才切来私聊时已经对用户说过：${tr.privateOpeningMessages.map((s) => `「${s}」`).join(' / ')}`);
    }
    if (tr.recentGroupSnippet.length > 0) {
      sections.push(`- 刚才群聊「${tr.groupName}」的最近现场上下文（最多30条）：\n${tr.recentGroupSnippet.join('\n')}`);
    }
    sections.push(
      `【衔接准则】：请自然承接你在群里刚才发生的事与你已发出的私聊开场白，不要假装什么都没发生，也不要把你在私聊发送的内容机械复述一遍。`
    );
  } else if (st.recentPromises || st.unfinishedWords || st.currentMood) {
    const hints = [
      st.currentMood ? `近期情绪: ${st.currentMood}` : '',
      st.unfinishedWords ? `未完话题: ${st.unfinishedWords}` : '',
      st.recentPromises ? `近期约定: ${st.recentPromises}` : '',
    ]
      .filter(Boolean)
      .join('；');
    if (hints) {
      sections.push(`【个人近期连续性备忘】：${hints}`);
    }
  }

  return sections.length > 0 ? sections.join('\n') : undefined;
}
