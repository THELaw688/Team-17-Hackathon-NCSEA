// Lateral analysis (owners: role 5 story forces + diaphragm, role 6 chords, collectors, lateral systems).
// Story force -> diaphragm -> collectors -> lateral system (stacked story by story) -> base.
// Flexible diaphragm: tributary width. Rigid: line length is a simplified stiffness proxy, plus torsion.
(function (root) {
  const LP = root.LP = root.LP || {};
  const r = LP.round;

  // ---- Role 5: ASCE 7 seismic coefficient -------------------------------------
  // ASCE 7-22 Table 12.2-1 response modification factors for supported lateral systems.
  LP.SYSTEMS = {
    specialRCWall:      { name: 'Special reinforced concrete shear walls', R: 6, graphic: 'wall', layoutName: 'Shear wall', layoutPlural: 'Shear walls' },
    ordinaryRCWall:     { name: 'Ordinary reinforced concrete shear walls', R: 5, graphic: 'wall', layoutName: 'Shear wall', layoutPlural: 'Shear walls' },
    specialMasonryWall: { name: 'Special reinforced masonry shear walls', R: 5.5, graphic: 'wall', layoutName: 'Shear wall', layoutPlural: 'Shear walls' },
    specialSteelBracedFrame: { name: 'Special steel concentrically braced frames', R: 6, graphic: 'bracedFrame', layoutName: 'Frame line', layoutPlural: 'Frame lines' },
    specialSteelMomentFrame: { name: 'Special steel moment frames', R: 8, graphic: 'momentFrame', layoutName: 'Frame line', layoutPlural: 'Frame lines', period: { Ct: 0.028, x: 0.8 } },
    bucklingRestrainedBracedFrame: { name: 'Buckling-restrained braced frames', R: 8, graphic: 'brbf', layoutName: 'Frame line', layoutPlural: 'Frame lines' }
  };
  const IE = { I: 1.0, II: 1.0, III: 1.25, IV: 1.5 }; // ASCE 7-22 Table 1.5-2

  /**
   * Seismic response coefficient and distribution exponent for b.inputs.lateral (ASCE 7 12.8).
   * @param {object} b building from LP.buildModel
   * @returns {{Cs: number, k: number, calc: string[]}}
   */
  LP.seismicCs = function (b) {
    const L = b.inputs.lateral;
    if (L.mode !== 'asce7') return { Cs: L.Cs, k: 1, calc: [`Cs = ${L.Cs} (typed in, Override mode)`] };
    // A missing or unknown risk category means II (Ie = 1.0), as a missing mode means Override,
    // so inputs built without the panel (tests, imports) still give a real Cs instead of NaN.
    const rc = IE[L.riskCategory] ? L.riskCategory : 'II';
    const sys = LP.SYSTEMS[L.system] || LP.SYSTEMS.specialRCWall, Ie = IE[rc], RI = sys.R / Ie;
    const hn = b.levels[b.levels.length - 1].elev;
    const period = sys.period || { Ct: 0.02, x: 0.75 };
    const T = period.Ct * hn ** period.x;
    const base = L.SDS / RI, max = L.SD1 / (T * RI), min = Math.max(0.044 * L.SDS * Ie, 0.01);
    const Cs = Math.max(Math.min(base, max), min);
    const k = T <= 0.5 ? 1 : T >= 2.5 ? 2 : 1 + (T - 0.5) / 2;
    return { Cs, k, calc: [
      `${sys.name}: R = ${sys.R} (Table 12.2-1); risk category ${rc}: Ie = ${Ie}`,
      `Period Ta = ${period.Ct} x ${r(hn)}^${period.x} = ${r(T, 3)} s (Table 12.8-2, 12.8.2.1)`,
      `Cs = SDS / (R/Ie) = ${L.SDS} / ${r(RI, 3)} = ${r(base, 3)}`,
      `Limits: upper SD1 / (T R/Ie) = ${r(max, 3)}, lower max(0.044 SDS Ie, 0.01) = ${r(min, 3)}`,
      `Cs = ${r(Cs, 3)}${Cs === max ? ' (upper limit governs)' : Cs === min ? ' (lower limit governs)' : ''}, k = ${r(k, 3)}`
    ] };
  };

  // ---- Role 5: ASCE 7 wind pressure -------------------------------------------
  // ASCE 7-22 Table 26.10-1 terrain constants: alpha, zg (ft).
  const TERRAIN = { B: { alpha: 7.5, zg: 3280 }, C: { alpha: 9.8, zg: 2460 }, D: { alpha: 11.5, zg: 1935 } };
  LP.windKz = (exposure, z) => 2.41 * (Math.max(z, 15) / TERRAIN[exposure].zg) ** (2 / TERRAIN[exposure].alpha);
  // Fig. 27.3-1 leeward wall Cp from plan proportions L/B (L along the wind).
  const leewardCp = LB => LB <= 1 ? -0.5 : LB <= 2 ? -0.5 + 0.2 * (LB - 1) : LB <= 4 ? -0.3 + 0.05 * (LB - 2) : -0.2;

  /**
   * Net MWFRS wind pressure (windward + leeward) by height, ASCE 7-22 directional procedure (27.3).
   * @param {object} b building from LP.buildModel
   * @returns {{at: function(number): {p: number, calc: string[]}, calc: string[]}} p in psf
   */
  LP.asce7Wind = function (b) {
    // Kzt (flat site) and Ke (sea level) have no input boxes yet, so they stay 1.0.
    const L = b.inputs.lateral, V = L.windSpeed, Kd = 0.85, G = 0.85, Cpw = 0.8, Kzt = 1, Ke = 1;
    const h = b.levels[b.levels.length - 1].elev, Kh = LP.windKz(L.exposure, h);
    const along = L.dir === 'x' ? b.Lx : b.Ly, across = L.dir === 'x' ? b.Ly : b.Lx, Cpl = leewardCp(along / across);
    const q = z => 0.00256 * LP.windKz(L.exposure, z) * Kzt * Ke * V * V;
    const qh = q(h), pl = qh * Kd * G * Math.abs(Cpl);
    return {
      calc: [
        `ASCE 7-22 directional procedure (Ch. 27), exposure ${L.exposure}, V = ${V} mph`,
        `Factors: Kd = ${Kd} (Table 26.6-1), G = ${G} (26.11, rigid), Kzt = ${Kzt} (26.8, flat site), Ke = ${Ke} (26.9, sea level), Cp windward = ${Cpw}`,
        `Leeward: L/B = ${r(along)} / ${r(across)} = ${r(along / across, 2)} -> Cp = ${r(Cpl, 2)} (Fig. 27.3-1); qh = 0.00256 x Kh ${r(Kh, 3)} x Kzt ${Kzt} x Ke ${Ke} x ${V}^2 = ${r(qh)} psf; p = qh x Kd x G x |Cp| = ${r(pl)} psf`
      ],
      at: z => {
        const Kz = LP.windKz(L.exposure, z), pw = q(z) * Kd * G * Cpw, p = Math.max(pw + pl, 16);
        return { p, calc: [
          `Windward at z = ${r(z)} ft: Kz = ${r(Kz, 3)} (Table 26.10-1), qz = 0.00256 x ${r(Kz, 3)} x ${Kzt} x ${Ke} x ${V}^2 = ${r(q(z))} psf; p = qz x ${Kd} x ${G} x ${Cpw} = ${r(pw)} psf`,
          `Net p = ${r(pw)} + ${r(pl)} = ${r(pw + pl)} psf${pw + pl < 16 ? ' -> 16 psf minimum governs (27.1.5)' : ''} (strength level W; ASD uses 0.6W)`
        ] };
      }
    };
  };

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
      const w = L.mode === 'asce7' ? LP.asce7Wind(b) : null;
      return b.levels.map((lv, i) => {
        const hTrib = lv.height / 2 + (i < n - 1 ? b.levels[i + 1].height / 2 : 0);
        const at = w && w.at(lv.elev), p = w ? at.p : L.windPressure;
        const F = p * face * hTrib / 1000;
        return { F, calc: [
          ...(w ? [...w.calc, ...at.calc] : [`Wind pressure p = ${L.windPressure} psf on a ${r(face)} ft wide face`]),
          `Tributary height = ${r(hTrib)} ft (half the story below${i < n - 1 ? ' + half the story above' : ''})`,
          `F = ${r(p)} x ${r(face)} x ${r(hTrib)} / 1000 = ${r(F)} kips`
        ] };
      });
    }
    const s = LP.seismicCs(b);
    const W = b.levels.map(lv => lv.dead * b.Lx * b.Ly / 1000);
    const sumW = W.reduce((t, v) => t + v, 0), V = s.Cs * sumW;
    const wh = b.levels.map((lv, i) => W[i] * lv.elev ** s.k), sumWh = wh.reduce((t, v) => t + v, 0);
    return b.levels.map((lv, i) => {
      const F = V * wh[i] / sumWh;
      return { F, calc: [
        `Seismic weight W = ${lv.dead} psf x ${r(b.Lx)} x ${r(b.Ly)} / 1000 = ${r(W[i])} kips`,
        ...s.calc,
        `Base shear V = Cs x total W = ${r(s.Cs, 3)} x ${r(sumW)} = ${r(V)} kips${L.mode === 'asce7' ? ' (strength level E; ASD uses 0.7E)' : ''}`,
        `Vertical distribution (ASCE 7 ELF, k = ${r(s.k, 3)}): Cvx = w h^k / sum(w h^k) = ${r(wh[i])} / ${r(sumWh)} = ${r(wh[i] / sumWh, 3)}`,
        `F = Cvx x V = ${r(F)} kips`
      ] };
    });
  };
  // Tells app.js the ASCE 7 inputs reach the analysis, so it drops its "not connected yet" warning.
  LP.asce7Ready = true;

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
    const sys = LP.SYSTEMS[L.system] || LP.SYSTEMS.specialRCWall;
    if (!par.length) { b.warnings.push(`No ${sys.layoutPlural.toLowerCase()} resist ${dir.toUpperCase()}-direction load: the load path is broken.`); return []; }
    const lines = [...new Set(par.map(w => w.at))].sort((a, c) => a - c);

    if (L.diaphragm === 'flexible') {
      return lines.flatMap((c, j) => {
        const lo = j === 0 ? 0 : (lines[j - 1] + c) / 2;
        const hi = j === lines.length - 1 ? depth : (c + lines[j + 1]) / 2;
        const R = F * (hi - lo) / depth;
        const inLine = par.filter(w => w.at === c), sumL = inLine.reduce((s, w) => s + w.length, 0);
        return inLine.map(w => ({ wall: w, V: R * w.length / sumL,
          note: `Flexible: tributary width ${r(hi - lo)} of ${r(depth)} ft -> ${r(R)} k on ${dir === 'x' ? 'line y' : 'line x'} = ${c}; split by ${sys.layoutName.toLowerCase()} length` }));
      });
    }

    // Rigid: use line length as a simplified proxy for lateral stiffness.
    const sumK = par.reduce((s, w) => s + w.length, 0);
    const cr = par.reduce((s, w) => s + w.length * w.at, 0) / sumK;
    const sumKp = perp.reduce((s, w) => s + w.length, 0);
    const crP = sumKp ? perp.reduce((s, w) => s + w.length * w.at, 0) / sumKp : 0;
    const e = depth / 2 - cr;
    // ASCE 7 12.8.4.2: for seismic, also shift the mass +/-5% of the building width across the load.
    const eAcc = L.type === 'seismic' && L.accidentalTorsion !== false ? 0.05 * depth : 0;
    const J = par.reduce((s, w) => s + w.length * (w.at - cr) ** 2, 0) + perp.reduce((s, w) => s + w.length * (w.at - crP) ** 2, 0);
    if (J === 0 && (Math.abs(e) > 1e-6 || eAcc)) b.warnings.push(`${sys.layoutPlural} cannot resist torsion: the rigid diaphragm is unstable.`);
    const cases = eAcc ? [e + eAcc, e - eAcc] : [e];
    const twist = (ec, w, c) => (J ? F * ec / J : 0) * w.length * (w.at - c);
    // One shift per story keeps the floor in equilibrium, so the diaphragm diagrams close. Use the
    // shift that loads the heaviest wall; the opposite shift mirrors it onto the walls on the other side.
    const peak = x => Math.max(...par.map(w => F * w.length / sumK + twist(x, w, cr)));
    const ec = cases.reduce((a, x) => peak(x) > peak(a) + 1e-9 ? x : a);
    b.rigid = { cr, e, eAcc, ec, J, sumK };
    const eNote = eAcc ? `e = ${r(e)} ${ec > e ? '+' : '-'} ${r(eAcc)} accidental = ${r(ec)} ft; design each ${sys.layoutName.toLowerCase()} for the worse of +/-5%` : `e = ${r(e)} ft`;
    return par.map(w => ({ wall: w, V: F * w.length / sumK + twist(ec, w, cr),
      note: `Rigid: direct ${r(F * w.length / sumK)} k (k = L = ${r(w.length)} of ${r(sumK)}) + torsion ${r(twist(ec, w, cr))} k (${eNote})` }))
      .concat(perp.map(w => ({ wall: w, V: -twist(ec, w, crP), torsion: true,
        note: `Rigid: torsion only, ${r(-twist(ec, w, crP))} k (perpendicular ${sys.layoutName.toLowerCase()} resisting twist, ${eNote})` })));
  };

  // ---- Role 6: collectors, chords, walls, overturning -------------------------
  /**
   * Run the lateral analysis in place: fills members[id].results.lateral and adds 'lateral' paths.
   * @param {object} b building from LP.buildModel; reads b.inputs.lateral
   */
  LP.runLateral = function (b) {
    const L = b.inputs.lateral, dir = L.dir;
    const sys = LP.SYSTEMS[L.system] || LP.SYSTEMS.specialRCWall;
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
        `${L.diaphragm === 'rigid' ? 'Rigid' : 'Flexible'} diaphragm spanning between ${lines.length} lateral-system line(s)`,
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

      // Collectors: diaphragm shear along the line minus what the lateral system picks up.
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
          `${sys.layoutPlural} length on this line = ${r(sumLw)} ft: line shear = ${r(vw * 1000, 0)} plf`,
          `Collector force F(s) = q s - (line shear x lateral-system length passed)`,
          `Max collector force = ${r(Math.abs(Fmax))} kips at ${r(at)} ft along the line`
        ]);
        const collAt = line.dir === 'x' ? { x: b.Lx / 2, y: line.at, z: lv.elev } : { x: line.at, y: b.Ly / 2, z: lv.elev };
        LP.addPath(b, 'lateral', `DIA-${t}`, id, R, collAt, `diaphragm shear delivered along the ${sys.layoutName.toLowerCase()} line`);
        inLine.forEach(s => {
          const wid = `${s.wall.id}-${t}`;
          wallV[wid] = s;
          const top = LP.center(b.members[wid]);
          LP.addPath(b, 'lateral', id, wid, s.V, { x: top.x, y: top.y, z: lv.elev }, s.note);
        });
      });
    });

    // Lateral-system line forces accumulate story by story; overturning is taken at each story base.
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
          `From ${sys.layoutName.toLowerCase()} above: ${r(above)} kips`,
          `Story shear V = ${r(V)} kips; unit line shear = ${r(Math.abs(V) / w.length * 1000, 0)} plf over ${r(w.length)} ft`,
          `Overturning at base of story M = ${r(Mot)} kip-ft`,
          sys.graphic === 'wall'
            ? `End forces T = C = M / L = ${r(Mot)} / ${r(w.length)} = ${r(T)} kips (dead load not subtracted)`
            : `Equivalent end-force couple M / L = ${r(Mot)} / ${r(w.length)} = ${r(T)} kips (simplified line-length approximation)`
        ], { shear: V, overturning: Mot, holdDown: Math.abs(T) });
        const next = li > 0 ? `${w.id}-${b.levels[li - 1].tag}` : `${w.id}-FTG`;
        const c = LP.center(b.members[id]);
        const destination = li > 0
          ? `story shear to the ${sys.layoutName.toLowerCase()} below`
          : sys.graphic === 'wall' ? 'base shear to the footing' : 'equivalent base reaction at the frame line';
        if (Math.abs(V) > 1e-9) LP.addPath(b, 'lateral', id, next, V, { x: c.x, y: c.y, z: lv.below }, destination);
        above = V;
      }
      const base = b.members[`${w.id}-${b.levels[0].tag}`].results.lateral;
      const baseForceNote = sys.graphic === 'wall'
        ? `Uplift at one end and extra compression at the other = ${r(base.holdDown)} kips`
        : `Equivalent end-force couple = ${r(base.holdDown)} kips (simplified line-length approximation, not frame member demand)`;
      const baseSupportNote = sys.graphic === 'wall'
        ? `Base shear = ${r(above)} kips (resisted by friction / passive pressure)`
        : `Base shear = ${r(above)} kips (equivalent frame-line reaction)`;
      set(`${w.id}-FTG`, Math.abs(above), [
        baseSupportNote,
        `Overturning M = ${r(base.overturning)} kip-ft`,
        baseForceNote
      ], { overturning: base.overturning, holdDown: base.holdDown });
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
