// Model file drop zone (owner: role 1, lead / integrator).
//
// Accepts a dragged or picked file, routes it to the right importer by extension, and reports what
// happened. Holds the bytes only for the duration of the parse - see the privacy note in
// src/shared/import-ifc.js. Nothing here uploads, stores or persists anything.
(function (root) {
  const LP = root.LP = root.LP || {};

  const EXT = {
    '.ifc': 'ifc',
    '.e2k': 'etabs',
    '.$et': 'etabs'
  };

  LP.DropZone = class {
    /**
     * @param {HTMLElement} el the drop target
     * @param {function} onModel called with ({ elements, stats, fileName, kind }) on success
     */
    constructor(el, onModel) {
      this.el = el;
      this.onModel = onModel;
      // The status line sits outside the dashed box, so clicking a long error message does not
      // reopen the file picker.
      this.status = el.querySelector('[data-role=status]') || document.querySelector('[data-role=status]');
      this.input = el.querySelector('input[type=file]');
      this.busy = false;

      // The document-level handlers stop the browser from navigating away to the dropped file,
      // which is its default behaviour and loses the user's session.
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(type =>
        document.addEventListener(type, e => { e.preventDefault(); }));

      el.addEventListener('dragenter', () => el.classList.add('over'));
      el.addEventListener('dragover', () => el.classList.add('over'));
      el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); });
      el.addEventListener('drop', e => {
        el.classList.remove('over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this.handle(f);
      });
      el.addEventListener('click', e => { if (e.target !== this.input) this.input.click(); });
      this.input.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (f) this.handle(f);
        // Clear so picking the same file twice still fires a change event.
        e.target.value = '';
      });
    }

    say(html, cls) {
      this.status.className = 'drop-status' + (cls ? ' ' + cls : '');
      this.status.innerHTML = html;
    }

    async handle(file) {
      if (this.busy) return;
      const dot = file.name.lastIndexOf('.');
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
      const kind = EXT[ext];

      if (!kind) {
        this.say(`<b>${esc(file.name)}</b> is not a model file.<br>Drop an <b>.ifc</b> (Revit) ` +
                 'or <b>.e2k</b> / <b>.$et</b> (ETABS text export) file.', 'bad');
        return;
      }
      if (kind === 'etabs') {
        this.say('ETABS import is specified but not built yet — see <code>docs/import-and-editing.md</code>. ' +
                 'IFC works today.', 'bad');
        return;
      }

      this.busy = true;
      this.el.classList.add('busy');
      const mb = (file.size / 1048576).toFixed(1);
      this.say(`Reading <b>${esc(file.name)}</b> (${mb} MB)...`);

      // The one place the file's bytes exist. `buffer` is released in the finally block below and
      // never leaves this function.
      let buffer = null;
      try {
        buffer = await file.arrayBuffer();
        const t0 = performance.now();
        const { elements, stats } = await LP.importIFC(buffer, msg => this.say(esc(msg)));
        const secs = ((performance.now() - t0) / 1000).toFixed(1);

        if (!elements.length) {
          // Say what the file actually contains. "Found nothing" on its own is useless - the type
          // list tells you immediately whether this is an architectural export, a proxy-heavy one,
          // or a type name we simply do not handle yet.
          const seen = stats.typesSeen || [];
          const list = seen.length
            ? '<br><br>What the file contains:<br>' +
              seen.slice(0, 12).map(([t, n]) => `<code>${esc(t || '(unknown)')}</code> &times; ${n}`).join('<br>') +
              (seen.length > 12 ? `<br><span class="muted">and ${seen.length - 12} more types</span>` : '')
            : '<br><br>No geometry was found in the file at all.';
          this.say(`No structural elements found in <b>${esc(file.name)}</b>.<br>` +
                   'Looked for columns, beams, members, slabs, walls, plates, footings and piles ' +
                   '(including STANDARDCASE variants).' + list +
                   '<br><br><span class="muted">If these are all architectural types, re-export from ' +
                   'Revit with structural categories included. If a structural type is listed above ' +
                   'that we are not reading, send it to Sam.</span>', 'bad');
          return;
        }

        const unitNote = stats.confident
          ? `units read as <b>${stats.unit}</b>`
          : `<b>units uncertain</b> — assumed ${stats.unit}; check the size below`;
        this.say(`Imported <b>${stats.found}</b> elements from <b>${esc(file.name)}</b> in ${secs}s ` +
                 `(${stats.skipped} non-structural skipped, ${unitNote}).<br>` +
                 '<span class="muted">File discarded — nothing was uploaded or saved.</span>', 'ok');

        this.onModel({ elements, stats, fileName: file.name, kind });
      } catch (err) {
        this.say(`Could not read <b>${esc(file.name)}</b>.<br><code>${esc(String(err && err.message || err))}</code><br>` +
                 '<span class="muted">If this says the reader failed to load, the web-ifc library ' +
                 'is fetched from a CDN and needs internet access.</span>', 'bad');
      } finally {
        // Drop the bytes. Everything downstream holds derived numbers, not the file.
        buffer = null;
        this.busy = false;
        this.el.classList.remove('busy');
      }
    }
  };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
})(typeof window !== 'undefined' ? window : globalThis);
