// App shell (owner: role 1, lead / integrator): reads inputs, runs the analysis, drives the scene and panel.
(function (root) {
  const LP = root.LP;
  const $ = id => document.getElementById(id);
  const nums = s => s.split(/[,\s]+/).map(Number).filter(v => v > 0);
  const state = { mode: 'gravity', b: null };
  let customWalls = [];

  const wallAxisData = axis => {
    const xBays = nums($('xBays').value), yBays = nums($('yBays').value);
    const bays = axis === 'x' ? xBays : yBays;
    const alongBays = axis === 'x' ? yBays : xBays;
    const coords = [0];
    bays.forEach(width => coords.push(coords[coords.length - 1] + width));
    return {
      coords,
      labels: coords.map((_, i) => axis === 'x' ? String(i + 1) : String.fromCharCode(65 + i)),
      length: alongBays.reduce((sum, width) => sum + width, 0)
    };
  };

  const readWallRows = () => Array.from($('wallRows').querySelectorAll('.wall-row')).map(row => ({
    axis: row.querySelector('.wall-axis').value,
    gridIndex: +row.querySelector('.wall-gridline').value,
    start: +row.querySelector('.wall-start').value,
    length: +row.querySelector('.wall-length').value
  }));

  const renderWallRows = () => {
    const container = $('wallRows');
    container.replaceChildren();
    customWalls.forEach((wall, index) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'wall-row';
      const legend = document.createElement('legend');
      legend.textContent = `Shear wall ${index + 1}`;
      fieldset.appendChild(legend);

      const addField = (text, control) => {
        const label = document.createElement('label');
        label.append(text, control);
        fieldset.appendChild(label);
        return control;
      };
      const axis = document.createElement('select');
      axis.className = 'wall-axis';
      axis.add(new Option('X gridline (1, 2...)', 'x'));
      axis.add(new Option('Y gridline (A, B...)', 'y'));
      axis.value = wall.axis;
      addField('Gridline direction', axis);

      const gridline = document.createElement('select');
      gridline.className = 'wall-gridline';
      const data = wallAxisData(wall.axis);
      data.labels.forEach((name, i) => gridline.add(new Option(name, String(i))));
      wall.gridIndex = Math.min(wall.gridIndex, data.labels.length - 1);
      gridline.value = String(wall.gridIndex);
      addField('Gridline', gridline);

      const start = document.createElement('input');
      start.type = 'number';
      start.min = '0';
      start.max = String(data.length);
      start.step = '0.1';
      start.className = 'wall-start';
      start.value = wall.start;
      addField('Start from south/west (ft)', start);

      const length = document.createElement('input');
      length.type = 'number';
      length.min = '0.1';
      length.max = String(data.length);
      length.step = '0.1';
      length.className = 'wall-length';
      length.value = wall.length;
      addField('Wall length (ft)', length);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove wall';
      remove.addEventListener('click', () => {
        customWalls = readWallRows();
        customWalls.splice(index, 1);
        renderWallRows();
        rebuild();
      });
      fieldset.appendChild(remove);
      container.appendChild(fieldset);

      axis.addEventListener('change', () => {
        customWalls = readWallRows();
        customWalls[index].gridIndex = 0;
        renderWallRows();
        rebuild();
      });
      gridline.addEventListener('change', () => {
        customWalls = readWallRows();
        refreshWallControls();
        rebuild();
      });
      [start, length].forEach(input => input.addEventListener('change', () => {
        customWalls = readWallRows();
        refreshWallControls();
        rebuild();
      }));
    });
    refreshWallControls();
  };

  const refreshWallControls = () => {
    const errors = validateWallRows(customWalls);
    $('wallError').textContent = errors.join(' ');
    $('wallError').hidden = !errors.length;
    const full = ['x', 'y'].every(axis => wallAxisData(axis).labels.every((_, gridIndex) =>
      customWalls.filter(wall => wall.axis === axis && wall.gridIndex === gridIndex).length >= 5));
    $('addWall').disabled = full;
  };

  const validateWallRows = walls => {
    const errors = [];
    const groups = new Map();
    walls.forEach((wall, index) => {
      const data = wallAxisData(wall.axis);
      const gridName = data.labels[wall.gridIndex];
      if (!Number.isInteger(wall.gridIndex) || gridName === undefined) {
        errors.push(`Shear wall ${index + 1} needs a valid gridline.`);
        return;
      }
      if (!Number.isFinite(wall.start) || !Number.isFinite(wall.length) ||
          wall.start < 0 || wall.length <= 0 || wall.start + wall.length > data.length + 1e-6) {
        errors.push(`Shear wall ${index + 1} must have a positive length and fit on gridline ${gridName} (0-${data.length} ft).`);
      }
      const key = `${wall.axis}:${wall.gridIndex}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ wall, index, gridName });
    });
    groups.forEach(lineWalls => {
      if (lineWalls.length > 5) errors.push(`Gridline ${lineWalls[0].gridName} can have no more than 5 shear walls.`);
      const ordered = lineWalls.slice().sort((a, b) => a.wall.start - b.wall.start);
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i].wall.start < ordered[i - 1].wall.start + ordered[i - 1].wall.length - 1e-6) {
          errors.push(`Shear walls ${ordered[i - 1].index + 1} and ${ordered[i].index + 1} overlap on gridline ${ordered[i].gridName}.`);
        }
      }
    });
    return errors;
  };

  const addCustomWall = () => {
    customWalls = readWallRows();
    const candidates = ['x', 'y'].flatMap(axis => wallAxisData(axis).labels.map((_, gridIndex) =>
      ({ axis, gridIndex, count: customWalls.filter(wall => wall.axis === axis && wall.gridIndex === gridIndex).length })))
      .filter(line => line.count < 5).sort((a, b) => b.count - a.count);
    for (const line of candidates) {
      const lineLength = wallAxisData(line.axis).length;
      const length = lineLength / 5;
      let start = 0;
      const occupied = customWalls.filter(wall => wall.axis === line.axis && wall.gridIndex === line.gridIndex)
        .sort((a, b) => a.start - b.start);
      for (const wall of occupied) {
        if (wall.start - start >= length - 1e-6) break;
        start = Math.max(start, wall.start + wall.length);
      }
      if (start + length <= lineLength + 1e-6) {
        customWalls.push({ axis: line.axis, gridIndex: line.gridIndex, start, length });
        renderWallRows();
        rebuild();
        return;
      }
    }
  };

  const showWallEditor = () => {
    const custom = $('wallPreset').value === 'custom';
    $('wallEditor').hidden = !custom;
    if (custom) renderWallRows();
  };

  const readInputs = () => {
    const inputs = LP.defaultInputs();
    inputs.xBays = nums($('xBays').value);
    inputs.yBays = nums($('yBays').value);
    inputs.storyHeights = nums($('stories').value);
    inputs.beamSpaces = Math.max(1, Math.round(+$('beamSpaces').value));
    ['floorDead', 'floorLive', 'roofDead', 'roofLive'].forEach(k => { inputs[k] = +$(k).value; });
    inputs.wallPreset = $('wallPreset').value;
    if (inputs.wallPreset === 'custom') {
      inputs.walls = customWalls.map((wall, index) => {
        const data = wallAxisData(wall.axis);
        return {
          id: `CW${index + 1}`,
          name: `Shear wall ${index + 1}`,
          dir: wall.axis === 'x' ? 'y' : 'x',
          at: data.coords[wall.gridIndex],
          from: wall.start,
          to: wall.start + wall.length
        };
      });
    }
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
    if ($('wallPreset').value === 'custom') {
      customWalls = readWallRows();
      const errors = validateWallRows(customWalls);
      $('wallError').textContent = errors.join(' ');
      $('wallError').hidden = !errors.length;
      if (errors.length) return;
    }
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
  document.querySelectorAll('#controls input, #controls select').forEach(el => {
    if (!['xBays', 'yBays', 'wallPreset'].includes(el.id)) el.addEventListener('change', rebuild);
  });
  $('wallPreset').addEventListener('change', () => { showWallEditor(); rebuild(); });
  ['xBays', 'yBays'].forEach(id => $(id).addEventListener('change', () => {
    customWalls = readWallRows();
    renderWallRows();
    rebuild();
  }));
  $('addWall').addEventListener('click', addCustomWall);
  document.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => setMode(el.dataset.mode)));
  $('latDir').addEventListener('change', () => setMode('lateral'));
  $('diaphragm').addEventListener('change', () => setMode('lateral'));
  $('latMode').addEventListener('change', () => { showModeInputs(); setMode('lateral'); });
  $('flow').addEventListener('change', e => { view.overlay.showFlow = e.target.checked; view.refresh(); });
  $('diagrams').addEventListener('change', e => { view.overlay.showDiagrams = e.target.checked; view.refresh(); });
  $('wallStyle').addEventListener('change', e => { view.overlay.wallStyle = e.target.value; setMode('lateral'); });
  $('clear').addEventListener('click', () => view.select(null));
  $('panel').addEventListener('click', e => {
    const id = e.target.dataset && e.target.dataset.id;
    if (id) { e.preventDefault(); view.select(id); }
  });

  showWallEditor();
  showModeInputs();
  rebuild();
  setMode('gravity');
})(window);
