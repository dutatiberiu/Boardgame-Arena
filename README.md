# Caiet de Jocuri

A collection of classic board games playable directly in the browser.


**Live demo:** https://dutatiberiu.github.io/Boardgame-Arena/

---

## Games

### ♚ Chess
Play against **Stockfish 18 NNUE** — one of the strongest chess engines in the world, running entirely in the browser via WebAssembly.

### ⬡ Backgammon
Play against a **heuristic AI** with full backgammon rules: dice, bar, bearing off and the doubling cube.

### ✕ Tic Tac Toe
2-player or challenge the **Minimax AI** (Easy / Hard). On Hard, the AI plays perfectly — it cannot be beaten.

### ○ Checkers
Full 8×8 checkers with mandatory captures, multi-jump chains and king promotion. Drag & drop pieces, undo moves and choose from four AI difficulty levels (Easy → Expert) backed by **Minimax with Alpha-Beta pruning**.

---

## Project Structure

```
Caiet de Jocuri/
├── index.html                  # Landing page
├── css/styles.css              # Landing page styles
├── js/app.js                   # Landing page script
│
├── themes/
│   └── carnet.css              # Full design system (tokens, components, animations)
│
├── doodle library/
│   ├── doodles.css             # SVG decoration styles
│   ├── doodles.js              # Doodle animation script
│   ├── doodles-init.js         # Auto-initialization
│   └── doodles.svg             # SVG sprite
│
├── Chess/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js              # Global state & initialization
│   │   ├── board.js            # Board interaction (click + drag)
│   │   ├── game.js             # Game logic, UI, persistence
│   │   ├── puzzles.js          # Puzzle mode
│   │   └── stockfish.js        # UCI engine integration
│   └── assets/
│       ├── pieces/             # PNG piece images
│       ├── openings.json       # Opening name database
│       ├── stockfish-18-lite-single.js
│       ├── stockfish-18-lite-single.wasm
│       └── stockfish-18-asm.js # ASM.js fallback
│
├── Backgammon/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js              # Global state & initialization
│       ├── board.js            # Canvas 2D rendering
│       ├── game.js             # Game logic & rules
│       └── ai.js               # Heuristic AI engine
│
├── Tic Tac Toe/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       └── app.js              # Game logic + Minimax AI
│
└── Checkers/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── ai.js               # Pure AI module (Minimax + Alpha-Beta)
        └── game.js             # Game logic, drag & drop, UI
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 (semantic) |
| Styling | CSS3 — variables, grid, flexbox, animations; `carnet.css` design system |
| Fonts | Caveat + Patrick Hand (Google Fonts) |
| Logic | Vanilla JavaScript — no frameworks |
| Chess rendering | [chessboard.js](https://chessboardjs.com/) + [chess.js](https://github.com/jhlywa/chess.js) |
| Chess AI | [Stockfish 18 NNUE](https://stockfishchess.org/) (WebAssembly + ASM.js fallback) |
| Backgammon rendering | HTML5 Canvas API |
| Backgammon AI | Custom heuristic engine (pip count, anchors, escape, concentration) |
| Tic Tac Toe AI | Minimax (perfect play) |
| Checkers AI | Minimax with Alpha-Beta pruning, configurable depth |
| Persistence | localStorage — no backend required |

---

## License

Free to use — made by Duță Tiberiu
