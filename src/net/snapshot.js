// Co-op snapshots: the host squeezes the parts of the world that change into a small
// object (it must stay under 4 KB), and the guest copies them into its own world.
// The guest builds the same level from the same seed, so only moving and changing
// things travel: people, bullets, pickups, broken walls, base walls, clock, events.
import { destroyPiece } from '../sim/damage.js';
import { claimBase, applyUpgrade } from '../sim/base.js';
import { replayBlast } from '../sim/blasting.js';

const STATES = ['idle', 'chase', 'aim', 'fire', 'pain', 'dead'];
const STATUS = ['playing', 'won', 'lost'];
const PICKUP_TYPES = ['weapon', 'ammo', 'armour', 'item', 'health', 'resupply', 'grenade'];
const PROJ = ['bullet', 'rocket', 'grenade', 'mortar'];
// enemies further than this from both players are not sent (the guest can't see that far)
const SEND_RANGE = 90;
// events the guest needs to replay for sound, effects and HUD (broken walls are rebuilt
// from the piece list instead, so 'blocks' is not forwarded)
const FORWARD = new Set(['shot', 'impact', 'explosion', 'hurt', 'death', 'downed', 'revived', 'pickup', 'message',
  'wave', 'baseClaimed', 'built', 'weather', 'hitConfirm', 'reload', 'swap', 'empty', 'status', 'throw', 'beep', 'bounce', 'turret', 'siren', 'melee',
  'designate', 'streakReady', 'strikeCalled', 'shellIncoming']);
const EVENT_WINDOW = 45; // ticks of recent events repeated in every snapshot (drops are common)
const MAX_EVENTS = 22;

const cm = v => Math.round(v * 100);
const mr = v => Math.round(v * 1000);
const r2 = v => Math.round(v * 100) / 100;

/** Host side: keeps recent events with sequence numbers and builds snapshots. */
export function createHostEncoder(data) {
  const weaponIds = Object.keys(data.weapons);
  const enemyIds = Object.keys(data.enemies);
  const wIdx = id => weaponIds.indexOf(id);
  const ring = [];
  let seq = 0, lastPickups = '', lastPieces = '', lastLog = null;

  function slimEvent(ev, tick) {
    const out = { q: ++seq, k: tick };
    for (const [key, v] of Object.entries(ev)) {
      if (key === '_applied') continue;
      out[key] = typeof v === 'number' ? r2(v) : v;
    }
    return out;
  }

  return {
    /** Remember this tick's events (call before the events are consumed). */
    record(world, events) {
      for (const ev of events) if (FORWARD.has(ev.type)) ring.push(slimEvent(ev, world.tick));
      while (ring.length && ring[0].k < world.tick - EVENT_WINDOW) ring.shift();
    },

    /** Build the presence patch for this frame. Fields that didn't change are left out. */
    encode(world) {
      const patch = {};
      const g = [cm(world.time), cm(world.timeLeft), STATUS.indexOf(world.status), world.kills,
        world.waves.number, world.waves.nextT === null ? -1 : Math.round(world.waves.nextT * 10), world.base.claimed ? 1 : 0, world.base.claimed ? world.base.index : -1,
        world.weather.map(z => (z.active ? Math.round(z.intensity * 100) : -1)), world.outcome ? STATUS.indexOf(world.outcome) : 0,
        world.waves.queue.length];
      patch.t = world.tick;
      patch.g = g;
      patch.p = world.players.map(p => [
        p.id, cm(p.x), cm(p.y), cm(p.z), mr(p.yaw), mr(p.pitch), Math.ceil(p.hp), Math.ceil(p.armour),
        (p.alive ? 1 : 0) | (p.downed ? 2 : 0) | (p.moving ? 4 : 0) | (p.ads ? 8 : 0),
        Math.round(p.downT * 10), p.active,
        p.slots.map(s => (s ? `${wIdx(s.w)}:${s.mag}` : '')).join('|'),
        Object.entries(p.reserve).map(([c, n]) => `${c}=${n}`).join('|'),
        Math.round(p.reloadT * 100), Math.round(p.swapT * 100),
        p.carrying ? (p.carrying.turret ? `turret:${p.carrying.turret}` : p.carrying.item) : '',
        p.context ? `${p.context.kind}|${p.context.label}` : '',
        Math.round(p.bloom * 1000),
        `${p.stats.shots}|${p.stats.hits}|${p.stats.kills}`,
        p.grenades || 0, Math.round((p.throwT || 0) * 100),
        p.streak || 0, p.designating ? 1 : 0
      ]);
      const near = (e, r) => world.players.some(p => Math.abs(p.x - e.x) < r && Math.abs(p.z - e.z) < r);
      const sent = world.enemies.filter(e => (e.alive && (e.wave || near(e, SEND_RANGE))) || (!e.alive && e.deadT < 12 && near(e, 60)));
      const away = e => Math.min(...world.players.map(p => Math.hypot(p.x - e.x, p.z - e.z)));
      // nearest first, so the furthest can be left out if the message gets too big
      sent.sort((a, b) => away(a) - away(b));
      patch.n = sent.map(e => [
        e.id, cm(e.x), cm(e.y), cm(e.z), mr(e.yaw), mr(e.pitch || 0), Math.ceil(e.armour), STATES.indexOf(e.state), wIdx(e.weapon.w),
        (e.alive ? 1 : 0) | (e.moving ? 2 : 0) | (e.aiming ? 4 : 0) | (e.wave ? 8 : 0),
        Math.round(e.animT * 10), Math.round(e.deadT * 10), enemyIds.indexOf(e.type)
      ]);
      // bullets first (they are trimmed first when the message is too big), then rockets and grenades
      const shown = [...world.projectiles.filter(pr => pr.kind === 'bullet').slice(-12), ...world.projectiles.filter(pr => pr.kind !== 'bullet').slice(-8)];
      // the mine's detonator: siren sounding, and when it is ready again
      if (world.blast) patch.x = [world.blast.state === 'siren' ? 1 : 0, cm(world.blast.readyAt)];
      // the players' turrets (one each at most)
      patch.r = world.turrets.map(t => [t.id, cm(t.x), cm(t.y), cm(t.z), mr(t.yaw), mr(t.pitch), Math.ceil(t.hp), Math.ceil(t.armour),
        t.alive ? 1 : 0, t.owner, t.type, Math.round(t.deadT * 10)]);
      patch.b = shown.map(pr => [pr.id, cm(pr.x), cm(pr.y), cm(pr.z), Math.round(pr.vx), Math.round(pr.vy), Math.round(pr.vz),
        pr.team === 'enemy' ? 1 : 0, Math.max(0, PROJ.indexOf(pr.kind))]);
      patch.e = ring.slice(-MAX_EVENTS);

      const pk = JSON.stringify(world.pickups.map(k => [k.id, PICKUP_TYPES.indexOf(k.type), cm(k.x), cm(k.y), cm(k.z),
        k.type === 'weapon' ? wIdx(k.weapon) : k.type === 'ammo' ? k.calibre : k.type === 'item' ? k.item : k.amount, k.mag ?? k.amount ?? 0]));
      if (pk !== lastPickups) { patch.k = JSON.parse(pk); lastPickups = pk; }

      // what has been built and broken in the base, in order (see base.js → onPieceDestroyed)
      const log = world.base.log.join(',');
      if (log !== lastLog) { patch.u = log; lastLog = log; }

      // broken pieces as a bit set, base64 (a few dozen characters)
      const bits = new Uint8Array(Math.ceil(world.pieces.length / 8));
      world.pieces.forEach((p, i) => { if (!p.alive) bits[i >> 3] |= 1 << (i & 7); });
      let bin = '';
      for (const b of bits) bin += String.fromCharCode(b);
      const pieces = btoa(bin);
      if (pieces !== lastPieces) { patch.d = pieces; lastPieces = pieces; }

      // the room keeps every field, so the budget covers the parts not resent this time too;
      // stay under the 4 KB limit by trimming the least important parts first
      const kept = (patch.k ? 0 : lastPickups.length) + (patch.d ? 0 : lastPieces.length) + (patch.u !== undefined ? 0 : (lastLog || '').length) + 250;
      const size = () => JSON.stringify(patch).length + kept;
      const LIMIT = 3900;
      while (size() > LIMIT && patch.b.length) patch.b.shift();
      while (size() > LIMIT && patch.e.length > 8) patch.e.shift();
      while (size() > LIMIT && patch.n.some(n => !(n[9] & 1))) patch.n.splice(patch.n.findIndex(n => !(n[9] & 1)), 1);
      while (size() > LIMIT && patch.e.length > 1) patch.e.shift();
      // still too big (many enemies around both players): leave out the furthest ones
      for (let i = patch.n.length - 1; i >= 0 && size() > LIMIT; i--) if (!(patch.n[i][9] & 8)) patch.n.splice(i, 1);
      return patch;
    },

    /** Everything again (when a guest joins mid-way, or after a reconnect). */
    forceFull() { lastPickups = ''; lastPieces = ''; lastLog = null; }
  };
}

/** Guest side: copy a snapshot into the local world. Returns the events to replay. */
export function createGuestDecoder(data) {
  const weaponIds = Object.keys(data.weapons);
  const enemyIds = Object.keys(data.enemies);
  const upgradeIds = Object.keys(data.upgrades || {});
  let lastTick = -1, lastSeq = 0, applied = 0;

  function applyBroken(world, d) {
    const bin = atob(d);
    world.pieces.forEach((p, i) => {
      const broken = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
      if (broken && p.alive) destroyPiece(world, p); // emits a local 'blocks' event for the renderer
    });
  }

  return {
    reset() { lastTick = -1; lastSeq = 0; applied = 0; },

    apply(world, snap, localId) {
      const replay = [];
      if (!snap || typeof snap.t !== 'number' || snap.t <= lastTick) return replay;
      lastTick = snap.t;
      const [time, timeLeft, status, kills, waveNo, nextT, claimed, baseIndex, weather, outcome, queued] = snap.g;
      world.tick = snap.t;
      world.time = time / 100;
      world.timeLeft = timeLeft / 100;
      world.kills = kills;
      world.waves.number = waveNo;
      world.waves.nextT = nextT < 0 ? null : nextT / 10;
      world.waves.queued = queued || 0;   // attackers waiting to come in (host only knows who)
      world.outcome = outcome ? STATUS[outcome] : null;
      if (claimed && !world.base.claimed) {
        if (baseIndex >= 0) claimBase(world, baseIndex, true);
        else world.base.claimed = true;
      }
      (weather || []).forEach((v, i) => {
        const z = world.weather[i];
        if (!z) return;
        z.active = v >= 0; z.intensity = Math.max(0, v) / 100;
      });

      for (const row of snap.p || []) {
        const [id, x, y, z, yaw, pitch, hp, armour, flags, downT, active, slots, reserve, reloadT, swapT, carrying, ctx, bloom, stats, grenades, throwT, streak, designating] = row;
        const p = world.players.find(q => q.id === id);
        if (!p) continue;
        const mine = id === localId;
        const far = Math.hypot(x / 100 - p.x, z / 100 - p.z) > 3;
        if (!mine || far || !(flags & 1) || (flags & 2)) { p.x = x / 100; p.y = y / 100; p.z = z / 100; }
        if (!mine) { p.yaw = yaw / 1000; p.pitch = pitch / 1000; p.moving = !!(flags & 4); p.ads = !!(flags & 8); }
        p.hp = hp; p.armour = armour;
        p.alive = !!(flags & 1); p.downed = !!(flags & 2); p.downT = downT / 10;
        p.active = active;
        p.slots = slots.split('|').map(s => {
          if (!s) return null;
          const [w, mag] = s.split(':');
          return { w: weaponIds[Number(w)], mag: Number(mag) };
        });
        p.reserve = {};
        for (const part of reserve ? reserve.split('|') : []) { const [c, n] = part.split('='); p.reserve[c] = Number(n); }
        p.reloadT = reloadT / 100; p.swapT = swapT / 100;
        p.carrying = !carrying ? null : carrying.startsWith('turret:') ? { item: 'turret', turret: carrying.slice(7) }
          : { item: carrying, origin: { x: 0, y: 0, z: 0 } };
        if (ctx) { const [kind, label] = ctx.split('|'); p.context = { kind, label }; } else p.context = null;
        p.bloom = bloom / 1000;
        const [shots, hits, k] = stats.split('|').map(Number);
        p.stats = { shots, hits, kills: k };
        p.grenades = grenades || 0; p.throwT = (throwT || 0) / 100;
        p.streak = streak || 0; p.designating = !!designating;
      }

      const byId = new Map(world.enemies.map(e => [e.id, e]));
      world.enemies = (snap.n || []).map(row => {
        const [id, x, y, z, yaw, pitch, armour, state, w, flags, animT, deadT, ti] = row;
        const e = byId.get(id) || { id, kind: 'enemy', type: enemyIds[ti] || 'insurgent', weapon: { w: weaponIds[w], mag: 1 }, hp: 100 };
        Object.assign(e, {
          x: x / 100, y: y / 100, z: z / 100, yaw: yaw / 1000, pitch: pitch / 1000, armour, state: STATES[state] || 'idle',
          alive: !!(flags & 1), moving: !!(flags & 2), aiming: !!(flags & 4), wave: !!(flags & 8),
          animT: animT / 10, deadT: deadT / 10
        });
        e.weapon.w = weaponIds[w];
        return e;
      });

      if (snap.x && world.blast) { world.blast.state = snap.x[0] ? 'siren' : 'idle'; world.blast.readyAt = snap.x[1] / 100; }
      if (snap.r) {
        world.turrets = snap.r.map(([id, x, y, z, yaw, pitch, hp, armour, alive, owner, type, deadT]) => ({
          id, kind: 'turret', type, owner, x: x / 100, y: y / 100, z: z / 100, yaw: yaw / 1000, pitch: pitch / 1000,
          hp, armour, alive: !!alive, downed: false, deadT: deadT / 10
        }));
      }

      world.projectiles = (snap.b || []).map(([id, x, y, z, vx, vy, vz, team, kind]) => ({
        id, x: x / 100, y: y / 100, z: z / 100, vx, vy, vz, team: team ? 'enemy' : 'player', kind: PROJ[kind] || 'bullet'
      }));

      if (snap.k) {
        world.pickups = snap.k.map(([id, type, x, y, z, extra, n]) => {
          const t = PICKUP_TYPES[type];
          const pk = { id, type: t, x: x / 100, y: y / 100, z: z / 100 };
          if (t === 'weapon') { pk.weapon = weaponIds[extra]; pk.mag = n; }
          else if (t === 'ammo') { pk.calibre = extra; pk.amount = n; }
          else if (t === 'item') pk.item = extra;
          else pk.amount = extra;
          return pk;
        });
      }

      // breakages first, then the host's builds and base breakages in their order, then
      // breakages again (pieces that were built and broken since)
      if (snap.d) applyBroken(world, snap.d);
      if (typeof snap.u === 'string') {
        const log = snap.u ? snap.u.split(',') : [];
        for (; applied < log.length; applied++) {
          const tok = log[applied];
          if (tok[0] === 'b' || tok[0] === 'u') replayBlast(world, tok);   // mine blasts and rockfalls
          else if (tok[0] === '-') {
            const p = world.pieces[world.basePieceCount + Number(tok.slice(1)) - 1];
            if (p && p.alive) destroyPiece(world, p);
          } else {
            const [i, lv] = tok.split('.').map(Number);
            if (upgradeIds[i]) applyUpgrade(world, upgradeIds[i], lv);
          }
        }
        if (snap.d) applyBroken(world, snap.d);
      }

      for (const ev of snap.e || []) {
        if (ev.q <= lastSeq) continue;
        lastSeq = ev.q;
        const copy = { ...ev };
        delete copy.q; delete copy.k;
        replay.push(copy);
      }
      if (STATUS[status] !== world.status) world.status = STATUS[status];
      return replay;
    }
  };
}
