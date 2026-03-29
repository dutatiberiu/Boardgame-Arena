/* ===========================================================
   APP.JS — Global state, constants, DOM cache, dialog mgmt, init
   =========================================================== */

/* ---- Game state ---- */
let board = [];
let bar   = { w: 0, b: 0 };
let off   = { w: 0, b: 0 };
let dice      = [];       // [d1, d2] or [d,d,d,d] for doubles
let remaining = [];       // dice still to be used this turn
let turn        = 'w';
let playerColor = 'w';
let aiColor     = 'b';
let gameActive  = false;
let selectedPt  = -1;     // -1=none, 0-23=point, 24=bar
let validDests  = [];
let aiThinking  = false;

/* ---- New state ---- */
let soundEnabled      = true;
let currentDifficulty = 'medium';
let moveHistory       = [];   // array of { color, dice, moves, boardSnap, barSnap, offSnap }
let historyViewIndex  = -1;   // -1 = live
let doublingCube      = 1;    // 1, 2, 4, 8, 16, 32, 64
let cubeOwner         = null; // 'w', 'b', or null (centered)
let matchLength       = 0;    // 0 = single game, N = first to N points
let matchScore        = { w: 0, b: 0 };
let crawfordGame      = false;
let dragState         = null; // { pointIndex, curX, curY }

/* ---- Canvas dimensions (logical — board is always rendered into W×H) ---- */
const W       = 720;
const H       = 480;
const BAR_W   = 36;
const BEAR_W  = 42;
const FIELD_X = BEAR_W;
const FIELD_W = W - BEAR_W * 2;
const HALF_W  = (FIELD_W - BAR_W) / 2;
const PT_W    = HALF_W / 6;
const PT_H    = H * 0.42;
const CK_R    = PT_W * 0.4;
const CK_D    = CK_R * 1.85;

/* ---- Board color palettes ---- */
const BOARD_THEMES = {
  classic: {
    name:      'Classic',
    boardBg:   '#1e1b14',
    fieldBg:   '#3d3425',
    border:    '#5a4e3a',
    ptLight:   '#c4a265',
    ptDark:    '#6b4e2e',
    bar:       '#2a2418',
    bearOff:   '#1a1710',
    checkerW:  '#f0e4cc',
    checkerWs: '#d9cdb5',
    checkerB:  '#2a2235',
    checkerBs: '#1a1520',
    highlight: 'rgba(212,162,78,0.45)',
    selected:  'rgba(212,162,78,0.7)',
    numColor:  'rgba(255,255,255,0.22)',
  },
  felt: {
    name:      'Green Felt',
    boardBg:   '#0e1a0e',
    fieldBg:   '#1a3a1a',
    border:    '#3a6a3a',
    ptLight:   '#5cb87a',
    ptDark:    '#2d7a4a',
    bar:       '#102010',
    bearOff:   '#0a150a',
    checkerW:  '#f5f5f0',
    checkerWs: '#dde0d8',
    checkerB:  '#1a1030',
    checkerBs: '#100a20',
    highlight: 'rgba(92,184,122,0.45)',
    selected:  'rgba(92,184,122,0.75)',
    numColor:  'rgba(255,255,255,0.20)',
  },
  marble: {
    name:      'Blue Marble',
    boardBg:   '#0e1522',
    fieldBg:   '#162035',
    border:    '#2a4070',
    ptLight:   '#5b8fd9',
    ptDark:    '#2a4a80',
    bar:       '#0e1828',
    bearOff:   '#0a1018',
    checkerW:  '#eef0f5',
    checkerWs: '#cdd0da',
    checkerB:  '#1a0a28',
    checkerBs: '#100520',
    highlight: 'rgba(91,143,217,0.45)',
    selected:  'rgba(91,143,217,0.75)',
    numColor:  'rgba(255,255,255,0.20)',
  },
  wood: {
    name:      'Light Wood',
    boardBg:   '#2e1a0a',
    fieldBg:   '#5a3318',
    border:    '#8a6040',
    ptLight:   '#d4903a',
    ptDark:    '#8a5020',
    bar:       '#3a2210',
    bearOff:   '#251508',
    checkerW:  '#f5e8d0',
    checkerWs: '#e0cfb0',
    checkerB:  '#1a0e05',
    checkerBs: '#120a04',
    highlight: 'rgba(212,144,58,0.45)',
    selected:  'rgba(212,144,58,0.75)',
    numColor:  'rgba(255,255,255,0.22)',
  },
};

let currentBoardTheme = 'classic';
let COL = Object.assign({}, BOARD_THEMES.classic);

/* ---- Named constants ---- */
const MAX_ARCHIVE_SIZE = 50;
const AI_MOVE_DELAY    = 450;

const DIFFICULTY = {
  easy:   { name: 'Easy',   label: '🎲 Easy' },
  medium: { name: 'Medium', label: '⚔️ Medium' },
  hard:   { name: 'Hard',   label: '🧠 Hard' },
  expert: { name: 'Expert', label: '👑 Expert' },
};

/* ---- Safe localStorage wrapper ---- */
const safeStorage = {
  get:    function(key)      { try { return localStorage.getItem(key); }       catch(e) { return null; } },
  set:    function(key, val) { try { localStorage.setItem(key, val); }         catch(e) {} },
  remove: function(key)      { try { localStorage.removeItem(key); }           catch(e) {} },
};

/* ---- Debounce utility ---- */
function debounce(fn, delay) {
  let timer;
  return function() { clearTimeout(timer); timer = setTimeout(fn, delay); };
}

/* ---- Cached DOM references (populated on DOMContentLoaded) ---- */
const DOM = {};

/* ---- Dialog management — focus trap, Escape key, accessibility ---- */
let _previousFocus = null;
let _activeDialog  = null;

function openDialog(overlay) {
  _previousFocus = document.activeElement;
  _activeDialog  = overlay;
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
  if (_previousFocus) { _previousFocus.focus(); _previousFocus = null; }
}

/* Global keydown for Escape + focus trap */
document.addEventListener('keydown', function(e) {
  if (!_activeDialog) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    if (_activeDialog === DOM.confirmOverlay) {
      closeDialog(DOM.confirmOverlay);
    } else if (_activeDialog === DOM.doubleOverlay) {
      // Can't escape a double offer — must accept or decline
    } else if (_activeDialog === DOM.resultOverlay) {
      closeDialog(DOM.resultOverlay);
    } else if (_activeDialog === DOM.colorOverlay) {
      if (gameActive) closeDialog(DOM.colorOverlay);
    }
    return;
  }

  if (e.key === 'Tab') {
    const focusable = _activeDialog.querySelectorAll('button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }
});

/* ===========================================================
   INIT
   =========================================================== */
document.addEventListener('DOMContentLoaded', function() {
  /* Cache DOM refs */
  DOM.statusBar     = document.getElementById('statusBar');
  DOM.statusText    = document.getElementById('statusText');
  DOM.turnBadge     = document.getElementById('turnBadge');
  DOM.boardCanvas   = document.getElementById('boardCanvas');
  DOM.diceRow       = document.getElementById('diceRow');
  DOM.thinking      = document.getElementById('thinking');
  DOM.btnRoll       = document.getElementById('btnRoll');
  DOM.btnUndo       = document.getElementById('btnUndo');
  DOM.btnDouble     = document.getElementById('btnDouble');
  DOM.btnResign     = document.getElementById('btnResign');
  DOM.btnNewGame    = document.getElementById('btnNewGame');
  DOM.btnSound      = document.getElementById('btnSound');
  DOM.btnTheme      = document.getElementById('btnTheme');
  DOM.btnBoardTheme = document.getElementById('btnBoardTheme');
  DOM.colorOverlay  = document.getElementById('colorOverlay');
  DOM.confirmOverlay = document.getElementById('confirmOverlay');
  DOM.resultOverlay = document.getElementById('resultOverlay');
  DOM.doubleOverlay = document.getElementById('doubleOverlay');
  DOM.doubleFromText = document.getElementById('doubleFromText');
  DOM.doubleToText   = document.getElementById('doubleToText');
  DOM.resultIcon    = document.getElementById('resultIcon');
  DOM.resultTitle   = document.getElementById('resultTitle');
  DOM.resultDetail  = document.getElementById('resultDetail');
  DOM.resultStakes  = document.getElementById('resultStakes');
  DOM.scorePlayer   = document.getElementById('scorePlayer');
  DOM.scoreAI       = document.getElementById('scoreAI');
  DOM.pipPlayer     = document.getElementById('pipPlayer');
  DOM.pipAI         = document.getElementById('pipAI');
  DOM.moveHistoryEl = document.getElementById('moveHistoryMoves');
  DOM.archiveList   = document.getElementById('archiveList');
  DOM.matchScoreBar  = document.getElementById('matchScoreBar');
  DOM.matchPlayerPts = document.getElementById('matchPlayerPts');
  DOM.matchAIPts     = document.getElementById('matchAIPts');
  DOM.matchLengthTxt = document.getElementById('matchLengthTxt');
  DOM.navFirst  = document.getElementById('navFirst');
  DOM.navPrev   = document.getElementById('navPrev');
  DOM.navNext   = document.getElementById('navNext');
  DOM.navLast   = document.getElementById('navLast');

  /* Restore preferences */
  const savedTheme = safeStorage.get('bg-arena-theme');
  if (savedTheme === 'light') document.body.classList.add('light-theme');

  const savedBoardTheme = safeStorage.get('bg-arena-board-theme');
  if (savedBoardTheme && BOARD_THEMES[savedBoardTheme]) {
    currentBoardTheme = savedBoardTheme;
    Object.assign(COL, BOARD_THEMES[currentBoardTheme]);
  }

  const savedSound = safeStorage.get('bg-arena-sound');
  if (savedSound === 'off') soundEnabled = false;

  const savedDiff = safeStorage.get('bg-arena-difficulty');
  if (savedDiff && DIFFICULTY[savedDiff]) currentDifficulty = savedDiff;

  /* Wire static button handlers */
  document.getElementById('btnNewGame').addEventListener('click', showColorDialog);
  document.getElementById('btnResign').addEventListener('click', showResignConfirm);
  document.getElementById('btnRoll').addEventListener('click', rollDice);
  document.getElementById('btnUndo').addEventListener('click', undoLastTurn);
  document.getElementById('btnDouble').addEventListener('click', playerOfferDouble);
  document.getElementById('confirmResignBtn').addEventListener('click', executeResign);
  document.getElementById('cancelResignBtn').addEventListener('click', () => closeDialog(DOM.confirmOverlay));
  document.getElementById('acceptDoubleBtn').addEventListener('click', acceptDouble);
  document.getElementById('declineDoubleBtn').addEventListener('click', declineDouble);
  document.getElementById('resultNewGameBtn').addEventListener('click', () => { closeDialog(DOM.resultOverlay); showColorDialog(); });
  document.getElementById('resultCloseBtn').addEventListener('click', () => closeDialog(DOM.resultOverlay));
  document.getElementById('navFirst').addEventListener('click', navFirst);
  document.getElementById('navPrev').addEventListener('click',  navPrev);
  document.getElementById('navNext').addEventListener('click',  navNext);
  document.getElementById('navLast').addEventListener('click',  navLast);
  document.getElementById('clearArchiveBtn').addEventListener('click', clearGameArchive);
  document.getElementById('resetStatsBtn').addEventListener('click',   resetStats);

  /* Toolbar */
  document.getElementById('btnSound').addEventListener('click', toggleSound);
  document.getElementById('btnTheme').addEventListener('click', toggleTheme);
  document.getElementById('btnBoardTheme').addEventListener('click', cycleBoardTheme);

  /* Difficulty buttons */
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDifficulty = btn.dataset.diff;
      safeStorage.set('bg-arena-difficulty', currentDifficulty);
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  /* Match length buttons */
  document.querySelectorAll('.match-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      matchLength = parseInt(btn.dataset.match, 10);
      document.querySelectorAll('.match-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  /* Color choice */
  document.getElementById('chooseWhiteBtn').addEventListener('click', () => startGame('w'));
  document.getElementById('chooseBlackBtn').addEventListener('click', () => startGame('b'));

  /* Sync difficulty buttons to saved preference */
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === currentDifficulty);
  });

  /* Sync sound button label */
  updateSoundBtn();

  /* Load persistent data */
  loadGameState();
  loadArchive();
  renderStats();

  /* Initial draw */
  draw();
});
