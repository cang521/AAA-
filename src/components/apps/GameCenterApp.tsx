import React, { useState, useEffect } from 'react';
import {
  AiCharacter,
  ApiConfig,
  ApiLog,
  GomokuRecord,
  GomokuGameMode,
  GomokuDifficulty,
  TicTacToeRecord,
  TicTacToeGameMode,
  TicTacToeDifficulty,
  RpsRecord,
  RpsGameMode,
  RpsStats,
  TelepathyRecord,
  TelepathyGameMode,
  TelepathyCharacterStats,
} from '../../types';
import {
  loadGomokuRecords,
  saveGomokuRecords,
  loadTicTacToeRecords,
  saveTicTacToeRecords,
  loadRpsRecords,
  saveRpsRecords,
  loadRpsStats,
  loadTelepathyRecords,
  saveTelepathyRecords,
  loadTelepathyCharStats,
} from '../../lib/storage';
import { GomokuGame } from './gomoku/GomokuGame';
import { TicTacToeGame } from './tictactoe/TicTacToeGame';
import { RpsGame } from './rps/RpsGame';
import { TelepathyGame } from './telepathy/TelepathyGame';
import { getAffinityLevel } from './telepathy/telepathyLogic';
import {
  ArrowLeft,
  Gamepad2,
  Trophy,
  Sparkles,
  Flame,
  Star,
  Clock,
  Swords,
  Play,
  Award,
  Users,
  ChevronRight,
  UserCheck,
  Bot,
  User,
  History,
  Trash2,
  Zap,
  Grid3X3,
  X as XIcon,
  HelpCircle,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  SlidersHorizontal,
  Heart,
  Brain,
} from 'lucide-react';

const FALLBACK_AI_CHARACTER: AiCharacter = {
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

interface GameCenterAppProps {
  onBackToLauncher: () => void;
  characters: AiCharacter[];
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}

export const GameCenterApp: React.FC<GameCenterAppProps> = ({
  onBackToLauncher,
  characters,
  apiConfig,
  onAddApiLog,
}) => {
  const [activeTab, setActiveTab] = useState<'featured' | 'records' | 'achievements'>('featured');
  const [recordsTabGame, setRecordsTabGame] = useState<'telepathy' | 'rps' | 'tictactoe' | 'gomoku'>('telepathy');

  // Safe Character collection guarantee
  const safeCharacters =
    Array.isArray(characters) && characters.length > 0
      ? characters.filter(Boolean)
      : [FALLBACK_AI_CHARACTER];

  // Stored Records
  const [records, setRecords] = useState<GomokuRecord[]>(() => loadGomokuRecords());
  const [tttRecords, setTttRecords] = useState<TicTacToeRecord[]>(() => loadTicTacToeRecords());
  const [rpsRecords, setRpsRecords] = useState<RpsRecord[]>(() => loadRpsRecords());
  const [rpsStats, setRpsStats] = useState<RpsStats>(() => loadRpsStats());
  const [telepathyRecords, setTelepathyRecords] = useState<TelepathyRecord[]>(() => loadTelepathyRecords());
  const [telepathyCharStats, setTelepathyCharStats] = useState<Record<string, TelepathyCharacterStats>>(() => loadTelepathyCharStats());

  // Active game view controller
  const [playingGameId, setPlayingGameId] = useState<'telepathy' | 'gomoku' | 'tictactoe' | 'rps' | null>(null);

  // Pre-game config for Telepathy (心有灵犀)
  const [selectedTelepathyOpponentId, setSelectedTelepathyOpponentId] = useState<string>(
    safeCharacters[0]?.id || 'char_1'
  );
  const [selectedTelepathyMode, setSelectedTelepathyMode] = useState<TelepathyGameMode>('5_rounds');

  // Pre-game config for Gomoku
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>(
    safeCharacters[0]?.id || 'char_1'
  );
  const [selectedMode, setSelectedMode] = useState<GomokuGameMode>('pve');
  const [selectedDifficulty, setSelectedDifficulty] = useState<GomokuDifficulty>('normal');

  // Pre-game config for Tic-Tac-Toe
  const [selectedTttOpponentId, setSelectedTttOpponentId] = useState<string>(
    safeCharacters[0]?.id || 'char_1'
  );
  const [selectedTttMode, setSelectedTttMode] = useState<TicTacToeGameMode>('pve');
  const [selectedTttDifficulty, setSelectedTttDifficulty] = useState<TicTacToeDifficulty>('normal');

  // Pre-game config for RPS
  const [selectedRpsOpponentId, setSelectedRpsOpponentId] = useState<string>(
    safeCharacters[0]?.id || 'char_1'
  );
  const [selectedRpsMode, setSelectedRpsMode] = useState<RpsGameMode>('pve');

  // Collapse state for cards in featured tab
  const [collapsedCards, setCollapsedCards] = useState<{
    telepathy: boolean;
    rps: boolean;
    tictactoe: boolean;
    gomoku: boolean;
  }>({
    telepathy: false,
    rps: false,
    tictactoe: false,
    gomoku: false,
  });

  const toggleCollapse = (gameId: 'telepathy' | 'rps' | 'tictactoe' | 'gomoku') => {
    setCollapsedCards((prev) => ({ ...prev, [gameId]: !prev[gameId] }));
  };

  const isAllCollapsed =
    collapsedCards.telepathy && collapsedCards.rps && collapsedCards.tictactoe && collapsedCards.gomoku;
  const toggleAllCollapse = () => {
    const nextVal = !isAllCollapsed;
    setCollapsedCards({
      telepathy: nextVal,
      rps: nextVal,
      tictactoe: nextVal,
      gomoku: nextVal,
    });
  };

  // Opponent Character Objects safely resolved
  const currentOpponent =
    safeCharacters.find((c) => c?.id === selectedOpponentId) || safeCharacters[0] || FALLBACK_AI_CHARACTER;
  const currentTttOpponent =
    safeCharacters.find((c) => c?.id === selectedTttOpponentId) || safeCharacters[0] || FALLBACK_AI_CHARACTER;
  const currentRpsOpponent =
    safeCharacters.find((c) => c?.id === selectedRpsOpponentId) || safeCharacters[0] || FALLBACK_AI_CHARACTER;
  const currentTelepathyOpponent =
    safeCharacters.find((c) => c?.id === selectedTelepathyOpponentId) || safeCharacters[0] || FALLBACK_AI_CHARACTER;

  // Save new Telepathy game record handler
  const handleTelepathyGameFinish = (newRecord: TelepathyRecord) => {
    const updated = [newRecord, ...telepathyRecords];
    setTelepathyRecords(updated);
    saveTelepathyRecords(updated);
    setTelepathyCharStats(loadTelepathyCharStats());
  };

  // Save new Gomoku game record handler
  const handleGameFinish = (newRecord: GomokuRecord) => {
    const updated = [newRecord, ...records];
    setRecords(updated);
    saveGomokuRecords(updated);
  };

  // Save new TicTacToe game record handler
  const handleTttGameFinish = (newRecord: TicTacToeRecord) => {
    const updated = [newRecord, ...tttRecords];
    setTttRecords(updated);
    saveTicTacToeRecords(updated);
  };

  // Save new RPS game record handler
  const handleRpsGameFinish = (newRecord: RpsRecord) => {
    const updated = [newRecord, ...rpsRecords];
    setRpsRecords(updated);
    saveRpsRecords(updated);
    setRpsStats(loadRpsStats());
  };

  // Clear Telepathy records
  const handleClearTelepathyRecords = () => {
    if (window.confirm('确定要清空所有心有灵犀对战历史记录吗？')) {
      setTelepathyRecords([]);
      saveTelepathyRecords([]);
    }
  };

  // Clear Gomoku records
  const handleClearRecords = () => {
    if (window.confirm('确定要清空所有五子棋对战历史记录吗？')) {
      setRecords([]);
      saveGomokuRecords([]);
    }
  };

  // Clear TicTacToe records
  const handleClearTttRecords = () => {
    if (window.confirm('确定要清空所有井字棋对战历史记录吗？')) {
      setTttRecords([]);
      saveTicTacToeRecords([]);
    }
  };

  // Clear RPS records
  const handleClearRpsRecords = () => {
    if (window.confirm('确定要清空所有猜拳对战历史记录吗？')) {
      setRpsRecords([]);
      saveRpsRecords([]);
    }
  };

  // Statistics calculation for Gomoku
  const pveRecords = records.filter((r) => r.mode === 'pve');
  const totalPveGames = pveRecords.length;
  const playerWins = pveRecords.filter((r) => r.result === 'win').length;
  const aiWins = pveRecords.filter((r) => r.result === 'loss').length;
  const draws = pveRecords.filter((r) => r.result === 'draw').length;
  const winRate = totalPveGames > 0 ? Math.round((playerWins / totalPveGames) * 100) : 0;

  // Statistics calculation for TicTacToe
  const pveTttRecords = tttRecords.filter((r) => r.mode === 'pve');
  const totalPveTttGames = pveTttRecords.length;
  const playerTttWins = pveTttRecords.filter((r) => r.result === 'win').length;
  const aiTttWins = pveTttRecords.filter((r) => r.result === 'loss').length;
  const tttDraws = pveTttRecords.filter((r) => r.result === 'draw').length;
  const tttWinRate = totalPveTttGames > 0 ? Math.round((playerTttWins / totalPveTttGames) * 100) : 0;

  // Statistics calculation for RPS
  const pveRpsRecords = rpsRecords.filter((r) => r.mode === 'pve');
  const totalPveRpsGames = pveRpsRecords.length;
  const playerRpsWins = pveRpsRecords.filter((r) => r.result === 'win').length;
  const aiRpsWins = pveRpsRecords.filter((r) => r.result === 'loss').length;
  const rpsDraws = pveRpsRecords.filter((r) => r.result === 'draw').length;
  const rpsWinRate = totalPveRpsGames > 0 ? Math.round((playerRpsWins / totalPveRpsGames) * 100) : 0;

  // Statistics calculation for Telepathy
  const totalTelepathyGames = telepathyRecords.length;
  const totalTelepathyQuestions = telepathyRecords.reduce((acc, r) => acc + r.totalRounds, 0);
  const totalTelepathyMatches = telepathyRecords.reduce((acc, r) => acc + r.matchCount, 0);
  const overallTelepathyRate =
    totalTelepathyQuestions > 0
      ? Math.round((totalTelepathyMatches / totalTelepathyQuestions) * 100)
      : 0;

  // Render Telepathy Active Game View
  if (playingGameId === 'telepathy') {
    return (
      <TelepathyGame
        onBack={() => setPlayingGameId(null)}
        characters={safeCharacters}
        apiConfig={apiConfig}
        onAddApiLog={onAddApiLog}
        onGameFinish={handleTelepathyGameFinish}
        initialOpponentId={selectedTelepathyOpponentId}
        initialMode={selectedTelepathyMode}
      />
    );
  }

  // Render RPS Active Game View
  if (playingGameId === 'rps') {
    return (
      <RpsGame
        onBack={() => setPlayingGameId(null)}
        characters={safeCharacters}
        apiConfig={apiConfig}
        onAddApiLog={onAddApiLog}
        onGameFinish={handleRpsGameFinish}
        initialOpponentId={selectedRpsOpponentId}
        initialMode={selectedRpsMode}
      />
    );
  }

  // Render Gomoku Active Game View
  if (playingGameId === 'gomoku') {
    return (
      <GomokuGame
        onBack={() => setPlayingGameId(null)}
        characters={safeCharacters}
        apiConfig={apiConfig}
        onAddApiLog={onAddApiLog}
        onGameFinish={handleGameFinish}
        initialOpponentId={selectedOpponentId}
        initialMode={selectedMode}
      />
    );
  }

  // Render TicTacToe Active Game View
  if (playingGameId === 'tictactoe') {
    return (
      <TicTacToeGame
        onBack={() => setPlayingGameId(null)}
        characters={safeCharacters}
        apiConfig={apiConfig}
        onAddApiLog={onAddApiLog}
        onGameFinish={handleTttGameFinish}
        initialOpponentId={selectedTttOpponentId}
        initialMode={selectedTttMode}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>桌面</span>
        </button>

        <div className="flex items-center gap-1.5 font-bold text-sm tracking-tight text-zinc-100">
          <Gamepad2 className="w-4 h-4 text-rose-400" />
          <span>游戏中心 (Game Center)</span>
        </div>

        <div className="w-8" />
      </div>

      {/* Navigation Tabs */}
      <div className="px-4 pt-3 pb-2 bg-zinc-900/60 border-b border-zinc-800/80 flex items-center gap-2 shrink-0">
        <button
          onClick={() => setActiveTab('featured')}
          className={`flex-1 py-1.5 text-xs rounded-xl font-semibold transition flex items-center justify-center gap-1 ${
            activeTab === 'featured'
              ? 'bg-rose-500 text-white shadow-md'
              : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>精选大厅</span>
        </button>

        <button
          onClick={() => setActiveTab('records')}
          className={`flex-1 py-1.5 text-xs rounded-xl font-semibold transition flex items-center justify-center gap-1 ${
            activeTab === 'records'
              ? 'bg-rose-500 text-white shadow-md'
              : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>个人战绩</span>
        </button>

        <button
          onClick={() => setActiveTab('achievements')}
          className={`flex-1 py-1.5 text-xs rounded-xl font-semibold transition flex items-center justify-center gap-1 ${
            activeTab === 'achievements'
              ? 'bg-rose-500 text-white shadow-md'
              : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>成就榜</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {activeTab === 'featured' && (
          <>
            {/* Featured Section Header with Toggle All Button */}
            <div className="flex items-center justify-between px-1 text-zinc-400">
              <span className="text-[11px] font-semibold flex items-center gap-1.5 text-zinc-300">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>热门对局小游戏 ({safeCharacters.length} 位角色支持)</span>
              </span>
              <button
                onClick={toggleAllCollapse}
                className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 transition"
              >
                <ChevronsUpDown className="w-3 h-3" />
                <span>{isAllCollapsed ? '展开全部' : '折叠全部'}</span>
              </button>
            </div>

            {/* GAME 0: TELEPATHY (心有灵犀 · 默契大考验) */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-rose-950 via-zinc-900 to-pink-950/70 border border-rose-500/60 shadow-2xl space-y-3.5 relative overflow-hidden transition-all duration-300 ring-1 ring-rose-500/30">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-rose-500/20 rounded-full blur-2xl pointer-events-none" />

              {/* Title & Stats & Collapse Toggle */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white text-xl shadow-lg shadow-rose-500/30 shrink-0">
                    ❤️
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm text-zinc-100 flex items-center gap-1.5">
                      <span>心有灵犀 (默契大考验)</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-300 font-mono text-[9px] border border-rose-500/40 animate-pulse shrink-0">
                        NEW HOT
                      </span>
                    </h3>
                    <p className="text-[10px] text-rose-300/90 font-medium truncate">
                      AI结合人设记忆推测玩家选择 · 测算灵魂默契度
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-rose-400 block">{overallTelepathyRate}% 默契</span>
                    <span className="text-[9px] text-zinc-500">{totalTelepathyGames} 局已测</span>
                  </div>
                  <button
                    onClick={() => toggleCollapse('telepathy')}
                    className="flex items-center gap-0.5 text-[10px] font-medium text-rose-300 hover:text-rose-200 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 px-2 py-1 rounded-xl transition"
                    title={collapsedCards.telepathy ? '展开详细设置' : '折叠为精简卡片'}
                  >
                    <span>{collapsedCards.telepathy ? '展开' : '折叠'}</span>
                    {collapsedCards.telepathy ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* COLLAPSED VIEW (精简版) */}
              {collapsedCards.telepathy ? (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-rose-500/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentTelepathyOpponent.avatar}
                      alt={currentTelepathyOpponent.name}
                      className="w-6 h-6 rounded-full object-cover border border-rose-500/40"
                    />
                    <span className="text-[11px] text-zinc-300 font-medium truncate">
                      测试AI: {currentTelepathyOpponent.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-zinc-800 text-rose-300 text-[9px] shrink-0 font-mono">
                      {selectedTelepathyMode === 'single' ? '1题快测' : selectedTelepathyMode === '5_rounds' ? '5题标准' : selectedTelepathyMode === '10_rounds' ? '10题深度' : '无限题'}
                    </span>
                  </div>

                  <button
                    onClick={() => setPlayingGameId('telepathy')}
                    className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-md transition active:scale-95 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>快速开局</span>
                  </button>
                </div>
              ) : (
                /* EXPANDED DETAILED VIEW (详细版) */
                <>
                  {/* Rule Highlights */}
                  <div className="p-2.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="text-[10px] text-rose-200 leading-snug">
                      向你和AI提出同一个问题。双方秘密选择后同时公布，答案一致则获得“默契 +1”！
                    </span>
                  </div>

                  {/* Character Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-400 text-[10px] px-1 font-semibold">
                      <span>选择测试 AI 伙伴 ({safeCharacters.length} 位角色)</span>
                      <span className="text-rose-400">{currentTelepathyOpponent.name}</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {safeCharacters.map((char) => {
                        const isSelected = selectedTelepathyOpponentId === char.id;
                        const cStat = telepathyCharStats[char.id];
                        return (
                          <button
                            key={char.id}
                            onClick={() => setSelectedTelepathyOpponentId(char.id)}
                            className={`p-2 rounded-2xl border flex items-center gap-2 shrink-0 transition ${
                              isSelected
                                ? 'bg-rose-500/20 border-rose-500 text-white shadow-sm ring-1 ring-rose-500/50'
                                : 'bg-zinc-800/60 border-zinc-750 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <img
                              src={char.avatar || FALLBACK_AI_CHARACTER.avatar}
                              alt={char.name || 'AI'}
                              className="w-7 h-7 rounded-full object-cover border border-zinc-700"
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
                              <div className="text-[9px] text-zinc-400 truncate max-w-[70px]">
                                {char.tags?.[0] || 'AI伙伴'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-400 block">选择挑战题数模式</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSelectedTelepathyMode('single')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedTelepathyMode === 'single'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-lg bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">1</div>
                        <div>
                          <div className="font-bold text-[11px] leading-tight">单局快问</div>
                          <div className="text-[9px] text-zinc-400">1题快速测验</div>
                        </div>
                      </button>

                      <button
                        onClick={() => setSelectedTelepathyMode('5_rounds')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedTelepathyMode === '5_rounds'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-lg bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">5</div>
                        <div>
                          <div className="font-bold text-[11px] leading-tight">5题默契赛</div>
                          <div className="text-[9px] text-rose-300 font-medium">推荐标准测试</div>
                        </div>
                      </button>

                      <button
                        onClick={() => setSelectedTelepathyMode('10_rounds')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedTelepathyMode === '10_rounds'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-lg bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">10</div>
                        <div>
                          <div className="font-bold text-[11px] leading-tight">10题深度测试</div>
                          <div className="text-[9px] text-zinc-400">全方位喜好解析</div>
                        </div>
                      </button>

                      <button
                        onClick={() => setSelectedTelepathyMode('endless')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedTelepathyMode === 'endless'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-lg bg-rose-500/20 flex items-center justify-center font-bold text-rose-400 text-xs">∞</div>
                        <div>
                          <div className="font-bold text-[11px] leading-tight">无限题挑战</div>
                          <div className="text-[9px] text-zinc-400">持续答题冲刺连中</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Start Button */}
                  <button
                    onClick={() => setPlayingGameId('telepathy')}
                    className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-600 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 transition active:scale-98"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>与 {currentTelepathyOpponent.name} 开启默契大考验</span>
                  </button>
                </>
              )}
            </div>

            {/* GAME 1: ROCK-PAPER-SCISSORS (猜拳 - 石头剪刀布) */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-rose-950/90 via-zinc-900 to-amber-950/60 border border-rose-500/50 shadow-2xl space-y-3.5 relative overflow-hidden transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-28 h-28 bg-rose-500/15 rounded-full blur-2xl pointer-events-none" />

              {/* Title & Stats & Collapse Toggle */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white text-xl shadow-lg shadow-rose-500/20 shrink-0">
                    ✊
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm text-zinc-100 flex items-center gap-1.5">
                      <span>猜拳小游戏 (石头剪刀布)</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-300 font-mono text-[9px] border border-rose-500/40 animate-pulse shrink-0">
                        NEW
                      </span>
                    </h3>
                    <p className="text-[10px] text-rose-300/80 font-medium truncate">
                      输家回答赢家一个问题 · 角色深度真心话互动
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-rose-400 block">{rpsWinRate}% 胜率</span>
                    <span className="text-[9px] text-zinc-500">{totalPveRpsGames} 局已战</span>
                  </div>
                  <button
                    onClick={() => toggleCollapse('rps')}
                    className="flex items-center gap-0.5 text-[10px] font-medium text-rose-300 hover:text-rose-200 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 px-2 py-1 rounded-xl transition"
                    title={collapsedCards.rps ? '展开详细设置' : '折叠为精简卡片'}
                  >
                    <span>{collapsedCards.rps ? '展开' : '折叠'}</span>
                    {collapsedCards.rps ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* COLLAPSED VIEW (精简版) */}
              {collapsedCards.rps ? (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-rose-500/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentRpsOpponent.avatar}
                      alt={currentRpsOpponent.name}
                      className="w-6 h-6 rounded-full object-cover border border-rose-500/40"
                    />
                    <span className="text-[11px] text-zinc-300 font-medium truncate">
                      对手: {currentRpsOpponent.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-[9px] shrink-0">
                      {selectedRpsMode === 'pve' ? '玩家对决' : 'AI观战'}
                    </span>
                  </div>

                  <button
                    onClick={() => setPlayingGameId('rps')}
                    className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-md transition active:scale-95 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>快速开局</span>
                  </button>
                </div>
              ) : (
                /* EXPANDED DETAILED VIEW (详细版) */
                <>
                  {/* Special Rule Highlights */}
                  <div className="p-2.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="text-[10px] text-rose-200 leading-snug">
                      赢家可向输家提问任意真心话问题，输家AI或玩家必须按人设诚实回答！
                    </span>
                  </div>

                  {/* Game Mode Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-400 block">选择对局模式</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSelectedRpsMode('pve')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedRpsMode === 'pve'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <User className="w-4 h-4 text-rose-400 shrink-0" />
                        <div>
                          <div className="font-bold text-[11px] leading-tight">玩家 vs AI</div>
                          <div className="text-[9px] text-zinc-400">真人对决 · 赢家提问</div>
                        </div>
                      </button>

                      <button
                        onClick={() => setSelectedRpsMode('eve')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedRpsMode === 'eve'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Bot className="w-4 h-4 text-purple-400 shrink-0" />
                        <div>
                          <div className="font-bold text-[11px] leading-tight">AI vs AI 观战</div>
                          <div className="text-[9px] text-zinc-400">两名AI猜拳互动问答</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Opponent AI Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-400 block">
                      选择猜拳对手 ({safeCharacters.length} 位 AI 伙伴)
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {safeCharacters.map((char) => (
                        <button
                          key={char.id}
                          onClick={() => setSelectedRpsOpponentId(char.id)}
                          className={`p-2 rounded-2xl border flex items-center gap-2 shrink-0 transition ${
                            selectedRpsOpponentId === char.id
                              ? 'bg-rose-500/20 border-rose-500 text-white'
                              : 'bg-zinc-800/60 border-zinc-750 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <img
                            src={char.avatar || FALLBACK_AI_CHARACTER.avatar}
                            alt={char.name || 'AI'}
                            className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                          />
                          <div className="text-left">
                            <div className="font-semibold text-xs leading-tight text-zinc-200">{char.name}</div>
                            <div className="text-[9px] text-zinc-400 truncate max-w-[80px]">
                              {char.tags?.[0] || 'AI伙伴'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opponent Persona & Dialogue Preview */}
                  {currentRpsOpponent && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-rose-400" />
                          当前对手人设与互动风格
                        </span>
                        <span className="text-rose-400 font-mono font-medium">{currentRpsOpponent.name}</span>
                      </div>
                      <p className="text-zinc-300 text-[10px] leading-relaxed line-clamp-2">
                        {currentRpsOpponent.persona}
                      </p>
                    </div>
                  )}

                  {/* Start Button */}
                  <div className="pt-1">
                    <button
                      onClick={() => setPlayingGameId('rps')}
                      className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 transition active:scale-98"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>立即开局猜拳 (石头剪刀布)</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* GAME 2: TIC-TAC-TOE (井字棋 - 详细与可折叠) */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-cyan-950/80 via-zinc-900 to-blue-950/50 border border-cyan-500/40 shadow-xl space-y-3.5 relative overflow-hidden transition-all duration-300">
              <div className="absolute -right-3 -top-3 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />

              {/* Title & Stats & Collapse Toggle */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-base shadow-md shrink-0">
                    <Grid3X3 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm text-zinc-100 flex items-center gap-1.5">
                      <span>井字棋 (Tic-Tac-Toe)</span>
                    </h3>
                    <p className="text-[10px] text-zinc-400 truncate">标准 3×3 九宫三连 · 拟真人设智能对战</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-cyan-400 block">{tttWinRate}% 胜率</span>
                    <span className="text-[9px] text-zinc-500">{totalPveTttGames} 局已战</span>
                  </div>
                  <button
                    onClick={() => toggleCollapse('tictactoe')}
                    className="flex items-center gap-0.5 text-[10px] font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/30 px-2 py-1 rounded-xl transition"
                    title={collapsedCards.tictactoe ? '展开详细设置' : '折叠为精简卡片'}
                  >
                    <span>{collapsedCards.tictactoe ? '展开' : '折叠'}</span>
                    {collapsedCards.tictactoe ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* COLLAPSED VIEW (精简版) */}
              {collapsedCards.tictactoe ? (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-cyan-500/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentTttOpponent.avatar}
                      alt={currentTttOpponent.name}
                      className="w-6 h-6 rounded-full object-cover border border-cyan-500/40"
                    />
                    <span className="text-[11px] text-zinc-300 font-medium truncate">
                      对手: {currentTttOpponent.name}
                    </span>
                    <select
                      value={selectedTttDifficulty}
                      onChange={(e) => setSelectedTttDifficulty(e.target.value as TicTacToeDifficulty)}
                      className="py-1 px-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] focus:outline-none"
                    >
                      <option value="easy">简单</option>
                      <option value="normal">普通</option>
                      <option value="hard">困难</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setPlayingGameId('tictactoe')}
                    className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-md transition active:scale-95 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>快速开局</span>
                  </button>
                </div>
              ) : (
                /* EXPANDED DETAILED VIEW (详细版) */
                <>
                  {/* Highlights Banner */}
                  <div className="p-2.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-[10px] text-cyan-200 leading-snug">
                      九宫三连博弈，角色拟真棋力、即时吐槽与策略交锋！
                    </span>
                  </div>

                  {/* Game Mode Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-400 block">选择对局模式</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSelectedTttMode('pve')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedTttMode === 'pve'
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <User className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-bold text-[11px] leading-tight">玩家 vs AI</div>
                          <div className="text-[9px] text-zinc-400">玩家执 X 先手</div>
                        </div>
                      </button>

                      <button
                        onClick={() => setSelectedTttMode('eve')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedTttMode === 'eve'
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Bot className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-bold text-[11px] leading-tight">AI vs AI 观战</div>
                          <div className="text-[9px] text-zinc-400">两名AI九宫角逐</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Opponent AI Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-400 block">
                      选择对弈角色 ({safeCharacters.length} 位 AI 伙伴)
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {safeCharacters.map((char) => (
                        <button
                          key={char.id}
                          onClick={() => setSelectedTttOpponentId(char.id)}
                          className={`p-2 rounded-2xl border flex items-center gap-2 shrink-0 transition ${
                            selectedTttOpponentId === char.id
                              ? 'bg-cyan-500/20 border-cyan-500 text-white'
                              : 'bg-zinc-800/60 border-zinc-750 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <img
                            src={char.avatar || FALLBACK_AI_CHARACTER.avatar}
                            alt={char.name || 'AI'}
                            className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                          />
                          <div className="text-left">
                            <div className="font-semibold text-xs leading-tight text-zinc-200">{char.name}</div>
                            <div className="text-[9px] text-zinc-400 truncate max-w-[80px]">
                              {char.tags?.[0] || 'AI对弈者'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opponent Persona & Dialogue Preview */}
                  {currentTttOpponent && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          当前对手性格与棋风
                        </span>
                        <span className="text-cyan-400 font-mono font-medium">{currentTttOpponent.name}</span>
                      </div>
                      <p className="text-zinc-300 text-[10px] leading-relaxed line-clamp-2">
                        {currentTttOpponent.persona}
                      </p>
                    </div>
                  )}

                  {/* Difficulty & Start Button */}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={selectedTttDifficulty}
                      onChange={(e) => setSelectedTttDifficulty(e.target.value as TicTacToeDifficulty)}
                      className="py-2.5 px-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium text-xs focus:outline-none"
                    >
                      <option value="easy">难度: 简单</option>
                      <option value="normal">难度: 普通</option>
                      <option value="hard">难度: 困难</option>
                    </select>

                    <button
                      onClick={() => setPlayingGameId('tictactoe')}
                      className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-98"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>立即开局井字棋</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* GAME 3: GOMOKU (五子棋 - 详细与可折叠) */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-orange-950/80 via-zinc-900 to-amber-950/40 border border-orange-500/40 shadow-xl space-y-3.5 relative overflow-hidden transition-all duration-300">
              <div className="absolute -right-3 -top-3 w-24 h-24 bg-orange-500/10 rounded-full blur-xl pointer-events-none" />

              {/* Title & Stats & Collapse Toggle */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-zinc-950 font-bold shadow-md shrink-0">
                    <Swords className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm text-zinc-100 flex items-center gap-1.5">
                      <span>五子棋 (Gomoku)</span>
                    </h3>
                    <p className="text-[10px] text-zinc-400 truncate">标准 15×15 棋盘 · 角色化智能对弈</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-orange-400 block">{winRate}% 胜率</span>
                    <span className="text-[9px] text-zinc-500">{totalPveGames} 局已战</span>
                  </div>
                  <button
                    onClick={() => toggleCollapse('gomoku')}
                    className="flex items-center gap-0.5 text-[10px] font-medium text-orange-300 hover:text-orange-200 bg-orange-950/60 hover:bg-orange-900/60 border border-orange-500/30 px-2 py-1 rounded-xl transition"
                    title={collapsedCards.gomoku ? '展开详细设置' : '折叠为精简卡片'}
                  >
                    <span>{collapsedCards.gomoku ? '展开' : '折叠'}</span>
                    {collapsedCards.gomoku ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* COLLAPSED VIEW (精简版) */}
              {collapsedCards.gomoku ? (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-orange-500/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentOpponent.avatar}
                      alt={currentOpponent.name}
                      className="w-6 h-6 rounded-full object-cover border border-orange-500/40"
                    />
                    <span className="text-[11px] text-zinc-300 font-medium truncate">
                      对手: {currentOpponent.name}
                    </span>
                    <select
                      value={selectedDifficulty}
                      onChange={(e) => setSelectedDifficulty(e.target.value as GomokuDifficulty)}
                      className="py-1 px-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] focus:outline-none"
                    >
                      <option value="easy">简单</option>
                      <option value="normal">普通</option>
                      <option value="hard">困难</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setPlayingGameId('gomoku')}
                    className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-md transition active:scale-95 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>快速开局</span>
                  </button>
                </div>
              ) : (
                /* EXPANDED DETAILED VIEW (详细版) */
                <>
                  {/* Highlights Banner */}
                  <div className="p-2.5 rounded-2xl bg-orange-950/30 border border-orange-500/30 flex items-center gap-2">
                    <Swords className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="text-[10px] text-orange-200 leading-snug">
                      经典 15×15 棋盘五子连珠，支持活三冲四防守预判与人设对话！
                    </span>
                  </div>

                  {/* Game Mode Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-400 block">选择对局模式</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSelectedMode('pve')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedMode === 'pve'
                            ? 'bg-orange-500/20 border-orange-500 text-orange-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <User className="w-4 h-4 text-orange-400 shrink-0" />
                        <div>
                          <div className="font-bold text-[11px] leading-tight">玩家 vs AI</div>
                          <div className="text-[9px] text-zinc-400">真人执黑棋先手</div>
                        </div>
                      </button>

                      <button
                        onClick={() => setSelectedMode('eve')}
                        className={`py-2 px-3 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selectedMode === 'eve'
                            ? 'bg-orange-500/20 border-orange-500 text-orange-200 shadow-sm'
                            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Bot className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-bold text-[11px] leading-tight">AI vs AI 观战</div>
                          <div className="text-[9px] text-zinc-400">两名AI巅峰博弈</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Opponent AI Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-400 block">
                      选择对弈角色 ({safeCharacters.length} 位已创建 AI)
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {safeCharacters.map((char) => (
                        <button
                          key={char.id}
                          onClick={() => setSelectedOpponentId(char.id)}
                          className={`p-2 rounded-2xl border flex items-center gap-2 shrink-0 transition ${
                            selectedOpponentId === char.id
                              ? 'bg-orange-500/20 border-orange-500 text-white'
                              : 'bg-zinc-800/60 border-zinc-750 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <img
                            src={char.avatar || FALLBACK_AI_CHARACTER.avatar}
                            alt={char.name || 'AI'}
                            className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                          />
                          <div className="text-left">
                            <div className="font-semibold text-xs leading-tight text-zinc-200">{char.name}</div>
                            <div className="text-[9px] text-zinc-400 truncate max-w-[80px]">
                              {char.tags?.[0] || 'AI对手'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opponent Persona & Dialogue Preview */}
                  {currentOpponent && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          当前对手棋风与人设
                        </span>
                        <span className="text-orange-400 font-mono font-medium">{currentOpponent.name}</span>
                      </div>
                      <p className="text-zinc-300 text-[10px] leading-relaxed line-clamp-2">
                        {currentOpponent.persona}
                      </p>
                    </div>
                  )}

                  {/* Difficulty & Start Button */}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={selectedDifficulty}
                      onChange={(e) => setSelectedDifficulty(e.target.value as GomokuDifficulty)}
                      className="py-2.5 px-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium text-xs focus:outline-none"
                    >
                      <option value="easy">难度: 简单</option>
                      <option value="normal">难度: 普通</option>
                      <option value="hard">难度: 困难</option>
                    </select>

                    <button
                      onClick={() => setPlayingGameId('gomoku')}
                      className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-98"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>立即开局对弈</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* TAB 2: PERSONAL MATCH RECORDS (个人战绩) */}
        {activeTab === 'records' && (
          <div className="space-y-4">
            {/* Game Selector for Records */}
            <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 text-xs">
              <button
                onClick={() => setRecordsTabGame('telepathy')}
                className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
                  recordsTabGame === 'telepathy'
                    ? 'bg-rose-500 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>❤️ 心有灵犀</span>
              </button>
              <button
                onClick={() => setRecordsTabGame('rps')}
                className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
                  recordsTabGame === 'rps'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>✊ 猜拳</span>
              </button>
              <button
                onClick={() => setRecordsTabGame('tictactoe')}
                className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
                  recordsTabGame === 'tictactoe'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>井字棋</span>
              </button>
              <button
                onClick={() => setRecordsTabGame('gomoku')}
                className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
                  recordsTabGame === 'gomoku'
                    ? 'bg-orange-500 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span>五子棋</span>
              </button>
            </div>

            {recordsTabGame === 'telepathy' && (
              <>
                {/* Telepathy Stats Dashboard */}
                <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                      <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                      心有灵犀 · 全局默契战绩
                    </h4>
                    {telepathyRecords.length > 0 && (
                      <button
                        onClick={handleClearTelepathyRecords}
                        className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        title="清空心有灵犀记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-zinc-400">总局数</div>
                      <div className="text-sm font-extrabold text-zinc-100">{totalTelepathyGames}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-zinc-400">答题总数</div>
                      <div className="text-sm font-extrabold text-zinc-100">{totalTelepathyQuestions}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-emerald-400">猜中次数</div>
                      <div className="text-sm font-extrabold text-emerald-400">{totalTelepathyMatches}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-rose-400">综合默契</div>
                      <div className="text-sm font-extrabold text-rose-400">{overallTelepathyRate}%</div>
                    </div>
                  </div>
                </div>

                {/* Per-Character Affinity Leaderboard */}
                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                  <h4 className="font-bold text-xs text-zinc-200 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>各 AI 角色默契排行</span>
                  </h4>
                  <div className="space-y-2">
                    {safeCharacters.map((char) => {
                      const st = telepathyCharStats[char.id] || {
                        characterId: char.id,
                        characterName: char.name || 'AI',
                        characterAvatar: char.avatar || FALLBACK_AI_CHARACTER.avatar,
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
                          className="p-2.5 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={char.avatar || FALLBACK_AI_CHARACTER.avatar}
                              alt={char.name || 'AI'}
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
                                答题 {st.totalQuestions} 题 · 最高连中 {st.maxStreak}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className={`font-extrabold text-sm font-mono ${aff.color}`}>
                              {st.matchRate}%
                            </div>
                            <div className="text-[9px] text-zinc-500">默契度</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Telepathy Record History List */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 px-1">
                    <History className="w-3.5 h-3.5 text-rose-400" />
                    <span>心有灵犀测试历史 ({telepathyRecords.length} 局)</span>
                  </h4>

                  {telepathyRecords.length === 0 ? (
                    <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 text-center text-zinc-500 space-y-2">
                      <p>暂无心有灵犀测试记录，快去精选大厅测试和 AI 的默契吧！</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {telepathyRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img
                                src={rec.characterAvatar}
                                alt={rec.characterName}
                                className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                              />
                              <div>
                                <span className="font-bold text-xs text-zinc-200">
                                  {rec.characterName}
                                </span>
                                <span className="text-[9px] text-zinc-400 block">
                                  {new Date(rec.timestamp).toLocaleDateString()} {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                                {rec.affinityLevelTitle} ({rec.matchRate}%)
                              </span>
                              <div className="text-[9px] text-zinc-400 mt-0.5">
                                猜中 {rec.matchCount} / {rec.totalRounds} 题
                              </div>
                            </div>
                          </div>

                          {/* Memory tag */}
                          {rec.generatedMemory && (
                            <div className="text-[10px] text-purple-300 bg-purple-950/30 border border-purple-500/30 p-2 rounded-xl flex items-start gap-1.5">
                              <Brain className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                              <span>已存记忆：{rec.generatedMemory}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {recordsTabGame === 'rps' && (
              <>
                {/* RPS Stats Dashboard */}
                <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-rose-400" />
                      猜拳生涯数据与连胜
                    </h4>
                    {rpsRecords.length > 0 && (
                      <button
                        onClick={handleClearRpsRecords}
                        className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        title="清空猜拳记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-zinc-400">总局数</div>
                      <div className="text-sm font-extrabold text-zinc-100">{totalPveRpsGames}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-emerald-400">胜场</div>
                      <div className="text-sm font-extrabold text-emerald-400">{playerRpsWins}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-amber-400">最高连胜</div>
                      <div className="text-sm font-extrabold text-amber-400">{rpsStats.maxStreak}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-rose-400">胜率</div>
                      <div className="text-sm font-extrabold text-rose-400">{rpsWinRate}%</div>
                    </div>
                  </div>
                </div>

                {/* RPS Match & QA History List */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 px-1">
                    <History className="w-3.5 h-3.5 text-rose-400" />
                    <span>猜拳与问答历史 ({rpsRecords.length} 条)</span>
                  </h4>

                  {rpsRecords.length === 0 ? (
                    <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 text-center text-zinc-500 space-y-2">
                      <p>暂无猜拳对战记录，快去精选大厅和 AI 玩石头剪刀布吧！</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rpsRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img
                                src={rec.opponentAvatar}
                                alt={rec.opponentName}
                                className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                              />
                              <span className="font-bold text-xs text-zinc-200">
                                VS {rec.opponentName}
                              </span>
                            </div>

                            <span
                              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                                rec.result === 'win' || rec.result === 'ai1_win'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : rec.result === 'loss' || rec.result === 'ai2_win'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {rec.result === 'win'
                                ? '玩家获胜'
                                : rec.result === 'loss'
                                ? 'AI获胜'
                                : '平局'}
                            </span>
                          </div>

                          {/* Q&A Highlight */}
                          {rec.question && (
                            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-[11px] space-y-1">
                              <div className="text-rose-300">
                                <span className="font-semibold">[{rec.questionAsker || '胜者'} 提问]:</span>{' '}
                                {rec.question}
                              </div>
                              <div className="text-zinc-300">
                                <span className="font-semibold text-emerald-400">
                                  [{rec.questionAnswerer || '输家'} 回答]:
                                </span>{' '}
                                {rec.answer}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {recordsTabGame === 'tictactoe' && (
              <>
                {/* TicTacToe Stats Dashboard */}
                <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-cyan-400" />
                      井字棋生涯数据
                    </h4>
                    {tttRecords.length > 0 && (
                      <button
                        onClick={handleClearTttRecords}
                        className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        title="清空井字棋记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-zinc-400">总场次</div>
                      <div className="text-sm font-extrabold text-zinc-100">{totalPveTttGames}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-emerald-400">胜场</div>
                      <div className="text-sm font-extrabold text-emerald-400">{playerTttWins}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-rose-400">败场</div>
                      <div className="text-sm font-extrabold text-rose-400">{aiTttWins}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-cyan-400">胜率</div>
                      <div className="text-sm font-extrabold text-cyan-400">{tttWinRate}%</div>
                    </div>
                  </div>
                </div>

                {/* TicTacToe Match History List */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 px-1">
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    <span>井字棋历史记录 ({tttRecords.length} 条)</span>
                  </h4>

                  {tttRecords.length === 0 ? (
                    <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 text-center text-zinc-500 space-y-2">
                      <Grid3X3 className="w-8 h-8 mx-auto text-zinc-600" />
                      <p>暂无井字棋对战记录，快去精选大厅挑战 AI 吧！</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tttRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2 shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={rec.opponentAvatar}
                              alt={rec.opponentName}
                              className="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                                <span>VS {rec.opponentName}</span>
                              </div>
                              <div className="text-[10px] text-zinc-400 flex items-center gap-2 pt-0.5">
                                <span>{new Date(rec.timestamp).toLocaleDateString()}</span>
                                <span>·</span>
                                <span>{rec.totalMoves} 手</span>
                                <span>·</span>
                                <span className="capitalize">{rec.difficulty}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {rec.result === 'win' || rec.result === 'ai1_win' ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/40">
                                胜利 🎉
                              </span>
                            ) : rec.result === 'loss' || rec.result === 'ai2_win' ? (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/40">
                                战败
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/40">
                                平局
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {recordsTabGame === 'gomoku' && (
              <>
                {/* Gomoku Stats Dashboard */}
                <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      五子棋个人生涯战绩
                    </h4>
                    {records.length > 0 && (
                      <button
                        onClick={handleClearRecords}
                        className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        title="清空五子棋记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-zinc-400">总场次</div>
                      <div className="text-sm font-extrabold text-zinc-100">{totalPveGames}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-emerald-400">胜场</div>
                      <div className="text-sm font-extrabold text-emerald-400">{playerWins}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-rose-400">败场</div>
                      <div className="text-sm font-extrabold text-rose-400">{aiWins}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-800/80">
                      <div className="text-[10px] text-amber-400">胜率</div>
                      <div className="text-sm font-extrabold text-amber-400">{winRate}%</div>
                    </div>
                  </div>
                </div>

                {/* Gomoku Match History List */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 px-1">
                    <History className="w-3.5 h-3.5 text-orange-400" />
                    <span>五子棋历史列表 ({records.length} 条)</span>
                  </h4>

                  {records.length === 0 ? (
                    <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 text-center text-zinc-500 space-y-2">
                      <Swords className="w-8 h-8 mx-auto text-zinc-600" />
                      <p>暂无对战记录，快去精选大厅挑战 AI 吧！</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {records.map((rec) => (
                        <div
                          key={rec.id}
                          className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2 shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={rec.opponentAvatar}
                              alt={rec.opponentName}
                              className="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                                <span>VS {rec.opponentName}</span>
                              </div>
                              <div className="text-[10px] text-zinc-400 flex items-center gap-2 pt-0.5">
                                <span>{new Date(rec.timestamp).toLocaleDateString()}</span>
                                <span>·</span>
                                <span>{rec.totalMoves} 手</span>
                                <span>·</span>
                                <span className="capitalize">{rec.difficulty}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {rec.result === 'win' || rec.result === 'ai1_win' ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/40">
                                胜利 🎉
                              </span>
                            ) : rec.result === 'loss' || rec.result === 'ai2_win' ? (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/40">
                                战败
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/40">
                                平局
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: ACHIEVEMENTS (成就榜) */}
        {activeTab === 'achievements' && (
          <div className="space-y-3">
            {/* Telepathy Achievements */}
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
              <h4 className="font-bold text-sm text-rose-400 flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                心有灵犀 · 默契成就殿堂
              </h4>

              <div className="space-y-2.5">
                {/* Achievement 1 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    totalTelepathyGames >= 1
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      totalTelepathyGames >= 1 ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    ❤️
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">初次心动 (First Mind Link)</div>
                    <div className="text-[10px] text-zinc-400">完成第 1 场心有灵犀默契测试</div>
                  </div>
                  {totalTelepathyGames >= 1 && (
                    <span className="text-[10px] text-rose-400 font-bold">已达成</span>
                  )}
                </div>

                {/* Achievement 2 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    telepathyRecords.some((r) => r.matchRate >= 80)
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      telepathyRecords.some((r) => r.matchRate >= 80) ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    ✨
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">灵魂知己 (Soulmate)</div>
                    <div className="text-[10px] text-zinc-400">单场测试中达成 80% 以上的极高默契度</div>
                  </div>
                  {telepathyRecords.some((r) => r.matchRate >= 80) && (
                    <span className="text-[10px] text-rose-400 font-bold">已达成</span>
                  )}
                </div>

                {/* Achievement 3 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    telepathyRecords.some((r) => r.maxStreak >= 3)
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      telepathyRecords.some((r) => r.maxStreak >= 3) ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    🔥
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">心有灵犀一点通 (Mind Resonance)</div>
                    <div className="text-[10px] text-zinc-400">在默契答题中连续猜中 3 题或以上</div>
                  </div>
                  {telepathyRecords.some((r) => r.maxStreak >= 3) && (
                    <span className="text-[10px] text-rose-400 font-bold">已达成</span>
                  )}
                </div>
              </div>
            </div>

            {/* RPS Achievements */}
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
              <h4 className="font-bold text-sm text-rose-400 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                猜拳与真心话成就
              </h4>

              <div className="space-y-2.5">
                {/* RPS Achievement 1 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    playerRpsWins >= 1
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      playerRpsWins >= 1 ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">猜拳先锋 (First RPS Win)</div>
                    <div className="text-[10px] text-zinc-400">在猜拳中首次获胜并成功向 AI 提问</div>
                  </div>
                  {playerRpsWins >= 1 && (
                    <span className="text-[10px] text-rose-400 font-bold">已达成</span>
                  )}
                </div>

                {/* RPS Achievement 2 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    rpsStats.maxStreak >= 3
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      rpsStats.maxStreak >= 3 ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    <Flame className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">读心术大师 (Streak 3+)</div>
                    <div className="text-[10px] text-zinc-400">在猜拳游戏中达成 3 次及以上连胜</div>
                  </div>
                  {rpsStats.maxStreak >= 3 && (
                    <span className="text-[10px] text-rose-400 font-bold">已达成</span>
                  )}
                </div>

                {/* RPS Achievement 3 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    rpsRecords.filter((r) => r.question).length >= 3
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      rpsRecords.filter((r) => r.question).length >= 3 ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">灵魂共鸣 (Heart-to-Heart)</div>
                    <div className="text-[10px] text-zinc-400">累计完成 3 次输家与赢家的问题互动</div>
                  </div>
                  {rpsRecords.filter((r) => r.question).length >= 3 && (
                    <span className="text-[10px] text-rose-400 font-bold">已达成</span>
                  )}
                </div>
              </div>
            </div>

            {/* Tic-Tac-Toe Achievements */}
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
              <h4 className="font-bold text-sm text-cyan-400 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                井字棋九宫成就
              </h4>

              <div className="space-y-2.5">
                {/* TTT Achievement 1 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    playerTttWins >= 1
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      playerTttWins >= 1 ? 'bg-cyan-500 text-zinc-950' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">九宫神算 (First 3-in-a-Row)</div>
                    <div className="text-[10px] text-zinc-400">在井字棋中首次战胜任意 AI 角色</div>
                  </div>
                  {playerTttWins >= 1 && (
                    <span className="text-[10px] text-cyan-400 font-bold">已达成</span>
                  )}
                </div>

                {/* TTT Achievement 2 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    tttRecords.some((r) => r.difficulty === 'hard' && (r.result === 'win' || r.result === 'draw'))
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      tttRecords.some((r) => r.difficulty === 'hard' && (r.result === 'win' || r.result === 'draw'))
                        ? 'bg-cyan-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    <Flame className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">滴水不漏 (Perfect Play)</div>
                    <div className="text-[10px] text-zinc-400">在井字棋困难模式下达成胜利或逼平 AI</div>
                  </div>
                  {tttRecords.some((r) => r.difficulty === 'hard' && (r.result === 'win' || r.result === 'draw')) && (
                    <span className="text-[10px] text-cyan-400 font-bold">已达成</span>
                  )}
                </div>
              </div>
            </div>

            {/* Gomoku Achievements */}
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
              <h4 className="font-bold text-sm text-amber-400 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                五子棋棋坛成就殿堂
              </h4>

              <div className="space-y-2.5">
                {/* Achievement 1 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center gap-3 ${
                    playerWins >= 1
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      playerWins >= 1 ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-zinc-200">初露锋芒 (First Victory)</div>
                    <div className="text-[10px] text-zinc-400">在五子棋中首次战胜任意 AI 角色</div>
                  </div>
                  {playerWins >= 1 && (
                    <span className="text-[10px] text-amber-400 font-bold">已达成</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

