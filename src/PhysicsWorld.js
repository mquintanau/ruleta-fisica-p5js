import { PHYSICS } from './config.js';

const { Engine, Composite, Events } = window.Matter;

/**
 * Owns the single Matter.js engine of a session and advances it with a fixed
 * time step (accumulator pattern), independent of the rendering frame rate.
 *
 * The world is top-down, so Matter's gravity is disabled; the bowl slope is
 * modelled by forces applied in RouletteBall.applyForces().
 */
export default class PhysicsWorld {
  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      positionIterations: PHYSICS.positionIterations,
      velocityIterations: PHYSICS.velocityIterations,
      enableSleeping: false
    });
    this.world = this.engine.world;
    this.accumulator = 0;
    this.stepListeners = new Set();
    this.collisionListeners = new Set();
    this.destroyed = false;

    this._onCollisionStart = (event) => {
      // Copy the pairs: Matter reuses the array between updates.
      const pairs = event.pairs.slice();
      for (const fn of this.collisionListeners) {
        try {
          fn(pairs);
        } catch (err) {
          console.error('collision listener failed', err);
        }
      }
    };
    Events.on(this.engine, 'collisionStart', this._onCollisionStart);
  }

  add(bodyOrBodies) {
    Composite.add(this.world, bodyOrBodies);
  }

  remove(bodyOrConstraint) {
    Composite.remove(this.world, bodyOrConstraint);
  }

  /** fn(dtSeconds) runs before every fixed sub-step. Returns an unsubscribe function. */
  onStep(fn) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  /** fn(pairs) runs on Matter's collisionStart. Returns an unsubscribe function. */
  onCollision(fn) {
    this.collisionListeners.add(fn);
    return () => this.collisionListeners.delete(fn);
  }

  /** Advance the simulation by a real-time delta (ms). */
  update(deltaMs) {
    if (this.destroyed) return;
    // Clamp long frames (tab switch, breakpoint) so the world never "explodes".
    this.accumulator += Math.min(deltaMs, 100);
    let steps = 0;
    const dt = PHYSICS.stepMs;
    while (this.accumulator >= dt && steps < PHYSICS.maxStepsPerFrame) {
      for (const fn of this.stepListeners) fn(dt / 1000);
      Engine.update(this.engine, dt);
      this.accumulator -= dt;
      steps++;
    }
    if (steps === PHYSICS.maxStepsPerFrame) this.accumulator = 0;
  }

  /** Release every body, constraint and event listener of this engine. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    Events.off(this.engine, 'collisionStart', this._onCollisionStart);
    this.stepListeners.clear();
    this.collisionListeners.clear();
    Composite.clear(this.world, false, true);
    Engine.clear(this.engine);
  }
}
