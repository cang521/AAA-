import { GroupChat, GroupChatMessage, GroupPollPayload } from '../../types';
import {
  getCachedGroupChats,
  hydrateGroupChatsFromDb,
  saveGroupChatsToDb,
  waitForGroupChatSave,
} from '../groupChatDb';
import { syncGroupToServer } from '../groupService';
import { validateAndApplyAiPollVote } from '../groupTools';
import { GroupReplyTask } from './groupRoundTypes';

export const STORAGE_KEY_GROUP_TASKS = 'phone_group_reply_tasks_v1';

export function readPersistedGroupTasks(): GroupReplyTask[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GROUP_TASKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is Record<string, any> => Boolean(t && typeof t === 'object' && t.id && t.groupId))
      .map((t) => ({
        id: String(t.id),
        roundId: typeof t.roundId === 'string' && t.roundId ? t.roundId : `round_${t.id}`,
        groupId: String(t.groupId),
        triggerType: t.triggerType || 'user_double_click',
        targetAiId: t.targetAiId,
        targetPollId: t.targetPollId,
        latestUserMessageId: t.latestUserMessageId,
        latestUserText: t.latestUserText,
        mentionedTargets: Array.isArray(t.mentionedTargets) ? t.mentionedTargets : [],
        dedupeKey: typeof t.dedupeKey === 'string' ? t.dedupeKey : String(t.id),
        chainDepth: typeof t.chainDepth === 'number' ? t.chainDepth : 0,
        status: t.status || 'queued',
        retryCount: typeof t.retryCount === 'number' ? t.retryCount : 0,
        maxRetries: typeof t.maxRetries === 'number' ? t.maxRetries : 1,
        error: typeof t.error === 'string' ? t.error : undefined,
        plan: t.plan && typeof t.plan === 'object' ? t.plan : undefined,
        executedEventIds: Array.isArray(t.executedEventIds) ? t.executedEventIds.map(String) : [],
        executedBubbleKeys: Array.isArray(t.executedBubbleKeys) ? t.executedBubbleKeys.map(String) : [],
        interruptedByUser: Boolean(t.interruptedByUser),
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
        updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

export function writePersistedGroupTasks(tasks: GroupReplyTask[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const retained = tasks
      .filter(
        (t) =>
          t.status !== 'completed' &&
          t.status !== 'stopped' &&
          t.status !== 'interrupted'
      )
      .slice(-30);
    localStorage.setItem(STORAGE_KEY_GROUP_TASKS, JSON.stringify(retained));
  } catch {
    // ignore storage quota errors for ephemeral task queue
  }
}

export async function loadLatestGroupFromStore(groupId: string): Promise<{
  groups: GroupChat[];
  group: GroupChat | undefined;
}> {
  const cached = getCachedGroupChats();
  const groups = cached ?? (await hydrateGroupChatsFromDb());
  return {
    groups,
    group: groups.find((g) => g.id === groupId),
  };
}

export async function appendGroupAiMessagesAndPersist(
  groupId: string,
  newMsgs: GroupChatMessage[]
): Promise<GroupChat | null> {
  if (newMsgs.length === 0) return null;
  const { groups, group } = await loadLatestGroupFromStore(groupId);
  if (!group) return null;

  const existingIds = new Set((group.messages || []).map((m) => m.id));
  const uniqueNew = newMsgs.filter((m) => !existingIds.has(m.id));
  if (uniqueNew.length === 0) return group;

  const updatedGroup: GroupChat = {
    ...group,
    messages: [...(group.messages || []), ...uniqueNew],
    updatedAt: Date.now(),
  };

  const nextGroups = groups.map((g) => (g.id === groupId ? updatedGroup : g));
  await saveGroupChatsToDb(nextGroups);
  const saved = await waitForGroupChatSave();
  if (!saved) {
    throw new Error('群聊 AI 回复写入本地数据库失败');
  }

  try {
    void syncGroupToServer(updatedGroup);
  } catch {
    // non-fatal
  }

  return updatedGroup;
}

export async function applyAiPollVoteAndPersist(
  groupId: string,
  params: {
    pollId: string;
    actorId: string;
    optionIds: string[];
  }
): Promise<{
  applied: boolean;
  group: GroupChat | null;
  actorName?: string;
  appliedOptionIds?: string[];
  reason?: string;
}> {
  const { groups, group } = await loadLatestGroupFromStore(groupId);
  if (!group) {
    return { applied: false, group: null, reason: '群聊不存在' };
  }

  const targetMsgIdx = (group.messages || []).findIndex(
    (m) => m.id === params.pollId && m.messageType === 'poll' && Boolean(m.payload)
  );
  if (targetMsgIdx === -1) {
    return { applied: false, group, reason: `投票 ${params.pollId} 不存在` };
  }

  const targetMsg = group.messages[targetMsgIdx];
  const pollPayload = targetMsg.payload as GroupPollPayload;

  const validation = validateAndApplyAiPollVote({
    payload: pollPayload,
    actorId: params.actorId,
    members: group.members || [],
    optionIds: params.optionIds,
  });

  if (!validation.ok) {
    return {
      applied: false,
      group,
      reason: validation.reason || '投票校验未通过',
    };
  }

  const nextMessages = group.messages.map((m, idx) =>
    idx === targetMsgIdx ? { ...m, payload: validation.payload } : m
  );

  const updatedGroup: GroupChat = {
    ...group,
    messages: nextMessages,
    updatedAt: Date.now(),
  };

  const nextGroups = groups.map((g) => (g.id === groupId ? updatedGroup : g));
  await saveGroupChatsToDb(nextGroups);
  const saved = await waitForGroupChatSave();
  if (!saved) {
    throw new Error('群聊 AI 投票写入本地数据库失败');
  }

  try {
    void syncGroupToServer(updatedGroup);
  } catch {
    // non-fatal
  }

  return {
    applied: true,
    group: updatedGroup,
    actorName: validation.actorName,
    appliedOptionIds: validation.appliedOptionIds,
  };
}
