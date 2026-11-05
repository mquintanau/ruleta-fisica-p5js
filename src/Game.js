import { RULES, LAYOUT, COLORS, WHEEL, LAUNCH } from './config.js';
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
import LaunchGesture from './LaunchGesture.js';
import { WHEEL_ORDER, colorOf } from './utils/rouletteData.js';
import { formatCOP, formatSignedCOP } from './utils/format.js';
import { drawPanel, lerp, clamp, TAU } from './utils/math.js';

const S = STATES;

/**
 * Orchestrates one browser page: owns the models, the physics world of the
 * current session and the round lifecycle
 *   READY → BET_PLACED → SPINNING → RESULT → READY | RETIRED | GAME_OVER
 *
 * Inside BET_PLACED (once the payment is approved) the player launches the
 * round with the mouse, tracked in `this.launch.phase`:
 *   'wheel' – drag down on the wheel; too slow a spin asks to try again
 *   'ball'  – the wheel is fast enough: drag left within LAUNCH.ballWindowMs
 *             to throw the ball (→ SPINNING); on timeout the round is voided
 *             with a penalty (→ READY)
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
      onRetire: () => this.retire(),
      onStart: () => this.newSession(),
      onPlayAgain: () => this.newSession(),
      onMainMenu: () => this.mainMenu(),
      onSelectBet: (key) => this._editSlip(() => this.slip.setActive(key)),
      onRemoveBet: (key) => this._editSlip(() => this.slip.remove(key)),
      onClearBets: () => this._editSlip(() => this.slip.clearAll())
    });
    this.gesture = new LaunchGesture(canvasEl, LAYOUT.wheel.panel);
    this.gesture.onRelease = (result) => this._onGesture(result);
    this.chips = new ChipControls(this.ui.el.chips, (action, value) => this.onChip(action, value));

    this.sessionId = 0;
    this.roundSeq = 0;
    this.round = null;
    this.launch = null; // { phase: 'wheel' | 'ball', remainingMs } while BET_PLACED
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
    this._endLaunch();
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
      this.launch = { phase: 'wheel', remainingMs: 0 };
      this.gesture.setDirection('down');
      this.wheel.highlightIndex = -1;
      this.table.lastWinning = null;
      this._sync();
    }
  }

  // ------------------------------------------------------------ mouse launch

  /** A drag on the wheel panel was released (see LaunchGesture.evaluate). */
  _onGesture(g) {
    if (!this.state.canSpin() || !this.launch) return;
    const phase = this.launch.phase;
    if (!g.onAxis) {
      if (Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) >= 8) { // not a plain click
        this.ui.toast(phase === 'wheel' ? 'Drag DOWN on the wheel to spin it.' : 'Drag LEFT to launch the ball.');
      }
      return;
    }
    if (phase === 'wheel') {
      const omega = lerp(LAUNCH.wheelOmega[0], LAUNCH.wheelOmega[1], g.strength);
      this.wheel.spin(omega);
      if (omega < LAUNCH.minWheelOmega) {
        this.ui.toast('Too weak — the wheel needs more speed. Drag down faster and try again.');
        return;
      }
      this.launch = { phase: 'ball', remainingMs: LAUNCH.ballWindowMs };
      this.wheel.decay = LAUNCH.countdownDecay;
      this.gesture.setDirection('left');
      this.ui.toast(`Wheel spinning! Drag left to launch the ball — ${LAUNCH.ballWindowMs / 1000} s.`);
      this._sync();
    } else {
      const speed = lerp(LAUNCH.ballSpeed[0], LAUNCH.ballSpeed[1], g.strength);
      if (speed < LAUNCH.minBallSpeed) {
        this.ui.toast('Too weak — flick left harder before the time runs out!');
        return;
      }
      this._launchBall(speed);
    }
  }

  _launchBall(speed) {
    this._endLaunch();
    this.state.transition(S.SPINNING);
    this.card.status = 'closed';
    const roundId = this.round.id;
    const sessionId = this.sessionId;
    this.ball.launch((index, info) => this._onBallSettled(roundId, sessionId, index, info), speed);
    this._sync();
  }

  /** The ball window expired: void the round, keep 81 % of the stake, back to betting. */
  _launchTimeout() {
    const r = this.round;
    this._endLaunch();
    const penalty = Math.round(r.stake * LAUNCH.timeoutPenalty);
    const refund = r.stake - penalty;
    if (refund > 0) this.money.credit(refund);
    this.stats.recordPenalty(r.id, penalty);
    this.round = null;
    this.state.transition(S.READY);
    this.slip.reset();
    this.card.status = 'idle';
    this.cam.flash(`PENALTY ${formatCOP(penalty)}`, '#f87171');
    this.ui.toast(`Time's up! ${Math.round(LAUNCH.timeoutPenalty * 100)}% of your bet (${formatCOP(penalty)}) was deducted. Place a new bet.`);
    this._sync();
  }

  _endLaunch() {
    this.launch = null;
    this.gesture.setDirection(null);
    if (this.wheel) this.wheel.decay = WHEEL.rotorDecay;
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
      this.ui.toast('Your bet is placed — spin the wheel and launch the ball first.');
      return;
    }
    this._sync();
  }

  /** Tear everything down (listeners, timers, physics). Used on page unload. */
  destroy() {
    this._clearTimers();
    this.card.reset();
    this.gesture.destroy();
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
      launchPhase: this.launch ? this.launch.phase : null,
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
    if (this.launch && this.launch.phase === 'ball') {
      this.launch.remainingMs -= dt * 1000;
      if (this.launch.remainingMs <= 0) this._launchTimeout();
    }
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
    drawPanel(p, W.x, W.y, W.w, W.h);
    this.wheel.draw();
    this.ball.draw();
    this._drawWheelInfo();
    if (this.launch) this._drawLaunchHud();
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
    let caption = '';
    if (this.state.is(S.BET_PLACED)) {
      if (!this.state.spinUnlocked) caption = 'Waiting for payment…';
      else caption = `Wheel ${this.wheel.omega.toFixed(2)} rad/s`;
    }
    if (this.state.is(S.SPINNING)) caption = `Ball rolling · ${this.ball.elapsed.toFixed(1)} s`;
    if (this.state.is(S.RESULT) && this.lastResult) caption = `Ball settled in ${this.lastResult.number}`;
    p.noStroke();
    p.fill(COLORS.muted);
    p.textSize(11);
    p.textAlign(p.RIGHT, p.BOTTOM);
    p.text(caption, W.x + W.w - 14, W.y + W.h - 10);
  }

  /** Gesture hint, live power meter and (in the ball phase) the countdown ring. */
  _drawLaunchHud() {
    const p = this.p;
    const W = LAYOUT.wheel.panel;
    const { cx, cy } = LAYOUT.wheel;
    const ballPhase = this.launch.phase === 'ball';
    const pulse = 0.55 + 0.45 * Math.sin(p.millis() / 80);
    p.push();

    // Countdown ring around the wheel + seconds left
    if (ballPhase) {
      const frac = clamp(this.launch.remainingMs / LAUNCH.ballWindowMs, 0, 1);
      const urgent = frac < 0.34;
      p.noFill();
      p.strokeWeight(5);
      p.stroke(255, 255, 255, 25);
      p.circle(cx, cy, WHEEL.outerR * 2 + 2);
      p.stroke(urgent ? p.color(239, 68, 68, 120 + 135 * pulse) : p.color('#fcd34d'));
      p.arc(cx, cy, WHEEL.outerR * 2 + 2, WHEEL.outerR * 2 + 2, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      p.noStroke();
      p.fill(urgent ? '#f87171' : '#fcd34d');
      p.textAlign(p.LEFT, p.TOP);
      p.textStyle(p.BOLD);
      p.textSize(26);
      p.text(`${(this.launch.remainingMs / 1000).toFixed(1)}s`, W.x + 14, W.y + 10);
      p.textStyle(p.NORMAL);
    }

    // Direction hint (arrow + label), hidden while dragging
    const g = this.gesture;
    if (!g.dragging) {
      const hintText = ballPhase ? 'DRAG LEFT TO LAUNCH THE BALL' : 'DRAG DOWN TO SPIN THE WHEEL';
      const hintX = W.x + W.w - 14;
      const hintY = W.y + 12;

      p.textStyle(p.BOLD);
      p.textSize(13);

      // Semi-transparent black background behind the label
      const padX = 8, padY = 5;
      const tw = p.textWidth(hintText);
      p.noStroke();
      p.fill(0, 0, 0, 200);
      p.rect(hintX - tw - padX, hintY - padY, tw + padX * 2, 13 + padY * 2, 4);

      p.noStroke();
      p.fill(255, 224, 138);
      p.textAlign(p.RIGHT, p.TOP);
      p.text(hintText, hintX, hintY);
      p.textStyle(p.NORMAL);
      p.stroke(255, 224, 138);
      p.strokeWeight(4);
      const off = (p.millis() / 12) % 40;
      if (ballPhase) {
        const y = cy - WHEEL.rimR + 20;
        p.line(cx + 50 - off, y, cx - 10 - off, y);
        p.line(cx - 10 - off, y, cx + 2 - off, y - 9);
        p.line(cx - 10 - off, y, cx + 2 - off, y + 9);
      } else {
        const x = cx + WHEEL.outerR - 36;
        p.line(x, cy - 50 + off, x, cy + 10 + off);
        p.line(x, cy + 10 + off, x - 9, cy - 2 + off);
        p.line(x, cy + 10 + off, x + 9, cy - 2 + off);
      }
    }

    // Live drag: rubber band + power meter with the minimum marked
    const live = g.preview;
    if (live) {
      p.stroke(255, 255, 255, 140);
      p.strokeWeight(2);
      p.line(live.start.x, live.start.y, live.end.x, live.end.y);
      p.noStroke();
      p.fill(255, 255, 255, 180);
      p.circle(live.start.x, live.start.y, 8);
    }
    const lo = ballPhase ? LAUNCH.ballSpeed : LAUNCH.wheelOmega;
    const min = ballPhase ? LAUNCH.minBallSpeed : LAUNCH.minWheelOmega;
    const need = (min - lo[0]) / (lo[1] - lo[0]);
    const strength = live ? live.strength : 0;
    const bx = W.x + 14;
    const by = W.y + W.h - 26;
    const bw = 130;
    p.noStroke();
    p.fill(COLORS.muted);
    p.textAlign(p.LEFT, p.BOTTOM);
    p.textSize(10);
    p.text(ballPhase ? 'THROW POWER' : 'SPIN POWER', bx, by - 3);
    p.fill(255, 255, 255, 25);
    p.rect(bx, by, bw, 10, 5);
    p.fill(strength >= need ? '#4ade80' : '#f87171');
    if (strength > 0) p.rect(bx, by, bw * strength, 10, 5);
    p.fill(COLORS.text);
    p.rect(bx + bw * need - 1, by - 3, 2, 16);
    p.pop();
  }
}
