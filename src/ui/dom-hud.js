// The text parts of the HUD: health and armour, clock and waves, objective, weapon and
// ammunition, carried item, the context button label, pop-up messages and screen tints.
// Reads the world; never changes it.
export const fmtTime = t => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

export function createDomHud() {
  const $ = id => document.getElementById(id);
  const el = {
    hpFill: $('hpFill'), hpNum: $('hpNum'), arFill: $('arFill'), arNum: $('arNum'), hpBar: $('hpFill').parentElement.parentElement,
    clock: $('clock'), waveLine: $('waveLine'), goalLine: $('goalLine'), carry: $('carry'),
    wName: $('wName'), wMag: $('wMag'), wRes: $('wRes'), wAmmo: $('wAmmo'), wOther: $('wOther'),
    ctx: $('context'), hurt: $('hurt'), storm: $('storm'), toast: $('toast')
  };
  let toastT = 0, hurtA = 0;
  const cache = {};
  const set = (k, node, prop, v) => { if (cache[k] !== v) { cache[k] = v; node[prop] = v; } };

  function goal(world, p) {
    const b = world.base, goals = world.data.levels[world.levelId].goals || {};
    if (!b.claimed) return goals.claim || `Clear the ${b.name.toLowerCase()} to claim a base`;
    if (p.carrying) return 'Take the crate to the build spot in your base';
    if (b.upgrades.walls.level === 0) return goals.fetch || 'Fetch the construction crate';
    return `Hold out until the timer runs out · walls level ${b.upgrades.walls.level}`;
  }

  return {
    toast(text) { el.toast.textContent = text; el.toast.style.opacity = 1; toastT = 1.6; },
    handle(ev, localId) {
      if (ev.type === 'message' && (!ev.playerId || ev.playerId === localId)) this.toast(ev.text);
      if (ev.type === 'hurt' && ev.targetId === localId) hurtA = Math.min(1, hurtA + 0.45);
    },
    frame(dt, world, p, storm) {
      const s = world.data.settings.player;
      set('hp', el.hpNum, 'textContent', String(Math.max(0, Math.ceil(p.hp))));
      set('hpw', el.hpFill.style, 'width', `${Math.max(0, p.hp) / s.max_health * 100}%`);
      set('ar', el.arNum, 'textContent', String(Math.ceil(p.armour)));
      set('arw', el.arFill.style, 'width', `${p.armour / s.max_armour * 100}%`);
      el.hpBar.classList.toggle('low', p.hp <= 30);

      const w = world.waves, running = world.base.claimed;
      set('clock', el.clock, 'textContent', fmtTime(world.timeLeft));
      el.clock.classList.toggle('urgent', running && world.timeLeft < 30);
      el.clock.classList.toggle('waiting', !running);
      const attackers = world.enemies.filter(e => e.alive && e.wave).length;
      set('wave', el.waveLine, 'textContent', !running || w.nextT === null ? 'Clock starts when you secure a base'
        : attackers > 0 ? `Wave ${w.number}: ${attackers} attacker${attackers === 1 ? '' : 's'} left` : `Wave ${w.number + 1} in ${fmtTime(w.nextT - world.time)}`);
      set('goal', el.goalLine, 'textContent', p.downed ? 'You are down — your partner can revive you' : goal(world, p));
      el.carry.hidden = !p.carrying;

      const slot = p.slots[p.active];
      if (slot) {
        const def = world.data.weapons[slot.w];
        set('wn', el.wName, 'textContent', p.reloadT > 0 ? `${def.name} — reloading` : `${def.name} · ${def.fire_mode === 'auto' ? 'auto' : 'semi'}`);
        set('wm', el.wMag, 'textContent', String(slot.mag));
        set('wr', el.wRes, 'textContent', `/ ${p.reserve[def.calibre] || 0}`);
        el.wAmmo.classList.toggle('empty', slot.mag === 0);
      }
      const other = p.slots[1 - p.active];
      set('wo', el.wOther, 'textContent', other ? `next: ${world.data.weapons[other.w].name}` : 'second slot empty');

      const ctx = p.context;
      el.ctx.hidden = !ctx;
      if (ctx) set('ctx', el.ctx, 'textContent', ctx.label);

      hurtA = Math.max(0, hurtA - dt * 1.2);
      el.hurt.style.opacity = !p.alive ? 0.7 : p.downed ? 0.55 : hurtA;
      el.storm.style.opacity = storm;
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.style.opacity = 0; }
    }
  };
}
