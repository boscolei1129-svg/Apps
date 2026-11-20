// Shortcuts records describe scheduled rest, never detected sleep.
export const MAX_EVENTS = 10000;
export const MAX_BYTES = 1024 * 1024;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateEvent(raw, now = Date.now()) {
  if (!raw || raw.version !== 1 || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(raw.id) ||
      !['bedtime', 'wake'].includes(raw.event) || typeof raw.at !== 'string' || !ISO.test(raw.at)) {
    throw new Error('Use a version 1 Lull event with an ID, bedtime/wake event and ISO 8601 timestamp including timezone.');
  }
  const at = Date.parse(raw.at);
  const tz = /([+-])(\d{2}):(\d{2})$/.exec(raw.at);
  const offset = tz ? (tz[1] === '+' ? 1 : -1) * (+tz[2] * 60 + +tz[3]) : 0;
  const validOffset = !tz || (+tz[2] <= 14 && +tz[3] < 60 && (+tz[2] !== 14 || +tz[3] === 0));
  if (!Number.isFinite(at) || !validOffset || at < Date.UTC(2000, 0, 1) || at > now + 300000 ||
      new Date(at + offset * 60000).toISOString().slice(0, 19) !== raw.at.slice(0, 19)) {
    throw new Error('An event has an invalid or future time. Check the phone clock and timezone.');
  }
  return { version: 1, id: raw.id, event: raw.event, at: new Date(at).toISOString() };
}

export function mergeEvents(existing, incoming, now = Date.now()) {
  if (!Array.isArray(existing) || !Array.isArray(incoming) || incoming.length > MAX_EVENTS) throw new Error('Too many events.');
  const map = new Map();
  for (const raw of [...existing, ...incoming]) {
    const e = validateEvent(raw, now);
    const old = map.get(e.id);
    if (old && (old.event !== e.event || old.at !== e.at)) throw new Error('An event ID was reused with different data. Nothing was imported.');
    map.set(e.id, e);
  }
  if (map.size > MAX_EVENTS) throw new Error('The 10,000 event limit is reached. Export a backup before starting a new log.');
  return [...map.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export function parseEvents(text, now = Date.now()) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Choose an event file smaller than 1 MB.');
  const trimmed = text.trim();
  if (!trimmed) throw new Error('The event file is empty.');
  let raw;
  try { raw = JSON.parse(trimmed); } catch {
    try { raw = trimmed.split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l)); }
    catch { throw new Error('Choose Lull Shortcuts JSON or JSON Lines, with one complete event per line.'); }
  }
  const events = Array.isArray(raw) ? raw : raw?.app === 'lull-shortcuts' && raw.version === 1 ? raw.events : [raw];
  return mergeEvents([], events, now);
}

export function restPeriods(events) {
  const periods = [], issues = [];
  let pending = [];
  // Identical timestamp/kind with distinct IDs is a duplicate trigger, not a second night.
  const seen = new Set();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    const signature = `${e.event}:${e.at}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    if (e.event === 'bedtime') { pending.push(e); continue; }
    if (!pending.length) { issues.push({ event: e, reason: 'Wake trigger without a bedtime' }); continue; }
    if (pending.length !== 1) {
      for (const p of pending) issues.push({ event: p, reason: 'Multiple bedtimes before one wake; no estimate created' });
      issues.push({ event: e, reason: 'Ambiguous wake; check your automations' });
    } else {
      const start = Date.parse(pending[0].at), end = Date.parse(e.at);
      const minutes = (end - start) / 60000;
      if (minutes >= 5 && minutes <= 18 * 60) {
        // Stable even if a duplicate trigger arrives later with a lexically earlier ID.
        periods.push({ id: `rest-${start}-${end}`, start, end, source: 'apple-shortcuts', estimate: true });
      } else issues.push({ event: e, reason: 'Rest window outside 5 minutes–18 hours; no estimate created' });
    }
    pending = [];
  }
  for (const e of pending) issues.push({ event: e, reason: 'Waiting for a wake trigger' });
  return { periods: periods.reverse(), issues: issues.reverse() };
}

export function relayURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter the HTTPS relay URL ending in /events.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/events') {
    throw new Error('Use an HTTPS /events URL without a password, query or fragment.');
  }
  return url.href;
}
