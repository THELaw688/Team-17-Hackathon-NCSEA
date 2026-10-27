// TEST ONLY (loaded by gravity-flow-test.html): swaps the gravity flow dots for the glowing strips in
// gravity-flow.js without changing overlay.js. If the team keeps the glow, this hook goes away and
// overlay.js calls LP.GravityFlow directly, the way it calls LP.LateralArrows.
(function (root) {
  const LP = root.LP;
  const update = LP.Overlay.prototype.update, tick = LP.Overlay.prototype.tick;

  LP.Overlay.prototype.update = function (b, mode, traced, selected, elevation) {
    update.apply(this, arguments);
    if (!this.gravityFlow) this.gravityFlow = new LP.GravityFlow(this.view);
    this.gravityFlow.clear();
    if (mode !== 'gravity' || !this.showFlow || b.fromImport) return;
    // Remove the dots overlay.js just drew; the glow replaces them.
    this.particles.forEach(p => { this.group.remove(p.dot); p.dot.material.dispose(); });
    this.particles = [];
    const m = selected && b.members[selected];
    this.gravityFlow.build(b, m && m.level !== undefined ? m.level : b.levels.length - 1);
  };

  LP.Overlay.prototype.tick = function (time) {
    tick.call(this, time);
    if (this.gravityFlow) this.gravityFlow.tick(time);
  };
})(window);
