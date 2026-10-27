// Lateral load path as animated arrows (owner: role 3, 3D load graphics).
// Five stages play one at a time for one level: load on the building, the diaphragm handing it to
// the lateral-system lines, collectors, the system, and its base reactions.
// Arrow sizes come from the analysis, on one scale, so a bigger arrow always means more force.
(function (root) {
  const LP = root.LP = root.LP || {};
  const r1 = v => LP.round(v, 1);
  const W = p => LP.toWorld(p);
  const D = (x, y, z = 0) => new THREE.Vector3(x, z, -y).normalize();   // plan direction -> Three.js
  const UP = new THREE.Vector3(0, 1, 0);
  const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));

  const STAGES = [
    { name: '1 Load on building', color: 0xd62728, css: '#d62728', start: 0, end: 2.6 },
    { name: '2 Diaphragm', color: 0x2b7bba, css: '#2b7bba', start: 2.4, end: 6.0 },
    { name: '3 Collectors', color: 0x9b59b6, css: '#9b59b6', start: 5.8, end: 8.6 },
    { name: '4 Shear walls', color: 0x263445, css: '#263445', start: 8.4, end: 12.2 },   // dark: the walls behind are force-coloured
    { name: '5 Foundation', color: 0x1f8a4c, css: '#1f8a4c', start: 12.0, end: 14.6 }
  ];
  const CYCLE = 15.4;

  LP.LateralArrows = class {
    constructor(view) {
      this.group = new THREE.Group();
      view.scene.add(this.group);
      this.shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
      this.headGeo = new THREE.ConeGeometry(1, 1, 14);
      this.items = [];
      this.captions = [];
      this.clock = 0;
      this.last = null;

      // Caption bar: stage chips (click to jump) and one line saying what is happening.
      this.bar = document.createElement('div');
      this.bar.style.cssText = 'position:absolute;right:12px;bottom:12px;width:min(520px,max(300px,calc(100% - 320px)),calc(100% - 24px));' +
        'background:rgba(255,255,255,.96);border:1px solid #d5dae0;border-radius:8px;padding:6px 10px;font-size:12px;display:none;';
      this.chips = STAGES.map((s, i) => {
        const chip = document.createElement('span');
        chip.textContent = s.name;
        chip.style.cssText = 'flex:1;text-align:center;padding:2px 0;border-radius:4px;background:#eceff3;color:#5d6875;cursor:pointer;font-size:11px;';
        chip.addEventListener('click', () => { this.clock = s.start + 0.01; });
        return chip;
      });
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:5px;margin-bottom:4px;';
      this.chips.forEach(c => row.appendChild(c));
      this.text = document.createElement('div');
      this.text.style.minHeight = '34px';
      this.bar.append(row, this.text);
      LP.collapsibleCaption(this.bar, row, this.text);
      view.container.appendChild(this.bar);
    }

    clear() {
      this.group.traverse(o => {
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        if (o.geometry && o.geometry !== this.shaftGeo && o.geometry !== this.headGeo) o.geometry.dispose();
      });
      this.group.clear();
      this.items = [];
      this.bar.style.display = 'none';
    }

    // ---- Drawing helpers ---------------------------------------------------------------------------
    add(stage, update, offset = 0) {
      // Collector, wall and foundation arrows run along edge beams, inside wall panels and footings,
      // which the app draws fairly solid, so those are drawn on top rather than hidden behind them.
      const mat = new THREE.MeshLambertMaterial({ color: STAGES[stage].color, transparent: true, depthWrite: false, depthTest: stage < 2 });
      const g = new THREE.Group(), shaft = new THREE.Mesh(this.shaftGeo, mat), head = new THREE.Mesh(this.headGeo, mat);
      g.add(shaft, head);
      g.userData = { mat, shaft, head };
      g.renderOrder = 6;
      this.group.add(g);
      this.items.push({ g, stage, update, offset });
    }

    label(text, p, stage, scale = 1) {
      const c = document.createElement('canvas'), g = c.getContext('2d'), font = '600 30px system-ui, sans-serif';
      g.font = font;
      c.width = Math.ceil(g.measureText(text).width) + 28;
      c.height = 48;
      g.font = font;
      g.fillStyle = 'rgba(255,255,255,0.94)';
      g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = STAGES[stage].css;
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
      g.fillStyle = '#1d2733';
      g.textBaseline = 'middle';
      g.fillText(text, 14, 25);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      sp.scale.set(c.width / 48 * 2.2 * scale, 2.2 * scale, 1);
      sp.position.copy(W(p));
      sp.renderOrder = 11;
      sp.userData.stage = stage;
      this.group.add(sp);
    }

    /**
     * Build the arrows for one level of an analysed building.
     * @param {number} li level index whose load is followed down to the foundation
     * @param {'strut'|'edges'} wallStyle how shear is drawn in the walls
     */
    build(b, li, wallStyle) {
      this.clear();
      this.clock = 0;
      this.bar.style.display = '';
      const L = b.inputs.lateral, dir = L.dir, lv = b.levels[li], t = lv.tag, z = lv.elev;
      const system = LP.SYSTEMS[L.system] || LP.SYSTEMS.specialRCWall;
      const isWall = system.graphic === 'wall';
      this.chips[3].textContent = `4 ${system.layoutPlural}`;
      this.chips[4].textContent = isWall ? '5 Foundation' : '5 Frame bases';
      const dv = dir === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 }, DV = D(dv.x, dv.y);
      const depth = dir === 'x' ? b.Ly : b.Lx, len = dir === 'x' ? b.Lx : b.Ly;
      // (s, o): s runs across the load (along the windward face), o runs with the load.
      const P = (s, o, h = 0) => dir === 'x' ? { x: o, y: s, z: z + h } : { x: s, y: o, z: z + h };
      const SO = (ds, d0) => dir === 'x' ? D(d0, ds) : D(ds, d0);
      const centred = (p, d, sz, a = 1) => ({ tail: W(p).sub(d.clone().multiplyScalar(sz.len / 2)), dir: d, ...sz, a });
      const F = b.members[`LAT-${t}`].results.lateral.value;
      const baseMax = Math.max(...b.walls.map(w => Math.abs(b.members[`${w.id}-${b.levels[0].tag}`].results.lateral.shear || 0)), 1e-9);
      const size = k => { const f = Math.sqrt(Math.min(1, Math.abs(k) / baseMax)); return { len: 2.5 + 9 * f, rad: 0.12 + 0.55 * f }; };
      const face = dir === 'x' ? 'west' : 'south';
      const lineR = l => { const p = b.paths.find(q => q.mode === 'lateral' && q.from === `DIA-${t}` && q.to === `COLL-${t}-${l.id}`); return p ? p.value : 0; };

      // 1. Load on the building. Wind: an even grid on the face over the level's tributary height,
      //    all marching in step. Seismic: the floor's own mass, an even grid on the floor.
      const uni = { len: 5, rad: 0.2 };
      if (L.type === 'wind') {
        const hBelow = lv.height / 2, hAbove = li < b.levels.length - 1 ? b.levels[li + 1].height / 2 : 0;
        const cols = Math.round(depth / 6), rows = 3;
        for (let i = 0; i <= cols; i++) for (let j = 0; j < rows; j++) {
          const s = depth * i / cols, h = -hBelow + (hBelow + hAbove) * (j + 0.5) / rows;
          this.add(0, u => ({ tail: W(P(s, -(uni.len + 0.5) - 8 * (1 - u), h)), dir: DV, ...uni, a: u < 0.8 ? 1 : (1 - u) / 0.2 }));
        }
        this.label(`${lv.name}: ${r1(F)} k of wind on the ${face} face`, P(depth / 2, -20, hAbove + 3), 0);
        this.captions[0] = `Wind presses evenly on the ${face} face. The band from halfway down to the floor below to halfway up to the ` +
          `floor above belongs to the ${lv.name}: ${r1(F)} k over ${r1(depth)} ft × ${r1(hBelow + hAbove)} ft.`;
      } else {
        const ns = Math.round(depth / 8), no = Math.round(len / 9);
        for (let i = 0; i <= ns; i++) for (let j = 0; j <= no; j++) {
          this.add(0, u => centred(P(depth * i / ns, len * j / no - 2 + 4 * u, 0.6), DV, uni, Math.sin(Math.PI * u)));
        }
        this.label(`${lv.name}: ${r1(F)} k seismic, from the floor's own weight`, P(depth / 2, -14, 4), 0);
        this.captions[0] = `In an earthquake the ground moves and the floor's own mass resists, so the load is spread evenly over the whole floor: ${r1(F)} k at the ${lv.name}.`;
      }

      // 2. Diaphragm: arrows enter heading with the load, then arc diagonally onto their wall line,
      //    landing evenly along its whole length (uniform edge shear). Each line gets arrows in
      //    proportion to its share, from a strip of floor of the same share.
      const par = b.wallLines.filter(l => l.dir === dir).map(l => ({ l, R: lineR(l) })).filter(x => Math.abs(x.R) > 1e-6).sort((a, c) => a.l.at - c.l.at);
      const sumR = par.reduce((s, x) => s + Math.abs(x.R), 0);
      let cum = 0;
      const capDia = [];
      par.forEach(({ l, R }) => {
        const lo = depth * cum / sumR; cum += Math.abs(R); const hi = depth * cum / sumR;
        const n = 9, c = l.at, sz = size(R / n * 2.5), sFar = Math.abs(c - lo) > Math.abs(c - hi) ? lo : hi;
        for (let i = 0; i < n; i++) {
          // Arrows that land further downwind start further from the line, so the paths don't cross.
          const o1 = len * (i + 0.5) / n, s0 = c + (sFar - c) * (i + 0.5) / n * 0.9;
          const o0 = L.type === 'wind' ? 0 : Math.max(0, o1 - Math.abs(c - s0));
          const P0 = { s: s0, o: o0 }, P1 = { s: s0, o: o1 }, P2 = { s: c, o: o1 };   // heads downwind, then turns onto the line
          for (const off of [0, 0.5]) {
            this.add(1, u => {
              const v = 1 - u, s = v * v * P0.s + 2 * v * u * P1.s + u * u * P2.s, o = v * v * P0.o + 2 * v * u * P1.o + u * u * P2.o;
              const ts = 2 * v * (P1.s - P0.s) + 2 * u * (P2.s - P1.s), to = 2 * v * (P1.o - P0.o) + 2 * u * (P2.o - P1.o);
              return centred(P(s, o, 0.8), SO(ts, to), sz, Math.min(1, Math.sin(Math.PI * u) * 1.6));
            }, (i * 0.11 + off) % 1);
          }
        }
        const Ll = l.dir === 'x' ? b.Lx : b.Ly;
        this.label(`${r1(Math.abs(R))} k → ${l.name} (${r1(Math.abs(R) / Ll * 1000)} plf)`, P(c + (c < depth / 2 ? -5 : 5), len / 2, 3), 1, 0.85);
        capDia.push(`${r1(Math.abs(R))} k to ${l.name}`);
      });
      this.captions[1] = `The floor acts like a flat beam spanning between the lateral-system lines. The load is handed to each line ` +
        `evenly along its whole length: ${capDia.join(', ')}.` + (L.diaphragm === 'rigid' ? ' Rigid: shared by line-length stiffness proxy, plus twist.' : ' Flexible: shared by tributary width.');

      // 3. Collectors: the collector force only, along the parts of each line with no wall,
      //    flowing toward the wall and growing as it gets there.
      //    Collector forces are small next to the wall base shear (1.1 k vs 16.5 k in the default
      //    building), so on the shared scale they shrank to specks. They are sized against the
      //    largest collector force at this level instead, with a visible minimum; labels give the numbers.
      const capColl = [];
      const collMax = Math.max(...b.wallLines.map(l => { const cd = Math.abs(lineR(l)) > 1e-6 && LP.collectorDiagram(b, li, l); return cd ? cd.Fmax : 0; }), 1e-9);
      const collSize = F => { const f = Math.min(1, Math.abs(F) / collMax); return { len: 3 + 6 * f, rad: 0.25 + 0.4 * f }; };
      b.wallLines.forEach(l => {
        const R = lineR(l), cd = Math.abs(R) > 1e-6 && LP.collectorDiagram(b, li, l);
        if (!cd) return;
        const Ll = cd.length, ax = l.dir === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
        const linePt = (o, h) => l.dir === 'x' ? { x: o, y: l.at, z: z + h } : { x: l.at, y: o, z: z + h };
        const Fat = o => { const k = o / Ll * (cd.pts.length - 1), i = Math.min(cd.pts.length - 2, Math.floor(k)), f = k - i; return cd.pts[i].F * (1 - f) + cd.pts[i + 1].F * f; };
        const ws = b.walls.filter(w => w.dir === l.dir && w.at === l.at).sort((a, c) => a.from - c.from);
        const segs = [];
        let cur = 0;
        ws.forEach(w => { if (w.from - cur > 0.5) segs.push([cur, w.from]); cur = Math.max(cur, w.to); });
        if (Ll - cur > 0.5) segs.push([cur, Ll]);
        segs.forEach(([a0, a1]) => {
          const toRight = ws.some(w => Math.abs(w.from - a1) < 0.5), flowSign = toRight ? 1 : -1;
          // Every collector arrow points with the load and travels that way: on the upwind side it
          // pushes into the wall, growing; on the downwind side it pulls the wall along, shrinking
          // as it moves away.
          const forceSign = Math.sign(R) || 1, d = D(ax.x * forceSign, ax.y * forceSign), m = Math.max(3, Math.round((a1 - a0) / 6));
          for (let k = 0; k < m; k++) {
            this.add(2, u => {
              const f = (k + u) / m, o = forceSign > 0 ? a0 + (a1 - a0) * f : a1 - (a1 - a0) * f;
              return centred(linePt(o, 3.5), d, collSize(Fat(o)), 0.4 + 0.6 * Math.min(1, Math.abs(Fat(o)) / collMax));
            });
          }
          // Pushing into the wall in the direction of the load is compression; pulling is tension.
          const Fend = Math.abs(Fat(toRight ? a1 - 0.01 : a0 + 0.01)), comp = flowSign * (Math.sign(R) || 1) > 0;
          if (Fend > 0.05) {
            this.label(`Collector ${comp ? 'compression' : 'tension'} ${r1(Fend)} k`, linePt((a0 + a1) / 2, 8), 2, 0.8);
            capColl.push(`${r1(Fend)} k ${comp ? 'pushing (compression)' : 'pulling (tension)'} on ${l.name}`);
          }
        });
      });
      this.captions[2] = capColl.length
        ? `Collectors gather the load handed to the parts of each line with no lateral element and drag it into the ${system.layoutName.toLowerCase()}: ${capColl.join(', ')}. The force builds up toward the line.`
        : `The ${system.layoutPlural.toLowerCase()} run the full length of their lines, so no collector is needed.`;

      // 4. Show the selected lateral system's story shear representation.
      const capWall = [];
      b.walls.forEach(w => {
        const ax = w.dir === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 }, Lw = w.to - w.from;
        const at = (o, h) => w.dir === 'x' ? { x: o, y: w.at, z: h } : { x: w.at, y: o, z: h };
        let shown = false;
        for (let k = li; k >= 0; k--) {
          const st = b.levels[k], V = b.members[`${w.id}-${st.tag}`].results.lateral.shear;
          if (!V || Math.abs(V) < 1e-6) continue;
          shown = true;
          const sgn = Math.sign(V), d = D(ax.x * sgn, ax.y * sgn), sz = size(V), H = st.elev - st.below;
          if (!isWall) {
            const mid = (w.from + w.to) / 2;
            const linePoint = at(mid, st.elev - 1);
            if (w.dir === 'x') linePoint.y -= 3;
            else linePoint.x -= 3;
            this.add(3, u => centred(linePoint, d, sz, Math.sin(Math.PI * u)), (li - k) * 0.15);
            this.label(`${w.name}: equivalent line shear ${r1(Math.abs(V))} k`, at(mid, st.elev + 2), 3, 0.8);
            continue;
          }
          const up = sgn > 0 ? w.from : w.to, dn = sgn > 0 ? w.to : w.from, toward = Math.sign(dn - up);
          const stagger = (li - k) * 0.15;
          if (wallStyle === 'edges') {
            // Shear panel: top edge with the load, bottom edge against it, ends up and down.
            const szE = { len: sz.len * 0.75, rad: sz.rad * 0.8 };
            [0, 1].forEach(j => {
              this.add(3, u => centred(at(w.from + Lw * (j + u) / 2, st.elev - 0.6), d, szE), stagger);
              this.add(3, u => centred(at(w.to - Lw * (j + u) / 2, st.below + 0.6), d.clone().negate(), szE), stagger);
            });
            this.add(3, u => centred(at(dn, st.below + H * u), D(0, 0, 1), szE, Math.sin(Math.PI * u)), stagger);
            this.add(3, u => centred(at(up, st.elev - H * u), D(0, 0, -1), szE, Math.sin(Math.PI * u)), stagger);
          } else {
            // Compression strut: from the loaded top corner diagonally down to the opposite bottom
            // corner, in three lanes drawn at about half size so they don't crowd the panel.
            const szS = { len: sz.len * 0.55, rad: sz.rad * 0.55 };
            [0, 1, 2].forEach(j => {
              const oa = up + toward * Lw * (0.05 + 0.2 * j), ob = oa + toward * Lw * 0.55, za = st.elev - 0.5, zb = st.below + 0.5;
              const dirS = new THREE.Vector3().subVectors(W(at(ob, zb)), W(at(oa, za))).normalize();
              this.add(3, u => centred(at(oa + (ob - oa) * u, za + (zb - za) * u), dirS, szS, Math.sin(Math.PI * u)), (stagger + j * 0.3) % 1);
            });
          }
          const end = at(w.to + (w.to < (w.dir === 'x' ? b.Lx : b.Ly) / 2 ? -8 : 8), (st.elev + st.below) / 2);
          this.label(`${w.id} V = ${r1(Math.abs(V))} k`, end, 3, 0.8);
        }
        const base = b.members[`${w.id}-${b.levels[0].tag}`].results.lateral;
        if (shown) capWall.push(`${w.name} ${r1(Math.abs(b.members[`${w.id}-${lv.tag}`].results.lateral.shear))} k → ${r1(Math.abs(base.shear))} k at the base`);
      });
      this.captions[3] = isWall
        ? (wallStyle === 'edges'
          ? 'Each story panel is in shear: pushed one way along its top, held back along its bottom, with the ends pulled up and pushed down to keep it from spinning. '
          : 'The load enters at the top corner and travels diagonally down to the opposite bottom corner, like a compression brace. ') +
          `${capWall.join('; ')}.` + (li < b.levels.length - 1 ? ' (Includes the floors above this level.)' : '')
        : `Equivalent story shear is shown along each ${system.layoutName.toLowerCase()}; the steel-frame member forces are not calculated. ${capWall.join('; ')}.` +
          (li < b.levels.length - 1 ? ' (Includes the floors above this level.)' : '');

      // 5. Show the foundation reaction or equivalent frame-line base reaction.
      const capFdn = [];
      b.walls.forEach(w => {
        const res = b.members[`${w.id}-${b.levels[0].tag}`].results.lateral, V = res.shear;
        if (!V || Math.abs(V) < 1e-6) return;
        const ax = w.dir === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 }, sgn = Math.sign(V);
        const d = D(ax.x * sgn, ax.y * sgn), sz = size(V), mid = (w.from + w.to) / 2;
        const at = (o, h) => w.dir === 'x' ? { x: o, y: w.at, z: h } : { x: w.at, y: o, z: h };
        this.add(4, u => ({ tail: W(at(mid, -1)).sub(d.clone().multiplyScalar(sz.len * (0.9 - 0.2 * Math.sin(Math.PI * u)))), dir: d, ...sz, a: 1 }));
        if (!isWall) {
          const endA = sgn > 0 ? w.from : w.to, endB = sgn > 0 ? w.to : w.from;
          const szT = size(res.holdDown);
          this.add(4, u => ({ tail: W(at(endA, 0.5 + 2 * u)), dir: D(0, 0, 1), ...szT, a: Math.sin(Math.PI * u) }));
          this.add(4, u => ({ tail: W(at(endB, szT.len + 3.5 - 2 * u)), dir: D(0, 0, -1), ...szT, a: Math.sin(Math.PI * u) }));
          this.label(`Equivalent base reaction ${r1(Math.abs(V))} k`, at(mid, -5), 4, 0.8);
          this.label(`Equivalent end-force couple ${r1(res.holdDown)} k`, at(endA, 9), 4, 0.75);
          capFdn.push(`${w.name}: ${r1(Math.abs(V))} k equivalent base shear, ${r1(res.holdDown)} k end-force couple`);
          return;
        }
        // The wall tips about its downwind end: the upwind end lifts, the downwind end bears down.
        const upEnd = sgn > 0 ? w.from : w.to, downEnd = sgn > 0 ? w.to : w.from, szT = size(res.holdDown);
        this.add(4, u => ({ tail: W(at(upEnd, 0.5 + 2 * u)), dir: D(0, 0, 1), ...szT, a: Math.sin(Math.PI * u) }));
        this.add(4, u => ({ tail: W(at(downEnd, szT.len + 3.5 - 2 * u)), dir: D(0, 0, -1), ...szT, a: Math.sin(Math.PI * u) }));
        this.label(`Base shear ${r1(Math.abs(V))} k`, at(mid, -5), 4, 0.8);
        this.label(`Uplift ${r1(res.holdDown)} k`, at(upEnd, 9), 4, 0.75);
        this.label(`Compression ${r1(res.holdDown)} k`, at(downEnd, -4), 4, 0.75);
        capFdn.push(`${w.name}: ${r1(Math.abs(V))} k base shear, ${r1(res.holdDown)} k uplift / compression`);
      });
      this.captions[4] = isWall
        ? `The footings resist the base shear by friction and soil pressure, and the overturning as uplift at one end of ` +
          `the wall and extra bearing at the other: ${capFdn.join('; ')}.`
        : `Equivalent frame-line base reactions and overturning couples are shown for visualization only; they are not steel member or connection design demands: ${capFdn.join('; ')}.`;
    }

    // Advance the stage clock and pose every arrow; called from the scene's render loop.
    tick(time) {
      const dt = this.last === null ? 0 : (time - this.last) / 1000;
      this.last = time;
      if (!this.items.length) return;
      this.clock += dt;
      const cyc = this.clock % CYCLE, endAll = STAGES.at(-1).end;
      const alpha = STAGES.map(s => ramp(cyc, s.start, s.start + 0.5) * (1 - ramp(cyc, s.end - 0.5, s.end)));
      this.items.forEach(it => {
        const a0 = alpha[it.stage];
        if (a0 <= 0) { it.g.visible = false; return; }
        const st = it.update((this.clock * 0.4 + it.offset) % 1), { shaft, head, mat } = it.g.userData;
        const headLen = Math.min(st.len * 0.45, st.rad * 4.5), shaftLen = Math.max(st.len - headLen, 0.01);
        it.g.visible = true;
        it.g.position.copy(st.tail);
        it.g.quaternion.setFromUnitVectors(UP, st.dir);
        shaft.scale.set(st.rad, shaftLen, st.rad);
        shaft.position.set(0, shaftLen / 2, 0);
        head.scale.set(st.rad * 2.3, headLen, st.rad * 2.3);
        head.position.set(0, shaftLen + headLen / 2, 0);
        mat.opacity = a0 * Math.max(0, Math.min(1, st.a));
      });
      this.group.children.forEach(o => {
        if (o.isSprite) { o.material.opacity = alpha[o.userData.stage]; o.visible = o.material.opacity > 0.02; }
      });
      const cur = STAGES.reduce((c, s, i) => (cyc >= s.start ? i : c), -1), done = cyc > endAll;
      this.chips.forEach((chip, i) => {
        const on = !done && i === cur;
        chip.style.background = on ? STAGES[i].css : '#eceff3';
        chip.style.color = on ? '#fff' : '#5d6875';
      });
      this.text.textContent = done ? 'Starting again…' : this.captions[cur];
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
