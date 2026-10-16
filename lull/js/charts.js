// Small, dependency-free SVG charts for the Trends tab.
import { fmtDur, fmtClockMin, fmtDay, esc } from './ui.js';
import { QUALITY, MOOD, minutesOfDay } from './store.js';

export const C = {
  sleep: '#8470EE', nap: '#BA882B', quality: '#2FA796', mood: '#BA882B',
  pos: '#3D9BE0', neg: '#D9773A', surface: '#171D4C',
  grid: 'rgba(236,234,251,.09)', axis: 'rgba(214,214,240,.62)', goal: 'rgba(246,231,184,.55)',
};

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const dayNumFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

function xLabel(date, i, n) {
  if (n <= 7) return weekdayFmt.format(date);
  const every = n <= 31 ? 7 : 21;
  return (n - 1 - i) % every === 0 ? dayNumFmt.format(date) : '';
}

function roundTop(x, yBase, yTop, w, r) {
  const h = yBase - yTop;
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${yBase}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yBase}Z`;
}
function roundBoth(x, y0, y1, w, r) {
  const h = y1 - y0;
  r = Math.min(r, w / 2, h / 2);
  return `M${x},${y0 + r}Q${x},${y0} ${x + r},${y0}H${x + w - r}Q${x + w},${y0} ${x + w},${y0 + r}V${y1 - r}Q${x + w},${y1} ${x + w - r},${y1}H${x + r}Q${x},${y1} ${x},${y1 - r}Z`;
}

/** Tooltip + index tracking shared by every chart. */
function interact(wrap, { pl, slot, n, html, crosshair, H, pt, ih }) {
  const svgEl = wrap.querySelector('svg');
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  wrap.append(tip);
  let line = null;
  if (crosshair) {
    line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'crosshair');
    line.setAttribute('y1', pt); line.setAttribute('y2', pt + ih);
    svgEl.append(line);
  }
  let shownIndex = -1;
  const show = e => {
    const r = svgEl.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.floor((x - pl) / slot);
    if (i < 0 || i >= n) return hide();
    const content = html(i);
    if (!content) return hide();
    if (i !== shownIndex) { tip.innerHTML = content; shownIndex = i; }
    const cx = pl + slot * (i + 0.5);
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(r.width - tw - 4, cx - tw / 2)) + 'px';
    tip.classList.add('is-on');
    wrap.querySelectorAll('[data-i]').forEach(g => g.classList.toggle('is-dim', +g.dataset.i !== i));
    if (line) { line.setAttribute('x1', cx); line.setAttribute('x2', cx); line.classList.add('is-on'); }
  };
  const hide = () => {
    shownIndex = -1;
    tip.classList.remove('is-on');
    wrap.querySelectorAll('.is-dim').forEach(g => g.classList.remove('is-dim'));
    line?.classList.remove('is-on');
  };
  svgEl.addEventListener('pointerdown', show);
  svgEl.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) show(e); });
  svgEl.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) hide(); }, { passive: true });
}

/** Hours slept per day: night sleep plus naps stacked, with the goal line. */
export function renderBars(wrap, days, goal) {
  const W = Math.max(280, wrap.clientWidth), H = 196;
  const pl = 30, pr = 8, pt = 18, pb = 24;
  const iw = W - pl - pr, ih = H - pt - pb;
  const totals = days.map(d => (d.day ? d.day.totalMin : 0));
  const yMax = Math.ceil(Math.max(goal + 60, ...totals) / 120) * 120;
  const y = m => pt + ih - (m / yMax) * ih;
  const n = days.length, slot = iw / n;
  const bw = Math.min(24, Math.max(1.5, n <= 7 ? slot * 0.55 : slot - (n > 40 ? 1 : 2)));
  const base = y(0);
  const step = yMax > 720 ? 240 : 120;
  let grid = '';
  for (let m = 0; m <= yMax; m += step) {
    grid += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(m)}" y2="${y(m)}"/><text class="tick" x="${pl - 6}" y="${y(m) + 4}" text-anchor="end">${m / 60}h</text>`;
  }
  let bars = '', labels = '';
  days.forEach((d, i) => {
    const x = pl + i * slot + (slot - bw) / 2;
    const r = bw >= 8 ? 4 : bw / 2;
    if (d.day) {
      const s = d.day.sleepMin, nap = d.day.napMin;
      const gap = nap ? 2 : 0;
      const sleepTop = y(s);
      bars += `<g class="bar" data-i="${i}" style="--d:${Math.round(i * Math.min(22, 700 / n))}ms;transform-origin:0 ${base}px">`;
      bars += nap ? `<rect x="${x}" y="${sleepTop}" width="${bw}" height="${Math.max(0, base - sleepTop)}" fill="${C.sleep}"/>` : `<path d="${roundTop(x, base, sleepTop, bw, r)}" fill="${C.sleep}"/>`;
      if (nap) bars += `<path d="${roundTop(x, sleepTop - gap, y(s + nap), bw, r)}" fill="${C.nap}"/>`;
      bars += '</g>';
    }
    const lab = xLabel(d.date, i, n);
    if (lab) labels += `<text class="tick" x="${pl + slot * (i + 0.5)}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
  });
  const gy = y(goal);
  const goalLine = `<line class="goal-line" x1="${pl}" x2="${W - pr}" y1="${gy}" y2="${gy}"/>`;
  wrap.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Hours slept per day">${grid}${bars}${goalLine}${labels}</svg>`;
  interact(wrap, {
    pl, slot, n, pt, ih,
    html: i => {
      const d = days[i];
      if (!d.day) return `<strong>${fmtDay(d.date)}</strong><span>Nothing logged</span>`;
      return `<strong>${fmtDay(d.date)}</strong><span>${fmtDur(d.day.totalMin)} in total</span>${d.day.napMin ? `<span><i style="background:${C.sleep}"></i>Night ${fmtDur(d.day.sleepMin)}</span><span><i style="background:${C.nap}"></i>Naps ${fmtDur(d.day.napMin)}</span>` : ''}`;
    },
  });
}

/** When sleep happened: a floating bar from bedtime to wake time each night. */
export function renderWindow(wrap, days, targetBed, targetWake) {
  const W = Math.max(280, wrap.clientWidth), H = 220;
  const pl = 52, pr = 8, pt = 12, pb = 24;
  const iw = W - pl - pr, ih = H - pt - pb;
  const ORIGIN = 18 * 60; // the axis starts at 6pm
  const v = m => (m - ORIGIN + 1440) % 1440;
  const nights = days.map(d => (d.day?.main ? { bed: v(minutesOfDay(d.day.main.start)), wake: v(minutesOfDay(d.day.main.end)) } : null));
  const valid = nights.filter(Boolean).filter(x => x.wake > x.bed);
  const lo = Math.max(0, Math.floor((Math.min(v(targetBed), ...valid.map(x => x.bed)) - 30) / 60) * 60);
  const hi = Math.min(1440, Math.ceil((Math.max(v(targetWake), ...valid.map(x => x.wake)) + 30) / 60) * 60);
  const y = m => pt + ((m - lo) / (hi - lo)) * ih;
  const n = days.length, slot = iw / n;
  const bw = Math.min(14, Math.max(2, slot * 0.55));
  const step = hi - lo > 720 ? 180 : 120;
  let grid = '';
  for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) {
    grid += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(m)}" y2="${y(m)}"/><text class="tick" x="${pl - 8}" y="${y(m) + 4}" text-anchor="end">${fmtClockMin(m + ORIGIN)}</text>`;
  }
  const target = m => `<line class="goal-line" x1="${pl}" x2="${W - pr}" y1="${y(v(m))}" y2="${y(v(m))}"/>`;
  let bars = '', labels = '';
  nights.forEach((nt, i) => {
    if (nt && nt.wake > nt.bed) {
      const x = pl + i * slot + (slot - bw) / 2;
      bars += `<g class="bar bar-float" data-i="${i}" style="--d:${Math.round(i * Math.min(22, 700 / n))}ms;transform-origin:0 ${y(nt.bed)}px"><path d="${roundBoth(x, y(nt.bed), y(nt.wake), bw, 4)}" fill="${C.sleep}"/></g>`;
    }
    const lab = xLabel(days[i].date, i, n);
    if (lab) labels += `<text class="tick" x="${pl + slot * (i + 0.5)}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
  });
  wrap.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Bedtime and wake time each night">${grid}${target(targetBed)}${target(targetWake)}${bars}${labels}</svg>`;
  interact(wrap, {
    pl, slot, n, pt, ih,
    html: i => {
      const d = days[i];
      if (!d.day?.main) return `<strong>${fmtDay(d.date)}</strong><span>Nothing logged</span>`;
      return `<strong>${fmtDay(d.date)}</strong><span>${fmtClockMin(minutesOfDay(d.day.main.start))} to ${fmtClockMin(minutesOfDay(d.day.main.end))}</span>`;
    },
  });
}

/** Sleep quality and morning mood, both on a 1 to 5 scale. */
export function renderLines(wrap, days) {
  const weekly = days.length > 31;
  if (weekly) {
    const buckets = [];
    for (let end = days.length; end > 0; end -= 7) buckets.unshift(days.slice(Math.max(0, end - 7), end));
    const avg = (list, k) => { const v = list.map(d => d.day?.[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    days = buckets.map(b => ({ date: b[b.length - 1].date, day: { quality: avg(b, 'quality'), mood: avg(b, 'mood') } }));
  }
  const W = Math.max(280, wrap.clientWidth), H = 176;
  const pl = 22, pr = 10, pt = 14, pb = 24;
  const iw = W - pl - pr, ih = H - pt - pb;
  const n = days.length, slot = iw / n;
  const x = i => pl + slot * (i + 0.5);
  const y = v => pt + ih - ((v - 1) / 4) * ih;
  const series = [
    { key: 'quality', name: 'Sleep quality', color: C.quality, words: QUALITY },
    { key: 'mood', name: 'Morning mood', color: C.mood, words: MOOD },
  ];
  const drawOrder = [series[1], series[0]]; // quality is the main story, so it sits on top
  let grid = '';
  for (let v = 1; v <= 5; v += 2) grid += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const showDots = n <= 14;
  const lab = (date, i) => weekly ? ((n - 1 - i) % 3 === 0 ? dayNumFmt.format(date) : '') : xLabel(date, i, n);
  let paths = '';
  for (const s of drawOrder) {
    let d = '', pen = false, dots = '';
    days.forEach((day, i) => {
      const val = day.day ? day.day[s.key] : null;
      if (val == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`;
      pen = true;
      if (showDots) dots += `<circle cx="${x(i)}" cy="${y(val)}" r="4" fill="${s.color}" stroke="${C.surface}" stroke-width="2"/>`;
    });
    paths += `<path class="line" pathLength="1" d="${d}" stroke="${s.color}"/><g class="dots">${dots}</g>`;
  }
  let labels = '';
  days.forEach((d, i) => { const t = lab(d.date, i); if (t) labels += `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(t)}</text>`; });
  wrap.innerHTML = `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sleep quality and morning mood">${grid}${paths}${labels}</svg>`;
  interact(wrap, {
    pl, slot, n, pt, ih, crosshair: true,
    html: i => {
      const d = days[i].day;
      const title = weekly ? `Week ending ${dayNumFmt.format(days[i].date)}` : fmtDay(days[i].date);
      if (!d || (d.quality == null && d.mood == null)) return `<strong>${title}</strong><span>No check-in</span>`;
      return `<strong>${title}</strong>${series.map(s => d[s.key] != null ? `<span><i style="background:${s.color}"></i>${s.words[Math.round(d[s.key]) - 1]}${weekly ? ` (${d[s.key].toFixed(1)})` : ''}</span>` : '').join('')}`;
    },
  });
}

/** Diverging bars: how much longer or shorter you sleep on nights with each tag. */
export function renderImpact(wrap, rows) {
  const ready = rows.filter(r => r.enough);
  const waiting = rows.filter(r => !r.enough);
  const max = Math.max(30, ...ready.map(r => Math.abs(r.durDiff)));
  const fmtSigned = m => (m === 0 ? '±0m' : `${m > 0 ? '+' : '−'}${fmtDur(Math.abs(m))}`);
  const q = d => (d == null || Math.abs(d) < 0.05 ? 'same quality' : `quality ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`);
  const rowsHTML = ready.map((r, i) => {
    const w = (Math.abs(r.durDiff) / max) * 34;
    const pos = r.durDiff >= 0;
    return `<div class="impact-row" style="--i:${i}">
      <div class="impact-label"><span>${esc(r.tag.label)}</span><small>${r.count} nights, ${q(r.qualDiff)}</small></div>
      <div class="impact-track">
        <span class="impact-bar ${pos ? 'pos' : 'neg'}" style="${pos ? 'left:50%' : `right:50%`};width:${w}%;background:${pos ? C.pos : C.neg}"></span>
        <span class="impact-val" style="${pos ? `left:calc(50% + ${w}% + 6px)` : `right:calc(50% + ${w}% + 6px)`}">${fmtSigned(r.durDiff)}</span>
      </div>
    </div>`;
  }).join('');
  wrap.innerHTML = ready.length
    ? `<div class="legend"><span><i style="background:${C.pos}"></i>Longer sleep</span><span><i style="background:${C.neg}"></i>Shorter sleep</span></div>
       <div class="impact">${rowsHTML}</div>
       ${waiting.length ? `<p class="fine">Needs a few more tagged nights: ${waiting.map(r => esc(r.tag.label)).join(', ')}.</p>` : ''}`
    : `<p class="muted">Tag your nights with things like caffeine or exercise during your morning check-in. Once a tag has a few nights with and without it, you'll see how it changes your sleep here.</p>`;
}
