import { AiCharacter, GroupChatMessage } from '../../types';
import { NativeNotificationService } from '../NativeNotificationService';
import { loadCharacters } from '../storage';
import { calculateTypingDelay } from '../wechatMultiBubble';
import {
  GroupActivePlaybackIndicator,
  GroupReplyTask,
} from './groupRoundTypes';
import {
  appendGroupAiMessagesAndPersist,
  applyAiPollVoteAndPersist,
  loadLatestGroupFromStore,
} from './GroupStateStore';

const nativeNotificationService = NativeNotificationService.getInstance();

export interface PlaybackControlSignal {
  isCancelled: () => boolean;
  isPaused: () => boolean;
  waitWhilePausedOrSleep: (ms: number) => Promise<'ok' | 'cancelled'>;
}

export interface GroupEventExecutorCallbacks {
  onIndicatorChange: (indicator: GroupActivePlaybackIndicator | null) => void;
  onBubbleExecuted: (bubbleKey: string) => void;
  onEventExecuted: (eventId: string) => void;
}

/**
 * Purely local timeline event player (ZERO model API calls).
 * Plays interleaved `message` (multi-bubble) and `vote_poll` events sequentially,
 * updates typing/voting indicators, persists each message & vote immediately,
 * and respects pause / resume / stop / user-interrupt signals.
 */
export async function executeGroupTimelinePlan(params: {
  task: GroupReplyTask;
  signal: PlaybackControlSignal;
  callbacks: GroupEventExecutorCallbacks;
}): Promise<'completed' | 'cancelled'> {
  const { task, signal, callbacks } = params;
  const plan = task.plan;
  if (!plan || !Array.isArray(plan.events) || plan.events.length === 0) {
    callbacks.onIndicatorChange(null);
    return 'completed';
  }

  const allCharacters: AiCharacter[] = loadCharacters();
  const executedEvents = new Set<string>(task.executedEventIds || []);
  const executedBubbles = new Set<string>(task.executedBubbleKeys || []);
  const totalEvents = plan.events.length;
  let thinkingAttachedForRound = executedBubbles.size > 0;

  for (let evIdx = 0; evIdx < plan.events.length; evIdx++) {
    const ev = plan.events[evIdx];

    if (signal.isCancelled()) {
      callbacks.onIndicatorChange(null);
      return 'cancelled';
    }

    if (executedEvents.has(ev.eventId)) {
      continue;
    }

    const remainingEvents = plan.events.slice(evIdx).filter((e) => !executedEvents.has(e.eventId)).length;

    const { group: liveGroup } = await loadLatestGroupFromStore(task.groupId);
    if (!liveGroup) {
      callbacks.onIndicatorChange(null);
      return 'cancelled';
    }

    if (ev.type === 'message') {
      const responderMember =
        liveGroup.members.find((m) => m.id === ev.senderId || m.characterId === ev.senderId) ||
        liveGroup.members.find((m) => m.name === ev.senderName && m.memberType !== 'human') ||
        liveGroup.members.find((m) => m.memberType !== 'human');

      if (!responderMember) {
        executedEvents.add(ev.eventId);
        callbacks.onEventExecuted(ev.eventId);
        continue;
      }

      const baseChar = allCharacters.find(
        (c) => c.id === responderMember.characterId || c.id === responderMember.id
      );

      for (let bIdx = 0; bIdx < ev.bubbles.length; bIdx++) {
        const bubbleKey = `${ev.eventId}:b${bIdx}`;
        if (executedBubbles.has(bubbleKey)) {
          continue;
        }
        if (signal.isCancelled()) {
          callbacks.onIndicatorChange(null);
          return 'cancelled';
        }

        const bubbleText = ev.bubbles[bIdx];
        if (!bubbleText || !bubbleText.trim()) {
          executedBubbles.add(bubbleKey);
          callbacks.onBubbleExecuted(bubbleKey);
          continue;
        }

        // Show live typing indicator for the specific AI about to speak
        callbacks.onIndicatorChange({
          status: signal.isPaused() ? 'paused' : 'delivering',
          roundId: plan.roundId,
          activeActorId: responderMember.id,
          activeActorName: responderMember.name,
          activeActionType: 'typing',
          remainingEventCount: remainingEvents,
          totalEventCount: totalEvents,
        });

        // Compute natural typing duration (longer bubbles take slightly longer; 0.6s ~ 1.8s)
        const baseDelay =
          bIdx === 0
            ? Math.max(600, Math.min(1800, ev.delayMs || calculateTypingDelay(bubbleText, 'normal')))
            : Math.max(600, Math.min(1600, calculateTypingDelay(bubbleText, 'normal')));

        const waitRes = await signal.waitWhilePausedOrSleep(baseDelay);
        if (waitRes === 'cancelled' || signal.isCancelled()) {
          callbacks.onIndicatorChange(null);
          return 'cancelled';
        }

        // Attach thinking process on the first bubble of the round (or event-specific thinking)
        let bubbleThinking = '';
        if (bIdx === 0) {
          if (ev.thinkingProcess) {
            bubbleThinking = ev.thinkingProcess;
          } else if (!thinkingAttachedForRound && plan.thinkingSummary) {
            bubbleThinking = plan.thinkingSummary;
          }
          if (bubbleThinking) {
            thinkingAttachedForRound = true;
          }
        }

        // Deterministic message ID guarantees zero duplicate writes across restarts/retries
        const msgId = `gmsg_${plan.roundId}_${ev.eventId}_b${bIdx}`;
        const aiMsg: GroupChatMessage = {
          id: msgId,
          groupId: liveGroup.id,
          senderId: responderMember.id,
          senderName: responderMember.name,
          senderAvatar: responderMember.avatar,
          senderType: responderMember.memberType,
          text: bubbleText,
          timestamp: Date.now(),
          thinkingProcess: bubbleThinking || undefined,
          mentionedMemberIds: bIdx === 0 && Array.isArray(ev.mentionedMemberIds) ? ev.mentionedMemberIds : [],
          roundId: plan.roundId,
          eventId: ev.eventId,
          bubbleIndex: bIdx,
        };

        await appendGroupAiMessagesAndPersist(liveGroup.id, [aiMsg]);

        executedBubbles.add(bubbleKey);
        callbacks.onBubbleExecuted(bubbleKey);

        void nativeNotificationService
          .notifyAiMessage(
            {
              id: baseChar?.id || responderMember.id,
              name: `${liveGroup.name} · ${responderMember.name}`,
              avatar: responderMember.avatar,
              notificationAvatar: baseChar?.notificationAvatar,
            },
            aiMsg.text,
            {
              messageId: aiMsg.id,
              bubbleIndex: bIdx,
              timestamp: aiMsg.timestamp,
              triggerSource: 'group_chat_ai',
            }
          )
          .catch(() => {});
      }

      executedEvents.add(ev.eventId);
      callbacks.onEventExecuted(ev.eventId);
    } else if (ev.type === 'vote_poll') {
      const actorMember =
        liveGroup.members.find((m) => m.id === ev.actorId || m.characterId === ev.actorId) ||
        liveGroup.members.find((m) => m.name === ev.actorName && m.memberType !== 'human');

      if (!actorMember) {
        executedEvents.add(ev.eventId);
        callbacks.onEventExecuted(ev.eventId);
        continue;
      }

      // Show brief "Caelum 正在选择……" status before writing vote
      callbacks.onIndicatorChange({
        status: signal.isPaused() ? 'paused' : 'delivering',
        roundId: plan.roundId,
        activeActorId: actorMember.id,
        activeActorName: actorMember.name,
        activeActionType: 'voting',
        activePollId: ev.pollId,
        remainingEventCount: remainingEvents,
        totalEventCount: totalEvents,
      });

      const voteDelay = Math.max(550, Math.min(1400, ev.delayMs || 750));
      const waitRes = await signal.waitWhilePausedOrSleep(voteDelay);
      if (waitRes === 'cancelled' || signal.isCancelled()) {
        callbacks.onIndicatorChange(null);
        return 'cancelled';
      }

      const optionIds =
        Array.isArray(ev.optionIds) && ev.optionIds.length > 0
          ? ev.optionIds
          : ev.optionId
            ? [ev.optionId]
            : [];

      const voteResult = await applyAiPollVoteAndPersist(liveGroup.id, {
        pollId: ev.pollId,
        actorId: actorMember.id,
        optionIds,
      });

      if (!voteResult.applied) {
        console.info(
          `[GroupEventExecutor] Skipped vote_poll (${ev.eventId}) for ${actorMember.name}: ${voteResult.reason}`
        );
      }

      executedEvents.add(ev.eventId);
      callbacks.onEventExecuted(ev.eventId);
    }
  }

  callbacks.onIndicatorChange(null);
  return 'completed';
}
