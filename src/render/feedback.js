// "Game feel" for the local player: recoil, muzzle flash, screen shake, damage flash,
// hit marker and weapon bob. Driven only by events about this player, so in co-op
// each device shows its own player's feedback.
export function createFeedback() {
  const f = { recoil: 0, flashT: 0, shake: 0, hurt: 0, hitMarkT: 0, bobT: 0 };
  return {
    state: f,
    reset() { Object.assign(f, { recoil: 0, flashT: 0, shake: 0, hurt: 0, hitMarkT: 0, bobT: 0 }); },
    get flashing() { return f.flashT > 0; },

    handle(ev, localId) {
      const mine = ev.playerId === localId;
      if (ev.type === 'shot' && mine) { f.recoil = 1; f.flashT = .06; }
      else if (ev.type === 'explosion') { f.shake = Math.max(f.shake, .5); f.flashT = .12; }
      else if (ev.type === 'playerHurt' && mine) { f.hurt = Math.min(1, f.hurt + .55); f.shake = Math.max(f.shake, .15); }
      else if (ev.type === 'hitConfirm' && mine) { f.hitMarkT = .12; }
    },

    update(dt, player) {
      f.shake = Math.max(0, f.shake - dt * 1.6);
      f.recoil = Math.max(0, f.recoil - dt * 9);
      f.flashT -= dt;
      f.hitMarkT -= dt;
      f.hurt = Math.max(0, f.hurt - dt * 1.4);
      if (player && player.moving) f.bobT += dt * 9;
    }
  };
}
