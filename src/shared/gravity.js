// Gravity analysis (owner: role 4, gravity engineer).
// Deck -> beams (one-way tributary width) -> girders / columns (simple-span reactions)
// -> columns summed story by story -> footings. Service-level D + L, no member self-weight.
// Every member also gets results.gravity.tribArea: the plan rectangles its load comes from,
// so the 3D view can shade them when the member is selected.
(function (root) {
  const LP = root.LP = root.LP || {};
  const r = LP.round;

  // One plan rectangle of tributary area at elevation z (ft, sq ft).
  const rect = (x0, y0, x1, y1, z) => ({ x0, y0, x1, y1, z, area: (x1 - x0) * (y1 - y0) });
  const tribArea = rects => ({ rects, area: rects.reduce((s, q) => s + q.area, 0) });

  /**
   * Run the gravity analysis in place: fills members[id].results.gravity and adds 'gravity' paths.
   * @param {object} b building from LP.buildModel
   */
  LP.runGravity = function (b) {
    const { xs, ys, beamXs } = b;
    const set = (id, value, calc, extra) => {
      b.members[id].results.gravity = Object.assign({ value, unit: 'kips', calc }, extra);
    };
    const xBayOf = x => Math.min(xs.length - 2, xs.findIndex((g, i) => x >= g - 1e-6 && x < xs[i + 1] - 1e-6));
    const gridX = x => xs.findIndex(g => Math.abs(g - x) < 1e-6);
    const colLoads = {}; // column id -> load delivered at its level (kips)

    b.levels.forEach(lv => {
      const t = lv.tag, w = lv.dead + lv.live;
      const girderLoads = {}; // girder id -> [{ a, P }]
      const girderRects = {}; // girder id -> tributary rectangles from the filler beams framing in

      Object.values(b.members).filter(m => m.type === 'deck' && m.level === lv.index).forEach(d => {
        const area = (d.b.x - d.a.x) * (d.b.y - d.a.y);
        set(d.id, w * area / 1000, [
          `w = D + L = ${lv.dead} + ${lv.live} = ${w} psf`,
          `Area = ${r(d.b.x - d.a.x)} ft x ${r(d.b.y - d.a.y)} ft = ${r(area)} sq ft`,
          `Total = ${w} psf x ${r(area)} sq ft / 1000 = ${r(w * area / 1000)} kips`
        ], { tribArea: tribArea([rect(d.a.x, d.a.y, d.b.x, d.b.y, lv.elev)]) });
      });

      beamXs.forEach((x, k) => ys.slice(0, -1).forEach((y0, by) => {
        const beam = b.members[`BM-${t}-${x}-${by}`];
        const L = ys[by + 1] - y0;
        const left = k > 0 ? (x - beamXs[k - 1]) / 2 : 0;
        const right = k < beamXs.length - 1 ? (beamXs[k + 1] - x) / 2 : 0;
        const trib = left + right, wl = w * trib / 1000, R = wl * L / 2;
        const mid = { x, y: y0 + L / 2, z: lv.elev };
        if (left > 0) LP.addPath(b, 'gravity', `DECK-${t}-${xBayOf(x - 1e-3)}-${by}`, beam.id, w * left * L / 1000, mid, 'half the deck span on the west side');
        if (right > 0) LP.addPath(b, 'gravity', `DECK-${t}-${xBayOf(x + 1e-3)}-${by}`, beam.id, w * right * L / 1000, mid, 'half the deck span on the east side');

        [ys[by], ys[by + 1]].forEach((yEnd, e) => {
          const j = by + e, at = { x, y: yEnd, z: lv.elev };
          const gi = gridX(x);
          if (gi >= 0) {
            const col = `COL-${LP.gridPoint(b, gi, j)}-${t}`;
            colLoads[col] = (colLoads[col] || 0) + R;
            LP.addPath(b, 'gravity', beam.id, col, R, at, 'beam end reaction');
          } else {
            const bx = xBayOf(x), gd = `GD-${t}-${b.yLabels[j]}-${bx}`;
            (girderLoads[gd] = girderLoads[gd] || []).push({ a: x - xs[bx], P: R });
            // Each end reaction carries the half of the beam's strip nearest that end.
            (girderRects[gd] = girderRects[gd] || []).push(e === 0
              ? rect(x - left, y0, x + right, y0 + L / 2, lv.elev)
              : rect(x - left, y0 + L / 2, x + right, ys[by + 1], lv.elev));
            LP.addPath(b, 'gravity', beam.id, gd, R, at, 'beam end reaction');
          }
        });
        set(beam.id, R * 2, [
          `Tributary width = ${r(left)} + ${r(right)} = ${r(trib)} ft`,
          `w = ${w} psf x ${r(trib)} ft / 1000 = ${r(wl, 3)} klf`,
          `Span L = ${r(L)} ft (simple span)`,
          `End reactions R = wL/2 = ${r(wl, 3)} x ${r(L)} / 2 = ${r(R)} kips each`,
          `Max moment = wL^2/8 = ${r(wl * L * L / 8)} kip-ft`
        ], { reaction: R, w: wl, span: L, trib, tribArea: tribArea([rect(x - left, y0, x + right, ys[by + 1], lv.elev)]) });
      }));

      ys.forEach((y, j) => xs.slice(0, -1).forEach((x0, bx) => {
        const gd = b.members[`GD-${t}-${b.yLabels[j]}-${bx}`];
        const L = xs[bx + 1] - x0, loads = girderLoads[gd.id] || [];
        const Rl = loads.reduce((s, p) => s + p.P * (L - p.a) / L, 0);
        const Rr = loads.reduce((s, p) => s + p.P * p.a / L, 0);
        [[bx, Rl], [bx + 1, Rr]].forEach(([i, R]) => {
          const col = `COL-${LP.gridPoint(b, i, j)}-${t}`;
          colLoads[col] = (colLoads[col] || 0) + R;
          if (R > 0) LP.addPath(b, 'gravity', gd.id, col, R, { x: xs[i], y, z: lv.elev }, 'girder end reaction');
        });
        set(gd.id, Rl + Rr, loads.length ? [
          `Point loads from filler beams: ${loads.map(p => `${r(p.P)} k at ${r(p.a)} ft`).join(', ')}`,
          `Span L = ${r(L)} ft (simple span)`,
          `R west = sum P(L - a)/L = ${r(Rl)} kips`,
          `R east = sum P a/L = ${r(Rr)} kips`
        ] : ['No filler beams frame into this girder'], { reactions: [Rl, Rr], span: L, tribArea: tribArea(girderRects[gd.id] || []) });
      }));
    });

    // Column tributary area: halfway to the next grid line each way. This matches the framing
    // because filler beams are evenly spaced, so every girder splits its load equally to both ends.
    const half = (g, i) => [i > 0 ? (g[i - 1] + g[i]) / 2 : g[i], i < g.length - 1 ? (g[i] + g[i + 1]) / 2 : g[i]];

    // Columns: add the load from each level going down, then into the footing.
    xs.forEach((x, i) => ys.forEach((y, j) => {
      const pt = LP.gridPoint(b, i, j);
      const [x0, x1] = half(xs, i), [y0, y1] = half(ys, j);
      let above = 0, rectsAbove = [];
      for (let li = b.levels.length - 1; li >= 0; li--) {
        const lv = b.levels[li], id = `COL-${pt}-${lv.tag}`, own = colLoads[id] || 0, total = own + above;
        const here = rect(x0, y0, x1, y1, lv.elev), rects = [here].concat(rectsAbove);
        set(id, total, [
          `Tributary area at ${lv.name} = ${r(x1 - x0)} ft x ${r(y1 - y0)} ft = ${r(here.area)} sq ft`,
          `From framing at ${lv.name}: ${r(own)} kips`,
          `From column above: ${r(above)} kips`,
          `Axial load P = ${r(own)} + ${r(above)} = ${r(total)} kips`
        ], { fromLevel: own, fromAbove: above, tribArea: tribArea(rects) });
        const next = li > 0 ? `COL-${pt}-${b.levels[li - 1].tag}` : `FTG-${pt}`;
        LP.addPath(b, 'gravity', id, next, total, { x, y, z: lv.below }, li > 0 ? 'column load to the column below' : 'column load to the footing');
        above = total;
        rectsAbove = rects;
      }
      set(`FTG-${pt}`, above, [
        `Column load at grade = ${r(above)} kips`,
        `Footing area needed = P / allowable bearing (e.g. ${r(above)} k / 3 ksf = ${r(above / 3)} sq ft)`
      ], { tribArea: tribArea(rectsAbove) });
    }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
