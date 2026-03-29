# Board Game Arena

A collection of classic board games playable directly in the browser — no installation, no backend, no dependencies to install. Just open and play.

**Live demo:** ==> https://dutatiberiu.github.io/Boardgame-Arena/

---

## Games

### ♚ Chess
Play against **Stockfish 18 NNUE** — one of the strongest chess engines in the world, running entirely in your browser via WebAssembly.

### ⚂ Backgammon
Play against a **heuristic AI** with full backgammon rules support.

### ✕ Tic Tac Toe
Play 2-player or challenge the **Minimax AI** (Easy / Hard). The Hard AI is unbeatable — perfect play guaranteed.

### ○ Checkers
Full 8×8 checkers with mandatory captures, multi-jump chains, and king promotion. Drag & drop pieces, undo moves, and choose from four AI difficulty levels (Easy → Expert) backed by **Minimax with Alpha-Beta pruning**.

## Project Structure

```
Board Game Arena/
├── index.html              # Landing page
├── css/
│   └── styles.css          # Landing page styles
├── js/
│   └── app.js              # Landing page script
│
├── Chess/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js          # Global state & initialization
│   │   ├── board.js        # Board interaction layer
│   │   ├── game.js         # Game logic
│   │   ├── puzzles.js      # Puzzle mode
│   │   └── stockfish.js    # Engine integration (UCI protocol)
│   └── assets/
│       ├── pieces/         # PNG piece images
│       ├── openings.json   # Opening name database
│       ├── stockfish-18-lite-single.js    # WASM engine
│       ├── stockfish-18-lite-single.wasm
│       └── stockfish-18-asm.js            # ASM.js fallback
│
├── Backgammon/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js          # Global state & initialization
│       ├── board.js        # Canvas rendering
│       ├── game.js         # Game logic & rules
│       └── ai.js           # AI decision engine
│
├── Tic Tac Toe/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       └── app.js          # Game logic + Minimax AI
│
└── Checkers/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── ai.js           # Pure AI module (Minimax + Alpha-Beta)
        └── game.js         # Game logic, drag & drop, UI
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 (semantic) |
| Styling | CSS3 — variables, grid, flexbox, canvas, animations |
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

 free to use - powered by Duta Tiberiu
