import { WHEEL, BALL, COLORS } from './config.js';
import { WHEEL_ORDER, POCKETS, colorOf } from './utils/rouletteData.js';
import { TAU, normAngle, randRange } from './utils/math.js';

const { Bodies, Body } = window.Matter;

const POCKET_ANGLE = TAU / POCKETS;
// Pocket i is centred at rotor-local angle BASE + i * POCKET_ANGLE (0 starts at 12 o'clock).
const BASE = -Math.PI / 2;

const COLOR_HEX = { red: COLORS.red, black: COLORS.black, green: COLORS.green };

/**
 * The wheel: a static stator (rim wall + brass diamonds) and a kinematic rotor
 * (pocket frets + central hub) that Matter.js collides against the ball.
 *
 * The rotor is a static compound body driven kinematically: every sub-step it
 * is rotated with Body.setAngle(..., updateVelocity = true), which also stores
 * its angular velocity so contacts with the frets transfer the rotor's surface
 * velocity to the ball, while the rotor itself is never pushed by the ball.
 */
export default class RouletteWheel {
  constructor(p, physics, cx, cy) {
    this.p = p;
    this.physics = physics;
    this.cx = cx;
    this.cy = cy;
    this.omega = WHEEL.idleOmega; // rad/s, positive = clockwise on screen
    this.highlightIndex = -1;

    this._buildStator();
    this._buildRotor();
    this.unsubscribe = physics.onStep((dt) => this._step(dt));

    this.baseGfx = null;
    this.rotorGfx = null;
  }

  // ---------------------------------------------------------------- physics

  _buildStator() {
    const { rimR, rimSegments, diamonds, diamondR } = WHEEL;
    const thickness = 34;
    // The ball rides a smooth circular wall at rimR (see RouletteBall); these
    // Matter segments sit 3 px further out as a collision backstop.
    const segR = rimR + 3 + thickness / 2;
    const segLen = (TAU * segR) / rimSegments * 1.12;
    this.statorBodies = [];
    for (let i = 0; i < rimSegments; i++) {
      const a = (i / rimSegments) * TAU;
      this.statorBodies.push(Bodies.rectangle(
        this.cx + Math.cos(a) * segR, this.cy + Math.sin(a) * segR, thickness, segLen,
        { isStatic: true, angle: a, restitution: 0.12, friction: 0, frictionStatic: 0, label: 'rim' }
      ));
    }
    this.diamondShapes = [];
    for (let i = 0; i < diamonds; i++) {
      const a = (i / diamonds) * TAU + Math.PI / diamonds;
      const radial = i % 2 === 0;
      const x = this.cx + Math.cos(a) * diamondR;
      const y = this.cy + Math.sin(a) * diamondR;
      const d = Bodies.fromVertices(x, y, [[
        { x: 0, y: -9 }, { x: 4, y: 0 }, { x: 0, y: 9 }, { x: -4, y: 0 }
      ]], { isStatic: true, restitution: 0.55, friction: 0.02, label: 'diamond' });
      // Long axis along the radius (radial) or along the track (tangential).
      Body.setAngle(d, radial ? a + Math.PI / 2 : a);
      Body.setPosition(d, { x, y });
      this.statorBodies.push(d);
      this.diamondShapes.push({ a, radial });
    }
    this.physics.add(this.statorBodies);
  }

  _buildRotor() {
    const { hubR, pocketOuterR } = WHEEL;
    const parts = [];
    parts.push(Bodies.circle(this.cx, this.cy, hubR, { label: 'hub' }, 72));
    const fretLen = pocketOuterR - hubR + 4;
    const fretMid = hubR - 4 + fretLen / 2;
    for (let i = 0; i < POCKETS; i++) {
      const a = BASE + (i + 0.5) * POCKET_ANGLE;
      parts.push(Bodies.rectangle(
        this.cx + Math.cos(a) * fretMid, this.cy + Math.sin(a) * fretMid, fretLen, 3.2,
        { angle: a, label: 'fret' }
      ));
    }
    this.rotor = Body.create({ parts, label: 'rotor' });
    Body.setStatic(this.rotor, true);
    Body.setPosition(this.rotor, { x: this.cx, y: this.cy });
    for (const part of this.rotor.parts) {
      part.restitution = part.label === 'fret' ? 0.4 : 0.08;
      part.friction = 0.06;
      part.frictionStatic = 0.1;
    }
    this.physics.add(this.rotor);
  }

  _step(dt) {
    // Rotor speed decays toward a slow idle spin, like a real wheel.
    if (this.omega > WHEEL.idleOmega) {
      this.omega = Math.max(WHEEL.idleOmega, this.omega * Math.exp(-WHEEL.rotorDecay * dt));
    }
    const delta = this.omega * dt;
    Body.setAngle(this.rotor, this.rotor.angle + delta, true);
    // Static bodies are skipped by Engine.update, so set the per-step velocity
    // explicitly: the contact solver uses it as the moving wall's velocity.
    this.rotor.angularVelocity = delta;
    this.rotor.anglePrev = this.rotor.angle - delta;
  }

  /** Croupier spin: give the rotor a fresh clockwise impulse. */
  spin() {
    this.omega = randRange(WHEEL.spinOmega[0], WHEEL.spinOmega[1]);
  }

  get angle() {
    return this.rotor.angle;
  }

  /** Velocity (px/s) of the rotor surface at world point (x, y). */
  surfaceVelocity(x, y) {
    return { x: -this.omega * (y - this.cy), y: this.omega * (x - this.cx) };
  }

  /** Pocket index (0..36, index into WHEEL_ORDER) under world point (x, y). */
  pocketIndexAt(x, y) {
    const local = Math.atan2(y - this.cy, x - this.cx) - this.rotor.angle - BASE;
    return Math.round(normAngle(local) / POCKET_ANGLE) % POCKETS;
  }

  numberAt(x, y) {
    return WHEEL_ORDER[this.pocketIndexAt(x, y)];
  }

  /** World position of the resting spot at the bottom of pocket `index`. */
  pocketRestPoint(index) {
    const a = this.rotor.angle + BASE + index * POCKET_ANGLE;
    const r = WHEEL.hubR + BALL.radius + 1;
    return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r };
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
    this.physics.remove(this.rotor);
    for (const b of this.statorBodies) this.physics.remove(b);
    this.statorBodies = [];
    if (this.baseGfx) this.baseGfx.remove();
    if (this.rotorGfx) this.rotorGfx.remove();
    this.baseGfx = this.rotorGfx = null;
  }

  // -------------------------------------------------------------- rendering

  _ensureGraphics() {
    const p = this.p;
    if (!this.baseGfx) {
      const s = WHEEL.outerR * 2 + 24;
      this.baseGfx = p.createGraphics(s, s);
      this.baseGfx.pixelDensity(2);
      this._paintBase(this.baseGfx, s / 2);
    }
    if (!this.rotorGfx) {
      const s = WHEEL.numberOuterR * 2 + 8;
      this.rotorGfx = p.createGraphics(s, s);
      this.rotorGfx.pixelDensity(2);
      this._paintRotor(this.rotorGfx, s / 2);
    }
  }

  _paintBase(g, c) {
    const { outerR, rimR, bowlInnerR, diamondR } = WHEEL;
    g.clear();
    g.noStroke();
    // Drop shadow
    g.fill(0, 0, 0, 90);
    g.circle(c + 3, c + 6, outerR * 2 + 10);
    // Wooden rim
    for (let r = outerR; r > rimR; r -= 1) {
      const t = (outerR - r) / (outerR - rimR);
      g.fill(g.lerpColor(g.color('#5a3218'), g.color('#2c160a'), t));
      g.circle(c, c, r * 2);
    }
    g.noFill();
    g.stroke(COLORS.gold);
    g.strokeWeight(2.5);
    g.circle(c, c, outerR * 2 - 2);
    g.stroke(COLORS.goldDark);
    g.strokeWeight(1.5);
    g.circle(c, c, rimR * 2 + 1);
    // Ball track / bowl
    g.noStroke();
    for (let r = rimR; r > bowlInnerR - 2; r -= 1) {
      const t = (rimR - r) / (rimR - bowlInnerR);
      g.fill(g.lerpColor(g.color('#3a2316'), g.color('#1c110a'), t));
      g.circle(c, c, r * 2);
    }
    g.noFill();
    g.stroke(255, 255, 255, 18);
    g.strokeWeight(1);
    g.circle(c, c, (rimR - 6) * 2);
    // Diamonds
    for (const d of this.diamondShapes) {
      g.push();
      g.translate(c + Math.cos(d.a) * diamondR, c + Math.sin(d.a) * diamondR);
      g.rotate(d.radial ? d.a + Math.PI / 2 : d.a);
      g.noStroke();
      g.fill(COLORS.gold);
      g.quad(0, -9, 4, 0, 0, 9, -4, 0);
      g.fill(255, 255, 255, 120);
      g.triangle(0, -9, 4, 0, 0, 0);
      g.pop();
    }
  }

  _paintRotor(g, c) {
    const { numberOuterR, pocketOuterR, hubR } = WHEEL;
    g.clear();
    g.textFont('Outfit');
    g.textAlign(g.CENTER, g.CENTER);
    g.textStyle(g.BOLD);
    for (let i = 0; i < POCKETS; i++) {
      const n = WHEEL_ORDER[i];
      const col = COLOR_HEX[colorOf(n)];
      const a0 = BASE + (i - 0.5) * POCKET_ANGLE;
      const a1 = BASE + (i + 0.5) * POCKET_ANGLE;
      // number band
      g.noStroke();
      g.fill(col);
      g.arc(c, c, numberOuterR * 2, numberOuterR * 2, a0, a1, g.PIE);
      // pocket (slightly darker)
      const pc = g.color(col);
      pc.setAlpha(255);
      g.fill(g.lerpColor(pc, g.color(0), 0.35));
      g.arc(c, c, pocketOuterR * 2, pocketOuterR * 2, a0, a1, g.PIE);
      // number
      const am = BASE + i * POCKET_ANGLE;
      g.push();
      g.translate(c + Math.cos(am) * (pocketOuterR + 11), c + Math.sin(am) * (pocketOuterR + 11));
      g.rotate(am + Math.PI / 2);
      g.fill(255);
      g.textSize(12);
      g.text(n, 0, 0);
      g.pop();
    }
    // separators on the number band and the frets (gold)
    for (let i = 0; i < POCKETS; i++) {
      const a = BASE + (i + 0.5) * POCKET_ANGLE;
      g.stroke(COLORS.gold);
      g.strokeWeight(1);
      g.line(c + Math.cos(a) * pocketOuterR, c + Math.sin(a) * pocketOuterR,
        c + Math.cos(a) * numberOuterR, c + Math.sin(a) * numberOuterR);
      g.strokeWeight(3);
      g.stroke('#f3d98b');
      g.line(c + Math.cos(a) * (hubR - 1), c + Math.sin(a) * (hubR - 1),
        c + Math.cos(a) * pocketOuterR, c + Math.sin(a) * pocketOuterR);
    }
    g.noFill();
    g.stroke(COLORS.gold);
    g.strokeWeight(2);
    g.circle(c, c, pocketOuterR * 2);
    g.circle(c, c, numberOuterR * 2 - 1);
    // Hub / cone
    g.noStroke();
    for (let r = hubR; r > 0; r -= 1) {
      const t = 1 - r / hubR;
      g.fill(g.lerpColor(g.color('#4a2a14'), g.color('#8a5a2e'), t * t));
      g.circle(c, c, r * 2);
    }
    g.stroke(COLORS.gold);
    g.strokeWeight(2);
    g.noFill();
    g.circle(c, c, hubR * 2);
    g.circle(c, c, hubR * 1.1);
    // Turret
    g.strokeWeight(6);
    g.stroke(COLORS.goldDark);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.line(c, c, c + Math.cos(a) * 52, c + Math.sin(a) * 52);
    }
    g.strokeWeight(3);
    g.stroke('#f3d98b');
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.line(c, c, c + Math.cos(a) * 50, c + Math.sin(a) * 50);
    }
    g.noStroke();
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.fill('#f3d98b');
      g.circle(c + Math.cos(a) * 52, c + Math.sin(a) * 52, 11);
    }
    g.fill(COLORS.goldDark);
    g.circle(c, c, 26);
    g.fill('#f3d98b');
    g.circle(c - 2, c - 2, 16);
  }

  draw() {
    const p = this.p;
    this._ensureGraphics();
    p.imageMode(p.CENTER);
    p.image(this.baseGfx, this.cx, this.cy, this.baseGfx.width, this.baseGfx.height);
    p.push();
    p.translate(this.cx, this.cy);
    p.rotate(this.rotor.angle);
    p.image(this.rotorGfx, 0, 0, this.rotorGfx.width, this.rotorGfx.height);
    if (this.highlightIndex >= 0) {
      const a0 = BASE + (this.highlightIndex - 0.5) * POCKET_ANGLE;
      const a1 = BASE + (this.highlightIndex + 0.5) * POCKET_ANGLE;
      const pulse = 0.6 + 0.4 * Math.sin(p.millis() / 160);
      p.noFill();
      p.stroke(255, 224, 138, 255 * pulse);
      p.strokeWeight(3);
      p.arc(0, 0, WHEEL.numberOuterR * 2 - 2, WHEEL.numberOuterR * 2 - 2, a0, a1, p.PIE);
    }
    p.pop();
    p.imageMode(p.CORNER);
  }
}
