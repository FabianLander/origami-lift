/**
 * layers — which face of a flat-folded configuration lies on top of which.
 *
 * A configuration folded into the plane has faces lying on one another, and a renderer given
 * coincident triangles cannot decide which one is in front: the WebGL preview z-fights and the
 * path tracer's closest-hit test returns whichever triangle its traversal happened to visit
 * first, pixel by pixel. The two fixes tried so far both LIFT the fold — a hair along ζ in
 * `renders/lift-pair` and `renders/figure-studio` — which tilts the sheets, so the separation
 * between two overlapping faces still goes to zero along their shared edge or vertex, and that
 * is where the fighting survives.
 *
 * This module answers the question the paper's own lift answers exactly. Two faces whose
 * shadows overlap in positive area are separated by the lift, and the sign of the gap
 * h_F − h_G on the overlap says which is above (Lander, Lemma 2 and Prop. 2: the gap is affine,
 * nonzero off the shared simplex, and of one sign on the overlap). Collecting those signs over
 * all overlapping pairs gives a relation "F above G". For the square fold Q⁰ with the paper's
 * ζ that relation is ACYCLIC (checked exactly in rational arithmetic, 85 overlapping pairs, no
 * inconsistent pair), so the faces can be assigned LAYERS, integers with above ⟹ larger, and
 * drawn each at height layer × gap: every face stays exactly horizontal, and every overlapping
 * pair is a full gap apart everywhere, shared edges included. That is what a folded sheet of
 * real paper does, its thickness being the gap.
 *
 * SHEETS. Two faces joined by an UNFOLDED edge (their orientation signs agree, so they lie on
 * opposite sides of it) are one continuous piece of paper and belong at one height; only a
 * folded edge (signs differ, faces on the same side) changes layer. With `sheets: true` the
 * faces are first merged along unfolded edges into rigid sheets and the sheets are layered,
 * which removes every step across an unfolded edge. On Q⁰ this gives eight sheets in eight
 * layers, no sheet overlapping itself.
 *
 * The result is COMPUTED from whatever planar positions and direction it is given, never
 * assumed. If the direction does not separate the configuration (the gap changes sign on some
 * overlap) or the relation has a cycle, `ok` is false and `problems` says why; the layers
 * returned are then a best effort, not a proof of anything. Nothing here enters a measurement.
 *
 * Pure: no three.js, no DOM.
 */

import type { Triangulation } from '@core/topology/triangulation.ts';
import type { Vec2 } from '@core/geometry/vec2.ts';

export interface LayerOrder {
  /** Layer of each face, 0 at the bottom, in the triangulation's face order. */
  readonly layers: readonly number[];
  /** How many layers there are. */
  readonly count: number;
  /** Every overlapping pair as [above, below], face indices. */
  readonly pairs: readonly (readonly [number, number])[];
  /** The rigid sheets (face indices), one per face when `sheets` is off. */
  readonly sheets: readonly (readonly number[])[];
  /** The relation was consistent on every overlap and free of cycles. */
  readonly ok: boolean;
  readonly problems: readonly string[];
}

export interface LayerOptions {
  /** Merge faces along unfolded edges into rigid sheets before layering. Default true. */
  sheets?: boolean;
}

const det = (u: Vec2, v: Vec2): number => u[0] * v[1] - u[1] * v[0];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];

/** The affine height function of a face under the lift: h(Q_v) = ζ_v at its three corners. */
function heightFunction(Q: readonly Vec2[], zeta: readonly number[], f: readonly number[]): (x: Vec2) => number {
  const [a, b, c] = f;
  const A: number[][] = [[1, Q[a][0], Q[a][1]], [1, Q[b][0], Q[b][1]], [1, Q[c][0], Q[c][1]]];
  const z = [zeta[a], zeta[b], zeta[c]];
  const d3 = (M: number[][]): number =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = d3(A);
  const m = [0, 1, 2].map((k) => {
    const Ak = A.map((row) => row.slice());
    for (let i = 0; i < 3; i++) Ak[i][k] = z[i];
    return d3(Ak) / D;
  });
  return (x) => m[0] + m[1] * x[0] + m[2] * x[1];
}

/** Clip a convex polygon to the side of the line pq that contains `inside`. */
function clip(poly: Vec2[], p: Vec2, q: Vec2, inside: Vec2): Vec2[] {
  const dir = sub(q, p);
  const s = det(dir, sub(inside, p)) > 0 ? 1 : -1;
  const out: Vec2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const A = poly[i], B = poly[(i + 1) % n];
    const da = s * det(dir, sub(A, p)), db = s * det(dir, sub(B, p));
    if (da >= 0) out.push(A);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
    }
  }
  return out;
}

function area2(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += det(poly[i], poly[(i + 1) % poly.length]);
  return s;
}

/** The overlap of two triangles, as a convex polygon (empty when they only touch). */
function overlap(A: readonly Vec2[], B: readonly Vec2[]): Vec2[] {
  let poly = A.slice();
  for (let i = 0; i < 3; i++) {
    poly = clip(poly, B[i], B[(i + 1) % 3], B[(i + 2) % 3]);
    if (poly.length < 3) return [];
  }
  return poly;
}

/**
 * The layer order of a planar configuration under a lift direction.
 *
 * `planar` holds the eight (or however many) vertices of the fold and `zeta` one speed per
 * vertex, in the triangulation's vertex order.
 */
export function layerOrder(
  triang: Triangulation, planar: readonly Vec2[], zeta: readonly number[], opts: LayerOptions = {},
): LayerOrder {
  const faces = triang.triangles;
  const F = faces.length;
  const problems: string[] = [];

  // a scale for the tolerances: the configuration's width
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of planar) { lo = Math.min(lo, x, y); hi = Math.max(hi, x, y); }
  const scale = Math.max(hi - lo, 1e-300);
  const areaTol = 1e-10 * scale * scale;

  const h = faces.map((f) => heightFunction(planar, zeta, f));
  const shadow = faces.map((f) => f.map((v) => planar[v]) as Vec2[]);

  // the relation: F above G on every overlap of positive area
  const pairs: [number, number][] = [];
  for (let i = 0; i < F; i++) {
    for (let j = i + 1; j < F; j++) {
      const K = overlap(shadow[i], shadow[j]);
      if (K.length < 3 || Math.abs(area2(K)) < areaTol) continue;
      // the gap is affine and vanishes only on the shared simplex, which lies on the boundary of
      // the overlap, so its sign at the centroid is its sign on the overlap
      const cx = K.reduce((s, p) => s + p[0], 0) / K.length;
      const cy = K.reduce((s, p) => s + p[1], 0) / K.length;
      const gap = h[i]([cx, cy]) - h[j]([cx, cy]);
      // and every corner clearly off the shared simplex has to agree, or the direction does not
      // separate this pair at all
      const gapTol = 1e-9 * scale;
      for (const k of K) {
        const g = h[i](k) - h[j](k);
        if (Math.abs(g) > gapTol && Math.sign(g) !== Math.sign(gap)) {
          problems.push(`faces ${i} and ${j}: the gap changes sign on their overlap`);
          break;
        }
      }
      if (gap > 0) pairs.push([i, j]); else pairs.push([j, i]);
    }
  }

  // the rigid pieces: faces joined by an unfolded edge, or every face on its own
  const parent = Array.from({ length: F }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) x = parent[x]; return x; };
  if (opts.sheets ?? true) {
    const sign = faces.map((f) => Math.sign(det(sub(planar[f[1]], planar[f[0]]), sub(planar[f[2]], planar[f[0]]))));
    const edgeKey = (u: number, v: number): string => (u < v ? `${u}-${v}` : `${v}-${u}`);
    const byEdge = new Map<string, number[]>();
    faces.forEach((f, i) => {
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(f[k], f[(k + 1) % 3]);
        const list = byEdge.get(key) ?? [];
        list.push(i);
        byEdge.set(key, list);
      }
    });
    for (const [, fs] of byEdge) {
      if (fs.length === 2 && sign[fs[0]] === sign[fs[1]]) parent[find(fs[0])] = find(fs[1]);
    }
  }
  const sheetOf = Array.from({ length: F }, (_, i) => find(i));
  const sheetIds = [...new Set(sheetOf)];
  const sheets = sheetIds.map((id) => faces.map((_, i) => i).filter((i) => sheetOf[i] === id));
  for (const [a, b] of pairs) {
    if (sheetOf[a] === sheetOf[b]) problems.push(`faces ${a} and ${b} overlap but lie in one sheet`);
  }

  // layer the sheets by longest path in the relation (Kahn's algorithm), bottom first
  const index = new Map(sheetIds.map((id, i) => [id, i]));
  const succ: Set<number>[] = sheetIds.map(() => new Set());
  const indeg = sheetIds.map(() => 0);
  for (const [above, below] of pairs) {
    const a = index.get(sheetOf[above])!, b = index.get(sheetOf[below])!;
    if (a === b || succ[b].has(a)) continue;
    succ[b].add(a);
    indeg[a]++;
  }
  const layerOfSheet = sheetIds.map(() => -1);
  const queue: number[] = [];
  indeg.forEach((d, i) => { if (d === 0) { queue.push(i); layerOfSheet[i] = 0; } });
  let placed = 0;
  while (queue.length > 0) {
    const s = queue.shift()!;
    placed++;
    for (const t of succ[s]) {
      layerOfSheet[t] = Math.max(layerOfSheet[t], layerOfSheet[s] + 1);
      if (--indeg[t] === 0) queue.push(t);
    }
  }
  let count = Math.max(0, ...layerOfSheet) + 1;
  if (placed < sheetIds.length) {
    const stuck = sheetIds.map((_, i) => i).filter((i) => layerOfSheet[i] < 0 || indeg[i] > 0);
    problems.push(`the above/below relation has a cycle through sheets ${stuck.map((i) => `[${sheets[i].join(' ')}]`).join(', ')}`);
    for (const i of stuck) if (layerOfSheet[i] < 0) layerOfSheet[i] = count;   // best effort
    count = Math.max(0, ...layerOfSheet) + 1;
  }

  const layers = faces.map((_, i) => layerOfSheet[index.get(sheetOf[i])!]);
  return { layers, count, pairs, sheets, ok: problems.length === 0, problems };
}

/**
 * The corners to draw: face f at height `layers[f] × gap` above its planar position, as a
 * non-indexed corner array [x y z] × 3 × F, in the triangulation's face and corner order.
 */
export function layeredCorners(
  triang: Triangulation, planar: readonly Vec2[], layers: readonly number[], gap: number,
): Float32Array {
  const F = triang.triangles.length;
  const out = new Float32Array(F * 9);
  triang.triangles.forEach((f, i) => {
    for (let k = 0; k < 3; k++) {
      const o = (i * 3 + k) * 3;
      out[o] = planar[f[k]][0];
      out[o + 1] = planar[f[k]][1];
      out[o + 2] = layers[i] * gap;
    }
  });
  return out;
}
