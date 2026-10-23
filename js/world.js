import * as THREE from 'three';
import { LEVELS, EPILOGUE } from './polyhedra.js';
import { HUES } from './scene.js';
import { Tilt } from './tilt.js';

// The walkable world: a dirt clearing ringed by forest under a blue sky, with
// every polyhedron floating in a line. Rendered first-person on the scene grid
// (L.scene), so it shares the chunky pixels of the counting stage.

const SHAPES = [...LEVELS, EPILOGUE];
const EYE = 1.6;
const FLOAT_Y = 2.3;
const SHAPE_SCALE = 1;
const SPACING = 6;            // between shapes along the line (z axis)
const SIDE_VIEW = 26;         // keyboard start: this far from the line, facing it square on
const END_VIEW = { x: 6, z: 32 }; // touch start: looking down the line, so every shape fits a portrait phone
const CLEARING = 44;          // the player stays inside this radius
const KEEP_OUT = 1.6;         // and at least this far from each shape's center
const WALK_SPEED = 5;         // units per second
const TURN_SPEED = 2;         // radians per second
const REACH = 10;             // how close the player must be to click a shape
const CLICK_SLOP = 6;         // CSS px of movement before a press stops being a click
const KEYS = {
  ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'strafeL', KeyX: 'strafeR',
};
const SKY = { horizon: new THREE.Color('#c4e6ff'), zenith: new THREE.Color('#3d86e0') };
const GREENS = ['#2f7d3a', '#3e9348', '#24612d'];
const DIRT = { base: [122, 82, 48], dark: [78, 50, 27], pebble: [158, 118, 78] };
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class World {
  constructor(renderer, canvas) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.horizon, 45, 160);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.camera.rotation.order = 'YXZ';
    this.ray = new THREE.Raycaster();
    // Phones walk by tilting, if they can, and may tap any shape in view either way.
    this.touch = window.matchMedia('(pointer: coarse)').matches;
    this.tilt = new Tilt();
    this.active = false; // walking and clicking shapes
    this.target = 0;
    this.epilogueShown = false;
    this.onPick = null;
    this.keys = new Set();
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.focusYaw = null;
    this.walk = 0;
    this.time = 0;
    this.press = null;

    this.scene.add(new THREE.HemisphereLight('#d6ecff', '#6b4a2b', 1.3));
    const sun = new THREE.DirectionalLight('#fff4dd', 2.2);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);
    this.clouds = clouds();
    this.scene.add(skyDome(), ground(), forest(), this.clouds);
    this.models = SHAPES.map((s, i) => this.addModel(s, i));
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.6, 4),
      new THREE.MeshBasicMaterial({ color: '#ffd34d' }),
    );
    this.marker.rotation.x = Math.PI; // point down at the target
    this.scene.add(this.marker);

    window.addEventListener('keydown', (e) => {
      const k = KEYS[e.code];
      if (!k) return;
      this.keys.add(k);
      if (this.active && e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(KEYS[e.code]));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => {
      if (this.active) this.press = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      const hit = this.pickAt(e.clientX, e.clientY);
      canvas.style.cursor = hit && hit.index === this.target ? 'pointer' : 'default';
    });
    canvas.addEventListener('pointerup', (e) => {
      const p = this.press;
      this.press = null;
      if (!p || !this.active) return;
      if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > CLICK_SLOP) return;
      const hit = this.pickAt(e.clientX, e.clientY);
      if (hit && this.onPick) this.onPick(hit.index, hit.far);
    });

    this.reset();
  }

  addModel(shape, index) {
    const V = shape.verts.map((p) => new THREE.Vector3(...p));
    const pos = [];
    for (const loop of shape.faces) {
      for (let k = 1; k < loop.length - 1; k++) {
        for (const idx of [loop[0], loop[k], loop[k + 1]]) pos.push(V[idx].x, V[idx].y, V[idx].z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const faceMat = new THREE.MeshStandardMaterial({
      flatShading: true, roughness: 0.55, metalness: 0.05,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    const mesh = new THREE.Mesh(geo, faceMat);
    mesh.userData.index = index;
    const lpos = shape.edges.flatMap(([a, b]) => [...V[a].toArray(), ...V[b].toArray()]);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    const lineMat = new THREE.LineBasicMaterial();
    const model = new THREE.Group();
    model.add(mesh, new THREE.LineSegments(lgeo, lineMat));
    model.scale.setScalar(SHAPE_SCALE);
    model.position.set(0, FLOAT_Y, (SPACING * (SHAPES.length - 1)) / 2 - SPACING * index);
    this.scene.add(model);
    return { model, mesh, faceMat, lineMat };
  }

  // Back to the start: nothing counted, the frame hidden, the player at the start.
  reset() {
    if (this.touch) {
      // Face halfway between the first and last shape to keep the whole line in
      // view, since a phone may not be able to walk or turn.
      this.pos.set(END_VIEW.x, 0, END_VIEW.z);
      const ends = [0, SHAPES.length - 1].map((i) => this.models[i].model.position);
      this.yaw = ends.reduce((sum, p) => sum + this.yawTo(p), 0) / 2;
    } else {
      // Face the shapes on show square on, so they read left to right in order.
      const mid = (this.models[0].model.position.z + this.models[LEVELS.length - 1].model.position.z) / 2;
      this.pos.set(SIDE_VIEW, 0, mid);
      this.yaw = this.yawTo(new THREE.Vector3(0, 0, mid));
    }
    this.focusYaw = null;
    this.active = false;
    this.target = 0;
    this.epilogueShown = false;
    this.keys.clear();
    this.models.forEach((m, i) => {
      m.model.visible = i < LEVELS.length;
      this.setCounted(i, false);
    });
  }

  // Walk around and look for shape `index`.
  explore(index) {
    this.target = index;
    this.active = true;
    this.focusYaw = null;
    this.tilt.recenter(); // however the phone is held now is standing still
    this.models.forEach((m, i) => (m.model.visible = i < LEVELS.length || this.epilogueShown));
    this.canvas.style.cursor = 'default';
  }

  // The player clicked shape `index`: stop walking, turn to face it, and hide this
  // copy while the counting stage shows it up close.
  enter(index) {
    this.active = false;
    this.keys.clear();
    this.focusYaw = this.yawTo(this.models[index].model.position);
    this.models[index].model.visible = false;
  }

  yawTo(p) {
    return Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
  }

  showEpilogue() {
    this.epilogueShown = true;
  }

  setCounted(index, counted) {
    const { faceMat, lineMat } = this.models[index];
    faceMat.color.copy(counted ? HUES.faces.lit : HUES.faces.base);
    faceMat.emissive.copy(HUES.faces.lit).multiplyScalar(counted ? 0.3 : 0);
    lineMat.color.copy(counted ? HUES.edges.lit : HUES.edges.base);
  }

  markCounted(index) {
    this.setCounted(index, true);
  }

  // Nearer shapes block farther ones, except that the target always wins, since
  // from the start the line of shapes overlaps itself.
  pickAt(clientX, clientY) {
    const S = this.L.scene;
    const ndc = new THREE.Vector2(
      (clientX / S.PX / S.W) * 2 - 1,
      -(clientY / S.PX / S.H) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    const meshes = this.models.filter((m) => m.model.visible).map((m) => m.mesh);
    const hits = this.ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits.find((h) => h.object.userData.index === this.target) || hits[0];
    const index = hit.object.userData.index;
    const p = this.models[index].model.position;
    const far = !this.touch && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > REACH;
    return { index, far };
  }

  // Screen position just above a shape, in HUD fat pixels.
  project(index) {
    const v = this.models[index].model.position.clone();
    v.y += 1;
    v.project(this.camera);
    const S = this.L.scene, k = S.PX / this.L.PX;
    return { x: ((v.x + 1) / 2) * S.W * k, y: ((1 - v.y) / 2) * S.H * k };
  }

  resize(L) {
    this.L = L;
    this.camera.aspect = L.scene.W / L.scene.H;
    this.camera.updateProjectionMatrix();
  }

  move(dt) {
    const k = this.keys;
    const tilt = this.tilt.read();
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const turn = clamp((k.has('left') ? 1 : 0) - (k.has('right') ? 1 : 0) + tilt.turn);
    const step = clamp((k.has('fwd') ? 1 : 0) - (k.has('back') ? 1 : 0) + tilt.step);
    const side = (k.has('strafeR') ? 1 : 0) - (k.has('strafeL') ? 1 : 0);
    this.yaw += turn * TURN_SPEED * dt;
    if (!step && !side) return;
    // Keys give full speed (diagonals included); a gentle tilt gives less.
    const len = Math.hypot(step, side), pace = Math.min(1, len);
    const d = (WALK_SPEED * dt * pace) / len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const p = this.pos;
    p.x += (-sin * step + cos * side) * d;
    p.z += (-cos * step - sin * side) * d;
    this.walk += dt * 10 * pace;
    const r = Math.hypot(p.x, p.z);
    if (r > CLEARING) p.multiplyScalar(CLEARING / r);
    for (const { model } of this.models) {
      if (!model.visible) continue;
      const dx = p.x - model.position.x, dz = p.z - model.position.z;
      const l = Math.hypot(dx, dz);
      if (l > 0 && l < KEEP_OUT) {
        p.x = model.position.x + (dx / l) * KEEP_OUT;
        p.z = model.position.z + (dz / l) * KEEP_OUT;
      }
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (this.active) this.move(dt);
    else if (this.focusYaw !== null) {
      const diff = Math.atan2(Math.sin(this.focusYaw - this.yaw), Math.cos(this.focusYaw - this.yaw));
      this.yaw += diff * Math.min(1, dt * 8);
    }
    this.camera.position.set(this.pos.x, EYE + Math.sin(this.walk) * 0.05, this.pos.z);
    this.camera.rotation.set(0, this.yaw, 0);
    this.models.forEach(({ model }, i) => {
      model.position.y = FLOAT_Y + Math.sin(t * 1.3 + i) * 0.12;
      model.rotation.set(0.35, t * 0.5 + i, 0);
    });
    const target = this.models[this.target];
    this.marker.visible = !!target && target.model.visible;
    if (target) {
      this.marker.position.copy(target.model.position);
      this.marker.position.y += 1.5 + Math.sin(t * 3) * 0.1;
      this.marker.rotation.y = t * 2;
    }
    this.clouds.rotation.y = t * 0.004;
  }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }
}

// Small seeded random, so the forest and clouds are the same on every load.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pale at the horizon, deeper blue overhead.
function skyDome() {
  const geo = new THREE.SphereGeometry(300, 24, 12);
  const pos = geo.attributes.position, col = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 300);
    c.copy(SKY.horizon).lerp(SKY.zenith, Math.pow(t, 0.6));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  mesh.renderOrder = -1;
  return mesh;
}

function clouds() {
  const rand = rng(3);
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff', emissive: '#8da3c0', roughness: 1, flatShading: true, fog: false,
  });
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    const a = (i / 6) * Math.PI * 2 + rand() * 0.6, r = 160 + rand() * 50;
    cloud.position.set(Math.cos(a) * r, 45 + rand() * 25, Math.sin(a) * r);
    const n = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(geo, mat);
      const size = 5 + rand() * 5;
      puff.position.set((k - n / 2) * 6 + rand() * 3, rand() * 3, rand() * 4);
      puff.scale.set(size * 1.3, size * 0.7, size);
      cloud.add(puff);
    }
    cloud.lookAt(0, cloud.position.y, 0);
    group.add(cloud);
  }
  return group;
}

function forest() {
  const rand = rng(7);
  const N = 260;
  const canopy = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    N,
  );
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.28, 1, 5).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 1, flatShading: true }),
    N,
  );
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2, r = 52 + rand() * 18;
    const h = 4 + rand() * 5, w = 1.2 + rand() * 1.2, th = 0.8 + rand() * 0.6;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    trunk.setMatrixAt(i, m.compose(p, q, s.set(1, th, 1)));
    p.y = th;
    canopy.setMatrixAt(i, m.compose(p, q, s.set(w, h, w)));
    canopy.setColorAt(i, c.set(GREENS[i % GREENS.length]));
  }
  const group = new THREE.Group();
  group.add(canopy, trunk);
  return group;
}

function ground() {
  const tex = new THREE.CanvasTexture(dirtCanvas());
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  tex.magFilter = THREE.NearestFilter; // chunky texels up close, mipmaps far away
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshLambertMaterial({ map: tex }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// Brown dirt with dark specks and a few pebbles, dithered into coarse steps.
function dirtCanvas() {
  const n = 64, rand = rng(11);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const roll = rand();
    const [r, g, b] = roll < 0.06 ? DIRT.dark : roll < 0.09 ? DIRT.pebble : DIRT.base;
    const j = (rand() - 0.5) * 30;
    img.data.set([r + j, g + j * 0.8, b + j * 0.6, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  dither(ctx, n, n, 16);
  return canvas;
}

// Ordered (Bayer) dithering into coarse color steps: the lo-fi banding.
function dither(ctx, w, h, step) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const th = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * step;
      for (let c = 0; c < 3; c++) {
        d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] + th) / step) * step));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
