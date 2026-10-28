import { STATES } from './GameState.js';
import { formatCOP, formatSignedCOP, formatPercent } from './utils/format.js';
import { colorOf, colorLabel } from './utils/rouletteData.js';
import { RULES } from './config.js';

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
      betPayout: $('betPayout'),
      betProb: $('betProb'),
      stake: $('stake'),
      chips: $('chips'),
      potential: $('potential'),
      profit: $('profit'),
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
    this._onModal = (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const fn = { start: handlers.onStart, again: handlers.onPlayAgain, menu: handlers.onMainMenu }[b.dataset.action];
      if (fn) fn();
    };
    this.el.btnPlace.addEventListener('click', this._onPlace);
    this.el.btnSpin.addEventListener('click', this._onSpin);
    this.el.btnRetire.addEventListener('click', this._onRetire);
    this.el.modal.addEventListener('click', this._onModal);
  }

  destroy() {
    this.el.btnPlace.removeEventListener('click', this._onPlace);
    this.el.btnSpin.removeEventListener('click', this._onSpin);
    this.el.btnRetire.removeEventListener('click', this._onRetire);
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

    // Selected bet
    const bet = v.bet;
    if (bet) {
      e.betName.textContent = bet.name;
      e.betNumbers.textContent = bet.numbers.length <= 6 ? `Covers ${bet.numbers.join(', ')}` : `Covers ${bet.numbers.length} numbers · ${bet.label}`;
      e.betPayout.textContent = `${bet.payout}:1`;
      e.betProb.textContent = `${formatPercent(bet.probability)} (${bet.numbers.length}/37)`;
    } else {
      e.betName.textContent = 'No bet selected';
      e.betNumbers.textContent = 'Click a number, a line or a corner on the table.';
      e.betPayout.textContent = '—';
      e.betProb.textContent = '—';
    }

    // Stake and potential payout
    e.stake.textContent = formatCOP(v.stake);
    if (bet && v.stake > 0) {
      e.potential.textContent = formatCOP(v.stake * (bet.payout + 1));
      e.profit.textContent = formatSignedCOP(v.stake * bet.payout);
    } else {
      e.potential.textContent = '—';
      e.profit.textContent = '—';
    }

    // Buttons
    const ready = v.state === S.READY;
    const placeOk = ready && !!bet && Number.isInteger(v.stake) && v.stake > 0 && v.stake <= v.balance;
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
        if (!bet) status = 'Choose a zone on the felt.';
        else if (v.stake <= 0) status = 'Add chips to set your stake.';
        else status = 'Press Place bet to confirm. Spin unlocks after payment.';
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
        <div class="result-sub">${r.win ? 'You win!' : 'You lose'} · ${r.bet.name}</div></div>
      </div>
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
        <li>Build your stake with the chips, then <b>Place bet</b> and tap your TuLlave.</li>
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
      ['Wins / losses', `${s.wins} / ${s.losses}`],
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
