import { LAYOUT, COLORS } from './config.js';
import { clamp, smoothing, drawPanel } from './utils/math.js';
import { POCKETS } from './utils/rouletteData.js';

export const STRESS_LEVELS = [
  { key: 'normal', label: 'Normal', min: 0, color: '#22c55e' },
  { key: 'expectant', label: 'Expectant', min: 20, color: '#a3e635' },
  { key: 'stressed', label: 'Stressed', min: 40, color: '#facc15' },
  { key: 'very_stressed', label: 'Very stressed', min: 60, color: '#fb923c' },
  { key: 'extreme_nervous', label: 'Extreme nervousness', min: 80, color: '#ef4444' }
];

/**
 * Fictional "cortisol" gauge (a game heuristic, not a medical measurement).
 *   R = S / B          (share of the pre-bet balance at risk)
 *   L = 1 − n / 37     (probability of losing the selected bet)
 *   stress = 100 · (0.65 R + 0.35 L), clamped to [0, 100]
 */
export default class StressMeter {
  constructor(p) {
    this.p = p;
    this.target = 0;
    this.display = 0;
  }

  static compute(stake, referenceBalance, bet) {
    if (!bet || !(stake > 0) || !(referenceBalance > 0)) return 0;
    const R = stake / referenceBalance;
    const L = 1 - bet.numbers.length / POCKETS;
    return clamp(100 * (0.65 * R + 0.35 * L), 0, 100);
  }

  /** Level of a score, using the same rounding as the number shown on the dial. */
  static levelOf(value) {
    const v = Math.round(value);
    let idx = 0;
    STRESS_LEVELS.forEach((l, i) => {
      if (v >= l.min) idx = i;
    });
    return idx;
  }

  setValue(v) {
    this.target = clamp(v, 0, 100);
  }

  reset() {
    this.target = 0;
    this.display = 0;
  }

  get level() {
    return StressMeter.levelOf(this.target);
  }

  update(dt) {
    this.display += (this.target - this.display) * smoothing(5, dt);
  }

  _colorFor(v) {
    const p = this.p;
    const stops = STRESS_LEVELS.map((l) => p.color(l.color));
    const t = clamp(v / 100, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    return p.lerpColor(stops[i], stops[i + 1], t - i);
  }

  draw() {
    const p = this.p;
    const G = LAYOUT.gauge;
    drawPanel(p, G.x, G.y, G.w, G.h, 'Cortisol-o-meter');
    const cx = G.x + G.w / 2;
    const cy = G.y + 146;
    const R = 92;
    const v = this.display;
    const lvl = StressMeter.levelOf(v);

    // Dial segments
    p.noFill();
    p.strokeCap(p.SQUARE);
    STRESS_LEVELS.forEach((l, i) => {
      p.stroke(l.color);
      p.strokeWeight(i === lvl ? 20 : 16);
      const a0 = Math.PI + (i / 5) * Math.PI + 0.012;
      const a1 = Math.PI + ((i + 1) / 5) * Math.PI - 0.012;
      p.arc(cx, cy, R * 2, R * 2, a0, a1);
    });
    p.strokeCap(p.ROUND);
    // Ticks
    for (let k = 0; k <= 20; k++) {
      const a = Math.PI + (k / 20) * Math.PI;
      const r0 = R - (k % 2 === 0 ? 22 : 17);
      p.stroke(k % 2 === 0 ? 220 : 120);
      p.strokeWeight(k % 2 === 0 ? 2 : 1);
      p.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * (R - 13), cy + Math.sin(a) * (R - 13));
    }
    p.noStroke();
    p.fill(COLORS.muted);
    p.textSize(9);
    p.textAlign(p.CENTER, p.CENTER);
    for (const k of [0, 50, 100]) {
      const a = Math.PI + (k / 100) * Math.PI;
      p.text(k, cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32) + (k === 50 ? 0 : -4));
    }

    // Needle (with a little tremor at high stress)
    const jitter = v > 60 ? (p.noise(p.millis() / 60) - 0.5) * (v - 60) * 0.004 : 0;
    const a = Math.PI + (clamp(v, 0, 100) / 100) * Math.PI + jitter;
    const col = this._colorFor(v);
    p.stroke(0, 0, 0, 120);
    p.strokeWeight(5);
    p.line(cx + 1, cy + 2, cx + Math.cos(a) * (R - 8) + 1, cy + Math.sin(a) * (R - 8) + 2);
    p.stroke(col);
    p.strokeWeight(3.5);
    p.line(cx, cy, cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8));
    p.noStroke();
    p.fill('#0b0f0d');
    p.circle(cx, cy, 20);
    p.fill(col);
    p.circle(cx, cy, 11);

    // Score + level
    p.textStyle(p.BOLD);
    p.fill(col);
    p.textSize(26);
    p.text(Math.round(v), cx, cy + 30);
    p.textSize(12);
    p.fill(COLORS.text);
    p.text(STRESS_LEVELS[lvl].label, cx, cy + 54);
    p.textStyle(p.NORMAL);
    p.fill(COLORS.muted);
    p.textSize(9);
    p.text('fictional game indicator · not a medical value', cx, G.y + G.h - 12);
  }
}
