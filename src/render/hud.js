// The low-resolution overlay drawn on top of the 3D view: weapon, muzzle flash, crosshair.
export function drawHud(ctx, W, H, player, feedback, weaponArt) {
  const f = feedback.state;
  ctx.clearRect(0, 0, W, H);
  if (!player) return;
  const k = Math.max(1, H / 175);
  const bob = player.moving ? Math.sin(f.bobT) : 0;
  const bx = Math.cos(f.bobT * .5) * (player.moving ? 4 : 0);
  const gx = Math.round(W / 2 - 32 * k + W * .07 + bx * k);
  const gy = Math.round(H - 52 * k + Math.abs(bob) * 3 * k + f.recoil * 5 * k + (player.alive ? 0 : 40 * k));
  if (f.flashT > 0 && player.alive && f.recoil > .3) ctx.drawImage(weaponArt.flash, gx + 20 * k, gy - 15 * k, 24 * k, 20 * k);
  ctx.drawImage(weaponArt.gun, gx, gy, 64 * k, 60 * k);

  const cx = W >> 1, cy = H >> 1;
  ctx.fillStyle = f.hitMarkT > 0 ? '#ff5a3c' : 'rgba(240,162,58,.9)';
  ctx.fillRect(cx - 5, cy, 3, 1); ctx.fillRect(cx + 3, cy, 3, 1);
  ctx.fillRect(cx, cy - 5, 1, 3); ctx.fillRect(cx, cy + 3, 1, 3);
  if (f.hitMarkT > 0) {
    for (let i = 2; i < 5; i++) {
      ctx.fillRect(cx - i, cy - i, 1, 1); ctx.fillRect(cx + i, cy - i, 1, 1);
      ctx.fillRect(cx - i, cy + i, 1, 1); ctx.fillRect(cx + i, cy + i, 1, 1);
    }
  }
}
