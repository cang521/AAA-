import { GomokuPiece, GomokuDifficulty } from '../../../types';

export const BOARD_SIZE = 15;

export interface BoardPos {
  r: number;
  c: number;
}

export interface WinResult {
  winner: 'black' | 'white';
  line: BoardPos[];
}

export interface MoveAnalysis {
  r: number;
  c: number;
  score: number;
  threatLevel: 'win' | 'block_win' | 'four' | 'block_four' | 'three' | 'block_three' | 'normal';
}

// 4 Directions: Horizontal, Vertical, Main Diagonal (\), Anti-Diagonal (/)
const DIRECTIONS: [number, number][] = [
  [0, 1],  // Horizontal
  [1, 0],  // Vertical
  [1, 1],  // Main diagonal (\)
  [1, -1], // Anti-diagonal (/)
];

/**
 * Check if a player has 5 in a row
 */
export function checkWinner(board: GomokuPiece[][]): WinResult | null {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const color = board[r][c];
      if (!color) continue;

      for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        const line: BoardPos[] = [{ r, c }];

        // Look forward
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
          count++;
          line.push({ r: nr, c: nc });
          nr += dr;
          nc += dc;
        }

        if (count >= 5) {
          return {
            winner: color,
            line: line.slice(0, 5),
          };
        }
      }
    }
  }
  return null;
}

/**
 * Check if the board is full (draw condition)
 */
export function isBoardFull(board: GomokuPiece[][]): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) return false;
    }
  }
  return true;
}

/**
 * Evaluate single directional line pattern for a given player
 */
function evaluateDirection(
  board: GomokuPiece[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: 'black' | 'white'
): number {
  const oppColor: 'black' | 'white' = color === 'black' ? 'white' : 'black';

  let count = 1;
  let block = 0;

  // Positive side
  let step = 1;
  while (step <= 4) {
    const nr = r + dr * step;
    const nc = c + dc * step;
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
      block++;
      break;
    }
    const val = board[nr][nc];
    if (val === color) {
      count++;
    } else if (val === null) {
      break;
    } else {
      block++;
      break;
    }
    step++;
  }

  // Negative side
  step = 1;
  while (step <= 4) {
    const nr = r - dr * step;
    const nc = c - dc * step;
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
      block++;
      break;
    }
    const val = board[nr][nc];
    if (val === color) {
      count++;
    } else if (val === null) {
      break;
    } else {
      block++;
      break;
    }
    step++;
  }

  if (block === 2 && count < 5) return 0; // Completely blocked on both ends

  if (count >= 5) return 1000000; // 5 in a row (Win)
  if (count === 4) {
    if (block === 0) return 100000; // Open 4 (活四)
    if (block === 1) return 12000;  // Rush 4 (冲四)
  }
  if (count === 3) {
    if (block === 0) return 8000;   // Open 3 (活三)
    if (block === 1) return 1500;   // Sleeping 3 (眠三)
  }
  if (count === 2) {
    if (block === 0) return 600;    // Open 2 (活二)
    if (block === 1) return 100;    // Sleeping 2 (眠二)
  }
  if (count === 1) {
    return 10;
  }
  return 0;
}

/**
 * Score a potential move at (r, c) for player `color`
 */
function scorePosition(
  board: GomokuPiece[][],
  r: number,
  c: number,
  color: 'black' | 'white'
): number {
  // Center distance bias (prefer central control)
  const centerR = 7;
  const centerC = 7;
  const dist = Math.abs(r - centerR) + Math.abs(c - centerC);
  const centerBonus = Math.max(0, 20 - dist);

  let totalScore = centerBonus;

  // Temporarily place the stone
  board[r][c] = color;

  for (const [dr, dc] of DIRECTIONS) {
    totalScore += evaluateDirection(board, r, c, dr, dc, color);
  }

  // Restore board
  board[r][c] = null;
  return totalScore;
}

/**
 * Check if the board is completely empty
 */
export function isBoardEmpty(board: GomokuPiece[][]): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null) return false;
    }
  }
  return true;
}

/**
 * Check if there is any neighbor piece within distance
 */
function hasNeighbor(board: GomokuPiece[][], r: number, c: number, radius = 2): boolean {
  const minR = Math.max(0, r - radius);
  const maxR = Math.min(BOARD_SIZE - 1, r + radius);
  const minC = Math.max(0, c - radius);
  const maxC = Math.min(BOARD_SIZE - 1, c + radius);

  for (let nr = minR; nr <= maxR; nr++) {
    for (let nc = minC; nc <= maxC; nc++) {
      if (board[nr][nc] !== null) return true;
    }
  }
  return false;
}

/**
 * Detect player threats (open 3, 4, 5) for AI dialog and commentary triggering
 */
export function analyzePlayerThreats(
  board: GomokuPiece[][],
  playerColor: 'black' | 'white'
): { has5: boolean; hasOpen4: boolean; has4: boolean; hasOpen3: boolean; threatLevel: string } {
  let has5 = false;
  let hasOpen4 = false;
  let has4 = false;
  let hasOpen3 = false;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== playerColor) continue;

      for (const [dr, dc] of DIRECTIONS) {
        const score = evaluateDirection(board, r, c, dr, dc, playerColor);
        if (score >= 1000000) has5 = true;
        else if (score >= 100000) hasOpen4 = true;
        else if (score >= 10000) has4 = true;
        else if (score >= 8000) hasOpen3 = true;
      }
    }
  }

  let threatLevel = 'none';
  if (has5 || hasOpen4) threatLevel = 'critical';
  else if (has4 || hasOpen3) threatLevel = 'high';

  return { has5, hasOpen4, has4, hasOpen3, threatLevel };
}

/**
 * Advanced AI Gomoku Move Selector
 */
export function getBestMove(
  board: GomokuPiece[][],
  aiColor: 'black' | 'white',
  difficulty: GomokuDifficulty
): MoveAnalysis {
  const humanColor: 'black' | 'white' = aiColor === 'black' ? 'white' : 'black';

  // First move of the game -> take center (7, 7)
  if (isBoardEmpty(board)) {
    return { r: 7, c: 7, score: 1000, threatLevel: 'normal' };
  }

  const candidateMoves: MoveAnalysis[] = [];

  // Defense weight vs Attack weight based on difficulty
  let attackWeight = 1.0;
  let defenseWeight = 1.0;

  if (difficulty === 'easy') {
    attackWeight = 0.8;
    defenseWeight = 0.7;
  } else if (difficulty === 'normal') {
    attackWeight = 1.1;
    defenseWeight = 1.0;
  } else {
    // Hard
    attackWeight = 1.25;
    defenseWeight = 1.15;
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null) continue;

      // Only search near existing pieces to optimize performance
      if (!hasNeighbor(board, r, c, 2)) continue;

      const myScore = scorePosition(board, r, c, aiColor);
      const oppScore = scorePosition(board, r, c, humanColor);

      // Determine move threat level
      let threatLevel: MoveAnalysis['threatLevel'] = 'normal';
      if (myScore >= 1000000) threatLevel = 'win';
      else if (oppScore >= 1000000) threatLevel = 'block_win';
      else if (myScore >= 100000) threatLevel = 'four';
      else if (oppScore >= 100000) threatLevel = 'block_four';
      else if (myScore >= 8000) threatLevel = 'three';
      else if (oppScore >= 8000) threatLevel = 'block_three';

      // Total combined positional evaluation
      // Immediate win / block win takes absolute priority
      let combinedScore = 0;
      if (myScore >= 1000000) {
        combinedScore = 20000000;
      } else if (oppScore >= 1000000) {
        combinedScore = 10000000;
      } else if (myScore >= 100000) {
        combinedScore = 5000000;
      } else if (oppScore >= 100000) {
        combinedScore = 2500000;
      } else {
        combinedScore = myScore * attackWeight + oppScore * defenseWeight;
      }

      // Add slight positional randomness for 'easy' or natural variety for 'normal'
      if (difficulty === 'easy') {
        const noise = (Math.random() - 0.5) * 500;
        combinedScore += noise;
      } else if (difficulty === 'normal') {
        const noise = (Math.random() - 0.5) * 100;
        combinedScore += noise;
      }

      candidateMoves.push({
        r,
        c,
        score: combinedScore,
        threatLevel,
      });
    }
  }

  // Sort candidate moves by score descending
  candidateMoves.sort((a, b) => b.score - a.score);

  if (candidateMoves.length === 0) {
    // Fallback search any empty cell
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === null) {
          return { r, c, score: 0, threatLevel: 'normal' };
        }
      }
    }
    return { r: 7, c: 7, score: 0, threatLevel: 'normal' };
  }

  // Decision selection based on difficulty
  if (difficulty === 'easy') {
    // If there's an immediate winning move or must-block win, do it 80% of time
    if (candidateMoves[0].score >= 10000000 && Math.random() < 0.85) {
      return candidateMoves[0];
    }
    // Pick randomly from top 3-5 candidates for casual easy feel
    const topN = Math.min(candidateMoves.length, 4);
    const selectedIdx = Math.floor(Math.random() * topN);
    return candidateMoves[selectedIdx];
  }

  if (difficulty === 'normal') {
    // If top move is high priority, take it
    if (candidateMoves[0].score >= 2500000) {
      return candidateMoves[0];
    }
    // Otherwise pick from top 2 with heavy bias towards #1
    if (candidateMoves.length >= 2 && Math.random() < 0.25) {
      return candidateMoves[1];
    }
    return candidateMoves[0];
  }

  // Hard: always take the highest evaluated tactical move
  return candidateMoves[0];
}
