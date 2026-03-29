/* ===========================================================
   GAME.JS — Rules, moves, dice, turns, features, persistence
   =========================================================== */

/* ===========================================================
   BOARD SETUP
   =========================================================== */
function initBoard() {
  board = [];
  for (let i = 0; i < 24; i++) board.push({ c: null, n: 0 });

  /* White checkers (move 24→1, index decreasing) */
  setPt(23, 'w', 2);
  setPt(12, 'w', 5);
  setPt(7,  'w', 3);
  setPt(5,  'w', 5);

  /* Black checkers (move 1→24, index increasing) */
  setPt(0,  'b', 2);
  setPt(11, 'b', 5);
  setPt(16, 'b', 3);
  setPt(18, 'b', 5);

  bar = { w: 0, b: 0 };
  off = { w: 0, b: 0 };
  dice      = [];
  remaining = [];
  selectedPt = -1;
  validDests = [];
  moveHistory      = [];
  historyViewIndex = -1;
  doublingCube = 1;
  cubeOwner    = null;
}

function setPt(idx, color, count) {
  board[idx] = { c: color, n: count };
}

/* ===========================================================
   MOVE RULES
   =========================================================== */

/** White moves index-decreasing (toward 0). Black moves index-increasing. */
function moveDir(color) { return color === 'w' ? -1 : 1; }

/** Home board index range [lo, hi] inclusive */
function homeRange(color) {
  return color === 'w' ? [0, 5] : [18, 23];
}

/** True if all of color's checkers are in the home board (no pieces off the range or on bar) */
function allInHome(color) {
  if (bar[color] > 0) return false;
  const [lo, hi] = homeRange(color);
  for (let i = 0; i < 24; i++) {
    if (board[i].c === color && board[i].n > 0 && (i < lo || i > hi)) return false;
  }
  return true;
}

/** Returns the destination for a piece at 'from' using 'dieVal', or null if illegal */
function getMoveDest(from, dieVal, color) {
  let dest;

  if (from === 24) {
    /* Enter from bar */
    dest = color === 'w' ? 24 - dieVal : dieVal - 1;
  } else {
    dest = from + moveDir(color) * dieVal;
  }

  /* Bearing off */
  if (color === 'w' && dest < 0) {
    if (!allInHome(color)) return null;
    if (dest === -1) return 'off'; // exact
    /* Can bear off with a higher die if no piece on higher points */
    let highestPt = -1;
    for (let i = 5; i >= 0; i--) {
      if (board[i].c === 'w' && board[i].n > 0) { highestPt = i; break; }
    }
    return from === highestPt ? 'off' : null;
  }
  if (color === 'b' && dest > 23) {
    if (!allInHome(color)) return null;
    if (dest === 24) return 'off'; // exact
    let highestPt = -1;
    for (let i = 18; i <= 23; i++) {
      if (board[i].c === 'b' && board[i].n > 0) { highestPt = i; break; }
    }
    return from === highestPt ? 'off' : null;
  }

  if (dest < 0 || dest > 23) return null;

  /* Destination blocked by 2+ opponent checkers */
  if (board[dest].c !== null && board[dest].c !== color && board[dest].n >= 2) return null;

  return dest;
}

/** Returns all individual legal moves for color with the given dice array */
function getValidMoves(color, remainingDice) {
  const moves   = [];
  const sources = [];

  if (bar[color] > 0) {
    sources.push(24);
  } else {
    for (let i = 0; i < 24; i++) {
      if (board[i].c === color && board[i].n > 0) sources.push(i);
    }
  }

  const uniqueDice = [...new Set(remainingDice)];
  for (const src of sources) {
    for (const d of uniqueDice) {
      const dest = getMoveDest(src, d, color);
      if (dest !== null) moves.push({ from: src, to: dest, die: d });
    }
  }
  return moves;
}

/* ===========================================================
   EXECUTE / UNDO MOVE
   =========================================================== */
function executeMove(mv, color) {
  const { from, to, die } = mv;
  const opp = color === 'w' ? 'b' : 'w';

  if (from === 24) {
    bar[color]--;
  } else {
    board[from].n--;
    if (board[from].n === 0) board[from].c = null;
  }

  let wasHit = false;
  if (to === 'off') {
    off[color]++;
  } else {
    if (board[to].c === opp && board[to].n === 1) {
      board[to].n = 0;
      board[to].c = null;
      bar[opp]++;
      wasHit = true;
    }
    board[to].c = color;
    board[to].n++;
  }

  const idx = remaining.indexOf(die);
  if (idx !== -1) remaining.splice(idx, 1);

  return wasHit;
}

function undoMoveOnBoard(mv, color, wasHit) {
  const { from, to, die } = mv;
  const opp = color === 'w' ? 'b' : 'w';

  if (to === 'off') {
    off[color]--;
  } else {
    board[to].n--;
    if (board[to].n === 0) board[to].c = null;
    if (wasHit) {
      bar[opp]--;
      board[to].c = opp;
      board[to].n = 1;
    }
  }

  if (from === 24) {
    bar[color]++;
  } else {
    board[from].c = color;
    board[from].n++;
  }

  remaining.push(die);
}

/* ===========================================================
   PLAYER MOVE EXECUTION
   =========================================================== */
function doPlayerMove(mv) {
  const wasHit = executeMove(mv, playerColor);
  playMoveSound(wasHit ? 'hit' : mv.to === 'off' ? 'bearoff' : 'move');

  selectedPt = -1;
  validDests = [];
  updateUI();
  draw();
  updateDiceDisplay();

  const moves = getValidMoves(playerColor, remaining);
  if (remaining.length > 0 && moves.length > 0) {
    /* Turn continues */
    autoPlayIfForced(playerColor);
  } else {
    remaining = [];
    updateDiceDisplay();
    endTurn();
  }
}

/** If only one legal move sequence exists, execute it automatically */
function autoPlayIfForced(color) {
  if (color !== playerColor) return; // only auto-play player's forced moves
  const moves = getValidMoves(color, remaining);
  if (moves.length !== 1) return;
  /* Single valid move — auto-execute after a brief delay */
  setTimeout(() => {
    const mv = moves[0];
    const wasHit = executeMove(mv, color);
    playMoveSound(wasHit ? 'hit' : mv.to === 'off' ? 'bearoff' : 'move');
    updateUI();
    draw();
    updateDiceDisplay();

    const nextMoves = getValidMoves(color, remaining);
    if (remaining.length > 0 && nextMoves.length > 0) {
      autoPlayIfForced(color);
    } else {
      remaining = [];
      updateDiceDisplay();
      endTurn();
    }
  }, 350);
}

/* ===========================================================
   DICE
   =========================================================== */
function rollDice() {
  if (!gameActive || turn !== playerColor || remaining.length > 0) return;

  DOM.btnRoll.disabled = true;
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;

  dice      = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  remaining = [...dice];

  updateDiceDisplay(true);
  playMoveSound('dice');

  const moves = getValidMoves(playerColor, remaining);
  if (moves.length === 0) {
    setStatus('No moves available — passing turn', turn);
    setTimeout(() => { remaining = []; updateDiceDisplay(); endTurn(); }, 1200);
  } else {
    setStatus('Choose a piece to move', turn);
    autoPlayIfForced(playerColor);
  }

  draw();
}

/* Pip positions for each die face value (using CSS grid-area names) */
const PIP_LAYOUTS = {
  1: ['c'],
  2: ['tr', 'bl'],
  3: ['tr', 'c',  'bl'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c',  'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

function makeDieHTML(value, isUsed, isRolling) {
  const positions = PIP_LAYOUTS[value] || [];
  const pipsHtml  = positions.map(pos => `<span class="pip ${pos}"></span>`).join('');
  let cls = 'die';
  if (isUsed)    cls += ' used';
  if (isRolling) cls += ' rolling';
  return `<div class="${cls}" aria-label="Die showing ${value}" title="${value}">${pipsHtml}</div>`;
}

function updateDiceDisplay(animate) {
  if (!DOM.diceRow) return;

  /* Remove only die elements — the Roll button stays in the DOM */
  DOM.diceRow.querySelectorAll('.die').forEach(el => el.remove());

  const shouldShowButton = gameActive && turn === playerColor && dice.length === 0 && !aiThinking;
  DOM.btnRoll.style.display = shouldShowButton ? 'flex' : 'none';

  if (dice.length === 0) return;

  /* Determine which dice are spent */
  const remCopy = [...remaining];
  const usedArr = dice.map(d => {
    const ri = remCopy.indexOf(d);
    if (ri !== -1) { remCopy.splice(ri, 1); return false; }
    return true;
  });

  /* Append die elements after the button */
  dice.forEach((d, i) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = makeDieHTML(d, usedArr[i], !!animate);
    DOM.diceRow.appendChild(tmp.firstChild);
  });
}

/* ===========================================================
   TURN FLOW
   =========================================================== */
function endTurn() {
  /* Check for win */
  if (off.w === 15) { finishGame('w'); return; }
  if (off.b === 15) { finishGame('b'); return; }

  /* Record turn in history */
  recordTurnSnapshot();

  /* Switch turn */
  turn = turn === 'w' ? 'b' : 'w';
  selectedPt = -1;
  validDests = [];
  dice       = [];
  remaining  = [];
  updateDiceDisplay();

  if (turn === playerColor) {
    DOM.btnRoll.disabled = false;
    setStatus('Roll the dice!', turn);
    /* Check if AI should offer a double before player rolls */
    if (shouldAIDouble()) {
      setTimeout(aiOfferDouble, 600);
    }
  } else {
    DOM.btnRoll.disabled = true;
    saveGameState();
    setTimeout(() => aiTurn(), 400);
  }

  updateUI();
  draw();
}

/** Record a snapshot of the current board for history/undo */
function recordTurnSnapshot() {
  moveHistory.push({
    color:     turn,
    dice:      [...dice],
    board:     board.map(p => ({ c: p.c, n: p.n })),
    bar:       { ...bar },
    off:       { ...off },
    cube:      doublingCube,
    cubeOwner: cubeOwner,
  });
  updateMoveHistoryDisplay();
}

/* ===========================================================
   GAME LIFECYCLE
   =========================================================== */
function startGame(color) {
  playerColor = color;
  aiColor     = color === 'w' ? 'b' : 'w';
  matchScore  = { w: 0, b: 0 };
  crawfordGame = false;

  closeDialog(DOM.colorOverlay);
  startNewGameInMatch();
}

function startNewGameInMatch() {
  initBoard();
  gameActive = true;
  aiThinking = false;
  dice       = [];
  remaining  = [];
  doublingCube = 1;
  cubeOwner    = null;
  dragState    = null;
  historyViewIndex = -1;

  DOM.statusBar.classList.remove('game-over');
  updateNavButtons();

  /* Opening roll — both players roll 1 die, higher goes first */
  doOpeningRoll();

  updateUI();
  updateDiceDisplay();
  draw();

  if (matchLength > 0) {
    DOM.matchScoreBar.classList.add('active');
    updateMatchScoreDisplay();
  } else {
    DOM.matchScoreBar.classList.remove('active');
  }
}

/** Both players roll one die; ties re-roll. First mover gets those two dice. */
function doOpeningRoll() {
  let p, a;
  do {
    p = Math.floor(Math.random() * 6) + 1;
    a = Math.floor(Math.random() * 6) + 1;
  } while (p === a);

  if (p > a) {
    turn = playerColor;
    dice      = [p, a];
    remaining = [...dice];
    DOM.btnRoll.disabled = true; // dice already rolled
    setStatus(`Opening roll: You ${p} vs AI ${a} — You go first!`, turn);
    updateDiceDisplay();
    playMoveSound('dice');
    const moves = getValidMoves(playerColor, remaining);
    if (moves.length === 0) {
      setTimeout(() => { remaining = []; updateDiceDisplay(); endTurn(); }, 1000);
    } else {
      autoPlayIfForced(playerColor);
    }
  } else {
    turn = aiColor;
    setStatus(`Opening roll: You ${p} vs AI ${a} — AI goes first!`, turn);
    DOM.btnRoll.disabled = true;
    dice      = [a, p];
    remaining = [...dice];
    updateDiceDisplay();
    setTimeout(() => aiMakeMoves(), 800);
  }
}

function showColorDialog() {
  openDialog(DOM.colorOverlay);
}

function showResignConfirm() {
  if (!gameActive) return;
  openDialog(DOM.confirmOverlay);
}

function executeResign() {
  closeDialog(DOM.confirmOverlay);
  if (!gameActive) return;
  gameActive = false;
  setStatus('You resigned. AI wins.', turn);
  DOM.statusBar.classList.add('game-over');
  DOM.btnRoll.disabled = true;
  dice = []; remaining = [];
  updateDiceDisplay();
  updateUI();
  draw();

  const stats = getStats();
  stats.games++;
  stats.losses++;
  stats.currentStreak = 0;
  saveStats(stats);
  renderStats();
  saveToArchive('loss', 0);
}

function finishGame(winner) {
  gameActive = false;

  /* Detect gammon / backgammon */
  const loser = winner === 'w' ? 'b' : 'w';
  let multiplier = 1;
  let gameType   = 'win';

  if (off[loser] === 0) {
    /* Gammon (2×) or Backgammon (3×) */
    const loserHasCheckerInWinnerHome = (function() {
      const [lo, hi] = homeRange(winner);
      for (let i = lo; i <= hi; i++) {
        if (board[i].c === loser && board[i].n > 0) return true;
      }
      return bar[loser] > 0;
    })();

    if (loserHasCheckerInWinnerHome) {
      multiplier = 3;
      gameType   = 'backgammon';
    } else {
      multiplier = 2;
      gameType   = 'gammon';
    }
  }

  const points = doublingCube * multiplier;
  const isPlayerWin = winner === playerColor;

  /* Update match score */
  if (matchLength > 0) {
    matchScore[winner] += points;
    if (matchScore[winner] >= matchLength) {
      /* Match over */
      showResultModal(isPlayerWin, gameType, points, true);
      return;
    }
    updateMatchScoreDisplay();
    /* Check Crawford */
    crawfordGame = (matchScore[winner] === matchLength - 1);
    showResultModal(isPlayerWin, gameType, points, false);
  } else {
    showResultModal(isPlayerWin, gameType, points, false);
  }

  /* Stats */
  const stats = getStats();
  stats.games++;
  if (isPlayerWin) {
    stats.wins++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
    if (gameType === 'gammon')      stats.gammons++;
    if (gameType === 'backgammon')  stats.backgammons++;
  } else {
    stats.losses++;
    stats.currentStreak = 0;
  }
  saveStats(stats);
  renderStats();
  saveToArchive(isPlayerWin ? 'win' : 'loss', points);
  clearGameState();

  DOM.statusBar.classList.add('game-over');
  dice = []; remaining = [];
  updateDiceDisplay();
  updateUI();
  draw();
}

function showResultModal(isWin, gameType, points, isMatchOver) {
  const typeLabels = { win: '', gammon: ' — Gammon!', backgammon: ' — Backgammon!' };
  const matchTxt   = isMatchOver ? ' Match over!' : (matchLength > 0 ? ' Game over.' : '');

  DOM.resultIcon.textContent  = isWin ? '🏆' : '💀';
  DOM.resultTitle.textContent = isWin ? 'You Win!' : 'AI Wins!';
  DOM.resultDetail.textContent = (isWin ? 'Victory' : 'Defeat') + (typeLabels[gameType] || '') + matchTxt;
  DOM.resultStakes.textContent = `${points} point${points > 1 ? 's' : ''} (cube × ${doublingCube})`;

  setStatus(isWin ? '🏆 You win!' : '💀 AI wins!', turn);

  openDialog(DOM.resultOverlay);
}

/* ===========================================================
   UNDO
   =========================================================== */
function undoLastTurn() {
  if (!gameActive || moveHistory.length < 2) return;
  /* Undo the AI's last turn and player's last turn */
  const snapshotBeforePlayer = moveHistory[moveHistory.length - 2];

  board     = snapshotBeforePlayer.board.map(p => ({ c: p.c, n: p.n }));
  bar       = { ...snapshotBeforePlayer.bar };
  off       = { ...snapshotBeforePlayer.off };
  doublingCube = snapshotBeforePlayer.cube;
  cubeOwner    = snapshotBeforePlayer.cubeOwner;

  moveHistory.splice(moveHistory.length - 2, 2);

  turn      = playerColor;
  dice      = [];
  remaining = [];
  selectedPt = -1;
  validDests = [];
  historyViewIndex = -1;

  DOM.btnRoll.disabled = false;
  setStatus('Move undone. Roll the dice!', turn);
  updateMoveHistoryDisplay();
  updateUI();
  updateDiceDisplay();
  draw();
}

/* ===========================================================
   HISTORY NAVIGATION
   =========================================================== */
function navFirst() { navTo(0); }
function navPrev()  { navTo(Math.max(0, historyViewIndex === -1 ? moveHistory.length - 1 : historyViewIndex - 1)); }
function navNext()  {
  if (historyViewIndex === -1) return;
  if (historyViewIndex >= moveHistory.length - 1) { navTo(-1); return; }
  navTo(historyViewIndex + 1);
}
function navLast()  { navTo(-1); }

function navTo(idx) {
  historyViewIndex = idx;

  if (idx === -1) {
    /* Live position */
    updateNavButtons();
    draw();
    updateUI();
    return;
  }

  const snap = moveHistory[idx];
  if (!snap) return;

  /* Temporarily render this snapshot without mutating live state */
  const liveboard = board, livebar = bar, liveoff = off;
  board = snap.board.map(p => ({ c: p.c, n: p.n }));
  bar   = { ...snap.bar };
  off   = { ...snap.off };
  selectedPt = -1;
  validDests = [];

  draw();

  board = liveboard;
  bar   = livebar;
  off   = liveoff;

  updateNavButtons();
}

function updateNavButtons() {
  const atStart = historyViewIndex === 0;
  const atEnd   = historyViewIndex === -1;
  if (DOM.navFirst) DOM.navFirst.disabled = atStart || moveHistory.length === 0;
  if (DOM.navPrev)  DOM.navPrev.disabled  = atStart || moveHistory.length === 0;
  if (DOM.navNext)  DOM.navNext.disabled  = atEnd;
  if (DOM.navLast)  DOM.navLast.disabled  = atEnd;
}

function updateMoveHistoryDisplay() {
  if (!DOM.moveHistoryEl) return;
  if (moveHistory.length === 0) {
    DOM.moveHistoryEl.innerHTML = '<span style="color:var(--text-muted);font-size:.75rem">No moves yet</span>';
    updateNavButtons();
    return;
  }

  let html = '';
  moveHistory.forEach((entry, idx) => {
    const diceStr = entry.dice.join('-');
    const who = entry.color === playerColor ? 'You' : 'AI';
    const cls = idx === historyViewIndex ? 'move-entry active' : 'move-entry';
    html += `<span class="${cls}" data-idx="${idx}" title="${who}: ${diceStr}">${idx + 1}. ${who} [${diceStr}]</span> `;
  });

  DOM.moveHistoryEl.innerHTML = html;
  DOM.moveHistoryEl.querySelectorAll('.move-entry').forEach(el => {
    el.addEventListener('click', () => navTo(parseInt(el.dataset.idx, 10)));
  });

  /* Scroll to end if in live mode */
  if (historyViewIndex === -1) DOM.moveHistoryEl.scrollTop = DOM.moveHistoryEl.scrollHeight;
  updateNavButtons();
}

/* ===========================================================
   DOUBLING CUBE
   =========================================================== */
function playerOfferDouble() {
  if (!gameActive || turn !== playerColor || remaining.length > 0 || crawfordGame) return;
  if (cubeOwner === aiColor) return; // AI owns the cube, player can't double
  if (doublingCube >= 64) return;

  const newValue = doublingCube * 2;
  DOM.doubleFromText.textContent = doublingCube;
  DOM.doubleToText.textContent   = newValue;
  openDialog(DOM.doubleOverlay);
}

function acceptDouble() {
  closeDialog(DOM.doubleOverlay);
  doublingCube *= 2;
  cubeOwner = aiColor; // AI now owns the cube (can re-double)
  setStatus(`Double accepted — cube is now ${doublingCube}`, turn);
  draw();
}

function declineDouble() {
  closeDialog(DOM.doubleOverlay);
  /* AI declines — player wins current cube value */
  gameActive = false;
  const points = doublingCube;
  showResultModal(true, 'win', points, false);

  const stats = getStats();
  stats.games++;
  stats.wins++;
  stats.currentStreak++;
  if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
  saveStats(stats);
  renderStats();
  saveToArchive('win', points);
  clearGameState();

  DOM.statusBar.classList.add('game-over');
  updateUI();
  draw();
}

function aiOfferDouble() {
  if (!gameActive || crawfordGame) return;
  if (cubeOwner === playerColor) return;
  if (doublingCube >= 64) return;

  const newValue = doublingCube * 2;
  DOM.doubleFromText.textContent = doublingCube;
  DOM.doubleToText.textContent   = newValue;

  /* Swap text to indicate it's AI's offer */
  document.getElementById('doubleDialogTitle').textContent = 'AI offers a double!';
  document.getElementById('doubleDialogDesc').textContent  =
    `The AI wants to raise the cube from ${doublingCube} to ${newValue}. Accept or decline?`;

  openDialog(DOM.doubleOverlay);

  /* Override accept/decline for AI's offer */
  document.getElementById('acceptDoubleBtn').onclick = () => {
    closeDialog(DOM.doubleOverlay);
    doublingCube *= 2;
    cubeOwner = playerColor; // player now owns the cube
    document.getElementById('doubleDialogTitle').textContent = 'Double?';
    document.getElementById('doubleDialogDesc').textContent  =
      `Offer to raise the cube from ${doublingCube/2} to ${doublingCube}?`;
    setStatus(`You accepted — cube is now ${doublingCube}`, turn);
    draw();
    /* Continue AI turn */
    setTimeout(() => aiMakeMoves(), 400);
  };

  document.getElementById('declineDoubleBtn').onclick = () => {
    closeDialog(DOM.doubleOverlay);
    /* Player declines — AI wins current cube value */
    gameActive = false;
    const points = doublingCube;
    showResultModal(false, 'win', points, false);

    const stats = getStats();
    stats.games++;
    stats.losses++;
    stats.currentStreak = 0;
    saveStats(stats);
    renderStats();
    saveToArchive('loss', points);
    clearGameState();

    DOM.statusBar.classList.add('game-over');
    updateUI();
    draw();

    /* Restore button handlers */
    document.getElementById('acceptDoubleBtn').onclick = acceptDouble;
    document.getElementById('declineDoubleBtn').onclick = declineDouble;
  };
}

function shouldAIDouble() {
  if (!gameActive || crawfordGame || doublingCube >= 64) return false;
  if (cubeOwner === playerColor) return false;
  if (off.w + off.b < 2) return false; // too early

  const myPips   = calcPip(aiColor);
  const oppPips  = calcPip(playerColor);
  const ratio    = myPips / Math.max(oppPips, 1);

  if (ratio < 0.78 && oppPips > 20) return true;
  if (off[aiColor] > 10 && off[playerColor] < 5) return true;
  return false;
}

function updateMatchScoreDisplay() {
  if (!DOM.matchPlayerPts) return;
  DOM.matchPlayerPts.textContent = matchScore[playerColor];
  DOM.matchAIPts.textContent     = matchScore[aiColor];
  if (DOM.matchLengthTxt) DOM.matchLengthTxt.textContent = `First to ${matchLength}`;
}

/* ===========================================================
   UI HELPERS
   =========================================================== */
function setStatus(text, t) {
  if (DOM.statusText) DOM.statusText.textContent = text;
  if (DOM.turnBadge)  DOM.turnBadge.textContent  = t === 'w' ? 'White' : 'Black';
}

function updateUI() {
  if (DOM.scorePlayer) DOM.scorePlayer.textContent = off[playerColor];
  if (DOM.scoreAI)     DOM.scoreAI.textContent     = off[aiColor];
  if (DOM.pipPlayer)   DOM.pipPlayer.textContent   = calcPip(playerColor);
  if (DOM.pipAI)       DOM.pipAI.textContent       = calcPip(aiColor);
  updateNavButtons();
  updateButtonStates();
}

function updateButtonStates() {
  const isPlayerTurn = gameActive && turn === playerColor && !aiThinking;
  const canDouble = isPlayerTurn &&
                    remaining.length === 0 &&
                    !crawfordGame &&
                    cubeOwner !== aiColor &&
                    doublingCube < 64;

  if (DOM.btnDouble) DOM.btnDouble.disabled = !canDouble;
  if (DOM.btnResign) DOM.btnResign.disabled = !gameActive;
  if (DOM.btnUndo)   DOM.btnUndo.disabled   = !gameActive || moveHistory.length < 2;
}

function calcPip(color) {
  let pip = 0;
  for (let i = 0; i < 24; i++) {
    if (board[i].c === color && board[i].n > 0) {
      const dist = color === 'w' ? (i + 1) : (24 - i);
      pip += dist * board[i].n;
    }
  }
  pip += bar[color] * 25;
  return pip;
}

/* ===========================================================
   SOUND
   =========================================================== */
let _audioCtx = null;

function getAudioContext() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playTone(freq, duration, type, volume) {
  if (!soundEnabled) return;
  try {
    const ctx  = getAudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type      = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume || 0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

function playNoiseBurst(duration, volume, filterFreq) {
  if (!soundEnabled) return;
  try {
    const ctx    = getAudioContext();
    const bufLen = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src    = ctx.createBufferSource();
    src.buffer   = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type  = 'lowpass';
    filter.frequency.value = filterFreq || 800;
    const gain   = ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  } catch(e) {}
}

function playMoveSound(type) {
  if (!soundEnabled) return;
  switch (type) {
    case 'move':    playNoiseBurst(0.08, 0.22, 700);  break;
    case 'hit':     playNoiseBurst(0.13, 0.32, 900);
                    setTimeout(() => playNoiseBurst(0.06, 0.15, 600), 80); break;
    case 'bearoff': playTone(880, 0.12, 'sine', 0.15);
                    setTimeout(() => playTone(1100, 0.1, 'sine', 0.1), 80); break;
    case 'dice':
      for (let i = 0; i < 4; i++) {
        setTimeout(() => playNoiseBurst(0.04, 0.18, 1200), i * 55);
      }
      break;
    case 'win':
      [440, 554, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.25, 'sine', 0.15), i * 100));
      break;
    case 'loss':
      [440, 392, 330, 262].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.12), i * 110));
      break;
    case 'double':
      playTone(220, 0.3, 'sine', 0.2);
      setTimeout(() => playTone(220, 0.2, 'sine', 0.15), 180);
      break;
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  safeStorage.set('bg-arena-sound', soundEnabled ? 'on' : 'off');
  updateSoundBtn();
}

function updateSoundBtn() {
  if (!DOM.btnSound) return;
  DOM.btnSound.textContent = soundEnabled ? '🔊 Sound' : '🔇 Sound';
  DOM.btnSound.classList.toggle('active', soundEnabled);
}

/* ===========================================================
   THEMES
   =========================================================== */
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  safeStorage.set('bg-arena-theme', isLight ? 'light' : 'dark');
  if (DOM.btnTheme) DOM.btnTheme.classList.toggle('active', isLight);
  draw();
}

function cycleBoardTheme() {
  const themes = Object.keys(BOARD_THEMES);
  const idx    = themes.indexOf(currentBoardTheme);
  currentBoardTheme = themes[(idx + 1) % themes.length];
  Object.assign(COL, BOARD_THEMES[currentBoardTheme]);
  safeStorage.set('bg-arena-board-theme', currentBoardTheme);
  if (DOM.btnBoardTheme) DOM.btnBoardTheme.textContent = '🎨 ' + BOARD_THEMES[currentBoardTheme].name || '🎨 Board';
  draw();
}

/* ===========================================================
   PERSISTENCE
   =========================================================== */
function saveGameState() {
  if (!gameActive) return;
  const state = {
    board: board.map(p => ({ c: p.c, n: p.n })),
    bar, off, turn, playerColor, aiColor, gameActive,
    dice, remaining, doublingCube, cubeOwner,
    matchLength, matchScore, crawfordGame,
    currentDifficulty,
  };
  safeStorage.set('bg-arena-state', JSON.stringify(state));
}

function loadGameState() {
  const raw = safeStorage.get('bg-arena-state');
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (!s.gameActive) return;

    board        = s.board;
    bar          = s.bar;
    off          = s.off;
    turn         = s.turn;
    playerColor  = s.playerColor;
    aiColor      = s.aiColor;
    gameActive   = s.gameActive;
    dice         = s.dice         || [];
    remaining    = s.remaining    || [];
    doublingCube = s.doublingCube || 1;
    cubeOwner    = s.cubeOwner    || null;
    matchLength  = s.matchLength  || 0;
    matchScore   = s.matchScore   || { w: 0, b: 0 };
    crawfordGame = s.crawfordGame || false;
    currentDifficulty = s.currentDifficulty || 'medium';

    /* Hide color dialog — game is already in progress */
    if (DOM.colorOverlay) DOM.colorOverlay.classList.add('hidden');

    if (matchLength > 0 && DOM.matchScoreBar) {
      DOM.matchScoreBar.classList.add('active');
      updateMatchScoreDisplay();
    }

    if (turn === playerColor) {
      if (remaining.length > 0) {
        DOM.btnRoll.disabled = true;
        setStatus('Choose a piece to move', turn);
      } else {
        DOM.btnRoll.disabled = false;
        setStatus('Roll the dice!', turn);
      }
    } else {
      DOM.btnRoll.disabled = true;
      setTimeout(() => aiTurn(), 600);
    }

    updateUI();
    updateDiceDisplay();
    draw();
  } catch(e) {
    safeStorage.remove('bg-arena-state');
  }
}

function clearGameState() {
  safeStorage.remove('bg-arena-state');
}

/* ===========================================================
   GAME ARCHIVE
   =========================================================== */
function saveToArchive(result, points) {
  const raw     = safeStorage.get('bg-arena-archive');
  const archive = raw ? JSON.parse(raw) : [];

  archive.unshift({
    date:       new Date().toLocaleDateString(),
    result,
    playerColor,
    difficulty: currentDifficulty,
    points,
    matchLength,
  });

  if (archive.length > MAX_ARCHIVE_SIZE) archive.pop();
  safeStorage.set('bg-arena-archive', JSON.stringify(archive));
  loadArchive();
}

function loadArchive() {
  if (!DOM.archiveList) return;
  const raw = safeStorage.get('bg-arena-archive');
  if (!raw) { DOM.archiveList.innerHTML = '<div class="archive-empty">No games yet</div>'; return; }

  const archive = JSON.parse(raw);
  if (archive.length === 0) { DOM.archiveList.innerHTML = '<div class="archive-empty">No games yet</div>'; return; }

  DOM.archiveList.innerHTML = archive.map((g, i) => `
    <div class="archive-item">
      <span>${g.date} · ${g.difficulty} · ${g.playerColor === 'w' ? '⬜' : '⬛'}</span>
      <span class="archive-result ${g.result}">${g.result === 'win' ? 'Win' : 'Loss'} +${g.points}pt</span>
    </div>
  `).join('');
}

function clearGameArchive() {
  safeStorage.remove('bg-arena-archive');
  loadArchive();
}

/* ===========================================================
   STATISTICS
   =========================================================== */
function getStats() {
  const raw = safeStorage.get('bg-arena-stats');
  if (!raw) return { games: 0, wins: 0, losses: 0, gammons: 0, backgammons: 0, currentStreak: 0, bestStreak: 0 };
  try { return JSON.parse(raw); } catch(e) { return { games: 0, wins: 0, losses: 0, gammons: 0, backgammons: 0, currentStreak: 0, bestStreak: 0 }; }
}

function saveStats(stats) {
  safeStorage.set('bg-arena-stats', JSON.stringify(stats));
}

function renderStats() {
  const s = getStats();
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('statGames',      s.games);
  setEl('statWins',       s.wins);
  setEl('statLosses',     s.losses);
  setEl('statGammons',    s.gammons || 0);
  setEl('statBgammons',   s.backgammons || 0);
  setEl('statStreak',     s.bestStreak || 0);
  const rate = s.games > 0 ? Math.round(s.wins / s.games * 100) : 0;
  setEl('statRate',       rate + '%');
  setEl('statCurStreak',  s.currentStreak || 0);
}

function resetStats() {
  saveStats({ games: 0, wins: 0, losses: 0, gammons: 0, backgammons: 0, currentStreak: 0, bestStreak: 0 });
  renderStats();
}

/* ===========================================================
   KEYBOARD SHORTCUTS
   =========================================================== */
document.addEventListener('keydown', function(e) {
  if (_activeDialog) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key.toLowerCase()) {
    case 'n': showColorDialog(); break;
    case 'r': if (!DOM.btnRoll.disabled) rollDice(); break;
    case 'u': undoLastTurn(); break;
    case 'd': playerOfferDouble(); break;
    case 'arrowleft':  navPrev(); break;
    case 'arrowright': navNext(); break;
    case 'escape':
      selectedPt = -1; validDests = []; draw();
      break;
  }
});
