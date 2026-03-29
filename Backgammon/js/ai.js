/* ===========================================================
   AI.JS — Full-turn enumeration, position evaluation, difficulty levels
   =========================================================== */

/* ===========================================================
   STATE HELPERS (operate on cloned state, not globals)
   =========================================================== */

function cloneBoard(b) {
  return b.map(p => ({ c: p.c, n: p.n }));
}

function getMoveDest_s(from, dieVal, color, b, br) {
  let dest;
  if (from === 24) {
    dest = color === 'w' ? 24 - dieVal : dieVal - 1;
  } else {
    dest = from + (color === 'w' ? -1 : 1) * dieVal;
  }

  /* Bearing off */
  if (color === 'w' && dest < 0) {
    if (!allInHome_s(color, b, br)) return null;
    if (dest === -1) return 'off';
    let hi = -1;
    for (let i = 5; i >= 0; i--) { if (b[i].c === 'w' && b[i].n > 0) { hi = i; break; } }
    return from === hi ? 'off' : null;
  }
  if (color === 'b' && dest > 23) {
    if (!allInHome_s(color, b, br)) return null;
    if (dest === 24) return 'off';
    let hi = -1;
    for (let i = 18; i <= 23; i++) { if (b[i].c === 'b' && b[i].n > 0) { hi = i; break; } }
    return from === hi ? 'off' : null;
  }

  if (dest < 0 || dest > 23) return null;
  if (b[dest].c !== null && b[dest].c !== color && b[dest].n >= 2) return null;
  return dest;
}

function allInHome_s(color, b, br) {
  if (br[color] > 0) return false;
  const [lo, hi] = color === 'w' ? [0, 5] : [18, 23];
  for (let i = 0; i < 24; i++) {
    if (b[i].c === color && b[i].n > 0 && (i < lo || i > hi)) return false;
  }
  return true;
}

function getValidMoves_s(color, b, br, of_, rem) {
  const moves   = [];
  const sources = [];
  if (br[color] > 0) {
    sources.push(24);
  } else {
    for (let i = 0; i < 24; i++) {
      if (b[i].c === color && b[i].n > 0) sources.push(i);
    }
  }
  const uniqueDice = [...new Set(rem)];
  for (const src of sources) {
    for (const d of uniqueDice) {
      const dest = getMoveDest_s(src, d, color, b, br);
      if (dest !== null) moves.push({ from: src, to: dest, die: d });
    }
  }
  return moves;
}

/** Apply a single move to cloned state; returns { b, br, of_, wasHit } */
function applyMove_s(b, br, of_, mv, color) {
  b  = cloneBoard(b);
  br = { ...br };
  of_ = { ...of_ };
  const { from, to, die } = mv;
  const opp = color === 'w' ? 'b' : 'w';

  if (from === 24) { br[color]--; }
  else { b[from].n--; if (b[from].n === 0) b[from].c = null; }

  let wasHit = false;
  if (to === 'off') {
    of_[color]++;
  } else {
    if (b[to].c === opp && b[to].n === 1) { b[to].n = 0; b[to].c = null; br[opp]++; wasHit = true; }
    b[to].c = color;
    b[to].n++;
  }
  return { b, br, of_, wasHit };
}

/* ===========================================================
   FULL TURN ENUMERATION
   =========================================================== */

/**
 * Enumerate all distinct complete turns (max-dice sequences).
 * Returns array of move-sequence arrays: [[{from,to,die}, ...], ...]
 */
function enumerateAllTurns(b, br, of_, color, diceValues) {
  const allSeqs = [];
  const seen    = new Set();

  function dfs(curB, curBr, curOf, remDice, seq) {
    const moves = getValidMoves_s(color, curB, curBr, curOf, remDice);
    if (moves.length === 0) {
      const key = boardKey(curB, curBr, curOf);
      if (!seen.has(key)) { seen.add(key); allSeqs.push([...seq]); }
      return;
    }
    for (const mv of moves) {
      const { b: nb, br: nbr, of_: nof } = applyMove_s(curB, curBr, curOf, mv, color);
      const newRem = [...remDice];
      newRem.splice(newRem.indexOf(mv.die), 1);
      seq.push(mv);
      dfs(nb, nbr, nof, newRem, seq);
      seq.pop();

      /* Limit blow-up for doubles */
      if (allSeqs.length > 8000) return;
    }
  }

  dfs(cloneBoard(b), { ...br }, { ...of_ }, [...diceValues], []);

  /* Keep only sequences that use the maximum number of dice */
  if (allSeqs.length === 0) return [[]];
  const maxLen = Math.max(...allSeqs.map(s => s.length));
  return allSeqs.filter(s => s.length === maxLen);
}

/** Compact key for a board state (for deduplication) */
function boardKey(b, br, of_) {
  return b.map(p => (p.c || '-') + p.n).join('') + `|${br.w},${br.b}|${of_.w},${of_.b}`;
}

/* ===========================================================
   POSITION EVALUATION
   =========================================================== */

function calcPip_s(b, br, color) {
  let pip = 0;
  for (let i = 0; i < 24; i++) {
    if (b[i].c === color && b[i].n > 0) {
      pip += b[i].n * (color === 'w' ? (i + 1) : (24 - i));
    }
  }
  pip += br[color] * 25;
  return pip;
}

function countBlots(b, color) {
  let count = 0;
  for (let i = 0; i < 24; i++) {
    if (b[i].c === color && b[i].n === 1) count++;
  }
  return count;
}

function longestPrime(b, color) {
  let best = 0, cur = 0;
  for (let i = 0; i < 24; i++) {
    if (b[i].c === color && b[i].n >= 2) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

function countHomePoints(b, color) {
  const [lo, hi] = color === 'w' ? [0, 5] : [18, 23];
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    if (b[i].c === color && b[i].n >= 2) count++;
  }
  return count;
}

function countAnchors(b, color) {
  const opp = color === 'w' ? 'b' : 'w';
  const [lo, hi] = opp === 'w' ? [0, 5] : [18, 23];
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    if (b[i].c === color && b[i].n >= 2) count++;
  }
  return count;
}

function blotExposure(b, br, color) {
  /* Rough heuristic: count blots in the first 12 points of opponent's direction */
  const opp = color === 'w' ? 'b' : 'w';
  let exposure = 0;
  for (let i = 0; i < 24; i++) {
    if (b[i].c === color && b[i].n === 1) {
      /* Weighted by distance into opponent's side */
      const oppDist = color === 'w' ? (24 - i) : (i + 1);
      if (oppDist <= 12) exposure += (12 - oppDist + 1);
    }
  }
  return exposure;
}

function distributionPenalty(b, color) {
  /* Penalize stacking more than 4 checkers on any point */
  let penalty = 0;
  for (let i = 0; i < 24; i++) {
    if (b[i].c === color && b[i].n > 4) penalty += (b[i].n - 4) * 2;
  }
  return penalty;
}

function evaluatePosition(b, br, of_, color) {
  const opp = color === 'w' ? 'b' : 'w';
  let score = 0;

  /* 1. Racing — pip advantage */
  const myPip  = calcPip_s(b, br, color);
  const oppPip = calcPip_s(b, br, opp);
  score += (oppPip - myPip) * 2;

  /* 2. Bearing off progress */
  score += of_[color]  * 15;
  score -= of_[opp]    * 10;

  /* 3. Pieces on bar */
  score -= br[color]   * 40;
  score += br[opp]     * 30;

  /* 4. Blots */
  score -= countBlots(b, color) * 8;
  score += countBlots(b, opp)   * 5;

  /* 5. Priming */
  score += longestPrime(b, color) * 12;
  score -= longestPrime(b, opp)   * 8;

  /* 6. Home board strength */
  score += countHomePoints(b, color) * 8;

  /* 7. Anchors in opponent's home */
  score += countAnchors(b, color)    * 10;

  /* 8. Blot exposure */
  score -= blotExposure(b, br, color) * 3;

  /* 9. Distribution */
  score -= distributionPenalty(b, color) * 2;

  return score;
}

/* ===========================================================
   AI DIFFICULTY SELECTION
   =========================================================== */

function aiChooseTurn(b, br, of_, color, diceValues, difficulty) {
  const allTurns = enumerateAllTurns(b, br, of_, color, diceValues);
  if (allTurns.length === 0) return [];
  if (allTurns.length === 1) return allTurns[0];

  switch (difficulty) {
    case 'easy':
      return allTurns[Math.floor(Math.random() * allTurns.length)];

    case 'medium':
      return selectWithNoise(allTurns, b, br, of_, color, 0.35);

    case 'hard':
      return selectWithNoise(allTurns, b, br, of_, color, 0.12);

    case 'expert':
    default:
      return selectBest(allTurns, b, br, of_, color);
  }
}

function applyTurn_s(b, br, of_, moves, color) {
  let nb = cloneBoard(b), nbr = { ...br }, nof = { ...of_ };
  for (const mv of moves) {
    const res = applyMove_s(nb, nbr, nof, mv, color);
    nb = res.b; nbr = res.br; nof = res.of_;
  }
  return { b: nb, br: nbr, of_: nof };
}

function selectBest(turns, b, br, of_, color) {
  let bestTurn  = turns[0];
  let bestScore = -Infinity;
  for (const turn of turns) {
    const { b: nb, br: nbr, of_: nof } = applyTurn_s(b, br, of_, turn, color);
    const score = evaluatePosition(nb, nbr, nof, color);
    if (score > bestScore) { bestScore = score; bestTurn = turn; }
  }
  return bestTurn;
}

function selectWithNoise(turns, b, br, of_, color, noiseLevel) {
  const scored = turns.map(t => {
    const { b: nb, br: nbr, of_: nof } = applyTurn_s(b, br, of_, t, color);
    return { t, score: evaluatePosition(nb, nbr, nof, color) + (Math.random() - 0.5) * noiseLevel * 120 };
  });
  scored.sort((a, c) => c.score - a.score);
  return scored[0].t;
}

/* ===========================================================
   AI TURN EXECUTION
   =========================================================== */

function aiTurn() {
  if (!gameActive || turn !== aiColor) return;

  aiThinking = true;
  DOM.thinking.classList.add('active');
  setStatus('AI is rolling...', turn);

  setTimeout(() => {
    /* Roll dice */
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    dice      = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    remaining = [...dice];
    updateDiceDisplay();
    playMoveSound('dice');
    setStatus(`AI rolled ${d1}${d1 === d2 ? ' (doubles!)' : ` and ${d2}`}`, turn);

    /* AI doubling decision before moving */
    if (shouldAIDouble()) {
      setTimeout(() => aiOfferDouble(), 500);
      return;
    }

    setTimeout(() => aiDecideAndMove(), 600);
  }, 700);
}

function aiDecideAndMove() {
  if (!gameActive) return;

  /* Choose the best full turn */
  const chosenMoves = aiChooseTurn(
    cloneBoard(board), { ...bar }, { ...off },
    aiColor, [...remaining], currentDifficulty
  );

  if (chosenMoves.length === 0) {
    setStatus('AI has no moves — passing', turn);
    setTimeout(() => {
      remaining = [];
      updateDiceDisplay();
      aiFinishTurn();
    }, 1000);
    return;
  }

  /* Execute moves sequentially with animation delays */
  aiExecuteSequence(chosenMoves, 0);
}

function aiExecuteSequence(moves, idx) {
  if (idx >= moves.length || !gameActive) {
    aiFinishTurn();
    return;
  }

  const mv = moves[idx];
  const wasHit = executeMove(mv, aiColor);
  playMoveSound(wasHit ? 'hit' : mv.to === 'off' ? 'bearoff' : 'move');

  updateDiceDisplay();
  draw();
  updateUI();

  setTimeout(() => aiExecuteSequence(moves, idx + 1), AI_MOVE_DELAY);
}

function aiMakeMoves() {
  /* Used for AI opening move (dice already set) */
  if (!gameActive) return;
  aiThinking = true;
  DOM.thinking.classList.add('active');

  const chosenMoves = aiChooseTurn(
    cloneBoard(board), { ...bar }, { ...off },
    aiColor, [...remaining], currentDifficulty
  );

  if (chosenMoves.length === 0) {
    aiFinishTurn();
    return;
  }

  aiExecuteSequence(chosenMoves, 0);
}

function aiFinishTurn() {
  aiThinking = false;
  DOM.thinking.classList.remove('active');
  dice      = [];
  remaining = [];
  updateDiceDisplay();
  endTurn();
}
