// Headless physics check: runs many spins without rendering and reports how the
// ball settles. Open tests/physics.html through the dev server.
import PhysicsWorld from '../src/PhysicsWorld.js';
import RouletteWheel from '../src/RouletteWheel.js';
import RouletteBall from '../src/RouletteBall.js';
import { WHEEL_ORDER } from '../src/utils/rouletteData.js';
import { WHEEL } from '../src/config.js';

const out = document.getElementById('out');
const log = (s) => { out.textContent += `${s}\n`; };
const pStub = { millis: () => performance.now() };

export function runSpins(n = 20, frameMs = 1000 / 60) {
  const physics = new PhysicsWorld();
  const wheel = new RouletteWheel(pStub, physics, 262, 252);
  const ball = new RouletteBall(pStub, physics, wheel);
  const results = [];
  for (let k = 0; k < n; k++) {
    wheel.spin();
    let res = null;
    ball.launch((index, info) => { res = { index, ...info }; });
    let t = 0;
    let leftRimAt = null;
    let maxR = 0;
    while (!res && t < 40) {
      physics.update(frameMs);
      t += frameMs / 1000;
      const r = Math.hypot(ball.body.position.x - wheel.cx, ball.body.position.y - wheel.cy);
      maxR = Math.max(maxR, r);
      if (leftRimAt === null && r < WHEEL.rimR - 12) leftRimAt = t;
    }
    if (!res) { results.push({ failed: true }); continue; }
    const atSettle = wheel.numberAt(ball.body.position.x, ball.body.position.y);
    // keep simulating for 3 s: the ball must stay in the same pocket
    for (let i = 0; i < 180; i++) physics.update(frameMs);
    const later = wheel.numberAt(ball.body.position.x, ball.body.position.y);
    results.push({
      number: WHEEL_ORDER[res.index],
      atSettle,
      later,
      t: res.elapsed,
      leftRimAt,
      maxR,
      fallback: res.fallback,
      recoveries: res.recoveries
    });
  }
  ball.destroy();
  wheel.destroy();
  physics.destroy();
  return results;
}

const N = Number(new URLSearchParams(location.search).get('n') || 20);
const t0 = performance.now();
const res = runSpins(N);
const ok = res.filter((r) => !r.failed);
const times = ok.map((r) => r.t).sort((a, b) => a - b);
log(`spins: ${res.length}, settled: ${ok.length}, wall time ${((performance.now() - t0) / 1000).toFixed(1)} s`);
log(`settle time  min ${times[0]?.toFixed(1)}  median ${times[Math.floor(times.length / 2)]?.toFixed(1)}  max ${times[times.length - 1]?.toFixed(1)} s`);
log(`left rim at  median ${ok.map((r) => r.leftRimAt).sort((a, b) => a - b)[Math.floor(ok.length / 2)]?.toFixed(1)} s`);
log(`fallbacks: ${ok.filter((r) => r.fallback).length}, recoveries: ${ok.reduce((s, r) => s + r.recoveries, 0)}, max radius ${Math.max(...ok.map((r) => r.maxR)).toFixed(1)} (rim ${WHEEL.rimR})`);
log(`result == pocket under ball: ${ok.every((r) => r.number === r.atSettle)}; still there 3 s later: ${ok.every((r) => r.number === r.later)}`);
log(`numbers: ${ok.map((r) => r.number).join(', ')}`);
// Rough uniformity check (chi-square over 37 pockets, df = 36; ~51 is the 95% bound).
const counts = new Array(37).fill(0);
ok.forEach((r) => counts[r.number]++);
const expected = ok.length / 37;
const chi2 = counts.reduce((s, c) => s + ((c - expected) ** 2) / expected, 0);
log(`chi-square (df 36): ${chi2.toFixed(1)}   counts: ${counts.join(' ')}`);
window.__physicsResults = res;
