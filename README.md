# Euler's Expedition

A small browser adventure about counting the pieces of polyhedra until a pattern appears:

**V − E + F = 2**

## Play

There's no build step. Serve the folder and open it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

If `python3` fails with a version-manager error (asdf or pyenv with no version set for this folder), use the system Python instead: `/usr/bin/python3 -m http.server 8000`.

Three.js and the Press Start 2P font load from CDNs, so you need a network connection.

## How it plays

- **Explore.** You stand in a dirt clearing ringed by forest, and the solids float in a row in front of you. Walk with the arrow keys (or WASD): up and down move, left and right turn, Z and X step sideways. Walk up to the solid under the gold arrow and click it to study it. On phones, tilt to walk: however you hold the phone when exploring starts counts as standing still, tipping the top away walks forward, tipping it back walks backward, and rolling it steers. Phones may also tap any solid in view from where they stand. Tilt needs HTTPS (or localhost), and iPhones ask for permission when you press Begin.
- **Count by clicking.** Each solid is counted in three passes: vertices, then edges, then faces. Each type has its own hue (cyan vertices, gold edges, pink faces), and clicking a piece lights it up and adds one to the count panel. You can't count a piece twice. Drag to rotate, because hidden pieces count too.
- **Hunt for the rule.** Each solid adds a row to the ledger, and lights up in the world once counted. The sign buttons (`±V ±E ±F`) recompute the `=` column for every row at once. Once you have three or more solids, the only combination that stays constant is `V − E + F` (or its negation). Finding it unlocks the later levels.
- **Guess first.** Before each count, you guess how many vertices, edges or faces there are, and the game tells you how close you were. For the dodecahedron and icosahedron, the face guess becomes a prediction made with your rule.
- **Break it.** The bonus picture-frame solid gives `16 − 32 + 16 = 0`. The formula is about solids without holes. In general, V − E + F is the *Euler characteristic*, `2 − 2g` for a surface with `g` holes.

## The math

Euler described the relation in a 1750 letter to Goldbach. Legendre gave the first rigorous proof in 1794. The proof sketch the game uses goes like this. Flatten the solid into a planar graph, with one face becoming the outer region. Build that graph one edge at a time. Each edge either adds a vertex or splits a region, so `V − E + F` never changes. A single vertex gives `1 − 0 + 1 = 2`.

## Code

| File | Role |
|---|---|
| `js/polyhedra.js` | Shape data; a convex-hull face finder recovers true polygon faces from vertex lists; edges come from face loops; `selfTest()` checks every count |
| `js/world.js` | The walkable first-person world: sky, clouds, forest, dithered dirt ground, the line of floating solids, arrow-key movement, and clicking a solid to study it |
| `js/tilt.js` | Tilt-to-walk on phones: device orientation turned into forward/back and steering, zeroed to the pose held when exploring starts |
| `js/scene.js` | Three.js counting stage, drawn over the dimmed world: shaded faces, pickable vertices/edges/faces with per-type hues that light up when counted, drag-to-rotate with inertia, click picking with occlusion |
| `js/hud.js` | Count panel, ledger, narration, and pop-up feedback, drawn on a canvas |
| `js/game.js` | State machine, narration, formula discovery, guesses and predictions |
| `js/main.js` | Layout, DOM buttons, render loop |
| `js/settings.js` | Pixel-size knobs: `SHAPE_RES` (chunkiness of the world and shape) and `HUD_RES` |

**Lo-fi filter:** every canvas renders at low resolution and is scaled up with `image-rendering: pixelated`. The HUD uses the finest grid that still fits its text. The 3D world and counting stage use a grid sized so the shape is always about `SHAPE_RES` pixels in radius, so a phone shows chunky pixels just like a big monitor. Only the DOM buttons render at full resolution.

Run `__eulerSelfTest()` in the browser console to verify the V/E/F counts for every shape.
