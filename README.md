# origami-lift

Three steps of the inflation argument for eight-vertex paper tori, side by side, with a slider for the height t:

| panel | what it is | flat | embedded |
|---|---|---|---|
| flattened, Ψ | a flat torus folded into the plane | yes | no, its sheets coincide |
| lifted, Ψ + t z | every vertex raised straight up to height t z_v | no | yes |
| corrected, Ψ + t z + h(t) | the same heights, every vertex moved horizontally until the torus is flat again and has the modulus of Ψ | yes | yes, while t is small |

```
npm install
npm run dev        # http://localhost:5466/
npm run build      # type-check and build to dist/
```

## The three tori

| button | Ψ and z | correction | the corrected torus is embedded up to |
|---|---|---|---|
| universality example | a planar torus on T(46666677) at τ̂ = −0.474 + 1.046 i (the button says −0.47 + 1.05 i), the one the universality paper's cartoon starts from (Doyle, Lander, Schwartz, Trettel), with its heights | least-norm vectors, proof of Proposition 2.2 | t = 0.11626 |
| square | the square fold Q⁰ on T(66666666), modulus i, with ζ (Lander, "The two most symmetric flat tori as eight-vertex paper tori", arXiv:2609.10703, Table 1, Proposition 2) | the paper's nine coordinates, Section 6 | t = 0.07132 (0.1376 in the paper's units) |
| hexagonal | the hexagonal fold P⁰ on T(46666677), modulus ρ, with ζ′ (same paper) | the paper's nine coordinates | t = 0.01212 (0.01316 in the paper's units) |

Every Ψ is scaled to diameter 1 and every z to largest |z_v| = 1, so t is the height of the highest vertex in diameters of Ψ. A height in the paper's units is t · diameter / max|ζ|, with the diameters 1.92938 (square) and 1.08601 (hexagonal) and max|ζ| = 1.

The correction solves Φ(Ψ + t z + h) = Φ(Ψ), Φ being the cone deficits at vertices 0 to 6 and the modulus, by Newton's method continued in t from the plane. The unknown is h = E ε with E = S (J₀ S)⁻¹, J₀ = dΦ at Ψ in the sixteen horizontal coordinates. S = J₀ᵀ gives the universality paper's least-norm vectors. S picking nine coordinates gives the square and hexagonal paper's correction, with the other seven planar coordinates and all heights held fixed. See `src/model.ts`.

Checks, double precision. On the square and hexagonal tori the corrections agree with the engine's own `correctFold` (low-vertex-flat-tori, `src/core/search/correct-fold.ts`, a separate implementation by projection) to 2e-14 at twelve heights. On the universality torus the embedded range agrees with `room.mjs` (paper-tori-proofs) to seven digits. At load the page recomputes the corrections recorded in its data and prints the largest difference in the console (1e-15 to 6e-15).

## The paper

The graph paper has square cells and evenly wide lines on the flattened and on the corrected torus.

- **The flattened torus** is printed once, from Ψ, on a periodic canvas: a square grid whose periods are whole numbers of steps, as close to those of Ψ as about 16 cells allow (`src/paper/squarePaper.ts`).
- **The two tori** are printed from their own unfoldings, as the slider moves (`src/paper/atlasPaper.ts`). The sheet of Ψ is laid on the torus's own two periods. On the corrected torus, which has the modulus of Ψ, that is Ψ's paper again: square cells, unbroken across every edge, a few percent larger because the corrected torus is a little larger than Ψ.
- **The lift is not flat and has no modulus.** Its two periods are those of its pseudo-modulus, as the paper it belongs to defines it (`src/paper/pseudo.ts`). For the universality example these are the chains of faces from 167 of Lemma lem:pseudomodulus of the universality paper. For the square and hexagonal tori they are the breadth-first tree and the marking loops of Section 6 of the square and hex paper, each loop edge read in the earlier of its two faces. A cell on the lift is then the parallelogram that the change of pseudo-modulus makes of a square, the same on every face. At the heights the pages open at that is 1.014 : 1 at 90.3° (universality example), 1.011 : 1 at 89.7° (square) and 1.000 : 1 at 89.9° (hexagonal). Other choices of periods give other cells: the engine's own two loops give 1.021 : 1 at 96.9° on the universality example. The unfolding of the lift does not close up, so across the cut edges the grid breaks. The two sides are turned by the rotation the unfolding picks up there (up to 19.4° on the universality example) and offset by up to about half a cell. No face is stretched, and every printed edge lies on its crease.
- **The paper's grain** (a normal map) is laid on each face's unfolding, through a texture coordinate of its own, so it moves with the paper as the slider moves and does not jump when the paper is reprinted.

The status line under the slider gives the lift's pseudo-modulus, in the paper's own basis and reduced the way Ψ's modulus is. The pseudo-modulus was checked against both papers. For the universality example it is 0.530170 + 1.061736 i at t = 0.1081 (before the reduction), as an independent computation from the lemma gave. For the square torus it equals the τ of the square and hex paper's own verification code (`development.py`, its floating-point control) on the same lift to 3e-16, and for the hexagonal torus it equals it after the change of basis τ ↦ 1/(1 − τ), which fixes ρ. At the flattened and the corrected tori both papers' periods equal the engine's to 3e-14.

While the slider moves the two tori are printed at 1024 texels, and 0.3 s after it rests at full size (4096, or 2048 on touch devices).

## The paths of the vertices

On the corrected torus each vertex leaves a red curve: its path from Ψ_v on the plane to where it is at the height now set, t ↦ Ψ_v + t z_v + h_v(t), numerically the path along the flat locus (`vertex paths`, key P, `?paths=0` to open without). It is drawn through the solutions on the solver's grid of 240 heights and through the height itself, for the vertices whose lift line is selected, as thick as 1.5 lift lines. The lift line of a vertex is where the lift alone would take it, so the gap between the line and the curve is the correction.

## The universal covers

Under each torus a small map shows its universal cover (`src/covers.ts`, the toggle `universal covers`, key C, `?covers=0` to open without). The torus is unfolded along the engine's fixed tree of faces, and the unfolding is laid down again at every translate by its two periods. On the flattened and the corrected torus the copies tile the plane, which is the universal cover with the triangulation lifted. The lift is not flat: its periods are those of its pseudo-modulus (see above), its unfolding does not close up, and its copies leave slits and overlap. The copies are filled translucently, so an overlap shows darker and a slit white, and the map is labelled "translates of its unfolding". The unfolding itself is outlined darker. Every map has v1 pointing right, and the three share one scale, at which the whole unfolding of Ψ fits. The square grid of the paper is drawn face by face, so on the lift it breaks across the cut edges as it does on the torus.

The captions stand under the maps, placed from the row at its first pose, so turning a torus does not move them.

## Using it

Drag a torus to turn it, drag elsewhere to turn all three, double-click to reset. Scroll zooms. Inside a page, scrolling scrolls the page and Ctrl or ⌘ with the wheel zooms. Keys: H shows and hides the controls, L the lift lines, P the vertex paths, C the universal covers, R resets the view. The round button at the bottom right shows and hides the controls too, and fades while they are hidden.

Every option is in the URL, and the address bar keeps it up to date, so a link reproduces the view (the poses excepted).

| option | |
|---|---|
| `?torus=regular\|square\|hex` | which torus |
| `?t=0.1081` | the height |
| `?ui=0` | open with the controls hidden |
| `?lines=0`, `?beads=0` | without the lift lines, without the beads and links |
| `?which=0,1,3` | which vertices have a line |
| `?railw=0.00065`, `?beadw=0.0039` | radii of a line and a bead, in diameters of Ψ |
| `?captions=0` | without the captions |
| `?covers=0` | without the maps of the universal covers |
| `?paths=0` | without the paths of the vertices |
| `?camera=ortho` | orthographic camera |
| `?tilt=20`, `?bg=ffffff`, `?texsize=4096` | the tilt of the row in degrees, the background, the paper's resolution |

**In a reveal.js slide**, an iframe with the controls hidden:

```html
<iframe data-src="https://fabianlander.github.io/origami-lift/?torus=square&ui=0" width="100%" height="100%" style="border:0"></iframe>
```

**On the website**, as a demo card or in a post with the `Experiment` component (see `docs/embedding-experiments-in-astro.md` in the site repo).

## Deploying

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. The repository's Settings, Pages, Source has to be set to GitHub Actions. The build uses a relative base, so it serves at `https://fabianlander.github.io/origami-lift/` and inside an iframe alike.

## Where the code comes from

`src/engine/` is a copy of the files of low-vertex-flat-tori (`~/src/low-complexity-paper-tori`, commit dbb435f) that the app needs, at the same paths under `src/`, unchanged except `core/triangulations/index.ts`, which registers only the eight-vertex triangulations. `src/paper/` holds `squarePaper.ts` and `atlasPaper.ts` from that repo's `renders/lift-correct/` and `layers.ts` from `renders/square-inflation/`, both of which were uncommitted there on 2026-11-16. `public/crease-rough.jpg` is the paper grain `assets/textures/crease-rough-1024.png` of that repo, saved as JPEG. The universality torus's data is `scripts/sources/regular-1.json`, written by `universality/inflation/experiments/lift-room/room.mjs` in paper-tori-proofs. `npm run make-data` writes `src/data/`.
