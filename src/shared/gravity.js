// Gravity analysis (owner: role 4, gravity engineer).
// Deck -> beams (one-way tributary width) -> girders / columns (simple-span reactions)
// -> columns summed story by story -> footings. Service-level D + L.
// Member self-weight is optional (inputs.selfWeight); the deck's own weight is already in the dead psf.
// Floor live load reduction (ASCE 7-22 4.7) is optional too (inputs.liveLoadReduction).
// Every member also gets results.gravity.tribArea: the plan rectangles its load comes from,
// so the 3D view can shade them when the member is selected.
(function (root) {
  const LP = root.LP = root.LP || {};
  const r = LP.round;

  // Assumed self-weights (plf) when inputs.selfWeight.on is true: typical light steel framing,
  // roughly a W16x26 filler beam, W24x55 girder and W10x49 column.
  LP.SELF_WEIGHT_DEFAULTS = { on: false, beam: 30, girder: 60, column: 50 };

  // Live load element factor K_LL, ASCE 7-22 Table 4.7-1. This model has no cantilever slabs, so
  // every column (interior or exterior) is 4 and every beam or girder (interior or edge) is 2.
  // The deck isn't reduced: a one-way slab's area is capped at 1.5 x span^2 (4.7.6), which for
  // these beam spacings stays under the 400 sq ft threshold.
  LP.KLL = { beam: 2, girder: 2, column: 4, footing: 4 };

  /**
   * ASCE 7-22 4.7 reduction factor L / Lo for one member.
   * @param {number} KLL live load element factor
   * @param {number} AT tributary floor area (sq ft); roof area doesn't count
   * @param {number} floors how many floors the member supports
   * @param {number} Lo unreduced floor live load (psf)
   * @returns {{ factor: number, why: string }} factor is 1 when no reduction is allowed
   */
  LP.liveReductionFactor = function (KLL, AT, floors, Lo) {
    if (Lo > 100) {
      // 4.7.3: heavy live loads aren't reduced, except 20% for members supporting two or more floors.
      return floors >= 2 ? { factor: 0.8, why: `Lo = ${Lo} psf > 100 psf: 20% reduction for 2+ floors (4.7.3)` }
                         : { factor: 1, why: `Lo = ${Lo} psf > 100 psf on one floor: no reduction (4.7.3)` };
    }
    if (KLL * AT < 400) return { factor: 1, why: `K_LL x AT = ${r(KLL * AT)} sq ft < 400: no reduction` };
    const limit = floors >= 2 ? 0.4 : 0.5;
    const raw = 0.25 + 15 / Math.sqrt(KLL * AT);
    return raw < limit
      ? { factor: limit, why: `0.25 + 15/sqrt(${r(KLL * AT)}) = ${r(raw, 3)}, limited to ${limit} (${floors >= 2 ? '2+ floors' : 'one floor'})` }
      : { factor: raw, why: `L/Lo = 0.25 + 15/sqrt(${r(KLL * AT)}) = ${r(raw, 3)} (limit ${limit})` };
  };

  // One plan rectangle of tributary area at elevation z (ft, sq ft).
  const rect = (x0, y0, x1, y1, z) => ({ x0, y0, x1, y1, z, area: (x1 - x0) * (y1 - y0) });
  const tribArea = rects => ({ rects, area: rects.reduce((s, q) => s + q.area, 0) });

  /**
   * Run the gravity analysis in place: fills members[id].results.gravity and adds 'gravity' paths.
   * results.gravity.selfWeight is the part of `value` that is member self-weight (0 when off).
   * results.gravity.liveReduction is { KLL, AT, floors, factor, removed } when reduction is on.
   * @param {object} b building from LP.buildModel; reads b.inputs.selfWeight
   *   ({ on, beam, girder, column } in plf, missing keys fall back to LP.SELF_WEIGHT_DEFAULTS)
   *   and b.inputs.liveLoadReduction (true to reduce floor live load per ASCE 7 4.7)
   */
  LP.runGravity = function (b) {
    const { xs, ys, beamXs } = b;
    const sw = Object.assign({}, LP.SELF_WEIGHT_DEFAULTS, b.inputs && b.inputs.selfWeight);
    const swKlf = type => sw.on ? sw[type] / 1000 : 0;
    const set = (id, value, calc, extra) => {
      b.members[id].results.gravity = Object.assign({ value, unit: 'kips', calc, selfWeight: 0 }, extra);
    };
    const xBayOf = x => Math.min(xs.length - 2, xs.findIndex((g, i) => x >= g - 1e-6 && x < xs[i + 1] - 1e-6));
    const gridX = x => xs.findIndex(g => Math.abs(g - x) < 1e-6);
    const colLoads = {}; // column id -> load delivered at its level (kips)
    const colSW = {};    // column id -> the self-weight part of colLoads (kips)

    b.levels.forEach(lv => {
      const t = lv.tag, w = lv.dead + lv.live;
      const girderLoads = {}; // girder id -> [{ a, P, S }]: S is the self-weight part of P
      const girderRects = {}; // girder id -> tributary rectangles from the filler beams framing in

      Object.values(b.members).filter(m => m.type === 'deck' && m.level === lv.index).forEach(d => {
        const area = (d.b.x - d.a.x) * (d.b.y - d.a.y);
        set(d.id, w * area / 1000, [
          `w = D + L = ${lv.dead} + ${lv.live} = ${w} psf`,
          `Area = ${r(d.b.x - d.a.x)} ft x ${r(d.b.y - d.a.y)} ft = ${r(area)} sq ft`,
          `Total = ${w} psf x ${r(area)} sq ft / 1000 = ${r(w * area / 1000)} kips`
        ], { tribArea: tribArea([rect(d.a.x, d.a.y, d.b.x, d.b.y, lv.elev)]) });
      });

      const ws = swKlf('beam');
      beamXs.forEach((x, k) => ys.slice(0, -1).forEach((y0, by) => {
        const beam = b.members[`BM-${t}-${x}-${by}`];
        const L = ys[by + 1] - y0;
        const left = k > 0 ? (x - beamXs[k - 1]) / 2 : 0;
        const right = k < beamXs.length - 1 ? (beamXs[k + 1] - x) / 2 : 0;
        const trib = left + right, wl = w * trib / 1000, R = (wl + ws) * L / 2, S = ws * L / 2;
        const mid = { x, y: y0 + L / 2, z: lv.elev };
        if (left > 0) LP.addPath(b, 'gravity', `DECK-${t}-${xBayOf(x - 1e-3)}-${by}`, beam.id, w * left * L / 1000, mid, 'half the deck span on the west side');
        if (right > 0) LP.addPath(b, 'gravity', `DECK-${t}-${xBayOf(x + 1e-3)}-${by}`, beam.id, w * right * L / 1000, mid, 'half the deck span on the east side');

        [ys[by], ys[by + 1]].forEach((yEnd, e) => {
          const j = by + e, at = { x, y: yEnd, z: lv.elev };
          const gi = gridX(x);
          if (gi >= 0) {
            const col = `COL-${LP.gridPoint(b, gi, j)}-${t}`;
            colLoads[col] = (colLoads[col] || 0) + R;
            colSW[col] = (colSW[col] || 0) + S;
            LP.addPath(b, 'gravity', beam.id, col, R, at, 'beam end reaction');
          } else {
            const bx = xBayOf(x), gd = `GD-${t}-${b.yLabels[j]}-${bx}`;
            (girderLoads[gd] = girderLoads[gd] || []).push({ a: x - xs[bx], P: R, S });
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
          ...(ws ? [`Self-weight = ${sw.beam} plf (assumed) = ${r(ws, 3)} klf`] : []),
          `Span L = ${r(L)} ft (simple span)`,
          ws ? `End reactions R = (w + self-weight) L/2 = ${r(wl + ws, 3)} x ${r(L)} / 2 = ${r(R)} kips each`
             : `End reactions R = wL/2 = ${r(wl, 3)} x ${r(L)} / 2 = ${r(R)} kips each`,
          `Max moment = wL^2/8 = ${r((wl + ws) * L * L / 8)} kip-ft`
        ], { reaction: R, w: wl, span: L, trib, selfWeight: S * 2,
             tribArea: tribArea([rect(x - left, y0, x + right, ys[by + 1], lv.elev)]) });
      }));

      const wg = swKlf('girder');
      ys.forEach((y, j) => xs.slice(0, -1).forEach((x0, bx) => {
        const gd = b.members[`GD-${t}-${b.yLabels[j]}-${bx}`];
        const L = xs[bx + 1] - x0, loads = girderLoads[gd.id] || [];
        const own = wg * L / 2; // girder self-weight to each end
        const Rl = loads.reduce((s, p) => s + p.P * (L - p.a) / L, 0) + own;
        const Rr = loads.reduce((s, p) => s + p.P * p.a / L, 0) + own;
        const Sl = loads.reduce((s, p) => s + p.S * (L - p.a) / L, 0) + own;
        const Sr = loads.reduce((s, p) => s + p.S * p.a / L, 0) + own;
        [[bx, Rl, Sl], [bx + 1, Rr, Sr]].forEach(([i, R, S]) => {
          const col = `COL-${LP.gridPoint(b, i, j)}-${t}`;
          colLoads[col] = (colLoads[col] || 0) + R;
          colSW[col] = (colSW[col] || 0) + S;
          if (R > 0) LP.addPath(b, 'gravity', gd.id, col, R, { x: xs[i], y, z: lv.elev }, 'girder end reaction');
        });
        const ownLine = wg ? [`Self-weight = ${sw.girder} plf (assumed) x ${r(L)} ft / 2 = ${r(own)} kips to each end`] : [];
        set(gd.id, Rl + Rr, loads.length ? [
          `Point loads from filler beams: ${loads.map(p => `${r(p.P)} k at ${r(p.a)} ft`).join(', ')}`,
          `Span L = ${r(L)} ft (simple span)`,
          ...ownLine,
          `R west = sum P(L - a)/L${wg ? ' + self-weight' : ''} = ${r(Rl)} kips`,
          `R east = sum P a/L${wg ? ' + self-weight' : ''} = ${r(Rr)} kips`
        ] : ['No filler beams frame into this girder', ...ownLine],
        { reactions: [Rl, Rr], span: L, selfWeight: Sl + Sr, tribArea: tribArea(girderRects[gd.id] || []) });
      }));
    });

    // Column tributary area: halfway to the next grid line each way. This matches the framing
    // because filler beams are evenly spaced, so every girder splits its load equally to both ends.
    const half = (g, i) => [i > 0 ? (g[i - 1] + g[i]) / 2 : g[i], i < g.length - 1 ? (g[i] + g[i + 1]) / 2 : g[i]];
    const wc = swKlf('column');

    // Columns: add the load from each level going down, then into the footing.
    // P is taken at the bottom of each column, so it includes that column's own weight.
    xs.forEach((x, i) => ys.forEach((y, j) => {
      const pt = LP.gridPoint(b, i, j);
      const [x0, x1] = half(xs, i), [y0, y1] = half(ys, j);
      let above = 0, swAbove = 0, rectsAbove = [];
      for (let li = b.levels.length - 1; li >= 0; li--) {
        const lv = b.levels[li], id = `COL-${pt}-${lv.tag}`, own = colLoads[id] || 0;
        const self = wc * lv.height, total = own + above + self, swTotal = (colSW[id] || 0) + self + swAbove;
        const here = rect(x0, y0, x1, y1, lv.elev), rects = [here].concat(rectsAbove);
        set(id, total, [
          `Tributary area at ${lv.name} = ${r(x1 - x0)} ft x ${r(y1 - y0)} ft = ${r(here.area)} sq ft`,
          `From framing at ${lv.name}: ${r(own)} kips`,
          `From column above: ${r(above)} kips`,
          ...(wc ? [
            `Self-weight = ${sw.column} plf (assumed) x ${r(lv.height)} ft = ${r(self)} kips`,
            `Axial load P at the bottom = ${r(own)} + ${r(above)} + ${r(self)} = ${r(total)} kips`
          ] : [`Axial load P = ${r(own)} + ${r(above)} = ${r(total)} kips`])
        ], { fromLevel: own, fromAbove: above, ownWeight: self, selfWeight: swTotal, tribArea: tribArea(rects) });
        const next = li > 0 ? `COL-${pt}-${b.levels[li - 1].tag}` : `FTG-${pt}`;
        LP.addPath(b, 'gravity', id, next, total, { x, y, z: lv.below }, li > 0 ? 'column load to the column below' : 'column load to the footing');
        above = total;
        swAbove = swTotal;
        rectsAbove = rects;
      }
      set(`FTG-${pt}`, above, [
        `Column load at grade = ${r(above)} kips`,
        ...(sw.on ? [`Includes ${r(swAbove)} kips of member self-weight`] : []),
        `Footing area needed = P / allowable bearing (e.g. ${r(above)} k / 3 ksf = ${r(above / 3)} sq ft)`
      ], { selfWeight: swAbove, tribArea: tribArea(rectsAbove) });
    }));

    // Live load reduction: each member reduces its own floor live load from its own tributary area.
    // Loads passed along the path stay unreduced, so a column below works out its own, larger
    // reduction from everything it supports. Roof live load isn't reduced here (that's 4.8).
    if (b.inputs && b.inputs.liveLoadReduction) {
      const levelAt = z => b.levels.find(lv => Math.abs(lv.elev - z) < 1e-6);
      Object.values(b.members).forEach(m => {
        const gr = m.results.gravity, KLL = LP.KLL[m.type];
        if (!gr || !KLL) return;
        const floorRects = gr.tribArea.rects.filter(q => !levelAt(q.z).isRoof);
        if (!floorRects.length) return;
        const AT = floorRects.reduce((s, q) => s + q.area, 0);
        const L = floorRects.reduce((s, q) => s + levelAt(q.z).live * q.area / 1000, 0);
        const floors = new Set(floorRects.map(q => q.z)).size;
        const Lo = Math.max(...floorRects.map(q => levelAt(q.z).live));
        const { factor, why } = LP.liveReductionFactor(KLL, AT, floors, Lo);
        const removed = L * (1 - factor);
        gr.liveReduction = { KLL, AT, floors, factor, removed };
        gr.value -= removed;
        gr.calc.push(`Live load reduction (ASCE 7 4.7): K_LL = ${KLL}, floor AT = ${r(AT)} sq ft, ${floors} floor${floors > 1 ? 's' : ''}`);
        gr.calc.push(why);
        if (removed > 0) {
          gr.calc.push(`Floor live load ${r(L)} k x (1 - ${r(factor, 3)}) = ${r(removed)} kips removed`);
          gr.calc.push(`Load with reduced live load = ${r(gr.value)} kips (loads passed on stay unreduced)`);
        }
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
