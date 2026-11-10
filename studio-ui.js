import { SketchSession } from './sketch-session.js';
import { MATERIAL_TOOLS } from './material-engine.js';
import { createPracticeDrawing } from './practice.js';
import { MarkEngine } from './mark-engine.js';
import { paperName } from './page-program.js';

const $ = id => document.getElementById(id);
const ACTIVE_KEY = 'agent-sketchbook.material-studio.active.v1';
const DRAFTS_KEY = 'agent-sketchbook.material-studio.drafts.v1';
const LESSONS_KEY = 'agent-sketchbook.material-studio.lessons.v1';
let SERVER = false;
const ctx = $('drawing-canvas').getContext('2d');
/* A sheet in the old graphite form names its paper by these; a live sheet
 * stores the colour a page would, and is named the way a page names it. */
const paperNames = { white: 'Warm white', toned: 'Toned paper', black: 'Black paper' };
const oldForm = () => session.surface.kind !== 'ink';
function paperLabel() {
  if (oldForm()) return paperNames[session.surface.paper] || session.surface.paper;
  const name = paperName(session.surface.paper);
  return name.startsWith('#') ? `${name} paper` : `${name[0].toUpperCase()}${name.slice(1)} paper`;
}
function paperColour() {
  if (oldForm()) return ({ white: '#f6f3e9', toned: '#b5a68e', black: '#17191d' })[session.surface.paper] || '#f6f3e9';
  return session.surface.paper === 'night' ? '#0b0b0f' : session.surface.paper;
}
const symbols = { 'graphite-hb': 'HB', 'graphite-2b': '2B', 'graphite-6b': '6B', 'vine-charcoal': 'V', 'compressed-charcoal': 'C', 'white-chalk': 'W', stump: 'S', 'kneaded-eraser': 'K', 'precision-eraser': 'E' };
const toolOrder = Object.keys(symbols);
let session = new SketchSession({ title: 'Untitled study' });
let unsubscribe, dirty = true, pointer = null, strokeStart = 0, replayEngine = null, lastFrame = 0;
let lastContact = null, lastContactClock = 0;
let ready = false, replacing = false, localCounter = 0, pendingPut = false, sending = null, saveTimer;
let serverRevision = null, remoteWait = null, lastRemoteError = '', appBusy = false;
let drafts = [], lessons = [], serverDrafts = [], serverLessons = [];
let noticeTimer;

function report(error) {
  const message = error?.message || String(error);
  $('error').textContent = message;
  $('error').hidden = false;
  const dialog = document.querySelector('dialog[open]');
  if (dialog) {
    let inline = dialog.querySelector('.dialog-error');
    if (!inline) { inline = document.createElement('p'); inline.className = 'dialog-error'; inline.setAttribute('role', 'alert'); (dialog.querySelector('form') || dialog).append(inline); }
    inline.textContent = message;
  }
}
function clearError() { $('error').hidden = true; $('error').textContent = ''; for (const node of document.querySelectorAll('.dialog-error')) node.remove(); }
function notice(message) {
  clearTimeout(noticeTimer);
  $('notice').querySelector('span').textContent = message; $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 5000);
}
$('notice').querySelector('button').onclick = () => { clearTimeout(noticeTimer); $('notice').hidden = true; };
function status(message) { $('save-status').textContent = message; }
function storageRead(key, fallback) {
  const text = localStorage.getItem(key);
  return text ? JSON.parse(text) : fallback;
}
function storageWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw Error('Browser storage is full or unavailable. Export the drawing as JSON to keep a copy.'); }
}
function drawSoon() { dirty = true; }
function updateSize() {
  const { w, h } = session.page;
  if ($('drawing-canvas').width !== w || $('drawing-canvas').height !== h) {
    $('drawing-canvas').width = w; $('drawing-canvas').height = h;
  }
  $('paper-stage').style.setProperty('--page-width', `${w}px`);
  $('paper-stage').style.setProperty('--page-ratio', `${w}/${h}`);
  $('paper-stage').style.setProperty('--paper', paperColour());
  $('drawing-canvas').setAttribute('aria-label', `${session.title || 'Untitled study'} on ${paperLabel().toLowerCase()}`);
}
function updateControls() {
  $('undo-button').disabled = appBusy || session.active || !!replayEngine || !session.ops.length;
  $('redo-button').disabled = appBusy || session.active || !!replayEngine || !session.canRedo;
  $('replay-button').disabled = appBusy || session.active || !session.ops.length;
  $('replay-button').textContent = replayEngine ? 'Finish replay' : 'Replay';
  $('drawing-info').textContent = `${session.page.w} × ${session.page.h} · ${session.ops.length.toLocaleString()} marks`;
  $('paper-description').textContent = `${paperLabel()} · ${Math.round(session.surface.tooth * 100)}% tooth`;
  $('review-count').textContent = session.reviews?.length ? `(${session.reviews.length})` : '';
  for (const button of $('material-tools').children) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === session.tool));
    button.disabled = appBusy || session.active;
  }
  $('clean-button').hidden = session.tool !== 'stump';
  const tool = MATERIAL_TOOLS[session.tool];
  $('tool-description').textContent = tool?.description || '';
  if (document.activeElement !== $('drawing-title')) $('drawing-title').value = session.title || 'Untitled study';
}
function useSession(next) {
  unsubscribe?.(); session = next;
  unsubscribe = session.subscribe(() => {
    drawSoon(); updateControls();
    if (!session.active && !replacing) changed();
  });
  updateSize(); updateControls(); renderReviews(); drawSoon();
}
function changed() {
  if (replacing || !ready || session.active) return;
  localCounter++;
  try { storageWrite(ACTIVE_KEY, session.export()); }
  catch (error) { report(error); status('Local save failed'); }
  if (SERVER) {
    pendingPut = true; status('Saving…');
    clearTimeout(saveTimer); saveTimer = setTimeout(() => flush().catch(report), 200);
  } else status('Saved on this device');
  window.dispatchEvent(new CustomEvent('studio:change', { detail: { drawing: session.export() } }));
}
function setBusy(value) { appBusy = value; document.body.classList.toggle('busy', value); updateControls(); }
function stopReplay() { if (!replayEngine) return; replayEngine = null; drawSoon(); updateControls(); }
function syncSettings() {
  $('size').value = session.settings?.size ?? MATERIAL_TOOLS[session.tool]?.size ?? 2;
  $('strength').value = session.settings?.strength ?? 1;
  updateSliderLabels();
}
function updateSliderLabels() {
  $('size-value').value = `${Number($('size').value).toFixed(1)}`;
  $('strength-value').value = `${Math.round(Number($('strength').value) * 100)}%`;
  $('pressure-value').value = `${Math.round(Number($('pressure').value) * 100)}%`;
  $('tilt-x-value').value = `${$('tilt-x').value}°`; $('tilt-y-value').value = `${$('tilt-y').value}°`;
  $('tilt-summary').textContent = `${$('tilt-x').value}° / ${$('tilt-y').value}°`;
  $('new-tooth-value').value = `${Math.round(Number($('new-tooth').value) * 100)}%`;
}
function selectTool(tool) {
  if (!ready || session.active || appBusy) return;
  stopReplay();
  session.select(tool, { size: MATERIAL_TOOLS[tool].size, strength: Number($('strength').value) });
  syncSettings(); updateControls();
}
for (const id of toolOrder) {
  const tool = MATERIAL_TOOLS[id];
  if (!tool) continue;
  const button = document.createElement('button'); button.className = 'material-tool'; button.dataset.tool = id;
  button.setAttribute('aria-pressed', String(session.tool === id)); button.title = tool.description || tool.name;
  const symbol = document.createElement('span'); symbol.className = 'tool-symbol'; symbol.textContent = symbols[id]; symbol.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.textContent = tool.name;
  button.append(symbol, text); button.onclick = () => selectTool(id); $('material-tools').append(button);
}
for (const id of ['size', 'strength', 'pressure', 'tilt-x', 'tilt-y', 'new-tooth']) $(id).oninput = () => {
  updateSliderLabels();
  if ((id === 'size' || id === 'strength') && ready && !session.active) session.select(session.tool, { size: Number($('size').value), strength: Number($('strength').value) });
};
$('settings-toggle').onclick = () => {
  const expanded = document.querySelector('.tool-shelf').classList.toggle('settings-open'); $('settings-toggle').setAttribute('aria-expanded', String(expanded));
};

function sample(event) {
  const rect = $('drawing-canvas').getBoundingClientRect();
  return {
    x: Math.max(-399, Math.min(session.page.w + 399, (event.clientX - rect.left) * session.page.w / rect.width)),
    y: Math.max(-399, Math.min(session.page.h + 399, (event.clientY - rect.top) * session.page.h / rect.height)),
    p: event.pointerType === 'pen' ? event.pressure : Number($('pressure').value),
    t: Math.max((lastContact?.t ?? -.01) + .01, event.timeStamp - strokeStart),
    tiltX: event.pointerType === 'pen' ? event.tiltX : Number($('tilt-x').value),
    tiltY: event.pointerType === 'pen' ? event.tiltY : Number($('tilt-y').value),
  };
}
function cursor(event) {
  const rect = $('drawing-canvas').getBoundingClientRect(), el = $('tool-cursor');
  el.style.left = `${event.clientX - rect.left}px`; el.style.top = `${event.clientY - rect.top}px`;
  const width = Math.max(3, Number($('size').value) * rect.width / session.page.w);
  el.style.width = `${width}px`; el.style.height = `${width}px`; el.style.display = event.pointerType === 'touch' ? 'none' : 'block';
}
$('drawing-canvas').addEventListener('pointerdown', event => {
  if (!ready || appBusy || session.active || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); clearError(); stopReplay();
  pointer = event.pointerId; strokeStart = event.timeStamp; lastContact = null;
  $('drawing-canvas').setPointerCapture(pointer);
  try {
    lastContact = sample(event); lastContactClock = performance.now(); session.touch(lastContact);
    $('input-status').textContent = event.pointerType === 'pen' ? 'Pen pressure and tilt' : 'Drawing';
  }
  catch (error) { pointer = null; report(error); }
  cursor(event);
});
$('drawing-canvas').addEventListener('pointermove', event => {
  cursor(event);
  if (event.pointerId !== pointer || !session.active) return;
  event.preventDefault();
  const events = event.getCoalescedEvents?.();
  try {
    let previousTime = lastContact?.t ?? -.01;
    const samples = (events?.length ? events : [event]).map(event => {
      const contact = sample(event); contact.t = Math.max(contact.t, previousTime + .01); previousTime = contact.t; return contact;
    });
    session.move(samples); lastContact = samples.at(-1); lastContactClock = performance.now();
  }
  catch (error) { report(error); finishPointer(); }
});
function finishPointer() {
  if (pointer === null) return;
  const currentPointer = pointer; pointer = null; lastContact = null;
  if (currentPointer !== null && $('drawing-canvas').hasPointerCapture(currentPointer)) $('drawing-canvas').releasePointerCapture(currentPointer);
  try { if (session.active) session.lift(); }
  catch (error) { report(error); }
  $('input-status').textContent = 'Paused to look';
  if (remoteWait) applyConflict(remoteWait).catch(report);
}
$('drawing-canvas').addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  try { if (session.active) session.move([sample(event)]); } catch (error) { report(error); }
  finishPointer();
});
$('drawing-canvas').addEventListener('pointercancel', event => { if (event.pointerId === pointer) finishPointer(); });
$('drawing-canvas').addEventListener('lostpointercapture', event => { if (event.pointerId === pointer) finishPointer(); });
$('drawing-canvas').addEventListener('pointerleave', () => { $('tool-cursor').style.display = 'none'; });
window.addEventListener('blur', finishPointer);

function safeAction(fn) { return async (...args) => { if (!ready || appBusy || session.active) return; clearError(); try { await fn(...args); } catch (error) { report(error); } }; }
$('undo-button').onclick = safeAction(() => { stopReplay(); session.undo(); renderReviews(); });
$('redo-button').onclick = safeAction(() => { stopReplay(); session.redo(); renderReviews(); });
$('clean-button').onclick = safeAction(() => { session.clean(); notice('The stump is clean. Its next contact will pick up fresh pigment.'); });
$('zoom-button').onclick = () => { const on = $('paper-viewport').classList.toggle('zoom'); $('zoom-button').setAttribute('aria-pressed', String(on)); $('zoom-button').textContent = on ? 'Fit' : '100%'; };
$('replay-button').onclick = safeAction(() => {
  if (replayEngine) { stopReplay(); return; }
  replayEngine = new MarkEngine({ width: session.page.w, height: session.page.h, dpr: 1, surface: session.surface });
  replayEngine.load(session.ops).replay(); lastFrame = 0; updateControls();
});
$('drawing-title').onchange = safeAction(() => { session.title = $('drawing-title').value.trim() || 'Untitled study'; updateSize(); changed(); });
document.addEventListener('keydown', event => {
  if (event.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('dialog[open]')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) $('redo-button').click(); else $('undo-button').click(); }
  if (event.key === 'Escape') { stopReplay(); if (session.active) finishPointer(); }
});

function notesOpen(value) { $('review-panel').hidden = !value; $('notes-button').setAttribute('aria-expanded', String(value)); }
$('notes-button').onclick = () => notesOpen($('review-panel').hidden);
$('close-notes').onclick = () => notesOpen(false);
function paragraph(text, className) { const p = document.createElement('p'); p.textContent = text; if (className) p.className = className; return p; }
function renderReviews() {
  $('review-list').replaceChildren();
  for (const review of [...(session.reviews || [])].reverse()) {
    const item = document.createElement('article'); item.className = 'review-entry';
    const meta = document.createElement('small'); meta.textContent = `After ${(review.at ?? 0).toLocaleString()} marks`; item.append(meta);
    if (review.observation) item.append(paragraph(review.observation));
    if (review.lesson) { item.append(paragraph('Lesson', 'review-caption')); item.append(paragraph(review.lesson, 'review-lesson')); }
    if (review.next) { item.append(paragraph('Next pass', 'review-caption')); item.append(paragraph(review.next, 'review-next')); }
    $('review-list').append(item);
  }
}
$('review-form').onsubmit = event => {
  event.preventDefault(); if (!ready || session.active) return;
  try {
    const review = { observation: $('observation').value.trim(), lesson: $('lesson').value.trim(), next: $('next-step').value.trim() };
    if (!review.observation) return;
    session.review(review);
    if ($('save-lesson').checked && review.lesson) {
      lessons.unshift({ id: crypto.randomUUID(), title: session.title, lesson: review.lesson, next: review.next, date: new Date().toISOString() });
      storageWrite(LESSONS_KEY, lessons);
    }
    $('review-form').reset(); renderReviews(); updateControls();
  } catch (error) { report(error); }
};

async function request(path, options) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) { const error = Error(data.error || `The request failed (${response.status}).`); error.status = response.status; error.payload = data; throw error; }
  return data;
}
async function probeBridge() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/session', { cache: 'no-store', signal: controller.signal });
    if (response.status === 404 || response.status === 405) return null;
    if (!response.ok) throw Error(`The drawing bridge is unavailable (${response.status}).`);
    const data = await response.json();
    if (!Number.isSafeInteger(data.revision) || data.revision < 0 || !data.drawing || data.drawing.version !== 1) throw Error('The drawing bridge returned an invalid session.');
    return data;
  } finally { clearTimeout(timeout); }
}
async function replaceDrawing(drawing, { persist = true } = {}) {
  const next = new SketchSession(); next.import(drawing);
  stopReplay(); replacing = true;
  try {
    useSession(next); syncSettings();
    try { storageWrite(ACTIVE_KEY, session.export()); } catch (error) { if (SERVER) report(error); else throw error; }
  }
  finally { replacing = false; }
  if (persist) changed(); else { pendingPut = false; status(SERVER ? (session.active ? 'Agent drawing · live' : 'Saved · agent connected') : 'Saved on this device'); }
}
function localArchive(drawing = session.export(), name = drawing.title) {
  if (!drawing.ops?.length && !drawing.reviews?.length) return null;
  const entry = { id: crypto.randomUUID(), name: name || 'Untitled study', date: new Date().toISOString(), drawing };
  const next = [entry, ...drafts]; storageWrite(DRAFTS_KEY, next); drafts = next; return entry;
}
async function applyConflict(remote) {
  if (session.active) { remoteWait = remote; return; }
  remoteWait = null;
  localArchive(session.export(), `${session.title} · local copy`);
  serverRevision = remote.revision;
  await replaceDrawing(remote.drawing, { persist: false });
  notice('The agent changed this drawing while you were working. Your version is saved in the library as a local copy; the shared version is now open.');
}
async function flush() {
  clearTimeout(saveTimer);
  if (!SERVER || !ready || session.active || serverRevision === null) return;
  if (sending) { await sending; if (pendingPut) return flush(); return; }
  if (!pendingPut) return;
  const counter = localCounter, drawing = session.export(), revision = serverRevision;
  pendingPut = false;
  sending = (async () => {
    try {
      const result = await request('/api/session', { method: 'PUT', body: JSON.stringify({ revision, drawing }) });
      serverRevision = result.revision; lastRemoteError = '';
      status(counter === localCounter ? 'Saved · agent connected' : 'Saving…');
    } catch (error) {
      if (error.status === 409) { const remote = await request('/api/session'); await applyConflict(remote); }
      else { pendingPut = true; status('Saved locally · reconnecting'); lastRemoteError = error.message; throw error; }
    }
  })();
  try { await sending; } finally { sending = null; }
  if (pendingPut) return flush();
}
async function archiveCurrent(name) {
  finishPointer(); stopReplay(); await flush();
  let durable = false;
  if (SERVER && serverRevision !== null && (session.ops.length || session.reviews.length)) {
    const result = await request('/api/save', { method: 'POST', body: JSON.stringify({ revision: serverRevision, name: name || session.title }) });
    serverRevision = result.revision; durable = true;
  }
  try { return localArchive(session.export(), name); }
  catch (error) { if (!durable) throw error; notice('The drawing is saved on the server. Browser storage is full; the library will use the saved server copy.'); return null; }
}
$('save-button').onclick = safeAction(async () => {
  setBusy(true);
  try { await archiveCurrent(); status(SERVER ? 'Draft saved · agent connected' : 'Draft saved on this device'); notice('A copy of this drawing is saved in the library.'); }
  finally { setBusy(false); }
});
$('new-button').onclick = safeAction(() => {
  $('new-width').value = session.page.w; $('new-height').value = session.page.h;
  const paper = oldForm() ? session.surface.paper : paperName(session.surface.paper);
  $('new-paper').value = [...$('new-paper').options].some((option) => option.value === paper) ? paper : 'white';
  $('new-tooth').value = session.surface.tooth;
  updateSliderLabels(); $('new-dialog').showModal();
});
$('new-form').onsubmit = async event => {
  event.preventDefault(); if (appBusy) return;
  setBusy(true); clearError();
  try {
    const page = { w: Number($('new-width').value), h: Number($('new-height').value) };
    const surface = { kind: 'ink', version: 2, paper: $('new-paper').value, tooth: Number($('new-tooth').value), seed: crypto.getRandomValues(new Uint32Array(1))[0] % 1000000 };
    const candidate = new SketchSession({ title: $('new-title').value.trim() || 'Untitled study', page, surface });
    await archiveCurrent(); await replaceDrawing(candidate.export()); $('new-dialog').close(); notice('Previous work is saved in the library. The new sheet is ready.');
  } catch (error) { report(error); }
  finally { setBusy(false); }
};
$('practice-button').onclick = safeAction(async () => {
  setBusy(true);
  try { const drawing = createPracticeDrawing(); await archiveCurrent(); await replaceDrawing(drawing); notesOpen(false); notice('Practice sheet ready. Observations are in Notes.'); }
  finally { setBusy(false); }
});
for (const button of document.querySelectorAll('[data-close-dialog]')) button.onclick = () => button.closest('dialog').close();

function dateLabel(value) { const date = new Date(value); return Number.isFinite(date.valueOf()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
function renderLibrary() {
  $('saved-drawings').replaceChildren(); $('saved-lessons').replaceChildren();
  if (!drafts.length && !serverDrafts.length) $('saved-drawings').append(paragraph('Saved drafts appear here. Starting a new sheet keeps the previous drawing.', 'empty-list'));
  for (const saved of serverDrafts) {
    const row = document.createElement('div'); row.className = 'saved-row'; const text = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = saved.name || saved.title; text.append(title);
    const meta = document.createElement('small'); meta.textContent = `${dateLabel(saved.savedAt)} · ${Number(saved.marks).toLocaleString()} marks · kept by the server`; text.append(meta);
    const load = document.createElement('button'); load.textContent = 'Open'; load.onclick = safeAction(async () => {
      setBusy(true);
      try {
        await flush();
        const result = await request('/api/load', { method: 'POST', body: JSON.stringify({ revision: serverRevision, id: saved.id }) });
        serverRevision = result.revision; await replaceDrawing(result.drawing, { persist: false }); $('library-dialog').close(); notice('Saved drawing opened. Your previous work is also in the library.');
      } finally { setBusy(false); }
    }); row.append(text, load); $('saved-drawings').append(row);
  }
  for (const saved of drafts) {
    if (serverDrafts.some(remote => remote.name === saved.name && remote.marks === saved.drawing.ops.length && Math.abs(Date.parse(remote.savedAt) - Date.parse(saved.date)) < 5000)) continue;
    const row = document.createElement('div'); row.className = 'saved-row'; const text = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = saved.name || saved.drawing.title; text.append(title);
    const meta = document.createElement('small'); meta.textContent = `${dateLabel(saved.date)} · ${saved.drawing.ops.length.toLocaleString()} marks`; text.append(meta);
    const load = document.createElement('button'); load.textContent = 'Open'; load.onclick = safeAction(async () => {
      setBusy(true); try { await archiveCurrent(); await replaceDrawing(saved.drawing); $('library-dialog').close(); notice('Saved drawing opened. Your previous work is also in the library.'); } finally { setBusy(false); }
    }); row.append(text, load); $('saved-drawings').append(row);
  }
  const uniqueLessons = new Map([...lessons, ...serverLessons].filter(lesson => lesson.lesson).map(lesson => [JSON.stringify([lesson.title, lesson.lesson, lesson.next]), lesson]));
  if (!uniqueLessons.size) $('saved-lessons').append(paragraph('Keep a lesson from the notes panel to find it in future sessions.', 'empty-list'));
  for (const lesson of uniqueLessons.values()) {
    const item = document.createElement('article'); item.className = 'saved-lesson'; item.append(paragraph(lesson.lesson));
    if (lesson.next) item.append(paragraph(`Try next: ${lesson.next}`));
    const meta = document.createElement('small'); meta.textContent = `${lesson.title}${lesson.date || lesson.savedAt ? ` · ${dateLabel(lesson.date || lesson.savedAt)}` : ''}`; item.append(meta); $('saved-lessons').append(item);
  }
}
$('library-button').onclick = async () => {
  renderLibrary(); $('library-dialog').showModal();
  if (SERVER) {
    try {
      const results = await Promise.all([request('/api/saves'), request('/api/lessons')]);
      serverDrafts = results[0].saves; serverLessons = results[1].lessons; renderLibrary();
    } catch (error) { report(error); }
  }
};
function download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
function filename() { return (session.title || 'drawing').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'drawing'; }
$('json-button').onclick = safeAction(() => { download(new Blob([JSON.stringify(session.export(), null, 2)], { type: 'application/json' }), `${filename()}.json`); document.querySelector('.export-menu').open = false; });
$('png-button').onclick = safeAction(async () => {
  stopReplay();
  const scale = Math.min(2, Math.sqrt(3990000 / (session.page.w * session.page.h)));
  const canvas = session.inspect({ x: 0, y: 0, w: session.page.w, h: session.page.h, scale });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('The browser could not export this image.'); download(blob, `${filename()}.png`); document.querySelector('.export-menu').open = false;
});
$('import-button').onclick = () => { $('import-file').click(); document.querySelector('.export-menu').open = false; };
$('import-file').onchange = async () => {
  const file = $('import-file').files[0]; if (!file) return;
  if (session.active || appBusy) { report(Error('Finish the current stroke before importing a drawing.')); $('import-file').value = ''; return; }
  setBusy(true);
  try {
    if (file.size > 30000000) throw Error('This drawing is larger than the 30 MB import limit.');
    const drawing = JSON.parse(await file.text()); const candidate = new SketchSession(); candidate.import(drawing);
    await archiveCurrent(); await replaceDrawing(candidate.export()); notice('Drawing imported. Previous work is saved in the library.');
  } catch (error) { report(error); }
  finally { $('import-file').value = ''; setBusy(false); }
};
document.addEventListener('click', event => { if (!event.target.closest('.export-menu')) document.querySelector('.export-menu').open = false; });

function frame(time) {
  try {
    if (pointer !== null && session.active && lastContact && time - lastContactClock >= 64) {
      const held = { ...lastContact, t: Math.max(lastContact.t + .01, time - strokeStart) };
      session.move([held]); lastContact = held; lastContactClock = time;
    }
    if (replayEngine) {
      replayEngine.tick(Math.min(0.06, (time - (lastFrame || time)) / 1000), 3);
      replayEngine.composite(ctx); lastFrame = time;
      if (replayEngine.done) stopReplay();
    } else if (dirty) { session.draw(ctx, $('drawing-canvas').width, $('drawing-canvas').height); dirty = false; }
  } catch (error) { stopReplay(); if (pointer !== null) finishPointer(); dirty = false; report(error); }
  requestAnimationFrame(frame);
}
async function poll() {
  if (!SERVER || appBusy || pointer !== null || sending || replayEngine) return;
  try {
    if (pendingPut && ready) { await flush(); return; }
    const remote = await request('/api/session');
    if (pointer !== null || pendingPut || sending) return;
    if (remote.revision !== serverRevision) { serverRevision = remote.revision; await replaceDrawing(remote.drawing, { persist: false }); }
    ready = true;
    if (lastRemoteError) { clearError(); lastRemoteError = ''; status('Saved · agent connected'); }
  } catch (error) { lastRemoteError = error.message; status(ready ? 'Saved locally · reconnecting' : 'Drawing bridge unavailable · retrying'); }
}
async function start() {
  useSession(session); syncSettings(); requestAnimationFrame(frame);
  try { drafts = storageRead(DRAFTS_KEY, []); lessons = storageRead(LESSONS_KEY, []); }
  catch (error) { report(Error(`The local library could not be read: ${error.message}`)); }
  try {
    let remote;
    try { remote = await probeBridge(); SERVER = remote !== null; }
    catch (error) { SERVER = true; throw error; }
    if (SERVER) {
      const local = storageRead(ACTIVE_KEY, null);
      if (local && (local.ops?.length || local.reviews?.length) && JSON.stringify(local) !== JSON.stringify(remote.drawing)) localArchive(local, `${local.title} · recovered local copy`);
      serverRevision = remote.revision; await replaceDrawing(remote.drawing, { persist: false });
    }
    else { const drawing = storageRead(ACTIVE_KEY, null); if (drawing) await replaceDrawing(drawing, { persist: false }); }
    ready = true; status(SERVER ? 'Saved · agent connected' : 'Saved on this device');
  } catch (error) { report(error); ready = !SERVER; if (SERVER) lastRemoteError = error.message; status(SERVER ? 'Drawing bridge unavailable · retrying' : 'Local save unavailable'); }
  setInterval(poll, 1000);
}
window.studio = { get session() { return session; }, replaceDrawing, flush, get revision() { return serverRevision; }, get connected() { return SERVER && serverRevision !== null && !lastRemoteError; } };
window.addEventListener('beforeunload', event => { if (session.active) finishPointer(); if (pendingPut || sending) { event.preventDefault(); event.returnValue = ''; } });
start();
