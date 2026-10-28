import Game from './Game.js';
import { CANVAS } from './config.js';

const stage = document.getElementById('stage');
let game = null;
let canvasEl = null;

/** Scale the fixed-size logical canvas to fit the stage, keeping its aspect ratio. */
function fitCanvas() {
  if (!canvasEl) return;
  const s = Math.min(stage.clientWidth / CANVAS.width, stage.clientHeight / CANVAS.height);
  canvasEl.style.width = `${Math.floor(CANVAS.width * s)}px`;
  canvasEl.style.height = `${Math.floor(CANVAS.height * s)}px`;
}

const sketch = (p) => {
  p.setup = () => {
    const c = p.createCanvas(CANVAS.width, CANVAS.height);
    c.parent(stage);
    canvasEl = c.elt;
    p.frameRate(60);
    p.textFont('Outfit');
    game = new Game(p, canvasEl);
    window.__game = game; // handy for debugging from the console
    window.addEventListener('pagehide', (e) => {
      if (e.persisted) return; // kept in the back/forward cache: leave it running
      p.noLoop();
      game.destroy();
    });
    fitCanvas();
  };

  p.draw = () => {
    game.update(p.deltaTime);
    game.draw();
  };
};

// Wait (briefly) for the UI font so text cached into p5.Graphics uses it.
async function start() {
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    await Promise.race([Promise.all([
      document.fonts.load('700 16px Outfit'),
      document.fonts.load('400 16px Outfit')
    ]), timeout]);
  } catch (err) {
    console.warn('Font loading failed, using fallback font', err);
  }
  // Exactly one p5 instance (and therefore one draw loop) for the page.
  if (!window.__rouletteP5) {
    window.__rouletteP5 = new window.p5(sketch);
    new ResizeObserver(fitCanvas).observe(stage);
  }
}

start();
