import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AiCharacter,
  ApiConfig,
  ApiLog,
  GomokuPiece,
  GomokuDifficulty,
  GomokuGameMode,
  GomokuMove,
  GomokuRecord,
} from '../../../types';
import {
  BOARD_SIZE,
  BoardPos,
  checkWinner,
  isBoardFull,
  getBestMove,
  analyzePlayerThreats,
} from './gomokuAi';
import { gomokuAudio } from './gomokuSound';
import { getGomokuDialogue, GomokuSituation } from './gomokuDialogue';
import {
  ArrowLeft,
  RotateCcw,
  Undo2,
  Trophy,
  Volume2,
  VolumeX,
  Swords,
  User,
  Bot,
  Sparkles,
  HelpCircle,
  Hash,
  Award,
  Flame,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Shuffle,
  Users,
} from 'lucide-react';

interface GomokuGameProps {
  onBack: () => void;
  characters: AiCharacter[];
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
  onGameFinish?: (record: GomokuRecord) => void;
  initialOpponentId?: string;
  initialMode?: GomokuGameMode;
}

export const GomokuGame: React.FC<GomokuGameProps> = ({
  onBack,
  characters,
  apiConfig,
  onAddApiLog,
  onGameFinish,
  initialOpponentId,
  initialMode = 'pve',
}) => {
  // Game Setup States
  const [gameMode, setGameMode] = useState<GomokuGameMode>(initialMode);
  const [difficulty, setDifficulty] = useState<GomokuDifficulty>('normal');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showMoveNumbers, setShowMoveNumbers] = useState(false);

  // Selected Opponent Character (for PvE or AI 1)
  const defaultChar: AiCharacter = characters[0] || {
    id: 'char_default',
    name: 'AI 棋手',
    wxid: 'ai_player',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    persona: '温和沉着的AI棋艺大师',
    greeting: '来一局五子棋吗？',
    memories: [],
    isLocked: false,
    tags: ['棋艺', '大师'],
  };

  const [opponent, setOpponent] = useState<AiCharacter>(() => {
    if (initialOpponentId) {
      const found = characters.find((c) => c.id === initialOpponentId);
      if (found) return found;
    }
    return defaultChar;
  });

  // AI 2 for AI vs AI mode
  const [ai2Opponent, setAi2Opponent] = useState<AiCharacter>(() => {
    return characters[1] || characters[0] || defaultChar;
  });

  // Board & Move State
  const [board, setBoard] = useState<GomokuPiece[][]>(() =>
    Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(null))
  );

  const [movesHistory, setMovesHistory] = useState<GomokuMove[]>([]);
  const [currentTurn, setCurrentTurn] = useState<'black' | 'white'>('black');
  const [playerColor, setPlayerColor] = useState<'black' | 'white'>('black'); // in PvE, player is black by default
  const [ai1Color, setAi1Color] = useState<'black' | 'white'>('black'); // for EvE
  const [ai2Color, setAi2Color] = useState<'black' | 'white'>('white'); // for EvE

  // Game Status
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<'player_win' | 'ai_win' | 'draw' | 'ai1_win' | 'ai2_win' | null>(null);
  const [winningLine, setWinningLine] = useState<BoardPos[] | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [thinkingName, setThinkingName] = useState<string>('');

  // AI vs AI auto-play controller
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Dialog & Speech bubble
  const [speechBubble, setSpeechBubble] = useState<{
    text: string;
    speakerName: string;
    speakerAvatar: string;
  }>({
    text: `${opponent.name}：你好呀！请指教，黑棋先手哦。`,
    speakerName: opponent.name,
    speakerAvatar: opponent.avatar,
  });

  // Game timer & start time
  const [gameStartTime, setGameStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Board Container Ref for Touch/Click measurement
  const boardRef = useRef<HTMLDivElement>(null);

  // Timer effect
  useEffect(() => {
    if (isGameOver) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - gameStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStartTime, isGameOver]);

  // Trigger speech helper
  const triggerAiSpeech = async (
    char: AiCharacter,
    situation: GomokuSituation,
    lastMovePos?: { r: number; c: number }
  ) => {
    try {
      const line = await getGomokuDialogue({
        character: char,
        situation,
        difficulty,
        lastMove: lastMovePos,
        apiConfig,
        onAddApiLog,
      });
      setSpeechBubble({
        text: `${char.name}：“${line}”`,
        speakerName: char.name,
        speakerAvatar: char.avatar,
      });
    } catch (e) {
      console.warn('Speech trigger error', e);
    }
  };

  // Sound & Vibration helper
  const playMoveFeedback = (isWhite: boolean) => {
    if (soundEnabled) {
      gomokuAudio.playPieceSound(isWhite);
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {}
    }
  };

  // Reset / Restart Game
  const handleRestart = (newMode?: GomokuGameMode) => {
    const modeToUse = newMode || gameMode;
    const newBoard = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(null));

    setBoard(newBoard);
    setMovesHistory([]);
    setCurrentTurn('black');
    setIsGameOver(false);
    setGameResult(null);
    setWinningLine(null);
    setIsAiThinking(false);
    setGameStartTime(Date.now());
    setElapsedSeconds(0);

    if (modeToUse === 'pve') {
      setPlayerColor('black');
      setSpeechBubble({
        text: `${opponent.name}：“新的一局开始啦，执黑先手，请落子吧~”`,
        speakerName: opponent.name,
        speakerAvatar: opponent.avatar,
      });
    } else {
      // EvE: Randomly choose black & white
      const isOpponentBlack = Math.random() > 0.5;
      const bChar = isOpponentBlack ? opponent : ai2Opponent;
      const wChar = isOpponentBlack ? ai2Opponent : opponent;
      setAi1Color(isOpponentBlack ? 'black' : 'white');
      setAi2Color(isOpponentBlack ? 'white' : 'black');
      setSpeechBubble({
        text: `【观战对决】${bChar.name}(执黑) VS ${wChar.name}(执白)，巅峰对弈开始！`,
        speakerName: bChar.name,
        speakerAvatar: bChar.avatar,
      });
    }
  };

  // Switch Mode
  const handleModeSwitch = (mode: GomokuGameMode) => {
    setGameMode(mode);
    handleRestart(mode);
  };

  // Handle Game End
  const handleGameOver = (
    winner: 'black' | 'white' | 'draw',
    winningPositions: BoardPos[] | null
  ) => {
    setIsGameOver(true);
    setWinningLine(winningPositions);

    const duration = Math.floor((Date.now() - gameStartTime) / 1000);

    if (gameMode === 'pve') {
      if (winner === playerColor) {
        setGameResult('player_win');
        if (soundEnabled) gomokuAudio.playWinSound();
        triggerAiSpeech(opponent, 'player_win');

        const rec: GomokuRecord = {
          id: 'rec_' + Date.now(),
          timestamp: Date.now(),
          mode: 'pve',
          playerColor,
          opponentId: opponent.id,
          opponentName: opponent.name,
          opponentAvatar: opponent.avatar,
          difficulty,
          result: 'win',
          totalMoves: movesHistory.length + 1,
          durationSec: duration,
        };
        onGameFinish?.(rec);
      } else if (winner === (playerColor === 'black' ? 'white' : 'black')) {
        setGameResult('ai_win');
        if (soundEnabled) gomokuAudio.playLossSound();
        triggerAiSpeech(opponent, 'ai_win');

        const rec: GomokuRecord = {
          id: 'rec_' + Date.now(),
          timestamp: Date.now(),
          mode: 'pve',
          playerColor,
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
        setGameResult('draw');
        triggerAiSpeech(opponent, 'draw');

        const rec: GomokuRecord = {
          id: 'rec_' + Date.now(),
          timestamp: Date.now(),
          mode: 'pve',
          playerColor,
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
      const winnerChar = winner === ai1Color ? opponent : ai2Opponent;
      const loserChar = winner === ai1Color ? ai2Opponent : opponent;

      if (winner === 'draw') {
        setGameResult('draw');
        setSpeechBubble({
          text: `双方旗鼓相当，平局收场！`,
          speakerName: opponent.name,
          speakerAvatar: opponent.avatar,
        });
      } else {
        const resultType = winner === ai1Color ? 'ai1_win' : 'ai2_win';
        setGameResult(resultType);
        if (soundEnabled) gomokuAudio.playWinSound();
        setSpeechBubble({
          text: `${winnerChar.name}：“承让啦，这局是我胜出！”`,
          speakerName: winnerChar.name,
          speakerAvatar: winnerChar.avatar,
        });
      }

      const rec: GomokuRecord = {
        id: 'rec_' + Date.now(),
        timestamp: Date.now(),
        mode: 'eve',
        playerColor: 'black',
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentAvatar: opponent.avatar,
        ai2Id: ai2Opponent.id,
        ai2Name: ai2Opponent.name,
        ai2Avatar: ai2Opponent.avatar,
        difficulty,
        result: winner === 'draw' ? 'draw' : winner === ai1Color ? 'ai1_win' : 'ai2_win',
        totalMoves: movesHistory.length + 1,
        durationSec: duration,
      };
      onGameFinish?.(rec);
    }
  };

  // Place a stone on board
  const placePiece = (r: number, c: number, color: 'black' | 'white'): boolean => {
    if (board[r][c] !== null || isGameOver) return false;

    // Clone board & place
    const nextBoard = board.map((row) => [...row]);
    nextBoard[r][c] = color;
    setBoard(nextBoard);

    const newMove: GomokuMove = {
      r,
      c,
      color,
      order: movesHistory.length + 1,
    };
    const updatedMoves = [...movesHistory, newMove];
    setMovesHistory(updatedMoves);

    // Audio & vibration
    playMoveFeedback(color === 'white');

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

    // Next Turn
    const nextTurn = color === 'black' ? 'white' : 'black';
    setCurrentTurn(nextTurn);
    return true;
  };

  // User Tap on Board (PvE mode)
  const handleCellClick = (r: number, c: number) => {
    if (gameMode !== 'pve') return;
    if (isGameOver || isAiThinking) return;
    if (currentTurn !== playerColor) return;
    if (board[r][c] !== null) return;

    // Place player move
    const success = placePiece(r, c, playerColor);
    if (!success) return;

    // Check if player formed threat for AI dialogue
    const tempBoard = board.map((row) => [...row]);
    tempBoard[r][c] = playerColor;
    const threat = analyzePlayerThreats(tempBoard, playerColor);
    if (threat.hasOpen4 || threat.has4 || threat.hasOpen3) {
      triggerAiSpeech(opponent, 'player_threat', { r, c });
    }
  };

  // AI Move Runner (PvE AI turn or EvE turns)
  useEffect(() => {
    if (isGameOver) return;

    // PvE: AI Turn
    if (gameMode === 'pve' && currentTurn !== playerColor && !isAiThinking) {
      setIsAiThinking(true);
      setThinkingName(opponent.name);

      const aiColor = playerColor === 'black' ? 'white' : 'black';

      // Small delay for thinking feel (400ms ~ 800ms)
      const thinkTimer = setTimeout(() => {
        const best = getBestMove(board, aiColor, difficulty);
        setIsAiThinking(false);

        const ok = placePiece(best.r, best.c, aiColor);
        if (ok) {
          if (best.threatLevel === 'four' || best.threatLevel === 'three') {
            triggerAiSpeech(opponent, 'ai_attack', { r: best.r, c: best.c });
          } else if (best.threatLevel === 'block_win' || best.threatLevel === 'block_four') {
            triggerAiSpeech(opponent, 'player_threat', { r: best.r, c: best.c });
          }
        }
      }, 550);

      return () => clearTimeout(thinkTimer);
    }

    // EvE: AI vs AI automated loop
    if (gameMode === 'eve' && isAutoPlaying && !isAiThinking) {
      const activeChar = currentTurn === ai1Color ? opponent : ai2Opponent;
      setIsAiThinking(true);
      setThinkingName(activeChar.name);

      const eveTimer = setTimeout(() => {
        const best = getBestMove(board, currentTurn, difficulty);
        setIsAiThinking(false);
        placePiece(best.r, best.c, currentTurn);

        // Occasional dialogue during duel
        if (Math.random() < 0.35) {
          triggerAiSpeech(activeChar, 'normal_move', { r: best.r, c: best.c });
        }
      }, 700);

      return () => clearTimeout(eveTimer);
    }
  }, [currentTurn, gameMode, isGameOver, isAutoPlaying, playerColor, board]);

  // Undo Move (悔棋) in PvE
  const handleUndo = () => {
    if (gameMode !== 'pve') return;
    if (movesHistory.length < 2 || isAiThinking || isGameOver) return;

    // Undo both AI and Player last move
    const newHistory = movesHistory.slice(0, movesHistory.length - 2);
    const newBoard = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(null));

    newHistory.forEach((m) => {
      newBoard[m.r][m.c] = m.color;
    });

    setBoard(newBoard);
    setMovesHistory(newHistory);
    setCurrentTurn(playerColor);
    setSpeechBubble({
      text: `${opponent.name}：“准你悔一步棋哦，重新下吧~”`,
      speakerName: opponent.name,
      speakerAvatar: opponent.avatar,
    });
  };

  // Last Move Position
  const lastMove = movesHistory[movesHistory.length - 1];

  // Star Points for standard 15x15 Go board
  const starPoints = useMemo(() => {
    return [
      { r: 3, c: 3 },
      { r: 11, c: 3 },
      { r: 7, c: 7 }, // Tian Yuan (天元)
      { r: 3, c: 11 },
      { r: 11, c: 11 },
    ];
  }, []);

  const isStarPoint = (r: number, c: number) => {
    return starPoints.some((p) => p.r === r && p.c === c);
  };

  const isWinningCell = (r: number, c: number) => {
    if (!winningLine) return false;
    return winningLine.some((p) => p.r === r && p.c === c);
  };

  // Format Elapsed Time MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Top App Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>

        <div className="flex items-center gap-1.5 font-bold text-sm text-zinc-100">
          <Swords className="w-4 h-4 text-orange-400" />
          <span>五子棋 (Gomoku)</span>
        </div>

        {/* Sound Toggle */}
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

      {/* Opponent Info & Game Header Banner */}
      <div className="px-3 pt-2.5 pb-2 bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-zinc-800/80 shrink-0 space-y-2">
        {/* Mode Switcher & Difficulty Bar */}
        <div className="flex items-center justify-between gap-2">
          {/* Game Mode Pills */}
          <div className="flex bg-zinc-800/90 p-0.5 rounded-xl border border-zinc-700/60 text-[11px]">
            <button
              onClick={() => handleModeSwitch('pve')}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                gameMode === 'pve' ? 'bg-orange-500 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <User className="w-3 h-3" />
              <span>玩家 vs AI</span>
            </button>
            <button
              onClick={() => handleModeSwitch('eve')}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                gameMode === 'eve' ? 'bg-orange-500 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
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
              onChange={(e) => setDifficulty(e.target.value as GomokuDifficulty)}
              className="bg-transparent text-zinc-200 text-[11px] focus:outline-none font-medium cursor-pointer"
            >
              <option value="easy" className="bg-zinc-900 text-zinc-200">
                简单 (新手入门)
              </option>
              <option value="normal" className="bg-zinc-900 text-zinc-200">
                普通 (攻守兼备)
              </option>
              <option value="hard" className="bg-zinc-900 text-zinc-200">
                困难 (强力封堵)
              </option>
            </select>
          </div>
        </div>

        {/* Character Card / Duel Display */}
        <div className="flex items-center justify-between p-2 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
          {gameMode === 'pve' ? (
            <>
              {/* Player side */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs shadow">
                    我
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-white shadow">
                    ⚫
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-200">玩家 (执黑)</div>
                  <div className="text-[10px] text-zinc-400">先手落子</div>
                </div>
              </div>

              {/* Turn & Status Indicator */}
              <div className="text-center">
                {isGameOver ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                    对局结束
                  </span>
                ) : isAiThinking ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/40 animate-pulse flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    AI思考中...
                  </span>
                ) : currentTurn === playerColor ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                    你的回合 (⚫)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-medium border border-zinc-700">
                    对方回合 (⚪)
                  </span>
                )}
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  第 {movesHistory.length} 手 · {formatTime(elapsedSeconds)}
                </div>
              </div>

              {/* AI Opponent side */}
              <div className="flex items-center gap-2 text-right">
                <div>
                  <div className="text-xs font-bold text-zinc-200 flex items-center justify-end gap-1">
                    <span>{opponent.name}</span>
                  </div>
                  <div className="text-[10px] text-orange-400/90 truncate max-w-[70px]">
                    {opponent.tags?.[0] || 'AI对手'}
                  </div>
                </div>
                <div className="relative">
                  <img
                    src={opponent.avatar}
                    alt={opponent.name}
                    className="w-9 h-9 rounded-full object-cover border border-orange-500/40 shadow"
                  />
                  <span className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-zinc-100 border border-zinc-300 flex items-center justify-center text-[9px] font-bold text-zinc-900 shadow">
                    ⚪
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
                  className="w-8 h-8 rounded-full object-cover border border-orange-500/40"
                />
                <div>
                  <div className="text-xs font-bold text-zinc-200">{opponent.name}</div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {ai1Color === 'black' ? '⚫ 执黑' : '⚪ 执白'}
                  </div>
                </div>
              </div>

              <div className="text-center px-2">
                <div className="text-[11px] font-bold text-orange-400 flex items-center justify-center gap-1">
                  <Swords className="w-3.5 h-3.5" />
                  <span>AI 对决</span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  第 {movesHistory.length} 手 · {formatTime(elapsedSeconds)}
                </div>
              </div>

              <div className="flex items-center gap-2 text-right">
                <div>
                  <div className="text-xs font-bold text-zinc-200">{ai2Opponent.name}</div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {ai2Color === 'black' ? '⚫ 执黑' : '⚪ 执白'}
                  </div>
                </div>
                <img
                  src={ai2Opponent.avatar}
                  alt={ai2Opponent.name}
                  className="w-8 h-8 rounded-full object-cover border border-cyan-500/40"
                />
              </div>
            </div>
          )}
        </div>

        {/* Live In-Character Speech Bubble */}
        <div className="p-2 rounded-xl bg-zinc-900/80 border border-orange-500/20 flex items-center gap-2 text-[11px]">
          <img
            src={speechBubble.speakerAvatar}
            alt={speechBubble.speakerName}
            className="w-5 h-5 rounded-full object-cover shrink-0 border border-orange-400/50"
          />
          <div className="flex-1 text-zinc-300 truncate font-sans">{speechBubble.text}</div>
        </div>
      </div>

      {/* Main Board Container (Interactive 15x15 Go Board) */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 relative overflow-hidden bg-zinc-950">
        {/* Wooden Board Container */}
        <div
          ref={boardRef}
          className="relative w-full max-w-[360px] aspect-square rounded-2xl p-2.5 shadow-2xl border-4 border-[#8B5A2B] bg-gradient-to-br from-[#E2B77B] via-[#D5A768] to-[#C49455] select-none flex flex-col justify-between"
          style={{
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.6), inset 0 0 20px rgba(110,65,25,0.3)',
          }}
        >
          {/* 15x15 Grid Layout */}
          <div className="relative w-full h-full grid grid-cols-15 grid-rows-15">
            {/* Grid Line SVG Background */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 300">
              {Array.from({ length: BOARD_SIZE }).map((_, i) => {
                const pos = (i + 0.5) * (300 / BOARD_SIZE);
                return (
                  <React.Fragment key={i}>
                    {/* Horizontal Line */}
                    <line
                      x1={300 / BOARD_SIZE / 2}
                      y1={pos}
                      x2={300 - 300 / BOARD_SIZE / 2}
                      y2={pos}
                      stroke="#6B421E"
                      strokeWidth="1.2"
                      opacity="0.8"
                    />
                    {/* Vertical Line */}
                    <line
                      x1={pos}
                      y1={300 / BOARD_SIZE / 2}
                      x2={pos}
                      y2={300 - 300 / BOARD_SIZE / 2}
                      stroke="#6B421E"
                      strokeWidth="1.2"
                      opacity="0.8"
                    />
                  </React.Fragment>
                );
              })}

              {/* Star Points (天元与星位) */}
              {starPoints.map((p, idx) => {
                const cx = (p.c + 0.5) * (300 / BOARD_SIZE);
                const cy = (p.r + 0.5) * (300 / BOARD_SIZE);
                return <circle key={idx} cx={cx} cy={cy} r="2.8" fill="#5C3317" />;
              })}

              {/* Winning Line Overlay Indicator */}
              {winningLine && winningLine.length >= 5 && (
                <line
                  x1={(winningLine[0].c + 0.5) * (300 / BOARD_SIZE)}
                  y1={(winningLine[0].r + 0.5) * (300 / BOARD_SIZE)}
                  x2={(winningLine[winningLine.length - 1].c + 0.5) * (300 / BOARD_SIZE)}
                  y2={(winningLine[winningLine.length - 1].r + 0.5) * (300 / BOARD_SIZE)}
                  stroke="#FFD700"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  className="animate-pulse"
                />
              )}
            </svg>

            {/* Interactive Cell Nodes & Stones */}
            {board.map((row, r) =>
              row.map((cell, c) => {
                const isLast = lastMove && lastMove.r === r && lastMove.c === c;
                const isWin = isWinningCell(r, c);
                const moveObj = movesHistory.find((m) => m.r === r && m.c === c);

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleCellClick(r, c)}
                    className="relative w-full h-full flex items-center justify-center cursor-pointer group"
                  >
                    {/* Hover ghost piece on empty cell during player turn */}
                    {!cell && currentTurn === playerColor && gameMode === 'pve' && !isGameOver && !isAiThinking && (
                      <div className="w-[72%] h-[72%] rounded-full bg-black/15 opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none" />
                    )}

                    {/* Actual Placed Stone */}
                    {cell && (
                      <div
                        className={`relative w-[84%] h-[84%] rounded-full transition-transform duration-150 flex items-center justify-center ${
                          cell === 'black'
                            ? 'bg-gradient-to-br from-zinc-800 via-zinc-900 to-black text-zinc-300 shadow-md'
                            : 'bg-gradient-to-br from-white via-zinc-100 to-zinc-300 text-zinc-700 shadow-md'
                        } ${isWin ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black scale-105 animate-bounce' : ''}`}
                        style={{
                          boxShadow:
                            cell === 'black'
                              ? '1px 2px 4px rgba(0,0,0,0.6), inset -1px -1px 2px rgba(255,255,255,0.2)'
                              : '1px 2px 4px rgba(0,0,0,0.4), inset -1px -1px 2px rgba(0,0,0,0.15)',
                        }}
                      >
                        {/* 3D Gloss highlight */}
                        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-white/40 blur-[0.4px] pointer-events-none" />

                        {/* Last Move Indicator Ring/Dot */}
                        {isLast && !isWin && (
                          <div
                            className={`w-2 h-2 rounded-full ${
                              cell === 'black' ? 'bg-amber-400' : 'bg-rose-500'
                            } shadow-xs animate-ping`}
                          />
                        )}

                        {/* Move Order Number Tag (toggleable) */}
                        {showMoveNumbers && moveObj && (
                          <span
                            className={`text-[8px] font-mono font-bold select-none ${
                              cell === 'black' ? 'text-zinc-300' : 'text-zinc-800'
                            }`}
                          >
                            {moveObj.order}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* VICTORY / DEFEAT MODAL OVERLAY BANNER */}
        {isGameOver && gameResult && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-40 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-orange-500/50 p-5 text-center text-white shadow-2xl space-y-3.5">
              {/* Outcome Trophy / Icon */}
              <div
                className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
                  gameResult === 'player_win' || gameResult === 'ai1_win'
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950'
                    : gameResult === 'draw'
                    ? 'bg-zinc-800 text-zinc-300'
                    : 'bg-gradient-to-br from-rose-500 to-red-700 text-white'
                }`}
              >
                {gameResult === 'player_win' || gameResult === 'ai1_win' ? (
                  <Trophy className="w-8 h-8 animate-bounce" />
                ) : gameResult === 'draw' ? (
                  <Swords className="w-8 h-8" />
                ) : (
                  <Bot className="w-8 h-8" />
                )}
              </div>

              {/* Outcome Main Banner Heading */}
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  {gameResult === 'player_win'
                    ? '你赢了！🎉'
                    : gameResult === 'ai_win'
                    ? '这局是我赢啦。'
                    : gameResult === 'draw'
                    ? '平局，再来一局？'
                    : gameResult === 'ai1_win'
                    ? `${opponent.name} 获胜！`
                    : `${ai2Opponent.name} 获胜！`}
                </h3>
                <p className="text-xs text-orange-300 font-medium pt-1">{speechBubble.text}</p>
              </div>

              {/* Match Stat Summary */}
              <div className="grid grid-cols-3 gap-1.5 p-2 rounded-2xl bg-zinc-800/80 text-[10px] text-zinc-300">
                <div>
                  <div className="text-zinc-500">对手</div>
                  <div className="font-bold text-zinc-200 truncate">{opponent.name}</div>
                </div>
                <div>
                  <div className="text-zinc-500">总手数</div>
                  <div className="font-bold text-zinc-200">{movesHistory.length} 手</div>
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
                  className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-md transition active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>再来一局</span>
                </button>
                <button
                  onClick={onBack}
                  className="w-full py-2 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-medium transition"
                >
                  返回游戏大厅
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          {/* Restart */}
          <button
            onClick={() => handleRestart()}
            className="flex-1 py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center justify-center gap-1 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
            <span>重新开始</span>
          </button>

          {/* Undo Move (PvE only) */}
          {gameMode === 'pve' ? (
            <button
              onClick={handleUndo}
              disabled={movesHistory.length < 2 || isAiThinking || isGameOver}
              className="flex-1 py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center justify-center gap-1 transition disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5 text-amber-400" />
              <span>悔棋</span>
            </button>
          ) : (
            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              className="flex-1 py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium flex items-center justify-center gap-1 transition"
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>暂停对决</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>继续对决</span>
                </>
              )}
            </button>
          )}

          {/* Number tags toggle */}
          <button
            onClick={() => setShowMoveNumbers(!showMoveNumbers)}
            className={`py-2 px-2.5 rounded-xl font-medium flex items-center justify-center gap-1 transition ${
              showMoveNumbers ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-zinc-800 text-zinc-400'
            }`}
            title="显示手数序号"
          >
            <Hash className="w-3.5 h-3.5" />
            <span>手数</span>
          </button>

          {/* Exit Game */}
          <button
            onClick={onBack}
            className="py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-rose-300 transition"
            title="退出游戏"
          >
            <span>退出</span>
          </button>
        </div>
      </div>
    </div>
  );
};
