import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AiCharacter,
  ApiConfig,
  ApiLog,
  RpsGesture,
  RpsGameMode,
  RpsResult,
  RpsRecord,
  RpsStats,
} from '../../../types';
import { rpsSound } from './rpsSound';
import {
  RPS_CATEGORIES,
  RpsCategory,
  fetchRpsDialogue,
  getRpsFallbackDialogue,
  generateRpsQuestion,
  answerRpsQuestion,
} from './rpsDialogue';
import {
  loadRpsRecords,
  saveRpsRecords,
  loadRpsStats,
  saveRpsStats,
} from '../../../lib/storage';
import {
  ArrowLeft,
  RotateCcw,
  Volume2,
  VolumeX,
  Swords,
  User,
  Bot,
  Sparkles,
  Flame,
  Play,
  Pause,
  UserPlus,
  Trophy,
  History,
  Send,
  RefreshCw,
  SkipForward,
  MessageCircle,
  HelpCircle,
  CheckCircle2,
  Share2,
} from 'lucide-react';

interface RpsGameProps {
  onBack: () => void;
  characters: AiCharacter[];
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
  onGameFinish?: (record: RpsRecord) => void;
  initialOpponentId?: string;
  initialMode?: RpsGameMode;
}

const GESTURE_ICONS: Record<RpsGesture, { emoji: string; name: string; bg: string; border: string; text: string }> = {
  rock: {
    emoji: '✊',
    name: '石头',
    bg: 'from-amber-500/20 to-orange-500/20',
    border: 'border-orange-400/40',
    text: 'text-orange-600 dark:text-orange-400',
  },
  paper: {
    emoji: '✋',
    name: '布',
    bg: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-400/40',
    text: 'text-blue-600 dark:text-blue-400',
  },
  scissors: {
    emoji: '✌️',
    name: '剪刀',
    bg: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-400/40',
    text: 'text-purple-600 dark:text-purple-400',
  },
};

export const RpsGame: React.FC<RpsGameProps> = ({
  onBack,
  characters,
  apiConfig,
  onAddApiLog,
  onGameFinish,
  initialOpponentId,
  initialMode = 'pve',
}) => {
  // Game Mode & Opponents
  const [mode, setMode] = useState<RpsGameMode>(initialMode);
  const [opponent, setOpponent] = useState<AiCharacter>(
    () => characters.find((c) => c.id === initialOpponentId) || characters[0] || {
      id: 'default_ai',
      name: 'AI 伙伴',
      wxid: 'ai_friend',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      persona: '温柔细心的AI伙伴',
      greeting: '一起来猜拳吧！',
      memories: ['喜欢和用户一起游戏'],
      tags: ['伙伴'],
      isLocked: false,
    }
  );
  const [ai2, setAi2] = useState<AiCharacter>(
    () => characters[1] || characters[0] || opponent
  );

  // Sound State
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Game Play States
  type GamePhase = 'ready' | 'shaking' | 'revealed' | 'qa_session' | 'qa_answered';
  const [phase, setPhase] = useState<GamePhase>('ready');
  const [playerGesture, setPlayerGesture] = useState<RpsGesture | null>(null);
  const [aiGesture, setAiGesture] = useState<RpsGesture | null>(null);
  const [ai2Gesture, setAi2Gesture] = useState<RpsGesture | null>(null);
  const [roundResult, setRoundResult] = useState<RpsResult | null>(null);
  const [countdownText, setCountdownText] = useState<string>('石头... 剪刀... 布！');

  // Stats & Records
  const [records, setRecords] = useState<RpsRecord[]>(() => loadRpsRecords());
  const [stats, setStats] = useState<RpsStats>(() => loadRpsStats());
  const [currentStreak, setCurrentStreak] = useState<number>(stats.currentStreak || 0);

  // Dialogues
  const [aiSpeech, setAiSpeech] = useState<string>('这次我可不会让你哦！');
  const [ai2Speech, setAi2Speech] = useState<string>('放马过来吧！');
  const [isSpeechLoading, setIsSpeechLoading] = useState<boolean>(false);

  // Q&A Session State
  const [qaCategory, setQaCategory] = useState<string>('日常问答');
  const [aiGeneratedQuestion, setAiGeneratedQuestion] = useState<string>('');
  const [playerQuestionInput, setPlayerQuestionInput] = useState<string>('');
  const [playerAnswerInput, setPlayerAnswerInput] = useState<string>('');
  const [aiAnswerContent, setAiAnswerContent] = useState<string>('');
  const [isAiAnswering, setIsAiAnswering] = useState<boolean>(false);
  const [isQuestionGenerating, setIsQuestionGenerating] = useState<boolean>(false);
  const [askedQuestionsHistory, setAskedQuestionsHistory] = useState<string[]>([]);

  // Modals
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showCharacterModal, setShowCharacterModal] = useState<boolean>(false);
  const [selectingCharacterSlot, setSelectingCharacterSlot] = useState<'ai1' | 'ai2'>('ai1');

  // EvE auto play
  const [isEvePlaying, setIsEvePlaying] = useState<boolean>(false);
  const eveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial speech when opponent changes
  useEffect(() => {
    updateDialogue('before_throw');
  }, [opponent.id, mode]);

  // Dialogue helper
  const updateDialogue = async (
    situation: 'before_throw' | 'ai_win' | 'ai_loss' | 'ai_streak' | 'ai_losing_streak' | 'draw',
    resStr?: string
  ) => {
    setIsSpeechLoading(true);
    try {
      const speech = await fetchRpsDialogue(opponent, situation, currentStreak, resStr || '', apiConfig);
      setAiSpeech(speech);
    } catch {
      setAiSpeech(getRpsFallbackDialogue(opponent, situation, currentStreak));
    } finally {
      setIsSpeechLoading(false);
    }
  };

  // Determine winner between two gestures
  const judgeWinner = (g1: RpsGesture, g2: RpsGesture): 'p1_win' | 'p2_win' | 'draw' => {
    if (g1 === g2) return 'draw';
    if (
      (g1 === 'rock' && g2 === 'scissors') ||
      (g1 === 'scissors' && g2 === 'paper') ||
      (g1 === 'paper' && g2 === 'rock')
    ) {
      return 'p1_win';
    }
    return 'p2_win';
  };

  // Random AI gesture generator
  const getRandomGesture = (): RpsGesture => {
    const gestures: RpsGesture[] = ['rock', 'paper', 'scissors'];
    return gestures[Math.floor(Math.random() * gestures.length)];
  };

  // Trigger Play (PvE Mode)
  const handlePlayerChoose = (gesture: RpsGesture) => {
    if (phase !== 'ready') return;

    if (!isMuted) rpsSound.playTick();
    setPhase('shaking');
    setPlayerGesture(gesture);
    setAiGesture(null);
    setCountdownText('石头... 剪刀... 布！');

    // Simulate quick countdown animation
    setTimeout(() => {
      if (!isMuted) rpsSound.playThrow();
      const generatedAiGesture = getRandomGesture();
      setAiGesture(generatedAiGesture);

      const outcome = judgeWinner(gesture, generatedAiGesture);
      let result: RpsResult;
      let newStreak = currentStreak;

      if (outcome === 'p1_win') {
        result = 'win';
        newStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
        if (!isMuted) rpsSound.playWin();
      } else if (outcome === 'p2_win') {
        result = 'loss';
        newStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
        if (!isMuted) rpsSound.playLoss();
      } else {
        result = 'draw';
        if (!isMuted) rpsSound.playDraw();
      }

      setRoundResult(result);
      setCurrentStreak(newStreak);
      setPhase('revealed');

      // Update statistics
      const newTotal = stats.totalGames + 1;
      const newWins = stats.playerWins + (result === 'win' ? 1 : 0);
      const newLosses = stats.aiWins + (result === 'loss' ? 1 : 0);
      const newDraws = stats.draws + (result === 'draw' ? 1 : 0);
      const newMax = Math.max(stats.maxStreak, newStreak > 0 ? newStreak : 0);
      const newStats: RpsStats = {
        totalGames: newTotal,
        playerWins: newWins,
        aiWins: newLosses,
        draws: newDraws,
        currentStreak: newStreak,
        maxStreak: newMax,
        winRate: Math.round((newWins / newTotal) * 100),
      };
      setStats(newStats);
      saveRpsStats(newStats);

      // Trigger AI Dialogue response
      if (result === 'win') {
        if (newStreak >= 3) updateDialogue('ai_losing_streak', '玩家获胜');
        else updateDialogue('ai_loss', '玩家获胜');
      } else if (result === 'loss') {
        if (newStreak <= -3) updateDialogue('ai_streak', 'AI获胜');
        else updateDialogue('ai_win', 'AI获胜');
      } else {
        updateDialogue('draw', '平局');
      }

      // If not a draw, automatically transition to QA session after a short dramatic pause
      if (result !== 'draw') {
        setTimeout(() => {
          initiateQaSession(result, gesture, generatedAiGesture);
        }, 1300);
      }
    }, 900);
  };

  // Initiate Q&A Session
  const initiateQaSession = async (
    res: RpsResult,
    pGesture: RpsGesture,
    aGesture: RpsGesture
  ) => {
    setPhase('qa_session');
    setPlayerQuestionInput('');
    setPlayerAnswerInput('');
    setAiAnswerContent('');

    if (res === 'loss' || res === 'ai1_win' || res === 'ai2_win') {
      // AI won, AI asks question
      setIsQuestionGenerating(true);
      if (!isMuted) rpsSound.playQuestionPop();
      try {
        const asker = res === 'ai2_win' ? ai2 : opponent;
        const target = res === 'ai2_win' ? opponent.name : '你';
        const qRes = await generateRpsQuestion(
          asker,
          target,
          askedQuestionsHistory,
          undefined,
          apiConfig
        );
        setAiGeneratedQuestion(qRes.question);
        setQaCategory(qRes.category);
        setAskedQuestionsHistory((prev) => [...prev, qRes.question]);
      } catch (err) {
        console.error('Error generating AI question', err);
      } finally {
        setIsQuestionGenerating(false);
      }
    } else if (res === 'win') {
      // Player won, prompt player to ask
      if (!isMuted) rpsSound.playQuestionPop();
    }
  };

  // Player Submits Question to AI (Player won)
  const handlePlayerSubmitQuestion = async (customQ?: string) => {
    const qText = (customQ || playerQuestionInput).trim();
    if (!qText) return;

    setIsAiAnswering(true);
    if (!isMuted) rpsSound.playTick();

    try {
      const answer = await answerRpsQuestion(
        opponent,
        qText,
        '玩家',
        apiConfig
      );
      setAiAnswerContent(answer);
      setPhase('qa_answered');
      if (!isMuted) rpsSound.playQuestionPop();

      // Record this match in history
      const newRec: RpsRecord = {
        id: 'rps_rec_' + Date.now(),
        timestamp: Date.now(),
        mode: 'pve',
        playerGesture: playerGesture || 'rock',
        aiGesture: aiGesture || 'scissors',
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentAvatar: opponent.avatar,
        result: 'win',
        question: qText,
        answer: answer,
        questionAsker: '玩家',
        questionAnswerer: opponent.name,
        streakAfter: currentStreak,
      };
      const updated = [newRec, ...records];
      setRecords(updated);
      saveRpsRecords(updated);
      onGameFinish?.(newRec);
    } catch (e) {
      console.error('Failed to get AI answer', e);
    } finally {
      setIsAiAnswering(false);
    }
  };

  // Player Answers AI's Question (AI won)
  const handlePlayerSubmitAnswer = (isSkip = false) => {
    const ansText = isSkip ? '（玩家选择跳过了该问题）' : playerAnswerInput.trim();
    if (!isSkip && !ansText) return;

    if (!isMuted) rpsSound.playTick();
    setPhase('qa_answered');

    const newRec: RpsRecord = {
      id: 'rps_rec_' + Date.now(),
      timestamp: Date.now(),
      mode: 'pve',
      playerGesture: playerGesture || 'scissors',
      aiGesture: aiGesture || 'rock',
      opponentId: opponent.id,
      opponentName: opponent.name,
      opponentAvatar: opponent.avatar,
      result: 'loss',
      question: aiGeneratedQuestion,
      answer: ansText,
      questionAsker: opponent.name,
      questionAnswerer: '玩家',
      streakAfter: currentStreak,
    };
    const updated = [newRec, ...records];
    setRecords(updated);
    saveRpsRecords(updated);
    onGameFinish?.(newRec);
  };

  // Change AI's Question
  const handleChangeQuestion = async () => {
    setIsQuestionGenerating(true);
    if (!isMuted) rpsSound.playTick();
    try {
      const asker = opponent;
      const qRes = await generateRpsQuestion(
        asker,
        '你',
        askedQuestionsHistory,
        undefined,
        apiConfig
      );
      setAiGeneratedQuestion(qRes.question);
      setQaCategory(qRes.category);
      setAskedQuestionsHistory((prev) => [...prev, qRes.question]);
    } finally {
      setIsQuestionGenerating(false);
    }
  };

  // AI vs AI Trigger
  const handleEvePlayRound = () => {
    if (phase !== 'ready') return;
    if (!isMuted) rpsSound.playTick();

    setPhase('shaking');
    setPlayerGesture(null);
    setAiGesture(null);
    setAi2Gesture(null);

    setTimeout(() => {
      if (!isMuted) rpsSound.playThrow();
      const g1 = getRandomGesture();
      const g2 = getRandomGesture();
      setAiGesture(g1);
      setAi2Gesture(g2);

      const outcome = judgeWinner(g1, g2);
      let res: RpsResult;
      if (outcome === 'p1_win') {
        res = 'ai1_win';
        if (!isMuted) rpsSound.playWin();
      } else if (outcome === 'p2_win') {
        res = 'ai2_win';
        if (!isMuted) rpsSound.playWin();
      } else {
        res = 'draw';
        if (!isMuted) rpsSound.playDraw();
      }

      setRoundResult(res);
      setPhase('revealed');

      if (res !== 'draw') {
        setTimeout(async () => {
          setPhase('qa_session');
          setIsQuestionGenerating(true);
          const winner = res === 'ai1_win' ? opponent : ai2;
          const loser = res === 'ai1_win' ? ai2 : opponent;

          try {
            const q = await generateRpsQuestion(winner, loser.name, askedQuestionsHistory, undefined, apiConfig);
            setAiGeneratedQuestion(q.question);
            setQaCategory(q.category);
            setIsQuestionGenerating(false);

            // Loser answers automatically
            setIsAiAnswering(true);
            const ans = await answerRpsQuestion(loser, q.question, winner.name, apiConfig);
            setAiAnswerContent(ans);
            setIsAiAnswering(false);
            setPhase('qa_answered');

            const newRec: RpsRecord = {
              id: 'rps_rec_' + Date.now(),
              timestamp: Date.now(),
              mode: 'eve',
              playerGesture: g1,
              aiGesture: g2,
              opponentId: opponent.id,
              opponentName: opponent.name,
              opponentAvatar: opponent.avatar,
              ai2Id: ai2.id,
              ai2Name: ai2.name,
              ai2Avatar: ai2.avatar,
              result: res,
              question: q.question,
              answer: ans,
              questionAsker: winner.name,
              questionAnswerer: loser.name,
            };
            const updated = [newRec, ...records];
            setRecords(updated);
            saveRpsRecords(updated);
          } catch (e) {
            console.error('EvE error', e);
          }
        }, 1400);
      }
    }, 850);
  };

  // Reset to Next Round
  const handleNextRound = () => {
    setPhase('ready');
    setPlayerGesture(null);
    setAiGesture(null);
    setAi2Gesture(null);
    setRoundResult(null);
    setPlayerQuestionInput('');
    setPlayerAnswerInput('');
    setAiAnswerContent('');
    setAiGeneratedQuestion('');
    updateDialogue('before_throw');
  };

  // Preset question suggestions
  const PRESET_QUESTIONS = [
    '你最喜欢的颜色和食物是什么？',
    '老实说，你对我的第一印象如何？',
    '如果能一起去海边度假，你想做什么？',
    '你平时一个人待着的时候会想些什么？',
    '今天你的心情有没有因为和我玩而变好？',
  ];

  // Specific opponent record calculation
  const opponentRecords = records.filter(
    (r) => r.opponentId === opponent.id && r.mode === 'pve'
  );
  const opponentWins = opponentRecords.filter((r) => r.result === 'win').length;
  const opponentLosses = opponentRecords.filter((r) => r.result === 'loss').length;
  const opponentDraws = opponentRecords.filter((r) => r.result === 'draw').length;

  return (
    <div
      id="rps-game-container"
      className="relative flex flex-col h-full w-full bg-slate-900 text-slate-100 overflow-hidden font-sans select-none"
    >
      {/* Background Ambience / Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-20 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 -right-24 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 flex items-center justify-between px-3.5 py-2.5 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <button
            id="rps-btn-back"
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95"
            title="返回游戏中心"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
              <span>石头剪刀布</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                猜拳
              </span>
            </h1>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          {/* Mode Switch */}
          <div className="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700/60">
            <button
              id="rps-mode-pve"
              onClick={() => {
                setMode('pve');
                handleNextRound();
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                mode === 'pve'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              玩家对战
            </button>
            <button
              id="rps-mode-eve"
              onClick={() => {
                setMode('eve');
                handleNextRound();
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                mode === 'eve'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AI观战
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            id="rps-btn-sound"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 transition-colors"
            title={isMuted ? '开启音效' : '静音'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-rose-400" />}
          </button>

          {/* History / Stats */}
          <button
            id="rps-btn-history"
            onClick={() => setShowHistoryModal(true)}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 transition-colors"
            title="战绩与问答记录"
          >
            <History className="w-4 h-4 text-amber-400" />
          </button>
        </div>
      </header>

      {/* Main Game Stage Area */}
      <main className="relative z-10 flex-1 flex flex-col justify-between px-4 py-2.5 max-w-lg mx-auto w-full overflow-y-auto">
        {/* Top Player / AI Profile Card */}
        <section className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-3 border border-slate-700/60 shadow-lg shrink-0">
          {mode === 'pve' ? (
            <div className="flex items-center justify-between">
              {/* Opponent Info */}
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <img
                    src={opponent.avatar}
                    alt={opponent.name}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-rose-500/40"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-rose-500 text-[10px] px-1 py-0.2 rounded-full font-bold text-white shadow">
                    AI
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-slate-100">{opponent.name}</span>
                    <button
                      id="rps-change-char-btn"
                      onClick={() => {
                        setSelectingCharacterSlot('ai1');
                        setShowCharacterModal(true);
                      }}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-slate-700/80 hover:bg-slate-700 text-rose-300 transition-colors"
                    >
                      切换对手
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                    {opponent.persona}
                  </p>
                </div>
              </div>

              {/* Streak Badge & Match Counts */}
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/30 px-2.5 py-1 rounded-full text-xs font-semibold text-amber-300">
                  <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                  <span>
                    {currentStreak > 0
                      ? `连胜 ${currentStreak}`
                      : currentStreak < 0
                      ? `连败 ${Math.abs(currentStreak)}`
                      : '平局'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  胜 {opponentWins} / 负 {opponentLosses} / 平 {opponentDraws}
                </div>
              </div>
            </div>
          ) : (
            /* EvE Header */
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src={opponent.avatar}
                  alt={opponent.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-rose-400/50"
                />
                <div>
                  <div className="text-xs font-semibold text-rose-300">{opponent.name}</div>
                  <button
                    onClick={() => {
                      setSelectingCharacterSlot('ai1');
                      setShowCharacterModal(true);
                    }}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    更换 AI 1
                  </button>
                </div>
              </div>
              <div className="text-xs font-bold text-amber-400 px-2 py-0.5 bg-slate-900 rounded-full border border-slate-700">
                VS
              </div>
              <div className="flex items-center gap-2 text-right">
                <div>
                  <div className="text-xs font-semibold text-indigo-300">{ai2.name}</div>
                  <button
                    onClick={() => {
                      setSelectingCharacterSlot('ai2');
                      setShowCharacterModal(true);
                    }}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    更换 AI 2
                  </button>
                </div>
                <img
                  src={ai2.avatar}
                  alt={ai2.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-indigo-400/50"
                />
              </div>
            </div>
          )}

          {/* AI Live Dialogue Speech Bubble */}
          <div className="mt-2.5 pt-2 border-t border-slate-700/50 flex items-start gap-2">
            <MessageCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-300 italic leading-relaxed">
              “{aiSpeech}”
            </p>
          </div>
        </section>

        {/* Central Stage: Hands Throw & Versus Display */}
        <section className="relative my-auto flex flex-col items-center justify-center py-4">
          {/* Status announcement badge */}
          <div className="mb-4">
            {phase === 'ready' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-4 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-medium text-slate-300 shadow-md flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>准备出拳，选择下方手势</span>
              </motion.div>
            )}
            {phase === 'shaking' && (
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 0.3 }}
                className="px-5 py-1.5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold text-xs shadow-lg shadow-rose-500/20"
              >
                {countdownText}
              </motion.div>
            )}
            {phase === 'revealed' && roundResult && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`px-5 py-1.5 rounded-full font-bold text-xs shadow-lg flex items-center gap-1.5 ${
                  roundResult === 'win' || roundResult === 'ai1_win'
                    ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                    : roundResult === 'loss' || roundResult === 'ai2_win'
                    ? 'bg-rose-500 text-white shadow-rose-500/30'
                    : 'bg-amber-500 text-slate-900 shadow-amber-500/30'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>
                  {mode === 'pve'
                    ? roundResult === 'win'
                      ? '🎉 你赢了！进入向 AI 提问'
                      : roundResult === 'loss'
                      ? '这局我赢啦，回答我的问题哦~'
                      : '平局，再来一次！'
                    : roundResult === 'ai1_win'
                    ? `${opponent.name} 获胜！`
                    : roundResult === 'ai2_win'
                    ? `${ai2.name} 获胜！`
                    : '平局，再来一次！'}
                </span>
              </motion.div>
            )}
          </div>

          {/* Hands Arena Card */}
          <div className="w-full max-w-sm grid grid-cols-2 gap-3 items-center relative">
            {/* AI Top Hand Card */}
            <motion.div
              animate={
                phase === 'shaking'
                  ? { y: [-6, 6, -6], rotate: [-4, 4, -4] }
                  : { y: 0, rotate: 0 }
              }
              transition={{ repeat: Infinity, duration: 0.25 }}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-800/90 border-2 transition-all min-h-[140px] shadow-lg ${
                roundResult === 'loss' || roundResult === 'ai1_win'
                  ? 'border-rose-500 shadow-rose-500/20 bg-rose-950/20'
                  : 'border-slate-700/80'
              }`}
            >
              <span className="text-xs text-slate-400 mb-2 font-medium">
                {mode === 'pve' ? `${opponent.name} 的出拳` : `${opponent.name}`}
              </span>
              <div className="text-5xl my-1 filter drop-shadow-md">
                {phase === 'ready'
                  ? '❓'
                  : phase === 'shaking'
                  ? '✊'
                  : aiGesture
                  ? GESTURE_ICONS[aiGesture].emoji
                  : '❓'}
              </div>
              <span className="text-xs font-semibold mt-2 text-slate-300">
                {phase === 'revealed' && aiGesture
                  ? GESTURE_ICONS[aiGesture].name
                  : phase === 'shaking'
                  ? '正在蓄力...'
                  : '等待中'}
              </span>
            </motion.div>

            {/* Central VS Divider */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center shadow-lg text-[10px] font-black text-amber-400">
                VS
              </div>
            </div>

            {/* Player / AI2 Bottom Hand Card */}
            <motion.div
              animate={
                phase === 'shaking'
                  ? { y: [6, -6, 6], rotate: [4, -4, 4] }
                  : { y: 0, rotate: 0 }
              }
              transition={{ repeat: Infinity, duration: 0.25 }}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-800/90 border-2 transition-all min-h-[140px] shadow-lg ${
                roundResult === 'win' || roundResult === 'ai2_win'
                  ? 'border-emerald-500 shadow-emerald-500/20 bg-emerald-950/20'
                  : 'border-slate-700/80'
              }`}
            >
              <span className="text-xs text-slate-400 mb-2 font-medium">
                {mode === 'pve' ? '你的出拳' : `${ai2.name}`}
              </span>
              <div className="text-5xl my-1 filter drop-shadow-md">
                {phase === 'ready'
                  ? '❓'
                  : phase === 'shaking'
                  ? '✊'
                  : mode === 'pve'
                  ? playerGesture
                    ? GESTURE_ICONS[playerGesture].emoji
                    : '❓'
                  : ai2Gesture
                  ? GESTURE_ICONS[ai2Gesture].emoji
                  : '❓'}
              </div>
              <span className="text-xs font-semibold mt-2 text-slate-300">
                {phase === 'revealed'
                  ? mode === 'pve'
                    ? playerGesture
                      ? GESTURE_ICONS[playerGesture].name
                      : ''
                    : ai2Gesture
                    ? GESTURE_ICONS[ai2Gesture].name
                    : ''
                  : phase === 'shaking'
                  ? '正在蓄力...'
                  : '等待出拳'}
              </span>
            </motion.div>
          </div>

          {/* Quick Draw / Next Button when Draw */}
          {phase === 'revealed' && roundResult === 'draw' && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              id="rps-draw-retry-btn"
              onClick={handleNextRound}
              className="mt-4 px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 active:scale-95 transition-transform"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>平局，再来一次！</span>
            </motion.button>
          )}
        </section>

        {/* Bottom Gesture Controls or Q&A Interface */}
        <footer className="shrink-0 mt-2">
          {/* Phase 1: Player selection buttons (Ready state) */}
          {(phase === 'ready' || phase === 'shaking' || (phase === 'revealed' && roundResult === 'draw')) && (
            <div>
              {mode === 'pve' ? (
                <div className="grid grid-cols-3 gap-3">
                  {(['rock', 'scissors', 'paper'] as RpsGesture[]).map((g) => {
                    const item = GESTURE_ICONS[g];
                    return (
                      <button
                        key={g}
                        id={`rps-gesture-btn-${g}`}
                        disabled={phase === 'shaking'}
                        onClick={() => handlePlayerChoose(g)}
                        className={`group relative flex flex-col items-center justify-center p-3.5 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-800/90 border-2 ${
                          item.border
                        } shadow-lg active:scale-95 hover:border-rose-400/70 transition-all ${
                          phase === 'shaking' ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <span className="text-3xl mb-1 filter drop-shadow group-hover:scale-110 transition-transform">
                          {item.emoji}
                        </span>
                        <span className={`text-xs font-bold ${item.text}`}>{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* EvE Controls */
                <div className="flex items-center justify-center gap-3">
                  <button
                    id="rps-eve-play-btn"
                    disabled={phase === 'shaking'}
                    onClick={handleEvePlayRound}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>开始本轮 AI 猜拳对弈</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Q&A Session Screen (Special Rule: 输家回答赢家一个问题) */}
          {(phase === 'qa_session' || phase === 'qa_answered') && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/95 backdrop-blur-md rounded-2xl p-4 border border-rose-500/40 shadow-2xl relative overflow-hidden"
            >
              {/* Header Badge */}
              <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-rose-500/20 text-rose-400">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>胜者提问阶段</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded font-normal">
                        输家必须回答
                      </span>
                    </h3>
                  </div>
                </div>
                {roundResult === 'loss' && (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                    🏷️ {qaCategory}
                  </span>
                )}
              </div>

              {/* Case 1: Player won -> Player asks AI */}
              {roundResult === 'win' && (
                <div className="space-y-2.5">
                  <p className="text-xs text-rose-300 font-medium">
                    🎉 你赢了！向【{opponent.name}】提出一个问题吧：
                  </p>

                  {/* Preset quick question pills */}
                  {phase === 'qa_session' && (
                    <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                      {PRESET_QUESTIONS.map((pq, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setPlayerQuestionInput(pq);
                            handlePlayerSubmitQuestion(pq);
                          }}
                          className="text-[11px] px-2 py-1 rounded-lg bg-slate-700/70 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 border border-slate-600/60 transition-colors truncate max-w-full text-left"
                        >
                          {pq}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input area */}
                  {phase === 'qa_session' ? (
                    <div className="flex items-center gap-2">
                      <input
                        id="rps-player-question-input"
                        type="text"
                        value={playerQuestionInput}
                        onChange={(e) => setPlayerQuestionInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePlayerSubmitQuestion()}
                        placeholder={`向 ${opponent.name} 提问...`}
                        className="flex-1 bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                      />
                      <button
                        id="rps-submit-question-btn"
                        disabled={!playerQuestionInput.trim() || isAiAnswering}
                        onClick={() => handlePlayerSubmitQuestion()}
                        className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1 shadow-md shadow-rose-500/20 active:scale-95 transition-all shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>提问</span>
                      </button>
                    </div>
                  ) : (
                    /* Display answered Q&A result */
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-700 text-xs">
                        <span className="text-slate-400 font-semibold">你的提问：</span>
                        <span className="text-slate-200 ml-1">{playerQuestionInput}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-xs flex items-start gap-2">
                        <img
                          src={opponent.avatar}
                          alt={opponent.name}
                          className="w-6 h-6 rounded-full object-cover mt-0.5 shrink-0 ring-1 ring-rose-400"
                        />
                        <div>
                          <span className="text-rose-300 font-bold">{opponent.name} 的回答：</span>
                          <p className="text-slate-200 mt-1 leading-relaxed">{aiAnswerContent}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Generating indicator */}
                  {isAiAnswering && (
                    <div className="flex items-center gap-2 text-xs text-rose-300 py-1">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>{opponent.name} 正在认真思考并回答你的问题...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Case 2: AI won -> AI asks Player */}
              {roundResult === 'loss' && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80">
                    <img
                      src={opponent.avatar}
                      alt={opponent.name}
                      className="w-7 h-7 rounded-full object-cover mt-0.5 shrink-0 ring-1 ring-rose-400"
                    />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-rose-300">{opponent.name} 的提问：</span>
                      {isQuestionGenerating ? (
                        <p className="text-xs text-slate-400 italic mt-0.5 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 animate-spin text-rose-400" />
                          <span>正在根据人设构思问题...</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-100 font-medium mt-0.5 leading-relaxed">
                          “{aiGeneratedQuestion}”
                        </p>
                      )}
                    </div>
                  </div>

                  {phase === 'qa_session' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          id="rps-player-answer-input"
                          type="text"
                          value={playerAnswerInput}
                          onChange={(e) => setPlayerAnswerInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handlePlayerSubmitAnswer()}
                          placeholder="输入你的诚实回答..."
                          className="flex-1 bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                        />
                        <button
                          id="rps-submit-answer-btn"
                          disabled={!playerAnswerInput.trim()}
                          onClick={() => handlePlayerSubmitAnswer(false)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1 shadow-md shadow-emerald-600/20 active:scale-95 transition-all shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>回答</span>
                        </button>
                      </div>

                      {/* Utility Action Buttons: Change question & Skip question */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          id="rps-change-question-btn"
                          disabled={isQuestionGenerating}
                          onClick={handleChangeQuestion}
                          className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1 py-1 transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${isQuestionGenerating ? 'animate-spin' : ''}`} />
                          <span>换一个问题</span>
                        </button>
                        <button
                          id="rps-skip-question-btn"
                          onClick={() => handlePlayerSubmitAnswer(true)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 py-1 transition-colors"
                        >
                          <SkipForward className="w-3 h-3" />
                          <span>跳过问题</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display answered state */
                    <div className="p-2 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs">
                      <span className="text-emerald-400 font-semibold">你的回答：</span>
                      <span className="text-slate-200 ml-1">{playerAnswerInput || '已跳过'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Case 3: AI vs AI Mode QA */}
              {(roundResult === 'ai1_win' || roundResult === 'ai2_win') && (
                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700">
                    <span className="text-rose-300 font-bold">
                      {roundResult === 'ai1_win' ? opponent.name : ai2.name} 提问：
                    </span>
                    <p className="text-slate-200 mt-0.5">{aiGeneratedQuestion || '正在生成问题...'}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-indigo-950/30 border border-indigo-500/30">
                    <span className="text-indigo-300 font-bold">
                      {roundResult === 'ai1_win' ? ai2.name : opponent.name} 回答：
                    </span>
                    <p className="text-slate-200 mt-0.5">{aiAnswerContent || '正在作答...'}</p>
                  </div>
                </div>
              )}

              {/* Next Round Button after answering */}
              {phase === 'qa_answered' && (
                <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-end">
                  <button
                    id="rps-next-round-btn"
                    onClick={handleNextRound}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs shadow-lg shadow-rose-500/20 flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>再来一局</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </footer>
      </main>

      {/* Character Selector Modal */}
      <AnimatePresence>
        {showCharacterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-rose-400" />
                  <span>选择对弈 AI 角色</span>
                </h3>
                <button
                  onClick={() => setShowCharacterModal(false)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1"
                >
                  关闭
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {characters.map((c) => {
                  const isSelected =
                    selectingCharacterSlot === 'ai1'
                      ? opponent.id === c.id
                      : ai2.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        if (selectingCharacterSlot === 'ai1') {
                          setOpponent(c);
                        } else {
                          setAi2(c);
                        }
                        setShowCharacterModal(false);
                        handleNextRound();
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-rose-500/20 border-rose-500/80 shadow-md'
                          : 'bg-slate-900/60 border-slate-700 hover:bg-slate-700/50'
                      }`}
                    >
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-100">{c.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{c.persona}</div>
                      </div>
                      {isSelected && (
                        <span className="text-xs text-rose-400 font-bold">对战中</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History & Stats Drawer */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-md bg-slate-800 rounded-t-3xl sm:rounded-2xl p-5 border border-slate-700 shadow-2xl max-h-[85vh] flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">猜拳战绩与问答记录</h3>
                </div>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-700/50"
                >
                  关闭
                </button>
              </div>

              {/* Overall Statistics Grid */}
              <div className="grid grid-cols-4 gap-2 my-3">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-center">
                  <div className="text-[10px] text-slate-400">总局数</div>
                  <div className="text-sm font-bold text-white">{stats.totalGames}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-center">
                  <div className="text-[10px] text-emerald-400">胜场</div>
                  <div className="text-sm font-bold text-emerald-300">{stats.playerWins}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-center">
                  <div className="text-[10px] text-rose-400">负场</div>
                  <div className="text-sm font-bold text-rose-300">{stats.aiWins}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-center">
                  <div className="text-[10px] text-amber-400">最高连胜</div>
                  <div className="text-sm font-bold text-amber-300">{stats.maxStreak}</div>
                </div>
              </div>

              {/* Match and Q&A List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 mt-1">
                <h4 className="text-xs font-semibold text-slate-300 mb-1">历史问答与对局</h4>
                {records.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    暂无对局记录，快去和 AI 猜拳吧！
                  </div>
                ) : (
                  records.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-xl bg-slate-900/70 border border-slate-700/70 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <img
                            src={rec.opponentAvatar}
                            alt={rec.opponentName}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                          <span className="font-semibold text-slate-200">
                            VS {rec.opponentName}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            rec.result === 'win' || rec.result === 'ai1_win'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : rec.result === 'loss' || rec.result === 'ai2_win'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {rec.result === 'win'
                            ? '胜'
                            : rec.result === 'loss'
                            ? '负'
                            : '平'}
                          {' · '}
                          {GESTURE_ICONS[rec.playerGesture]?.emoji || '✊'} vs{' '}
                          {GESTURE_ICONS[rec.aiGesture]?.emoji || '✋'}
                        </span>
                      </div>

                      {/* Question & Answer record */}
                      {rec.question && (
                        <div className="pt-1.5 mt-1 border-t border-slate-800/80 space-y-1">
                          <div className="text-[11px] text-slate-300">
                            <span className="text-rose-400 font-semibold">
                              [{rec.questionAsker || '胜者'} 问]:
                            </span>{' '}
                            {rec.question}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            <span className="text-emerald-400 font-semibold">
                              [{rec.questionAnswerer || '输家'} 答]:
                            </span>{' '}
                            {rec.answer}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
