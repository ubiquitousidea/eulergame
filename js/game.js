import { LEVELS, EPILOGUE } from './polyhedra.js';
import { evalRow } from './hud.js';
import { sfx } from './sfx.js';

const ORDER = ['vertices', 'edges', 'faces'];
const SINGULAR = { vertices: 'vertex', edges: 'edge', faces: 'face' };
const SHAPE_KEY = { vertices: 'verts', edges: 'edges', faces: 'faces' };
const GATE_LEVEL = 4; // the octahedron: the rule must be found before predicting

const INTRO = [
  'Welcome, collector. The shapes resting in your hands are POLYHEDRA: solids made of flat faces.',
  'Each one has VERTICES (corners), EDGES (where two faces meet), and FACES (the flat sides).',
  'Click each piece to shoot it into your quiver. Drag to turn the solid, because hidden pieces count too!',
  'Count carefully. Somewhere in these numbers hides a secret Leonhard Euler found in 1750.',
];

const PHASE_TEXT = {
  vertices: "Click every VERTEX, each corner where edges meet. Press 'Got them all!' when you're done.",
  edges: 'Now click every EDGE, each line where two faces meet.',
  faces: 'Now click every FACE, each flat side.',
};

const TALLY_PROMPTS = [
  'Your counts are in the ledger. Use the sign buttons under it to add or subtract V, E and F. The = column shows the result.',
  'Two shapes now. Can you find signs that give the SAME result for both?',
  'Hunt for signs that make every row of the = column match.',
];

const REVEAL = [
  'Look at your ledger. Seven solids: big, small, pointy, round. For every one, V - E + F = 2.',
  'Leonhard Euler noticed this in 1750 and wrote about it to his friend Christian Goldbach. It holds for EVERY convex polyhedron, whatever its size or face shapes.',
  'Why? Squash the solid flat into a drawing of dots and lines. Start with a single dot: 1 dot - 0 lines + 1 region (all the space around it) = 2.',
  'Now add lines one at a time. Each new line brings either a new dot (V+1, E+1) or splits a region in two (E+1, F+1). Either way, V - E + F stays 2.',
  "Euler's own proof had gaps. Legendre gave the first airtight one in 1794. But is the answer truly ALWAYS 2? Let's test one strange shape...",
];

export class Game {
  constructor({ stage, hud, ui }) {
    this.stage = stage;
    this.hud = hud;
    this.ui = ui;
    this.total = LEVELS.length;
    stage.onPick = (type, id) => this.pick(type, id);
    ui.onSign = (i) => this.toggleSign(i);
  }

  start() {
    this.levelIndex = 0;
    this.ledger = [];
    this.signs = [1, 1, 1];
    this.discovered = false;
    this.epilogue = false;
    this.prediction = null;
    this.state = 'intro';
    this.stage.compact = false;
    this.shape = LEVELS[0];
    this.collected = { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.stage.loadShape(this.shape);
    this.hud.resetCounts();
    this.ui.setFormula({ visible: false, enabled: false, signs: this.signs, rows: 0 });
    this.narrate(INTRO, [{ label: 'Begin >', onClick: () => this.beginShape(LEVELS[0], 0) }]);
  }

  // Show pages one at a time; the last page gets the final buttons.
  narrate(pages, finalButtons, onPage) {
    let i = 0;
    const show = () => {
      this.hud.say(pages[i]);
      if (onPage) onPage(i);
      if (i < pages.length - 1) {
        this.ui.setButtons([{
          label: 'Continue >',
          onClick: () => {
            if (this.hud.typing) return this.hud.finishTyping();
            i++;
            show();
          },
        }]);
      } else this.ui.setButtons(finalButtons);
    };
    show();
  }

  beginShape(shape, index) {
    this.shape = shape;
    this.levelIndex = index;
    this.epilogue = shape === EPILOGUE;
    this.prediction = null;
    this.collected = { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.state = 'look';
    this.stage.compact = false;
    this.stage.loadShape(shape);
    this.hud.resetCounts();
    this.ui.setFormula({ enabled: false });
    this.narrate([shape.blurb], [{ label: 'Start counting >', onClick: () => this.startPhase('vertices') }]);
  }

  startPhase(type, prefix = '') {
    this.state = type;
    this.stage.compact = false;
    this.stage.setPhase(type);
    this.hud.say(prefix + PHASE_TEXT[type]);
    this.ui.setButtons([
      { label: 'Hint', kind: 'ghost', onClick: () => this.stage.pulse() },
      { label: 'Reset view', kind: 'ghost', onClick: () => this.stage.resetView() },
      { label: 'Got them all!', onClick: () => this.claimDone() },
    ]);
  }

  pick(type, id) {
    if (this.state !== type) return;
    const pos = this.stage.project(type, id);
    if (this.collected[type].has(id)) {
      this.hud.toast('COUNTED!', pos, '#ff8a8a');
      sfx.dud();
      return;
    }
    this.collected[type].add(id);
    this.stage.markCollected(type, id);
    this.hud.fly(type, pos);
    sfx.collect(type, this.collected[type].size);
  }

  claimDone() {
    const type = this.state;
    const n = this.collected[type].size;
    if (n < this.shape[SHAPE_KEY[type]].length) {
      sfx.dud();
      this.hud.say(`Not yet! Some ${type} are still hiding. Turn the solid to check the far side, or press Hint to make them glow.`);
      return;
    }
    sfx.success();
    const got = `${n} ${n === 1 ? SINGULAR[type] : type}! `;
    if (type === 'vertices') this.startPhase('edges', got);
    else if (type === 'edges' && this.shape.predict) this.startPredict();
    else if (type === 'edges') this.startPhase('faces', got);
    else this.tally();
  }

  startPredict() {
    this.state = 'predict';
    this.stage.compact = true; // room for the prediction above the shape
    this.stage.setPhase(null);
    this.prediction = 10;
    const V = this.shape.verts.length, E = this.shape.edges.length;
    this.hud.say(`${V} vertices and ${E} edges. Before you count the faces, use your rule to PREDICT how many there are.`);
    this.predictButtons();
  }

  predictButtons() {
    const step = (d) => () => {
      this.prediction = Math.max(0, this.prediction + d);
      sfx.click();
      this.predictButtons();
    };
    this.ui.setButtons([
      { label: '-1', kind: 'ghost', onClick: step(-1) },
      { label: '+1', kind: 'ghost', onClick: step(1) },
      { label: '+5', kind: 'ghost', onClick: step(5) },
      {
        label: `Lock in F = ${this.prediction}`,
        onClick: () => this.startPhase('faces', `Locked in: ${this.prediction} faces. Now count them to check! `),
      },
    ]);
  }

  tally() {
    this.state = 'tally';
    this.stage.setPhase(null);
    const s = this.shape;
    this.ledger.push({
      short: s.short, name: s.name, sphere: s.sphere, predicted: this.prediction,
      V: s.verts.length, E: s.edges.length, F: s.faces.length,
    });
    this.ui.setFormula({ rows: this.ledger.length });
    if (this.epilogue) return this.endGame();
    this.ui.setFormula({ visible: true, enabled: true, signs: this.signs, rows: this.ledger.length });
    this.showTally(this.checkDiscovery());
  }

  // Signs that give the same total for every (hole-free) shape, needing 3+ shapes.
  constantValue() {
    const rows = this.ledger.filter((r) => r.sphere);
    if (rows.length < 3) return null;
    const vals = rows.map((r) => evalRow(r, this.signs));
    return vals.every((v) => v === vals[0]) ? vals[0] : null;
  }

  checkDiscovery() {
    if (this.discovered || this.constantValue() === null) return false;
    this.discovered = true;
    sfx.success();
    return true;
  }

  toggleSign(i) {
    if (this.state !== 'tally') return;
    this.signs[i] *= -1;
    sfx.click();
    this.ui.setFormula({ signs: this.signs });
    if (this.checkDiscovery()) this.showTally(true);
  }

  showTally(newlyDiscovered) {
    const row = this.ledger[this.ledger.length - 1];
    const last = this.levelIndex === LEVELS.length - 1;
    let msg = '';
    if (row.predicted != null) {
      msg += row.predicted === row.F
        ? `You predicted ${row.predicted} faces and counted ${row.F}. Exactly right! `
        : `You predicted ${row.predicted} but counted ${row.F}. Check your rule against the ledger. `;
    }
    if (newlyDiscovered) {
      msg += this.constantValue() === 2
        ? 'WOW! Every row gives 2. V - E + F = 2 for every shape so far. Will it hold for the next one?'
        : 'Every row gives -2! Flip all three signs and it reads V - E + F = 2. Will it hold for the next one?';
    } else if (this.discovered) {
      msg += `${row.V} - ${row.E} + ${row.F} = ${row.V - row.E + row.F}. The rule holds again!`;
    } else {
      msg += TALLY_PROMPTS[Math.min(this.ledger.length - 1, TALLY_PROMPTS.length - 1)];
    }
    const gated = !this.discovered && this.levelIndex >= GATE_LEVEL;
    if (gated) msg += ' Find signs that make every row match before moving on.';

    const buttons = [];
    if (!this.discovered) {
      buttons.push({
        label: 'Hint', kind: 'ghost',
        onClick: () => this.hud.say('Hint: adding everything never matches. Try alternating the signs: + V, - E, + F.'),
      });
    }
    buttons.push({
      label: last ? 'The big reveal >' : 'Next polyhedron >',
      disabled: gated,
      onClick: () => (last ? this.reveal() : this.beginShape(LEVELS[this.levelIndex + 1], this.levelIndex + 1)),
    });
    this.hud.say(msg);
    this.ui.setButtons(buttons);
  }

  reveal() {
    this.state = 'reveal';
    this.stage.compact = true;
    this.signs = [1, -1, 1];
    this.ui.setFormula({ enabled: false, signs: this.signs });
    sfx.success();
    this.narrate(REVEAL, [{ label: 'One more shape...', onClick: () => this.beginShape(EPILOGUE, LEVELS.length) }]);
  }

  endGame() {
    const { V, E, F } = this.ledger[this.ledger.length - 1];
    this.state = 'end';
    this.stage.compact = true;
    this.narrate([
      `${V} - ${E} + ${F} = ${V - E + F}. NOT 2! Did the rule break?`,
      "Euler's rule is for solids WITHOUT holes, ones you could inflate like a balloon into a ball. This frame has a tunnel through it, so it can't become a ball.",
      'So V - E + F measures something deeper than counting. It is called the EULER CHARACTERISTIC: 2 for a ball, 0 with one hole, -2 with two holes. Each hole subtracts 2.',
      'It ignores size, angles and face shapes. Only holes matter. That idea helped launch a whole new field: TOPOLOGY. Thanks for playing, collector!',
    ], [{ label: 'Play again', onClick: () => this.start() }], (page) => (this.showTitle = page >= 2));
  }
}
