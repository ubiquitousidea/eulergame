// Tiny square-wave blips. Audio starts lazily on the first user gesture.
let ac = null;

function blip(freq, dur = 0.08, type = 'square', vol = 0.04, delay = 0) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch {
    // No audio available; the game works silently.
  }
}

const BASE = { vertices: 523, edges: 392, faces: 330 };

export const sfx = {
  collect(type, n) {
    blip(BASE[type] * Math.pow(2, ((n - 1) % 12) / 12));
  },
  dud() {
    blip(130, 0.12, 'sawtooth', 0.03);
  },
  click() {
    blip(880, 0.03, 'square', 0.025);
  },
  success() {
    [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.12, 'square', 0.04, i * 0.09));
  },
};
