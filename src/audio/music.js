// Background music from assets/audio/music. A track is chosen by name: a file whose name
// starts with the track's name (case and spaces don't matter), e.g. "Menu.mp3" for "menu",
// "Najaf-Urban.mp3" for "najaf-urban". .mp3, .ogg, .m4a and .wav all work (.mp3 plays on
// every phone).
//  - On the title screen and the menus: the "menu" track.
//  - In a level: the level's music zones (level.json → music_zones: { track, x0, z0, x1, z1 }).
//    Walking into a zone fades its track in; leaving fades it out (a few metres of slack at
//    the edge so it doesn't flicker on the line).
// Tracks fade over settings.json → audio.music_fade seconds, at audio.music_volume.
// The files are separate downloads (not packed into the game code), saved on the phone by
// the offline copy after the first time they play. Missing files are simply silent.
const files = import.meta.glob('../../assets/audio/music/*.{mp3,ogg,m4a,wav,MP3,OGG,M4A,WAV}', { query: '?url', import: 'default', eager: true });
const key = s => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TRACKS = Object.fromEntries(Object.entries(files).map(([path, url]) => [key(path.split('/').pop()), url]));

/** The file for a track name: an exact match, else the first file whose name starts with it. */
export function musicFile(name) {
  const k = key(name);
  if (TRACKS[k]) return TRACKS[k];
  const hit = Object.keys(TRACKS).sort().find(t => t.startsWith(k));
  return hit ? TRACKS[hit] : null;
}
export const musicTracks = () => Object.keys(TRACKS);

export function createMusic(settings) {
  let ctx = null;
  const players = new Map();   // track name → { el, gain, on, offAt }
  let current = null, zoneTrack = null;

  function player(name) {
    if (players.has(name)) return players.get(name);
    const url = musicFile(name);
    let p = null;
    if (url && ctx) {
      try {
        const el = new Audio();
        el.src = url; el.loop = true; el.preload = 'auto';
        // through the audio graph so the volume can fade on every phone (iPhones ignore
        // an audio element's own volume)
        const src = ctx.createMediaElementSource(el), gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain); gain.connect(ctx.destination);
        p = { el, gain, on: false, offAt: 0 };
      } catch (e) { p = null; }
    }
    players.set(name, p);
    return p;
  }

  function fadeTo(p, on) {
    const s = settings.audio || {};
    const vol = s.music_volume ?? 0.55, t = Math.max(0.05, s.music_fade ?? 2.5);
    p.on = on;
    p.gain.gain.cancelScheduledValues(ctx.currentTime);
    p.gain.gain.setTargetAtTime(on ? vol : 0, ctx.currentTime, t / 3);
    if (on) {
      // a track that has been off for a while starts again from the top
      if (p.offAt && ctx.currentTime - p.offAt > 30) { try { p.el.currentTime = 0; } catch (e) { /* not loaded yet */ } }
      p.offAt = 0;
      const r = p.el.play(); if (r && r.catch) r.catch(() => {});
    } else p.offAt = ctx.currentTime;
  }

  return {
    /** Call after the audio has been unlocked by a tap (audio.context()). */
    attach(audioCtx) { if (!ctx && audioCtx) ctx = audioCtx; },
    /**
     * Every frame: which track should play. `menu` true on the title and menu screens;
     * otherwise the music zone the player is in (if any).
     */
    update(dt, { menu, world, player: pl }) {
      if (!ctx) return;
      let want = null;
      if (menu) { want = 'menu'; zoneTrack = null; }
      else if (world && pl) {
        const zones = (world.data.levels[world.levelId] || {}).music_zones || [];
        const slack = (settings.audio || {}).zone_slack ?? 3;
        const inZone = (z, m) => pl.x >= z.x0 - m && pl.x <= z.x1 + m && pl.z >= z.z0 - m && pl.z <= z.z1 + m;
        // stay with the current zone's track until well outside it
        const stay = zoneTrack && zones.find(z => z.track === zoneTrack && inZone(z, slack));
        const z = stay || zones.find(z => inZone(z, -slack));
        zoneTrack = z ? z.track : null;
        want = zoneTrack;
      }
      if (want !== current) {
        if (current && players.get(current)) fadeTo(players.get(current), false);
        current = want;
        const p = want && player(want);
        if (p) fadeTo(p, true);
      }
      // pause tracks once they have faded out
      for (const p of players.values()) {
        if (p && !p.on && p.offAt && ctx.currentTime - p.offAt > ((settings.audio || {}).music_fade ?? 2.5) * 1.5 && !p.el.paused) p.el.pause();
      }
    },
    /** The volume slider moved: apply it to the playing track. */
    refresh() { const p = current && players.get(current); if (p && ctx) fadeTo(p, true); },
    get playing() { return current; }
  };
}
