# Euler's Quiver: notes for agents

See README.md for what the game is and the file map. This file covers the things that aren't obvious from reading the code.

## Running
- `python3` here goes through asdf, and this folder has no `.tool-versions`, so it fails. Use `/usr/bin/python3 -m http.server 8000`.
- There's no build step and no package.json. Three.js (`three@0.160.0`, via the import map in `index.html`) and the Press Start 2P font come from CDNs.
- To check the shape data without a browser: `node -e "import('./js/polyhedra.js').then(m=>m.selfTest())"`.

## Coordinates and the pixel filter
- Everything visual is drawn in low-res "fat pixel" units. `computeLayout()` in `js/main.js` builds the shared layout object `L` (`PX`, `W`, `H`, `stage`, `quiver`, `ledger`, `narr`). `PX` changes with window size and browser zoom, from 1 up to 6 or more.
- The pixelation works only because things are drawn on the canvases. Anything added as DOM will be crisp. Buttons are the only DOM on purpose, and they're placed by multiplying `L` values by `PX` (`ui.layout` / `ui.placeFormula` in main.js).
- Canvas text must be ASCII. Press Start 2P has no `−`, `—`, `▶` or `χ`, and those fall back to a smooth font.
- The backdrop (gradient, hands, dither) is drawn only on resize, not every frame. Animating the hands would need a per-frame redraw.

## Game logic (js/game.js)
- The states are `intro → look → vertices → edges → [predict] → faces → tally`, then repeat for the next shape, then `reveal`, then the torus, then `end`. The HUD reads `game.state` directly.
- Every state change rebuilds the button bar with `ui.setButtons([...])`. Multi-page text goes through `narrate(pages, finalButtons, onPage)`.
- The rule counts as discovered once the sign choices give the same result for at least 3 hole-free shapes. The torus row has `sphere: false` and is excluded. `GATE_LEVEL` (the octahedron) blocks progress until the rule is found.

## Picking and shapes (js/scene.js, js/polyhedra.js)
- Vertices and edges are clicked through enlarged invisible proxies (`PROXY_MAT`, colorWrite off). Faces are always included in the raycast so they block pieces on the far side. Only the active phase's type can be picked.
- Adding a convex shape only needs vertex coordinates, because the hull finder recovers the faces. Also add its counts to `EXPECTED` so `selfTest()` covers it. Non-convex shapes need hand-written faces (see `frame()`).

## Browser testing
- `window.__game` and `window.__eulerSelfTest()` are exposed. Fast-forward by calling `__game.pick(type, id)` for every id, then clicking `#btnbar` buttons, matched by their text.
- Screenshots are expensive: one session used about 430k tokens on them. Drive and check the game with `javascript_tool`, and take screenshots only for visual checks, using `scale: 0.5`.
- With browser zoom, screenshot coordinates don't match CSS px. To find where to click, use `__game.stage.project(type, id)` (fat pixels) × `PX`, then scale by screenshot width ÷ `innerWidth`.
