// Short-lived visual effects (dust, blood, sparks, explosions) triggered by world events.
import * as THREE from 'three';

const POOL = 40;

export function createEffects(scene, assets) {
  const fx = assets.fx;
  const particles = [];
  for (let i = 0; i < POOL; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.dust, transparent: true, depthWrite: false }));
    sp.visible = false;
    scene.add(sp);
    particles.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, size: 0 });
  }
  let next = 0;
  const r = () => Math.random() - .5;

  function emit(tex, x, y, z, size, life, vx = 0, vy = 0, vz = 0, grow = 0) {
    const p = particles[next++ % POOL];
    p.sp.material.map = tex;
    p.sp.material.opacity = 1;
    p.sp.position.set(x, y, z);
    p.sp.scale.set(size, size, 1);
    p.sp.visible = true;
    Object.assign(p, { life, max: life, vx, vy, vz, grow, size });
  }

  return {
    reset() { for (const p of particles) { p.life = 0; p.sp.visible = false; } },

    handle(ev) {
      if (ev.type === 'impact' && ev.kind === 'wall') {
        const o = .05;
        emit(fx.dust, ev.x + ev.nx * o, ev.y + ev.ny * o, ev.z + ev.nz * o, .22, .45, ev.nx, .6, ev.nz, .3);
        emit(fx.spark, ev.x, ev.y, ev.z, .08, .15);
      } else if (ev.type === 'impact' && ev.kind === 'flesh') {
        for (let i = 0; i < 4; i++) emit(fx.blood, ev.x, ev.y, ev.z, .14, .4, r() * 2, Math.random() * 2, r() * 2);
      } else if (ev.type === 'explosion') {
        emit(fx.boom, ev.x, 1, ev.z, .6, .5, 0, .6, 0, 4.2);
        emit(fx.boom, ev.x + .3, 1.4, ev.z - .2, .4, .4, 0, 1, 0, 3);
        for (let i = 0; i < 8; i++) emit(fx.spark, ev.x, 1, ev.z, .18, .5 + Math.random() * .3, r() * 8, 2 + Math.random() * 4, r() * 8);
      }
    },

    update(dt) {
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.sp.visible = false; continue; }
        p.sp.position.x += p.vx * dt;
        p.sp.position.y += p.vy * dt;
        p.sp.position.z += p.vz * dt;
        if (!p.grow) p.vy -= 3 * dt;
        const k = p.life / p.max;
        p.sp.material.opacity = Math.min(1, k * 1.6);
        if (p.grow) { const s = p.size + p.grow * (1 - k); p.sp.scale.set(s, s, 1); }
      }
    }
  };
}
