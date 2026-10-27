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
| 2 3D scene | `src/frontend/scene.js` | Grid line bubbles (A, B, 1, 2), camera presets (plan, elevation, iso), level isolate / section view |
| 3 3D load graphics | `src/frontend/overlay.js` | Smoother flow animation along members, deflected shape, diaphragm shear and moment diagrams drawn on the floor, collector force diagram |
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
- `b.paths[]`: `{ mode, from, to, value (kips), at: {x, y, z} connection point, note }`: one step of load transfer. The trace, the flow animation and the explain panel all read these.
- `b.walls[]`: `{ id, name, dir ('x' runs along X at y = at, 'y' runs along Y at x = at), at, from, to, length }`
- Units: ft, psf, kips, kip-ft. Plan x = east, plan y = north, z = elevation. The 3D view maps (x, y, z) to Three.js (x, z, -y).

Member ids: `COL-B2-L2` (column at grid B2 below Level 2), `BM-L2-10-0`, `GD-L2-B-0`, `DECK-L2-0-0`, `DIA-R`, `LAT-R`, `CHORD-L2-W`, `COLL-L2-x0`, `WS-L2` (south wall, story below Level 2), `WS-FTG`, `FTG-B2`.

## Methods and limits

Gravity: one-way deck, tributary widths, simple-span beams and girders, columns summed story by story; service D + L, no self-weight.
Lateral: wind = net psf x face width x tributary height; seismic = Cs x W with ASCE 7 ELF vertical distribution (k = 1). Flexible diaphragm = tributary width; rigid = stiffness proportional to wall length plus torsion (no accidental torsion yet). Chords = M / d using simple spans between wall lines. Collectors = diaphragm shear minus wall shear along the line. Overturning ignores resisting dead load.
