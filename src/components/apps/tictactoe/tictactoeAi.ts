import { TicTacToePiece, TicTacToeDifficulty } from '../../../types';

export const WINNING_LINES: [number, number, number][] = [
  [0, 1, 2], // Row 1
  [3, 4, 5], // Row 2
  [6, 7, 8], // Row 3
  [0, 3, 6], // Col 1
  [1, 4, 7], // Col 2
  [2, 5, 8], // Col 3
  [0, 4, 8], // Main diag
  [2, 4, 6], // Anti diag
];

export interface WinResult {
  winner: 'X' | 'O';
  line: [number, number, number];
}

export interface TicTacToeMoveAnalysis {
  index: number;
  r: number;
  c: number;
  actionType: 'win' | 'block' | 'attack' | 'normal';
}

/**
 * Check if someone has won the 3x3 board
 */
export function checkWinner(board: TicTacToePiece[]): WinResult | null {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return {
        winner: board[a] as 'X' | 'O',
        line: [a, b, c],
      };
    }
  }
  return null;
}

/**
 * Check if the board is completely filled
 */
export function isBoardFull(board: TicTacToePiece[]): boolean {
  return board.every((cell) => cell !== null);
}

/**
 * Check if a specific player has an immediate winning threat (2 pieces in a line with 1 empty cell)
 */
export function checkImmediateThreat(
  board: TicTacToePiece[],
  symbol: 'X' | 'O'
): { hasThreat: boolean; winIndex: number | null; line: [number, number, number] | null } {
  for (const [a, b, c] of WINNING_LINES) {
    const lineVals = [board[a], board[b], board[c]];
    const countSymbol = lineVals.filter((v) => v === symbol).length;
    const countEmpty = lineVals.filter((v) => v === null).length;

    if (countSymbol === 2 && countEmpty === 1) {
      const emptyIdx = [a, b, c].find((idx) => board[idx] === null)!;
      return {
        hasThreat: true,
        winIndex: emptyIdx,
        line: [a, b, c],
      };
    }
  }
  return { hasThreat: false, winIndex: null, line: null };
}

/**
 * Minimax algorithm for optimal TicTacToe play
 */
function minimax(
  board: TicTacToePiece[],
  depth: number,
  isMaximizing: boolean,
  aiSymbol: 'X' | 'O'
): number {
  const oppSymbol: 'X' | 'O' = aiSymbol === 'X' ? 'O' : 'X';
  const win = checkWinner(board);

  if (win) {
    if (win.winner === aiSymbol) return 10 - depth;
    if (win.winner === oppSymbol) return depth - 10;
  }

  if (isBoardFull(board)) return 0;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = aiSymbol;
        const evalScore = minimax(board, depth + 1, false, aiSymbol);
        board[i] = null;
        maxEval = Math.max(maxEval, evalScore);
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = oppSymbol;
        const evalScore = minimax(board, depth + 1, true, aiSymbol);
        board[i] = null;
        minEval = Math.min(minEval, evalScore);
      }
    }
    return minEval;
  }
}

/**
 * Compute the best move for AI
 */
export function getBestMove(
  board: TicTacToePiece[],
  aiSymbol: 'X' | 'O',
  difficulty: TicTacToeDifficulty
): TicTacToeMoveAnalysis {
  const oppSymbol: 'X' | 'O' = aiSymbol === 'X' ? 'O' : 'X';
  const availableIndices = board
    .map((val, idx) => (val === null ? idx : null))
    .filter((idx): idx is number => idx !== null);

  if (availableIndices.length === 0) {
    return { index: 0, r: 0, c: 0, actionType: 'normal' };
  }

  // Check if AI can win in 1 move
  const aiWinThreat = checkImmediateThreat(board, aiSymbol);
  // Check if Opponent can win in 1 move (AI must block)
  const oppWinThreat = checkImmediateThreat(board, oppSymbol);

  // EASY DIFFICULTY: Mostly random, occasionally blocks or wins
  if (difficulty === 'easy') {
    if (aiWinThreat.hasThreat && Math.random() < 0.6) {
      const idx = aiWinThreat.winIndex!;
      return { index: idx, r: Math.floor(idx / 3), c: idx % 3, actionType: 'win' };
    }
    if (oppWinThreat.hasThreat && Math.random() < 0.45) {
      const idx = oppWinThreat.winIndex!;
      return { index: idx, r: Math.floor(idx / 3), c: idx % 3, actionType: 'block' };
    }
    const randIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return { index: randIdx, r: Math.floor(randIdx / 3), c: randIdx % 3, actionType: 'normal' };
  }

  // NORMAL DIFFICULTY: Always takes immediate win, 85% blocks opponent, favors center & corners
  if (difficulty === 'normal') {
    if (aiWinThreat.hasThreat) {
      const idx = aiWinThreat.winIndex!;
      return { index: idx, r: Math.floor(idx / 3), c: idx % 3, actionType: 'win' };
    }
    if (oppWinThreat.hasThreat && Math.random() < 0.85) {
      const idx = oppWinThreat.winIndex!;
      return { index: idx, r: Math.floor(idx / 3), c: idx % 3, actionType: 'block' };
    }
    // Take center if available
    if (board[4] === null && Math.random() < 0.75) {
      return { index: 4, r: 1, c: 1, actionType: 'attack' };
    }
    // Take corners if available
    const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
    if (corners.length > 0 && Math.random() < 0.6) {
      const cIdx = corners[Math.floor(Math.random() * corners.length)];
      return { index: cIdx, r: Math.floor(cIdx / 3), c: cIdx % 3, actionType: 'normal' };
    }
    const randIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return { index: randIdx, r: Math.floor(randIdx / 3), c: randIdx % 3, actionType: 'normal' };
  }

  // HARD DIFFICULTY: Minimax (Optimal strategy, never makes obvious mistakes)
  let bestScore = -Infinity;
  let bestIndex = availableIndices[0];
  let actionType: 'win' | 'block' | 'attack' | 'normal' = 'normal';

  // Immediate check for win/block actionType classification
  if (aiWinThreat.hasThreat) {
    bestIndex = aiWinThreat.winIndex!;
    actionType = 'win';
  } else if (oppWinThreat.hasThreat) {
    bestIndex = oppWinThreat.winIndex!;
    actionType = 'block';
  } else {
    for (const idx of availableIndices) {
      board[idx] = aiSymbol;
      const score = minimax(board, 0, false, aiSymbol);
      board[idx] = null;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx;
        if (idx === 4) {
          actionType = 'attack';
        } else if ([0, 2, 6, 8].includes(idx)) {
          actionType = 'attack';
        } else {
          actionType = 'normal';
        }
      }
    }
  }

  return {
    index: bestIndex,
    r: Math.floor(bestIndex / 3),
    c: bestIndex % 3,
    actionType,
  };
}
