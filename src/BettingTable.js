import { LAYOUT, CANVAS, COLORS } from './config.js';
import { colorOf } from './utils/rouletteData.js';
import { formatCompact, formatPercent } from './utils/format.js';
import { drawPanel } from './utils/math.js';
import BettingSystem from './BettingSystem.js';

const T = LAYOUT.table;

/**
 * The roulette felt: renders the European layout and converts a pointer
 * position into a bet. Hit priority: corner > edge > cell centre, with a
 * tolerance of `T.tolerance` px around grid lines and intersections.
 *
 * Grid convention (as on the reference layout): 12 columns × 3 rows,
 * top row 3,6,…,36 and bottom row 1,4,…,34; column c / row r holds
 * n = 3c + (3 − r).
 */
export default class BettingTable {
  constructor(p, canvasEl) {
    this.p = p;
    this.canvasEl = canvasEl;
    this.enabled = true;
    this.hover = null;
    this.selection = null;
    this.mouse = { x: -1, y: -1, inside: false };
    this.lastWinning = null;
    this.onSelectionChange = null; // (bet|null) => void

    const gx0 = T.x0 + T.zeroW;
    const gy0 = T.y0;
    this.g = {
      gx0,
      gy0,
      gx1: gx0 + T.cellW * 12,
      gy1: gy0 + T.cellH * 3
    };
    this.g.colX1 = this.g.gx1 + T.colBetW;
    this.g.dozenY1 = this.g.gy1 + T.dozenH;
    this.g.outY1 = this.g.dozenY1 + T.outsideH;
    this._buildOutsideBets();

    // Listeners are registered exactly once and removed in destroy().
    this._onMove = (e) => this._handleMove(e);
    this._onLeave = () => this._handleLeave();
    this._onDown = (e) => this._handleDown(e);
    canvasEl.addEventListener('pointermove', this._onMove);
    canvasEl.addEventListener('pointerleave', this._onLeave);
    canvasEl.addEventListener('pointerdown', this._onDown);
  }

  destroy() {
    this.canvasEl.removeEventListener('pointermove', this._onMove);
    this.canvasEl.removeEventListener('pointerleave', this._onLeave);
    this.canvasEl.removeEventListener('pointerdown', this._onDown);
    this.onSelectionChange = null;
  }

  reset() {
    this.selection = null;
    this.hover = null;
    this.lastWinning = null;
    this.enabled = true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.hover = null;
  }

  clearSelection() {
    this.selection = null;
  }

  // ------------------------------------------------------------ geometry

  _buildOutsideBets() {
    const { gx0, gy1, dozenY1 } = this.g;
    this.outside = [];
    for (let i = 0; i < 3; i++) {
      const bet = BettingSystem.dozen(i);
      const rect = { x: gx0 + i * 4 * T.cellW, y: gy1, w: 4 * T.cellW, h: T.dozenH };
      this.outside.push(this._withZone(bet, { kind: 'cell', ...rect }));
    }
    const kinds = ['low', 'even', 'red', 'black', 'odd', 'high'];
    kinds.forEach((k, i) => {
      const bet = BettingSystem.evenMoney(k);
      const rect = { x: gx0 + i * 2 * T.cellW, y: dozenY1, w: 2 * T.cellW, h: T.outsideH };
      this.outside.push(this._withZone(bet, { kind: 'cell', ...rect }));
    });
    for (let r = 0; r < 3; r++) {
      const bet = BettingSystem.column(2 - r); // top row = 3rd column (3..36)
      const rect = { x: this.g.gx1, y: this.g.gy0 + r * T.cellH, w: T.colBetW, h: T.cellH };
      this.outside.push(this._withZone(bet, { kind: 'cell', ...rect }));
    }
  }

  _withZone(bet, zone) {
    bet.zone = zone;
    if (zone.kind === 'cell') bet.anchor = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
    else if (zone.kind === 'edge') bet.anchor = { x: (zone.x1 + zone.x2) / 2, y: (zone.y1 + zone.y2) / 2 };
    else bet.anchor = { x: zone.x, y: zone.y };
    return bet;
  }

  numberAt(c, r) {
    return 3 * c + (3 - r);
  }

  /** Screen rectangle of a number's cell (0 = the zero cell). */
  rectOf(n) {
    if (n === 0) return { x: T.x0, y: this.g.gy0, w: T.zeroW, h: T.cellH * 3 };
    const c = Math.floor((n - 1) / 3);
    const r = 2 - ((n - 1) % 3);
    return { x: this.g.gx0 + c * T.cellW, y: this.g.gy0 + r * T.cellH, w: T.cellW, h: T.cellH };
  }

  /** Map a logical canvas point to a bet (or null). */
  hitTest(mx, my) {
    const { gx0, gy0, gx1, gy1 } = this.g;
    const tol = T.tolerance;
    const cw = T.cellW;
    const ch = T.cellH;

    if (mx >= gx0 - tol && mx <= gx1 + tol && my >= gy0 - tol && my <= gy1 + tol) {
      const vi = Math.round((mx - gx0) / cw);   // nearest vertical line 0..12
      const hi = Math.round((my - gy0) / ch);   // nearest horizontal line 0..3
      const lx = gx0 + vi * cw;
      const ly = gy0 + hi * ch;
      const nearV = Math.abs(mx - lx) <= tol && vi >= 0 && vi <= 11; // line 12 borders "2 to 1"
      const nearH = Math.abs(my - ly) <= tol && hi >= 0 && hi <= 3;
      const c = Math.min(11, Math.max(0, Math.floor((mx - gx0) / cw)));
      const r = Math.min(2, Math.max(0, Math.floor((my - gy0) / ch)));
      const inCols = mx >= gx0 && mx < gx1;
      const inRows = my >= gy0 && my < gy1;

      // 1) corners
      if (nearV && nearH) {
        const outer = hi === 0 || hi === 3;
        const corner = { kind: 'corner', x: lx, y: ly };
        if (vi === 0 && outer) {
          return this._withZone(BettingSystem.create('firstfour', [0, 1, 2, 3]), corner);
        }
        if (vi === 0) {
          // hi = 1 → rows 0,1 → 3,2 ; hi = 2 → rows 1,2 → 2,1
          const nums = [0, this.numberAt(0, hi - 1), this.numberAt(0, hi)];
          return this._withZone(BettingSystem.create('trio', nums), corner);
        }
        if (outer) {
          const nums = [];
          for (const cc of [vi - 1, vi]) for (let rr = 0; rr < 3; rr++) nums.push(this.numberAt(cc, rr));
          return this._withZone(BettingSystem.create('sixline', nums), corner);
        }
        const nums = [
          this.numberAt(vi - 1, hi - 1), this.numberAt(vi, hi - 1),
          this.numberAt(vi - 1, hi), this.numberAt(vi, hi)
        ];
        return this._withZone(BettingSystem.create('corner', nums), corner);
      }
      // 2) horizontal edges (between rows, or the outer edge = street)
      if (nearH && inCols) {
        const x1 = gx0 + c * cw;
        const edge = { kind: 'edge', x1, y1: ly, x2: x1 + cw, y2: ly };
        if (hi === 0 || hi === 3) {
          const nums = [0, 1, 2].map((rr) => this.numberAt(c, rr));
          return this._withZone(BettingSystem.create('street', nums), edge);
        }
        const nums = [this.numberAt(c, hi - 1), this.numberAt(c, hi)];
        return this._withZone(BettingSystem.create('split', nums), edge);
      }
      // 3) vertical edges (between columns, or zero | first column)
      if (nearV && inRows) {
        const y1 = gy0 + r * ch;
        const edge = { kind: 'edge', x1: lx, y1, x2: lx, y2: y1 + ch };
        if (vi === 0) {
          return this._withZone(BettingSystem.create('split', [0, this.numberAt(0, r)]), edge);
        }
        const nums = [this.numberAt(vi - 1, r), this.numberAt(vi, r)];
        return this._withZone(BettingSystem.create('split', nums), edge);
      }
      // 4) cell centre
      if (inCols && inRows) {
        const n = this.numberAt(c, r);
        return this._withZone(BettingSystem.create('straight', [n]), { kind: 'cell', ...this.rectOf(n) });
      }
    }
    // zero cell
    const z = this.rectOf(0);
    if (mx >= z.x && mx < z.x + z.w && my >= z.y && my < z.y + z.h) {
      return this._withZone(BettingSystem.create('straight', [0]), { kind: 'cell', ...z });
    }
    // dozens, even-money and column cells
    for (const bet of this.outside) {
      const zr = bet.zone;
      if (mx >= zr.x && mx < zr.x + zr.w && my >= zr.y && my < zr.y + zr.h) return bet;
    }
    return null;
  }

  // ------------------------------------------------------------ input

  _toLogical(e) {
    const rect = this.canvasEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS.width) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS.height) / rect.height
    };
  }

  _handleMove(e) {
    const { x, y } = this._toLogical(e);
    this.mouse = { x, y, inside: true };
    this.hover = this.enabled ? this.hitTest(x, y) : null;
    this.canvasEl.style.cursor = this.hover ? 'pointer' : 'default';
  }

  _handleLeave() {
    this.mouse.inside = false;
    this.hover = null;
    this.canvasEl.style.cursor = 'default';
  }

  _handleDown(e) {
    if (!this.enabled || e.button !== 0) return;
    const { x, y } = this._toLogical(e);
    const bet = this.hitTest(x, y);
    if (!bet) return;
    // Clicking the same zone again deselects; any other zone replaces it.
    this.selection = this.selection && this.selection.key === bet.key ? null : bet;
    if (this.onSelectionChange) this.onSelectionChange(this.selection);
  }

  // ------------------------------------------------------------ drawing

  draw(stake) {
    const p = this.p;
    const P = T.panel;
    drawPanel(p, P.x, P.y, P.w, P.h);
    const { gx0, gy0, gx1, gy1, colX1, dozenY1, outY1 } = this.g;

    // felt
    p.noStroke();
    p.fill(COLORS.felt);
    p.rect(T.x0 - 14, gy0 - 10, colX1 - T.x0 + 28, outY1 - gy0 + 20, 10);

    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.BOLD);

    // zero (pointed cell, like the reference layout)
    const z = this.rectOf(0);
    p.fill(COLORS.feltDark);
    p.beginShape();
    p.vertex(z.x + 16, z.y);
    p.vertex(z.x + z.w, z.y);
    p.vertex(z.x + z.w, z.y + z.h);
    p.vertex(z.x + 16, z.y + z.h);
    p.vertex(z.x, z.y + z.h / 2);
    p.endShape(p.CLOSE);
    p.fill(COLORS.green);
    p.ellipse(z.x + z.w / 2 + 4, z.y + z.h / 2, 30, 44);
    p.fill(255);
    p.textSize(18);
    p.text('0', z.x + z.w / 2 + 4, z.y + z.h / 2 + 1);

    // numbers
    for (let n = 1; n <= 36; n++) {
      const r = this.rectOf(n);
      p.noStroke();
      p.fill(colorOf(n) === 'red' ? COLORS.red : COLORS.black);
      p.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.5, r.h * 0.74);
      p.fill(255);
      p.textSize(15);
      p.text(n, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }

    // column, dozen and even-money labels
    p.textSize(14);
    for (const bet of this.outside) {
      const zr = bet.zone;
      const cx = zr.x + zr.w / 2;
      const cy = zr.y + zr.h / 2;
      p.fill(255);
      if (bet.type === 'column') {
        p.push();
        p.translate(cx, cy);
        p.rotate(-Math.PI / 2);
        p.textSize(12);
        p.text('2 TO 1', 0, 0);
        p.pop();
      } else if (bet.type === 'dozen') {
        p.textSize(16);
        p.text(['1st 12', '2nd 12', '3rd 12'][this.outside.indexOf(bet)], cx, cy);
      } else if (bet.type === 'red' || bet.type === 'black') {
        p.fill(bet.type === 'red' ? COLORS.red : COLORS.black);
        p.quad(cx - 26, cy, cx, cy - 13, cx + 26, cy, cx, cy + 13);
      } else {
        p.textSize(14);
        p.text({ low: '1-18', high: '19-36', odd: 'ODD', even: 'EVEN' }[bet.type], cx, cy);
      }
    }

    // grid lines
    p.stroke(COLORS.feltLine);
    p.strokeWeight(1.6);
    p.noFill();
    for (let i = 0; i <= 12; i++) p.line(gx0 + i * T.cellW, gy0, gx0 + i * T.cellW, gy1);
    for (let j = 0; j <= 3; j++) p.line(gx0, gy0 + j * T.cellH, colX1, gy0 + j * T.cellH);
    p.line(colX1, gy0, colX1, gy1);
    p.line(gx0, dozenY1, gx1, dozenY1);
    p.line(gx0, outY1, gx1, outY1);
    for (let i = 0; i <= 3; i++) p.line(gx0 + i * 4 * T.cellW, gy1, gx0 + i * 4 * T.cellW, dozenY1);
    for (let i = 0; i <= 6; i++) p.line(gx0 + i * 2 * T.cellW, dozenY1, gx0 + i * 2 * T.cellW, outY1);
    p.beginShape();
    p.vertex(z.x + z.w, z.y);
    p.vertex(z.x + 16, z.y);
    p.vertex(z.x, z.y + z.h / 2);
    p.vertex(z.x + 16, z.y + z.h);
    p.vertex(z.x + z.w, z.y + z.h);
    p.endShape();

    // last winning number
    if (this.lastWinning !== null) {
      const r = this.rectOf(this.lastWinning);
      const pulse = 0.55 + 0.45 * Math.sin(p.millis() / 180);
      p.stroke(255, 224, 138, 255 * pulse);
      p.strokeWeight(3);
      p.noFill();
      p.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6);
    }

    if (this.selection) this._drawCoverage(this.selection, [217, 180, 91], 60);
    if (this.hover && (!this.selection || this.hover.key !== this.selection.key)) {
      this._drawCoverage(this.hover, [255, 240, 170], 75);
    }
    if (this.selection) this._drawZone(this.selection, [217, 180, 91]);
    if (this.hover) this._drawZone(this.hover, [255, 240, 170]);
    if (this.selection) this._drawChip(this.selection.anchor, stake);

    if (!this.enabled) {
      p.noStroke();
      p.fill(0, 0, 0, 80);
      p.rect(T.x0 - 14, gy0 - 10, colX1 - T.x0 + 28, outY1 - gy0 + 20, 10);
    }
    if (this.hover && this.mouse.inside) this._drawTooltip(this.hover);
    p.textStyle(p.NORMAL);
  }

  _drawCoverage(bet, rgb, alpha) {
    const p = this.p;
    p.noStroke();
    p.fill(rgb[0], rgb[1], rgb[2], alpha);
    if (bet.zone.kind === 'cell' && bet.type !== 'straight') {
      const zr = bet.zone;
      p.rect(zr.x, zr.y, zr.w, zr.h);
    }
    for (const n of bet.numbers) {
      const r = this.rectOf(n);
      p.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3);
    }
  }

  _drawZone(bet, rgb) {
    const p = this.p;
    const zn = bet.zone;
    p.stroke(rgb[0], rgb[1], rgb[2]);
    p.noFill();
    if (zn.kind === 'cell') {
      p.strokeWeight(2.5);
      p.rect(zn.x + 1.5, zn.y + 1.5, zn.w - 3, zn.h - 3, 4);
    } else if (zn.kind === 'edge') {
      p.strokeWeight(6);
      p.line(zn.x1 + (zn.x1 === zn.x2 ? 0 : 6), zn.y1 + (zn.y1 === zn.y2 ? 0 : 6),
        zn.x2 - (zn.x1 === zn.x2 ? 0 : 6), zn.y2 - (zn.y1 === zn.y2 ? 0 : 6));
    } else {
      p.strokeWeight(3);
      p.fill(rgb[0], rgb[1], rgb[2], 180);
      p.circle(zn.x, zn.y, 14);
    }
  }

  _drawChip(at, stake) {
    const p = this.p;
    const v = stake || 0;
    const col = v >= 500000 ? '#6d28d9' : v >= 100000 ? '#111111' : v >= 50000 ? '#c2410c' : v > 0 ? '#1d4ed8' : '#4b5563';
    p.push();
    p.translate(at.x, at.y);
    p.noStroke();
    p.fill(0, 0, 0, 110);
    p.circle(2, 3, 36);
    p.fill(col);
    p.circle(0, 0, 36);
    p.stroke(255);
    p.strokeWeight(4);
    p.noFill();
    p.drawingContext.setLineDash([5, 6]);
    p.circle(0, 0, 29);
    p.drawingContext.setLineDash([]);
    p.noStroke();
    p.fill(255);
    p.circle(0, 0, 21);
    p.fill(col);
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.BOLD);
    p.textSize(v >= 1e6 ? 8 : 9.5);
    p.text(formatCompact(v), 0, 0.5);
    p.pop();
  }

  _drawTooltip(bet) {
    const p = this.p;
    const lines = [
      bet.name,
      `Numbers: ${bet.label}`,
      `Win ${formatPercent(bet.probability)} · pays ${bet.payout}:1`
    ];
    p.textSize(12);
    p.textStyle(p.BOLD);
    const w = Math.max(...lines.map((l) => p.textWidth(l))) + 22;
    const h = 62;
    let x = this.mouse.x + 16;
    let y = this.mouse.y - h - 14;
    if (x + w > CANVAS.width - 8) x = this.mouse.x - w - 16;
    if (y < T.panel.y - 60) y = this.mouse.y + 18;
    p.noStroke();
    p.fill(0, 0, 0, 120);
    p.rect(x + 2, y + 3, w, h, 8);
    p.fill(14, 20, 17, 240);
    p.stroke(COLORS.gold);
    p.strokeWeight(1);
    p.rect(x, y, w, h, 8);
    p.noStroke();
    p.textAlign(p.LEFT, p.TOP);
    p.fill(COLORS.highlight);
    p.text(lines[0], x + 11, y + 9);
    p.textStyle(p.NORMAL);
    p.fill(COLORS.text);
    p.text(lines[1], x + 11, y + 26);
    p.fill(COLORS.muted);
    p.text(lines[2], x + 11, y + 42);
  }
}
