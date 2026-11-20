import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
let full = false;
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => { if (full) throw new DOMException('Full', 'QuotaExceededError'); memory.set(key, value); },
};
const store = await import('../js/store.js');
const ts = Date.now() - 86400000;
const triggers = [
  { version: 1, id: 'bedtime000000000001', event: 'bedtime', at: new Date(ts - 8 * 3600000).toISOString() },
  { version: 1, id: 'waketime00000000001', event: 'wake', at: new Date(ts).toISOString() },
];

test('existing diary/timer and sleep math survive rest imports, reload, dismissals and backup roundtrip', async () => {
  store.update(s => { s.settings.name = 'Test'; s.onboarded = true; });
  const entry = store.addEntry({ type: 'sleep', start: ts - 7 * 3600000, end: ts, quality: 4, mood: 3, tags: ['reading'], dream: 'Test dream' });
  const nap = store.addEntry({ type: 'nap', start: ts + 6 * 3600000, end: ts + 6.5 * 3600000 });
  store.startActive('sleep');
  const before = structuredClone(store.get());
  const sleepCSV = store.exportCSV();
  const daily = structuredClone([...store.dailyMap()]);
  assert.equal(store.importRestEvents(triggers), 2);
  assert.equal(store.importRestEvents(triggers), 0);
  assert.deepEqual(store.get().entries, before.entries);
  assert.deepEqual(store.get().active, before.active);
  assert.deepEqual([...store.dailyMap()], daily);
  assert.equal(store.exportCSV(), sleepCSV);
  assert.match(store.exportRestCSV(), /Estimated rest period; not detected sleep/);
  assert.ok(store.overlapping(ts - 8 * 3600000, ts));
  assert.equal(store.getRest().periods.length, 1);
  const id = store.getRest().periods[0].id;
  store.dismissRest(id);
  assert.equal(store.getRest().periods.length, 0);
  store.importRestEvents(triggers);
  assert.equal(store.getRest().periods.length, 0);
  store.restoreRest(id);
  const backup = store.exportJSON();
  memory.set('lull:shortcuts:relay', JSON.stringify({ token: 'private-runtime-token', url: 'https://example.test/events' }));
  assert.ok(!store.exportJSON().includes('private-runtime-token'));
  const reloaded = await import('../js/store.js?reload');
  assert.equal(reloaded.getRest().periods.length, 1);
  assert.equal(reloaded.get().settings.name, 'Test');
  assert.deepEqual(reloaded.findEntry(entry.id), entry);
  assert.deepEqual(reloaded.findEntry(nap.id), nap);
  store.eraseAll();
  assert.equal(store.importJSON(backup), 4); // Two diary entries plus two trigger records.
  assert.deepEqual(store.get().entries, before.entries);
  assert.equal(store.getRest().periods.length, 1);
  assert.equal(store.importJSON(backup), 0);
  store.updateEntry(entry.id, { dream: 'Edited dream' });
  assert.equal(store.findEntry(entry.id).dream, 'Edited dream');
  const removed = store.deleteEntry(nap.id); store.restoreEntry(removed);
  assert.equal(store.findEntry(nap.id).type, 'nap');
});

test('invalid or conflicting imports are atomic and quota errors do not claim success', () => {
  const before = JSON.stringify(store.get());
  assert.throws(() => store.importRestEvents([triggers[0], { ...triggers[1], event: 'invalid' }]));
  assert.throws(() => store.importRestEvents([{ ...triggers[0], event: 'wake' }]));
  assert.throws(() => store.importJSON('{"random":true}'));
  assert.throws(() => store.importJSON(JSON.stringify({ app: 'lull', version: 1, entries: [], restEvents: [{ bad: true }] })));
  assert.equal(JSON.stringify(store.get()), before);
  full = true;
  assert.throws(() => store.importRestEvents([{ ...triggers[0], id: 'newbedtime000000001' }]), /Full/);
  assert.throws(() => store.importJSON(store.exportJSON()), /Full/);
  full = false;
  assert.equal(JSON.stringify(store.get()), before);
});

test('legacy backups import without altering existing sleep records; corrupt ledger does not hide diary', async () => {
  const legacy = JSON.parse(store.exportJSON());
  delete legacy.restEvents; delete legacy.restDismissed;
  assert.equal(store.importJSON(JSON.stringify(legacy)), 0);
  const corrupted = { ...legacy, restEvents: [{ malformed: true }] };
  memory.set('lull:v1', JSON.stringify(corrupted));
  const reloaded = await import('../js/store.js?corrupted');
  assert.equal(reloaded.get().entries.length, legacy.entries.length);
  assert.equal(reloaded.getRest().periods.length, 0);
});
