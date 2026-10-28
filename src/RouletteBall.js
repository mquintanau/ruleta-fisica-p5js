import { WHEEL, BALL, PHYSICS } from './config.js';
import { randRange, TAU } from './utils/math.js';

const { Bodies, Body, Constraint, Vector } = window.Matter;

/**
 * The ball: a Matter.js circle body.
 *
 * States
 *   held     – resting in a pocket, pinned to the rotor by a Matter constraint
 *   rolling  – free physics simulation (launched by spin())
 *
 * Top-down force model (applied every fixed sub-step, before Engine.update):
 *   - inward "slope" acceleration toward the wheel centre (stronger on the
 *     tilted bowl than over the rotor), standing in for gravity on a 3D bowl;
 *   - rolling resistance on the stationary bowl (absolute velocity);
 *   - pocket-floor friction over the rotor (velocity relative to the rotor).
 * The rim wall, brass diamonds, frets and hub are real Matter.js collision
 * geometry, so all bounces and the final pocket come from the simulation.
 */
export default class RouletteBall {
  constructor(p, physics, wheel) {
    this.p = p;
    this.physics = physics;
    this.wheel = wheel;

    this.body = Bodies.circle(wheel.cx, wheel.cy - WHEEL.rimR + 20, BALL.radius, {
      label: 'ball',
      restitution: 0.1,
      friction: 0.04,
      frictionStatic: 0.05,
      frictionAir: 0, // drag is modelled explicitly in _applyForces
      density: 0.004,
      slop: 0.02
    });
    // Keep Matter's time-correction factor at 1 with our fixed step.
    this.body.deltaTime = PHYSICS.stepMs;
    physics.add(this.body);

    this.state = 'held';
    this.constraint = null;
    this.trail = [];
    this.elapsed = 0;
    this.stillTime = 0;
    this.recoveries = 0;
    this.guideIndex = -1;
    this.usedFallback = null; // null | 'guided' | 'snapped'
    this.onSettled = null;    // callback(pocketIndex, info)
    this.lastHit = { t: -1e9, x: 0, y: 0 };

    this.unsubStep = physics.onStep((dt) => this._step(dt));
    this.unsubCollision = physics.onCollision((pairs) => this._onCollisions(pairs));

    this.holdInPocket(0);
  }

  // ------------------------------------------------------------- helpers

  _velocity(dt) {
    const b = this.body;
    return { x: (b.position.x - b.positionPrev.x) / dt, y: (b.position.y - b.positionPrev.y) / dt };
  }

  _setVelocity(vx, vy) {
    const b = this.body;
    const dt = PHYSICS.stepMs / 1000;
    b.positionPrev.x = b.position.x - vx * dt;
    b.positionPrev.y = b.position.y - vy * dt;
    b.velocity.x = vx * dt;
    b.velocity.y = vy * dt;
  }

  _place(x, y) {
    Body.setPosition(this.body, { x, y });
    this.body.positionPrev.x = x;
    this.body.positionPrev.y = y;
  }

  _releaseConstraint() {
    if (this.constraint) {
      this.physics.remove(this.constraint);
      this.constraint = null;
    }
  }

  // --------------------------------------------------------------- control

  /** Pin the ball at the bottom of pocket `index` (idle / initial position). */
  holdInPocket(index) {
    const pt = this.wheel.pocketRestPoint(index);
    this._place(pt.x, pt.y);
    this._attachHere();
  }

  _attachHere() {
    this._releaseConstraint();
    const rotor = this.wheel.rotor;
    this.attachAngle = rotor.angle;
    this.localOffset = { x: this.body.position.x - rotor.position.x, y: this.body.position.y - rotor.position.y };
    this.constraint = Constraint.create({
      bodyA: rotor,
      pointA: { ...this.localOffset },
      bodyB: this.body,
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: 1,
      damping: 0.1
    });
    this.physics.add(this.constraint);
    this.state = 'held';
    this.trail = [];
  }

  /** The croupier throws the ball along the rim, opposite to the rotor. */
  launch(onSettled) {
    this._releaseConstraint();
    const a = randRange(0, TAU);
    const r = WHEEL.rimR - BALL.radius - 0.5;
    this._place(this.wheel.cx + Math.cos(a) * r, this.wheel.cy + Math.sin(a) * r);
    const speed = randRange(BALL.launchSpeed[0], BALL.launchSpeed[1]);
    // Counter-clockwise tangent on a y-down screen.
    this._setVelocity(Math.sin(a) * speed, -Math.cos(a) * speed);
    this.state = 'rolling';
    this.elapsed = 0;
    this.stillTime = 0;
    this.guideIndex = -1;
    this.usedFallback = null;
    this.recoveries = 0;
    this.trail = [];
    this.onSettled = onSettled;
  }

  // ------------------------------------------------------------ simulation

  _step(dt) {
    if (this.state === 'held') {
      // Static bodies do not rotate constraint anchors, so follow the rotor here.
      if (this.constraint) {
        this.constraint.pointA = Vector.rotate(this.localOffset, this.wheel.rotor.angle - this.attachAngle);
      }
      return;
    }
    if (this.state !== 'rolling') return;

    this.elapsed += dt;
    const b = this.body;
    const cx = this.wheel.cx;
    const cy = this.wheel.cy;
    let dx = b.position.x - cx;
    let dy = b.position.y - cy;
    let r = Math.hypot(dx, dy);

    // --- safety nets: invalid state, escaped the rim, or tunnelled into the hub
    if (!Number.isFinite(r) || r > WHEEL.rimR + 20) {
      this._recover();
      return;
    }
    if (r < WHEEL.hubR + BALL.radius - 3) {
      const k = (WHEEL.hubR + BALL.radius + 0.5) / Math.max(r, 1e-6);
      this._place(cx + dx * k, cy + dy * k);
      dx *= k; dy *= k; r = WHEEL.hubR + BALL.radius + 0.5;
    }

    let v = this._velocity(dt);

    // --- smooth rim: a polygonal wall bleeds energy at every joint, so the
    // track wall is a circular contact constraint (Matter segments behind it
    // remain as a backstop). Outward radial velocity is removed, tangential kept.
    const maxR = WHEEL.rimR - BALL.radius;
    if (r > maxR) {
      const nx0 = dx / r;
      const ny0 = dy / r;
      const vr = v.x * nx0 + v.y * ny0;
      const vrNew = vr > 0 ? -vr * BALL.rimRestitution : vr;
      const vx = v.x - vr * nx0 + vrNew * nx0;
      const vy = v.y - vr * ny0 + vrNew * ny0;
      this._place(cx + nx0 * maxR, cy + ny0 * maxR);
      this._setVelocity(vx, vy);
      dx = nx0 * maxR;
      dy = ny0 * maxR;
      r = maxR;
      v = { x: vx, y: vy };
    }

    let speed = Math.hypot(v.x, v.y);
    if (speed > BALL.maxSpeed) {
      const s = BALL.maxSpeed / speed;
      this._setVelocity(v.x * s, v.y * s);
      v = { x: v.x * s, y: v.y * s };
      speed = BALL.maxSpeed;
    }

    const nx = dx / r;
    const ny = dy / r;
    const onBowl = r > WHEEL.bowlInnerR;
    const surf = this.wheel.surfaceVelocity(b.position.x, b.position.y);
    let ax;
    let ay;
    if (onBowl) {
      ax = -BALL.bowlGravity * nx - BALL.bowlDrag * v.x;
      ay = -BALL.bowlGravity * ny - BALL.bowlDrag * v.y;
      if (speed > 1) {
        ax -= (BALL.bowlRolling * v.x) / speed;
        ay -= (BALL.bowlRolling * v.y) / speed;
      }
    } else {
      ax = -BALL.rotorGravity * nx - BALL.floorDrag * (v.x - surf.x);
      ay = -BALL.rotorGravity * ny - BALL.floorDrag * (v.y - surf.y);
    }

    // --- controlled fallback: only if the simulation refuses to settle
    if (this.elapsed > BALL.guideAfter) {
      if (this.guideIndex < 0) {
        this.guideIndex = this.wheel.pocketIndexAt(b.position.x, b.position.y);
        this.usedFallback = 'guided';
      }
      const t = this.wheel.pocketRestPoint(this.guideIndex);
      ax += 60 * (t.x - b.position.x) - 8 * (v.x - surf.x);
      ay += 60 * (t.y - b.position.y) - 8 * (v.y - surf.y);
    }

    const m = b.mass * 1e-6; // Matter: Δv(px/step) = F/m · Δt(ms)²
    Body.applyForce(b, b.position, { x: ax * m, y: ay * m });

    // --- settling: inside a pocket and moving with the rotor for a while
    const relSpeed = Math.hypot(v.x - surf.x, v.y - surf.y);
    const inPocket = r < WHEEL.pocketOuterR - 3;
    const threshold = this.guideIndex >= 0 ? BALL.settleSpeed * 3 : BALL.settleSpeed;
    if (inPocket && relSpeed < threshold) this.stillTime += dt;
    else this.stillTime = 0;

    if (this.stillTime >= BALL.settleTime) {
      this._settle();
    } else if (this.elapsed > BALL.snapAfter) {
      // Last resort (never expected in practice): drop into the guided pocket.
      const idx = this.guideIndex >= 0 ? this.guideIndex : this.wheel.pocketIndexAt(b.position.x, b.position.y);
      const pt = this.wheel.pocketRestPoint(idx);
      this._place(pt.x, pt.y);
      this.usedFallback = 'snapped';
      this._settle();
    }
  }

  _recover() {
    // Put the ball back on the track with a gentle tangential speed.
    this.recoveries++;
    const a = randRange(0, TAU);
    const r = WHEEL.rimR - BALL.radius - 1;
    this._place(this.wheel.cx + Math.cos(a) * r, this.wheel.cy + Math.sin(a) * r);
    this._setVelocity(Math.sin(a) * 700, -Math.cos(a) * 700);
    this.trail = [];
  }

  _settle() {
    const { x, y } = this.body.position;
    const index = this.wheel.pocketIndexAt(x, y);
    this._attachHere();
    const cb = this.onSettled;
    this.onSettled = null;
    if (cb) cb(index, { elapsed: this.elapsed, fallback: this.usedFallback, recoveries: this.recoveries });
  }

  _onCollisions(pairs) {
    if (this.state !== 'rolling') return;
    for (const pair of pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a !== this.body && b !== this.body) continue;
      const other = a === this.body ? b : a;
      if (other.label === 'diamond' || other.label === 'fret') {
        const c = pair.collision && pair.collision.supports && pair.collision.supports[0];
        this.lastHit = { t: this.p.millis(), x: c ? c.x : this.body.position.x, y: c ? c.y : this.body.position.y };
      }
    }
  }

  destroy() {
    if (this.unsubStep) this.unsubStep();
    if (this.unsubCollision) this.unsubCollision();
    this.unsubStep = this.unsubCollision = null;
    this._releaseConstraint();
    this.physics.remove(this.body);
    this.onSettled = null;
  }

  // ------------------------------------------------------------- rendering

  draw() {
    const p = this.p;
    const { x, y } = this.body.position;
    if (this.state === 'rolling') {
      this.trail.push({ x, y });
      if (this.trail.length > 10) this.trail.shift();
      p.noStroke();
      for (let i = 0; i < this.trail.length; i++) {
        const t = i / this.trail.length;
        p.fill(255, 255, 255, 50 * t);
        p.circle(this.trail[i].x, this.trail[i].y, BALL.radius * 2 * (0.5 + 0.5 * t));
      }
    }
    const since = p.millis() - this.lastHit.t;
    if (since < 140) {
      p.noFill();
      p.stroke(255, 236, 170, 200 * (1 - since / 140));
      p.strokeWeight(2);
      p.circle(this.lastHit.x, this.lastHit.y, 6 + since * 0.12);
    }
    p.noStroke();
    p.fill(0, 0, 0, 90);
    p.circle(x + 2, y + 2.5, BALL.radius * 2);
    p.fill('#f4f4f0');
    p.circle(x, y, BALL.radius * 2);
    p.fill(255);
    p.circle(x - 2, y - 2, BALL.radius * 0.8);
  }
}
