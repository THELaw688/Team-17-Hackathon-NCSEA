// Load graphics layer (owner: role 3, 3D load graphics): force colors, arrows, labels, load flow animation.
(function (root) {
  const LP = root.LP = root.LP || {};

  // t = 0 (light, blue) ... 1 (heaviest member of its type, red)
  LP.forceColor = t => new THREE.Color().setHSL(0.6 * (1 - Math.min(1, Math.max(0, t))), 0.75, 0.5);

  LP.Overlay = class {
    constructor(view) {
      this.view = view;
      this.group = new THREE.Group();
      view.scene.add(this.group);
      this.particles = [];
      this.pickables = [];
      this.showFlow = true;
      this.showDiagrams = true;
      this.dot = new THREE.SphereGeometry(1, 10, 8);
    }

    clear() {
      this.group.traverse(o => {
        if (o.geometry && o.geometry !== this.dot) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      this.group.clear();
      this.particles = [];
      this.pickables = [];
    }

    label(text, pos, scale = 1) {
      const c = document.createElement('canvas'), g = c.getContext('2d'), font = '600 30px system-ui, sans-serif';
      g.font = font;
      c.width = Math.ceil(g.measureText(text).width) + 28;
      c.height = 48;
      g.font = font;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = '#8a95a3';
      g.strokeRect(1, 1, c.width - 2, c.height - 2);
      g.fillStyle = '#1d2733';
      g.textBaseline = 'middle';
      g.fillText(text, 14, 25);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
      sp.scale.set(c.width / 48 * 2.2 * scale, 2.2 * scale, 1);
      sp.position.copy(pos);
      sp.renderOrder = 10;
      this.group.add(sp);
    }

    /**
     * Redraw arrows, labels and flow dots.
     * @param {object} traced result of LP.trace, or null to animate every path in the mode
     */
    update(b, mode, traced, selected) {
      this.clear();
      const k = v => `${LP.round(v, 1)} k`;
      const res = id => b.members[id].results[mode];

      if (mode === 'lateral') {
        const dir = b.inputs.lateral.dir, dv = dir === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
        const lats = b.levels.map(lv => b.members[`LAT-${lv.tag}`]);
        const maxF = Math.max(...lats.map(m => m.results.lateral.value), 1e-9);
        lats.forEach((m, li) => {
          const F = m.results.lateral.value, len = 6 + 14 * F / maxF, z = b.levels[li].elev;
          const face = this.storyFace(b, li);
          const tail = { x: face.x - dv.x * (len + 2), y: face.y - dv.y * (len + 2), z };
          // Labels share one spot just past the longest arrow, stepped up the page (plan y) per level,
          // so they never sit on top of each other in plan view whichever way the load runs.
          const step = (li - (lats.length - 1) / 2) * 3;
          const arrow = new THREE.ArrowHelper(LP.toWorld({ x: dv.x, y: dv.y, z: 0 }).normalize(), LP.toWorld(tail), len, 0xd62728, 3, 2);
          arrow.userData.id = m.id;
          arrow.line.material.linewidth = 2;
          this.group.add(arrow);
          this.pickables.push(arrow);
          this.label(`${b.levels[li].name}: ${k(F)}`, LP.toWorld({ x: face.x - dv.x * 25, y: face.y - dv.y * 25 + step, z: z + 2 }), 0.9);
        });
        b.walls.forEach(w => {
          const base = b.members[`${w.id}-${b.levels[0].tag}`];
          if (base.results.lateral.value > 1e-9) this.label(`${w.id} base V = ${k(base.results.lateral.value)}`, LP.toWorld(Object.assign(LP.center(base), { z: -4 })));
        });
      } else {
        Object.values(b.members).filter(m => m.type === 'footing').forEach(m =>
          this.label(k(m.results.gravity.value), LP.toWorld({ x: m.a.x, y: m.a.y, z: -4.5 }), 0.8));
      }
      if (mode === 'lateral' && this.showDiagrams) {
        // Diagrams go on the selected member's level, or the roof when nothing is selected.
        const m = selected && b.members[selected];
        this.diagrams(b, m && m.level !== undefined ? m.level : b.levels.length - 1);
      }
      if (selected && res(selected)) {
        const c = LP.center(b.members[selected]);
        this.label(`${b.members[selected].label}: ${k(res(selected).value)}`, LP.toWorld(Object.assign({}, c, { z: c.z + 4 })), 1.1);
      }

      // Load flow: one moving dot per path, from the member giving load to the connection point.
      if (!this.showFlow) return;
      const paths = (traced ? traced.paths : b.paths.filter(p => p.mode === mode && Math.abs(p.value) > 1e-9)).slice(0, 1200);
      const maxV = Math.max(...paths.map(p => Math.abs(p.value)), 1e-9);
      paths.forEach((p, i) => {
        const from = b.members[p.from];
        let start = LP.center(from), end = p.at;
        if (from.type === 'storyForce') {
          const dir = b.inputs.lateral.dir;
          end = this.storyFace(b, from.level);
          start = { x: end.x - (dir === 'x' ? 14 : 0), y: end.y - (dir === 'y' ? 14 : 0), z: end.z };
        }
        const t = Math.abs(p.value) / maxV;
        const dot = new THREE.Mesh(this.dot, new THREE.MeshBasicMaterial({ color: LP.forceColor(t), depthTest: false, transparent: true }));
        dot.scale.setScalar(0.3 + 0.6 * Math.sqrt(t));
        dot.renderOrder = 5;
        this.group.add(dot);
        this.particles.push({ dot, a: LP.toWorld(start), b: LP.toWorld(end), offset: (i * 0.618) % 1 });
      });
    }

    // Where a level's story force arrow meets the windward face: the middle of the bay nearest the
    // center, not on a grid line, so its label clears the grid bubbles.
    storyFace(b, li) {
      const dir = b.inputs.lateral.dir, lines = dir === 'x' ? b.ys : b.xs, depth = lines.at(-1), z = b.levels[li].elev;
      const mid = lines.slice(0, -1).map((v, i) => (v + lines[i + 1]) / 2)
        .reduce((best, c) => Math.abs(c - depth / 2) < Math.abs(best - depth / 2) ? c : best);
      return dir === 'x' ? { x: 0, y: mid, z } : { x: mid, y: 0, z };
    }

    // Filled diagram between a baseline and its ordinates; base(pt) and tip(pt) return plan points.
    ribbon(pts, base, tip, color) {
      const pos = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const b0 = LP.toWorld(base(pts[i])), b1 = LP.toWorld(base(pts[i + 1]));
        const t0 = LP.toWorld(tip(pts[i])), t1 = LP.toWorld(tip(pts[i + 1]));
        [b0, t0, t1, b0, t1, b1].forEach(v => pos.push(v.x, v.y, v.z));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthTest: false }));
      const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => LP.toWorld(tip(p)))),
        new THREE.LineBasicMaterial({ color, depthTest: false }));
      const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([LP.toWorld(base(pts[0])), LP.toWorld(base(pts.at(-1)))]),
        new THREE.LineBasicMaterial({ color: 0x5d6875, depthTest: false }));
      [fill, edge, axis].forEach(o => { o.renderOrder = 4; this.group.add(o); });
    }

    /**
     * Diaphragm shear and moment drawn flat on one floor, chord tension / compression at the
     * point of max moment, and collector force drawn as an upright fence along each wall line.
     * @param {number} li level index
     */
    diagrams(b, li) {
      const d = LP.diaphragmDiagram(b, li);
      if (!d || !d.lines.length) return;
      const dir = b.inputs.lateral.dir, lv = b.levels[li], z = lv.elev + 2.5, k = v => LP.round(v, 1);
      // Plan point from position s along the span and offset o in the direction of the load.
      const P = (s, o, h = 0) => dir === 'x' ? { x: o, y: s, z: z + h } : { x: s, y: o, z: z + h };
      const oV = 0.25 * d.len, oM = 0.55 * d.len;
      const kV = 0.16 * d.len / (d.Vmax || 1), kM = 0.3 * d.len / (Math.abs(d.Mext) || 1);
      this.ribbon(d.pts, p => P(p.s, oV), p => P(p.s, oV + kV * p.V), 0x2b7bba);
      this.ribbon(d.pts, p => P(p.s, oM), p => P(p.s, oM + kM * p.M), 0xd9822b);
      // Titles sit past the far end of the diaphragm, where there are no grid bubbles, one row each.
      this.label(`${lv.name} diaphragm shear: max ${k(d.Vmax)} k (${LP.round(d.Vmax / d.len * 1000, 0)} plf)`, LP.toWorld(P(d.depth + 7, oV)), 0.85);
      this.label(`${lv.name} diaphragm moment: max ${k(Math.abs(d.Mext))} kip-ft${d.twisted ? ' (includes twist resisted by perpendicular walls)' : ''}`, LP.toWorld(P(d.depth + 13, oM)), 0.85);

      // Positive moment bows the diaphragm downwind, stretching the leeward chord.
      const T = Math.abs(d.Mext) / d.len, leeTension = d.Mext > 0;
      // Labels sit past the far end of each chord edge, clear of the story force arrows and grid bubbles.
      this.label(`Max chord ${leeTension ? 'tension' : 'compression'} ${k(T)} k`, LP.toWorld(P(d.depth + 7, d.len)), 0.85);
      this.label(`Max chord ${leeTension ? 'compression' : 'tension'} ${k(T)} k`, LP.toWorld(P(d.depth + 7, 0)), 0.85);

      const cols = b.wallLines.filter(l => l.dir === dir).map(l => ({ l, c: LP.collectorDiagram(b, li, l) })).filter(x => x.c && x.c.Fmax > 1e-6);
      const Fmax = Math.max(...cols.map(x => x.c.Fmax), 1e-9);
      cols.forEach(({ l, c }) => {
        const Q = (s, h) => l.dir === 'x' ? { x: s, y: l.at, z: z + h } : { x: l.at, y: s, z: z + h };
        this.ribbon(c.pts, p => Q(p.s, 0), p => Q(p.s, 7 * p.F / Fmax), 0x9b59b6);
        this.label(`Collector ${k(c.Fmax)} k`, LP.toWorld(Q(c.sAtF, 9)), 0.8);
      });
    }

    tick(time) {
      this.particles.forEach(p => p.dot.position.lerpVectors(p.a, p.b, (time / 1000 * 0.45 + p.offset) % 1));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
