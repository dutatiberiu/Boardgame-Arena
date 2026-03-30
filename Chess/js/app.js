/* ===========================================================
   APP.JS — Global state + initialization
   =========================================================== */

/* Global state */
let board = null;            // instanța chessboard.js
let game = new Chess();      // instanța chess.js (validare + reguli)
let stockfish = null;        // Web Worker Stockfish
let playerColor = 'white';   // culoarea jucătorului
let gameActive = false;      // jocul este în desfășurare?
let aiThinking = false;      // AI-ul se gândește?
let soundEnabled = true;     // sunete activate?
let currentDifficulty = 'medium';  // dificultate curentă
let _resizeHandler = null;   // referință pentru resize listener

/* Clock state */
let clockInterval = null;
let timeWhite = 0;           // ms remaining for white
let timeBlack = 0;           // ms remaining for black
let lastTickTime = 0;        // timestamp for precise decrement
let timeControl = null;      // { initial: ms, increment: ms } or null = no clock
let currentTimePreset = 'none';

/* Move navigation state */
let viewIndex = -1;  // -1 = live (latest) position
let hintsEnabled = false;
let bestMovePV = null;  // { from: 'e2', to: 'e4' }
let drawCooldown = 0;   // moves until draw offer is available again
let openingBook = null;  // loaded from openings.json
let premove = null;      // { from, to, promotion } or null
let puzzleMode = false;
let puzzleMoves = [];    // correct move sequence
let puzzleMoveIndex = 0; // current index in the sequence

/* Analysis state */
let analysisResults = [];
let analysisRunning = false;
let _analysisHandler = null;
let _currentAnalysisEval = 0;

/* Debounce utility */
function debounce(fn, delay) {
  let timer;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

/* Safe localStorage wrapper */
const safeStorage = {
  get: function(key) { try { return localStorage.getItem(key); } catch(e) { return null; } },
  set: function(key, val) { try { localStorage.setItem(key, val); } catch(e) {} },
  remove: function(key) { try { localStorage.removeItem(key); } catch(e) {} }
};

/* Attach resize handler with debounce (replaces jQuery) */
function attachResizeHandler() {
  if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
  _resizeHandler = debounce(function() { if (board) board.resize(); }, 150);
  window.addEventListener('resize', _resizeHandler);
}

/**
 * Creates/recreates the chessboard with the given options.
 * Centralizes board initialization to avoid duplication.
 * @param {Object} options
 * @param {string} [options.position] - Board position (default: game.fen())
 * @param {string} [options.orientation] - 'white' or 'black' (default: playerColor)
 * @param {Function} [options.onSquareClick] - Custom click handler (default: onSquareClick)
 */
function createBoard(options) {
  options = options || {};
  const config = {
    draggable: false,   // we handle drag ourselves with threshold detection
    position: options.position || game.fen(),
    orientation: options.orientation || playerColor,
    pieceTheme: PIECE_THEME_URL,
    moveSpeed: 150,
    onSquareClick: options.onSquareClick || onSquareClick,
    onMouseoverSquare: onMouseoverSquare,
    onMouseoutSquare: onMouseoutSquare,
  };

  if (board) board.destroy();
  board = Chessboard('board', config);
  initCustomDrag();
  attachResizeHandler();
  return board;
}

/* Stockfish 18 difficulty settings (NNUE)
   - elo: limited via UCI_Elo (more precise than Skill Level)
   - depth: fixed depth (null = use movetime)
   - movetime: thinking time in ms (null = use depth)
*/
const DIFFICULTY = {
  easy:    { elo: 800,  depth: 6,    movetime: null },
  medium:  { elo: 1500, depth: null, movetime: 2000 },
  hard:    { elo: 2200, depth: null, movetime: 4000 },
  expert:  { elo: null, depth: null, movetime: 8000 }  // no limit = max strength
};

/* Piece values for material advantage calculation */
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/* Piece display order for captures */
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'];

/* URL pattern for piece images (local) */
const PIECE_THEME_URL = 'assets/pieces/{piece}.png';

/* Named constants (replacing magic numbers throughout the codebase) */
const ENGINE_TIMEOUT_MS = 30000;
const WORKER_INIT_TIMEOUT_MS = 8000;
const MAX_ARCHIVE_SIZE = 50;
const DRAW_COOLDOWN_MOVES = 5;
const MAX_OPENING_MOVES = 20;
const AI_MOVE_DELAY = 250;
const CLOCK_TICK_INTERVAL = 100;
const LOW_TIME_THRESHOLD = 30000;

/* Cached DOM references (populated on DOMContentLoaded) */
const DOM = {};

/* Dialog management — focus trap, Escape key, accessibility */
let _previousFocus = null;
let _activeDialog = null;

function openDialog(overlay) {
  _previousFocus = document.activeElement;
  _activeDialog = overlay;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    const firstBtn = overlay.querySelector('button');
    if (firstBtn) firstBtn.focus();
  });
}

function closeDialog(overlay) {
  _activeDialog = null;
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.add('hidden'), 300);
  if (_previousFocus) {
    _previousFocus.focus();
    _previousFocus = null;
  }
}

/* Global keydown handler for dialog focus trap + Escape */
document.addEventListener('keydown', function(e) {
  if (!_activeDialog) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    // Close active dialog (specific behavior per dialog type)
    if (_activeDialog === DOM.confirmOverlay) {
      hideConfirmDialog();
    } else if (_activeDialog === DOM.fenOverlay) {
      hideFENDialog();
    } else if (_activeDialog === DOM.pgnOverlay) {
      hidePGNDialog();
    } else if (_activeDialog === DOM.colorOverlay) {
      closeDialog(DOM.colorOverlay);
    } else if (_activeDialog === DOM.resultOverlay) {
      closeDialog(DOM.resultOverlay);
    } else if (_activeDialog === DOM.promotionOverlay) {
      // Cancel promotion — snapback
      if (pendingPromotion) {
        pendingPromotion = null;
        if (board) board.position(game.fen());
      }
      closeDialog(DOM.promotionOverlay);
    }
    return;
  }

  // Focus trap: Tab / Shift+Tab
  if (e.key === 'Tab') {
    const focusable = _activeDialog.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
});

/* ===========================================================
   INIT — Start on page load
   =========================================================== */
document.addEventListener('DOMContentLoaded', function() {
  DOM.statusBar = document.getElementById('statusBar');
  DOM.statusText = document.getElementById('statusText');
  DOM.turnBadge = document.getElementById('turnBadge');
  DOM.evalBarFill = document.getElementById('evalBarFill');
  DOM.evalLabelTop = document.getElementById('evalLabelTop');
  DOM.evalLabelBottom = document.getElementById('evalLabelBottom');
  DOM.moveHistory = document.getElementById('moveHistory');
  DOM.capturedByWhite = document.getElementById('capturedByWhite');
  DOM.capturedByBlack = document.getElementById('capturedByBlack');
  DOM.whiteAdvantage = document.getElementById('whiteAdvantage');
  DOM.blackAdvantage = document.getElementById('blackAdvantage');
  DOM.thinking = document.getElementById('thinking');
  DOM.btnUndo = document.getElementById('btnUndo');
  DOM.btnResign = document.getElementById('btnResign');
  DOM.btnSound = document.getElementById('btnSound');
  DOM.btnTheme = document.getElementById('btnTheme');
  DOM.colorOverlay = document.getElementById('colorOverlay');
  DOM.promotionOverlay = document.getElementById('promotionOverlay');
  DOM.promotionOptions = document.getElementById('promotionOptions');
  DOM.confirmOverlay = document.getElementById('confirmOverlay');
  DOM.clockTop = document.getElementById('clockTop');
  DOM.clockBottom = document.getElementById('clockBottom');
  DOM.arrowOverlay = document.getElementById('arrowOverlay');
  DOM.btnHints = document.getElementById('btnHints');
  DOM.btnDraw = document.getElementById('btnDraw');
  DOM.fenOverlay = document.getElementById('fenOverlay');
  DOM.fenInput = document.getElementById('fenInput');
  DOM.fenError = document.getElementById('fenError');
  DOM.openingName = document.getElementById('openingName');
  DOM.archiveList = document.getElementById('archiveList');
  DOM.resultOverlay = document.getElementById('resultOverlay');
  DOM.engineLoading = document.getElementById('engineLoading');
  DOM.pgnOverlay = document.getElementById('pgnOverlay');
  DOM.pgnInput = document.getElementById('pgnInput');
  DOM.pgnError = document.getElementById('pgnError');
  DOM.eloSlider = document.getElementById('eloSlider');
  DOM.eloValue = document.getElementById('eloValue');
  DOM.customTimeRow = document.getElementById('customTimeRow');
  DOM.btnAnalyze = document.getElementById('btnAnalyze');

  loadOpeningBook();
  initSoundToggle();
  initThemeToggle();
  initHintsToggle();
  initBoardThemeToggle();
  initKeyboardShortcuts();
  initDifficultySelector();
  initEloSlider();
  initTimeSelector();
  loadGameState();
  loadArchive();
  renderStats();
});
