/* ===========================================================
   GAME.JS — Game logic: status, history, actions, sounds,
   captured pieces, evaluation, persistence, themes
   =========================================================== */

/* ===========================================================
   STATUS — Check, checkmate, draw, stalemate detection
   =========================================================== */
function updateStatus() {
  DOM.statusBar.classList.remove('in-check', 'game-over');

  let status = '';
  const turn = game.turn() === 'w' ? 'White' : 'Black';
  DOM.turnBadge.textContent = turn;

  if (game.in_checkmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White';
    const isPlayerWin =
      (playerColor === 'white' && winner === 'White') ||
      (playerColor === 'black' && winner === 'Black');

    status = isPlayerWin
      ? 'Checkmate! You win!'
      : 'Checkmate! Stockfish wins.';
    DOM.statusBar.classList.add('game-over');
    gameActive = false;
    stopClock();
    saveToArchive();
    clearGameState();
    showResultModal(isPlayerWin ? 'win' : 'loss', status);

  } else if (game.in_draw()) {
    status = 'Draw!';
    if (game.in_stalemate()) status = 'Stalemate — Draw!';
    if (game.in_threefold_repetition()) status = 'Draw by repetition!';
    if (game.insufficient_material()) status = 'Insufficient material — Draw!';
    DOM.statusBar.classList.add('game-over');
    gameActive = false;
    stopClock();
    saveToArchive();
    clearGameState();
    showResultModal('draw', status);

  } else {
    const isPlayerTurn =
      (playerColor === 'white' && game.turn() === 'w') ||
      (playerColor === 'black' && game.turn() === 'b');

    status = isPlayerTurn ? 'Your turn' : 'Stockfish is thinking...';

    if (game.in_check()) {
      status = 'Check! ' + status;
      DOM.statusBar.classList.add('in-check');
    }
  }

  DOM.statusText.textContent = status;
  updateButtonStates();
}

/**
 * Actualizare stare butoane (disable cand nu sunt relevante)
 */
function updateButtonStates() {
  if (DOM.btnUndo) {
    DOM.btnUndo.disabled = !gameActive || aiThinking || game.history().length < 2;
  }
  if (DOM.btnResign) {
    DOM.btnResign.disabled = !gameActive;
  }
  if (DOM.btnDraw) {
    DOM.btnDraw.disabled = !gameActive || aiThinking || drawCooldown > 0;
  }
  if (DOM.btnAnalyze) {
    DOM.btnAnalyze.disabled = gameActive || game.history().length < 2 || analysisRunning;
  }
}

/* ===========================================================
   MOVE HISTORY
   =========================================================== */
function updateMoveHistory() {
  const history = game.history();
  const container = DOM.moveHistory;

  if (history.length === 0) {
    container.innerHTML = '—';
    return;
  }

  const activeIdx = viewIndex === -1 ? history.length - 1 : viewIndex;

  let html = '';
  for (let i = 0; i < history.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    html += `<span class="move-number">${moveNum}.</span>`;
    const wActive = i === activeIdx ? ' active' : '';
    html += `<span class="move-white${wActive}" onclick="navTo(${i})">${history[i]}</span>`;
    if (history[i + 1]) {
      const bActive = (i + 1) === activeIdx ? ' active' : '';
      html += `<span class="move-black${bActive}" onclick="navTo(${i + 1})">${history[i + 1]}</span>`;
    }
  }

  container.innerHTML = html;
  // Scroll to show active move
  const activeEl = container.querySelector('.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  else container.scrollLeft = container.scrollWidth;
}

/* ===========================================================
   MOVE NAVIGATION
   =========================================================== */
function isViewingHistory() {
  return viewIndex !== -1 && viewIndex < game.history().length - 1;
}

function navTo(idx) {
  const history = game.history();
  if (history.length === 0) return;
  idx = Math.max(0, Math.min(history.length - 1, idx));

  viewIndex = idx;
  showPositionAtIndex(idx);
  updateMoveHistory();
}

function navFirst() { navTo(0); }
function navPrev() {
  const cur = viewIndex === -1 ? game.history().length - 1 : viewIndex;
  navTo(cur - 1);
}
function navNext() {
  const cur = viewIndex === -1 ? game.history().length - 1 : viewIndex;
  if (cur >= game.history().length - 1) { navLast(); return; }
  navTo(cur + 1);
}
function navLast() {
  viewIndex = -1;
  if (board) board.position(game.fen(), true);
  updateMoveHistory();
}

function showPositionAtIndex(idx) {
  // Replay moves up to idx to get the position
  const tempGame = new Chess();
  const history = game.history();
  for (let i = 0; i <= idx; i++) {
    tempGame.move(history[i]);
  }
  if (board) board.position(tempGame.fen(), true);
}

/* ===========================================================
   CAPTURED PIECES
   =========================================================== */
function updateCapturedPieces() {
  const history = game.history({ verbose: true });
  const captured = { w: [], b: [] };  // w = piese albe capturate, b = piese negre capturate

  history.forEach(move => {
    if (move.captured) {
      // Piesa capturată aparține adversarului celui care mută
      const capturedColor = move.color === 'w' ? 'b' : 'w';
      captured[capturedColor].push(move.captured);
    }
  });

  renderCapturedGroup(DOM.capturedByWhite, captured.b, 'b');
  renderCapturedGroup(DOM.capturedByBlack, captured.w, 'w');

  // Material advantage
  if (DOM.capturedByWhite && DOM.capturedByBlack) {
    const whiteMaterial = calculateMaterial('w');
    const blackMaterial = calculateMaterial('b');
    const diff = whiteMaterial - blackMaterial;
    if (DOM.whiteAdvantage) DOM.whiteAdvantage.textContent = diff > 0 ? '+' + diff : '';
    if (DOM.blackAdvantage) DOM.blackAdvantage.textContent = diff < 0 ? '+' + Math.abs(diff) : '';
  }
}

function renderCapturedGroup(container, pieces, color) {
  if (!container) return;

  const sorted = [...pieces].sort((a, b) =>
    (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0)
  );

  let html = '';
  sorted.forEach(p => {
    const imgName = color + p.toUpperCase();
    html += `<img src="${PIECE_THEME_URL.replace('{piece}', imgName)}" alt="${p}" title="${p.toUpperCase()}">`;
  });

  container.innerHTML = html;
}

function calculateMaterial(color) {
  const boardState = game.board();
  let total = 0;
  boardState.forEach(row => {
    row.forEach(sq => {
      if (sq && sq.color === color) {
        total += PIECE_VALUES[sq.type] || 0;
      }
    });
  });
  return total;
}

/* ===========================================================
   EVALUATION BAR
   =========================================================== */
function updateEvalBar(evalCp) {
  const fill = DOM.evalBarFill;
  const labelTop = DOM.evalLabelTop;
  const labelBottom = DOM.evalLabelBottom;
  if (!fill) return;

  // Flip eval when playing as black so player's advantage is always at the bottom
  const orientedEval = playerColor === 'black' ? -evalCp : evalCp;

  // Clamp eval între -1000 și 1000 pentru display
  const clamped = Math.max(-1000, Math.min(1000, orientedEval));
  // Convertim la procent: 0cp = 50%, +1000 = 95%, -1000 = 5%
  const pct = 50 + (clamped / 1000) * 45;
  fill.style.height = pct + '%';

  // Update labels (always show white-relative eval text)
  const absEval = Math.abs(evalCp);
  let evalText;
  if (absEval >= 10000) {
    evalText = 'M' + Math.ceil(absEval / 10000);
  } else {
    evalText = (evalCp / 100).toFixed(1);
  }

  // Top label = disadvantage side, bottom label = advantage side (relative to bar orientation)
  if (labelTop) labelTop.textContent = orientedEval <= 0 ? evalText : '';
  if (labelBottom) labelBottom.textContent = orientedEval > 0 ? '+' + evalText : '';
}

/* ===========================================================
   BUTTON ACTIONS
   =========================================================== */

/** Afișează dialogul de alegere culoare */
function showColorDialog() {
  openDialog(DOM.colorOverlay);
}

/** Pornește jocul cu culoarea aleasă */
function startGame(color) {
  playerColor = color;

  closeDialog(DOM.colorOverlay);

  // Resetează chess.js
  game.reset();

  createBoard({ position: 'start' });

  // Lazy-load Stockfish on first game start
  if (!stockfish && !stockfishReady) initStockfish();

  gameActive = true;
  aiThinking = false;
  currentEval = 0;
  analysisResults = [];

  // Apply custom ELO if slider was used
  if (currentDifficulty === 'custom' && DOM.eloSlider) {
    const customDiff = getCustomDifficulty(DOM.eloSlider.value);
    if (stockfish) {
      if (customDiff.elo) {
        stockfish.postMessage('setoption name UCI_LimitStrength value true');
        stockfish.postMessage('setoption name UCI_Elo value ' + customDiff.elo);
      } else {
        stockfish.postMessage('setoption name UCI_LimitStrength value false');
      }
    }
  }

  if (DOM.btnAnalyze) DOM.btnAnalyze.disabled = true;

  // Initialize clock
  timeControl = parseTimeControl(currentTimePreset);
  if (timeControl) {
    timeWhite = timeControl.initial;
    timeBlack = timeControl.initial;
    startClock();
  }
  updateClockDisplay();

  updateStatus();
  updateMoveHistory();
  updateCapturedPieces();
  updateEvalBar(0);
  saveGameState();

  // If player is black, AI moves first
  if (playerColor === 'black') {
    requestAIMove();
  }
}

/** Undo — Anulează ultima mutare a jucătorului + răspunsul AI */
function undoMove() {
  if (!gameActive || aiThinking) return;
  if (game.history().length < 2) return;

  game.undo(); // undo AI
  game.undo(); // undo player

  board.position(game.fen(), true);
  removeHighlights();
  updateStatus();
  updateMoveHistory();
  updateCapturedPieces();
  saveGameState();
}

/** Offer draw — AI accepts if eval is near 0 */
function offerDraw() {
  if (!gameActive || aiThinking || drawCooldown > 0) return;

  const evalAbs = Math.abs(currentEval);
  if (evalAbs < 50) {
    // AI accepts
    gameActive = false;
    stopClock();
    DOM.statusText.textContent = 'Draw agreed!';
    DOM.statusBar.classList.add('game-over');
    saveToArchive();
    clearGameState();
    updateButtonStates();
    showResultModal('draw', 'Draw agreed!');
  } else {
    // AI declines
    drawCooldown = DRAW_COOLDOWN_MOVES;
    DOM.statusText.textContent = 'Stockfish declines the draw offer.';
    setTimeout(() => {
      if (DOM.statusText.textContent === 'Stockfish declines the draw offer.') {
        updateStatus();
      }
    }, 2000);
    updateButtonStates();
  }
}

/** Flip board orientation */
function flipBoard() {
  if (board) board.flip();
}

/** Abandonare — cu dialog de confirmare */
function resignGame() {
  if (!gameActive) return;
  showConfirmDialog();
}

/** Execută abandonul efectiv */
function executeResign() {
  gameActive = false;
  stopClock();
  saveToArchive();
  DOM.statusText.textContent = 'You resigned. Stockfish wins.';
  DOM.statusBar.classList.add('game-over');
  clearGameState();
  showResultModal('loss', 'You resigned. Stockfish wins.');
}

/** Afișează/ascunde indicatorul "AI thinking" */
function showThinking(show) {
  DOM.thinking.classList.toggle('active', show);
}

/* ===========================================================
   CONFIRM DIALOG — Resignation
   =========================================================== */
function showConfirmDialog() {
  openDialog(DOM.confirmOverlay);
}

function hideConfirmDialog() {
  closeDialog(DOM.confirmOverlay);
}

function confirmResign() {
  hideConfirmDialog();
  executeResign();
}

/* ===========================================================
   DIFFICULTY SELECTOR
   =========================================================== */
function initDifficultySelector() {
  const buttons = document.querySelectorAll('.diff-btn');
  const eloMap = { easy: 800, medium: 1500, hard: 2200, expert: 3200 };
  buttons.forEach(btn => {
    if (btn.dataset.level === currentDifficulty) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.dataset.level;
      applyDifficulty(currentDifficulty);
      // Sync ELO slider
      if (DOM.eloSlider && eloMap[btn.dataset.level]) {
        DOM.eloSlider.value = eloMap[btn.dataset.level];
        if (DOM.eloValue) DOM.eloValue.textContent = eloMap[btn.dataset.level];
      }
    });
  });
}

/* ===========================================================
   GAME CLOCK
   =========================================================== */
function formatClock(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min + ':' + (sec < 10 ? '0' : '') + sec;
}

function startClock() {
  stopClock();
  if (!timeControl) return;
  lastTickTime = Date.now();
  clockInterval = setInterval(tickClock, CLOCK_TICK_INTERVAL);
}

function stopClock() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
}

function tickClock() {
  if (!gameActive || !timeControl) { stopClock(); return; }

  const now = Date.now();
  const elapsed = now - lastTickTime;
  lastTickTime = now;

  // Decrement active player's clock
  const whiteToMove = game.turn() === 'w';
  if (whiteToMove) {
    timeWhite = Math.max(0, timeWhite - elapsed);
  } else {
    timeBlack = Math.max(0, timeBlack - elapsed);
  }

  updateClockDisplay();

  // Check for time out
  if (timeWhite <= 0 || timeBlack <= 0) {
    stopClock();
    gameActive = false;
    const whiteOut = timeWhite <= 0;
    const playerIsWhite = playerColor === 'white';
    const playerLost = (playerIsWhite && whiteOut) || (!playerIsWhite && !whiteOut);
    DOM.statusText.textContent = playerLost
      ? 'Time out! Stockfish wins.'
      : 'Time out! You win!';
    DOM.statusBar.classList.add('game-over');
    saveToArchive();
    clearGameState();
    updateButtonStates();
    showResultModal(playerLost ? 'loss' : 'win', DOM.statusText.textContent);
  }
}

function switchClock() {
  if (!timeControl || !gameActive) return;
  // Add increment to the player who just moved
  const whiteJustMoved = game.turn() === 'b'; // turn already switched
  if (whiteJustMoved) {
    timeWhite += timeControl.increment;
  } else {
    timeBlack += timeControl.increment;
  }
  lastTickTime = Date.now();
  updateClockDisplay();
}

function updateClockDisplay() {
  if (!timeControl) {
    DOM.clockTop.textContent = '';
    DOM.clockBottom.textContent = '';
    DOM.clockTop.classList.remove('clock-active', 'clock-low');
    DOM.clockBottom.classList.remove('clock-active', 'clock-low');
    return;
  }

  // Top = opponent, Bottom = player (based on board orientation)
  const boardFlipped = board && board.orientation() !== playerColor;
  const topIsWhite = boardFlipped ? true : playerColor !== 'white';
  const topTime = topIsWhite ? timeWhite : timeBlack;
  const bottomTime = topIsWhite ? timeBlack : timeWhite;

  DOM.clockTop.textContent = formatClock(topTime);
  DOM.clockBottom.textContent = formatClock(bottomTime);

  const whiteToMove = game.turn() === 'w';
  const topActive = (topIsWhite && whiteToMove) || (!topIsWhite && !whiteToMove);
  DOM.clockTop.classList.toggle('clock-active', topActive);
  DOM.clockBottom.classList.toggle('clock-active', !topActive);
  DOM.clockTop.classList.toggle('clock-low', topTime < LOW_TIME_THRESHOLD && topTime > 0);
  DOM.clockBottom.classList.toggle('clock-low', bottomTime < LOW_TIME_THRESHOLD && bottomTime > 0);
}

/* ===========================================================
   SOUNDS
   =========================================================== */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/* Synthesized sound: short noise burst (percussive, like a piece hitting a board) */
function playNoiseBurst(duration, volume, filterFreq) {
  try {
    const ctx = getAudioContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 800;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch(e) {}
}

function playTone(freq, duration, type, volume) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playMoveSound(move) {
  if (!soundEnabled) return;

  if (move.san && move.san.includes('#')) {
    // Checkmate — triumphant ascending chord
    playTone(523, 0.15, 'square', 0.06);
    setTimeout(() => playTone(659, 0.15, 'square', 0.06), 120);
    setTimeout(() => playTone(784, 0.3, 'sine', 0.08), 240);
    setTimeout(() => playNoiseBurst(0.08, 0.1, 2000), 240);
  } else if (move.san && move.san.includes('+')) {
    // Check — sharp alert
    playTone(880, 0.08, 'square', 0.06);
    playNoiseBurst(0.04, 0.08, 1200);
    setTimeout(() => playTone(880, 0.08, 'square', 0.06), 120);
  } else if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
    // Castle — two thuds
    playNoiseBurst(0.05, 0.12, 600);
    setTimeout(() => playNoiseBurst(0.05, 0.1, 700), 100);
  } else if (move.captured) {
    // Capture — heavier impact
    playNoiseBurst(0.07, 0.15, 900);
    playTone(250, 0.06, 'triangle', 0.05);
  } else {
    // Normal move — soft tap
    playNoiseBurst(0.04, 0.1, 600);
  }
}

function initSoundToggle() {
  const btn = DOM.btnSound;
  if (!btn) return;

  const saved = safeStorage.get('chess-arena-sound');
  if (saved !== null) soundEnabled = saved === 'true';
  updateSoundButton();

  btn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    safeStorage.set('chess-arena-sound', soundEnabled);
    updateSoundButton();
  });
}

function updateSoundButton() {
  const btn = DOM.btnSound;
  if (!btn) return;
  btn.textContent = soundEnabled ? '♪ Sound' : '♪ Muted';
  btn.classList.toggle('active', soundEnabled);
}

/* ===========================================================
   LIGHT/DARK THEME
   =========================================================== */
function initThemeToggle() {
  const btn = DOM.btnTheme;
  if (!btn) return;

  const saved = safeStorage.get('chess-arena-theme');
  if (saved === 'light') document.body.classList.add('light-theme');
  updateThemeButton();

  btn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    safeStorage.set('chess-arena-theme', isLight ? 'light' : 'dark');
    updateThemeButton();
  });
}

function updateThemeButton() {
  const btn = DOM.btnTheme;
  if (!btn) return;
  const isLight = document.body.classList.contains('light-theme');
  btn.textContent = isLight ? '☀ Light' : '☾ Dark';
  btn.classList.toggle('active', isLight);
}

/* ===========================================================
   BOARD COLOR THEME
   =========================================================== */
const BOARD_THEMES = ['classic', 'green', 'blue', 'wood'];
let currentBoardTheme = 'classic';

function initBoardThemeToggle() {
  const btn = document.getElementById('btnBoardTheme');
  if (!btn) return;

  const saved = safeStorage.get('chess-arena-board-theme');
  if (saved && BOARD_THEMES.includes(saved)) {
    currentBoardTheme = saved;
    applyBoardTheme(currentBoardTheme);
  }

  btn.addEventListener('click', () => {
    const idx = BOARD_THEMES.indexOf(currentBoardTheme);
    currentBoardTheme = BOARD_THEMES[(idx + 1) % BOARD_THEMES.length];
    applyBoardTheme(currentBoardTheme);
    safeStorage.set('chess-arena-board-theme', currentBoardTheme);
  });
}

function applyBoardTheme(theme) {
  const container = document.getElementById('board-container');
  if (!container) return;
  BOARD_THEMES.forEach(t => container.classList.remove('board-theme-' + t));
  if (theme !== 'classic') container.classList.add('board-theme-' + theme);
}

/* ===========================================================
   OPENING NAME DISPLAY
   =========================================================== */
function loadOpeningBook() {
  fetch('assets/openings.json')
    .then(r => r.json())
    .then(data => { openingBook = data; })
    .catch(() => { openingBook = null; });
}

function updateOpeningName() {
  if (!openingBook || !DOM.openingName) return;
  const history = game.history();
  if (history.length === 0 || history.length > MAX_OPENING_MOVES) {
    DOM.openingName.textContent = '';
    return;
  }

  // Try longest match first
  let name = '';
  for (let len = history.length; len >= 1; len--) {
    const key = history.slice(0, len).join(' ');
    if (openingBook[key]) {
      name = openingBook[key];
      break;
    }
  }
  DOM.openingName.textContent = name;
}

/* ===========================================================
   FEN INPUT DIALOG
   =========================================================== */
function showFENDialog() {
  DOM.fenInput.value = '';
  DOM.fenError.classList.add('hidden');
  openDialog(DOM.fenOverlay);
}

function hideFENDialog() {
  closeDialog(DOM.fenOverlay);
}

function loadFEN() {
  const fen = DOM.fenInput.value.trim();
  if (!fen) return;

  const valid = game.load(fen);
  if (!valid) {
    DOM.fenError.classList.remove('hidden');
    return;
  }

  hideFENDialog();

  createBoard();

  if (!stockfish && !stockfishReady) initStockfish();

  gameActive = !game.game_over();
  aiThinking = false;
  viewIndex = -1;
  drawCooldown = 0;
  currentEval = 0;

  // Initialize clock if time control is set
  timeControl = parseTimeControl(currentTimePreset);
  if (timeControl) {
    timeWhite = timeControl.initial;
    timeBlack = timeControl.initial;
    startClock();
  }
  updateClockDisplay();

  updateStatus();
  updateMoveHistory();
  updateCapturedPieces();
  updateEvalBar(0);
  saveGameState();

  // If it's AI's turn, request move
  const isAITurn =
    (playerColor === 'white' && game.turn() === 'b') ||
    (playerColor === 'black' && game.turn() === 'w');
  if (gameActive && isAITurn) {
    requestAIMove();
  }
}

/* ===========================================================
   HINTS TOGGLE
   =========================================================== */
function initHintsToggle() {
  const btn = DOM.btnHints;
  if (!btn) return;
  btn.addEventListener('click', () => {
    hintsEnabled = !hintsEnabled;
    btn.classList.toggle('active', hintsEnabled);
    if (!hintsEnabled) clearArrows();
    else if (bestMovePV) drawArrow(bestMovePV.from, bestMovePV.to);
  });
}

/* ===========================================================
   KEYBOARD SHORTCUTS
   =========================================================== */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Nu intercepta dacă user-ul scrie într-un input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key.toLowerCase()) {
      case 'n':
        e.preventDefault();
        showColorDialog();
        break;
      case 'u':
        e.preventDefault();
        undoMove();
        break;
      case 'r':
        e.preventDefault();
        resignGame();
        break;
      case 'e':
        e.preventDefault();
        exportPGN();
        break;
      case 'f':
        e.preventDefault();
        flipBoard();
        break;
      case 'arrowleft':
        e.preventDefault();
        navPrev();
        break;
      case 'arrowright':
        e.preventDefault();
        navNext();
        break;
    }
  });
}

/* ===========================================================
   EXPORT PGN
   =========================================================== */
function exportPGN() {
  const pgn = game.pgn({ max_width: 80, newline_char: '\n' });
  if (!pgn) return;

  const header = [
    '[Event "Chess Arena"]',
    '[Site "Browser"]',
    '[Date "' + new Date().toISOString().split('T')[0] + '"]',
    '[White "' + (playerColor === 'white' ? 'Player' : 'Stockfish') + '"]',
    '[Black "' + (playerColor === 'black' ? 'Player' : 'Stockfish') + '"]',
    '[Result "' + getGameResult() + '"]',
    ''
  ].join('\n');

  const fullPgn = header + pgn;

  // Copy to clipboard
  navigator.clipboard.writeText(fullPgn).then(() => {
    const original = DOM.statusText.textContent;
    DOM.statusText.textContent = 'PGN copied to clipboard!';
    setTimeout(() => {
      if (DOM.statusText.textContent === 'PGN copied to clipboard!') {
        DOM.statusText.textContent = original;
      }
    }, 2000);
  }).catch(() => {
    // Fallback: download ca fișier
    const blob = new Blob([fullPgn], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chess-arena-' + Date.now() + '.pgn';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function getGameResult() {
  if (!game.game_over()) return '*';
  if (game.in_draw()) return '1/2-1/2';
  if (game.in_checkmate()) {
    return game.turn() === 'w' ? '0-1' : '1-0';
  }
  return '*';
}

/* ===========================================================
   PERSISTENCE — localStorage
   =========================================================== */
function saveGameState() {
  if (!gameActive) return;
  const state = {
    fen: game.fen(),
    pgn: game.pgn(),
    playerColor: playerColor,
    difficulty: currentDifficulty,
    timePreset: currentTimePreset,
    timeWhite: timeWhite,
    timeBlack: timeBlack
  };
  safeStorage.set('chess-arena-game', JSON.stringify(state));
}

function loadGameState() {
  const saved = safeStorage.get('chess-arena-game');
  if (!saved) return;

  try {
    const state = JSON.parse(saved);
    if (!state.fen) return;

    // Restaurăm jocul
    playerColor = state.playerColor || 'white';
    currentDifficulty = state.difficulty || 'medium';

    // Încarcă PGN dacă există (păstrează istoricul complet)
    if (state.pgn) {
      game.load_pgn(state.pgn);
    } else {
      game.load(state.fen);
    }

    // Hide color dialog (immediate, no animation on load)
    _activeDialog = null;
    DOM.colorOverlay.classList.remove('visible');
    DOM.colorOverlay.classList.add('hidden');

    createBoard();

    // Lazy-load Stockfish when resuming a saved game
    if (!stockfish && !stockfishReady) initStockfish();

    gameActive = !game.game_over();
    aiThinking = false;

    // Restore clock state
    if (state.timePreset && state.timePreset !== 'none') {
      currentTimePreset = state.timePreset;
      timeControl = parseTimeControl(state.timePreset);
      timeWhite = state.timeWhite || (timeControl ? timeControl.initial : 0);
      timeBlack = state.timeBlack || (timeControl ? timeControl.initial : 0);
      if (gameActive) startClock();
    }
    updateClockDisplay();

    // Actualizează dificultatea
    applyDifficulty(currentDifficulty);
    const diffBtns = document.querySelectorAll('.diff-btn');
    diffBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.level === currentDifficulty);
    });

    updateStatus();
    updateMoveHistory();
    updateCapturedPieces();
    updateEvalBar(0);

    // Dacă e tura AI-ului, cere mutare
    const isAITurn =
      (playerColor === 'white' && game.turn() === 'b') ||
      (playerColor === 'black' && game.turn() === 'w');
    if (gameActive && isAITurn) {
      requestAIMove();
    }
  } catch (e) {
    console.error('Could not restore game:', e);
    clearGameState();
  }
}

function clearGameState() {
  safeStorage.remove('chess-arena-game');
}

/* ===========================================================
   GAME ARCHIVE — completed games history
   =========================================================== */
function saveToArchive() {
  const pgn = game.pgn({ max_width: 80 });
  if (!pgn || game.history().length < 2) return;

  const record = {
    pgn: pgn,
    result: getGameResult(),
    date: new Date().toISOString(),
    playerColor: playerColor,
    difficulty: currentDifficulty,
    moves: game.history().length
  };

  const raw = safeStorage.get('chess-arena-archive');
  let archive = [];
  try { archive = raw ? JSON.parse(raw) : []; } catch(e) { archive = []; }

  archive.unshift(record);
  if (archive.length > MAX_ARCHIVE_SIZE) archive = archive.slice(0, MAX_ARCHIVE_SIZE);
  safeStorage.set('chess-arena-archive', JSON.stringify(archive));
  renderArchive();
}

function loadArchive() {
  renderArchive();
}

function renderArchive() {
  if (!DOM.archiveList) return;
  const raw = safeStorage.get('chess-arena-archive');
  let archive = [];
  try { archive = raw ? JSON.parse(raw) : []; } catch(e) { archive = []; }

  if (archive.length === 0) {
    DOM.archiveList.innerHTML = '<p class="archive-empty">No completed games yet.</p>';
    return;
  }

  let html = '';
  archive.forEach((g, i) => {
    const date = new Date(g.date);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const resultIcon = g.result === '1-0'
      ? (g.playerColor === 'white' ? 'Win' : 'Loss')
      : g.result === '0-1'
        ? (g.playerColor === 'black' ? 'Win' : 'Loss')
        : g.result === '1/2-1/2' ? 'Draw' : '?';
    const resultClass = resultIcon === 'Win' ? 'result-win' : resultIcon === 'Loss' ? 'result-loss' : 'result-draw';

    html += `<div class="archive-item" onclick="loadArchiveGame(${i})">`;
    html += `<span class="archive-result ${resultClass}">${resultIcon}</span>`;
    html += `<span class="archive-info">${g.moves} moves · ${g.difficulty} · ${g.playerColor}</span>`;
    html += `<span class="archive-date">${dateStr}</span>`;
    html += `<button class="archive-delete" onclick="deleteArchiveGame(${i}, event)" title="Delete" aria-label="Delete game">&times;</button>`;
    html += `</div>`;
  });

  DOM.archiveList.innerHTML = html;
}

function loadArchiveGame(index) {
  const raw = safeStorage.get('chess-arena-archive');
  let archive = [];
  try { archive = raw ? JSON.parse(raw) : []; } catch(e) { return; }
  if (!archive[index]) return;

  const record = archive[index];
  game.reset();
  game.load_pgn(record.pgn);
  playerColor = record.playerColor || 'white';

  createBoard({ draggable: false });

  gameActive = false;
  aiThinking = false;
  viewIndex = -1;

  updateStatus();
  updateMoveHistory();
  updateCapturedPieces();
  updateOpeningName();
  updateEvalBar(0);
  updateClockDisplay();
  DOM.statusText.textContent = 'Reviewing: ' + (record.result || '?');
}

function deleteArchiveGame(index, event) {
  if (event) event.stopPropagation();
  const raw = safeStorage.get('chess-arena-archive');
  let archive = [];
  try { archive = raw ? JSON.parse(raw) : []; } catch(e) { return; }
  archive.splice(index, 1);
  safeStorage.set('chess-arena-archive', JSON.stringify(archive));
  renderArchive();
}

function clearGameArchive() {
  safeStorage.remove('chess-arena-archive');
  renderArchive();
}

/* ===========================================================
   GAME RESULT MODAL
   =========================================================== */
function showResultModal(outcome, message) {
  const overlay = DOM.resultOverlay;
  if (!overlay) return;

  const icon = overlay.querySelector('.result-modal-icon');
  const title = overlay.querySelector('.result-modal-title');
  const detail = overlay.querySelector('.result-modal-detail');
  const movesEl = overlay.querySelector('.result-modal-moves');

  if (icon) {
    icon.textContent = outcome === 'win' ? '&#9813;' : outcome === 'loss' ? '&#9819;' : '&#189;';
    icon.className = 'result-modal-icon result-' + outcome;
    // Re-parse HTML entities
    icon.innerHTML = icon.textContent;
    if (outcome === 'win') icon.innerHTML = '&#9813;';
    else if (outcome === 'loss') icon.innerHTML = '&#9819;';
    else icon.innerHTML = '&#189;';
  }
  if (title) {
    title.textContent = outcome === 'win' ? 'Victory!' : outcome === 'loss' ? 'Defeat' : 'Draw';
    title.className = 'result-modal-title result-' + outcome;
  }
  if (detail) detail.textContent = message;
  if (movesEl) movesEl.textContent = game.history().length + ' moves · ' + currentDifficulty;

  openDialog(overlay);

  // Update stats
  updateStats(outcome);
}

/* ===========================================================
   PLAYER STATISTICS (3.1)
   =========================================================== */
function getStats() {
  const raw = safeStorage.get('chess-arena-stats');
  try { return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
}

function getDefaultStats() {
  return {
    games: 0, wins: 0, losses: 0, draws: 0,
    currentStreak: 0, bestStreak: 0,
    puzzlesSolved: 0, puzzleStreak: 0, bestPuzzleStreak: 0
  };
}

function updateStats(outcome) {
  const stats = getStats() || getDefaultStats();
  stats.games++;
  if (outcome === 'win') {
    stats.wins++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
  } else if (outcome === 'loss') {
    stats.losses++;
    stats.currentStreak = 0;
  } else {
    stats.draws++;
    stats.currentStreak = 0;
  }
  safeStorage.set('chess-arena-stats', JSON.stringify(stats));
  renderStats();
}

function updatePuzzleStats() {
  const stats = getStats() || getDefaultStats();
  stats.puzzlesSolved++;
  stats.puzzleStreak++;
  if (stats.puzzleStreak > stats.bestPuzzleStreak) stats.bestPuzzleStreak = stats.puzzleStreak;
  safeStorage.set('chess-arena-stats', JSON.stringify(stats));
}

function resetPuzzleStreak() {
  const stats = getStats() || getDefaultStats();
  stats.puzzleStreak = 0;
  safeStorage.set('chess-arena-stats', JSON.stringify(stats));
}

function renderStats() {
  const stats = getStats() || getDefaultStats();
  const el = (id) => document.getElementById(id);
  if (el('statGames')) el('statGames').textContent = stats.games;
  if (el('statWins')) el('statWins').textContent = stats.wins;
  if (el('statLosses')) el('statLosses').textContent = stats.losses;
  if (el('statDraws')) el('statDraws').textContent = stats.draws;
  if (el('statWinRate')) {
    const rate = stats.games > 0 ? Math.round((stats.wins / stats.games) * 100) : 0;
    el('statWinRate').textContent = rate + '%';
  }
  if (el('statStreak')) el('statStreak').textContent = stats.bestStreak;
}

function resetStats() {
  safeStorage.remove('chess-arena-stats');
  renderStats();
}

/* ===========================================================
   PGN IMPORT (3.3)
   =========================================================== */
function showPGNDialog() {
  if (DOM.pgnInput) DOM.pgnInput.value = '';
  if (DOM.pgnError) DOM.pgnError.classList.add('hidden');
  openDialog(DOM.pgnOverlay);
}

function hidePGNDialog() {
  closeDialog(DOM.pgnOverlay);
}

function importPGN() {
  const pgnText = DOM.pgnInput ? DOM.pgnInput.value.trim() : '';
  if (!pgnText) return;

  const tempGame = new Chess();
  const valid = tempGame.load_pgn(pgnText);
  if (!valid) {
    if (DOM.pgnError) DOM.pgnError.classList.remove('hidden');
    return;
  }

  hidePGNDialog();

  // Load the imported game for review
  game.reset();
  game.load_pgn(pgnText);
  playerColor = 'white';

  createBoard({ draggable: false });

  gameActive = false;
  aiThinking = false;
  viewIndex = -1;
  stopClock();
  timeControl = null;

  updateStatus();
  updateMoveHistory();
  updateCapturedPieces();
  updateOpeningName();
  updateEvalBar(0);
  updateClockDisplay();
  DOM.statusText.textContent = 'Imported PGN — ' + game.history().length + ' moves';
  if (DOM.btnAnalyze) DOM.btnAnalyze.disabled = false;
}

/* ===========================================================
   ELO SLIDER (3.4)
   =========================================================== */
function initEloSlider() {
  const slider = DOM.eloSlider;
  const display = DOM.eloValue;
  if (!slider || !display) return;

  slider.addEventListener('input', () => {
    display.textContent = slider.value;
    // Deselect preset buttons
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    currentDifficulty = 'custom';
  });
}

function getCustomDifficulty(elo) {
  elo = parseInt(elo);
  if (elo <= 1000) {
    return { elo: elo, depth: Math.max(3, Math.floor(elo / 150)), movetime: null };
  }
  const movetime = Math.min(10000, 1000 + Math.floor((elo - 1000) / 200) * 1000);
  return { elo: elo, depth: null, movetime: movetime };
}

/* ===========================================================
   CUSTOM TIME CONTROL (3.6)
   =========================================================== */
function initTimeSelector() {
  const buttons = document.querySelectorAll('.time-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimePreset = btn.dataset.time;

      if (DOM.customTimeRow) {
        DOM.customTimeRow.classList.toggle('hidden', currentTimePreset !== 'custom');
      }
    });
  });
}

function parseTimeControl(preset) {
  if (!preset || preset === 'none') return null;

  if (preset === 'custom') {
    const base = parseInt(document.getElementById('customBase').value) || 5;
    const inc = parseInt(document.getElementById('customIncrement').value) || 0;
    return { initial: base * 60 * 1000, increment: inc * 1000 };
  }

  const parts = preset.split('+');
  return {
    initial: parseInt(parts[0]) * 60 * 1000,
    increment: parseInt(parts[1]) * 1000
  };
}

/* ===========================================================
   POST-GAME ANALYSIS (3.2)
   =========================================================== */
let analysisIndex = 0;

function startAnalysis() {
  if (analysisRunning || !stockfish || !stockfishReady) return;
  if (game.history().length < 2) return;

  analysisResults = [];
  analysisIndex = 0;
  analysisRunning = true;
  DOM.statusText.textContent = 'Analyzing... (0/' + game.history().length + ')';
  if (DOM.btnAnalyze) DOM.btnAnalyze.disabled = true;

  analyzeNextPosition();
}

function analyzeNextPosition() {
  if (!analysisRunning) return;

  const history = game.history();
  if (analysisIndex > history.length) {
    finishAnalysis();
    return;
  }

  // Build position up to analysisIndex
  const tempGame = new Chess();
  for (let i = 0; i < analysisIndex; i++) {
    tempGame.move(history[i]);
  }

  // Store a one-shot handler for this analysis position
  _analysisHandler = function(message) {
    if (typeof message !== 'string') return;

    if (message.includes(' score ')) {
      const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
      if (scoreMatch) {
        const type = scoreMatch[1];
        const value = parseInt(scoreMatch[2]);
        let evalCp;
        if (type === 'cp') {
          evalCp = tempGame.turn() === 'w' ? value : -value;
        } else {
          evalCp = value > 0
            ? (tempGame.turn() === 'w' ? 10000 : -10000)
            : (tempGame.turn() === 'w' ? -10000 : 10000);
        }
        _currentAnalysisEval = evalCp;
      }
    }

    if (message.startsWith('bestmove')) {
      analysisResults.push({ eval: _currentAnalysisEval || 0 });
      analysisIndex++;
      DOM.statusText.textContent = 'Analyzing... (' + analysisIndex + '/' + history.length + ')';
      setTimeout(analyzeNextPosition, 10);
    }
  };

  stockfish.postMessage('position fen ' + tempGame.fen());
  stockfish.postMessage('go depth 12');
}

function finishAnalysis() {
  analysisRunning = false;
  _analysisHandler = null;

  // Calculate annotations based on eval differences
  for (let i = 1; i < analysisResults.length; i++) {
    const prev = analysisResults[i - 1].eval;
    const curr = analysisResults[i].eval;
    const drop = prev - curr;  // positive = position got worse for white

    // Check if it was white's or black's move
    const wasWhiteMove = (i % 2 === 1);
    const evalDrop = wasWhiteMove ? drop : -drop;

    if (evalDrop > 200) {
      analysisResults[i].annotation = '??';  // blunder
    } else if (evalDrop > 100) {
      analysisResults[i].annotation = '?';   // mistake
    } else if (evalDrop > 50) {
      analysisResults[i].annotation = '?!';  // inaccuracy
    } else if (evalDrop < -100) {
      analysisResults[i].annotation = '!';   // good move
    }
  }

  DOM.statusText.textContent = 'Analysis complete!';
  if (DOM.btnAnalyze) DOM.btnAnalyze.disabled = false;
  updateMoveHistoryWithAnalysis();
}

function updateMoveHistoryWithAnalysis() {
  const history = game.history();
  const container = DOM.moveHistory;
  if (!container || history.length === 0) return;

  const activeIdx = viewIndex === -1 ? history.length - 1 : viewIndex;
  let html = '';
  for (let i = 0; i < history.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    html += `<span class="move-number">${moveNum}.</span>`;

    const wActive = i === activeIdx ? ' active' : '';
    const wAnnotation = analysisResults[i + 1] ? analysisResults[i + 1].annotation : '';
    const wClass = getAnnotationClass(wAnnotation);
    html += `<span class="move-white${wActive}" onclick="navTo(${i})">${history[i]}`;
    if (wAnnotation) html += `<span class="move-annotation ${wClass}">${wAnnotation}</span>`;
    html += `</span>`;

    if (history[i + 1]) {
      const bActive = (i + 1) === activeIdx ? ' active' : '';
      const bAnnotation = analysisResults[i + 2] ? analysisResults[i + 2].annotation : '';
      const bClass = getAnnotationClass(bAnnotation);
      html += `<span class="move-black${bActive}" onclick="navTo(${i + 1})">${history[i + 1]}`;
      if (bAnnotation) html += `<span class="move-annotation ${bClass}">${bAnnotation}</span>`;
      html += `</span>`;
    }
  }
  container.innerHTML = html;
}

function getAnnotationClass(annotation) {
  if (annotation === '??') return 'blunder';
  if (annotation === '?') return 'mistake';
  if (annotation === '?!') return 'inaccuracy';
  if (annotation === '!' || annotation === '!!') return 'good';
  return '';
}
