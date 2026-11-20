const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// Let the finish beep play without needing a click in that window
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const SIZES = {
  clock:    { width: 420, height: 200, minWidth: 200, minHeight: 90 },
  display:  { width: 380, height: 200, minWidth: 200, minHeight: 90 },
  controls: { width: 440, height: 620, minWidth: 400, minHeight: 610 },
  audio:    { width: 380, height: 250, minWidth: 340, minHeight: 230 },
  show:     { width: 640, height: 520, minWidth: 560, minHeight: 340 },
  presets:  { width: 340, height: 540, minWidth: 300, minHeight: 260 },
  colors:   { width: 470, height: 680, minWidth: 420, minHeight: 300 },
  network:  { width: 460, height: 520, minWidth: 400, minHeight: 360 },
  help:     { width: 640, height: 700, minWidth: 420, minHeight: 360 },
};

const roles = new Map(); // webContents id -> view name

// ---- One shared countdown timer, owned by the main process
const timer = { state: 'idle', total: 5 * 60000, baseTotal: 5 * 60000, remaining: 5 * 60000, last: 0, speed: 1.5, travel: false,
  mode: 'speed', tod: null, targetAt: 0, notice: '' };
// ---- Sound settings (saved between launches)
const SOUNDS = ['beep', 'chime', 'bell', 'alarm'];
const DEFAULT_AUDIO = { muted: false, volume: 80, sound: 'beep', repeats: 3 };
let audio = { ...DEFAULT_AUDIO };
const audioFile = () => path.join(app.getPath('userData'), 'audio.json');
function cleanAudio(a, base) {
  const o = { ...base };
  if (a && typeof a === 'object') {
    if (typeof a.muted === 'boolean') o.muted = a.muted;
    if (Number.isFinite(a.volume)) o.volume = Math.max(0, Math.min(100, Math.round(a.volume)));
    if (SOUNDS.includes(a.sound)) o.sound = a.sound;
    if (Number.isInteger(a.repeats) && a.repeats >= 1 && a.repeats <= 10) o.repeats = a.repeats;
  }
  return o;
}
function loadAudio() {
  try { audio = cleanAudio(JSON.parse(fs.readFileSync(audioFile(), 'utf8')), DEFAULT_AUDIO); } catch (e) { /* defaults */ }
}
function saveAudio() {
  try { fs.writeFileSync(audioFile(), JSON.stringify(audio)); } catch (e) { /* ignore */ }
}

// ---- Overtime: after zero the control window always counts up; the display only if this is on
let overtimeDisplay = true;
const DEFAULT_PRESETS = [1, 5, 10, 15, 30, 45, 60, 75, 90, 120];
let presets = DEFAULT_PRESETS.slice(); // duration buttons, in minutes
let show = { segments: [], index: -1, auto: false }; // run of show
const cleanPresets = (a) => {
  if (!Array.isArray(a)) return null;
  const out = [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 999))].sort((x, y) => x - y).slice(0, 16);
  return out.length ? out : null;
};
const cleanSegments = (a) => (!Array.isArray(a) ? null : a.slice(0, 30)
  .map((s) => ({ name: String((s && s.name) || '').slice(0, 40), secs: Math.round(Number(s && s.secs)) }))
  .filter((s) => s.secs >= 1 && s.secs <= 359999));
const showFile = () => path.join(app.getPath('userData'), 'show.json');
function loadShow() {
  try {
    const j = JSON.parse(fs.readFileSync(showFile(), 'utf8'));
    const s = cleanSegments(j.segments); if (s) show.segments = s;
    if (typeof j.auto === 'boolean') show.auto = j.auto;
  } catch (e) { /* no saved show yet */ }
}
function saveShow() {
  try { fs.writeFileSync(showFile(), JSON.stringify({ segments: show.segments, auto: show.auto })); } catch (e) { /* ignore */ }
}
let net = { mode: null, iface: '', port: 8787 }; // which connection the remote control listens on (null mode = default)
let barOn = true; // show the countdown bar on the display
let endOnDisplay = true; // show "ends at ..." under the countdown on the display
// How the Timer display window looks (font, background, text). Only the Timer display uses this.
const FONTS = ['default', 'inter', 'oswald', 'barlow', 'bebas', 'orbitron', 'sharetech', 'jetbrains', 'robotomono', 'spacemono'];
const WEIGHTS = ['light', 'regular', 'bold'];
const TEXTS = ['auto', 'light', 'dark'];
let look = { font: 'default', weight: 'light', bg: null, alpha: 100, text: 'auto', shadow: false };
let displayTop = true; // keep the Timer display windows above other apps
function cleanLook(a, base) {
  const o = { ...base };
  if (!a || typeof a !== 'object') return o;
  if (FONTS.includes(a.font)) o.font = a.font;
  if (WEIGHTS.includes(a.weight)) o.weight = a.weight;
  if (a.bg === null) o.bg = null;
  else if (typeof a.bg === 'string' && /^#[0-9a-f]{6}$/i.test(a.bg)) o.bg = a.bg.toLowerCase();
  if (Number.isFinite(a.alpha)) o.alpha = Math.min(100, Math.max(0, Math.round(a.alpha)));
  if (TEXTS.includes(a.text)) o.text = a.text;
  if (typeof a.shadow === 'boolean') o.shadow = a.shadow;
  return o;
}
function cleanNet(a, base) {
  const o = { ...base };
  if (!a || typeof a !== 'object') return o;
  if (['local', 'all', 'iface'].includes(a.mode)) o.mode = a.mode;
  if (typeof a.iface === 'string') o.iface = a.iface.slice(0, 120);
  if (Number.isInteger(a.port) && a.port >= 1024 && a.port <= 65535) o.port = a.port;
  return o;
}
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); if (typeof s.overtimeDisplay === 'boolean') overtimeDisplay = s.overtimeDisplay; if (typeof s.endOnDisplay === 'boolean') endOnDisplay = s.endOnDisplay; if (typeof s.barOn === 'boolean') barOn = s.barOn; if (s.net) net = cleanNet(s.net, net); const p = cleanPresets(s.presets); if (p) presets = p; if (s.look) look = cleanLook(s.look, look); if (typeof s.displayTop === 'boolean') displayTop = s.displayTop; } catch (e) { /* defaults */ }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ overtimeDisplay, endOnDisplay, barOn, net, presets, look, displayTop })); } catch (e) { /* ignore */ }
}

let face = 'timer'; // what the Timer display windows show: 'timer' or 'clock'
let tick = null;

const snapshot = () => ({
  state: timer.state, total: timer.total, baseTotal: timer.baseTotal, remaining: timer.remaining,
  speed: timer.speed, travel: timer.travel,
  mode: timer.mode, tod: timer.tod, targetAt: timer.targetAt, notice: timer.notice,
  display: displayState(),
  face,
  look,
  displayTop,
  audio,
  doneAt: timer.state === 'done' ? timer.doneAt : 0,
  overtimeDisplay,
  endOnDisplay,
  barOn,
  presets,
  show,
});

function broadcast() {
  const s = snapshot();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('timer-state', s);
}

// ---- Timer display windows can be hidden and shown again without closing them
let displayHidden = false;
const displays = () => BrowserWindow.getAllWindows().filter((w) => roles.get(w.webContents.id) === 'display');
function displayState() {
  const n = displays().length;
  return n === 0 ? 'closed' : displayHidden ? 'hidden' : 'shown';
}
function setDisplay(action) {
  const ds = displays();
  const hide = action === 'hide' || (action === 'toggle' && ds.length > 0 && !displayHidden);
  if (hide) {
    if (ds.length === 0) return; // nothing to hide
    displayHidden = true;
    ds.forEach((w) => w.hide());
  } else {
    displayHidden = false;
    if (ds.length === 0) create('display');
    else { ds.forEach((w) => w.show()); syncDisplayWindows(); }
  }
}

// A window's transparency is fixed when it is created, so changing it means opening a new one in the same place
const winMeta = new Map(); // webContents id -> { transparent }
function syncDisplayWindows() {
  if (displayHidden) return; // they are brought up to date when shown again
  const want = look.alpha < 100 && !KIOSK;
  for (const w of displays()) {
    const meta = winMeta.get(w.webContents.id);
    if (meta && meta.transparent !== want) {
      create('display', { bounds: w.getBounds() });
      w.close();
    }
  }
}

function notifyDone() {
  if (audio.muted) return;
  // Only one window beeps: prefer one that is on screen, then any display or controls window
  const all = BrowserWindow.getAllWindows().filter((w) => ['display', 'controls', 'audio'].includes(roles.get(w.webContents.id)));
  const target = all.find((w) => w.isVisible()) || all[0];
  if (target) target.webContents.send('timer-done');
}

// Next moment the wall clock reads this time of day (seconds after midnight)
function nextOccurrence(tod) {
  const now = Date.now();
  const d = new Date(now);
  d.setHours(Math.floor(tod / 3600), Math.floor(tod % 3600 / 60), tod % 60, 0);
  if (d.getTime() <= now + 500) d.setDate(d.getDate() + 1);
  return d.getTime();
}
const resolveAt = () => (timer.tod == null ? null : nextOccurrence(timer.tod));
const baseNow = () => (timer.state === 'idle' || timer.state === 'done' ? timer.total : timer.remaining);

// Try to switch on end-time travel so `base` ms of countdown finishes at wall-clock time `at`
function tryTarget(base, at) {
  const left = at == null ? 0 : at - Date.now();
  const need = left > 0 ? base / left : Infinity;
  if (at == null) timer.notice = 'Set an end time first.';
  else if (left <= 0) timer.notice = 'That end time has already passed.';
  else if (!(need >= 0.1 && need <= 100)) timer.notice = 'That end time needs ' + need.toFixed(2) + '× speed, outside the 0.1× to 100× limit.';
  else { timer.targetAt = at; timer.travel = true; timer.notice = ''; return true; }
  timer.travel = false;
  return false;
}

// Subtract the countdown for the real time since the last update
function advance() {
  const now = Date.now();
  const dt = now - timer.last;
  if (timer.travel && timer.mode === 'target') {
    // Speed is chosen so the countdown reaches zero exactly at targetAt
    const left = timer.targetAt - timer.last;
    if (left <= dt) timer.remaining = 0;
    else timer.remaining -= dt * timer.remaining / left;
  } else {
    timer.remaining -= dt * (timer.travel ? timer.speed : 1);
  }
  timer.last = now;
}

function loop() {
  advance();
  if (timer.remaining <= 0) {
    clearInterval(tick);
    timer.remaining = 0;
    timer.state = 'done';
    timer.total = timer.baseTotal; // minutes added while running do not stay
    timer.doneAt = Date.now();
    timer.travel = false;
    timer.notice = '';
    broadcast();
    notifyDone();
    if (show.auto && show.index >= 0 && show.index + 1 < show.segments.length) goSegment(show.index + 1);
    return;
  }
  broadcast();
}

ipcMain.handle('timer-get', () => snapshot());

// Load a run-of-show segment into the timer and start it
function goSegment(i) {
  const seg = show.segments[i];
  if (!seg) return;
  clearInterval(tick);
  timer.total = timer.baseTotal = timer.remaining = seg.secs * 1000;
  timer.state = 'idle';
  timer.travel = false;
  timer.notice = '';
  show.index = i;
  timerCmd('start');
}

function timerCmd(cmd, arg) {
  const idle = timer.state === 'idle' || timer.state === 'done';
  const running = timer.state === 'running';
  if (cmd === 'set' && idle && arg > 0) {
    timer.total = timer.baseTotal = timer.remaining = arg;
    timer.state = 'idle';
  } else if (cmd === 'start' && !running) {
    if (idle) timer.remaining = timer.total;
    timer.last = Date.now();
    timer.state = 'running';
    if (timer.travel && timer.mode === 'target') {
      // Starting fresh re-aims at the next occurrence of the end time; resuming keeps the same target
      tryTarget(timer.remaining, idle ? resolveAt() : timer.targetAt);
    }
    clearInterval(tick);
    tick = setInterval(loop, 100);
  } else if (cmd === 'pause' && running) {
    advance();
    clearInterval(tick);
    timer.state = 'paused';
  } else if (cmd === 'speed' && arg >= 0.5 && arg <= 3) {
    if (running) advance(); // bank time at the old speed first
    timer.speed = arg;
  } else if (cmd === 'travel') {
    if (running) advance();
    if (!arg) { timer.travel = false; timer.notice = ''; }
    else if (timer.mode === 'target') tryTarget(baseNow(), resolveAt());
    else { timer.travel = true; timer.notice = ''; }
  } else if (cmd === 'mode' && (arg === 'speed' || arg === 'target')) {
    if (running) advance();
    const wasOn = timer.travel;
    timer.mode = arg;
    timer.notice = '';
    if (wasOn && arg === 'target') tryTarget(baseNow(), resolveAt());
  } else if (cmd === 'tod' && (arg === null || (Number.isInteger(arg) && arg >= 0 && arg < 86400))) {
    if (running) advance();
    timer.tod = arg;
    timer.notice = '';
    if (timer.travel && timer.mode === 'target') tryTarget(baseNow(), resolveAt());
  } else if (cmd === 'display' && ['show', 'hide', 'toggle'].includes(arg)) {
    setDisplay(arg);
  } else if (cmd === 'face' && ['timer', 'clock', 'toggle'].includes(arg)) {
    face = arg === 'toggle' ? (face === 'clock' ? 'timer' : 'clock') : arg;
  } else if (cmd === 'audio' && arg && typeof arg === 'object') {
    audio = cleanAudio(arg, audio);
    saveAudio();
  } else if (cmd === 'overtime' && ['on', 'off', 'toggle'].includes(arg)) {
    overtimeDisplay = arg === 'toggle' ? !overtimeDisplay : arg === 'on';
    saveSettings();
  } else if (cmd === 'endshow' && ['on', 'off', 'toggle'].includes(arg)) {
    endOnDisplay = arg === 'toggle' ? !endOnDisplay : arg === 'on';
    saveSettings();
  } else if (cmd === 'bar' && ['on', 'off', 'toggle'].includes(arg)) {
    barOn = arg === 'toggle' ? !barOn : arg === 'on';
    saveSettings();
  } else if (cmd === 'look' && arg && typeof arg === 'object') {
    look = cleanLook(arg, look);
    saveSettings();
    syncDisplayWindows();
  } else if (cmd === 'displaytop' && ['on', 'off', 'toggle'].includes(arg)) {
    displayTop = arg === 'toggle' ? !displayTop : arg === 'on';
    for (const w of displays()) {
      if (displayTop) { w.setAlwaysOnTop(true, TOP_LEVEL); w.moveTop(); } else w.setAlwaysOnTop(false);
    }
    saveSettings();
  } else if (cmd === 'adjust' && Number.isFinite(arg) && arg !== 0 && Math.abs(arg) <= 3600000 && timer.state !== 'done') {
    // Add or remove time (never below 1 second); the bar stays full if time is added past the original total
    if (running) advance();
    if (timer.state === 'idle') {
      timer.total = timer.baseTotal = Math.max(1000, timer.total + arg);
      timer.remaining = timer.total;
    } else {
      timer.remaining = Math.max(1000, timer.remaining + arg);
      if (timer.remaining > timer.total) timer.total = timer.remaining;
      if (running && timer.travel && timer.mode === 'target') tryTarget(timer.remaining, timer.targetAt);
    }
  } else if (cmd === 'until' && idle && Number.isInteger(arg) && arg >= 0 && arg < 86400) {
    // Count down to the next time the wall clock reads this time of day, and start now
    timerCmd('set', Math.round(nextOccurrence(arg) - Date.now()));
    timerCmd('start');
    return;
  } else if (cmd === 'presets') {
    const p = arg === 'reset' ? DEFAULT_PRESETS.slice() : cleanPresets(arg);
    if (p) { presets = p; saveSettings(); }
  } else if (cmd === 'show-set' && arg && typeof arg === 'object') {
    const s = cleanSegments(Array.isArray(arg) ? arg : arg.segments);
    if (s) {
      show.segments = s;
      if (!Array.isArray(arg) && Number.isInteger(arg.index) && arg.index >= -1 && arg.index < s.length) show.index = arg.index;
      if (show.index >= s.length) show.index = s.length - 1;
      saveShow();
    }
  } else if (cmd === 'show-auto' && ['on', 'off', 'toggle'].includes(arg)) {
    show.auto = arg === 'toggle' ? !show.auto : arg === 'on';
    saveShow();
  } else if (cmd === 'show-go' && Number.isInteger(arg) && arg >= 0 && arg < show.segments.length) {
    goSegment(arg);
  } else if (cmd === 'show-next') {
    if (show.index + 1 < show.segments.length) goSegment(show.index + 1);
  } else if (cmd === 'show-prev') {
    if (show.index - 1 >= 0) goSegment(show.index - 1);
  } else if (cmd === 'test') {
    notifyDone();
  } else if (cmd === 'reset') {
    clearInterval(tick);
    timer.total = timer.baseTotal; // back to the length that was set, not the one stretched by +1 min
    timer.remaining = timer.total;
    timer.state = 'idle';
    timer.travel = false;
    timer.notice = '';
  }
  broadcast();
}
ipcMain.handle('timer-cmd', (_e, cmd, arg) => timerCmd(cmd, arg));

// ---- Color rules: "when time left is at or below N seconds, use this color"
const DEFAULT_RULES = [
  { at: 180, color: '#ffb84d' },
  { at: 60,  color: '#ff6b5e' },
];
let rules = DEFAULT_RULES.map((r) => ({ ...r }));
const rulesFile = () => path.join(app.getPath('userData'), 'color-rules.json');

function normalize(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.slice(0, 12)
    .map((r) => ({ at: Math.round(Number(r && r.at)), color: String((r && r.color) || '').toLowerCase() }))
    .filter((r) => r.at >= 1 && r.at <= 359999 && /^#[0-9a-f]{6}$/.test(r.color));
}
function loadRules() {
  try {
    const r = normalize(JSON.parse(fs.readFileSync(rulesFile(), 'utf8')));
    if (r) rules = r;
  } catch (e) { /* no saved rules yet: keep defaults */ }
}
function saveRules() {
  try { fs.writeFileSync(rulesFile(), JSON.stringify(rules)); } catch (e) { /* ignore */ }
}
function broadcastRules() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('rules-state', rules);
}

ipcMain.handle('rules-get', () => rules);
ipcMain.handle('rules-set', (_e, arr) => {
  const r = normalize(arr);
  if (r) { rules = r; saveRules(); broadcastRules(); }
  return rules;
});
ipcMain.handle('rules-reset', () => {
  rules = DEFAULT_RULES.map((r) => ({ ...r }));
  saveRules(); broadcastRules();
  return rules;
});

// ---- Remote control API (Bitfocus Companion, scripts, anything that can open a URL)
// Kiosk mode (for a dedicated screen such as a Raspberry Pi): no launcher, the Timer display fills the screen,
// the remote-control address is open to the local network, and Companion does the controlling.
const KIOSK = process.argv.includes('--kiosk') || process.env.CLOCK_TIMER_KIOSK === '1';
// Launch settings (CLOCK_TIMER_HOST / CLOCK_TIMER_PORT) win over the Network window, which is saved in settings.json.
const ENV_HOST = process.env.CLOCK_TIMER_HOST || '';
const ENV_PORT = Number(process.env.CLOCK_TIMER_PORT) || 0;
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];
const api = { ok: false, host: '', port: 8787, error: '', waiting: '', mode: '', iface: '' };
let apiReadyResolve;
const apiReady = new Promise((r) => { apiReadyResolve = r; });

const two = (n) => String(n).padStart(2, '0');
const fmtMs = (ms) => {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), mi = Math.floor(s % 3600 / 60);
  return (h ? h + ':' + two(mi) : two(mi)) + ':' + two(s % 60);
};
const clockText = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

function apiStatus() {
  const base = baseNow();
  const now = Date.now();
  let eff = timer.travel ? timer.speed : 1;
  let endMs = null;
  if (timer.travel && timer.mode === 'target') {
    const left = timer.targetAt - now;
    if (left > 0) { eff = base / left; endMs = left; } else { eff = 1; }
  }
  if (endMs === null) endMs = base / eff;

  const done = timer.state === 'done';
  const secs = Math.ceil(timer.remaining / 1000);
  let color = null;
  if (!done) {
    let best = null;
    for (const r of rules) if (secs <= r.at && (!best || r.at < best.at)) best = r;
    if (best) color = best.color;
  }
  return {
    state: timer.state,
    remaining: done ? '00:00' : fmtMs(timer.remaining),
    remainingMs: Math.max(0, Math.round(timer.remaining)),
    totalMs: timer.total,
    progress: timer.total ? Math.max(0, Math.min(1, timer.remaining / timer.total)) : 0,
    timeTravel: timer.travel,
    mode: timer.mode === 'target' ? 'end' : 'speed',
    speed: timer.speed,
    effectiveSpeed: Number(eff.toFixed(3)),
    endTimeSetting: timer.tod == null ? null : two(Math.floor(timer.tod / 3600)) + ':' + two(Math.floor(timer.tod % 3600 / 60)) + ':' + two(timer.tod % 60),
    endsAt: done ? null : new Date(now + endMs).toISOString(),
    endsAtText: done ? '' : clockText(now + endMs),
    color,
    notice: timer.notice,
    display: displayState(),
    face,
    baseMs: timer.baseTotal,
    overtime: overtimeDisplay,
    endsAtOnDisplay: endOnDisplay,
    countdownBar: barOn,
    audio: { ...audio },
    show: showStatus(),
    look: { ...look },
    displayTop,
  };
}

// Run of show as the remote-control API reports it (segment numbers start at 1, 0 means none yet)
function showStatus() {
  const segs = show.segments, i = show.index;
  const nm = (k) => (k >= 0 && k < segs.length ? (segs[k].name.trim() || 'Segment ' + (k + 1)) : '');
  return { count: segs.length, index: i + 1, name: nm(i), next: nm(i + 1), auto: show.auto, secs: i >= 0 && i < segs.length ? segs[i].secs : 0 };
}

// Accepts 12:00, 12:00:30, 13:05, 12pm, 1:05 PM  ->  seconds after midnight (or null)
function parseTod(str) {
  const mt = /^\s*(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap]m?)?\s*$/i.exec(str || '');
  if (!mt) return null;
  let h = +mt[1];
  const mi = +(mt[2] || 0), se = +(mt[3] || 0);
  const ap = mt[4] && mt[4][0].toLowerCase();
  if (mi > 59 || se > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'p' ? 12 : 0); }
  else if (h > 23) return null;
  return h * 3600 + mi * 60 + se;
}

function handleApi(req, res) {
  const send = (code, body, type) => {
    res.writeHead(code, { 'Content-Type': (type || 'application/json') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const fail = (code, msg) => send(code, { ok: false, error: msg });
  const ok = () => send(200, { ok: true, ...apiStatus() });

  // Only tools like Companion may call this. Web pages in a browser cannot (they send Origin or
  // Sec-Fetch-* headers), and on loopback the Host header must match (blocks DNS-rebinding tricks).
  if (req.headers.origin || req.headers['sec-fetch-site']) return fail(403, 'Browser requests are not allowed');
  if (LOOPBACK.includes(api.host)) {
    const host = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!LOOPBACK.includes(host)) return fail(403, 'Unexpected Host header');
  }
  if (req.method !== 'GET' && req.method !== 'POST') return fail(405, 'Use GET or POST');

  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { return fail(400, 'Bad URL'); }
  const route = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const q = url.searchParams;

  switch (route) {
    case '/': case '/status': return ok();

    // Plain-text answers (easy to show on a button)
    case '/remaining': return send(200, apiStatus().remaining, 'text/plain');
    case '/state': return send(200, timer.state, 'text/plain');
    case '/endsat': return send(200, apiStatus().endsAtText, 'text/plain');
    case '/color': return send(200, apiStatus().color || '', 'text/plain');

    case '/start': case '/resume': timerCmd('start'); return ok();
    case '/pause': timerCmd('pause'); return ok();
    case '/toggle': timerCmd(timer.state === 'running' ? 'pause' : 'start'); return ok();
    case '/reset': timerCmd('reset'); return ok();

    case '/set': {
      const secs = (+q.get('hours') || 0) * 3600 + (+q.get('minutes') || 0) * 60 + (+q.get('seconds') || 0);
      if (!(secs > 0 && secs <= 359999)) return fail(400, 'Give hours, minutes and/or seconds, for example /set?minutes=10');
      if (timer.state === 'running' || timer.state === 'paused') return fail(409, 'Reset the timer before changing its duration');
      timerCmd('set', Math.round(secs * 1000));
      return ok();
    }

    case '/travel/on': timerCmd('travel', true); return ok();
    case '/travel/off': timerCmd('travel', false); return ok();
    case '/travel/toggle': timerCmd('travel', !timer.travel); return ok();
    case '/speed': {
      const v = parseFloat(q.get('value'));
      if (!(v >= 0.5 && v <= 3)) return fail(400, 'Speed must be between 0.5 and 3, for example /speed?value=1.25');
      timerCmd('speed', v);
      return ok();
    }
    case '/mode/speed': timerCmd('mode', 'speed'); return ok();
    case '/mode/end': timerCmd('mode', 'target'); return ok();
    case '/endtime': {
      const t = parseTod(q.get('time'));
      if (t === null) return fail(400, 'Use ?time=12:00, ?time=12:00:30 or ?time=12:00pm');
      timerCmd('tod', t);
      return ok();
    }
    case '/endtime/clear': timerCmd('tod', null); return ok();

    case '/display/show': timerCmd('display', 'show'); return ok();
    case '/display/hide': timerCmd('display', 'hide'); return ok();
    case '/display/toggle': timerCmd('display', 'toggle'); return ok();
    case '/face/timer': timerCmd('face', 'timer'); return ok();
    case '/face/clock': timerCmd('face', 'clock'); return ok();
    case '/face/toggle': timerCmd('face', 'toggle'); return ok();

    // Add or take away time (seconds and/or minutes, negative takes away)
    case '/adjust': {
      const secs = (+q.get('minutes') || 0) * 60 + (+q.get('seconds') || 0);
      if (!Number.isFinite(secs) || secs === 0 || Math.abs(secs) > 3600) return fail(400, 'Give minutes and/or seconds between -3600 and 3600 seconds, for example /adjust?minutes=1 or /adjust?minutes=-1');
      if (timer.state === 'done') return fail(409, 'The time is already up');
      timerCmd('adjust', Math.round(secs * 1000));
      return ok();
    }
    // Count down to a time of day and start now
    case '/until': {
      const t = parseTod(q.get('time'));
      if (t === null) return fail(400, 'Use ?time=14:45, ?time=14:45:30 or ?time=2:45pm');
      if (timer.state !== 'idle') return fail(409, 'Reset the timer first');
      timerCmd('until', t);
      return ok();
    }

    // Sound
    case '/audio/mute': timerCmd('audio', { muted: true }); return ok();
    case '/audio/unmute': timerCmd('audio', { muted: false }); return ok();
    case '/audio/toggle': timerCmd('audio', { muted: !audio.muted }); return ok();
    case '/audio/volume': {
      const v = parseFloat(q.get('value'));
      if (!(v >= 0 && v <= 100)) return fail(400, 'Volume must be between 0 and 100, for example /audio/volume?value=60');
      timerCmd('audio', { volume: v });
      return ok();
    }
    case '/audio/sound': {
      const n = String(q.get('name') || '').toLowerCase();
      if (!SOUNDS.includes(n)) return fail(400, 'Sound must be one of: ' + SOUNDS.join(', '));
      timerCmd('audio', { sound: n });
      return ok();
    }
    case '/audio/repeats': {
      const v = parseInt(q.get('value'), 10);
      if (!(v >= 1 && v <= 10)) return fail(400, 'Repeats must be between 1 and 10');
      timerCmd('audio', { repeats: v });
      return ok();
    }
    case '/audio/test': timerCmd('test'); return ok();

    // Display options
    case '/overtime/on': case '/overtime/off': case '/overtime/toggle': timerCmd('overtime', route.split('/')[2]); return ok();
    case '/bar/on': case '/bar/off': case '/bar/toggle': timerCmd('bar', route.split('/')[2]); return ok();
    case '/endshow/on': case '/endshow/off': case '/endshow/toggle': timerCmd('endshow', route.split('/')[2]); return ok();
    case '/displaytop/on': case '/displaytop/off': case '/displaytop/toggle': timerCmd('displaytop', route.split('/')[2]); return ok();

    // Run of show
    case '/show/next': timerCmd('show-next'); return ok();
    case '/show/prev': timerCmd('show-prev'); return ok();
    case '/show/auto/on': case '/show/auto/off': case '/show/auto/toggle': timerCmd('show-auto', route.split('/')[3]); return ok();
    case '/show/go': {
      const n = parseInt(q.get('segment'), 10);
      if (!(n >= 1 && n <= show.segments.length)) return fail(400, 'Segment must be between 1 and ' + show.segments.length + ', for example /show/go?segment=2');
      timerCmd('show-go', n - 1);
      return ok();
    }

    // How the Timer display window looks. Give any of: font, weight, bg, opacity, text, shadow
    case '/look': {
      const patch = {};
      if (q.has('font')) { const f = q.get('font').toLowerCase(); if (!FONTS.includes(f)) return fail(400, 'Font must be one of: ' + FONTS.join(', ')); patch.font = f; }
      if (q.has('weight')) { const w = q.get('weight').toLowerCase(); if (!WEIGHTS.includes(w)) return fail(400, 'Weight must be one of: ' + WEIGHTS.join(', ')); patch.weight = w; }
      if (q.has('bg')) {
        const b = q.get('bg').trim().toLowerCase();
        if (b === 'theme') patch.bg = null;
        else if (/^#?[0-9a-f]{6}$/.test(b)) patch.bg = b[0] === '#' ? b : '#' + b;
        else return fail(400, 'bg must be a color like 336699 or #336699, or theme');
      }
      if (q.has('opacity')) { const o = parseFloat(q.get('opacity')); if (!(o >= 0 && o <= 100)) return fail(400, 'Opacity must be between 0 (see-through) and 100 (solid)'); patch.alpha = o; }
      if (q.has('text')) { const t = q.get('text').toLowerCase(); if (!TEXTS.includes(t)) return fail(400, 'Text must be one of: ' + TEXTS.join(', ')); patch.text = t; }
      if (q.has('shadow')) { const s = q.get('shadow').toLowerCase(); if (s !== 'on' && s !== 'off') return fail(400, 'Shadow must be on or off'); patch.shadow = s === 'on'; }
      if (!Object.keys(patch).length) return fail(400, 'Give at least one of font, weight, bg, opacity, text, shadow');
      timerCmd('look', patch);
      return ok();
    }
    case '/look/reset': timerCmd('look', { font: 'default', weight: 'light', bg: null, alpha: 100, text: 'auto', shadow: false }); return ok();

    default: return fail(404, 'Unknown command: ' + route);
  }
}

// Network connections of this computer (IPv4), so the remote control can listen on just one of them
function interfaces() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) if ((i.family === 'IPv4' || i.family === 4) && !i.internal) out.push({ name, address: i.address });
  }
  return out;
}
function lanAddresses() { return interfaces().map((i) => i.address); }
const defaultNetMode = () => (KIOSK ? 'all' : 'local');
// What the saved choice means right now. A chosen connection is found by its name, so a changed address is followed.
function netPlan() {
  const port = ENV_PORT || net.port;
  if (ENV_HOST) return { host: ENV_HOST, port, mode: 'env', iface: '' };
  const mode = net.mode || defaultNetMode();
  if (mode === 'all') return { host: '0.0.0.0', port, mode, iface: '' };
  if (mode === 'iface') {
    const hit = interfaces().find((i) => i.name === net.iface);
    return { host: hit ? hit.address : '', port, mode, iface: net.iface };
  }
  return { host: '127.0.0.1', port, mode: 'local', iface: '' };
}

let srv = null;
let bindKey = '';
function stopApi() {
  const s = srv;
  srv = null; bindKey = '';
  if (!s) return Promise.resolve();
  return new Promise((resolve) => {
    try { s.close(() => resolve()); if (s.closeAllConnections) s.closeAllConnections(); } catch (e) { resolve(); }
  });
}
async function doApply() {
  const plan = netPlan();
  api.port = plan.port; api.mode = plan.mode; api.iface = plan.iface;
  if (!plan.host) {
    await stopApi();
    api.ok = false; api.host = ''; api.error = '';
    api.waiting = 'waiting for \u201c' + plan.iface + '\u201d to be connected';
    apiReadyResolve();
    return;
  }
  const key = plan.host + ':' + plan.port;
  if (key === bindKey && api.ok) return;
  await stopApi();
  bindKey = key; api.host = plan.host; api.waiting = ''; api.ok = false; api.error = '';
  await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      try { handleApi(req, res); }
      catch (e) { res.writeHead(500); res.end('{"ok":false,"error":"Internal error"}'); }
    });
    srv = s;
    s.on('error', (e) => {
      if (srv !== s) return;
      api.ok = false; bindKey = '';
      api.error = e.code === 'EADDRINUSE' ? 'port ' + plan.port + ' is already in use'
        : e.code === 'EADDRNOTAVAIL' ? 'that address is not available on this computer' : String(e.message);
      apiReadyResolve(); resolve();
    });
    s.listen(plan.port, plan.host, () => { if (srv !== s) return resolve(); api.ok = true; api.error = ''; apiReadyResolve(); resolve(); });
  });
}
let applyChain = Promise.resolve();
function applyApi() {
  const run = applyChain.then(doApply);
  applyChain = run.catch(() => {});
  return run;
}
function startApi() {
  applyApi();
  // Follow the chosen connection if it appears, disappears or gets a new address; retry after a failure
  setInterval(() => { if (!ENV_HOST && (net.mode === 'iface' || !api.ok)) applyApi(); }, 5000);
}

ipcMain.handle('api-info', async () => {
  await apiReady;
  const ips = api.host === '0.0.0.0' ? lanAddresses() : api.host ? [api.host] : [];
  return { ...api, ips, kiosk: KIOSK };
});
ipcMain.handle('net-get', async () => {
  await apiReady;
  return {
    config: { mode: net.mode || defaultNetMode(), iface: net.iface, port: net.port },
    interfaces: interfaces(),
    api: { ...api },
    lockedHost: !!ENV_HOST, lockedPort: !!ENV_PORT,
    kiosk: KIOSK,
  };
});
ipcMain.handle('net-set', async (_e, cfg) => {
  const prev = { ...net };
  const next = cleanNet(cfg, net);
  if (next.mode === 'iface' && !interfaces().some((i) => i.name === next.iface)) return { ok: false, error: 'That network connection is not available right now.' };
  net = next;
  await applyApi();
  if (!api.ok && !ENV_HOST) {
    const error = api.error || 'Could not start the remote control there.';
    net = prev;
    await applyApi();
    return { ok: false, error };
  }
  saveSettings();
  return { ok: true };
});

// ---- Windows
// Keep pinned windows above other apps. On Windows the plain "floating" level can be covered by other
// topmost windows, so use the highest level and re-assert it regularly.
const TOP_LEVEL = process.platform === 'win32' ? 'screen-saver' : 'floating';
function raise(win) {
  try {
    if (win.isDestroyed() || !win.isVisible() || !win.isAlwaysOnTop()) return;
    win.setAlwaysOnTop(true, TOP_LEVEL);
    win.moveTop();
  } catch (e) { /* window closing */ }
}
if (process.platform === 'win32') {
  setInterval(() => { for (const w of BrowserWindow.getAllWindows()) raise(w); }, 1500);
}

function create(view, opts = {}) {
  const popup = view !== 'launcher' && view !== 'help'; // help is a normal window
  const n = BrowserWindow.getAllWindows().length;
  const transparent = view === 'display' && look.alpha < 100 && !KIOSK;
  const onTop = view === 'display' ? displayTop : popup;

  const win = new BrowserWindow({
    ...(popup ? SIZES[view] : view === 'help' ? SIZES.help : { width: 480, height: 430, resizable: false }),
    ...(opts.bounds ? opts.bounds : {}),
    frame: !popup,
    alwaysOnTop: onTop,
    show: !opts.bounds,
    ...(transparent ? { transparent: true, resizable: false, hasShadow: false } : {}),
    ...(KIOSK && view === 'display' ? { fullscreen: true, kiosk: true, resizable: false } : {}),
    autoHideMenuBar: true,
    title: view === 'help' ? 'Remote control help' : 'Clock & Timer',
    backgroundColor: transparent ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#12161c' : '#f3f5f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const id = win.webContents.id;
  roles.set(id, view);
  winMeta.set(id, { transparent });
  if (opts.bounds) win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    roles.delete(id);
    winMeta.delete(id);
    // If only hidden windows are left (for example a hidden Timer display), nothing on screen can bring them back
    // or quit the program, so open the launcher. Checked a moment later so a window being swapped is not mistaken.
    setTimeout(() => {
      const all = BrowserWindow.getAllWindows();
      if (!KIOSK && all.length > 0 && all.every((w) => !w.isVisible())) create('launcher');
    }, 700);
    // On a dedicated screen nobody can reopen the display by hand, so bring it straight back
    if (KIOSK && view === 'display' && !quitting) setTimeout(() => { if (!quitting && displays().length === 0) create('display'); }, 500);
    if (view === 'display') {
      if (displays().length === 0) displayHidden = false;
      broadcast();
    }
  });
  if (view === 'display' && !opts.bounds) {
    // Opening a display brings back any that were hidden
    displayHidden = false;
    displays().forEach((w) => w.show());
    broadcast();
  }

  if (popup) {
    if (onTop) win.setAlwaysOnTop(true, TOP_LEVEL);
    win.on('blur', () => raise(win));
    win.on('show', () => raise(win));
    if (!opts.bounds) {
      const [x, y] = win.getPosition();
      win.setPosition(x + 30 * (n % 6), y + 30 * (n % 6));
    }
  }
  win.loadFile('index.html', { query: { view, ...(KIOSK ? { kiosk: '1' } : {}) } });
  return win;
}

ipcMain.handle('open', (_e, view) => {
  if (!SIZES[view]) return;
  if (['help', 'audio', 'show', 'presets', 'network'].includes(view)) {
    // Only one help or audio window: bring the existing one forward
    const existing = BrowserWindow.getAllWindows().find((w) => roles.get(w.webContents.id) === view);
    if (existing) { existing.focus(); return; }
  }
  create(view);
});
// The Timer display has a corner grip that asks for a size (the only way for a see-through window, and it also works
// when the operating system's own edge resizing does not, and from a maximized window)
// Set a window's size and check that it took. On some Windows setups a window the person cannot resize by hand
// (a see-through one) grows when asked but ignores a request to get smaller, so if the size did not change,
// lift the limits for a moment and try again.
function forceSize(win, w, h) {
  const close = () => { const [cw, ch] = win.getSize(); return Math.abs(cw - w) <= 3 && Math.abs(ch - h) <= 3; };
  win.setSize(w, h);
  if (close()) return;
  const [mw, mh] = win.getMinimumSize();
  const wasResizable = win.isResizable();
  try { win.setMinimumSize(1, 1); win.setSize(w, h); } catch (e) { /* try the next way */ }
  if (!close()) {
    try { win.setResizable(true); win.setSize(w, h); } catch (e) { /* give up quietly */ }
    try { win.setResizable(wasResizable); } catch (e) { /* ignore */ }
  }
  try { win.setMinimumSize(mw, mh); } catch (e) { /* ignore */ }
}
ipcMain.handle('resize-to', (e, w, h) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || roles.get(e.sender.id) !== 'display') return;
  w = Math.round(Number(w)); h = Math.round(Number(h));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return;
  if (win.isFullScreen() && !KIOSK) win.setFullScreen(false);
  if (win.isMaximized()) win.unmaximize();
  const [mw, mh] = win.getMinimumSize();
  forceSize(win, Math.min(4000, Math.max(mw || 200, w)), Math.min(3000, Math.max(mh || 90, h)));
});
// Quit the whole program, including hidden windows (the page asks the person to confirm first)
ipcMain.handle('quit-app', () => { app.quit(); });
ipcMain.handle('close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle('toggle-pin', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const on = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(on, TOP_LEVEL);
  if (on) win.moveTop();
  return on;
});

app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  loadRules();
  loadAudio();
  loadSettings();
  loadShow();
  startApi();
  create(KIOSK ? 'display' : 'launcher');
});

let quitting = false;
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!KIOSK) app.quit(); });
