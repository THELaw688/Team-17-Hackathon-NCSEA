# Decisions

Short record of real choices: what we picked, why, and what we passed on. Newest at the top.

## 2026-10-27 — How imported models get analysed

**Chose:** a neutral `StructuralElement` list that every source produces (bay-grid inputs, IFC,
ETABS, the editor), fed to `LP.modelFromElements`, which recovers grid lines by clustering real
column positions. Regularity is measured by whether columns *share* grid lines — a line with one
lone column is a coincidence, not a grid line. When fewer than 60% of distinct column positions sit
on shared lines, the model is drawn but not analysed, and the app says why.

**Why:** the analysis is tributary-area hand-calc work — it needs a grid to exist. Real buildings are
mostly regular, so inferring one gets us real models in the tool today, and the regularity score
keeps the failure honest instead of producing confident nonsense on an irregular building.

**Passed on:** rewriting `gravity.js` and `lateral.js` as a general frame solver that works on any
geometry (correct, but a rewrite of both engines and not an afternoon's work); draw-only import
(safe, but then an imported model can't do the one thing this tool is for).

**Also chose:** web-ifc WASM from a CDN for IFC parsing, over hand-rolling a STEP parser —
`IfcLocalPlacement` chains, extruded-solid profiles and 100MB Revit exports are where a quick parser
breaks. And ETABS `.e2k` text export, because `.EDB` is proprietary binary and unreadable in a
browser.

**Privacy requirement, agreed as binding:** uploaded models are parsed in memory and discarded. No
upload, no disk write, no browser storage. The app has no backend, which is the strongest form of
that guarantee. Only the derived structural model persists, in memory, until the tab closes.

## 2026-10-27 — Stack for the load path explorer

**Chose:** plain JavaScript in the browser with Three.js r128 from a CDN. No build step, no backend.
Analysis code lives in `src/shared/` and touches no DOM, so `node tests/shared/check.js` runs it
against hand calculations without a browser.

**Why:** a 7-person team with mixed coding experience, a 5pm finish, and a demo that has to run on
any laptop. Classic `<script>` files mean anyone can open a file and edit it, with no toolchain to
install or break.

**Passed on:** a Revit or Grasshopper plugin (works on real models, but setup alone would take the
morning); Python / Jupyter (strong for calculations, weak for interactive 3D); a React + Vite app
(cleaner modules, but a build step for people who don't use one daily). A Revit / ETABS import can
come later by producing the same building JSON.

**Proposed, not yet agreed by the whole team.** Raise it in chat if you disagree.

## 2026-10-27 — Building data format

**Chose:** one building object built by `LP.buildModel(inputs)` in `src/shared/model.js`: levels,
members keyed by id, and a list of load `paths` (`from`, `to`, `value`, `at`). Each analysis writes
`results.gravity` or `results.lateral` on members and appends paths. The format is documented in
`docs/load-path-explorer.md`.

**Why:** the load path itself is a graph of "this member hands this much load to that one". Storing
it explicitly lets the 3D flow animation, the trace highlight and the explain panel all read the same
data, so the analysis and the 3D view can be built in parallel.

**Passed on:** having the 3D layer recompute load transfer from member geometry, which would
duplicate the analysis logic in two places.
