// Generate decorative mini chess board on the landing page
const pieces = {
  '0,0': '♜', '0,1': '♞', '0,2': '♝', '0,3': '♛',
  '0,4': '♚', '0,5': '♝', '0,6': '♞', '0,7': '♜',
  '1,0': '♟', '1,1': '♟', '1,2': '♟', '1,3': '♟',
  '1,4': '♟', '1,5': '♟', '1,6': '♟', '1,7': '♟',
  '6,0': '♙', '6,1': '♙', '6,2': '♙', '6,3': '♙',
  '6,4': '♙', '6,5': '♙', '6,6': '♙', '6,7': '♙',
  '7,0': '♖', '7,1': '♘', '7,2': '♗', '7,3': '♕',
  '7,4': '♔', '7,5': '♗', '7,6': '♘', '7,7': '♖',
};

const miniBoard = document.getElementById('chessMini');
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const sq = document.createElement('div');
    sq.className = 'chess-sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
    const key = `${r},${c}`;
    if (pieces[key]) {
      sq.innerHTML = `<span class="piece">${pieces[key]}</span>`;
    }
    miniBoard.appendChild(sq);
  }
}

// Generate decorative mini checkers board on the landing page
const checkersMini = document.getElementById('checkersMini');
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const sq = document.createElement('div');
    const isDark = (r + c) % 2 === 1;
    sq.className = 'ck-sq ' + (isDark ? 'dark' : 'light');

    if (isDark) {
      if (r < 3) {
        const p = document.createElement('div');
        p.className = 'ck-piece dp';
        sq.appendChild(p);
      } else if (r > 4) {
        const p = document.createElement('div');
        p.className = 'ck-piece lp';
        sq.appendChild(p);
      }
    }

    checkersMini.appendChild(sq);
  }
}
