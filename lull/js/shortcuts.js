import * as store from './store.js';
import * as ui from './ui.js';
import { MAX_BYTES, parseEvents, relayURL } from './rest.js';
import { isRelayToken, scanReadToken } from './token-scanner.js';

const KEY = 'lull:shortcuts:relay'; // Private runtime preference, never in backups or source.
let connection = null, syncing = false, lastAttempt = 0, lastSync = '', generation = 0;
const watchers = new Set();
const notify = () => watchers.forEach(fn => fn());

async function boundedText(response) {
  if (!response.body) throw new Error('Empty relay response.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, result = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('Relay response exceeds 1 MB.'); }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { reader.releaseLock(); }
}

function readConnection() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && isRelayToken(raw.token)) return { url: relayURL(raw.url), token: raw.token, remember: true };
  } catch { /* No valid saved connection. */ }
  return null;
}

async function sync() {
  if (!connection || syncing) return;
  const started = generation;
  syncing = true; lastAttempt = Date.now(); notify();
  try {
    const res = await fetch(connection.url, {
      headers: { Authorization: `Bearer ${connection.token}` },
      cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'Read token rejected. Reconnect with the current token.' : 'Relay unavailable. Try again later; captured events stay on the relay.');
    const length = Number(res.headers.get('Content-Length'));
    if (length > MAX_BYTES) throw new Error('Relay response exceeds 1 MB.');
    const events = parseEvents(await boundedText(res));
    if (generation !== started) return;
    const added = store.importRestEvents(events);
    lastSync = `Synced ${new Date().toLocaleString()}. ${added} new trigger records.`;
  } catch (err) {
    if (generation !== started) return;
    lastSync = err instanceof TypeError || err?.name === 'TimeoutError' ? 'Could not reach the relay. Check the address, connection and allowed origin.' : err.message;
    ui.toast(lastSync);
  } finally { syncing = false; notify(); }
}

export function initShortcuts() {
  connection = readConnection();
  if (connection) void sync();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && connection && Date.now() - lastAttempt > 60000) void sync();
  });
}

export function forgetRelay() {
  localStorage.removeItem(KEY);
  generation++;
  connection = null;
  lastSync = 'Disconnected. Imported estimates stay on this device. Relay records and Shortcuts are unchanged.';
  notify();
}

export function openShortcuts() {
  const { el, esc, $, fmtDay, fmtTime, fmtDur } = ui;
  const body = el(`<div class="settings shortcuts">
    <p>Automatically record scheduled bedtime and wake triggers on your iPhone. These are <strong>estimated rest periods</strong>, not measured sleep onset, sleep stages or actual waking.</p>
    <p class="fine">Lull cannot monitor Motion &amp; Fitness or detect sleep from a locked web app. These estimates stay separate from nights, naps, dreams, goals and sleep statistics.</p>
    <p><a href="https://github.com/boscolei1129-svg/Apps/blob/pocket-snake/lull/SHORTCUTS.md" target="_blank" rel="noopener noreferrer">iPhone setup instructions</a></p>
    <div class="field"><span>Import from Files</span>
      <p class="fine">Choose one or more Shortcuts event JSON files, or a JSON Lines log. Importing again adds only new events. No upload, account or secret key is needed. Files in iCloud Drive also sync through your Apple account.</p>
      <button class="btn btn-ghost btn-sm" type="button" data-choose>Import Shortcuts events</button>
      <input type="file" accept=".json,.jsonl,.txt,application/json,text/plain" multiple hidden data-file>
    </div>
    <details><summary>Optional private relay</summary>
      <p class="fine">Requires your own deployed relay. Shortcuts sends trigger IDs and times to it; Lull fetches them when open. Connect only to your own HTTPS address. The read token grants access to rest times.</p>
      <label class="field"><span>Relay URL</span><input type="url" data-url placeholder="https://your-relay.workers.dev/events" autocomplete="off"></label>
      <label class="field"><span>Relay read token</span><input type="password" data-token autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div class="data-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-scan>Scan read token QR</button>
        <button class="btn btn-ghost btn-sm" type="button" data-stop-scan hidden>Stop camera</button>
      </div>
      <video class="token-camera" data-camera autoplay playsinline muted hidden aria-label="QR scanner camera preview"></video>
      <p class="fine" data-scan-status role="status" hidden></p>
      <label class="switch-row"><span>Remember on this browser</span><input type="checkbox" data-remember role="switch"><i aria-hidden="true"></i></label>
      <p class="fine">By default the token stays in memory until reload. Remembering stores it on this browser for automatic sync on launch; scripts on this github.io origin can read it. It is excluded from Lull backups and CSV. Never enter a write token, GitHub token or admin key here.</p>
      <div class="data-actions"><button class="btn btn-primary btn-sm" type="button" data-connect>Connect &amp; sync</button><button class="btn btn-ghost btn-sm" type="button" data-sync>Sync now</button><button class="btn btn-ghost btn-sm" type="button" data-disconnect>Disconnect &amp; forget token</button></div>
    </details>
    <p class="fine" role="status" data-status></p>
    <div class="data-actions"><button class="btn btn-ghost btn-sm" type="button" data-csv>Export rest CSV</button></div>
    <div data-records></div>
  </div>`);
  if (connection) {
    $('[data-url]', body).value = connection.url;
    $('[data-token]', body).value = connection.token;
    $('[data-remember]', body).checked = !!connection.remember;
  }
  const render = () => {
    $('[data-status]', body).textContent = syncing ? 'Syncing…' : lastSync || (connection ? 'Relay connected for this session.' : 'No relay connected. File import works offline.');
    $('[data-sync]', body).disabled = !connection || syncing;
    $('[data-connect]', body).disabled = syncing;
    $('[data-disconnect]', body).disabled = syncing;
    const { periods, issues } = store.getRest();
    $('[data-records]', body).innerHTML = `<h3>Estimated rest periods (${periods.length})</h3>
      <p class="fine">Trigger times are shown in this device’s current timezone. No sleep-onset delay is subtracted. A missed or late trigger can make an estimate wrong.</p>
      ${periods.slice(0, 60).map(p => `<article class="rest-record"><strong>Estimated rest · ${esc(fmtDur(store.durMin(p)))}</strong>
        <p>${esc(fmtDay(p.start))} ${esc(fmtTime(p.start))} → ${esc(fmtDay(p.end))} ${esc(fmtTime(p.end))}</p>
        <p class="fine">Apple Shortcuts · not detected sleep${store.overlapping(p.start, p.end) ? ' · overlaps a diary entry' : ''}</p>
        <button class="btn btn-text btn-sm" type="button" data-dismiss="${esc(p.id)}">Dismiss estimate</button></article>`).join('') || '<p class="fine">No complete rest periods yet. Import a bedtime and wake trigger.</p>'}
      ${periods.length > 60 ? '<p class="fine">Showing the latest 60; export rest CSV for all periods.</p>' : ''}
      ${issues.length ? `<h3>Unpaired triggers (${issues.length})</h3><ul class="fine">${issues.slice(0, 20).map(x => `<li>${esc(new Date(x.event.at).toLocaleString())}: ${esc(x.reason)}</li>`).join('')}</ul><p class="fine">No sleep is invented for missing or ambiguous triggers. All raw records remain in your JSON backup.</p>` : ''}`;
  };
  const relaySettings = $('details', body);
  const scanButton = $('[data-scan]', body);
  const stopScanButton = $('[data-stop-scan]', body);
  const scanStatus = $('[data-scan-status]', body);
  let stopScanner = null;
  function showScanStatus(message, running) {
    scanStatus.textContent = message;
    scanStatus.hidden = !message;
    scanButton.disabled = running;
    stopScanButton.hidden = !running;
  }
  function stopScanning() {
    stopScanner?.();
    stopScanner = null;
    showScanStatus('', false);
  }
  scanButton.onclick = () => {
    stopScanning();
    stopScanner = scanReadToken($('[data-camera]', body), token => { $('[data-token]', body).value = token; }, showScanStatus);
  };
  stopScanButton.onclick = stopScanning;
  relaySettings.addEventListener('toggle', () => { if (!relaySettings.open) stopScanning(); });

  const unsubscribe = store.subscribe(render);
  watchers.add(render);
  ui.openSheet({ title: 'Shortcuts & rest estimates', body, className: 'sheet-settings', onClose: () => {
    stopScanning();
    unsubscribe();
    watchers.delete(render);
    $('[data-token]', body).value = '';
  } });
  render();
  $('[data-choose]', body).onclick = () => $('[data-file]', body).click();
  $('[data-file]', body).onchange = async e => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    try {
      if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) throw new Error('Choose event files totaling less than 1 MB.');
      const batches = await Promise.all(files.map(async f => parseEvents(await f.text())));
      const added = store.importRestEvents(batches.flat());
      ui.toast(`${added} new Shortcuts trigger records imported`);
    } catch (err) { ui.toast(err.name === 'QuotaExceededError' ? 'Browser storage is full. Export a backup and free space, then import again.' : err.message); }
    e.target.value = '';
  };
  $('[data-connect]', body).onclick = () => {
    try {
      const url = relayURL($('[data-url]', body).value.trim());
      const token = $('[data-token]', body).value.trim();
      if (!isRelayToken(token)) throw new Error('Scan your read token QR or paste the full 43-character read token.');
      stopScanning();
      const remember = $('[data-remember]', body).checked;
      if (remember) localStorage.setItem(KEY, JSON.stringify({ url, token }));
      else localStorage.removeItem(KEY);
      connection = { url, token, remember };
      void sync();
    } catch (err) { ui.toast(err.message); }
  };
  $('[data-sync]', body).onclick = () => void sync();
  $('[data-disconnect]', body).onclick = () => {
    stopScanning();
    try { forgetRelay(); } catch { ui.toast('Could not forget the saved connection. Check browser storage permissions.'); return; }
    $('[data-token]', body).value = ''; $('[data-remember]', body).checked = false; render();
  };
  $('[data-csv]', body).onclick = () => ui.download(`lull-rest-estimates-${store.dayKey(Date.now())}.csv`, store.exportRestCSV(), 'text/csv');
  body.addEventListener('click', e => {
    const btn = e.target.closest('[data-dismiss]');
    if (!btn) return;
    const id = btn.dataset.dismiss;
    store.dismissRest(id);
    ui.toast('Rest estimate dismissed', { action: 'Undo', onAction: () => store.restoreRest(id) });
  });
}
