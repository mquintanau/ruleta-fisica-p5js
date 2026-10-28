/**
 * Centralised state machine. Every state change goes through transition(),
 * which rejects anything not listed in TRANSITIONS.
 *
 * MENU is an addition to the specified states: it is the title screen shown
 * before the first session and when the player picks "Main menu".
 */
export const STATES = Object.freeze({
  MENU: 'MENU',
  READY: 'READY',
  BET_PLACED: 'BET_PLACED',
  SPINNING: 'SPINNING',
  RESULT: 'RESULT',
  RETIRED: 'RETIRED',
  GAME_OVER: 'GAME_OVER'
});

const S = STATES;
const TRANSITIONS = {
  [S.MENU]: [S.READY],
  [S.READY]: [S.BET_PLACED, S.RETIRED],
  [S.BET_PLACED]: [S.SPINNING], // no way out except spinning: no refunds, no retiring
  [S.SPINNING]: [S.RESULT],
  [S.RESULT]: [S.READY, S.GAME_OVER, S.RETIRED],
  [S.RETIRED]: [S.READY, S.MENU],
  [S.GAME_OVER]: [S.READY, S.MENU]
};

export default class GameState {
  constructor() {
    this.state = S.MENU;
    this.spinUnlocked = false;
    this.retirePending = false;
    this.listeners = new Set();
  }

  is(...states) {
    return states.includes(this.state);
  }

  canTransition(to) {
    return TRANSITIONS[this.state].includes(to);
  }

  transition(to) {
    if (!this.canTransition(to)) {
      console.warn(`[GameState] rejected ${this.state} → ${to}`);
      return false;
    }
    const from = this.state;
    this.state = to;
    if (to === S.BET_PLACED) this.spinUnlocked = false;
    if (to === S.READY) {
      this.spinUnlocked = false;
      this.retirePending = false;
    }
    for (const fn of this.listeners) fn(to, from);
    return true;
  }

  /** Spin is only possible in BET_PLACED after the card animation unlocked it. */
  canSpin() {
    return this.state === S.BET_PLACED && this.spinUnlocked;
  }

  unlockSpin() {
    if (this.state !== S.BET_PLACED || this.spinUnlocked) return false;
    this.spinUnlocked = true;
    return true;
  }

  /** Retire is immediate in READY, deferred in SPINNING/RESULT, refused otherwise. */
  canRequestRetire() {
    return (this.state === S.READY || this.state === S.SPINNING || this.state === S.RESULT) && !this.retirePending;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
