import { LAYOUT, COLORS } from './config.js';
import { STRESS_LEVELS } from './StressMeter.js';
import { clamp, smoothing } from './utils/math.js';

const FALLBACK_EMOJI = ['😌', '🤔', '😟', '😰', '😱'];
const CHAT = [
  ['tranqui, es solo una ruletica', 'gg ez', 'buena vibra hoy'],
  ['¿y si sale?', 'uy uy uy', 'esa bolita...'],
  ['F en el chat', 'piensa en el arriendo', 'respira, parcero'],
  ['¡¡suéltalo!!', 'se nos va el mercado', 'MODS ayúdenlo'],
  ['NOOOO TODO EN UNA', '😱😱😱', 'llamen a la mamá']
];

/**
 * Simulated streamer face-cam built from five preloaded images
 * (assets/reactions/*.png). Missing images fall back to a styled emoji card.
 */
export default class ReactionCam {
  constructor(p, basePath = 'assets/reactions/') {
    this.p = p;
    this.images = {};
    this.failed = new Set();
    this.level = 0;
    this.prevLevel = 0;
    this.fade = 1;
    this.zoom = 1;
    this.banner = null; // { text, color, until }
    this.viewers = 1200 + Math.floor(Math.random() * 400);
    this.chatLine = CHAT[0][0];

    for (const l of STRESS_LEVELS) {
      p.loadImage(
        `${basePath}${l.key}.png`,
        (img) => { this.images[l.key] = img; },
        () => {
          this.failed.add(l.key);
          console.warn(`[ReactionCam] missing ${l.key}.png — using fallback`);
        }
      );
    }
  }

  setLevel(level) {
    const lvl = clamp(Math.round(level), 0, 4);
    if (lvl === this.level) return;
    this.prevLevel = this.level;
    this.level = lvl;
    this.fade = 0;
    this.zoom = 1.06;
    const lines = CHAT[lvl];
    this.chatLine = lines[Math.floor(Math.random() * lines.length)];
  }

  flash(text, color, ms = 2600) {
    this.banner = { text, color, until: this.p.millis() + ms };
  }

  reset() {
    this.level = 0;
    this.prevLevel = 0;
    this.fade = 1;
    this.zoom = 1;
    this.banner = null;
    this.chatLine = CHAT[0][0];
  }

  update(dt) {
    this.fade = Math.min(1, this.fade + dt / 0.3);
    this.zoom += (1 - this.zoom) * smoothing(6, dt);
    // Viewer count drifts up with the drama.
    if (Math.random() < dt * 2) this.viewers += Math.floor((Math.random() - 0.35) * (6 + this.level * 18));
    this.viewers = Math.max(800, this.viewers);
  }

  _drawFrame(level, alpha, x, y, w, h) {
    const p = this.p;
    const key = STRESS_LEVELS[level].key;
    const img = this.images[key];
    if (img) {
      p.tint(255, 255 * alpha);
      // cover-fit the 4:3 image
      const s = Math.max(w / img.width, h / img.height);
      const iw = img.width * s;
      const ih = img.height * s;
      p.image(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
      p.noTint();
    } else {
      // Styled fallback (image missing or still loading)
      p.noStroke();
      p.fill(30, 22, 60, 255 * alpha);
      p.rect(x, y, w, h);
      p.fill(255, 255, 255, 255 * alpha);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(84);
      p.text(FALLBACK_EMOJI[level], x + w / 2, y + h / 2 - 8);
      if (this.failed.has(key)) {
        p.textSize(10);
        p.fill(200, 200, 220, 200 * alpha);
        p.text('camera feed unavailable · placeholder', x + w / 2, y + h - 40);
      }
    }
  }

  draw() {
    const p = this.p;
    const C = LAYOUT.cam;
    const ctx = p.drawingContext;

    // Shake intensity by level (subtle; only at the two highest levels).
    const amp = this.level >= 4 ? 2.6 : this.level === 3 ? 1.1 : 0;
    const t = p.millis() / 50;
    const sx = amp ? (p.noise(t) - 0.5) * 2 * amp : 0;
    const sy = amp ? (p.noise(t + 100) - 0.5) * 2 * amp : 0;

    p.noStroke();
    p.fill(0, 0, 0, 90);
    p.rect(C.x + 2, C.y + 4, C.w, C.h, 14);

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(C.x, C.y, C.w, C.h, 14);
    else ctx.rect(C.x, C.y, C.w, C.h);
    ctx.clip();

    p.push();
    p.translate(C.x + C.w / 2 + sx, C.y + C.h / 2 + sy);
    p.scale(this.zoom);
    const x = -C.w / 2 - 4;
    const y = -C.h / 2 - 4;
    const w = C.w + 8;
    const h = C.h + 8;
    if (this.fade < 1) this._drawFrame(this.prevLevel, 1, x, y, w, h);
    this._drawFrame(this.level, this.fade, x, y, w, h);
    p.pop();

    // Overlays: LIVE badge, viewers, handle, chat line
    p.noStroke();
    p.fill(220, 38, 38);
    p.rect(C.x + 10, C.y + 10, 46, 18, 4);
    p.fill(255);
    p.textStyle(p.BOLD);
    p.textSize(10);
    p.textAlign(p.LEFT, p.CENTER);
    p.circle(C.x + 18, C.y + 19, 6);
    p.text('LIVE', C.x + 24, C.y + 19.5);
    p.fill(0, 0, 0, 140);
    p.rect(C.x + 62, C.y + 10, 66, 18, 4);
    p.fill(255);
    p.textStyle(p.NORMAL);
    p.text(`👁 ${this.viewers.toLocaleString('es-CO')}`, C.x + 68, C.y + 19.5);

    p.fill(0, 0, 0, 150);
    p.rect(C.x, C.y + C.h - 26, C.w, 26);
    p.textSize(10.5);
    p.fill(COLORS.highlight);
    p.textStyle(p.BOLD);
    p.text('parce_88:', C.x + 10, C.y + C.h - 13);
    p.textStyle(p.NORMAL);
    p.fill(255);
    p.text(this.chatLine, C.x + 66, C.y + C.h - 13);

    if (this.banner && p.millis() < this.banner.until) {
      const left = (this.banner.until - p.millis()) / 1000;
      const a = Math.min(1, left / 0.4);
      p.textAlign(p.CENTER, p.CENTER);
      p.textStyle(p.BOLD);
      p.textSize(22);
      const c = p.color(this.banner.color);
      p.fill(0, 0, 0, 150 * a);
      p.rect(C.x, C.y + C.h - 64, C.w, 36);
      c.setAlpha(255 * a);
      p.fill(c);
      p.text(this.banner.text, C.x + C.w / 2, C.y + C.h - 45);
    }
    p.textStyle(p.NORMAL);
    ctx.restore();

    p.noFill();
    p.stroke(this.level >= 3 ? STRESS_LEVELS[this.level].color : COLORS.panelEdge);
    p.strokeWeight(this.level >= 3 ? 2 : 1.5);
    p.rect(C.x, C.y, C.w, C.h, 14);
  }
}
