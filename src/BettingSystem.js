import { RED_NUMBERS, POCKETS } from './utils/rouletteData.js';

/** Bet catalogue: European payouts (profit : stake). */
const TYPES = {
  straight: { payout: 35, title: 'Straight up', es: 'Pleno' },
  split: { payout: 17, title: 'Split', es: 'Caballo' },
  street: { payout: 11, title: 'Street', es: 'Transversal' },
  corner: { payout: 8, title: 'Corner', es: 'Cuadro' },
  sixline: { payout: 5, title: 'Six line', es: 'Línea doble' },
  trio: { payout: 11, title: 'Trio', es: 'Trío' },
  firstfour: { payout: 8, title: 'First four', es: 'Primeros cuatro' },
  dozen: { payout: 2, title: 'Dozen', es: 'Docena' },
  column: { payout: 2, title: 'Column', es: 'Columna' },
  red: { payout: 1, title: 'Red', es: 'Rojo' },
  black: { payout: 1, title: 'Black', es: 'Negro' },
  odd: { payout: 1, title: 'Odd', es: 'Impar' },
  even: { payout: 1, title: 'Even', es: 'Par' },
  low: { payout: 1, title: '1-18', es: 'Falta' },
  high: { payout: 1, title: '19-36', es: 'Pasa' }
};

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/**
 * Pure betting rules: builds bet descriptors and settles them.
 * Geometry (where a bet sits on the felt) is attached by BettingTable.
 */
export default class BettingSystem {
  static get types() {
    return TYPES;
  }

  /**
   * @param {string} type   key of TYPES
   * @param {number[]} numbers numbers covered by the bet
   * @param {object} [extra] { suffix } optional label override
   */
  static create(type, numbers, extra = {}) {
    const def = TYPES[type];
    if (!def) throw new Error(`Unknown bet type ${type}`);
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const label = extra.label ?? BettingSystem._defaultLabel(type, sorted);
    return {
      type,
      numbers: sorted,
      payout: def.payout,
      probability: sorted.length / POCKETS,
      name: `${def.title} (${def.es})`,
      label,
      key: `${type}:${sorted.join('-')}`
    };
  }

  static _defaultLabel(type, nums) {
    switch (type) {
      case 'sixline':
      case 'dozen':
      case 'low':
      case 'high':
        return `${nums[0]}–${nums[nums.length - 1]}`;
      case 'column':
        return `${nums[0]}, ${nums[1]}, ${nums[2]} … ${nums[nums.length - 1]}`;
      case 'red':
      case 'black':
      case 'odd':
      case 'even':
        return `${nums.length} numbers`;
      default:
        return nums.join(' · ');
    }
  }

  // Outside bet factories --------------------------------------------------
  static dozen(i) {
    const b = BettingSystem.create('dozen', range(i * 12 + 1, i * 12 + 12));
    b.name = `${['1st', '2nd', '3rd'][i]} dozen (Docena)`;
    return b;
  }

  /** col 0 holds 1,4,…,34; col 2 holds 3,6,…,36. */
  static column(col) {
    const nums = range(0, 11).map((k) => k * 3 + col + 1);
    const b = BettingSystem.create('column', nums);
    b.name = `${['1st', '2nd', '3rd'][col]} column · 2 to 1 (Columna)`;
    return b;
  }

  static evenMoney(kind) {
    const all = range(1, 36);
    const filters = {
      red: (n) => RED_NUMBERS.has(n),
      black: (n) => !RED_NUMBERS.has(n),
      odd: (n) => n % 2 === 1,
      even: (n) => n % 2 === 0,
      low: (n) => n <= 18,
      high: (n) => n >= 19
    };
    return BettingSystem.create(kind, all.filter(filters[kind]));
  }

  // Settlement -------------------------------------------------------------
  static wins(bet, number) {
    // Zero is never part of an outside bet, so it loses all of them.
    return bet.numbers.includes(number);
  }

  /** Total returned to the player (stake + profit) — 0 on a loss. */
  static totalReturn(bet, stake, number) {
    return BettingSystem.wins(bet, number) ? stake * (bet.payout + 1) : 0;
  }
}
