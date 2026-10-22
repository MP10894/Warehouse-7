// Draws enemies, barrels and pickups by reading the world state each frame.
// Meshes are created and removed to match whatever exists in the world, so this works
// the same whether the world was simulated here or received from a co-op host.
import * as THREE from 'three';

const enemyGeo = new THREE.PlaneGeometry(1.1, 1.833);
const pickupGeo = new THREE.PlaneGeometry(0.6, 0.6);
const barrelGeo = new THREE.CylinderGeometry(.45, .45, 1.2, 10);

export function enemyFrame(e) {
  if (e.state === 'dead') return 'dead';
  if (e.state === 'pain') return 'pain';
  if (e.state === 'aim') return 'aim';
  if (e.state === 'fire') return 'fire';
  return e.moving && (e.animT % .5) > .25 ? 'walk1' : 'walk0';
}

export function createEntityViews(scene, assets, level) {
  const views = new Map(); // world entity id → mesh

  function get(id, make) {
    let m = views.get(id);
    if (!m) { m = make(); scene.add(m); views.set(id, m); }
    return m;
  }

  function faceCamera(m, camera) {
    m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
  }

  return {
    reset() {
      for (const m of views.values()) scene.remove(m);
      views.clear();
    },

    sync(world, camera, flashing) {
      const seen = new Set();

      for (const e of world.enemies) {
        seen.add(e.id);
        const m = get(e.id, () => new THREE.Mesh(enemyGeo, new THREE.MeshBasicMaterial({ map: assets.frames.walk0, transparent: true, alphaTest: .5 })));
        m.position.set(e.x, .915, e.z);
        faceCamera(m, camera);
        const tex = assets.frames[enemyFrame(e)];
        if (m.material.map !== tex) m.material.map = tex;
        const near = Math.hypot(camera.position.x - e.x, camera.position.z - e.z) < 10;
        const L = level.lightAt(e.x, e.z);
        const fb = 1 + (flashing && near && e.state !== 'dead' ? .5 : 0) + (e.state === 'fire' ? .4 : 0);
        m.material.color.setRGB(Math.min(1.6, L[0] * fb + .05), Math.min(1.6, L[1] * fb + .05), Math.min(1.6, L[2] * fb + .05));
      }

      for (const b of world.barrels) {
        if (!b.alive) continue;
        seen.add(b.id);
        const m = get(b.id, () => {
          const mesh = new THREE.Mesh(barrelGeo, new THREE.MeshBasicMaterial({ map: assets.level.barrel }));
          const L = level.lightAt(b.x, b.z);
          mesh.material.color.setRGB(L[0], L[1], L[2]);
          return mesh;
        });
        m.position.set(b.x, .6, b.z);
      }

      for (const p of world.pickups) {
        if (p.taken) continue;
        seen.add(p.id);
        const m = get(p.id, () => new THREE.Mesh(pickupGeo, new THREE.MeshBasicMaterial({ map: assets.pickups[p.type], transparent: true, alphaTest: .5 })));
        m.position.set(p.x, .32 + Math.sin(world.time * 3 + p.id) * .05, p.z);
        faceCamera(m, camera);
        const L = level.lightAt(p.x, p.z);
        m.material.color.setRGB(L[0] + .15, L[1] + .15, L[2] + .15);
      }

      // Other players would be drawn here once co-op exists (a friendly soldier sprite per player).

      for (const [id, m] of views) {
        if (!seen.has(id)) { scene.remove(m); views.delete(id); }
      }
    }
  };
}
