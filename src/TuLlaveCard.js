import { LAYOUT, COLORS, RULES } from './config.js';
import { clamp, easeInOutCubic, lerp, drawPanel } from './utils/math.js';
import { formatCOP } from './utils/format.js';

const DURATION = 0.9; // seconds
const CARD_W = 196;
const CARD_H = 122;
// Region of the reference photo that contains the card itself.
const CROP = { x: 26, y: 12, w: 800, h: 472 };

/**
 * TuLlave "tap to pay" animation. play() is called only by a successful
 * Place bet. The completion callback fires exactly once per play, either when
 * the animation ends or from the failsafe timeout, and is ignored if the
 * animation was cancelled or restarted in the meantime (token check).
 */
export default class TuLlaveCard {
  constructor(p, imagePath = 'assets/card/tullave.png') {
    this.p = p;
    this.img = null;
    p.loadImage(imagePath, (img) => { this.img = img; }, () => console.warn('[TuLlaveCard] image missing — drawing vector card'));
    this.token = 0;
    this.playing = false;
    this.t = 0;
    this.timer = null;
    this.onDone = null;
    this.status = 'idle'; // idle | processing | ready | closed
    this.approvedAt = -1e9;
    this.amount = 0;      // stake shown on the terminal while paying
    this.plays = 0;       // debug/testing counter

    const P = LAYOUT.card;
    this.rest = { x: P.x + 40 + CARD_W / 2, y: P.y + 52 + CARD_H / 2 };
    this.term = { x: P.x + 400, y: P.y + 30, w: 140, h: 168 };
    this.pad = { x: this.term.x + this.term.w / 2, y: this.term.y + 116 };
  }

  play(onDone) {
    this.cancel();
    const token = ++this.token;
    this.playing = true;
    this.t = 0;
    this.onDone = onDone;
    this.plays++;
    this.timer = setTimeout(() => this._finish(token), RULES.cardFailsafeMs);
  }

  cancel() {
    this.token++;
    this.playing = false;
    this.t = 0;
    this.onDone = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  reset() {
    this.cancel();
    this.status = 'idle';
    this.approvedAt = -1e9;
  }

  _finish(token) {
    if (token !== this.token || !this.onDone) return;
    const cb = this.onDone;
    this.onDone = null;
    this.playing = false;
    this.t = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    cb();
  }

  update(dt) {
    if (!this.playing) return;
    const before = this.t;
    this.t = Math.min(1, this.t + Math.min(dt, 0.05) / DURATION);
    if (before < 0.42 && this.t >= 0.42) this.approvedAt = this.p.millis();
    if (this.t >= 1) this._finish(this.token);
  }

  _cardTransform() {
    const t = this.t;
    const tap = { x: this.pad.x, y: this.pad.y - 6 };
    let k = 0;
    if (!this.playing) k = 0;
    else if (t < 0.4) k = easeInOutCubic(t / 0.4);
    else if (t < 0.56) k = 1;
    else k = 1 - easeInOutCubic((t - 0.56) / 0.44);
    const bump = this.playing && t >= 0.4 && t < 0.56 ? Math.sin(((t - 0.4) / 0.16) * Math.PI) * 4 : 0;
    return {
      x: lerp(this.rest.x, tap.x, k),
      y: lerp(this.rest.y, tap.y, k) + bump,
      rot: lerp(-0.06, 0.1, k),
      scale: lerp(1, 0.78, k),
      lift: k
    };
  }

  _drawCard(w, h) {
    const p = this.p;
    const ctx = p.drawingContext;
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 10);
    else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
    if (this.img) {
      p.image(this.img, -w / 2, -h / 2, w, h, CROP.x, CROP.y, CROP.w, CROP.h);
    } else {
      p.noStroke();
      p.fill('#f7f7f2');
      p.rect(-w / 2, -h / 2, w, h);
      p.fill('#a6c63a');
      p.circle(-w / 2 + w * 0.1, 0, w * 1.15);
      p.noFill();
      p.stroke(255, 255, 255, 160);
      p.strokeWeight(1);
      p.circle(-w / 2 + w * 0.1, 0, w * 0.9);
      p.noStroke();
      p.fill(255, 255, 255, 200);
      for (let i = 0; i < 3; i++) p.circle(-w / 2 + 20 + i * 14, 4, 11);
      p.fill('#1f3c8c');
      p.textStyle(p.BOLD);
      p.textSize(28);
      p.textAlign(p.LEFT, p.CENTER);
      p.text('tullave', -w / 2 + 66, 2);
      p.textStyle(p.NORMAL);
    }
    ctx.restore();
    p.noFill();
    p.stroke(0, 0, 0, 60);
    p.strokeWeight(1);
    p.rect(-w / 2, -h / 2, w, h, 10);
  }

  draw() {
    const p = this.p;
    const P = LAYOUT.card;
    drawPanel(p, P.x, P.y, P.w, P.h);
    const now = p.millis();
    const since = now - this.approvedAt;
    const approvedGlow = since < 700;

    // ---- terminal
    const T = this.term;
    p.noStroke();
    p.fill(0, 0, 0, 100);
    p.rect(T.x + 3, T.y + 5, T.w, T.h, 16);
    p.fill('#1e2430');
    p.rect(T.x, T.y, T.w, T.h, 16);
    p.fill('#2b3342');
    p.rect(T.x + 8, T.y + 8, T.w - 16, T.h - 16, 12);
    // screen
    const scr = { x: T.x + 18, y: T.y + 18, w: T.w - 36, h: 48 };
    p.fill(approvedGlow ? '#14532d' : '#0f172a');
    p.rect(scr.x, scr.y, scr.w, scr.h, 6);
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.BOLD);
    p.textSize(11);
    let screenText = 'Acerque la tarjeta';
    let screenColor = '#93c5fd';
    if (this.playing && this.t < 0.42) { screenText = 'Leyendo…'; screenColor = '#fcd34d'; }
    else if (approvedGlow || this.status === 'ready') { screenText = '✓ Aprobado'; screenColor = '#86efac'; }
    else if (this.status === 'processing') { screenText = 'Procesando…'; screenColor = '#fcd34d'; }
    p.fill(screenColor);
    p.text(screenText, scr.x + scr.w / 2, scr.y + scr.h / 2);
    p.textStyle(p.NORMAL);
    // contactless pad
    p.noFill();
    p.stroke(approvedGlow ? '#4ade80' : '#64748b');
    p.strokeWeight(2.5);
    for (let i = 0; i < 3; i++) {
      p.arc(this.pad.x - 10, this.pad.y, 14 + i * 10, 14 + i * 10, -0.9, 0.9);
    }
    // LEDs
    p.noStroke();
    const leds = ['#ef4444', '#facc15', '#22c55e'];
    leds.forEach((c, i) => {
      const lit = (i === 2 && (approvedGlow || this.status === 'ready')) || (i === 1 && this.status === 'processing' && !approvedGlow);
      const col = p.color(c);
      col.setAlpha(lit ? 255 : 60);
      p.fill(col);
      p.circle(T.x + T.w / 2 - 20 + i * 20, T.y + T.h - 18, 8);
    });

    // ---- ripple / flash on contact
    if (since < 700) {
      const k = since / 700;
      p.noFill();
      for (let i = 0; i < 3; i++) {
        const kk = clamp(k - i * 0.15, 0, 1);
        if (kk <= 0) continue;
        p.stroke(134, 239, 172, 220 * (1 - kk));
        p.strokeWeight(3 * (1 - kk) + 1);
        p.circle(this.pad.x, this.pad.y, 20 + kk * 160);
      }
      p.noStroke();
      p.fill(255, 255, 255, 120 * Math.max(0, 1 - k * 3));
      p.circle(this.pad.x, this.pad.y, 120);
    }

    // ---- rest slot
    p.noFill();
    p.stroke(255, 255, 255, 30);
    p.strokeWeight(1.5);
    p.drawingContext.setLineDash([6, 6]);
    p.rect(this.rest.x - CARD_W / 2 - 6, this.rest.y - CARD_H / 2 - 6, CARD_W + 12, CARD_H + 12, 14);
    p.drawingContext.setLineDash([]);

    // ---- card
    const tf = this._cardTransform();
    p.push();
    p.translate(tf.x, tf.y);
    p.rotate(tf.rot);
    p.scale(tf.scale);
    p.noStroke();
    p.fill(0, 0, 0, 80 + 60 * tf.lift);
    p.rect(-CARD_W / 2 + 4 + 10 * tf.lift, -CARD_H / 2 + 6 + 14 * tf.lift, CARD_W, CARD_H, 10);
    this._drawCard(CARD_W, CARD_H);
    p.pop();

    // ---- amount being paid
    if (this.amount > 0 && (this.status === 'processing' || this.status === 'ready')) {
      const mx = (this.rest.x + CARD_W / 2 + T.x) / 2;
      p.noStroke();
      p.textAlign(p.CENTER, p.CENTER);
      p.fill(COLORS.muted);
      p.textSize(10);
      p.text('MONTO', mx, this.rest.y - 14);
      p.fill(COLORS.text);
      p.textStyle(p.BOLD);
      p.textSize(15);
      p.text(formatCOP(this.amount), mx, this.rest.y + 6);
      p.textStyle(p.NORMAL);
    }

    // ---- status line
    const status = {
      idle: { text: 'Place a bet to pay with TuLlave', color: COLORS.muted },
      processing: { text: 'Processing payment…  Spin is locked', color: '#fcd34d' },
      ready: { text: 'Payment approved — ready to spin', color: '#4ade80' },
      closed: { text: 'Bets closed', color: COLORS.muted }
    }[this.status];
    p.noStroke();
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(12);
    p.textStyle(p.BOLD);
    p.fill(status.color);
    if (this.status === 'processing') {
      const dots = Math.floor(now / 250) % 4;
      p.circle(P.x + 22, P.y + P.h - 22, 6 + dots);
    } else {
      p.circle(P.x + 22, P.y + P.h - 22, 8);
    }
    p.text(status.text, P.x + 34, P.y + P.h - 21);
    p.textStyle(p.NORMAL);
  }
}
