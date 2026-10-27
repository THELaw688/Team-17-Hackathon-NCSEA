// IFC import (owner: role 1, lead / integrator). Reads a Revit IFC export in the browser and
// returns neutral StructuralElements for LP.modelFromElements.
//
// PRIVACY - this is a requirement, not a nicety:
//   * The file is read from the user's disk with File.arrayBuffer(). Nothing is uploaded; this app
//     has no backend to upload to.
//   * Parsing happens here, in the browser, in WASM.
//   * The moment elements are extracted we CloseModel and drop every reference to the bytes, so the
//     IFC does not outlive the import.
//   * Nothing is written to localStorage, sessionStorage, IndexedDB or any file.
//   * No fetch or XHR in this file carries model data. The only request made is a GET for the
//     web-ifc library and its WASM - outbound requests for code, carrying nothing of the user's.
//
// Geometry approach: rather than walking IfcLocalPlacement chains and extruded-solid profiles by
// hand, we let web-ifc flatten everything to world-space triangles and read each element's bounding
// box from them. A column's box gives its base and top; a beam's gives its span. That is all the
// load path needs, and it is immune to however Revit chose to nest the placements.
(function (root) {
  const LP = root.LP = root.LP || {};

  // Pin the version: web-ifc's API has moved between releases, and a demo that breaks because a CDN
  // served something newer is a bad afternoon. 0.0.78 was the latest when this was written.
  LP.IFC_CDN = 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.78/';

  // IFC type number -> our element kind. Numbers are stable IFC4 type codes used by web-ifc.
  // Anything not listed (doors, pipes, furniture, railings) is skipped at the filter, which also
  // keeps a 200MB Revit export from turning into 200MB of JavaScript objects.
  const WANTED = {
    IFCCOLUMN: 'column',
    IFCBEAM: 'beam',
    IFCMEMBER: 'beam',
    IFCSLAB: 'slab',
    IFCWALL: 'wall',
    IFCWALLSTANDARDCASE: 'wall',
    IFCFOOTING: 'footing',
    IFCPLATE: 'slab'
  };

  const classifyMaterial = name => {
    const s = String(name || '').toLowerCase();
    if (/steel|metal|w\d|hss|wide flange|s355|a992/.test(s)) return 'steel';
    if (/concrete|conc|rc |cast|precast|c\d{2}\/|grout/.test(s)) return 'concrete';
    return 'other';
  };

  /** Bounding box of a flat mesh's world-space triangles. */
  const meshBox = (api, modelID, flatMesh) => {
    const box = { minx: Infinity, miny: Infinity, minz: Infinity, maxx: -Infinity, maxy: -Infinity, maxz: -Infinity };
    for (let i = 0; i < flatMesh.geometries.size(); i++) {
      const placed = flatMesh.geometries.get(i);
      const geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const t = placed.flatTransformation; // column-major 4x4
      // Vertex data is 6 floats per vertex: position then normal.
      for (let v = 0; v < verts.length; v += 6) {
        const x = verts[v], y = verts[v + 1], z = verts[v + 2];
        const wx = t[0] * x + t[4] * y + t[8] * z + t[12];
        const wy = t[1] * x + t[5] * y + t[9] * z + t[13];
        const wz = t[2] * x + t[6] * y + t[10] * z + t[14];
        if (wx < box.minx) box.minx = wx;
        if (wy < box.miny) box.miny = wy;
        if (wz < box.minz) box.minz = wz;
        if (wx > box.maxx) box.maxx = wx;
        if (wy > box.maxy) box.maxy = wy;
        if (wz > box.maxz) box.maxz = wz;
      }
      geom.delete();
    }
    return Number.isFinite(box.minx) ? box : null;
  };

  /**
   * Turn one element's world bounding box into a StructuralElement.
   * web-ifc's world axes are IFC's: x and y in plan, z up - the same convention this app uses.
   */
  const fromBox = (kind, box, meta) => {
    const cx = (box.minx + box.maxx) / 2, cy = (box.miny + box.maxy) / 2, cz = (box.minz + box.maxz) / 2;
    const dx = box.maxx - box.minx, dy = box.maxy - box.miny;
    const base = { kind, material: classifyMaterial(meta.material), section: meta.section || '',
                   name: meta.name || '', source: 'ifc', sourceId: meta.guid || '' };

    if (kind === 'slab') {
      return LP.element(Object.assign(base, {
        outline: [{ x: box.minx, y: box.miny }, { x: box.maxx, y: box.miny },
                  { x: box.maxx, y: box.maxy }, { x: box.minx, y: box.maxy }],
        zTop: box.maxz, zBottom: box.minz,
        // a/b as opposite corners so the 3D scene can draw it as a box without extra cases.
        a: { x: box.minx, y: box.miny, z: box.maxz }, b: { x: box.maxx, y: box.maxy, z: box.maxz }
      }));
    }
    if (kind === 'column') {
      return LP.element(Object.assign(base, {
        a: { x: cx, y: cy, z: box.minz }, b: { x: cx, y: cy, z: box.maxz }
      }));
    }
    if (kind === 'footing') {
      return LP.element(Object.assign(base, {
        a: { x: cx, y: cy, z: box.minz }, b: { x: cx, y: cy, z: box.minz }
      }));
    }
    // Beams and walls run along their longer plan dimension.
    const alongX = dx >= dy;
    if (kind === 'wall') {
      return LP.element(Object.assign(base, {
        a: alongX ? { x: box.minx, y: cy, z: box.minz } : { x: cx, y: box.miny, z: box.minz },
        b: alongX ? { x: box.maxx, y: cy, z: box.maxz } : { x: cx, y: box.maxy, z: box.maxz }
      }));
    }
    return LP.element(Object.assign(base, {
      a: alongX ? { x: box.minx, y: cy, z: cz } : { x: cx, y: box.miny, z: cz },
      b: alongX ? { x: box.maxx, y: cy, z: cz } : { x: cx, y: box.maxy, z: cz }
    }));
  };

  const scaleElement = (e, s) => {
    const p = q => q ? { x: q.x * s, y: q.y * s, z: q.z * s } : q;
    e.a = p(e.a); e.b = p(e.b);
    if (e.outline) e.outline = e.outline.map(q => ({ x: q.x * s, y: q.y * s }));
    if (e.zTop != null) e.zTop *= s;
    if (e.zBottom != null) e.zBottom *= s;
    return e;
  };

  /**
   * Load a classic script and resolve when it has run.
   *
   * The IIFE build is used rather than the ES module because this app has no build step and loads
   * everything with plain <script> tags - and because a dynamic import() of a cross-origin module
   * fails in ways that are hard to read. It is injected on first import rather than in index.html
   * because it is ~6 MB, which nobody should download just to look at the grid model.
   */
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the IFC reader from ' + src +
      ' - check internet access, or that a blocker is not stopping cdn.jsdelivr.net.'));
    document.head.appendChild(s);
  });

  let apiPromise = null;
  /** Load and initialise web-ifc once per page. */
  const getApi = async () => {
    if (!apiPromise) {
      apiPromise = (async () => {
        if (!root.WebIFC) await loadScript(LP.IFC_CDN + 'web-ifc-api-iife.js');
        if (!root.WebIFC || !root.WebIFC.IfcAPI) throw new Error('IFC reader loaded but did not expose WebIFC.IfcAPI.');
        const api = new root.WebIFC.IfcAPI();
        // Second argument must be true: without it the path is treated as relative to this page and
        // the WASM fetch 404s.
        api.SetWasmPath(LP.IFC_CDN, true);
        await api.Init();
        return api;
      })().catch(err => { apiPromise = null; throw err; }); // let a failed load be retried
    }
    return apiPromise;
  };

  /**
   * Parse an IFC file into StructuralElements, in feet.
   *
   * @param {ArrayBuffer} buffer the file's bytes; the caller drops its reference afterwards
   * @param {function} [onStatus] progress messages for the UI
   * @param {object} [opts] { unit } to force a length unit instead of detecting one
   * @returns {Promise<object>} { elements, stats: { found, skipped, unit, storyHeight, confident } }
   */
  LP.importIFC = async function (buffer, onStatus, opts) {
    opts = opts || {};
    const say = onStatus || (() => {});
    say(root.WebIFC ? 'Starting IFC reader...' : 'Downloading IFC reader (about 6 MB, first time only)...');
    const api = await getApi();

    say('Reading file...');
    let modelID = null;
    let raw = [], skipped = 0;
    try {
      modelID = api.OpenModel(new Uint8Array(buffer));

      // Material name per element, via IfcRelAssociatesMaterial. Revit's own naming is inconsistent,
      // so this is a hint we classify loosely, not a guarantee.
      const materialOf = {};
      try {
        const rels = api.GetLineIDsWithType(modelID, api.GetTypeCodeFromName
          ? api.GetTypeCodeFromName('IFCRELASSOCIATESMATERIAL') : 0);
        for (let i = 0; i < rels.size(); i++) {
          const rel = api.GetLine(modelID, rels.get(i), true);
          const name = rel.RelatingMaterial && (rel.RelatingMaterial.Name && rel.RelatingMaterial.Name.value);
          (rel.RelatedObjects || []).forEach(o => { if (o && o.value != null) materialOf[o.value] = name; });
        }
      } catch (e) {
        // Material association is optional; geometry still imports without it.
      }

      say('Extracting geometry...');
      const meshes = api.LoadAllGeometry(modelID);
      for (let i = 0; i < meshes.size(); i++) {
        const flat = meshes.get(i);
        const id = flat.expressID;
        const typeName = api.GetNameFromTypeCode
          ? api.GetNameFromTypeCode(api.GetLineType(modelID, id))
          : '';
        const kind = WANTED[typeName];
        if (!kind) { skipped++; continue; }
        const box = meshBox(api, modelID, flat);
        if (!box) { skipped++; continue; }
        let line = {};
        try { line = api.GetLine(modelID, id, false) || {}; } catch (e) { /* name is optional */ }
        raw.push(fromBox(kind, box, {
          name: line.Name && line.Name.value,
          guid: line.GlobalId && line.GlobalId.value,
          section: line.ObjectType && line.ObjectType.value,
          material: materialOf[id]
        }));
        if (i % 500 === 0) say(`Extracting geometry... ${raw.length} structural elements so far`);
      }
    } finally {
      // Discard the model and the bytes whatever happened, including on error.
      if (modelID !== null) { try { api.CloseModel(modelID); } catch (e) { /* already closed */ } }
    }

    // Units: detect from implied storey heights rather than trusting the file's declaration.
    const zs = [];
    raw.forEach(e => { if (e.kind !== 'column' && e.a) zs.push(e.a.z); });
    const levels = LP.cluster1d(zs, 0.5).map(c => c.value);
    const unit = opts.unit
      ? { unit: opts.unit, scale: LP.LENGTH_SCALES[opts.unit], confident: true, storyHeight: null }
      : LP.detectLengthScale(levels);

    const elements = raw.map(e => scaleElement(e, unit.scale));
    return {
      elements,
      stats: { found: elements.length, skipped, unit: unit.unit, scale: unit.scale,
               storyHeight: unit.storyHeight, confident: unit.confident }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
