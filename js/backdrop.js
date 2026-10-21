// Radial-gradient backdrop and two cupped hands, drawn at low resolution and
// ordered-dithered so they share the lo-fi pixel grid with the 3D scene.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SKIN_HI = '#f6cfa8', SKIN_LO = '#9c5f43', OUTLINE = '#2a1610';

export function drawBackdrop(canvas, L) {
  canvas.width = L.W;
  canvas.height = L.H;
  canvas.style.width = `${L.W * L.PX}px`;
  canvas.style.height = `${L.H * L.PX}px`;
  const ctx = canvas.getContext('2d');
  const { x: sx, y: sy, r } = L.stage;

  const bg = ctx.createRadialGradient(sx, sy - r * 0.1, r * 0.2, sx, sy, Math.max(L.W, L.H) * 0.75);
  bg.addColorStop(0, '#7486dc');
  bg.addColorStop(0.18, '#3d4a90');
  bg.addColorStop(0.5, '#171d44');
  bg.addColorStop(1, '#04050c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, L.W, L.H);

  // Hands go on their own layer so the object's glow only tints skin.
  const hands = document.createElement('canvas');
  hands.width = L.W;
  hands.height = L.H;
  const h = hands.getContext('2d');
  for (const side of [-1, 1]) {
    h.save();
    h.translate(sx, sy + r * 0.14);
    h.scale(r * side, r);
    drawHand(h, r);
    h.restore();
  }
  h.globalCompositeOperation = 'source-atop';
  const glow = h.createRadialGradient(sx, sy, 0, sx, sy, r * 2);
  glow.addColorStop(0, 'rgba(150,200,255,0.45)');
  glow.addColorStop(1, 'rgba(150,200,255,0)');
  h.fillStyle = glow;
  h.fillRect(0, 0, L.W, L.H);
  h.fillStyle = 'rgba(20,10,30,0.2)'; // shadow of the floating shape on the palms
  h.beginPath();
  h.ellipse(sx, sy + r * 1.62, r * 0.4, r * 0.07, 0, 0, Math.PI * 2);
  h.fill();
  ctx.drawImage(hands, 0, 0);

  dither(ctx, L.W, L.H, 20);
}

// Left hand in stage-local units (origin = shape center, 1 unit = shape radius,
// y down). The right hand is the same drawing mirrored.
function drawHand(ctx, r) {
  const px = 1 / r;
  const skin = ctx.createLinearGradient(0, 0.85, 0, 1.95);
  skin.addColorStop(0, SKIN_HI);
  skin.addColorStop(1, SKIN_LO);

  // Sleeve and cuff.
  poly(ctx, [[-1.35, 3.2], [-0.2, 3.2], [-0.28, 2.05], [-1.1, 1.98]], '#262a55', px);
  poly(ctx, [[-1.14, 2.0], [-0.27, 2.06], [-0.28, 2.18], [-1.17, 2.12]], '#3c4488', px);

  // Wrist and palm (the bowl of the hand; the pinky edge meets the other hand).
  poly(ctx, [[-1.02, 2.02], [-0.3, 2.06], [-0.2, 1.62], [-0.98, 1.56]], skin, px);
  ctx.beginPath();
  ctx.moveTo(-0.06, 1.72);
  ctx.bezierCurveTo(-0.01, 1.48, -0.03, 1.32, -0.13, 1.24);
  ctx.bezierCurveTo(-0.4, 1.32, -0.75, 1.32, -0.98, 1.18);
  ctx.bezierCurveTo(-1.14, 1.36, -1.08, 1.64, -0.94, 1.78);
  ctx.bezierCurveTo(-0.7, 1.88, -0.3, 1.88, -0.06, 1.72);
  ctx.closePath();
  fillOutline(ctx, skin, px);

  // Crease across the palm.
  ctx.strokeStyle = 'rgba(90,45,30,0.6)';
  ctx.lineWidth = px;
  ctx.beginPath();
  ctx.moveTo(-0.85, 1.5);
  ctx.quadraticCurveTo(-0.5, 1.62, -0.2, 1.48);
  ctx.stroke();

  // Fingers curl up around the outside, from pinky (inner) to index (outer).
  const fingers = [
    [[-0.36, 1.3], [-0.4, 1.12], [-0.29, 1.06], 0.13],
    [[-0.57, 1.29], [-0.63, 1.06], [-0.5, 0.98], 0.15],
    [[-0.76, 1.26], [-0.86, 1.01], [-0.7, 0.91], 0.155],
    [[-0.93, 1.22], [-1.08, 0.98], [-0.92, 0.86], 0.16],
  ];
  for (const [b, c, t, w] of fingers) capsule(ctx, b, c, t, w, skin, px);
  capsule(ctx, [-1.0, 1.55], [-1.24, 1.3], [-1.1, 1.08], 0.17, skin, px); // thumb
}

function poly(ctx, pts, fill, px) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  fillOutline(ctx, fill, px);
}

function fillOutline(ctx, fill, px) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = px * 1.2;
  ctx.stroke();
}

// A finger: a fat rounded stroke along a curve, outlined, with a highlight.
function capsule(ctx, b, c, t, w, fill, px) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.quadraticCurveTo(c[0], c[1], t[0], t[1]);
  };
  ctx.lineCap = 'round';
  path();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + px * 2.4;
  ctx.stroke();
  path();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.save();
  ctx.translate(w * 0.18, -w * 0.15);
  path();
  ctx.strokeStyle = 'rgba(255,235,215,0.35)';
  ctx.lineWidth = w * 0.3;
  ctx.stroke();
  ctx.restore();
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
