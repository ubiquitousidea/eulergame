import * as THREE from 'three';

// Tilt-to-walk for phones. The pose the phone is held in when exploring starts
// counts as standing still. Tipping the top away walks forward, tipping it back
// walks backward, and rolling it like a steering wheel turns.
//
// Rather than raw Euler angles (gamma flips near an upright phone), each reading
// becomes the "up" direction in the phone's own frame. The rotation from the
// zero pose's up to the current up splits into a pitch part (about screen-right)
// and a roll part, whatever way the phone was held at the start.

const DEAD = 4;      // degrees of wobble that do nothing
const FULL = 20;     // degrees of tilt for full speed
const SMOOTH = 0.2;  // low-pass blend per reading
const STEP_SIGN = 1; // flip if forward and back come out reversed on a device
const TURN_SIGN = 1; // flip if left and right come out reversed
const WAIT_MS = 600; // how long request() waits for a first reading

const RAD = Math.PI / 180;
const X = new THREE.Vector3(1, 0, 0);

export class Tilt {
  constructor() {
    this.live = false;  // readings are arriving
    this.listening = false;
    this.g = null;      // smoothed up vector, screen-aligned device frame
    this.g0 = null;     // up vector of the zero pose
    this.w = new THREE.Vector3();
    this.pitchAxis = new THREE.Vector3();
    this.rollAxis = new THREE.Vector3();
    this.onReading = (e) => this.reading(e);
    const rotated = () => this.recenter(true);
    if (screen.orientation) screen.orientation.addEventListener('change', rotated);
    else window.addEventListener('orientationchange', rotated);
  }

  // Ask for motion data. Call it straight from a tap: iOS only shows its
  // permission prompt inside a user gesture. Resolves to whether readings arrive.
  request() {
    if (this.live) return Promise.resolve(true);
    if (!('DeviceOrientationEvent' in window)) return Promise.resolve(false);
    const ask = DeviceOrientationEvent.requestPermission;
    const granted = typeof ask === 'function'
      ? ask.call(DeviceOrientationEvent).then((r) => r === 'granted', () => false)
      : Promise.resolve(true);
    return granted.then((ok) => {
      if (!ok) return false;
      if (!this.listening) window.addEventListener('deviceorientation', this.onReading);
      this.listening = true;
      // Desktop browsers define the event but never fire it, so wait briefly.
      return new Promise((resolve) => {
        const start = performance.now();
        const poll = () => {
          if (this.live || performance.now() - start > WAIT_MS) resolve(this.live);
          else setTimeout(poll, 50);
        };
        poll();
      });
    });
  }

  // Make the current pose the zero. After the screen rotates, the axes jump,
  // so the smoothing starts over too.
  recenter(rotated = false) {
    if (rotated) this.g = null;
    this.g0 = this.g ? this.g.clone() : null;
  }

  reading(e) {
    if (e.beta === null || e.gamma === null) return;
    this.live = true;
    const b = e.beta * RAD, c = e.gamma * RAD;
    const x = -Math.cos(b) * Math.sin(c), y = Math.sin(b), z = Math.cos(b) * Math.cos(c);
    // Turn the device frame into the screen's, so x is screen-right in landscape too.
    const a = ((screen.orientation ? screen.orientation.angle : window.orientation) || 0) * RAD;
    const raw = new THREE.Vector3(
      x * Math.cos(a) - y * Math.sin(a),
      x * Math.sin(a) + y * Math.cos(a),
      z,
    );
    if (this.g) this.g.lerp(raw, SMOOTH).normalize();
    else this.g = raw;
    if (!this.g0) this.g0 = this.g.clone();
  }

  // { step, turn }, each in [-1, 1].
  read() {
    if (!this.g || !this.g0) return { step: 0, turn: 0 };
    this.w.crossVectors(this.g0, this.g);
    this.pitchAxis.copy(X).addScaledVector(this.g0, -X.dot(this.g0)).normalize();
    this.rollAxis.crossVectors(this.g0, this.pitchAxis);
    const pitch = Math.asin(THREE.MathUtils.clamp(this.w.dot(this.pitchAxis), -1, 1)) / RAD;
    const roll = Math.asin(THREE.MathUtils.clamp(this.w.dot(this.rollAxis), -1, 1)) / RAD;
    return { step: STEP_SIGN * speed(pitch), turn: TURN_SIGN * speed(roll) };
  }
}

function speed(deg) {
  return Math.sign(deg) * THREE.MathUtils.clamp((Math.abs(deg) - DEAD) / (FULL - DEAD), 0, 1);
}
