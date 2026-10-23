import { Stage } from './scene.js';
import { Hud, formulaString, COUNT_ROW, LINE_H, ledgerHeight } from './hud.js';
import { drawBackdrop } from './backdrop.js';
import { Game } from './game.js';
import { selfTest, LEVELS } from './polyhedra.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const backdrop = $('backdrop');
const stage = new Stage($('scene'));
const hud = new Hud($('hud'));

const SIGN_ROW = 40; // CSS px: height of the sign buttons under the ledger
const BTN_ROWS = 80; // CSS px: room for the button bar wrapped onto two rows

// Low-res layout shared by every layer. PX is the size of one "fat pixel" in CSS
// pixels; everything except the DOM buttons is drawn at 1/PX resolution.
function computeLayout() {
  const cw = window.innerWidth, ch = window.innerHeight;
  const PX = Math.max(1, Math.round(Math.min(cw / 500, ch / 290)));
  const W = Math.ceil(cw / PX), H = Math.ceil(ch / PX);
  // Narrow screens wrap the longest narration pages onto a fifth line.
  const nh = 12 + (W < 440 ? 5 : 4) * LINE_H;
  const narr = { x: 8, y: H - nh - 8, w: W - 16, h: nh };
  const portrait = H > W;
  const counts = { x: 8, y: 28, w: 62, h: 22 + 3 * COUNT_ROW };
  const ledger = { x: W - 168, y: portrait ? 28 : 8, w: 160 };
  let left, right, top, bottom;
  if (portrait) {
    // The count panel and ledger share a header row, and the shape gets the full
    // width below it, clear of the ledger at its final size and of the buttons.
    left = 8;
    right = W - 8;
    top = ledger.y + ledgerHeight(LEVELS.length + 1) + 5 + SIGN_ROW / PX;
    bottom = narr.y - BTN_ROWS / PX;
  } else {
    // The shape fills the column between the count panel and the ledger.
    left = counts.x + counts.w;
    right = ledger.x;
    top = 30;
    bottom = narr.y;
  }
  const r = Math.max(20, Math.min((bottom - top) / 2.3, (right - left) / 2.3));
  const stageBox = { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2), r, w: right - left };
  return { PX, W, H, narr, counts, ledger, stage: stageBox };
}

const ui = {
  bar: $('btnbar'),
  formula: $('formula'),
  signButtons: [],
  onSign: null,

  setButtons(list) {
    this.bar.replaceChildren(...list.map((b) => {
      const el = document.createElement('button');
      el.className = `btn ${b.kind || ''}`;
      el.textContent = b.label;
      el.disabled = !!b.disabled;
      el.addEventListener('click', () => {
        sfx.click();
        b.onClick();
      });
      return el;
    }));
  },

  setFormula({ visible, enabled, signs, rows }) {
    if (visible !== undefined) this.formula.hidden = !visible;
    if (rows !== undefined) {
      this.rows = rows;
      this.placeFormula();
    }
    if (enabled !== undefined) this.signButtons.forEach((b) => (b.disabled = !enabled));
    if (signs) {
      ['V', 'E', 'F'].forEach((letter, i) => {
        const b = this.signButtons[i];
        b.textContent = `${signs[i] < 0 ? '-' : '+'}${letter}`;
        b.classList.toggle('neg', signs[i] < 0);
      });
      this.formula.title = formulaString(signs);
    }
  },

  layout(L) {
    document.documentElement.style.setProperty('--px', `${L.PX}px`);
    Object.assign(this.bar.style, {
      right: `${window.innerWidth - (L.W - 8) * L.PX}px`,
      bottom: `${window.innerHeight - (L.narr.y - 3) * L.PX}px`,
    });
    this.L = L;
    this.placeFormula();
  },

  // Sits just under the ledger box, which grows by one line per shape.
  placeFormula() {
    const L = this.L, rows = this.rows || 1;
    Object.assign(this.formula.style, {
      left: `${L.ledger.x * L.PX}px`,
      top: `${(L.ledger.y + ledgerHeight(rows) + 5) * L.PX}px`,
      width: `${L.ledger.w * L.PX}px`,
    });
    // On phones the ledger is too narrow for the label plus full-size buttons.
    this.formula.classList.toggle('narrow', L.ledger.w * L.PX < 300);
  },
};

const label = document.createElement('span');
label.textContent = 'SIGNS';
ui.formula.append(label);
for (let i = 0; i < 3; i++) {
  const b = document.createElement('button');
  b.className = 'btn sign';
  b.addEventListener('click', () => ui.onSign && ui.onSign(i));
  ui.signButtons.push(b);
  ui.formula.append(b);
}

function resize() {
  const L = computeLayout();
  drawBackdrop(backdrop, L);
  stage.resize(L);
  hud.resize(L);
  ui.layout(L);
}

window.addEventListener('resize', resize);
resize();

const game = new Game({ stage, hud, ui });
window.__eulerSelfTest = selfTest;
window.__game = game;

// Wait for the pixel font so the first canvas text isn't drawn in a fallback.
document.fonts.load('8px "Press Start 2P"').catch(() => {}).finally(() => {
  game.start();
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stage.update(dt);
    stage.render();
    hud.draw(game, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
