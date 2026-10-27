// Explain panel content (owner: role 7, explain content and demo).
// LP.explain(b, id, mode) returns HTML for the side panel. Links carry data-id so the app can jump to them.
(function (root) {
  const LP = root.LP = root.LP || {};
  const r = LP.round;

  // Plain-language note for each member type, per mode. Edit freely.
  LP.NOTES = {
    deck: {
      gravity: 'The deck spans one way between filler beams. Each beam picks up the strip of deck halfway to the beam on either side: its tributary width.',
      lateral: 'In lateral mode the floor acts as one deep horizontal beam: see the diaphragm.'
    },
    beam: {
      gravity: 'A filler beam carries a uniform line load from the deck and delivers half of it to each end. Beams on a column line frame straight into columns; the rest frame into girders.',
      lateral: 'Floor beams are not part of the lateral load path in this building, unless they sit on a wall line and act as collectors.'
    },
    girder: {
      gravity: 'A girder collects the point loads from the filler beams framing into it and carries them to the columns at its ends.',
      lateral: 'A girder on a wall line can double as a collector, dragging diaphragm shear into the wall.'
    },
    column: {
      gravity: 'A column adds up the load from every floor above it. The bottom story column carries the most.',
      lateral: 'In this building the columns carry gravity only; the shear walls take all of the lateral load.'
    },
    footing: {
      gravity: 'The footing spreads the column load into the soil. Its size comes from the load divided by the allowable bearing pressure.',
      lateral: 'Column footings carry no lateral load here; the wall footings do.'
    },
    storyForce: {
      lateral: 'Wind pushes on the face of the building, or the building\'s own mass resists ground shaking in an earthquake. Either way the force is gathered at each floor level.'
    },
    diaphragm: {
      lateral: 'The floor or roof acts like a deep horizontal beam lying flat. It spans between the wall lines, carrying the story force to them. A flexible diaphragm shares load by tributary width; a rigid one shares it by wall stiffness and can twist.'
    },
    chord: {
      lateral: 'The chords are the flanges of the diaphragm beam: the edge members perpendicular to the span. One edge is pulled in tension and the opposite edge is pushed in compression.'
    },
    collector: {
      lateral: 'A collector (drag strut) gathers diaphragm shear along the whole line and drags it into the shorter wall. Its force is largest where the wall starts.'
    },
    wall: {
      lateral: 'A shear wall takes the load from the diaphragm at each floor and carries it down. Story shear grows toward the base, and so does the overturning that tries to tip the wall.'
    },
    wallFooting: {
      lateral: 'The wall footing resists the base shear by friction and soil pressure, and the overturning by uplift at one end and extra bearing at the other.'
    }
  };

  const link = (b, id) => `<a href="#" data-id="${id}">${b.members[id] ? b.members[id].label : id}</a>`;

  /**
   * Side panel HTML for one member.
   * @param {object} b analysed building
   * @param {string} id member id
   * @param {'gravity'|'lateral'} mode
   * @returns {string} HTML; links carry data-id
   */
  LP.explain = function (b, id, mode) {
    const m = b.members[id];
    if (!m) return '';
    const res = m.results[mode];
    const note = (LP.NOTES[m.type] || {})[mode] || '';
    const ins = b.paths.filter(p => p.mode === mode && p.to === id);
    const outs = b.paths.filter(p => p.mode === mode && p.from === id);
    const list = (arr, key) => arr.length
      ? '<ul>' + arr.map(p => `<li>${link(b, p[key])}: <b>${r(p.value)} k</b>${p.note ? ` <span class="muted">(${p.note})</span>` : ''}</li>`).join('') + '</ul>'
      : '<p class="muted">None</p>';
    const section = (title, content) => `<details class="explain-section" open><summary>${title}</summary>${content}</details>`;
    return `
      <h2>${m.label}</h2>
      ${res ? `<div class="big">${r(res.value)} ${res.unit}</div>` : '<p class="muted">Not part of the load path in this mode.</p>'}
      ${note ? `<p>${note}</p>` : ''}
      ${section('Load comes from', list(ins, 'from'))}
      ${section('Load goes to', list(outs, 'to'))}
      ${res && res.calc ? section('Calculation', `<ol class="calc">${res.calc.map(c => `<li>${c}</li>`).join('')}</ol>`) : ''}`;
  };

  /**
   * Members upstream (where load comes from) and downstream (where it goes) of one member.
   * @returns {{members: Set<string>, paths: object[]}} zero-force paths are left out
   */
  LP.trace = function (b, id, mode) {
    const paths = b.paths.filter(p => p.mode === mode && Math.abs(p.value) > 1e-9);
    const walk = (start, from, to) => {
      const seen = new Set([start]), stack = [start];
      while (stack.length) {
        const cur = stack.pop();
        paths.forEach(p => { if (p[from] === cur && !seen.has(p[to])) { seen.add(p[to]); stack.push(p[to]); } });
      }
      return seen;
    };
    const down = walk(id, 'from', 'to'), up = walk(id, 'to', 'from');
    const members = new Set([...down, ...up]);
    return { members, paths: paths.filter(p => (down.has(p.from) && down.has(p.to)) || (up.has(p.from) && up.has(p.to))) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
