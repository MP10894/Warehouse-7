// Sound effects, played in response to world events: recorded files where data/sounds.csv
// names one (see sfx.js), otherwise the built-in synthesised sounds below.
// Music is separate: see music.js.
import { createSfx } from './sfx.js';
const SHOT = {
  sig_p320: { freq: 4200, dur: 0.12, vol: 0.55, thump: 170 },
  m4a1: { freq: 3600, dur: 0.15, vol: 0.7, thump: 130 },
  ak47: { freq: 2600, dur: 0.18, vol: 0.8, thump: 105 },
  rpg7: { freq: 900, dur: 0.6, vol: 0.9, thump: 60 },
  turret: { freq: 3800, dur: 0.07, vol: 0.45, thump: 140 },   // short and quiet: it fires 20 a second
};

/** Which sound (a row in data/sounds.csv) a world event makes for this player, if any. */
const PICKUP_SOUND = { ammo: 'ammo_pickup', armour: 'armour_pickup', health: 'health_pickup', weapon: 'weapon_pickup', grenade: 'grenade_pickup', item: 'crate_pickup' };
function soundFor(ev, local) {
  const mine = id => id === local.id;
  switch (ev.type) {
    case 'shot': return `shot_${ev.weapon}`;
    case 'pickup': return mine(ev.playerId) ? PICKUP_SOUND[ev.what] || null : null;
    case 'reload': return mine(ev.actorId) ? `reload_${ev.weapon}` : null;   // each weapon has its own (no file yet → the built-in click)
    case 'swap': return mine(ev.actorId) ? 'swap' : null;
    case 'empty': return mine(ev.playerId) ? 'empty' : null;
    case 'throw': return mine(ev.actorId) ? 'throw' : null;
    case 'bounce': return 'grenade_bounce';
    case 'explosion': return 'explosion';
    case 'siren': return 'blast_siren';
    case 'blocks': return !ev.placed && ev.cells && ev.cells.length ? 'wall_break' : null;
    case 'wave': return 'wave_alarm';
    case 'baseClaimed': return 'base_claimed';
    case 'built': return 'built';
    case 'hurt': return mine(ev.targetId) ? 'hurt' : null;
    case 'death': return ev.team === 'enemy' ? 'enemy_death' : null;
    case 'beep': return 'bomber_beep';
    case 'downed': return 'downed';
    case 'revived': return 'revived';
  }
  return null;
}

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, wind = null;
  const sfx = createSfx();

  function noise(dur, freq, vol, delay = 0, type = 'lowpass') {
    if (!ctx || vol <= 0.001) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (!ctx || vol <= 0.001) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const fade = d => Math.max(0, 1 - d / 70);

  return {
    /** Must be called from a tap or click (browsers only allow sound after interaction). */
    init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        // looping wind for sandstorms
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(master); src.start();
        wind = { g, f };
        sfx.attach(ctx, master);
      } catch (e) { ctx = null; }
    },

    /** For checks: the last recorded sound played. */
    get lastSound() { return sfx.last; },
    /** The audio context once unlocked (music plays through it too), or null. */
    context() { return ctx; },
    /** Phone switched apps / screen off: go quiet; back: carry on. */
    pause(on) { if (!ctx) return; if (on) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); },

    setStorm(level) {
      if (!wind) return;
      wind.g.gain.setTargetAtTime(level * 0.5, ctx.currentTime, 0.3);
      wind.f.frequency.setTargetAtTime(400 + level * 500 + Math.random() * 120, ctx.currentTime, 0.4);
    },

    handle(ev, local) {
      if (!ctx || !local) return;
      const d = ev.x !== undefined ? Math.hypot(ev.x - local.x, ev.z - local.z) : 0;
      // a recorded sound for this moment? (data/sounds.csv) Then that instead of the built-in one
      // (a reload or swap cuts short a reload sound still playing; so does going down)
      if ((ev.type === 'swap' && ev.actorId === local.id) || ((ev.type === 'downed' || ev.type === 'death') && (ev.playerId === local.id || ev.actorId === local.id))) sfx.stop('reload');
      const ids = [].concat(soundFor(ev, local) || []);
      const id = ids.find(x => sfx.has(x));
      if (id) {
        let pan = 0;
        if (ev.x !== undefined && d > 0.5) {
          // left/right from where you're facing: your right is (cos yaw, −sin yaw)
          pan = ((ev.x - local.x) * Math.cos(local.yaw) - (ev.z - local.z) * Math.sin(local.yaw)) / d * 0.8;
        }
        // a reload sound never runs past the end of the reload
        if (sfx.play(id, d, pan, ev.type === 'reload' ? 'reload' : null, ev.type === 'reload' ? (ev.time || 0) + 0.25 : 0)) return;
      }
      switch (ev.type) {
        case 'shot': {
          const s = SHOT[ev.weapon] || SHOT.ak47;
          const mine = ev.actorId === local.id;
          const v = mine ? s.vol : s.vol * 0.7 * fade(d);
          noise(s.dur, mine ? s.freq : s.freq * 0.6, v);
          tone('sine', s.thump, 40, s.dur * 0.9, v * 0.8);
          if (ev.weapon === 'rpg7') noise(0.9, 1500, v * 0.5, 0.05, 'bandpass');
          break;
        }
        case 'explosion': { const v = 1.3 * Math.max(0.15, fade(d)); noise(1.2, 500, v); tone('sine', 70, 25, 0.8, v); break; }
        // the mine's blasting siren: a wail rising and falling for as long as it sounds
        case 'siren': { const n = Math.max(1, Math.round(ev.time || 5)); for (let i = 0; i < n; i++) { tone('sawtooth', 420, 880, 0.5, 0.12, i); tone('sawtooth', 880, 420, 0.5, 0.12, i + 0.5); } break; }
        case 'impact': if (d < 6 && ev.kind !== 'flesh') noise(0.05, 5000, 0.12, 0, 'highpass'); break;
        case 'hurt':
          if (ev.targetId === local.id) tone('square', 220, 100, 0.16, 0.16);
          else if (ev.team === 'enemy' && d < 40) tone('sawtooth', 260, 140, 0.12, 0.08 * fade(d));
          break;
        case 'death': if (ev.team === 'enemy') tone('sawtooth', 300, 70, 0.4, 0.12 * Math.max(0.3, fade(d))); break;
        case 'reload': if (ev.actorId === local.id) { tone('square', 900, 700, 0.04, 0.08); tone('square', 600, 500, 0.05, 0.1, ev.time * 0.8); } break;
        case 'swap': if (ev.actorId === local.id) tone('square', 500, 650, 0.05, 0.08); break;
        case 'pickup': if (ev.playerId === local.id) { tone('square', 660, 660, 0.06, 0.1); tone('square', 990, 990, 0.08, 0.1, 0.07); } break;
        case 'empty': if (ev.playerId === local.id) tone('square', 1400, 1300, 0.03, 0.08); break;
        case 'wave': tone('sawtooth', 300, 300, 0.5, 0.14); tone('sawtooth', 240, 240, 0.6, 0.14, 0.5); break;
        case 'baseClaimed': [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.14, 0.1, i * 0.12)); break;
        case 'built': [392, 523, 659].forEach((f, i) => tone('triangle', f, f, 0.18, 0.14, i * 0.1)); break;
        case 'blocks': if (!ev.placed && ev.cells && ev.cells.length) noise(0.7, 300, 0.6 * Math.max(0.2, fade(d))); break;
        case 'throw': if (ev.actorId === local.id) { tone('square', 1800, 1700, 0.02, 0.06); noise(0.25, 900, 0.18, ev.release || 0.3, 'bandpass'); } break;
        case 'bounce': if (d < 25) tone('triangle', 1500, 1100, 0.05, 0.12 * fade(d)); break;
        // a suicide bomber's beeping: loud and clear, so you can hear where he is
        case 'beep': if (d < 30) tone('square', 1900, 1900, 0.06, 0.16 * Math.max(0.25, 1 - d / 30)); break;
        case 'downed': case 'revived': tone('triangle', 440, ev.type === 'downed' ? 220 : 880, 0.3, 0.12); break;
      }
    }
  };
}
