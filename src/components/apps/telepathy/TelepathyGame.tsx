import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AiCharacter,
  UserProfile,
  ChatMessage,
  ApiConfig,
  ApiLog,
  TelepathyGameMode,
  TelepathyQuestion,
  TelepathyRoundResult,
  TelepathyRecord,
  TelepathyCharacterStats,
} from '../../../types';
import { telepathySound } from './telepathySound';
import {
  BUILTIN_TELEPATHY_QUESTIONS,
  getAffinityLevel,
  requestAiTelepathyChoice,
  requestAiTelepathyReaction,
  generateTelepathyMemory,
} from './telepathyLogic';
import {
  loadTelepathyRecords,
  saveTelepathyRecords,
  loadTelepathyCharStats,
  saveTelepathyCharStats,
  loadUserProfile,
  loadMessages,
  saveCharacters,
} from '../../../lib/storage';
import {
  ArrowLeft,
  Heart,
  Sparkles,
  Volume2,
  VolumeX,
  RotateCcw,
  User,
  Bot,
  Flame,
  Trophy,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Brain,
  History,
  Play,
  Share2,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface TelepathyGameProps {
  onBack: () => void;
  characters: AiCharacter[];
  userProfile?: UserProfile;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
  onGameFinish?: (record: TelepathyRecord) => void;
  initialOpponentId?: string;
  initialMode?: TelepathyGameMode;
}

const FALLBACK_TELEPATHY_CHAR: AiCharacter = {
  id: 'char_1',
  name: '林思微',
  wxid: 'lin_siwei',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  persona: '温柔体贴的大学学姐，对生活充满热爱，细心体贴，情绪感知力极强。',
  personality: '温柔知性，耐心倾听，善解人意。',
  relationship: '学姐/好友',
  greeting: '小清，今天过得怎么样？很高兴和你一起玩游戏！',
  memories: [],
  tags: ['学姐', '知心'],
  isLocked: false,
};

export const TelepathyGame: React.FC<TelepathyGameProps> = ({
  onBack,
  characters,
  userProfile: propUserProfile,
  apiConfig,
  onAddApiLog,
  onGameFinish,
  initialOpponentId,
  initialMode = '5_rounds',
}) => {
  // Sound
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Safe Character List
  const safeCharacters =
    Array.isArray(characters) && characters.length > 0
      ? characters.filter(Boolean)
      : [FALLBACK_TELEPATHY_CHAR];

  // Character selection
  const [selectedCharId, setSelectedCharId] = useState<string>(
    initialOpponentId || safeCharacters[0]?.id || 'char_1'
  );
  const activeChar =
    safeCharacters.find((c) => c?.id === selectedCharId) || safeCharacters[0] || FALLBACK_TELEPATHY_CHAR;

  // Game Mode
  const [gameMode, setGameMode] = useState<TelepathyGameMode>(initialMode);

  // User Profile and Chat History
  const [userProfile, setUserProfile] = useState<UserProfile>(
    propUserProfile || loadUserProfile()
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Long-term Memory Permission toggle for this game
  const [allowMemoryWrite, setAllowMemoryWrite] = useState<boolean>(true);

  // Game Play States
  // 'lobby' | 'playing' | 'revealing' | 'round_result' | 'game_over'
  const [gameState, setGameState] = useState<
    'lobby' | 'playing' | 'revealing' | 'round_result' | 'game_over'
  >('lobby');

  // Question Queue & Current Index
  const [questions, setQuestions] = useState<TelepathyQuestion[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);

  // Player and AI selections in the current round
  const [playerSelectedOptionId, setPlayerSelectedOptionId] = useState<string | null>(null);
  const [aiSelectedOptionId, setAiSelectedOptionId] = useState<string | null>(null);
  const [aiSelectedOptionText, setAiSelectedOptionText] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  // Round Results history in current game
  const [roundResults, setRoundResults] = useState<TelepathyRoundResult[]>([]);

  // Streaks & Scores
  const [matchCount, setMatchCount] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [maxStreakInGame, setMaxStreakInGame] = useState<number>(0);

  // Current Round Result Display
  const [lastRoundResult, setLastRoundResult] = useState<TelepathyRoundResult | null>(null);

  // Final Summary & Memory Sync Status
  const [completedRecord, setCompletedRecord] = useState<TelepathyRecord | null>(null);
  const [isGeneratingMemory, setIsGeneratingMemory] = useState<boolean>(false);
  const [savedMemoryText, setSavedMemoryText] = useState<string | null>(null);

  // Stored Records and Stats for Active Character
  const [allRecords, setAllRecords] = useState<TelepathyRecord[]>([]);
  const [charStatsMap, setCharStatsMap] = useState<Record<string, TelepathyCharacterStats>>({});

  // View state in lobby: 'settings' | 'records'
  const [lobbySubTab, setLobbySubTab] = useState<'play' | 'records'>('play');

  useEffect(() => {
    setAllRecords(loadTelepathyRecords());
    setCharStatsMap(loadTelepathyCharStats());
    const allMsgs = loadMessages();
    setChatMessages(allMsgs.filter((m) => m.characterId === selectedCharId));
  }, [selectedCharId]);

  const activeCharStats = charStatsMap[selectedCharId] || {
    characterId: selectedCharId,
    characterName: activeChar.name,
    characterAvatar: activeChar.avatar,
    totalQuestions: 0,
    totalMatches: 0,
    matchRate: 0,
    currentStreak: 0,
    maxStreak: 0,
    highestScore: 0,
    totalGamesPlayed: 0,
  };

  const activeCharAffinity = getAffinityLevel(activeCharStats.matchRate);

  // Toggle audio
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    telepathySound.setEnabled(next);
  };

  // Start New Game
  const handleStartGame = () => {
    telepathySound.playSelect();

    // Shuffle built-in questions
    const shuffled = [...BUILTIN_TELEPATHY_QUESTIONS].sort(() => Math.random() - 0.5);

    let roundCount = 5;
    if (gameMode === 'single') roundCount = 1;
    else if (gameMode === '5_rounds') roundCount = 5;
    else if (gameMode === '10_rounds') roundCount = 10;
    else if (gameMode === 'endless') roundCount = shuffled.length; // can cycle

    const gameQuestions = shuffled.slice(0, roundCount);
    setQuestions(gameQuestions);
    setCurrentRoundIdx(0);
    setRoundResults([]);
    setMatchCount(0);
    setCurrentStreak(0);
    setMaxStreakInGame(0);
    setPlayerSelectedOptionId(null);
    setAiSelectedOptionId(null);
    setAiSelectedOptionText('');
    setLastRoundResult(null);
    setCompletedRecord(null);
    setSavedMemoryText(null);
    setGameState('playing');
  };

  const currentQuestion = questions[currentRoundIdx];

  // Player picks an option
  const handlePlayerChoose = async (optionId: string) => {
    if (gameState !== 'playing' || playerSelectedOptionId || isAiThinking) return;

    telepathySound.playSelect();
    setPlayerSelectedOptionId(optionId);
    setIsAiThinking(true);

    const playerOpt = currentQuestion.options.find((o) => o.id === optionId);
    const playerText = playerOpt?.text || '';

    // Let AI deduce and submit choice
    const aiChoiceResult = await requestAiTelepathyChoice(
      activeChar,
      currentQuestion,
      userProfile,
      chatMessages,
      activeChar.memories,
      apiConfig
    );

    setAiSelectedOptionId(aiChoiceResult.choiceId);
    setAiSelectedOptionText(aiChoiceResult.choiceText);
    setIsAiThinking(false);
    setGameState('revealing');

    // Reveal animation delay
    setTimeout(async () => {
      const isMatch = optionId === aiChoiceResult.choiceId;

      // Update streaks
      const nextStreak = isMatch ? currentStreak + 1 : 0;
      const nextMaxStreak = Math.max(maxStreakInGame, nextStreak);
      const nextMatches = isMatch ? matchCount + 1 : matchCount;

      setCurrentStreak(nextStreak);
      setMaxStreakInGame(nextMaxStreak);
      setMatchCount(nextMatches);

      if (isMatch) {
        telepathySound.playMatch();
      } else {
        telepathySound.playMiss();
      }

      // Fetch dynamic reaction from AI
      const aiReaction = await requestAiTelepathyReaction(
        activeChar,
        currentQuestion,
        playerText,
        aiChoiceResult.choiceText,
        isMatch,
        nextStreak,
        apiConfig
      );

      const roundRes: TelepathyRoundResult = {
        roundIndex: currentRoundIdx + 1,
        question: currentQuestion,
        playerChoiceId: optionId,
        playerChoiceText: playerText,
        aiChoiceId: aiChoiceResult.choiceId,
        aiChoiceText: aiChoiceResult.choiceText,
        isMatch,
        aiReaction,
      };

      setLastRoundResult(roundRes);
      setRoundResults((prev) => [...prev, roundRes]);
      setGameState('round_result');
    }, 1200);
  };

  // Next round or Finish Game
  const handleNextRound = async () => {
    telepathySound.playSelect();

    const isLastRound =
      (gameMode === 'single' && currentRoundIdx >= 0) ||
      (gameMode === '5_rounds' && currentRoundIdx >= 4) ||
      (gameMode === '10_rounds' && currentRoundIdx >= 9) ||
      (gameMode === 'endless' && currentRoundIdx >= questions.length - 1);

    if (isLastRound) {
      await finishGame();
    } else {
      setCurrentRoundIdx((prev) => prev + 1);
      setPlayerSelectedOptionId(null);
      setAiSelectedOptionId(null);
      setAiSelectedOptionText('');
      setLastRoundResult(null);
      setGameState('playing');
    }
  };

  // Finish and compile record
  const finishGame = async () => {
    telepathySound.playVictory();
    const totalR = roundResults.length;
    const finalRate = totalR > 0 ? Math.round((matchCount / totalR) * 100) : 0;
    const levelObj = getAffinityLevel(finalRate);

    const newRecord: TelepathyRecord = {
      id: 'tele_' + Date.now(),
      timestamp: Date.now(),
      characterId: activeChar.id,
      characterName: activeChar.name,
      characterAvatar: activeChar.avatar,
      gameMode,
      totalRounds: totalR,
      matchCount,
      matchRate: finalRate,
      maxStreak: maxStreakInGame,
      rounds: roundResults,
      affinityLevelTitle: levelObj.title,
    };

    setCompletedRecord(newRecord);
    setGameState('game_over');

    // Update global records list
    const updatedRecs = [newRecord, ...allRecords];
    setAllRecords(updatedRecs);
    saveTelepathyRecords(updatedRecs);

    // Update per-character statistics
    const prevStats = charStatsMap[activeChar.id] || {
      characterId: activeChar.id,
      characterName: activeChar.name,
      characterAvatar: activeChar.avatar,
      totalQuestions: 0,
      totalMatches: 0,
      matchRate: 0,
      currentStreak: 0,
      maxStreak: 0,
      highestScore: 0,
      totalGamesPlayed: 0,
    };

    const newTotalQ = prevStats.totalQuestions + totalR;
    const newTotalM = prevStats.totalMatches + matchCount;
    const overallRate = newTotalQ > 0 ? Math.round((newTotalM / newTotalQ) * 100) : 0;
    const updatedCharStats: TelepathyCharacterStats = {
      ...prevStats,
      characterName: activeChar.name,
      characterAvatar: activeChar.avatar,
      totalQuestions: newTotalQ,
      totalMatches: newTotalM,
      matchRate: overallRate,
      currentStreak,
      maxStreak: Math.max(prevStats.maxStreak, maxStreakInGame),
      highestScore: Math.max(prevStats.highestScore, finalRate),
      totalGamesPlayed: prevStats.totalGamesPlayed + 1,
      lastPlayedTimestamp: Date.now(),
    };

    const nextCharStatsMap = {
      ...charStatsMap,
      [activeChar.id]: updatedCharStats,
    };
    setCharStatsMap(nextCharStatsMap);
    saveTelepathyCharStats(nextCharStatsMap);

    // If long-term memory write is allowed by user, generate memory item
    if (allowMemoryWrite) {
      setIsGeneratingMemory(true);
      try {
        const memText = await generateTelepathyMemory(
          activeChar,
          newRecord,
          userProfile,
          apiConfig
        );
        setSavedMemoryText(memText);

        // Update character's memories array
        const currentMems = activeChar.memories || [];
        if (!currentMems.includes(memText)) {
          const updatedCharList = characters.map((c) =>
            c.id === activeChar.id
              ? { ...c, memories: [memText, ...currentMems].slice(0, 30) }
              : c
          );
          saveCharacters(updatedCharList);
        }
      } catch (err) {
        console.warn('Auto memory sync error:', err);
      } finally {
        setIsGeneratingMemory(false);
      }
    }

    if (onGameFinish) {
      onGameFinish(newRecord);
    }
  };

  // Filter records for active character
  const charSpecificRecords = allRecords.filter((r) => r.characterId === selectedCharId);

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={gameState === 'lobby' ? onBack : () => setGameState('lobby')}
          className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{gameState === 'lobby' ? '游戏中心' : '退出本局'}</span>
        </button>

        <div className="flex items-center gap-1.5 font-bold text-sm tracking-tight text-zinc-100">
          <Heart className="w-4 h-4 text-rose-500 fill-rose-500 animate-pulse" />
          <span>心有灵犀 (默契大考验)</span>
        </div>

        <button
          onClick={toggleSound}
          className="p-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white transition"
          title={soundEnabled ? '静音音效' : '开启音效'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-rose-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
        </button>
      </div>

      {/* ===================== VIEW 1: LOBBY (游戏大厅与角色配置) ===================== */}
      {gameState === 'lobby' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Hero Banner Card */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-rose-950/90 via-zinc-900 to-pink-950/60 border border-rose-500/50 shadow-2xl relative overflow-hidden space-y-3">
            <div className="absolute -right-4 -top-4 w-32 h-32 bg-rose-500/15 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white text-xl shadow-lg shadow-rose-500/25">
                  ❤️
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-100 flex items-center gap-1.5">
                    <span>心有灵犀 · 默契测试</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-300 font-mono text-[9px] border border-rose-500/40 animate-pulse">
                      NEW
                    </span>
                  </h3>
                  <p className="text-[10px] text-rose-300/80 font-medium">
                    AI推测玩家选择 · 测算灵魂默契度与羁绊
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className={`text-[11px] font-extrabold block ${activeCharAffinity.color}`}>
                  {activeCharStats.matchRate}% 默契
                </span>
                <span className="text-[9px] text-zinc-400 font-medium">
                  {activeCharAffinity.title}
                </span>
              </div>
            </div>

            {/* Core Game Rules Pill */}
            <div className="p-2.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-center gap-2 text-rose-200 text-[10px]">
              <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                向你和AI提出同一个问题。双方秘密选择后同时公布，答案一致则获得“默契 +1”！
              </span>
            </div>

            {/* Sub Tabs: Play / Records */}
            <div className="flex bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800 text-[11px]">
              <button
                onClick={() => setLobbySubTab('play')}
                className={`flex-1 py-1.5 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
                  lobbySubTab === 'play'
                    ? 'bg-rose-500 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>开局挑战</span>
              </button>
              <button
                onClick={() => setLobbySubTab('records')}
                className={`flex-1 py-1.5 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
                  lobbySubTab === 'records'
                    ? 'bg-rose-500 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>专属默契榜 & 历史 ({charSpecificRecords.length})</span>
              </button>
            </div>
          </div>

          {lobbySubTab === 'play' ? (
            <>
              {/* Character Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 text-[10px] px-1 font-semibold">
                  <span>选择默契测试 AI 对手 ({safeCharacters.length} 位角色)</span>
                  <span className="text-rose-400">{activeChar.name}</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {safeCharacters.map((char) => {
                    const cStat = charStatsMap[char.id];
                    const isSelected = selectedCharId === char.id;
                    return (
                      <button
                        key={char.id}
                        onClick={() => setSelectedCharId(char.id)}
                        className={`p-2 rounded-2xl border flex items-center gap-2 shrink-0 transition ${
                          isSelected
                            ? 'bg-rose-500/20 border-rose-500 text-white shadow-sm ring-1 ring-rose-500/50'
                            : 'bg-zinc-800/60 border-zinc-750 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <img
                          src={char.avatar || FALLBACK_TELEPATHY_CHAR.avatar}
                          alt={char.name || 'AI'}
                          className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                        />
                        <div className="text-left">
                          <div className="font-semibold text-xs leading-tight text-zinc-200 flex items-center gap-1">
                            <span>{char.name}</span>
                            {cStat && cStat.matchRate > 0 && (
                              <span className="text-[9px] text-rose-400 font-mono">
                                {cStat.matchRate}%
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-zinc-400 truncate max-w-[85px]">
                            {char.tags?.[0] || 'AI伙伴'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Character Affinity Card */}
              <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <img
                      src={activeChar.avatar}
                      alt={activeChar.name}
                      className="w-7 h-7 rounded-full object-cover border border-rose-500/40"
                    />
                    <div>
                      <span className="font-bold text-zinc-200">{activeChar.name}</span>
                      <span className="text-[10px] text-zinc-400 ml-1.5">当前默契羁绊</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${activeCharAffinity.bg} ${activeCharAffinity.color} border border-current/30`}>
                    {activeCharAffinity.title}
                  </span>
                </div>

                {/* Persona preview */}
                <p className="text-[10px] text-zinc-300 bg-zinc-800/60 p-2 rounded-xl leading-relaxed">
                  <span className="text-zinc-400 font-medium">人设特征：</span>
                  {activeChar.persona}
                </p>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] pt-0.5">
                  <div className="p-1.5 rounded-xl bg-zinc-800/80">
                    <div className="text-zinc-400 text-[9px]">答题总数</div>
                    <div className="font-bold text-zinc-200">{activeCharStats.totalQuestions} 题</div>
                  </div>
                  <div className="p-1.5 rounded-xl bg-zinc-800/80">
                    <div className="text-zinc-400 text-[9px]">猜中次数</div>
                    <div className="font-bold text-emerald-400">{activeCharStats.totalMatches} 次</div>
                  </div>
                  <div className="p-1.5 rounded-xl bg-zinc-800/80">
                    <div className="text-zinc-400 text-[9px]">最高连中</div>
                    <div className="font-bold text-amber-400">{activeCharStats.maxStreak} 次</div>
                  </div>
                  <div className="p-1.5 rounded-xl bg-zinc-800/80">
                    <div className="text-zinc-400 text-[9px]">单局最高分</div>
                    <div className="font-bold text-rose-400">{activeCharStats.highestScore}%</div>
                  </div>
                </div>
              </div>

              {/* Game Mode Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400 block px-1">
                  选择挑战题数模式
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setGameMode('single')}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                      gameMode === 'single'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-xl bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">
                      1
                    </div>
                    <div>
                      <div className="font-bold text-[11px]">单局快问</div>
                      <div className="text-[9px] text-zinc-400">1题快速测验</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setGameMode('5_rounds')}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                      gameMode === '5_rounds'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-xl bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">
                      5
                    </div>
                    <div>
                      <div className="font-bold text-[11px]">5题默契赛</div>
                      <div className="text-[9px] text-rose-300 font-medium">推荐体验 · 标准赛</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setGameMode('10_rounds')}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                      gameMode === '10_rounds'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-xl bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">
                      10
                    </div>
                    <div>
                      <div className="font-bold text-[11px]">10题深度考验</div>
                      <div className="text-[9px] text-zinc-400">全方位全分类解析</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setGameMode('endless')}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                      gameMode === 'endless'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-xl bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">
                      ∞
                    </div>
                    <div>
                      <div className="font-bold text-[11px]">无限题挑战</div>
                      <div className="text-[9px] text-zinc-400">持续答题冲刺连中</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Long-term Memory Permission Switch */}
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <div className="text-[11px] font-bold text-zinc-200 flex items-center gap-1">
                      <span>允许记录游戏专属长期记忆</span>
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div className="text-[9px] text-zinc-400 leading-snug">
                      游戏结束后，AI将总结玩家在此局中的喜好习惯并记录在角色记忆中
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowMemoryWrite}
                  onChange={(e) => setAllowMemoryWrite(e.target.checked)}
                  className="w-4 h-4 accent-rose-500 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Start Button */}
              <div className="pt-2">
                <button
                  onClick={handleStartGame}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-600 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-rose-500/25 transition active:scale-98"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>与 {activeChar.name} 开启心有灵犀大考验</span>
                </button>
              </div>
            </>
          ) : (
            /* LOBBY SUBTAB: RECORDS & AI AFFINITY LEADERBOARD */
            <div className="space-y-4">
              {/* All Characters Affinity Comparison */}
              <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                <h4 className="font-bold text-xs text-zinc-200 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>各 AI 角色专属默契榜单</span>
                </h4>
                <div className="space-y-2">
                  {characters.map((char) => {
                    const st = charStatsMap[char.id] || {
                      characterId: char.id,
                      characterName: char.name,
                      characterAvatar: char.avatar,
                      totalQuestions: 0,
                      totalMatches: 0,
                      matchRate: 0,
                      currentStreak: 0,
                      maxStreak: 0,
                      highestScore: 0,
                      totalGamesPlayed: 0,
                    };
                    const aff = getAffinityLevel(st.matchRate);
                    return (
                      <div
                        key={char.id}
                        onClick={() => setSelectedCharId(char.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          selectedCharId === char.id
                            ? 'bg-rose-500/15 border-rose-500/50'
                            : 'bg-zinc-800/40 border-zinc-800 hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={char.avatar}
                            alt={char.name}
                            className="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-zinc-200 truncate flex items-center gap-1.5">
                              <span>{char.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${aff.bg} ${aff.color}`}>
                                {aff.title}
                              </span>
                            </div>
                            <div className="text-[9px] text-zinc-400">
                              共答 {st.totalQuestions} 题 · 最高连中 {st.maxStreak}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className={`font-extrabold text-sm font-mono ${aff.color}`}>
                            {st.matchRate}%
                          </div>
                          <div className="text-[9px] text-zinc-500">综合默契度</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Match History List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 px-1">
                  <History className="w-3.5 h-3.5 text-rose-400" />
                  <span>与 {activeChar.name} 的测试对战历史 ({charSpecificRecords.length} 局)</span>
                </h4>

                {charSpecificRecords.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 bg-zinc-900/60 rounded-2xl border border-zinc-800">
                    暂无与 {activeChar.name} 的心有灵犀对战记录，快去开一局吧！
                  </div>
                ) : (
                  charSpecificRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">
                          {new Date(rec.timestamp).toLocaleDateString()} {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold">
                          {rec.affinityLevelTitle}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-200">
                            猜中 {rec.matchCount} / {rec.totalRounds} 题
                          </span>
                          <span className="text-[10px] text-amber-400 font-medium">
                            最高连中 {rec.maxStreak}
                          </span>
                        </div>
                        <div className="font-extrabold text-rose-400 font-mono text-sm">
                          {rec.matchRate}%
                        </div>
                      </div>

                      {/* Memory generated if any */}
                      {rec.generatedMemory && (
                        <div className="text-[10px] text-purple-300/90 bg-purple-950/30 border border-purple-500/30 p-2 rounded-xl flex items-start gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                          <span>已沉淀记忆：{rec.generatedMemory}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== VIEW 2: ACTIVE QUESTION / PLAYING ===================== */}
      {gameState === 'playing' && currentQuestion && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between space-y-3">
          {/* Top Progress & Streak Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                  第 {currentRoundIdx + 1} / {questions.length} 题
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 text-[10px]">
                  {currentQuestion.categoryLabel}
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs">
                <div className="flex items-center gap-1 text-amber-400">
                  <Flame className="w-3.5 h-3.5" />
                  <span>连中 {currentStreak}</span>
                </div>
                <div className="text-rose-400 font-bold">
                  默契分: {matchCount}
                </div>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-300"
                style={{
                  width: `${((currentRoundIdx + 1) / questions.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Question Display Card */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-zinc-400 text-[10px]">
              <HelpCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>请凭直觉选择你的真实想法：</span>
            </div>
            <h3 className="font-extrabold text-base text-zinc-100 leading-snug">
              {currentQuestion.question}
            </h3>
          </div>

          {/* Options Grid */}
          <div className="space-y-2.5">
            <div className="text-[10px] text-zinc-400 px-1 font-semibold flex items-center justify-between">
              <span>点击下方选项提交你的答案</span>
              <span className="text-zinc-500">{activeChar.name} 也在同时推测...</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {currentQuestion.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handlePlayerChoose(opt.id)}
                  disabled={isAiThinking}
                  className="w-full p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-rose-500/50 text-left flex items-center justify-between gap-3 transition active:scale-98 group shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-zinc-800 group-hover:bg-rose-500/20 text-zinc-200 group-hover:text-rose-300 font-extrabold text-xs flex items-center justify-center shrink-0 border border-zinc-700/60">
                      {opt.icon || opt.id}
                    </span>
                    <span className="font-bold text-xs text-zinc-200 group-hover:text-white truncate">
                      {opt.text}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-rose-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Opponent Status */}
          <div className="p-2.5 rounded-2xl bg-zinc-900/60 border border-zinc-850 flex items-center gap-2.5 text-zinc-400 text-[10px]">
            <img
              src={activeChar.avatar}
              alt={activeChar.name}
              className="w-6 h-6 rounded-full object-cover border border-rose-500/30"
            />
            <span className="truncate">
              {activeChar.name} 正在结合你的人设和记忆进行默契推演...
            </span>
          </div>
        </div>
      )}

      {/* ===================== VIEW 3: REVEALING & MATCH CONFIRMATION ===================== */}
      {gameState === 'revealing' && currentQuestion && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-2xl shadow-rose-500/40 relative"
          >
            <Sparkles className="w-10 h-10 animate-spin" style={{ animationDuration: '3s' }} />
          </motion.div>

          <div className="space-y-2">
            <h3 className="font-extrabold text-lg text-zinc-100">
              双方答案锁定，正在同步揭晓……
            </h3>
            <p className="text-xs text-rose-300/80">
              来看看你和 {activeChar.name} 是否心有灵犀！
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs font-bold pt-2">
            <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">
              {userProfile.name}：已就绪
            </div>
            <Heart className="w-4 h-4 text-rose-500 animate-pulse fill-rose-500" />
            <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">
              {activeChar.name}：已推断
            </div>
          </div>
        </div>
      )}

      {/* ===================== VIEW 4: ROUND RESULT & AI REACTION ===================== */}
      {gameState === 'round_result' && lastRoundResult && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            {/* Round question display */}
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
              <span className="text-[10px] text-zinc-400 block mb-1">
                第 {lastRoundResult.roundIndex} 题 · {lastRoundResult.question.categoryLabel}
              </span>
              <h4 className="font-bold text-xs text-zinc-200">
                {lastRoundResult.question.question}
              </h4>
            </div>

            {/* Both choices reveal card */}
            <div className={`p-4 rounded-3xl border shadow-xl relative overflow-hidden space-y-3 ${
              lastRoundResult.isMatch
                ? 'bg-gradient-to-br from-rose-950/80 via-zinc-900 to-pink-950/60 border-rose-500/60'
                : 'bg-zinc-900 border-zinc-800'
            }`}>
              {/* Match Header Badge */}
              <div className="flex items-center justify-center gap-2">
                {lastRoundResult.isMatch ? (
                  <div className="flex items-center gap-1.5 text-rose-400 font-extrabold text-sm animate-bounce">
                    <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
                    <span>❤️ 答案一致！默契 +1</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-zinc-400 font-bold text-xs">
                    <XCircle className="w-4 h-4 text-zinc-500" />
                    <span>这次没猜中哦~</span>
                  </div>
                )}
              </div>

              {/* Side by side comparison */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {/* Player Choice */}
                <div className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 space-y-1 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-zinc-400 text-[10px]">
                    <User className="w-3 h-3 text-rose-400" />
                    <span>{userProfile.name} (你)</span>
                  </div>
                  <div className="font-extrabold text-sm text-zinc-100 pt-1">
                    {lastRoundResult.playerChoiceText}
                  </div>
                </div>

                {/* AI Choice */}
                <div className={`p-3 rounded-2xl border space-y-1 text-center ${
                  lastRoundResult.isMatch
                    ? 'bg-rose-500/20 border-rose-500/60'
                    : 'bg-zinc-800/80 border-zinc-700/60'
                }`}>
                  <div className="flex items-center justify-center gap-1.5 text-zinc-400 text-[10px]">
                    <Bot className="w-3 h-3 text-rose-400" />
                    <span>{activeChar.name}</span>
                  </div>
                  <div className="font-extrabold text-sm text-zinc-100 pt-1">
                    {lastRoundResult.aiChoiceText}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Persona Reaction Bubble */}
            <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2">
                <img
                  src={activeChar.avatar}
                  alt={activeChar.name}
                  className="w-7 h-7 rounded-full object-cover border border-rose-500/40"
                />
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-zinc-200">{activeChar.name}</span>
                  <span className="text-[9px] text-zinc-400">的心声与反应</span>
                </div>
              </div>

              <p className="text-xs text-rose-200/90 leading-relaxed pl-1 italic">
                “{lastRoundResult.aiReaction}”
              </p>
            </div>
          </div>

          {/* Next Button */}
          <div className="pt-2">
            <button
              onClick={handleNextRound}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 transition active:scale-98"
            >
              <span>继续下一题</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================== VIEW 5: GAME OVER / FINAL SUMMARY ===================== */}
      {gameState === 'game_over' && completedRecord && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            {/* Victory Score Banner */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-rose-950 via-zinc-900 to-pink-950 border border-rose-500/50 shadow-2xl text-center space-y-3 relative overflow-hidden">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white text-2xl mx-auto shadow-lg shadow-rose-500/30">
                ❤️
              </div>

              <div>
                <h3 className="font-black text-lg text-zinc-100">
                  心有灵犀 · 默契测试完成
                </h3>
                <p className="text-xs text-rose-300 font-medium">
                  你与 {activeChar.name} 的默契评估报告
                </p>
              </div>

              {/* Main Score Big Display */}
              <div className="py-2">
                <div className="text-4xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-pink-400 to-amber-300">
                  {completedRecord.matchRate}%
                </div>
                <div className="text-xs font-bold text-rose-300 mt-1">
                  默契等级：{completedRecord.affinityLevelTitle}
                </div>
              </div>

              {/* Stats Breakdown Grid */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs pt-1">
                <div className="p-2 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">总题数</div>
                  <div className="font-extrabold text-zinc-200">{completedRecord.totalRounds}</div>
                </div>
                <div className="p-2 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] text-emerald-400">猜中次数</div>
                  <div className="font-extrabold text-emerald-400">{completedRecord.matchCount}</div>
                </div>
                <div className="p-2 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] text-amber-400">本局最高连中</div>
                  <div className="font-extrabold text-amber-400">{completedRecord.maxStreak}</div>
                </div>
                <div className="p-2 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] text-rose-400">历史最高分</div>
                  <div className="font-extrabold text-rose-400">{activeCharStats.highestScore}%</div>
                </div>
              </div>
            </div>

            {/* Memory Sync Status */}
            {savedMemoryText && (
              <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/40 space-y-1.5">
                <div className="flex items-center gap-1.5 text-purple-300 text-xs font-bold">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <span>已自动沉淀进 {activeChar.name} 的长期记忆</span>
                </div>
                <p className="text-[10px] text-purple-200 leading-relaxed">
                  “{savedMemoryText}”
                </p>
              </div>
            )}

            {/* Round breakdown accordion preview */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-zinc-400 px-1">
                各题默契详情回顾 ({completedRecord.rounds.length} 题)
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {completedRecord.rounds.map((r, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-[10px] text-zinc-400 truncate">
                        {r.question.question}
                      </div>
                      <div className="text-[11px] font-medium text-zinc-200">
                        {userProfile.name}: {r.playerChoiceText} · {activeChar.name}: {r.aiChoiceText}
                      </div>
                    </div>
                    {r.isMatch ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold text-[10px] shrink-0">
                        +1 默契
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[10px] shrink-0">
                        未一致
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleStartGame}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-98"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>与 {activeChar.name} 再玩一次</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setGameState('lobby')}
                className="py-2.5 px-3 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <User className="w-3.5 h-3.5" />
                <span>换一个 AI 挑战</span>
              </button>

              <button
                onClick={onBack}
                className="py-2.5 px-3 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回游戏主页</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
