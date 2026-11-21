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

export function validateAndApplyAiRelayJoin(params: {
  payload: GroupRelayPayload;
  actorId: string;
  members: GroupMember[];
  content: string;
  now?: number;
}): {
  ok: boolean;
  payload: GroupRelayPayload;
  actorName?: string;
  appliedContent?: string;
  reason?: string;
} {
  const { payload, actorId, members, content } = params;
  const now = params.now ?? Date.now();

  if (!payload || !Array.isArray(payload.entries)) {
    return { ok: false, payload, reason: '接龙卡片数据不存在' };
  }
  if (payload.closed) {
    return { ok: false, payload, reason: '该群接龙已结束，禁止写入' };
  }
  if (payload.deadline && now > payload.deadline) {
    return { ok: false, payload, reason: '该群接龙已超过截止时间，禁止写入' };
  }

  const actorMember = members.find(
    (m) =>
      (m.id === actorId || m.characterId === actorId) &&
      m.memberType !== 'human' &&
      !m.isMuted
  );
  if (!actorMember) {
    return { ok: false, payload, reason: `成员 ${actorId} 不属于当前群聊的活跃未静音 AI` };
  }

  const cleanContent = String(content || '').trim();
  if (!cleanContent) {
    return { ok: false, payload, reason: '接龙内容不能为空' };
  }

  if (!payload.allowDuplicate) {
    const alreadyJoined = payload.entries.some(
      (e) =>
        e.memberId === actorMember.id ||
        (actorMember.characterId ? e.memberId === actorMember.characterId : false)
    );
    if (alreadyJoined) {
      return { ok: false, payload, reason: `${actorMember.name} 已参与过该接龙且不允许重复接龙` };
    }
  }

  const result = appendGroupRelayEntry(
    payload,
    {
      id: actorMember.id,
      name: actorMember.name,
      avatar: actorMember.avatar,
    },
    cleanContent,
    now
  );

  if (result.error) {
    return { ok: false, payload, reason: result.error };
  }

  return {
    ok: true,
    payload: result.payload,
    actorName: actorMember.name,
    appliedContent: cleanContent,
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

export function validateAndApplyAiPollVote(params: {
  payload: GroupPollPayload;
  actorId: string;
  members: GroupMember[];
  optionIds: string[];
  now?: number;
}): {
  ok: boolean;
  payload: GroupPollPayload;
  appliedOptionIds?: string[];
  actorName?: string;
  reason?: string;
} {
  const { payload, actorId, members, optionIds } = params;
  const now = params.now ?? Date.now();

  // 1 & 2. Poll must exist and not be closed or expired
  if (!payload || !Array.isArray(payload.options)) {
    return { ok: false, payload, reason: '投票数据不存在' };
  }
  if (payload.closed) {
    return { ok: false, payload, reason: '该投票已结束，禁止补投' };
  }
  if (payload.deadline && now > payload.deadline) {
    return { ok: false, payload, reason: '该投票已超过截止时间，禁止补投' };
  }

  // 3. actorId must belong to an active AI/NPC member in this group
  const actorMember = members.find(
    (m) =>
      (m.id === actorId || m.characterId === actorId) &&
      m.memberType !== 'human' &&
      !m.isMuted
  );
  if (!actorMember) {
    return { ok: false, payload, reason: `成员 ${actorId} 不属于当前群聊的活跃 AI` };
  }

  // 4. Validate optionIds exist in poll.options
  const validOptionIds = new Set(payload.options.map((o) => o.id));
  const uniqueSelected = Array.from(
    new Set((optionIds || []).map((id) => String(id).trim()).filter(Boolean))
  ).filter((id) => validOptionIds.has(id));
  if (uniqueSelected.length === 0) {
    return { ok: false, payload, reason: '投票选项 ID 不存在或为空' };
  }

  // 5. Prevent duplicate AI voting (regardless of allowChange / network retry)
  const canonicalActorId = actorMember.id;
  const alreadyVoted = payload.options.some(
    (opt) =>
      opt.voterIds.includes(canonicalActorId) ||
      (actorMember.characterId ? opt.voterIds.includes(actorMember.characterId) : false)
  );
  if (alreadyVoted) {
    return { ok: false, payload, reason: `${actorMember.name} 已经投过票，禁止重复投票` };
  }

  // 6. Validate single-select vs multi-select rule
  const maxAllowed = payload.multiSelect
    ? Math.max(1, payload.maxSelections || payload.options.length)
    : 1;
  const boundedSelected = uniqueSelected.slice(0, maxAllowed);

  // 7. Apply vote while respecting anonymous setting (never expose voterNames when anonymous)
  const selectedSet = new Set(boundedSelected);
  const nextOptions = payload.options.map((opt) => {
    const nextVoterIds = selectedSet.has(opt.id)
      ? [...opt.voterIds, canonicalActorId]
      : [...opt.voterIds];
    const nextVoterNames = payload.anonymous
      ? {}
      : {
          ...(opt.voterNames || {}),
          ...(selectedSet.has(opt.id) ? { [canonicalActorId]: actorMember.name } : {}),
        };
    return {
      ...opt,
      voterIds: nextVoterIds,
      voterNames: nextVoterNames,
    };
  });

  return {
    ok: true,
    payload: {
      ...payload,
      options: nextOptions,
    },
    appliedOptionIds: boundedSelected,
    actorName: actorMember.name,
  };
}

export function buildGroupPollStats(payload: GroupPollPayload, members?: GroupMember[]) {
  const uniqueVoters = new Set<string>();
  let totalOptionVotes = 0;
  for (const opt of payload.options) {
    totalOptionVotes += opt.voterIds.length;
    for (const vid of opt.voterIds) uniqueVoters.add(vid);
  }

  let aiVoterCount = 0;
  if (Array.isArray(members) && members.length > 0) {
    const aiIdSet = new Set<string>();
    for (const m of members) {
      if (m.memberType !== 'human') {
        aiIdSet.add(m.id);
        if (m.characterId) aiIdSet.add(m.characterId);
      }
    }
    uniqueVoters.forEach((vid) => {
      if (aiIdSet.has(vid)) aiVoterCount += 1;
    });
  } else {
    uniqueVoters.forEach((vid) => {
      if (vid !== 'user_main') aiVoterCount += 1;
    });
  }

  const denominator = totalOptionVotes > 0 ? totalOptionVotes : 1;
  return {
    totalVoters: uniqueVoters.size,
    aiVoterCount,
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
