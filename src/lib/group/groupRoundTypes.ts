import { GroupActivityLevel } from '../../types';

export type GroupRoundTriggerType =
  | 'user_double_click'
  | 'summon_discussion'
  | 'invite_poll_vote'
  | 'user_interrupt'
  | 'image_message';

export type GroupReplyTaskStatus =
  | 'queued'
  | 'waiting_backend'
  | 'waking_backend'
  | 'generating'
  | 'delivering'
  | 'paused'
  | 'interrupted'
  | 'stopped'
  | 'completed'
  | 'failed';

export interface GroupMessageTimelineEvent {
  eventId: string;
  type: 'message';
  senderId: string;
  senderName?: string;
  bubbles: string[];
  delayMs: number;
  mentionedMemberIds?: string[];
  thinkingProcess?: string;
}

export interface GroupVotePollTimelineEvent {
  eventId: string;
  type: 'vote_poll';
  actorId: string;
  actorName?: string;
  pollId: string;
  optionId?: string;
  optionIds?: string[];
  delayMs: number;
}

export type GroupTimelineEvent =
  | GroupMessageTimelineEvent
  | GroupVotePollTimelineEvent;

export interface GroupRoundPlan {
  roundId: string;
  shouldRespond: boolean;
  thinkingSummary?: string;
  events: GroupTimelineEvent[];
}

export interface GroupActivePlaybackIndicator {
  status: GroupReplyTaskStatus;
  roundId?: string;
  targetAiId?: string;
  activeActorId?: string;
  activeActorName?: string;
  activeActionType?: 'typing' | 'voting' | 'thinking';
  activePollId?: string;
  remainingEventCount?: number;
  totalEventCount?: number;
}

export interface GroupActivityPreset {
  level: GroupActivityLevel;
  label: string;
  shortDesc: string;
  minAiCount: number;
  maxAiCount: number;
  minBubbles: number;
  maxBubbles: number;
  maxConsecutivePerAi: number;
}

export const GROUP_ACTIVITY_PRESETS: Record<GroupActivityLevel, GroupActivityPreset> = {
  quiet: {
    level: 'quiet',
    label: '安静',
    shortDesc: '1~2位AI · 1~4条气泡 · 仅被点名或高度相关时发言',
    minAiCount: 1,
    maxAiCount: 2,
    minBubbles: 1,
    maxBubbles: 4,
    maxConsecutivePerAi: 2,
  },
  natural: {
    level: 'natural',
    label: '自然',
    shortDesc: '2~3位AI · 3~8条气泡 · 正常聊天、偶尔插话（默认）',
    minAiCount: 2,
    maxAiCount: 3,
    minBubbles: 3,
    maxBubbles: 8,
    maxConsecutivePerAi: 2,
  },
  lively: {
    level: 'lively',
    label: '热闹',
    shortDesc: '3~5位AI · 5~12条气泡 · 容易抢话、打趣、接梗争论',
    minAiCount: 3,
    maxAiCount: 5,
    minBubbles: 5,
    maxBubbles: 12,
    maxConsecutivePerAi: 2,
  },
};

export function resolveGroupActivityPreset(level?: GroupActivityLevel): GroupActivityPreset {
  if (level && level in GROUP_ACTIVITY_PRESETS) {
    return GROUP_ACTIVITY_PRESETS[level];
  }
  return GROUP_ACTIVITY_PRESETS.natural;
}

export interface GroupReplyTask {
  id: string;
  roundId: string;
  groupId: string;
  triggerType: GroupRoundTriggerType;
  targetAiId?: string;
  targetPollId?: string;
  latestUserMessageId?: string;
  latestUserText?: string;
  mentionedTargets: string[];
  dedupeKey: string;
  chainDepth: number;
  status: GroupReplyTaskStatus;
  retryCount: number;
  maxRetries: number;
  error?: string;
  plan?: GroupRoundPlan;
  executedEventIds: string[];
  executedBubbleKeys: string[];
  interruptedByUser?: boolean;
  createdAt: number;
  updatedAt: number;
}
