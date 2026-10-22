// Synthesised sound effects (no audio files yet), played in response to world events.
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;

  function noise(dur, freq, vol) {
    if (!ctx) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  const byDistance = (d, near, minVol) => Math.max(minVol, near - d * .02);

  return {
    /** Must be called from a tap or click (browsers only allow sound after interaction). */
    init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = .45; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; }
    },

    handle(ev, local) {
      if (!ctx || !local) return;
      const dist = ev.x !== undefined ? Math.hypot(ev.x - local.x, ev.z - local.z) : 0;
      switch (ev.type) {
        case 'shot':
          if (ev.playerId === local.id) { noise(.16, 3400, .8); tone('sine', 150, 50, .12, .6); }
          else { const v = byDistance(dist, .6, .08); noise(.16, 3000, v); }
          break;
        case 'enemyShot': { const v = byDistance(dist, .55, .06); noise(.14, 1600, v); tone('sine', 120, 50, .1, v * .6); break; }
        case 'explosion': noise(1.0, 600, 1.2); tone('sine', 80, 30, .7, 1); break;
        case 'playerHurt': if (ev.playerId === local.id) tone('square', 240, 110, .16, .18); break;
        case 'pickup': if (ev.playerId === local.id) { tone('square', 660, 660, .06, .12); tone('square', 990, 990, .08, .12, .07); } break;
        case 'enemyDie': tone('sawtooth', 320, 70, .4, .14); break;
        case 'empty': if (ev.playerId === local.id) tone('square', 1400, 1300, .03, .08); break;
      }
    }
  };
}
