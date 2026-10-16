import * as store from './store.js';
import * as ui from './ui.js';
import * as charts from './charts.js';
import * as sounds from './sounds.js';
import { initSky } from './sky.js';

const { $, $$, el, esc, icons, fmtDur, durHTML, fmtTime, fmtClockMin, fmtDay, miniMoon, moonSVG } = ui;
const TABS = ['tonight', 'journal', 'trends', 'winddown'];
const MIN = store.MIN;

function readPref(k, d) { try { return localStorage.getItem('lull:pref:' + k) ?? d; } catch { return d; } }
function writePref(k, v) { try { localStorage.setItem('lull:pref:' + k, v); } catch { /* private mode */ } }

const view = {
  tab: TABS.includes(readPref('tab', 'tonight')) ? readPref('tab', 'tonight') : 'tonight',
  journalFilter: 'all',
  trendsRange: 7,
  calcMode: 'wake',
  calcWake: null,
  heroMode: null,
  heroPhase: 0,
  heroMin: 0,
  lastMinute: -1,
};
let sky;
let installPrompt = null;

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// =====================================================================
// Boot
// =====================================================================
function boot() {
  sky = initSky($('#sky'));
  const set = store.get().settings;
  sounds.configure({ timerMin: set.sound.timer, volume: set.sound.volume });
  buildTabbar();
  store.subscribe(() => renderAll());
  sounds.onChange(() => { renderTonight(); renderSounds(); });
  renderAll();
  switchTab(view.tab, { instant: true });
  if (!store.get().onboarded) showOnboarding();
  document.addEventListener('click', onClick);
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => renderTrendsCharts(false), 200); });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; renderTonight(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  navigator.storage?.persist?.().catch(() => {});
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
}

function renderAll() {
  document.body.classList.toggle('is-sleeping', !!store.get().active);
  sky?.setCalm(!!store.get().active);
  renderTonight();
  renderJournal();
  renderTrends();
  renderWinddown();
}

// =====================================================================
// Tabs
// =====================================================================
function buildTabbar() {
  const labels = { tonight: 'Tonight', journal: 'Journal', trends: 'Trends', winddown: 'Wind down' };
  const icon = { tonight: icons.moon, journal: icons.journal, trends: icons.trends, winddown: icons.winddown };
  $('#tabbar').innerHTML = `<span class="tab-indicator" aria-hidden="true"></span>` +
    TABS.map(t => `<button class="tab" type="button" data-action="tab:${t}" data-tab="${t}">${icon[t]}<span>${labels[t]}</span></button>`).join('');
}

function switchTab(tab, { instant = false } = {}) {
  const prev = view.tab;
  const dir = TABS.indexOf(tab) >= TABS.indexOf(prev) ? 1 : -1;
  view.tab = tab;
  writePref('tab', tab);
  const incoming = $(`.view[data-view="${tab}"]`);
  const outgoing = prev !== tab ? $(`.view[data-view="${prev}"]`) : null;
  $$('.view').forEach(v => { const on = v === incoming; v.inert = !on; v.setAttribute('aria-hidden', String(!on)); });
  if (instant || ui.reduceMotion()) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v === incoming));
  } else {
    incoming.style.transition = 'none';
    incoming.style.transform = `translateX(${dir * 26}px)`;
    incoming.getBoundingClientRect();
    incoming.style.transition = '';
    incoming.style.transform = '';
    incoming.classList.add('is-active');
    if (outgoing) {
      outgoing.style.transform = `translateX(${-dir * 26}px)`;
      outgoing.classList.remove('is-active');
      setTimeout(() => { if (!outgoing.classList.contains('is-active')) { outgoing.style.transition = 'none'; outgoing.style.transform = ''; outgoing.getBoundingClientRect(); outgoing.style.transition = ''; } }, 500);
    }
  }
  $$('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  $('#tabbar').style.setProperty('--tab', TABS.indexOf(tab));
  if (tab === 'trends' && prev !== tab) renderTrendsCharts(true);
  if (tab === 'tonight' && prev !== tab) { view.heroMode = null; renderTonight(); }
}

// =====================================================================
// Shared bits
// =====================================================================
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

const settingsBtn = `<button class="icon-btn" type="button" data-action="open-settings" aria-label="Settings">${icons.settings}</button>`;
function viewHead(title, sub = '') {
  return `<header class="view-head"><div><h1 class="view-title">${title}</h1>${sub ? `<p class="view-sub">${sub}</p>` : ''}</div>${settingsBtn}</header>`;
}

function bedtimeText() {
  const set = store.get().settings;
  const bt = store.hmToMin(set.bedtime);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const until = (bt - nowMin + 1440) % 1440;
  if (until === 0) return `It's your ${fmtClockMin(bt)} bedtime`;
  if (until > 1440 - 240) return `${fmtDur(1440 - until)} past your ${fmtClockMin(bt)} bedtime`;
  if (until <= 360) return `Bedtime in ${fmtDur(until)}, at ${fmtClockMin(bt)}`;
  return `Tonight's bedtime goal is ${fmtClockMin(bt)}`;
}

function soundLeftText() {
  const st = sounds.getState();
  if (!st.playing) return '';
  return st.endsAt ? `stops in ${ui.fmtCountdown(st.endsAt - Date.now())}` : 'playing until you stop it';
}

// =====================================================================
// Tonight
// =====================================================================
function renderTonight() {
  const root = $('#view-tonight');
  const s = store.get();
  const set = s.settings;
  const goal = set.goalMin;
  const map = store.dailyMap();
  const name = set.name ? `, ${esc(set.name)}` : '';
  const a = s.active;
  let hero, actions, extra = '';
  let phase, heroMin = null, mode;

  if (a) {
    mode = 'asleep-' + a.type;
    const isNap = a.type === 'nap';
    const elapsed = (Date.now() - a.start) / MIN;
    phase = Math.min(1, elapsed / (isNap ? 90 : goal));
    let sub;
    if (isNap) {
      sub = `A short 20 minute nap ends at ${fmtTime(a.start + 20 * MIN)}. A full 90 minute cycle ends at ${fmtTime(a.start + 90 * MIN)}.`;
    } else {
      sub = `You'll reach your ${fmtDur(goal)} goal at ${fmtTime(a.start + goal * MIN)}.`;
    }
    const cycles = isNap ? [] : [4, 5, 6].map(c => a.start + (set.fallAsleepMin + c * 90) * MIN).filter(t => t > Date.now());
    hero = `<section class="hero is-asleep">
      <p class="hero-kicker">${isNap ? 'Napping' : 'Asleep'} since ${fmtTime(a.start)}</p>
      <div class="hero-moon is-breathing">${moonSVG(view.heroMode === mode ? phase : 0)}</div>
      <div class="hero-clock" data-live="elapsed">${ui.fmtElapsed(Date.now() - a.start)}</div>
      <p class="hero-sub">${sub}</p>
      ${cycles.length ? `<div class="cycle-times"><span>Easy times to wake</span><div>${cycles.map(t => `<b>${fmtTime(t)}</b>`).join('')}</div></div>` : ''}
    </section>`;
    actions = `<div class="actions">
      <button class="btn btn-primary btn-xl" type="button" data-action="stop">${icons.sun}<span>${isNap ? 'End nap' : "I'm awake"}</span></button>
      <button class="btn btn-text" type="button" data-action="discard-active">Discard this ${isNap ? 'nap' : 'sleep'}</button>
    </div>`;
  } else {
    const latest = s.entries.find(e => e.type === 'sleep');
    if (latest) {
      const night = store.nightAround(latest);
      const nightStart = night.start;
      mode = 'awake:' + latest.id + ':' + night.min + ':' + night.parts.length;
      heroMin = night.min;
      phase = Math.min(1, heroMin / goal);
      const rel = ui.relDay(latest.end);
      const when = rel === 'Today' ? 'Last night' : rel === 'Yesterday' ? 'Woke yesterday' : `Woke ${fmtDay(latest.end)}`;
      const diff = heroMin - goal;
      const note = Math.abs(diff) < 15
        ? `<span class="goal-note is-met">${icons.check}Right on your ${fmtDur(goal)} goal</span>`
        : diff > 0
          ? `<span class="goal-note is-met">${icons.check}${fmtDur(diff)} over your goal</span>`
          : `<span class="goal-note">${fmtDur(-diff)} short of your ${fmtDur(goal)} goal</span>`;
      hero = `<section class="hero">
        <button class="hero-moon" type="button" data-action="edit:${latest.id}" aria-label="Open last night">${moonSVG(view.heroMode === mode ? phase : view.heroPhase)}</button>
        <div class="hero-num" data-hero-num>${durHTML(view.heroMode === mode ? heroMin : view.heroMin)}</div>
        <p class="hero-sub">${when}, ${fmtTime(nightStart)} to ${fmtTime(latest.end)}</p>
        ${note}
      </section>`;
    } else {
      mode = 'empty';
      phase = 0.1;
      hero = `<section class="hero is-empty">
        <div class="hero-moon">${moonSVG(view.heroMode === mode ? phase : 0)}</div>
        <h2 class="hero-title">Your first night starts here</h2>
        <p class="hero-sub">Tap Going to bed when you turn in. Lull keeps time even if you close the app.</p>
      </section>`;
    }
    actions = `<div class="actions">
      <p class="bedtime-note" data-live="bedtime">${icons.clock}<span>${bedtimeText()}</span></p>
      <button class="btn btn-primary btn-xl" type="button" data-action="start-sleep">${icons.moon}<span>Going to bed</span></button>
      <div class="btn-row">
        <button class="btn btn-ghost" type="button" data-action="start-nap">${icons.nap}<span>Start a nap</span></button>
        <button class="btn btn-ghost" type="button" data-action="add-night">${icons.plus}<span>Add a night</span></button>
      </div>
    </div>`;

    if (latest && latest.quality == null && Date.now() - latest.end < 20 * 3600000) {
      extra += `<button class="checkin-card" type="button" data-action="checkin:${latest.id}">
        <span class="checkin-moons">${miniMoon(0.32, 22)}${miniMoon(0.8, 22)}${miniMoon(1, 22)}</span>
        <span class="checkin-text"><strong>How did you sleep?</strong><span>Rate the night and note any dreams</span></span>${icons.chevron}</button>`;
    }

    const streak = store.streak(map, goal);
    const debt = store.sleepDebt(map, goal).minutes;
    const week = store.lastDays(7, map);
    const loggedWeek = week.filter(d => d.day && d.day.sleepMin);
    const avg7 = loggedWeek.length ? loggedWeek.reduce((t, d) => t + d.day.totalMin, 0) / loggedWeek.length : null;
    extra += `<button class="stat-strip" type="button" data-action="tab:trends" aria-label="Open trends">
      <span class="stat"><span class="stat-val">${streak}</span><span class="stat-label">${streak === 1 ? 'night' : 'nights'} on goal in a row</span></span>
      <span class="stat"><span class="stat-val">${debt ? fmtDur(debt) : 'None'}</span><span class="stat-label">sleep debt over 14 days</span></span>
      <span class="stat"><span class="stat-val">${avg7 ? fmtDur(avg7) : 'None yet'}</span><span class="stat-label">average this week</span></span>
    </button>
    <section class="week">
      <h2 class="section-title">Last 7 nights</h2>
      <div class="week-row">${week.map((d, i) => {
        const main = d.day?.main;
        const f = d.day && d.day.sleepMin ? Math.min(1, d.day.sleepMin / goal) : null;
        const action = main ? `edit:${main.id}` : `add-night-for:${d.key}`;
        return `<button class="week-day ${i === 6 ? 'is-today' : ''}" type="button" data-action="${action}" style="--i:${i}" aria-label="${fmtDay(d.date)}${d.day ? ', ' + fmtDur(d.day.totalMin) : ', nothing logged'}">
          <span class="wd">${shortWeekday.format(d.date)}</span>${miniMoon(f, 30)}<span class="wh">${d.day ? ui.fmtHours(d.day.totalMin) : '·'}</span></button>`;
      }).join('')}</div>
    </section>`;

    if (!isStandalone() && readPref('install-dismissed', '') !== '1' && (isIOS() || installPrompt)) {
      extra += `<section class="install-card">
        <div><strong>Put Lull on your Home Screen</strong>
        <p>${installPrompt ? 'Install it to open full screen and use it offline.' : 'In Safari, tap the Share button, then Add to Home Screen.'}</p></div>
        <div class="install-actions">${installPrompt ? `<button class="btn btn-primary btn-sm" type="button" data-action="install">Install</button>` : ''}
        <button class="btn btn-text btn-sm" type="button" data-action="dismiss-install">Not now</button></div>
      </section>`;
    }
  }

  const st = sounds.getState();
  const player = st.playing ? `<div class="mini-player">
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="mini-text"><strong>${esc(sounds.SOUNDS.find(x => x.id === st.id)?.name)}</strong> <span data-live="sound-left">${soundLeftText()}</span></span>
      <button class="icon-btn" type="button" data-action="sound-stop" aria-label="Stop sound">${icons.pause}</button>
    </div>` : (a ? `<button class="btn btn-ghost btn-sm sounds-link" type="button" data-action="tab:winddown">${icons.sound.rain}<span>Play a sleep sound</span></button>` : '');

  root.innerHTML = `
    <header class="view-head">
      <div><h1 class="view-title">${a ? 'Sleep well' : greeting()}${name}</h1><p class="view-sub">${longDate.format(new Date())}</p></div>
      ${settingsBtn}
    </header>
    ${hero}${actions}${player}${extra}`;

  // Motion: wax the moon and count the number up only when the hero changes.
  const moonEl = root.querySelector('.hero .moon');
  if (view.heroMode !== mode) {
    const from = view.heroMode && view.heroMode.startsWith('awake') && mode.startsWith('awake') ? view.heroPhase : 0;
    ui.animateMoon(moonEl, from, phase, 1500);
    if (heroMin != null) ui.countUp(root.querySelector('[data-hero-num]'), heroMin, mode.startsWith('awake') && view.heroMode?.startsWith('awake') ? view.heroMin : 0, 1300);
    root.querySelector('.hero')?.classList.add('is-entering');
  }
  view.heroMode = mode;
  view.heroPhase = phase;
  if (heroMin != null) view.heroMin = heroMin;
}

// =====================================================================
// Journal
// =====================================================================
function nightBand(e) {
  const ORIGIN = 18 * 60;
  const v = (store.minutesOfDay(e.start) - ORIGIN + 1440) % 1440;
  const left = (v / 1440) * 100;
  const width = Math.min(100 - left, (store.durMin(e) / 1440) * 100);
  return `<span class="band" aria-hidden="true"><span class="band-tick" style="left:25%"></span><span class="band-tick" style="left:50%"></span><span class="band-tick" style="left:75%"></span><span class="band-fill ${e.type}" style="left:${left}%;width:${Math.max(1.2, width)}%"></span></span>`;
}

function renderJournal() {
  const root = $('#view-journal');
  const s = store.get();
  const tagLabel = id => s.settings.tags.find(t => t.id === id)?.label || id;
  const filters = [['all', 'All'], ['sleep', 'Nights'], ['nap', 'Naps'], ['dreams', 'Dreams']];
  let list = s.entries;
  if (view.journalFilter === 'sleep' || view.journalFilter === 'nap') list = list.filter(e => e.type === view.journalFilter);
  if (view.journalFilter === 'dreams') list = list.filter(e => e.dream && e.dream.trim());

  let body = '';
  if (!s.entries.length) {
    body = `<div class="empty">${miniMoon(0.15, 54)}<h2>No nights yet</h2><p>Tap Going to bed tonight, or add a night you remember.</p>
      <button class="btn btn-primary" type="button" data-action="add-night">${icons.plus}<span>Add a past night</span></button></div>`;
  } else if (!list.length) {
    body = `<div class="empty"><p>${view.journalFilter === 'dreams' ? 'No dreams written down yet. Add one in your morning check-in.' : 'Nothing here yet.'}</p></div>`;
  } else {
    let month = '';
    let i = 0;
    for (const e of list) {
      const m = monthFmt.format(new Date(e.end));
      if (m !== month) { body += `<h2 class="month">${m}</h2>`; month = m; }
      const tags = e.tags.slice(0, 4).map(t => `<span class="tag">${esc(tagLabel(t))}</span>`).join('') + (e.tags.length > 4 ? `<span class="tag">+${e.tags.length - 4}</span>` : '');
      body += `<button class="entry is-${e.type}" type="button" data-action="edit:${e.id}" style="--i:${Math.min(i++, 12)}">
        <span class="entry-top"><span class="entry-day">${e.type === 'nap' ? `${icons.nap}Nap, ${fmtDay(e.end)}` : fmtDay(e.end)}</span><span class="entry-dur">${durHTML(store.durMin(e))}</span></span>
        ${nightBand(e)}
        <span class="entry-meta"><span>${fmtTime(e.start)} to ${fmtTime(e.end)}</span>${e.quality ? `<span class="q">${ui.ratingMoons(e.quality, 14)}${store.QUALITY[e.quality - 1]}</span>` : ''}${e.mood ? `<span>${ui.faceSVG(e.mood)}${store.MOOD[e.mood - 1]}</span>` : ''}</span>
        ${tags ? `<span class="tags">${tags}</span>` : ''}
        ${e.dream ? `<span class="entry-dream">${esc(e.dream)}</span>` : ''}
      </button>`;
    }
  }
  root.innerHTML = `<header class="view-head"><div><h1 class="view-title">Journal</h1></div>
      <div class="head-actions"><button class="icon-btn icon-btn-moon" type="button" data-action="add-menu" aria-label="Add a night or nap">${icons.plus}</button>${settingsBtn}</div></header>
    <div class="seg" role="tablist" aria-label="Filter">${filters.map(([k, l]) => `<button class="seg-btn" type="button" role="tab" aria-selected="${view.journalFilter === k}" data-action="journal-filter:${k}">${l}</button>`).join('')}</div>
    <div class="entries">${body}</div>`;
}

// =====================================================================
// Trends
// =====================================================================
function renderTrends() {
  const root = $('#view-trends');
  const s = store.get();
  const goal = s.settings.goalMin;
  const n = view.trendsRange;
  const st = store.rangeStats(n);
  const ranges = [[7, '7 days'], [30, '30 days'], [90, '90 days']];
  const seg = `<div class="seg" role="tablist" aria-label="Time range">${ranges.map(([k, l]) => `<button class="seg-btn" type="button" role="tab" aria-selected="${n === k}" data-action="trends-range:${k}">${l}</button>`).join('')}</div>`;

  if (st.logged.length < 2) {
    root.innerHTML = `${viewHead('Trends')}${seg}
      <div class="empty">${miniMoon(0.5, 54)}<h2>Patterns show up after a few nights</h2>
      <p>Log at least two nights in this range to see averages, charts and what affects your sleep.</p>
      <button class="btn btn-primary" type="button" data-action="add-night">${icons.plus}<span>Add a past night</span></button></div>`;
    return;
  }
  const diff = st.avgTotal - goal;
  const vs = Math.abs(diff) < 10 ? `right on your ${fmtDur(goal)} goal` : `${fmtDur(Math.abs(diff))} ${diff < 0 ? 'under' : 'over'} your ${fmtDur(goal)} goal`;
  const cons = st.consistency;
  const consWord = cons == null ? 'Too early to tell' : cons >= 75 ? 'Steady' : cons >= 50 ? 'Fairly steady' : 'Uneven';
  const debt = store.sleepDebt().minutes;
  const q = st.avgQuality;
  const hasNaps = st.days.some(d => d.day && d.day.napMin);

  root.innerHTML = `${viewHead('Trends')}${seg}
    <p class="summary">You slept <span class="summary-num">${durHTML(st.avgTotal)}</span> a night on average, ${vs}.</p>
    <div class="stat-grid">
      <div class="tile"><span class="tile-label">Usual bedtime</span><span class="tile-val">${fmtClockMin(st.avgBed)}</span></div>
      <div class="tile"><span class="tile-label">Usual wake time</span><span class="tile-val">${fmtClockMin(st.avgWake)}</span></div>
      <div class="tile"><span class="tile-label">Consistency</span><span class="tile-val">${consWord}</span>${cons != null ? `<span class="tile-sub">${cons} out of 100</span>` : ''}</div>
      <div class="tile"><span class="tile-label">Nights on goal</span><span class="tile-val">${st.onGoal} of ${st.logged.length}</span></div>
      <div class="tile"><span class="tile-label">Sleep quality</span><span class="tile-val">${q != null ? store.QUALITY[Math.round(q) - 1] : 'Not rated'}</span>${q != null ? `<span class="tile-sub">${q.toFixed(1)} out of 5</span>` : ''}</div>
      <div class="tile"><span class="tile-label">Sleep debt</span><span class="tile-val">${debt ? fmtDur(debt) : 'None'}</span><span class="tile-sub">over the last 14 days</span></div>
    </div>
    <section class="panel chart-panel">
      <h2 class="section-title">Time asleep</h2>
      <p class="fine">Hours slept each day. The line marks your ${fmtDur(goal)} goal.</p>
      ${hasNaps ? `<div class="legend"><span><i style="background:${charts.C.sleep}"></i>Night sleep</span><span><i style="background:${charts.C.nap}"></i>Naps</span></div>` : ''}
      <div class="chart-wrap" data-chart="bars"></div>
    </section>
    <section class="panel chart-panel">
      <h2 class="section-title">When you slept</h2>
      <p class="fine">Each bar runs from falling asleep to waking up. The lines mark your ${fmtClockMin(store.hmToMin(s.settings.bedtime))} bedtime and ${fmtClockMin(store.hmToMin(s.settings.wake))} wake goals.</p>
      <div class="chart-wrap" data-chart="window"></div>
    </section>
    <section class="panel chart-panel">
      <h2 class="section-title">Quality and mood</h2>
      <p class="fine">From your morning check-ins, 1 to 5${n > 31 ? ', averaged by week' : ''}.</p>
      <div class="chart-wrap" data-chart="lines"></div>
    </section>
    <section class="panel chart-panel">
      <h2 class="section-title">What changes your sleep</h2>
      <p class="fine">Average sleep on nights with each tag, compared with nights without it.</p>
      <div class="chart-wrap" data-chart="impact"></div>
    </section>
    <details class="numbers">
      <summary>See the numbers</summary>
      <table><thead><tr><th>Night</th><th>Slept</th><th>Asleep</th><th>Awake</th><th>Quality</th></tr></thead><tbody>
      ${st.days.slice().reverse().filter(d => d.day).map(d => `<tr><td>${fmtDay(d.date)}</td><td>${fmtDur(d.day.totalMin)}</td><td>${d.day.main ? fmtTime(d.day.main.start) : ''}</td><td>${d.day.main ? fmtTime(d.day.main.end) : ''}</td><td>${d.day.quality ?? ''}</td></tr>`).join('')}
      </tbody></table>
    </details>`;
  renderTrendsCharts(view.tab === 'trends');
}

function renderTrendsCharts(animate) {
  const root = $('#view-trends');
  if (!root.querySelector('[data-chart]')) return;
  const s = store.get();
  const st = store.rangeStats(view.trendsRange);
  root.classList.toggle('no-anim', !animate);
  charts.renderBars(root.querySelector('[data-chart="bars"]'), st.days, s.settings.goalMin);
  charts.renderWindow(root.querySelector('[data-chart="window"]'), st.days, store.hmToMin(s.settings.bedtime), store.hmToMin(s.settings.wake));
  charts.renderLines(root.querySelector('[data-chart="lines"]'), st.days);
  charts.renderImpact(root.querySelector('[data-chart="impact"]'), store.habitImpact(view.trendsRange));
}

// =====================================================================
// Wind down: bedtime calculator + sleep sounds
// =====================================================================
function renderWinddown() {
  const root = $('#view-winddown');
  root.innerHTML = `${viewHead('Wind down')}
    <section class="panel calc">
      <h2 class="section-title">Bedtime calculator</h2>
      <p class="fine">Sleep runs in cycles of about 90 minutes, and waking between cycles feels easier. These times include the ${store.get().settings.fallAsleepMin} minutes you usually take to fall asleep.</p>
      <div class="seg" role="tablist" aria-label="Calculator mode">
        <button class="seg-btn" type="button" role="tab" aria-selected="${view.calcMode === 'wake'}" data-action="calc-mode:wake">I need to wake at</button>
        <button class="seg-btn" type="button" role="tab" aria-selected="${view.calcMode === 'now'}" data-action="calc-mode:now">Going to bed now</button>
      </div>
      ${view.calcMode === 'wake' ? `<label class="calc-input"><span>Wake up at</span><input type="time" data-calcwake value="${view.calcWake || store.get().settings.wake}"></label>` : ''}
      <div class="calc-results" data-calc></div>
    </section>
    <section class="panel sounds" data-sounds></section>`;
  renderCalc();
  renderSounds();
}

function renderCalc() {
  const box = $('[data-calc]');
  if (!box) return;
  const set = store.get().settings;
  const fall = set.fallAsleepMin;
  let rows;
  if (view.calcMode === 'wake') {
    const wake = store.hmToMin(view.calcWake || set.wake);
    rows = [6, 5, 4, 3].map(c => ({ c, t: wake - fall - c * 90, verb: 'Fall into bed by' }));
  } else {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    rows = [3, 4, 5, 6].map(c => ({ c, t: nowMin + fall + c * 90 }));
  }
  box.innerHTML = rows.map((r, i) => `<div class="calc-row ${r.c >= 5 ? 'is-ideal' : ''}" style="--i:${i}">
      <span class="calc-time">${ui.clockHTML(r.t)}</span>
      <span class="calc-meta">${r.c} cycles, ${fmtDur(r.c * 90)} asleep${r.c >= 5 ? '<em>Ideal</em>' : ''}</span>
      ${view.calcMode === 'wake' ? `<button class="btn btn-ghost btn-sm" type="button" data-action="set-bedtime:${((r.t % 1440) + 1440) % 1440}" aria-label="Set ${fmtClockMin(r.t)} as your bedtime goal">Set bedtime</button>` : ''}
    </div>`).join('');
}

function renderSounds() {
  const box = $('[data-sounds]');
  if (!box) return;
  const st = sounds.getState();
  const timers = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [0, 'No timer']];
  box.innerHTML = `<h2 class="section-title">Sleep sounds</h2>
    <p class="fine">Made right on your phone, so they work offline. Set a timer and they stop on their own.</p>
    <div class="sound-grid">${sounds.SOUNDS.map((x, i) => {
      const on = st.id === x.id && (st.playing || st.loading);
      return `<button class="sound-tile ${on && st.playing ? 'is-playing' : ''} ${on && st.loading ? 'is-loading' : ''}" type="button" data-action="sound:${x.id}" aria-pressed="${on && st.playing}" style="--i:${i}">
        <span class="sound-icon">${icons.sound[x.id]}</span>
        <span class="sound-name">${x.name}</span><span class="sound-note">${x.note}</span>
        <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button>`;
    }).join('')}</div>
    <div class="timer-row"><span class="timer-label">Stop after</span>
      <div class="chips">${timers.map(([m, l]) => `<button class="chip ${st.timerMin === m ? 'is-on' : ''}" type="button" data-action="sound-timer:${m}" aria-pressed="${st.timerMin === m}">${l}</button>`).join('')}</div></div>
    ${sounds.canSetVolume ? `<label class="volume"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-volume></label>` : `<p class="fine">Use your phone's volume buttons to set the level.</p>`}
    <p class="sound-status" data-live="sound-status">${st.playing ? `${esc(sounds.SOUNDS.find(x => x.id === st.id)?.name)} ${soundLeftText()}` : ''}</p>`;
}

// =====================================================================
// Editor: add, edit and morning check-in
// =====================================================================
function defaultNight(dateKey) {
  const set = store.get().settings;
  const base = dateKey ? store.keyToDate(dateKey) : store.startOfDay(new Date());
  let end = base.getTime() + store.hmToMin(set.wake) * MIN;
  if (!dateKey && end > Date.now()) end -= 86400000;
  return { start: end - set.goalMin * MIN, end };
}

function openEditor(id, opts = {}) {
  const s = store.get();
  const existing = id ? store.findEntry(id) : null;
  if (id && !existing) return;
  const draft = existing
    ? { ...existing, tags: [...existing.tags] }
    : { type: opts.type || 'sleep', start: opts.start, end: opts.end, quality: null, mood: null, tags: [], dream: '' };
  const checkin = !!opts.checkin;
  const goal = s.settings.goalMin;

  const titleFor = () => checkin ? (draft.type === 'nap' ? 'Nap saved' : 'Good morning')
    : existing ? (draft.type === 'nap' ? 'Edit nap' : 'Edit night') : (draft.type === 'nap' ? 'Add a nap' : 'Add a night');
  const saveLabel = () => checkin ? 'Save check-in' : existing ? 'Save changes' : (draft.type === 'nap' ? 'Save nap' : 'Save night');
  const dur0 = (draft.end - draft.start) / MIN;
  const hero = checkin && draft.type === 'sleep' ? `<div class="sheet-hero">${moonSVG(0, { cls: 'moon-sm' })}<p class="sheet-hero-num">${durHTML(dur0)}</p><p class="sheet-hero-sub">${fmtTime(draft.start)} to ${fmtTime(draft.end)}</p></div>` : '';

  const body = el(`<form class="editor ${draft.type === 'nap' ? 'is-nap' : ''}" novalidate>
    ${checkin ? '' : `<div class="seg" role="radiogroup" aria-label="Type">
      <button class="seg-btn" type="button" role="radio" data-type="sleep" aria-checked="${draft.type === 'sleep'}">Night sleep</button>
      <button class="seg-btn" type="button" role="radio" data-type="nap" aria-checked="${draft.type === 'nap'}">Nap</button></div>`}
    <div class="times">
      <label class="field field-inline"><span data-start-label>${draft.type === 'nap' ? 'Started' : 'Fell asleep'}</span><input type="datetime-local" name="start" value="${ui.toLocalInput(draft.start)}" required></label>
      <label class="field field-inline"><span data-end-label>Woke up</span><input type="datetime-local" name="end" value="${ui.toLocalInput(draft.end)}" required></label>
    </div>
    <p class="editor-dur" data-dur></p>
    <p class="form-error" data-error role="alert" hidden></p>
    <fieldset class="group for-sleep"><legend>How did you sleep?</legend>
      <div class="rating" role="radiogroup" aria-label="Sleep quality">${store.QUALITY.map((w, i) => `<button type="button" class="rate" role="radio" data-q="${i + 1}" aria-label="${w}" aria-checked="${draft.quality === i + 1}">${miniMoon(ui.RATING_PHASE[i], 36)}</button>`).join('')}</div>
      <p class="rating-word" data-qword>${draft.quality ? store.QUALITY[draft.quality - 1] : 'Tap a moon, fuller means deeper'}</p>
    </fieldset>
    <fieldset class="group for-sleep"><legend>How do you feel?</legend>
      <div class="moods" role="radiogroup" aria-label="Morning mood">${store.MOOD.map((w, i) => `<button type="button" class="mood" role="radio" data-m="${i + 1}" aria-checked="${draft.mood === i + 1}">${ui.faceSVG(i + 1)}<span>${w}</span></button>`).join('')}</div>
    </fieldset>
    <fieldset class="group for-sleep"><legend>Before bed</legend>
      <div class="chips" data-tags></div>
    </fieldset>
    <fieldset class="group"><legend>Dreams and notes</legend>
      <textarea name="dream" rows="3" placeholder="Anything you remember from the night">${esc(draft.dream)}</textarea>
    </fieldset>
    <div class="editor-actions">
      ${existing ? `<button class="btn btn-ghost btn-square" type="button" data-delete aria-label="Delete">${icons.trash}</button>` : ''}
      <button class="btn btn-primary btn-grow" type="submit" data-save>${saveLabel()}</button>
    </div>
  </form>`);

  if (hero) body.prepend(el(hero));
  const sheet = ui.openSheet({ title: titleFor(), subtitle: checkin ? 'A few taps and you\'re done.' : '', body, className: 'sheet-editor' });
  if (hero) setTimeout(() => ui.animateMoon(sheet.el.querySelector('.sheet-hero .moon'), 0, Math.min(1, dur0 / goal), 1400), 150);

  const f = body;
  const startIn = f.elements.start, endIn = f.elements.end;
  const errEl = $('[data-error]', f);
  const durEl = $('[data-dur]', f);

  function validate() {
    const start = ui.fromLocalInput(startIn.value), end = ui.fromLocalInput(endIn.value);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Fill in both times.';
    if (end <= start) return 'The wake time needs to be after the time you fell asleep.';
    const mins = (end - start) / MIN;
    if (draft.type === 'sleep' && mins > 18 * 60) return 'That is longer than 18 hours. Check the dates.';
    if (draft.type === 'nap' && mins > 6 * 60) return 'Naps can be up to 6 hours. Log a longer one as a night sleep.';
    if (end > Date.now() + 2 * MIN) return 'The wake time is in the future.';
    const clash = store.overlapping(start, end, existing?.id);
    if (clash) return `This overlaps your ${clash.type === 'nap' ? 'nap' : 'sleep'} on ${fmtDay(clash.end)}, ${fmtTime(clash.start)} to ${fmtTime(clash.end)}.`;
    return '';
  }
  function refresh() {
    const start = ui.fromLocalInput(startIn.value), end = ui.fromLocalInput(endIn.value);
    const ok = Number.isFinite(start) && Number.isFinite(end) && end > start;
    durEl.innerHTML = ok ? `${durHTML((end - start) / MIN)} <span>${draft.type === 'nap' ? 'nap' : 'asleep'}</span>` : '';
    errEl.hidden = true;
  }
  function renderTags() {
    const tags = store.get().settings.tags;
    $('[data-tags]', f).innerHTML = tags.map(t => `<button type="button" class="chip ${draft.tags.includes(t.id) ? 'is-on' : ''}" data-tag="${esc(t.id)}" aria-pressed="${draft.tags.includes(t.id)}">${esc(t.label)}</button>`).join('') +
      `<span class="chip-add"><input type="text" placeholder="New tag" maxlength="24" data-newtag aria-label="New tag"></span>`;
  }
  renderTags();
  refresh();

  f.addEventListener('input', e => { if (e.target === startIn || e.target === endIn) refresh(); });
  f.addEventListener('click', e => {
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn) {
      draft.type = typeBtn.dataset.type;
      $$('[data-type]', f).forEach(b => b.setAttribute('aria-checked', String(b === typeBtn)));
      f.classList.toggle('is-nap', draft.type === 'nap');
      $('[data-start-label]', f).textContent = draft.type === 'nap' ? 'Started' : 'Fell asleep';
      sheet.el.querySelector('.sheet-title').textContent = titleFor();
      $('[data-save]', f).textContent = saveLabel();
      if (!existing && draft.type === 'nap' && !opts.start) {
        const end = Math.floor(Date.now() / (5 * MIN)) * 5 * MIN;
        startIn.value = ui.toLocalInput(end - 30 * MIN); endIn.value = ui.toLocalInput(end);
      } else if (!existing && draft.type === 'sleep' && !opts.start) {
        const n = defaultNight();
        startIn.value = ui.toLocalInput(n.start); endIn.value = ui.toLocalInput(n.end);
      }
      refresh();
      return;
    }
    const rate = e.target.closest('[data-q]');
    if (rate) {
      const q = +rate.dataset.q;
      draft.quality = draft.quality === q ? null : q;
      $$('[data-q]', f).forEach(b => b.setAttribute('aria-checked', String(+b.dataset.q === draft.quality)));
      $('[data-qword]', f).textContent = draft.quality ? store.QUALITY[draft.quality - 1] : 'Tap a moon, fuller means deeper';
      ui.haptic();
      return;
    }
    const mood = e.target.closest('[data-m]');
    if (mood) {
      const m = +mood.dataset.m;
      draft.mood = draft.mood === m ? null : m;
      $$('[data-m]', f).forEach(b => b.setAttribute('aria-checked', String(+b.dataset.m === draft.mood)));
      ui.haptic();
      return;
    }
    const tag = e.target.closest('[data-tag]');
    if (tag) {
      const t = tag.dataset.tag;
      draft.tags = draft.tags.includes(t) ? draft.tags.filter(x => x !== t) : [...draft.tags, t];
      tag.classList.toggle('is-on'); tag.setAttribute('aria-pressed', String(draft.tags.includes(t)));
      return;
    }
    if (e.target.closest('[data-delete]')) {
      const removed = store.deleteEntry(existing.id);
      sheet.close();
      ui.toast(`${removed.type === 'nap' ? 'Nap' : 'Night'} deleted`, { action: 'Undo', onAction: () => store.restoreEntry(removed) });
    }
  });
  f.addEventListener('keydown', e => {
    const inp = e.target.closest('[data-newtag]');
    if (inp && e.key === 'Enter') {
      e.preventDefault();
      const t = addTag(inp.value);
      if (t && !draft.tags.includes(t.id)) draft.tags.push(t.id);
      renderTags();
      $('[data-newtag]', f).focus();
    }
  });
  f.addEventListener('focusout', e => {
    const inp = e.target.closest?.('[data-newtag]');
    if (inp && inp.value.trim()) { const t = addTag(inp.value); if (t && !draft.tags.includes(t.id)) draft.tags.push(t.id); renderTags(); }
  });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const msg = validate();
    if (msg) { errEl.textContent = msg; errEl.hidden = false; errEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); ui.haptic(20); return; }
    const patch = {
      type: draft.type,
      start: ui.fromLocalInput(startIn.value),
      end: ui.fromLocalInput(endIn.value),
      quality: draft.type === 'nap' ? null : draft.quality,
      mood: draft.type === 'nap' ? null : draft.mood,
      tags: draft.type === 'nap' ? [] : draft.tags,
      dream: f.elements.dream.value.trim(),
    };
    let saved;
    if (existing) { store.updateEntry(existing.id, patch); saved = store.findEntry(existing.id); } else { saved = store.addEntry(patch); }
    sheet.close();
    const word = saved.type === 'nap' ? 'Nap' : 'Night';
    if (saved.type === 'sleep' && store.nightAround(saved).min >= goal - 15 && (checkin || !existing)) {
      sky.celebrate(4);
      ui.toast(`${word} saved. You reached your sleep goal.`);
    } else {
      ui.toast(existing && !checkin ? 'Changes saved' : `${word} saved`);
    }
  });
}

function addTag(label) {
  label = String(label || '').trim().slice(0, 24);
  if (!label) return null;
  const tags = store.get().settings.tags;
  const found = tags.find(t => t.label.toLowerCase() === label.toLowerCase());
  if (found) return found;
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || store.uid();
  const t = { id: tags.some(x => x.id === id) ? id + '-' + store.uid().slice(-3) : id, label };
  store.update(s => { s.settings.tags.push(t); });
  return t;
}

function openAddMenu() {
  const body = el(`<div class="add-menu">
    <button class="menu-item" type="button" data-pick="sleep">${icons.moon}<span><strong>Add a night</strong><small>A sleep you forgot to track</small></span>${icons.chevron}</button>
    <button class="menu-item" type="button" data-pick="nap">${icons.nap}<span><strong>Add a nap</strong><small>Daytime rest</small></span>${icons.chevron}</button>
  </div>`);
  const s = ui.openSheet({ title: 'Add to your journal', body, className: 'sheet-compact' });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    s.close();
    setTimeout(() => {
      if (b.dataset.pick === 'nap') {
        const end = Math.floor(Date.now() / (5 * MIN)) * 5 * MIN;
        openEditor(null, { type: 'nap', start: end - 30 * MIN, end });
      } else openEditor(null, { type: 'sleep', ...defaultNight() });
    }, 220);
  });
}

// =====================================================================
// Settings
// =====================================================================
function openSettings() {
  const set = store.get().settings;
  const body = el(`<div class="settings">
    <label class="field"><span>Your name</span><input type="text" name="name" value="${esc(set.name)}" placeholder="Optional" autocomplete="given-name" maxlength="30"></label>
    <div class="field"><span>Nightly sleep goal</span><div class="slider-row"><input type="range" name="goal" min="300" max="660" step="15" value="${set.goalMin}" aria-label="Nightly sleep goal"><output data-goalout>${fmtDur(set.goalMin)}</output></div></div>
    <div class="field-row">
      <label class="field"><span>Bedtime goal</span><input type="time" name="bedtime" value="${set.bedtime}"></label>
      <label class="field"><span>Wake time goal</span><input type="time" name="wake" value="${set.wake}"></label>
    </div>
    <div class="field"><span>Time you usually take to fall asleep</span><div class="slider-row"><input type="range" name="fall" min="0" max="60" step="5" value="${set.fallAsleepMin}" aria-label="Minutes to fall asleep"><output data-fallout>${set.fallAsleepMin} min</output></div></div>
    <label class="switch-row"><span>24-hour clock</span><input type="checkbox" name="clock24" role="switch" ${set.clock24 ? 'checked' : ''}><i aria-hidden="true"></i></label>
    <div class="field"><span>Habit tags</span>
      <div class="chips" data-taglist></div>
      <form class="add-tag" data-addtag><input type="text" placeholder="Add a tag, like Late workout" maxlength="24" aria-label="New tag"><button class="btn btn-ghost btn-sm" type="submit">Add</button></form>
    </div>
    <div class="field"><span>Your data</span>
      <p class="fine">Everything stays on this phone, nothing is uploaded. Export a backup now and then, and before clearing Safari data.</p>
      <div class="data-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-export>${icons.download}<span>Export backup</span></button>
        <button class="btn btn-ghost btn-sm" type="button" data-import>${icons.upload}<span>Import backup</span></button>
        <button class="btn btn-ghost btn-sm" type="button" data-csv>${icons.download}<span>Export as CSV</span></button>
        ${store.hasSamples() ? `<button class="btn btn-ghost btn-sm" type="button" data-unsample>Remove sample nights</button>` : `<button class="btn btn-ghost btn-sm" type="button" data-sample>Load sample nights</button>`}
        <button class="btn btn-ghost btn-sm is-danger" type="button" data-erase>${icons.trash}<span>Erase all nights</span></button>
        <input type="file" accept="application/json,.json" hidden data-file>
      </div>
    </div>
    <p class="fine about">Lull 1.0. Your sleep, kept quietly on your phone.</p>
  </div>`);
  const sheet = ui.openSheet({ title: 'Settings', body, className: 'sheet-settings' });

  const renderTagList = () => {
    $('[data-taglist]', body).innerHTML = store.get().settings.tags.map(t => `<span class="chip is-static">${esc(t.label)}<button type="button" data-rmtag="${esc(t.id)}" aria-label="Remove ${esc(t.label)}">${icons.close}</button></span>`).join('') || '<p class="fine">No tags yet.</p>';
  };
  renderTagList();
  const setVal = (fn) => store.update(s => fn(s.settings));

  body.addEventListener('input', e => {
    const n = e.target.name;
    if (n === 'goal') $('[data-goalout]', body).textContent = fmtDur(+e.target.value);
    if (n === 'fall') $('[data-fallout]', body).textContent = `${e.target.value} min`;
  });
  body.addEventListener('change', e => {
    const n = e.target.name;
    if (n === 'goal') setVal(x => { x.goalMin = +e.target.value; });
    if (n === 'fall') setVal(x => { x.fallAsleepMin = +e.target.value; });
    if (n === 'name') setVal(x => { x.name = e.target.value.trim(); });
    if (n === 'bedtime' && e.target.value) setVal(x => { x.bedtime = e.target.value; });
    if (n === 'wake' && e.target.value) setVal(x => { x.wake = e.target.value; });
    if (n === 'clock24') setVal(x => { x.clock24 = e.target.checked; });
  });
  $('[data-addtag]', body).addEventListener('submit', e => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    if (addTag(inp.value)) { inp.value = ''; renderTagList(); }
  });
  body.addEventListener('click', async e => {
    const rm = e.target.closest('[data-rmtag]');
    if (rm) { setVal(x => { x.tags = x.tags.filter(t => t.id !== rm.dataset.rmtag); }); renderTagList(); return; }
    if (e.target.closest('[data-export]')) { ui.download(`lull-backup-${store.dayKey(Date.now())}.json`, store.exportJSON()); ui.toast('Backup exported'); }
    if (e.target.closest('[data-csv]')) { ui.download(`lull-sleep-${store.dayKey(Date.now())}.csv`, store.exportCSV(), 'text/csv'); ui.toast('CSV exported'); }
    if (e.target.closest('[data-import]')) $('[data-file]', body).click();
    if (e.target.closest('[data-sample]')) { store.addSampleNights(); sheet.close(); ui.toast('Sample nights added. Remove them any time in Settings.'); }
    if (e.target.closest('[data-unsample]')) { store.removeSamples(); sheet.close(); ui.toast('Sample nights removed'); }
    if (e.target.closest('[data-erase]')) {
      const ok = await ui.confirmSheet({ title: 'Erase all nights?', message: 'This removes every night, nap and dream from this phone. Your settings stay. Export a backup first if you might want them back.', confirm: 'Erase everything', danger: true });
      if (ok) { store.eraseAll(); sheet.close(); ui.toast('All nights erased'); }
    }
  });
  $('[data-file]', body).addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const added = store.importJSON(await file.text());
      sheet.close();
      ui.toast(`Backup imported, ${added} ${added === 1 ? 'entry' : 'entries'} added`);
    } catch {
      ui.toast('That file is not a Lull backup. Choose a .json file exported from Lull.');
    }
  });
}

// =====================================================================
// Onboarding
// =====================================================================
function showOnboarding() {
  const set = store.get().settings;
  const ob = el(`<div class="onboard" role="dialog" aria-modal="true" aria-label="Welcome to Lull">
    <div class="onboard-inner">
      <div class="onboard-moon">${moonSVG(0)}</div>
      <h1 class="wordmark" aria-label="Lull">${'Lull'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</h1>
      <p class="onboard-lede">A calm place to keep track of your sleep, your dreams and what helps you rest.</p>
      <form class="onboard-form">
        <label class="field"><span>What should Lull call you?</span><input type="text" name="name" placeholder="Your first name" autocomplete="given-name" maxlength="30"></label>
        <div class="field"><span>How much sleep are you aiming for?</span><div class="slider-row"><input type="range" name="goal" min="300" max="660" step="15" value="${set.goalMin}" aria-label="Sleep goal"><output>${fmtDur(set.goalMin)}</output></div></div>
        <div class="field-row">
          <label class="field"><span>Usual bedtime</span><input type="time" name="bedtime" value="${set.bedtime}"></label>
          <label class="field"><span>Usual wake time</span><input type="time" name="wake" value="${set.wake}"></label>
        </div>
        <button class="btn btn-primary btn-xl" type="submit">${icons.moon}<span>Start tracking</span></button>
        <button class="btn btn-text" type="button" data-sample>Look around with sample nights first</button>
      </form>
    </div>
  </div>`);
  document.body.append(ob);
  document.body.classList.add('is-onboarding');
  setTimeout(() => ui.animateMoon(ob.querySelector('.moon'), 0, 0.62, 2200), 300);
  const form = ob.querySelector('form');
  form.addEventListener('input', e => { if (e.target.name === 'goal') form.querySelector('output').textContent = fmtDur(+e.target.value); });
  const finish = () => {
    store.update(s => {
      s.settings.name = form.elements.name.value.trim();
      s.settings.goalMin = +form.elements.goal.value;
      if (form.elements.bedtime.value) s.settings.bedtime = form.elements.bedtime.value;
      if (form.elements.wake.value) s.settings.wake = form.elements.wake.value;
      s.onboarded = true;
    });
    ob.classList.add('is-leaving');
    document.body.classList.remove('is-onboarding');
    view.heroMode = null;
    renderTonight();
    setTimeout(() => ob.remove(), 900);
  };
  form.addEventListener('submit', e => { e.preventDefault(); finish(); });
  ob.querySelector('[data-sample]').addEventListener('click', () => { store.addSampleNights(); finish(); ui.toast('Sample nights added. Remove them any time in Settings.'); });
}

// =====================================================================
// Actions
// =====================================================================
async function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const [action, arg] = btn.dataset.action.split(/:(.*)/s);
  switch (action) {
    case 'tab': ui.haptic(5); switchTab(arg); break;
    case 'open-settings': openSettings(); break;
    case 'start-sleep':
    case 'start-nap': {
      if (store.get().active) return;
      ui.haptic(12);
      store.startActive(action === 'start-nap' ? 'nap' : 'sleep');
      ui.toast(action === 'start-nap' ? 'Nap started. Rest well.' : "Sleep well. Tap I'm awake when you get up.");
      break;
    }
    case 'stop': {
      const draft = store.endActive();
      if (!draft) return;
      ui.haptic(12);
      const mins = (draft.end - draft.start) / MIN;
      if (mins < 3) {
        ui.toast('That was under 3 minutes, so it was not saved.', { action: 'Undo', onAction: () => store.update(s => { s.active = { type: draft.type, start: draft.start }; }) });
        return;
      }
      const clash = store.overlapping(draft.start, draft.end);
      if (clash) {
        draft.start = Math.max(draft.start, clash.end);
        if (draft.end - draft.start < 3 * MIN) { ui.toast('This overlaps a night already in your journal, so it was not saved.'); return; }
      }
      const entry = store.addEntry(draft);
      openEditor(entry.id, { checkin: true });
      break;
    }
    case 'discard-active': {
      const ok = await ui.confirmSheet({ title: 'Discard this sleep?', message: 'The timer stops and nothing is saved to your journal.', confirm: 'Discard', danger: true });
      if (ok) store.cancelActive();
      break;
    }
    case 'add-night': openEditor(null, { type: 'sleep', ...defaultNight() }); break;
    case 'add-night-for': openEditor(null, { type: 'sleep', ...defaultNight(arg) }); break;
    case 'add-menu': openAddMenu(); break;
    case 'edit': openEditor(arg); break;
    case 'checkin': openEditor(arg, { checkin: true }); break;
    case 'journal-filter': view.journalFilter = arg; renderJournal(); break;
    case 'trends-range': view.trendsRange = +arg; renderTrends(); break;
    case 'calc-mode': view.calcMode = arg; renderWinddown(); break;
    case 'set-bedtime': {
      const hm = store.minToHM(+arg);
      store.update(s => { s.settings.bedtime = hm; });
      ui.toast(`Bedtime goal set to ${fmtClockMin(+arg)}`);
      break;
    }
    case 'sound': ui.haptic(6); sounds.toggle(arg); break;
    case 'sound-stop': sounds.stop(); break;
    case 'sound-timer': {
      sounds.setTimer(+arg);
      store.update(s => { s.settings.sound.timer = +arg; });
      break;
    }
    case 'install': installPrompt?.prompt(); installPrompt = null; renderTonight(); break;
    case 'dismiss-install': writePref('install-dismissed', '1'); renderTonight(); break;
  }
}

document.addEventListener('input', e => {
  if (e.target.matches('[data-calcwake]')) { view.calcWake = e.target.value; renderCalc(); }
  if (e.target.matches('[data-volume]')) { sounds.configure({ volume: +e.target.value }); }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-volume]')) store.update(s => { s.settings.sound.volume = +e.target.value; });
});

// =====================================================================
// Clock tick
// =====================================================================
function tick() {
  const s = store.get();
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  if (s.active) {
    const live = $('[data-live="elapsed"]');
    if (live) live.textContent = ui.fmtElapsed(Date.now() - s.active.start);
    if (minute !== view.lastMinute) {
      const goal = s.active.type === 'nap' ? 90 : s.settings.goalMin;
      const phase = Math.min(1, (Date.now() - s.active.start) / MIN / goal);
      const moon = $('#view-tonight .hero .moon');
      if (moon && Math.abs(phase - view.heroPhase) > 0.002) { ui.animateMoon(moon, view.heroPhase, phase, 800); view.heroPhase = phase; }
    }
  }
  const bt = $('[data-live="bedtime"] span');
  if (bt) bt.textContent = bedtimeText();
  const st = sounds.getState();
  if (st.playing) {
    const left = $('[data-live="sound-left"]');
    if (left) left.textContent = soundLeftText();
    const status = $('[data-live="sound-status"]');
    if (status) status.textContent = `${sounds.SOUNDS.find(x => x.id === st.id)?.name} ${soundLeftText()}`;
  }
  if (minute !== view.lastMinute) {
    if (view.lastMinute !== -1 && minute === 0) renderAll();
    if (view.calcMode === 'now') renderCalc();
    view.lastMinute = minute;
  }
}

boot();
