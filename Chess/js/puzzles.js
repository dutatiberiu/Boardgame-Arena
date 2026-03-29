/* ===========================================================
   PUZZLES.JS — Daily puzzle + puzzle streak from Lichess API
   =========================================================== */

let puzzleStreakCount = 0;

/**
 * Fetch and load a puzzle from Lichess.
 */
function loadPuzzle() {
  DOM.statusText.textContent = 'Loading puzzle...';

  fetch('https://lichess.org/api/puzzle/daily')
    .then(r => r.json())
    .then(data => {
      setupPuzzle(data);
    })
    .catch(() => {
      DOM.statusText.textContent = 'Could not load puzzle. Check your connection.';
    });
}

/**
 * Load a random puzzle (not just daily) for streak mode.
 */
function loadNextPuzzle() {
  DOM.statusText.textContent = 'Loading next puzzle...';

  // Lichess random puzzle endpoint
  fetch('https://lichess.org/api/puzzle/next', { headers: { 'Accept': 'application/json' } })
    .then(r => {
      if (!r.ok) throw new Error('Not available');
      return r.json();
    })
    .then(data => {
      setupPuzzle(data);
    })
    .catch(() => {
      // Fallback: use the daily puzzle again if random fails
      loadPuzzle();
    });
}

/**
 * Set up the board for a puzzle.
 */
function setupPuzzle(data) {
  const pgn = data.game.pgn;
  const solution = data.puzzle.solution;

  if (!pgn || !solution || solution.length === 0) {
    DOM.statusText.textContent = 'Invalid puzzle data.';
    return;
  }

  // Load the game up to the puzzle position
  game.reset();
  game.load_pgn(pgn);

  // Determine puzzle player color: the side to move is the solver
  const puzzleColor = game.turn() === 'w' ? 'white' : 'black';
  playerColor = puzzleColor;

  // Store the solution moves
  puzzleMoves = solution;
  puzzleMoveIndex = 0;
  puzzleMode = true;
  gameActive = true;
  aiThinking = false;
  viewIndex = -1;
  stopClock();
  timeControl = null;

  createBoard({ orientation: puzzleColor, onDrop: onPuzzleDrop });

  updateMoveHistory();
  updateCapturedPieces();
  updateClockDisplay();
  updateEvalBar(0);

  const ratingText = data.puzzle.rating ? ` (Rating: ${data.puzzle.rating})` : '';
  const themes = data.puzzle.themes ? data.puzzle.themes.slice(0, 3).join(', ') : '';
  DOM.statusText.textContent = 'Find the best move!' + ratingText;
  DOM.statusBar.classList.remove('in-check', 'game-over');

  if (DOM.openingName) {
    DOM.openingName.textContent = themes ? themes : '';
  }
}

/**
 * Handle drops in puzzle mode — check if the move matches the solution.
 */
function onPuzzleDrop(source, target) {
  removeGhostPiece();
  removeHighlights();
  if (!puzzleMode || puzzleMoveIndex >= puzzleMoves.length) return 'snapback';

  const expectedUCI = puzzleMoves[puzzleMoveIndex];
  const from = expectedUCI.substring(0, 2);
  const to = expectedUCI.substring(2, 4);
  const promo = expectedUCI.length > 4 ? expectedUCI[4] : undefined;

  // Check if the player's move matches
  if (source !== from || target !== to) {
    DOM.statusText.textContent = 'Incorrect. Try again!';
    DOM.statusBar.classList.add('in-check');
    puzzleStreakCount = 0;
    resetPuzzleStreak();
    setTimeout(() => {
      DOM.statusBar.classList.remove('in-check');
      updatePuzzleStatus();
    }, 1500);
    return 'snapback';
  }

  // Execute the correct move
  const move = game.move({ from, to, promotion: promo || 'q' });
  if (!move) return 'snapback';

  board.position(game.fen(), true);
  highlightSquare(from);
  highlightSquare(to);
  playMoveSound(move);
  updateMoveHistory();
  updateCapturedPieces();
  puzzleMoveIndex++;

  // Check if puzzle is complete
  if (puzzleMoveIndex >= puzzleMoves.length) {
    puzzleComplete();
    return;
  }

  // Execute the opponent's response automatically
  DOM.statusText.textContent = 'Correct! Opponent responds...';
  setTimeout(() => {
    executePuzzleOpponentMove();
  }, 500);
}

/**
 * Play the opponent's response in the puzzle.
 */
function executePuzzleOpponentMove() {
  if (puzzleMoveIndex >= puzzleMoves.length) return;

  const uci = puzzleMoves[puzzleMoveIndex];
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  const promo = uci.length > 4 ? uci[4] : undefined;

  const move = game.move({ from, to, promotion: promo || 'q' });
  if (move) {
    board.position(game.fen(), true);
    removeHighlights();
    highlightSquare(from);
    highlightSquare(to);
    playMoveSound(move);
    updateMoveHistory();
    updateCapturedPieces();
  }

  puzzleMoveIndex++;

  if (puzzleMoveIndex >= puzzleMoves.length) {
    puzzleComplete();
  } else {
    updatePuzzleStatus();
  }
}

function updatePuzzleStatus() {
  const remaining = Math.ceil((puzzleMoves.length - puzzleMoveIndex) / 2);
  const streakText = puzzleStreakCount > 0 ? ` · Streak: ${puzzleStreakCount}` : '';
  DOM.statusText.textContent = remaining > 1
    ? `Find the best move! (${remaining} moves left)${streakText}`
    : `Find the final move!${streakText}`;
}

function puzzleComplete() {
  puzzleMode = false;
  gameActive = false;
  puzzleStreakCount++;
  updatePuzzleStats();

  DOM.statusText.textContent = `Puzzle solved! Streak: ${puzzleStreakCount}`;
  DOM.statusBar.classList.add('game-over');
  updateButtonStates();

  // Play success sound
  playTone(523, 0.12, 'sine', 0.06);
  setTimeout(() => playTone(659, 0.12, 'sine', 0.06), 120);
  setTimeout(() => playTone(784, 0.2, 'sine', 0.08), 240);

  // Show "Next Puzzle" option
  setTimeout(() => {
    if (DOM.statusText.textContent.startsWith('Puzzle solved!')) {
      DOM.statusText.innerHTML = `Puzzle solved! Streak: ${puzzleStreakCount} &nbsp;
        <button class="btn" onclick="loadNextPuzzle()" style="display:inline-flex;padding:.3rem .7rem;font-size:.78rem;">Next Puzzle &#8594;</button>`;
    }
  }, 800);
}
