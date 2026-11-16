/**
 * make-data — write src/data/{regular,square,hex}.json, the three tori of the app.
 *
 *   npm run make-data
 *
 * regular  The planar torus of the cartoon row `regular` in the universality paper's figures
 *          (Doyle, Lander, Schwartz, Trettel), on T(46666677) = v8-3, with its heights z, as
 *          written by `universality/inflation/experiments/lift-room/room.mjs` in
 *          paper-tori-proofs (a copy is `scripts/sources/regular-1.json`). Corrected with the
 *          least-norm vectors of the proof of Proposition 2.2.
 * square   The square fold Q⁰ on T(66666666) = v8-7 and its lift direction ζ, from Lander,
 *          "The two most symmetric flat tori as eight-vertex paper tori", arXiv:2609.10703, Table 1 and
 *          Proposition 2. Corrected in the paper's nine coordinates (its Section 6).
 * hex      The hexagonal fold P⁰ on T(46666677) = v8-3 and ζ′, the same paper.
 *
 * Every torus is scaled so that Ψ has diameter 1 and the largest |z_v| is 1. Then the script
 * follows the correction from the plane upward in small steps, measures the corrected torus at
 * every step with the engine's embeddedness test, and bisects where it stops being embedded.
 * It also records the correction at twelve heights, which the page recomputes at load.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SQUARE_FOLD, HEXAGONAL_FOLD, type FoldedBase } from '@core/sampling/foldedBases.ts';
import { reduceModulus } from '@core/moduli/reduce.ts';
import { modulus } from '@core/moduli/modulus.ts';
import { byId } from '@core/triangulations/index.ts';
import { LiftModel, type TorusData } from '../src/model.ts';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

type Draft = Omit<TorusData, 'embeddedUntil' | 'tOpen' | 'path'> & { tOpen?: number };

function diameter(pts: readonly (readonly [number, number])[]): number {
  let d = 0;
  for (const p of pts) for (const q of pts) d = Math.max(d, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return d;
}

function fromPaper(base: FoldedBase, key: string, title: string, source: string): Draft {
  const d = diameter(base.planar);
  const m = Math.max(...base.lift.map(Math.abs));
  const psi = base.planar.map(([x, y]) => [x / d, y / d] as [number, number]);
  const flat = new Float64Array(24);
  psi.forEach(([x, y], v) => { flat[3 * v] = x; flat[3 * v + 1] = y; });
  const tau = modulus(byId(base.triang.id), flat).tau;
  const hat = reduceModulus(tau);
  return {
    key, title, source,
    correction: 'nine-coordinates',
    triangulation: base.triang.id,
    psi,
    z: base.lift.map((z) => z / m),
    // the paper lists flat coordinates 3v + a, the horizontal ones are 2v + a
    free: base.free.map((k) => 2 * Math.floor(k / 3) + (k % 3)),
    tauHat: [hat[0], hat[1]],
    paperUnits: { diameter: d, maxZeta: m },
  };
}

/** Follow the correction upward in steps of dt; bisect where the corrected torus stops being embedded. */
function embeddedUntil(model: LiftModel, dt: number, tCap: number): { until: number; firstEmbedded: number; why: string } {
  let eps: Float64Array = new Float64Array(9), t = 0, firstEmbedded = NaN;
  let lastGood: { t: number; eps: Float64Array } = { t: 0, eps };
  for (;;) {
    const tn = t + dt;
    if (tn > tCap) return { until: NaN, firstEmbedded, why: `still embedded at the cap t = ${tCap}` };
    const next = model.newton(tn, eps);
    if (!next) { return { until: bisect(lastGood, tn, 'newton'), firstEmbedded, why: 'Newton stopped converging' }; }
    const emb = model.measure(model.place(tn, model.hOf(next))).embedded;
    if (emb && Number.isNaN(firstEmbedded)) firstEmbedded = tn;
    if (!emb && !Number.isNaN(firstEmbedded)) {
      return { until: bisect(lastGood, tn, 'embedded'), firstEmbedded, why: 'a crossing' };
    }
    t = tn; eps = next;
    if (emb) lastGood = { t: tn, eps: next };
  }

  function bisect(good: { t: number; eps: Float64Array }, bad: number, test: 'newton' | 'embedded'): number {
    let lo = good.t, hi = bad, e = good.eps;
    for (let i = 0; i < 40 && hi - lo > 1e-9; i++) {
      const mid = (lo + hi) / 2;
      const s = model.newton(mid, e);
      const ok = !!s && (test === 'newton' || model.measure(model.place(mid, model.hOf(s))).embedded);
      if (ok) { lo = mid; e = s!; } else hi = mid;
    }
    return lo;
  }
}

function finish(draft: Draft, dt: number): TorusData {
  const probe = new LiftModel({ ...draft, embeddedUntil: 1, tOpen: 0, path: [] }, 1);
  const r = embeddedUntil(probe, dt, 1.0);
  if (Number.isNaN(r.until)) throw new Error(`${draft.key}: ${r.why}`);
  const model = new LiftModel({ ...draft, embeddedUntil: r.until, tOpen: 0, path: [] });
  const path: { t: number; h: number[] }[] = [];
  for (let i = 1; i <= 12; i++) {
    const t = (i / 12) * model.tEnd;
    const h = model.correction(t);
    if (h) path.push({ t, h: Array.from(h) });
  }
  const tOpen = draft.tOpen ?? Math.round(7000 * r.until) / 10000;
  const lift = model.measure(model.lift(tOpen)), cor = model.corrected(tOpen);
  const m = model.measure(cor.positions);
  console.log(`${draft.key}: embedded from t = ${r.firstEmbedded.toPrecision(3)} up to t = ${r.until.toFixed(6)} (${r.why}), `
    + `slider to ${model.tEnd.toFixed(4)}, ${path.length} heights recorded`);
  console.log(`   at t = ${tOpen}: lift deficit ${lift.coneDeficit.toExponential(2)}, embedded ${lift.embedded}; `
    + `corrected deficit ${m.coneDeficit.toExponential(2)}, embedded ${m.embedded}, clearance ${m.clearance.toExponential(2)}, `
    + `moved ${(100 * cor.move).toFixed(2)}% of the diameter, tauHat ${m.tauHat.map((x) => x.toFixed(6)).join(' + ')}i`);
  return { ...draft, embeddedUntil: r.until, tOpen, path };
}

// ---- regular: the universality paper's torus, as room.mjs wrote it ----
const room = JSON.parse(readFileSync(here('./sources/regular-1.json'), 'utf8'));
const regular: Draft = {
  key: 'regular',
  title: 'universality example',
  source: 'A planar torus on T(46666677) at τ̂ = −0.474 + 1.046 i, the one the universality paper\'s cartoon starts from, with its lift heights. Corrected with the least-norm vectors of Proposition 2.2 (Doyle, Lander, Schwartz, Trettel).',
  correction: 'least-norm',
  triangulation: 'v8-3',
  psi: room.psi.map((p: number[]) => [p[0], p[1]] as [number, number]),
  z: room.z,
  free: null,
  tauHat: [room.tauHat[0], room.tauHat[1]],
  tOpen: 0.1081,
  noLine: [2],
};
const square = fromPaper(SQUARE_FOLD, 'square', 'square',
  'The square fold Q⁰ on T(66666666), exactly flat with modulus i, and its lift direction ζ. Corrected in the nine coordinates of Lander, "The two most symmetric flat tori as eight-vertex paper tori", arXiv:2609.10703, Section 6.');
const hex = fromPaper(HEXAGONAL_FOLD, 'hex', 'hexagonal',
  'The hexagonal fold P⁰ on T(46666677), exactly flat with modulus ρ, and its lift direction ζ′. Corrected in the nine coordinates of Lander, "The two most symmetric flat tori as eight-vertex paper tori", arXiv:2609.10703, Section 6.');

const dt = Number(process.argv[2] ?? 2.5e-4);
for (const d of [regular, square, hex]) {
  const out = finish(d, dt);
  if (out.key === 'regular') console.log(`   room.mjs found ${room.exits.embeddednessLostAt} for the same torus`);
  writeFileSync(here(`../src/data/${out.key}.json`), JSON.stringify(out, null, 1) + '\n');
}
