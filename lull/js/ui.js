// Shared UI: formatting, icons, the moon, sheets and toasts.
import * as store from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }

// ---------- formatting ----------
export function fmtDur(min) {
  min = Math.max(0, Math.round(min || 0));
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
/** Duration with the units set smaller, for display numbers. */
export function durHTML(min) {
  min = Math.max(0, Math.round(min || 0));
  const h = Math.floor(min / 60), m = min % 60;
  const u = s => `<span class="unit">${s}</span>`;
  if (h === 0) return `${m}${u('m')}`;
  return `${h}${u('h')} ${pad(m)}${u('m')}`;
}
export const fmtHours = min => `${(Math.round((min / 60) * 10) / 10).toFixed(1)}h`;
export function fmtClockMin(m) {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  if (store.get().settings.clock24) return `${pad(h)}:${pad(mm)}`;
  return `${h % 12 || 12}:${pad(mm)} ${h < 12 ? 'am' : 'pm'}`;
}
export const fmtTime = ts => fmtClockMin(store.minutesOfDay(ts));
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDay = ts => dayFmt.format(new Date(ts));
export function relDay(ts) {
  const k = store.dayKey(ts);
  const today = store.startOfDay(new Date());
  if (k === store.dayKey(today)) return 'Today';
  if (k === store.dayKey(store.addDays(today, -1))) return 'Yesterday';
  return fmtDay(ts);
}
/** Elapsed time as h:mm:ss, always with hours so it never reads like a clock time. */
export function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
/** Clock time with a smaller am/pm, for display numbers. */
export function clockHTML(m) {
  const t = fmtClockMin(m);
  const [num, ap] = t.split(' ');
  return ap ? `${num}<span class="unit">${ap}</span>` : num;
}
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
export function toLocalInput(ts) {
  const d = new Date(ts);
  return `${store.dayKey(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  if (!v) return NaN;
  const [date, time] = v.split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '0:0').split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi).getTime();
}

// ---------- icons ----------
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
export const icons = {
  moon: svg('<path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z"/>'),
  journal: svg('<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5v-14Z"/><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H19v-5"/><path d="M9 7.5h6"/>'),
  trends: svg('<path d="M4 20h16"/><path d="M4 15.5 9 10l4 3.2L20 6"/><circle cx="20" cy="6" r="1.2" fill="currentColor"/>'),
  winddown: svg('<path d="M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7Z"/><path d="M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5Z" fill="currentColor"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="2.6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  nap: svg('<path d="M5 8h5l-5 6h5"/><path d="M13 4h4l-4 5h4"/><path d="M15 15h3l-3 4h3"/>'),
  bed: svg('<path d="M3 18V7"/><path d="M3 14h18v4"/><path d="M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5"/><circle cx="7" cy="11" r="1.6"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  trash: svg('<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  flame: svg('<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.4-8.4 2 1.3 3 3 3.2 4.6.9-.6 1.5-1.6 1.6-2.8 2 1.6 3.8 3.9 3.8 6.6 0 3.2-2.4 5.6-6 5.6Z"/>'),
  debt: svg('<path d="M12 4v16"/><path d="M5 11l7 7 7-7"/>'),
  avg: svg('<path d="M4 12h16"/><path d="M4 7h4M16 7h4M4 17h7M15 17h5"/>'),
  download: svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 15V4M7 8.5l5-5 5 5M5 20h14"/>'),
  sound: {
    rain: svg('<path d="M7 14.5a4 4 0 1 1 1-7.9 5 5 0 0 1 9.6 1.9A3.2 3.2 0 0 1 17 14.5H7Z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>'),
    ocean: svg('<path d="M2 8.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 17.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>'),
    fan: svg('<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C11.5 6.5 12.6 3.5 15 3.5c2.2 0 2.2 3.8-3 6.9Z"/><path d="M13.4 12.8c3.5 1.7 5.4 4.3 4.1 6.4-1.1 1.9-4.3 0-4.1-6.4Z"/><path d="M10.6 12.8c-3.2 2.3-6.4 2.6-7.6.5-1.1-1.9 2.2-3.8 7.6-.5Z"/>'),
    brown: svg('<path d="M2 12c3-6.5 5-6.5 8 0s5 6.5 8 0c1.3-2.8 2.5-3.6 4-3.2"/>'),
    pink: svg('<path d="M2 12c1.4-4.5 2.8-4.5 4.2 0s2.8 4.5 4.2 0 2.8-4.5 4.2 0 2.8 4.5 4.2 0c.9-2.8 1.8-3.6 3.2-3"/>'),
    white: svg('<path d="M2 12l1.8-4.5 1.8 8 1.8-6.5 1.8 5.5 1.8-8 1.8 7 1.8-5 1.8 6.5 1.8-4.5 1.8 3"/>'),
  },
};

export function faceSVG(level) {
  const curve = [-3.2, -1.4, 0, 2, 3.6][level - 1];
  const eyes = level === 1
    ? '<path d="M8 10.5h3M13 10.5h3"/>'
    : level === 2 ? '<path d="M8.2 10.3c.7.6 1.6.6 2.3 0M13.5 10.3c.7.6 1.6.6 2.3 0"/>'
      : '<circle cx="9.5" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.5" cy="10" r=".9" fill="currentColor" stroke="none"/>';
  return svg(`<circle cx="12" cy="12" r="9"/>${eyes}<path d="M8.5 15.3Q12 ${15.3 + curve} 15.5 15.3"/>`);
}

// ---------- the moon ----------
let moonSeq = 0;
/** Path of the lit part of a moon disc for an illuminated fraction f (0 = new, 1 = full). */
export function litPath(cx, cy, r, f) {
  f = Math.max(0, Math.min(1, f));
  if (f < 0.004) return `M ${cx} ${cy} Z`;
  if (f > 0.996) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  const rx = r * Math.abs(1 - 2 * f);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${rx} ${r} 0 0 ${f > 0.5 ? 1 : 0} ${cx} ${cy - r} Z`;
}

/** The hero moon. viewBox leaves room for the halo. */
export function moonSVG(f, { cls = '' } = {}) {
  const id = 'moon' + ++moonSeq;
  const d = litPath(160, 160, 100, f);
  const craters = [[128, 128, 14], [182, 112, 9], [196, 176, 16], [150, 196, 10], [112, 170, 7], [168, 150, 6], [214, 140, 5]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `<svg class="moon ${cls}" viewBox="0 0 320 320" data-phase="${f}" data-id="${id}" aria-hidden="true">
    <defs>
      <radialGradient id="${id}-lit" cx="38%" cy="36%" r="78%">
        <stop offset="0" stop-color="#FFF8E2"/><stop offset=".5" stop-color="#F6E5B4"/><stop offset="1" stop-color="#D9B672"/>
      </radialGradient>
      <radialGradient id="${id}-dark" cx="38%" cy="34%" r="80%">
        <stop offset="0" stop-color="#2C3176"/><stop offset="1" stop-color="#151A4C"/>
      </radialGradient>
      <radialGradient id="${id}-halo">
        <stop offset=".55" stop-color="#F6E7B8" stop-opacity=".42"/><stop offset=".72" stop-color="#C9B7FF" stop-opacity=".14"/><stop offset="1" stop-color="#C9B7FF" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="${id}-clip"><path class="moon-clip" d="${d}"/></clipPath>
    </defs>
    <circle class="moon-halo" cx="160" cy="160" r="160" fill="url(#${id}-halo)" style="opacity:${0.2 + 0.8 * f}"/>
    <circle cx="160" cy="160" r="100" fill="url(#${id}-dark)"/>
    <circle cx="160" cy="160" r="99.5" fill="none" stroke="rgba(236,234,251,.16)"/>
    <path class="moon-lit" d="${d}" fill="url(#${id}-lit)"/>
    <g clip-path="url(#${id}-clip)" fill="#B48E52" opacity=".14">${craters}</g>
  </svg>`;
}

export function animateMoon(svgEl, from, to, dur = 1400) {
  if (!svgEl) return;
  const lit = svgEl.querySelector('.moon-lit');
  const clip = svgEl.querySelector('.moon-clip');
  const halo = svgEl.querySelector('.moon-halo');
  const set = f => {
    const d = litPath(160, 160, 100, f);
    lit.setAttribute('d', d); clip.setAttribute('d', d);
    halo.style.opacity = 0.2 + 0.8 * f;
  };
  if (reduceMotion()) { set(to); return; }
  const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  set(from);
  (function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    set(from + (to - from) * ease(k));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/** Small moon used for ratings and the week strip. f = null draws an empty outline. */
export function miniMoon(f, size = 26) {
  const r = 10.5;
  const lit = f == null ? '' : `<path d="${litPath(12, 12, r, f)}" fill="#F6E7B8"/>`;
  return `<svg class="mini-moon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="${r}" fill="${f == null ? 'none' : 'rgba(236,234,251,.08)'}" stroke="rgba(236,234,251,${f == null ? '.22' : '.16'})" stroke-width="1"/>${lit}</svg>`;
}
export const RATING_PHASE = [0.12, 0.32, 0.55, 0.8, 1];
export function ratingMoons(q, size = 14) {
  if (q == null) return '';
  return `<span class="rating-moons" aria-label="Quality ${q} of 5">${miniMoon(RATING_PHASE[q - 1], size)}</span>`;
}

export function countUp(node, toMin, fromMin = 0, dur = 1100) {
  if (!node) return;
  if (reduceMotion() || fromMin === toMin) { node.innerHTML = durHTML(toMin); return; }
  const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 4);
  (function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    node.innerHTML = durHTML(fromMin + (toMin - fromMin) * ease(k));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

// ---------- sheets ----------
const openSheets = [];
export function openSheet({ title, subtitle = '', body, className = '', onClose, hero = '' }) {
  const root = document.getElementById('sheet-root');
  const back = el('<div class="sheet-backdrop"></div>');
  const sheet = el(`<section class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grip" aria-hidden="true"></div>
    ${hero}
    <header class="sheet-head">
      <div class="sheet-heading"><h2 class="sheet-title">${esc(title)}</h2>${subtitle ? `<p class="sheet-sub">${subtitle}</p>` : ''}</div>
      <button class="icon-btn sheet-close" type="button" aria-label="Close">${icons.close}</button>
    </header>
    <div class="sheet-body"></div>
  </section>`);
  const bodyEl = sheet.querySelector('.sheet-body');
  if (body instanceof Node) bodyEl.append(body); else bodyEl.innerHTML = body || '';
  root.append(back, sheet);
  sheet.getBoundingClientRect();
  back.classList.add('is-open');
  sheet.classList.add('is-open');
  document.body.classList.add('has-sheet');

  let closed = false;
  const api = { el: sheet, body: bodyEl, close };
  function close() {
    if (closed) return;
    closed = true;
    back.classList.remove('is-open');
    sheet.classList.remove('is-open');
    sheet.style.transform = '';
    openSheets.splice(openSheets.indexOf(api), 1);
    if (!openSheets.length) document.body.classList.remove('has-sheet');
    setTimeout(() => { back.remove(); sheet.remove(); }, 450);
    onClose?.();
  }
  back.addEventListener('click', close);
  sheet.querySelector('.sheet-close').addEventListener('click', close);
  dragToDismiss(sheet, close);
  openSheets.push(api);
  setTimeout(() => sheet.querySelector('.sheet-close').focus({ preventScroll: true }), 50);
  return api;
}
export const closeAllSheets = () => [...openSheets].forEach(s => s.close());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openSheets.length) openSheets[openSheets.length - 1].close(); });

function dragToDismiss(sheet, close) {
  let y0 = 0, dy = 0, t0 = 0, dragging = false;
  const handle = e => e.target.closest('.sheet-grip, .sheet-head') && !e.target.closest('button, input, textarea, select');
  sheet.addEventListener('pointerdown', e => {
    if (!handle(e)) return;
    dragging = true; y0 = e.clientY; dy = 0; t0 = performance.now();
    sheet.classList.add('is-dragging');
    sheet.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener('pointermove', e => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 140 || (dy > 40 && v > 0.6)) close(); else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

export function confirmSheet({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    const body = el(`<div class="confirm">
      <p class="muted">${esc(message)}</p>
      <div class="btn-row">
        <button class="btn btn-ghost" type="button" data-no>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-yes>${esc(confirm)}</button>
      </div></div>`);
    const s = openSheet({ title, body, className: 'sheet-compact', onClose: () => { if (!answered) resolve(false); } });
    body.querySelector('[data-no]').onclick = () => { answered = true; resolve(false); s.close(); };
    body.querySelector('[data-yes]').onclick = () => { answered = true; resolve(true); s.close(); };
  });
}

// ---------- toasts ----------
let toastTimer = 0;
export function toast(msg, { action, onAction, duration = 3400 } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  root.innerHTML = '';
  const t = el(`<div class="toast" role="status"><span>${esc(msg)}</span>${action ? `<button class="toast-action" type="button">${esc(action)}</button>` : ''}</div>`);
  root.append(t);
  t.getBoundingClientRect();
  t.classList.add('is-in');
  const hide = () => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 350); };
  toastTimer = setTimeout(hide, duration);
  t.querySelector('.toast-action')?.addEventListener('click', () => { clearTimeout(toastTimer); hide(); onAction?.(); });
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
