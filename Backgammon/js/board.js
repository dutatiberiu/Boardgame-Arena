/* ===========================================================
   BOARD.JS — Canvas rendering, hit testing, mouse/touch interaction
   =========================================================== */

/* ---- Coordinate helpers ---- */

/**
 * Maps a board index (0-23) to its visual slot and side ('top'|'bottom').
 * Orientation depends on playerColor.
 */
function pointCoords(idx) {
  let si;
  if (playerColor === 'w') {
    const topSlots = [12,13,14,15,16,17, 18,19,20,21,22,23];
    const botSlots = [11,10, 9, 8, 7, 6,  5, 4, 3, 2, 1, 0];
    si = topSlots.indexOf(idx);
    if (si !== -1) return getSlotXY(si, 'top');
    si = botSlots.indexOf(idx);
    if (si !== -1) return getSlotXY(si, 'bottom');
  } else {
    const topSlots = [11,10, 9, 8, 7, 6,  5, 4, 3, 2, 1, 0];
    const botSlots = [12,13,14,15,16,17, 18,19,20,21,22,23];
    si = topSlots.indexOf(idx);
    if (si !== -1) return getSlotXY(si, 'top');
    si = botSlots.indexOf(idx);
    if (si !== -1) return getSlotXY(si, 'bottom');
  }
  return { x: 0, side: 'top' };
}

function getSlotXY(slot, side) {
  let x;
  if (slot < 6) {
    x = FIELD_X + slot * PT_W + PT_W / 2;
  } else {
    x = FIELD_X + HALF_W + BAR_W + (slot - 6) * PT_W + PT_W / 2;
  }
  return { x, side };
}

/** Returns the visual label for a given board index (1-24 numbering) */
function pointLabel(idx) {
  return (idx + 1).toString();
}

/* ---- Main draw function ---- */
function draw() {
  const CVS = DOM.boardCanvas;
  const CTX = CVS.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  const rect = CVS.getBoundingClientRect();

  CVS.width  = rect.width  * dpr;
  CVS.height = rect.height * dpr;
  CTX.setTransform(dpr * rect.width / W, 0, 0, dpr * rect.height / H, 0, 0);

  /* Background */
  CTX.fillStyle = COL.boardBg;
  CTX.fillRect(0, 0, W, H);

  /* Playing field */
  CTX.fillStyle = COL.fieldBg;
  CTX.fillRect(FIELD_X, 0, FIELD_W, H);

  /* Central bar */
  const barX = FIELD_X + HALF_W;
  CTX.fillStyle = COL.bar;
  CTX.fillRect(barX, 0, BAR_W, H);

  /* Bearing-off zones */
  CTX.fillStyle = COL.bearOff;
  CTX.fillRect(0, 0, BEAR_W, H);
  CTX.fillRect(W - BEAR_W, 0, BEAR_W, H);

  /* Triangles */
  drawPoints(CTX);

  /* Highlights */
  drawHighlights(CTX);

  /* Checkers on points */
  for (let i = 0; i < 24; i++) {
    if (board[i] && board[i].n > 0) drawCheckersOnPoint(CTX, i);
  }

  /* Bar checkers */
  drawBarCheckers(CTX);

  /* Borne-off checkers */
  drawOffCheckers(CTX);

  /* Point numbers */
  drawPointNumbers(CTX);

  /* Doubling cube */
  drawDoublingCube(CTX);

  /* Drag ghost */
  if (dragState && dragState.color) {
    drawChecker(CTX, dragState.curX, dragState.curY, dragState.color, false, true);
  }

  /* Outer border */
  CTX.strokeStyle = COL.border;
  CTX.lineWidth = 2;
  CTX.strokeRect(1, 1, W - 2, H - 2);
}

/* ---- Draw point triangles ---- */
function drawPoints(CTX) {
  for (let slot = 0; slot < 12; slot++) {
    const isLight = slot % 2 === 0;
    let x;
    if (slot < 6) x = FIELD_X + slot * PT_W;
    else x = FIELD_X + HALF_W + BAR_W + (slot - 6) * PT_W;

    /* Top triangle (pointing down) */
    CTX.fillStyle = isLight ? COL.ptLight : COL.ptDark;
    CTX.beginPath();
    CTX.moveTo(x, 0);
    CTX.lineTo(x + PT_W, 0);
    CTX.lineTo(x + PT_W / 2, PT_H);
    CTX.closePath();
    CTX.fill();

    /* Bottom triangle (pointing up) — alternated colors */
    CTX.fillStyle = isLight ? COL.ptDark : COL.ptLight;
    CTX.beginPath();
    CTX.moveTo(x, H);
    CTX.lineTo(x + PT_W, H);
    CTX.lineTo(x + PT_W / 2, H - PT_H);
    CTX.closePath();
    CTX.fill();
  }
}

/* ---- Draw point numbers (1-24 along edges) ---- */
function drawPointNumbers(CTX) {
  CTX.fillStyle = COL.numColor;
  CTX.font = `bold ${Math.round(PT_W * 0.38)}px sans-serif`;
  CTX.textAlign = 'center';
  CTX.textBaseline = 'middle';

  for (let slot = 0; slot < 12; slot++) {
    let x;
    if (slot < 6) x = FIELD_X + slot * PT_W + PT_W / 2;
    else x = FIELD_X + HALF_W + BAR_W + (slot - 6) * PT_W + PT_W / 2;

    /* Resolve which board index lives in this visual slot */
    let topIdx, botIdx;
    if (playerColor === 'w') {
      const topSlots = [12,13,14,15,16,17,18,19,20,21,22,23];
      const botSlots = [11,10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
      topIdx = topSlots[slot];
      botIdx = botSlots[slot];
    } else {
      const topSlots = [11,10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
      const botSlots = [12,13,14,15,16,17,18,19,20,21,22,23];
      topIdx = topSlots[slot];
      botIdx = botSlots[slot];
    }

    const pad = 7;
    CTX.fillText((topIdx + 1).toString(), x, pad);
    CTX.fillText((botIdx + 1).toString(), x, H - pad);
  }
}

/* ---- Draw checkers on a single point ---- */
function drawCheckersOnPoint(CTX, idx) {
  const p = board[idx];
  const { x, side } = pointCoords(idx);

  const maxVisible = 5;
  const displayCount = Math.min(p.n, maxVisible);

  for (let i = 0; i < displayCount; i++) {
    let y;
    if (side === 'top') {
      y = CK_R + 4 + i * CK_D;
    } else {
      y = H - CK_R - 4 - i * CK_D;
    }
    const isTopChecker = (i === displayCount - 1);
    const isSelected   = (idx === selectedPt && isTopChecker && historyViewIndex === -1);
    drawChecker(CTX, x, y, p.c, isSelected, false);
  }

  /* If more than 5, show a count badge on the top checker */
  if (p.n > maxVisible) {
    const topI = maxVisible - 1;
    const y = side === 'top'
      ? CK_R + 4 + topI * CK_D
      : H - CK_R - 4 - topI * CK_D;

    CTX.fillStyle = 'rgba(0,0,0,0.65)';
    CTX.beginPath();
    CTX.arc(x, y, CK_R * 0.55, 0, Math.PI * 2);
    CTX.fill();

    CTX.fillStyle = '#fff';
    CTX.font = `bold ${Math.round(CK_R * 0.75)}px sans-serif`;
    CTX.textAlign = 'center';
    CTX.textBaseline = 'middle';
    CTX.fillText(p.n.toString(), x, y);
  }
}

/* ---- Draw a single checker ---- */
function drawChecker(CTX, x, y, color, isSelected, isDragging) {
  const r = isDragging ? CK_R * 1.1 : CK_R;

  /* Shadow */
  CTX.beginPath();
  CTX.arc(x, y + 2, r, 0, Math.PI * 2);
  CTX.fillStyle = 'rgba(0,0,0,.3)';
  CTX.fill();

  /* Body with radial gradient */
  CTX.beginPath();
  CTX.arc(x, y, r, 0, Math.PI * 2);
  const grad = CTX.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  if (color === 'w') {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, COL.checkerWs);
  } else {
    grad.addColorStop(0, '#4a3f55');
    grad.addColorStop(1, COL.checkerBs);
  }
  CTX.fillStyle = grad;
  CTX.fill();

  /* Outer ring */
  CTX.strokeStyle = color === 'w' ? '#c8b89a' : '#3d3350';
  CTX.lineWidth = 1.5;
  CTX.stroke();

  /* Inner decorative ring */
  CTX.beginPath();
  CTX.arc(x, y, r * 0.6, 0, Math.PI * 2);
  CTX.strokeStyle = color === 'w' ? 'rgba(180,160,130,.4)' : 'rgba(100,80,120,.4)';
  CTX.lineWidth = 1;
  CTX.stroke();

  /* Selection glow */
  if (isSelected) {
    CTX.beginPath();
    CTX.arc(x, y, r + 3, 0, Math.PI * 2);
    CTX.strokeStyle = COL.selected;
    CTX.lineWidth = 3;
    CTX.stroke();
  }

  /* Dragging glow */
  if (isDragging) {
    CTX.beginPath();
    CTX.arc(x, y, r + 4, 0, Math.PI * 2);
    CTX.strokeStyle = COL.highlight;
    CTX.lineWidth = 2.5;
    CTX.stroke();
  }
}

/* ---- Draw checkers on the bar ---- */
function drawBarCheckers(CTX) {
  const barCX = FIELD_X + HALF_W + BAR_W / 2;

  for (let i = 0; i < bar.w; i++) {
    const y = playerColor === 'w'
      ? H / 2 + 20 + i * CK_D
      : H / 2 - 20 - i * CK_D;
    const isSel = selectedPt === 24 && playerColor === 'w' && i === bar.w - 1 && historyViewIndex === -1;
    drawChecker(CTX, barCX, y, 'w', isSel, false);
  }
  for (let i = 0; i < bar.b; i++) {
    const y = playerColor === 'w'
      ? H / 2 - 20 - i * CK_D
      : H / 2 + 20 + i * CK_D;
    const isSel = selectedPt === 24 && playerColor === 'b' && i === bar.b - 1 && historyViewIndex === -1;
    drawChecker(CTX, barCX, y, 'b', isSel, false);
  }
}

/* ---- Draw borne-off checkers as stacked horizontal bars ---- */
function drawOffCheckers(CTX) {
  const wX = playerColor === 'w' ? W - BEAR_W / 2 : BEAR_W / 2;
  const bX = playerColor === 'w' ? BEAR_W / 2       : W - BEAR_W / 2;
  const barH = 9;
  const gap  = 3;
  const topY = H - 10;

  for (let i = 0; i < off.w; i++) {
    const y = topY - i * (barH + gap);
    CTX.fillStyle = COL.checkerW;
    CTX.beginPath();
    roundRect(CTX, wX - BEAR_W * 0.38, y - barH / 2, BEAR_W * 0.76, barH, 3);
    CTX.fill();
    CTX.strokeStyle = '#c8b89a';
    CTX.lineWidth = 0.8;
    CTX.stroke();
  }
  for (let i = 0; i < off.b; i++) {
    const y = topY - i * (barH + gap);
    CTX.fillStyle = COL.checkerB;
    CTX.beginPath();
    roundRect(CTX, bX - BEAR_W * 0.38, y - barH / 2, BEAR_W * 0.76, barH, 3);
    CTX.fill();
    CTX.strokeStyle = '#3d3350';
    CTX.lineWidth = 0.8;
    CTX.stroke();
  }

  /* Labels at top */
  CTX.fillStyle = 'rgba(255,255,255,0.25)';
  CTX.font = `bold 9px sans-serif`;
  CTX.textAlign = 'center';
  CTX.textBaseline = 'middle';
  if (off.w > 0) CTX.fillText(off.w.toString(), wX, 12);
  if (off.b > 0) CTX.fillText(off.b.toString(), bX, 12);
}

/* Helper: path a rounded rectangle */
function roundRect(CTX, x, y, w, h, r) {
  CTX.moveTo(x + r, y);
  CTX.lineTo(x + w - r, y);
  CTX.quadraticCurveTo(x + w, y, x + w, y + r);
  CTX.lineTo(x + w, y + h - r);
  CTX.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  CTX.lineTo(x + r, y + h);
  CTX.quadraticCurveTo(x, y + h, x, y + h - r);
  CTX.lineTo(x, y + r);
  CTX.quadraticCurveTo(x, y, x + r, y);
  CTX.closePath();
}

/* ---- Draw valid destination highlights ---- */
function drawHighlights(CTX) {
  validDests.forEach(dest => {
    if (dest === 'off') {
      const px = (turn === 'w')
        ? (playerColor === 'w' ? W - BEAR_W : 0)
        : (playerColor === 'b' ? W - BEAR_W : 0);

      /* Bright fill */
      CTX.fillStyle = 'rgba(212,162,78,0.32)';
      CTX.fillRect(px, 0, BEAR_W, H);

      /* Gold border */
      CTX.strokeStyle = 'rgba(212,162,78,0.95)';
      CTX.lineWidth = 2.5;
      CTX.strokeRect(px + 1.5, 1.5, BEAR_W - 3, H - 3);

    } else {
      const { x, side } = pointCoords(dest);
      const ptX = x - PT_W / 2;

      /* Bright triangle fill */
      CTX.fillStyle = 'rgba(212,162,78,0.52)';
      CTX.beginPath();
      if (side === 'top') {
        CTX.moveTo(ptX, 0);
        CTX.lineTo(ptX + PT_W, 0);
        CTX.lineTo(x, PT_H);
      } else {
        CTX.moveTo(ptX, H);
        CTX.lineTo(ptX + PT_W, H);
        CTX.lineTo(x, H - PT_H);
      }
      CTX.closePath();
      CTX.fill();

      /* Gold outline on triangle edges */
      CTX.strokeStyle = 'rgba(230,185,101,0.9)';
      CTX.lineWidth = 2;
      CTX.stroke();

      /* Landing spot — bullseye ring where the piece will stack */
      const stackCount = (board[dest] && board[dest].n) ? Math.min(board[dest].n, 4) : 0;
      const dotY = side === 'top'
        ? CK_R + 4 + stackCount * CK_D
        : H - CK_R - 4 - stackCount * CK_D;

      /* Outer glow ring */
      CTX.beginPath();
      CTX.arc(x, dotY, CK_R + 7, 0, Math.PI * 2);
      CTX.strokeStyle = 'rgba(212,162,78,0.80)';
      CTX.lineWidth = 2.5;
      CTX.stroke();

      /* Inner ring */
      CTX.beginPath();
      CTX.arc(x, dotY, CK_R + 2.5, 0, Math.PI * 2);
      CTX.strokeStyle = 'rgba(255,215,110,0.65)';
      CTX.lineWidth = 1.5;
      CTX.stroke();

      /* Centre dot */
      CTX.beginPath();
      CTX.arc(x, dotY, CK_R * 0.32, 0, Math.PI * 2);
      CTX.fillStyle = 'rgba(212,162,78,0.80)';
      CTX.fill();
    }
  });
}

/* ---- Draw doubling cube on the bar ---- */
function drawDoublingCube(CTX) {
  if (!gameActive || doublingCube === 0) return;

  const barCX = FIELD_X + HALF_W + BAR_W / 2;
  const cubeY = H / 2;
  const cubeSize = BAR_W - 6;

  /* Position based on owner */
  let cubeDrawY = cubeY;
  if (cubeOwner === playerColor) {
    cubeDrawY = playerColor === 'w' ? H - cubeSize - 4 : cubeSize + 4;
  } else if (cubeOwner !== null) {
    cubeDrawY = playerColor === 'w' ? cubeSize + 4 : H - cubeSize - 4;
  }

  const x = barCX - cubeSize / 2;
  const y = cubeDrawY - cubeSize / 2;

  /* Background */
  CTX.fillStyle = '#d4a24e';
  CTX.beginPath();
  roundRect(CTX, x, y, cubeSize, cubeSize, 3);
  CTX.fill();

  /* Value text */
  CTX.fillStyle = '#0a0a0c';
  CTX.font = `bold ${Math.round(cubeSize * 0.42)}px sans-serif`;
  CTX.textAlign = 'center';
  CTX.textBaseline = 'middle';
  CTX.fillText(doublingCube.toString(), barCX, cubeDrawY);
}

/* ---- Hit testing ---- */
function getClickTarget(mx, my) {
  const CVS  = DOM.boardCanvas;
  const rect = CVS.getBoundingClientRect();
  const x = (mx - rect.left) / rect.width  * W;
  const y = (my - rect.top)  / rect.height * H;

  /* Bearing-off zone — only when it's a valid destination */
  if (validDests.includes('off') && turn === playerColor) {
    const bearX = playerColor === 'w' ? W - BEAR_W : 0;
    if ((playerColor === 'w' && x >= W - BEAR_W) ||
        (playerColor === 'b' && x <= BEAR_W)) {
      return 'off';
    }
  }

  /* Bar — player's own pieces on bar */
  const barCX = FIELD_X + HALF_W + BAR_W / 2;
  if (bar[turn] > 0 && turn === playerColor) {
    if (Math.abs(x - barCX) < BAR_W) return 24;
  }

  /* Points */
  for (let i = 0; i < 24; i++) {
    const { x: px, side } = pointCoords(i);
    if (Math.abs(x - px) < PT_W / 2) {
      if (side === 'top'    && y < PT_H + CK_R) return i;
      if (side === 'bottom' && y > H - PT_H - CK_R) return i;
    }
  }

  return -1;
}

/** Convert screen coords to logical board coords */
function screenToBoard(mx, my) {
  const CVS  = DOM.boardCanvas;
  const rect = CVS.getBoundingClientRect();
  return {
    x: (mx - rect.left) / rect.width  * W,
    y: (my - rect.top)  / rect.height * H,
  };
}

/** Returns true if screen point (mx,my) is over a draggable checker */
function isOverPlayerChecker(mx, my) {
  if (!gameActive || aiThinking || turn !== playerColor || remaining.length === 0) return false;
  const { x, y } = screenToBoard(mx, my);
  const barCX = FIELD_X + HALF_W + BAR_W / 2;

  if (bar[playerColor] > 0) {
    if (Math.abs(x - barCX) < BAR_W) return true;
    return false;
  }

  for (let i = 0; i < 24; i++) {
    if (board[i].c === playerColor && board[i].n > 0) {
      const { x: px } = pointCoords(i);
      if (Math.abs(x - px) < PT_W / 2) return true;
    }
  }
  return false;
}

/* ---- Click handler ---- */
document.addEventListener('DOMContentLoaded', function() {
  DOM.boardCanvas.addEventListener('click', function(e) {
    if (dragState && dragState.wasDrag) return; // suppress click after drag
    if (!gameActive || aiThinking || turn !== playerColor) return;
    if (remaining.length === 0) return;
    if (historyViewIndex !== -1) return;

    const target = getClickTarget(e.clientX, e.clientY);

    if (target === -1) {
      /* Deselect */
      selectedPt  = -1;
      validDests  = [];
      draw();
      return;
    }

    /* If a piece is already selected — try to move to target */
    if (selectedPt >= 0) {
      const moveToMake = validDests.includes(target)
        ? getValidMoves(playerColor, remaining).find(m => m.from === selectedPt && m.to === target)
        : null;

      if (moveToMake) {
        doPlayerMove(moveToMake);
        return;
      }
    }

    /* Select a piece */
    const moves  = getValidMoves(playerColor, remaining);
    const isBar  = target === 24 && bar[playerColor] > 0;
    const isPt   = target >= 0 && target <= 23 && board[target].c === playerColor && board[target].n > 0;

    if (isBar || isPt) {
      selectedPt = target;
      validDests = moves.filter(m => m.from === target).map(m => m.to);
      if (validDests.length === 0) selectedPt = -1;
    } else {
      selectedPt = -1;
      validDests = [];
    }

    draw();
  });

  /* ---- Drag-and-drop ---- */
  DOM.boardCanvas.addEventListener('mousedown', onDragStart);
  DOM.boardCanvas.addEventListener('mousemove', onDragMove);
  DOM.boardCanvas.addEventListener('mouseup',   onDragEnd);
  DOM.boardCanvas.addEventListener('mouseleave', onDragEnd);

  DOM.boardCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  DOM.boardCanvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
  DOM.boardCanvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
});

function onDragStart(e) {
  if (!gameActive || aiThinking || turn !== playerColor || remaining.length === 0) return;
  if (historyViewIndex !== -1) return;

  const target = getClickTarget(e.clientX, e.clientY);
  const moves  = getValidMoves(playerColor, remaining);
  const isBar  = target === 24 && bar[playerColor] > 0;
  const isPt   = target >= 0 && target <= 23 && board[target].c === playerColor && board[target].n > 0;

  if (!isBar && !isPt) return;

  const dests = moves.filter(m => m.from === target).map(m => m.to);
  if (dests.length === 0) return;

  e.preventDefault();
  dragState = {
    pointIndex: target,
    color: board[target === 24 ? -1 : target]?.c || playerColor,
    curX: 0, curY: 0,
    wasDrag: false,
  };

  /* Get initial position */
  const { x, y } = screenToBoard(e.clientX, e.clientY);
  dragState.curX = x;
  dragState.curY = y;

  selectedPt = target;
  validDests = dests;
  DOM.boardCanvas.classList.add('grabbing');
  draw();
}

function onDragMove(e) {
  if (!dragState) {
    /* Update cursor */
    DOM.boardCanvas.classList.toggle('grabbable', isOverPlayerChecker(e.clientX, e.clientY));
    return;
  }
  e.preventDefault();
  dragState.wasDrag = true;
  const { x, y } = screenToBoard(e.clientX, e.clientY);
  dragState.curX = x;
  dragState.curY = y;
  draw();
}

function onDragEnd(e) {
  if (!dragState) return;

  DOM.boardCanvas.classList.remove('grabbing');

  if (dragState.wasDrag) {
    /* Try to drop on target */
    const target = getClickTarget(e.clientX, e.clientY);
    if (validDests.includes(target)) {
      const mv = getValidMoves(playerColor, remaining).find(m => m.from === dragState.pointIndex && m.to === target);
      if (mv) {
        dragState = null;
        selectedPt = -1;
        validDests = [];
        doPlayerMove(mv);
        return;
      }
    }
  }

  dragState  = null;
  /* Keep selection if it was just a press without drag */
  draw();
}

function onTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  onDragStart({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} });
}
function onTouchMove(e) {
  e.preventDefault();
  const t = e.touches[0];
  onDragMove({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} });
}
function onTouchEnd(e) {
  e.preventDefault();
  const t = e.changedTouches[0];
  onDragEnd({ clientX: t.clientX, clientY: t.clientY });
}

/* ---- Responsive redraw ---- */
window.addEventListener('resize', debounce(function() {
  if (DOM.boardCanvas) draw();
}, 120));
