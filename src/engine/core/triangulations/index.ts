/**
 * TRIMMED COPY for origami-lift: only the eight-vertex census is registered (the app uses
 * `v8-3` and `v8-7`), which keeps 740 KB of seven-, nine- and ten-vertex tables out of the
 * bundle. Otherwise as in low-vertex-flat-tori.
 *
 * Registry of the triangulations we study. Each census's stored data (`*Vertex.ts`) is
 * joined with its precomputed markings (`*Vertex.markings.generated.ts`, 1:1 with the data
 * file) and built into `Triangulation`s. Building is CHEAP — it loads the marking, it does
 * not compute it — so the whole registry is a plain eager const array; `byId` looks up by
 * stable id ('v8-7', 'v9-047', …).
 *
 * To add triangulations: extend a data file (or add a new vertex-count file), run
 * `npm run compute-markings`, and add the (data, markings) pair to `ALL_TORI` below.
 */

import { makeTriangulation, type Triangulation, type Marking, type TriangulationData } from '@core/topology/triangulation.ts';
import { EIGHT_VERTEX } from './eightVertex.ts';
import { MARKINGS as EIGHT_MARKINGS } from './eightVertex.markings.generated.ts';

/** Join a census with its precomputed markings, building each entry into a `Triangulation`. */
function build(data: readonly TriangulationData[], markings: Record<string, Marking>): Triangulation[] {
  return data.map((d) => {
    const m = markings[d.id];
    if (!m) throw new Error(`no precomputed marking for '${d.id}' — run \`npm run compute-markings\``);
    return makeTriangulation(d, m);
  });
}

export const ALL_TORI: readonly Triangulation[] = [
  ...build(EIGHT_VERTEX, EIGHT_MARKINGS),
];

export function byId(id: string): Triangulation {
  const t = ALL_TORI.find((x) => x.id === id);
  if (!t) throw new Error(`no triangulation '${id}'`);
  return t;
}

/** The degree-6-regular type (Rich) — the historical default. */
export const RICH: Triangulation = byId('v8-7');
