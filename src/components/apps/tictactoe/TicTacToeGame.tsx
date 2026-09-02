import React, { useState, useEffect, useRef } from 'react';
import {
  AiCharacter,
  ApiConfig,
  ApiLog,
  TicTacToePiece,
  TicTacToeDifficulty,
  TicTacToeGameMode,
  TicTacToeMove,
  TicTacToeRecord,
} from '../../../types';
import {
  WINNING_LINES,
  WinResult,
  checkWinner,
  isBoardFull,
  checkImmediateThreat,
  getBestMove,
} from './tictactoeAi';
import { tictactoeAudio } from './tictactoeSound';
import { getTicTacToeDialogue, TicTacToeSituation } from './tictactoeDialogue';
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
  X as XIcon,
  Circle as OIcon,
  Check,
} from 'lucide-react';

interface TicTacToeGameProps {
  onBack: () => void;
  characters: AiCharacter[];
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
  onGameFinish?: (record: TicTacToeRecord) => void;
  initialOpponentId?: string;
  initialMode?: TicTacToeGameMode;
}

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({
  onBack,
  characters,
  apiConfig,
  onAddApiLog,
  onGameFinish,
  initialOpponentId,
  initialMode = 'pve',
}) => {
  // Game Setup States
  const [gameMode, setGameMode] = useState<TicTacToeGameMode>(initialMode);
  const [difficulty, setDifficulty] = useState<TicTacToeDifficulty>('normal');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Character Picker Modal State
  const [isChangingAi, setIsChangingAi] = useState(false);

  // Selected Opponents
  const defaultChar: AiCharacter = characters[0] || {
    id: 'char_default',
    name: 'AI 棋手',
    wxid: 'ai_player',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    persona: '机智自信的AI棋手',
    greeting: '来一局井字棋吗？三连决胜！',
    memories: [],
    isLocked: false,
    tags: ['智力', '棋友'],
  };

  const [opponent, setOpponent] = useState<AiCharacter>(() => {
    if (initialOpponentId) {
      const found = characters.find((c) => c.id === initialOpponentId);
      if (found) return found;
    }
    return defaultChar;
  });

  // AI 2 for EvE
  const [ai2Opponent, setAi2Opponent] = useState<AiCharacter>(() => {
    return characters[1] || characters[0] || defaultChar;
  });

  // Board State: 9 cells (0..8)
  const [board, setBoard] = useState<TicTacToePiece[]>(() => Array(9).fill(null));
  const [movesHistory, setMovesHistory] = useState<TicTacToeMove[]>([]);
  const [currentTurn, setCurrentTurn] = useState<'X' | 'O'>('X'); // X always goes first
  const [playerSymbol] = useState<'X' | 'O'>('X'); // In PvE, player is always X (first)

  // EvE symbols
  const [ai1Symbol, setAi1Symbol] = useState<'X' | 'O'>('X');
  const [ai2Symbol, setAi2Symbol] = useState<'X' | 'O'>('O');

  // Game Status
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<'win' | 'loss' | 'draw' | 'ai1_win' | 'ai2_win' | null>(null);
  const [winningLine, setWinningLine] = useState<[number, number, number] | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // EvE auto play controller
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Dialogue speech bubble
  const [speechBubble, setSpeechBubble] = useState<{
    text: string;
    speakerName: string;
    speakerAvatar: string;
  }>({
    text: `${opponent.name}：“九宫三连，请先手落子（X）吧~”`,
    speakerName: opponent.name,
    speakerAvatar: opponent.avatar,
  });

  // Timer
  const [gameStartTime, setGameStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Timer effect
  useEffect(() => {
    if (isGameOver) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - gameStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStartTime, isGameOver]);

  // Dialogue trigger helper
  const triggerAiSpeech = async (
    char: AiCharacter,
    situation: TicTacToeSituation,
    lastMoveIdx?: number
  ) => {
    try {
      const line = await getTicTacToeDialogue({
        character: char,
        situation,
        difficulty,
        lastMoveIndex: lastMoveIdx,
        apiConfig,
        onAddApiLog,
      });
      setSpeechBubble({
        text: `${char.name}：“${line}”`,
        speakerName: char.name,
        speakerAvatar: char.avatar,
      });
    } catch (e) {
      console.warn('Speech trigger error in TicTacToe', e);
    }
  };

  // Audio & Haptic helper
  const playMoveFeedback = (symbol: 'X' | 'O') => {
    if (soundEnabled) {
      tictactoeAudio.playMarkSound(symbol === 'O');
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {}
    }
  };

  // Restart / Reset Game
  const handleRestart = (newMode?: TicTacToeGameMode, newOpponent?: AiCharacter) => {
    const modeToUse = newMode || gameMode;
    const oppToUse = newOpponent || opponent;

    setBoard(Array(9).fill(null));
    setMovesHistory([]);
    setCurrentTurn('X');
    setIsGameOver(false);
    setGameResult(null);
    setWinningLine(null);
    setIsAiThinking(false);
    setGameStartTime(Date.now());
    setElapsedSeconds(0);

    if (modeToUse === 'pve') {
      setSpeechBubble({
        text: `${oppToUse.name}：“新的一局开始啦，你执 X 先手，请落子！”`,
        speakerName: oppToUse.name,
        speakerAvatar: oppToUse.avatar,
      });
    } else {
      setAi1Symbol('X');
      setAi2Symbol('O');
      setSpeechBubble({
        text: `【AI巅峰博弈】${oppToUse.name}(X) 对决 ${ai2Opponent.name}(O)，开局！`,
        speakerName: oppToUse.name,
        speakerAvatar: oppToUse.avatar,
      });
    }
  };

  // Switch Game Mode
  const handleModeSwitch = (mode: TicTacToeGameMode) => {
    setGameMode(mode);
    handleRestart(mode);
  };

  // Select a new AI opponent
  const handleSelectNewAi = (newChar: AiCharacter) => {
    setOpponent(newChar);
    setIsChangingAi(false);
    handleRestart(gameMode, newChar);
  };

  // Handle Game Over
  const handleGameOver = (
    winner: 'X' | 'O' | 'draw',
    winningIndices: [number, number, number] | null
  ) => {
    setIsGameOver(true);
    setWinningLine(winningIndices);
    const duration = Math.floor((Date.now() - gameStartTime) / 1000);

    if (gameMode === 'pve') {
      if (winner === playerSymbol) {
        // Player Wins
        setGameResult('win');
        if (soundEnabled) tictactoeAudio.playWinSound();
        triggerAiSpeech(opponent, 'player_win');

        const rec: TicTacToeRecord = {
          id: 'ttt_' + Date.now(),
          timestamp: Date.now(),
          mode: 'pve',
          playerSymbol: 'X',
          opponentId: opponent.id,
          opponentName: opponent.name,
          opponentAvatar: opponent.avatar,
          difficulty,
          result: 'win',
          totalMoves: movesHistory.length + 1,
          durationSec: duration,
        };
        onGameFinish?.(rec);
      } else if (winner === 'O') {
        // AI Wins
        setGameResult('loss');
        if (soundEnabled) tictactoeAudio.playLossSound();
        triggerAiSpeech(opponent, 'ai_win');

        const rec: TicTacToeRecord = {
          id: 'ttt_' + Date.now(),
          timestamp: Date.now(),
          mode: 'pve',
          playerSymbol: 'X',
          opponentId: opponent.id,
          opponentName: opponent.name,
          opponentAvatar: opponent.avatar,
          difficulty,
          result: 'loss',
          totalMoves: movesHistory.length + 1,
          durationSec: duration,
        };
        onGameFinish?.(rec);
      } else {
        // Draw
        setGameResult('draw');
        if (soundEnabled) tictactoeAudio.playDrawSound();
        triggerAiSpeech(opponent, 'draw');

        const rec: TicTacToeRecord = {
          id: 'ttt_' + Date.now(),
          timestamp: Date.now(),
          mode: 'pve',
          playerSymbol: 'X',
          opponentId: opponent.id,
          opponentName: opponent.name,
          opponentAvatar: opponent.avatar,
          difficulty,
          result: 'draw',
          totalMoves: movesHistory.length + 1,
          durationSec: duration,
        };
        onGameFinish?.(rec);
      }
    } else {
      // EvE Game End
      const winnerChar = winner === ai1Symbol ? opponent : ai2Opponent;

      if (winner === 'draw') {
        setGameResult('draw');
        if (soundEnabled) tictactoeAudio.playDrawSound();
        setSpeechBubble({
          text: `双方旗鼓相当，平局收场！`,
          speakerName: opponent.name,
          speakerAvatar: opponent.avatar,
        });
      } else {
        const resultType = winner === ai1Symbol ? 'ai1_win' : 'ai2_win';
        setGameResult(resultType);
        if (soundEnabled) tictactoeAudio.playWinSound();
        setSpeechBubble({
          text: `${winnerChar.name}：“这局归我啦，精彩的博弈！”`,
          speakerName: winnerChar.name,
          speakerAvatar: winnerChar.avatar,
        });
      }

      const rec: TicTacToeRecord = {
        id: 'ttt_' + Date.now(),
        timestamp: Date.now(),
        mode: 'eve',
        playerSymbol: 'X',
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentAvatar: opponent.avatar,
        ai2Id: ai2Opponent.id,
        ai2Name: ai2Opponent.name,
        ai2Avatar: ai2Opponent.avatar,
        difficulty,
        result: winner === 'draw' ? 'draw' : winner === ai1Symbol ? 'ai1_win' : 'ai2_win',
        totalMoves: movesHistory.length + 1,
        durationSec: duration,
      };
      onGameFinish?.(rec);
    }
  };

  // Place Symbol Move
  const placeSymbol = (index: number, symbol: 'X' | 'O'): boolean => {
    if (board[index] !== null || isGameOver) return false;

    const nextBoard = [...board];
    nextBoard[index] = symbol;
    setBoard(nextBoard);

    const newMove: TicTacToeMove = {
      index,
      r: Math.floor(index / 3),
      c: index % 3,
      symbol,
      order: movesHistory.length + 1,
    };
    setMovesHistory((prev) => [...prev, newMove]);

    // Audio & Vibration
    playMoveFeedback(symbol);

    // Check Win
    const winRes = checkWinner(nextBoard);
    if (winRes) {
      handleGameOver(winRes.winner, winRes.line);
      return true;
    }

    // Check Draw
    if (isBoardFull(nextBoard)) {
      handleGameOver('draw', null);
      return true;
    }

    // Switch Turn
    const nextTurn = symbol === 'X' ? 'O' : 'X';
    setCurrentTurn(nextTurn);
    return true;
  };

  // User Tap on 3x3 Tile (PvE mode)
  const handleCellClick = (index: number) => {
    if (gameMode !== 'pve') return;
    if (isGameOver || isAiThinking) return;
    if (currentTurn !== playerSymbol) return;
    if (board[index] !== null) return;

    // Place player move
    const success = placeSymbol(index, playerSymbol);
    if (!success) return;

    // Check if player formed a winning threat for immediate AI reaction dialog
    const tempBoard = [...board];
    tempBoard[index] = playerSymbol;
    const playerThreat = checkImmediateThreat(tempBoard, playerSymbol);
    if (playerThreat.hasThreat) {
      triggerAiSpeech(opponent, 'player_threat', index);
    }
  };

  // AI Decision Engine Loop
  useEffect(() => {
    if (isGameOver) return;

    // PvE: AI Turn (O)
    if (gameMode === 'pve' && currentTurn === 'O' && !isAiThinking) {
      setIsAiThinking(true);

      const thinkTimer = setTimeout(() => {
        const analysis = getBestMove(board, 'O', difficulty);
        setIsAiThinking(false);

        const ok = placeSymbol(analysis.index, 'O');
        if (ok) {
          if (analysis.actionType === 'block') {
            triggerAiSpeech(opponent, 'ai_block', analysis.index);
          } else if (analysis.actionType === 'win') {
            triggerAiSpeech(opponent, 'ai_win', analysis.index);
          }
        }
      }, 500);

      return () => clearTimeout(thinkTimer);
    }

    // EvE: AI vs AI automated loop
    if (gameMode === 'eve' && isAutoPlaying && !isAiThinking) {
      const activeChar = currentTurn === ai1Symbol ? opponent : ai2Opponent;
      setIsAiThinking(true);

      const eveTimer = setTimeout(() => {
        const analysis = getBestMove(board, currentTurn, difficulty);
        setIsAiThinking(false);
        placeSymbol(analysis.index, currentTurn);

        if (analysis.actionType === 'block') {
          triggerAiSpeech(activeChar, 'ai_block', analysis.index);
        } else if (Math.random() < 0.3) {
          triggerAiSpeech(activeChar, 'normal_move', analysis.index);
        }
      }, 650);

      return () => clearTimeout(eveTimer);
    }
  }, [currentTurn, gameMode, isGameOver, isAutoPlaying, board]);

  // Last Move
  const lastMove = movesHistory[movesHistory.length - 1];

  // Helper to format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Top Bar */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>

        <div className="flex items-center gap-1.5 font-bold text-sm text-zinc-100">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>井字棋 (Tic-Tac-Toe)</span>
        </div>

        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`p-1.5 rounded-xl transition ${
            soundEnabled ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-500 bg-zinc-800'
          }`}
          title={soundEnabled ? '音效开启' : '音效静音'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      {/* Opponent Info & Header Section */}
      <div className="px-3 pt-2.5 pb-2 bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-zinc-800/80 shrink-0 space-y-2">
        {/* Mode & Difficulty Bar */}
        <div className="flex items-center justify-between gap-2">
          {/* Mode Switcher */}
          <div className="flex bg-zinc-800/90 p-0.5 rounded-xl border border-zinc-700/60 text-[11px]">
            <button
              onClick={() => handleModeSwitch('pve')}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                gameMode === 'pve' ? 'bg-cyan-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <User className="w-3 h-3" />
              <span>玩家 vs AI</span>
            </button>
            <button
              onClick={() => handleModeSwitch('eve')}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                gameMode === 'eve' ? 'bg-cyan-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Bot className="w-3 h-3" />
              <span>AI vs AI 观战</span>
            </button>
          </div>

          {/* Difficulty Dropdown */}
          <div className="flex items-center gap-1 bg-zinc-800/90 px-2 py-1 rounded-xl border border-zinc-700/60 text-[11px]">
            <Flame className="w-3 h-3 text-amber-400" />
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as TicTacToeDifficulty)}
              className="bg-transparent text-zinc-200 text-[11px] focus:outline-none font-medium cursor-pointer"
            >
              <option value="easy" className="bg-zinc-900 text-zinc-200">
                简单 (新手休闲)
              </option>
              <option value="normal" className="bg-zinc-900 text-zinc-200">
                普通 (攻防兼备)
              </option>
              <option value="hard" className="bg-zinc-900 text-zinc-200">
                困难 (无懈可击)
              </option>
            </select>
          </div>
        </div>

        {/* Players Duel Header Card */}
        <div className="flex items-center justify-between p-2 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
          {gameMode === 'pve' ? (
            <>
              {/* Player Side */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-300 font-bold text-xs shadow">
                    我
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cyan-600 text-white font-black text-[9px] flex items-center justify-center shadow">
                    X
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-200">玩家 (执 X)</div>
                  <div className="text-[10px] text-cyan-400">先手落子</div>
                </div>
              </div>

              {/* Status Indicator in Center */}
              <div className="text-center">
                {isGameOver ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                    对局结束
                  </span>
                ) : isAiThinking ? (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/40 animate-pulse flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    AI思考中...
                  </span>
                ) : currentTurn === 'X' ? (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/40">
                    你的回合 (X)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/40">
                    对方回合 (O)
                  </span>
                )}
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  第 {movesHistory.length} 步 · {formatTime(elapsedSeconds)}
                </div>
              </div>

              {/* AI Opponent Side */}
              <div className="flex items-center gap-2 text-right">
                <div>
                  <div className="text-xs font-bold text-zinc-200 flex items-center justify-end gap-1">
                    <span>{opponent.name}</span>
                  </div>
                  <div className="text-[10px] text-rose-400 truncate max-w-[70px]">
                    {opponent.tags?.[0] || 'AI对手'}
                  </div>
                </div>
                <div className="relative">
                  <img
                    src={opponent.avatar}
                    alt={opponent.name}
                    className="w-9 h-9 rounded-full object-cover border border-rose-500/40 shadow"
                  />
                  <span className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center shadow">
                    O
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* AI vs AI Header */
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src={opponent.avatar}
                  alt={opponent.name}
                  className="w-8 h-8 rounded-full object-cover border border-cyan-500/50"
                />
                <div>
                  <div className="text-xs font-bold text-zinc-200">{opponent.name}</div>
                  <div className="text-[10px] text-cyan-400 font-mono">执 X (先手)</div>
                </div>
              </div>

              <div className="text-center px-2">
                <div className="text-[11px] font-bold text-amber-400 flex items-center justify-center gap-1">
                  <Swords className="w-3.5 h-3.5" />
                  <span>AI 决斗</span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  第 {movesHistory.length} 步 · {formatTime(elapsedSeconds)}
                </div>
              </div>

              <div className="flex items-center gap-2 text-right">
                <div>
                  <div className="text-xs font-bold text-zinc-200">{ai2Opponent.name}</div>
                  <div className="text-[10px] text-rose-400 font-mono">执 O (后手)</div>
                </div>
                <img
                  src={ai2Opponent.avatar}
                  alt={ai2Opponent.name}
                  className="w-8 h-8 rounded-full object-cover border border-rose-500/50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Live In-Character Speech Bubble */}
        <div className="p-2 rounded-xl bg-zinc-900/80 border border-cyan-500/20 flex items-center gap-2 text-[11px]">
          <img
            src={speechBubble.speakerAvatar}
            alt={speechBubble.speakerName}
            className="w-5 h-5 rounded-full object-cover shrink-0 border border-cyan-400/50"
          />
          <div className="flex-1 text-zinc-300 truncate font-sans">{speechBubble.text}</div>
        </div>
      </div>

      {/* Main 3x3 Tic-Tac-Toe Game Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden bg-zinc-950">
        {/* Ambient background glow */}
        <div className="absolute w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* 3x3 Grid Board Container */}
        <div className="relative w-full max-w-[310px] aspect-square rounded-3xl p-3 bg-zinc-900/95 border-2 border-zinc-800 shadow-2xl flex flex-col justify-between select-none">
          {/* Inner Grid */}
          <div className="relative w-full h-full grid grid-cols-3 grid-rows-3 gap-2.5">
            {board.map((cell, idx) => {
              const isWinTile = winningLine && winningLine.includes(idx);
              const isLast = lastMove && lastMove.index === idx;

              return (
                <button
                  key={idx}
                  onClick={() => handleCellClick(idx)}
                  disabled={!!cell || isGameOver || (gameMode === 'pve' && (currentTurn !== 'X' || isAiThinking))}
                  className={`relative rounded-2xl flex items-center justify-center transition-all duration-200 ${
                    cell === null
                      ? 'bg-zinc-800/80 hover:bg-zinc-750 active:scale-95 border border-zinc-700/60 shadow-inner'
                      : isWinTile
                      ? 'bg-amber-500/20 border-2 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.03]'
                      : 'bg-zinc-800/90 border border-zinc-700/80 shadow-md'
                  }`}
                >
                  {/* Empty cell hover ghost */}
                  {!cell && currentTurn === 'X' && gameMode === 'pve' && !isGameOver && !isAiThinking && (
                    <span className="text-zinc-600/40 text-4xl font-black opacity-0 hover:opacity-100 transition duration-150">
                      X
                    </span>
                  )}

                  {/* Placed Symbol: 'X' */}
                  {cell === 'X' && (
                    <div
                      className={`flex items-center justify-center transition transform duration-150 ${
                        isWinTile ? 'animate-bounce text-amber-300' : 'text-cyan-400'
                      }`}
                    >
                      <span className="text-5xl font-black tracking-tighter drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">
                        ✕
                      </span>
                    </div>
                  )}

                  {/* Placed Symbol: 'O' */}
                  {cell === 'O' && (
                    <div
                      className={`flex items-center justify-center transition transform duration-150 ${
                        isWinTile ? 'animate-bounce text-amber-300' : 'text-rose-400'
                      }`}
                    >
                      <span className="text-5xl font-black drop-shadow-[0_0_12px_rgba(251,113,133,0.5)]">
                        ◯
                      </span>
                    </div>
                  )}

                  {/* Last Move Indicator Ring */}
                  {isLast && !isWinTile && (
                    <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* VICTORY / DEFEAT / DRAW MODAL OVERLAY */}
        {isGameOver && gameResult && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-40 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-cyan-500/40 p-5 text-center text-white shadow-2xl space-y-3.5">
              {/* Trophy / Result Icon */}
              <div
                className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
                  gameResult === 'win' || gameResult === 'ai1_win'
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950'
                    : gameResult === 'draw'
                    ? 'bg-zinc-800 text-zinc-300'
                    : 'bg-gradient-to-br from-rose-500 to-red-700 text-white'
                }`}
              >
                {gameResult === 'win' || gameResult === 'ai1_win' ? (
                  <Trophy className="w-8 h-8 animate-bounce" />
                ) : gameResult === 'draw' ? (
                  <Swords className="w-8 h-8" />
                ) : (
                  <Bot className="w-8 h-8" />
                )}
              </div>

              {/* Banner Heading as explicitly requested */}
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  {gameResult === 'win'
                    ? '🎉 你赢了！'
                    : gameResult === 'loss'
                    ? 'AI 获胜。'
                    : gameResult === 'draw'
                    ? '平局！谁都没赢。'
                    : gameResult === 'ai1_win'
                    ? `${opponent.name} 获胜！`
                    : `${ai2Opponent.name} 获胜！`}
                </h3>
                <p className="text-xs text-cyan-300 font-medium pt-1">{speechBubble.text}</p>
              </div>

              {/* Match Stats */}
              <div className="grid grid-cols-3 gap-1.5 p-2 rounded-2xl bg-zinc-800/80 text-[10px] text-zinc-300">
                <div>
                  <div className="text-zinc-500">对手</div>
                  <div className="font-bold text-zinc-200 truncate">{opponent.name}</div>
                </div>
                <div>
                  <div className="text-zinc-500">总步数</div>
                  <div className="font-bold text-zinc-200">{movesHistory.length} 步</div>
                </div>
                <div>
                  <div className="text-zinc-500">耗时</div>
                  <div className="font-bold text-zinc-200">{formatTime(elapsedSeconds)}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => handleRestart()}
                  className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-xs shadow-md transition active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>再来一局</span>
                </button>
                <button
                  onClick={onBack}
                  className="w-full py-2 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-medium transition"
                >
                  返回游戏主页
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          {/* 重新开始 (Restart) */}
          <button
            onClick={() => handleRestart()}
            className="flex-1 py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center justify-center gap-1 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span>重新开始</span>
          </button>

          {/* 换一个 AI (Change AI) */}
          <button
            onClick={() => setIsChangingAi(true)}
            className="flex-1 py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center justify-center gap-1 transition"
          >
            <UserPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>换一个 AI</span>
          </button>

          {/* EvE Auto-Play controller or Back */}
          {gameMode === 'eve' ? (
            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center justify-center gap-1 transition"
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>暂停</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>继续</span>
                </>
              )}
            </button>
          ) : null}

          {/* 返回游戏主页 (Back to Game Center) */}
          <button
            onClick={onBack}
            className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-rose-300 transition"
          >
            <span>返回主页</span>
          </button>
        </div>
      </div>

      {/* CHANGE AI OPPONENT MODAL DIALOG */}
      {isChangingAi && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col justify-end z-50 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-4 max-h-[75%] flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan-400" />
                <span>选择对弈 AI 角色</span>
              </h4>
              <button
                onClick={() => setIsChangingAi(false)}
                className="p-1 rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-400">
              选择不同人设特性的 AI 角色，体验独特的棋风、语气与动态台词互动。
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 py-1">
              {characters.map((char) => {
                const isSelected = char.id === opponent.id;
                return (
                  <div
                    key={char.id}
                    onClick={() => handleSelectNewAi(char)}
                    className={`p-2.5 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-500 text-white'
                        : 'bg-zinc-850 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={char.avatar}
                        alt={char.name}
                        className="w-10 h-10 rounded-full object-cover border border-zinc-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                          <span>{char.name}</span>
                          {char.tags?.[0] && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-cyan-300 border border-zinc-700">
                              {char.tags[0]}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-1 pt-0.5">
                          {char.persona}
                        </p>
                      </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-cyan-400 shrink-0 ml-2" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
