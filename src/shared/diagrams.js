// Diaphragm and collector force diagrams (owner: role 3, 3D load graphics).
// Built by statics from the line reactions the lateral analysis already produced, so a diagram
// always matches what the walls receive and closes to zero at the far edge.
(function (root) {
  const LP = root.LP = root.LP || {};

  /**
   * Shear and moment along the diaphragm at one level, treating it as a beam lying flat.
   * @param {object} b building after LP.runLateral
   * @param {number} li level index
   * @returns {object|null} { depth: span length (ft), len: chord lever arm d (ft), w (klf),
   *   lines: [{ at, R }], pts: [{ s, V, M }], Vmax, Mext: largest |M| with its sign, sAtM }
   *   V in kips, M in kip-ft; M > 0 bends the diaphragm in the direction of the load.
   */
  LP.diaphragmDiagram = function (b, li) {
    const lv = b.levels[li], dir = b.inputs.lateral.dir;
    const dia = b.members[`DIA-${lv.tag}`].results.lateral;
    if (!dia) return null;
    const depth = dir === 'x' ? b.Ly : b.Lx, len = dir === 'x' ? b.Lx : b.Ly, w = dia.value / depth;
    // Accidental torsion (role 5) shifts the seismic mass by ec - e across the depth. Draw the load as
    // varying linearly with the same total and its centroid moved by that amount, or the moment won't close.
    const shift = b.rigid && b.rigid.ec !== undefined && b.inputs.lateral.diaphragm === 'rigid' ? b.rigid.ec - b.rigid.e : 0;
    const w1 = 12 * dia.value * shift / depth ** 3; // klf per ft of depth
    const lines = b.wallLines.filter(l => l.dir === dir).map(l => {
      const p = b.paths.find(q => q.mode === 'lateral' && q.from === `DIA-${lv.tag}` && q.to === `COLL-${lv.tag}-${l.id}`);
      return { at: l.at, R: p ? p.value : 0 };
    }).filter(l => Math.abs(l.R) > 1e-9).sort((a, c) => a.at - c.at);

    // Rigid diaphragm with torsion: the perpendicular walls push back along the span at an offset,
    // adding a couple that is spread over each wall's length. Without it the moment would not close.
    const twist = b.wallLines.filter(l => l.dir !== dir).flatMap(l => {
      const p = b.paths.find(q => q.mode === 'lateral' && q.from === `DIA-${lv.tag}` && q.to === `COLL-${lv.tag}-${l.id}`);
      if (!p) return [];
      const walls = b.walls.filter(w => w.dir === l.dir && w.at === l.at), sumL = walls.reduce((t, w) => t + w.length, 0);
      return walls.map(w => ({ from: w.from, to: w.to, C: p.value * w.length / sumL * l.at }));
    });
    const twistTo = s => twist.reduce((t, x) => t + x.C * Math.min(1, Math.max(0, (s - x.from) / (x.to - x.from))), 0);

    // Evaluate just before and just after each reaction so the shear jumps are drawn square.
    const stations = [];
    for (let k = 0; k <= 120; k++) stations.push({ s: depth * k / 120, after: true });
    lines.forEach(l => stations.push({ s: l.at, after: false }, { s: l.at, after: true }));
    stations.sort((a, c) => a.s - c.s || (a.after ? 1 : 0) - (c.after ? 1 : 0));

    const pts = stations.map(({ s, after }) => {
      const acting = lines.filter(l => l.at < s - 1e-9 || (after && Math.abs(l.at - s) < 1e-9));
      const V = acting.reduce((t, l) => t + l.R, 0) - w * s - w1 * (s * s - depth * s) / 2;
      const M = acting.reduce((t, l) => t + l.R * (s - l.at), 0) - w * s * s / 2 - w1 * (s ** 3 / 6 - depth * s * s / 4) + twistTo(s);
      return { s, V, M };
    });
    const ext = pts.reduce((m, p) => Math.abs(p.M) > Math.abs(m.M) ? p : m, pts[0]);
    return { depth, len, w, lines, pts, twisted: twist.some(x => Math.abs(x.C) > 1e-9),
      Vmax: Math.max(...pts.map(p => Math.abs(p.V))), Mext: ext.M, sAtM: ext.s };
  };

  /**
   * Axial force along one collector line at one level.
   * @param {object} b building after LP.runLateral
   * @param {number} li level index
   * @param {object} line entry of b.wallLines
   * @returns {object|null} { length (ft), pts: [{ s, F }], Fmax: largest |F|, sAtF } in kips;
   *   F > 0 is the force accumulated from the diaphragm ahead of the walls. null if the line carries nothing.
   */
  LP.collectorDiagram = function (b, li, line) {
    const lv = b.levels[li];
    const p = b.paths.find(q => q.mode === 'lateral' && q.from === `DIA-${lv.tag}` && q.to === `COLL-${lv.tag}-${line.id}`);
    if (!p || Math.abs(p.value) < 1e-9) return null;
    const length = line.dir === 'x' ? b.Lx : b.Ly;
    const walls = b.walls.filter(w => w.dir === line.dir && w.at === line.at);
    const q = p.value / length, vw = p.value / walls.reduce((t, w) => t + w.length, 0);
    const pts = [];
    for (let k = 0; k <= 160; k++) {
      const s = length * k / 160;
      const inWall = walls.reduce((t, w) => t + Math.max(0, Math.min(s, w.to) - w.from), 0);
      pts.push({ s, F: q * s - vw * inWall });
    }
    const ext = pts.reduce((m, x) => Math.abs(x.F) > Math.abs(m.F) ? x : m, pts[0]);
    return { length, pts, Fmax: Math.abs(ext.F), sAtF: ext.s };
  };
})(typeof window !== 'undefined' ? window : globalThis);
