// Building data model shared by every module (owner: role 1, lead / integrator).
// Units: lengths in ft, area loads in psf, forces in kips, moments in kip-ft.
// Plan coordinates: x runs east, y runs north, z is elevation above grade.
(function (root) {
  const LP = root.LP = root.LP || {};

  /** Default inputs for a new building. @returns {object} inputs accepted by LP.buildModel */
  LP.defaultInputs = function () {
    return {
      xBays: [30, 30, 30],          // bay widths along X (ft); grid lines 1, 2, 3...
      yBays: [25, 25],              // bay widths along Y (ft); grid lines A, B, C...
      storyHeights: [14, 13, 13],   // bottom story first (ft)
      floorDead: 80, floorLive: 50, // psf
      roofDead: 30, roofLive: 20,   // psf
      beamSpaces: 3,                // filler beam spaces per X bay
      wallPreset: 'symmetric',      // 'symmetric' | 'eccentric'
      walls: null,                  // explicit wall list overrides the preset
      lateral: {
        type: 'wind',               // 'wind' | 'seismic'
        dir: 'x',                   // load direction: 'x' | 'y'
        // 'override' uses the hand-typed windPressure and Cs. 'asce7' uses the inputs below (role 5's
        // math in lateral.js). A missing mode means 'override', so older inputs keep working.
        mode: 'override',           // 'override' | 'asce7'
        windPressure: 20,           // override: net psf on the projected face
        Cs: 0.10,                   // override: seismic response coefficient
        riskCategory: 'II',         // asce7: 'I' | 'II' | 'III' | 'IV' (sets Ie)
        SDS: 1.0,                   // asce7: design short-period spectral acceleration (g)
        SD1: 0.6,                   // asce7: design 1-second spectral acceleration (g)
        system: 'specialRCWall',    // asce7: lateral system key; role 5 maps it to R, Cd, Ct, x
        windSpeed: 105,             // asce7: basic wind speed V (mph)
        exposure: 'C',              // asce7: 'B' | 'C' | 'D'
        accidentalTorsion: true,    // seismic, rigid diaphragm: add the 5% accidental eccentricity
        diaphragm: 'flexible'       // 'flexible' | 'rigid'
      }
    };
  };

  const cumulative = bays => bays.reduce((acc, b) => (acc.push(acc.at(-1) + b), acc), [0]);
  const letter = i => String.fromCharCode(65 + i);

  /**
   * Shear wall layout for a preset.
   * @param {'symmetric'|'eccentric'} preset 'eccentric' pairs a full-length south wall with a one-bay
   *   north wall, so a rigid diaphragm twists and the perpendicular walls pick up torsion.
   * @param {number[]} xs X grid coordinates (ft)
   * @param {number[]} ys Y grid coordinates (ft)
   * @returns {object[]} walls: { id, name, dir: 'x' runs along X at y = at | 'y' runs along Y at x = at, from, to }
   */
  LP.presetWalls = function (preset, xs, ys) {
    const Lx = xs.at(-1), Ly = ys.at(-1);
    const mx = Math.floor((xs.length - 1) / 2), my = Math.floor((ys.length - 1) / 2);
    const yWalls = [
      { id: 'WW', name: 'West wall', dir: 'y', at: 0, from: ys[my], to: ys[my + 1] },
      { id: 'WE', name: 'East wall', dir: 'y', at: Lx, from: ys[my], to: ys[my + 1] }
    ];
    if (preset === 'eccentric') {
      return [
        { id: 'WS', name: 'South wall', dir: 'x', at: 0, from: 0, to: Lx },
        { id: 'WN', name: 'North wall', dir: 'x', at: Ly, from: 0, to: xs[1] }
      ].concat(yWalls);
    }
    return [
      { id: 'WS', name: 'South wall', dir: 'x', at: 0, from: xs[mx], to: xs[mx + 1] },
      { id: 'WN', name: 'North wall', dir: 'x', at: Ly, from: xs[mx], to: xs[mx + 1] }
    ].concat(yWalls);
  };

  LP.addMember = function (b, m) {
    m.results = m.results || {};
    b.members[m.id] = m;
    return m;
  };

  // A path is one step of load transfer: `value` kips go from one member to another.
  // `at` is the connection point (plan x, y, elevation z) used to draw the flow.
  LP.addPath = function (b, mode, from, to, value, at, note) {
    b.paths.push({ mode, from, to, value, at, note: note || '' });
  };

  LP.gridPoint = (b, i, j) => b.yLabels[j] + b.xLabels[i];

  /**
   * Build the grid, levels, members and walls from the inputs. No analysis is run here.
   * @param {object} inputs see LP.defaultInputs
   * @returns {object} building b; its shape is documented in docs/load-path-explorer.md
   */
  LP.buildModel = function (inputs) {
    const xs = cumulative(inputs.xBays), ys = cumulative(inputs.yBays);
    const b = {
      inputs, xs, ys, Lx: xs.at(-1), Ly: ys.at(-1),
      xLabels: xs.map((_, i) => String(i + 1)),
      yLabels: ys.map((_, j) => letter(j)),
      levels: [], members: {}, paths: [], warnings: []
    };

    let elev = 0;
    inputs.storyHeights.forEach((h, i) => {
      const below = elev;
      elev += h;
      const isRoof = i === inputs.storyHeights.length - 1;
      b.levels.push({
        index: i, tag: isRoof ? 'R' : 'L' + (i + 2), name: isRoof ? 'Roof' : 'Level ' + (i + 2),
        elev, below, height: h, isRoof,
        dead: isRoof ? inputs.roofDead : inputs.floorDead,
        live: isRoof ? inputs.roofLive : inputs.floorLive
      });
    });

    // Filler beam positions along X, including the grid lines.
    b.beamXs = [0];
    inputs.xBays.forEach((w, bx) => {
      for (let k = 1; k <= inputs.beamSpaces; k++) b.beamXs.push(xs[bx] + w * k / inputs.beamSpaces);
    });
    b.beamXs = b.beamXs.map(x => Math.round(x * 1000) / 1000);
    const onGridX = x => xs.findIndex(g => Math.abs(g - x) < 1e-6);

    xs.forEach((x, i) => ys.forEach((y, j) => {
      const pt = LP.gridPoint(b, i, j);
      LP.addMember(b, { id: 'FTG-' + pt, type: 'footing', label: 'Footing ' + pt, a: { x, y, z: 0 }, b: { x, y, z: 0 } });
    }));

    b.levels.forEach(lv => {
      const t = lv.tag;
      xs.forEach((x, i) => ys.forEach((y, j) => {
        const pt = LP.gridPoint(b, i, j);
        LP.addMember(b, { id: `COL-${pt}-${t}`, type: 'column', level: lv.index, label: `Column ${pt} below ${lv.name}`,
          a: { x, y, z: lv.below }, b: { x, y, z: lv.elev } });
      }));
      inputs.xBays.forEach((_, bx) => inputs.yBays.forEach((_, by) => {
        LP.addMember(b, { id: `DECK-${t}-${bx}-${by}`, type: 'deck', level: lv.index,
          label: `${lv.name} deck, bay ${b.yLabels[by]}${b.xLabels[bx]}-${b.yLabels[by + 1]}${b.xLabels[bx + 1]}`,
          a: { x: xs[bx], y: ys[by], z: lv.elev }, b: { x: xs[bx + 1], y: ys[by + 1], z: lv.elev }, bx, by });
      }));
      b.beamXs.forEach(x => inputs.yBays.forEach((_, by) => {
        const gi = onGridX(x);
        LP.addMember(b, { id: `BM-${t}-${x}-${by}`, type: 'beam', level: lv.index, onGrid: gi >= 0,
          label: gi >= 0 ? `${lv.name} beam on grid ${b.xLabels[gi]}, ${b.yLabels[by]}-${b.yLabels[by + 1]}`
                         : `${lv.name} filler beam at x = ${x} ft, ${b.yLabels[by]}-${b.yLabels[by + 1]}`,
          a: { x, y: ys[by], z: lv.elev }, b: { x, y: ys[by + 1], z: lv.elev }, by });
      }));
      ys.forEach((y, j) => inputs.xBays.forEach((_, bx) => {
        LP.addMember(b, { id: `GD-${t}-${b.yLabels[j]}-${bx}`, type: 'girder', level: lv.index,
          label: `${lv.name} girder on grid ${b.yLabels[j]}, ${b.xLabels[bx]}-${b.xLabels[bx + 1]}`,
          a: { x: xs[bx], y, z: lv.elev }, b: { x: xs[bx + 1], y, z: lv.elev }, bx, j });
      }));
      LP.addMember(b, { id: `DIA-${t}`, type: 'diaphragm', level: lv.index, label: `${lv.name} diaphragm`,
        a: { x: 0, y: 0, z: lv.elev }, b: { x: b.Lx, y: b.Ly, z: lv.elev } });
      LP.addMember(b, { id: `LAT-${t}`, type: 'storyForce', level: lv.index, label: `${lv.name} story force`,
        a: { x: 0, y: 0, z: lv.elev }, b: { x: 0, y: 0, z: lv.elev } });
      // Diaphragm edges: they act as chords for one load direction.
      [['S', 0, 0, b.Lx, 0], ['N', 0, b.Ly, b.Lx, b.Ly], ['W', 0, 0, 0, b.Ly], ['E', b.Lx, 0, b.Lx, b.Ly]].forEach(([side, x1, y1, x2, y2]) => {
        LP.addMember(b, { id: `CHORD-${t}-${side}`, type: 'chord', level: lv.index, side, label: `${lv.name} ${side} edge chord`,
          a: { x: x1, y: y1, z: lv.elev }, b: { x: x2, y: y2, z: lv.elev } });
      });
    });

    b.walls = inputs.walls || LP.presetWalls(inputs.wallPreset, xs, ys);
    const pt = (w, s) => w.dir === 'x' ? { x: s, y: w.at } : { x: w.at, y: s };
    b.walls.forEach(w => {
      w.length = w.to - w.from;
      b.levels.forEach(lv => {
        LP.addMember(b, { id: `${w.id}-${lv.tag}`, type: 'wall', level: lv.index, wall: w.id,
          label: `${w.name}, story below ${lv.name}`,
          a: Object.assign(pt(w, w.from), { z: lv.below }), b: Object.assign(pt(w, w.to), { z: lv.elev }) });
      });
      LP.addMember(b, { id: `${w.id}-FTG`, type: 'wallFooting', wall: w.id, label: `${w.name} footing`,
        a: Object.assign(pt(w, w.from), { z: 0 }), b: Object.assign(pt(w, w.to), { z: 0 }) });
    });

    // One collector per wall line per level, running the full length of the building.
    b.wallLines = [];
    b.walls.forEach(w => {
      if (!b.wallLines.some(l => l.dir === w.dir && l.at === w.at)) b.wallLines.push({ dir: w.dir, at: w.at });
    });
    b.wallLines.forEach(line => {
      line.id = `${line.dir}${line.at}`;
      line.name = line.dir === 'x' ? `line y = ${line.at} ft` : `line x = ${line.at} ft`;
      b.levels.forEach(lv => {
        const ends = line.dir === 'x' ? [{ x: 0, y: line.at }, { x: b.Lx, y: line.at }] : [{ x: line.at, y: 0 }, { x: line.at, y: b.Ly }];
        LP.addMember(b, { id: `COLL-${lv.tag}-${line.id}`, type: 'collector', level: lv.index, line: line.id,
          label: `${lv.name} collector on ${line.name}`,
          a: Object.assign(ends[0], { z: lv.elev }), b: Object.assign(ends[1], { z: lv.elev }) });
      });
    });

    return b;
  };

  LP.center = m => ({ x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2, z: (m.a.z + m.b.z) / 2 });
  LP.round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
})(typeof window !== 'undefined' ? window : globalThis);
