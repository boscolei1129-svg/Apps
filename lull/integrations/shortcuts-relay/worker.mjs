import { validateEvent } from '../../js/rest.js';

const MAX_BODY = 2048, RETENTION = 90 * 86400000, MAX_RECORDS = 500;
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });

async function matches(actual, expected) {
  // Fixed-size digest comparison; don't compare a secret character by character.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function boundedJSON(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('JSON required');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new Error('Body too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGIN;
    const respond = response => {
      const headers = new Headers(response.headers);
      headers.set('Vary', 'Origin');
      if (origin === allowed) headers.set('Access-Control-Allow-Origin', allowed);
      return new Response(response.body, { status: response.status, headers });
    };
    // No query-string credentials, wildcard CORS, public keys, or fallback secrets.
    if (url.protocol !== 'https:' || url.pathname !== '/events' || url.search) return respond(json({ error: 'Not found' }, 404));
    if (!allowed || !validToken(env.READ_TOKEN) || !validToken(env.WRITE_TOKEN) || env.READ_TOKEN === env.WRITE_TOKEN) return respond(json({ error: 'Relay not configured' }, 503));
    if (origin && origin !== allowed) return respond(json({ error: 'Origin not allowed' }, 403));
    if (request.method === 'OPTIONS') {
      if (origin !== allowed) return respond(json({ error: 'Origin not allowed' }, 403));
      const response = json({ ok: true });
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.headers.set('Access-Control-Max-Age', '600');
      return respond(response);
    }
    if (!['GET', 'POST'].includes(request.method)) return respond(json({ error: 'Method not allowed' }, 405));
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '')?.[1];
    const expected = request.method === 'POST' ? env.WRITE_TOKEN : env.READ_TOKEN;
    if (!token || !await matches(token, expected)) return respond(json({ error: 'Unauthorized' }, 401));
    let event;
    if (request.method === 'POST') {
      try {
        event = validateEvent(await boundedJSON(request));
        if (Date.parse(event.at) < Date.now() - 7 * 86400000) throw new Error('Event too old');
      } catch { return respond(json({ error: 'Invalid event; use a unique ID and ISO timestamp within the last 7 days' }, 400)); }
    }
    try {
      const stub = env.REST_LOG.get(env.REST_LOG.idFromName('personal-lull-v1'));
      const internal = new Request('https://rest.internal/events', event ? { method: 'POST', body: JSON.stringify(event) } : {});
      return respond(await stub.fetch(internal));
    } catch { return respond(json({ error: 'Storage unavailable; retry the same event ID' }, 503)); }
  },
};

// One private Durable Object serializes writes so bedtime/wake requests cannot overwrite each other.
// This object has no public URL. Only the authenticated Worker can reach its binding.
export class RestLog {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    if (request.method === 'GET') {
      const events = (await this.ctx.storage.get('events') || []).filter(e => Date.parse(e.at) >= Date.now() - RETENTION);
      return json({ app: 'lull-shortcuts', version: 1, events });
    }
    const event = validateEvent(await request.json());
    return this.ctx.storage.transaction(async txn => {
      const now = Date.now();
      const events = (await txn.get('events') || []).filter(e => Date.parse(e.at) >= now - RETENTION);
      const existing = events.find(e => e.id === event.id);
      if (existing) return existing.at === event.at && existing.event === event.event ? json({ ok: true, duplicate: true }) : json({ error: 'ID conflict; do not reuse IDs' }, 409);
      const attempts = (await txn.get('writes') || []).filter(t => t > now - 3600000);
      if (attempts.length >= 20) return json({ error: 'Write limit reached; retry later with the same ID' }, 429);
      if (events.length >= MAX_RECORDS) return json({ error: 'Relay record limit reached; export and reset the relay' }, 507);
      events.push(event); attempts.push(now);
      await txn.put('events', events);
      await txn.put('writes', attempts);
      // An alarm removes old data even when no one opens the app again.
      await this.ctx.storage.setAlarm(now + 86400000);
      return json({ ok: true, duplicate: false }, 201);
    });
  }
  async alarm() {
    await this.ctx.storage.transaction(async txn => {
      const events = (await txn.get('events') || []).filter(e => Date.parse(e.at) >= Date.now() - RETENTION);
      await txn.put('events', events);
      await txn.put('writes', (await txn.get('writes') || []).filter(t => t > Date.now() - 3600000));
      if (events.length) await this.ctx.storage.setAlarm(Date.now() + 86400000);
    });
  }
}
