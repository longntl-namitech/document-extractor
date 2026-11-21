/* Real client for the playground UI: same window.DocApi shape as api.js (the mock),
   backed by POST /api/extract on server.py, which calls extractor.extract_file().
   Loaded with ?api=real. The service has no per-page routes, JSON fields or cost,
   so each file is one "page" and the result is Markdown only. */
(function (global) {
  'use strict';

  const MAX_BYTES = 50 * 1024 * 1024; // MAX_FILE_SIZE of the extractor
  const EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'docx', 'xlsx', 'pptx'];
  const CODES = ['encrypted', 'damaged', 'scanned']; // error_code values the UI has copy for
  const err = (code, details) => Object.assign(new Error(code), { code, details: details || {} });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const records = new Map();
  const history = [];
  let seq = 0;

  function blocksOf(markdown) {
    const parts = markdown.split(/\n{2,}/).filter((s) => s.trim());
    return (parts.length ? parts : ['(empty)']).map((text) => ({ t: 'p', text }));
  }

  function emit(rec, ev) {
    const full = Object.assign({ jobId: rec.final.id }, ev);
    rec.log.push(full);
    rec.subs.forEach((cb) => cb(full));
  }

  function replay(rec) {
    const p = rec.final.pages[0];
    const at = (delay, fn) => setTimeout(fn, delay);
    at(100, () => emit(rec, { page: 1, status: 'reading', route: p.route, reason: p.reason, cost: 0 }));
    at(400, () => emit(rec, { page: 1, status: 'done', route: p.route, reason: p.reason, cost: 0, ms: p.ms, degraded: false }));
    at(600, () => emit(rec, { step: 'classify', status: 'failed' }));
    at(700, () => {
      rec.state = 'done';
      emit(rec, { step: 'complete', status: 'complete' });
    });
  }

  async function createJob(file) {
    const name = file.name || 'file';
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (!EXTS.includes(ext)) throw err('unsupported', { ext });
    if (file.size > MAX_BYTES) throw err('too_large', { size: file.size });

    const body = new FormData();
    body.append('file', file, name);
    const started = performance.now();
    let res;
    try {
      res = await fetch('api/extract', { method: 'POST', body });
    } catch (e) {
      throw err('network');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // unknown or missing codes fall to the default error copy
      throw err(CODES.includes(data.error_code) ? data.error_code : 'failed', { message: data.error });
    }

    const id = `job-${++seq}`;
    const ms = Math.round(data.ms != null ? data.ms : performance.now() - started);
    const page = {
      idx: 1, route: 'Text layer', reason: `Engine: ${data.engine} (${data.file_type})`,
      ms, cost: 0, degraded: false, blocks: blocksOf(data.text || '')
    };
    const final = {
      id, name, ext, size: file.size || 0, status: 'complete', docType: 'unknown',
      markdown: data.text || '', json: null, rendered: false, pages: [page], pageCount: 1,
      totalCost: 0, free: false, createdAt: Date.now(),
      file /* uploaded File, the UI shows it as the original (pdf, csv, image) */
    };
    const rec = { final, state: 'running', log: [], subs: new Set() };
    records.set(id, rec);
    history.unshift({ id, at: final.createdAt });
    replay(rec);
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
    await wait(20);
    const rec = records.get(id);
    if (!rec) throw err('not_found');
    return rec.final;
  }

  function cancelJob(id) {
    records.delete(id);
  }

  async function listSamples() {
    return [];
  }

  async function listHistory() {
    return history.filter((h) => records.has(h.id)).map(({ id, at }) => {
      const f = records.get(id).final;
      return { id, name: f.name, docType: f.docType, pages: f.pageCount, cost: 0, at, status: f.status };
    });
  }

  async function getLimits() {
    return { maxBytes: MAX_BYTES, maxPages: 1000, docCapUsd: 1 };
  }

  global.DocApi = { createJob, onProgress, getJob, cancelJob, listSamples, listHistory, getLimits, DOC_CAP: 1 };
})(window);
