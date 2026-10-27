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
      type: $('latType').value, dir: $('latDir').value, mode: $('latMode').value,
      windPressure: +$('windPressure').value, Cs: +$('Cs').value,
      riskCategory: $('riskCategory').value, SDS: +$('SDS').value, SD1: +$('SD1').value,
      system: $('system').value, windSpeed: +$('windSpeed').value, exposure: $('exposure').value,
      accidentalTorsion: $('accidentalTorsion').checked, diaphragm: $('diaphragm').value
    });
    return inputs;
  };

  // Only the boxes for the chosen input mode are shown, so nobody edits a value that isn't used.
  const showModeInputs = () => {
    const asce7 = $('latMode').value === 'asce7';
    $('asce7Inputs').style.display = asce7 ? '' : 'none';
    $('overrideInputs').style.display = asce7 ? 'none' : '';
  };

  // An imported model has geometry but no analysis: gravity.js and lateral.js address members by
  // generated ids (COL-B2-L2, BM-L2-10-0) and read b.beamXs, none of which an imported building has.
  // Teaching that to the analysis engines is role 4 and 6 work - see docs/import-and-editing.md.
  // Until then an import draws, and says plainly that the load path is not calculated.
  const importPanel = b => {
    const s = b.importSummary, counts = Object.entries(s.counts)
      .map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ');
    const why = b.analysisReady
      ? '<p>A grid was found, so this model is ready for analysis once the engines read imported ' +
        'geometry. Today they only read the generated grid model.</p>'
      : `<p><b>No load path shown.</b> ${LP.round(b.regularity * 100, 0)}% of column positions line up ` +
        'into a grid, below the 60% this tool needs for tributary-area analysis.</p>';
    return `<h2>Imported model</h2>
      <p class="big">${s.total} elements</p>
      <p>${counts}</p>
      <h3>What was found</h3>
      <ul>
        <li>Grid: <b>${s.grids}</b> lines</li>
        <li>Levels: <b>${s.levels}</b></li>
        <li>Overall size: <b>${s.size}</b></li>
        <li>Regularity: <b>${LP.round(b.regularity * 100, 0)}%</b></li>
      </ul>
      <p class="muted">Check the overall size against the real building. If it is out by about 3.3x
      or 12x, the file's units were read wrongly.</p>
      ${why}
      <p class="muted">Grey members sit off the inferred grid.</p>`;
  };

  const showPanel = id => {
    const b = state.b;
    if (b.fromImport) {
      $('panel').innerHTML = id ? LP.explain(b, id, state.mode) : importPanel(b);
      $('warnings').innerHTML = b.warnings.map(w => `<div class="warn">${w}</div>`).join('');
      return;
    }
    if (!id) {
      const total = Object.values(b.members).filter(m => m.type === 'footing').reduce((s, m) => s + m.results.gravity.value, 0);
      const V = b.levels.reduce((s, lv) => s + b.members[`LAT-${lv.tag}`].results.lateral.value, 0);
      $('panel').innerHTML = `
        <h2>${state.mode === 'gravity' ? 'Gravity load path' : 'Lateral load path'}</h2>
        <p>${state.mode === 'gravity'
          ? 'Load starts on the deck, goes to the filler beams, then the girders, then the columns, and ends at the footings. Moving dots show the flow; color shows force (blue light, red heavy).'
          : `${b.inputs.lateral.type === 'wind' ? 'Wind' : 'Seismic'} load in the ${b.inputs.lateral.dir.toUpperCase()} direction goes into each floor diaphragm, along the collectors into the shear walls, and down to the wall footings.</p>
          <p>The floor acts like a deep beam lying flat. Its <b style="color:#2b7bba">shear</b> and <b style="color:#d9822b">moment</b> diagrams are drawn on the roof, or on the level of the member you click; <b style="color:#9b59b6">collector</b> force is drawn as a fence along each wall line. Switch the diaphragm between flexible and rigid to see them change.`}</p>
        <p><b>Total gravity load:</b> ${LP.round(total, 1)} kips<br><b>Base shear:</b> ${LP.round(V, 1)} kips</p>
        <p class="muted">Click any member to see where its load comes from, where it goes, and the calculation.</p>`;
    } else {
      $('panel').innerHTML = LP.explain(b, id, state.mode);
    }
    $('warnings').innerHTML = b.warnings.map(w => `<div class="warn">${w}</div>`).join('');
  };

  const rebuild = () => {
    // While an imported model is on screen, the bay-grid inputs describe a different building.
    // Silently regenerating from them would throw the user's import away mid-edit.
    if (state.imported) return;
    const inputs = readInputs();
    if (!inputs.xBays.length || !inputs.yBays.length || !inputs.storyHeights.length) return;
    const b = LP.buildModel(inputs);
    LP.runGravity(b);
    LP.runLateral(b);
    // Role 5 sets LP.asce7Ready in lateral.js once storyForces reads the ASCE 7 inputs.
    if (inputs.lateral.mode === 'asce7' && !LP.asce7Ready) {
      b.warnings.push('ASCE 7 inputs are not connected to the analysis yet (role 5 is building it). ' +
        'The story forces still use the Override values: wind ' + inputs.lateral.windPressure +
        ' psf, Cs ' + inputs.lateral.Cs + '.');
    }
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

  const showImported = ({ elements, stats, fileName }) => {
    const b = LP.modelFromElements(elements, readInputs());
    if (!b.levels.length) {
      $('warnings').innerHTML = '<div class="warn">No levels could be found in that model, so there ' +
        'is nothing to draw. It may contain only foundations, or the units may be far off.</div>';
      return;
    }
    if (!stats.confident) {
      b.warnings.unshift(`Length units were not certain — assumed ${stats.unit}. The building ` +
        `measures ${b.importSummary.size}; if that is wrong the units were misread.`);
    }
    b.importSummary.fileName = fileName;   // shown in the panel; the file itself is long gone
    state.b = b;
    state.imported = true;
    view.build(b);
    showPanel(null);
  };

  const view = new LP.Scene($('view'));
  view.onSelect = showPanel;
  new LP.DropZone($('drop'), showImported);
  $('useInputs').addEventListener('click', () => { state.imported = false; rebuild(); });
  document.querySelectorAll('#controls input, #controls select').forEach(el => el.addEventListener('change', rebuild));
  document.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => setMode(el.dataset.mode)));
  $('latDir').addEventListener('change', () => setMode('lateral'));
  $('diaphragm').addEventListener('change', () => setMode('lateral'));
  $('latMode').addEventListener('change', () => { showModeInputs(); setMode('lateral'); });
  $('flow').addEventListener('change', e => { view.overlay.showFlow = e.target.checked; view.refresh(); });
  $('diagrams').addEventListener('change', e => { view.overlay.showDiagrams = e.target.checked; view.refresh(); });
  $('clear').addEventListener('click', () => view.select(null));
  $('panel').addEventListener('click', e => {
    const id = e.target.dataset && e.target.dataset.id;
    if (id) { e.preventDefault(); view.select(id); }
  });

  showModeInputs();
  rebuild();
  setMode('gravity');
})(window);
