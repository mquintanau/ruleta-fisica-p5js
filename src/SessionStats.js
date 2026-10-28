/** Per-session counters, updated exactly once per resolved spin. */
export default class SessionStats {
  constructor(initialBalance) {
    this.initialBalance = initialBalance;
    this.reset();
  }

  reset() {
    this.spins = 0;
    this.wins = 0;
    this.losses = 0;
    this.totalWagered = 0;
    this.totalReturned = 0;
    this.biggestWin = 0;
    this.resolvedRounds = new Set();
  }

  /** Returns false (and changes nothing) if the round was already recorded. */
  record(roundId, stake, returned) {
    if (this.resolvedRounds.has(roundId)) return false;
    this.resolvedRounds.add(roundId);
    this.spins++;
    this.totalWagered += stake;
    this.totalReturned += returned;
    if (returned > 0) {
      this.wins++;
      this.biggestWin = Math.max(this.biggestWin, returned - stake);
    } else {
      this.losses++;
    }
    return true;
  }

  summary(currentBalance) {
    return {
      initialBalance: this.initialBalance,
      finalBalance: currentBalance,
      spins: this.spins,
      wins: this.wins,
      losses: this.losses,
      totalWagered: this.totalWagered,
      totalReturned: this.totalReturned,
      net: currentBalance - this.initialBalance,
      biggestWin: this.biggestWin
    };
  }
}
