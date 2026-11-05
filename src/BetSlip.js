import BettingSystem from './BettingSystem.js';
import { POCKETS } from './utils/rouletteData.js';

export const MAX_BETS = 10;

export default class BetSlip {
  constructor() {
    this.entries = new Map(); // key -> { bet, stake }
    this.activeKey = null;
  }

  reset() {
    this.entries.clear();
    this.activeKey = null;
  }

  get list() {
    return [...this.entries.values()];
  }

  get active() {
    return this.activeKey ? this.entries.get(this.activeKey) : null;
  }

  get total() {
    let t = 0;
    for (const e of this.entries.values()) t += e.stake;
    return t;
  }

  committed() {
    return this.list.filter((e) => e.stake > 0).map((e) => Object.freeze({ bet: e.bet, stake: e.stake }));
  }

  _prune() {
    for (const [key, e] of this.entries) {
      if (e.stake === 0 && key !== this.activeKey) this.entries.delete(key);
    }
  }

  select(bet) {
    if (bet.key === this.activeKey) {
      this.activeKey = null;
      this._prune();
      return 'deactivated';
    }
    if (this.entries.has(bet.key)) {
      this.activeKey = bet.key;
      this._prune();
      return 'activated';
    }
    this.activeKey = null;
    this._prune();
    if (this.committed().length >= MAX_BETS) return 'full';
    this.entries.set(bet.key, { bet, stake: 0 });
    this.activeKey = bet.key;
    return 'added';
  }

  setActive(key) {
    if (!this.entries.has(key)) return false;
    this.activeKey = key;
    this._prune();
    return true;
  }

  remove(key) {
    this.entries.delete(key);
    if (this.activeKey === key) this.activeKey = null;
  }

  clearAll() {
    this.reset();
  }

  _room(balance) {
    return Math.max(0, balance - (this.total - this.active.stake));
  }

  addChip(value, balance) {
    const a = this.active;
    if (!a) return false;
    a.stake = Math.max(0, Math.min(Math.floor(a.stake + value), this._room(balance)));
    return true;
  }

  halve() {
    const a = this.active;
    if (!a) return false;
    const half = Math.floor(a.stake / 2);
    a.stake = half < 1 ? 0 : half;
    return true;
  }

  clearActive() {
    const a = this.active;
    if (!a) return false;
    a.stake = 0;
    return true;
  }

  allIn(balance) {
    const a = this.active;
    if (!a) return false;
    a.stake = this._room(balance);
    return true;
  }

  static outlook(entries) {
    const total = entries.reduce((s, e) => s + e.stake, 0);
    let losing = 0;
    let paying = 0;
    let best = 0;
    for (let n = 0; n < POCKETS; n++) {
      const ret = BettingSystem.roundReturn(entries, n);
      if (ret < total) losing++;
      if (ret > 0) paying++;
      best = Math.max(best, ret);
    }
    return {
      total,
      lossProbability: losing / POCKETS,
      payoutProbability: paying / POCKETS,
      bestReturn: best
    };
  }
}
