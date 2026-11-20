import {
  AiCharacter,
  ApiLog,
  AiRelationshipEdge,
  GroupChat,
  GroupChatMessage,
  UserProfile,
} from '../../types';
import {
  apiFetch,
  ensureBackendReady,
  registerBackendResumeHandler,
  registerPendingTaskCountProvider,
} from '../localBackend';
import {
  getCachedGroupChats,
  hydrateGroupChatsFromDb,
  saveGroupChatsToDb,
  waitForGroupChatSave,
} from '../groupChatDb';
import { getAllRelationshipEdges } from '../social/socialDb';
import { NativeNotificationService } from '../NativeNotificationService';
import { onGroupInteractionSocialTick } from '../social/socialEngine';
import { loadApiConfig, loadCharacters, loadUserProfile } from '../storage';
import { sanitizeReplyText } from '../thinkCleaner';
import { syncGroupToServer } from '../groupService';

export type GroupReplyTaskStatus =
  | 'queued'
  | 'waking_backend'
  | 'generating'
  | 'delivering'
  | 'completed'
  | 'failed';

export interface GroupReplyTask {
  id: string;
  groupId: string;
  targetAiId?: string;
  latestUserMessageId?: string;
  latestUserText?: string;
  mentionedTargets: string[];
  dedupeKey: string;
  chainDepth: number;
  status: GroupReplyTaskStatus;
  retryCount: number;
  maxRetries: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY_GROUP_TASKS = 'phone_group_reply_tasks_v1';
const nativeNotificationService = NativeNotificationService.getInstance();

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

function readPersistedTasks(): GroupReplyTask[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GROUP_TASKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePersistedTasks(tasks: GroupReplyTask[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const activeOnly = tasks
      .filter((t) => t.status !== 'completed')
      .slice(-30);
    localStorage.setItem(STORAGE_KEY_GROUP_TASKS, JSON.stringify(activeOnly));
  } catch {
    // ignore storage quota errors for ephemeral task queue
  }
}

function buildRelationshipSummaryLines(
  edges: AiRelationshipEdge[],
  memberMap: Map<string, { id: string; name: string }>
): Array<{
  pairId: string;
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  status: string;
  conflictStage: string;
  summary: string;
}> {
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

type Listener = () => void;

class GroupReplyTaskManager {
  private static instance: GroupReplyTaskManager;
  private tasks: GroupReplyTask[] = [];
  private listeners = new Set<Listener>();
  private activeGroupIds = new Set<string>();
  private recentDedupeTimestamps = new Map<string, number>();
  private apiLogCallback: ((log: ApiLog) => void) | null = null;
  private initialized = false;
  private lifecycleHooksRegistered = false;

  private constructor() {
    this.tasks = readPersistedTasks().map((t) =>
      t.status === 'waking_backend' || t.status === 'generating' || t.status === 'delivering'
        ? { ...t, status: 'queued' as const, updatedAt: Date.now() }
        : t
    );
    writePersistedTasks(this.tasks);
    this.registerLifecycleHooks();
  }

  public static getInstance(): GroupReplyTaskManager {
    if (!GroupReplyTaskManager.instance) {
      GroupReplyTaskManager.instance = new GroupReplyTaskManager();
    }
    return GroupReplyTaskManager.instance;
  }

  private registerLifecycleHooks(): void {
    if (this.lifecycleHooksRegistered) return;
    this.lifecycleHooksRegistered = true;

    registerPendingTaskCountProvider(
      () =>
        this.tasks.filter(
          (t) =>
            t.status === 'queued' ||
            t.status === 'waking_backend' ||
            t.status === 'generating' ||
            t.status === 'delivering'
        ).length
    );

    registerBackendResumeHandler(() => {
      const hasQueued = this.tasks.some((t) => t.status === 'queued');
      if (hasQueued) {
        void this.processQueue();
      }
    });
  }

  public init(): void {
    if (this.initialized) {
      void this.processQueue();
      return;
    }
    this.initialized = true;
    const hasPending = this.tasks.some((t) => t.status === 'queued');
    if (hasPending) {
      void this.processQueue();
    }
  }

  public setApiLogHandler(cb: ((log: ApiLog) => void) | null): void {
    this.apiLogCallback = cb;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    writePersistedTasks(this.tasks);
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[GroupReplyTaskManager] listener error:', e);
      }
    });
  }

  public getGroupTaskState(groupId: string): {
    status: GroupReplyTaskStatus;
    targetAiId?: string;
  } | null {
    const active = this.tasks.find(
      (t) =>
        t.groupId === groupId &&
        (t.status === 'queued' ||
          t.status === 'waking_backend' ||
          t.status === 'generating' ||
          t.status === 'delivering')
    );
    if (!active) return null;
    return { status: active.status, targetAiId: active.targetAiId };
  }

  public getGroupFailedTask(groupId: string): { task: GroupReplyTask; error: string } | null {
    const failed = [...this.tasks]
      .reverse()
      .find((t) => t.groupId === groupId && t.status === 'failed');
    if (!failed) return null;
    return {
      task: failed,
      error: failed.error || '群聊 AI 回复生成失败，请检查后端或网络后重试',
    };
  }

  public clearFailedTask(groupId: string): void {
    const next = this.tasks.filter((t) => !(t.groupId === groupId && t.status === 'failed'));
    if (next.length !== this.tasks.length) {
      this.tasks = next;
      this.notify();
    }
  }

  public async retryFailedTask(groupId: string): Promise<boolean> {
    const failedIdx = this.tasks.findIndex((t) => t.groupId === groupId && t.status === 'failed');
    if (failedIdx === -1) return false;

    const failedTask = this.tasks[failedIdx];
    this.tasks[failedIdx] = {
      ...failedTask,
      status: 'queued',
      retryCount: 0,
      error: undefined,
      updatedAt: Date.now(),
    };
    this.notify();
    void this.processQueue();
    return true;
  }

  public async enqueueTask(params: {
    groupId: string;
    targetAiId?: string;
    latestUserMessageId?: string;
    latestUserText?: string;
    mentionedTargets?: string[];
    chainDepth?: number;
    dedupeKey?: string;
  }): Promise<GroupReplyTask | null> {
    const existingActive = this.tasks.find(
      (t) =>
        t.groupId === params.groupId &&
        (t.status === 'queued' ||
          t.status === 'waking_backend' ||
          t.status === 'generating' ||
          t.status === 'delivering')
    );
    if (existingActive) {
      console.warn('[GroupReplyTaskManager] 当前群聊正在生成 AI 回复，忽略重复触发');
      return null;
    }

    const dedupeKey =
      params.dedupeKey ||
      `${params.groupId}:${params.latestUserMessageId || 'summon'}:${params.targetAiId || 'auto'}:d${
        params.chainDepth || 0
      }`;

    const now = Date.now();
    const lastCreatedAt = this.recentDedupeTimestamps.get(dedupeKey) || 0;
    if (now - lastCreatedAt < 1200) {
      console.warn('[GroupReplyTaskManager] Deduplicated duplicate group trigger:', dedupeKey);
      return null;
    }
    this.recentDedupeTimestamps.set(dedupeKey, now);

    // Clear previous failed task for this group once user triggers a fresh round
    this.tasks = this.tasks.filter((t) => !(t.groupId === params.groupId && t.status === 'failed'));

    const task: GroupReplyTask = {
      id: `grptask_${params.groupId}_${now}_${Math.random().toString(36).slice(2, 6)}`,
      groupId: params.groupId,
      targetAiId: params.targetAiId,
      latestUserMessageId: params.latestUserMessageId,
      latestUserText: params.latestUserText,
      mentionedTargets: params.mentionedTargets || [],
      dedupeKey,
      chainDepth: params.chainDepth || 0,
      status: 'queued',
      retryCount: 0,
      maxRetries: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.push(task);
    this.notify();
    void this.processQueue();
    return task;
  }

  private updateTask(taskId: string, patch: Partial<GroupReplyTask>): GroupReplyTask | undefined {
    const idx = this.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    const updated: GroupReplyTask = {
      ...this.tasks[idx],
      ...patch,
      updatedAt: Date.now(),
    };
    this.tasks[idx] = updated;
    this.notify();
    return updated;
  }

  private async processQueue(): Promise<void> {
    const queued = this.tasks.filter((t) => t.status === 'queued');
    for (const task of queued) {
      if (this.activeGroupIds.has(task.groupId)) {
        continue;
      }
      void this.executeTask(task.id);
    }
  }

  private async loadLatestGroup(groupId: string): Promise<{
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

  private async appendAiMessagesAndPersist(
    groupId: string,
    newMsgs: GroupChatMessage[]
  ): Promise<GroupChat | null> {
    if (newMsgs.length === 0) return null;
    const { groups, group } = await this.loadLatestGroup(groupId);
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

  private async executeTask(taskId: string): Promise<void> {
    const initial = this.tasks.find((t) => t.id === taskId);
    if (!initial) return;

    this.activeGroupIds.add(initial.groupId);

    try {
      // Step 1: Ensure Android embedded backend (or local runtime) is awake and passes /api/health
      this.updateTask(taskId, { status: 'waking_backend', error: undefined });
      await ensureBackendReady(`group_chat:${initial.groupId}`);

      const task = this.tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Step 2: Gather authoritative group state, characters, and AI relationships
      this.updateTask(taskId, { status: 'generating' });

      const { group: activeGroup } = await this.loadLatestGroup(task.groupId);
      if (!activeGroup) {
        throw new Error('群聊不存在或已被删除');
      }

      const aiMembers = activeGroup.members.filter((m) => m.memberType !== 'human' && !m.isMuted);
      if (aiMembers.length === 0) {
        throw new Error('当前群内暂无未静音的 AI 成员可回复');
      }

      const allCharacters: AiCharacter[] = loadCharacters();
      const userProfile: UserProfile = loadUserProfile();
      const apiConfig = loadApiConfig();

      let chosenTargetId = task.targetAiId;
      if (chosenTargetId && chosenTargetId !== '@all') {
        const exists = aiMembers.some((m) => m.id === chosenTargetId);
        if (!exists) chosenTargetId = undefined;
      }

      const aiCandidateProfiles = aiMembers.map((m) => {
        const baseChar = allCharacters.find((c) => c.id === m.characterId || c.id === m.id);
        return {
          id: m.id,
          characterId: m.characterId || baseChar?.id || m.id,
          name: m.name,
          wxid: m.wxid || m.id,
          avatar: m.avatar,
          persona: m.customPersona || baseChar?.persona || '群内AI成员',
          personality: m.customPersonality || baseChar?.personality || '善意、友好、口吻自然',
          memories: m.memories || baseChar?.memories || [],
          customPersona: m.customPersona,
          customPersonality: m.customPersonality,
        };
      });

      const memberLookup = new Map<string, { id: string; name: string }>();
      activeGroup.members.forEach((m) => {
        memberLookup.set(m.id, { id: m.id, name: m.name });
        if (m.characterId) {
          memberLookup.set(m.characterId, { id: m.id, name: m.name });
        }
      });

      const edges = await getAllRelationshipEdges().catch(() => []);
      const aiRelationships = buildRelationshipSummaryLines(edges, memberLookup);

      const recentMessages = (activeGroup.messages || []).slice(-18);
      const latestUserMessage =
        recentMessages
          .slice()
          .reverse()
          .find((m) =>
            task.latestUserMessageId ? m.id === task.latestUserMessageId : m.senderType === 'human'
          ) || null;

      // Step 3: Call group-chat orchestrator API
      const res = await apiFetch('/api/gemini/group-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group: {
            id: activeGroup.id,
            name: activeGroup.name,
            notice: activeGroup.notice,
            members: activeGroup.members,
          },
          recentMessages,
          latestUserMessage,
          mentionedTargets: task.mentionedTargets,
          aiCandidates: aiCandidateProfiles,
          aiRelationships,
          triggeredAiId: chosenTargetId,
          userProfile,
          apiConfig,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success === false) {
        throw new Error(data?.error || data?.message || `群聊 AI 接口请求失败 (${res.status})`);
      }

      if (data.log && this.apiLogCallback) {
        try {
          this.apiLogCallback(data.log);
        } catch {
          // ignore
        }
      }

      // Normalize single or multi-reply output (supporting @所有人 multiple responders)
      const rawReplies: Array<{
        responderId?: string;
        responderName?: string;
        text?: string;
        thinkingProcess?: string;
        mentionedMemberIds?: string[];
      }> = Array.isArray(data.replies) && data.replies.length > 0
        ? data.replies
        : data.shouldRespond !== false && data.text
          ? [
              {
                responderId: data.responderId,
                responderName: data.responderName,
                text: data.text,
                thinkingProcess: data.thinkingProcess,
                mentionedMemberIds: data.mentionedMemberIds,
              },
            ]
          : [];

      const validReplies = rawReplies
        .map((r) => ({
          ...r,
          cleanText: sanitizeReplyText(r.text || '').trim(),
        }))
        .filter((r) => r.cleanText.length > 0);

      if (data.shouldRespond !== false && validReplies.length === 0) {
        throw new Error('模型未返回有效文本内容，请检查模型配置后重试');
      }

      this.updateTask(taskId, { status: 'delivering' });

      let latestUpdatedGroup: GroupChat | null = activeGroup;
      let lastAiMsg: GroupChatMessage | null = null;

      for (let i = 0; i < validReplies.length; i++) {
        const r = validReplies[i];
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 650));
        }

        const responderMember =
          activeGroup.members.find((m) => m.id === r.responderId) ||
          activeGroup.members.find((m) => m.name === r.responderName && m.memberType !== 'human') ||
          activeGroup.members.find((m) => m.memberType !== 'human') ||
          activeGroup.members[0];

        const aiMsg: GroupChatMessage = {
          id: `gmsg_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          groupId: activeGroup.id,
          senderId: responderMember.id,
          senderName: responderMember.name,
          senderAvatar: responderMember.avatar,
          senderType: responderMember.memberType,
          text: r.cleanText,
          timestamp: Date.now() + i * 20,
          thinkingProcess: r.thinkingProcess || '',
          mentionedMemberIds: Array.isArray(r.mentionedMemberIds) ? r.mentionedMemberIds : [],
        };

        lastAiMsg = aiMsg;
        latestUpdatedGroup = await this.appendAiMessagesAndPersist(activeGroup.id, [aiMsg]);

        const baseChar = allCharacters.find(
          (c) => c.id === responderMember.characterId || c.id === responderMember.id
        );
        void nativeNotificationService
          .notifyAiMessage(
            {
              id: baseChar?.id || responderMember.id,
              name: `${activeGroup.name} · ${responderMember.name}`,
              avatar: responderMember.avatar,
              notificationAvatar: baseChar?.notificationAvatar,
            },
            aiMsg.text,
            {
              messageId: aiMsg.id,
              bubbleIndex: i,
              timestamp: aiMsg.timestamp,
              triggerSource: 'group_chat_ai',
            }
          )
          .catch(() => {});
      }

      this.updateTask(taskId, { status: 'completed', error: undefined });
      this.tasks = this.tasks.filter((t) => t.id !== taskId);
      this.notify();

      if (task.chainDepth === 0 && latestUpdatedGroup && lastAiMsg) {
        void onGroupInteractionSocialTick({
          group: latestUpdatedGroup,
          triggerId: `grp_tick_${lastAiMsg.id}`,
          allCharacters,
          userProfile,
          apiConfig,
          onAddApiLog: this.apiLogCallback || undefined,
          onGroupRandomMessage: (targetGroupId, aiChar, text) => {
            if (targetGroupId !== activeGroup.id || !text.trim()) return;
            const randomMsg: GroupChatMessage = {
              id: `gmsg_soc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              groupId: activeGroup.id,
              senderId: aiChar.id,
              senderName: aiChar.name,
              senderAvatar: aiChar.avatar,
              senderType: 'ai',
              text,
              timestamp: Date.now(),
            };
            void this.appendAiMessagesAndPersist(activeGroup.id, [randomMsg]);
          },
        });
      }

      // If AI @-mentioned another unmuted AI member in a 1-to-1 targeted response, allow 1 natural follow-up
      if (
        task.chainDepth < 1 &&
        lastAiMsg &&
        lastAiMsg.mentionedMemberIds &&
        lastAiMsg.mentionedMemberIds.length > 0 &&
        validReplies.length === 1
      ) {
        const nextTarget = lastAiMsg.mentionedMemberIds.find(
          (id) =>
            id !== lastAiMsg?.senderId &&
            id !== 'user_main' &&
            id !== '@all' &&
            aiMembers.some((m) => m.id === id)
        );
        if (nextTarget) {
          setTimeout(() => {
            void this.enqueueTask({
              groupId: activeGroup.id,
              targetAiId: nextTarget,
              chainDepth: task.chainDepth + 1,
              mentionedTargets: [nextTarget],
              dedupeKey: `chain:${activeGroup.id}:${lastAiMsg?.id}:${nextTarget}`,
            });
          }, 1500);
        }
      }
    } catch (err: any) {
      const current = this.tasks.find((t) => t.id === taskId);
      if (!current) return;

      const message = err?.message || '群聊 AI 回复生成失败，请检查内置后端或 API 配置';
      if ((current.retryCount || 0) < current.maxRetries) {
        const nextRetry = (current.retryCount || 0) + 1;
        this.updateTask(taskId, {
          status: 'queued',
          retryCount: nextRetry,
          error: message,
        });
        setTimeout(() => {
          void this.processQueue();
        }, 1800);
      } else {
        this.updateTask(taskId, {
          status: 'failed',
          error: message,
        });
      }
    } finally {
      this.activeGroupIds.delete(initial.groupId);
      void this.processQueue();
    }
  }
}

export const groupReplyTaskManager = GroupReplyTaskManager.getInstance();
