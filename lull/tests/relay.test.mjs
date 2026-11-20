import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { RestLog } from '../integrations/shortcuts-relay/worker.mjs';

// Not production credentials; isolated, deterministic harness fixtures only.
const READ = 'R'.repeat(43), WRITE = 'W'.repeat(43);
const ORIGIN = 'https://boscolei1129-svg.github.io';
const makeEvent = i => ({ version: 1, id: `event000000000000${i}`, event: i % 2 ? 'wake' : 'bedtime', at: new Date(Date.now() - (1000 - i) * 1000).toISOString() });

function setup() {
  const data = new Map(); let tail = Promise.resolve(), alarm;
  const copy = value => value === undefined ? undefined : structuredClone(value);
  const storage = {
    get: async key => copy(data.get(key)),
    put: async (key, value) => { data.set(key, copy(value)); },
    setAlarm: async time => { alarm = time; },
    transaction(fn) {
      const run = tail.then(async () => {
        const staged = new Map([...data].map(([k, v]) => [k, copy(v)]));
        const txn = {
          get: async key => copy(staged.get(key)),
          put: async (key, value) => { staged.set(key, copy(value)); },
        };
        const result = await fn(txn);
        data.clear(); for (const [k, v] of staged) data.set(k, v);
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  const object = new RestLog({ storage });
  const env = { READ_TOKEN: READ, WRITE_TOKEN: WRITE, ALLOWED_ORIGIN: ORIGIN,
    REST_LOG: { idFromName: name => name, get: () => object } };
  const request = (method = 'GET', token = READ, event, extra = {}) => {
    const headers = { Origin: ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(event === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra.headers };
    return worker.fetch(new Request(extra.url || 'https://relay.example/events', { method, headers, ...(event === undefined ? {} : { body: typeof event === 'string' ? event : JSON.stringify(event) }) }), extra.env || env);
  };
  return { request, env, data, object, alarm: () => alarm };
}

test('separate scoped tokens, fail-closed config, authorization and exact origin', async () => {
  const h = setup();
  for (const [method, token] of [['GET', null], ['GET', WRITE], ['POST', READ], ['GET', 'x'.repeat(43)]]) {
    assert.equal((await h.request(method, token, method === 'POST' ? makeEvent(1) : undefined)).status, 401);
  }
  assert.equal((await h.request('GET', READ, undefined, { env: { ...h.env, READ_TOKEN: '' } })).status, 503);
  assert.equal((await h.request('GET', READ, undefined, { env: { ...h.env, READ_TOKEN: WRITE } })).status, 503);
  assert.equal((await h.request('GET', READ, undefined, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await h.request('GET', READ, undefined, { url: 'https://relay.example/events?token=hidden' })).status, 404);
  const preflight = await h.request('OPTIONS', null);
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  const read = await h.request();
  assert.equal(read.headers.get('Cache-Control'), 'no-store');
  assert.equal(read.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(read.headers.get('Access-Control-Allow-Credentials'), null);
  assert.deepEqual((await read.json()).events, []);
});

test('idempotent retries, conflicting IDs, no-origin Shortcuts writes and authenticated reads', async () => {
  const h = setup(), event = makeEvent(1);
  assert.equal((await h.request('POST', WRITE, event, { headers: { Origin: '' } })).status, 201);
  const duplicate = await h.request('POST', WRITE, event);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal((await h.request('POST', WRITE, { ...event, event: 'bedtime' })).status, 409);
  assert.equal((await (await h.request()).json()).events.length, 1);
  assert.equal(h.data.get('writes').length, 1);
  assert.ok(h.alarm() > Date.now());
});

test('JSON/body/time validation and bounded streaming input', async () => {
  const h = setup();
  for (const body of ['bad', '{}', JSON.stringify({ ...makeEvent(1), at: new Date(Date.now() + 600000).toISOString() }), JSON.stringify({ ...makeEvent(1), at: new Date(Date.now() - 8 * 86400000).toISOString() }), 'x'.repeat(3000)]) {
    assert.equal((await h.request('POST', WRITE, body)).status, 400);
  }
  assert.equal((await h.request('POST', WRITE, makeEvent(1), { headers: { 'Content-Type': 'text/plain' } })).status, 400);
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1500)); c.enqueue(new Uint8Array(1500)); c.close(); } });
  const req = new Request('https://relay.example/events', { method: 'POST', headers: { Authorization: `Bearer ${WRITE}`, 'Content-Type': 'application/json' }, body: stream, duplex: 'half' });
  assert.equal((await worker.fetch(req, h.env)).status, 400);
  assert.deepEqual((await (await h.request()).json()).events, []);
});

test('concurrent writes are retained; limit counts new IDs but allows identical retries', async () => {
  const h = setup();
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => h.request('POST', WRITE, makeEvent(i))));
  assert.ok(responses.every(r => r.status === 201));
  assert.equal((await (await h.request()).json()).events.length, 20);
  assert.equal((await h.request('POST', WRITE, makeEvent(21))).status, 429);
  const first = h.data.get('events')[0];
  assert.equal((await h.request('POST', WRITE, first)).status, 200);
});

test('retention read filtering and alarm cleanup remove old data; record capacity is bounded', async () => {
  const h = setup();
  h.data.set('events', [{ ...makeEvent(1), at: new Date(Date.now() - 91 * 86400000).toISOString() }, makeEvent(2)]);
  assert.equal((await (await h.request()).json()).events.length, 1);
  await h.object.alarm();
  assert.equal(h.data.get('events').length, 1);
  h.data.set('events', Array.from({ length: 500 }, (_, i) => makeEvent(i)));
  assert.equal((await h.request('POST', WRITE, makeEvent(501))).status, 507);
});

test('storage failure returns a generic retryable error without leaking credentials', async () => {
  const h = setup();
  h.env.REST_LOG.get = () => { throw new Error(`private ${READ}`); };
  const response = await h.request();
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(READ));
});
