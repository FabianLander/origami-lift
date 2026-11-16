/**
 * atlasPaper — the graph paper of a torus printed FROM ITS OWN UNFOLDING, face by face, for a
 * torus that need not be flat.
 *
 * `./squarePaper.ts` prints a flat torus on one periodic canvas: the unfolded net read in
 * lattice coordinates, where the lattice is ℤ², so the two sides of a cut edge read the same
 * texels. That needs the unfolding to close up. On the lift Ψ + t z it does not: the cone
 * angles are off, the two unfolded copies of a cut edge differ by a rotation (19° on one edge
 * of the default torus at t = 0.108), and the translates of the net by the periods overlap
 * each other. On a periodic canvas a face would then show the printed edges of other faces.
 *
 * So here every face has a patch of the canvas to itself: an atlas.
 *
 *   the sheet    The engine unfolds the torus along its fixed tree of faces (`developNet`) and
 *                reads two periods v1, v2 off its two generator loops (`modulus`). For a flat
 *                torus they are its lattice. For any other they are what the paper calls the
 *                modulus of the configuration, here the PSEUDO-MODULUS τ = v2 / v1.
 *   the grid     The sheet of the planar torus Ψ has a grid steps along its first period and b
 *                along its second (Gaussian integers, `squareBasis`). The same sheet is laid
 *                on the periods of THIS torus: a point P of the unfolding has the grid
 *                coordinate g = A M⁻¹ P, with M = [v1 v2] and A = [a b]. On a torus with the
 *                modulus of Ψ (the corrected one) that is Ψ's grid again, square to the
 *                accuracy of `squareBasis`, and it closes up. On the lift a cell is the
 *                parallelogram that the changed modulus makes of a square, the same on every
 *                face, and the grid turns across a cut edge by the angle the unfolding fails
 *                to close by. Both are what is wrong with the lift, and nothing else is:
 *                a face is unfolded isometrically, so the print is not stretched anywhere.
 *                (`cells: 'square'` draws exact squares instead, g = (a / v1) P.)
 *   the edges    Each face prints its own three edges, centred on them, so half of each line
 *                lies on the face and the other half is printed by the neighbour. Every edge
 *                therefore lies exactly on its crease and is evenly wide, cut edge or not.
 *   the atlas    The unfolded triangles are laid on the canvas by rigid motions at ONE scale,
 *                so a width is a width on the paper on every face. They are packed in rows,
 *                longest side along the row, alternately standing and hanging, each pushed
 *                left until it is `gap` texels from its neighbours.
 *
 * Choosing a fresh square grid for each pseudo-modulus (`squareBasis(τ)`) was tried and is
 * not done: as t moves by 0.003 the best Gaussian pair changes every time, with cells from
 * 0.07 to 0.12 of the diameter turned anywhere between −88° and 90°.
 *
 * `ownSheet` and `packTriangles` are pure. `atlasPaperTexture` is the render boundary.
 */

import * as THREE from 'three';

import type { Triangulation } from '@core/topology/triangulation.ts';
import type { Vec2 } from '@core/geometry/vec2.ts';
import { modulus } from '@core/moduli/modulus.ts';
import { developNet } from '@core/moduli/develop.ts';

/** A 2 × 2 matrix by rows: [m00, m01, m10, m11]. */
export type Mat2 = readonly [number, number, number, number];
const apply = (m: Mat2, p: Vec2): Vec2 => [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
const inverse = (m: Mat2): Mat2 => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d]; };

export interface OwnSheet {
  /** The unfolded corners of every face, in the units of the positions. */
  readonly corners: Vec2[][];
  /** From the unfolding to grid steps: g = toGrid · P. */
  readonly toGrid: Mat2;
  /** The two periods read off the unfolding, and τ = v2 / v1 (the pseudo-modulus). */
  readonly v1: Vec2;
  readonly v2: Vec2;
  readonly tau: Vec2;
  /** One cell of the grid on the paper, the same on every face: side lengths, ratio, angle. */
  readonly cell: { readonly sides: readonly [number, number]; readonly ratio: number; readonly angle: number };
  /** Per cut edge, the angle in degrees by which the unfolding fails to close across it. */
  readonly turns: ReadonlyArray<{ readonly edge: readonly [number, number]; readonly degrees: number }>;
  /** The largest of them. 0 for a flat torus. */
  readonly worstTurn: number;
}

/**
 * The sheet of a configuration: its unfolding and the grid laid on it.
 *
 * `basis` is the grid of the planar torus (`squareBasis` of ITS modulus), so that every panel
 * carries the same sheet. `cells` says how it is laid on this torus's periods: 'modulus' maps
 * the two periods to a and b (the sheet of the pseudo-modulus), 'square' maps the first period
 * to a by a similarity (exact squares, which do not close up unless the modulus is Ψ's).
 */
export function ownSheet(
  triang: Triangulation,
  positions: ArrayLike<number>,
  basis: { readonly a: Vec2; readonly b: Vec2 },
  cells: 'modulus' | 'square' = 'modulus',
): OwnSheet {
  const net = developNet(triang, positions);
  const { v1, v2, tau } = modulus(triang, positions);
  const { a, b } = basis;
  let toGrid: Mat2;
  if (cells === 'square') {
    // g = (a / v1) · P as complex numbers
    const d = v1[0] * v1[0] + v1[1] * v1[1];
    const cr = (a[0] * v1[0] + a[1] * v1[1]) / d, ci = (a[1] * v1[0] - a[0] * v1[1]) / d;
    toGrid = [cr, -ci, ci, cr];
  } else {
    // g = A · M⁻¹ · P
    const det = v1[0] * v2[1] - v1[1] * v2[0];
    const i00 = v2[1] / det, i01 = -v2[0] / det, i10 = -v1[1] / det, i11 = v1[0] / det;
    toGrid = [a[0] * i00 + b[0] * i10, a[0] * i01 + b[0] * i11, a[1] * i00 + b[1] * i10, a[1] * i01 + b[1] * i11];
  }
  const back = inverse(toGrid);
  const ex = apply(back, [1, 0]), ey = apply(back, [0, 1]);
  const lx = Math.hypot(ex[0], ex[1]), ly = Math.hypot(ey[0], ey[1]);
  const cos = (ex[0] * ey[0] + ex[1] * ey[1]) / (lx * ly);
  const turns = net.cutEdges.map((c) => ({ edge: c.edge, degrees: (c.rotDefect * 180) / Math.PI }));
  return {
    corners: net.corners.map((tri) => tri.map((p): Vec2 => [p[0], p[1]])),
    toGrid,
    v1: [v1[0], v1[1]], v2: [v2[0], v2[1]], tau: [tau[0], tau[1]],
    cell: { sides: [lx, ly], ratio: Math.max(lx, ly) / Math.min(lx, ly), angle: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI },
    turns,
    worstTurn: turns.reduce((w, c) => Math.max(w, c.degrees), 0),
  };
}

// ─── packing ──────────────────────────────────────────────────────────────────

/** Where a face lies on the canvas: texel = m · P + o, with m a rotation times the one scale. */
export interface Placement {
  readonly m: Mat2;
  readonly o: Vec2;
}

export interface Packing {
  /** Texels per unit length of the paper, the same for every face. */
  readonly scale: number;
  readonly place: Placement[];
  /** The share of the canvas that the triangles cover. */
  readonly fill: number;
  /** The least distance between two triangles, in texels (at least the gap asked for). */
  readonly clearance: number;
}

function pointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const s = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - s * dx, p[1] - a[1] - s * dy);
}
const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function inside(p: Vec2, t: readonly Vec2[]): boolean {
  const s0 = cross(t[0], t[1], p), s1 = cross(t[1], t[2], p), s2 = cross(t[2], t[0], p);
  return (s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0);
}
/** The distance between two filled triangles: 0 if they meet. */
export function triangleDistance(p: readonly Vec2[], q: readonly Vec2[]): number {
  if (inside(p[0], q) || inside(q[0], p)) return 0;
  let best = Infinity;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const a = p[i], b = p[(i + 1) % 3], c = q[j], d = q[(j + 1) % 3];
    if (segmentsCross(a, b, c, d)) return 0;
    best = Math.min(best, pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
  }
  return best;
}

/** A triangle turned to lie on its longest side: base from (0, 0) to (base, 0), apex above. */
interface Lying {
  readonly t: number;
  /** local = r · (P − origin), a rotation. */
  readonly r: Mat2;
  readonly origin: Vec2;
  readonly base: number;
  readonly apex: Vec2;
}
function lie(tri: readonly Vec2[], t: number): Lying {
  let k = 0, longest = -1;
  for (let i = 0; i < 3; i++) {
    const l = Math.hypot(tri[(i + 1) % 3][0] - tri[i][0], tri[(i + 1) % 3][1] - tri[i][1]);
    if (l > longest) { longest = l; k = i; }
  }
  // run along the base so that the third corner is on the left
  let from = tri[k], to = tri[(k + 1) % 3];
  const third = tri[(k + 2) % 3];
  if (cross(from, to, third) < 0) [from, to] = [to, from];
  const c = (to[0] - from[0]) / longest, s = (to[1] - from[1]) / longest;
  const r: Mat2 = [c, s, -s, c];
  return { t, r, origin: from, base: longest, apex: apply(r, [third[0] - from[0], third[1] - from[1]]) };
}

/**
 * Lay triangles on a square canvas of `size` texels at one scale, `gap` texels apart and
 * `gap / 2` from the border, as large as a row packing allows.
 *
 * Rows of triangles lying on their longest sides, tallest first. In a row they alternate
 * between standing on the row's floor and hanging from its ceiling (turned by 180°), and each
 * is pushed left until it is `gap` from the ones before it, so a hanging triangle slides in
 * beside the slope of a standing one. The scale is found by bisection. `quick` searches more
 * coarsely and tries one order only: a few milliseconds, for a print made while a slider moves.
 */
export function packTriangles(tris: ReadonlyArray<readonly Vec2[]>, size: number, gap: number, quick = false): Packing {
  const lying = tris.map(lie);
  const border = gap / 2;
  const area = lying.reduce((s, l) => s + 0.5 * l.base * l.apex[1], 0);

  type Laid = { place: Placement[]; ok: boolean };
  const tryScale = (scale: number, order: readonly Lying[]): Laid => {
    const place: Placement[] = new Array(tris.length);
    let y0 = border, rowHeight = 0, right = border;
    let row: Vec2[][] = [];
    let hang: boolean = false;
    for (const l of order) {
      const w = scale * l.base, h = scale * l.apex[1];
      if (w > size - 2 * border) return { place, ok: false };
      // the three corners at x = 0, standing or hanging, in the row's own frame
      const shape = (down: boolean, height: number): Vec2[] => (down
        ? [[w, height], [0, height], [w - scale * l.apex[0], height - h]]
        : [[0, 0], [w, 0], [scale * l.apex[0], h]]);
      const fits = (pts: Vec2[], x: number): boolean => row.every((other) =>
        triangleDistance(pts.map((p): Vec2 => [p[0] + x, p[1]]), other) >= gap);
      let down: boolean = hang, x: number = border, pts: Vec2[] = [];
      const lay = (): boolean => {
        if (row.length === 0) { rowHeight = h; down = false; pts = shape(false, rowHeight); x = border; return true; }
        if (h > rowHeight) return false;               // taller than its row: it starts the next one
        pts = shape(down, rowHeight);
        let hi = right + gap, lo = Math.max(border, right - w);
        if (fits(pts, lo)) hi = lo;
        else for (let i = 0; i < (quick ? 10 : 18); i++) { const mid = (lo + hi) / 2; if (fits(pts, mid)) hi = mid; else lo = mid; }
        x = hi;
        return x + w <= size - border;
      };
      if (!lay()) {
        // a new row under this one
        y0 += rowHeight + gap;
        row = []; right = border;
        lay();
      }
      if (y0 + rowHeight > size - border) return { place, ok: false };
      const abs = pts.map((p): Vec2 => [p[0] + x, p[1]]);
      row.push(abs);
      right = Math.max(right, x + w);
      hang = !down;
      // texel = scale · (±r) · (P − origin) + corner
      const sgn = down ? -1 : 1;
      const m: Mat2 = [sgn * scale * l.r[0], sgn * scale * l.r[1], sgn * scale * l.r[2], sgn * scale * l.r[3]];
      const corner: Vec2 = down ? [x + w, y0 + rowHeight] : [x, y0];
      place[l.t] = { m, o: [corner[0] - (m[0] * l.origin[0] + m[1] * l.origin[1]), corner[1] - (m[2] * l.origin[0] + m[3] * l.origin[1])] };
    }
    return { place, ok: true };
  };

  const orders = [[...lying].sort((p, q) => q.apex[1] - p.apex[1])];
  if (!quick) orders.push([...lying].sort((p, q) => q.base - p.base));
  let best: { scale: number; place: Placement[] } | null = null;
  for (const order of orders) {
    let lo = 0, hi = (size - 2 * border) / Math.max(...lying.map((l) => l.base));
    let found: Placement[] | null = null;
    const top = tryScale(hi, order);
    if (top.ok) { lo = hi; found = top.place; }
    else for (let i = 0; i < (quick ? 10 : 22); i++) {
      const mid = (lo + hi) / 2;
      const laid = tryScale(mid, order);
      if (laid.ok) { lo = mid; found = laid.place; } else hi = mid;
    }
    if (found && (!best || lo > best.scale)) best = { scale: lo, place: found };
  }
  if (!best) throw new Error('packTriangles: the triangles do not fit the canvas at any scale');

  const texels = tris.map((tri, t) => tri.map((p): Vec2 => {
    const q = apply(best!.place[t].m, p);
    return [q[0] + best!.place[t].o[0], q[1] + best!.place[t].o[1]];
  }));
  let clearance = Infinity;
  for (let i = 0; i < texels.length; i++) for (let j = i + 1; j < texels.length; j++) clearance = Math.min(clearance, triangleDistance(texels[i], texels[j]));
  return { scale: best.scale, place: best.place, fill: (area * best.scale * best.scale) / (size * size), clearance };
}

// ─── the print ────────────────────────────────────────────────────────────────

export interface AtlasPaperOptions {
  /** Texels across the canvas. Default 4096. */
  size?: number;
  bg?: string;
  minor?: string;
  major?: string;
  /** Minor cells per major cell. Default 3. */
  gridSubdivisions?: number;
  /** Grid line widths as fractions of a major cell. Defaults 0.004 and 0.010. */
  minorWidth?: number;
  majorWidth?: number;
  edgeColor?: string;
  /** The width of a printed edge ON THE PAPER, in the units of the positions. */
  edgeWidth: number;
  /** Draw the triangulation's edges at all. Default true. */
  drawEdges?: boolean;
  /** Pack coarsely (see `packTriangles`): for a print made while a slider moves. */
  quick?: boolean;
}

export interface AtlasPaper {
  readonly texture: THREE.CanvasTexture;
  /** Per corner of every face, like `latticeUV`: length F · 3 · 2. */
  readonly uv: Float32Array;
  /** Texels per unit length of the paper. */
  readonly scale: number;
  /** The share of the canvas the faces cover. */
  readonly fill: number;
  /** One side of the canvas, in the units of the positions. */
  readonly span: number;
}

/** No line is drawn thinner than this many texels, as in `./squarePaper.ts`. */
const MIN_TEXELS = 0.5;

/** The paper of a sheet, every face on a patch of its own. */
export function atlasPaperTexture(sheet: OwnSheet, opts: AtlasPaperOptions): AtlasPaper {
  const size = opts.size ?? 4096;
  const subs = Math.max(1, Math.round(opts.gridSubdivisions ?? 3));
  const drawEdges = opts.drawEdges !== false;
  const F = sheet.corners.length;

  // THE BLEED. Around each triangle the print goes on for `bleed` texels: far enough to hold
  // the outer half of its edge lines and their soft rim, and to keep a filtered lookup at the
  // rim of a face from reading a neighbour's patch. The gap between triangles is twice that
  // and two texels more. The scale depends on the gap and the bleed on the scale, so settle
  // them in a few rounds.
  let bleed = Math.max(4, Math.ceil(size / 400));
  let pack = packTriangles(sheet.corners, size, 2 * bleed + 2, opts.quick);
  for (let round = 0; round < 4; round++) {
    const need = Math.max(4, Math.ceil(size / 400), Math.ceil((drawEdges ? opts.edgeWidth * pack.scale / 2 : 0) + 3));
    if (need <= bleed) break;
    bleed = need;
    pack = packTriangles(sheet.corners, size, 2 * bleed + 2, opts.quick);
  }
  const { scale, place } = pack;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = opts.bg ?? '#fbfaf4';
  ctx.fillRect(0, 0, size, size);

  const back = inverse(sheet.toGrid);
  // one texel in grid steps (its mean width): the floor under a line's width
  const texel = Math.sqrt(Math.abs(sheet.toGrid[0] * sheet.toGrid[3] - sheet.toGrid[1] * sheet.toGrid[2])) / scale;
  const floor = MIN_TEXELS * texel;
  const line = (x0: number, y0: number, x1: number, y1: number): void => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  const isMajor = (k: number): boolean => ((k % subs) + subs) % subs === 0;
  const uv = new Float32Array(F * 6);

  for (let t = 0; t < F; t++) {
    const { m, o } = place[t];
    const tri = sheet.corners[t];
    const tex = tri.map((p): Vec2 => { const q = apply(m, p); return [q[0] + o[0], q[1] + o[1]]; });
    for (let k = 0; k < 3; k++) {
      uv[(t * 3 + k) * 2] = tex[k][0] / size;
      uv[(t * 3 + k) * 2 + 1] = 1 - tex[k][1] / size;     // the UV origin is bottom-left, the canvas's top-left
    }

    // THE PATCH: everything within `bleed` texels of the triangle, a triangle with round corners
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const A = tex[k], B = tex[(k + 1) % 3], C = tex[(k + 2) % 3];
      const out = (P: Vec2, Q: Vec2, away: Vec2): Vec2 => {
        const l = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
        let n: Vec2 = [(Q[1] - P[1]) / l, -(Q[0] - P[0]) / l];
        if (n[0] * (away[0] - P[0]) + n[1] * (away[1] - P[1]) > 0) n = [-n[0], -n[1]];
        return n;
      };
      const n1 = out(A, B, C), n2 = out(B, C, A);
      if (k === 0) ctx.moveTo(A[0] + bleed * n1[0], A[1] + bleed * n1[1]);
      ctx.lineTo(B[0] + bleed * n1[0], B[1] + bleed * n1[1]);
      // round the corner at B, the short way from one normal to the next
      const a1 = Math.atan2(n1[1], n1[0]), a2 = Math.atan2(n2[1], n2[0]);
      ctx.arc(B[0], B[1], bleed, a1, a2, n1[0] * n2[1] - n1[1] * n2[0] < 0);
    }
    ctx.closePath();
    ctx.clip();

    // THE GRID, drawn in grid steps: texel = m · back · g + o
    const g: Mat2 = [m[0] * back[0] + m[1] * back[2], m[0] * back[1] + m[1] * back[3], m[2] * back[0] + m[3] * back[2], m[2] * back[1] + m[3] * back[3]];
    ctx.setTransform(g[0], g[2], g[1], g[3], o[0], o[1]);
    const gs = tri.map((p) => apply(sheet.toGrid, p));
    const pad = 2 * bleed * texel + 1;
    const x0 = Math.min(gs[0][0], gs[1][0], gs[2][0]) - pad, x1 = Math.max(gs[0][0], gs[1][0], gs[2][0]) + pad;
    const y0 = Math.min(gs[0][1], gs[1][1], gs[2][1]) - pad, y1 = Math.max(gs[0][1], gs[1][1], gs[2][1]) + pad;
    const rule = (color: string, width: number, wanted: (k: number) => boolean): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(floor, width);
      ctx.lineCap = 'butt';
      for (let k = Math.ceil(x0 * subs); k <= Math.floor(x1 * subs); k++) if (wanted(k)) line(k / subs, y0, k / subs, y1);
      for (let k = Math.ceil(y0 * subs); k <= Math.floor(y1 * subs); k++) if (wanted(k)) line(x0, k / subs, x1, k / subs);
    };
    rule(opts.minor ?? '#9fb4d4', opts.minorWidth ?? 0.004, (k) => !isMajor(k));
    rule(opts.major ?? '#5f82b4', opts.majorWidth ?? 0.010, isMajor);

    // ITS THREE EDGES, drawn on the paper: texel = m · P + o
    if (drawEdges) {
      ctx.setTransform(m[0], m[2], m[1], m[3], o[0], o[1]);
      ctx.strokeStyle = opts.edgeColor ?? '#241a10';
      ctx.lineWidth = Math.max(MIN_TEXELS / scale, opts.edgeWidth);
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) line(tri[k][0], tri[k][1], tri[(k + 1) % 3][0], tri[(k + 1) % 3][1]);
    }
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return { texture, uv, scale, fill: pack.fill, span: size / scale };
}
