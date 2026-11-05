import { CANVAS, LAUNCH } from './config.js';
import { clamp } from './utils/math.js';

/** Unit vectors (y-down screen) of the two launch gestures. */
export const DIRECTIONS = Object.freeze({
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
});

/**
 * Mouse drag on the wheel panel used to spin the rotor (drag down) and to
 * throw the ball (drag left). Pointer samples are kept for the whole drag;
 * on release the drag is reduced to a strength in [0, 1] from its distance
 * and its release velocity along the expected direction.
 */
export default class LaunchGesture {
  constructor(canvasEl, area) {
    this.canvasEl = canvasEl;
    this.area = area;          // { x, y, w, h } in logical canvas pixels
    this.direction = null;     // key of DIRECTIONS, or null when disabled
    this.samples = null;       // [{ x, y, t }] while dragging
    this.onRelease = null;     // (result, direction) => void

    this._onDown = (e) => this._handleDown(e);
    this._onMove = (e) => this._handleMove(e);
    this._onUp = (e) => this._handleUp(e);
    this._onCancel = () => { this.samples = null; };
    canvasEl.addEventListener('pointerdown', this._onDown);
    canvasEl.addEventListener('pointermove', this._onMove);
    canvasEl.addEventListener('pointerup', this._onUp);
    canvasEl.addEventListener('pointercancel', this._onCancel);
  }

  destroy() {
    this.canvasEl.removeEventListener('pointerdown', this._onDown);
    this.canvasEl.removeEventListener('pointermove', this._onMove);
    this.canvasEl.removeEventListener('pointerup', this._onUp);
    this.canvasEl.removeEventListener('pointercancel', this._onCancel);
    this.onRelease = null;
  }

  /** Arm the gesture for 'down' / 'left', or pass null to disable it. */
  setDirection(dir) {
    this.direction = dir;
    if (!dir) this.samples = null;
  }

  get dragging() {
    return !!this.samples;
  }

  /** Live strength of the drag in progress (for the power meter). */
  get preview() {
    return this.samples ? LaunchGesture.evaluate(this.samples, DIRECTIONS[this.direction]) : null;
  }

  // ------------------------------------------------------------ input

  _toLogical(e) {
    const rect = this.canvasEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS.width) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS.height) / rect.height,
      t: e.timeStamp
    };
  }

  _handleDown(e) {
    if (!this.direction || e.button !== 0) return;
    const pt = this._toLogical(e);
    const A = this.area;
    if (pt.x < A.x || pt.x > A.x + A.w || pt.y < A.y || pt.y > A.y + A.h) return;
    this.samples = [pt];
    // Keep receiving moves (and the release) when the pointer leaves the canvas.
    if (this.canvasEl.setPointerCapture) this.canvasEl.setPointerCapture(e.pointerId);
  }

  _handleMove(e) {
    if (!this.samples) return;
    this.samples.push(this._toLogical(e));
    if (this.samples.length > 240) this.samples.splice(1, 1); // keep the start point
  }

  _handleUp(e) {
    if (!this.samples) return;
    this.samples.push(this._toLogical(e));
    const result = LaunchGesture.evaluate(this.samples, DIRECTIONS[this.direction]);
    const dir = this.direction;
    this.samples = null;
    if (this.onRelease) this.onRelease(result, dir);
  }

  // ------------------------------------------------------------ scoring

  /**
   * Pure scoring of a drag. `samples` are { x, y, t(ms) }, `dir` a unit vector.
   * Distance is the start→end displacement along `dir`; velocity is measured
   * over the last LAUNCH.velocityWindowMs before release (a flick counts more
   * than a slow pull of the same length).
   * Returns { distance, velocity, strength, onAxis, start, end }.
   */
  static evaluate(samples, dir) {
    const start = samples[0];
    const end = samples[samples.length - 1];
    const along = (a, b) => (b.x - a.x) * dir.x + (b.y - a.y) * dir.y;
    const across = (a, b) => Math.abs((b.x - a.x) * dir.y - (b.y - a.y) * dir.x);
    const distance = Math.max(0, along(start, end));

    let ref = start;
    for (let i = samples.length - 1; i >= 0; i--) {
      ref = samples[i];
      if (end.t - samples[i].t >= LAUNCH.velocityWindowMs) break;
    }
    const dt = Math.max(end.t - ref.t, 16) / 1000;
    const velocity = Math.max(0, along(ref, end)) / dt;

    // The drag must point mostly in the expected direction.
    const onAxis = distance >= LAUNCH.minDistance && distance >= across(start, end);
    const strength = onAxis ? LaunchGesture.strengthOf(distance, velocity) : 0;
    return { distance, velocity, strength, onAxis, start, end };
  }

  static strengthOf(distance, velocity) {
    const d = clamp(distance / LAUNCH.distanceRef, 0, 1);
    const v = clamp(velocity / LAUNCH.velocityRef, 0, 1);
    return LAUNCH.distanceWeight * d + (1 - LAUNCH.distanceWeight) * v;
  }
}
