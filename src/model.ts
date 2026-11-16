/**
 * model — a flattened torus Ψ, its lift Ψ + t z, and the correction h(t). Pure: no three.js.
 *
 * Ψ is a planar configuration of eight points that is an exactly flat torus folded into the
 * plane, z gives every vertex a height. The LIFT Ψ + t z raises vertex v straight up to t z_v.
 * It is embedded for small t > 0 but no longer flat: its cone angles are off by O(t²). The
 * CORRECTION moves the vertices horizontally, by h(t), until the torus is flat again and has
 * the modulus of Ψ. Every vertex keeps its height t z_v.
 *
 * The equations are Φ(Ψ + t z + h) = Φ(Ψ), with Φ = (the cone deficits at vertices 0 … 6,
 * Re τ, Im τ): nine equations, the eighth deficit being minus the sum of the others. The
 * unknown is h = E ε with ε ∈ ℝ⁹, where the nine columns of the 16 × 9 matrix E satisfy
 * dΦ_Ψ(E) = I. Two papers make two choices of E, and both are E = S (J₀ S)⁻¹ for a 16 × 9
 * matrix S, J₀ being dΦ at Ψ in the sixteen horizontal coordinates:
 *
 *   least norm     S = J₀ᵀ, so E = J₀ᵀ (J₀ J₀ᵀ)⁻¹: the vectors e_i of least norm with
 *                  dΦ(e_i) = the i-th unit vector. Doyle, Lander, Schwartz, Trettel,
 *                  proof of Proposition 2.2.
 *   nine coordinates  S picks nine of the sixteen horizontal coordinates, the other seven are
 *                  held fixed. Lander, the square and hexagonal paper, Section 6.
 *
 * h(t) is found by Newton's method, continued in t from h(0) = 0 on a grid of heights that is
 * filled from the plane upward the first time it is needed.
 */

import { byId } from '@core/triangulations/index.ts';
import type { Triangulation } from '@core/topology/triangulation.ts';
import { modulus, tauJacobian } from '@core/moduli/modulus.ts';
import { coneAngleDeficits, coneAngleJacobian } from '@core/constraints/flat.ts';
import { measure, type Measurement } from '@core/search/measure.ts';

/** One torus of the app, as stored in `src/data/*.json` (written by `scripts/make-data.ts`). */
export interface TorusData {
  readonly key: string;
  /** The button's label. */
  readonly title: string;
  /** One sentence: what this torus is and where it comes from. */
  readonly source: string;
  /** Which correction: the universality paper's least-norm one, or the square and hex paper's. */
  readonly correction: 'least-norm' | 'nine-coordinates';
  /** The engine's triangulation id: 'v8-3' is T(46666677), 'v8-7' is T(66666666). */
  readonly triangulation: string;
  /** Ψ: eight planar points, scaled to diameter 1. Exactly flat, NOT embedded. */
  readonly psi: readonly (readonly [number, number])[];
  /** The heights z, scaled to largest |z_v| = 1, so t is the height of the highest vertex. */
  readonly z: readonly number[];
  /** Under 'nine-coordinates': the horizontal coordinates the correction moves, as 2v + a. */
  readonly free: readonly number[] | null;
  /** The reduced modulus of Ψ. */
  readonly tauHat: readonly [number, number];
  /** Where the corrected torus stops being embedded (bisected, double precision). */
  readonly embeddedUntil: number;
  /** The height the page opens at. */
  readonly tOpen: number;
  /** Vertices whose lift line is off when the page opens. */
  readonly noLine?: readonly number[];
  /** The scale that took the paper's coordinates to these: Ψ_here = Ψ_paper / diameter, and
   *  a height t here is a height t · diameter / max|ζ| in the paper's units. */
  readonly paperUnits?: { readonly diameter: number; readonly maxZeta: number };
  /** Corrections recorded by the script, against which the page checks itself at load. */
  readonly path: readonly { readonly t: number; readonly h: readonly number[] }[];
}

const NE = 9, NH = 16;

/** Solve A x = b (n × n, row-major) with partial pivoting. Null if singular. */
export function solve(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const M = Float64Array.from(A), x = Float64Array.from(b);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[piv * n + c])) piv = r;
    if (Math.abs(M[piv * n + c]) < 1e-300) return null;
    if (piv !== c) {
      for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[piv * n + k]; M[piv * n + k] = t; }
      const t = x[c]; x[c] = x[piv]; x[piv] = t;
    }
    for (let r = c + 1; r < n; r++) {
      const f = M[r * n + c] / M[c * n + c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
      x[r] -= f * x[c];
    }
  }
  for (let c = n - 1; c >= 0; c--) {
    let s = x[c];
    for (let k = c + 1; k < n; k++) s -= M[c * n + k] * x[k];
    x[c] = s / M[c * n + c];
  }
  return x;
}

export class LiftModel {
  readonly T: Triangulation;
  readonly V: number;
  readonly F: number;
  readonly psi: readonly (readonly [number, number])[];
  readonly z: readonly number[];
  /** Ψ as 24 coordinates. */
  readonly flat: Float64Array;
  /** The columns e_1 … e_9, as a 16 × 9 row-major matrix. */
  readonly E: Float64Array;
  /** The slider's range: past the loss of embeddedness by half again. */
  readonly tEnd: number;
  private readonly phi0: Float64Array;
  private readonly JD: Float64Array;
  private readonly JT: Float64Array;
  private readonly grid: (Float64Array | null)[] = [new Float64Array(NE)];
  private static readonly GRID = 240;

  readonly data: TorusData;

  constructor(data: TorusData, tEnd = 1.5 * data.embeddedUntil) {
    this.data = data;
    this.T = byId(data.triangulation);
    this.V = this.T.vertexCount;
    this.F = this.T.triangles.length;
    this.psi = data.psi;
    this.z = data.z;
    this.tEnd = tEnd;
    this.JD = new Float64Array(this.V * 3 * this.V);
    this.JT = new Float64Array(2 * 3 * this.V);
    this.flat = this.place(0, null);
    this.phi0 = this.phi(this.flat);
    this.E = this.columns(data.correction, data.free);
  }

  /** Ψ + t z + h as 24 coordinates; h is x0, y0, …, x7, y7, or null for the lift alone. */
  place(t: number, h: ArrayLike<number> | null): Float64Array {
    const p = new Float64Array(3 * this.V);
    for (let v = 0; v < this.V; v++) {
      p[3 * v] = this.psi[v][0] + (h ? h[2 * v] : 0);
      p[3 * v + 1] = this.psi[v][1] + (h ? h[2 * v + 1] : 0);
      p[3 * v + 2] = t * this.z[v];
    }
    return p;
  }

  /** Φ = (the cone deficits at vertices 0 … 6, Re τ, Im τ). */
  phi(p: Float64Array): Float64Array {
    const d = coneAngleDeficits(this.T, p);
    const tau = modulus(this.T, p).tau;
    return Float64Array.of(d[0], d[1], d[2], d[3], d[4], d[5], d[6], tau[0], tau[1]);
  }

  /** dΦ in the sixteen horizontal coordinates, 9 × 16 row-major. */
  jacH(p: Float64Array): Float64Array {
    coneAngleJacobian(this.T, p, this.JD);
    tauJacobian(this.T, p, this.JT);
    const J = new Float64Array(NE * NH), W = 3 * this.V;
    for (let r = 0; r < NE; r++) for (let v = 0; v < this.V; v++) for (let c = 0; c < 2; c++) {
      J[r * NH + 2 * v + c] = r < 7 ? this.JD[r * W + 3 * v + c] : this.JT[(r - 7) * W + 3 * v + c];
    }
    return J;
  }

  /** E = S (J₀ S)⁻¹, with S = J₀ᵀ (least norm) or S = the nine coordinate columns. */
  private columns(kind: TorusData['correction'], free: readonly number[] | null): Float64Array {
    const J0 = this.jacH(this.flat);
    const S = new Float64Array(NH * NE);
    if (kind === 'least-norm') {
      for (let k = 0; k < NH; k++) for (let i = 0; i < NE; i++) S[k * NE + i] = J0[i * NH + k];
    } else {
      if (!free || free.length !== NE || new Set(free).size !== NE) throw new Error('nine distinct free coordinates are needed');
      free.forEach((k, i) => { S[k * NE + i] = 1; });
    }
    // G = J₀ S (9 × 9), then E = S G⁻¹ column by column
    const G = new Float64Array(NE * NE);
    for (let a = 0; a < NE; a++) for (let b = 0; b < NE; b++) {
      let s = 0;
      for (let k = 0; k < NH; k++) s += J0[a * NH + k] * S[k * NE + b];
      G[a * NE + b] = s;
    }
    const E = new Float64Array(NH * NE);
    for (let i = 0; i < NE; i++) {
      const unit = new Float64Array(NE); unit[i] = 1;
      const y = solve(G, unit, NE);
      if (!y) throw new Error('dΦ restricted to these directions is not invertible at Ψ');
      for (let k = 0; k < NH; k++) { let s = 0; for (let a = 0; a < NE; a++) s += S[k * NE + a] * y[a]; E[k * NE + i] = s; }
    }
    return E;
  }

  /** h = E ε. */
  hOf(eps: Float64Array): Float64Array {
    const h = new Float64Array(NH);
    for (let k = 0; k < NH; k++) { let s = 0; for (let i = 0; i < NE; i++) s += this.E[k * NE + i] * eps[i]; h[k] = s; }
    return h;
  }

  /** Newton's method at height t from a nearby solution. The solved ε, or null. */
  newton(t: number, start: Float64Array): Float64Array | null {
    const eps = Float64Array.from(start);
    for (let it = 0; it < 40; it++) {
      const p = this.place(t, this.hOf(eps));
      const f = this.phi(p);
      let res = 0;
      for (let i = 0; i < NE; i++) { f[i] -= this.phi0[i]; res = Math.max(res, Math.abs(f[i])); }
      if (!(res < 1e6)) return null;
      if (res < 1e-13) return eps;
      const J = this.jacH(p);
      const G = new Float64Array(NE * NE);
      for (let a = 0; a < NE; a++) for (let b = 0; b < NE; b++) {
        let s = 0;
        for (let k = 0; k < NH; k++) s += J[a * NH + k] * this.E[k * NE + b];
        G[a * NE + b] = s;
      }
      const d = solve(G, f, NE);
      if (!d) return null;
      for (let i = 0; i < NE; i++) eps[i] -= d[i];
    }
    return null;
  }

  /** The correction h(t), or null where Newton's method, continued from the plane, fails. */
  correction(t: number): Float64Array | null {
    const N = LiftModel.GRID, dt = this.tEnd / N;
    const k = Math.max(0, Math.min(N, Math.floor(t / dt + 1e-9)));
    for (let j = this.grid.length; j <= k; j++) {
      const prev = this.grid[j - 1];
      this.grid.push(prev ? this.newton(j * dt, prev) : null);
    }
    const base = this.grid[k];
    const eps = base ? this.newton(t, base) : null;
    return eps ? this.hOf(eps) : null;
  }

  /**
   * The corrected tori from the plane up to height t: at every height of the grid below t and
   * at t itself. Each vertex's coordinates along it are the vertex's path on the flat locus.
   */
  pathTo(t: number): Float64Array[] {
    const dt = this.tEnd / LiftModel.GRID;
    const h = this.correction(t);                                   // fills the grid up to t
    const out = [this.flat];
    for (let j = 1; j < this.grid.length && j * dt < t - 1e-12; j++) {
      const eps = this.grid[j];
      if (!eps) break;
      out.push(this.place(j * dt, this.hOf(eps)));
    }
    if (h) out.push(this.place(t, h));
    return out;
  }

  /** The lift Ψ + t z. */
  lift(t: number): Float64Array { return this.place(t, null); }

  /** The corrected torus Ψ + t z + h(t), and how far its vertices moved (largest |h_v|). */
  corrected(t: number): { positions: Float64Array; found: boolean; move: number } {
    const h = this.correction(t);
    if (!h) return { positions: this.lift(t), found: false, move: 0 };
    let move = 0;
    for (let v = 0; v < this.V; v++) move = Math.max(move, Math.hypot(h[2 * v], h[2 * v + 1]));
    return { positions: this.place(t, h), found: true, move };
  }

  measure(p: Float64Array): Measurement { return measure(this.T, p); }
}
