// Neutral structural elements and grid inference (owner: role 1, lead / integrator).
//
// Every model source - the bay-grid inputs, an IFC import, an ETABS import, or the in-app editor -
// produces a list of StructuralElement. LP.modelFromElements turns that list into the same building
// object LP.buildModel returns, so the analysis, the 3D scene and the explain panel are unchanged.
//
// The problem being solved: buildModel GENERATES a regular grid, so every member's position is known
// by construction. An imported model is GIVEN as arbitrary geometry. We recover a grid from where
// the columns actually are, and say so honestly when the building is too irregular for one.
//
// Units: ft, psf, kips. Importers convert at their own boundary; everything here is already ft.
// See docs/import-and-editing.md.
(function (root) {
  const LP = root.LP = root.LP || {};

  LP.ELEMENT_KINDS = ['column', 'beam', 'girder', 'brace', 'slab', 'wall', 'footing'];

  // Wider than modelling slop, narrower than any real bay, so near-coincident columns merge into one
  // grid line but adjacent columns never do.
  LP.GRID_TOL = 1.0;

  // Below this share of column positions sharing their grid lines with other columns, the building
  // is too irregular for tributary-area analysis and we fall back to drawing only.
  LP.REGULARITY_MIN = 0.6;

  const letter = i => {
    // A..Z, then AA, AB... for buildings with more than 26 grid lines in one direction.
    let s = '';
    i += 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - r - 1) / 26; }
    return s;
  };

  /**
   * Make a StructuralElement, filling in the fields callers usually leave out.
   * @param {object} e partial element; `kind` is required
   * @returns {object} complete StructuralElement
   */
  LP.element = function (e) {
    return Object.assign({
      kind: 'beam', a: null, b: null, outline: null, zTop: null, zBottom: null,
      material: 'other', section: '', name: '', source: 'manual', sourceId: ''
    }, e);
  };

  /**
   * Group 1-D coordinates into clusters, for recovering grid lines from real column positions.
   * Values within `tol` of the running cluster join it; a larger gap starts a new one.
   * @param {number[]} values coordinates (ft), any order
   * @param {number} [tol=LP.GRID_TOL] maximum gap within a cluster (ft)
   * @returns {object[]} clusters [{ value: mean, members: [original values] }], ascending
   */
  LP.cluster1d = function (values, tol) {
    tol = tol == null ? LP.GRID_TOL : tol;
    const sorted = values.filter(v => Number.isFinite(v)).slice().sort((p, q) => p - q);
    const out = [];
    sorted.forEach(v => {
      const last = out[out.length - 1];
      // Compare against the cluster's current mean, not its first value, so a cluster cannot drift
      // wider than the tolerance one small step at a time.
      if (last && v - (last.members.reduce((s, m) => s + m, 0) / last.members.length) <= tol) {
        last.members.push(v);
      } else {
        out.push({ members: [v] });
      }
    });
    out.forEach(c => { c.value = c.members.reduce((s, m) => s + m, 0) / c.members.length; });
    return out;
  };

  const isVertical = e => e.a && e.b && Math.abs(e.a.x - e.b.x) < LP.GRID_TOL &&
                          Math.abs(e.a.y - e.b.y) < LP.GRID_TOL && Math.abs(e.a.z - e.b.z) > LP.GRID_TOL;

  const nearest = (value, lines) => {
    let best = -1, bestD = Infinity;
    lines.forEach((g, i) => { const d = Math.abs(g - value); if (d < bestD) { bestD = d; best = i; } });
    return { index: best, dist: bestD };
  };

  /**
   * Recover grid lines and levels from where elements actually are.
   *
   * Columns define the plan grid: they are the elements whose position a structural engineer thinks
   * of as "on grid B2". Horizontal elements define levels, because a column spans between levels
   * while a beam sits at one.
   *
   * @param {object[]} elements StructuralElement list
   * @param {object} [opts] { tol } grid tolerance in ft
   * @returns {object} { xs, ys, xLabels, yLabels, elevs, regularity, analysisReady, warnings }
   */
  LP.inferGrid = function (elements, opts) {
    opts = opts || {};
    const tol = opts.tol == null ? LP.GRID_TOL : opts.tol;
    const warnings = [];

    const columns = elements.filter(e => e.kind === 'column' || (e.kind !== 'slab' && e.kind !== 'wall' && isVertical(e)));
    const xs = LP.cluster1d(columns.map(e => e.a.x), tol).map(c => c.value);
    const ys = LP.cluster1d(columns.map(e => e.a.y), tol).map(c => c.value);

    // Levels: the elevation of anything horizontal (beams, girders, slabs), plus the top of every
    // column, so a column stub with no framing at its top still creates a level.
    const zs = [];
    elements.forEach(e => {
      if (e.kind === 'slab' && e.zTop != null) zs.push(e.zTop);
      else if (e.a && e.b && !isVertical(e) && e.kind !== 'wall') zs.push((e.a.z + e.b.z) / 2);
      else if (isVertical(e)) zs.push(Math.max(e.a.z, e.b.z));
    });
    let elevs = LP.cluster1d(zs, tol).map(c => c.value);

    // The lowest column base is grade, not a level - nothing frames into it.
    const bases = columns.map(e => Math.min(e.a.z, e.b.z));
    const grade = bases.length ? Math.min.apply(null, bases) : 0;
    elevs = elevs.filter(z => z > grade + tol);

    // How regular is this grid really?
    //
    // Not "does each column sit on a grid line" - the lines are derived FROM the columns, so that is
    // trivially true and scores a scatter of random columns a perfect 1.0. What makes a grid a grid
    // is that columns SHARE lines: on a real frame, several columns stand on grid line B, and a beam
    // can span between them. A line holding one lone column is not a grid line, it is a coincidence.
    //
    // So: count distinct plan positions per line (not column instances - a 3-storey building stacks
    // 3 columns on one point), and call a column regular when both of its lines are shared.
    const seen = new Set(), posX = {}, posY = {};
    const positions = [];
    columns.forEach(e => {
      const xi = nearest(e.a.x, xs).index, yi = nearest(e.a.y, ys).index;
      const key = xi + ':' + yi;
      if (!seen.has(key)) {
        seen.add(key);
        positions.push({ xi, yi });
        posX[xi] = (posX[xi] || 0) + 1;
        posY[yi] = (posY[yi] || 0) + 1;
      }
    });
    const shared = positions.filter(p => posX[p.xi] >= 2 && posY[p.yi] >= 2).length;
    const regularity = positions.length ? shared / positions.length : 0;

    if (!columns.length) warnings.push('No columns found, so no grid could be inferred. Nothing to analyse.');
    else if (regularity < LP.REGULARITY_MIN) {
      warnings.push(`Only ${Math.round(regularity * 100)}% of column positions line up with others ` +
        'into a grid. The model is drawn but the load path is not calculated - tributary-area ' +
        'analysis needs columns that share grid lines.');
    }
    if (columns.length && !elevs.length) warnings.push('No levels found above grade. Nothing to analyse.');

    return {
      xs, ys, elevs, grade, regularity,
      xLabels: xs.map((_, i) => String(i + 1)),
      yLabels: ys.map((_, j) => letter(j)),
      analysisReady: columns.length > 0 && elevs.length > 0 && regularity >= LP.REGULARITY_MIN,
      warnings
    };
  };

  /**
   * Snap an element onto the inferred grid, recording how far it had to move.
   * @returns {object} { xi, yi, level, offGrid } indices into the grid, or -1
   */
  LP.snap = function (e, grid, tol) {
    tol = tol == null ? LP.GRID_TOL : tol;
    const p = e.a || { x: 0, y: 0, z: 0 };
    const x = nearest(p.x, grid.xs), y = nearest(p.y, grid.ys);
    const z = e.kind === 'column' ? nearest(Math.max(e.a.z, e.b.z), grid.elevs)
                                  : nearest(e.zTop != null ? e.zTop : p.z, grid.elevs);
    return {
      xi: x.dist <= tol ? x.index : -1,
      yi: y.dist <= tol ? y.index : -1,
      level: z.dist <= tol ? z.index : -1,
      offGrid: x.dist > tol || y.dist > tol || z.dist > tol
    };
  };

  /**
   * Classify a horizontal line element as a girder (on a grid line, between grid points) or a filler
   * beam (spanning between girders). IFC and ETABS both call them all "beam"; the distinction is
   * geometric, and the gravity analysis depends on it.
   */
  LP.classifySpan = function (e, grid, tol) {
    tol = tol == null ? LP.GRID_TOL : tol;
    if (!e.a || !e.b) return e.kind;
    const alongX = Math.abs(e.a.y - e.b.y) <= tol;
    const alongY = Math.abs(e.a.x - e.b.x) <= tol;
    if (!alongX && !alongY) return 'beam';           // skewed: treat as a filler beam
    const onLine = alongX ? nearest(e.a.y, grid.ys).dist <= tol : nearest(e.a.x, grid.xs).dist <= tol;
    return onLine ? 'girder' : 'beam';
  };

  /**
   * Turn a neutral element list into the building object the rest of the app reads.
   *
   * Produces the same shape as LP.buildModel: levels, members keyed by id, paths, walls, grid labels.
   * Members carry `element` (the source element) and `offGrid`, which the scene uses to draw
   * unanalysable geometry in grey.
   *
   * @param {object[]} elements StructuralElement list
   * @param {object} [opts] { tol, floorDead, floorLive, roofDead, roofLive, lateral }
   * @returns {object} building b
   */
  LP.modelFromElements = function (elements, opts) {
    opts = opts || {};
    const tol = opts.tol == null ? LP.GRID_TOL : opts.tol;
    const grid = LP.inferGrid(elements, { tol });

    const b = {
      inputs: Object.assign({
        floorDead: 80, floorLive: 50, roofDead: 30, roofLive: 20,
        lateral: { type: 'wind', dir: 'x', windPressure: 20, Cs: 0.10, diaphragm: 'flexible' }
      }, opts),
      fromImport: true,
      xs: grid.xs, ys: grid.ys, xLabels: grid.xLabels, yLabels: grid.yLabels,
      Lx: grid.xs.length ? grid.xs[grid.xs.length - 1] - grid.xs[0] : 0,
      Ly: grid.ys.length ? grid.ys[grid.ys.length - 1] - grid.ys[0] : 0,
      grid, analysisReady: grid.analysisReady, regularity: grid.regularity,
      levels: [], members: {}, paths: [], walls: [], wallLines: [],
      warnings: grid.warnings.slice()
    };

    let below = grid.grade;
    grid.elevs.forEach((elev, i) => {
      const isRoof = i === grid.elevs.length - 1;
      b.levels.push({
        index: i, tag: isRoof ? 'R' : 'L' + (i + 2), name: isRoof ? 'Roof' : 'Level ' + (i + 2),
        elev, below, height: elev - below, isRoof,
        dead: isRoof ? b.inputs.roofDead : b.inputs.floorDead,
        live: isRoof ? b.inputs.roofLive : b.inputs.floorLive
      });
      below = elev;
    });

    // Ids must stay stable across a re-import of the same model, so selection and the explain panel
    // survive an edit. Grid position gives that for on-grid members; off-grid members fall back to a
    // counter, which is stable for a given element order.
    let n = 0;
    const idFor = (kind, s, lv) => {
      const prefix = { column: 'COL', beam: 'BM', girder: 'GD', brace: 'BR', slab: 'DECK', wall: 'W', footing: 'FTG' }[kind] || 'EL';
      const tag = lv ? lv.tag : 'BASE';
      if (s.xi >= 0 && s.yi >= 0) return `${prefix}-${b.yLabels[s.yi]}${b.xLabels[s.xi]}-${tag}`;
      return `${prefix}-${tag}-${n++}`;
    };

    elements.forEach(e => {
      const s = LP.snap(e, grid, tol);
      const lv = s.level >= 0 ? b.levels[s.level] : null;
      const kind = (e.kind === 'beam' || e.kind === 'girder') ? LP.classifySpan(e, grid, tol) : e.kind;
      const type = kind === 'slab' ? 'deck' : kind;
      const id = idFor(kind, s, lv);
      LP.addMember(b, {
        id, type, element: e, offGrid: s.offGrid,
        level: lv ? lv.index : undefined,
        label: e.name || `${kind[0].toUpperCase()}${kind.slice(1)}${lv ? ' at ' + lv.name : ''}`,
        material: e.material, section: e.section,
        a: e.a || { x: 0, y: 0, z: e.zBottom || 0 },
        b: e.b || { x: 0, y: 0, z: e.zTop || 0 },
        outline: e.outline || null
      });
      if (kind === 'wall') {
        // Walls become lateral elements: the analysis needs their line, direction and length.
        const alongX = e.a && e.b ? Math.abs(e.a.y - e.b.y) <= tol : true;
        if (e.a && e.b) {
          b.walls.push({
            id, name: e.name || 'Wall', dir: alongX ? 'x' : 'y',
            at: alongX ? e.a.y : e.a.x,
            from: alongX ? Math.min(e.a.x, e.b.x) : Math.min(e.a.y, e.b.y),
            to: alongX ? Math.max(e.a.x, e.b.x) : Math.max(e.a.y, e.b.y),
            length: Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)
          });
        }
      }
    });

    b.walls.forEach(w => {
      if (!b.wallLines.some(l => l.dir === w.dir && Math.abs(l.at - w.at) <= tol)) {
        b.wallLines.push({ dir: w.dir, at: w.at, id: `${w.dir}${LP.round(w.at, 1)}`,
          name: w.dir === 'x' ? `line y = ${LP.round(w.at, 1)} ft` : `line x = ${LP.round(w.at, 1)} ft` });
      }
    });

    const counts = {};
    elements.forEach(e => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
    b.importSummary = {
      counts, total: elements.length,
      grids: `${grid.xs.length} x ${grid.ys.length}`, levels: b.levels.length,
      // Shown after import so a human can catch a unit-conversion error, which is otherwise silent.
      size: `${LP.round(b.Lx, 1)} x ${LP.round(b.Ly, 1)} ft, ${LP.round(below - grid.grade, 1)} ft tall`
    };

    return b;
  };
})(typeof window !== 'undefined' ? window : globalThis);
