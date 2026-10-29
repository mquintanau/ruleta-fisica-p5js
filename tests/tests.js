// Logic tests (no rendering). Open tests/index.html through the dev server.
import BettingSystem from '../src/BettingSystem.js';
import BettingTable from '../src/BettingTable.js';
import MoneyManager from '../src/MoneyManager.js';
import BetSlip from '../src/BetSlip.js';
import SessionStats from '../src/SessionStats.js';
import GameState, { STATES as S } from '../src/GameState.js';
import StressMeter from '../src/StressMeter.js';
import TuLlaveCard from '../src/TuLlaveCard.js';
import { formatCOP, formatSignedCOP } from '../src/utils/format.js';
import { LAYOUT, RULES } from '../src/config.js';

const out = document.getElementById('out');
let pass = 0;
let fail = 0;
const results = [];
function check(name, cond, detail = '') {
  if (cond) pass++;
  else fail++;
  results.push(`${cond ? '✔' : '✘'} ${name}${!cond && detail ? `  → ${detail}` : ''}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- format
check('formatCOP initial balance', formatCOP(1750905) === 'COP $1.750.905', formatCOP(1750905));
check('formatCOP zero', formatCOP(0) === 'COP $0');
check('formatSignedCOP', formatSignedCOP(10000) === '+COP $10.000' && formatSignedCOP(-500) === '-COP $500');

// ---------------------------------------------------------------- chips on the bet slip
{
  const B = RULES.initialBalance;
  const slip = new BetSlip();
  const odd = BettingSystem.evenMoney('odd');
  const red = BettingSystem.evenMoney('red');
  check('chips need an active zone', slip.addChip(10000, B) === false && slip.total === 0);
  slip.select(odd);
  slip.addChip(500000, B); slip.addChip(500000, B); slip.addChip(500000, B); slip.addChip(500000, B);
  check('stake clamps to balance', slip.active.stake === 1750905, slip.active.stake);
  slip.halve();
  check('½ floors to an integer', slip.active.stake === 875452, slip.active.stake);
  slip.clearActive(); slip.addChip(10000, B); slip.halve(); slip.halve();
  check('½ keeps integers', slip.active.stake === 2500);
  slip.active.stake = 1; slip.halve();
  check('½ below 1 becomes 0', slip.active.stake === 0);
  slip.allIn(B);
  check('All in = balance', slip.active.stake === B);
  slip.clearActive();
  check('Clear resets the zone to 0', slip.active.stake === 0);

  // two bets with different amounts: Odd and Red
  slip.addChip(100000, B);
  check('select another zone keeps the first bet', slip.select(red) === 'added' && slip.list.length === 2 && slip.activeKey === red.key);
  slip.addChip(50000, B);
  check('each zone has its own stake', slip.entries.get(odd.key).stake === 100000 && slip.entries.get(red.key).stake === 50000 && slip.total === 150000);
  slip.allIn(B);
  check('All in only adds the remaining balance', slip.entries.get(red.key).stake === B - 100000 && slip.total === B);
  slip.addChip(500000, B);
  check('total never exceeds the balance', slip.total === B);
  slip.clearActive(); slip.addChip(50000, B);
  check('clicking a zone with chips re-activates it', slip.select(odd) === 'activated' && slip.activeKey === odd.key);
  check('clicking the active zone deactivates it (chips stay)', slip.select(odd) === 'deactivated' && slip.activeKey === null && slip.list.length === 2);
  const straight = BettingSystem.create('straight', [9]);
  slip.select(straight);
  slip.select(BettingSystem.create('straight', [10]));
  check('zones left without chips are dropped', !slip.entries.has(straight.key) && slip.list.length === 3);
  check('committed() only keeps bets with chips', slip.committed().length === 2);
  slip.remove(odd.key);
  check('remove a bet', !slip.entries.has(odd.key) && slip.total === 50000);
  const full = new BetSlip();
  for (let n = 1; n <= 10; n++) { full.select(BettingSystem.create('straight', [n])); full.addChip(10000, B); }
  check('at most 10 bets per spin', full.select(BettingSystem.create('straight', [11])) === 'full' && full.committed().length === 10);

  // settlement of several bets on one number
  const both = [{ bet: odd, stake: 100000 }, { bet: red, stake: 50000 }];
  check('Odd + Red, 7 (odd, red): both pay', BettingSystem.roundReturn(both, 7) === 300000);
  check('Odd + Red, 9 (odd, red): both pay', BettingSystem.roundReturn(both, 9) === 300000);
  check('Odd + Red, 11 (odd, black): only odd pays', BettingSystem.roundReturn(both, 11) === 200000);
  check('Odd + Red, 12 (even, red): only red pays', BettingSystem.roundReturn(both, 12) === 100000);
  check('Odd + Red, 0: nothing pays', BettingSystem.roundReturn(both, 0) === 0);
  const o = BetSlip.outlook(both);
  check('outlook: best return / payout chance', o.bestReturn === 300000 && Math.abs(o.payoutProbability - 26 / 37) < 1e-12, JSON.stringify(o));
}

// ---------------------------------------------------------------- money
{
  const m = new MoneyManager(RULES.initialBalance);
  check('canAfford rejects 0 / negative / above balance / fractions',
    !m.canAfford(0) && !m.canAfford(-5) && !m.canAfford(m.balance + 1) && !m.canAfford(10.5) && m.canAfford(m.balance));
  m.deduct(750905);
  check('deduct', m.balance === 1000000);
  let threw = false;
  try { m.deduct(2000000); } catch { threw = true; }
  check('cannot deduct more than the balance', threw && m.balance === 1000000);
}

// ---------------------------------------------------------------- payouts
{
  const red = BettingSystem.evenMoney('red');
  check('red covers 18', red.numbers.length === 18 && red.payout === 1);
  check('zero loses red/black/odd/even/low/high',
    ['red', 'black', 'odd', 'even', 'low', 'high'].every((k) => BettingSystem.totalReturn(BettingSystem.evenMoney(k), 1000, 0) === 0));
  check('zero loses dozens and columns',
    [0, 1, 2].every((i) => BettingSystem.totalReturn(BettingSystem.dozen(i), 1000, 0) === 0 &&
      BettingSystem.totalReturn(BettingSystem.column(i), 1000, 0) === 0));
  check('straight win returns stake × 36', BettingSystem.totalReturn(BettingSystem.create('straight', [17]), 10000, 17) === 360000);
  check('split win returns stake × 18', BettingSystem.totalReturn(BettingSystem.create('split', [0, 1]), 10000, 0) === 180000);
  check('column win returns stake × 3', BettingSystem.totalReturn(BettingSystem.column(0), 10000, 34) === 30000);
  check('loss returns 0', BettingSystem.totalReturn(BettingSystem.create('straight', [17]), 10000, 18) === 0);
  check('red is correct', eq(red.numbers, [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]));
}

// ---------------------------------------------------------------- table hit detection
{
  const canvas = document.createElement('canvas');
  const t = new BettingTable({}, canvas);
  const T = LAYOUT.table;
  const { gx0, gy0, gx1, dozenY1 } = t.g;
  const W = T.cellW;
  const H = T.cellH;
  const hit = (x, y) => t.hitTest(x, y);
  const cases = [
    ['centre of 17 → straight', gx0 + 5 * W + W / 2, gy0 + 1.5 * H, 'straight', [17], 35],
    ['centre of 0 → straight 0', T.x0 + T.zeroW / 2, gy0 + 1.5 * H, 'straight', [0], 35],
    ['edge 1|4 → split', gx0 + W + 2, gy0 + 2.5 * H, 'split', [1, 4], 17],
    ['edge 2/3 → split', gx0 + W / 2, gy0 + H - 3, 'split', [2, 3], 17],
    ['outer edge below 1 → street 1-2-3', gx0 + W / 2, gy0 + 3 * H + 4, 'street', [1, 2, 3], 11],
    ['outer edge above 36 → street 34-35-36', gx0 + 11.5 * W, gy0 - 4, 'street', [34, 35, 36], 11],
    ['corner 1-2-4-5', gx0 + W - 3, gy0 + 2 * H + 3, 'corner', [1, 2, 4, 5], 8],
    ['corner 32-33-35-36', gx0 + 11 * W, gy0 + H, 'corner', [32, 33, 35, 36], 8],
    ['outer corner → six line 1-6', gx0 + W, gy0 + 3 * H, 'sixline', [1, 2, 3, 4, 5, 6], 5],
    ['zero | 2 → split 0-2', gx0 + 2, gy0 + 1.5 * H, 'split', [0, 2], 17],
    ['zero | 1 → split 0-1', gx0 - 3, gy0 + 2.5 * H, 'split', [0, 1], 17],
    ['0-1-2 corner → trio', gx0, gy0 + 2 * H, 'trio', [0, 1, 2], 11],
    ['0-2-3 corner → trio', gx0, gy0 + H, 'trio', [0, 2, 3], 11],
    ['0-1-2-3 corner → first four', gx0 + 1, gy0 + 3 * H - 1, 'firstfour', [0, 1, 2, 3], 8],
    ['2 to 1 bottom row → column 1', gx1 + 20, gy0 + 2.5 * H, 'column', null, 2],
    ['2nd 12', gx0 + 6 * W, gy0 + 3 * H + T.dozenH / 2 + 8, 'dozen', null, 2],
    ['19-36', gx0 + 11 * W, dozenY1 + T.outsideH / 2, 'high', null, 1],
    ['black diamond cell', gx0 + 7 * W, dozenY1 + T.outsideH / 2, 'black', null, 1]
  ];
  for (const [name, x, y, type, nums, payout] of cases) {
    const b = hit(x, y);
    const okNums = nums ? b && eq(b.numbers, nums) : true;
    check(`hit: ${name}`, b && b.type === type && okNums && b.payout === payout,
      b ? `${b.type} [${b.numbers}] ${b.payout}:1` : 'null');
  }
  check('outside the felt → null', hit(5, 5) === null && hit(gx0 + 3 * W, dozenY1 + T.outsideH + 30) === null);
  const c1 = hit(gx0 + 2, gy0 + 1.5 * H);
  check('probability = covered / 37', Math.abs(c1.probability - 2 / 37) < 1e-12);
  // clicks are reported to the owner (pointer mapping stubbed to fixed logical points)
  const clicked = [];
  t.onZoneClick = (b) => clicked.push(b.key);
  t._toLogical = () => ({ x: gx0 + W / 2, y: gy0 + H / 2 });
  t._handleDown({ button: 0 });
  check('click reports the zone under the pointer', clicked.join() === 'straight:3');
  t.setEnabled(false);
  t._handleDown({ button: 0 });
  check('disabled table ignores clicks', clicked.length === 1);
  t.destroy();
}

// ---------------------------------------------------------------- state machine
{
  const g = new GameState();
  check('starts in MENU', g.is(S.MENU));
  check('MENU → READY', g.transition(S.READY));
  check('READY ↛ SPINNING', !g.transition(S.SPINNING));
  check('Spin not possible in READY', !g.canSpin());
  g.transition(S.BET_PLACED);
  check('BET_PLACED starts locked', !g.spinUnlocked && !g.canSpin());
  check('BET_PLACED ↛ RETIRED', !g.transition(S.RETIRED) && g.is(S.BET_PLACED));
  check('BET_PLACED ↛ READY (no refund path)', !g.transition(S.READY));
  check('retire request refused in BET_PLACED', !g.canRequestRetire());
  check('unlockSpin works once', g.unlockSpin() && !g.unlockSpin() && g.canSpin());
  g.transition(S.SPINNING);
  check('SPINNING: cannot spin again', !g.canSpin() && !g.transition(S.SPINNING));
  check('SPINNING: retire can be requested', g.canRequestRetire());
  g.transition(S.RESULT);
  check('RESULT → GAME_OVER allowed', g.canTransition(S.GAME_OVER));
  g.transition(S.READY);
  check('READY clears spinUnlocked', !g.spinUnlocked);
  check('READY → RETIRED → READY (play again)', g.transition(S.RETIRED) && g.transition(S.READY));
}

// ---------------------------------------------------------------- stress
{
  const straight = BettingSystem.create('straight', [7]);
  const red = BettingSystem.evenMoney('red');
  const one = (bet, stake) => [{ bet, stake }];
  check('no selection or zero stake → 0', StressMeter.compute(one(straight, 0), 1000) === 0 && StressMeter.compute([], 1000) === 0);
  const small = StressMeter.compute(one(straight, 10000), RULES.initialBalance);
  check('small straight bet → Expectant (odds drive it)', StressMeter.levelOf(small) === 1, small.toFixed(1));
  const allInRed = StressMeter.compute(one(red, RULES.initialBalance), RULES.initialBalance);
  check('All in on red → Extreme', StressMeter.levelOf(allInRed) === 4, allInRed.toFixed(1));
  check('formula 100·(0.65R + 0.35L)', Math.abs(StressMeter.compute(one(red, 500), 1000) - 100 * (0.65 * 0.5 + 0.35 * (19 / 37))) < 1e-9);
  // Red + Black hedge: only 0 loses, so L = 1/37 even with a big total stake.
  const hedge = [{ bet: red, stake: 250 }, { bet: BettingSystem.evenMoney('black'), stake: 250 }];
  check('several bets: R uses the total, L the chance the round loses',
    Math.abs(StressMeter.compute(hedge, 1000) - 100 * (0.65 * 0.5 + 0.35 * (1 / 37))) < 1e-9);
  check('thresholds 0-19 / 20-39 / 40-59 / 60-79 / 80-100', [0, 19.4, 20, 39, 40, 59.4, 60, 79.4, 80, 100].map(StressMeter.levelOf).join('') === '0011223344');
}

// ---------------------------------------------------------------- stats
{
  const s = new SessionStats(1000);
  s.record(1, 100, 0);
  s.record(1, 100, 0);
  s.record(2, 100, 3600);
  const sum = s.summary(4400);
  check('stats count each round once', sum.spins === 2 && sum.losses === 1 && sum.wins === 1 && sum.totalWagered === 200 && sum.totalReturned === 3600 && sum.net === 3400);
  s.record(3, 150, 200, 1, 1);
  check('stats count individual bets of a multi-bet spin', s.spins === 3 && s.wins === 2 && s.losses === 2);
}

// ---------------------------------------------------------------- TuLlave card (async)
async function cardTests() {
  const pStub = { loadImage() {}, millis: () => performance.now() };
  const card = new TuLlaveCard(pStub);
  // normal completion through update()
  let calls = 0;
  card.play(() => calls++);
  for (let i = 0; i < 80; i++) card.update(1 / 60);
  check('card: completes via animation once', calls === 1);
  await new Promise((r) => setTimeout(r, RULES.cardFailsafeMs + 100));
  check('card: failsafe does not fire a second time', calls === 1);
  // failsafe when frames never arrive (e.g. hidden tab / broken asset)
  let fs = 0;
  const t0 = performance.now();
  card.play(() => fs++);
  await new Promise((r) => setTimeout(r, RULES.cardFailsafeMs + 150));
  check('card: failsafe unlocks without frames', fs === 1, `${fs} after ${(performance.now() - t0).toFixed(0)} ms`);
  // stale callback after cancel/reset
  let stale = 0;
  card.play(() => stale++);
  card.reset();
  for (let i = 0; i < 80; i++) card.update(1 / 60);
  await new Promise((r) => setTimeout(r, RULES.cardFailsafeMs + 100));
  check('card: cancelled play never calls back', stale === 0);
  // restart while playing: only the latest callback fires
  let a = 0;
  let b = 0;
  card.play(() => a++);
  card.play(() => b++);
  for (let i = 0; i < 80; i++) card.update(1 / 60);
  check('card: restart drops the previous callback', a === 0 && b === 1);
  card.reset();
}

await cardTests();
out.textContent = `${pass} passed, ${fail} failed\n\n${results.join('\n')}`;
document.title = fail ? `✘ ${fail} failing` : `✔ ${pass} passing`;
window.__testResults = { pass, fail, results };
