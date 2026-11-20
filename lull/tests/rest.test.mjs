import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents, mergeEvents, restPeriods, validateEvent, relayURL, MAX_BYTES } from '../js/rest.js';

const now = Date.parse('2026-11-20T12:00:00Z');
const event = (event, at, id = event + '0000000000000001') => ({ version: 1, id, event, at });
const bed = event('bedtime', '2026-11-19T23:00:00+08:00');
const wake = event('wake', '2026-11-20T07:00:00+08:00');

test('accepts single files, batches, JSON Lines and relay envelopes; normalizes instants', () => {
  assert.equal(parseEvents(JSON.stringify(bed), now)[0].at, '2026-11-19T15:00:00.000Z');
  for (const text of [JSON.stringify([bed, wake]), [bed, wake].map(JSON.stringify).join('\r\n') + '\n', JSON.stringify({ app: 'lull-shortcuts', version: 1, events: [wake, bed] })]) {
    const records = parseEvents(text, now);
    assert.equal(restPeriods(records).periods[0].end - restPeriods(records).periods[0].start, 8 * 3600000);
    assert.equal(restPeriods(records).periods[0].estimate, true);
  }
});

test('rejects invalid schema, timezone-free/future/impossible times and oversized data', () => {
  for (const patch of [{ id: '<script>' }, { id: 1234567890123456 }, { event: 'sleep' }, { version: '1' }, { at: '2026-11-19T23:00:00' }, { at: '2026-11-21T23:00:00Z' }, { at: '2026-02-30T12:00:00Z' }, { at: '2026-11-19T24:00:00Z' }, { at: '2026-11-19T23:00:00+15:00' }]) {
    assert.throws(() => validateEvent({ ...bed, ...patch }, now));
  }
  assert.throws(() => parseEvents('x'.repeat(MAX_BYTES + 1), now));
  assert.throws(() => parseEvents('bad\njson', now));
  assert.throws(() => parseEvents('', now));
});

test('duplicate IDs are idempotent; conflicting IDs reject before mutation', () => {
  const existing = mergeEvents([], [bed], now);
  assert.equal(mergeEvents(existing, [bed, wake], now).length, 2);
  assert.throws(() => mergeEvents(existing, [{ ...bed, event: 'wake' }], now), /ID/);
  assert.equal(existing.length, 1);
});

test('DST uses elapsed time and out-of-order records still pair', () => {
  const start = event('bedtime', '2026-11-01T00:00:00-04:00');
  const end = event('wake', '2026-11-01T08:00:00-05:00');
  const { periods } = restPeriods(mergeEvents([], [end, start], now));
  assert.equal((periods[0].end - periods[0].start) / 3600000, 9);
});

test('orphan, missing, ambiguous, too short and stale windows never invent sleep', () => {
  for (const records of [[wake], [bed], [bed, { ...bed, id: 'otherbed0000000001', at: '2026-11-19T23:01:00+08:00' }, wake], [bed, { ...wake, at: '2026-11-19T23:03:00+08:00' }], [{ ...bed, at: '2026-11-17T23:00:00+08:00' }, wake]]) {
    const result = restPeriods(mergeEvents([], records, now));
    assert.equal(result.periods.length, 0);
    assert.ok(result.issues.length);
  }
});

test('identical timestamp triggers with distinct IDs collapse deterministically', () => {
  const original = restPeriods(mergeEvents([], [bed, wake], now));
  const result = restPeriods(mergeEvents([], [bed, { ...bed, id: 'anotherbed00000001' }, wake], now));
  assert.equal(result.periods.length, 1);
  assert.equal(result.periods[0].id, original.periods[0].id);
});

test('relay address refuses insecure URLs, embedded credentials, queries and redirects through paths', () => {
  assert.equal(relayURL('https://mine.workers.dev/events'), 'https://mine.workers.dev/events');
  for (const url of ['http://mine/events', 'https://a:secret@mine/events', 'https://mine/events?token=x', 'https://mine/events#secret', 'https://mine/elsewhere']) assert.throws(() => relayURL(url));
});
