# Changelog

Running log of every meaningful change to this repository. It exists so that any teammate — human
or AI — can find out what happened while they were away without reading the whole git history.

Newest entries go at the **top**.

---

## How to use this file

**At the start of every task:**

1. `git pull` so you have everyone else's entries.
2. Read the entries above the line you last saw. They tell you what moved, what broke, and what
   someone is mid-way through.
3. Check the **In progress** section before starting — if someone is already in that file, talk to
   them instead of working in parallel.

**At the end of every task:**

1. Add one entry at the top of the log below, using the template.
2. Commit it *with* your code change, not as a separate commit — the log and the code should never
   disagree.

**If you are an AI assistant:** both steps are mandatory, not optional. Read this file before you
touch code, and append your entry before you report the task finished. Do not rewrite or delete
other people's entries — only add your own.

### Entry template

```markdown
### YYYY-MM-DD — Short title of the change
**Who:** Name (+ AI tool, if one did the work) · **Branch:** branch-name

- **What changed:** the actual change, in plain language
- **Why:** the reason, so nobody undoes it by accident
- **Files:** paths touched
- **Heads up:** anything others need to know — breaking changes, new env vars, new dependencies,
  follow-up work. Write "none" if there's nothing.
```

### Merge conflicts in this file

Two people adding entries at the top will conflict. **Keep both entries** — delete the conflict
markers, order the two by date, done. Never resolve a conflict here by discarding someone's entry.

---

## In progress

Add a line when you start something that will take a while, and remove it when you're done. This is
how we avoid two people rewriting the same file.

- **Zack (+ Claude Code)** — Role 4, gravity: `src/shared/gravity.js` and the gravity part of
  `tests/shared/check.js` (tributary area for the selected member, self-weight, more check cases).
  Branch `feature/gravity`. I won't touch `lateral.js` or the lateral checks.

- **Sam** — IFC / ETABS import and in-program editing. Spec in `docs/import-and-editing.md`.
  Foundation `src/shared/elements.js` is done; `src/shared/import-ifc.js`,
  `src/shared/import-etabs.js` and `src/frontend/editor.js` are not written yet — if you pick one
  up, say so here first.
- **Josh (+ Claude Code)** — Role 5, lateral loads + diaphragm: `LP.storyForces` and
  `LP.distribute` in `src/shared/lateral.js` (ASCE 7 inputs, 5% accidental torsion, semi-rigid
  note). Branch `feature/lateral-loads`. Role 6: `runLateral` in the same file is yours, I won't touch it.

---

## Log

### 2026-10-27 — Make member detail sections collapsible
**Who:** Kevin (+ Copilot SDK in VS Code) · **Branch:** feature/collapsible-details

- **What changed:** Made the member details panel's load-source, load-destination and calculation
  sections native expandable dropdowns, open by default.
- **Why:** Let users collapse subcategories to focus on the member information they need.
- **Files:** `src/frontend/explain.js`, `src/frontend/index.html`, `docs/load-path-explorer.md`,
  `CHANGELOG.md`
- **Heads up:** Uses native accessible disclosure controls; no dependencies added.

### 2026-10-27 — Add gridline elevation views
**Who:** Kevin (+ Copilot SDK in VS Code) · **Branch:** feature/named-gridlines

- **What changed:** Added an Elevation camera action: choose it, then click a gridline to isolate
  and frame that vertical model plane. It switches to lateral mode and shows story wall shears and
  base uplift labels. Gridline renaming and show/hide remain available outside elevation mode.
- **Why:** Inspect a specific lateral frame in elevation and see its reactions.
- **Files:** `src/frontend/scene.js`, `src/frontend/index.html`, `src/frontend/app.js`,
  `src/frontend/overlay.js`, `docs/load-path-explorer.md`, `CHANGELOG.md`
- **Heads up:** The section includes members lying on the selected plane; imported models still do
  not have calculated lateral results.

### 2026-10-27 — Optional member self-weight in the gravity analysis
**Who:** Zack (+ Claude Code) · **Branch:** feature/self-weight

- **What changed:** `LP.runGravity` can add member self-weight, read from `inputs.selfWeight =
  { on, beam, girder, column }` in plf. Beams and girders carry it as a uniform load, and each
  column adds its own story's weight at its bottom. It's off by default; the assumed weights
  (`LP.SELF_WEIGHT_DEFAULTS`: 30 / 60 / 50 plf) are roughly a W16x26 filler beam, W24x55 girder
  and W10x49 column. Each member's `selfWeight` field says how much of its load is self-weight,
  and the panel shows the self-weight line in the calc when it's on. Added 9 hand-calc checks,
  and the tributary-area check now covers self-weight too (58 checks, all passing).
- **Why:** column and footing loads are low without the framing's own weight, and seeing where
  the framing's own weight goes is part of understanding the load path.
- **Files:** `src/shared/gravity.js`, `tests/shared/check.js`, `docs/load-path-explorer.md`,
  `CHANGELOG.md`
- **Heads up:** **Off by default, so no numbers change.** **Ask for Nick (role 1):** add a "Member
  self-weight" checkbox under Gravity loads, plus beam / girder / column plf boxes, read into
  `inputs.selfWeight`. Spec in `docs/load-path-explorer.md`. The deck's own weight isn't added
  because it's already in the dead psf. Lateral analysis doesn't read gravity results, so seismic
  weight is unchanged.

### 2026-10-27 — Make collector arrows visible
**Who:** Nick (+ Claude Code) · **Branch:** fix/collector-arrows

- **What changed:** In the lateral arrows' collector stage, the arrows now ride 3.5 ft above the edge
  beams and draw on top of them, and they are sized against the largest collector force at that level
  (with a visible minimum) instead of the wall base shear.
- **Why:** they were hidden inside the edge beam / collector members, and on the shared scale a 1.1 k
  collector next to a 16.5 k base shear shrank to specks.
- **Files:** `src/frontend/lateral-arrows.js`, `CHANGELOG.md`
- **Heads up:** collector arrow size now compares collectors with each other, not with the walls; the
  labels carry the actual forces. All collector arrows now point with the load: compression segments
  push into the wall (growing toward it), tension segments pull it along (shrinking away from it).

### 2026-10-27 — Gravity results now include each member's tributary area
**Who:** Zack (+ Claude Code) · **Branch:** feature/gravity

- **What changed:** `LP.runGravity` now puts `tribArea = { rects, area }` on every deck, beam,
  girder, column and footing: the plan rectangles the member's load comes from. Columns list one
  rectangle per level they support; footings list all levels. Column calcs in the panel now start
  with "Tributary area at Level 2 = 30 ft x 25 ft = 750 sq ft". Added 9 checks, including one that
  every member in four test buildings carries exactly pressure x its tributary area.
- **Why:** so the 3D view can shade the tributary area of the selected member, the clearest way
  to show where a member's load comes from.
- **Files:** `src/shared/gravity.js`, `tests/shared/check.js`, `docs/load-path-explorer.md`,
  `CHANGELOG.md`
- **Heads up:** **Roles 2 and 3:** the data is ready, nothing draws it yet. The field is
  documented in `docs/load-path-explorer.md`. Draw each rectangle as a flat patch at its `z`
  with `LP.toWorld`. It's named `tribArea` because beams already use `trib` for the tributary
  *width* (a number). No change to load values; all 49 checks pass. Merged the latest `dev`
  (Sam's IFC import) into this branch first. Imported IFC models still aren't analysed, so they
  have no `tribArea`.

### 2026-10-27 — Add gravity check cases: edge and corner columns, unequal bays, one-bay buildings
**Who:** Zack (+ Claude Code) · **Branch:** feature/gravity

- **What changed:** Added 19 hand-calc checks to the gravity part of `tests/shared/check.js`: edge
  and corner columns and footings in the existing 2 x 2 building; a building with unequal bays
  (X 20 + 40 ft, Y 24 + 30 ft); a one-bay, two-story building; and a one-bay, one-story building
  with no filler beams. Each case also checks that the footings add up to the total load.
- **Why:** the original checks covered the center column and one corner. Edge columns, unequal
  bays and tiny buildings are where tributary widths and girder reactions go wrong, so these guard
  every later change to `gravity.js` (tributary shading, self-weight).
- **Files:** `tests/shared/check.js`, `CHANGELOG.md`
- **Heads up:** no change to `gravity.js`; all 40 checks pass. The new cases build their own models
  and run gravity only, so they don't depend on the lateral wall layout. `node tests/shared/check.js`
  before merging, as always.

### 2026-10-27 — Draw lateral load as staged arrows instead of dots
**Who:** Nick (+ Claude Code) · **Branch:** feature/lateral-arrows

- **What changed:** In lateral mode the flow dots are replaced by arrows that follow one level's load
  down in five stages, one at a time, with a caption bar at the bottom of the 3D view (click a stage to
  jump to it): (1) wind as an even grid of arrows on the face, or seismic as a grid on the floor;
  (2) arrows that enter the diaphragm heading downwind and arc diagonally onto each wall line, landing
  evenly along it; (3) collector forces growing toward the wall, labeled compression / tension;
  (4) shear down the walls story by story, as a diagonal strut or as edge shear flow (View → Wall
  arrows); (5) base shear plus uplift and compression at the wall ends. Gravity mode keeps its dots.
- **Why:** dots didn't say which way load pushes or how it gets from the floor into the walls. The
  design was iterated with Nick in a standalone prototype first.
- **Files:** `src/frontend/lateral-arrows.js` (new), `src/frontend/overlay.js`,
  `src/frontend/index.html`, `src/frontend/app.js`, `docs/load-path-explorer.md`, `CHANGELOG.md`
- **Heads up:** the arrows follow the same level as the diagrams (the roof, or the clicked member's
  level). All arrows share one size scale based on the largest base shear, except stages 1–2, whose
  per-foot arrows are drawn larger than their true share so they're visible. Wall and foundation
  arrows draw on top of the walls and footings. Imported models get no arrows (no analysis yet).

### 2026-10-27 — Diaphragm diagram: include the accidental torsion mass shift
**Who:** Josh (+ Claude Code), approved by Nick (role 3 owner) · **Branch:** feature/lateral-loads

- **What changed:** `LP.diaphragmDiagram` draws the story load as a linearly varying (trapezoidal)
  load with the same total and its centroid moved by `b.rigid.ec - b.rigid.e`, instead of a uniform
  load. `w1 = 12 F shift / depth^3` is the slope.
- **Why:** with accidental torsion the wall forces assume the mass sits 5% off center, but the
  diagram still loaded the floor at its center, so the moment missed closing by exactly F x e_acc
  (e.g. 47 k-ft at Level 2 of the test building).
- **Files:** `src/shared/diagrams.js`, `CHANGELOG.md`
- **Heads up:** no change for wind, flexible diaphragms or torsion off (`shift = 0`). Seismic + rigid
  diagrams now close in X and Y for symmetric and eccentric layouts; all 30 `check.js` checks pass
  (run in the browser, Node not installed here). Role 3 still owns this file; this was a one-off
  agreed with Nick.

### 2026-10-27 — Add 5% accidental torsion to the rigid diaphragm (seismic)
**Who:** Josh (+ Claude Code) · **Branch:** feature/lateral-loads

- **What changed:** `LP.distribute` now adds ASCE 7 12.8.4.2 accidental torsion for seismic load on
  a rigid diaphragm: the mass is shifted ±5% of the building width across the load. One shift is
  used per story, the one that loads the heaviest wall; the opposite shift mirrors it onto the
  walls on the other side. The wall calc line shows it, e.g.
  `e = 0 + 2.5 accidental = 2.5 ft; design each wall for the worse of +/-5%`. `b.rigid` gains
  `eAcc` and `ec` (eccentricity used); `b.rigid.e` is unchanged.
- **Why:** a symmetric building previously had zero torsion on a rigid diaphragm, which ASCE 7
  doesn't allow for seismic design. One shift per story (not a worst case per wall) keeps wall
  forces summing to the story force, so the diaphragm diagrams in `diagrams.js` still close.
- **Files:** `src/shared/lateral.js` (`LP.distribute` rigid branch only), `CHANGELOG.md`
- **Heads up:** On by default; `inputs.lateral.accidentalTorsion: false` turns it off (no checkbox
  yet, see `docs/role5-inputs.md`). Wind and flexible diaphragms are unchanged. Walls on the light
  side show the shift that reduces their force; the calc line says to design for the worse of ±5%.
  All 30 checks in `check.js` pass when run in the browser (Node not installed here, so `check.js`
  itself was not run). Role 6: a seismic + rigid check case would be good; test building, Level 2:
  direct 9.43 k + torsion 0.43 k, walls 9.86 / 9.00 k, sum 18.86 k = F.

### 2026-10-27 — Add role 5 lateral input list for role 1
**Who:** Josh (+ Claude Code) · **Branch:** feature/lateral-loads

- **What changed:** Added `docs/role5-inputs.md`: the ASCE 7-22 inputs role 5 needs (risk
  category, SDS, SD1, lateral system, wind speed, exposure, accidental torsion), with defaults,
  proposed `inputs.lateral` keys, and MVP / nice-to-have / stretch priority.
- **Why:** the new input boxes live in role 1's files (`index.html`, `app.js`, `model.js`), so
  role 1 needs the list before role 5's seismic and wind math can be wired up.
- **Files:** `docs/role5-inputs.md`, `CHANGELOG.md`
- **Heads up:** proposal only, no code changed. Nick: the "Ask for role 1" table at the top is the
  part you need. The current Cs and Wind (psf) boxes stay as an Override mode.

### 2026-10-27 — Add ASCE 7 lateral inputs to the panel (role 5's ask)
**Who:** Nick (+ Claude Code) · **Branch:** feature/lateral-inputs

- **What changed:** The Lateral loads panel has an Input mode toggle. **Override** (default) shows
  the existing Wind (psf) and Seismic Cs boxes. **ASCE 7** shows risk category, SDS, SD1, lateral
  system, wind speed V and exposure. An Accidental torsion checkbox applies to both. All of them
  land in `inputs.lateral` under the keys from Josh's `docs/role5-inputs.md`.
- **Why:** role 5 is replacing the hand-typed Cs and psf with ASCE 7 calculations and needs these
  inputs; Override keeps the simple teaching version.
- **Files:** `src/shared/model.js`, `src/frontend/index.html`, `src/frontend/app.js`,
  `docs/load-path-explorer.md`, `CHANGELOG.md`
- **Heads up:** **For role 5:** the default is `mode: 'override'`, and a missing `mode` means
  override too, so today's numbers and the hand-calc tests don't change. Set `LP.asce7Ready = true`
  in `lateral.js` once `storyForces` reads the ASCE 7 inputs; until then, ASCE 7 mode shows a
  warning and uses the override values. System keys: `specialRCWall`, `ordinaryRCWall`,
  `specialMasonryWall`. `accidentalTorsion` does nothing on `dev` until role 5's torsion change merges.

### 2026-10-27 — Fix overlapping labels in plan view
**Who:** Nick (+ Claude Code) · **Branch:** fix/plan-label-overlap

- **What changed:** Story force arrows now meet the building mid-bay instead of on a grid line, and
  their labels sit together just past the longest arrow, one row per level. Chord labels moved to
  the far corners of the diaphragm (now "Max chord tension / compression"), and the diaphragm shear
  and moment titles moved past the far edge, one row each.
- **Why:** in plan view the chord, story force and diagram labels sat on top of each other and on
  the grid bubbles, in both load directions.
- **Files:** `src/frontend/overlay.js`, `CHANGELOG.md`
- **Heads up:** the flow dots for story forces follow the moved arrows (`storyFace`); the analysis
  is unchanged, so `lateral.js` paths still record the windward point at mid-face.

### 2026-10-27 — Add camera view presets and grid bubbles
**Who:** Nick (+ Claude Code) · **Branch:** feature/camera-views

- **What changed:** 3D / Plan / Front / Side buttons at the top right of the 3D view glide the
  camera to each preset. Plan and elevations use a narrow field of view so they read like drawings.
  Dashed grid lines and bubbles (1, 2, 3... along X; A, B, C... along Y) are drawn on the ground.
- **Why:** plan view makes the diaphragm diagrams (PR #2) easy to read, and grid bubbles let people
  match member labels like "Column B2" to the model.
- **Files:** `src/frontend/scene.js`, `docs/load-path-explorer.md`, `CHANGELOG.md`
- **Heads up:** the view buttons are created by `scene.js` itself, so `index.html` and `app.js` are
  unchanged. Branched from `dev` before PR #2 merged; if both PRs edit the top of this log, keep both
  entries.

### 2026-10-27 — Draw diaphragm shear, moment, chord and collector diagrams in 3D
**Who:** Nick (+ Claude Code) · **Branch:** feature/diaphragm-diagrams

- **What changed:** In lateral mode, the diaphragm's shear (blue) and moment (orange) diagrams are
  drawn flat on the floor, chord tension and compression are labeled at the point of max moment,
  and collector force is drawn as an upright fence along each wall line. They show on the roof, or
  on the level of the clicked member. New "Show diagrams" toggle under View.
- **Why:** the diaphragm-as-a-flat-beam idea is the part of lateral load path engineers find
  hardest; switching flexible to rigid now visibly changes the diagrams.
- **Files:** `src/shared/diagrams.js` (new), `src/frontend/overlay.js`, `src/frontend/index.html`,
  `src/frontend/app.js`, `tests/shared/check.js`, `docs/load-path-explorer.md`, `CHANGELOG.md`
- **Heads up:** diagrams are built by statics from the wall-line forces the analysis already
  produces (10 new checks, all 30 passing), so they don't touch `lateral.js`. With a rigid diaphragm
  and torsion, the perpendicular walls' couple is included so the moment closes. **For role 6:**
  `runLateral` still computes chord force from simple spans between wall lines, so in the rigid
  eccentric case the chord member says 0.45 k while the diagram says 0.7 k at the roof. Using
  `LP.diaphragmDiagram(b, li).Mext / d` there would make them agree.

### 2026-10-27 — Repo renamed to Team-17-Hackathon-NCSEA
**Who:** Sam (+ Claude Code) · **Branch:** dev

- **What changed:** The GitHub repository was renamed from `Team-24-Hackathon-NCSEA` to
  `Team-17-Hackathon-NCSEA`. Updated the clone URL and folder names in `README.md` and
  `docs/load-path-explorer.md`.
- **Why:** The repo name was the last place still carrying the wrong team number.
- **Files:** `README.md`, `docs/load-path-explorer.md`, `CHANGELOG.md`
- **Heads up:** **Everyone with an existing clone should repoint their remote**, or pushes keep
  going through GitHub's redirect:
  `git remote set-url origin https://github.com/THELaw688/Team-17-Hackathon-NCSEA.git`
  Your local folder can keep its old name; only the remote URL matters. New clones get it right.

### 2026-10-27 — Add IFC drop zone and import
**Who:** Sam (+ Claude Code) · **Branch:** dev

- **What changed:** A drop zone at the top of the controls panel takes a dragged or picked `.ifc`
  file. `src/shared/import-ifc.js` parses it with web-ifc (WASM, from CDN), reads columns, beams,
  members, slabs, walls, footings and plates, and returns neutral elements;
  `src/frontend/dropzone.js` handles the UI and reports what was found. Imported models are built
  with `LP.modelFromElements` and drawn. Added `LP.detectLengthScale`.
- **Why:** real Revit models are the point — a teaching tool that only draws a generated grid can't
  be pointed at a building anyone actually designed.
- **Files:** `src/shared/import-ifc.js`, `src/frontend/dropzone.js`, `src/shared/elements.js`,
  `src/frontend/index.html`, `src/frontend/app.js`, `tests/shared/check-import.js`, `CHANGELOG.md`
- **Heads up:** **An imported model draws but is not analysed.** `gravity.js` and `lateral.js`
  address members by generated ids (`COL-B2-L2`) and read `b.beamXs`, neither of which an imported
  building has — teaching them to read imported geometry is role 4 and role 6 work. The panel says
  so rather than showing a blank load path. web-ifc is pinned at **0.0.78** and loaded as the IIFE
  build (`web-ifc-api-iife.js`) injected on first import — ~6 MB, so not loaded on page open — and
  `SetWasmPath` must pass `absolute = true` or the WASM fetch 404s. Units are detected
  from implied storey heights rather than the file's declaration, because a model 3.28x too big
  draws fine and is silently wrong; the panel shows overall size so a human can check. Element
  geometry comes from world-space bounding boxes, so a sloped or curved member becomes its box.
  `.e2k` is routed but not implemented yet.

### 2026-10-27 — Spec and foundation for IFC / ETABS import and in-program editing
**Who:** Sam (+ Claude Code) · **Branch:** dev

- **What changed:** Added `docs/import-and-editing.md` (the design for pulling models from Revit IFC
  and ETABS, and for editing the model in the app) and `src/shared/elements.js`, the neutral element
  layer every source feeds: `LP.element`, `LP.cluster1d`, `LP.inferGrid`, `LP.snap`,
  `LP.classifySpan`, `LP.modelFromElements`. Checks in `tests/shared/check-import.js`.
- **Why:** `LP.buildModel` *generates* a building from a regular grid, so every member's position is
  known by construction — which is exactly what the tributary-area analysis depends on. An imported
  model is *given* as arbitrary geometry and fits none of that. The element layer lets any source
  produce a building without changing `gravity.js`, `lateral.js`, `scene.js` or `explain.js`: grid
  lines are recovered by clustering real column positions, and a regularity score decides whether
  the load path can honestly be calculated or the model is drawn only.
- **Files:** `docs/import-and-editing.md`, `src/shared/elements.js`, `tests/shared/check-import.js`,
  `CHANGELOG.md`
- **Heads up:** The importers themselves (`import-ifc.js`, `import-etabs.js`) and the editor UI
  (`editor.js`) are **not written yet** — the spec says what each must produce. Decisions taken:
  web-ifc WASM from CDN for IFC, `.e2k` text for ETABS, grid inference over a general frame solver.
  **IFC/ETABS files are parsed in memory and discarded — never uploaded, never written to disk or
  browser storage;** the derived model stays in memory for the session only. Run
  `node tests/shared/check-import.js` alongside the existing `check.js` before merging.

### 2026-10-27 — Add load path explorer: 3D app, gravity + lateral analysis, hand-calc checks
**Who:** Nick (+ Claude Code) · **Branch:** feature/load-path-explorer

- **What changed:** First working version of the tool. A 3D browser app (Three.js) builds a steel
  building from grid inputs, runs gravity analysis (deck, beams, girders, columns, footings) and
  lateral analysis (wind or seismic story forces, flexible or rigid diaphragm with torsion, chords,
  collectors, shear walls, overturning), colors members by force, animates load flow, and explains
  any clicked member: where its load comes from, where it goes, and the calculation.
- **Why:** gives all 7 people a running app and one shared building data format to build on in
  parallel, instead of starting from a blank repo at kickoff.
- **Files:** `src/frontend/` (`index.html`, `app.js`, `scene.js`, `overlay.js`, `explain.js`),
  `src/shared/` (`model.js`, `gravity.js`, `lateral.js`), `tests/shared/check.js`,
  `docs/load-path-explorer.md`, `docs/decisions.md`, `CHANGELOG.md`
- **Heads up:** picks the stack (plain JS + Three.js, no build step, no backend); see
  `docs/decisions.md`, raise it in chat if you disagree. Run: `python -m http.server 8765` from the
  repo root, open `/src/frontend/`. Run `node tests/shared/check.js` before merging analysis changes
  (20 hand-calc checks, all passing). Role-by-role file ownership and next tasks are in
  `docs/load-path-explorer.md`. This branch is based on `main` because `dev` was 8 commits behind
  it, so merging it into `dev` also brings `dev` up to date.

### 2026-10-27 — Add automated staleness guards
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Added `.githooks/pre-commit`, which fetches and refuses a commit when your
  branch is behind `origin`, and `scripts/session-start.sh` plus `.claude/settings.json`, which make
  every Claude Code session pull and print the newest CHANGELOG entries before work begins.
- **Why:** The README and this file asked people to pull first, but nothing enforced it. Within an
  hour of writing that rule we hit it for real: a README rename was pushed to GitHub while local
  work renamed the same line, and the two had to be merged by hand. Conventions don't survive
  hackathon pace; hooks do.
- **Files:** `.githooks/pre-commit`, `scripts/session-start.sh`, `.claude/settings.json`,
  `README.md`, `CHANGELOG.md`
- **Heads up:** **The pre-commit hook does nothing until you run `git config core.hooksPath
  .githooks` once in your clone** — git won't enable a repo-supplied hook automatically, by design.
  The Claude Code hook needs no setup beyond cloning. Overrides: `ALLOW_STALE=1 git commit` for a
  deliberate stale commit, `--no-verify` to skip hooks entirely. Merges and rebases are exempt, as
  they're the cure rather than the disease. Copilot and Cursor users get the git hook but not the
  session hook — those tools have no equivalent.

### 2026-10-27 — Rename team to Table 17, add one-command sync script
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Renamed the team from "Team 24" to "Table 17" in the README. Added
  `scripts/sync.ps1`, which pulls, stages, commits, and pushes in a single command, and documented
  it as the normal workflow.
- **Why:** The team identifier was wrong. The script exists so the git sequence is stored in one
  place — no more committing work and forgetting to push it, or pushing a branch while leaving the
  tags behind.
- **Files:** `README.md`, `CHANGELOG.md`, `scripts/sync.ps1`
- **Heads up:** The repository is still *named* `Team-24-Hackathon-NCSEA` on GitHub — only a repo
  admin can change that, and the clone URL changes with it. Usage:
  `.\scripts\sync.ps1 -Message "your message"`, plus `-AllBranches -Tags` when you need them.
  The script warns if a commit has no CHANGELOG entry but won't block you.

### 2026-10-27 — Add shared links file
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Created `docs/links.md` holding hackathon reference links, starting with the
  organizers' Google Slides deck. Linked it from the top of the README.
- **Why:** One known place for shared links beats hunting through chat history mid-hackathon.
- **Files:** `docs/links.md`, `README.md`, `CHANGELOG.md`
- **Heads up:** AI assistants can't open Google Docs/Slides links — they need a signed-in session.
  If a linked document's contents matter, paste the relevant text into chat or into `docs/`.

### 2026-10-27 — Add presentation branch
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Created the `presentation` branch off `main` for demo and judging materials —
  slides, demo script, screenshots, talking points. Documented it in the README's branch table,
  folder structure, and a short "working on the demo" section.
- **Why:** Presentation work and code work touch completely different files and happen on different
  schedules. Separating them means nobody editing slides collides with somebody editing code.
- **Files:** `README.md`, `CHANGELOG.md`
- **Heads up:** Demo materials go in a `presentation/` folder **on that branch**, not on `main`.
  Switch with `git checkout presentation`. It merges into `main` late or not at all.

### 2026-10-27 — Remove connection test files
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Deleted `test.txt` and `test2.txt`.
- **Why:** They only existed to prove the clone and push worked. That's confirmed, so they were
  noise in the repo root.
- **Files:** `test.txt`, `test2.txt` (both deleted)
- **Heads up:** The repo now contains only `README.md` and `CHANGELOG.md`. If you cloned earlier and
  still see the test files, `git pull` will remove them.

### 2026-10-27 — Add team README and changelog
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Added `README.md` with the team's documentation standards, collaboration rules,
  branch strategy, and agreed folder layout. Added this changelog and the protocol for keeping it.
- **Why:** The team is distributed and several people are working through AI assistants. A shared
  written contract plus a running log means everyone's tool starts from the same understanding
  instead of guessing.
- **Files:** `README.md`, `CHANGELOG.md`
- **Heads up:** The folder layout in the README is a *convention we agreed to*, not a description of
  folders that exist — the stack hasn't been chosen yet. Create folders as needed and keep the
  names. Copy `README.md` to `CLAUDE.md` / `.github/copilot-instructions.md` / `.cursorrules` so
  your own tool picks up the rules.

### 2026-10-27 — Set up branches and initial tag
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Created `dev`, `feature/frontend`, and `feature/backend` branches, plus
  annotated tag `v0.0.1` marking initial setup.
- **Why:** Gives the team somewhere to work other than `main`, and a known-good point to fall back
  to during the demo.
- **Files:** none — branches and tags only
- **Heads up:** Base new work on `dev`, not `main`. Pull requests target `dev`.

### 2026-10-27 — Initial repository setup
**Who:** Sam (+ Claude Code) · **Branch:** main

- **What changed:** Cloned the empty repository locally, verified the GitHub connection with
  `test.txt` and `test2.txt`.
- **Why:** Confirming push access before the team starts committing real work.
- **Files:** `test.txt`, `test2.txt`
- **Heads up:** Both test files are scaffolding and can be deleted once real code lands.
