export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export const randRange = (lo, hi) => lo + Math.random() * (hi - lo);

/** Normalise an angle to [0, 2π). */
export function normAngle(a) {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** Frame-rate independent exponential smoothing factor. */
export const smoothing = (rate, dt) => 1 - Math.exp(-rate * dt);

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Rounded panel used by every canvas section. */
export function drawPanel(p, x, y, w, h, title) {
  p.push();
  p.noStroke();
  p.fill(0, 0, 0, 70);
  p.rect(x + 2, y + 4, w, h, 14);
  p.fill('#111a16');
  p.stroke('#1f2d27');
  p.strokeWeight(1.5);
  p.rect(x, y, w, h, 14);
  if (title) {
    p.noStroke();
    p.fill('#8fa39a');
    p.textSize(11);
    p.textStyle(p.BOLD);
    p.textAlign(p.LEFT, p.TOP);
    p.text(title.toUpperCase(), x + 14, y + 11);
    p.textStyle(p.NORMAL);
  }
  p.pop();
}
