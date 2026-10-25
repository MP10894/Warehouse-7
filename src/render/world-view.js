// Draws the moving parts of the world each frame by reading the simulation state:
// soldiers, pickups, bullets and rockets. Meshes are created and removed to match the
// world, so this works the same whether the world was simulated here or received
// from a co-op host.
import * as THREE from 'three';
import { soldierModel, setSoldierWeapon, poseSoldier, pickupModel, rocketModel, grenadeModel, turretModel } from './models.js';
import { placementFor } from '../sim/turrets.js';

const MAX_TRACERS = 256;

export function createWorldView(scene, tex, initialLocalId) {
  let localId = initialLocalId;
  const actors = new Map();   // actor id → { model, flinch }
  const pickups = new Map();  // pickup id → group
  const rockets = new Map();
  const turrets = new Map();  // turret id → model
  const ghosts = new Map();   // player id → see-through turret showing where theirs would go
  // see-through: green where it can go, red where it can't
  const ghostMat = {
    ok: new THREE.MeshBasicMaterial({ color: 0x6fe08a, transparent: true, opacity: 0.45, depthWrite: false }),
    bad: new THREE.MeshBasicMaterial({ color: 0xe0574a, transparent: true, opacity: 0.45, depthWrite: false })
  };
  const charred = new THREE.MeshLambertMaterial({ color: 0x1c1b19, flatShading: true });
  const paint = (root, mat) => root.traverse(o => { if (o.isMesh) o.material = mat; });

  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(MAX_TRACERS * 6);
  const tracerCol = new Float32Array(MAX_TRACERS * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
  const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, fog: false }));
  tracers.frustumCulled = false;
  scene.add(tracers);

  function actorView(a) {
    let v = actors.get(a.id);
    if (!v) {
      v = { model: soldierModel(a.kind === 'player' ? 'player' : 'enemy', a.type), flinch: 0 };
      scene.add(v.model.root);
      actors.set(a.id, v);
    }
    return v;
  }

  return {
    setLocal(id) { localId = id; },
    reset() {
      for (const v of actors.values()) scene.remove(v.model.root);
      for (const g of pickups.values()) scene.remove(g);
      for (const r of rockets.values()) scene.remove(r);
      for (const t of turrets.values()) scene.remove(t.root);
      for (const g of ghosts.values()) scene.remove(g.root);
      actors.clear(); pickups.clear(); rockets.clear(); turrets.clear(); ghosts.clear();
    },

    handle(ev) {
      if (ev.type === 'hurt') { const v = actors.get(ev.targetId); if (v) v.flinch = 1; }
      if (ev.type === 'shot' && ev.team === 'turret') { const t = turrets.get(ev.actorId); if (t) t.spin = 1; }
    },

    sync(world, dt) {
      const seen = new Set();
      for (const a of [...world.enemies, ...world.players]) {
        if (a.id === localId) continue; // you don't see your own body
        seen.add(a.id);
        const v = actorView(a);
        const m = v.model;
        const gun = a.kind === 'enemy' ? a.weapon.w : (a.slots[a.active] && a.slots[a.active].w);
        // a suicide bomber carries no gun (his "weapon" is the vest)
        const thrown = gun && world.data.weapons[gun] && world.data.weapons[gun].projectile === 'grenade';
        if (gun && !thrown) setSoldierWeapon(m, gun);
        const hauling = !!(a.carrying && a.carrying.turret);   // both hands on a turret: no gun
        if (m.bombVest) { const l = m.bombVest.getObjectByName('bomb_light'); if (l) l.visible = a.alive && Math.floor(world.time * (a.moving ? 6 : 2)) % 2 === 0; }
        if (m.gun) m.gun.visible = a.alive && !hauling;
        m.root.position.set(a.x, a.y, a.z);
        m.root.rotation.y = a.yaw;
        v.flinch = Math.max(0, v.flinch - dt * 5);
        poseSoldier(m, {
          moving: a.moving, animT: a.animT ?? world.time, aiming: a.kind === 'enemy' ? a.aiming : true,
          pitch: a.pitch, dead: !a.alive, deadT: a.deadT ?? 1, downed: a.downed, flinch: v.flinch, armour: a.armour
        });
      }
      for (const [id, v] of actors) if (!seen.has(id)) { scene.remove(v.model.root); actors.delete(id); }

      // turrets: the head turns, the gun tips, the barrels spin while firing; a wreck is charred
      const seenT = new Set();
      for (const t of world.turrets || []) {
        seenT.add(t.id);
        let v = turrets.get(t.id);
        if (!v) { v = { ...turretModel(), spin: 0, dead: false }; scene.add(v.root); turrets.set(t.id, v); }
        v.root.position.set(t.x, t.y, t.z);
        v.head.rotation.y = t.yaw;
        v.gun.rotation.x = t.pitch;
        v.spin = Math.max(0, v.spin - dt * 1.5);
        if (v.barrels) v.barrels.rotation.z += v.spin * dt * 40;
        if (!t.alive && !v.dead) { v.dead = true; paint(v.root, charred); }
        if (v.dead) { const k = Math.min(1, (t.deadT || 0) * 4); v.root.rotation.z = k * 0.35; v.gun.rotation.x = -0.5 * k; }
      }
      for (const [id, v] of turrets) if (!seenT.has(id)) { scene.remove(v.root); turrets.delete(id); }

      // a carried turret: shown see-through where DROP would put it
      const seenG = new Set();
      for (const p of world.players) {
        if (!p.alive || p.downed || !p.carrying || !p.carrying.turret) continue;
        seenG.add(p.id);
        let g = ghosts.get(p.id);
        if (!g) { g = { ...turretModel(), ok: null }; g.root.traverse(o => { if (o.isMesh) o.renderOrder = 2; }); scene.add(g.root); ghosts.set(p.id, g); }
        const at = placementFor(world, p);
        if (g.ok !== at.ok) { g.ok = at.ok; paint(g.root, at.ok ? ghostMat.ok : ghostMat.bad); }
        g.root.position.set(at.x, at.y, at.z);
        g.head.rotation.y = p.yaw;
        g.gun.rotation.x = 0;
      }
      for (const [id, g] of ghosts) if (!seenG.has(id)) { scene.remove(g.root); ghosts.delete(id); }

      const seenP = new Set();
      for (const pk of world.pickups) {
        seenP.add(pk.id);
        let g = pickups.get(pk.id);
        if (!g) { g = pickupModel(pk, tex); scene.add(g); pickups.set(pk.id, g); }
        g.position.set(pk.x, pk.y + 0.02 + (pk.type === 'item' ? 0 : Math.sin(world.time * 2 + pk.id) * 0.03), pk.z);
        if (pk.type !== 'item') g.rotation.y = world.time * 0.8 + pk.id;
      }
      for (const [id, g] of pickups) if (!seenP.has(id)) { scene.remove(g); pickups.delete(id); }

      // bullets as short glowing streaks; rockets as small models
      let n = 0;
      const seenR = new Set();
      for (const pr of world.projectiles) {
        if (pr.kind === 'grenade') {
          seenR.add(pr.id);
          let r = rockets.get(pr.id);
          if (!r) { r = grenadeModel(); scene.add(r); rockets.set(pr.id, r); }
          r.position.set(pr.x, pr.y + 0.04, pr.z);
          const sp = Math.hypot(pr.vx, pr.vy, pr.vz);
          r.rotation.x += sp * dt * 0.8; r.rotation.z += sp * dt * 0.5;   // tumbling in flight
          continue;
        }
        if (pr.kind === 'rocket') {
          seenR.add(pr.id);
          let r = rockets.get(pr.id);
          if (!r) { r = rocketModel(); scene.add(r); rockets.set(pr.id, r); }
          r.position.set(pr.x, pr.y, pr.z);
          r.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
          if (!r.userData.art) r.rotateX(Math.PI / 2);   // (the code-drawn cone is built along y)
          continue;
        }
        if (n >= MAX_TRACERS) continue;
        const sp = Math.hypot(pr.vx, pr.vy, pr.vz) || 1;
        const len = Math.min(2.2, sp * 0.012);
        const i = n * 6;
        tracerPos[i] = pr.x; tracerPos[i + 1] = pr.y; tracerPos[i + 2] = pr.z;
        tracerPos[i + 3] = pr.x - pr.vx / sp * len; tracerPos[i + 4] = pr.y - pr.vy / sp * len; tracerPos[i + 5] = pr.z - pr.vz / sp * len;
        const c = pr.team === 'enemy' ? [1, 0.45, 0.2] : [1, 0.9, 0.5];
        tracerCol.set([...c, c[0] * 0.4, c[1] * 0.4, c[2] * 0.4], i);
        n++;
      }
      for (const [id, r] of rockets) if (!seenR.has(id)) { scene.remove(r); rockets.delete(id); }
      tracerGeo.setDrawRange(0, n * 2);
      tracerGeo.attributes.position.needsUpdate = true;
      tracerGeo.attributes.color.needsUpdate = true;
    }
  };
}
