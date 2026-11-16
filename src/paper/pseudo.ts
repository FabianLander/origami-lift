/**
 * pseudo — the two periods of a torus that need not be flat, as each paper defines them.
 *
 * On a flat torus the periods are its lattice, and every way of developing gives the same two
 * vectors. Off the flat tori every way gives a different smooth extension, and a paper fixes
 * one to have a modulus near its flattened torus. The lift Ψ + t z is not flat, so the paper it
 * belongs to decides which periods, and which pseudo-modulus τ = v2 / v1, it has:
 *
 *   universality  Doyle, Lander, Schwartz, Trettel, Lemma lem:pseudomodulus: in T(46666677),
 *                 v = vertex 1 and Δ = the face 167. Develop the chains of faces
 *                 167, 276, 257, 152, 145, 174, 167 and 167, 276, 257, 375, 356, 136, 167
 *                 from Δ, each face attached across the edge it shares with the one before.
 *                 The periods are where vertex 1 lands at the end, minus where it started.
 *   solo          Lander, "The two most symmetric flat tori as eight-vertex paper tori",
 *                 Section 6 and its verification (development.py of
 *                 eight-vertex-paper-tori-verification): a breadth-first tree of the faces in
 *                 the printed face order, rooted at face 0, and the sums of the developed edge
 *                 vectors along the two marking loops, each loop edge read in the earlier of
 *                 its two faces in the printed order.
 *
 * Both developments are laid in the frame of the engine's own unfolding (`developNet`), the one
 * the paper is printed in, by placing their base face where the engine's unfolding has it. Then
 * at the flattened torus, where every choice agrees, the two periods are matched once to the
 * engine's two periods by an integer change of basis, so that the sheet of the flattened torus
 * (its whole numbers of grid steps a, b along v1, v2) keeps its meaning. Off the flat tori the
 * periods are the paper's.
 *
 * Pure.
 */

import type { Triangulation } from '@core/topology/triangulation.ts';
import type { Vec2 } from '@core/geometry/vec2.ts';
import { developNet } from '@core/moduli/develop.ts';
import { modulus } from '@core/moduli/modulus.ts';

export type Convention =
  | { readonly kind: 'chains'; readonly vertex: number; readonly chains: readonly (readonly string[])[] }
  | { readonly kind: 'tree'; readonly faces: readonly (readonly number[])[]; readonly loops: readonly (readonly number[])[] };

/** The universality paper's chains on T(46666677), faces named by their vertices. */
export const UNIVERSALITY: Convention = {
  kind: 'chains', vertex: 1,
  chains: [['167', '276', '257', '152', '145', '174', '167'], ['167', '276', '257', '375', '356', '136', '167']],
};
/** The square and hex paper's face orders and markings (data.py of its verification). */
export const SOLO_SQUARE: Convention = {
  kind: 'tree',
  faces: [[3, 5, 6], [3, 2, 5], [3, 6, 4], [3, 0, 2], [3, 4, 1], [3, 1, 0], [5, 0, 6], [5, 2, 4], [5, 4, 7], [5, 7, 0], [6, 7, 4], [6, 0, 1], [6, 1, 7], [2, 1, 4], [2, 0, 7], [2, 7, 1]],
  loops: [[4, 2, 3, 4], [5, 2, 0, 5]],
};
export const SOLO_HEX: Convention = {
  kind: 'tree',
  faces: [[0, 1, 2], [0, 3, 1], [0, 2, 4], [0, 4, 3], [1, 5, 2], [1, 3, 6], [1, 4, 5], [1, 7, 4], [1, 6, 7], [2, 6, 4], [2, 5, 7], [2, 7, 6], [3, 4, 7], [3, 5, 6], [3, 7, 5], [4, 6, 5]],
  loops: [[1, 4, 0, 1], [1, 5, 6, 1]],
};

type V3 = readonly [number, number, number];
const sq = (p: V3, q: V3): number => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

/** The third corner r of the face (q, p, r), counter-clockwise, given q and p already placed. */
function third(Q: Vec2, P: Vec2, Lqr: number, Lqp: number, Lpr: number): Vec2 {
  const m = (Lqr + Lqp - Lpr) / 2;                                   // (r - q) · (p - q)
  const n = Math.sqrt(Math.max(0, Lqp * Lqr - m * m));              // twice the area
  const vx = P[0] - Q[0], vy = P[1] - Q[1];
  return [Q[0] + (m * vx - n * vy) / Lqp, Q[1] + (m * vy + n * vx) / Lqp];
}

/** The raw periods of a convention, in the engine's frame. */
function rawPeriods(conv: Convention, triang: Triangulation, positions: ArrayLike<number>): [Vec2, Vec2] {
  const X = (v: number): V3 => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]];
  const L = (a: number, b: number): number => sq(X(a), X(b));
  const net = developNet(triang, positions);
  const faces = triang.triangles;
  const byName = new Map<string, number>(faces.map((f, i) => [[...f].sort().join(''), i]));

  if (conv.kind === 'chains') {
    const out: Vec2[] = [];
    for (const chain of conv.chains) {
      const base = byName.get(chain[0].split('').sort().join(''))!;
      // the base face where the engine's unfolding has it
      let placed = new Map<number, Vec2>(faces[base].map((v, k) => [v, net.corners[base][k] as Vec2]));
      const start = placed.get(conv.vertex)!;
      for (let k = 1; k < chain.length; k++) {
        const f = faces[byName.get(chain[k].split('').sort().join(''))!];
        // the edge it shares with the face before, in its own cyclic order (q, p), and its third corner r
        let q = -1, p = -1, r = -1;
        for (let j = 0; j < 3; j++) if (placed.has(f[j]) && placed.has(f[(j + 1) % 3])) { q = f[j]; p = f[(j + 1) % 3]; r = f[(j + 2) % 3]; }
        if (q < 0) throw new Error(`chain face ${chain[k]} shares no edge with ${chain[k - 1]}`);
        const next = new Map<number, Vec2>([[q, placed.get(q)!], [p, placed.get(p)!]]);
        next.set(r, third(placed.get(q)!, placed.get(p)!, L(q, r), L(q, p), L(p, r)));
        placed = next;
      }
      const end = placed.get(conv.vertex)!;
      out.push([end[0] - start[0], end[1] - start[1]]);
    }
    return [out[0], out[1]];
  }

  // breadth first over the faces in the printed order, rooted at face 0 (development.py)
  const F = conv.faces;
  const edgeFaces = new Map<string, number[]>();
  F.forEach((f, i) => { for (let j = 0; j < 3; j++) { const e = [f[j], f[(j + 1) % 3]].sort().join('-'); edgeFaces.set(e, [...(edgeFaces.get(e) ?? []), i]); } });
  const D = new Map<string, Vec2>();
  const at = (fi: number, v: number): Vec2 => D.get(`${fi}:${v}`)!;
  const [a, b, c] = F[0];
  const Lab = L(a, b), lab = Math.sqrt(Lab);
  D.set(`0:${a}`, [0, 0]); D.set(`0:${b}`, [lab, 0]);
  D.set(`0:${c}`, third([0, 0], [lab, 0], L(a, c), Lab, L(b, c)));
  const visited = new Set([0]);
  let frontier = [0];
  while (frontier.length) {
    const nxt: number[] = [];
    for (const fi of frontier) {
      const f = F[fi];
      for (let j = 0; j < 3; j++) {
        const pv = f[j], qv = f[(j + 1) % 3];
        const gj = edgeFaces.get([pv, qv].sort().join('-'))!.find((x) => x !== fi)!;
        if (visited.has(gj)) continue;
        const g = F[gj];
        let q0 = -1, p0 = -1, r0 = -1;
        for (let kk = 0; kk < 3; kk++) if (new Set([g[kk], g[(kk + 1) % 3]]).has(pv) && new Set([g[kk], g[(kk + 1) % 3]]).has(qv)) { q0 = g[kk]; p0 = g[(kk + 1) % 3]; r0 = g[(kk + 2) % 3]; break; }
        const Bq = at(fi, q0), Bp = at(fi, p0);
        D.set(`${gj}:${q0}`, Bq); D.set(`${gj}:${p0}`, Bp);
        D.set(`${gj}:${r0}`, third(Bq, Bp, L(q0, r0), L(q0, p0), L(p0, r0)));
        visited.add(gj); nxt.push(gj);
      }
    }
    frontier = nxt;
  }
  const per = conv.loops.map((lp) => {
    let tx = 0, ty = 0;
    for (let k = 0; k + 1 < lp.length; k++) {
      const fi = F.findIndex((f) => f.includes(lp[k]) && f.includes(lp[k + 1]));   // the earlier of its two faces
      tx += at(fi, lp[k + 1])[0] - at(fi, lp[k])[0];
      ty += at(fi, lp[k + 1])[1] - at(fi, lp[k])[1];
    }
    return [tx, ty] as Vec2;
  });
  // into the engine's frame: the motion that takes root face 0 to where the engine's unfolding has it
  const ei = byName.get([...F[0]].sort().join(''))!;
  const E = (v: number): Vec2 => net.corners[ei][faces[ei].indexOf(v)] as Vec2;
  const e1 = [at(0, b)[0] - at(0, a)[0], at(0, b)[1] - at(0, a)[1]], e2 = [at(0, c)[0] - at(0, a)[0], at(0, c)[1] - at(0, a)[1]];
  const E1 = [E(b)[0] - E(a)[0], E(b)[1] - E(a)[1]], E2 = [E(c)[0] - E(a)[0], E(c)[1] - E(a)[1]];
  const det = e1[0] * e2[1] - e1[1] * e2[0];
  // Q = [E1 E2] [e1 e2]^-1
  const Q = [
    (E1[0] * e2[1] - E2[0] * e1[1]) / det, (-E1[0] * e2[0] + E2[0] * e1[0]) / det,
    (E1[1] * e2[1] - E2[1] * e1[1]) / det, (-E1[1] * e2[0] + E2[1] * e1[0]) / det,
  ];
  const map = (w: Vec2): Vec2 => [Q[0] * w[0] + Q[1] * w[1], Q[2] * w[0] + Q[3] * w[1]];
  return [map(per[0]), map(per[1])];
}

export interface Periods {
  /** The periods of `positions` in the engine's frame, in the basis of the engine's v1, v2. */
  (positions: ArrayLike<number>): { v1: Vec2; v2: Vec2 };
}

/** The paper's own pseudo-modulus of `positions`, in the paper's own basis: w2 / w1. */
export function paperTau(conv: Convention, triang: Triangulation, positions: ArrayLike<number>): Vec2 {
  const [w1, w2] = rawPeriods(conv, triang, positions);
  const n = w1[0] * w1[0] + w1[1] * w1[1];
  return [(w1[0] * w2[0] + w1[1] * w2[1]) / n, (w1[0] * w2[1] - w1[1] * w2[0]) / n];
}

/**
 * The element of SL(2, Z) that takes τ into the fundamental domain |Re| ≤ 1/2, |τ| ≥ 1, as a
 * matrix [a, b, c, d] acting by (aτ + b) / (cτ + d): to reduce a nearby point the same way.
 */
export function reducer(tau: Vec2): [number, number, number, number] {
  let [x, y] = tau, m: [number, number, number, number] = [1, 0, 0, 1];
  for (let it = 0; it < 100; it++) {
    const n = Math.round(x);
    if (n !== 0) { x -= n; m = [m[0] - n * m[2], m[1] - n * m[3], m[2], m[3]]; }
    const r = x * x + y * y;
    if (r >= 1 - 1e-12) break;
    [x, y] = [-x / r, y / r];
    m = [-m[2], -m[3], m[0], m[1]];
  }
  return m;
}
export function moebius(m: readonly [number, number, number, number], t: Vec2): Vec2 {
  const nr = m[0] * t[0] + m[1], ni = m[0] * t[1], dr = m[2] * t[0] + m[3], di = m[2] * t[1];
  const d = dr * dr + di * di;
  return [(nr * dr + ni * di) / d, (ni * dr - nr * di) / d];
}

/**
 * The periods of a convention, matched to the engine's at the flattened torus `flat`: the
 * integer change of basis K with [w1 w2] = [v1 v2] K there is found once and undone at every
 * configuration. Throws if the convention does not reproduce the engine's lattice at `flat`.
 */
export function periodsOf(conv: Convention, triang: Triangulation, flat: ArrayLike<number>): Periods {
  const [w1, w2] = rawPeriods(conv, triang, flat);
  const { v1, v2 } = modulus(triang, flat);
  const d = v1[0] * v2[1] - v1[1] * v2[0];
  const coords = (w: Vec2): Vec2 => [(w[0] * v2[1] - w[1] * v2[0]) / d, (v1[0] * w[1] - v1[1] * w[0]) / d];
  const k1 = coords(w1), k2 = coords(w2);
  const K = [k1[0], k2[0], k1[1], k2[1]].map((x) => Math.round(x));
  const off = Math.max(...[k1[0], k2[0], k1[1], k2[1]].map((x, i) => Math.abs(x - K[i])));
  const detK = K[0] * K[3] - K[1] * K[2];
  if (off > 1e-6 || Math.abs(detK) !== 1) throw new Error(`the paper's periods are not a basis of the lattice at the flattened torus (off by ${off.toExponential(1)}, det ${detK})`);
  // [v1 v2] = [w1 w2] K^-1
  const Ki = [K[3] / detK, -K[1] / detK, -K[2] / detK, K[0] / detK];
  return (positions) => {
    const [u1, u2] = rawPeriods(conv, triang, positions);
    return {
      v1: [u1[0] * Ki[0] + u2[0] * Ki[2], u1[1] * Ki[0] + u2[1] * Ki[2]],
      v2: [u1[0] * Ki[1] + u2[0] * Ki[3], u1[1] * Ki[1] + u2[1] * Ki[3]],
    };
  };
}
