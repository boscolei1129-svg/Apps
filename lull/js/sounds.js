// Sleep sounds, synthesised on the device and looped through an <audio> element
// so they keep playing with the screen locked.
export const SOUNDS = [
  { id: 'rain', name: 'Rain', note: 'Steady rainfall' },
  { id: 'ocean', name: 'Ocean', note: 'Slow rolling waves' },
  { id: 'fan', name: 'Fan', note: 'Low, even hum' },
  { id: 'brown', name: 'Brown noise', note: 'Deep and soft' },
  { id: 'pink', name: 'Pink noise', note: 'Like a steady wind' },
  { id: 'white', name: 'White noise', note: 'Bright, masks voices' },
];

const SR = 22050;
const LOOP = 24; // seconds; every rhythmic component divides this evenly
const XFADE = 1.2; // seconds blended across the loop point
const N = LOOP * SR;
const TOTAL = Math.ceil((LOOP + XFADE) * SR);

function white(len) { const a = new Float32Array(len); for (let i = 0; i < len; i++) a[i] = Math.random() * 2 - 1; return a; }
function pink(len) {
  const a = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return a;
}
function brown(len) {
  const a = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = last * 3.5; }
  return a;
}
function lowpass(a, k) { let y = a[0]; for (let i = 0; i < a.length; i++) { y += k * (a[i] - y); a[i] = y; } return a; }
function highpass(a, k) { let lp = 0; for (let i = 0; i < a.length; i++) { lp += k * (a[i] - lp); a[i] = a[i] - lp; } return a; }

const GEN = {
  white: () => lowpass(white(TOTAL), 0.85).map(v => v * 0.5),
  pink: () => pink(TOTAL),
  brown: () => brown(TOTAL),
  rain() {
    const base = highpass(pink(TOTAL), 0.04);
    const out = new Float32Array(TOTAL);
    let env = 0, hp = 0, prev = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (Math.random() < 0.0028) env = Math.max(env, 0.15 + Math.random() * 0.5);
      env *= 0.9935;
      const w = Math.random() * 2 - 1;
      hp = 0.7 * (hp + w - prev); prev = w; // crisp droplet texture
      out[i] = base[i] * 0.55 + hp * env;
    }
    return lowpass(out, 0.55);
  },
  ocean() {
    const body = brown(TOTAL);
    const foam = highpass(pink(TOTAL), 0.08);
    const out = new Float32Array(TOTAL);
    for (let i = 0; i < TOTAL; i++) {
      const t = i / SR;
      const swell = 0.62 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 8)) + 0.38 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 12 + 1.3));
      const e = Math.pow(swell, 1.5);
      out[i] = body[i] * (0.18 + 0.82 * e) + foam[i] * 0.55 * Math.pow(e, 3);
    }
    return lowpass(out, 0.5);
  },
  fan() {
    const air = lowpass(brown(TOTAL), 0.35);
    const hiss = lowpass(pink(TOTAL), 0.2);
    const out = new Float32Array(TOTAL);
    for (let i = 0; i < TOTAL; i++) {
      const t = i / SR;
      const blade = 1 + 0.06 * Math.sin(2 * Math.PI * 5 * t);
      const hum = 0.035 * Math.sin(2 * Math.PI * 100 * t) + 0.015 * Math.sin(2 * Math.PI * 200 * t);
      out[i] = (air[i] * 0.9 + hiss[i] * 0.35) * blade + hum;
    }
    return out;
  },
};

function makeLoop(raw) {
  const F = Math.floor(XFADE * SR);
  const out = new Float32Array(N);
  out.set(raw.subarray(0, N));
  for (let i = 0; i < F; i++) {
    const k = i / F;
    out[i] = raw[i] * Math.sin((k * Math.PI) / 2) + raw[N + i] * Math.cos((k * Math.PI) / 2);
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.8 / (peak || 1);
  for (let i = 0; i < N; i++) out[i] *= g;
  return out;
}

function toWav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

const urls = new Map();
function urlFor(id) {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(toWav(makeLoop(GEN[id]()))));
  return urls.get(id);
}

// ---------- player ----------
const audio = new Audio();
audio.loop = true;
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

export const canSetVolume = (() => { const a = new Audio(); a.volume = 0.5; return a.volume === 0.5; })();

const listeners = new Set();
const state = { id: null, playing: false, loading: false, endsAt: null, timerMin: 30, volume: 0.8 };
export const getState = () => state;
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => fn(state));

let fadeTimer = 0;
export function configure({ timerMin, volume }) {
  if (timerMin != null) state.timerMin = timerMin;
  if (volume != null) { state.volume = volume; if (canSetVolume) audio.volume = volume; }
}

export async function play(id) {
  const sound = SOUNDS.find(s => s.id === id);
  if (!sound) return;
  state.loading = true; state.id = id; emit();
  await new Promise(r => setTimeout(r, 30)); // let the UI paint the loading state
  try {
    const src = urlFor(id);
    if (audio.src !== src) audio.src = src;
    if (canSetVolume) audio.volume = state.volume;
    await audio.play();
    state.playing = true;
    state.endsAt = state.timerMin ? Date.now() + state.timerMin * 60000 : null;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: sound.name, artist: 'Lull', album: 'Sleep sounds' });
      navigator.mediaSession.setActionHandler('play', () => play(state.id));
      navigator.mediaSession.setActionHandler('pause', () => stop());
    }
  } catch (err) {
    console.warn('Sound could not start', err);
    state.playing = false;
  }
  state.loading = false;
  emit();
}

export function stop() {
  audio.pause();
  clearInterval(fadeTimer);
  if (canSetVolume) audio.volume = state.volume;
  state.playing = false; state.endsAt = null;
  emit();
}

export function toggle(id) {
  if (state.playing && state.id === id) stop(); else play(id);
}

export function setTimer(min) {
  state.timerMin = min;
  if (state.playing) state.endsAt = min ? Date.now() + min * 60000 : null;
  emit();
}

// Sleep timer with a gentle fade over the last 20 seconds where volume can be set.
setInterval(() => {
  if (!state.playing || !state.endsAt) return;
  const left = state.endsAt - Date.now();
  if (left <= 0) { stop(); return; }
  if (canSetVolume && left < 20000) audio.volume = state.volume * (left / 20000);
}, 500);
