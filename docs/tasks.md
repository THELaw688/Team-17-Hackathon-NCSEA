# Task list

Master list of what's left to build in the Load Path Explorer. It follows the seven roles in
[load-path-explorer.md](load-path-explorer.md) and adds the work that falls between them
(workstreams 8–13). Put your name next to a workstream when you take it, tick tasks as they merge
into `dev`, and note it in the CHANGELOG.

**Priority:** **Must** = needed for the demo · **Should** = makes it clearly better ·
**Stretch** = only if time allows. Items marked ✅ already exist on `dev`.

---

## Where each kind of work lives

| Kind of work | Workstream | What it covers |
|---|---|---|
| Load behavior | 4 Gravity, 5 Lateral loads | How much load arrives and where: dead and live psf, wind and seismic story forces, diaphragm distribution |
| Structure behavior | 6 Walls + foundation, 1 Data model | How the structure carries it: beams, girders, columns, chords, collectors, shear walls, overturning, footings |
| Visual display | 2 3D scene, 3 3D load graphics | The building in 3D, force colors, flow animation, deflected shape |
| Graphic / tabular display | **8 Tables + 2D diagrams (no role yet)** | Everything at once: results tables, column takedown, shear and moment diagrams. Today the app shows one member at a time. |
| In between | 9 Integration, 10 Verification | The data contract, equilibrium checks that catch handoff bugs, merges at check-ins |

## Decide these first

Record each answer in [decisions.md](decisions.md).

- [ ] **Put a name on every role.** The role table has no names yet, and workstream 8 has no role at all.
- [ ] **Agree the stack.** Plain JavaScript + Three.js with no build step is marked "proposed, not yet agreed".
- [ ] **What the judges score.** The criteria are in the organizers' deck ([links.md](links.md)), which AI tools can't open. Paste them into `docs/`.
- [ ] **Service loads only, or factored too?** Today it's service D + L. Adding 1.2D + 1.6L means every explanation and check needs both.
- [ ] **How far "structure behavior" goes.** Recommended: forces, flow and deflected shape, but no member design checks. The tool says "not for design".
- [ ] **Check-in times.** Role 1 merges at check-ins; fix the times so people know when their branch must be ready.

## Order of work

1. **First:** set up clones and hooks, put names on roles, get the judging criteria, settle the decisions above.
2. **Build:** roles work in parallel, each in its own files on its own branch. Changes to `model.js` go through role 1.
3. **Each check-in:** run `node tests/shared/check.js`, merge into `dev`, click through both modes.
4. **Last stretch:** merge `dev` into `main`, tag `v0.1.0`, demo from the tag, rehearse the 3-minute script.

---

## 1 · Lead / integrator
`index.html` · `app.js` · `shared/model.js` · Owner: ______

- ✅ Building model, input panel, gravity/lateral toggle
- [ ] **Must:** Merge role branches into `dev` at each check-in; run the hand-calc checks first, every time
- [ ] **Must:** Wall editor: add, move and delete shear walls (the model already accepts an explicit wall list that overrides the preset)
- [ ] **Must:** Show input errors instead of dropping bad values (today a 0, a negative or a typo in the bay list silently disappears)
- [ ] **Should:** Presets for real building types
- [ ] **Should:** Save and load a building as JSON (also the route to a later Revit or ETABS import)
- [ ] **Should:** Add a tab or section to the side panel for workstream 8

## 2 · 3D scene
`frontend/scene.js` · Owner: ______

- ✅ 3D building, orbit camera, click to select a member
- [ ] **Must:** Grid line bubbles (A, B, 1, 2)
- [ ] **Must:** Camera presets: plan, elevation, iso
- [ ] **Should:** Isolate one level, or cut a section
- [ ] **Should:** Member label on hover

## 3 · 3D load graphics
`frontend/overlay.js` · Owner: ______

- ✅ Force colors and load-flow dots
- [ ] **Must:** Smoother flow animation along members
- [ ] **Must:** Make the color legend honest: it scales against the heaviest member of the same type, so a red beam and a red column aren't comparable. Say so on screen.
- [ ] **Should:** Exaggerated deflected shape, clearly labelled
- [ ] **Should:** Diaphragm shear and moment diagrams drawn on the floor
- [ ] **Should:** Collector force diagram

## 4 · Gravity
`shared/gravity.js` · gravity part of `tests/shared/check.js` · Owner: ______

- ✅ One-way deck, tributary widths, simple spans, column takedown
- [ ] **Must:** Shade the tributary area of the selected member (with roles 2 and 3)
- [ ] **Must:** More check cases: corner and edge columns, unequal bays, one-bay building
- [ ] **Should:** Member self-weight
- [ ] **Stretch:** Live load reduction
- [ ] **Stretch:** Factored combinations, if the team decides to add them

## 5 · Lateral loads + diaphragm
`LP.storyForces`, `LP.distribute` in `shared/lateral.js` · Owner: ______

- ✅ Wind on the face, seismic ELF, flexible and rigid diaphragms with torsion
- [ ] **Must:** ASCE 7 inputs instead of typing Cs: base shear from SDS, R, Ie; wind from exposure
- [ ] **Must:** Accidental torsion (5%)
- [ ] **Must:** Check cases for rigid diaphragm torsion
- [ ] **Should:** Note on screen when a diaphragm is really semi-rigid

## 6 · Lateral: walls + foundation
`LP.runLateral` in `shared/lateral.js` · lateral part of `tests/shared/check.js` · Owner: ______

- ✅ Chords, collectors, shear walls, overturning
- [ ] **Must:** Dead load resisting overturning (0.6D); overturning today ignores it, which overstates uplift
- [ ] **Must:** More check cases
- [ ] **Stretch:** Braced frames

## 7 · Explain + demo
`frontend/explain.js` · panel styles in `index.html` · Owner: ______

- ✅ Click a member to see where load comes from and goes, with the calc
- [ ] **Must:** Plain-language notes and "why it matters" tips
- [ ] **Must:** 3-minute demo script
- [ ] **Should:** Short definitions for terms like chord, collector, diaphragm

## 8 · Tables + 2D diagrams *(no role yet)*
New file, e.g. `frontend/tables.js` · Owner: ______

The app explains one member at a time; engineers and judges also want the whole picture in a table.

- [ ] **Must:** Results table for every member: member, type, level, force, unit. Sort and filter; click a row to select it in 3D.
- [ ] **Must:** Column load takedown table, story by story down each column to its footing
- [ ] **Must:** Lateral table: story forces, story shear, shear per wall line, torsion share, overturning
- [ ] **Should:** Shear and moment diagrams for the selected beam or girder
- [ ] **Should:** Story shear vs. height diagram
- [ ] **Should:** Copy a table or download it as CSV

## 9 · Integration + data contract *(no role yet)*
`docs/load-path-explorer.md` · `shared/model.js` · Owner: ______

- [ ] **Must:** Document any new field or member type in `load-path-explorer.md` before using it
- [ ] **Must:** Equilibrium checks in the test file: footing reactions = total gravity load; wall shears = story shear; load in = load out at every member. These catch handoff bugs between roles.
- [ ] **Must:** Units on every number shown
- [ ] **Should:** Id convention for new member types (editor-made walls, braced frames)
- [ ] **Should:** Consistent wording for warnings

## 10 · Verification *(no role yet)*
`tests/shared/check.js` · `docs/` · Owner: ______

- ✅ 21 hand-calc checks (the CHANGELOG says all pass)
- [ ] **Must:** Run the checks before every merge
- [ ] **Must:** One worked hand calc of the default building in `docs/`, the answer when a judge asks how we know it's right
- [ ] **Must:** Try edge inputs: 1 bay, 1 story, 6 beam spaces, eccentric walls with a rigid diaphragm, seismic in Y
- [ ] **Should:** Test in Chrome, Edge and Safari at projector resolution
- [ ] **Stretch:** Compare one case against RISA or ETABS, if anyone has a license

## 11 · Demo readiness *(no role yet)*
`index.html` · a new `vendor/` folder · Owner: ______

- [ ] **Must:** Bundle Three.js locally; it loads from a CDN today, so no internet means no demo
- [ ] **Must:** Fit a laptop or projector screen; the side columns are fixed at 250px and 360px
- [ ] **Must:** Tag `v0.1.0` on `main` and demo from the tag
- [ ] **Must:** Backup recording and screenshots
- [ ] **Should:** Keep the "not for design" note visible

## 12 · Repo and setup
`README.md` · `docs/` · Owner: ______

- [ ] **Must:** Everyone clones and sets their git name and email
- [ ] **Must:** Run `git config core.hooksPath .githooks` once per clone, or the stale-branch guard does nothing
- [ ] **Must:** Fix run instructions that still say `Team-24-Hackathon-NCSEA`; the repo is now `Team-17-Hackathon-NCSEA`
- [ ] **Must:** Paste the judging criteria into `docs/`
- [ ] **Should:** One branch per role off `dev`

## 13 · Pitch
`presentation/` on the `presentation` branch · Owner: ______

- [ ] **Must:** Slides: problem, live demo, how it works, how we checked it, what's next
- [ ] **Must:** Screenshots of gravity and lateral modes
- [ ] **Must:** Rehearse the 3-minute demo with the script from role 7
