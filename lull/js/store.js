// Lull data layer: state, persistence and sleep maths.
const KEY = 'lull:v1';
export const MIN = 60000;

export const DEFAULT_TAGS = [
  { id: 'caffeine', label: 'Caffeine' },
  { id: 'alcohol', label: 'Alcohol' },
  { id: 'screens', label: 'Late screens' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'late-meal', label: 'Late meal' },
  { id: 'stress', label: 'Stressed' },
  { id: 'reading', label: 'Read before bed' },
  { id: 'meditation', label: 'Meditated' },
];

export const QUALITY = ['Restless', 'Light', 'Okay', 'Good', 'Deep'];
export const MOOD = ['Drained', 'Groggy', 'Okay', 'Rested', 'Energized'];

function detect24h() {
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h23' || hc === 'h24';
  } catch { return true; }
}

function defaults() {
  return {
    version: 1,
    onboarded: false,
    settings: {
      name: '',
      goalMin: 480,
      bedtime: '23:00',
      wake: '07:00',
      fallAsleepMin: 15,
      clock24: detect24h(),
      tags: DEFAULT_TAGS.map(t => ({ ...t })),
      sound: { timer: 30, volume: 0.8 },
    },
    active: null, // { type: 'sleep' | 'nap', start: ms }
    entries: [], // { id, type, start, end, quality, mood, tags, dream, sample? }
  };
}

function validEntry(e) {
  return e && typeof e === 'object' && typeof e.start === 'number' && typeof e.end === 'number' && e.end > e.start;
}

function normalise(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const settings = { ...d.settings, ...(raw.settings || {}) };
  settings.sound = { ...d.settings.sound, ...((raw.settings || {}).sound || {}) };
  if (!Array.isArray(settings.tags)) settings.tags = d.settings.tags;
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).filter(validEntry).map(e => ({
    id: e.id || uid(),
    type: e.type === 'nap' ? 'nap' : 'sleep',
    start: e.start,
    end: e.end,
    quality: e.quality ?? null,
    mood: e.mood ?? null,
    tags: Array.isArray(e.tags) ? e.tags : [],
    dream: typeof e.dream === 'string' ? e.dream : '',
    ...(e.sample ? { sample: true } : {}),
  }));
  const active = raw.active && typeof raw.active.start === 'number' ? raw.active : null;
  return { ...d, ...raw, settings, entries, active };
}

function load() {
  try { return normalise(JSON.parse(localStorage.getItem(KEY))); } catch { return defaults(); }
}

let state = load();
sortEntries();
const listeners = new Set();

function sortEntries() { state.entries.sort((a, b) => b.end - a.end); }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { console.warn('Lull could not save', err); }
}
export const get = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function update(fn) {
  fn(state);
  sortEntries();
  save();
  listeners.forEach(l => l(state));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- entries ----------
export function addEntry(e) {
  const entry = { id: uid(), quality: null, mood: null, tags: [], dream: '', ...e };
  update(s => { s.entries.push(entry); });
  return entry;
}
export function updateEntry(id, patch) {
  update(s => {
    const e = s.entries.find(x => x.id === id);
    if (e) Object.assign(e, patch);
  });
}
export function deleteEntry(id) {
  let removed = null;
  update(s => {
    const i = s.entries.findIndex(x => x.id === id);
    if (i >= 0) removed = s.entries.splice(i, 1)[0];
  });
  return removed;
}
export function restoreEntry(entry) { update(s => { s.entries.push(entry); }); }
export const findEntry = id => state.entries.find(e => e.id === id) || null;

export function startActive(type) { update(s => { s.active = { type, start: Date.now() }; }); }
export function cancelActive() { update(s => { s.active = null; }); }
/** Ends the running sleep/nap. Returns the raw window without saving. */
export function endActive() {
  const a = state.active;
  if (!a) return null;
  const draft = { type: a.type, start: a.start, end: Date.now() };
  update(s => { s.active = null; });
  return draft;
}

export function overlapping(start, end, ignoreId) {
  return state.entries.find(e => e.id !== ignoreId && e.start < end && e.end > start) || null;
}

// ---------- time helpers ----------
const pad = n => String(n).padStart(2, '0');
export const durMin = e => Math.round((e.end - e.start) / MIN);
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function keyToDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
export function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
export const minutesOfDay = ts => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
export function hmToMin(hm) { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
export function minToHM(min) { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }

/** Mean of clock times (minutes of day) that may wrap past midnight. */
export function meanClock(list, target) {
  if (!list.length) return null;
  const pivot = (target + 720) % 1440;
  const shifted = list.map(m => (m - pivot + 1440) % 1440);
  const mean = shifted.reduce((a, b) => a + b, 0) / shifted.length;
  const sd = Math.sqrt(shifted.reduce((a, b) => a + (b - mean) ** 2, 0) / shifted.length);
  return { mean: (mean + pivot) % 1440, sd };
}

// ---------- daily summaries ----------
export function dailyMap(entries = state.entries) {
  const map = new Map();
  for (const e of entries) {
    const k = dayKey(e.end);
    let day = map.get(k);
    if (!day) { day = { key: k, sleeps: [], naps: [], sleepMin: 0, napMin: 0 }; map.set(k, day); }
    if (e.type === 'nap') { day.naps.push(e); day.napMin += durMin(e); }
    else { day.sleeps.push(e); day.sleepMin += durMin(e); }
  }
  for (const day of map.values()) {
    day.totalMin = day.sleepMin + day.napMin;
    day.main = day.sleeps.slice().sort((a, b) => durMin(b) - durMin(a))[0] || null;
    day.quality = day.main?.quality ?? null;
    day.mood = day.main?.mood ?? null;
    day.tags = day.main?.tags ?? [];
  }
  return map;
}

/** Array of the last n calendar days (oldest first), each { key, date, day|null }. */
export function lastDays(n, map = dailyMap()) {
  const today = startOfDay(new Date());
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const key = dayKey(date);
    out.push({ key, date, day: map.get(key) || null });
  }
  return out;
}

/** A night can be split (woke at 3am, slept again). Joins sleeps less than 3 hours apart. */
export function nightAround(entry, entries = state.entries) {
  const sleeps = entries.filter(e => e.type === 'sleep').sort((a, b) => a.start - b.start);
  const i = sleeps.findIndex(e => e.id === entry.id);
  if (i < 0) return { start: entry.start, end: entry.end, min: durMin(entry), parts: [entry] };
  const near = (a, b) => b.start >= a.end && b.start - a.end <= 3 * 3600000;
  let lo = i, hi = i;
  while (lo > 0 && near(sleeps[lo - 1], sleeps[lo])) lo--;
  while (hi < sleeps.length - 1 && near(sleeps[hi], sleeps[hi + 1])) hi++;
  const parts = sleeps.slice(lo, hi + 1);
  return { start: parts[0].start, end: parts[parts.length - 1].end, min: parts.reduce((t, e) => t + durMin(e), 0), parts };
}

const GOAL_SLACK = 15; // minutes of grace when judging a night "on goal"
export const metGoal = (day, goal) => !!day && day.sleepMin > 0 && day.totalMin >= goal - GOAL_SLACK;

export function streak(map = dailyMap(), goal = state.settings.goalMin) {
  let date = startOfDay(new Date());
  if (!map.get(dayKey(date))) date = addDays(date, -1);
  let n = 0;
  while (metGoal(map.get(dayKey(date)), goal)) { n++; date = addDays(date, -1); }
  return n;
}

export function bestStreak(map = dailyMap(), goal = state.settings.goalMin) {
  const keys = [...map.keys()].sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const d = keyToDate(k);
    const ok = metGoal(map.get(k), goal);
    const consecutive = prev && Math.round((d - prev) / 86400000) === 1;
    run = ok ? (consecutive ? run + 1 : 1) : 0;
    if (!ok) run = 0;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Sleep debt over the last `window` days: shortfalls minus surpluses, never below 0. */
export function sleepDebt(map = dailyMap(), goal = state.settings.goalMin, window = 14) {
  let sum = 0, nights = 0;
  for (const { day } of lastDays(window, map)) {
    if (!day || day.sleepMin === 0) continue;
    sum += goal - day.totalMin;
    nights++;
  }
  return { minutes: Math.max(0, Math.round(sum)), nights };
}

export function rangeStats(n) {
  const s = state.settings;
  const map = dailyMap();
  const days = lastDays(n, map);
  const logged = days.filter(d => d.day && d.day.sleepMin > 0);
  const avg = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  const bed = meanClock(logged.map(d => minutesOfDay(d.day.main.start)), hmToMin(s.bedtime));
  const wake = meanClock(logged.map(d => minutesOfDay(d.day.main.end)), hmToMin(s.wake));
  const q = logged.map(d => d.day.quality).filter(v => v != null);
  const m = logged.map(d => d.day.mood).filter(v => v != null);
  let consistency = null;
  if (bed && wake && logged.length >= 3) {
    const sd = (bed.sd + wake.sd) / 2;
    consistency = Math.round(100 * Math.exp(-sd / 70));
  }
  return {
    days, logged,
    avgTotal: avg(logged.map(d => d.day.totalMin)),
    avgBed: bed?.mean ?? null,
    avgWake: wake?.mean ?? null,
    avgQuality: avg(q),
    avgMood: avg(m),
    consistency,
    onGoal: logged.filter(d => metGoal(d.day, s.goalMin)).length,
  };
}

/** How each habit tag relates to sleep length and quality over the last n days. */
export function habitImpact(n) {
  const map = dailyMap();
  const nights = lastDays(n, map).filter(d => d.day && d.day.main).map(d => d.day);
  const avg = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  return state.settings.tags.map(tag => {
    const w = nights.filter(d => d.tags.includes(tag.id));
    const wo = nights.filter(d => !d.tags.includes(tag.id));
    const qw = w.map(d => d.quality).filter(v => v != null);
    const qwo = wo.map(d => d.quality).filter(v => v != null);
    const enough = w.length >= 2 && wo.length >= 2;
    return {
      tag, count: w.length, enough,
      durDiff: enough ? Math.round(avg(w.map(d => d.totalMin)) - avg(wo.map(d => d.totalMin))) : null,
      qualDiff: enough && qw.length && qwo.length ? avg(qw) - avg(qwo) : null,
    };
  }).filter(r => r.count > 0).sort((a, b) => (b.enough - a.enough) || Math.abs(b.durDiff ?? 0) - Math.abs(a.durDiff ?? 0));
}

// ---------- backup ----------
export function exportJSON() {
  return JSON.stringify({ app: 'lull', exportedAt: new Date().toISOString(), ...state }, null, 2);
}
export function importJSON(text) {
  const raw = JSON.parse(text);
  const incoming = normalise(raw);
  let added = 0;
  update(s => {
    const ids = new Set(s.entries.map(e => e.id));
    for (const e of incoming.entries) if (!ids.has(e.id)) { s.entries.push(e); added++; }
    s.settings = { ...s.settings, ...incoming.settings };
    s.onboarded = true;
  });
  return added;
}
export function exportCSV() {
  const tagName = id => state.settings.tags.find(t => t.id === id)?.label || id;
  const iso = ts => { const d = new Date(ts); return `${dayKey(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['type', 'start', 'end', 'minutes', 'quality', 'mood', 'tags', 'dream']];
  for (const e of [...state.entries].reverse()) {
    rows.push([e.type, iso(e.start), iso(e.end), durMin(e), e.quality ?? '', e.mood ?? '', e.tags.map(tagName).join('; '), e.dream]);
  }
  return rows.map(r => r.map(esc).join(',')).join('\n');
}
export function eraseAll() { const keep = state.settings; state = defaults(); state.settings = keep; state.onboarded = true; update(() => {}); }
export function removeSamples() { update(s => { s.entries = s.entries.filter(e => !e.sample); }); }
export const hasSamples = () => state.entries.some(e => e.sample);

// ---------- sample data ----------
const DREAMS = [
  'Flying low over a city made of paper lanterns. Everything smelled like rain.',
  'Back in school, but the classrooms kept turning into train carriages.',
  'A long conversation with a fox who ran a bakery.',
  'Swimming through a library. The books were warm.',
  'Lost my keys in a forest, then found them in the moon.',
];
export function addSampleNights(nights = 42) {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const today = startOfDay(new Date());
  const entries = [];
  for (let i = nights; i >= 1; i--) {
    const wakeDay = addDays(today, -i + 1);
    const weekday = addDays(wakeDay, -1).getDay();
    const weekend = weekday === 5 || weekday === 6;
    const tags = [];
    if (rnd() < 0.35) tags.push('caffeine');
    if (rnd() < 0.4) tags.push('screens');
    if (rnd() < 0.3) tags.push('exercise');
    if (rnd() < 0.15) tags.push('alcohol');
    if (rnd() < 0.25) tags.push('reading');
    let bed = 23 * 60 + 20 + (rnd() - 0.5) * 70 + (weekend ? 55 : 0) + (tags.includes('screens') ? 25 : 0);
    let dur = 420 + (rnd() - 0.5) * 110 + (weekend ? 40 : 0) - (tags.includes('caffeine') ? 30 : 0) + (tags.includes('exercise') ? 15 : 0) - (tags.includes('alcohol') ? 20 : 0);
    const start = addDays(wakeDay, -1).getTime() + bed * MIN;
    const end = start + Math.round(dur) * MIN;
    let quality = Math.round(Math.min(5, Math.max(1, 1 + (dur - 330) / 45 + (rnd() - 0.5) * 1.6 - (tags.includes('alcohol') ? 1 : 0) + (tags.includes('reading') ? 0.5 : 0))));
    const mood = Math.round(Math.min(5, Math.max(1, quality + (rnd() - 0.5) * 1.8)));
    entries.push({ id: uid() + i, type: 'sleep', start, end, quality, mood, tags, dream: rnd() < 0.18 ? DREAMS[Math.floor(rnd() * DREAMS.length)] : '', sample: true });
    if (rnd() < 0.18) {
      const ns = wakeDay.getTime() + (14 * 60 + rnd() * 120) * MIN;
      entries.push({ id: uid() + 'n' + i, type: 'nap', start: ns, end: ns + Math.round(20 + rnd() * 60) * MIN, quality: null, mood: null, tags: [], dream: '', sample: true });
    }
  }
  update(s => {
    const now = Date.now();
    for (const e of entries) if (e.end < now && !overlapping(e.start, e.end)) s.entries.push(e);
    s.onboarded = true;
  });
}
