# Euler's Expedition

A small browser adventure about counting the pieces of polyhedra until a pattern appears:

**V − E + F = 2**

## Play

There's no build step. Serve the folder and open it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

Three.js and the Press Start 2P font load from CDNs, so you need a network connection.

## How it plays

- **Count by clicking.** Each solid is counted in three passes: vertices, then edges, then faces. Each type has its own hue (cyan vertices, gold edges, pink faces), and clicking a piece lights it up and adds one to the count panel. You can't count a piece twice. Drag to rotate, because hidden pieces count too.
- **Hunt for the rule.** Each solid adds a row to the ledger. The sign buttons (`±V ±E ±F`) recompute the `=` column for every row at once. Once you have three or more solids, the only combination that stays constant is `V − E + F` (or its negation). Finding it unlocks the later levels.
- **Predict.** For the dodecahedron and icosahedron, you use your rule to predict F before counting the faces.
- **Break it.** The bonus picture-frame solid gives `16 − 32 + 16 = 0`. The formula is about solids without holes. In general, V − E + F is the *Euler characteristic*, `2 − 2g` for a surface with `g` holes.

## The math

Euler described the relation in a 1750 letter to Goldbach. Legendre gave the first rigorous proof in 1794. The proof sketch the game uses goes like this. Flatten the solid into a planar graph, with one face becoming the outer region. Build that graph one edge at a time. Each edge either adds a vertex or splits a region, so `V − E + F` never changes. A single vertex gives `1 − 0 + 1 = 2`.

## Code

| File | Role |
|---|---|
| `js/polyhedra.js` | Shape data; a convex-hull face finder recovers true polygon faces from vertex lists; edges come from face loops; `selfTest()` checks every count |
| `js/scene.js` | Three.js stage: shaded faces, pickable vertices/edges/faces with per-type hues that light up when counted, drag-to-rotate with inertia, click picking with occlusion |
| `js/backdrop.js` | Radial-gradient backdrop, ordered-dithered |
| `js/hud.js` | Count panel, ledger, narration, and pop-up feedback, drawn on a canvas |
| `js/game.js` | State machine, narration, formula discovery, predictions |
| `js/main.js` | Layout, DOM buttons, render loop |

**Lo-fi filter:** every canvas renders at `1/PX` of the viewport and is scaled up with `image-rendering: pixelated`, so the backdrop, 3D scene and HUD share one pixel grid. Only the DOM buttons render at full resolution.

Run `__eulerSelfTest()` in the browser console to verify the V/E/F counts for every shape.
