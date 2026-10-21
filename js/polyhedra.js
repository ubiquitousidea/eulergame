// Polyhedron data. Convex shapes are given as vertex coordinates only; their true
// polygonal faces are recovered with a brute-force convex hull, and edges are
// derived from the face loops. The picture-frame torus is non-convex, so its
// faces are authored by hand.

const PHI = (1 + Math.sqrt(5)) / 2;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

// Every plane through three points that has all other points on one side is a
// face plane. Collect all coplanar points on it and order them around the face.
export function hullFaces(pts, eps = 1e-5) {
  const faces = [];
  const seen = new Set();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const c = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
        if (Math.hypot(...c) < 1e-9) continue;
        let nrm = unit(c);
        const d = dot(nrm, pts[i]);
        let pos = false, neg = false;
        const on = [];
        for (let m = 0; m < n; m++) {
          const s = dot(nrm, pts[m]) - d;
          if (s > eps) pos = true;
          else if (s < -eps) neg = true;
          else on.push(m);
        }
        if (pos && neg) continue;
        if (pos) nrm = nrm.map((v) => -v);
        const key = on.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push(orderLoop(pts, on, nrm));
      }
    }
  }
  return faces;
}

// Sort a face's vertices counter-clockwise as seen from outside.
function orderLoop(pts, idx, nrm) {
  const c = idx.reduce((acc, m) => add(acc, pts[m]), [0, 0, 0]).map((v) => v / idx.length);
  const u = unit(sub(pts[idx[0]], c));
  const v = cross(nrm, u);
  return idx
    .map((m) => {
      const p = sub(pts[m], c);
      return [m, Math.atan2(dot(p, v), dot(p, u))];
    })
    .sort((a, b) => a[1] - b[1])
    .map((a) => a[0]);
}

export function edgesFromFaces(faces) {
  const keys = new Set();
  const edges = [];
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (keys.has(key)) continue;
      keys.add(key);
      edges.push([Math.min(a, b), Math.max(a, b)]);
    }
  }
  return edges;
}

// Center on the centroid and scale so the farthest vertex sits on the unit sphere.
function normalize(verts) {
  const c = verts.reduce((acc, p) => add(acc, p), [0, 0, 0]).map((v) => v / verts.length);
  const centered = verts.map((p) => sub(p, c));
  const r = Math.max(...centered.map((p) => Math.hypot(...p)));
  return centered.map((p) => p.map((v) => v / r));
}

function makeShape(def) {
  const verts = normalize(def.verts);
  const faces = def.faces || hullFaces(verts);
  const edges = edgesFromFaces(faces);
  return { sphere: true, predict: false, ...def, verts, faces, edges };
}

function signs3(fn) {
  const out = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) out.push(fn(a, b, c));
  return out;
}

function prismVerts(sides, h) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const t = Math.PI / 2 + (i * 2 * Math.PI) / sides;
    out.push([Math.cos(t), h, Math.sin(t)], [Math.cos(t), -h, Math.sin(t)]);
  }
  return out;
}

// Square picture frame: outer half-width a, hole half-width b, half-thickness t.
function frame(a = 1, b = 0.5, t = 0.32) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const verts = [];
  for (const z of [t, -t]) {
    for (const [x, y] of corners) verts.push([x * a, y * a, z]);
    for (const [x, y] of corners) verts.push([x * b, y * b, z]);
  }
  const faces = [];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    faces.push([k, n, 4 + n, 4 + k]);             // front ring
    faces.push([8 + k, 12 + k, 12 + n, 8 + n]);   // back ring
    faces.push([k, 8 + k, 8 + n, n]);             // outer wall
    faces.push([4 + k, 4 + n, 12 + n, 12 + k]);   // inner wall (the tunnel)
  }
  return { verts, faces };
}

export const LEVELS = [
  makeShape({
    id: 'tetra', name: 'Tetrahedron', short: 'TETRA', color: '#4fb3a9',
    verts: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    blurb: 'Shape 1: the TETRAHEDRON. Four triangles make the simplest solid there is. Drag to turn it in your hands.',
  }),
  makeShape({
    id: 'cube', name: 'Cube', short: 'CUBE', color: '#d9734e',
    verts: signs3((a, b, c) => [a, b, c]),
    blurb: 'Shape 2: the CUBE. Some corners are always hiding behind it, so turn it around to find them all.',
  }),
  makeShape({
    id: 'prism', name: 'Triangular Prism', short: 'PRISM', color: '#7b6fd6',
    verts: prismVerts(3, 0.8),
    blurb: 'Shape 3: a TRIANGULAR PRISM. Two triangles are joined by three rectangles, like a tent.',
  }),
  makeShape({
    id: 'pyramid', name: 'Square Pyramid', short: 'PYRMD', color: '#d6b04f',
    verts: [[1, -0.6, 1], [1, -0.6, -1], [-1, -0.6, -1], [-1, -0.6, 1], [0, 1, 0]],
    blurb: 'Shape 4: a SQUARE PYRAMID, like the ones at Giza. It has one square and four triangles.',
  }),
  makeShape({
    id: 'octa', name: 'Octahedron', short: 'OCTA', color: '#4f8fd6',
    verts: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    blurb: 'Shape 5: the OCTAHEDRON. It is two pyramids glued base to base.',
  }),
  makeShape({
    id: 'dodeca', name: 'Dodecahedron', short: 'DODECA', color: '#5fbf6a', predict: true,
    verts: [
      ...signs3((a, b, c) => [a, b, c]),
      ...[-1, 1].flatMap((a) => [-1, 1].map((b) => [0, a / PHI, b * PHI])),
      ...[-1, 1].flatMap((a) => [-1, 1].map((b) => [a / PHI, b * PHI, 0])),
      ...[-1, 1].flatMap((a) => [-1, 1].map((b) => [a * PHI, 0, b / PHI])),
    ],
    blurb: 'Shape 6: the DODECAHEDRON, built from pentagons. This time you will test your rule by PREDICTING before you count.',
  }),
  makeShape({
    id: 'icosa', name: 'Icosahedron', short: 'ICOSA', color: '#c95f9a', predict: true,
    verts: [
      ...[-1, 1].flatMap((a) => [-1, 1].map((b) => [0, a, b * PHI])),
      ...[-1, 1].flatMap((a) => [-1, 1].map((b) => [a, b * PHI, 0])),
      ...[-1, 1].flatMap((a) => [-1, 1].map((b) => [a * PHI, 0, b])),
    ],
    blurb: 'Shape 7: the ICOSAHEDRON, made of twenty triangles. Count, predict, then check. Patience, collector!',
  }),
];

export const EPILOGUE = makeShape({
  id: 'frame', name: 'Picture Frame', short: 'FRAME', color: '#b0805a', sphere: false,
  ...frame(),
  blurb: 'Something strange: a PICTURE FRAME, a solid with a tunnel straight through it. Count it like the others.',
});

export const EXPECTED = {
  tetra: [4, 6, 4], cube: [8, 12, 6], prism: [6, 9, 5], pyramid: [5, 8, 5], octa: [6, 12, 8],
  dodeca: [20, 30, 12], icosa: [12, 30, 20], frame: [16, 32, 16],
};

export function selfTest() {
  let ok = true;
  for (const s of [...LEVELS, EPILOGUE]) {
    const V = s.verts.length, E = s.edges.length, F = s.faces.length;
    const want = EXPECTED[s.id];
    const pass = want[0] === V && want[1] === E && want[2] === F;
    ok = ok && pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${s.name}: V=${V} E=${E} F=${F}  V-E+F=${V - E + F}`);
  }
  return ok;
}
