/**
 * covers — a small map of the universal cover of each torus, drawn under its panel.
 *
 * The torus is unfolded along the engine's fixed tree of faces (`developNet`), and the
 * unfolding is laid down again at every translate i v1 + j v2 by the two periods read off the
 * marking loops (`modulus`). For a flat torus, the flattened one and the corrected one, these
 * copies tile the plane: that is its universal cover with the triangulation lifted. The lift is
 * not flat, its periods are those of its pseudo-modulus and its unfolding does not close up,
 * so its copies leave slits and overlap. The copies are filled translucently, so an overlap
 * shows darker and a slit shows white. One copy, the unfolding itself, is outlined darker.
 *
 * Every map is turned so that v1 points to the right, and all three share one scale, that of
 * Ψ, so the corrected torus's cover is Ψ's lattice again. The square grid of the sheet of Ψ is
 * drawn on every face (major lines only), in the coordinates of the paper (`./paper/atlasPaper`):
 * on the lift its cells are what the change of modulus makes of a square, and the grid breaks
 * across the cut edges.
 *
 * Impure render boundary (canvas).
 */

import type { Triangulation } from '@core/topology/triangulation.ts';
import type { Vec2 } from '@core/geometry/vec2.ts';
import { ownSheet } from './paper/atlasPaper.ts';

export interface CoverStyle {
  readonly fill: string;
  readonly grid: string;
  readonly edge: string;
  readonly home: string;
  readonly label: string;
}

const STYLE: CoverStyle = {
  fill: 'rgba(150, 150, 150, 0.30)',
  grid: 'rgba(110, 110, 110, 0.32)',
  edge: 'rgba(90, 90, 90, 0.75)',
  home: '#2a2a2a',
  label: '#8a8a8f',
};

/**
 * Draw the cover of `positions` into `canvas` (already sized in device pixels).
 * `unit` is the number of CSS pixels per unit length, the same for the three maps.
 */
export function drawCover(
  canvas: HTMLCanvasElement,
  triang: Triangulation,
  positions: ArrayLike<number>,
  basis: { readonly a: Vec2; readonly b: Vec2 },
  unit: number,
  dpr: number,
  label: string,
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const sheet = ownSheet(triang, positions, basis, 'modulus');
  const { corners, v1, v2, toGrid } = sheet;
  // turn v1 to the right; the y axis of the canvas points down, so flip it
  const ang = -Math.atan2(v1[1], v1[0]);
  const c = Math.cos(ang), s = Math.sin(ang);
  let cx = 0, cy = 0, n = 0;
  for (const tri of corners) for (const p of tri) { cx += p[0]; cy += p[1]; n++; }
  cx /= n; cy /= n;
  const toScreen = (x: number, y: number): Vec2 => {
    const X = x - cx, Y = y - cy;
    return [W / 2 + unit * (c * X - s * Y), H / 2 - unit * (s * X + c * Y)];
  };

  // which translates can reach the map: a generous box in lattice steps
  const reach = Math.hypot(W, H) / unit;
  const short = Math.min(Math.hypot(v1[0], v1[1]), Math.hypot(v2[0], v2[1]), Math.abs(v1[0] * v2[1] - v1[1] * v2[0]) / Math.max(Math.hypot(v1[0], v1[1]), Math.hypot(v2[0], v2[1])));
  const N = Math.min(12, Math.ceil(reach / Math.max(short, 1e-9)) + 1);
  const back = invert(toGrid);

  const tri3 = (tri: readonly Vec2[], ox: number, oy: number): Vec2[] => tri.map((p) => toScreen(p[0] + ox, p[1] + oy));
  const visible = (q: Vec2[]): boolean => q.some((p) => p[0] > -4 && p[0] < W + 4 && p[1] > -4 && p[1] < H + 4)
    || (Math.min(...q.map((p) => p[0])) < W && Math.max(...q.map((p) => p[0])) > 0 && Math.min(...q.map((p) => p[1])) < H && Math.max(...q.map((p) => p[1])) > 0);

  const copies: { i: number; j: number; tris: Vec2[][]; raw: (readonly Vec2[])[] ; ox: number; oy: number }[] = [];
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const ox = i * v1[0] + j * v2[0], oy = i * v1[1] + j * v2[1];
    const tris = corners.map((t) => tri3(t, ox, oy));
    if (!tris.some(visible)) continue;
    copies.push({ i, j, tris, raw: corners, ox, oy });
  }

  // the faces, translucent, so overlaps darken and slits stay white
  ctx.fillStyle = STYLE.fill;
  for (const cp of copies) for (const q of cp.tris) {
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath(); ctx.fill();
  }

  // the grid, face by face, in the paper's coordinates
  ctx.strokeStyle = STYLE.grid;
  ctx.lineWidth = 0.6;
  for (const cp of copies) cp.raw.forEach((t, f) => {
    const q = cp.tris[f];
    if (!visible(q)) return;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath(); ctx.clip();
    // grid coordinates of the face's corners, in its own unfolding (the copy's translate is a whole number of steps)
    const g = t.map((p) => apply(toGrid, p));
    const gx0 = Math.floor(Math.min(...g.map((p) => p[0]))), gx1 = Math.ceil(Math.max(...g.map((p) => p[0])));
    const gy0 = Math.floor(Math.min(...g.map((p) => p[1]))), gy1 = Math.ceil(Math.max(...g.map((p) => p[1])));
    const line = (a: Vec2, b: Vec2): void => {
      const A = apply(back, a), B = apply(back, b);
      const P = toScreen(A[0] + cp.ox, A[1] + cp.oy), Q = toScreen(B[0] + cp.ox, B[1] + cp.oy);
      ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); ctx.stroke();
    };
    for (let k = gx0; k <= gx1; k++) line([k, gy0 - 1], [k, gy1 + 1]);           // major lines only
    for (let k = gy0; k <= gy1; k++) line([gx0 - 1, k], [gx1 + 1, k]);
    ctx.restore();
  });

  // the triangulation's edges, and the unfolding itself outlined darker
  ctx.lineJoin = 'round';
  for (const cp of copies) {
    const home = cp.i === 0 && cp.j === 0;
    ctx.strokeStyle = home ? STYLE.home : STYLE.edge;
    ctx.lineWidth = home ? 1.1 : 0.6;
    for (const q of cp.tris) {
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath(); ctx.stroke();
    }
  }
  // the home copy once more on top, so its outline is not covered by its neighbours' edges
  const home = copies.find((cp) => cp.i === 0 && cp.j === 0);
  if (home) {
    ctx.strokeStyle = STYLE.home; ctx.lineWidth = 1.1;
    for (const q of home.tris) {
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath(); ctx.stroke();
    }
  }

  // the label, on a white ground so it reads over the drawing
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath(); ctx.roundRect(3, 3, tw + 10, 16, 4); ctx.fill();
  ctx.fillStyle = STYLE.label;
  ctx.fillText(label, 8, 5);
}

/**
 * The width and height of the unfolding of `positions` once v1 is turned to the right: what a
 * map must hold for the unfolding to fit.
 */
export function unfoldingExtent(triang: Triangulation, positions: ArrayLike<number>, basis: { readonly a: Vec2; readonly b: Vec2 }): { w: number; h: number } {
  const { corners, v1 } = ownSheet(triang, positions, basis, 'modulus');
  const ang = -Math.atan2(v1[1], v1[0]), c = Math.cos(ang), s = Math.sin(ang);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const tri of corners) for (const p of tri) {
    const x = c * p[0] - s * p[1], y = s * p[0] + c * p[1];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { w: x1 - x0, h: y1 - y0 };
}

function apply(m: readonly [number, number, number, number], p: readonly [number, number]): Vec2 {
  return [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
}
function invert(m: readonly [number, number, number, number]): [number, number, number, number] {
  const d = m[0] * m[3] - m[1] * m[2];
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
}
