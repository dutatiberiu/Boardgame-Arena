/* ================================================================
   CHECKERS — GAME MODULE
   Depends on ai.js (loaded first):
     EMPTY, LIGHT, DARK, LIGHT_KING, DARK_KING
     isLight, isDark, isKing, colorOf, opponent
     getAllMoves, getMovesForPiece, executeMoveOnBoard, getBestMove
   ================================================================ */

/* ----------------------------------------------------------------
   DIFFICULTY CONFIG
   ---------------------------------------------------------------- */
const DIFFICULTY_DEPTHS = { easy: 1, medium: 3, hard: 5, expert: 7 };
let difficulty = 'hard';

/* ----------------------------------------------------------------
   GLOBAL STATE
   ---------------------------------------------------------------- */
let board        = [];
let playerColor  = LIGHT;
let aiColor      = DARK;
let currentTurn  = LIGHT;
let gameActive   = false;
let aiThinking   = false;

let selectedPiece = null;   // { r, c } or null
let validMoves    = [];     // moves for selected piece

let moveHistory   = [];     // [{ board: copy, currentTurn }] for undo

let scores = loadScores();

/* ----------------------------------------------------------------
   BOARD INIT
   ---------------------------------------------------------------- */
function initBoard() {
  board = [];
  for (let r = 0; r < 8; r++) {
    board[r] = [];
    for (let c = 0; c < 8; c++) {
      board[r][c] = EMPTY;
      if ((r + c) % 2 === 1) {
        if (r < 3)      board[r][c] = DARK;
        else if (r > 4) board[r][c] = LIGHT;
      }
    }
  }
}

/* ----------------------------------------------------------------
   RENDER — redraws the full 8×8 board
   ---------------------------------------------------------------- */
function render() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const allMoves      = gameActive ? getAllMoves(currentTurn, board) : [];
  const movablePieces = new Set(allMoves.map(m => `${m.from.r},${m.from.c}`));
  const hasCaptures   = allMoves.length > 0 && allMoves[0].captures.length > 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'sq ' + ((r + c) % 2 === 1 ? 'dark' : 'light');
      sq.dataset.r = r;
      sq.dataset.c = c;

      // Selected square highlight
      if (selectedPiece && selectedPiece.r === r && selectedPiece.c === c) {
        sq.classList.add('selected');
      }

      // Must-move ring (capture is mandatory)
      if (gameActive && !aiThinking &&
          colorOf(board[r][c]) === currentTurn && currentTurn === playerColor &&
          movablePieces.has(`${r},${c}`) && hasCaptures) {
        sq.classList.add('must-move');
      }

      // Valid move / capture indicators
      const vm = validMoves.find(m => m.to.r === r && m.to.c === c);
      if (vm) {
        if (vm.captures.length > 0) {
          sq.classList.add('capture-target');
          const ring = document.createElement('div');
          ring.className = 'capture-ring';
          sq.appendChild(ring);
        } else {
          sq.classList.add('move-target');
          const dot = document.createElement('div');
          dot.className = 'move-dot';
          sq.appendChild(dot);
        }
      }

      // Piece
      if (board[r][c] !== EMPTY) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece ' + (isLight(board[r][c]) ? 'light-piece' : 'dark-piece');
        if (isKing(board[r][c])) pieceEl.classList.add('king');

        // Drag start
        pieceEl.addEventListener('mousedown', (e) => startDrag(e, r, c));
        sq.appendChild(pieceEl);
      }

      sq.addEventListener('click', () => handleClick(r, c));
      boardEl.appendChild(sq);
    }
  }

  updatePieceCount();
  updateUndoButton();
}

/* ----------------------------------------------------------------
   CLICK HANDLER
   ---------------------------------------------------------------- */
function handleClick(r, c) {
  if (!gameActive || aiThinking || currentTurn !== playerColor) return;

  // Click on a highlighted target → execute move
  const targetMove = validMoves.find(m => m.to.r === r && m.to.c === c);
  if (targetMove) {
    pushHistory();
    doPlayerMove(targetMove);
    return;
  }

  // Click on own piece → select it
  if (colorOf(board[r][c]) === playerColor) {
    const moves = getMovesForPiece(r, c, board);
    selectedPiece = moves.length > 0 ? { r, c } : null;
    validMoves    = moves.length > 0 ? moves : [];
    render();
    return;
  }

  // Click elsewhere → deselect
  selectedPiece = null;
  validMoves    = [];
  render();
}

/* ----------------------------------------------------------------
   DRAG & DROP
   ---------------------------------------------------------------- */
let ghost = null;

function startDrag(e, r, c) {
  if (!gameActive || aiThinking || currentTurn !== playerColor) return;
  if (colorOf(board[r][c]) !== playerColor) return;

  const moves = getMovesForPiece(r, c, board);
  selectedPiece = { r, c };
  validMoves    = moves.length > 0 ? moves : [];
  render();

  if (moves.length === 0) return;

  // Build ghost element matching the piece visually
  const pieceEl = e.currentTarget;
  const size    = pieceEl.getBoundingClientRect().width;

  ghost = document.createElement('div');
  ghost.className = pieceEl.className + ' drag-ghost';
  ghost.style.width  = size + 'px';
  ghost.style.height = size + 'px';
  ghost.style.left   = e.clientX + 'px';
  ghost.style.top    = e.clientY + 'px';
  document.body.appendChild(ghost);

  pieceEl.classList.add('dragging');
  e.preventDefault();
}

document.addEventListener('mousemove', (e) => {
  if (!ghost) return;
  ghost.style.left = e.clientX + 'px';
  ghost.style.top  = e.clientY + 'px';
});

document.addEventListener('mouseup', (e) => {
  if (!ghost) return;

  // Temporarily hide ghost to hit-test the element underneath
  ghost.style.display = 'none';
  const el = document.elementFromPoint(e.clientX, e.clientY);
  ghost.style.display = '';

  document.body.removeChild(ghost);
  ghost = null;

  const dragging = document.querySelector('.piece.dragging');
  if (dragging) dragging.classList.remove('dragging');

  // Find the target square
  const sq = el && el.closest('[data-r]');
  if (!sq) return;

  const tr = parseInt(sq.dataset.r);
  const tc = parseInt(sq.dataset.c);

  const targetMove = validMoves.find(m => m.to.r === tr && m.to.c === tc);
  if (targetMove) {
    pushHistory();
    doPlayerMove(targetMove);
  }
});

/* ----------------------------------------------------------------
   PLAYER MOVE EXECUTION
   ---------------------------------------------------------------- */
function doPlayerMove(move) {
  executeMove(move);
  selectedPiece = null;
  validMoves    = [];
  render();

  if (checkGameEnd()) return;

  currentTurn = opponent(currentTurn);
  updateTurnStatus();
  render();

  // Trigger AI response
  aiThinking = true;
  document.getElementById('thinking').classList.add('active');
  setTimeout(() => {
    aiTurn();
    aiThinking = false;
    document.getElementById('thinking').classList.remove('active');
  }, 600);
}

/* ----------------------------------------------------------------
   EXECUTE MOVE (mutates the live `board`)
   ---------------------------------------------------------------- */
function executeMove(move) {
  const piece = board[move.from.r][move.from.c];
  board[move.from.r][move.from.c] = EMPTY;
  for (const cap of move.captures) board[cap.r][cap.c] = EMPTY;
  board[move.to.r][move.to.c] = piece;
  if (move.to.r === 0 && piece === LIGHT) board[move.to.r][move.to.c] = LIGHT_KING;
  else if (move.to.r === 7 && piece === DARK) board[move.to.r][move.to.c] = DARK_KING;
}

/* ----------------------------------------------------------------
   AI TURN
   ---------------------------------------------------------------- */
function aiTurn() {
  if (!gameActive || currentTurn !== aiColor) return;

  const depth = DIFFICULTY_DEPTHS[difficulty] || 5;
  const move  = getBestMove(board, aiColor, playerColor, depth);

  if (!move) {
    endGame(playerColor);
    return;
  }

  executeMove(move);

  if (checkGameEnd()) {
    render();
    return;
  }

  currentTurn = opponent(currentTurn);
  updateTurnStatus();
  render();
}

/* ----------------------------------------------------------------
   GAME END
   ---------------------------------------------------------------- */
function checkGameEnd() {
  const lightCount = countPieces(LIGHT);
  const darkCount  = countPieces(DARK);
  const lightMoves = getAllMoves(LIGHT, board);
  const darkMoves  = getAllMoves(DARK, board);

  if (lightCount === 0 || lightMoves.length === 0) { endGame(DARK);  return true; }
  if (darkCount  === 0 || darkMoves.length  === 0) { endGame(LIGHT); return true; }
  return false;
}

function countPieces(color) {
  let n = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (colorOf(board[r][c]) === color) n++;
  return n;
}

function endGame(winner) {
  gameActive = false;
  document.getElementById('statusBar').classList.add('game-over');

  const playerWon = winner === playerColor;
  setStatus(playerWon ? 'You win!' : 'AI wins!', playerWon ? 'Win!' : 'Loss');

  if (playerWon) scores.player++;
  else           scores.ai++;

  saveScores();
  updateScoreboard();
  render();
}

/* ----------------------------------------------------------------
   UNDO (reverts the last player move)
   ---------------------------------------------------------------- */
function pushHistory() {
  moveHistory.push({
    board: board.map(row => [...row]),
    currentTurn
  });
}

function undoMove() {
  if (moveHistory.length === 0) return;

  const state   = moveHistory.pop();
  board         = state.board;
  currentTurn   = playerColor; // always return control to player
  selectedPiece = null;
  validMoves    = [];
  gameActive    = true;

  document.getElementById('statusBar').classList.remove('game-over');
  updateTurnStatus();
  updateScoreboard();
  render();
}

function updateUndoButton() {
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = moveHistory.length === 0 || !gameActive;
}

/* ----------------------------------------------------------------
   UI HELPERS
   ---------------------------------------------------------------- */
function setStatus(text, badge) {
  document.getElementById('statusText').textContent = text;
  document.getElementById('turnBadge').textContent  = badge;
}

function updateTurnStatus() {
  const isPlayer = currentTurn === playerColor;
  setStatus(isPlayer ? 'Your turn' : 'AI is thinking...', isPlayer ? 'You' : 'AI');
}

function updatePieceCount() {
  const pl = countPieces(playerColor);
  const ai = countPieces(aiColor);
  document.getElementById('piecesPlayer').textContent = pl;
  document.getElementById('piecesAI').textContent     = ai;
  document.getElementById('captured').textContent     = `${12 - ai} — ${12 - pl}`;
}

/* ----------------------------------------------------------------
   SCOREBOARD + LOCALSTORAGE
   ---------------------------------------------------------------- */
function loadScores() {
  try {
    const s = localStorage.getItem('bga_checkers_scores');
    return s ? JSON.parse(s) : { player: 0, ai: 0 };
  } catch { return { player: 0, ai: 0 }; }
}

function saveScores() {
  try { localStorage.setItem('bga_checkers_scores', JSON.stringify(scores)); } catch {}
}

function updateScoreboard() {
  document.getElementById('scorePlayer').textContent = scores.player;
  document.getElementById('scoreAI').textContent     = scores.ai;
}

function resetScores() {
  scores = { player: 0, ai: 0 };
  saveScores();
  updateScoreboard();
}

/* ----------------------------------------------------------------
   DIFFICULTY
   ---------------------------------------------------------------- */
function setDifficulty(d) {
  difficulty = d;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.diff-btn[data-diff="${d}"]`);
  if (btn) btn.classList.add('active');
}

/* ----------------------------------------------------------------
   GAME LIFECYCLE
   ---------------------------------------------------------------- */
function startGame(color) {
  playerColor = color === 'light' ? LIGHT : DARK;
  aiColor     = opponent(playerColor);

  const overlay = document.getElementById('colorOverlay');
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.add('hidden'), 300);

  initBoard();
  currentTurn   = LIGHT; // light always moves first
  gameActive    = true;
  aiThinking    = false;
  selectedPiece = null;
  validMoves    = [];
  moveHistory   = [];

  document.getElementById('statusBar').classList.remove('game-over');
  updateTurnStatus();
  updateScoreboard();
  render();

  // If AI plays light, it goes first
  if (currentTurn === aiColor) {
    aiThinking = true;
    document.getElementById('thinking').classList.add('active');
    setTimeout(() => {
      aiTurn();
      aiThinking = false;
      document.getElementById('thinking').classList.remove('active');
    }, 500);
  }
}

function showColorDialog() {
  const overlay = document.getElementById('colorOverlay');
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function resignGame() {
  if (!gameActive) return;
  endGame(aiColor);
}

/* ----------------------------------------------------------------
   INIT
   ---------------------------------------------------------------- */
updateScoreboard();
