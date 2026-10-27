// App shell (owner: role 1, lead / integrator): reads inputs, runs the analysis, drives the scene and panel.
(function (root) {
  const LP = root.LP;
  const $ = id => document.getElementById(id);
  const nums = s => s.split(/[,\s]+/).map(Number).filter(v => v > 0);
  const state = { mode: 'gravity', b: null };

  const readInputs = () => {
    const inputs = LP.defaultInputs();
    inputs.xBays = nums($('xBays').value);
    inputs.yBays = nums($('yBays').value);
    inputs.storyHeights = nums($('stories').value);
    inputs.beamSpaces = Math.max(1, Math.round(+$('beamSpaces').value));
    ['floorDead', 'floorLive', 'roofDead', 'roofLive'].forEach(k => { inputs[k] = +$(k).value; });
    inputs.wallPreset = $('wallPreset').value;
    Object.assign(inputs.lateral, {
      type: $('latType').value, dir: $('latDir').value, windPressure: +$('windPressure').value,
      Cs: +$('Cs').value, diaphragm: $('diaphragm').value
    });
    return inputs;
  };

  const showPanel = id => {
    const b = state.b;
    if (!id) {
      const total = Object.values(b.members).filter(m => m.type === 'footing').reduce((s, m) => s + m.results.gravity.value, 0);
      const V = b.levels.reduce((s, lv) => s + b.members[`LAT-${lv.tag}`].results.lateral.value, 0);
      $('panel').innerHTML = `
        <h2>${state.mode === 'gravity' ? 'Gravity load path' : 'Lateral load path'}</h2>
        <p>${state.mode === 'gravity'
          ? 'Load starts on the deck, goes to the filler beams, then the girders, then the columns, and ends at the footings. Moving dots show the flow; color shows force (blue light, red heavy).'
          : `${b.inputs.lateral.type === 'wind' ? 'Wind' : 'Seismic'} load in the ${b.inputs.lateral.dir.toUpperCase()} direction goes into each floor diaphragm, along the collectors into the shear walls, and down to the wall footings.`}</p>
        <p><b>Total gravity load:</b> ${LP.round(total, 1)} kips<br><b>Base shear:</b> ${LP.round(V, 1)} kips</p>
        <p class="muted">Click any member to see where its load comes from, where it goes, and the calculation.</p>`;
    } else {
      $('panel').innerHTML = LP.explain(b, id, state.mode);
    }
    $('warnings').innerHTML = b.warnings.map(w => `<div class="warn">${w}</div>`).join('');
  };

  const rebuild = () => {
    const inputs = readInputs();
    if (!inputs.xBays.length || !inputs.yBays.length || !inputs.storyHeights.length) return;
    const b = LP.buildModel(inputs);
    LP.runGravity(b);
    LP.runLateral(b);
    state.b = b;
    view.build(b);
    showPanel(view.selected);
  };

  const setMode = mode => {
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(el => el.classList.toggle('on', el.dataset.mode === mode));
    view.setMode(mode);
    showPanel(view.selected);
  };

  const view = new LP.Scene($('view'));
  view.onSelect = showPanel;
  document.querySelectorAll('#controls input, #controls select').forEach(el => el.addEventListener('change', rebuild));
  document.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => setMode(el.dataset.mode)));
  $('latDir').addEventListener('change', () => setMode('lateral'));
  $('diaphragm').addEventListener('change', () => setMode('lateral'));
  $('flow').addEventListener('change', e => { view.overlay.showFlow = e.target.checked; view.refresh(); });
  $('clear').addEventListener('click', () => view.select(null));
  $('panel').addEventListener('click', e => {
    const id = e.target.dataset && e.target.dataset.id;
    if (id) { e.preventDefault(); view.select(id); }
  });

  rebuild();
  setMode('gravity');
})(window);
