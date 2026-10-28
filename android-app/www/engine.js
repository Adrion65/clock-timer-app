/* Clock & Timer: engine for the Android app.
 *
 * The desktop app keeps the timer in Electron's main process and the screens talk to it through
 * window.api. Here there is no main process, so this file provides the same window.api inside the page.
 * All state is saved to localStorage and restored when a screen opens, so moving between screens
 * (each one is a page load) keeps the timer going.
 */
(function () {
  'use strict';
  document.documentElement.classList.add('android');
  document.documentElement.classList.add('v-' + (/operator\.html$/.test(location.pathname) ? 'operator' : (new URLSearchParams(location.search).get('view') || 'launcher')));

  const KEY = 'clocktimer.v1';
  const isOperatorPage = /operator\.html$/.test(location.pathname);
  const view = isOperatorPage ? 'operator' : (new URLSearchParams(location.search).get('view') || 'launcher');
  if (view === 'launcher') { location.replace('operator.html'); }

  // ---------- state ----------
  const timer = { state: 'idle', total: 5 * 60000, baseTotal: 5 * 60000, remaining: 5 * 60000, last: 0, speed: 1.5, travel: false,
    mode: 'speed', tod: null, targetAt: 0, notice: '', doneAt: 0 };
  const SOUNDS = ['beep', 'chime', 'bell', 'alarm'];
  const DEFAULT_AUDIO = { muted: false, volume: 80, sound: 'beep', repeats: 3 };
  const DEFAULT_PRESETS = [1, 5, 10, 15, 30, 45, 60, 75, 90, 120];
  const DEFAULT_RULES = [{ at: 180, color: '#ffb84d' }, { at: 60, color: '#ff6b5e' }];
  let audio = { ...DEFAULT_AUDIO };
  let overtimeDisplay = true;
  let endOnDisplay = true;
  let presets = DEFAULT_PRESETS.slice();
  let show = { segments: [], index: -1, auto: false };
  let face = 'timer';
  let room = '';
  let locked = false;
  let rules = DEFAULT_RULES.map((r) => ({ ...r }));
  let tick = null;

  const cleanAudio = (a, base) => {
    const o = { ...base };
    if (a && typeof a === 'object') {
      if (typeof a.muted === 'boolean') o.muted = a.muted;
      if (Number.isFinite(a.volume)) o.volume = Math.max(0, Math.min(100, Math.round(a.volume)));
      if (SOUNDS.includes(a.sound)) o.sound = a.sound;
      if (Number.isInteger(a.repeats) && a.repeats >= 1 && a.repeats <= 10) o.repeats = a.repeats;
    }
    return o;
  };
  const cleanPresets = (a) => {
    if (!Array.isArray(a)) return null;
    const out = [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 999))].sort((x, y) => x - y).slice(0, 16);
    return out.length ? out : null;
  };
  const cleanSegments = (a) => (!Array.isArray(a) ? null : a.slice(0, 30)
    .map((s) => ({ name: String((s && s.name) || '').slice(0, 40), secs: Math.round(Number(s && s.secs)) }))
    .filter((s) => s.secs >= 1 && s.secs <= 359999));
  const normalizeRules = (arr) => {
    if (!Array.isArray(arr)) return null;
    return arr.slice(0, 12)
      .map((r) => ({ at: Math.round(Number(r && r.at)), color: String((r && r.color) || '').toLowerCase() }))
      .filter((r) => r.at >= 1 && r.at <= 359999 && /^#[0-9a-f]{6}$/.test(r.color));
  };

  // ---------- saving and loading ----------
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ timer, audio, overtimeDisplay, endOnDisplay, presets, show, face, rules, room, locked }));
    } catch (e) { /* storage unavailable: keep running without saving */ }
  }
  function load() {
    let j = null;
    try { j = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { j = null; }
    if (!j || typeof j !== 'object') return;
    const t = j.timer || {};
    if (['idle', 'running', 'paused', 'done'].includes(t.state)) timer.state = t.state;
    for (const k of ['total', 'baseTotal', 'remaining', 'last', 'speed', 'targetAt', 'doneAt']) if (Number.isFinite(t[k])) timer[k] = t[k];
    if (typeof t.travel === 'boolean') timer.travel = t.travel;
    if (t.mode === 'speed' || t.mode === 'target') timer.mode = t.mode;
    timer.tod = Number.isInteger(t.tod) ? t.tod : null;
    if (!Number.isFinite(t.baseTotal)) timer.baseTotal = timer.total;
    audio = cleanAudio(j.audio, DEFAULT_AUDIO);
    if (typeof j.overtimeDisplay === 'boolean') overtimeDisplay = j.overtimeDisplay;
    if (typeof j.endOnDisplay === 'boolean') endOnDisplay = j.endOnDisplay;
    presets = cleanPresets(j.presets) || presets;
    if (j.show && typeof j.show === 'object') {
      show.segments = cleanSegments(j.show.segments) || [];
      if (typeof j.show.auto === 'boolean') show.auto = j.show.auto;
      if (Number.isInteger(j.show.index) && j.show.index >= -1 && j.show.index < show.segments.length) show.index = j.show.index;
    }
    if (j.face === 'clock' || j.face === 'timer') face = j.face;
    rules = normalizeRules(j.rules) || rules;
    if (typeof j.room === 'string') room = j.room.slice(0, 40);
    if (typeof j.locked === 'boolean') locked = j.locked;
  }

  // ---------- timer logic (same rules as the desktop app) ----------
  const snapshot = () => ({
    state: timer.state, total: timer.total, baseTotal: timer.baseTotal, remaining: timer.remaining,
    speed: timer.speed, travel: timer.travel,
    mode: timer.mode, tod: timer.tod, targetAt: timer.targetAt, notice: timer.notice,
    display: 'closed', face, audio,
    doneAt: timer.state === 'done' ? timer.doneAt : 0,
    overtimeDisplay, endOnDisplay, presets, show, room, locked,
  });

  const stateCbs = [], rulesCbs = [];
  let doneCb = null;
  function broadcast() {
    const s = JSON.parse(JSON.stringify(snapshot()));
    stateCbs.forEach((cb) => { try { cb(s); } catch (e) { /* ignore */ } });
  }

  // Sound used when this screen has no alert handler of its own (for example the launcher)
  const PATTERNS = {
    beep:  [[0, 880, 0.35, 'sine', 1]],
    chime: [[0, 1046.5, 0.5, 'sine', 0.9], [0.18, 1318.5, 0.6, 'sine', 0.9]],
    bell:  [[0, 660, 1.1, 'triangle', 1], [0, 1320, 0.7, 'sine', 0.35]],
    alarm: [[0, 740, 0.16, 'square', 0.55], [0.2, 988, 0.16, 'square', 0.55]],
  };
  const GAP = { beep: 0.45, chime: 0.9, bell: 1.3, alarm: 0.55 };
  let fallbackCtx = null;
  function fallbackBeep() {
    try {
      fallbackCtx = fallbackCtx || new (window.AudioContext || window.webkitAudioContext)();
      const peak = 0.6 * audio.volume / 100;
      for (let i = 0; i < audio.repeats; i++) {
        for (const [off, freq, len, wave, rel] of PATTERNS[audio.sound] || PATTERNS.beep) {
          const o = fallbackCtx.createOscillator(), g = fallbackCtx.createGain();
          const t = fallbackCtx.currentTime + i * (GAP[audio.sound] || 0.45) + off;
          o.type = wave; o.frequency.value = freq; o.connect(g); g.connect(fallbackCtx.destination);
          g.gain.setValueAtTime(Math.max(0.0002, peak * rel), t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.start(t); o.stop(t + len + 0.02);
        }
      }
    } catch (e) { /* audio blocked */ }
  }
  function notifyDone() {
    if (audio.muted || audio.volume <= 0) return;
    if (doneCb) doneCb(); else fallbackBeep();
  }

  function nextOccurrence(tod) {
    const now = Date.now();
    const d = new Date(now);
    d.setHours(Math.floor(tod / 3600), Math.floor(tod % 3600 / 60), tod % 60, 0);
    if (d.getTime() <= now + 500) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const resolveAt = () => (timer.tod == null ? null : nextOccurrence(timer.tod));
  const baseNow = () => (timer.state === 'idle' || timer.state === 'done' ? timer.total : timer.remaining);

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

  function advance() {
    const now = Date.now();
    const dt = Math.max(0, now - timer.last);
    if (timer.travel && timer.mode === 'target') {
      const left = timer.targetAt - timer.last;
      if (left <= dt) timer.remaining = 0;
      else timer.remaining -= dt * timer.remaining / left;
    } else {
      timer.remaining -= dt * (timer.travel ? timer.speed : 1);
    }
    timer.last = now;
  }

  function finish(silent) {
    clearInterval(tick);
    timer.remaining = 0;
    timer.state = 'done';
    timer.total = timer.baseTotal; // minutes added while running do not stay
    timer.doneAt = Date.now();
    timer.travel = false;
    timer.notice = '';
    save();
    broadcast();
    if (!silent) notifyDone();
    if (!silent && show.auto && show.index >= 0 && show.index + 1 < show.segments.length) goSegment(show.index + 1);
  }

  let saveCounter = 0;
  function loop() {
    advance();
    if (timer.remaining <= 0) { finish(false); return; }
    if (++saveCounter % 10 === 0) save(); // about once a second
    broadcast();
  }

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
      if (timer.travel && timer.mode === 'target') tryTarget(timer.remaining, idle ? resolveAt() : timer.targetAt);
      clearInterval(tick);
      tick = setInterval(loop, 100);
    } else if (cmd === 'pause' && running) {
      advance();
      clearInterval(tick);
      timer.state = 'paused';
    } else if (cmd === 'speed' && arg >= 0.5 && arg <= 3) {
      if (running) advance();
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
    } else if (cmd === 'face' && ['timer', 'clock', 'toggle'].includes(arg)) {
      face = arg === 'toggle' ? (face === 'clock' ? 'timer' : 'clock') : arg;
    } else if (cmd === 'audio' && arg && typeof arg === 'object') {
      audio = cleanAudio(arg, audio);
    } else if (cmd === 'overtime' && ['on', 'off', 'toggle'].includes(arg)) {
      overtimeDisplay = arg === 'toggle' ? !overtimeDisplay : arg === 'on';
    } else if (cmd === 'endshow' && ['on', 'off', 'toggle'].includes(arg)) {
      endOnDisplay = arg === 'toggle' ? !endOnDisplay : arg === 'on';
    } else if (cmd === 'adjust' && Number.isFinite(arg) && arg !== 0 && Math.abs(arg) <= 3600000 && timer.state !== 'done') {
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
      timerCmd('set', Math.round(nextOccurrence(arg) - Date.now()));
      timerCmd('start');
      return;
    } else if (cmd === 'room' && typeof arg === 'string') {
      room = arg.trim().slice(0, 40);
    } else if (cmd === 'lock' && ['on', 'off', 'toggle'].includes(arg)) {
      locked = arg === 'toggle' ? !locked : arg === 'on';
    } else if (cmd === 'presets') {
      const p = arg === 'reset' ? DEFAULT_PRESETS.slice() : cleanPresets(arg);
      if (p) presets = p;
    } else if (cmd === 'show-set' && arg && typeof arg === 'object') {
      const s = cleanSegments(Array.isArray(arg) ? arg : arg.segments);
      if (s) {
        show.segments = s;
        if (!Array.isArray(arg) && Number.isInteger(arg.index) && arg.index >= -1 && arg.index < s.length) show.index = arg.index;
        if (show.index >= s.length) show.index = s.length - 1;
      }
    } else if (cmd === 'show-auto' && ['on', 'off', 'toggle'].includes(arg)) {
      show.auto = arg === 'toggle' ? !show.auto : arg === 'on';
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
    save();
    broadcast();
  }

  // ---------- screens: every screen is its own page, so "open" is navigation ----------
  const go = (v) => { save(); location.href = (v === 'launcher' || v === 'operator') ? 'operator.html' : 'index.html?view=' + encodeURIComponent(v); };

  window.api = {
    open: async (v) => { if (v && v !== view) go(v); },
    close: async () => { if (view !== 'operator') go('operator'); },
    togglePin: async () => true,
    timerGet: async () => JSON.parse(JSON.stringify(snapshot())),
    timerCmd: async (cmd, arg) => timerCmd(cmd, arg),
    onTimer: (cb) => { stateCbs.push(cb); },
    onDone: (cb) => { doneCb = cb; },
    apiInfo: async () => ({ ok: false, host: '', port: 0, error: 'not available in the Android app yet' }),
    rulesGet: async () => rules.map((r) => ({ ...r })),
    rulesSet: async (arr) => {
      const r = normalizeRules(arr);
      if (r) { rules = r; save(); rulesCbs.forEach((cb) => cb(rules.map((x) => ({ ...x })))); }
      return rules;
    },
    rulesReset: async () => {
      rules = DEFAULT_RULES.map((r) => ({ ...r }));
      save(); rulesCbs.forEach((cb) => cb(rules.map((x) => ({ ...x }))));
      return rules;
    },
    onRules: (cb) => { rulesCbs.push(cb); },
  };
  // ---------- second screen (HDMI / USB-C): a native plugin shows display.html there ----------
  const EXT_KEY = 'clocktimer.ext';
  let extOn = false;
  try { extOn = !!(JSON.parse(localStorage.getItem(EXT_KEY) || '{}').on); } catch (e) { extOn = false; }
  let Ext = window.__extStub || null;
  try {
    if (!Ext && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) Ext = window.Capacitor.registerPlugin('ExtDisplay');
  } catch (e) { Ext = null; }
  const two = (n) => String(n).padStart(2, '0');
  const fmtClock = (ms) => {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return (h ? h + ':' + two(m) : two(m)) + ':' + two(s % 60);
  };
  function extPayload() {
    const now = Date.now(), done = timer.state === 'done';
    const secs = Math.ceil(timer.remaining / 1000);
    const over = done && timer.doneAt ? Math.max(0, Math.floor((now - timer.doneAt) / 1000)) : 0;
    const text = face === 'clock'
      ? new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : done ? (overtimeDisplay ? '+' + fmtClock(over * 1000) : '00:00') : fmtClock(timer.remaining);
    let color = '';
    if (!done && face !== 'clock') {
      let best = null;
      for (const r of rules) if (secs <= r.at && (!best || r.at < best.at)) best = r;
      if (best) color = best.color;
    }
    const base = (timer.state === 'idle' || timer.state === 'done') ? timer.total : timer.remaining;
    let eff = timer.travel ? timer.speed : 1, endMs = null;
    if (timer.travel && timer.mode === 'target') {
      const left = timer.targetAt - now;
      if (left > 0) { eff = base / left; endMs = left; } else eff = 1;
    }
    if (endMs === null) endMs = base / eff;
    const hm = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    let info = '';
    if (face === 'clock') info = '';
    else if (done) info = 'Time\u2019s up';
    else if (timer.state === 'paused') info = 'Paused';
    else if (endOnDisplay) info = (timer.state === 'running' ? 'ends at ' : 'if started now: ends at ') + hm(now + endMs);
    let seg = '';
    const segs = show.segments, idx = show.index;
    if (segs.length && idx >= 0 && face !== 'clock') seg = segs[idx].name.trim() || 'Segment ' + (idx + 1);
    return { text, color, info, seg, room, state: face === 'clock' ? 'running' : timer.state,
      pct: done || face === 'clock' ? 0 : (timer.total ? Math.max(0, Math.min(100, timer.remaining / timer.total * 100)) : 0) };
  }
  function extPush() {
    if (!Ext || !extOn) return;
    try { Ext.push({ json: JSON.stringify(extPayload()) }); } catch (e) { /* ignore */ }
  }
  function extSet(on) {
    extOn = !!on;
    try { localStorage.setItem(EXT_KEY, JSON.stringify({ on: extOn })); } catch (e) { /* ignore */ }
    if (Ext) { try { Ext.setEnabled({ on: extOn }); } catch (e) { /* ignore */ } }
    extPush();
    return extOn;
  }
  if (Ext) { try { Ext.setEnabled({ on: extOn }); } catch (e) { /* ignore */ } setInterval(extPush, 250); }
  window.api.extStatus = async () => {
    let connected = false;
    if (Ext) { try { connected = !!(await Ext.status()).connected; } catch (e) { connected = false; } }
    return { supported: !!Ext, on: extOn, connected };
  };
  window.api.extSet = async (on) => extSet(on);

  window.__clockTimerEngine = { snapshot, timerCmd, save, load }; // for testing

  // ---------- start up ----------
  load();
  if (timer.state === 'running') {
    // The page was reloaded or the app came back: catch up with the time that passed
    advance();
    if (timer.remaining <= 0) finish(true);
    else tick = setInterval(loop, 100);
  }

  // Keep the screen on while a timer screen is open
  let wake = null;
  async function keepAwake() {
    try {
      if (view === 'help' || !navigator.wakeLock) return;
      if (document.visibilityState === 'visible' && !wake) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch (e) { /* not allowed */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { advanceIfRunning(); keepAwake(); } else save(); });
  function advanceIfRunning() { if (timer.state === 'running') { advance(); if (timer.remaining <= 0) finish(true); } }
  window.addEventListener('pagehide', save);
  // Browsers only let a page make sound after a touch: wake the sound system on the first one
  window.addEventListener('pointerdown', () => {
    try {
      fallbackCtx = fallbackCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (fallbackCtx.state === 'suspended') fallbackCtx.resume();
    } catch (err) { /* no audio */ }
  }, { once: true, passive: true });
  keepAwake();

  // Android wording on the launcher, and no desktop-only buttons
  document.addEventListener('DOMContentLoaded', () => {
    const p = document.querySelector('#launcher p');
    if (p) p.textContent = 'Pick a screen. The timer keeps running while you move between them, and the Android back button returns to the previous screen.';
    const x = document.querySelector('#x');
    if (x) x.title = 'Back to the start screen';
  });
})();
