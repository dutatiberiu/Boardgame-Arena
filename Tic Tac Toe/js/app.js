/* ================================================================
   GLOBAL STATE
   ================================================================ */
let boardState = Array(9).fill(null); // null | 'X' | 'O'
let currentPlayer = 'X';
let gameActive = true;
let gameMode = 'pvp';    // 'pvp' | 'ai'
let difficulty = 'hard'; // 'easy' | 'hard'
let starter = 'X';
let aiPlayer = 'O';
let aiThinking = false;

let scores = loadScores();

const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

/* ================================================================
   INIT
   ================================================================ */
function init() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.addEventListener('click', () => handleCellClick(i));
    boardEl.appendChild(cell);
  }

  boardState = Array(9).fill(null);
  currentPlayer = starter;
  gameActive = true;
  aiThinking = false;

  updateStatus();
  updateScoreboard();

  document.getElementById('statusBar').classList.remove('game-over');
  document.getElementById('thinking').classList.remove('active');

  if (gameMode === 'ai' && currentPlayer === aiPlayer) {
    lockBoard();
    setTimeout(() => aiMove(), 400);
  }
}

/* ================================================================
   CELL CLICK
   ================================================================ */
function handleCellClick(index) {
  if (!gameActive || boardState[index] !== null) return;
  if (aiThinking) return;
  if (gameMode === 'ai' && currentPlayer === aiPlayer) return;

  makeMove(index, currentPlayer);

  const result = checkResult();
  if (result) { endGame(result); return; }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  updateStatus();

  if (gameMode === 'ai' && currentPlayer === aiPlayer && gameActive) {
    lockBoard();
    aiThinking = true;
    document.getElementById('thinking').classList.add('active');
    setTimeout(() => {
      aiMove();
      aiThinking = false;
      document.getElementById('thinking').classList.remove('active');
    }, 500);
  }
}

/* ================================================================
   PLACE MARK — SVG animation
   ================================================================ */
function makeMove(index, player) {
  boardState[index] = player;
  const cell = document.querySelectorAll('.cell')[index];
  cell.classList.add('taken');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.classList.add('mark');

  if (player === 'X') {
    svg.classList.add('mark-x');
    const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l1.setAttribute('x1','20'); l1.setAttribute('y1','20');
    l1.setAttribute('x2','80'); l1.setAttribute('y2','80');
    const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l2.setAttribute('x1','80'); l2.setAttribute('y1','20');
    l2.setAttribute('x2','20'); l2.setAttribute('y2','80');
    svg.appendChild(l1); svg.appendChild(l2);
  } else {
    svg.classList.add('mark-o');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx','50'); circle.setAttribute('cy','50');
    circle.setAttribute('r','32');
    svg.appendChild(circle);
  }

  cell.appendChild(svg);
}

/* ================================================================
   CHECK RESULT
   ================================================================ */
function checkResult() {
  for (const combo of WIN_COMBOS) {
    const [a, b, c] = combo;
    if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
      return { winner: boardState[a], combo };
    }
  }
  if (boardState.every(c => c !== null)) return { winner: null, combo: null };
  return null;
}

/* ================================================================
   END GAME
   ================================================================ */
function endGame(result) {
  gameActive = false;
  lockBoard();

  document.getElementById('statusBar').classList.add('game-over');

  if (result.winner) {
    setStatus(`${result.winner} wins!`, result.winner);
    result.combo.forEach(idx => document.querySelectorAll('.cell')[idx].classList.add('win-cell'));
    drawWinLine(result.combo);
    scores[result.winner]++;
  } else {
    setStatus('Draw!', '—');
    scores.D++;
  }

  saveScores();
  updateScoreboard();
}

/* ================================================================
   WIN LINE
   ================================================================ */
function drawWinLine(combo) {
  const cells = document.querySelectorAll('.cell');
  const boardEl = document.getElementById('board');
  const boardRect = boardEl.getBoundingClientRect();

  const getCenter = (idx) => {
    const r = cells[idx].getBoundingClientRect();
    return { x: r.left + r.width / 2 - boardRect.left, y: r.top + r.height / 2 - boardRect.top };
  };

  const start = getCenter(combo[0]);
  const end   = getCenter(combo[2]);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle  = Math.atan2(dy, dx) * 180 / Math.PI;

  const line = document.createElement('div');
  line.className = 'win-line';
  line.style.cssText = `width:${length+20}px;height:5px;top:${start.y}px;left:${start.x-10}px;transform-origin:10px center;transform:rotate(${angle}deg);`;

  boardEl.style.position = 'relative';
  boardEl.appendChild(line);
}

/* ================================================================
   AI — MINIMAX (hard) / RANDOM (easy)
   ================================================================ */
function getBestMove() {
  if (difficulty === 'easy') {
    const empty = boardState.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
    return empty[Math.floor(Math.random() * empty.length)];
  }
  // Hard: full minimax — unbeatable
  let bestScore = -Infinity;
  let bestMove  = -1;
  for (let i = 0; i < 9; i++) {
    if (boardState[i] === null) {
      boardState[i] = aiPlayer;
      const score = minimax(boardState, 0, false);
      boardState[i] = null;
      if (score > bestScore) { bestScore = score; bestMove = i; }
    }
  }
  return bestMove;
}

function minimax(board, depth, isMaximizing) {
  const humanPlayer = aiPlayer === 'O' ? 'X' : 'O';

  for (const combo of WIN_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] === aiPlayer ? 10 - depth : depth - 10;
    }
  }
  if (board.every(c => c !== null)) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = aiPlayer;
        best = Math.max(best, minimax(board, depth + 1, false));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = humanPlayer;
        best = Math.min(best, minimax(board, depth + 1, true));
        board[i] = null;
      }
    }
    return best;
  }
}

function aiMove() {
  if (!gameActive) return;
  const move = getBestMove();
  if (move === -1) return;

  makeMove(move, aiPlayer);
  const result = checkResult();
  if (result) { endGame(result); return; }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  unlockBoard();
  updateStatus();
}

/* ================================================================
   UI HELPERS
   ================================================================ */
function setStatus(text, badge) {
  document.getElementById('statusText').textContent = text;
  document.getElementById('turnBadge').textContent  = badge;
}

function updateStatus() {
  setStatus(`${currentPlayer}'s turn`, currentPlayer);
}

function lockBoard()   { document.querySelectorAll('.cell').forEach(c => c.classList.add('locked')); }
function unlockBoard() { document.querySelectorAll('.cell').forEach(c => c.classList.remove('locked')); }

/* ================================================================
   SCOREBOARD + localStorage
   ================================================================ */
function loadScores() {
  try {
    const s = localStorage.getItem('bga_ttt_scores');
    return s ? JSON.parse(s) : { X: 0, O: 0, D: 0 };
  } catch { return { X: 0, O: 0, D: 0 }; }
}

function saveScores() {
  try { localStorage.setItem('bga_ttt_scores', JSON.stringify(scores)); } catch {}
}

function updateScoreboard() {
  document.getElementById('scoreX').textContent = scores.X;
  document.getElementById('scoreO').textContent = scores.O;
  document.getElementById('scoreD').textContent = scores.D;
}

function resetScores() {
  scores = { X: 0, O: 0, D: 0 };
  saveScores();
  updateScoreboard();
}

/* ================================================================
   MODE, DIFFICULTY & CONTROLS
   ================================================================ */
function setMode(mode) {
  gameMode = mode;
  aiPlayer = starter === 'X' ? 'O' : 'X';
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.mode-btn[data-mode="${mode}"]`).classList.add('active');

  // Show/hide difficulty row
  const diffRow = document.getElementById('difficultyRow');
  if (diffRow) diffRow.style.display = mode === 'ai' ? 'flex' : 'none';

  restartGame();
}

function setDifficulty(d) {
  difficulty = d;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.diff-btn[data-diff="${d}"]`).classList.add('active');
  restartGame();
}

function changeStarter(s) {
  starter = s;
  aiPlayer = starter === 'X' ? 'O' : 'X';
  restartGame();
}

function restartGame() { init(); }

/* ================================================================
   START
   ================================================================ */
init();
