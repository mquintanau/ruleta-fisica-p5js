import { RULES, LAYOUT, COLORS } from './config.js';
import GameState, { STATES } from './GameState.js';
import PhysicsWorld from './PhysicsWorld.js';
import RouletteWheel from './RouletteWheel.js';
import RouletteBall from './RouletteBall.js';
import BettingSystem from './BettingSystem.js';
import BettingTable from './BettingTable.js';
import BetSlip, { MAX_BETS } from './BetSlip.js';
import ChipControls from './ChipControls.js';
import MoneyManager from './MoneyManager.js';
import SessionStats from './SessionStats.js';
import StressMeter from './StressMeter.js';
import ReactionCam from './ReactionCam.js';
import TuLlaveCard from './TuLlaveCard.js';
import UIManager from './UIManager.js';
import { WHEEL_ORDER, colorOf } from './utils/rouletteData.js';
import { formatCOP, formatSignedCOP } from './utils/format.js';
import { drawPanel } from './utils/math.js';

const S = STATES;

/**
 * Orchestrates one browser page: owns the models, the physics world of the
 * current session and the round lifecycle
 *   READY → BET_PLACED → SPINNING → RESULT → READY | RETIRED | GAME_OVER
 */
export default class Game {
  constructor(p, canvasEl) {
    this.p = p;
    this.state = new GameState();
    this.money = new MoneyManager(RULES.initialBalance);
    this.stats = new SessionStats(RULES.initialBalance);
    this.stress = new StressMeter(p);
    this.cam = new ReactionCam(p);
    this.card = new TuLlaveCard(p);
    this.slip = new BetSlip();
    this.table = new BettingTable(p, canvasEl);
    this.table.onZoneClick = (bet) => this.onZoneClick(bet);

    this.ui = new UIManager({
      onPlace: () => this.placeBet(),
      onSpin: () => this.spin(),
      onRetire: () => this.retire(),
      onStart: () => this.newSession(),
      onPlayAgain: () => this.newSession(),
      onMainMenu: () => this.mainMenu(),
      onSelectBet: (key) => this._editSlip(() => this.slip.setActive(key)),
      onRemoveBet: (key) => this._editSlip(() => this.slip.remove(key)),
      onClearBets: () => this._editSlip(() => this.slip.clearAll())
    });
    this.chips = new ChipControls(this.ui.el.chips, (action, value) => this.onChip(action, value));

    this.sessionId = 0;
    this.roundSeq = 0;
    this.round = null;
    this.lastResult = null;
    this.history = [];
    this.timers = new Set();
    this.physics = null;
    this.wheel = null;
    this.ball = null;

    this._buildPhysics();
    this.ui.showMenu();
    this._sync();
  }

  // ------------------------------------------------------------ lifecycle

  _buildPhysics() {
    if (this.ball) this.ball.destroy();
    if (this.wheel) this.wheel.destroy();
    if (this.physics) this.physics.destroy();
    this.physics = new PhysicsWorld();
    this.wheel = new RouletteWheel(this.p, this.physics, LAYOUT.wheel.cx, LAYOUT.wheel.cy);
    this.ball = new RouletteBall(this.p, this.physics, this.wheel);
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  _clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
  }

  /** Fresh session: balance, counters, physics world, timers and UI are reset. */
  newSession() {
    if (!this.state.is(S.MENU, S.RETIRED, S.GAME_OVER)) return;
    this.sessionId++;
    this._clearTimers();
    this.card.reset();
    this.money.reset();
    this.slip.reset();
    this.stats.reset();
    this.history = [];
    this.round = null;
    this.lastResult = null;
    this.table.reset();
    this.stress.reset();
    this.cam.reset();
    this._buildPhysics();
    this.state.transition(S.READY);
    this.ui.hideOverlay();
    this._sync();
  }

  mainMenu() {
    if (!this.state.is(S.RETIRED, S.GAME_OVER)) return;
    this.state.transition(S.MENU);
    this.ui.showMenu();
    this._sync();
  }

  // ------------------------------------------------------------ actions

  /** Bet-slip edits are only allowed while READY. */
  _editSlip(fn) {
    if (!this.state.is(S.READY)) return;
    fn();
    this._sync();
  }

  onZoneClick(bet) {
    this._editSlip(() => {
      if (this.slip.select(bet) === 'full') this.ui.toast(`Maximum ${MAX_BETS} bets per spin.`);
    });
  }

  onChip(action, value) {
    if (!this.state.is(S.READY)) return;
    if (!this.slip.active) {
      this.ui.toast('Select a zone on the table first, then add chips to it.');
      return;
    }
    const balance = this.money.balance;
    if (action === 'add') this.slip.addChip(value, balance);
    else if (action === 'half') this.slip.halve();
    else if (action === 'clear') this.slip.clearActive();
    else if (action === 'allin') this.slip.allIn(balance);
    this._sync();
  }

  placeBet() {
    if (!this.state.is(S.READY)) return;
    const bets = this.slip.committed();
    const stake = bets.reduce((s, e) => s + e.stake, 0);
    if (!this.slip.list.length) return this.ui.toast('Select a zone on the table first.');
    if (!bets.length) return this.ui.toast('Add chips: the stake must be greater than 0.');
    if (!this.money.canAfford(stake)) return this.ui.toast('The total stake exceeds your balance.');

    // Atomic: validate → deduct once (all bets together) → lock the round → state change.
    const refBalance = this.money.balance;
    this.money.deduct(stake);
    this.round = { id: ++this.roundSeq, bets, stake, refBalance, resolved: false };
    this.slip.reset();
    this.state.transition(S.BET_PLACED);
    this.table.setEnabled(false);
    this.chips.setEnabled(false);
    this.card.status = 'processing';
    this.card.amount = stake;
    const roundId = this.round.id;
    const sessionId = this.sessionId;
    this.card.play(() => this._onPaymentApproved(roundId, sessionId));
    this._sync();
  }

  _onPaymentApproved(roundId, sessionId) {
    // Ignore stale callbacks from an earlier round or session.
    if (sessionId !== this.sessionId || !this.round || this.round.id !== roundId) return;
    if (this.state.unlockSpin()) {
      this.card.status = 'ready';
      this._sync();
    }
  }

  spin() {
    if (!this.state.canSpin()) return;
    this.state.transition(S.SPINNING);
    this.card.status = 'closed';
    this.wheel.highlightIndex = -1;
    this.table.lastWinning = null;
    this.wheel.spin();
    const roundId = this.round.id;
    const sessionId = this.sessionId;
    this.ball.launch((index, info) => this._onBallSettled(roundId, sessionId, index, info));
    this._sync();
  }

  _onBallSettled(roundId, sessionId, index, info) {
    if (sessionId !== this.sessionId || !this.round || this.round.id !== roundId) return;
    if (this.round.resolved || !this.state.is(S.SPINNING)) return;
    if (info.fallback) console.info(`[Game] ball settled with fallback: ${info.fallback}`);
    this._resolve(index);
  }

  _resolve(pocketIndex) {
    const r = this.round;
    r.resolved = true;
    const number = WHEEL_ORDER[pocketIndex];
    const bets = r.bets.map((e) => ({ ...e, returned: BettingSystem.totalReturn(e.bet, e.stake, number) }));
    const returned = bets.reduce((s, e) => s + e.returned, 0);
    const betsWon = bets.filter((e) => e.returned > 0).length;
    if (returned > 0) this.money.credit(returned);
    this.stats.record(r.id, r.stake, returned, betsWon, bets.length - betsWon);
    this.history.unshift(number);
    if (this.history.length > 14) this.history.length = 14;
    this.lastResult = {
      number,
      bets,
      stake: r.stake,
      returned,
      net: returned - r.stake,
      balance: this.money.balance,
      win: returned > r.stake
    };
    this.wheel.highlightIndex = pocketIndex;
    this.table.lastWinning = number;
    this.state.transition(S.RESULT);
    const net = returned - r.stake;
    if (net > 0) this.cam.flash(`WIN ${formatSignedCOP(net)}`, '#4ade80');
    else if (net === 0) this.cam.flash('BREAK EVEN', '#fcd34d');
    else this.cam.flash(`LOST ${formatCOP(-net)}`, '#f87171');
    this._later(() => this._afterResult(), RULES.resultDisplayMs);
    this._sync();
  }

  _afterResult() {
    if (!this.state.is(S.RESULT)) return;
    this.round = null;
    if (this.money.balance <= 0) {
      // Game over takes precedence over a pending retirement.
      this.state.transition(S.GAME_OVER);
      this.ui.showSummary('gameover', this.stats.summary(this.money.balance));
    } else if (this.state.retirePending) {
      this.state.transition(S.RETIRED);
      this.ui.showSummary('retired', this.stats.summary(this.money.balance));
    } else {
      this.state.transition(S.READY);
      this.slip.reset();
      this.table.setEnabled(true);
      this.chips.setEnabled(true);
      this.card.status = 'idle';
    }
    this._sync();
  }

  retire() {
    if (this.state.is(S.READY)) {
      this.state.transition(S.RETIRED);
      this.ui.showSummary('retired', this.stats.summary(this.money.balance));
    } else if (this.state.is(S.SPINNING, S.RESULT)) {
      if (!this.state.canRequestRetire()) return;
      this.state.retirePending = true;
      this.ui.toast('You will cash out as soon as this spin is settled.');
    } else if (this.state.is(S.BET_PLACED)) {
      // The bet is committed: no refunds and no retiring before the spin.
      this.ui.toast('Your bet is placed — you must spin first.');
      return;
    }
    this._sync();
  }

  /** Tear everything down (listeners, timers, physics). Used on page unload. */
  destroy() {
    this._clearTimers();
    this.card.reset();
    this.table.destroy();
    this.chips.destroy();
    this.ui.destroy();
    this.ball.destroy();
    this.wheel.destroy();
    this.physics.destroy();
  }

  // ------------------------------------------------------------ derived

  _stressValue() {
    if (this.round && this.state.is(S.BET_PLACED, S.SPINNING, S.RESULT)) {
      return StressMeter.compute(this.round.bets, this.round.refBalance);
    }
    if (this.state.is(S.READY)) {
      return StressMeter.compute(this.slip.list, this.money.balance);
    }
    return 0;
  }

  snapshot() {
    const inRound = this.round && !this.round.resolved;
    return {
      state: this.state.state,
      spinUnlocked: this.state.spinUnlocked,
      retirePending: this.state.retirePending,
      balance: this.money.balance,
      pendingStake: inRound ? this.round.stake : 0,
      bets: this.round ? this.round.bets : this.slip.list,
      activeKey: this.round ? null : this.slip.activeKey,
      editable: this.state.is(S.READY),
      lastResult: this.lastResult,
      history: this.history
    };
  }

  _sync() {
    const ready = this.state.is(S.READY);
    this.table.setEnabled(ready);
    this.chips.setEnabled(ready);
    this.stress.setValue(this._stressValue());
    this.ui.render(this.snapshot());
  }

  // ------------------------------------------------------------ frame

  update(dtMs) {
    const dt = Math.min(dtMs, 100) / 1000;
    this.physics.update(dtMs);
    this.card.update(dt);
    this.stress.update(dt);

    let level = this.stress.level;
    if (this.state.is(S.SPINNING)) level = Math.max(level, 1);
    if (this.state.is(S.RESULT) && this.lastResult && this.lastResult.win) level = 0;
    if (this.state.is(S.MENU, S.RETIRED)) level = 0;
    if (this.state.is(S.GAME_OVER)) level = 4;
    this.cam.setLevel(level);
    this.cam.update(dt);
  }

  draw() {
    const p = this.p;
    p.background(COLORS.bg);
    const W = LAYOUT.wheel.panel;
    drawPanel(p, W.x, W.y, W.w, W.h, 'European wheel');
    this.wheel.draw();
    this.ball.draw();
    this._drawWheelInfo();
    this.cam.draw();
    this.stress.draw();
    this.card.draw();
    if (this.round) this.table.draw(this.round.bets, null);
    else this.table.draw(this.slip.list, this.slip.activeKey);
  }

  _drawWheelInfo() {
    const p = this.p;
    const W = LAYOUT.wheel.panel;
    const { cx, cy } = LAYOUT.wheel;
    // Winning number disc in the middle of the hub (does not rotate).
    if (this.lastResult && this.wheel.highlightIndex >= 0) {
      const n = this.lastResult.number;
      const col = { red: COLORS.red, black: '#111', green: COLORS.green }[colorOf(n)];
      p.noStroke();
      p.fill(0, 0, 0, 120);
      p.circle(cx + 2, cy + 3, 74);
      p.fill(col);
      p.stroke(COLORS.gold);
      p.strokeWeight(3);
      p.circle(cx, cy, 70);
      p.noStroke();
      p.fill(255);
      p.textAlign(p.CENTER, p.CENTER);
      p.textStyle(p.BOLD);
      p.textSize(30);
      p.text(n, cx, cy + 1);
      p.textStyle(p.NORMAL);
    }
    // Bottom caption
    let caption = 'Place a bet to play';
    if (this.state.is(S.BET_PLACED)) caption = this.state.spinUnlocked ? 'Ready — press Spin' : 'Waiting for payment…';
    if (this.state.is(S.SPINNING)) caption = `Ball rolling · ${this.ball.elapsed.toFixed(1)} s`;
    if (this.state.is(S.RESULT) && this.lastResult) caption = `Ball settled in ${this.lastResult.number}`;
    p.noStroke();
    p.fill(COLORS.muted);
    p.textSize(11);
    p.textAlign(p.RIGHT, p.BOTTOM);
    p.text(caption, W.x + W.w - 14, W.y + W.h - 10);
    p.textAlign(p.LEFT, p.BOTTOM);
    p.textSize(9.5);
    p.text('ball: Matter.js rigid body', W.x + 14, W.y + W.h - 10);
  }
}
