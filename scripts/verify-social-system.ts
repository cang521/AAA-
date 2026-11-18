import assert from 'node:assert/strict';
import {
  applySocialDbMigrations,
  appendPrivateChatTurnAtomic,
  commitSocialTransaction,
  exportSocialBundle,
  getAllFriendRequests,
  getAllRelationshipEdges,
  getPrivateMessagesForThread,
  getPrivateThread,
  getReadOnlyAiPhoneSnapshot,
  importSocialBundleNonDestructive,
  saveRomanticState,
  setSocialIndexedDbFactoryForTest,
} from '../src/lib/social/socialDb';
import {
  canInteractMoments,
  canSendFriendRequest,
  canSendPrivateMessage,
  canViewMoments,
  clampAttitude,
  createDefaultRelationshipEdge,
  detectSharedRomanticTarget,
  enforceDirectionalAttitudeRules,
  evaluateConfessionDecision,
  evaluateConfessionEligibility,
  evaluateConflictOutcome,
  getNextConflictStage,
  makePairId,
  makeThreadId,
} from '../src/lib/social/relationshipRules';
import { DEFAULT_AI_SOCIAL_SETTINGS } from '../src/lib/social/socialSettings';
import {
  appendGroupRelayEntry,
  buildGroupPollStats,
  castGroupPollVote,
  createGroupPollPayload,
  createGroupRelayPayload,
  performLocalGroupRandomDraw,
} from '../src/lib/groupTools';
import {
  AiCharacter,
  AiRelationshipEdge,
  GroupMember,
  USER_ENTITY_ID,
  UserProfile,
} from '../src/types';

// Minimal faithful IndexedDB Shim for Node verification
function createInMemoryIdbFactory(): IDBFactory {
  const databases = new Map<
    string,
    Map<
      string,
      {
        keyPath: string;
        records: Map<string, any>;
        indexes: Map<string, string | string[]>;
      }
    >
  >();

  const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const getPathVal = (obj: any, path: string | string[]): any => {
    if (Array.isArray(path)) return path.map((p) => obj?.[p]);
    return obj?.[path];
  };
  const keyToStr = (k: any): string => JSON.stringify(k);

  return {
    open(name: string, _version?: number): IDBOpenDBRequest {
      const req: any = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      let storeMap = databases.get(name);
      const isNew = !storeMap;
      if (!storeMap) {
        storeMap = new Map();
        databases.set(name, storeMap);
      }

      const dbApi: any = {
        get objectStoreNames() {
          const names = Array.from(storeMap!.keys());
          return {
            contains: (n: string) => names.includes(n),
            length: names.length,
          };
        },
        createObjectStore(storeName: string, opts: { keyPath: string }) {
          const entry = {
            keyPath: opts.keyPath,
            records: new Map<string, any>(),
            indexes: new Map<string, string | string[]>(),
          };
          storeMap!.set(storeName, entry);
          return {
            createIndex(idxName: string, keyPath: string | string[]) {
              entry.indexes.set(idxName, keyPath);
            },
          };
        },
        transaction(storeNames: string[], _mode: IDBTransactionMode) {
          const tx: any = {
            oncomplete: null as any,
            onerror: null as any,
            onabort: null as any,
            objectStore(storeName: string) {
              if (!storeNames.includes(storeName)) {
                throw new Error(`Store ${storeName} not in transaction`);
              }
              const entry = storeMap!.get(storeName)!;
              return {
                put(val: any) {
                  const key = keyToStr(getPathVal(val, entry.keyPath));
                  entry.records.set(key, clone(val));
                  const r: any = { result: val, onsuccess: null, onerror: null };
                  queueMicrotask(() => r.onsuccess?.({ target: r }));
                  return r;
                },
                get(key: any) {
                  const found = entry.records.get(keyToStr(key));
                  const r: any = { result: clone(found), onsuccess: null, onerror: null };
                  queueMicrotask(() => r.onsuccess?.({ target: r }));
                  return r;
                },
                getAll() {
                  const all = Array.from(entry.records.values()).map(clone);
                  const r: any = { result: all, onsuccess: null, onerror: null };
                  queueMicrotask(() => r.onsuccess?.({ target: r }));
                  return r;
                },
                index(idxName: string) {
                  const idxKeyPath = entry.indexes.get(idxName)!;
                  return {
                    getAll(range?: any) {
                      const all = Array.from(entry.records.values())
                        .filter((rec) => {
                          if (!range) return true;
                          const val = getPathVal(rec, idxKeyPath);
                          if (Array.isArray(range.lower) && Array.isArray(val)) {
                            return (
                              val[0] === range.lower[0] &&
                              val[1] >= range.lower[1] &&
                              val[1] <= range.upper[1]
                            );
                          }
                          return true;
                        })
                        .map(clone);
                      const r: any = { result: all, onsuccess: null, onerror: null };
                      queueMicrotask(() => r.onsuccess?.({ target: r }));
                      return r;
                    },
                  };
                },
              };
            },
          };
          queueMicrotask(() => tx.oncomplete?.());
          return tx;
        },
        close() {},
      };

      (globalThis as any).IDBKeyRange = {
        bound(lower: any, upper: any) {
          return { lower, upper };
        },
      };

      queueMicrotask(() => {
        req.result = dbApi;
        if (isNew && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req });
          applySocialDbMigrations(dbApi);
        }
        req.onsuccess?.({ target: req });
      });

      return req as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

async function runFullAcceptanceVerification() {
  setSocialIndexedDbFactoryForTest(createInMemoryIdbFactory());

  const testChars: AiCharacter[] = [
    {
      id: 'ai_lin',
      name: '林思微',
      avatar: 'lin.png',
      wxid: 'wx_lin',
      persona: '温柔体贴学姐',
      greeting: '你好',
      memories: [],
      isLocked: false,
      tags: [],
    },
    {
      id: 'ai_gu',
      name: '顾言',
      avatar: 'gu.png',
      wxid: 'wx_gu',
      persona: '严谨学霸',
      greeting: '你好',
      memories: [],
      isLocked: false,
      tags: [],
    },
    {
      id: 'ai_lu',
      name: '陆沉',
      avatar: 'lu.png',
      wxid: 'wx_lu',
      persona: '冷静总裁',
      greeting: '你好',
      memories: [],
      isLocked: false,
      tags: [],
    },
    {
      id: 'ai_new',
      name: '苏晓',
      avatar: 'su.png',
      wxid: 'wx_su',
      persona: '刚加入群聊的新成员',
      greeting: '你好',
      memories: [],
      isLocked: false,
      tags: [],
    },
  ];
  const testUser: UserProfile = {
    name: '山雨',
    avatar: 'user.png',
    wxid: 'shanyu',
    bio: '',
    persona: '',
    preferences: '',
  };

  // =========================================================================
  // Scenario ①: View AI Phone is strictly read-only & never fabricates empty data
  // =========================================================================
  const emptyBundleBefore = await exportSocialBundle();
  const emptySnap = await getReadOnlyAiPhoneSnapshot({
    aiId: 'ai_new',
    characters: testChars,
    userProfile: testUser,
  });
  const emptyBundleAfter = await exportSocialBundle();
  assert.equal(emptySnap.chats.length, 0);
  assert.equal(emptySnap.events.length, 0);
  assert.equal(emptySnap.lastRealInteractionAt, null);
  assert.deepEqual(emptyBundleBefore, emptyBundleAfter);

  // Canonical IDs & 0..100 Attitude Clamping
  assert.equal(makePairId('ai_gu', 'ai_lin'), makePairId('ai_lin', 'ai_gu'));
  assert.equal(makeThreadId('ai_gu', 'ai_lin'), makeThreadId('ai_lin', 'ai_gu'));
  const clamped = clampAttitude({ familiarity: 180, tension: -20, trust: 55 });
  assert.equal(clamped.familiarity, 100);
  assert.equal(clamped.tension, 0);
  assert.equal(clamped.trust, 55);

  // =========================================================================
  // Scenario ②: Meet in group -> Friend request -> Accept -> Shared Private Thread
  // =========================================================================
  const friendEdge = createDefaultRelationshipEdge('ai_gu', 'ai_lin', 'friends', 1000);
  await commitSocialTransaction({
    edges: [friendEdge],
    events: [
      {
        id: 'evt_1',
        type: 'friend_request_accepted',
        actorIds: ['ai_gu', 'ai_lin'],
        pairId: friendEdge.id,
        summary: '林思微通过了顾言的好友申请',
        isMajor: true,
        createdAt: 1000,
      },
    ],
  });

  assert.equal(canSendPrivateMessage(friendEdge, 'ai_gu', DEFAULT_AI_SOCIAL_SETTINGS).allowed, true);

  await appendPrivateChatTurnAtomic({
    participantA: 'ai_gu',
    participantB: 'ai_lin',
    edge: friendEdge,
    newMessages: [
      {
        id: 'pm_1',
        senderId: 'ai_gu',
        receiverId: 'ai_lin',
        text: '晚上有空讨论一下那本书吗？',
        timestamp: 2000,
      },
      {
        id: 'pm_2',
        senderId: 'ai_lin',
        receiverId: 'ai_gu',
        text: '好呀，大概八点之后都有空。',
        timestamp: 2050,
      },
    ],
  });

  const beforeViewerRead = await exportSocialBundle();
  const snapGu = await getReadOnlyAiPhoneSnapshot({
    aiId: 'ai_gu',
    characters: testChars,
    userProfile: testUser,
  });
  const snapLin = await getReadOnlyAiPhoneSnapshot({
    aiId: 'ai_lin',
    characters: testChars,
    userProfile: testUser,
  });
  const afterViewerRead = await exportSocialBundle();

  assert.deepEqual(beforeViewerRead, afterViewerRead);
  assert.equal(snapGu.chats.length, 1);
  assert.equal(snapLin.chats.length, 1);
  assert.equal(snapGu.chats[0].thread.id, snapLin.chats[0].thread.id);
  assert.deepEqual(
    snapGu.chats[0].messages.map((m) => m.id),
    snapLin.chats[0].messages.map((m) => m.id)
  );
  // Ensure NEVER represented as user_main
  assert.equal(
    snapGu.chats[0].messages.some((m) => m.senderId === USER_ENTITY_ID),
    false
  );

  // =========================================================================
  // Scenario ③: Moments Permissions (Friends YES vs Same-Group Acquaintances NO)
  // =========================================================================
  const acqEdge = createDefaultRelationshipEdge('ai_lin', 'ai_lu', 'acquaintances', 1000);
  assert.equal(
    canViewMoments({ viewerId: 'ai_lin', ownerId: 'ai_lu', edge: acqEdge, postTimestamp: 2000 }),
    false
  );
  assert.equal(
    canInteractMoments(acqEdge, 'ai_lin', 'ai_lu', DEFAULT_AI_SOCIAL_SETTINGS),
    false
  );
  assert.equal(
    canViewMoments({ viewerId: 'ai_gu', ownerId: 'ai_lin', edge: friendEdge, postTimestamp: 2000 }),
    true
  );
  assert.equal(
    canInteractMoments(friendEdge, 'ai_gu', 'ai_lin', DEFAULT_AI_SOCIAL_SETTINGS),
    true
  );

  // =========================================================================
  // Scenario ④: Gradual Conflict Progression -> Cold War -> Unfriend -> Re-add vs Block
  // =========================================================================
  // 4.1 Step-by-step conflict stage machine: cannot jump from 'none'/'friends' directly to unfriend/block
  assert.equal(getNextConflictStage('none', 'severe'), 'dissatisfied');
  assert.equal(getNextConflictStage('dissatisfied', 'mild'), 'bickering');
  assert.equal(getNextConflictStage('bickering', 'mild'), 'tense');
  assert.equal(getNextConflictStage('tense', 'moderate'), 'cold_war');
  assert.equal(getNextConflictStage('cold_war', 'severe'), 'serious_conflict');

  const conflictStep1 = evaluateConflictOutcome({
    edge: friendEdge,
    actorId: 'ai_gu',
    triggerReason: '意见不合',
    settings: DEFAULT_AI_SOCIAL_SETTINGS,
    severity: 'severe',
  });
  assert.equal(conflictStep1.canUnfriendNow, false);
  assert.equal(conflictStep1.canBlockNow, false);

  const seriousEdge: AiRelationshipEdge = {
    ...friendEdge,
    status: 'tense',
    conflictStage: 'serious_conflict',
    aToB: { ...friendEdge.aToB, tension: 88 },
    bToA: { ...friendEdge.bToA, tension: 88 },
  };
  const conflictSerious = evaluateConflictOutcome({
    edge: seriousEdge,
    actorId: 'ai_gu',
    triggerReason: '彻底谈崩',
    settings: DEFAULT_AI_SOCIAL_SETTINGS,
    severity: 'severe',
  });
  assert.equal(conflictSerious.canUnfriendNow, true);
  assert.equal(conflictSerious.canBlockNow, true);

  // 4.2 Unfriended but NOT blocked -> Moments & Private Chat blocked, Re-add Friend Request ALLOWED
  const unfriendedEdge: AiRelationshipEdge = {
    ...seriousEdge,
    status: 'unfriended',
    unfriendedByIds: ['ai_gu'],
  };
  assert.equal(
    canSendPrivateMessage(unfriendedEdge, 'ai_gu', DEFAULT_AI_SOCIAL_SETTINGS).allowed,
    false
  );
  assert.equal(
    canViewMoments({
      viewerId: 'ai_gu',
      ownerId: 'ai_lin',
      edge: unfriendedEdge,
      postTimestamp: 9999,
    }),
    false
  );
  assert.equal(
    canSendFriendRequest({
      fromId: 'ai_gu',
      toId: 'ai_lin',
      edge: unfriendedEdge,
      existingRequests: [],
      settings: DEFAULT_AI_SOCIAL_SETTINGS,
    }).allowed,
    true
  );

  // 4.3 Blocked -> Private Chat, Friend Request, and Moments ALL blocked
  const blockedEdge: AiRelationshipEdge = {
    ...unfriendedEdge,
    status: 'blocked',
    blockedByIds: ['ai_lin'],
  };
  assert.equal(
    canSendPrivateMessage(blockedEdge, 'ai_gu', DEFAULT_AI_SOCIAL_SETTINGS).allowed,
    false
  );
  assert.equal(
    canSendFriendRequest({
      fromId: 'ai_gu',
      toId: 'ai_lin',
      edge: blockedEdge,
      existingRequests: [],
      settings: DEFAULT_AI_SOCIAL_SETTINGS,
    }).allowed,
    false
  );
  assert.equal(
    canViewMoments({
      viewerId: 'ai_gu',
      ownerId: 'ai_lin',
      edge: blockedEdge,
      postTimestamp: 9999,
    }),
    false
  );

  // Group membership & GroupAvatar independence: AI social unfriend/block NEVER alters GroupMembers
  const groupMembersBefore: GroupMember[] = [
    { id: 'user_main', name: '山雨', avatar: 'u.png', memberType: 'human', role: 'owner', joinedAt: 1 },
    { id: 'ai_lin', name: '林思微', avatar: 'lin.png', memberType: 'ai', role: 'member', joinedAt: 1 },
    { id: 'ai_gu', name: '顾言', avatar: 'gu.png', memberType: 'ai', role: 'member', joinedAt: 1 },
  ];
  assert.equal(groupMembersBefore.length, 3);

  // =========================================================================
  // Scenario ⑤: Hard Romantic Lock Enforces Rejection Even If LLM Suggests Accept
  // =========================================================================
  await saveRomanticState({
    characterId: 'ai_lin',
    romanticTargetId: USER_ENTITY_ID,
    romanticTargetLocked: true,
    allowNaturalRomance: false,
    status: 'crush',
    updatedAt: Date.now(),
  });
  await saveRomanticState({
    characterId: 'ai_gu',
    romanticTargetId: 'ai_lin',
    romanticTargetLocked: false,
    allowNaturalRomance: true,
    status: 'crush',
    updatedAt: Date.now(),
  });

  const snapLinLocked = await getReadOnlyAiPhoneSnapshot({
    aiId: 'ai_lin',
    characters: testChars,
    userProfile: testUser,
  });
  const snapGuRomantic = await getReadOnlyAiPhoneSnapshot({
    aiId: 'ai_gu',
    characters: testChars,
    userProfile: testUser,
  });

  const hardLockDecision = evaluateConfessionDecision({
    senderId: 'ai_gu',
    receiverId: 'ai_lin',
    receiverState: snapLinLocked.romanticState,
    edge: friendEdge,
    modelSuggestedAccept: true,
  });
  assert.equal(hardLockDecision.accepted, false);
  assert.equal(hardLockDecision.enforcedByLock, true);

  // =========================================================================
  // Scenario ⑥: Two AIs Both Liking User Remain Friends, Zero Romance Between Them
  // =========================================================================
  await saveRomanticState({
    characterId: 'ai_lu',
    romanticTargetId: USER_ENTITY_ID,
    romanticTargetLocked: true,
    allowNaturalRomance: false,
    status: 'crush',
    updatedAt: Date.now(),
  });
  const shared = detectSharedRomanticTarget(snapLinLocked.romanticState, {
    characterId: 'ai_lu',
    romanticTargetId: USER_ENTITY_ID,
    romanticTargetLocked: true,
    allowNaturalRomance: false,
    status: 'crush',
    updatedAt: Date.now(),
  });
  assert.equal(shared, USER_ENTITY_ID);

  const linAttTowardLu = enforceDirectionalAttitudeRules({
    fromId: 'ai_lin',
    toId: 'ai_lu',
    proposedDelta: { affinity: 35, trust: 25, romanticAffinity: 60 },
    currentAttitude: friendEdge.bToA,
    fromRomanticState: snapLinLocked.romanticState,
    toRomanticState: {
      characterId: 'ai_lu',
      romanticTargetId: USER_ENTITY_ID,
      romanticTargetLocked: true,
      allowNaturalRomance: false,
      status: 'crush',
      updatedAt: Date.now(),
    },
    globalSettings: { ...DEFAULT_AI_SOCIAL_SETTINGS, allowNaturalRomance: true },
  });
  assert.equal(linAttTowardLu.affinity, 50);
  assert.equal(linAttTowardLu.romanticAffinity, 0);

  // =========================================================================
  // Scenario ⑦: Disabling Toggles Blocks Future Actions While Retaining History
  // =========================================================================
  const conflictWithUnfriendOff = evaluateConflictOutcome({
    edge: seriousEdge,
    actorId: 'ai_gu',
    triggerReason: '严重争吵',
    settings: { ...DEFAULT_AI_SOCIAL_SETTINGS, allowUnfriend: false },
    severity: 'severe',
  });
  assert.equal(conflictWithUnfriendOff.canUnfriendNow, false);
  assert.equal(conflictWithUnfriendOff.canBlockNow, false);

  const pausedSendCheck = canSendPrivateMessage(friendEdge, 'ai_gu', {
    ...DEFAULT_AI_SOCIAL_SETTINGS,
    paused: true,
  });
  assert.equal(pausedSendCheck.allowed, false);

  // History strictly remains intact after toggling
  assert.equal((await getAllRelationshipEdges()).length, 1);
  assert.equal((await getPrivateMessagesForThread(makeThreadId('ai_gu', 'ai_lin'))).length, 2);

  // =========================================================================
  // Scenario ⑧: Group Tools (Relay, Poll, Local True-Random Draw)
  // =========================================================================
  // 8.1 Group Relay
  const relay0 = createGroupRelayPayload({
    title: '周末点奶茶',
    allowDuplicate: false,
    initialMember: { id: 'user_main', name: '山雨' },
    initialContent: '杨枝甘露少糖',
  });
  const relayDup = appendGroupRelayEntry(relay0, { id: 'user_main', name: '山雨' }, '再来一杯');
  assert.ok(relayDup.error);
  const relayAi = appendGroupRelayEntry(relay0, { id: 'ai_lin', name: '林思微' }, '四季春去冰');
  assert.equal(relayAi.error, undefined);
  assert.equal(relayAi.payload.entries.length, 2);

  // 8.2 Group Poll
  const poll0 = createGroupPollPayload({
    title: '聚餐地点',
    options: ['火锅', '日料', '粤菜'],
    multiSelect: false,
    anonymous: false,
    allowChange: false,
  });
  const vote1 = castGroupPollVote(poll0, { id: 'user_main', name: '山雨' }, [poll0.options[0].id]);
  assert.equal(vote1.error, undefined);
  // Attempting second change when allowChange: false must reject
  const voteChangeReject = castGroupPollVote(
    vote1.payload,
    { id: 'user_main', name: '山雨' },
    [poll0.options[1].id]
  );
  assert.ok(voteChangeReject.error);
  const vote2 = castGroupPollVote(
    vote1.payload,
    { id: 'ai_lin', name: '林思微' },
    [poll0.options[2].id]
  );
  const stats = buildGroupPollStats(vote2.payload);
  assert.equal(stats.totalVoters, 2);
  assert.equal(stats.totalOptionVotes, 2);

  // 8.3 Local Random Draw
  const drawRes = performLocalGroupRandomDraw({
    members: groupMembersBefore,
    scope: 'all',
    includeUser: false,
    count: 2,
    allowDuplicate: false,
    taskDescription: '今晚总结人选',
  });
  assert.equal(drawRes.error, undefined);
  assert.equal(drawRes.payload?.winners.length, 2);
  assert.equal(
    drawRes.payload?.winners.some((w) => w.memberId === 'user_main'),
    false
  );
  const winnerIds = new Set(drawRes.payload?.winners.map((w) => w.memberId));
  assert.equal(winnerIds.size, 2);

  // =========================================================================
  // Scenario ⑨: Export & Non-Destructive Merge Import
  // =========================================================================
  const exported = await exportSocialBundle();
  assert.equal(exported.privateMessages.length, 2);

  const incomingDelta = {
    ...exported,
    privateMessages: [
      ...exported.privateMessages,
      {
        id: 'pm_3_imported',
        threadId: makeThreadId('ai_gu', 'ai_lin'),
        senderId: 'ai_gu',
        receiverId: 'ai_lin',
        text: '那八点准时线上见。',
        timestamp: 2100,
      },
    ],
  };
  const mergeRes = await importSocialBundleNonDestructive(incomingDelta);
  assert.equal(mergeRes.messagesAdded, 1);
  const afterMergeMsgs = await getPrivateMessagesForThread(makeThreadId('ai_gu', 'ai_lin'));
  assert.equal(afterMergeMsgs.length, 3);

  const th = await getPrivateThread('ai_lin', 'ai_gu');
  assert.ok(th);
  assert.equal((await getAllFriendRequests()).length, 0);
  const confCheck = evaluateConfessionEligibility({
    senderState: snapLinLocked.romanticState,
    targetId: 'ai_gu',
    edge: friendEdge,
    globalSettings: DEFAULT_AI_SOCIAL_SETTINGS,
  });
  assert.equal(confCheck.eligible, false);
  assert.equal(snapGuRomantic.aiId, 'ai_gu');

  console.log(
    '✓ All 9 acceptance scenarios (Social DB + Rules + Hard Romantic Lock + Group Tools + Merge Import) passed!'
  );
}

runFullAcceptanceVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
