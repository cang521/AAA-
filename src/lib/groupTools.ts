import {
  GroupMember,
  GroupPollPayload,
  GroupRandomDrawPayload,
  GroupRandomDrawWinner,
  GroupRelayPayload,
} from '../types';

function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function createGroupRelayPayload(params: {
  title: string;
  description?: string;
  allowDuplicate: boolean;
  deadline?: number;
  initialMember?: { id: string; name: string; avatar?: string };
  initialContent?: string;
}): GroupRelayPayload {
  const title = params.title.trim();
  if (!title) {
    throw new Error('接龙标题不能为空');
  }
  const entries = [];
  if (params.initialMember && params.initialContent && params.initialContent.trim()) {
    entries.push({
      id: `relay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      memberId: params.initialMember.id,
      memberName: params.initialMember.name,
      memberAvatar: params.initialMember.avatar,
      content: params.initialContent.trim(),
      timestamp: Date.now(),
    });
  }
  return {
    title,
    description: params.description?.trim() || undefined,
    deadline: params.deadline,
    allowDuplicate: params.allowDuplicate,
    entries,
    closed: false,
  };
}

export function appendGroupRelayEntry(
  payload: GroupRelayPayload,
  member: { id: string; name: string; avatar?: string },
  content: string,
  now = Date.now()
): { payload: GroupRelayPayload; error?: string } {
  if (payload.closed) {
    return { payload, error: '该群接龙已结束' };
  }
  if (payload.deadline && now > payload.deadline) {
    return { payload, error: '该群接龙已超过截止时间' };
  }
  const clean = content.trim();
  if (!clean) {
    return { payload, error: '请输入接龙内容' };
  }
  if (!payload.allowDuplicate && payload.entries.some((e) => e.memberId === member.id)) {
    return { payload, error: '当前接龙不允许重复提交' };
  }
  const nextEntry = {
    id: `relay_${now}_${Math.random().toString(36).slice(2, 6)}`,
    memberId: member.id,
    memberName: member.name,
    memberAvatar: member.avatar,
    content: clean,
    timestamp: now,
  };
  return {
    payload: {
      ...payload,
      entries: [...payload.entries, nextEntry],
    },
  };
}

export function createGroupPollPayload(params: {
  title: string;
  options: string[];
  multiSelect: boolean;
  maxSelections?: number;
  anonymous: boolean;
  allowChange: boolean;
  deadline?: number;
}): GroupPollPayload {
  const title = params.title.trim();
  if (!title) {
    throw new Error('投票标题不能为空');
  }
  const cleanOptions = params.options.map((o) => o.trim()).filter(Boolean);
  if (cleanOptions.length < 2) {
    throw new Error('请至少填写 2 个有效投票选项');
  }
  const maxSel = params.multiSelect
    ? Math.max(2, Math.min(cleanOptions.length, params.maxSelections || cleanOptions.length))
    : 1;

  return {
    title,
    options: cleanOptions.slice(0, 10).map((text, idx) => ({
      id: `opt_${idx + 1}_${Math.random().toString(36).slice(2, 5)}`,
      text,
      voterIds: [],
      voterNames: {},
    })),
    multiSelect: params.multiSelect,
    maxSelections: maxSel,
    anonymous: params.anonymous,
    allowChange: params.allowChange,
    deadline: params.deadline,
    closed: false,
  };
}

export function castGroupPollVote(
  payload: GroupPollPayload,
  voter: { id: string; name: string },
  selectedOptionIds: string[],
  now = Date.now()
): { payload: GroupPollPayload; error?: string } {
  if (payload.closed) {
    return { payload, error: '该投票已结束' };
  }
  if (payload.deadline && now > payload.deadline) {
    return { payload, error: '该投票已截止' };
  }

  const validOptionIds = new Set(payload.options.map((o) => o.id));
  const uniqueSelected = Array.from(new Set(selectedOptionIds)).filter((id) =>
    validOptionIds.has(id)
  );
  if (uniqueSelected.length === 0) {
    return { payload, error: '请至少选择一个有效选项' };
  }

  const maxAllowed = payload.multiSelect
    ? Math.max(1, payload.maxSelections || payload.options.length)
    : 1;
  if (uniqueSelected.length > maxAllowed) {
    return { payload, error: `最多只能选择 ${maxAllowed} 项` };
  }

  const hasVotedBefore = payload.options.some((opt) => opt.voterIds.includes(voter.id));
  if (hasVotedBefore && !payload.allowChange) {
    return { payload, error: '当前投票设置为提交后不可改选' };
  }

  const selectedSet = new Set(uniqueSelected);
  const nextOptions = payload.options.map((opt) => {
    const filteredIds = opt.voterIds.filter((id) => id !== voter.id);
    const nextNames = { ...(opt.voterNames || {}) };
    delete nextNames[voter.id];

    if (selectedSet.has(opt.id)) {
      filteredIds.push(voter.id);
      if (!payload.anonymous) {
        nextNames[voter.id] = voter.name;
      }
    }

    return {
      ...opt,
      voterIds: filteredIds,
      voterNames: payload.anonymous ? {} : nextNames,
    };
  });

  return {
    payload: {
      ...payload,
      options: nextOptions,
    },
  };
}

export function buildGroupPollStats(payload: GroupPollPayload) {
  const uniqueVoters = new Set<string>();
  let totalOptionVotes = 0;
  for (const opt of payload.options) {
    totalOptionVotes += opt.voterIds.length;
    for (const vid of opt.voterIds) uniqueVoters.add(vid);
  }
  const denominator = totalOptionVotes > 0 ? totalOptionVotes : 1;
  return {
    totalVoters: uniqueVoters.size,
    totalOptionVotes,
    optionStats: payload.options.map((opt) => ({
      optionId: opt.id,
      count: opt.voterIds.length,
      percent: totalOptionVotes > 0 ? Math.round((opt.voterIds.length / denominator) * 100) : 0,
    })),
  };
}

export function performLocalGroupRandomDraw(params: {
  members: GroupMember[];
  scope: 'all' | 'ai_only';
  includeUser: boolean;
  count: number;
  allowDuplicate: boolean;
  taskDescription?: string;
  now?: number;
}): { payload?: GroupRandomDrawPayload; error?: string } {
  const now = params.now || Date.now();
  let pool = params.members.filter((m) => {
    if (params.scope === 'ai_only') {
      return m.memberType === 'ai' || m.memberType === 'npc';
    }
    return true;
  });

  if (!params.includeUser) {
    pool = pool.filter((m) => m.id !== 'user_main' && m.memberType !== 'human');
  }

  if (pool.length === 0) {
    return { error: '当前抽取池中没有符合条件的群成员' };
  }

  const requestedCount = Math.max(1, Math.min(20, Math.floor(params.count) || 1));
  if (!params.allowDuplicate && requestedCount > pool.length) {
    return {
      error: `不重复抽取模式下，人数 (${requestedCount}) 不能超过当前抽选池成员数 (${pool.length})`,
    };
  }

  const winners: GroupRandomDrawWinner[] = [];
  if (params.allowDuplicate) {
    for (let i = 0; i < requestedCount; i++) {
      const idx = secureRandomInt(pool.length);
      const picked = pool[idx];
      winners.push({
        memberId: picked.id,
        memberName: picked.name,
        memberAvatar: picked.avatar,
        memberType: picked.memberType,
        round: i + 1,
      });
    }
  } else {
    const remaining = [...pool];
    for (let i = 0; i < requestedCount; i++) {
      const idx = secureRandomInt(remaining.length);
      const [picked] = remaining.splice(idx, 1);
      winners.push({
        memberId: picked.id,
        memberName: picked.name,
        memberAvatar: picked.avatar,
        memberType: picked.memberType,
        round: i + 1,
      });
    }
  }

  return {
    payload: {
      scope: params.scope,
      includeUser: params.includeUser,
      count: requestedCount,
      allowDuplicate: params.allowDuplicate,
      taskDescription: params.taskDescription?.trim() || undefined,
      poolMemberIds: pool.map((m) => m.id),
      winners,
      drawnAt: now,
    },
  };
}
