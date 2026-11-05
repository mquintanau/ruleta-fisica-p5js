import { PHYSICS } from './config.js';

const { Engine, Composite, Events } = window.Matter;

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

  onStep(fn) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  onCollision(fn) {
    this.collisionListeners.add(fn);
    return () => this.collisionListeners.delete(fn);
  }

  update(deltaMs) {
    if (this.destroyed) return;
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
