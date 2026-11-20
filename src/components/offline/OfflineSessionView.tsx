import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  Send,
  Plus,
  Sparkles,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  Copy,
  AlertTriangle,
  SlidersHorizontal,
  X,
  Check,
} from 'lucide-react';
import { OfflineSession, OfflineMessage, getPaginatedSessionMessages } from '../../lib/offline/OfflineSessionDb';
import { OfflineSessionService } from '../../lib/offline/OfflineSessionService';
import { OfflineStateEngine, CharacterState } from '../../lib/offline/OfflineStateEngine';
import { OfflineMemoryBridge, OfflineSessionSummary } from '../../lib/offline/OfflineMemoryBridge';
import {
  loadOfflineDisplaySettings,
  saveOfflineDisplaySettings,
  getOfflineFontScaleClasses,
  OFFLINE_FONT_TIER_OPTIONS,
  OfflineDisplaySettings,
  OfflineFontSizeTier,
} from '../../lib/offline/offlineDisplaySettings';
import { normalizeOfflineSegments, segmentsToPlainText } from '../../lib/offline/offlineSegments';
import {
  formatOfflineFullDateTime,
  formatOfflineTimeHM,
  shouldShowOfflineTimeDivider,
  formatOfflineMessageDivider,
} from '../../lib/offline/offlineTimeFormat';
import { OfflineStateMiniPanel } from './OfflineStateMiniPanel';
import { OfflineEndModal } from './OfflineEndModal';
import { AiCharacter, UserProfile, ApiConfig } from '../../types';
import { useStableTextEditing } from '../../hooks/useStableTextEditing';

interface OfflineSessionViewProps {
  session: OfflineSession;
  character: AiCharacter;
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onBack: () => void;
  onSessionEndedAndSaved: () => void;
  onUpdateCharacters?: (chars: AiCharacter[]) => void;
}

const QUICK_SCENE_ACTIONS: Array<{ label: string; text: string; insertOnly?: boolean }> = [
  { label: '插入动作括号（）', text: '（）', insertOnly: true },
  { label: '轻轻靠近看着对方', text: '（轻轻靠近一步，安静地看着你的眼睛）' },
  { label: '递上一杯温水', text: '（倒了一杯温热的水递到你手边，在你身旁坐下）' },
  { label: '伸手轻拉衣袖', text: '（微微偏过头，伸手轻轻拉住你的衣袖）' },
  { label: '安静陪在身边', text: '（没有催促，只是安静地靠在你身边陪着你）' },
];

function upsertMessageInList(list: OfflineMessage[], incoming: OfflineMessage): OfflineMessage[] {
  const key = incoming.clientMessageId || incoming.id;
  const idx = list.findIndex((m) => m.id === incoming.id || (m.clientMessageId && m.clientMessageId === key));
  if (idx === -1) {
    return [...list, incoming].sort((a, b) => a.timestamp - b.timestamp);
  }
  const next = [...list];
  next[idx] = { ...next[idx], ...incoming };
  return next;
}

export const OfflineSessionView: React.FC<OfflineSessionViewProps> = ({
  session,
  character,
  userProfile,
  apiConfig,
  onBack,
  onSessionEndedAndSaved,
  onUpdateCharacters,
}) => {
  const [currentSession, setCurrentSession] = useState<OfflineSession>(session);
  const [messages, setMessages] = useState<OfflineMessage[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasDraftText, setHasDraftText] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  // Offline Mode Display Settings (scoped exclusively to Offline Mode)
  const [displaySettings, setDisplaySettings] = useState<OfflineDisplaySettings>(() => loadOfflineDisplaySettings());
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);

  // Ending Flow States
  const [isEnding, setIsEnding] = useState(false);
  const [isRetryingSummary, setIsRetryingSummary] = useState(false);
  const [endSummary, setEndSummary] = useState<OfflineSessionSummary | null>(null);
  const [summaryPending, setSummaryPending] = useState(false);
  const [summaryError, setSummaryError] = useState<string | undefined>(undefined);
  const [showEndModal, setShowEndModal] = useState(false);

  // Context Menu & Regenerate States
  const [selectedMsgForMenu, setSelectedMsgForMenu] = useState<OfflineMessage | null>(null);
  const [confirmRegenerateMsg, setConfirmRegenerateMsg] = useState<OfflineMessage | null>(null);
  const [regeneratingMsgId, setRegeneratingMsgId] = useState<string | null>(null);

  const sendingLockRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerEditor = useStableTextEditing<HTMLTextAreaElement>({
    defaultValue: '',
    onHasTextChange: setHasDraftText,
    externalRef: textareaRef,
    disabled: isSending,
    autoResize: true,
    minHeightPx: 40,
    maxHeightPx: 128,
  });

  const fontScale = getOfflineFontScaleClasses(displaySettings.fontSize);

  useEffect(() => {
    setCurrentSession(session);
    setHasDraftText(false);
    setBannerNotice(null);
    loadMessages(0);

    // If re-entering a session already in ended_pending_decision, open end modal cleanly
    if (session.status === 'ended_pending_decision') {
      if (session.summaryStatus === 'ready' && session.eventSummary) {
        setEndSummary({
          title: session.eventTitle || session.sceneSnapshot.name,
          summary: session.eventSummary,
          importantEvents: session.importantEvents || [],
          keyExpressions: session.keyExpressions || [],
          emotionChanges: session.emotionChanges || [],
          relationshipChanges: session.relationshipChanges || [],
          unfinishedTopics: session.unfinishedTopics || [],
          followUpWorthyTopics: session.followUpWorthyTopics || [],
          candidateMemories: session.candidateMemories || [],
          aiReflection: session.aiReflection || '',
        });
        setSummaryPending(false);
      } else {
        setEndSummary(null);
        setSummaryPending(true);
        setSummaryError(session.summaryError);
      }
      setShowEndModal(true);
    }
  }, [session.id]);

  const loadMessages = async (offset = 0) => {
    const { messages: fetched, totalCount: total } = await getPaginatedSessionMessages(session.id, offset, 80);
    setMessages(fetched);
    setTotalCount(total);
    setTimeout(() => scrollToBottom(), 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateDisplaySettings = (patch: Partial<OfflineDisplaySettings>) => {
    setDisplaySettings((prev) => {
      const next = { ...prev, ...patch };
      saveOfflineDisplaySettings(next);
      return next;
    });
  };

  const currentLatestState: CharacterState =
    currentSession.stateHistory.length > 0
      ? OfflineStateEngine.hydrateState(currentSession.stateHistory[currentSession.stateHistory.length - 1].state)
      : OfflineStateEngine.createInitialState();

  const handleContextMenu = (e: React.MouseEvent, msg: OfflineMessage) => {
    e.preventDefault();
    if (regeneratingMsgId) return;
    setSelectedMsgForMenu(msg);
  };

  const handleRequestRegenerate = (msg: OfflineMessage) => {
    setSelectedMsgForMenu(null);
    const msgIndex = messages.findIndex((m) => m.id === msg.id);
    const hasSubsequent = msgIndex !== -1 && msgIndex < messages.length - 1;

    if (hasSubsequent) {
      setConfirmRegenerateMsg(msg);
    } else {
      void executeRegenerate(msg);
    }
  };

  const executeRegenerate = async (msg: OfflineMessage) => {
    if (regeneratingMsgId) return;
    setConfirmRegenerateMsg(null);
    setRegeneratingMsgId(msg.id);
    setBannerNotice(null);

    try {
      const { updatedAiMsg, updatedSession } = await OfflineSessionService.regenerateAiMessage(
        currentSession,
        character,
        msg,
        userProfile,
        apiConfig
      );

      setCurrentSession(updatedSession);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? updatedAiMsg : m)));
    } catch (e: any) {
      console.error('Failed to regenerate offline message', e);
      setBannerNotice({
        type: 'error',
        text: `重新生成失败：${e?.message || '网络或模型异常，请稍后重试'}`,
      });
    } finally {
      setRegeneratingMsgId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    composerEditor.eventProps.onKeyDown(e);
    if (e.key === 'Enter' && !e.shiftKey && !composerEditor.isCompositionActive(e.nativeEvent)) {
      e.preventDefault();
      void handleSend();
    }
  };

  /**
   * Idempotent send & retry handler.
   * - Generates stable clientMessageId BEFORE sending.
   * - Keeps optimistic user message visible & updates status in place ('sending' -> 'sent' | 'failed').
   * - Retrying a failed message reuses its EXACT clientMessageId so duplicates NEVER happen.
   */
  const handleSend = async (
    e?: React.FormEvent,
    overrideText?: string,
    retryTargetMsg?: OfflineMessage
  ) => {
    if (e) e.preventDefault();
    if (sendingLockRef.current || isSending) return;

    const rawCurrent = retryTargetMsg?.text ?? overrideText ?? (textareaRef.current?.value ?? '');
    const userText = rawCurrent.trim();
    if (!userText) return;

    sendingLockRef.current = true;
    setIsSending(true);
    setShowQuickActions(false);
    setBannerNotice(null);

    if (!overrideText && !retryTargetMsg) {
      composerEditor.clear();
      setHasDraftText(false);
    }

    const now = Date.now();
    const stableClientMessageId =
      retryTargetMsg?.clientMessageId ||
      retryTargetMsg?.id ||
      `offmsg_u_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const requestId = `offreq_${now}_${Math.random().toString(36).substring(2, 7)}`;

    const optimisticUserMsg: OfflineMessage = {
      id: retryTargetMsg?.id || stableClientMessageId,
      clientMessageId: stableClientMessageId,
      requestId,
      sessionId: currentSession.id,
      sender: 'user',
      text: userText,
      status: 'sending',
      timestamp: retryTargetMsg?.timestamp || now,
      createdAt: retryTargetMsg?.createdAt || now,
      updatedAt: now,
    };

    // Upsert user message in place (NEVER delete user message!)
    setMessages((prev) => upsertMessageInList(prev, optimisticUserMsg));
    setTimeout(() => scrollToBottom(), 50);

    try {
      const { userMessage, aiMessage, updatedSession } = await OfflineSessionService.sendUserMessage(
        currentSession,
        character,
        userText,
        userProfile,
        apiConfig,
        {
          messageId: optimisticUserMsg.id,
          clientMessageId: stableClientMessageId,
          requestId,
        }
      );

      setCurrentSession(updatedSession);
      setMessages((prev) => {
        const withUserSent = upsertMessageInList(prev, { ...userMessage, status: 'sent' });
        return upsertMessageInList(withUserSent, aiMessage);
      });
      setBannerNotice(null);
      setTimeout(() => scrollToBottom(), 60);
    } catch (err: any) {
      console.error('Failed to send offline message', err);
      const failedUserMsg: OfflineMessage = err?.failedUserMessage || {
        ...optimisticUserMsg,
        status: 'failed',
        updatedAt: Date.now(),
      };
      setMessages((prev) => upsertMessageInList(prev, failedUserMsg));
      setBannerNotice({
        type: 'error',
        text: err?.message || '网络连接或模型响应异常，可点击失败消息下方的重试按钮。',
      });
    } finally {
      sendingLockRef.current = false;
      setIsSending(false);
    }
  };

  const handleQuickActionClick = (item: { label: string; text: string; insertOnly?: boolean }) => {
    setShowQuickActions(false);
    if (item.insertOnly) {
      const el = textareaRef.current;
      if (el) {
        const cur = el.value || '';
        const next = cur ? `${cur}（）` : '（）';
        el.value = next;
        setHasDraftText(next.trim().length > 0);
        el.focus();
        const cursorPos = next.length - 1;
        el.setSelectionRange(cursorPos, cursorPos);
      }
      return;
    }
    void handleSend(undefined, item.text);
  };

  const handleTriggerEnd = async () => {
    if (isEnding) return;
    setIsEnding(true);
    setBannerNotice(null);

    try {
      const result = await OfflineSessionService.endSession(
        currentSession,
        character,
        userProfile,
        apiConfig
      );

      setCurrentSession(result.updatedSession);
      setEndSummary(result.summary);
      setSummaryPending(result.summaryPending);
      setSummaryError(result.error);
      setShowEndModal(true);
    } catch (e: any) {
      setBannerNotice({
        type: 'error',
        text: `结束线下模式异常：${e?.message || '未知错误'}`,
      });
    } finally {
      setIsEnding(false);
    }
  };

  const handleRetrySummary = async () => {
    if (isRetryingSummary) return;
    setIsRetryingSummary(true);
    try {
      const result = await OfflineSessionService.generateSessionSummary(
        currentSession,
        character,
        userProfile,
        apiConfig
      );
      setCurrentSession(result.updatedSession);
      setEndSummary(result.summary);
      setSummaryPending(result.summaryPending);
      setSummaryError(result.error);
    } finally {
      setIsRetryingSummary(false);
    }
  };

  const handleSaveDecision = async () => {
    if (!endSummary || summaryPending) return;
    await OfflineMemoryBridge.commitSessionToLongTermMemory(
      currentSession,
      endSummary,
      character,
      onUpdateCharacters
    );
    setShowEndModal(false);
    onSessionEndedAndSaved();
  };

  const handleDeleteDecision = async () => {
    await OfflineSessionService.discardActiveSession(currentSession);
    setShowEndModal(false);
    onBack();
  };

  const handleCopyMessage = async (msg: OfflineMessage) => {
    const segs = msg.sender === 'ai' ? normalizeOfflineSegments(msg.segments, msg.text, msg.action) : null;
    const textToCopy = segs && segs.length > 0 ? segmentsToPlainText(segs) : msg.text;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setBannerNotice({ type: 'info', text: '已复制到剪贴板' });
      setTimeout(() => setBannerNotice((cur) => (cur?.text === '已复制到剪贴板' ? null : cur)), 1800);
    } catch {
      setBannerNotice({ type: 'error', text: '复制失败，请长按文本手动选择' });
    }
    setSelectedMsgForMenu(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-100 relative overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <header className="px-3.5 py-3 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0 z-20">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer shrink-0"
          title="暂存并返回"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center min-w-0 flex-1">
          <h3 className="font-bold text-sm text-zinc-100 truncate">{currentSession.sceneSnapshot.name}</h3>
          <p className="text-[11px] text-zinc-400 truncate">
            与 {character.name} 共处中 · 微信主动消息已暂停
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowDisplaySettings((v) => !v)}
            className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
              showDisplaySettings
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-750'
            }`}
            title="显示设置（字号与私密状态）"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleTriggerEnd}
            disabled={isEnding}
            className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-500 border border-rose-500/40 text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer"
          >
            {isEnding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : '结束'}
          </button>
        </div>
      </header>

      {/* Display Settings Drawer (Offline Mode ONLY: Font Size + Intimate State Visibility) */}
      {showDisplaySettings && (
        <div className="px-4 py-3.5 bg-zinc-900 border-b border-zinc-800 space-y-3 z-20 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-100">线下模式显示设置</span>
            <button
              type="button"
              onClick={() => setShowDisplaySettings(false)}
              className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] text-zinc-400 block">文字大小（仅作用于线下模式）</span>
            <div className="grid grid-cols-4 gap-2">
              {OFFLINE_FONT_TIER_OPTIONS.map((opt) => {
                const active = displaySettings.fontSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateDisplaySettings({ fontSize: opt.value as OfflineFontSizeTier })}
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-indigo-500/40'
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
            <div>
              <span className="text-xs font-semibold text-zinc-200 block">显示私密状态</span>
              <span className="text-[11px] text-zinc-400">
                仅在剧情进入亲密情境时展示可折叠状态面板
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={displaySettings.showIntimateState}
              onClick={() => updateDisplaySettings({ showIntimateState: !displaySettings.showIntimateState })}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                displaySettings.showIntimateState ? 'bg-indigo-600' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${
                  displaySettings.showIntimateState ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Main Scene & Chat Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative min-h-0" ref={chatContainerRef}>
        {/* Top Sticky Mini State Panel */}
        <div className="sticky top-0 z-10 pt-0.5 pb-1.5">
          <OfflineStateMiniPanel
            state={currentLatestState}
            characterName={character.name}
            fontScale={fontScale}
            showIntimateState={displaySettings.showIntimateState}
          />
        </div>

        {/* Scene Snapshot Banner with Full Real Local Start Time */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-indigo-500 font-bold text-xs">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              {currentSession.sceneSnapshot.name}
            </span>
            <span className={`${fontScale.timestamp} text-zinc-400 font-mono font-normal`}>
              {formatOfflineFullDateTime(currentSession.startedAt)} 开始
            </span>
          </div>
          <p className={`text-zinc-300 ${fontScale.sceneBackground}`}>{currentSession.sceneSnapshot.background}</p>
        </div>

        {/* Inline Notice / Error Banner */}
        {bannerNotice && (
          <div
            className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
              bannerNotice.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-500'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="break-words">{bannerNotice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              className="p-1 rounded-lg hover:bg-black/10 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Messages Stream with Smart Time Dividers & Strict Segment Rendering */}
        {messages.map((m, idx) => {
          const isUser = m.sender === 'user';
          const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
          const showDivider = shouldShowOfflineTimeDivider(m.timestamp, prevMsg?.timestamp);
          const aiSegments = !isUser ? normalizeOfflineSegments(m.segments, m.text, m.action) : [];

          return (
            <React.Fragment key={m.clientMessageId || m.id}>
              {showDivider && (
                <div className="flex justify-center my-2 select-none">
                  <span
                    className={`px-2.5 py-0.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-400 font-mono ${fontScale.timestamp}`}
                  >
                    {formatOfflineMessageDivider(m.timestamp)}
                  </span>
                </div>
              )}

              <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                <div className="flex items-center gap-2 px-1">
                  {!isUser && (
                    <img
                      src={character.avatar}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover border border-zinc-700 shrink-0"
                    />
                  )}
                  <span className={`${fontScale.timestamp} text-zinc-500 font-mono`}>
                    {formatOfflineTimeHM(m.timestamp)}
                  </span>
                  {isUser && m.status === 'sending' && (
                    <span className={`${fontScale.timestamp} text-indigo-500`}>发送中...</span>
                  )}
                  {isUser && m.status === 'failed' && (
                    <span className={`${fontScale.timestamp} text-rose-500 font-semibold`}>发送失败</span>
                  )}
                </div>

                <div
                  onContextMenu={(e) => handleContextMenu(e, m)}
                  className={`max-w-[90%] px-4 py-3 rounded-2xl shadow-xs select-text break-words [overflow-wrap:anywhere] ${
                    isUser
                      ? `bg-indigo-600 text-white rounded-br-xs ${m.status === 'failed' ? 'ring-2 ring-rose-500/80 opacity-90' : ''}`
                      : 'bg-zinc-850 text-zinc-100 border border-zinc-750 rounded-bl-xs space-y-2.5'
                  }`}
                >
                  {m.id === regeneratingMsgId ? (
                    <div className="flex items-center gap-2 py-1 text-indigo-500">
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                      <span className={`${fontScale.action} font-medium`}>正在重新体会当下氛围并生成回复……</span>
                    </div>
                  ) : isUser ? (
                    <p className={`whitespace-pre-wrap ${fontScale.userText}`}>{m.text}</p>
                  ) : (
                    <div className="space-y-2.5">
                      {aiSegments.map((seg, sIdx) =>
                        seg.type === 'action' ? (
                          <p
                            key={sIdx}
                            className={`${fontScale.action} text-zinc-400 italic pl-2.5 border-l-2 border-indigo-500/45 whitespace-pre-wrap`}
                          >
                            {seg.text}
                          </p>
                        ) : (
                          <p
                            key={sIdx}
                            className={`${fontScale.dialogue} text-zinc-100 font-normal whitespace-pre-wrap`}
                          >
                            {seg.text}
                          </p>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Inline Idempotent Retry Action Directly on Failed User Message */}
                {isUser && m.status === 'failed' && (
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => void handleSend(undefined, m.text, m)}
                    className="mt-1 px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>重试发送</span>
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Loading Indicator */}
        {isSending && (
          <div className={`flex items-center gap-2 ${fontScale.action} text-indigo-500 p-2`}>
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            <span>{character.name} 正在回应你……</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Scene Actions Popover (Left "+" button) */}
      {showQuickActions && (
        <div className="px-3.5 py-2.5 bg-zinc-900 border-t border-zinc-800 space-y-2 z-20">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-200">快捷场景动作</span>
            <button
              type="button"
              onClick={() => setShowQuickActions(false)}
              className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SCENE_ACTIONS.map((item, i) => (
              <button
                key={i}
                type="button"
                disabled={isSending}
                onClick={() => handleQuickActionClick(item)}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-950 hover:border-indigo-500/50 border border-zinc-800 text-xs text-zinc-200 transition cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fixed Bottom Input Bar */}
      <footer className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0 z-20">
        <form onSubmit={(e) => void handleSend(e)} className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowQuickActions((v) => !v)}
            className={`p-2.5 mb-0.5 rounded-xl transition shrink-0 cursor-pointer ${
              showQuickActions
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100'
            }`}
            title="快捷场景动作"
          >
            <Plus className={`w-4 h-4 transition-transform ${showQuickActions ? 'rotate-45' : ''}`} />
          </button>

          <textarea
            key={currentSession.id}
            ref={composerEditor.mergedRef}
            rows={1}
            defaultValue=""
            placeholder="输入你想说的话或动作（可用（）描写动作）"
            {...composerEditor.eventProps}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            className={`flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 ${fontScale.inputText} text-zinc-100 focus:outline-none focus:border-indigo-500 font-normal resize-none max-h-32 min-h-[40px] leading-relaxed`}
          />

          <button
            type="submit"
            disabled={isSending}
            className={`p-2.5 mb-0.5 rounded-xl transition shrink-0 shadow-sm active:scale-95 cursor-pointer ${
              hasDraftText
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 opacity-85'
            } disabled:opacity-40`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* End Decision Modal */}
      <OfflineEndModal
        isOpen={showEndModal}
        session={currentSession}
        summary={endSummary}
        summaryPending={summaryPending}
        summaryError={summaryError}
        isRetryingSummary={isRetryingSummary}
        characterName={character.name}
        onRetrySummary={handleRetrySummary}
        onSave={handleSaveDecision}
        onDelete={handleDeleteDecision}
        onKeepPendingAndExit={() => {
          setShowEndModal(false);
          onBack();
        }}
      />

      {/* Message Context Menu Modal */}
      {selectedMsgForMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelectedMsgForMenu(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-4 space-y-2 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center pb-2 border-b border-zinc-800/80">
              <p className="text-xs font-bold text-zinc-200">消息选项</p>
              <p className="text-[11px] text-zinc-500 truncate max-w-[240px] mx-auto mt-0.5">
                “{selectedMsgForMenu.text.slice(0, 32)}”
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={() => void handleCopyMessage(selectedMsgForMenu)}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Copy className="w-4 h-4 text-zinc-400" />
                复制消息文本
              </button>

              {selectedMsgForMenu.sender === 'ai' && (
                <button
                  type="button"
                  onClick={() => handleRequestRegenerate(selectedMsgForMenu)}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-500/35 text-indigo-500 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  重新生成回复（原地替换）
                </button>
              )}

              {selectedMsgForMenu.sender === 'user' && selectedMsgForMenu.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedMsgForMenu;
                    setSelectedMsgForMenu(null);
                    void handleSend(undefined, target.text, target);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  重试发送此消息
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedMsgForMenu(null)}
              className="w-full py-2 rounded-xl bg-zinc-950 text-zinc-400 hover:text-zinc-100 text-xs font-medium transition cursor-pointer mt-1"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal when Subsequent Messages Exist */}
      {confirmRegenerateMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmRegenerateMsg(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-sm text-zinc-100">确认重新生成此回复？</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                这条消息后面已有后续对话，原地重新生成可能与后续剧情产生衔接差异，是否继续？
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRegenerateMsg(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void executeRegenerate(confirmRegenerateMsg)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
              >
                继续重答
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
