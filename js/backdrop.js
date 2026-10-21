// Radial-gradient backdrop and two cupped hands, drawn at low resolution and
// ordered-dithered so they share the lo-fi pixel grid with the 3D scene.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SKIN = '#f3c9a6', SKIN_SHADE = '#dda283', SKIN_LIGHT = '#fde6d2', OUTLINE = '#7a4634';

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
  const H = L.hands;
  for (const side of [-1, 1]) {
    h.save();
    h.translate(H.x, H.y);
    h.scale(H.r * side, H.r);
    drawHand(h, H.r);
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
  h.ellipse(H.x, H.y + H.r * 1.3, H.r * 0.45, H.r * 0.07, 0, 0, Math.PI * 2);
  h.fill();
  ctx.drawImage(hands, 0, 0);

  dither(ctx, L.W, L.H, 20);
}

// Left hand in stage-local units (origin = shape center, 1 unit = shape radius,
// y down). The right hand is the same drawing mirrored. Each hand is a soft
// mitten blob: overlapping ellipses filled as one shape, outlined, and shaded.
const ELLIPSES = {
  arm: [-0.5, 2.05, 0.27, 0.5, 0.22],
  palm: [-0.5, 1.4, 0.53, 0.29, 0.3],
  tip: [-0.9, 1.17, 0.21, 0.23, 0], // the curled-up mitten end
};

function drawHand(ctx, r) {
  const px = 1 / r;
  const blob = new Path2D();
  for (const [x, y, rx, ry, rot] of Object.values(ELLIPSES)) {
    blob.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    blob.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  }

  // Sleeve: a plain rounded cuff the arm disappears into.
  ctx.fillStyle = '#323a7a';
  ctx.strokeStyle = '#151a3d';
  ctx.lineWidth = px * 1.5;
  ctx.beginPath();
  ctx.roundRect(-0.86, 2.3, 0.62, 1.2, 0.14);
  ctx.fill();
  ctx.stroke();

  // Outline first, thick, so the fill hides the seams between ellipses.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = px * 3;
  ctx.stroke(blob);
  ctx.fillStyle = SKIN;
  ctx.fill(blob);

  ctx.save();
  ctx.clip(blob);
  ctx.fillStyle = SKIN_SHADE; // underside in shadow
  ctx.beginPath();
  ctx.ellipse(-0.45, 1.98, 0.8, 0.32, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SKIN_LIGHT; // glossy top of the palm and mitten tip
  ctx.beginPath();
  ctx.ellipse(-0.6, 1.25, 0.3, 0.06, 0.25, 0, Math.PI * 2);
  ctx.ellipse(-0.9, 1.05, 0.07, 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
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
