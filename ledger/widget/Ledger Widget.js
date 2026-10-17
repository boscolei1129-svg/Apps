// Bosco's Ledger — Home Screen and Lock Screen widget for Scriptable.
// Setup: in Scriptable tap +, paste this script, and name it exactly "Ledger Widget".
// Then in the ledger tap Settings → Update widget. Add a Scriptable widget and pick "Ledger Widget".
// The ledger sends a small summary (no transactions): by link, or by clipboard if the link can't open.

const FILE = "bosco-ledger-widget.json";
const PREFIX = "BOSCO-LEDGER-WIDGET:";
const C = {
  bgTop: new Color("#1D5546"), bg: new Color("#0F2C26"),
  ink: new Color("#EEF6F2"), muted: new Color("#A6C8BE"), mint: new Color("#7FE0C2"),
  over: new Color("#FF9C86"), warn: new Color("#F2C46B"),
  track: new Color("#FFFFFF", 0.14), faint: new Color("#FFFFFF", 0.45), dim: new Color("#FFFFFF", 0.22)
};
const DAY = ["M", "T", "W", "T", "F", "S", "S"];

// ---------- data ----------
// Saved in the Keychain, which Scriptable's widgets can always read, with a file copy as backup.
const KEY = "bosco-ledger-widget";
let fm = null, path = null;
try { fm = FileManager.local(); path = fm.joinPath(fm.documentsDirectory(), FILE); } catch (e) {}
function valid(d) { return d && d.v === 1 && typeof d.weekly === "number" && typeof d.wkStart === "string" && Array.isArray(d.days); }
function store(str) {
  try { Keychain.set(KEY, str); } catch (e) {}
  try { if (fm) fm.writeString(path, str); } catch (e) {}
}
function load() {
  const tries = [() => Keychain.contains(KEY) ? Keychain.get(KEY) : null, () => fm && fm.fileExists(path) ? fm.readString(path) : null];
  for (const t of tries) { try { const s = t(); if (s) { const d = JSON.parse(s); if (valid(d)) return d; } } catch (e) {} }
  return null;
}

let synced = false, rejected = false;
let incoming = args.queryParameters && args.queryParameters.d;
if (!incoming && config.runsInApp) {
  try { const clip = (Pasteboard.pasteString ? Pasteboard.pasteString() : Pasteboard.paste()) || ""; if (clip.startsWith(PREFIX)) incoming = clip.slice(PREFIX.length); } catch (e) {}
}
if (incoming) {
  try { const d = JSON.parse(incoming); if (!valid(d)) throw 0; store(JSON.stringify(d)); synced = true; }
  catch (e) { rejected = true; }
}
const data = load();

// ---------- helpers ----------
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const dayDiff = (a, b) => Math.round((b - a) / 864e5);
function money(c, cents = true) {
  const neg = c < 0; c = Math.abs(c);
  const whole = Math.floor(cents ? c / 100 : Math.round(c / 100));
  const s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + s + (cents ? "." + pad(Math.round(c % 100)) : "");
}

// everything the layouts need, worked out for *today* from the last sync
function compute(d) {
  const now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const wk = dateOf(d.wkStart), next = addDays(wk, 7);
  const newWeek = t0 >= next;
  const weekEnd = newWeek ? addDays(mondayOf(t0), 7) : next;
  const spent = newWeek ? 0 : d.spentWk;
  const left = d.weekly - spent;
  const daysLeft = Math.max(1, dayDiff(t0, weekEnd));
  const todayIdx = newWeek ? -1 : (t0.getDay() + 6) % 7;
  const sameMonth = d.month === ymd(t0).slice(0, 7);
  const at = new Date(d.at), hrs = (now - at) / 36e5;
  const syncTxt = ymd(at) === ymd(now) ? `Synced ${pad(at.getHours())}:${pad(at.getMinutes())}`
    : hrs < 24 * 6 ? `Synced ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][at.getDay()]}` : `Synced ${at.getDate()}/${at.getMonth() + 1}`;
  return {
    newWeek, left, over: left < 0, perDay: left > 0 ? left / daysLeft : 0, daysLeft, spent, weekly: d.weekly,
    pct: d.weekly > 0 ? Math.max(0, Math.min(1, spent / d.weekly)) : 0,
    days: newWeek ? [0, 0, 0, 0, 0, 0, 0] : d.days, todayIdx,
    limits: sameMonth ? (d.limits || []) : [], cats: sameMonth ? (d.cats || []) : [],
    bal: d.bal, stale: hrs > 48 || newWeek, syncTxt, url: d.url || ""
  };
}

// ---------- drawing ----------
function logo(size) {
  const ctx = new DrawContext(); ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const u = size / 512, bar = (x, y, h, col) => { const p = new Path(); p.addRoundedRect(new Rect(x * u, y * u, 68 * u, h * u), 34 * u, 34 * u); ctx.addPath(p); ctx.setFillColor(col); ctx.fillPath(); };
  bar(128, 268, 128, new Color("#FFFFFF", 0.45)); bar(222, 196, 200, new Color("#FFFFFF", 0.72)); bar(316, 116, 280, C.ink);
  return ctx.getImage();
}
function progress(w, h, pct, over) {
  const ctx = new DrawContext(); ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const r = h / 2, track = new Path(); track.addRoundedRect(new Rect(0, 0, w, h), r, r); ctx.addPath(track); ctx.setFillColor(C.track); ctx.fillPath();
  if (pct > 0) { const f = new Path(); f.addRoundedRect(new Rect(0, 0, Math.max(h, w * pct), h), r, r); ctx.addPath(f); ctx.setFillColor(over ? C.over : C.mint); ctx.fillPath(); }
  return ctx.getImage();
}
function weekBars(w, h, m) {
  const ctx = new DrawContext(); ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const labelH = 13, chartH = h - labelH, slot = w / 7, bw = Math.min(14, slot * 0.56);
  const daily = m.weekly / 7, max = Math.max(daily * 1.15, ...m.days, 1);
  // a faint line at the even daily share of the weekly budget
  const ly = chartH - (daily / max) * chartH, line = new Path(); line.addRect(new Rect(0, ly, w, 1)); ctx.addPath(line); ctx.setFillColor(C.dim); ctx.fillPath();
  ctx.setFont(Font.semiboldSystemFont(9)); ctx.setTextAlignedCenter();
  for (let i = 0; i < 7; i++) {
    const x = i * slot + (slot - bw) / 2, v = m.days[i] || 0, future = m.todayIdx >= 0 && i > m.todayIdx;
    const bh = future ? 3 : Math.max(3, (v / max) * (chartH - 2));
    const p = new Path(); p.addRoundedRect(new Rect(x, chartH - bh, bw, bh), Math.min(bw / 2, bh / 2), Math.min(bw / 2, bh / 2)); ctx.addPath(p);
    ctx.setFillColor(i === m.todayIdx ? C.mint : future ? C.dim : v > daily ? new Color("#FFFFFF", 0.78) : C.faint); ctx.fillPath();
    ctx.setTextColor(i === m.todayIdx ? C.mint : C.muted);
    ctx.drawTextInRect(DAY[i], new Rect(i * slot, chartH + 2, slot, 11));
  }
  return ctx.getImage();
}
function ring(size, frac, label) {
  const ctx = new DrawContext(); ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const c = size / 2, r = size / 2 - 4, arc = (from, to, col) => {
    const p = new Path(), steps = 48; for (let i = 0; i <= steps; i++) { const a = -Math.PI / 2 + (from + (to - from) * i / steps) * Math.PI * 2; const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a)); i ? p.addLine(pt) : p.move(pt); }
    ctx.addPath(p); ctx.setStrokeColor(col); ctx.setLineWidth(5); ctx.strokePath();
  };
  arc(0, 1, new Color("#FFFFFF", 0.25)); if (frac > 0) arc(0, frac, Color.white());
  ctx.setFont(Font.boldRoundedSystemFont(label.length > 4 ? 11 : 14)); ctx.setTextColor(Color.white()); ctx.setTextAlignedCenter();
  ctx.drawTextInRect(label, new Rect(0, c - 9, size, 18));
  return ctx.getImage();
}

// widget widths in points by screen size (Apple's published sizes); bars are drawn to fit
function sizes() {
  let sw = 393, sh = 852;
  try { const s = Device.screenSize(); sw = Math.min(s.width, s.height); sh = Math.max(s.width, s.height); } catch (e) {}
  const small = sw >= 428 ? 170 : sw >= 414 ? 169 : sw >= 390 ? 158 : sw >= 375 ? (sh > 700 ? 155 : 148) : 141;
  const medium = sw >= 428 ? 364 : sw >= 414 ? 360 : sw >= 390 ? 338 : sw >= 375 ? (sh > 700 ? 329 : 321) : 292;
  return { small, medium };
}
const SZ = sizes();

// ---------- layouts ----------
function txt(parent, s, size, color, weight = "semibold", rounded = false) {
  const t = parent.addText(s);
  const f = rounded ? { bold: Font.boldRoundedSystemFont, heavy: Font.heavyRoundedSystemFont, semibold: Font.semiboldRoundedSystemFont, medium: Font.mediumRoundedSystemFont }
                    : { bold: Font.boldSystemFont, heavy: Font.heavySystemFont, semibold: Font.semiboldSystemFont, medium: Font.mediumSystemFont };
  t.font = (f[weight] || f.semibold)(size); t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = 0.5;
  return t;
}
function row(parent) { const s = parent.addStack(); s.layoutHorizontally(); s.centerAlignContent(); return s; }
function background(w) {
  const g = new LinearGradient(); g.colors = [C.bgTop, C.bg]; g.locations = [0, 1]; g.startPoint = new Point(1, 0); g.endPoint = new Point(0, 1);
  w.backgroundGradient = g;
}

// left half of medium, and all of small: the safe-to-spend block
function hero(parent, m, width, compact = false) {
  const head = row(parent); head.addImage(logo(14)).imageSize = new Size(14, 14); head.addSpacer(5);
  txt(head, m.over ? "OVER BUDGET" : m.newWeek ? "NEW WEEK" : "SAFE TO SPEND", 10, m.over ? C.over : C.muted, "bold");
  head.addSpacer();
  parent.addSpacer(8);
  const cur = row(parent); txt(cur, m.over ? "over by MOP" : "MOP", 11, C.muted, "semibold"); cur.addSpacer();
  const amt = row(parent); txt(amt, money(Math.abs(m.left)), 30, m.over ? C.over : C.ink, "bold", true); amt.addSpacer();
  parent.addSpacer(7);
  const bar = row(parent); bar.addImage(progress(width, 6, m.pct, m.over)).imageSize = new Size(width, 6);
  parent.addSpacer(7);
  const per = row(parent);
  txt(per, m.over ? (compact ? "Wait until Monday" : "Hold off until Monday") : m.daysLeft > 1 ? (compact ? `MOP ${money(m.perDay, false)}/day · ${m.daysLeft} days` : `≈ MOP ${money(m.perDay, false)} a day · ${m.daysLeft} days`) : `MOP ${money(m.left, false)} left today`, 11, C.ink, "medium");
  per.addSpacer();
}
function footer(parent, m) {
  const f = row(parent);
  txt(f, m.newWeek ? "Open Ledger to sync" : m.syncTxt, 10, m.stale ? C.warn : C.muted, "medium");
  f.addSpacer();
}
function limitRow(parent, l, width) {
  const r1 = row(parent); txt(r1, l.n, 10, C.muted, "semibold"); r1.addSpacer();
  txt(r1, `${money(l.used, false)} / ${money(l.max, false)}`, 10, l.used > l.max ? C.over : C.ink, "semibold");
  parent.addSpacer(4);
  const r2 = row(parent); r2.addImage(progress(width, 5, Math.min(1, l.used / l.max), l.used > l.max)).imageSize = new Size(width, 5);
}
function small(w, m) {
  w.setPadding(14, 14, 12, 14);
  hero(w, m, SZ.small - 28, true);
  w.addSpacer();
  footer(w, m);
}
function medium(w, m) {
  w.setPadding(14, 15, 12, 15);
  const inner = SZ.medium - 30, lw = Math.round(inner * 0.45), rw = inner - lw - 14, ih = SZ.small - 26;
  const cols = row(w); cols.topAlignContent();
  const left = cols.addStack(); left.layoutVertically(); left.size = new Size(lw, ih);
  hero(left, m, lw); left.addSpacer(); footer(left, m);
  cols.addSpacer(14);
  const right = cols.addStack(); right.layoutVertically(); right.size = new Size(rw, ih);
  const h = row(right); txt(h, "THIS WEEK", 10, C.muted, "bold"); h.addSpacer(); txt(h, `MOP ${money(m.spent, false)}`, 10, C.ink, "semibold");
  right.addSpacer(6);
  right.addImage(weekBars(rw, 62, m)).imageSize = new Size(rw, 62);
  right.addSpacer(8);
  if (m.limits.length) limitRow(right, m.limits[0], rw);
  else if (m.bal != null) { const b = row(right); txt(b, "MPay balance", 10, C.muted, "semibold"); b.addSpacer(); txt(b, money(m.bal), 10, C.ink, "semibold"); }
  right.addSpacer();
}
function large(w, m) {
  w.setPadding(16, 16, 14, 16);
  const lw = SZ.medium - 32;
  hero(w, m, lw);
  w.addSpacer(14);
  const h = row(w); txt(h, "THIS WEEK", 10, C.muted, "bold"); h.addSpacer(); txt(h, `MOP ${money(m.spent, false)} of ${money(m.weekly, false)}`, 10, C.ink, "semibold");
  w.addSpacer(6);
  w.addImage(weekBars(lw, 70, m)).imageSize = new Size(lw, 70);
  w.addSpacer(12);
  for (const l of m.limits.slice(0, 2)) { limitRow(w, l, lw); w.addSpacer(8); }
  if (m.cats.length) {
    const ch = row(w); txt(ch, "THIS MONTH", 10, C.muted, "bold"); ch.addSpacer(); w.addSpacer(4);
    for (const [n, v] of m.cats.slice(0, 3)) { const r = row(w); txt(r, n, 11, C.ink, "medium"); r.addSpacer(); txt(r, money(v, false), 11, C.ink, "semibold"); w.addSpacer(2); }
  }
  w.addSpacer();
  const f = row(w); txt(f, m.newWeek ? "Open Ledger to sync" : m.syncTxt, 10, m.stale ? C.warn : C.muted, "medium"); f.addSpacer();
  if (m.bal != null) txt(f, `MPay ${money(m.bal)}`, 10, C.muted, "medium");
}
function accessory(w, m, fam) {
  if (fam === "accessoryInline") { w.addText(m.over ? `Over budget by MOP ${money(-m.left, false)}` : `MOP ${money(m.left, false)} left this week`); return; }
  if (fam === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const frac = m.weekly > 0 ? Math.max(0, Math.min(1, m.left / m.weekly)) : 0;
    w.addImage(ring(58, frac, m.over ? "Over" : money(m.left, false))).imageSize = new Size(58, 58);
    return;
  }
  const a = w.addText(m.over ? "Over budget" : "Safe to spend"); a.font = Font.semiboldSystemFont(12);
  const b = w.addText(`MOP ${money(Math.abs(m.left))}`); b.font = Font.boldRoundedSystemFont(20); b.minimumScaleFactor = 0.6; b.lineLimit = 1;
  const c = w.addText(m.over ? "until Monday" : `≈ ${money(m.perDay, false)}/day · ${m.daysLeft}d`); c.font = Font.mediumSystemFont(11);
}
function setup(w, fam) {
  if (String(fam).startsWith("accessory")) { w.addText("Open Ledger → Update widget"); return; }
  background(w); w.setPadding(14, 14, 14, 14);
  const h = row(w); h.addImage(logo(16)).imageSize = new Size(16, 16); h.addSpacer(6); txt(h, "Ledger", 13, C.ink, "bold"); h.addSpacer();
  w.addSpacer(8);
  const t = w.addText(rejected ? "That wasn't ledger data. Tap Update widget in the ledger again." : "Open the ledger, go to Settings and tap Update widget.");
  t.font = Font.mediumSystemFont(12); t.textColor = C.ink;
  w.addSpacer();
}

// ---------- run ----------
const fam = config.widgetFamily || "medium";
let w = new ListWidget();
try {
  if (!data) setup(w, fam);
  else {
    const m = compute(data);
    if (fam.startsWith("accessory")) accessory(w, m, fam);
    else { background(w); ({ small, medium, large, extraLarge: large }[fam] || medium)(w, m); }
    if (m.url) w.url = m.url;
  }
} catch (e) {
  // show what went wrong instead of a blank widget
  w = new ListWidget(); w.backgroundColor = C.bg; w.setPadding(12, 12, 12, 12);
  const a = w.addText("Ledger widget error"); a.font = Font.boldSystemFont(12); a.textColor = C.over;
  const b = w.addText(String(e && e.message || e)); b.font = Font.mediumSystemFont(10); b.textColor = C.ink;
}
const nextHalfHour = new Date(Date.now() + 30 * 60 * 1000); w.refreshAfterDate = nextHalfHour;

if (config.runsInWidget) Script.setWidget(w);
else if (rejected && data) { const al = new Alert(); al.title = "Not ledger data"; al.message = "The widget kept your last numbers. In the ledger, tap Update widget again."; al.addAction("OK"); await al.presentAlert(); await w.presentMedium(); }
else await w.presentMedium();
Script.complete();
