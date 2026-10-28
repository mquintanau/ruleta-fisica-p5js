import { RULES } from './config.js';

/**
 * Stake buttons: +10.000 +50.000 +100.000 +500.000 ½ Clear All in.
 * They only call MoneyManager; they never touch the balance.
 */
export default class ChipControls {
  constructor(container, money, onChange) {
    this.container = container;
    this.money = money;
    this.onChange = onChange;
    this.buttons = [];

    const fmt = new Intl.NumberFormat('es-CO');
    const defs = [
      ...RULES.chipValues.map((v) => ({ label: `+${fmt.format(v)}`, cls: `chip chip-${v}`, act: () => money.addChip(v) })),
      { label: '½', cls: 'chip chip-op', act: () => money.halve(), title: 'Halve the stake' },
      { label: 'Clear', cls: 'chip chip-op', act: () => money.clearStake() },
      { label: 'All in', cls: 'chip chip-allin', act: () => money.allIn() }
    ];
    this._onClick = (e) => {
      const btn = e.target.closest('button[data-idx]');
      if (!btn || btn.disabled) return;
      defs[Number(btn.dataset.idx)].act();
      if (this.onChange) this.onChange();
    };
    defs.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = d.cls;
      b.textContent = d.label;
      b.dataset.idx = String(i);
      if (d.title) b.title = d.title;
      container.appendChild(b);
      this.buttons.push(b);
    });
    container.addEventListener('click', this._onClick);
  }

  setEnabled(on) {
    for (const b of this.buttons) b.disabled = !on;
  }

  destroy() {
    this.container.removeEventListener('click', this._onClick);
    this.container.innerHTML = '';
    this.buttons = [];
  }
}
