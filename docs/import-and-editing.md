# Model import and in-program editing — spec

How the Load Path Explorer gets a building from somewhere other than the bay-grid inputs: IFC from
Revit, a model from ETABS, or the user drawing and editing one in the app.

Status: **design agreed, implementation in progress.** The foundation (`src/shared/elements.js`)
exists; importers and editor UI do not yet.

---

## The problem this solves

`LP.buildModel(inputs)` *generates* a building from a regular rectangular grid: bay widths, story
heights, filler beam spacing. That is why the current app works — every member's position is known
by construction, so gravity analysis can take tributary widths off `b.beamXs` and lateral analysis
can treat each floor as a rectangle between wall lines.

A real Revit or ETABS model is not generated; it is *given*, as arbitrary geometry. Columns may sit
off-grid, slabs may be L-shaped, a beam may be sloped. Nothing about it matches the assumptions the
analysis is built on.

So import is two problems, not one:

| | Difficulty | Approach |
|---|---|---|
| **Draw** the imported model in 3D | Straightforward | Map elements to members, hand to `scene.js` |
| **Run the load path** on it | Hard | Infer a grid from real column positions; fall back to draw-only |

We chose to infer a grid. Real buildings are mostly regular, and when one isn't, the app says so
rather than producing confident nonsense.

---

## Architecture: one neutral element format

Every source produces the same intermediate list, and one function turns that list into the building
object the rest of the app already understands.

```
Revit IFC ──┐
ETABS .e2k ─┼──► StructuralElement[] ──► LP.modelFromElements() ──► building b ──► existing
In-app edit ┘      (neutral)                                        (unchanged)    analysis,
                                                                                   scene, panel
```

This matters: **nothing downstream of `modelFromElements` changes.** `gravity.js`, `lateral.js`,
`scene.js`, `overlay.js` and `explain.js` keep reading the same `b` they read today. The parametric
generator becomes one source among several rather than the only one.

### StructuralElement

```js
{
  kind: 'column' | 'beam' | 'girder' | 'brace' | 'slab' | 'wall' | 'footing',
  a: { x, y, z },          // line elements: start, ft
  b: { x, y, z },          // line elements: end, ft
  outline: [{ x, y }],     // area elements (slab, wall): plan polygon, ft
  zTop, zBottom,           // area elements: elevation range, ft
  material: 'steel' | 'concrete' | 'other',
  section: 'W18X35',       // section/profile name as the source called it
  name: 'Column 3',        // human label
  source: 'ifc' | 'etabs' | 'manual',
  sourceId: 'GUID or name' // provenance for the session only, never persisted
}
```

Units are **ft everywhere**, converted at the importer boundary. IFC files are usually millimetres
or metres (read `IfcUnitAssignment`); ETABS may be kip-ft, kip-in or kN-m (read the file header).
Getting this wrong produces a building 3.28× too big, so each importer unit-tests its conversion.

### Grid inference

1. Take every vertical line element (columns). Collect their plan `x` and `y`.
2. Cluster each axis independently: sort, start a new cluster when the gap exceeds the tolerance
   (default **1.0 ft** — wider than modelling slop, narrower than any real bay).
3. Each cluster's mean becomes a grid line. Label X lines `1, 2, 3...` and Y lines `A, B, C...`,
   matching the convention already in `model.js`.
4. Cluster element elevations the same way to find levels. The lowest column base is grade.
5. Snap each element to the nearest grid line and level. Anything further than tolerance is marked
   `offGrid: true`.
6. **Regularity check:** what makes a grid a grid is that columns *share* lines — several columns
   stand on line B, so a beam can span between them. A line holding one lone column is a
   coincidence, not a grid line. So: count **distinct plan positions** per line (a 3-storey building
   stacks 3 columns on one point, which is one position), and call a column regular when both its X
   and Y line are shared by at least one other position. If fewer than 60% qualify, set
   `b.analysisReady = false` and warn. The model still draws; the load path doesn't run.

   > Do **not** measure this as "does each column sit on a grid line" — the lines are derived from
   > the columns, so that is trivially true and scores a random scatter a perfect 1.0. This was a
   > real bug, caught by `tests/shared/check-import.js`.

Off-grid elements are drawn in grey as context — visible, not analysed. That's an honest answer, and
more useful than silently dropping them.

---

## IFC import (Revit)

**Library:** [web-ifc](https://github.com/ThatOpen/engine_web-ifc) WASM, loaded from CDN. Chosen
over a hand-rolled STEP parser because `IfcLocalPlacement` chains, `IfcExtrudedAreaSolid` profiles
and 100MB+ Revit exports are all places a quick parser falls over.

**Types we read:** `IFCCOLUMN`, `IFCBEAM`, `IFCMEMBER`, `IFCSLAB`, `IFCWALL`, `IFCWALLSTANDARDCASE`,
`IFCFOOTING`. Everything else (doors, pipes, furniture) is ignored at the type filter, which also
keeps memory down.

**Material** comes from `IfcRelAssociatesMaterial`; we classify to `steel` / `concrete` / `other` by
matching the material name, since Revit's naming is inconsistent. **Section** comes from the profile
name on the swept solid, or the type name as a fallback.

**Beam vs girder:** IFC doesn't distinguish them. We classify after grid inference — a beam running
between two grid lines on a grid line is a girder; one spanning between girders is a filler beam.
This is the same distinction `model.js` makes, just derived instead of generated.

### Privacy: the IFC file is never kept and never uploaded

This is a requirement, not a nice-to-have. Concretely:

- The file is read with `<input type="file">` and `File.arrayBuffer()` — **a local read; no upload.**
  The app has no backend to upload to, which is the strongest guarantee available.
- Parsing happens in the browser via WASM.
- As soon as elements are extracted: `ifcApi.CloseModel(modelID)`, and every reference to the
  `ArrayBuffer` is set to `null` so it can be garbage collected. The bytes do not outlive the import.
- **Nothing is written to `localStorage`, `sessionStorage`, IndexedDB, or any file.**
- No `fetch` or `XMLHttpRequest` carries model data anywhere. The only network requests the page
  makes are GETs for library code from CDNs (Three.js, web-ifc) — outbound requests for scripts,
  carrying nothing of yours.

**Stated honestly:** what *is* kept, in memory, for the session, is the derived structural model —
member positions, sections, materials. That has to persist or there is nothing to draw. It is
discarded when the tab closes. Exporting it is an explicit user action producing a local download.

If the file is confidential, the meaningful protections are that nothing leaves the machine and
nothing is written to disk. Both hold. Worth adding to the demo script — it's a real differentiator
for firms who can't put client models in a cloud tool.

---

## ETABS import

**Format:** `.e2k` / `.$et` text export (ETABS → File → Export → ETABS Text File). Chosen because
`.EDB` is proprietary binary and unreadable without ETABS itself, and CSV exports require the user
to produce and keep several files together.

Sections we read:

| `.e2k` section | Gives us |
|---|---|
| `$ POINT COORDINATES` | Joint coordinates, keyed by name |
| `$ LINE CONNECTIVITY` | Frame elements as joint pairs, with `COLUMN` / `BEAM` / `BRACE` type |
| `$ AREA CONNECTIVITY` | Slabs and walls as joint lists |
| `$ LINE ASSIGNS` / `$ AREA ASSIGNS` | Section and material per element |
| `$ STORIES` | Story names and heights — used directly instead of inferring levels |
| `$ MATERIAL PROPERTIES` | Steel vs concrete classification |
| `$ CONTROLS` | Unit system for conversion |

ETABS gives us stories explicitly, which is better than inferring them from elevations. Grid
inference still runs for plan position, since ETABS grids are optional and often unused.

**Fallback:** if a `.csv` is dropped instead, look for a joint-coordinate table and a frame
connectivity table and build from those. Lower fidelity, no sections. Only worth building if the
`.e2k` path lands with time to spare.

Same privacy rules as IFC: parsed in memory, discarded, never uploaded.

---

## In-program editing

The app currently rebuilds the whole model from the input panel on every change. Editing needs the
model itself to be mutable, which the element list makes possible: **edit elements, re-derive,
re-analyse.**

### Operations

| Operation | UI |
|---|---|
| Select element | Click in 3D (selection already exists) |
| Edit properties | Section, material, kind, in the right panel |
| Move | Drag endpoints to grid intersections, or type coordinates |
| Add | Pick a kind, click two grid points (or a polygon for slabs/walls) |
| Delete | Select, press Delete |
| Add/remove grid line | Panel control; existing elements keep their coordinates |
| Add/remove level | Panel control; set elevation and loads |
| Undo / redo | Ctrl+Z / Ctrl+Y over a snapshot stack |

### How it fits the existing code

- `state.elements` becomes the source of truth. The input panel generates elements rather than a
  building directly; imports replace them; edits mutate them.
- Every edit calls `modelFromElements` → `runGravity` → `runLateral` → `view.build(b)`. Full
  recompute on each edit is fast enough at hackathon model sizes and keeps the data flow one-way.
- Undo is a deep copy of the element list pushed before each edit. Crude, correct, cheap.

### Scope warning

"Robust in-program modeling" is, taken literally, a CAD program. For today the honest target is:
**edit what's already there, add simple members on the inferred grid, change sections and
materials.** Arbitrary geometry creation, curved members and sloped framing are out of scope and
should be said out loud in the demo rather than discovered by a judge.

---

## Who builds what

Fits the existing role split in `docs/load-path-explorer.md`:

| Role | Addition |
|---|---|
| 1 Lead / integrator | `src/shared/elements.js`, wiring `state.elements` through `app.js` |
| 2 3D scene | Drawing imported slabs/walls as polygons, grey rendering for off-grid elements |
| 3 3D load graphics | Unchanged — reads `b.paths` as before |
| 4 Gravity | Tributary widths from an inferred grid rather than `beamXs` |
| 5 Lateral loads | Story forces from imported story heights and masses |
| 6 Lateral walls | Wall lines from imported wall elements rather than presets |
| 7 Explain + demo | Import flow in the demo script; the privacy story is a selling point |

New files: `src/shared/elements.js` (done), `src/shared/import-ifc.js`, `src/shared/import-etabs.js`,
`src/frontend/editor.js`, `tests/shared/check-import.js` (done).

---

## Risks

- **Grid inference fails on irregular buildings.** Mitigated by the 60% check and draw-only
  fallback, but a genuinely irregular model gets no load path. That's a limit of the method, not a
  bug.
- **Unit conversion errors are silent and catastrophic.** A model 3.28× too large still draws fine.
  Unit tests per importer, and the app shows overall building dimensions after import so a human can
  sanity-check them.
- **web-ifc from CDN means import breaks offline**, unlike the rest of the app. Demo on known wifi,
  or vendor the WASM file if it matters.
- **Revit IFC exports vary.** A model exported with the wrong settings may carry no structural
  elements at all. Show a clear "found 0 structural elements" message naming the IFC types searched,
  rather than failing silently.
- **Biggest risk is scope.** Three large features, one afternoon. Import that draws but doesn't
  analyse still demos well; a half-written analyser does not.
