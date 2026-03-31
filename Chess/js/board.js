/* ===========================================================
   BOARD.JS — Interaction: click-to-move + threshold drag
   Chessboard.js drag is DISABLED. We handle both ourselves:
   - Click: mousedown + mouseup without movement → onSquareClick
   - Drag: mousedown + mousemove > 6px threshold → ghost follows cursor
   =========================================================== */

/* -------------------------------------------------------
   PROMOTION STATE
   ------------------------------------------------------- */
let pendingPromotion = null;  // { source, target }

/* -------------------------------------------------------
   CLICK-TO-MOVE STATE
   ------------------------------------------------------- */
let selectedSquare = null;
let _justDragged = false;  // suppress onSquareClick after a drag drop

function selectSquare(square) {
  clearClickHighlights();
  selectedSquare = square;

  const el = document.querySelector(`.square-${square}`);
  if (el) el.classList.add('click-selected');

  game.moves({ square, verbose: true }).forEach(m => {
    const targetEl = document.querySelector(`.square-${m.to}`);
    if (targetEl) targetEl.classList.add('click-target');
  });
}

function clearClickHighlights() {
  document.querySelectorAll('.click-selected, .click-target').forEach(el => {
    el.classList.remove('click-selected', 'click-target');
  });
  selectedSquare = null;
}

function isOwnPiece(piece) {
  if (!piece) return false;
  return (playerColor === 'white' && piece.startsWith('w')) ||
         (playerColor === 'black' && piece.startsWith('b'));
}

function onSquareClick(square, piece) {
  // Called from endDrag (tap) or chessboard.js native click (desktop fallback)
  if (_justDragged) { _justDragged = false; return; }
  if (!gameActive || isViewingHistory()) return;
  if (aiThinking) return;

  const isPlayerTurn = (playerColor === 'white' && game.turn() === 'w') ||
                       (playerColor === 'black' && game.turn() === 'b');
  if (!isPlayerTurn) return;

  if (selectedSquare) {
    const moves = game.moves({ square: selectedSquare, verbose: true });
    const target = moves.find(m => m.to === square);

    if (target) {
      const from = selectedSquare;
      clearClickHighlights();
      executePlayerMove(from, square);
      return;
    }

    if (isOwnPiece(piece)) {
      selectSquare(square);
      return;
    }

    clearClickHighlights();
    return;
  }

  if (isPlayerTurn && isOwnPiece(piece)) {
    selectSquare(square);
  }
}

/* -------------------------------------------------------
   CUSTOM THRESHOLD DRAG
   ------------------------------------------------------- */
let _dragSource  = null;
let _dragStartX  = 0;
let _dragStartY  = 0;
let _dragActive  = false;
let _dragGhost   = null;
let _dragImgEl   = null;  // the img inside the source square (made transparent)
let _dragInitialized = false;

function getSquareFromElement(el) {
  let cur = el;
  while (cur) {
    if (cur.classList) {
      for (const cls of cur.classList) {
        const m = cls.match(/^square-([a-h][1-8])$/);
        if (m) return m[1];
      }
    }
    if (cur.id === 'board') break;
    cur = cur.parentElement;
  }
  return null;
}

function initCustomDrag() {
  if (_dragInitialized) return;
  _dragInitialized = true;

  const boardEl = document.getElementById('board');
  if (!boardEl) return;

  boardEl.addEventListener('pointerdown', function(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Clear any stale _justDragged before early returns so it never blocks
    // native click events on subsequent taps (empty squares / opponent pieces).
    _justDragged = false;

    if (!gameActive) return;
    if (isViewingHistory()) return;

    const square = getSquareFromElement(e.target);
    if (!square) return;

    const p = game.get(square);
    if (!p) return;

    const pieceIsPlayer = (playerColor === 'white' && p.color === 'w') ||
                          (playerColor === 'black' && p.color === 'b');
    const isPlayerTurn  = (playerColor === 'white' && game.turn() === 'w') ||
                          (playerColor === 'black' && game.turn() === 'b');

    if (!pieceIsPlayer) return;
    if (!isPlayerTurn && !aiThinking) return;

    _dragSource = square;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragActive = false;
    e.preventDefault(); // prevent iOS scroll/reflow on touch
  });

  document.addEventListener('pointermove', function(e) {
    if (!_dragSource) return;

    const dx = e.clientX - _dragStartX;
    const dy = e.clientY - _dragStartY;

    if (!_dragActive && Math.sqrt(dx * dx + dy * dy) > 6) {
      _dragActive = true;
      e.preventDefault();
      clearClickHighlights();

      const sqEl = document.querySelector(`.square-${_dragSource}`);
      _dragImgEl = sqEl ? sqEl.querySelector('img') : null;
      if (_dragImgEl) _dragImgEl.style.opacity = '0.25';

      if (_dragImgEl) {
        _dragGhost = document.createElement('img');
        _dragGhost.src = _dragImgEl.src;
        _dragGhost.className = 'drag-ghost-chess';
        const size = _dragImgEl.offsetWidth || 64;
        _dragGhost.style.width  = size + 'px';
        _dragGhost.style.height = size + 'px';
        _dragGhost.style.left   = e.clientX + 'px';
        _dragGhost.style.top    = e.clientY + 'px';
        document.body.appendChild(_dragGhost);
      }
    }

    if (_dragActive) {
      e.preventDefault();
      if (_dragGhost) {
        _dragGhost.style.left = e.clientX + 'px';
        _dragGhost.style.top  = e.clientY + 'px';
      }
    }
  });

  function endDrag(e) {
    if (!_dragSource) return;

    const source      = _dragSource;
    const wasDragging = _dragActive;

    if (_dragImgEl) { _dragImgEl.style.opacity = ''; _dragImgEl = null; }

    let targetSquare = null;
    if (_dragGhost) {
      _dragGhost.style.display = 'none';
      const elUnder = document.elementFromPoint(e.clientX, e.clientY);
      _dragGhost.style.display = '';
      document.body.removeChild(_dragGhost);
      _dragGhost = null;
      targetSquare = getSquareFromElement(elUnder);
    }

    _dragSource = null;
    _dragActive = false;

    if (wasDragging) {
      _justDragged = true;
      if (targetSquare && targetSquare !== source) {
        executeDragDrop(source, targetSquare);
      }
    } else {
      // Tap on own piece — dispatch click manually (e.preventDefault suppressed native click)
      const p = game.get(source);
      const pieceStr = p ? (p.color + p.type.toUpperCase()) : '';
      if (puzzleMode) {
        onPuzzleSquareClick(source, pieceStr);
      } else {
        onSquareClick(source, pieceStr);
      }
      _justDragged = true; // suppress any late-firing native click
    }
  }

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', function() {
    // Clean up without executing any move (e.g. interrupted by phone call)
    if (_dragImgEl) { _dragImgEl.style.opacity = ''; _dragImgEl = null; }
    if (_dragGhost) { document.body.removeChild(_dragGhost); _dragGhost = null; }
    _dragSource = null;
    _dragActive = false;
  });
}

function executeDragDrop(source, target) {
  removeHighlights();

  if (puzzleMode) {
    executePuzzleMove(source, target);
    return;
  }

  // Premove
  if (aiThinking) {
    clearPremove();
    premove = { from: source, to: target, promotion: 'q' };
    highlightPremove(source, target);
    board.position(game.fen());
    return;
  }

  if (isPromotionMove(source, target)) {
    pendingPromotion = { source, target };
    board.position(game.fen());
    showPromotionDialog(source, target);
    return;
  }

  executePlayerMove(source, target);
}

/* -------------------------------------------------------
   SHARED MOVE EXECUTION (click or drag)
   ------------------------------------------------------- */
function executePlayerMove(from, to) {
  if (isPromotionMove(from, to)) {
    pendingPromotion = { source: from, target: to };
    board.position(game.fen());
    showPromotionDialog(from, to);
    return;
  }

  const move = game.move({ from, to, promotion: 'q' });
  if (!move) {
    board.position(game.fen());
    return;
  }

  board.position(game.fen(), false);
  afterPlayerMove(move, from, to);
}

/* -------------------------------------------------------
   PROMOTION
   ------------------------------------------------------- */
function isPromotionMove(source, target) {
  const piece = game.get(source);
  if (!piece || piece.type !== 'p') return false;
  const rank = target.charAt(1);
  if (piece.color === 'w' && rank === '8') return true;
  if (piece.color === 'b' && rank === '1') return true;
  const moves = game.moves({ square: source, verbose: true });
  return moves.some(m => m.to === target && m.flags.includes('p'));
}

function showPromotionDialog(source, target) {
  const color = playerColor === 'white' ? 'w' : 'b';
  DOM.promotionOptions.innerHTML = '';
  ['q', 'r', 'b', 'n'].forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'promotion-piece';
    btn.setAttribute('aria-label', 'Promote to ' + p.toUpperCase());
    btn.innerHTML = `<img src="${PIECE_THEME_URL.replace('{piece}', color + p.toUpperCase())}" alt="${p}">`;
    btn.onclick = () => executePromotion(p);
    DOM.promotionOptions.appendChild(btn);
  });
  openDialog(DOM.promotionOverlay);
}

function executePromotion(piece) {
  closeDialog(DOM.promotionOverlay);
  if (!pendingPromotion) return;

  const move = game.move({
    from: pendingPromotion.source,
    to:   pendingPromotion.target,
    promotion: piece
  });

  if (move) {
    board.position(game.fen(), true);
    afterPlayerMove(move, pendingPromotion.source, pendingPromotion.target);
  }
  pendingPromotion = null;
}

/* -------------------------------------------------------
   AFTER PLAYER MOVE
   ------------------------------------------------------- */
function afterPlayerMove(move, source, target) {
  viewIndex = -1;
  clearArrows();
  bestMovePV = null;
  if (drawCooldown > 0) drawCooldown--;
  highlightSquare(source);
  highlightSquare(target);
  switchClock();
  updateStatus();
  updateMoveHistory();
  updateCapturedPieces();
  updateOpeningName();
  playMoveSound(move);
  saveGameState();

  if (!game.game_over()) {
    window.setTimeout(requestAIMove, AI_MOVE_DELAY);
  }
}

/* -------------------------------------------------------
   HIGHLIGHTS
   ------------------------------------------------------- */
function highlightSquare(square) {
  const el = document.querySelector(`.square-${square}`);
  if (el) el.classList.add('highlight-source');
}

function removeHighlights() {
  document.querySelectorAll(
    '.highlight-source, .highlight-legal, .click-selected, .click-target'
  ).forEach(el => {
    el.classList.remove('highlight-source', 'highlight-legal', 'click-selected', 'click-target');
  });
  selectedSquare = null;
}

/* -------------------------------------------------------
   HOVER HINTS (via chessboard.js callbacks)
   ------------------------------------------------------- */
function onMouseoverSquare(square) {
  if (!gameActive || aiThinking) return;
  if (selectedSquare) return;  // don't override active selection

  const moves = game.moves({ square, verbose: true });
  if (moves.length === 0) return;

  highlightSquare(square);
  moves.forEach(m => {
    const el = document.querySelector(`.square-${m.to}`);
    if (el) el.classList.add('highlight-legal');
  });
}

function onMouseoutSquare() {
  if (selectedSquare) return;  // don't clear active selection
  document.querySelectorAll('.highlight-source, .highlight-legal').forEach(el => {
    el.classList.remove('highlight-source', 'highlight-legal');
  });
}

/* -------------------------------------------------------
   PREMOVE
   ------------------------------------------------------- */
function highlightPremove(from, to) {
  const fromEl = document.querySelector(`.square-${from}`);
  const toEl   = document.querySelector(`.square-${to}`);
  if (fromEl) fromEl.classList.add('highlight-premove');
  if (toEl)   toEl.classList.add('highlight-premove');
}

function clearPremove() {
  premove = null;
  document.querySelectorAll('.highlight-premove').forEach(el => {
    el.classList.remove('highlight-premove');
  });
}

function executePremove() {
  if (!premove || !gameActive) { clearPremove(); return; }
  const { from, to, promotion } = premove;
  clearPremove();
  const move = game.move({ from, to, promotion });
  if (move) {
    board.position(game.fen(), true);
    afterPlayerMove(move, from, to);
  }
}
