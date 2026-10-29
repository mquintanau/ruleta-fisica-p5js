/**
 * Balance bookkeeping (simulated COP, integers only). Stakes live in BetSlip.
 * Invariant: balance is an integer ≥ 0.
 */
export default class MoneyManager {
  constructor(initialBalance) {
    this.initialBalance = initialBalance;
    this.reset();
  }

  reset() {
    this.balance = this.initialBalance;
  }

  /** Validates a wager of `amount` against the current balance. */
  canAfford(amount) {
    return Number.isInteger(amount) && amount > 0 && amount <= this.balance;
  }

  /** Removes the stake from the balance. Caller guarantees this runs once per round. */
  deduct(amount) {
    if (!this.canAfford(amount)) throw new Error('Invalid deduction');
    this.balance -= amount;
  }

  credit(amount) {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('Invalid credit');
    this.balance += amount;
  }
}
