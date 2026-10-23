// Radial-gradient backdrop, drawn at low resolution and ordered-dithered so it
// shares the lo-fi pixel grid with the 3D scene.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

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

  dither(ctx, L.W, L.H, 20);
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
