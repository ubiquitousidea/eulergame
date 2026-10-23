import * as THREE from 'three';

// One hue per type, in three steps: resting, waiting to be counted (the active
// phase), and lit once counted.
export const HUES = {
  vertices: { base: '#5d7480', idle: '#90aab4', lit: '#6fe3ff' },
  edges: { base: '#3a2c14', idle: '#a08a58', lit: '#ffd34d' },
  faces: { base: '#a85f7e', idle: '#c27c99', lit: '#ff6fae' },
};
for (const h of Object.values(HUES)) for (const k in h) h[k] = new THREE.Color(h[k]);
const TYPES = ['vertices', 'edges', 'faces'];
const CLICK_SLOP = 6; // CSS px of movement before a press becomes a drag
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const VERTEX_R = 0.065, EDGE_R = 0.03;
const _tmp = new THREE.Color();

// Invisible but raycastable: generous hit targets for tiny vertices and edges.
const PROXY_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false; // the world draws first, then this on top

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.group = new THREE.Group(); // bobs up and down
    this.spin = new THREE.Group();  // player-controlled rotation
    this.group.add(this.spin);
    this.scene.add(this.group);

    this.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x4a4a78, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 4, 5);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.2);
    rim.position.set(-4, 1, -3);
    this.scene.add(key, rim);

    this.ray = new THREE.Raycaster();
    this.items = { vertices: [], edges: [], faces: [] };
    this.candidates = [];
    this.phase = null;
    this.hovered = null;
    this.pulseUntil = 0;
    this.time = 0;
    this.vel = new THREE.Vector2();
    this.drag = null;
    this.onPick = null;
    this.compact = false; // shrink and lower the shape to make room for a title
    this.compactAmt = 0;
    this.visible = false; // shown (and clickable) only while studying a shape
    this.appear = 0;

    // Dims the world behind the shape.
    this.dimScene = new THREE.Scene();
    this.dimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.dim = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0x04050c, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.dimScene.add(this.dim);

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    canvas.addEventListener('pointerleave', () => this.visible && this.setHover(null));
  }

  // Renders on the scene grid (L.scene), but positions in and out of the stage
  // are in HUD fat pixels.
  resize(L) {
    this.L = L;
    const S = L.scene;
    this.renderer.setSize(S.W, S.H, false);
    this.canvas.style.width = `${S.W * S.PX}px`;
    this.canvas.style.height = `${S.H * S.PX}px`;
    // Distance chosen so the unit-radius shape spans S.r low-res pixels,
    // and the view offset puts the origin at the stage center.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    this.camera.aspect = S.W / S.H;
    this.camera.position.set(0, 0, S.H / 2 / (Math.tan(fov / 2) * S.r));
    this.camera.setViewOffset(S.W, S.H, S.W / 2 - S.x, S.H / 2 - S.y, S.W, S.H);
    this.camera.updateProjectionMatrix();
  }

  loadShape(shape) {
    this.shape = shape;
    for (const child of [...this.spin.children]) {
      this.spin.remove(child);
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== PROXY_MAT) o.material.dispose();
      });
    }
    this.items = { vertices: [], edges: [], faces: [] };
    this.hovered = null;
    const V = shape.verts.map((p) => new THREE.Vector3(...p));

    shape.faces.forEach((loop, id) => {
      const pos = [];
      for (let k = 1; k < loop.length - 1; k++) {
        for (const idx of [loop[0], loop[k], loop[k + 1]]) pos.push(V[idx].x, V[idx].y, V[idx].z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: HUES.faces.base, flatShading: true, roughness: 0.55, metalness: 0.05,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { type: 'faces', id };
      this.spin.add(mesh);
      const center = loop.reduce((acc, i) => acc.add(V[i]), new THREE.Vector3()).divideScalar(loop.length);
      this.items.faces.push({ id, mesh, proxy: mesh, center, collected: false, flash: 0 });
    });

    shape.edges.forEach(([a, b], id) => {
      const dir = V[b].clone().sub(V[a]);
      const len = dir.length();
      const mid = V[a].clone().add(V[b]).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize());
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(EDGE_R, EDGE_R, len, 6, 1),
        new THREE.MeshStandardMaterial({ color: HUES.edges.base, roughness: 0.4 }),
      );
      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len * 0.9, 6, 1), PROXY_MAT);
      for (const m of [mesh, proxy]) {
        m.position.copy(mid);
        m.quaternion.copy(quat);
        this.spin.add(m);
      }
      proxy.userData = { type: 'edges', id };
      this.items.edges.push({ id, mesh, proxy, center: mid, collected: false, flash: 0 });
    });

    V.forEach((p, id) => {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(VERTEX_R, 1),
        new THREE.MeshStandardMaterial({ color: HUES.vertices.base, roughness: 0.3 }),
      );
      const proxy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), PROXY_MAT);
      mesh.position.copy(p);
      proxy.position.copy(p);
      proxy.userData = { type: 'vertices', id };
      this.spin.add(mesh, proxy);
      this.items.vertices.push({ id, mesh, proxy, center: p.clone(), collected: false, flash: 0 });
    });

    this.setPhase(null);
    this.resetView();
  }

  resetView() {
    this.spin.quaternion.setFromEuler(new THREE.Euler(0.4, -0.55, 0));
    this.vel.set(0, 0);
  }

  // phase: 'vertices' | 'edges' | 'faces' make that type pickable; anything else idles.
  setPhase(phase) {
    this.phase = phase;
    this.setHover(null);
    if (!TYPES.includes(phase)) {
      this.candidates = [];
      return;
    }
    // Faces are always included so they occlude elements on the far side.
    const faces = this.items.faces.map((it) => it.mesh);
    this.candidates = phase === 'faces' ? faces : [...this.items[phase].map((it) => it.proxy), ...faces];
  }

  markCollected(type, id) {
    const it = this.items[type][id];
    it.collected = true;
    it.flash = 1; // brief overshoot so the pick visibly switches on
  }

  pulse() {
    this.pulseUntil = this.time + 1.8;
  }

  // Screen position of an element in HUD fat pixels, for feedback drawn at the pick.
  project(type, id) {
    const v = this.items[type][id].center.clone();
    this.spin.localToWorld(v);
    v.project(this.camera);
    const S = this.L.scene, k = S.PX / this.L.PX;
    return { x: ((v.x + 1) / 2) * S.W * k, y: ((1 - v.y) / 2) * S.H * k };
  }

  pickAt(clientX, clientY) {
    if (!this.candidates.length) return null;
    const S = this.L.scene;
    const ndc = new THREE.Vector2(
      (clientX / S.PX / S.W) * 2 - 1,
      -(clientY / S.PX / S.H) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.candidates, false)[0];
    if (!hit || hit.object.userData.type !== this.phase) return null;
    return hit.object.userData;
  }

  rotateBy(dx, dy) {
    const q = new THREE.Quaternion();
    this.spin.quaternion.premultiply(q.setFromAxisAngle(Y_AXIS, dx * 0.012));
    this.spin.quaternion.premultiply(q.setFromAxisAngle(X_AXIS, dy * 0.012));
  }

  down(e) {
    if (!this.visible) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { lastX: e.clientX, lastY: e.clientY, moved: 0, lastT: performance.now() };
    this.vel.set(0, 0);
  }

  move(e) {
    if (!this.visible) return;
    if (!this.drag) {
      this.setHover(this.pickAt(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - this.drag.lastX, dy = e.clientY - this.drag.lastY;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    this.drag.lastX = e.clientX;
    this.drag.lastY = e.clientY;
    if (this.drag.moved > CLICK_SLOP) {
      this.rotateBy(dx, dy);
      this.vel.set(dx, dy);
      this.drag.lastT = performance.now();
      this.canvas.style.cursor = 'grabbing';
      this.setHover(null);
    }
  }

  up(e) {
    if (!this.drag) return;
    if (this.drag.moved <= CLICK_SLOP) {
      const hit = this.pickAt(e.clientX, e.clientY);
      if (hit && this.onPick) this.onPick(hit.type, hit.id);
    } else if (performance.now() - this.drag.lastT > 80) {
      this.vel.set(0, 0); // released after holding still: no fling
    }
    this.drag = null;
    this.canvas.style.cursor = this.hovered ? 'pointer' : 'grab';
  }

  setHover(hit) {
    this.hovered = hit;
    if (this.visible) this.canvas.style.cursor = hit ? 'pointer' : this.drag ? 'grabbing' : 'grab';
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.compactAmt += ((this.compact ? 1 : 0) - this.compactAmt) * Math.min(1, dt * 4);
    // Grows in when shown and shrinks away when hidden, over a quarter second.
    this.appear = Math.max(0, Math.min(1, this.appear + (this.visible ? dt : -dt) * 4));
    const pop = this.appear * this.appear * (3 - 2 * this.appear);
    this.group.scale.setScalar((1 - 0.3 * this.compactAmt) * pop);
    this.group.position.y = Math.sin(t * 1.3) * 0.04 - 0.3 * this.compactAmt;
    if (!this.drag) {
      if (this.vel.lengthSq() > 0.0004) {
        this.rotateBy(this.vel.x, this.vel.y);
        this.vel.multiplyScalar(0.92);
      } else if (!TYPES.includes(this.phase)) {
        this.rotateBy(0.25, 0); // idle turntable when not counting
      }
    }
    this.updateLook(t, dt);
  }

  updateLook(t, dt) {
    const pulse = t < this.pulseUntil ? 0.5 + 0.5 * Math.sin(t * 12) : 0;
    const hov = this.hovered;
    for (const type of TYPES) {
      const active = this.phase === type;
      const hue = HUES[type];
      // Faces are large, so they glow less to keep their shading readable.
      const glow = (type === 'faces' ? 0.4 : 0.85) * (active ? 1 : 0.5);
      for (const it of this.items[type]) {
        const mat = it.mesh.material;
        const isHover = hov && hov.type === type && hov.id === it.id;
        it.flash = Math.max(0, it.flash - dt * 3);
        mat.emissive.setRGB(0, 0, 0);
        if (it.collected) {
          mat.color.copy(hue.lit);
          mat.emissive.copy(hue.lit).multiplyScalar(glow + it.flash * 0.8);
        } else {
          mat.color.copy(active ? hue.idle : hue.base);
          if (active && pulse) mat.emissive.copy(hue.lit).multiplyScalar(pulse * 0.6);
        }
        if (isHover) mat.emissive.add(_tmp.copy(hue.lit).multiplyScalar(0.3));
        const pop = 1 + it.flash * 0.4;
        if (type === 'vertices') it.mesh.scale.setScalar((active ? 1.35 : 0.8) * pop);
        if (type === 'edges') it.mesh.scale.set((active ? 1.5 : 1) * pop, 1, (active ? 1.5 : 1) * pop);
      }
    }
  }

  render() {
    if (!this.appear) return;
    this.dim.material.opacity = 0.55 * this.appear;
    this.renderer.clearDepth();
    this.renderer.render(this.dimScene, this.dimCam);
    this.renderer.render(this.scene, this.camera);
  }
}
