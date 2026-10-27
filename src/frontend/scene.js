// 3D scene (owner: role 2, 3D scene). Builds a mesh per member, handles orbit, picking and highlight.
// World axes: Three.js x = plan x, Three.js y = elevation, Three.js z = -plan y (north is away from the viewer).
(function (root) {
  const LP = root.LP = root.LP || {};
  LP.toWorld = p => new THREE.Vector3(p.x, p.z, -p.y);

  const STYLE = {
    column: { size: 1.2, color: 0x8a8f98 },
    beam: { size: 0.6, color: 0x9aa3ad },
    girder: { size: 1.0, color: 0x7d8792 },
    deck: { color: 0xc8d3dc, opacity: 0.35 },
    footing: { color: 0xa08c74 },
    wall: { color: 0x5b8bd0, opacity: 0.55 },
    wallFooting: { color: 0xa08c74 },
    diaphragm: { color: 0x6fa8dc, opacity: 0.2 },
    chord: { size: 0.9, color: 0xd9822b },
    collector: { size: 0.9, color: 0x9b59b6 }
  };

  // Which member types take part in each mode. Ghosted types stay as faint context.
  LP.MODE_TYPES = {
    gravity: { active: ['deck', 'beam', 'girder', 'column', 'footing'], ghost: ['wall', 'wallFooting'] },
    lateral: { active: ['diaphragm', 'chord', 'collector', 'wall', 'wallFooting', 'storyForce'], ghost: ['beam', 'girder', 'column', 'footing'] }
  };

  LP.Scene = class {
    constructor(container) {
      this.container = container;
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xf4f5f7);
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 3000);
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, 0.55);
      sun.position.set(120, 220, 160);
      this.scene.add(sun);
      this.group = new THREE.Group();
      this.scene.add(this.group);
      this.meshes = {};
      this.mode = 'gravity';
      this.selected = null;
      this.traced = null;
      this.onSelect = null;
      this.raycaster = new THREE.Raycaster();
      this.overlay = new LP.Overlay(this);

      let down = null;
      const el = this.renderer.domElement;
      el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
      el.addEventListener('pointerup', e => {
        if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) this.pick(e);
        down = null;
      });
      window.addEventListener('resize', () => this.resize());
      this.resize();
      const loop = t => {
        requestAnimationFrame(loop);
        this.controls.update();
        this.overlay.tick(t);
        this.renderer.render(this.scene, this.camera);
      };
      requestAnimationFrame(loop);
    }

    resize() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    // Box sized and placed for one member. storyForce has no mesh: the overlay draws it as an arrow.
    meshFor(m) {
      const s = STYLE[m.type];
      if (!s) return null;
      const a = m.a, c = m.b, len = Math.hypot(c.x - a.x, c.y - a.y), alongX = Math.abs(c.y - a.y) < 1e-6;
      let geo, mid = LP.center(m);
      switch (m.type) {
        case 'column':
          geo = new THREE.BoxGeometry(s.size, c.z - a.z, s.size); break;
        case 'beam': case 'girder':
          geo = alongX ? new THREE.BoxGeometry(len, s.size, s.size) : new THREE.BoxGeometry(s.size, s.size, len);
          mid = Object.assign({}, mid, { z: a.z - s.size / 2 - 0.2 }); break;
        case 'chord': case 'collector':
          geo = alongX ? new THREE.BoxGeometry(len, s.size, s.size) : new THREE.BoxGeometry(s.size, s.size, len);
          mid = Object.assign({}, mid, { z: a.z + (m.type === 'chord' ? 0.8 : 1.6) }); break;
        case 'deck': case 'diaphragm':
          geo = new THREE.BoxGeometry(c.x - a.x, 0.3, c.y - a.y);
          mid = Object.assign({}, mid, { z: a.z + 0.15 }); break;
        case 'footing':
          geo = new THREE.BoxGeometry(5, 2, 5); mid = Object.assign({}, mid, { z: -1 }); break;
        case 'wall':
          geo = alongX ? new THREE.BoxGeometry(len, c.z - a.z - 0.2, 0.8) : new THREE.BoxGeometry(0.8, c.z - a.z - 0.2, len); break;
        case 'wallFooting':
          geo = alongX ? new THREE.BoxGeometry(len + 2, 1.5, 3) : new THREE.BoxGeometry(3, 1.5, len + 2);
          mid = Object.assign({}, mid, { z: -0.75 }); break;
      }
      const mat = new THREE.MeshLambertMaterial({ color: s.color, transparent: true, opacity: s.opacity || 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(LP.toWorld(mid));
      mesh.userData = { id: m.id, type: m.type, baseColor: s.color, baseOpacity: s.opacity || 1 };
      return mesh;
    }

    build(b) {
      const reframe = !this.b || this.b.Lx !== b.Lx || this.b.Ly !== b.Ly;
      this.b = b;
      this.group.clear();
      this.meshes = {};
      Object.values(b.members).forEach(m => {
        const mesh = this.meshFor(m);
        if (mesh) { this.meshes[m.id] = mesh; this.group.add(mesh); }
      });
      if (this.selected && !b.members[this.selected]) this.selected = null;
      if (reframe) this.frame();
      this.refresh();
    }

    frame() {
      const b = this.b, H = b.levels.at(-1).elev, size = Math.max(b.Lx, b.Ly, H);
      const target = LP.toWorld({ x: b.Lx / 2, y: b.Ly / 2, z: H / 2 });
      this.controls.target.copy(target);
      this.camera.position.copy(target.clone().add(new THREE.Vector3(-1.1 * size, 0.8 * size, 1.4 * size)));
    }

    setMode(mode) { this.mode = mode; this.refresh(); }

    select(id) {
      this.selected = id;
      this.refresh();
      if (this.onSelect) this.onSelect(id);
    }

    // Re-apply visibility, force colors, trace highlight and overlay for the current mode and selection.
    refresh() {
      const b = this.b, mode = this.mode, types = LP.MODE_TYPES[mode];
      this.traced = this.selected ? LP.trace(b, this.selected, mode) : null;
      const max = {};
      Object.values(b.members).forEach(m => {
        const v = m.results[mode] ? Math.abs(m.results[mode].value) : 0;
        max[m.type] = Math.max(max[m.type] || 0, v);
      });
      Object.values(this.meshes).forEach(mesh => {
        const { id, type, baseColor, baseOpacity } = mesh.userData, m = b.members[id], mat = mesh.material;
        const active = types.active.includes(type), ghost = types.ghost.includes(type);
        mesh.visible = active || ghost;
        mat.emissive.setHex(0x000000);
        if (ghost) { mat.color.setHex(0xb8bec6); mat.opacity = 0.12; }
        else if (active) {
          const v = m.results[mode] ? Math.abs(m.results[mode].value) : 0;
          mat.color.copy(v > 1e-9 ? LP.forceColor(v / (max[type] || 1)) : new THREE.Color(0xc9ced6)); // gray = no force in this mode
          mat.opacity = baseOpacity;
          if (this.traced && !this.traced.members.has(id)) mat.opacity = Math.min(baseOpacity, 0.18);
        }
        if (id === this.selected) { mat.emissive.setHex(0x664400); mat.opacity = Math.max(mat.opacity, 0.8); }
        mat.depthWrite = mat.opacity > 0.5;
      });
      this.overlay.update(b, mode, this.traced, this.selected);
    }

    pick(e) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const ghosts = LP.MODE_TYPES[this.mode].ghost;
      const targets = Object.values(this.meshes).filter(o => o.visible && !ghosts.includes(o.userData.type)).concat(this.overlay.pickables);
      const hit = this.raycaster.intersectObjects(targets, true).find(h => h.object.userData.id || (h.object.parent && h.object.parent.userData.id));
      const id = hit ? (hit.object.userData.id || hit.object.parent.userData.id) : null;
      this.select(id);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
