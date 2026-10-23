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
    ctx: $('context'), hurt: $('hurt'), storm: $('storm'), toast: $('toast'), gren: $('grenade'), grenN: $('grenadeN')
  };
  let toastT = 0, hurtA = 0;
  const cache = {};
  const set = (k, node, prop, v) => { if (cache[k] !== v) { cache[k] = v; node[prop] = v; } };

  function goal(world, p) {
    const b = world.base, goals = world.data.levels[world.levelId].goals || {};
    if (!b.claimed) return goals.claim || `Clear the ${b.name.toLowerCase()} to claim a base`;
    if (p.carrying) return `Take the ${p.carrying.item.replace(/_/g, ' ')} to its build spot in your base`;
    const ups = Object.entries(b.upgrades).filter(([id]) => b.buildSpots.some(s => s.upgrade === id));
    if (ups.every(([, u]) => u.level === 0)) return goals.fetch || 'Fetch a crate and build an upgrade';
    const short = { walls: 'walls', ammo: 'ammo', medical: 'first aid', armour: 'armour' };
    return 'Hold out · ' + ups.map(([id, u]) => `${short[id] || id} ${u.level}/${world.data.upgrades[id].levels.length}`).join(' · ');
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
      const attackers = world.enemies.filter(e => e.alive && e.wave).length + (w.queued ?? w.queue.length);
      set('wave', el.waveLine, 'textContent', !running ? 'Clock starts when you secure a base'
        : w.nextT !== null ? `Wave ${w.number + 1} in ${fmtTime(Math.max(0, w.nextT - world.time))}`
        : `Wave ${w.number}: ${attackers} attacker${attackers === 1 ? '' : 's'} left`);
      set('goal', el.goalLine, 'textContent', p.downed ? 'You are down — your partner can revive you' : goal(world, p));
      el.carry.hidden = !p.carrying;
      if (p.carrying) set('carry', el.carry, 'textContent', `Carrying: ${p.carrying.item.replace(/_/g, ' ')} (slow)`);

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

      // grenade button: only while you have grenades; dimmed while you can't throw
      const gn = p.alive && !p.downed ? (p.grenades || 0) : 0;
      el.gren.hidden = gn <= 0;
      if (gn > 0) {
        set('gn', el.grenN, 'textContent', String(gn));
        el.gren.classList.toggle('wait', p.throwT > 0 || p.reloadT > 0 || p.swapT > 0);
      }

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
