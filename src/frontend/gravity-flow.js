// Gravity load path as glowing strips (TEST: loaded only by gravity-flow-test.html; would belong to role 3).
// Five stages play one at a time for one level: the deck sends a strip from mid-span out to each
// beam; each beam glows along its length and slides its load from the middle to both ends; girders
// do the same into the columns; the load runs down the columns; the footings pulse.
// Brightness comes from the analysis, scaled per member type, so a brighter glow means more load.
(function (root) {
  const LP = root.LP = root.LP || {};
  const r1 = v => LP.round(v, 1);
  const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const ease = u => u * u * (3 - 2 * u);

  const STAGES = [
    { name: '1 Deck', start: 0, end: 2.8 },
    { name: '2 Beams', start: 2.5, end: 5.4 },
    { name: '3 Girders', start: 5.1, end: 8.0 },
    { name: '4 Columns', start: 7.7, end: 10.8 },
    { name: '5 Footings', start: 10.5, end: 12.6 }
  ];
  const CYCLE = 13.4;
  const CORE = 0xff8a00, HALO = 0xffc24d, CSS = '#e07800';

  LP.GravityFlow = class {
    constructor(view) {
      this.group = new THREE.Group();
      view.scene.add(this.group);
      this.box = new THREE.BoxGeometry(1, 1, 1);
      this.items = [];
      this.captions = [];
      this.clock = 0;
      this.last = null;

      // Caption bar: stage chips (click to jump) and one line saying what is happening.
      this.bar = document.createElement('div');
      this.bar.style.cssText = 'position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:min(640px,calc(100% - 340px));' +
        'background:rgba(255,255,255,.96);border:1px solid #d5dae0;border-radius:8px;padding:6px 10px;font-size:12px;display:none;';
      this.chips = STAGES.map(s => {
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
      view.container.appendChild(this.bar);
    }

    clear() {
      this.group.traverse(o => { if (o.material) o.material.dispose(); });
      this.group.clear();
      this.items = [];
      this.bar.style.display = 'none';
    }

    // One glowing piece: a bright core box inside a faint, larger halo box. `pose(p)` gets the
    // stage's progress p (0..1) and returns a plan-aligned box { x0, x1, y0, y1, z0, z1, a } or null.
    add(stage, strength, pose) {
      const mat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false });
      const core = new THREE.Mesh(this.box, mat(CORE, 0.9)), halo = new THREE.Mesh(this.box, mat(HALO, 0.3));
      core.renderOrder = 8;
      halo.renderOrder = 7;
      this.group.add(halo, core);
      this.items.push({ stage, strength: 0.55 + 0.45 * Math.min(1, strength), pose, core, halo });
    }

    /**
     * Build the glow for one level of an analysed building.
     * @param {number} li level index whose load is followed down to the footings
     */
    build(b, li) {
      this.clear();
      this.clock = 0;
      this.bar.style.display = '';
      const lv = b.levels[li], t = lv.tag, z = lv.elev, w = lv.dead + lv.live;
      const G = id => b.members[id] && b.members[id].results.gravity;
      const maxOf = type => Math.max(...Object.values(b.members).filter(m => m.type === type && m.level === li).map(m => m.results.gravity.value), 1e-9);
      const thin = 0.28, beamW = 0.55, girderW = 0.8, colW = 0.7;

      // 1. Deck: between each pair of neighbouring beams, a strip as long as the bay starts at
      //    mid-span and slides out to both beams.
      b.yLabels.slice(0, -1).forEach((_, by) => {
        const y0 = b.ys[by] + 0.4, y1 = b.ys[by + 1] - 0.4;
        b.beamXs.slice(0, -1).forEach((xa, k) => {
          const xb = b.beamXs[k + 1], xm = (xa + xb) / 2;
          [xa, xb].forEach(target => this.add(0, 1, p => {
            const x = xm + (target - xm) * ease(p);
            return { x0: x - thin, x1: x + thin, y0, y1, z0: z + 0.3, z1: z + 0.5, a: 0.4 + 0.6 * p };
          }));
        });
      });

      // 2. Beams: on arrival the beam glows along its length, then the two halves slide from the
      //    middle to the ends (the end reactions).
      const bMax = maxOf('beam');
      b.beamXs.forEach(x => b.yLabels.slice(0, -1).forEach((_, by) => {
        const g = G(`BM-${t}-${x}-${by}`);
        if (!g || g.value <= 1e-9) return;
        const y0 = b.ys[by], y1 = b.ys[by + 1], ym = (y0 + y1) / 2;
        [[y0, -1], [y1, 1]].forEach(([end]) => this.add(1, g.value / bMax, p => {
          const q = ease(ramp(p, 0.25, 1)), inner = ym + (end - ym) * q;
          const lo = Math.min(inner, end), hi = Math.max(inner, end), pad = q > 0.97 ? beamW * 1.6 : 0;
          return { x0: x - beamW - pad, x1: x + beamW + pad, y0: lo - pad, y1: hi + pad, z0: z - 0.9, z1: z + 0.2, a: 0.5 + 0.5 * q };
        }));
      }));

      // 3. Girders: same idea along each girder, from the middle to the columns.
      const gMax = maxOf('girder');
      b.yLabels.forEach((yl, j) => b.xs.slice(0, -1).forEach((x0, bx) => {
        const g = G(`GD-${t}-${yl}-${bx}`);
        if (!g || g.value <= 1e-9) return;
        const x1 = b.xs[bx + 1], xm = (x0 + x1) / 2, y = b.ys[j];
        [x0, x1].forEach(end => this.add(2, g.value / gMax, p => {
          const q = ease(ramp(p, 0.25, 1)), inner = xm + (end - xm) * q;
          const lo = Math.min(inner, end), hi = Math.max(inner, end), pad = q > 0.97 ? girderW * 1.4 : 0;
          return { x0: lo - pad, x1: hi + pad, y0: y - girderW - pad, y1: y + girderW + pad, z0: z - 1.3, z1: z + 0.2, a: 0.5 + 0.5 * q };
        }));
      }));

      // 4. Columns: a pulse runs down from this level to grade, growing with the load picked up.
      const ftgMax = Math.max(...Object.values(b.members).filter(m => m.type === 'footing').map(m => m.results.gravity.value), 1e-9);
      b.xs.forEach((x, i) => b.ys.forEach((y, j) => {
        const pt = LP.gridPoint(b, i, j), g = G(`FTG-${pt}`);
        if (!g || g.value <= 1e-9) return;
        this.add(3, g.value / ftgMax, p => {
          const lead = z * (1 - ease(p)), tail = Math.min(z, lead + Math.max(3, z * 0.35));
          return { x0: x - colW, x1: x + colW, y0: y - colW, y1: y + colW, z0: lead, z1: tail, a: 1 };
        });
        // 5. Footings: a pulse spreading out at grade.
        this.add(4, g.value / ftgMax, p => {
          const s = 2.5 + 2.5 * ease(p);
          return { x0: x - s, x1: x + s, y0: y - s, y1: y + s, z0: -0.3, z1: 0.3, a: 1 - 0.6 * p };
        });
      }));

      // Captions, with numbers from the analysis.
      const heaviest = type => Object.values(b.members).filter(m => m.type === type && (type === 'footing' || m.level === li))
        .reduce((best, m) => (!best || m.results.gravity.value > best.results.gravity.value ? m : best), null);
      const bm = heaviest('beam'), gd = heaviest('girder'), ft = heaviest('footing');
      const spacing = b.beamXs.length > 1 ? b.beamXs[1] - b.beamXs[0] : 0;
      this.captions = [
        `${lv.name} deck: ${w} psf (D + L). The deck spans ${r1(spacing)} ft between beams, so each beam takes the strip halfway to its neighbours.`,
        bm ? `Each beam carries its strip to its two ends. Heaviest: ${bm.label}, ${r1(bm.results.gravity.reaction)} k at each end.` : '',
        gd ? `Girders collect the filler beam reactions and hand them to the columns. Heaviest: ${gd.label}, ${r1(gd.results.gravity.value)} k total.` : 'No girders carry load at this level.',
        `Columns add the load from every level above as it travels down to grade.`,
        ft ? `Footings spread the column load into the soil. Heaviest: ${ft.label}, ${r1(ft.results.gravity.value)} k.` : ''
      ];
    }

    // Advance the stage clock and pose every piece; called from the scene's render loop.
    tick(time) {
      const dt = this.last === null ? 0 : (time - this.last) / 1000;
      this.last = time;
      if (!this.items.length) return;
      this.clock += dt;
      const cyc = this.clock % CYCLE, endAll = STAGES.at(-1).end;
      const alpha = STAGES.map(s => ramp(cyc, s.start, s.start + 0.3) * (1 - ramp(cyc, s.end - 0.4, s.end)));
      const prog = STAGES.map(s => ramp(cyc, s.start, s.end - 0.4));
      this.items.forEach(it => {
        const a0 = alpha[it.stage], box = a0 > 0 ? it.pose(prog[it.stage]) : null;
        const on = !!box && box.x1 > box.x0 && box.y1 > box.y0 && box.z1 > box.z0;
        it.core.visible = it.halo.visible = on;
        if (!on) return;
        const c = LP.toWorld({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, z: (box.z0 + box.z1) / 2 });
        const sx = box.x1 - box.x0, sy = box.y1 - box.y0, sz = box.z1 - box.z0;
        it.core.position.copy(c);
        it.core.scale.set(sx, sz, sy);
        it.halo.position.copy(c);
        it.halo.scale.set(sx + 1.6, sz + 0.8, sy + 1.6);
        const a = a0 * box.a * it.strength;
        it.core.material.opacity = a;
        it.halo.material.opacity = 0.45 * a;
      });
      const cur = STAGES.reduce((c, s, i) => (cyc >= s.start ? i : c), -1), done = cyc > endAll;
      this.chips.forEach((chip, i) => {
        const on = !done && i === cur;
        chip.style.background = on ? CSS : '#eceff3';
        chip.style.color = on ? '#fff' : '#5d6875';
      });
      this.text.textContent = done ? 'Starting again…' : this.captions[cur];
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
