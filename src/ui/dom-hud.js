// The text parts of the HUD (health, ammo, hostiles, timer), pop-up messages and the
// red damage vignette. Reads the world; never changes it.
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export { fmtTime };

export function createDomHud() {
  const el = id => document.getElementById(id);
  const sHp = el('sHp'), sAmmo = el('sAmmo'), sFoes = el('sFoes'), sTime = el('sTime');
  const stHp = el('stHp'), stAmmo = el('stAmmo'), hurtEl = el('hurt'), toastEl = el('toast');
  let toastT = 0, last = '';

  function toast(text) {
    toastEl.textContent = text;
    toastEl.style.opacity = 1;
    toastT = 1.1;
  }

  return {
    toast,
    handle(ev, localId) {
      if (ev.type === 'message' && (!ev.playerId || ev.playerId === localId)) toast(ev.text);
    },
    frame(dt, world, player, feedback) {
      const key = `${player.hp}|${player.ammo}|${world.total - world.kills}|${Math.floor(world.time)}`;
      if (key !== last) {
        last = key;
        sHp.textContent = player.hp;
        sAmmo.textContent = player.ammo;
        sFoes.textContent = world.total - world.kills;
        sTime.textContent = fmtTime(world.time);
        stHp.classList.toggle('low', player.hp <= 30);
        stAmmo.classList.toggle('low', player.ammo <= 15);
      }
      hurtEl.style.opacity = player.alive ? feedback.state.hurt : .7;
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.opacity = 0; }
    }
  };
}
