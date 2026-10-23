// The armoury panel: opens when you press the use button at a built ammunition supply.
// It lists the weapons the supply hands out (upgrades.csv → unlocks), which locker level
// each needs, and which you already carry. Picking one asks the game (host) to swap it in;
// the panel never changes the world itself. Closes when you walk away.
// Keys on a computer: 1–3 to pick, E or Esc to close.
import { armouryWeapons } from '../sim/base.js';

/** Every weapon any upgrade can unlock, with the upgrade id and level that unlocks it. */
function offers(world) {
  const out = [];
  for (const [id, def] of Object.entries(world.data.upgrades)) {
    def.levels.forEach((row, i) => {
      for (const w of String(row.unlocks || '').split(/[\s;,]+/)) {
        if (w && world.data.weapons[w] && !out.some(o => o.weapon === w)) out.push({ weapon: w, upgrade: id, level: i + 1 });
      }
    });
  }
  return out;
}

export function createArmoury({ root, onPick }) {
  const panel = document.createElement('section');
  panel.id = 'armoury';
  panel.hidden = true;
  panel.innerHTML = '<header><b>ARMOURY</b><span>Swap the weapon in your hands</span><button type="button" class="x" aria-label="Close">✕</button></header><div class="list"></div>';
  root.appendChild(panel);
  const list = panel.querySelector('.list');
  let open = false, shown = '', items = [];

  const close = () => { open = false; panel.hidden = true; shown = ''; };
  panel.querySelector('.x').addEventListener('pointerdown', e => { e.stopPropagation(); close(); });
  // taps on the panel must not reach the look / fire controls underneath
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart']) panel.addEventListener(t, e => e.stopPropagation());

  const pick = i => {
    const it = items[i];
    if (!it || it.state !== 'ready') return;
    onPick(it.weapon);
    close();
  };
  list.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-i]');
    if (b) { e.preventDefault(); pick(Number(b.dataset.i)); }
  });
  window.addEventListener('keydown', e => {
    if (!open) return;
    if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyF') { close(); e.stopPropagation(); return; }
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
    if (n >= 0) { pick(n); e.stopPropagation(); }
  }, true);

  function render(world, p) {
    const ready = armouryWeapons(world);
    const owned = new Set(p.slots.filter(Boolean).map(s => s.w));
    items = offers(world).map(o => ({ ...o, state: owned.has(o.weapon) ? 'owned' : ready.includes(o.weapon) ? 'ready' : 'locked' }));
    const key = items.map(i => i.weapon + i.state).join() + '|' + (p.slots[p.active]?.w || '');
    if (key === shown) return;
    shown = key;
    const hands = p.slots[p.active] ? world.data.weapons[p.slots[p.active].w].name : '';
    const free = p.slots.some(s => !s);
    panel.querySelector('header span').textContent = free ? 'Takes your empty slot' : `Leaves your ${hands} beside the locker`;
    list.innerHTML = items.map((it, i) => {
      const w = world.data.weapons[it.weapon];
      const note = it.state === 'owned' ? 'CARRIED' : it.state === 'locked' ? `LOCKER LEVEL ${it.level}` : 'TAKE';
      return `<button type="button" data-i="${i}" class="${it.state}"${it.state === 'ready' ? '' : ' disabled'}>` +
        `<b>${w.name}</b><span>${w.calibre} · ${w.mag_size} rounds</span><em><kbd>${i + 1}</kbd>${note}</em></button>`;
    }).join('');
  }

  return {
    get isOpen() { return open; },
    toggle(world, p) {
      if (open) { close(); return; }
      open = true; panel.hidden = false; shown = '';
      if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
      render(world, p);
    },
    close,
    /** Every frame: keep the list current, and close once you leave the locker. */
    update(world, p) {
      if (!open) return;
      if (!p || !p.alive || p.downed || !p.context || p.context.kind !== 'armoury') { close(); return; }
      render(world, p);
    }
  };
}
