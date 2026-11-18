import {
  AiCharacter,
  AiFriendRequest,
  AiPrivateMessage,
  AiPrivateThread,
  AiRelationshipEdge,
  AiRomanticState,
  AiSocialEvent,
  AiSocialMetaRecord,
  AiSocialMomentPost,
  MomentPost,
  USER_ENTITY_ID,
  UserProfile,
} from '../../types';
import {
  buildCharacterRomanticDefault,
  canViewMoments,
  makePairId,
  makeThreadId,
} from './relationshipRules';

export const SOCIAL_DB_NAME = 'PhoneSimSocialDB_v1';
export const SOCIAL_DB_VERSION = 1;

export const STORE_RELATIONSHIPS = 'relationships';
export const STORE_FRIEND_REQUESTS = 'friend_requests';
export const STORE_PRIVATE_THREADS = 'private_threads';
export const STORE_PRIVATE_MESSAGES = 'private_messages';
export const STORE_SOCIAL_EVENTS = 'social_events';
export const STORE_ROMANTIC_STATES = 'romantic_states';
export const STORE_AI_MOMENTS = 'ai_moments';
export const STORE_SOCIAL_META = 'social_meta';

type SocialStoreName =
  | typeof STORE_RELATIONSHIPS
  | typeof STORE_FRIEND_REQUESTS
  | typeof STORE_PRIVATE_THREADS
  | typeof STORE_PRIVATE_MESSAGES
  | typeof STORE_SOCIAL_EVENTS
  | typeof STORE_ROMANTIC_STATES
  | typeof STORE_AI_MOMENTS
  | typeof STORE_SOCIAL_META;

export interface SocialDbChangeEvent {
  type: 'updated';
  stores: SocialStoreName[];
  timestamp: number;
}

type SocialDbListener = (event: SocialDbChangeEvent) => void;
const listeners = new Set<SocialDbListener>();

export function subscribeSocialDb(cb: SocialDbListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifySocialChange(stores: SocialStoreName[]) {
  const evt: SocialDbChangeEvent = {
    type: 'updated',
    stores,
    timestamp: Date.now(),
  };
  listeners.forEach((fn) => {
    try {
      fn(evt);
    } catch (e) {
      console.warn('[socialDb] listener error:', e);
    }
  });
}

let customIdbFactory: IDBFactory | null = null;
let socialDbPromise: Promise<IDBDatabase> | null = null;

/**
 * Allows headless unit tests to inject a mock/fake IDBFactory cleanly
 * without modifying production browser IndexedDB paths.
 */
export function setSocialIndexedDbFactoryForTest(factory: IDBFactory | null): void {
  customIdbFactory = factory;
  socialDbPromise = null;
}

export function resetSocialDbConnectionForTest(): void {
  socialDbPromise = null;
}

function resolveIdbFactory(): IDBFactory {
  if (customIdbFactory) return customIdbFactory;
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB as IDBFactory;
  }
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  throw new Error('IndexedDB is not available in this environment');
}

export function applySocialDbMigrations(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_RELATIONSHIPS)) {
    const store = db.createObjectStore(STORE_RELATIONSHIPS, { keyPath: 'id' });
    store.createIndex('by_entityA', 'entityAId', { unique: false });
    store.createIndex('by_entityB', 'entityBId', { unique: false });
    store.createIndex('by_status', 'status', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_FRIEND_REQUESTS)) {
    const store = db.createObjectStore(STORE_FRIEND_REQUESTS, { keyPath: 'id' });
    store.createIndex('by_from', 'fromId', { unique: false });
    store.createIndex('by_to', 'toId', { unique: false });
    store.createIndex('by_pair', 'pairId', { unique: false });
    store.createIndex('by_status', 'status', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_PRIVATE_THREADS)) {
    const store = db.createObjectStore(STORE_PRIVATE_THREADS, { keyPath: 'id' });
    store.createIndex('by_updated', 'updatedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_PRIVATE_MESSAGES)) {
    const store = db.createObjectStore(STORE_PRIVATE_MESSAGES, { keyPath: 'id' });
    store.createIndex('by_thread', 'threadId', { unique: false });
    store.createIndex('by_thread_time', ['threadId', 'timestamp'], { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_SOCIAL_EVENTS)) {
    const store = db.createObjectStore(STORE_SOCIAL_EVENTS, { keyPath: 'id' });
    store.createIndex('by_created', 'createdAt', { unique: false });
    store.createIndex('by_type', 'type', { unique: false });
    store.createIndex('by_pair', 'pairId', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_ROMANTIC_STATES)) {
    db.createObjectStore(STORE_ROMANTIC_STATES, { keyPath: 'characterId' });
  }
  if (!db.objectStoreNames.contains(STORE_AI_MOMENTS)) {
    const store = db.createObjectStore(STORE_AI_MOMENTS, { keyPath: 'id' });
    store.createIndex('by_author', 'authorId', { unique: false });
    store.createIndex('by_timestamp', 'timestamp', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_SOCIAL_META)) {
    db.createObjectStore(STORE_SOCIAL_META, { keyPath: 'key' });
  }
}

export function getSocialDb(): Promise<IDBDatabase> {
  if (socialDbPromise) return socialDbPromise;

  socialDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let factory: IDBFactory;
    try {
      factory = resolveIdbFactory();
    } catch (e) {
      reject(e);
      return;
    }

    const request = factory.open(SOCIAL_DB_NAME, SOCIAL_DB_VERSION);

    request.onupgradeneeded = () => {
      applySocialDbMigrations(request.result);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        socialDbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      socialDbPromise = null;
      reject(request.error);
    };
  });

  return socialDbPromise;
}

function getAllFromStore<T>(db: IDBDatabase, storeName: SocialStoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []) as T[]);
    req.onerror = () => reject(req.error);
  });
}

function getByKey<T>(db: IDBDatabase, storeName: SocialStoreName, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export interface AtomicSocialTransactionPayload {
  edges?: AiRelationshipEdge[];
  friendRequests?: AiFriendRequest[];
  threads?: AiPrivateThread[];
  messages?: AiPrivateMessage[];
  events?: AiSocialEvent[];
  romanticStates?: AiRomanticState[];
  aiMoments?: AiSocialMomentPost[];
  metaEntries?: AiSocialMetaRecord[];
}

/**
 * Single atomic multi-store IndexedDB transaction.
 * Either ALL writes commit cleanly or the entire transaction rolls back.
 */
export async function commitSocialTransaction(
  payload: AtomicSocialTransactionPayload
): Promise<void> {
  const storesToWrite: SocialStoreName[] = [];
  if (payload.edges?.length) storesToWrite.push(STORE_RELATIONSHIPS);
  if (payload.friendRequests?.length) storesToWrite.push(STORE_FRIEND_REQUESTS);
  if (payload.threads?.length) storesToWrite.push(STORE_PRIVATE_THREADS);
  if (payload.messages?.length) storesToWrite.push(STORE_PRIVATE_MESSAGES);
  if (payload.events?.length) storesToWrite.push(STORE_SOCIAL_EVENTS);
  if (payload.romanticStates?.length) storesToWrite.push(STORE_ROMANTIC_STATES);
  if (payload.aiMoments?.length) storesToWrite.push(STORE_AI_MOMENTS);
  if (payload.metaEntries?.length) storesToWrite.push(STORE_SOCIAL_META);

  if (storesToWrite.length === 0) return;

  const db = await getSocialDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storesToWrite, 'readwrite');
    if (payload.edges?.length) {
      const st = tx.objectStore(STORE_RELATIONSHIPS);
      for (const item of payload.edges) st.put(item);
    }
    if (payload.friendRequests?.length) {
      const st = tx.objectStore(STORE_FRIEND_REQUESTS);
      for (const item of payload.friendRequests) st.put(item);
    }
    if (payload.threads?.length) {
      const st = tx.objectStore(STORE_PRIVATE_THREADS);
      for (const item of payload.threads) st.put(item);
    }
    if (payload.messages?.length) {
      const st = tx.objectStore(STORE_PRIVATE_MESSAGES);
      for (const item of payload.messages) st.put(item);
    }
    if (payload.events?.length) {
      const st = tx.objectStore(STORE_SOCIAL_EVENTS);
      for (const item of payload.events) st.put(item);
    }
    if (payload.romanticStates?.length) {
      const st = tx.objectStore(STORE_ROMANTIC_STATES);
      for (const item of payload.romanticStates) st.put(item);
    }
    if (payload.aiMoments?.length) {
      const st = tx.objectStore(STORE_AI_MOMENTS);
      for (const item of payload.aiMoments) st.put(item);
    }
    if (payload.metaEntries?.length) {
      const st = tx.objectStore(STORE_SOCIAL_META);
      for (const item of payload.metaEntries) st.put(item);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Social transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Social transaction aborted'));
  });

  notifySocialChange(storesToWrite);
}

// =========================================================================
// Read & Query Helpers (Strictly non-mutating)
// =========================================================================

export async function getAllRelationshipEdges(): Promise<AiRelationshipEdge[]> {
  const db = await getSocialDb();
  return getAllFromStore<AiRelationshipEdge>(db, STORE_RELATIONSHIPS);
}

export async function getRelationshipEdge(id1: string, id2: string): Promise<AiRelationshipEdge | undefined> {
  const db = await getSocialDb();
  return getByKey<AiRelationshipEdge>(db, STORE_RELATIONSHIPS, makePairId(id1, id2));
}

export async function getAllFriendRequests(): Promise<AiFriendRequest[]> {
  const db = await getSocialDb();
  const list = await getAllFromStore<AiFriendRequest>(db, STORE_FRIEND_REQUESTS);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllPrivateThreads(): Promise<AiPrivateThread[]> {
  const db = await getSocialDb();
  const list = await getAllFromStore<AiPrivateThread>(db, STORE_PRIVATE_THREADS);
  return list.sort((a, b) => (b.lastMessageAt || b.updatedAt) - (a.lastMessageAt || a.updatedAt));
}

export async function getPrivateThread(id1: string, id2: string): Promise<AiPrivateThread | undefined> {
  const db = await getSocialDb();
  return getByKey<AiPrivateThread>(db, STORE_PRIVATE_THREADS, makeThreadId(id1, id2));
}

export async function getPrivateMessagesForThread(threadId: string): Promise<AiPrivateMessage[]> {
  const db = await getSocialDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PRIVATE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_PRIVATE_MESSAGES);
    const index = store.index('by_thread_time');
    const range = IDBKeyRange.bound([threadId, 0], [threadId, Number.MAX_SAFE_INTEGER]);
    const req = index.getAll(range);
    req.onsuccess = () => {
      const items = (req.result || []) as AiPrivateMessage[];
      items.sort((a, b) => a.timestamp - b.timestamp);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPrivateMessages(): Promise<AiPrivateMessage[]> {
  const db = await getSocialDb();
  const list = await getAllFromStore<AiPrivateMessage>(db, STORE_PRIVATE_MESSAGES);
  return list.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getAllSocialEvents(limit?: number): Promise<AiSocialEvent[]> {
  const db = await getSocialDb();
  const list = await getAllFromStore<AiSocialEvent>(db, STORE_SOCIAL_EVENTS);
  list.sort((a, b) => b.createdAt - a.createdAt);
  return limit ? list.slice(0, limit) : list;
}

export async function getRomanticState(characterId: string): Promise<AiRomanticState | undefined> {
  const db = await getSocialDb();
  return getByKey<AiRomanticState>(db, STORE_ROMANTIC_STATES, characterId);
}

export async function getAllRomanticStates(): Promise<AiRomanticState[]> {
  const db = await getSocialDb();
  return getAllFromStore<AiRomanticState>(db, STORE_ROMANTIC_STATES);
}

export async function getEffectiveRomanticState(char: AiCharacter): Promise<AiRomanticState> {
  const stored = await getRomanticState(char.id);
  if (stored) return stored;
  return buildCharacterRomanticDefault(char);
}

export async function saveRomanticState(state: AiRomanticState): Promise<void> {
  await commitSocialTransaction({
    romanticStates: [{ ...state, updatedAt: Date.now() }],
  });
}

export async function getAllAiMoments(): Promise<AiSocialMomentPost[]> {
  const db = await getSocialDb();
  const list = await getAllFromStore<AiSocialMomentPost>(db, STORE_AI_MOMENTS);
  return list.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getSocialMeta<T = any>(key: string): Promise<T | undefined> {
  const db = await getSocialDb();
  const rec = await getByKey<AiSocialMetaRecord>(db, STORE_SOCIAL_META, key);
  return rec ? (rec.value as T) : undefined;
}

export async function setSocialMeta(key: string, value: any): Promise<void> {
  await commitSocialTransaction({
    metaEntries: [{ key, value, updatedAt: Date.now() }],
  });
}

/**
 * Append messages to the SINGLE canonical shared AiPrivateThread for two entities atomically.
 * Also updates the thread summary and optionally the relationship edge & event in the same TX.
 */
export async function appendPrivateChatTurnAtomic(params: {
  participantA: string;
  participantB: string;
  newMessages: Omit<AiPrivateMessage, 'threadId'>[];
  edge?: AiRelationshipEdge;
  event?: AiSocialEvent;
  romanticStates?: AiRomanticState[];
  metaEntries?: AiSocialMetaRecord[];
}): Promise<{ thread: AiPrivateThread; messages: AiPrivateMessage[] }> {
  const { participantA, participantB, newMessages, edge, event, romanticStates, metaEntries } = params;
  if (!newMessages.length) {
    throw new Error('appendPrivateChatTurnAtomic requires at least 1 message');
  }
  const threadId = makeThreadId(participantA, participantB);
  const existingThread = await getPrivateThread(participantA, participantB);
  const sortedParticipants: [string, string] =
    participantA < participantB ? [participantA, participantB] : [participantB, participantA];

  const existingMsgs = await getPrivateMessagesForThread(threadId);
  const existingIds = new Set(existingMsgs.map((m) => m.id));

  const stampedMessages: AiPrivateMessage[] = newMessages
    .filter((m) => !existingIds.has(m.id))
    .map((m) => ({
      ...m,
      threadId,
    }));

  const sortedAll = [...existingMsgs, ...stampedMessages].sort((a, b) => a.timestamp - b.timestamp);
  const lastMsg = sortedAll[sortedAll.length - 1];
  const now = Date.now();

  const updatedThread: AiPrivateThread = {
    id: threadId,
    participantIds: sortedParticipants,
    createdAt: existingThread?.createdAt || sortedAll[0]?.timestamp || now,
    updatedAt: Math.max(now, lastMsg?.timestamp || now),
    lastMessageId: lastMsg?.id,
    lastMessageText: lastMsg?.text,
    lastSenderId: lastMsg?.senderId,
    lastMessageAt: lastMsg?.timestamp,
    messageCount: sortedAll.length,
    isArchived: existingThread?.isArchived,
  };

  await commitSocialTransaction({
    threads: [updatedThread],
    messages: stampedMessages,
    edges: edge ? [edge] : undefined,
    events: event ? [event] : undefined,
    romanticStates,
    metaEntries,
  });

  return { thread: updatedThread, messages: stampedMessages };
}

// =========================================================================
// Read-Only AI Phone Snapshot (ZERO API calls, ZERO writes, ZERO fabrication)
// =========================================================================

export interface AiPhoneContactView {
  entityId: string;
  name: string;
  avatar: string;
  isUser: boolean;
  edge: AiRelationshipEdge | null;
}

export interface AiPhoneChatThreadView {
  thread: AiPrivateThread;
  otherId: string;
  otherName: string;
  otherAvatar: string;
  edge: AiRelationshipEdge | null;
  messages: AiPrivateMessage[];
}

export interface AiPhoneSnapshot {
  aiId: string;
  lastRealInteractionAt: number | null;
  romanticState: AiRomanticState;
  chats: AiPhoneChatThreadView[];
  contacts: {
    friends: AiPhoneContactView[];
    acquaintances: AiPhoneContactView[];
    incomingRequests: AiFriendRequest[];
    outgoingRequests: AiFriendRequest[];
    unfriended: AiPhoneContactView[];
    blocked: AiPhoneContactView[];
  };
  moments: AiSocialMomentPost[];
  events: AiSocialEvent[];
  edges: AiRelationshipEdge[];
}

/**
 * Strictly READ-ONLY snapshot builder for "查看TA的手机".
 * - NEVER triggers any LLM/API request.
 * - NEVER fabricates or backfills fake history.
 * - NEVER modifies unread counts, timestamps, or relationship metrics.
 */
export async function getReadOnlyAiPhoneSnapshot(params: {
  aiId: string;
  characters: AiCharacter[];
  userProfile: UserProfile;
  userMoments?: MomentPost[];
}): Promise<AiPhoneSnapshot> {
  const { aiId, characters, userProfile, userMoments = [] } = params;
  const selfChar = characters.find((c) => c.id === aiId);

  const [edges, threads, allMessages, allRequests, events, storedRomantic, aiMoments] = await Promise.all([
    getAllRelationshipEdges(),
    getAllPrivateThreads(),
    getAllPrivateMessages(),
    getAllFriendRequests(),
    getAllSocialEvents(),
    getRomanticState(aiId),
    getAllAiMoments(),
  ]);

  const entityLookup = (entityId: string): { name: string; avatar: string; isUser: boolean } => {
    if (entityId === USER_ENTITY_ID) {
      return {
        name: userProfile.name || '山雨',
        avatar: userProfile.avatar || '',
        isUser: true,
      };
    }
    const found = characters.find((c) => c.id === entityId);
    if (found) {
      return { name: found.name, avatar: found.avatar, isUser: false };
    }
    return { name: entityId, avatar: '', isUser: false };
  };

  // Edges involving aiId
  const relevantEdges = edges.filter((e) => e.entityAId === aiId || e.entityBId === aiId);
  const edgeByOtherId = new Map<string, AiRelationshipEdge>();
  for (const edge of relevantEdges) {
    const otherId = edge.entityAId === aiId ? edge.entityBId : edge.entityAId;
    edgeByOtherId.set(otherId, edge);
  }

  // Threads involving aiId (deduped strictly from persisted threads + persisted messages)
  const relevantThreads = threads.filter((t) => t.participantIds.includes(aiId));
  const messagesByThreadId = new Map<string, AiPrivateMessage[]>();
  for (const m of allMessages) {
    if (!messagesByThreadId.has(m.threadId)) {
      messagesByThreadId.set(m.threadId, []);
    }
    messagesByThreadId.get(m.threadId)!.push(m);
  }

  const chats: AiPhoneChatThreadView[] = relevantThreads.map((thread) => {
    const otherId = thread.participantIds[0] === aiId ? thread.participantIds[1] : thread.participantIds[0];
    const info = entityLookup(otherId);
    const msgs = (messagesByThreadId.get(thread.id) || []).slice().sort((a, b) => a.timestamp - b.timestamp);
    return {
      thread,
      otherId,
      otherName: info.name,
      otherAvatar: info.avatar,
      edge: edgeByOtherId.get(otherId) || null,
      messages: msgs,
    };
  });

  // Contact lists
  const friends: AiPhoneContactView[] = [];
  const acquaintances: AiPhoneContactView[] = [];
  const unfriended: AiPhoneContactView[] = [];
  const blocked: AiPhoneContactView[] = [];

  for (const edge of relevantEdges) {
    const otherId = edge.entityAId === aiId ? edge.entityBId : edge.entityAId;
    const info = entityLookup(otherId);
    const item: AiPhoneContactView = {
      entityId: otherId,
      name: info.name,
      avatar: info.avatar,
      isUser: info.isUser,
      edge,
    };
    if (edge.status === 'blocked') {
      blocked.push(item);
    } else if (edge.status === 'unfriended') {
      unfriended.push(item);
    } else if (edge.status === 'friends' || edge.status === 'close_friends' || edge.status === 'tense') {
      friends.push(item);
    } else if (edge.status === 'acquaintances' || edge.status === 'friend_request_pending') {
      acquaintances.push(item);
    }
  }

  // User (`user_main`) is implicitly a friend unless user was explicitly unfriended/blocked in an edge
  if (!edgeByOtherId.has(USER_ENTITY_ID)) {
    friends.unshift({
      entityId: USER_ENTITY_ID,
      name: userProfile.name || '山雨',
      avatar: userProfile.avatar || '',
      isUser: true,
      edge: null,
    });
  }

  const incomingRequests = allRequests.filter((r) => r.toId === aiId);
  const outgoingRequests = allRequests.filter((r) => r.fromId === aiId);

  // Events involving aiId
  const relevantEvents = events.filter(
    (e) => e.actorIds.includes(aiId) || e.targetId === aiId
  );

  // Visible Moments based STRICTLY on real friendship permissions
  const combinedMoments: AiSocialMomentPost[] = [
    ...aiMoments,
    ...userMoments.map((m) => ({ ...m, sourceType: 'user' as const })),
  ];
  const visibleMomentsMap = new Map<string, AiSocialMomentPost>();
  for (const post of combinedMoments) {
    if (post.authorId === aiId) {
      visibleMomentsMap.set(post.id, post);
      continue;
    }
    const edge = edgeByOtherId.get(post.authorId);
    // User Moments are visible to existing AI friends unless unfriended/blocked edge exists
    if (post.authorId === USER_ENTITY_ID && !edge) {
      visibleMomentsMap.set(post.id, post);
      continue;
    }
    if (canViewMoments({ viewerId: aiId, ownerId: post.authorId, edge, postTimestamp: post.timestamp })) {
      visibleMomentsMap.set(post.id, post);
    }
  }
  const visibleMoments = Array.from(visibleMomentsMap.values()).sort((a, b) => b.timestamp - a.timestamp);

  // Compute true last real interaction timestamp
  let latestTs = 0;
  for (const e of relevantEdges) latestTs = Math.max(latestTs, e.lastInteractionAt || 0, e.updatedAt || 0);
  for (const t of relevantThreads) latestTs = Math.max(latestTs, t.lastMessageAt || 0, t.updatedAt || 0);
  for (const r of incomingRequests) latestTs = Math.max(latestTs, r.respondedAt || r.createdAt || 0);
  for (const r of outgoingRequests) latestTs = Math.max(latestTs, r.respondedAt || r.createdAt || 0);
  for (const ev of relevantEvents) latestTs = Math.max(latestTs, ev.createdAt || 0);

  const romanticState: AiRomanticState =
    storedRomantic ||
    (selfChar
      ? buildCharacterRomanticDefault(selfChar)
      : {
          characterId: aiId,
          romanticTargetId: null,
          romanticTargetLocked: false,
          allowNaturalRomance: false,
          status: 'none',
          updatedAt: 0,
        });

  return {
    aiId,
    lastRealInteractionAt: latestTs > 0 ? latestTs : null,
    romanticState,
    chats,
    contacts: {
      friends,
      acquaintances,
      incomingRequests,
      outgoingRequests,
      unfriended,
      blocked,
    },
    moments: visibleMoments,
    events: relevantEvents,
    edges: relevantEdges,
  };
}

// =========================================================================
// Full Export / Merge Import Helpers for Data Management (Phase 6 ready)
// =========================================================================

export interface SocialExportBundle {
  relationships: AiRelationshipEdge[];
  friendRequests: AiFriendRequest[];
  privateThreads: AiPrivateThread[];
  privateMessages: AiPrivateMessage[];
  socialEvents: AiSocialEvent[];
  romanticStates: AiRomanticState[];
  aiMoments: AiSocialMomentPost[];
}

export async function exportSocialBundle(): Promise<SocialExportBundle> {
  const [
    relationships,
    friendRequests,
    privateThreads,
    privateMessages,
    socialEvents,
    romanticStates,
    aiMoments,
  ] = await Promise.all([
    getAllRelationshipEdges(),
    getAllFriendRequests(),
    getAllPrivateThreads(),
    getAllPrivateMessages(),
    getAllSocialEvents(),
    getAllRomanticStates(),
    getAllAiMoments(),
  ]);

  return {
    relationships,
    friendRequests,
    privateThreads,
    privateMessages,
    socialEvents,
    romanticStates,
    aiMoments,
  };
}

/**
 * Non-destructive merge import into Social IndexedDB:
 * Preserves existing records and merges newer / missing IDs safely.
 */
export async function importSocialBundleNonDestructive(
  bundle: Partial<SocialExportBundle> | null | undefined
): Promise<{
  edgesAdded: number;
  requestsAdded: number;
  threadsAdded: number;
  messagesAdded: number;
  eventsAdded: number;
  romanticAdded: number;
  momentsAdded: number;
}> {
  if (!bundle || typeof bundle !== 'object') {
    return {
      edgesAdded: 0,
      requestsAdded: 0,
      threadsAdded: 0,
      messagesAdded: 0,
      eventsAdded: 0,
      romanticAdded: 0,
      momentsAdded: 0,
    };
  }

  const existing = await exportSocialBundle();
  const existingEdgeMap = new Map(existing.relationships.map((e) => [e.id, e]));
  const existingReqMap = new Map(existing.friendRequests.map((r) => [r.id, r]));
  const existingThreadMap = new Map(existing.privateThreads.map((t) => [t.id, t]));
  const existingMsgIds = new Set(existing.privateMessages.map((m) => m.id));
  const existingEventIds = new Set(existing.socialEvents.map((ev) => ev.id));
  const existingRomanticMap = new Map(existing.romanticStates.map((rs) => [rs.characterId, rs]));
  const existingMomentIds = new Set(existing.aiMoments.map((m) => m.id));

  const edgesToPut: AiRelationshipEdge[] = [];
  for (const edge of bundle.relationships || []) {
    if (!edge?.id || !edge.entityAId || !edge.entityBId) continue;
    const prev = existingEdgeMap.get(edge.id);
    if (!prev || (edge.updatedAt || 0) > (prev.updatedAt || 0)) {
      edgesToPut.push(edge);
    }
  }

  const requestsToPut: AiFriendRequest[] = [];
  for (const req of bundle.friendRequests || []) {
    if (!req?.id) continue;
    const prev = existingReqMap.get(req.id);
    if (!prev || (req.respondedAt || req.createdAt) > (prev.respondedAt || prev.createdAt)) {
      requestsToPut.push(req);
    }
  }

  const messagesToPut: AiPrivateMessage[] = [];
  for (const msg of bundle.privateMessages || []) {
    if (!msg?.id || !msg.threadId) continue;
    if (!existingMsgIds.has(msg.id)) {
      messagesToPut.push(msg);
    }
  }

  const threadsToPut: AiPrivateThread[] = [];
  for (const th of bundle.privateThreads || []) {
    if (!th?.id) continue;
    const prev = existingThreadMap.get(th.id);
    if (!prev || (th.updatedAt || 0) >= (prev.updatedAt || 0)) {
      const mergedCount = Math.max(prev?.messageCount || 0, th.messageCount || 0);
      threadsToPut.push({ ...th, messageCount: mergedCount });
    }
  }

  const eventsToPut: AiSocialEvent[] = [];
  for (const ev of bundle.socialEvents || []) {
    if (!ev?.id) continue;
    if (!existingEventIds.has(ev.id)) {
      eventsToPut.push(ev);
    }
  }

  const romanticToPut: AiRomanticState[] = [];
  for (const rs of bundle.romanticStates || []) {
    if (!rs?.characterId) continue;
    const prev = existingRomanticMap.get(rs.characterId);
    if (!prev || (rs.updatedAt || 0) > (prev.updatedAt || 0)) {
      romanticToPut.push(rs);
    }
  }

  const momentsToPut: AiSocialMomentPost[] = [];
  for (const mp of bundle.aiMoments || []) {
    if (!mp?.id) continue;
    if (!existingMomentIds.has(mp.id)) {
      momentsToPut.push(mp);
    }
  }

  await commitSocialTransaction({
    edges: edgesToPut,
    friendRequests: requestsToPut,
    threads: threadsToPut,
    messages: messagesToPut,
    events: eventsToPut,
    romanticStates: romanticToPut,
    aiMoments: momentsToPut,
  });

  return {
    edgesAdded: edgesToPut.length,
    requestsAdded: requestsToPut.length,
    threadsAdded: threadsToPut.length,
    messagesAdded: messagesToPut.length,
    eventsAdded: eventsToPut.length,
    romanticAdded: romanticToPut.length,
    momentsAdded: momentsToPut.length,
  };
}
