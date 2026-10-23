# Euler's Expedition: notes for agents

See README.md for what the game is and the file map. This file covers the things that aren't obvious from reading the code.

## Running
- `python3` here goes through asdf, and this folder has no `.tool-versions`, so it fails. Use `/usr/bin/python3 -m http.server 8000`.
- There's no build step and no package.json. Three.js (`three@0.160.0`, via the import map in `index.html`) and the Press Start 2P font come from CDNs.
- To check the shape data without a browser: `node -e "import('./js/polyhedra.js').then(m=>m.selfTest())"`.

## Coordinates and the pixel filter
- Everything visual is drawn in low-res "fat pixel" units. `computeLayout()` in `js/main.js` builds the shared layout object `L` (`PX`, `W`, `H`, `stage`, `counts`, `ledger`, `narr`). `stage.r` sets the shape size. `PX` changes with window size and browser zoom, from 1 up to 6 or more.
- Phones get `PX` = 1. When the screen is taller than wide, the layout switches to portrait: the count panel and ledger share a header row and the shape gets the full width below, with room reserved for the ledger at its final 8 rows. Below about 300 CSS px of ledger width, `#formula.narrow` hides the SIGNS label so the sign buttons fit. To test phone sizes, load the game in same-origin iframes (e.g. 390×844, 844×390) and read `frame.contentWindow.__game`.
- The pixelation works only because things are drawn on the canvases. Anything added as DOM will be crisp. Buttons are the only DOM on purpose, and they're placed by multiplying `L` values by `PX` (`ui.layout` / `ui.placeFormula` in main.js).
- Canvas text must be ASCII. Press Start 2P has no `−`, `—`, `▶` or `χ`, and those fall back to a smooth font.
- The backdrop (gradient, dither) is drawn only on resize, not every frame. Anything animated belongs on the HUD or in the scene.

## Game logic (js/game.js)
- The states are `intro → look → vertices → edges → [predict] → faces → tally`, then repeat for the next shape, then `reveal`, then the torus, then `end`. The HUD reads `game.state` directly.
- Every state change rebuilds the button bar with `ui.setButtons([...])`. Multi-page text goes through `narrate(pages, finalButtons, onPage)`.
- The narration box holds 4 lines on wide screens and 5 on narrow ones (about 44 columns on a phone), and overflow is silently clipped. Keep each page within 5 lines at that width. Pages that combine messages, like the prediction result plus the discovery message in `showTally`, run longest.
- The rule counts as discovered once the sign choices give the same result for at least 3 hole-free shapes. The torus row has `sphere: false` and is excluded. `GATE_LEVEL` (the octahedron) blocks progress until the rule is found.

## Picking and shapes (js/scene.js, js/polyhedra.js)
- Vertices and edges are clicked through enlarged invisible proxies (`PROXY_MAT`, colorWrite off). Faces are always included in the raycast so they block pieces on the far side. Only the active phase's type can be picked.
- Colors live in `HUES` in scene.js: each type has `base` (resting), `idle` (active phase, not yet counted) and `lit` (counted, plus emissive glow). Keep a type's three steps in one hue, and keep `TYPE_COL` in hud.js matching `lit`.
- Adding a convex shape only needs vertex coordinates, because the hull finder recovers the faces. Also add its counts to `EXPECTED` so `selfTest()` covers it. Non-convex shapes need hand-written faces (see `frame()`).

## Browser testing
- `window.__game` and `window.__eulerSelfTest()` are exposed. Fast-forward by calling `__game.pick(type, id)` for every id, then clicking `#btnbar` buttons, matched by their text.
- After editing JS, the page may keep cached modules, even with a new `?v=` on the URL. Refresh them with `await fetch('/js/<file>.js', {cache: 'reload'})` for each changed file, then `location.reload()`. Or ask the user to hard-reload.
- Screenshots are expensive: one session used about 430k tokens on them. Drive and check the game with `javascript_tool`, and take screenshots only for visual checks, using `scale: 0.5`.
- With browser zoom, screenshot coordinates don't match CSS px. To find where to click, use `__game.stage.project(type, id)` (fat pixels) × `PX`, then scale by screenshot width ÷ `innerWidth`.
