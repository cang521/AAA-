import {
  AiCharacter,
  ApiConfig,
  ApiLog,
  GroupChat,
  GroupPollPayload,
  UserProfile,
} from '../../../../types';
import { apiFetch } from '../../../../lib/localBackend';
import { castGroupPollVote } from '../../../../lib/groupTools';

export async function runAiPollVotesForGroup(params: {
  group: GroupChat;
  pollPayload: GroupPollPayload;
  allCharacters: AiCharacter[];
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}): Promise<{
  updatedPayload: GroupPollPayload;
  comments: Array<{ aiMemberId: string; aiName: string; aiAvatar: string; comment: string }>;
}> {
  let currentPayload = params.pollPayload;
  const comments: Array<{ aiMemberId: string; aiName: string; aiAvatar: string; comment: string }> = [];

  const aiMembers = (params.group.members || [])
    .filter((m) => m.memberType === 'ai' && !m.isMuted)
    .slice(0, 4);

  for (const member of aiMembers) {
    const baseChar = params.allCharacters.find(
      (c) => c.id === member.characterId || c.id === member.id
    );
    const actor = {
      id: member.id,
      name: member.name,
      persona: member.customPersona || baseChar?.persona || '',
      personality: member.customPersonality || baseChar?.personality || '',
      memories: member.memories || baseChar?.memories || [],
    };

    try {
      const res = await apiFetch('/api/gemini/ai-social-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'group_poll_vote',
          actorA: actor,
          groupContext: {
            groupName: params.group.name,
            pollTitle: currentPayload.title,
            pollOptions: currentPayload.options.map((o) => ({ id: o.id, text: o.text })),
            multiSelect: currentPayload.multiSelect,
            maxSelections: currentPayload.maxSelections || 1,
          },
          userProfile: params.userProfile,
          apiConfig: params.apiConfig,
        }),
      });
      const data = await res.json();
      if (data?.log && params.onAddApiLog) {
        params.onAddApiLog(data.log);
      }
      if (!res.ok || !data?.success || !data.result) continue;

      const selectedOptionIds = Array.isArray(data.result.selectedOptionIds)
        ? data.result.selectedOptionIds.map(String)
        : [];
      const voteRes = castGroupPollVote(
        currentPayload,
        { id: member.id, name: member.name },
        selectedOptionIds
      );
      if (!voteRes.error) {
        currentPayload = voteRes.payload;
        const cText = String(data.result.commentText || '').trim();
        if (cText) {
          comments.push({
            aiMemberId: member.id,
            aiName: member.name,
            aiAvatar: member.avatar,
            comment: cText,
          });
        }
      }
    } catch {
      // Skip individual AI vote cleanly on transient API failure without fabricating fake votes
    }
  }

  return {
    updatedPayload: currentPayload,
    comments,
  };
}
