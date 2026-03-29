/* ===========================================================
   STOCKFISH.JS — Stockfish 18 NNUE — WASM cu fallback ASM.js
   =========================================================== */

let currentEval = 0;
let stockfishReady = false;
let _aiMoveTimeout = null;

/**
 * Inițializare Stockfish 18 NNUE.
 * Încearcă WASM (rapid), fallback la ASM.js (funcționează peste tot).
 */
function initStockfish() {
  if (DOM.engineLoading) DOM.engineLoading.classList.remove('hidden');
  // Încearcă WASM mai întâi
  tryLoadWorker('assets/stockfish-18-lite-single.js', function onWasmFail() {
    console.warn('WASM nu a pornit — fallback la ASM.js');
    // Fallback la ASM.js (pur JavaScript, fără WASM)
    tryLoadWorker('assets/stockfish-18-asm.js', function onAsmFail() {
      console.error('Nici ASM.js nu funcționează — fără engine');
      stockfish = null;
      if (DOM.engineLoading) DOM.engineLoading.classList.add('hidden');
    });
  });
}

/**
 * Încearcă să încarce un Worker Stockfish.
 * Dacă nu pornește UCI în 5 secunde, apelează onFail.
 */
function tryLoadWorker(path, onFail) {
  let responded = false;
  let timeout = null;

  try {
    const worker = new Worker(path);

    timeout = setTimeout(function() {
      if (!responded) {
        console.warn('Timeout așteptând ' + path);
        worker.terminate();
        onFail();
      }
    }, WORKER_INIT_TIMEOUT_MS);

    worker.onmessage = function(event) {
      const message = event.data;
      if (typeof message !== 'string') return;

      // Route to analysis handler if running
      if (analysisRunning && _analysisHandler) {
        _analysisHandler(message);
        return;
      }

      if (message === 'uciok' && !responded) {
        responded = true;
        clearTimeout(timeout);
        stockfish = worker;
        console.log('Stockfish 18 NNUE active: ' + path);
        applyDifficulty(currentDifficulty);
        stockfish.postMessage('isready');

        // Persistent error handler for crash recovery
        worker.onerror = function() {
          recoverFromCrash();
        };
      }

      if (message === 'readyok') {
        stockfishReady = true;
        if (DOM.engineLoading) DOM.engineLoading.classList.add('hidden');
      }

      // Parse evaluation and PV
      if (message.includes(' score ')) {
        parseEvaluation(message);
        parsePV(message);
      }

      // Best move
      if (message.startsWith('bestmove')) {
        clearTimeout(_aiMoveTimeout);
        const bestMove = message.split(' ')[1];
        if (bestMove && bestMove !== '(none)') {
          makeAIMove(bestMove);
        }
        aiThinking = false;
        showThinking(false);
      }
    };

    worker.onerror = function(e) {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        console.warn('Worker error pe ' + path + ':', e.message);
        worker.terminate();
        onFail();
      }
    };

    worker.postMessage('uci');

  } catch (e) {
    clearTimeout(timeout);
    console.warn('Nu pot crea Worker ' + path + ':', e.message);
    onFail();
  }
}

/**
 * Recover from Stockfish crash — reset state and re-initialize.
 */
function recoverFromCrash() {
  console.warn('Stockfish crashed — recovering...');
  clearTimeout(_aiMoveTimeout);
  aiThinking = false;
  stockfishReady = false;
  showThinking(false);

  if (stockfish) {
    try { stockfish.terminate(); } catch(e) {}
    stockfish = null;
  }

  if (DOM.statusText) {
    DOM.statusText.textContent = 'Engine restarting...';
  }

  initStockfish();
}

/**
 * Aplică setările de dificultate la Stockfish.
 */
function applyDifficulty(level) {
  if (!stockfish) return;
  const diff = DIFFICULTY[level];
  if (!diff) return;

  if (diff.elo) {
    stockfish.postMessage('setoption name UCI_LimitStrength value true');
    stockfish.postMessage('setoption name UCI_Elo value ' + diff.elo);
  } else {
    stockfish.postMessage('setoption name UCI_LimitStrength value false');
  }

  stockfish.postMessage('setoption name Skill Level value 20');
}

/**
 * Parsare evaluare din output-ul Stockfish info lines
 */
function parseEvaluation(message) {
  const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
  if (!scoreMatch) return;

  const type = scoreMatch[1];
  const value = parseInt(scoreMatch[2]);

  if (type === 'cp') {
    currentEval = game.turn() === 'w' ? value : -value;
  } else if (type === 'mate') {
    currentEval = value > 0
      ? (game.turn() === 'w' ? 10000 : -10000)
      : (game.turn() === 'w' ? -10000 : 10000);
  }

  updateEvalBar(currentEval);
}

/**
 * Parse principal variation to extract best move for arrows.
 */
function parsePV(message) {
  const pvMatch = message.match(/ pv (\S+)/);
  if (!pvMatch) return;
  const moveStr = pvMatch[1];
  if (moveStr.length >= 4) {
    bestMovePV = { from: moveStr.substring(0, 2), to: moveStr.substring(2, 4) };
    if (hintsEnabled) drawArrow(bestMovePV.from, bestMovePV.to);
  }
}

/**
 * Draw an arrow on the SVG overlay.
 */
function drawArrow(fromSq, toSq) {
  if (!DOM.arrowOverlay || !board) return;
  clearArrows();

  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  const boardRect = boardEl.getBoundingClientRect();
  const sqSize = boardRect.width / 8;

  const orientation = board.orientation();
  const fromCoords = squareToCoords(fromSq, sqSize, orientation);
  const toCoords = squareToCoords(toSq, sqSize, orientation);

  DOM.arrowOverlay.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
  DOM.arrowOverlay.style.width = boardRect.width + 'px';
  DOM.arrowOverlay.style.height = boardRect.height + 'px';

  // Create arrow marker
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  const marker = document.createElementNS(ns, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const polygon = document.createElementNS(ns, 'polygon');
  polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
  polygon.setAttribute('fill', 'rgba(76, 175, 125, 0.85)');
  marker.appendChild(polygon);
  defs.appendChild(marker);
  DOM.arrowOverlay.appendChild(defs);

  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', fromCoords.x);
  line.setAttribute('y1', fromCoords.y);
  line.setAttribute('x2', toCoords.x);
  line.setAttribute('y2', toCoords.y);
  line.setAttribute('stroke', 'rgba(76, 175, 125, 0.7)');
  line.setAttribute('stroke-width', Math.max(sqSize * 0.15, 6));
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('marker-end', 'url(#arrowhead)');
  DOM.arrowOverlay.appendChild(line);
}

function squareToCoords(sq, sqSize, orientation) {
  const file = sq.charCodeAt(0) - 97; // a=0, h=7
  const rank = parseInt(sq[1]) - 1;    // 1=0, 8=7

  let x, y;
  if (orientation === 'white') {
    x = file * sqSize + sqSize / 2;
    y = (7 - rank) * sqSize + sqSize / 2;
  } else {
    x = (7 - file) * sqSize + sqSize / 2;
    y = rank * sqSize + sqSize / 2;
  }
  return { x, y };
}

function clearArrows() {
  if (DOM.arrowOverlay) DOM.arrowOverlay.innerHTML = '';
}

/**
 * Trimite poziția curentă la Stockfish și cere cea mai bună mutare.
 */
function requestAIMove() {
  if (game.game_over() || !gameActive) return;

  aiThinking = true;
  showThinking(true);

  if (stockfish) {
    const diff = currentDifficulty === 'custom' && DOM.eloSlider
      ? getCustomDifficulty(DOM.eloSlider.value)
      : DIFFICULTY[currentDifficulty];

    stockfish.postMessage('ucinewgame');
    stockfish.postMessage('position fen ' + game.fen());

    if (diff && diff.movetime) {
      stockfish.postMessage('go movetime ' + diff.movetime);
    } else if (diff && diff.depth) {
      stockfish.postMessage('go depth ' + diff.depth);
    } else {
      stockfish.postMessage('go movetime 3000');
    }

    // Safety timeout — recover if no bestmove within 30s
    clearTimeout(_aiMoveTimeout);
    _aiMoveTimeout = setTimeout(function() {
      if (aiThinking) recoverFromCrash();
    }, ENGINE_TIMEOUT_MS);
  } else {
    // Fallback fără engine: mutare random
    setTimeout(() => {
      const moves = game.moves();
      if (moves.length > 0) {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        game.move(randomMove);
        board.position(game.fen(), true);
        updateStatus();
        updateMoveHistory();
        updateCapturedPieces();
      }
      aiThinking = false;
      showThinking(false);
    }, 500);
  }
}

/**
 * Execută mutarea primită de la Stockfish pe tablă.
 */
function makeAIMove(moveStr) {
  const from = moveStr.substring(0, 2);
  const to = moveStr.substring(2, 4);
  const promotion = moveStr.length > 4 ? moveStr[4] : undefined;

  const move = game.move({
    from: from,
    to: to,
    promotion: promotion || 'q'
  });

  if (move) {
    board.position(game.fen(), true);
    removeHighlights();
    highlightSquare(from);
    highlightSquare(to);
    switchClock();
    updateStatus();
    updateMoveHistory();
    updateCapturedPieces();
    updateOpeningName();
    playMoveSound(move);
    saveGameState();

    // Execute premove if one is queued
    if (premove && gameActive && !game.game_over()) {
      setTimeout(executePremove, 100);
    }
  }
}
