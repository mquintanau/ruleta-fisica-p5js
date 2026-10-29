import { RULES } from './config.js';

/**
 * Stake buttons: +10.000 +50.000 +100.000 +500.000 ½ Clear All in.
 * They only report the action; Game applies it to the active bet zone.
 */
export default class ChipControls {
  constructor(container, onAction) {
    this.container = container;
    this.onAction = onAction; // (action: 'add'|'half'|'clear'|'allin', value?) => void
    this.buttons = [];

    const fmt = new Intl.NumberFormat('es-CO');
    const defs = [
      ...RULES.chipValues.map((v) => ({ label: `+${fmt.format(v)}`, cls: `chip chip-${v}`, action: 'add', value: v })),
      { label: '½', cls: 'chip chip-op', action: 'half', title: 'Halve the stake on the selected zone' },
      { label: 'Clear', cls: 'chip chip-op', action: 'clear', title: 'Remove the chips from the selected zone' },
      { label: 'All in', cls: 'chip chip-allin', action: 'allin', title: 'Put the rest of your balance on the selected zone' }
    ];
    this._onClick = (e) => {
      const btn = e.target.closest('button[data-idx]');
      if (!btn || btn.disabled) return;
      const d = defs[Number(btn.dataset.idx)];
      if (this.onAction) this.onAction(d.action, d.value);
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
