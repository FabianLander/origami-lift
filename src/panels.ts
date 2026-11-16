/**
 * panels — the three objects of the row: the flattened torus Ψ, the lift Ψ + t z, the
 * corrected torus Ψ + t z + h(t), each with its printed paper and the lines along which the
 * vertices are lifted.
 *
 * Every panel is a group whose origin is the centre of Ψ on the plane z = 0, drawn in the
 * coordinates of Ψ and at one common scale. So the lines, which stand on that plane over the
 * vertices of Ψ, never move, and a torus rises off the plane as the height grows.
 */

import * as THREE from 'three';
import type { Vec2 } from '@core/geometry/vec2.ts';
import { modulus } from '@core/moduli/modulus.ts';
import { latticeUV } from '@display/mesh/uv.ts';
import { layerOrder, layeredCorners } from './paper/layers.ts';
import { squarePaperTexture, squareBasis } from './paper/squarePaper.ts';
import { ownSheet, atlasPaperTexture } from './paper/atlasPaper.ts';
import type { LiftModel } from './model.ts';

/** The black and white paper look. Colours are albedos, see the README. */
export const LOOK = {
  paper: '#b8b8b8',
  minor: '#979797',
  major: '#808080',
  edge: '#646464',
  rail: '#3c3c3c',
  gridRepeat: 16,
  gridSubdivisions: 3,
  minorWidth: 0.004,
  majorWidth: 0.012,
  /** A printed edge, as a fraction of the first period of Ψ. */
  edgeWidth: 0.005,
  roughness: 0.92,
  /** The fold's layers, this fraction of its width apart (real paper is about a thousandth). */
  layerGap: 0.0002,
  /** Grain tiles per period of Ψ on the fold. */
  grainRepeat: 4,
};

export type PanelKey = 'fold' | 'lift' | 'corrected';

export interface Rails {
  readonly group: THREE.Group;
  /** Lay the lines out: on which panel height and against which vertex positions. */
  place(t: number, positions: ArrayLike<number> | null): void;
  refresh(): void;
}

export interface Panel {
  readonly key: PanelKey;
  readonly object: THREE.Group;
  readonly pickables: THREE.Object3D[];
  readonly rails: Rails;
  /** Redraw at a new height (the tori), and say what was drawn. */
  redraw?(t: number, positions: Float64Array): void;
  /** Print the paper again from the configuration now drawn (the tori). */
  print?(quality: 'draft' | 'final'): void;
  dispose(): void;
}

export interface LineState {
  on: boolean;
  shown: boolean[];
  beads: boolean;
  /** Radius of a line and of a bead, in diameters of Ψ. */
  railRadius: number;
  beadRadius: number;
}

const RAIL = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false).rotateX(Math.PI / 2).translate(0, 0, 0.5); // along +z, from 0 to 1
const BEAD = new THREE.SphereGeometry(1, 20, 14);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** The link from a bead to where its vertex went is a little narrower than the line. */
const LINK_FACTOR = 0.82;
/** A line runs twice the vertex's travel over the whole slider. */
const RAIL_LENGTH = 2;

export class Row {
  readonly model: LiftModel;
  readonly centre: Vec2;
  /** The scale that makes Ψ one unit wide. */
  readonly scale: number;
  readonly railMaterials: THREE.MeshStandardMaterial[];
  private readonly grain: THREE.Texture | null;
  /** The grid of the sheet of Ψ: its two periods in grid steps. */
  readonly basis: { a: Vec2; b: Vec2 };
  /** The area of Ψ, which is the covolume of its lattice. */
  readonly covolume: number;
  private readonly edgeOnPaper: number;

  readonly lines: LineState;
  readonly textureSize: number;
  readonly draftSize: number;

  constructor(model: LiftModel, lines: LineState, grain: THREE.Texture | null, textureSize: number, draftSize: number) {
    this.model = model;
    this.lines = lines;
    this.textureSize = textureSize;
    this.draftSize = draftSize;
    const xs = model.psi.map((p) => p[0]), ys = model.psi.map((p) => p[1]);
    this.centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    this.scale = 1 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    this.railMaterials = model.z.map(() => new THREE.MeshStandardMaterial({ color: LOOK.rail, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
    this.grain = grain;
    const lattice = modulus(model.T, model.flat);
    this.basis = squareBasis([lattice.tau[0], lattice.tau[1]], LOOK.gridRepeat);
    this.covolume = lattice.covolume;
    this.edgeOnPaper = LOOK.edgeWidth * Math.hypot(lattice.v1[0], lattice.v1[1]);
  }

  private paperMaterial(grainRepeat: number | null): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ roughness: LOOK.roughness, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    if (this.grain) {
      const g = this.grain.clone();
      g.needsUpdate = true;
      if (grainRepeat !== null) g.repeat.set(grainRepeat, grainRepeat);
      m.normalMap = g;
    }
    return m;
  }

  /** The lines along which the vertices are lifted, for one panel. */
  makeRails(): Rails {
    const group = new THREE.Group();
    const { model, lines, railMaterials, centre } = this;
    const mk = (geo: THREE.BufferGeometry, v: number): THREE.Mesh => { const m = new THREE.Mesh(geo, railMaterials[v]); m.castShadow = true; return m; };
    const parts = model.z.map((_, v) => ({ rod: mk(RAIL, v), bead: mk(BEAD, v), link: mk(RAIL, v) }));
    // pieces that are off are taken out of the group, not hidden: a bounding box counts hidden children
    const attach = (m: THREE.Mesh, on: boolean): void => {
      if (on) { if (m.parent !== group) group.add(m); } else if (m.parent) m.parent.remove(m);
    };
    const dir = new THREE.Vector3();
    let last: { t: number; positions: ArrayLike<number> | null } = { t: 0, positions: null };
    const place = (t: number, positions: ArrayLike<number> | null): void => {
      last = { t, positions };
      const top = RAIL_LENGTH * model.tEnd;
      for (let v = 0; v < model.V; v++) {
        const { rod, bead, link } = parts[v];
        const x = model.psi[v][0] - centre[0], y = model.psi[v][1] - centre[1];
        const height = top * model.z[v];
        const tall = Math.abs(height) > 1e-9;
        attach(rod, lines.shown[v] && tall);
        rod.position.set(x, y, 0);
        rod.scale.set(lines.railRadius, lines.railRadius, tall ? height : 1e-9);
        const marked = lines.shown[v] && lines.beads && positions !== null;
        attach(bead, marked);
        attach(link, false);
        if (!marked || !positions) continue;
        const bz = t * model.z[v];
        bead.position.set(x, y, bz);
        bead.scale.setScalar(lines.beadRadius);
        dir.set(positions[3 * v] - centre[0] - x, positions[3 * v + 1] - centre[1] - y, positions[3 * v + 2] - bz);
        const len = dir.length();
        if (len < 1e-6) continue;
        attach(link, true);
        link.position.set(x, y, bz);
        link.quaternion.setFromUnitVectors(Z_AXIS, dir.divideScalar(len));
        link.scale.set(LINK_FACTOR * lines.railRadius, LINK_FACTOR * lines.railRadius, len);
      }
    };
    return { group, place, refresh: () => place(last.t, last.positions) };
  }

  /** The flattened torus, drawn as a stack of rigid sheets, printed once from Ψ. */
  buildFold(): Panel {
    const { model, centre } = this;
    const T = model.T, F = model.F;
    const planar = model.psi.map(([x, y]) => [x, y] as Vec2);
    const order = layerOrder(T, planar, model.z as number[]);
    if (!order.ok) console.warn(`fold layering: ${order.problems[0]}`);
    const xs = planar.map((p) => p[0]);
    const width = Math.max(...xs) - Math.min(...xs);
    const corners = layeredCorners(T, planar, order.layers, LOOK.layerGap * width);
    let zLo = Infinity, zHi = -Infinity;
    for (let i = 2; i < corners.length; i += 3) { zLo = Math.min(zLo, corners[i]); zHi = Math.max(zHi, corners[i]); }
    const zMid = (zLo + zHi) / 2;
    const position = new Float32Array(F * 9);
    for (let i = 0; i < corners.length; i += 3) {
      position[i] = corners[i] - centre[0]; position[i + 1] = corners[i + 1] - centre[1]; position[i + 2] = corners[i + 2] - zMid;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(latticeUV(T, model.flat, { repeat: 1 }), 2));
    geo.computeVertexNormals();
    const material = this.paperMaterial(LOOK.grainRepeat);
    material.map = squarePaperTexture(T, model.flat, {
      size: this.textureSize, bg: LOOK.paper, minor: LOOK.minor, major: LOOK.major,
      gridRepeat: LOOK.gridRepeat, gridSubdivisions: LOOK.gridSubdivisions,
      minorWidth: LOOK.minorWidth, majorWidth: LOOK.majorWidth, edgeColor: LOOK.edge, edgeWidth: LOOK.edgeWidth,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = mesh.receiveShadow = true;
    const object = new THREE.Group();
    object.add(mesh);
    const rails = this.makeRails();
    rails.place(0, model.flat);
    object.add(rails.group);
    object.scale.setScalar(this.scale);
    return {
      key: 'fold', object, pickables: [mesh], rails,
      dispose: () => { geo.dispose(); material.map?.dispose(); material.normalMap?.dispose(); material.dispose(); },
    };
  }

  /**
   * The lift or the corrected torus, printed from its own unfolding: the sheet of Ψ laid on the
   * torus's own two periods (its pseudo-modulus on the lift), every face on its own patch.
   */
  buildTorus(key: 'lift' | 'corrected', t: number, positions: Float64Array): Panel {
    const { model, centre } = this;
    const T = model.T, F = model.F;
    const geo = new THREE.BufferGeometry();
    const position = new Float32Array(F * 9), uv = new Float32Array(F * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const material = this.paperMaterial(null);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = mesh.receiveShadow = true;
    const object = new THREE.Group();
    object.add(mesh);
    const rails = this.makeRails();
    object.add(rails.group);
    object.scale.setScalar(this.scale);

    let shown = positions, height = t;
    const redraw = (tt: number, q: Float64Array): void => {
      shown = q; height = tt;
      T.triangles.forEach((f, i) => {
        for (let k = 0; k < 3; k++) {
          const o = (i * 3 + k) * 3, v = 3 * f[k];
          position[o] = q[v] - centre[0]; position[o + 1] = q[v + 1] - centre[1]; position[o + 2] = q[v + 2];
        }
      });
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      rails.place(height, q);
    };
    const print = (quality: 'draft' | 'final'): void => {
      const sheet = ownSheet(T, shown, this.basis, 'modulus');
      const baked = atlasPaperTexture(sheet, {
        size: quality === 'draft' ? this.draftSize : this.textureSize, quick: quality === 'draft',
        bg: LOOK.paper, minor: LOOK.minor, major: LOOK.major, gridSubdivisions: LOOK.gridSubdivisions,
        minorWidth: LOOK.minorWidth, majorWidth: LOOK.majorWidth, edgeColor: LOOK.edge, edgeWidth: this.edgeOnPaper,
      });
      // the coordinates and the map change together, in this one step
      uv.set(baked.uv);
      geo.attributes.uv.needsUpdate = true;
      const old = material.map;
      material.map = baked.texture;
      material.needsUpdate = true;
      old?.dispose();
      if (material.normalMap) {
        // as many grain tiles per area of paper as on the fold
        const r = LOOK.grainRepeat * baked.span / Math.sqrt(this.covolume);
        material.normalMap.repeat.set(r, r);
      }
    };
    redraw(t, positions);
    print('final');
    return {
      key, object, pickables: [mesh], rails, redraw, print,
      dispose: () => { geo.dispose(); material.map?.dispose(); material.normalMap?.dispose(); material.dispose(); },
    };
  }

  dispose(): void { for (const m of this.railMaterials) m.dispose(); }
}
