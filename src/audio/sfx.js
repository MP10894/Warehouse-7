// Sound effects from assets/audio/sfx, set up in data/sounds.csv (editable in Excel):
//   sound          the game's name for the moment (ammo_pickup, shot_ak47, explosion …)
//   file           the file's name without its extension. Several takes: name them
//                  File_1, File_2 … (or File1, File2): one is picked at random each time.
//   volume         1 = as recorded
//   range          metres it carries: 0 = only your own (pickups, reloads…); otherwise it
//                  fades out with distance and comes from the left or right
//   pitch_spread   random pitch change each time (0.05 = ±5 %), so repeats don't sound copied
// A sound with no file (or whose file is missing) keeps the game's built-in synthesised sound.
import soundsCsv from '../../data/sounds.csv?raw';
import { parseCsv } from '../data/parse.js';

const files = import.meta.glob('../../assets/audio/sfx/*.{mp3,ogg,m4a,wav,MP3,OGG,M4A,WAV}', { query: '?url', import: 'default', eager: true });
const norm = s => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '');
const FILES = Object.entries(files).map(([path, url]) => ({ name: norm(path.split('/').pop()), url }));

/** The table: sound → { files: [urls], volume, range, pitch } (only sounds that have files). */
export const SOUNDS = {};
for (const r of parseCsv(soundsCsv)) {
  if (!r.sound || !r.file) continue;
  const base = norm(r.file);
  // the file itself, or its numbered takes (File_1, File_2 …)
  const urls = FILES.filter(f => f.name === base || new RegExp(`^${base}\\d+$`).test(f.name)).map(f => f.url);
  if (!urls.length) continue;
  SOUNDS[r.sound.trim()] = { urls, volume: Number(r.volume) || 1, range: Number(r.range) || 0, pitch: Number(r.pitch_spread) || 0 };
}

export function createSfx() {
  let ctx = null, out = null;
  const buffers = new Map();   // url → AudioBuffer (once decoded)
  let last = null;             // for checks: the last sound played
  return {
    /** Called when sound is unlocked: start decoding every file in the background. */
    attach(audioCtx, master) {
      if (ctx || !audioCtx) return;
      ctx = audioCtx; out = master;
      for (const s of Object.values(SOUNDS)) for (const url of s.urls) {
        if (buffers.has(url)) continue;
        buffers.set(url, null);
        fetch(url).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)))
          .then(buf => buffers.set(url, buf)).catch(() => {});
      }
    },
    get last() { return last; },
    /** Is there a file (ready to play) for this sound? */
    has(id) { const s = SOUNDS[id]; return !!(s && s.urls.some(u => buffers.get(u))); },
    /**
     * Play a sound. dist: metres from you (0 = yours); pan: −1 left … 1 right.
     * Returns false if it can't (no file yet), so the built-in sound plays instead.
     */
    play(id, dist = 0, pan = 0) {
      const s = SOUNDS[id];
      if (!s || !ctx) return false;
      const ready = s.urls.map(u => buffers.get(u)).filter(Boolean);
      if (!ready.length) return false;
      let vol = s.volume;
      if (s.range > 0) { vol *= Math.max(0, 1 - dist / s.range) ** 1.5; if (vol < 0.01) return true; }
      const src = ctx.createBufferSource();
      src.buffer = ready[Math.floor(Math.random() * ready.length)];
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * s.pitch;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(g);
      if (s.range > 0 && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(out); }
      else g.connect(out);
      src.start();
      last = id;
      return true;
    }
  };
}
