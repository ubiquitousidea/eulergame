import { LEVELS, EPILOGUE } from './polyhedra.js';
import { evalRow } from './hud.js';
import { sfx } from './sfx.js';

const ORDER = ['vertices', 'edges', 'faces'];
const SINGULAR = { vertices: 'vertex', edges: 'edge', faces: 'face' };
const SHAPE_KEY = { vertices: 'verts', edges: 'edges', faces: 'faces' };
const LETTER = { vertices: 'V', edges: 'E', faces: 'F' };
const GATE_LEVEL = 4; // the octahedron: the rule must be found before predicting

const INTRO = [
  'Welcome, explorer. The shapes you will meet on this expedition are POLYHEDRA: solids made of flat faces.',
  'Each one has VERTICES (corners), EDGES (where two faces meet), and FACES (the flat sides).',
  'The shapes float in a line out in this clearing. Walk up to one and click it. Then click each piece to count it, and drag to turn the solid: hidden pieces count too!',
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
  constructor({ stage, hud, ui, world }) {
    this.stage = stage;
    this.hud = hud;
    this.ui = ui;
    this.world = world;
    this.total = LEVELS.length;
    stage.onPick = (type, id) => this.pick(type, id);
    world.onPick = (index, far) => this.pickShape(index, far);
    ui.onSign = (i) => this.toggleSign(i);
  }

  start() {
    this.levelIndex = 0;
    this.ledger = [];
    this.signs = [1, 1, 1];
    this.discovered = false;
    this.epilogue = false;
    this.guesses = {};
    this.state = 'intro';
    this.stage.compact = false;
    this.stage.visible = false;
    this.world.reset();
    this.shape = LEVELS[0];
    this.collected = { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.hud.resetCounts();
    this.ui.setFormula({ visible: false, enabled: false, signs: this.signs, rows: 0 });
    this.narrate(INTRO, [{ label: 'Begin >', onClick: () => this.explore(0) }]);
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

  // Walk the world to find shape `index` (LEVELS.length is the bonus frame).
  explore(index) {
    this.state = 'explore';
    this.levelIndex = index;
    this.shape = index < LEVELS.length ? LEVELS[index] : EPILOGUE;
    this.epilogue = this.shape === EPILOGUE;
    this.stage.visible = false;
    this.stage.setPhase(null);
    this.world.explore(index);
    this.ui.setFormula({ enabled: false });
    const name = this.shape.name.toUpperCase();
    const how = this.world.touch ? `Tap the ${name}` : `Walk with the ARROW KEYS to the ${name}, then click it`;
    this.hud.say(this.epilogue
      ? `A strange new shape has appeared at the far end of the line. ${how}!`
      : `${how}. Look for the gold arrow.`);
    this.ui.setButtons([]);
  }

  // A floating shape was clicked in the world. Only the target opens, and only up close.
  pickShape(index, far = false) {
    if (this.state !== 'explore') return;
    const pos = this.world.project(index);
    if (index !== this.levelIndex || far) {
      const msg = index < this.levelIndex ? 'COUNTED!' : index > this.levelIndex ? `FIRST: ${this.shape.short}` : 'WALK CLOSER';
      this.hud.toast(msg, pos, '#ff8a8a');
      sfx.dud();
      return;
    }
    sfx.success();
    this.world.enter(index);
    this.beginShape(this.shape, index);
  }

  beginShape(shape, index) {
    this.shape = shape;
    this.levelIndex = index;
    this.epilogue = shape === EPILOGUE;
    this.guesses = {};
    this.collected = { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.state = 'look';
    this.stage.compact = false;
    this.stage.visible = true;
    this.stage.loadShape(shape);
    this.hud.resetCounts();
    this.ui.setFormula({ enabled: false });
    this.narrate([shape.blurb], [{ label: 'Start counting >', onClick: () => this.startGuess('vertices') }]);
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
    this.hud.counted(type, pos);
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
    const guess = this.guesses[type];
    const got = `${n} ${n === 1 ? SINGULAR[type] : type}! ${guess === n ? 'Spot on! ' : `You guessed ${guess}. `}`;
    if (type === 'vertices') this.startGuess('edges', got);
    else if (type === 'edges') this.startGuess('faces', got);
    else this.tally();
  }

  // Before each count the player guesses it; for predict shapes the face guess
  // is a prediction from the rule.
  startGuess(type, prefix = '') {
    this.state = 'guess';
    this.guessType = type;
    this.stage.compact = true; // room for the guess above the shape
    this.stage.setPhase(null);
    this.guesses[type] = 0;
    const V = this.shape.verts.length, E = this.shape.edges.length;
    this.hud.say(this.shape.predict && type === 'faces'
      ? `${prefix}With V = ${V} and E = ${E}, use your rule to PREDICT the faces before you count them.`
      : `${prefix}How many ${type.toUpperCase()} does the ${this.shape.name.toLowerCase()} have? Turn it to look, then guess.`);
    this.guessButtons();
  }

  guessButtons() {
    const type = this.guessType;
    const step = (d) => () => {
      this.guesses[type] = Math.max(0, this.guesses[type] + d);
      sfx.click();
      this.guessButtons();
    };
    const n = this.guesses[type];
    this.ui.setButtons([
      { label: '-1', kind: 'ghost', onClick: step(-1) },
      { label: '+1', kind: 'ghost', onClick: step(1) },
      { label: '+5', kind: 'ghost', onClick: step(5) },
      {
        label: `Lock in ${LETTER[type]} = ${n}`,
        onClick: () => this.startPhase(type, `Locked in: ${n} ${n === 1 ? SINGULAR[type] : type}. Now count them to check! `),
      },
    ]);
  }

  tally() {
    this.state = 'tally';
    this.stage.setPhase(null);
    const s = this.shape;
    this.ledger.push({
      short: s.short, name: s.name, sphere: s.sphere, predict: s.predict, guessed: this.guesses.faces,
      V: s.verts.length, E: s.edges.length, F: s.faces.length,
    });
    this.ui.setFormula({ rows: this.ledger.length });
    this.world.markCounted(this.levelIndex);
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
    if (row.predict) {
      msg += row.guessed === row.F
        ? `You predicted ${row.guessed} faces and counted ${row.F}. Exactly right! `
        : `You predicted ${row.guessed} but counted ${row.F}. Check your rule against the ledger. `;
    } else {
      msg += row.guessed === row.F ? `${row.F} faces, as you guessed! ` : `${row.F} faces (you guessed ${row.guessed}). `;
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
      label: last ? 'The big reveal >' : 'Keep exploring >',
      disabled: gated,
      onClick: () => (last ? this.reveal() : this.explore(this.levelIndex + 1)),
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
    this.narrate(REVEAL, [{
      label: 'One more shape...',
      onClick: () => {
        this.world.showEpilogue();
        this.explore(LEVELS.length);
      },
    }]);
  }

  endGame() {
    const { V, E, F } = this.ledger[this.ledger.length - 1];
    this.state = 'end';
    this.stage.compact = true;
    this.narrate([
      `${V} - ${E} + ${F} = ${V - E + F}. NOT 2! Did the rule break?`,
      "Euler's rule is for solids WITHOUT holes, ones you could inflate like a balloon into a ball. This frame has a tunnel through it, so it can't become a ball.",
      'So V - E + F measures something deeper than counting. It is called the EULER CHARACTERISTIC: 2 for a ball, 0 with one hole, -2 with two holes. Each hole subtracts 2.',
      'It ignores size, angles and face shapes. Only holes matter. That idea helped launch a whole new field: TOPOLOGY. Thanks for playing, explorer!',
    ], [{ label: 'Play again', onClick: () => this.start() }], (page) => (this.showTitle = page >= 2));
  }
}
