# Decisions

Short record of real choices: what we picked, why, and what we passed on. Newest at the top.

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
