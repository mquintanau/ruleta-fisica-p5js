export default class MoneyManager {
  constructor(initialBalance) {
    this.initialBalance = initialBalance;
    this.reset();
  }

  reset() {
    this.balance = this.initialBalance;
  }

  canAfford(amount) {
    return Number.isInteger(amount) && amount > 0 && amount <= this.balance;
  }

  deduct(amount) {
    if (!this.canAfford(amount)) throw new Error('Invalid deduction');
    this.balance -= amount;
  }

  credit(amount) {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('Invalid credit');
    this.balance += amount;
  }
}
