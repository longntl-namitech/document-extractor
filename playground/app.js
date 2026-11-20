/* Document extractor - UI. All data comes from window.DocApi (api.js). */
(function () {
  'use strict';

  const api = window.DocApi;
  const view = document.getElementById('view');

  /* ---------- helpers ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    file: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    download: '<path d="M12 4v11m0 0l-5-5m5 5l5-5M4 19h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    back: '<path d="M19 12H5m0 0l6-6m-6 6l6 6"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.01"/>',
    loader: '<path d="M12 3a9 9 0 1 0 9 9"/>'
  };
  function icon(name, size) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('class', 'od-icon');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.75');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    if (size) s.style.setProperty('--od-icon-size', size);
    return s;
  }

  const fmtBytes = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);
  const money = (n, d = 3) => `$${n.toFixed(d)}`;
  const DOC_LABEL = { invoice: 'Invoice', receipt: 'Receipt', contract: 'Contract', resume: 'Resume', other: 'Other', unknown: 'Unknown' };
  const ROUTE_CLASS = { 'Text layer': 'text', OCR: 'ocr', Vision: 'vision' };
  const STATUS_LABEL = { waiting: 'Waiting', reading: 'Reading', done: 'Done', failed: 'Failed' };
  const STATUS_ICON = { waiting: 'clock', reading: 'loader', done: 'check', failed: 'alert' };

  function fmtWhen(ts) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString()
      ? `Today ${time}`
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` ${time}`;
  }
  const chip = (route) => h('span', { class: `chip chip--${ROUTE_CLASS[route] || 'text'}`, text: route });
  const pendingChip = () => h('span', { class: 'chip chip--pending', text: 'Route not chosen yet' });
  /* one segment per page, same glyph and fill as the route chip; the route name is also in text for screen readers */
  const routeStrip = (items) => h('ol', { class: 'route-strip', 'aria-label': 'Route per page' }, items.map((p, i) =>
    h('li', { class: `seg seg--${p.route ? ROUTE_CLASS[p.route] || 'text' : 'pending'}` },
      h('span', { class: 'seg-n mono', text: String(i + 1) }),
      h('span', { class: 'seg-c mono', text: p.route ? money(p.cost) : '' }),
      h('span', { class: 'sr-only', text: p.route || 'Route not chosen yet' }))));
  const docBadge = (t) => h('span', { class: 'badge badge--accent', text: DOC_LABEL[t] || 'Other' });

  function thumb(seed) {
    const bars = [];
    for (let i = 0; i < 7; i++) bars.push(h('i', { style: `width:${55 + ((seed * 37 + i * 23) % 41)}%` }));
    return h('div', { class: 'thumb', 'aria-hidden': 'true' }, bars);
  }

  const live = document.getElementById('live');
  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function mount(node, focusEl) {
    view.replaceChildren(node);
    window.scrollTo(0, 0);
    const target = focusEl || node.querySelector('[data-focus-first]');
    if (target) target.focus({ preventScroll: true });
  }

  /* ---------- theme ---------- */
  const themeBtn = document.getElementById('theme-toggle');
  function paintTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('docx-theme', next); } catch (e) { /* storage blocked */ }
    paintTheme();
  });
  paintTheme();
  document.getElementById('skip').addEventListener('click', (e) => { e.preventDefault(); view.focus(); });

  async function refreshStats() {
    return api.getLimits();
  }

  /* ---------- state ---------- */
  const S = { error: null, unsub: null, jobId: null, busy: false };
  function cleanupJob() {
    if (S.unsub) { S.unsub(); S.unsub = null; }
  }

  /* ---------- error copy ---------- */
  function errorCopy(err) {
    const name = err.name || 'This file';
    const d = err.details || {};
    switch (err.code) {
      case 'too_large':
        return { title: 'File is too large', text: `${name} is ${fmtBytes(d.size)}. The limit is 40 MB per file. Nothing was uploaded or charged.`, hint: 'Compress the file or split it into smaller parts, then try again.', retry: true };
      case 'too_many_pages':
        return { title: 'Too many pages', text: `${name} has ${d.pages} pages. The limit is 10 pages per file. Nothing was charged.`, hint: 'Split the document into parts of 10 pages or fewer and upload them one at a time.', retry: true };
      case 'encrypted':
        return { title: 'This file is password-protected', text: `${name} is encrypted, so it can't be read. Nothing was charged.`, hint: 'Remove the password in the app that created the file, then upload it again.', retry: true };
      case 'damaged':
        return { title: 'This file looks damaged', text: `${name} could not be opened, so nothing was processed or charged.`, hint: 'Export or save the file again from the original app and retry.', retry: true };
      case 'unsupported':
        return { title: 'File type not supported', text: `${name} is a .${(d.ext || '').toUpperCase() || 'unknown'} file. Accepted types are PDF, PNG, JPG, CSV, DOCX, XLSX and PPTX.`, hint: 'Convert the file to one of the accepted types and try again.', retry: true };
      default:
        return { title: 'Something went wrong', text: 'The file could not be processed. Nothing was charged.', hint: 'Try again in a moment.', retry: true };
    }
  }

  /* ---------- home ---------- */
  async function showHome(focusSel) {
    cleanupJob();
    const [limits, samples, history] = await Promise.all([refreshStats(), api.listSamples(), api.listHistory()]);
    const input = h('input', { type: 'file', hidden: true, id: 'file-input', accept: '.pdf,.png,.jpg,.jpeg,.csv,.docx,.xlsx,.pptx', 'aria-label': 'Choose a file to process' });
    const pick = () => input.click();

    const chooseBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'choose', 'data-focus-first': true, onclick: pick }, icon('file'), 'Choose a file');
    const samplesHead = h('h2', { id: 'samples-h', tabindex: '-1', text: 'Try a sample' });

    const drop = h('section', { class: 'drop', 'aria-labelledby': 'drop-h' });
    drop.append(
      h('div', { class: 'drop-icon' }, icon('upload')),
      h('h2', { id: 'drop-h', text: 'Drop a document here' }),
      h('p', { text: 'One file at a time. You get Markdown and structured JSON back.' }),
      chooseBtn,
      h('div', { class: 'formats', 'aria-label': 'Accepted file types' }, ['PDF', 'PNG', 'JPG', 'CSV', 'DOCX', 'XLSX', 'PPTX'].map((t) => h('span', { class: 'badge', text: t }))),
      h('div', { class: 'limits' },
        limitStat(fmtBytes(limits.maxBytes), 'per file'),
        limitStat(String(limits.maxPages), 'pages per file')),
      input);
    input.addEventListener('change', () => { if (input.files[0]) startUpload(input.files[0]); });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) startUpload(f); });

    const aside = h('aside', { 'aria-labelledby': 'hist-h' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'hist-h', text: 'Your documents' }),
        h('p', { class: 'privacy' }, icon('lock'), 'Kept on this browser only')),
      history.length
        ? h('ul', { class: 'hist-list' }, history.map((it) => h('li', {}, historyRow(it))))
        : h('p', { class: 'empty', text: 'Nothing here yet. Documents you process will show up in this list.' }));

    const root = h('div', {},
      h('div', {},
        h('h1', { text: 'Document extractor' }),
        h('p', { class: 'lede', text: 'Drop one file and get Markdown plus the document type and key fields as JSON. Each page is read the cheapest way that works, and you can see what was used.' })),
      h('div', { class: 'home-grid', style: 'margin-top:24px' },
        h('div', {},
          S.error ? errorPanel(S.error) : null,
          drop,
          h('section', { class: 'section', 'aria-labelledby': 'samples-h' },
            h('div', { class: 'section-head' }, samplesHead, h('p', { text: 'Already processed. They open instantly and cost nothing.' })),
            h('ul', { class: 'sample-grid' }, samples.map((s) => h('li', {}, sampleCard(s)))))),
        aside));
    mount(root, focusSel ? root.querySelector(focusSel) : null);
  }

  const limitStat = (big, cap) => h('div', { class: 'od-stat' }, h('span', { class: 'big', text: big }), h('span', { class: 'cap', text: cap }));

  function errorPanel(e) {
    const c = errorCopy(e);
    return h('div', { class: 'alert alert--danger', role: 'alert', id: 'upload-alert', tabindex: '-1' },
      icon('alert'),
      h('div', {},
        h('h2', { text: c.title }),
        h('p', { text: c.text }),
        h('p', { text: c.hint }),
        c.retry ? h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => document.getElementById('file-input').click() }, 'Choose another file')) : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss message', onclick: () => { S.error = null; showHome('#choose'); } }, icon('x')));
  }

  function sampleCard(s) {
    return h('button', { type: 'button', class: 'sample', onclick: () => showResult(s.id, 'home') },
      h('span', { class: 'sample-name', text: s.name }),
      h('span', { class: 'sample-note', text: s.blurb }),
      h('span', { class: 'meta' },
        docBadge(s.docType),
        h('span', { class: 'mono', text: `${s.pages} ${s.pages === 1 ? 'page' : 'pages'}` }),
        h('span', { text: 'Instant and free' })));
  }

  function historyRow(it) {
    const status = it.status === 'partial' ? 'Partial' : it.docType === 'unknown' ? 'Markdown only' : null;
    return h('button', { type: 'button', class: 'hist', onclick: () => showResult(it.id, 'home') },
      h('span', { class: 'hist-name od-truncate', text: it.name }),
      h('span', { class: 'meta' },
        docBadge(it.docType),
        status ? h('span', { class: 'tag' }, icon('alert'), status) : null,
        h('span', { class: 'mono', text: `${it.pages} ${it.pages === 1 ? 'page' : 'pages'}` }),
        h('span', { class: 'mono', text: money(it.cost) }),
        h('span', { text: fmtWhen(it.at) })));
  }

  async function startUpload(file) {
    if (S.busy) return;
    S.busy = true;
    S.error = null;
    const btn = document.getElementById('choose');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking file...'; }
    try {
      const { id } = await api.createJob(file);
      const meta = await api.getJob(id);
      S.busy = false;
      showProcessing(meta);
    } catch (e) {
      S.busy = false;
      S.error = { code: e.code, details: e.details, name: file.name };
      await showHome('#upload-alert');
    }
  }

  /* ---------- processing ---------- */
  function showProcessing(meta) {
    cleanupJob();
    S.jobId = meta.id;
    const cap = api.DOC_CAP;
    const rows = Array.from({ length: meta.pageCount }, () => ({ status: 'waiting', route: null, reason: null, cost: 0 }));
    const classify = { status: 'waiting' };
    let finished = false;

    const costText = h('span', { class: 'cost-big', text: money(0) });
    const barFill = h('span', { class: 'bar-fill' });
    const stripSlot = h('div', {});
    const els = rows.map((_, i) => {
      const status = h('span', { class: 'status' });
      const chipSlot = h('span', {});
      const reason = h('span', { text: 'Waiting for its turn' });
      const cost = h('span', { class: 'step-cost', text: '' });
      const li = h('li', { class: 'step', 'data-status': 'waiting' },
        thumb(i + 1),
        h('div', { class: 'step-main' },
          h('div', { class: 'step-title' }, h('strong', { text: `Page ${i + 1}` }), status),
          h('div', { class: 'step-reason' }, chipSlot, reason)),
        cost);
      return { li, status, chipSlot, reason, cost };
    });
    const cStatus = h('span', { class: 'status' });
    const cNote = h('span', { class: 'step-reason', text: 'Starts after every page is read' });
    const cLi = h('li', { class: 'step', 'data-status': 'waiting' },
      h('div', { class: 'drop-icon', style: 'width:36px;height:36px;--od-icon-size:18px', 'aria-hidden': 'true' }, icon('file')),
      h('div', { class: 'step-main' },
        h('div', { class: 'step-title' }, h('strong', { text: 'Classify and extract fields' }), cStatus), cNote),
      h('span', { class: 'step-cost', text: '' }));

    const viewBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => showResult(meta.id, 'proc') }, 'View result');
    const cancelBtn = h('button', { type: 'button', class: 'btn', onclick: () => { api.cancelJob(meta.id); S.error = null; showHome('#choose'); } }, 'Cancel');
    const heading = h('h1', { tabindex: '-1', class: 'od-truncate', text: meta.name });

    function paintStatus(el, s) {
      el.dataset.s = s;
      el.replaceChildren(icon(STATUS_ICON[s]), STATUS_LABEL[s]);
    }
    function paintRow(i) {
      const r = rows[i], e = els[i];
      e.li.dataset.status = r.status;
      paintStatus(e.status, r.status);
      e.chipSlot.replaceChildren(r.route ? chip(r.route) : pendingChip());
      e.reason.textContent = r.reason || (r.status === 'waiting' ? 'Waiting for its turn' : 'Choosing a route');
      e.cost.textContent = r.status === 'waiting' ? '' : money(r.cost);
      const total = rows.reduce((s, x) => s + x.cost, 0);
      costText.textContent = money(total);
      barFill.style.setProperty('--p', Math.min(1, total / cap).toFixed(3));
      stripSlot.replaceChildren(routeStrip(rows));
    }
    function paintClassify() {
      cLi.dataset.status = classify.status;
      paintStatus(cStatus, classify.status);
      cNote.textContent = classify.status === 'waiting' ? 'Starts after every page is read'
        : classify.status === 'reading' ? 'Finding the document type and key fields'
        : classify.status === 'done' ? 'Document type and fields are ready'
        : 'Could not extract fields. Markdown is still available.';
    }
    rows.forEach((_, i) => paintRow(i));
    paintClassify();

    S.unsub = api.onProgress(meta.id, (ev) => {
      if (ev.step === 'classify') { classify.status = ev.status; paintClassify(); return; }
      if (ev.step === 'complete') {
        finished = true;
        viewBtn.disabled = false;
        refreshStats();
        announce('Processing finished. The result is ready.');
        viewBtn.focus();
        return;
      }
      const i = ev.page - 1;
      Object.assign(rows[i], { status: ev.status, route: ev.route || rows[i].route, reason: ev.reason || rows[i].reason, cost: ev.cost });
      paintRow(i);
      announce(`Page ${ev.page} ${STATUS_LABEL[ev.status].toLowerCase()}`);
    });

    mount(h('div', {},
      h('div', { class: 'job-head' },
        h('div', { class: 'od-stack' },
          h('span', { class: 'eyebrow', text: 'Processing' }),
          heading,
          h('p', { class: 'muted', text: `${fmtBytes(meta.size)} - ${meta.pageCount} ${meta.pageCount === 1 ? 'page' : 'pages'}` }))),
      h('section', { class: 'card cost-card', 'aria-label': 'Running cost' },
        h('div', { class: 'cost-line' },
          h('span', { class: 'muted', text: 'Running cost' }),
          h('span', { class: 'muted' }, 'Per-document cap ', h('span', { class: 'mono', text: money(cap, 2) }))),
        costText,
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Cost against the per-document cap', 'aria-valuemin': '0', 'aria-valuemax': String(cap) }, barFill),
        stripSlot),
      h('ol', { class: 'steps', 'aria-label': 'Pages' }, els.map((e) => e.li), cLi),
      h('div', { class: 'job-actions' }, viewBtn, cancelBtn)), heading);
  }

  /* ---------- result ---------- */
  function renderBlocks(blocks) {
    return blocks.map((b) => {
      if (b.t === 'h') return h('h3', { text: b.text });
      if (b.t === 'p') return h('p', { text: b.text });
      if (b.t === 'list') return h('ul', {}, b.items.map((t) => h('li', { text: t })));
      if (b.t === 'kv') return h('dl', { class: 'kv' }, b.rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
      const isNum = (c) => /^[\d.,$%-]+$/.test(c) && c.length < 12;
      return h('table', {},
        h('thead', {}, h('tr', {}, b.head.map((t, i) => h('th', { class: i > 0 && b.rows.every((r) => isNum(r[i])) ? 'num' : '', text: t })))),
        h('tbody', {}, b.rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: i > 0 && b.rows.every((rr) => isNum(rr[i])) ? 'num' : '', text: c }))))));
    });
  }

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function highlightJson(obj) {
    return esc(JSON.stringify(obj, null, 2)).replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (m) => (/^"/.test(m) ? (/:$/.test(m) ? `<span class="k">${m}</span>` : m) : /true|false|null/.test(m) ? `<span class="b">${m}</span>` : `<span class="n">${m}</span>`));
  }

  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;top:0;left:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* nothing else to try */ }
      ta.remove();
    }
    toast(`${label} copied`);
  }
  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`${name} downloaded`);
  }

  /* quoted fields, "" escapes and line breaks inside quotes */
  function parseCsv(text) {
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = text.charCodeAt(0) === 0xFEFF ? 1 : 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  /* The uploaded file, shown as it is: PDF in the browser viewer, CSV as a table, image as an image.
     Other types (and samples, or a reload, where the File is gone) keep the rendered view. */
  async function rawView(job) {
    let f = job.file;
    if (!(f instanceof Blob) && job.src) {
      try { f = await (await fetch(job.src)).blob(); } catch (e) { /* opened from file://, keep the rendered view */ }
    }
    if (!(f instanceof Blob)) return null;
    if (job.ext === 'pdf') {
      const url = URL.createObjectURL(f);
      return { kind: 'pdf', node: h('iframe', { class: 'raw-frame', title: `Original ${job.name}` }), at: (n) => `${url}#page=${n}` };
    }
    if (job.ext === 'csv') {
      const rows = parseCsv(await f.text());
      const [head = [], ...body] = rows;
      return { kind: 'csv', node: h('div', { class: 'raw-csv', tabindex: '0', 'aria-label': `Original ${job.name}` },
        h('table', {}, h('thead', {}, h('tr', {}, head.map((t) => h('th', { scope: 'col', text: t })))),
          h('tbody', {}, body.map((r) => h('tr', {}, r.map((c) => h('td', { text: c}))))))) };
    }
    if (['png', 'jpg', 'jpeg'].includes(job.ext)) {
      return { kind: 'img', node: h('img', { class: 'raw-img', src: URL.createObjectURL(f), alt: `Original ${job.name}` }) };
    }
    return null;
  }

  async function showResult(id, from) {
    cleanupJob();
    const [job] = await Promise.all([api.getJob(id), refreshStats()]);
    const raw = await rawView(job);
    const st = { page: 1, tab: 'markdown', scope: 'page', full: false };
    /* the mock and the real service both mark pages as <!-- page N -->, so the Markdown can be cut per page */
    const mdParts = {};
    job.markdown.split(/(?=<!-- page \d+ -->)/).forEach((s) => { const m = s.match(/^<!-- page (\d+) -->/); if (m) mdParts[Number(m[1])] = s.trim(); });
    const base = job.name.replace(/\.[^.]+$/, '');
    const mdOnly = !job.json;
    const degraded = job.pages.filter((p) => p.degraded);

    const statusBadge = mdOnly
      ? h('span', { class: 'badge badge--warn has-tip', tabindex: '0', 'aria-describedby': 'mdonly-tip' }, icon('info'), 'Markdown only',
        h('span', { class: 'tip', role: 'tooltip', id: 'mdonly-tip', text: 'The text was read, but the document type and fields could not be extracted. The Markdown below is complete. There is no JSON for this document.' }))
      : job.status === 'partial'
        ? h('span', { class: 'badge badge--warn has-tip', tabindex: '0', 'aria-describedby': 'partial-tip' }, icon('alert'), 'Partial',
          h('span', { class: 'tip', role: 'tooltip', id: 'partial-tip', text: `${degraded.length} of ${job.pages.length} pages fell back to OCR and may be less accurate. They are marked "Degraded" in the page list and the table below.` }))
        : h('span', { class: 'badge badge--ok' }, icon('check'), 'Complete');

    const sampleBadge = job.free
      ? h('span', { class: 'badge has-tip', tabindex: '0', 'aria-describedby': 'sample-tip' }, icon('info'), 'Sample',
        h('span', { class: 'tip', role: 'tooltip', id: 'sample-tip', text: 'This was processed earlier, so it opens instantly.' }))
      : null;

    /* viewer */
    const picks = h('div', { class: 'page-picks', role: 'group', 'aria-label': 'Pages' });
    const paperSlot = h('div', {});
    const routeSlot = h('span', {});
    const countEl = h('span', { class: 'count' });
    const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous page', onclick: () => go(st.page - 1) }, icon('prev'));
    const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next page', onclick: () => go(st.page + 1) }, icon('next'));
    const fullBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => toggleFull() }, 'Full view');
    function go(n) {
      st.page = Math.min(job.pages.length, Math.max(1, n));
      paintViewer();
      if (st.full) scrollToPage();
      else if (st.tab === 'markdown') setTab('markdown');
    }
    function paintViewer() {
      const p = job.pages[st.page - 1];
      countEl.textContent = `Page ${st.page} of ${job.pages.length}`;
      prevBtn.disabled = st.page === 1;
      nextBtn.disabled = st.page === job.pages.length;
      routeSlot.replaceChildren(chip(p.route), p.degraded ? h('span', { class: 'tag', style: 'margin-left:8px' }, icon('alert'), 'Degraded') : '');
      picks.replaceChildren(...job.pages.map((q) => {
        const b = h('button', { type: 'button', class: 'pick', 'aria-label': `Page ${q.idx}${q.degraded ? ', degraded' : ''}`, 'aria-current': String(q.idx === st.page), onclick: () => go(q.idx) },
          h('span', { text: String(q.idx) }), q.degraded ? h('span', { class: 'deg', text: 'DEG' }) : null);
        return b;
      }));
      if (!st.full) paintPaper();
    }
    const paperEl = (q) => h('article', { class: 'paper' + (job.rendered ? ' paper-rendered' : ''), 'aria-label': `Page ${q.idx} content` }, renderBlocks(q.blocks));
    /* full view: every page stacked in one scrolling box; the page buttons and arrows jump to a page */
    function paintPaper() {
      if (raw) {
        if (raw.at) raw.node.src = raw.at(st.page);
        if (!raw.node.isConnected) paperSlot.replaceChildren(raw.node);
        return;
      }
      if (!st.full) { paperSlot.replaceChildren(paperEl(job.pages[st.page - 1])); return; }
      paperSlot.replaceChildren(h('div', { class: 'paper-scroll', tabindex: '0', 'aria-label': 'All pages' }, job.pages.map((q) =>
        h('div', { id: `pg-${q.idx}` },
          h('div', { class: 'paper-label' }, `Page ${q.idx}`, chip(q.route), q.degraded ? h('span', { class: 'tag' }, icon('alert'), 'Degraded') : ''),
          paperEl(q)))));
    }
    function scrollToPage() {
      const sc = paperSlot.firstChild;
      const el = sc && sc.querySelector(`#pg-${st.page}`);
      if (el) sc.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
    }
    function toggleFull() {
      st.full = !st.full;
      fullBtn.setAttribute('aria-pressed', String(st.full));
      paintPaper();
      if (st.tab === 'markdown') setTab('markdown');
      if (st.full) scrollToPage();
    }
    const rendered = job.rendered && !raw;
    fullBtn.hidden = !!raw; // the PDF viewer already scrolls every page, a CSV or image is a single view
    const viewer = h('section', { class: 'card', 'aria-labelledby': 'viewer-h' },
      h('div', { class: 'pane-head' },
        h('div', { class: 'od-row' }, h('h2', { id: 'viewer-h', text: rendered ? 'Rendered view' : 'Original' }),
          rendered ? h('span', { class: 'has-tip', tabindex: '0', 'aria-describedby': 'rendered-tip', style: 'display:inline-flex' }, icon('info'),
            h('span', { class: 'tip', role: 'tooltip', id: 'rendered-tip', text: 'This is a rendered view of the content extracted from your file, not the original layout.' })) : null,
          picks, routeSlot),
        h('div', { class: 'pager' }, fullBtn, prevBtn, countEl, nextBtn)),
      h('div', { class: 'pane-body' },
        paperSlot));

    /* output */
    const panel = h('div', { role: 'tabpanel', id: 'out-panel', 'aria-labelledby': 'tab-markdown' });
    const tabMd = h('button', { type: 'button', class: 'tab', role: 'tab', id: 'tab-markdown', 'aria-controls': 'out-panel', onclick: () => setTab('markdown') }, 'Markdown');
    const tabJson = h('button', { type: 'button', class: 'tab', role: 'tab', id: 'tab-json', 'aria-controls': 'out-panel', onclick: () => setTab('json') }, 'JSON');
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Output format' }, tabMd, tabJson);
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      setTab(st.tab === 'markdown' ? 'json' : 'markdown');
      (st.tab === 'markdown' ? tabMd : tabJson).focus();
    });
    const tools = h('div', { class: 'tools' });
    function setTab(t) {
      st.tab = t;
      const isMd = t === 'markdown';
      tabMd.setAttribute('aria-selected', String(isMd)); tabMd.tabIndex = isMd ? 0 : -1;
      tabJson.setAttribute('aria-selected', String(!isMd)); tabJson.tabIndex = isMd ? -1 : 0;
      panel.setAttribute('aria-labelledby', isMd ? 'tab-markdown' : 'tab-json');
      const canSplit = isMd && job.pages.length > 1 && !st.full;
      const byPage = canSplit && st.scope === 'page' && mdParts[st.page];
      const text = isMd ? (byPage ? mdParts[st.page] : job.markdown) : job.json ? JSON.stringify(job.json, null, 2) : '';
      const label = isMd ? (byPage ? `Page ${st.page} Markdown` : 'Markdown') : 'JSON';
      const ok = isMd || !mdOnly;
      const scopeBtn = (v, t) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(st.scope === v), onclick: () => { st.scope = v; setTab('markdown'); } }, t);
      tools.replaceChildren(
        ...(canSplit ? [scopeBtn('page', 'This page'), scopeBtn('all', 'All pages')] : []),
        h('button', { type: 'button', class: 'btn', disabled: !ok, onclick: () => copyText(text, label) }, icon('copy'), 'Copy'),
        h('button', { type: 'button', class: 'btn', disabled: !ok, onclick: () => download(`${base}${byPage ? `-page-${st.page}` : ''}.${isMd ? 'md' : 'json'}`, text, isMd ? 'text/markdown' : 'application/json') }, icon('download'), 'Download'));
      if (isMd) {
        panel.replaceChildren(h('pre', { class: 'code', tabindex: '0', 'aria-label': byPage ? `Markdown for page ${st.page}` : 'Markdown output', text }));
      } else if (mdOnly) {
        panel.replaceChildren(h('div', { class: 'panel-empty' }, icon('info'),
          h('strong', { text: 'No JSON for this document' }),
          h('span', { text: 'Field extraction failed, so only the Markdown is available. Nothing extra was charged for the failed step.' })));
      } else {
        const pre = h('pre', { class: 'code', tabindex: '0', 'aria-label': 'JSON output' });
        pre.innerHTML = highlightJson(job.json);
        panel.replaceChildren(
          h('p', { class: 'generic-label', text: 'The fields cover the whole document, so they stay the same when you change page.' }),
          job.docType === 'other' ? h('p', { class: 'generic-label' }, h('span', { class: 'badge', text: 'generic' }), 'No specific type matched, so fields use the generic shape: title, summary, key_fields.') : '',
          pre);
      }
    }
    const output = h('section', { class: 'card', 'aria-label': 'Extracted output' },
      h('div', { class: 'out-bar' }, tabs, tools), panel);

    /* cost and routes */
    const counts = { 'Text layer': 0, OCR: 0, Vision: 0 };
    const costs = { 'Text layer': 0, OCR: 0, Vision: 0 };
    job.pages.forEach((p) => { counts[p.route] += 1; costs[p.route] += p.cost; });
    const totalMs = job.pages.reduce((s, p) => s + p.ms, 0);
    const msFmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
    const costSection = h('section', { class: 'section', 'aria-labelledby': 'cost-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'cost-h', text: 'Cost and routes' }),
        h('p', { text: 'Each page is read the cheapest way that works. Text layer is free, OCR runs locally, Vision uses a model and costs the most.' })),
      routeStrip(job.pages),
      h('div', { class: 'summary' }, Object.keys(counts).map((r) =>
        h('div', { class: 'sum od-stat' }, chip(r),
          h('span', { class: 'big', text: String(counts[r]) }),
          h('span', { class: 'cap', text: `${counts[r] === 1 ? 'page' : 'pages'} - ${money(costs[r])}` })))),
      h('div', { class: 'card table-wrap' },
        h('table', { class: 'cost' },
          h('caption', { class: 'sr-only', text: 'Cost and route per page' }),
          h('thead', {}, h('tr', {}, ['Page', 'Route', 'Reason', 'Time', 'Cost'].map((t, i) => h('th', { scope: 'col', class: i > 2 ? 'r' : '', text: t })))),
          h('tbody', {}, job.pages.map((p) => h('tr', {},
            h('td', { class: 'mono', 'data-label': 'Page', text: String(p.idx) }),
            h('td', { 'data-label': 'Route' }, chip(p.route), p.degraded ? h('span', { class: 'tag', style: 'margin-left:8px' }, icon('alert'), 'Degraded') : ''),
            h('td', { class: 'reason-cell', text: p.reason }),
            h('td', { class: 'r', 'data-label': 'Time', text: msFmt(p.ms) }),
            h('td', { class: 'r', 'data-label': 'Cost', text: money(p.cost) })))),
          h('tfoot', {}, h('tr', {},
            h('td', { text: 'Total' }), h('td', {}), h('td', {}),
            h('td', { class: 'r', 'data-label': 'Time', text: msFmt(totalMs) }),
            h('td', { class: 'r', 'data-label': 'Cost', text: money(job.totalCost) }))))),
      h('p', { class: 'total-line' },
        h('span', {}, job.free ? 'Not charged: this is a sample.' : `Under the ${money(api.DOC_CAP, 2)} per-document cap.`),
        h('strong', { text: `${job.pages.length} ${job.pages.length === 1 ? 'page' : 'pages'}, ${money(job.totalCost)}` })));

    const backBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { S.error = null; showHome(); } }, icon('back'), 'All documents');
    const heading = h('h1', { tabindex: '-1', text: job.name });
    const root = h('div', {},
      h('div', { style: 'margin-bottom:12px' }, backBtn),
      h('div', { class: 'result-head' },
        h('div', { class: 'result-title' }, heading, docBadge(job.docType), statusBadge, sampleBadge),
        h('p', { class: 'muted', text: `${fmtBytes(job.size)} - ${job.pages.length} ${job.pages.length === 1 ? 'page' : 'pages'} - ${fmtWhen(job.createdAt)}` })),
      h('div', { class: 'split' }, viewer, output),
      costSection,
      h('div', { class: 'job-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { S.error = null; showHome('#choose'); } }, icon('upload'), 'Process another document')));
    paintViewer();
    setTab('markdown');
    mount(root, heading);
    announce(`Result for ${job.name}`);
  }

  showHome();
})();
