# Load Path Explorer

A 3D browser tool that traces gravity and lateral load through a building, calculates member forces with hand-calc methods, and explains each step. Teaching and checking tool only, not for design.

## Run it

```
cd Team-17-Hackathon-NCSEA        # repo root
python -m http.server 8765 --bind 127.0.0.1
```
Open http://127.0.0.1:8765/src/frontend/. Three.js loads from a CDN, so you need internet access.

Check the analysis against hand calculations (run this before every merge):
```
node tests/shared/check.js
```

## Who owns what

Each role edits only its own files. Changes to the data model (`src/shared/model.js`) go through role 1. `src/shared/` holds the analysis (no DOM, so the tests can run it in Node); `src/frontend/` holds everything that touches the page.

| Role | Files | Next tasks |
|---|---|---|
| 1 Lead / integrator | `src/frontend/index.html`, `src/frontend/app.js`, `src/shared/model.js` | Wall editor (add/move walls), presets for real ZFA building types, merging at check-ins |
| 2 3D scene | `src/frontend/scene.js` | Level isolate / section view, labels on grid bubbles at each level |
| 3 3D load graphics | `src/frontend/overlay.js`, `src/frontend/lateral-arrows.js`, `src/shared/diagrams.js` | Smoother flow animation along members, deflected shape |
| 4 Gravity engineer | `src/shared/gravity.js`, gravity part of `tests/shared/check.js` | Tributary area shading on selection, member self-weight, live load reduction (optional), more check cases |
| 5 Lateral: loads + diaphragm | `LP.storyForces`, `LP.distribute` in `src/shared/lateral.js` | ASCE 7 inputs (V, exposure / SDS, R, Ie), accidental torsion (5%), semi-rigid note |
| 6 Lateral: walls + foundation | `LP.runLateral` in `src/shared/lateral.js`, lateral part of `tests/shared/check.js` | Dead load resisting overturning (0.6D), braced frames (stretch), more check cases |
| 7 Explain + demo | `src/frontend/explain.js` (`LP.NOTES`), panel styles in `src/frontend/index.html` | Better plain-language notes, "why it matters" tips, 3-minute demo script |

Roles 5 and 6 share `lateral.js`: 5 edits only `storyForces` and `distribute`, 6 edits only `runLateral`.

## Data model (the contract everyone codes against)

`LP.buildModel(inputs)` returns a building `b`:

- `b.levels[]`: `{ index, tag ('L2', 'L3', 'R'), name, elev, below, height, dead, live, isRoof }`
- `b.members{id}`: `{ id, type, label, level, a: {x, y, z}, b: {x, y, z}, results: { gravity, lateral } }`
  - types: `deck, beam, girder, column, footing, diaphragm, storyForce, chord, collector, wall, wallFooting`
  - `results[mode] = { value (kips, magnitude used for color), unit, calc: [lines shown in the panel], ...extras }`
  - `results.gravity.tribArea = { rects: [{ x0, y0, x1, y1, z, area }], area }` on every deck, beam, girder, column and footing: the plan rectangles (ft, at elevation `z`) whose load the member carries, and their total in sq ft. A column lists one rectangle per level it supports (its own level first); a footing lists every level. Draw them as flat shaded patches with `LP.toWorld` to show the selected member's tributary area. Load = (D + L at `z`) x `area` for every rectangle, plus `selfWeight`, minus `liveReduction.removed`, and `check.js` checks this for every member.
  - `results.gravity.selfWeight` (kips): the part of `value` that is member self-weight, including what came from members above. 0 when self-weight is off. Columns also have `ownWeight`, their own story's weight.
  - `results.gravity.liveReduction = { KLL, AT, floors, factor, removed }` on beams, girders, columns and footings that support a floor, when live load reduction is on. `factor` is L/Lo (1 means no reduction allowed), `removed` is the kips taken off `value`. Missing when reduction is off or the member only supports the roof. Path values stay unreduced: each member reduces its own live load.
- `b.paths[]`: `{ mode, from, to, value (kips), at: {x, y, z} connection point, note }`: one step of load transfer. The trace, the flow animation and the explain panel all read these.
- `b.walls[]`: `{ id, name, dir ('x' runs along X at y = at, 'y' runs along Y at x = at), at, from, to, length }`
- `b.inputs.lateral`: `{ type ('wind' | 'seismic'), dir ('x' | 'y'), mode, diaphragm ('flexible' | 'rigid'), accidentalTorsion }` plus the inputs for each mode:
  - `mode: 'override'` (default; a missing `mode` means this too): `windPressure` (psf), `Cs`
  - `mode: 'asce7'`: `riskCategory` ('I'–'IV'), `SDS`, `SD1` (g), `system` (`'specialRCWall'`, `'ordinaryRCWall'`, `'specialMasonryWall'`), `windSpeed` (mph), `exposure` ('B' | 'C' | 'D'). Role 5 sets `LP.asce7Ready = true` in `lateral.js` once `storyForces` reads these; until then the app warns and uses the override values. Spec: `docs/role5-inputs.md` on `feature/lateral-loads`.
- `b.inputs.selfWeight` (optional): `{ on, beam, girder, column }`, weights in plf. Off when missing. Missing weights fall back to `LP.SELF_WEIGHT_DEFAULTS` (30 / 60 / 50 plf). **Ask for role 1:** a "Member self-weight" checkbox under Gravity loads, and three plf boxes (beam, girder, column) shown when it's ticked, read into `inputs.selfWeight`. `gravity.js` already handles the rest.
- `b.inputs.liveLoadReduction` (optional): `true` reduces floor live load per ASCE 7-22 4.7. Off when missing. **Ask for role 1:** a "Live load reduction (ASCE 7 4.7)" checkbox under Gravity loads, read into `inputs.liveLoadReduction`.
- Units: ft, psf, kips, kip-ft. Plan x = east, plan y = north, z = elevation. The 3D view maps (x, y, z) to Three.js (x, z, -y).

Member ids: `COL-B2-L2` (column at grid B2 below Level 2), `BM-L2-10-0`, `GD-L2-B-0`, `DECK-L2-0-0`, `DIA-R`, `LAT-R`, `CHORD-L2-W`, `COLL-L2-x0`, `WS-L2` (south wall, story below Level 2), `WS-FTG`, `FTG-B2`.

## Methods and limits

Gravity: one-way deck, tributary widths, simple-span beams and girders, columns summed story by story; service D + L. Member self-weight is optional, as an assumed plf per member type (beams and girders as uniform load, columns at the bottom of each story); the deck's weight is already in the dead psf. Floor live load reduction (ASCE 7-22 4.7) is optional: L = Lo (0.25 + 15 / sqrt(K_LL AT)) when K_LL AT ≥ 400 sq ft, not below 0.50 Lo for one floor or 0.40 Lo for two or more; K_LL = 4 for columns and footings, 2 for beams and girders (no cantilever slabs); Lo > 100 psf gets only the 20% reduction for 2+ floors. Not covered: the deck (a one-way slab's area cap keeps it under 400 sq ft), roof live load reduction (4.8), and the occupancy limits (assembly, parking), since the model doesn't know the occupancy.
Lateral: wind = net psf x face width x tributary height; seismic = Cs x W with ASCE 7 ELF vertical distribution (k = 1). Flexible diaphragm = tributary width; rigid = stiffness proportional to wall length plus torsion (no accidental torsion yet). Chords = M / d using simple spans between wall lines. Collectors = diaphragm shear minus wall shear along the line. Overturning ignores resisting dead load.
