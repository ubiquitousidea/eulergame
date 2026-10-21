// Everything textual or diagrammatic is drawn on a low-resolution canvas so it
// is pixelated along with the scene. Only the DOM buttons stay crisp.

const FONT = '"Press Start 2P", monospace';
const TYPES = ['vertices', 'edges', 'faces'];
export const TYPE_COL = { vertices: '#6fe3ff', edges: '#ffd34d', faces: '#ff6fae' };
const LETTER = { vertices: 'V', edges: 'E', faces: 'F' };
const LABEL = { vertices: 'VERTICES', edges: 'EDGES', faces: 'FACES' };
const LINE_H = 11;
const TYPE_SPEED = 90; // characters per second

export function formulaString(signs) {
  const [a, b, c] = signs;
  return `${a < 0 ? '-' : ''}V${b < 0 ? '-' : '+'}E${c < 0 ? '-' : '+'}F`;
}

export function evalRow(row, signs) {
  return signs[0] * row.V + signs[1] * row.E + signs[2] * row.F;
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.text = '';
    this.typed = 0;
    this.flying = [];
    this.toasts = [];
    this.resetCounts();
  }

  resize(L) {
    this.L = L;
    this.canvas.width = L.W;
    this.canvas.height = L.H;
    this.canvas.style.width = `${L.W * L.PX}px`;
    this.canvas.style.height = `${L.H * L.PX}px`;
  }

  say(text) {
    this.text = text;
    this.typed = 0;
  }

  get typing() {
    return this.typed < this.text.length;
  }

  finishTyping() {
    this.typed = this.text.length;
  }

  resetCounts() {
    this.shown = { vertices: 0, edges: 0, faces: 0 };
    this.bump = { vertices: 0, edges: 0, faces: 0 };
    this.flying = [];
  }

  tube(type) {
    const Q = this.L.quiver;
    const i = TYPES.indexOf(type);
    const x = Q.x + 4 + i * 25;
    return { x, w: 18, top: Q.y + 34, bot: Q.y + Q.h - 16 };
  }

  // Shoot an arrow from an element on screen into its quiver.
  fly(type, from) {
    const t = this.tube(type);
    this.flying.push({ type, from, to: { x: t.x + t.w / 2, y: t.top - 12 }, t: 0 });
  }

  toast(text, pos, color = '#fff') {
    this.toasts.push({ text, x: pos.x, y: pos.y, t: 0, color });
  }

  txt(s, x, y, color = '#fff', size = 8, align = 'left') {
    const c = this.ctx;
    c.font = `${size}px ${FONT}`;
    c.textAlign = align;
    c.fillStyle = 'rgba(0,0,0,0.75)';
    c.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
    c.fillStyle = color;
    c.fillText(s, Math.round(x), Math.round(y));
  }

  draw(g, dt) {
    const c = this.ctx;
    c.clearRect(0, 0, this.L.W, this.L.H);
    c.textBaseline = 'top';
    this.typed = Math.min(this.text.length, this.typed + dt * TYPE_SPEED);

    this.drawStatus(g);
    this.drawQuiver(g, dt);
    if (g.ledger.length) this.drawLedger(g);
    this.drawStageText(g);
    this.drawFlying(dt);
    this.drawToasts(dt);
    this.drawNarration();
  }

  drawStatus(g) {
    if (!g.shape || g.state === 'intro') {
      this.txt("EULER'S QUIVER", 8, 8, '#ffd34d');
      return;
    }
    const head = g.epilogue ? 'BONUS' : `SHAPE ${g.levelIndex + 1}/${g.total}`;
    this.txt(`${head} ${g.shape.name.toUpperCase()}`, 8, 6, '#fff');
    let line = '', col = '#9aa6e8';
    if (TYPES.includes(g.state)) {
      line = `COUNT ${LABEL[g.state]}: ${g.collected[g.state].size}`;
      col = TYPE_COL[g.state];
    } else if (g.state === 'predict') line = 'PREDICT THE FACES';
    else if (g.state === 'tally') line = 'TALLY';
    else if (g.state === 'look') line = 'INSPECT';
    else if (g.state === 'reveal') line = 'DISCOVERY';
    this.txt(line, 8, 17, col);
  }

  drawQuiver(g, dt) {
    const c = this.ctx;
    const blink = Math.floor(performance.now() / 350) % 2;
    for (const type of TYPES) {
      const { x, w, top, bot } = this.tube(type);
      const n = this.shown[type];
      const col = TYPE_COL[type];
      this.bump[type] = Math.max(0, this.bump[type] - dt * 4);

      c.fillStyle = '#140b06'; // mouth of the quiver
      c.fillRect(x, top - 2, w, 4);
      for (let j = 0; j < n; j++) {
        const layer = Math.floor(j / 4);
        const ax = x + 3 + (j % 4) * 4 + (layer % 2) * 2;
        const ah = 9 + ((j * 37) % 7) + Math.min(layer, 7) * 2;
        const ay = Math.round(top - ah - (j === n - 1 ? this.bump[type] * 4 : 0));
        c.fillStyle = '#d9c9a3';
        c.fillRect(ax, ay, 1, ah + 4);
        c.fillStyle = col;
        c.fillRect(ax - 1, ay + 1, 3, 4);
        c.fillStyle = '#ffffff';
        c.fillRect(ax, ay, 1, 1);
      }

      const leather = c.createLinearGradient(x, 0, x + w, 0);
      leather.addColorStop(0, '#4a2614');
      leather.addColorStop(0.45, '#8f5733');
      leather.addColorStop(1, '#3d1f10');
      c.fillStyle = leather;
      c.fillRect(x, top, w, bot - top);
      c.fillRect(x + 1, bot, w - 2, 1);
      c.fillRect(x + 3, bot + 1, w - 6, 1);
      c.fillStyle = '#2b170b';
      c.fillRect(x, top + 5, w, 2);
      c.fillRect(x, bot - 9, w, 2);
      c.fillStyle = '#c99a62';
      for (let y = top + 22; y < bot - 12; y += 4) c.fillRect(x + w - 5, y, 1, 2);
      this.txt(LETTER[type], x + w / 2 - 1, top + 10, col, 8, 'center');
      this.txt(String(n), x + w / 2, bot + 5, '#fff', 8, 'center');

      if (g.state === type && blink) {
        c.strokeStyle = col;
        c.lineWidth = 1;
        c.strokeRect(x - 1.5, top - 1.5, w + 3, bot - top + 4);
      }
      if (g.state === 'predict' && type === 'faces') {
        this.txt('?', x + w / 2, top - 14, col, 8, 'center');
      }
    }
  }

  drawLedger(g) {
    const c = this.ctx;
    const { x, y, w } = this.L.ledger;
    const rows = g.ledger;
    const h = 24 + LINE_H * (rows.length + 1);
    c.fillStyle = 'rgba(8,10,28,0.82)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = '#8fa2ff';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    this.txt('LEDGER', x + 6, y + 5, '#ffd34d');
    this.txt(formulaString(g.signs), x + w - 6, y + 5, '#fff', 8, 'right');
    const cols = [x + 6, x + 76, x + 100, x + 124, x + w - 6];
    const hy = y + 18;
    this.txt('SHAPE', cols[0], hy, '#9aa6e8');
    this.txt('V', cols[1], hy, TYPE_COL.vertices, 8, 'right');
    this.txt('E', cols[2], hy, TYPE_COL.edges, 8, 'right');
    this.txt('F', cols[3], hy, TYPE_COL.faces, 8, 'right');
    this.txt('=', cols[4], hy, '#fff', 8, 'right');
    const constant = g.constantValue() !== null;
    rows.forEach((row, i) => {
      const ry = hy + LINE_H * (i + 1);
      const val = evalRow(row, g.signs);
      this.txt(row.short, cols[0], ry, '#dfe4ff');
      this.txt(String(row.V), cols[1], ry, '#fff', 8, 'right');
      this.txt(String(row.E), cols[2], ry, '#fff', 8, 'right');
      this.txt(String(row.F), cols[3], ry, '#fff', 8, 'right');
      const vc = !row.sphere ? '#ff6b6b' : constant ? '#7dff9a' : '#fff';
      this.txt(String(val), cols[4], ry, vc, 8, 'right');
    });
  }

  drawStageText(g) {
    const { x, r } = this.L.stage;
    const top = Math.max(30, this.L.stage.y - r - 14);
    if (g.state === 'predict') {
      this.txt(`F = ${g.prediction} ?`, x, top, TYPE_COL.faces, 16, 'center');
    } else if (g.state === 'reveal' || (g.state === 'end' && g.showTitle)) {
      const big = g.state === 'end' ? 'V - E + F = 2 - 2g' : 'V - E + F = 2';
      const room = this.L.ledger.x - this.L.quiver.x - this.L.quiver.w;
      const size = big.length * 16 <= room ? 16 : 8;
      this.txt(big, x, top, '#ffd34d', size, 'center');
      this.txt(g.state === 'end' ? 'g = NUMBER OF HOLES' : 'EULER, 1750', x, top + size + 4, '#dfe4ff', 8, 'center');
    }
  }

  drawFlying(dt) {
    const c = this.ctx;
    this.flying = this.flying.filter((a) => {
      a.t += dt / 0.55;
      if (a.t >= 1) {
        this.shown[a.type]++;
        this.bump[a.type] = 1;
        return false;
      }
      const p = arc(a.from, a.to, a.t);
      const q = arc(a.from, a.to, Math.max(0, a.t - 0.06));
      const dx = p.x - q.x, dy = p.y - q.y;
      const len = Math.hypot(dx, dy) || 1;
      for (let k = 0; k < 8; k++) {
        c.fillStyle = k < 2 ? '#ffffff' : k > 5 ? TYPE_COL[a.type] : '#d9c9a3';
        c.fillRect(Math.round(p.x - (dx / len) * k), Math.round(p.y - (dy / len) * k), 1, 1);
      }
      return true;
    });
  }

  drawToasts(dt) {
    const c = this.ctx;
    this.toasts = this.toasts.filter((t) => {
      t.t += dt;
      if (t.t > 1) return false;
      c.globalAlpha = 1 - t.t;
      this.txt(t.text, t.x, t.y - 8 - t.t * 14, t.color, 8, 'center');
      c.globalAlpha = 1;
      return true;
    });
  }

  drawNarration() {
    const c = this.ctx;
    const { x, y, w, h } = this.L.narr;
    c.fillStyle = 'rgba(8,10,28,0.88)';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#8fa2ff';
    c.fillRect(x, y, w, 1);
    c.fillRect(x, y + h - 1, w, 1);
    c.fillRect(x, y, 1, h);
    c.fillRect(x + w - 1, y, 1, h);
    c.fillStyle = '#2a3170';
    c.fillRect(x + 2, y + 2, w - 4, 1);

    const lines = wrap(this.text, Math.floor((w - 16) / 8));
    let budget = Math.floor(this.typed);
    lines.forEach((line, i) => {
      if (budget <= 0) return;
      this.txt(line.slice(0, budget), x + 8, y + 8 + i * LINE_H, '#f2f4ff');
      budget -= line.length + 1;
    });
    if (!this.typing && Math.floor(performance.now() / 400) % 2) {
      c.fillStyle = '#ffd34d';
      c.fillRect(x + w - 12, y + h - 10, 5, 3);
      c.fillRect(x + w - 11, y + h - 7, 3, 2);
    }
  }
}

function arc(a, b, t) {
  const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - 40;
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y };
}

function wrap(text, max) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > max) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
