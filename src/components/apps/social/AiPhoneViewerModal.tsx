import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Compass,
  Heart,
  Lock,
  MessageCircle,
  ShieldAlert,
  Smartphone,
  UserCheck,
  UserMinus,
  Users,
  X,
  Clock,
  Bug,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AiCharacter,
  AiFriendRequest,
  AiSocialEvent,
  AiSocialMomentPost,
  MomentPost,
  USER_ENTITY_ID,
  UserProfile,
} from '../../../types';
import {
  AiPhoneChatThreadView,
  AiPhoneContactView,
  AiPhoneSnapshot,
  getReadOnlyAiPhoneSnapshot,
} from '../../../lib/social/socialDb';
import { getRelationshipStatusLabel } from '../../../lib/social/relationshipRules';

interface AiPhoneViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: AiCharacter;
  allCharacters: AiCharacter[];
  userProfile: UserProfile;
  userMoments: MomentPost[];
}

type PhoneTab = 'chats' | 'contacts' | 'moments' | 'events';

const EVENT_TYPE_LABELS: Record<AiSocialEvent['type'], string> = {
  met_in_group: '群内相识',
  shared_interest: '共同话题',
  friend_request_sent: '发送好友申请',
  friend_request_accepted: '通过好友申请',
  friend_request_rejected: '拒绝好友申请',
  private_chat: '私聊互动',
  moments_liked: '朋友圈点赞',
  moments_commented: '朋友圈评论',
  moments_posted: '发布朋友圈',
  helped: '互相帮助',
  jealousy_sparked: '心生醋意',
  bickering: '产生拌嘴',
  cold_war_started: '开始冷战',
  conflict_escalated: '冲突升级',
  reconciled: '达成和好',
  unfriended: '互删好友',
  re_added_friend: '重新加回好友',
  blocked: '加入黑名单',
  unblocked: '移出黑名单',
  confession_sent: '鼓起勇气表白',
  confession_accepted: '表白成功',
  confession_rejected: '婉拒表白',
  group_random_event: '群聊随机事件',
  api_failed: '互动记录异常',
};

function formatDateTimeShort(ts?: number | null): string {
  if (!ts) return '暂无记录';
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return String(ts);
  }
}

export const AiPhoneViewerModal: React.FC<AiPhoneViewerModalProps> = ({
  isOpen,
  onClose,
  character,
  allCharacters,
  userProfile,
  userMoments,
}) => {
  const [activeTab, setActiveTab] = useState<PhoneTab>('chats');
  const [snapshot, setSnapshot] = useState<AiPhoneSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Strictly READ-ONLY database query — zero API calls, zero mutations, zero fabrication.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setSelectedThreadId(null);

    getReadOnlyAiPhoneSnapshot({
      aiId: character.id,
      characters: allCharacters,
      userProfile,
      userMoments,
    })
      .then((snap) => {
        if (!cancelled) {
          setSnapshot(snap);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[AiPhoneViewerModal] read snapshot failed:', err);
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, character.id, allCharacters, userProfile, userMoments]);

  if (!isOpen) return null;

  const resolveEntityName = (entityId: string): string => {
    if (entityId === USER_ENTITY_ID) return userProfile.name || '山雨';
    const found = allCharacters.find((c) => c.id === entityId);
    return found ? found.name : entityId;
  };

  const resolveEntityAvatar = (entityId: string): string => {
    if (entityId === USER_ENTITY_ID) return userProfile.avatar || '';
    const found = allCharacters.find((c) => c.id === entityId);
    return found ? found.avatar : '';
  };

  const selectedThread: AiPhoneChatThreadView | null =
    snapshot && selectedThreadId
      ? snapshot.chats.find((c) => c.thread.id === selectedThreadId) || null
      : null;

  const totalRequests = snapshot
    ? snapshot.contacts.incomingRequests.length + snapshot.contacts.outgoingRequests.length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="wx-modal-card w-full max-w-md h-[88vh] max-h-[760px] rounded-3xl bg-zinc-900 border border-zinc-750 shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Phone Header */}
        <div className="wx-header px-3.5 py-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedThread ? (
              <button
                type="button"
                onClick={() => setSelectedThreadId(null)}
                aria-label="返回私聊列表"
                className="wx-header-back min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-xl text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <img
                src={character.avatar}
                alt={character.name}
                className="wx-avatar w-9 h-9 rounded-xl object-cover border border-zinc-700 shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <h3 className="wx-header-title text-sm font-semibold truncate">
                  {selectedThread
                    ? `${character.name} 与 ${selectedThread.otherName} 的私聊`
                    : `${character.name} 的微信（只读查看）`}
                </h3>
              </div>
              <p className="wx-secondary-text text-[11px] text-zinc-400 truncate">
                {snapshot?.lastRealInteractionAt
                  ? `只读模拟 · 数据截止到最后一次真实互动时间 ${formatDateTimeShort(snapshot.lastRealInteractionAt)}`
                  : '只读模拟 · 暂无真实社交互动记录'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭查看"
            className="wx-header-action min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs (Hidden when inside a private chat thread) */}
        {!selectedThread && (
          <div className="wx-bottom-nav grid grid-cols-4 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
            {[
              { id: 'chats' as const, label: '聊天', icon: MessageCircle, count: snapshot?.chats.length },
              { id: 'contacts' as const, label: '通讯录', icon: Users, count: snapshot?.contacts.friends.length },
              { id: 'moments' as const, label: '朋友圈', icon: Compass, count: snapshot?.moments.length },
              { id: 'events' as const, label: '关系记录', icon: Clock, count: snapshot?.events.length },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[44px] py-2 px-1 flex items-center justify-center gap-1 text-xs font-medium border-b-2 transition cursor-pointer ${
                    isActive
                      ? 'wx-green-text border-emerald-500 text-emerald-400'
                      : 'wx-secondary-text border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && tab.count > 0 && (
                    <span className="text-[10px] opacity-75">({tab.count})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body Content */}
        <div className="wx-list flex-1 overflow-y-auto bg-zinc-950/70">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-xs text-zinc-400">
              正在从本地存档读取真实社交数据...
            </div>
          ) : !snapshot ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-xs text-zinc-400">
              读取本地社交存档失败，请稍后重试。
            </div>
          ) : selectedThread ? (
            /* ==================== THREAD DETAIL VIEW (READ-ONLY) ==================== */
            <div className="flex flex-col min-h-full p-3 space-y-3">
              {selectedThread.edge &&
                (selectedThread.edge.status === 'blocked' ||
                  selectedThread.edge.status === 'unfriended' ||
                  selectedThread.edge.conflictStage === 'cold_war') && (
                  <div className="wx-alert-warn px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      当前关系状态：{getRelationshipStatusLabel(selectedThread.edge.status, selectedThread.edge.conflictStage)}
                    </span>
                  </div>
                )}

              {selectedThread.messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-xs text-zinc-500">
                  暂无实际私聊消息
                </div>
              ) : (
                selectedThread.messages.map((msg) => {
                  // AI's own perspective: msg.senderId === character.id is aligned RIGHT
                  const isPhoneOwner = msg.senderId === character.id;
                  const senderAvatar = isPhoneOwner ? character.avatar : selectedThread.otherAvatar;
                  const senderName = isPhoneOwner ? character.name : selectedThread.otherName;
                  if (msg.messageType === 'system') {
                    return (
                      <div key={msg.id} className="flex justify-center my-1">
                        <span className="wx-secondary-text text-[10px] px-2.5 py-0.5 rounded bg-zinc-800/70 text-zinc-400">
                          {msg.text}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 ${isPhoneOwner ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <img
                        src={senderAvatar}
                        alt={senderName}
                        className="wx-avatar w-8 h-8 rounded-lg object-cover shrink-0 border border-black/10"
                      />
                      <div className={`max-w-[76%] flex flex-col ${isPhoneOwner ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`wx-message-bubble px-3 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                            isPhoneOwner
                              ? 'wx-message-bubble-user bg-[#95EC69] dark:bg-emerald-600 text-black dark:text-white rounded-tr-none'
                              : 'wx-message-bubble-ai bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700/60'
                          }`}
                        >
                          {msg.text}
                        </div>
                        <span className="wx-muted-text text-[10px] text-zinc-500 mt-0.5 px-1">
                          {formatDateTimeShort(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              <div className="mt-auto pt-3 border-t border-zinc-800/80 text-center text-[11px] text-zinc-500 flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3" />
                <span>只读视图：无法代发消息，也不会改动对方已读或关系状态</span>
              </div>
            </div>
          ) : activeTab === 'chats' ? (
            /* ==================== TAB 1: CHATS ==================== */
            <div className="divide-y divide-zinc-800/70">
              {snapshot.chats.length === 0 ? (
                <div className="py-16 px-6 text-center space-y-2">
                  <MessageCircle className="w-8 h-8 mx-auto text-zinc-500 opacity-60" />
                  <h4 className="wx-primary-text text-sm font-medium">暂无真实的私聊记录</h4>
                  <p className="wx-secondary-text text-xs text-zinc-400 leading-relaxed">
                    {character.name} 尚未与其他角色产生实际 AI 私聊消息。此处绝不会凭空编造或补全聊天记录。
                  </p>
                </div>
              ) : (
                snapshot.chats.map((item) => (
                  <button
                    key={item.thread.id}
                    type="button"
                    onClick={() => setSelectedThreadId(item.thread.id)}
                    className="wx-conversation-row w-full px-3.5 py-3 min-h-[64px] flex items-center gap-3 text-left hover:bg-zinc-900/80 active:bg-zinc-800 transition cursor-pointer"
                  >
                    <img
                      src={item.otherAvatar}
                      alt={item.otherName}
                      className="wx-avatar w-11 h-11 rounded-xl object-cover border border-zinc-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="wx-primary-text text-sm font-medium truncate">
                          {item.otherName}
                        </span>
                        <span className="wx-muted-text text-[10px] text-zinc-500 shrink-0">
                          {formatDateTimeShort(item.thread.lastMessageAt || item.thread.updatedAt)}
                        </span>
                      </div>
                      <p className="wx-secondary-text text-xs text-zinc-400 truncate mt-0.5">
                        {item.thread.lastMessageText || '暂无消息内容'}
                      </p>
                      <div className="wx-muted-text text-[10px] text-zinc-500 mt-0.5">
                        {item.thread.messageCount} 条真实消息
                        {item.edge && item.edge.status !== 'friends' && (
                          <> · {getRelationshipStatusLabel(item.edge.status, item.edge.conflictStage)}</>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : activeTab === 'contacts' ? (
            /* ==================== TAB 2: CONTACTS ==================== */
            <div className="p-3 space-y-4 text-xs">
              <ContactSection
                title={`好友 (${snapshot.contacts.friends.length})`}
                icon={<UserCheck className="w-3.5 h-3.5 text-emerald-500" />}
                emptyText="暂无好友关系记录"
                items={snapshot.contacts.friends}
              />

              <ContactSection
                title={`认识但未加好友 (${snapshot.contacts.acquaintances.length})`}
                icon={<Users className="w-3.5 h-3.5 text-sky-400" />}
                emptyText="暂无群内仅相识尚未加好友的联系人"
                items={snapshot.contacts.acquaintances}
              />

              {/* Friend Requests */}
              <div className="space-y-1.5">
                <div className="wx-secondary-text flex items-center gap-1.5 px-1 text-[11px] font-semibold text-zinc-400">
                  <Heart className="w-3.5 h-3.5 text-amber-400" />
                  <span>好友申请 ({totalRequests})</span>
                </div>
                {totalRequests === 0 ? (
                  <p className="wx-muted-text text-[11px] text-zinc-500 px-2 py-2">暂无好友申请往来记录</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...snapshot.contacts.incomingRequests, ...snapshot.contacts.outgoingRequests]
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((req: AiFriendRequest) => {
                        const isIncoming = req.toId === character.id;
                        const peerId = isIncoming ? req.fromId : req.toId;
                        const statusLabel =
                          req.status === 'accepted'
                            ? '已通过'
                            : req.status === 'rejected'
                            ? '已拒绝'
                            : req.status === 'pending'
                            ? '待回应'
                            : '已失效';
                        return (
                          <div
                            key={req.id}
                            className="wx-sub-card p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={resolveEntityAvatar(peerId)}
                                  alt={resolveEntityName(peerId)}
                                  className="wx-avatar w-7 h-7 rounded-lg object-cover shrink-0"
                                />
                                <span className="wx-primary-text font-medium truncate">
                                  {isIncoming ? `来自 ${resolveEntityName(peerId)}` : `发给 ${resolveEntityName(peerId)}`}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-medium shrink-0 ${
                                  req.status === 'accepted'
                                    ? 'text-emerald-400'
                                    : req.status === 'rejected'
                                    ? 'text-rose-400'
                                    : 'text-amber-400'
                                }`}
                              >
                                {statusLabel} · {formatDateTimeShort(req.createdAt)}
                              </span>
                            </div>
                            <p className="wx-secondary-text text-[11px] text-zinc-400">
                              附言：{req.greeting || req.reason}
                            </p>
                            {req.decisionReason && (
                              <p className="wx-muted-text text-[10px] text-zinc-500">
                                原因：{req.decisionReason}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <ContactSection
                title={`已删除 (${snapshot.contacts.unfriended.length})`}
                icon={<UserMinus className="w-3.5 h-3.5 text-amber-500" />}
                emptyText="暂无已删除好友"
                items={snapshot.contacts.unfriended}
              />

              <ContactSection
                title={`黑名单 (${snapshot.contacts.blocked.length})`}
                icon={<ShieldAlert className="w-3.5 h-3.5 text-rose-500" />}
                emptyText="黑名单为空"
                items={snapshot.contacts.blocked}
              />
            </div>
          ) : activeTab === 'moments' ? (
            /* ==================== TAB 3: MOMENTS ==================== */
            <div className="p-3 space-y-3 text-xs">
              <div className="wx-muted-text text-[11px] text-zinc-500 px-1">
                仅显示按真实好友权限可见的动态；非好友（哪怕同群）、已互删后续动态与已拉黑内容不可见。
              </div>
              {snapshot.moments.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  当前权限范围内暂无真实朋友圈动态
                </div>
              ) : (
                snapshot.moments.map((post: AiSocialMomentPost) => (
                  <div
                    key={post.id}
                    className="wx-moment-card p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={post.authorAvatar || resolveEntityAvatar(post.authorId)}
                        alt={post.authorName}
                        className="wx-avatar w-9 h-9 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="wx-link-text font-semibold text-sm text-emerald-400 truncate">
                          {post.authorName}
                        </div>
                        <div className="wx-muted-text text-[10px] text-zinc-500">
                          {formatDateTimeShort(post.timestamp)}
                        </div>
                      </div>
                    </div>

                    <p className="wx-primary-text text-xs leading-relaxed whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {post.images && post.images.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {post.images.map((img, i) => (
                          <img key={i} src={img} alt="" className="w-full h-20 rounded-lg object-cover" />
                        ))}
                      </div>
                    )}

                    {(post.likes.length > 0 || post.comments.length > 0) && (
                      <div className="wx-sub-card pt-2 border-t border-zinc-800 space-y-1 text-[11px]">
                        {post.likes.length > 0 && (
                          <div className="wx-link-text text-emerald-400">
                            ♡ {post.likes.map((l) => l.name).join('、')}
                          </div>
                        )}
                        {post.comments.map((c) => (
                          <div key={c.id} className="wx-primary-text text-zinc-300">
                            <span className="wx-link-text font-medium text-emerald-400">{c.authorName}: </span>
                            <span>{c.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            /* ==================== TAB 4: RELATIONSHIP EVENTS ==================== */
            <div className="p-3 space-y-2.5 text-xs">
              {snapshot.events.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 space-y-1">
                  <Clock className="w-7 h-7 mx-auto opacity-50" />
                  <p>暂无已发生的关系事件记录</p>
                </div>
              ) : (
                snapshot.events.map((ev) => (
                  <div
                    key={ev.id}
                    className="wx-sub-card p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1"
                  >
                    <div className="wx-secondary-text flex items-center justify-between text-[10px] text-zinc-400">
                      <span className="font-medium text-emerald-400 wx-green-text">
                        {EVENT_TYPE_LABELS[ev.type] || ev.type}
                      </span>
                      <span>{formatDateTimeShort(ev.createdAt)}</span>
                    </div>
                    <p className="wx-primary-text text-xs text-zinc-200 leading-relaxed">
                      {ev.summary}
                    </p>
                  </div>
                ))
              )}

              {/* Optional collapsed Developer Diagnostics (Numeric Attitude & Romantic Lock only shown when explicitly opened) */}
              <div className="pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="wx-btn-secondary w-full min-h-[40px] px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5" />
                    <span>开发者诊断信息（内部关系数值与锁定状态）</span>
                  </span>
                  {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showDiagnostics && (
                  <div className="mt-2 p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2 text-[11px] font-mono text-zinc-400">
                    <div>
                      romanticTargetId: {snapshot.romanticState.romanticTargetId || 'null'} · locked:{' '}
                      {String(snapshot.romanticState.romanticTargetLocked)} · allowNatural:{' '}
                      {String(snapshot.romanticState.allowNaturalRomance)} · status:{' '}
                      {snapshot.romanticState.status}
                    </div>
                    {snapshot.edges.map((edge) => {
                      const otherId = edge.entityAId === character.id ? edge.entityBId : edge.entityAId;
                      const mine = edge.entityAId === character.id ? edge.aToB : edge.bToA;
                      const theirs = edge.entityAId === character.id ? edge.bToA : edge.aToB;
                      return (
                        <div key={edge.id} className="pt-1 border-t border-zinc-800/70">
                          <div>
                            peer={resolveEntityName(otherId)} ({otherId}) · status={edge.status} · conflict=
                            {edge.conflictStage || 'none'}
                            {edge.sharedRomanticTargetId ? ` · sharedTarget=${edge.sharedRomanticTargetId}` : ''}
                          </div>
                          <div>
                            me→peer: fam={mine.familiarity}, trust={mine.trust}, aff={mine.affinity}, rom=
                            {mine.romanticAffinity}, ten={mine.tension}, jeal={mine.jealousy}
                          </div>
                          <div>
                            peer→me: fam={theirs.familiarity}, trust={theirs.trust}, aff={theirs.affinity}, rom=
                            {theirs.romanticAffinity}, ten={theirs.tension}, jeal={theirs.jealousy}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ContactSectionProps {
  title: string;
  icon: React.ReactNode;
  emptyText: string;
  items: AiPhoneContactView[];
}

const ContactSection: React.FC<ContactSectionProps> = ({ title, icon, emptyText, items }) => (
  <div className="space-y-1.5">
    <div className="wx-secondary-text flex items-center gap-1.5 px-1 text-[11px] font-semibold text-zinc-400">
      {icon}
      <span>{title}</span>
    </div>
    {items.length === 0 ? (
      <p className="wx-muted-text text-[11px] text-zinc-500 px-2 py-1.5">{emptyText}</p>
    ) : (
      <div className="space-y-1">
        {items.map((c) => (
          <div
            key={c.entityId}
            className="wx-sub-card px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={c.avatar}
                alt={c.name}
                className="wx-avatar w-8 h-8 rounded-lg object-cover shrink-0 border border-black/10"
              />
              <div className="min-w-0">
                <div className="wx-primary-text font-medium truncate">
                  {c.name} {c.isUser ? '（用户）' : ''}
                </div>
                <div className="wx-muted-text text-[10px] text-zinc-500">
                  {c.edge
                    ? getRelationshipStatusLabel(c.edge.status, c.edge.conflictStage)
                    : c.isUser
                    ? '默认好友'
                    : '群友'}
                  {c.edge?.sharedRomanticTargetId ? ' · 在意同一人' : ''}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
