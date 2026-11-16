/**
 * squarePaper — graph paper with SQUARE cells and evenly wide lines, on a flat torus of any shape.
 *
 * `@display/viewer/gridTexture.latticeEdgeTexture` prints the paper in LATTICE coordinates: its
 * canvas is the unit square of uv = M⁻¹·P, which the lattice UVs lay over the fundamental
 * parallelogram of the torus. Two things follow, and both are visible on a torus that is not
 * square:
 *
 *   the grid   its lines are u = const and v = const, so a cell is a small copy of the
 *              fundamental parallelogram. For τ = 0.526 + 1.046 i that is a parallelogram of
 *              63° with sides 1 : 1.17, not a square, and on a folded sheet it shows at a
 *              different orientation on every face, mirrored on the faces that are turned over.
 *   the lines  a stroke has one width on the canvas, and the canvas is sheared onto the paper,
 *              so its width ON THE PAPER depends on its direction. For that τ the widest and
 *              the narrowest differ by a factor 1.67.
 *
 * Here everything is drawn in the plane of the paper instead, through a canvas transform, so a
 * width is a width on the paper whatever the direction of the line.
 *
 * SQUARES THAT CLOSE UP. A square grid tiles the torus without a seam exactly when both periods
 * of the lattice are vectors of the grid, that is when τ = b / a for Gaussian integers a and b
 * (the first period is a grid steps, the second b). For a general τ that is impossible. So the
 * grid is drawn in the coordinate g = u·a + v·b with Gaussian integers a, b chosen so that b / a
 * is as close to τ as can be had with about `gridRepeat` cells along the first period. In g the
 * grid is the unit square grid and it is exactly periodic, so it has no seam. On the paper a
 * cell is then a square up to the small real-linear map that takes b / a to τ. `squareBasis`
 * returns how far from a square that is, and `squareCell` the side ratio and the angle of a
 * cell on the paper. With 16 cells asked for, the three planar tori of this scene get cells
 * within 1% of square (see the README for the numbers).
 *
 * The triangulation's edges are drawn in the same coordinate, so their strokes are evenly wide
 * on the paper too.
 *
 * ONE PATH PER LINE. Every grid line and every edge segment is stroked as a path of its own.
 * Chrome rasterises a path of many subpaths under a transform with coverage in quarter texels,
 * and a line parallel to a texel axis then has the same error along its whole length: stroked
 * in one path, the grid lines of the default torus came out 0.77 to 1.02 of the width asked
 * for. Stroked one by one, every grid line of the three planar tori of `lift-correct` measures
 * 0.992 to 1.008 of it at 4096 texels, and every edge 0.992 to 1.008 as well.
 *
 * The texture goes with `latticeUV(triang, positions, { repeat: 1 })`, exactly as
 * `latticeEdgeTexture` does: same canvas, same orientation (v up), repeat wrapping.
 *
 * Impure render boundary (three.js + canvas), except `squareBasis` and `squareCell`.
 */

import * as THREE from 'three';

import type { Triangulation } from '@core/topology/triangulation.ts';
import type { Vec2 } from '@core/geometry/vec2.ts';
import { modulus } from '@core/moduli/modulus.ts';
import { latticeUV } from '@display/mesh/uv.ts';

export interface SquareBasis {
  /** The first period of the lattice, in grid steps (a Gaussian integer as [re, im]). */
  readonly a: Vec2;
  /** The second period, in grid steps. */
  readonly b: Vec2;
  /**
   * How far the cells are from square: the dilatation |β / α| of the real-linear map
   * z ↦ αz + βz̄ that fixes 1 and takes b / a to τ. 0 means exact squares. A cell's side ratio is
   * within (1 + skew) / (1 − skew) of 1 and its angle within about 2·skew radians of a right one.
   */
  readonly skew: number;
}

/** τ·z for complex numbers as pairs. */
const mul = (p: Vec2, q: Vec2): Vec2 => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const div = (p: Vec2, q: Vec2): Vec2 => {
  const d = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
};

/** The dilatation of the map that fixes 1 and takes q to tau. */
function skewOf(tau: Vec2, q: Vec2): number {
  if (Math.abs(q[1]) < 1e-12) return Infinity;
  // β = (τ − q) / (q̄ − q) = (τ − q) / (−2i·Im q), α = 1 − β
  const beta = div([tau[0] - q[0], tau[1] - q[1]], [0, -2 * q[1]]);
  const alpha: Vec2 = [1 - beta[0], -beta[1]];
  return Math.hypot(beta[0], beta[1]) / Math.hypot(alpha[0], alpha[1]);
}

/**
 * Gaussian integers a, b with b / a close to τ and |a| about `cells`.
 *
 * Every a with 0.75·cells ≤ |a| ≤ 1.4·cells is tried, with b the Gaussian integer nearest τ·a.
 * The choice is the one of least skew, a size nearer `cells` winning among near ties (a penalty
 * of 0.001 per unit of |ln(|a| / cells)|, a tenth of a per cent of skew for a size off by a
 * factor e). That penalty is weak: 16 cells asked can give 21. Two choices of a with the same
 * b / a tie exactly, and the first in the order of the loops is kept.
 */
export function squareBasis(tau: Vec2, cellsAsked: number): SquareBasis {
  // from 1 on the range below always holds a Gaussian integer, since it holds |a| = ⌈cells⌉ or
  // one of the sizes √(k² + 1). A value below 1 or not a number is read as 1
  const cells = cellsAsked >= 1 ? cellsAsked : 1;
  const lo = 0.75 * cells, hi = 1.4 * cells, n = Math.ceil(hi);
  let best: SquareBasis | null = null, bestScore = Infinity;
  for (let ar = -n; ar <= n; ar++) for (let ai = -n; ai <= n; ai++) {
    const size = Math.hypot(ar, ai);
    if (size < lo || size > hi) continue;
    // a and −a give the same grid, so half of them is enough
    if (ar < 0 || (ar === 0 && ai < 0)) continue;
    const ta = mul(tau, [ar, ai]);
    const b: Vec2 = [Math.round(ta[0]), Math.round(ta[1])];
    const skew = skewOf(tau, div(b, [ar, ai]));
    const score = skew + 0.001 * Math.abs(Math.log(size / cells));
    if (score < bestScore) { bestScore = score; best = { a: [ar, ai], b, skew }; }
  }
  if (!best) throw new Error(`squareBasis: no Gaussian integer of size about ${cells}`);
  return best;
}

/** The lattice of a flat configuration as the texture sees it: its two periods and τ = v2 / v1. */
function latticeOf(triang: Triangulation, positions: ArrayLike<number>): { v1: Vec2; v2: Vec2; tau: Vec2 } {
  const { v1, v2 } = modulus(triang, positions);
  return { v1: [v1[0], v1[1]], v2: [v2[0], v2[1]], tau: div([v2[0], v2[1]], [v1[0], v1[1]]) };
}

export interface SquareCell extends SquareBasis {
  /** The length of a cell's two sides on the paper, in the units of `positions`. */
  readonly sides: readonly [number, number];
  /** Longer side over shorter. */
  readonly ratio: number;
  /** The angle between the two sides, in degrees. */
  readonly angle: number;
}

/** The shape of one cell of the grid ON THE PAPER, for the configuration `positions`. */
export function squareCell(triang: Triangulation, positions: ArrayLike<number>, cells: number): SquareCell {
  const { v1, v2, tau } = latticeOf(triang, positions);
  const basis = squareBasis(tau, cells);
  const { a, b } = basis;
  // a grid vector g = s·a + t·b lies at s·v1 + t·v2 on the paper
  const det = a[0] * b[1] - a[1] * b[0];
  const onPaper = (g: Vec2): Vec2 => {
    const s = (g[0] * b[1] - g[1] * b[0]) / det, t = (a[0] * g[1] - a[1] * g[0]) / det;
    return [s * v1[0] + t * v2[0], s * v1[1] + t * v2[1]];
  };
  const ex = onPaper([1, 0]), ey = onPaper([0, 1]);
  const lx = Math.hypot(ex[0], ex[1]), ly = Math.hypot(ey[0], ey[1]);
  const cos = (ex[0] * ey[0] + ex[1] * ey[1]) / (lx * ly);
  return { ...basis, sides: [lx, ly], ratio: Math.max(lx, ly) / Math.min(lx, ly), angle: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI };
}

/**
 * No line is drawn thinner than this many texels (mean texel width, see `squarePaperTexture`).
 * At 4096 texels and 16 to 21 cells a minor line of 0.004 of a cell is 0.76 to 1.0 texel wide.
 */
const MIN_TEXELS = 0.5;

export interface SquarePaperOptions {
  /** Texels across the canvas. Default 2048. */
  size?: number;
  bg?: string;
  minor?: string;
  major?: string;
  /** About how many major cells along the first period of the lattice. Default 16. */
  gridRepeat?: number;
  /** Minor cells per major cell. Default 3. */
  gridSubdivisions?: number;
  /**
   * Line widths as fractions of a major cell. Defaults 0.004 and 0.010. A width below
   * `MIN_TEXELS` texels is raised to that, see there.
   */
  minorWidth?: number;
  majorWidth?: number;
  edgeColor?: string;
  /** Edge line width as a fraction of the first period, as in `latticeEdgeTexture`. Default 0.006. */
  edgeWidth?: number;
  /** Draw the triangulation's edges at all. Default true. */
  drawEdges?: boolean;
}

/**
 * The paper of a flat configuration: a square grid that closes up, and the triangulation's edges,
 * all with widths that are widths on the paper.
 */
export function squarePaperTexture(
  triang: Triangulation,
  positions: ArrayLike<number>,
  opts: SquarePaperOptions = {},
): THREE.CanvasTexture {
  const size = opts.size ?? 2048;
  const cells = opts.gridRepeat ?? 16;
  const subs = Math.max(1, Math.round(opts.gridSubdivisions ?? 3));
  const { tau } = latticeOf(triang, positions);
  const { a, b } = squareBasis(tau, cells);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = opts.bg ?? '#fbfaf4';
  ctx.fillRect(0, 0, size, size);

  // FROM THE GRID'S PLANE TO THE CANVAS. g = u·a + v·b, so (u, v) = A⁻¹·g with A = [a b], and a
  // texel is (u·size, (1 − v)·size): the UV origin is bottom-left, the canvas's is top-left.
  const det = a[0] * b[1] - a[1] * b[0];
  const i00 = b[1] / det, i01 = -b[0] / det, i10 = -a[1] / det, i11 = a[0] / det;
  ctx.setTransform(size * i00, -size * i10, size * i01, -size * i11, 0, size);
  // THE THINNEST LINE. A texel is a parallelogram in g, of area |det A| / size², so `texel` is
  // its mean width, and across its narrow direction it is narrower than that. A line thinner
  // than a texel is still drawn with the right amount of ink, only paler, so the floor is there
  // to keep a line from vanishing and nothing more
  const texel = Math.sqrt(Math.abs(det)) / size;
  const floor = MIN_TEXELS * texel;
  const line = (x0: number, y0: number, x1: number, y1: number): void => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };

  // the square grid, over the box that holds the whole fundamental parallelogram 0, a, b, a + b
  const xs = [0, a[0], b[0], a[0] + b[0]], ys = [0, a[1], b[1], a[1] + b[1]];
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const rule = (color: string, width: number, wanted: (k: number) => boolean): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(floor, width);
    ctx.lineCap = 'butt';
    for (let k = Math.floor(x0 * subs); k <= Math.ceil(x1 * subs); k++) if (wanted(k)) line(k / subs, y0, k / subs, y1);
    for (let k = Math.floor(y0 * subs); k <= Math.ceil(y1 * subs); k++) if (wanted(k)) line(x0, k / subs, x1, k / subs);
  };
  const isMajor = (k: number): boolean => ((k % subs) + subs) % subs === 0;
  rule(opts.minor ?? '#9fb4d4', opts.minorWidth ?? 0.004, (k) => !isMajor(k));
  rule(opts.major ?? '#5f82b4', opts.majorWidth ?? 0.010, isMajor);

  if (opts.drawEdges !== false) {
    // the triangulation's edges: straight in lattice coordinates, hence straight in g
    const uv = latticeUV(triang, positions, { repeat: 1 });
    let ulo = Infinity, uhi = -Infinity, vlo = Infinity, vhi = -Infinity;
    for (let i = 0; i < uv.length; i += 2) {
      ulo = Math.min(ulo, uv[i]); uhi = Math.max(uhi, uv[i]);
      vlo = Math.min(vlo, uv[i + 1]); vhi = Math.max(vhi, uv[i + 1]);
    }
    // every lattice translate of the net that can reach the tile 0 ≤ u, v ≤ 1, and one more
    const iLo = -Math.ceil(uhi) - 1, iHi = -Math.floor(ulo) + 1, jLo = -Math.ceil(vhi) - 1, jHi = -Math.floor(vlo) + 1;
    const toG = (k: number): Vec2 => [a[0] * uv[k] + b[0] * uv[k + 1], a[1] * uv[k] + b[1] * uv[k + 1]];
    ctx.strokeStyle = opts.edgeColor ?? '#241a10';
    // a fraction of the first period, which is |a| grid steps long
    ctx.lineWidth = Math.max(floor, (opts.edgeWidth ?? 0.006) * Math.hypot(a[0], a[1]));
    ctx.lineCap = 'round';
    // An edge belongs to two triangles, so the net holds it twice, the second time as a lattice
    // translate of the first. Stroked twice, its soft rim would be laid down twice and the line
    // would come out about a third of a texel wider. So of two sides of the net that differ by
    // a whole lattice vector only the first is drawn. (The UVs are single precision, hence the
    // tolerance.)
    const F = triang.triangles.length;
    const sides: Array<readonly [number, number]> = [];
    const whole = (x: number): boolean => Math.abs(x - Math.round(x)) < 1e-4;
    const same = (p: number, q: number, r: number, s: number): boolean => {
      const du = uv[p] - uv[r], dv = uv[p + 1] - uv[r + 1];
      return whole(du) && whole(dv) && Math.abs(uv[q] - uv[s] - du) < 1e-4 && Math.abs(uv[q + 1] - uv[s + 1] - dv) < 1e-4;
    };
    for (let t = 0; t < F; t++) for (let k = 0; k < 3; k++) {
      const p = (t * 3 + k) * 2, q = (t * 3 + ((k + 1) % 3)) * 2;
      if (!sides.some(([r, s]) => same(p, q, r, s) || same(p, q, s, r))) sides.push([p, q]);
    }
    for (const [pk, qk] of sides) {
      const p = toG(pk), q = toG(qk);
      for (let i = iLo; i <= iHi; i++) for (let j = jLo; j <= jHi; j++) {
        const ox = i * a[0] + j * b[0], oy = i * a[1] + j * b[1];
        line(p[0] + ox, p[1] + oy, q[0] + ox, q[1] + oy);
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
