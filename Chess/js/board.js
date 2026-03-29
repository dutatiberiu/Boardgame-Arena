/* ===========================================================
   BOARD.JS — Chessboard.js callbacks, highlight, promotion
   =========================================================== */

/* Pending promotion state */
let pendingPromotion = null;  // { source, target }

/* Click-to-move state */
let selectedSquare = null;

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
  if (!gameActive || isViewingHistory()) return;
  if (aiThinking) return;

  const isPlayerTurn = (playerColor === 'white' && game.turn() === 'w') ||
                       (playerColor === 'black' && game.turn() === 'b');

  if (selectedSquare) {
    const moves = game.moves({ square: selectedSquare, verbose: true });
    const target = moves.find(m => m.to === square);

    if (target) {
      const from = selectedSquare;
      clearClickHighlights();

      if (isPromotionMove(from, square)) {
        pendingPromotion = { source: from, target: square };
        board.position(game.fen());
        showPromotionDialog(from, square);
        return;
      }

      const move = game.move({ from, to: square, promotion: 'q' });
      if (move) {
        board.position(game.fen(), false);
        afterPlayerMove(move, from, square);
      }
      return;
    }

    // Clicked another own piece — switch selection
    if (isPlayerTurn && isOwnPiece(piece)) {
      selectSquare(square);
      return;
    }

    // Clicked elsewhere — deselect
    clearClickHighlights();
    return;
  }

  // Nothing selected — select own piece
  if (isPlayerTurn && isOwnPiece(piece)) {
    selectSquare(square);
  }
}

/**
 * onDragStart — Verifică dacă piesa poate fi mutată.
 */
function onDragStart(source, piece, position, orientation) {
  clearClickHighlights();
  if (!gameActive) return false;
  if (game.game_over()) return false;
  if (isViewingHistory()) return false;

  // Don't allow moving opponent's pieces
  if (playerColor === 'white' && piece.search(/^b/) !== -1) return false;
  if (playerColor === 'black' && piece.search(/^w/) !== -1) return false;

  // Allow dragging during AI thinking for premove
  if (aiThinking) {
    showGhostPiece(source, piece);
    return true;
  }

  // Don't allow moves if not player's turn (shouldn't happen normally)
  if (
    (playerColor === 'white' && game.turn() !== 'w') ||
    (playerColor === 'black' && game.turn() !== 'b')
  ) return false;

  showGhostPiece(source, piece);
  return true;
}

/**
 * Show a semi-transparent ghost of the piece on its source square while dragging.
 */
function showGhostPiece(square, piece) {
  removeGhostPiece();
  const sqEl = document.querySelector(`.square-${square}`);
  if (!sqEl) return;

  const img = document.createElement('img');
  img.src = PIECE_THEME_URL.replace('{piece}', piece);
  img.className = 'ghost-piece';
  img.setAttribute('aria-hidden', 'true');
  sqEl.appendChild(img);
}

function removeGhostPiece() {
  document.querySelectorAll('.ghost-piece').forEach(el => el.remove());
}

/**
 * onDrop — Când jucătorul eliberează piesa.
 */
function onDrop(source, target) {
  removeGhostPiece();
  removeHighlights();

  // If AI is thinking, register as premove
  if (aiThinking) {
    clearPremove();
    premove = { from: source, to: target, promotion: 'q' };
    highlightPremove(source, target);
    board.position(game.fen()); // snap back visually
    return;
  }

  // Check if it's a pawn promotion
  if (isPromotionMove(source, target)) {
    pendingPromotion = { source, target };
    showPromotionDialog(source, target);
    return;
  }

  const move = game.move({
    from: source,
    to: target,
    promotion: 'q'
  });

  if (move === null) return 'snapback';

  afterPlayerMove(move, source, target);
}

/**
 * Verifică dacă mutarea este o promoție de pion.
 */
function isPromotionMove(source, target) {
  const piece = game.get(source);
  if (!piece || piece.type !== 'p') return false;

  const targetRank = target.charAt(1);
  if (piece.color === 'w' && targetRank === '8') return true;
  if (piece.color === 'b' && targetRank === '1') return true;

  // Verifică dacă mutarea e legală
  const moves = game.moves({ square: source, verbose: true });
  return moves.some(m => m.to === target && m.flags.includes('p'));
}

/**
 * Afișează dialogul de promoție.
 */
function showPromotionDialog(source, target) {
  const color = playerColor === 'white' ? 'w' : 'b';
  const pieces = ['q', 'r', 'b', 'n'];

  DOM.promotionOptions.innerHTML = '';
  pieces.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'promotion-piece';
    btn.setAttribute('aria-label', 'Promote to ' + p.toUpperCase());
    const imgName = color + p.toUpperCase();
    btn.innerHTML = `<img src="${PIECE_THEME_URL.replace('{piece}', imgName)}" alt="${p}">`;
    btn.onclick = () => executePromotion(p);
    DOM.promotionOptions.appendChild(btn);
  });

  openDialog(DOM.promotionOverlay);
}

/**
 * Execută promoția cu piesa aleasă.
 */
function executePromotion(piece) {
  closeDialog(DOM.promotionOverlay);

  if (!pendingPromotion) return;

  const move = game.move({
    from: pendingPromotion.source,
    to: pendingPromotion.target,
    promotion: piece
  });

  if (move) {
    board.position(game.fen(), true);
    afterPlayerMove(move, pendingPromotion.source, pendingPromotion.target);
  }

  pendingPromotion = null;
}

/**
 * Acțiuni comune după mutarea jucătorului.
 */
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

/**
 * onSnapEnd — Sincronizează poziția vizuală cu starea logică.
 */
function onSnapEnd() {
  removeGhostPiece();
  board.position(game.fen());
}

/* ===========================================================
   HIGHLIGHT — Move highlighting on the board
   =========================================================== */
function highlightSquare(square) {
  const el = document.querySelector(`.square-${square}`);
  if (el) el.classList.add('highlight-source');
}

function removeHighlights() {
  document.querySelectorAll('.highlight-source, .highlight-legal, .click-selected, .click-target').forEach(el => {
    el.classList.remove('highlight-source', 'highlight-legal', 'click-selected', 'click-target');
  });
  selectedSquare = null;
}

/**
 * onMouseoverSquare — Arată mutările legale la hover.
 */
function onMouseoverSquare(square) {
  if (!gameActive || aiThinking) return;

  const moves = game.moves({ square: square, verbose: true });
  if (moves.length === 0) return;

  highlightSquare(square);

  moves.forEach(m => {
    const el = document.querySelector(`.square-${m.to}`);
    if (el) el.classList.add('highlight-legal');
  });
}

function onMouseoutSquare() {
  removeHighlights();
}

/* ===========================================================
   PREMOVE — highlight and execution
   =========================================================== */
function highlightPremove(from, to) {
  const fromEl = document.querySelector(`.square-${from}`);
  const toEl = document.querySelector(`.square-${to}`);
  if (fromEl) fromEl.classList.add('highlight-premove');
  if (toEl) toEl.classList.add('highlight-premove');
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

  // Try to execute the premove
  const move = game.move({ from, to, promotion });
  if (move) {
    board.position(game.fen(), true);
    afterPlayerMove(move, from, to);
  }
  // If premove is illegal after AI's move, silently discard
}
