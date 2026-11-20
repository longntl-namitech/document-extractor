/* Mock API for the Document extractor prototype.
   The UI talks to window.DocApi only. Replace this file with a real client that keeps the same shape:
     createJob(file)      -> Promise<{id}>            (rejects with Error{code, details})
     onProgress(id, cb)   -> unsubscribe()            (events: {page, status, route, reason, cost}
                                                       plus {step:'classify'} and {step:'complete'})
     getJob(id)           -> Promise<{status, docType, markdown, json, pages:[{idx,route,reason,ms,cost,degraded}], totalCost}>
     listSamples()        -> Promise<[...]>
     listHistory()        -> Promise<[...]>
     getLimits()          -> Promise<{maxBytes,maxPages}>
   Extra mock-only fields (blocks, via, rendered, free ...) feed the page preview and can be dropped. */
(function (global) {
  'use strict';

  const MAX_BYTES = 40000000;
  const MAX_PAGES = 10;
  const DOC_CAP = 0.05;
  const EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx', 'pptx'];
  const STRUCTURED = ['docx', 'xlsx', 'pptx'];
  const STORE_KEY = 'docx-playground-history-v1';

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const err = (code, details) => Object.assign(new Error(code), { code, details: details || {} });

  /* ---------- content blocks (feed page preview and Markdown) ---------- */
  const H = (text) => ({ t: 'h', text });
  const P = (text) => ({ t: 'p', text });
  const KV = (rows) => ({ t: 'kv', rows });
  const TB = (head, rows) => ({ t: 'table', head, rows });
  const UL = (items) => ({ t: 'list', items });
  const TXT = 'Text layer';
  const page = (route, reason, ms, cost, blocks, extra) =>
    Object.assign({ route, reason, ms, cost, degraded: false, blocks }, extra || {});

  function blockMd(b, first) {
    switch (b.t) {
      case 'h': return (first ? '# ' : '## ') + b.text;
      case 'p': return b.text;
      case 'kv': return b.rows.map(([k, v]) => `- **${k}:** ${v}`).join('\n');
      case 'list': return b.items.map((i) => `- ${i}`).join('\n');
      case 'table':
        return `| ${b.head.join(' | ')} |\n| ${b.head.map(() => '---').join(' | ')} |\n` +
          b.rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
      default: return '';
    }
  }
  function toMarkdown(pages) {
    let seenHeading = false;
    return pages.map((p, i) => {
      const body = p.blocks.map((b) => {
        const first = b.t === 'h' && !seenHeading;
        if (b.t === 'h') seenHeading = true;
        return blockMd(b, first);
      }).join('\n\n');
      return `<!-- page ${i + 1} -->\n\n${body}`;
    }).join('\n\n');
  }

  /* ---------- fictional document templates ---------- */
  const INVOICE = {
    name: 'Sample invoice.pdf', ext: 'pdf', size: 184320, docType: 'invoice',
    pages: [
      page(TXT, 'Digital text found, no OCR needed', 180, 0, [
        H('Invoice INV-2026-0417'),
        KV([['Issued', '2026-03-04'], ['Due', '2026-04-03'], ['From', 'Harbor & Pine Supply Co.'], ['Bill to', 'Northfield Studio Ltd']]),
        TB(['Item', 'Qty', 'Unit', 'Amount'], [
          ['Archival folders, box of 50', '4', '18.50', '74.00'],
          ['Label printer rolls', '6', '9.25', '55.50'],
          ['Desk organiser set', '2', '31.00', '62.00']])]),
      page('OCR', 'Scanned page, read locally', 1240, 0.001, [
        TB(['Item', 'Qty', 'Unit', 'Amount'], [
          ['Packing tape', '12', '2.10', '25.20'],
          ['Delivery', '1', '14.00', '14.00']]),
        KV([['Subtotal', '230.70'], ['Tax (8%)', '18.46'], ['Total due', '249.16']]),
        P('Payment by bank transfer within 30 days of the issue date.')])
    ],
    json: {
      doc_type: 'invoice', invoice_number: 'INV-2026-0417', issue_date: '2026-03-04', due_date: '2026-04-03',
      vendor: { name: 'Harbor & Pine Supply Co.' }, customer: { name: 'Northfield Studio Ltd' }, currency: 'USD',
      line_items: [
        { description: 'Archival folders, box of 50', quantity: 4, unit_price: 18.5, amount: 74.0 },
        { description: 'Label printer rolls', quantity: 6, unit_price: 9.25, amount: 55.5 },
        { description: 'Desk organiser set', quantity: 2, unit_price: 31.0, amount: 62.0 },
        { description: 'Packing tape', quantity: 12, unit_price: 2.1, amount: 25.2 },
        { description: 'Delivery', quantity: 1, unit_price: 14.0, amount: 14.0 }],
      subtotal: 230.7, tax: 18.46, total: 249.16
    }
  };

  const RECEIPT = {
    name: 'Sample receipt.jpg', ext: 'jpg', size: 912384, docType: 'receipt',
    pages: [
      page('Vision', 'OCR was unsure about a table, sent to the vision model', 2310, 0.013, [
        H('Corner Bean Cafe'),
        KV([['Date', '2026-02-19 08:42'], ['Table', 'Counter']]),
        TB(['Item', 'Qty', 'Price'], [
          ['Flat white', '2', '8.40'], ['Almond croissant', '1', '3.80'], ['Sparkling water', '1', '2.50']]),
        KV([['Subtotal', '14.70'], ['Tax (8%)', '1.18'], ['Total', '15.88'], ['Paid', 'Card']])],
      { via: { route: 'OCR', reason: 'Photo of a receipt, read locally first', cost: 0.001 } })
    ],
    json: {
      doc_type: 'receipt', merchant: 'Corner Bean Cafe', date: '2026-02-19', currency: 'USD',
      items: [
        { description: 'Flat white', quantity: 2, amount: 8.4 },
        { description: 'Almond croissant', quantity: 1, amount: 3.8 },
        { description: 'Sparkling water', quantity: 1, amount: 2.5 }],
      subtotal: 14.7, tax: 1.18, total: 15.88, payment_method: 'card'
    }
  };

  const CONTRACT = {
    name: 'Sample contract.pdf', ext: 'pdf', size: 402944, docType: 'contract',
    pages: [
      page(TXT, 'Digital text found, no OCR needed', 210, 0, [
        H('Master services agreement'),
        KV([['Effective date', '2026-01-15'], ['Provider', 'Alder Row Consulting'], ['Client', 'Fenwick Logistics Ltd']]),
        P('This agreement sets out the terms on which the Provider delivers process review services to the Client.')]),
      page(TXT, 'Digital text found, no OCR needed', 190, 0, [
        H('2. Services and fees'),
        UL(['Monthly process review and written findings', 'Two on-site workshops per quarter', 'Email support on business days']),
        TB(['Item', 'Fee (USD)'], [['Monthly retainer', '4,200.00'], ['On-site workshop', '1,350.00'], ['Travel', 'At cost']]),
        P('Invoices are payable within 30 days (Net 30).')]),
      page(TXT, 'Digital text found, no OCR needed', 170, 0, [
        H('3. Term and termination'),
        P('The initial term is 12 months from the effective date and renews for further 12-month terms unless either party gives notice.'),
        P('Either party may terminate with 30 days written notice. Governing law: State of Delaware.')]),
      page('OCR', 'Signature page is a scan, read locally', 1180, 0.001, [
        H('Signatures'),
        KV([['Provider', 'Dana Whitlock, Managing partner'], ['Client', 'Ravi Anand, Head of operations'], ['Signed', '2026-01-12']])])
    ],
    json: {
      doc_type: 'contract', title: 'Master services agreement',
      parties: [{ name: 'Alder Row Consulting', role: 'Provider' }, { name: 'Fenwick Logistics Ltd', role: 'Client' }],
      effective_date: '2026-01-15', term_months: 12, auto_renew: true, payment_terms: 'Net 30',
      monthly_fee_usd: 4200, termination_notice_days: 30, governing_law: 'State of Delaware',
      signatories: [{ name: 'Dana Whitlock', title: 'Managing partner' }, { name: 'Ravi Anand', title: 'Head of operations' }]
    }
  };

  const WORD = 'Word file, text read directly';
  const RESUME = {
    name: 'Sample resume.docx', ext: 'docx', size: 58368, docType: 'resume',
    pages: [
      page(TXT, WORD, 90, 0, [
        H('Avery Sample'),
        KV([['Headline', 'Operations analyst'], ['Email', 'avery.sample@example.com'], ['Location', 'Rotterdam, NL']]),
        P('Operations analyst with six years of experience in freight scheduling and reporting.'),
        H('Experience'),
        UL(['Operations analyst, Brightwater Freight, 2022 to present', 'Junior analyst, Kestrel Ledger, 2019 to 2022'])]),
      page(TXT, WORD, 110, 0, [
        H('Education'),
        UL(['BSc Logistics, Harbourside University, 2019']),
        H('Skills'),
        UL(['Spreadsheet modelling', 'SQL reporting', 'Route planning', 'Stakeholder updates'])])
    ],
    json: {
      doc_type: 'resume', name: 'Avery Sample', email: 'avery.sample@example.com', location: 'Rotterdam, NL',
      headline: 'Operations analyst', skills: ['Spreadsheet modelling', 'SQL reporting', 'Route planning', 'Stakeholder updates'],
      experience: [
        { company: 'Brightwater Freight', title: 'Operations analyst', start: '2022', end: 'present' },
        { company: 'Kestrel Ledger', title: 'Junior analyst', start: '2019', end: '2022' }],
      education: [{ school: 'Harbourside University', degree: 'BSc Logistics', year: 2019 }]
    }
  };

  const TEMPLATES = { invoice: INVOICE, receipt: RECEIPT, contract: CONTRACT, resume: RESUME, cv: RESUME };

  /* ---------- generic content for documents without a template ---------- */
  function genericPages(title, routes) {
    return routes.map((r, i) => Object.assign({
      ms: r.ms || 200, cost: 0, degraded: false,
      blocks: [
        H(i === 0 ? title : `${title} (continued)`),
        P(`Mock content for page ${i + 1} of ${routes.length}. The real service returns the text it reads from this page.`),
        KV([['Source page', String(i + 1)]])]
    }, r));
  }
  function genericJson(title, ext, n, extra) {
    return {
      doc_type: 'other', schema: 'generic', title,
      summary: `Mock summary for ${title}. The real service writes one or two sentences describing the document.`,
      key_fields: [{ name: 'File type', value: ext.toUpperCase() }, { name: 'Pages', value: String(n) }].concat(extra || [])
    };
  }

  /* ---------- job store ---------- */
  const records = new Map(); // id -> {final, state, timers, log, subs, donePages}
  let history = []; // [{id, at}] newest first
  let seq = 0;

  function makeJob(id, o) {
    const pages = o.pages.map((p, i) => ({
      idx: i + 1, route: p.route, reason: p.reason, ms: p.ms, cost: p.cost, degraded: !!p.degraded, blocks: p.blocks, via: p.via
    }));
    return {
      id, name: o.name, ext: o.ext, size: o.size, status: o.status || 'complete', docType: o.docType,
      markdown: toMarkdown(o.pages), json: o.json, rendered: STRUCTURED.includes(o.ext), pages,
      pageCount: pages.length, totalCost: round3(pages.reduce((s, p) => s + p.cost, 0)), free: !!o.free, createdAt: o.at
    };
  }
  function seed(id, o) {
    records.set(id, { final: makeJob(id, o), state: 'done', timers: [], log: [], subs: new Set(), donePages: [] });
  }

  const now = Date.now();
  const HOUR = 3600e3;
  const SAMPLE_DEFS = [
    ['sample-invoice', INVOICE, 'Two-page supplier invoice with line items'],
    ['sample-receipt', RECEIPT, 'Photographed cafe receipt'],
    ['sample-contract', CONTRACT, 'Four-page services agreement'],
    ['sample-resume', RESUME, 'Two-page Word resume']
  ];
  SAMPLE_DEFS.forEach(([id, tpl]) => seed(id, Object.assign({}, tpl, { free: true, at: now })));

  const STMT = 'Supplier statement, March 2026';
  seed('hist-statement', {
    name: 'Supplier statement scan.pdf', ext: 'pdf', size: 2411520, docType: 'other', status: 'partial', at: now - 3 * HOUR,
    pages: genericPages(STMT, [
      { route: TXT, reason: 'Digital text found, no OCR needed', ms: 160 },
      { route: 'Vision', reason: 'OCR was unsure about a table, sent to the vision model', ms: 2280, cost: 0.013,
        via: { route: 'OCR', reason: 'Scanned page, read locally first', cost: 0.001 } },
      { route: 'OCR', reason: 'Vision model was unavailable, fell back to OCR', ms: 1330, cost: 0.001, degraded: true },
      { route: 'OCR', reason: 'Vision model was unavailable, fell back to OCR', ms: 1290, cost: 0.001, degraded: true }]),
    json: genericJson(STMT, 'pdf', 4, [{ name: 'Statement period', value: 'March 2026' }, { name: 'Supplier', value: 'Harbor & Pine Supply Co.' }])
  });
  seed('hist-lease', {
    name: 'Lease notes.pdf', ext: 'pdf', size: 733184, docType: 'unknown', at: now - 26 * HOUR,
    pages: genericPages('Lease notes', [
      { route: TXT, reason: 'Digital text found, no OCR needed', ms: 150 },
      { route: TXT, reason: 'Digital text found, no OCR needed', ms: 140 }]),
    json: null
  });
  seed('hist-board', {
    name: 'Board update.pptx', ext: 'pptx', size: 1523712, docType: 'other', at: now - 52 * HOUR,
    pages: genericPages('Board update, Q1', [
      { route: TXT, reason: 'Slides file, text read directly', ms: 80 },
      { route: TXT, reason: 'Slides file, text read directly', ms: 90 },
      { route: TXT, reason: 'Slides file, text read directly', ms: 70 }]),
    json: genericJson('Board update, Q1', 'pptx', 3, [{ name: 'Slides', value: '3' }])
  });
  history = [['hist-statement', now - 3 * HOUR], ['hist-lease', now - 26 * HOUR], ['hist-board', now - 52 * HOUR]]
    .map(([id, at]) => ({ id, at }));

  /* Documents created in this browser survive a reload when storage is available. */
  function persist() {
    try {
      const saved = history.filter((h) => h.id.startsWith('job-')).slice(0, 20)
        .map((h) => ({ at: h.at, final: records.get(h.id).final }));
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch (e) { /* storage blocked: history stays in memory */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    saved.forEach(({ at, final }) => {
      seq = Math.max(seq, Number(final.id.replace('job-', '')) || 0);
      records.set(final.id, { final, state: 'done', timers: [], log: [], subs: new Set(), donePages: [] });
      history.push({ id: final.id, at });
    });
    history.sort((a, b) => b.at - a.at);
  } catch (e) { /* ignore */ }

  /* ---------- building a job from an uploaded file ---------- */
  function pretty(name) {
    const base = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Untitled document';
  }

  function specFor(file, ext, low) {
    const title = pretty(file.name);
    const tplKey = Object.keys(TEMPLATES).find((k) => low.includes(k));
    const markdownOnly = /markdown|noextract/.test(low);
    const partial = /scan|partial/.test(low);
    let pages, json, docType;

    if (tplKey) {
      const tpl = TEMPLATES[tplKey];
      docType = tpl.docType;
      json = tpl.json;
      pages = tpl.pages.map((p) => STRUCTURED.includes(ext)
        ? Object.assign({}, p, { route: TXT, reason: 'Structured file, read directly', cost: 0, via: undefined })
        : Object.assign({}, p));
    } else {
      const n = /long|big/.test(low) ? 12
        : ext === 'pdf' ? Math.min(5, Math.max(2, Math.floor(file.size / 250000) + 2))
        : ext === 'pptx' ? 3 : STRUCTURED.includes(ext) ? 2 : 1;
      const routes = Array.from({ length: n }, (_, i) => {
        if (STRUCTURED.includes(ext)) return { route: TXT, reason: 'Structured file, read directly', ms: 90 };
        if (ext !== 'pdf') return { route: 'OCR', reason: 'Image file, read locally', ms: 1100, cost: 0.001 };
        return i % 3 === 2
          ? { route: 'OCR', reason: 'Scanned page, read locally', ms: 1200, cost: 0.001 }
          : { route: TXT, reason: 'Digital text found, no OCR needed', ms: 170 };
      });
      pages = genericPages(title, routes);
      docType = 'other';
      json = genericJson(title, ext, n);
    }
    if (partial) {
      const last = pages.length - 1;
      pages[last] = Object.assign({}, pages[last], {
        route: 'OCR', reason: 'Vision model was unavailable, fell back to OCR', ms: 1300, cost: 0.001, degraded: true, via: undefined
      });
    }
    if (markdownOnly) { json = null; docType = 'unknown'; }
    return { pages, json, docType, status: pages.some((p) => p.degraded) ? 'partial' : 'complete' };
  }

  function emit(rec, ev) {
    const full = Object.assign({ jobId: rec.final.id }, ev);
    rec.log.push(full);
    rec.subs.forEach((cb) => cb(full));
  }

  function schedule(rec) {
    const f = rec.final;
    let t = 0;
    const at = (delay, fn) => { t += delay; rec.timers.push(setTimeout(fn, t)); };

    at(250, () => f.pages.forEach((p) => emit(rec, { page: p.idx, status: 'waiting', route: null, reason: null, cost: 0 })));
    f.pages.forEach((p) => {
      const done = () => {
        rec.donePages.push(p);
        emit(rec, { page: p.idx, status: 'done', route: p.route, reason: p.reason, cost: p.cost, ms: p.ms, degraded: p.degraded });
      };
      if (p.via) {
        at(300, () => emit(rec, { page: p.idx, status: 'reading', route: p.via.route, reason: p.via.reason, cost: p.via.cost }));
        at(850, () => emit(rec, { page: p.idx, status: 'reading', route: p.route, reason: p.reason, cost: p.via.cost }));
        at(750, done);
      } else {
        at(300, () => emit(rec, { page: p.idx, status: 'reading', route: p.route, reason: p.reason, cost: 0 }));
        at(Math.min(1100, Math.max(500, p.ms * 0.6)), done);
      }
    });
    at(350, () => emit(rec, { step: 'classify', status: 'reading' }));
    at(1100, () => emit(rec, { step: 'classify', status: f.json ? 'done' : 'failed' }));
    at(250, () => {
      rec.state = 'done';
      history.unshift({ id: f.id, at: Date.now() });
      persist();
      emit(rec, { step: 'complete', status: f.status });
    });
  }

  /* ---------- public API ---------- */
  async function createJob(file) {
    await wait(350);
    const name = file.name || 'file';
    const low = name.toLowerCase();
    const ext = low.includes('.') ? low.split('.').pop() : '';
    if (!EXTS.includes(ext)) throw err('unsupported', { ext });
    if (file.size > MAX_BYTES) throw err('too_large', { size: file.size });
    if (/encrypt|locked|password/.test(low)) throw err('encrypted');
    if (/damaged|corrupt|broken/.test(low)) throw err('damaged');

    const spec = specFor(file, ext, low);
    if (spec.pages.length > MAX_PAGES) throw err('too_many_pages', { pages: spec.pages.length });

    const id = `job-${++seq}`;
    const final = makeJob(id, Object.assign({ name, ext, size: file.size || 0, at: Date.now() }, spec));
    const rec = { final, state: 'running', timers: [], log: [], subs: new Set(), donePages: [] };
    records.set(id, rec);
    schedule(rec);
    return { id };
  }

  function onProgress(id, cb) {
    const rec = records.get(id);
    if (!rec) return () => {};
    rec.log.forEach(cb);
    rec.subs.add(cb);
    return () => rec.subs.delete(cb);
  }

  async function getJob(id) {
    await wait(60);
    const rec = records.get(id);
    if (!rec) throw err('not_found');
    if (rec.state === 'done') return rec.final;
    const f = rec.final;
    return {
      id, name: f.name, ext: f.ext, size: f.size, status: 'running', docType: null, markdown: '', json: null,
      rendered: f.rendered, pageCount: f.pageCount, pages: rec.donePages.map(({ blocks, via, ...p }) => p),
      totalCost: round3(rec.donePages.reduce((s, p) => s + p.cost, 0))
    };
  }

  function cancelJob(id) {
    const rec = records.get(id);
    if (!rec || rec.state !== 'running') return;
    rec.timers.forEach(clearTimeout);
    rec.state = 'canceled';
    rec.subs.clear();
    records.delete(id);
  }

  async function listSamples() {
    await wait(40);
    return SAMPLE_DEFS.map(([id, tpl, blurb]) => ({
      id, name: tpl.name, docType: tpl.docType, ext: tpl.ext, pages: tpl.pages.length, blurb
    }));
  }

  async function listHistory() {
    await wait(40);
    return history.map(({ id, at }) => {
      const f = records.get(id).final;
      return { id, name: f.name, docType: f.docType, pages: f.pageCount, cost: f.totalCost, at, status: f.status };
    });
  }

  async function getLimits() {
    await wait(30);
    return { maxBytes: MAX_BYTES, maxPages: MAX_PAGES, docCapUsd: DOC_CAP };
  }

  global.DocApi = { createJob, onProgress, getJob, cancelJob, listSamples, listHistory, getLimits, DOC_CAP };
})(window);
