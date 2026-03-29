/* ================================================================
   CHECKERS — AI MODULE
   Pure functions only. No DOM access, no global state.
   Exported as globals for game.js to consume.
   ================================================================ */

/* ----------------------------------------------------------------
   CONSTANTS
   ---------------------------------------------------------------- */
const EMPTY      = 0;
const LIGHT      = 1;
const DARK       = 2;
const LIGHT_KING = 3;
const DARK_KING  = 4;

/* ----------------------------------------------------------------
   PIECE HELPERS
   ---------------------------------------------------------------- */
function isLight(p)      { return p === LIGHT || p === LIGHT_KING; }
function isDark(p)       { return p === DARK  || p === DARK_KING;  }
function isKing(p)       { return p === LIGHT_KING || p === DARK_KING; }
function colorOf(p)      { return isLight(p) ? LIGHT : (isDark(p) ? DARK : EMPTY); }
function sameColor(a, b) { return colorOf(a) === colorOf(b) && colorOf(a) !== EMPTY; }
function opponent(color) { return color === LIGHT ? DARK : LIGHT; }

/* ----------------------------------------------------------------
   MOVE GENERATION
   ---------------------------------------------------------------- */

/** Single-step captures from (r, c). Returns [{r, c, captured:{r,c}}] */
function getCaptures(r, c, boardState) {
  const piece = boardState[r][c];
  const color = colorOf(piece);
  const king  = isKing(piece);

  const dirs = king
    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
    : (color === LIGHT ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);

  const captures = [];
  for (const [dr, dc] of dirs) {
    const mr = r + dr, mc = c + dc;
    const lr = r + 2*dr, lc = c + 2*dc;
    if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
    if (boardState[mr][mc] === EMPTY) continue;
    if (sameColor(boardState[mr][mc], piece)) continue;
    if (boardState[lr][lc] !== EMPTY) continue;
    captures.push({ r: lr, c: lc, captured: { r: mr, c: mc } });
  }
  return captures;
}

/** Full capture chains (multi-jump) from (r, c). */
function getCaptureChains(r, c, boardState, path = []) {
  const captures = getCaptures(r, c, boardState);
  if (captures.length === 0) return path.length > 0 ? [path] : [];

  let chains = [];
  for (const cap of captures) {
    const nb = boardState.map(row => [...row]);
    nb[cap.r][cap.c] = nb[r][c];
    nb[r][c] = EMPTY;
    nb[cap.captured.r][cap.captured.c] = EMPTY;
    // King promotion mid-chain
    if (cap.r === 0 && colorOf(nb[cap.r][cap.c]) === LIGHT) nb[cap.r][cap.c] = LIGHT_KING;
    else if (cap.r === 7 && colorOf(nb[cap.r][cap.c]) === DARK) nb[cap.r][cap.c] = DARK_KING;

    const sub = getCaptureChains(cap.r, cap.c, nb, [...path, cap]);
    chains = chains.concat(sub.length === 0 ? [[...path, cap]] : sub);
  }
  return chains;
}

/** Simple (non-capture) moves from (r, c). */
function getSimpleMoves(r, c, boardState) {
  const piece = boardState[r][c];
  const color = colorOf(piece);
  const king  = isKing(piece);
  const dirs  = king
    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
    : (color === LIGHT ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);

  const moves = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
    if (boardState[nr][nc] !== EMPTY) continue;
    moves.push({ r: nr, c: nc, captures: [] });
  }
  return moves;
}

/**
 * All legal moves for a color.
 * Captures are mandatory; longest chain preferred.
 * Returns: [{ from:{r,c}, to:{r,c}, captures:[{r,c},...], chain:[...] }]
 */
function getAllMoves(color, boardState) {
  let allCaptures = [], allSimple = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (colorOf(boardState[r][c]) !== color) continue;

      const chains = getCaptureChains(r, c, boardState);
      for (const chain of chains) {
        const last = chain[chain.length - 1];
        allCaptures.push({
          from: { r, c },
          to: { r: last.r, c: last.c },
          captures: chain.map(s => s.captured),
          chain
        });
      }

      for (const mv of getSimpleMoves(r, c, boardState)) {
        allSimple.push({ from: { r, c }, to: { r: mv.r, c: mv.c }, captures: [], chain: [] });
      }
    }
  }

  if (allCaptures.length > 0) {
    const maxLen = Math.max(...allCaptures.map(m => m.captures.length));
    return allCaptures.filter(m => m.captures.length === maxLen);
  }
  return allSimple;
}

/** All legal moves for a specific piece at (r, c). */
function getMovesForPiece(r, c, boardState) {
  const color = colorOf(boardState[r][c]);
  return getAllMoves(color, boardState).filter(m => m.from.r === r && m.from.c === c);
}

/* ----------------------------------------------------------------
   BOARD EXECUTION (for minimax — mutates a copy)
   ---------------------------------------------------------------- */
function executeMoveOnBoard(b, move) {
  const piece = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = EMPTY;
  for (const cap of move.captures) b[cap.r][cap.c] = EMPTY;
  b[move.to.r][move.to.c] = piece;
  if (move.to.r === 0 && piece === LIGHT) b[move.to.r][move.to.c] = LIGHT_KING;
  else if (move.to.r === 7 && piece === DARK) b[move.to.r][move.to.c] = DARK_KING;
}

/* ----------------------------------------------------------------
   EVALUATION HEURISTIC
   ---------------------------------------------------------------- */
function evaluateBoard(boardState, aiColor, playerColor) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (p === EMPTY) continue;

      const isAI = colorOf(p) === aiColor;
      const mult = isAI ? 1 : -1;

      if (isKing(p)) {
        score += 8 * mult;
      } else {
        score += 5 * mult;
        // Advance bonus (approach king row)
        if (isAI) {
          const advance = aiColor === DARK ? r : (7 - r);
          score += advance * 0.4;
        } else {
          const advance = playerColor === DARK ? r : (7 - r);
          score -= advance * 0.3;
        }
      }

      // Center control bonus
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) score += 0.3 * mult;

      // Back-row protection (prevents giving up pieces from home row)
      if (isAI && !isKing(p)) {
        if ((aiColor === DARK && r === 0) || (aiColor === LIGHT && r === 7)) score += 0.5;
      }
    }
  }
  return score;
}

/* ----------------------------------------------------------------
   MINIMAX WITH ALPHA-BETA PRUNING
   ---------------------------------------------------------------- */
function minimaxAB(boardState, depth, alpha, beta, isMaximizing, aiColor, playerColor) {
  const color = isMaximizing ? aiColor : playerColor;
  const moves = getAllMoves(color, boardState);

  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) return isMaximizing ? -100 : 100;
    return evaluateBoard(boardState, aiColor, playerColor);
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const nb = boardState.map(row => [...row]);
      executeMoveOnBoard(nb, move);
      best = Math.max(best, minimaxAB(nb, depth - 1, alpha, beta, false, aiColor, playerColor));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const nb = boardState.map(row => [...row]);
      executeMoveOnBoard(nb, move);
      best = Math.min(best, minimaxAB(nb, depth - 1, alpha, beta, true, aiColor, playerColor));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/* ----------------------------------------------------------------
   PUBLIC ENTRY POINT
   ---------------------------------------------------------------- */
/**
 * Returns the best move for aiColor, or null if no moves available.
 * @param {number[][]} boardState - 8×8 board array
 * @param {number}     aiColor     - LIGHT or DARK
 * @param {number}     playerColor - LIGHT or DARK
 * @param {number}     depth       - search depth (1=easy, 3=medium, 5=hard, 7=expert)
 */
function getBestMove(boardState, aiColor, playerColor, depth) {
  const moves = getAllMoves(aiColor, boardState);
  if (moves.length === 0) return null;

  // Easy: random half the time for a beatable opponent
  if (depth <= 1 && Math.random() < 0.5) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let bestScore = -Infinity;
  let bestMove  = moves[0];

  for (const move of moves) {
    const nb = boardState.map(row => [...row]);
    executeMoveOnBoard(nb, move);
    const score = minimaxAB(nb, depth - 1, -Infinity, Infinity, false, aiColor, playerColor);
    if (score > bestScore) {
      bestScore = score;
      bestMove  = move;
    }
  }

  return bestMove;
}
