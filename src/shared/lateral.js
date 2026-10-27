// Lateral analysis (owners: role 5 story forces + diaphragm, role 6 chords, collectors, walls).
// Story force -> diaphragm -> collectors -> shear walls (stacked story by story) -> wall footings.
// Flexible diaphragm: tributary width. Rigid: wall stiffness ~ wall length, plus torsion.
(function (root) {
  const LP = root.LP = root.LP || {};
  const r = LP.round;

  // ---- Role 5: story forces --------------------------------------------------
  /**
   * Story force at each level for b.inputs.lateral.
   * @param {object} b building from LP.buildModel
   * @returns {{F: number, calc: string[]}[]} one entry per level, bottom first, F in kips
   */
  LP.storyForces = function (b) {
    const L = b.inputs.lateral, n = b.levels.length;
    const face = L.dir === 'x' ? b.Ly : b.Lx;
    if (L.type === 'wind') {
      return b.levels.map((lv, i) => {
        const hTrib = lv.height / 2 + (i < n - 1 ? b.levels[i + 1].height / 2 : 0);
        const F = L.windPressure * face * hTrib / 1000;
        return { F, calc: [
          `Wind pressure p = ${L.windPressure} psf on a ${r(face)} ft wide face`,
          `Tributary height = ${r(hTrib)} ft (half the story below${i < n - 1 ? ' + half the story above' : ''})`,
          `F = ${L.windPressure} x ${r(face)} x ${r(hTrib)} / 1000 = ${r(F)} kips`
        ] };
      });
    }
    const W = b.levels.map(lv => lv.dead * b.Lx * b.Ly / 1000);
    const sumW = W.reduce((s, v) => s + v, 0), V = L.Cs * sumW;
    const sumWh = b.levels.reduce((s, lv, i) => s + W[i] * lv.elev, 0); // k = 1 (short period)
    return b.levels.map((lv, i) => {
      const F = V * W[i] * lv.elev / sumWh;
      return { F, calc: [
        `Seismic weight W = ${lv.dead} psf x ${r(b.Lx)} x ${r(b.Ly)} / 1000 = ${r(W[i])} kips`,
        `Base shear V = Cs x total W = ${L.Cs} x ${r(sumW)} = ${r(V)} kips`,
        `Vertical distribution (ASCE 7 ELF, k = 1): Cvx = w h / sum(w h) = ${r(W[i] * lv.elev)} / ${r(sumWh)} = ${r(W[i] * lv.elev / sumWh, 3)}`,
        `F = Cvx x V = ${r(F)} kips`
      ] };
    });
  };

  // ---- Role 5: diaphragm distribution to walls --------------------------------
  /**
   * Split one story force among the walls.
   * @param {object} b building from LP.buildModel
   * @param {number} F story force (kips)
   * @returns {{wall: object, V: number, note: string, torsion?: boolean}[]} V is signed: torsion can
   *   push a wall's force below its direct share, and torsion-only walls are flagged torsion: true
   */
  LP.distribute = function (b, F) {
    const L = b.inputs.lateral, dir = L.dir;
    const depth = dir === 'x' ? b.Ly : b.Lx;   // span direction of the diaphragm (across the load)
    const par = b.walls.filter(w => w.dir === dir);
    const perp = b.walls.filter(w => w.dir !== dir);
    if (!par.length) { b.warnings.push(`No walls resist ${dir.toUpperCase()}-direction load: the load path is broken.`); return []; }
    const lines = [...new Set(par.map(w => w.at))].sort((a, c) => a - c);

    if (L.diaphragm === 'flexible') {
      return lines.flatMap((c, j) => {
        const lo = j === 0 ? 0 : (lines[j - 1] + c) / 2;
        const hi = j === lines.length - 1 ? depth : (c + lines[j + 1]) / 2;
        const R = F * (hi - lo) / depth;
        const inLine = par.filter(w => w.at === c), sumL = inLine.reduce((s, w) => s + w.length, 0);
        return inLine.map(w => ({ wall: w, V: R * w.length / sumL,
          note: `Flexible: tributary width ${r(hi - lo)} of ${r(depth)} ft -> ${r(R)} k on ${dir === 'x' ? 'line y' : 'line x'} = ${c}; split by wall length` }));
      });
    }

    // Rigid: k proportional to wall length (shear walls of equal height and thickness).
    const sumK = par.reduce((s, w) => s + w.length, 0);
    const cr = par.reduce((s, w) => s + w.length * w.at, 0) / sumK;
    const sumKp = perp.reduce((s, w) => s + w.length, 0);
    const crP = sumKp ? perp.reduce((s, w) => s + w.length * w.at, 0) / sumKp : 0;
    const e = depth / 2 - cr;
    const J = par.reduce((s, w) => s + w.length * (w.at - cr) ** 2, 0) + perp.reduce((s, w) => s + w.length * (w.at - crP) ** 2, 0);
    if (J === 0 && Math.abs(e) > 1e-6) b.warnings.push('Walls cannot resist torsion: the rigid diaphragm is unstable.');
    b.rigid = { cr, e, J, sumK };
    const T = J ? F * e / J : 0;
    return par.map(w => ({ wall: w, V: F * w.length / sumK + T * w.length * (w.at - cr),
      note: `Rigid: direct ${r(F * w.length / sumK)} k (k = L = ${r(w.length)} of ${r(sumK)}) + torsion ${r(T * w.length * (w.at - cr))} k (e = ${r(e)} ft)` }))
      .concat(perp.map(w => ({ wall: w, V: -T * w.length * (w.at - crP), torsion: true,
        note: `Rigid: torsion only, ${r(-T * w.length * (w.at - crP))} k (perpendicular wall resisting twist)` })));
  };

  // ---- Role 6: collectors, chords, walls, overturning -------------------------
  /**
   * Run the lateral analysis in place: fills members[id].results.lateral and adds 'lateral' paths.
   * @param {object} b building from LP.buildModel; reads b.inputs.lateral
   */
  LP.runLateral = function (b) {
    const L = b.inputs.lateral, dir = L.dir;
    const len = dir === 'x' ? b.Lx : b.Ly;     // building length along the load = chord lever arm
    const depth = dir === 'x' ? b.Ly : b.Lx;
    const set = (id, value, calc, extra) => {
      b.members[id].results.lateral = Object.assign({ value, unit: 'kips', calc }, extra);
    };
    const forces = LP.storyForces(b);
    const wallV = {}; // wall member id -> force delivered at its level

    b.levels.forEach((lv, li) => {
      const t = lv.tag, F = forces[li].F;
      const windward = dir === 'x' ? { x: 0, y: b.Ly / 2, z: lv.elev } : { x: b.Lx / 2, y: 0, z: lv.elev };
      set(`LAT-${t}`, F, forces[li].calc, { dir });
      LP.addPath(b, 'lateral', `LAT-${t}`, `DIA-${t}`, F, windward, `${L.type} force on ${lv.name}`);

      const shares = LP.distribute(b, F);
      const lines = [...new Set(shares.filter(s => !s.torsion).map(s => s.wall.at))].sort((a, c) => a - c);

      // Diaphragm shear and chord force (simple spans between wall lines + cantilevers).
      const w = F / depth;
      let M = 0, Vmax = 0;
      lines.forEach((c, j) => {
        if (j === 0) { M = Math.max(M, w * c * c / 2); Vmax = Math.max(Vmax, w * c); }
        if (j === lines.length - 1) { const a = depth - c; M = Math.max(M, w * a * a / 2); Vmax = Math.max(Vmax, w * a); }
        if (j > 0) { const s = c - lines[j - 1]; M = Math.max(M, w * s * s / 8); Vmax = Math.max(Vmax, w * s / 2); }
      });
      const chord = M / len;
      set(`DIA-${t}`, F, [
        `Story force F = ${r(F)} kips, spread over ${r(depth)} ft: w = ${r(w, 3)} klf`,
        `${L.diaphragm === 'rigid' ? 'Rigid' : 'Flexible'} diaphragm spanning between ${lines.length} wall line(s)`,
        `Max diaphragm moment M = ${r(M)} kip-ft (wL^2/8 between lines, wa^2/2 at overhangs)`,
        `Max unit shear v = ${r(Vmax)} k / ${r(len)} ft = ${r(Vmax / len * 1000, 0)} plf`
      ].concat(b.rigid && L.diaphragm === 'rigid' ? [`Center of rigidity at ${r(b.rigid.cr)} ft, eccentricity e = ${r(b.rigid.e)} ft`] : []),
      { shearPlf: Vmax / len * 1000, moment: M });

      const chordSides = dir === 'x' ? ['W', 'E'] : ['S', 'N'];
      ['S', 'N', 'W', 'E'].forEach(side => {
        const id = `CHORD-${t}-${side}`;
        if (chordSides.includes(side)) {
          set(id, chord, [
            `Chord force T = C = M / d = ${r(M)} / ${r(len)} = ${r(chord)} kips`,
            `${side === chordSides[0] ? 'One' : 'The other'} edge is in tension, the opposite edge in compression; reverse the load and they swap`
          ]);
        } else {
          set(id, 0, [`Not a chord for ${dir.toUpperCase()}-direction load; it can act as a collector instead`]);
        }
      });

      // Collectors: diaphragm shear along the line minus what the walls pick up.
      b.wallLines.forEach(line => {
        const id = `COLL-${t}-${line.id}`;
        const inLine = shares.filter(s => s.wall.dir === line.dir && s.wall.at === line.at);
        const R = inLine.reduce((s, x) => s + x.V, 0);
        const lineLen = line.dir === 'x' ? b.Lx : b.Ly;
        if (!inLine.length || Math.abs(R) < 1e-9) { set(id, 0, ['No load on this line for this direction']); return; }
        const q = R / lineLen, sumLw = inLine.reduce((s, x) => s + x.wall.length, 0), vw = R / sumLw;
        let Fmax = 0, at = 0;
        for (let k = 0; k <= 400; k++) {
          const s = lineLen * k / 400;
          const inWall = inLine.reduce((acc, x) => acc + Math.max(0, Math.min(s, x.wall.to) - x.wall.from), 0);
          const f = q * s - vw * inWall;
          if (Math.abs(f) > Math.abs(Fmax)) { Fmax = f; at = s; }
        }
        set(id, Math.abs(Fmax), [
          `Line force R = ${r(R)} kips along ${r(lineLen)} ft: diaphragm shear q = ${r(q * 1000, 0)} plf`,
          `Wall length on this line = ${r(sumLw)} ft: wall shear = ${r(vw * 1000, 0)} plf`,
          `Collector force F(s) = q s - (wall shear x wall length passed)`,
          `Max collector force = ${r(Math.abs(Fmax))} kips at ${r(at)} ft along the line`
        ]);
        const collAt = line.dir === 'x' ? { x: b.Lx / 2, y: line.at, z: lv.elev } : { x: line.at, y: b.Ly / 2, z: lv.elev };
        LP.addPath(b, 'lateral', `DIA-${t}`, id, R, collAt, 'diaphragm shear delivered along the wall line');
        inLine.forEach(s => {
          const wid = `${s.wall.id}-${t}`;
          wallV[wid] = s;
          const top = LP.center(b.members[wid]);
          LP.addPath(b, 'lateral', id, wid, s.V, { x: top.x, y: top.y, z: lv.elev }, s.note);
        });
      });
    });

    // Walls: shear adds up story by story; overturning at the base of each story.
    b.walls.forEach(w => {
      let above = 0;
      for (let li = b.levels.length - 1; li >= 0; li--) {
        const lv = b.levels[li], id = `${w.id}-${lv.tag}`;
        const own = wallV[id] ? wallV[id].V : 0, V = own + above;
        let Mot = 0;
        for (let k = li; k < b.levels.length; k++) {
          const s = wallV[`${w.id}-${b.levels[k].tag}`];
          if (s) Mot += s.V * (b.levels[k].elev - lv.below);
        }
        const T = Mot / w.length;
        set(id, Math.abs(V), [
          `From ${lv.name} diaphragm: ${r(own)} kips`,
          `From wall above: ${r(above)} kips`,
          `Story shear V = ${r(V)} kips; unit shear = ${r(Math.abs(V) / w.length * 1000, 0)} plf over ${r(w.length)} ft`,
          `Overturning at base of story M = ${r(Mot)} kip-ft`,
          `End forces T = C = M / L = ${r(Mot)} / ${r(w.length)} = ${r(T)} kips (dead load not subtracted)`
        ], { shear: V, overturning: Mot, holdDown: Math.abs(T) });
        const next = li > 0 ? `${w.id}-${b.levels[li - 1].tag}` : `${w.id}-FTG`;
        const c = LP.center(b.members[id]);
        if (Math.abs(V) > 1e-9) LP.addPath(b, 'lateral', id, next, V, { x: c.x, y: c.y, z: lv.below }, li > 0 ? 'story shear to the wall below' : 'base shear to the footing');
        above = V;
      }
      const base = b.members[`${w.id}-${b.levels[0].tag}`].results.lateral;
      set(`${w.id}-FTG`, Math.abs(above), [
        `Base shear = ${r(above)} kips (resisted by friction / passive pressure)`,
        `Overturning M = ${r(base.overturning)} kip-ft`,
        `Uplift at one end and extra compression at the other = ${r(base.holdDown)} kips`
      ], { overturning: base.overturning, holdDown: base.holdDown });
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
