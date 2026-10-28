/**
 * Balance and stake bookkeeping (simulated COP, integers only).
 * Invariants: 0 ≤ stake ≤ balance (while betting), balance ≥ 0, both integers.
 */
export default class MoneyManager {
  constructor(initialBalance) {
    this.initialBalance = initialBalance;
    this.reset();
  }

  reset() {
    this.balance = this.initialBalance;
    this.stake = 0;
  }

  _clampStake(v) {
    const n = Math.floor(Number.isFinite(v) ? v : 0);
    return Math.max(0, Math.min(n, this.balance));
  }

  addChip(value) {
    this.stake = this._clampStake(this.stake + value);
  }

  halve() {
    const half = Math.floor(this.stake / 2);
    this.stake = half < 1 ? 0 : half;
  }

  clearStake() {
    this.stake = 0;
  }

  allIn() {
    this.stake = this.balance;
  }

  /** Validates a wager of `amount` against the current balance. */
  canAfford(amount) {
    return Number.isInteger(amount) && amount > 0 && amount <= this.balance;
  }

  /** Removes the stake from the balance. Caller guarantees this runs once per bet. */
  deduct(amount) {
    if (!this.canAfford(amount)) throw new Error('Invalid deduction');
    this.balance -= amount;
  }

  credit(amount) {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('Invalid credit');
    this.balance += amount;
  }
}
