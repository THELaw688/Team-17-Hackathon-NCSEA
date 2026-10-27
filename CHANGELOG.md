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

- **Sam** — IFC / ETABS import and in-program editing. Spec in `docs/import-and-editing.md`.
  Foundation `src/shared/elements.js` is done; `src/shared/import-ifc.js`,
  `src/shared/import-etabs.js` and `src/frontend/editor.js` are not written yet — if you pick one
  up, say so here first.

---

## Log

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
