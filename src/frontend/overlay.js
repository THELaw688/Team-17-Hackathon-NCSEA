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
      this.dot = new THREE.SphereGeometry(1, 10, 8);
    }

    clear() {
      this.group.traverse(o => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
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
          const face = dir === 'x' ? { x: 0, y: b.Ly / 2, z } : { x: b.Lx / 2, y: 0, z };
          const tail = { x: face.x - dv.x * (len + 2), y: face.y - dv.y * (len + 2), z };
          const arrow = new THREE.ArrowHelper(LP.toWorld({ x: dv.x, y: dv.y, z: 0 }).normalize(), LP.toWorld(tail), len, 0xd62728, 3, 2);
          arrow.userData.id = m.id;
          arrow.line.material.linewidth = 2;
          this.group.add(arrow);
          this.pickables.push(arrow);
          this.label(`${b.levels[li].name}: ${k(F)}`, LP.toWorld({ x: tail.x - dv.x * 6, y: tail.y - dv.y * 6, z: z + 2 }), 0.9);
        });
        b.walls.forEach(w => {
          const base = b.members[`${w.id}-${b.levels[0].tag}`];
          if (base.results.lateral.value > 1e-9) this.label(`${w.id} base V = ${k(base.results.lateral.value)}`, LP.toWorld(Object.assign(LP.center(base), { z: -4 })));
        });
      } else {
        Object.values(b.members).filter(m => m.type === 'footing').forEach(m =>
          this.label(k(m.results.gravity.value), LP.toWorld({ x: m.a.x, y: m.a.y, z: -4.5 }), 0.8));
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
        let start = LP.center(from);
        if (from.type === 'storyForce') {
          const dir = b.inputs.lateral.dir;
          start = { x: p.at.x - (dir === 'x' ? 14 : 0), y: p.at.y - (dir === 'y' ? 14 : 0), z: p.at.z };
        }
        const t = Math.abs(p.value) / maxV;
        const dot = new THREE.Mesh(this.dot, new THREE.MeshBasicMaterial({ color: LP.forceColor(t), depthTest: false, transparent: true }));
        dot.scale.setScalar(0.3 + 0.6 * Math.sqrt(t));
        dot.renderOrder = 5;
        this.group.add(dot);
        this.particles.push({ dot, a: LP.toWorld(start), b: LP.toWorld(p.at), offset: (i * 0.618) % 1 });
      });
    }

    tick(time) {
      this.particles.forEach(p => p.dot.position.lerpVectors(p.a, p.b, (time / 1000 * 0.45 + p.offset) % 1));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
