import { STATES } from './GameState.js';
import { formatCOP, formatSignedCOP, formatPercent } from './utils/format.js';
import { colorOf, colorLabel } from './utils/rouletteData.js';
import { RULES } from './config.js';
import BetSlip from './BetSlip.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const $ = (id) => document.getElementById(id);

/**
 * DOM side of the interface: balance, bet info, stake, the three action
 * buttons, result card, history and the menu / retired / game-over overlays.
 * It never changes game data; it renders snapshots and forwards clicks.
 */
export default class UIManager {
  constructor(handlers) {
    this.handlers = handlers;
    this.el = {
      balance: $('balance'),
      sessionNet: $('sessionNet'),
      history: $('history'),
      betName: $('betName'),
      betNumbers: $('betNumbers'),
      stake: $('stake'),
      chips: $('chips'),
      betCount: $('betCount'),
      betList: $('betList'),
      btnClearBets: $('btnClearBets'),
      totalStake: $('totalStake'),
      bestReturn: $('bestReturn'),
      payoutProb: $('payoutProb'),
      btnPlace: $('btnPlace'),
      btnSpin: $('btnSpin'),
      btnRetire: $('btnRetire'),
      status: $('status'),
      resultBody: $('resultBody'),
      resultCard: $('resultCard'),
      overlay: $('overlay'),
      modal: $('modal'),
      toast: $('toast')
    };
    this.toastTimer = null;
    this._lastBalance = null;

    this._onPlace = () => handlers.onPlace();
    this._onSpin = () => handlers.onSpin();
    this._onRetire = () => handlers.onRetire();
    this._onClearBets = () => handlers.onClearBets();
    this._onBetList = (e) => {
      const rm = e.target.closest('[data-remove]');
      if (rm) return handlers.onRemoveBet(rm.dataset.remove);
      const row = e.target.closest('[data-key]');
      if (row) handlers.onSelectBet(row.dataset.key);
    };
    this._onModal = (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const fn = { start: handlers.onStart, again: handlers.onPlayAgain, menu: handlers.onMainMenu }[b.dataset.action];
      if (fn) fn();
    };
    this.el.btnPlace.addEventListener('click', this._onPlace);
    this.el.btnSpin.addEventListener('click', this._onSpin);
    this.el.btnRetire.addEventListener('click', this._onRetire);
    this.el.btnClearBets.addEventListener('click', this._onClearBets);
    this.el.betList.addEventListener('click', this._onBetList);
    this.el.modal.addEventListener('click', this._onModal);
  }

  destroy() {
    this.el.btnPlace.removeEventListener('click', this._onPlace);
    this.el.btnSpin.removeEventListener('click', this._onSpin);
    this.el.btnRetire.removeEventListener('click', this._onRetire);
    this.el.btnClearBets.removeEventListener('click', this._onClearBets);
    this.el.betList.removeEventListener('click', this._onBetList);
    this.el.modal.removeEventListener('click', this._onModal);
    clearTimeout(this.toastTimer);
  }

  // ---------------------------------------------------------------- render

  render(v) {
    const S = STATES;
    const e = this.el;

    // Balance (+ a short pulse when it changes)
    e.balance.textContent = formatCOP(v.balance);
    if (this._lastBalance !== null && this._lastBalance !== v.balance) {
      e.balance.classList.remove('pulse-up', 'pulse-down');
      void e.balance.offsetWidth;
      e.balance.classList.add(v.balance > this._lastBalance ? 'pulse-up' : 'pulse-down');
    }
    this._lastBalance = v.balance;
    const net = v.balance + (v.pendingStake || 0) - RULES.initialBalance;
    e.sessionNet.textContent = `Session ${formatSignedCOP(net)}`;
    e.sessionNet.className = `net ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}`;

    // Active zone (the one the chip buttons act on)
    const active = v.bets.find((b) => b.bet.key === v.activeKey) || null;
    if (active) {
      const bet = active.bet;
      const covers = bet.numbers.length <= 6 ? bet.numbers.join(', ') : `${bet.numbers.length} numbers`;
      e.betName.textContent = bet.name;
      e.betNumbers.textContent = `Covers ${covers} · pays ${bet.payout}:1 · wins ${formatPercent(bet.probability)}`;
      e.stake.textContent = formatCOP(active.stake);
    } else {
      e.betName.textContent = v.editable ? 'No zone selected' : 'Bets closed';
      e.betNumbers.textContent = v.editable
        ? (v.bets.length ? 'Click a zone on the felt or in the list to edit its chips.' : 'Click a number, a line or a corner on the table.')
        : 'Your bets are locked in for this spin.';
      e.stake.textContent = '—';
    }

    // Bet list and round totals
    this._renderBetList(v.bets, v.activeKey, v.editable);
    const placed = v.bets.filter((b) => b.stake > 0);
    const outlook = BetSlip.outlook(placed);
    e.betCount.textContent = placed.length ? `(${placed.length})` : '';
    e.btnClearBets.disabled = !v.editable || !v.bets.length;
    e.totalStake.textContent = placed.length ? formatCOP(outlook.total) : '—';
    e.bestReturn.textContent = placed.length ? formatCOP(outlook.bestReturn) : '—';
    e.payoutProb.textContent = placed.length ? formatPercent(outlook.payoutProbability) : '—';
    e.totalStake.className = outlook.total > v.balance && v.editable ? 'neg' : '';

    // Buttons
    const ready = v.state === S.READY;
    const placeOk = ready && placed.length > 0 && Number.isInteger(outlook.total) && outlook.total <= v.balance;
    e.btnPlace.disabled = !placeOk;
    e.btnSpin.disabled = !(v.state === S.BET_PLACED && v.spinUnlocked);
    const retireOk = ready || ((v.state === S.SPINNING || v.state === S.RESULT) && !v.retirePending);
    e.btnRetire.disabled = !retireOk;
    e.btnRetire.textContent = v.retirePending ? 'Cash-out pending…' : 'Retire / Cash out';
    e.btnSpin.classList.toggle('glow', v.state === S.BET_PLACED && v.spinUnlocked);
    e.btnSpin.classList.toggle('waiting', v.state === S.BET_PLACED && !v.spinUnlocked);

    // Status hint
    let status = '';
    let cls = '';
    switch (v.state) {
      case S.READY:
        if (!v.bets.length) status = 'Choose a zone on the felt.';
        else if (active && active.stake <= 0) status = 'Add chips to the selected zone.';
        else if (!placed.length) status = 'Add chips to at least one zone.';
        else status = 'Add another zone, or press Place bet to confirm all bets.';
        break;
      case S.BET_PLACED:
        status = v.spinUnlocked ? 'Ready to spin.' : 'Processing payment… Spin is locked.';
        cls = v.spinUnlocked ? 'ok' : 'wait';
        break;
      case S.SPINNING:
        status = v.retirePending ? 'Spinning… you will cash out after this result.' : 'No more bets — the ball is rolling.';
        cls = 'wait';
        break;
      case S.RESULT:
        status = v.retirePending ? 'Result settled. Cashing out…' : 'Result settled. Next round in a moment…';
        break;
      default:
        status = '';
    }
    e.status.textContent = status;
    e.status.className = `status ${cls}`;

    this._renderResult(v.lastResult, v.state === S.RESULT);
    this._renderHistory(v.history);
  }

  _renderBetList(bets, activeKey, editable) {
    const key = JSON.stringify([bets.map((b) => [b.bet.key, b.stake]), activeKey, editable]);
    if (key === this._betListKey) return;
    this._betListKey = key;
    if (!bets.length) {
      this.el.betList.innerHTML = '<div class="bet-empty">No bets yet — pick zones on the table. You can bet on several (e.g. Odd and Red).</div>';
      return;
    }
    this.el.betList.innerHTML = bets.map((b) => {
      const k = esc(b.bet.key);
      const cls = ['bet-row', b.bet.key === activeKey ? 'active' : '', b.stake ? '' : 'zero', editable ? '' : 'locked'].join(' ');
      return `<div class="${cls}" data-key="${k}">
          <div><div class="bet-row-name">${esc(b.bet.name)}</div>
          <div class="bet-row-sub">${b.bet.numbers.length <= 6 ? esc(b.bet.numbers.join(', ')) : `${b.bet.numbers.length} numbers`} · ${b.bet.payout}:1</div></div>
          <div class="bet-row-stake">${formatCOP(b.stake)}</div>
          ${editable ? `<button class="bet-remove" type="button" data-remove="${k}" title="Remove this bet">×</button>` : '<span></span>'}
        </div>`;
    }).join('');
  }

  _renderResult(r, fresh) {
    const e = this.el;
    e.resultCard.classList.toggle('fresh', !!fresh);
    if (!r) {
      e.resultBody.innerHTML = '<span class="muted">No spins yet.</span>';
      e.resultCard.classList.remove('win', 'loss');
      return;
    }
    e.resultCard.classList.toggle('win', r.win);
    e.resultCard.classList.toggle('loss', !r.win);
    e.resultBody.innerHTML = `
      <div class="result-head">
        <span class="pill ${colorOf(r.number)}">${r.number}</span>
        <div><div class="result-title">${r.number} ${colorLabel(r.number)}</div>
        <div class="result-sub">${r.net > 0 ? 'You win!' : r.net === 0 ? 'Break even' : 'You lose'} · ${r.bets.length} bet${r.bets.length > 1 ? 's' : ''}</div></div>
      </div>
      <div class="result-bets">${r.bets.map((b) => `<div class="${b.returned > 0 ? 'won' : 'lost'}">
        <span>${b.returned > 0 ? '✓' : '✗'} ${esc(b.bet.name)}</span><span>${formatCOP(b.stake)} → ${formatCOP(b.returned)}</span></div>`).join('')}</div>
      <dl class="kv">
        <dt>Stake</dt><dd>${formatCOP(r.stake)}</dd>
        <dt>Payout</dt><dd>${formatCOP(r.returned)}</dd>
        <dt>Net</dt><dd class="${r.net >= 0 ? 'pos' : 'neg'}">${formatSignedCOP(r.net)}</dd>
        <dt>Balance</dt><dd>${formatCOP(r.balance)}</dd>
      </dl>`;
  }

  _renderHistory(history) {
    const key = history.join(',');
    if (key === this._historyKey) return;
    this._historyKey = key;
    this.el.history.innerHTML = history.length
      ? history.map((n, i) => `<span class="pill ${colorOf(n)} ${i === 0 ? 'latest' : ''}">${n}</span>`).join('')
      : '<span class="muted small">—</span>';
  }

  // -------------------------------------------------------------- overlays

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  hideOverlay() {
    this.el.overlay.classList.add('hidden');
  }

  showMenu() {
    this.el.modal.innerHTML = `
      <div class="modal-logo">◉</div>
      <h1>Ruleta <span>Física</span></h1>
      <p class="lead">European roulette with a Matter.js ball, a live reaction cam and a fictional cortisol meter.</p>
      <ul class="how">
        <li>Click the felt: <b>cell</b> = straight, <b>line</b> = split / street, <b>corner</b> = corner / six line.</li>
        <li>Pick a zone and add chips to it. Pick more zones to bet on several at once (e.g. Odd and Red).</li>
        <li><b>Place bet</b> pays for all your bets with your TuLlave.</li>
        <li><b>Spin</b> unlocks when the payment is approved. Cash out any time between rounds.</li>
      </ul>
      <div class="start-balance">Starting balance <b>${formatCOP(RULES.initialBalance)}</b></div>
      <button class="btn btn-spin big" data-action="start">Start session</button>
      <p class="fine">Simulated in-game currency only. No real money involved.</p>`;
    this.el.overlay.classList.remove('hidden');
  }

  showSummary(kind, s) {
    const title = kind === 'gameover' ? 'Game over' : 'You cashed out';
    const sub = kind === 'gameover'
      ? 'Your balance reached COP $0. The house always has the edge.'
      : 'Session closed. Here is how it went.';
    const rows = [
      ['Initial balance', formatCOP(s.initialBalance)],
      ['Final balance', formatCOP(s.finalBalance)],
      ['Spins', s.spins],
      ['Winning / losing bets', `${s.wins} / ${s.losses}`],
      ['Total wagered', formatCOP(s.totalWagered)],
      ['Total returned', formatCOP(s.totalReturned)],
      ['Net change', `<span class="${s.net >= 0 ? 'pos' : 'neg'}">${formatSignedCOP(s.net)}</span>`]
    ];
    this.el.modal.innerHTML = `
      <div class="modal-logo ${kind}">${kind === 'gameover' ? '✕' : '✓'}</div>
      <h1>${title}</h1>
      <p class="lead">${sub}</p>
      <div class="final">${formatCOP(s.finalBalance)}</div>
      <dl class="kv summary">${rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>
      <div class="modal-actions">
        <button class="btn btn-spin" data-action="again">Play again</button>
        <button class="btn btn-ghost" data-action="menu">Main menu</button>
      </div>`;
    this.el.overlay.classList.remove('hidden');
  }
}
