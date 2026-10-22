// Low-poly models built from boxes, PS1 style: weapons, soldiers, pickups.
// A soldier is made of rigid parts (head, torso, limbs) that are rotated to animate,
// so no skeleton or rigging is needed. Each soldier is about 250 triangles including
// the gun. Real art can replace these part by part later.
import * as THREE from 'three';

const matCache = new Map();
export function lambert(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  return matCache.get(hex);
}
const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w},${h},${d}`;
  if (!boxGeoCache.has(k)) boxGeoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxGeoCache.get(k);
}
export function box(w, h, d, hex, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(boxGeo(w, h, d), lambert(hex));
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------- weapons (barrel points along −z, origin at the grip) ----------
export function weaponModel(id) {
  const g = new THREE.Group();
  const black = 0x2a2a28, grey = 0x4a4a46, wood = 0x7a4724, tan = 0x8c7a58, olive = 0x4d5233;
  if (id === 'sig_p320') {
    box(0.032, 0.035, 0.19, grey, 0, 0.055, -0.05, g);
    const grip = box(0.03, 0.11, 0.05, black, 0, 0, 0.02, g); grip.rotation.x = 0.25;
  } else if (id === 'm4a1') {
    box(0.05, 0.075, 0.3, black, 0, 0.05, -0.08, g);
    box(0.045, 0.06, 0.2, tan, 0, 0.05, -0.33, g);
    box(0.018, 0.018, 0.16, black, 0, 0.055, -0.5, g);
    box(0.045, 0.07, 0.22, black, 0, 0.03, 0.17, g);
    box(0.03, 0.11, 0.06, black, 0, -0.04, -0.12, g).rotation.x = 0.15;
    box(0.035, 0.04, 0.1, grey, 0, 0.11, -0.1, g);
    box(0.03, 0.08, 0.04, black, 0, -0.03, 0.0, g);
  } else if (id === 'ak47') {
    box(0.05, 0.07, 0.3, black, 0, 0.05, -0.08, g);
    box(0.055, 0.05, 0.18, wood, 0, 0.045, -0.3, g);
    box(0.016, 0.016, 0.2, black, 0, 0.065, -0.47, g);
    box(0.045, 0.08, 0.25, wood, 0, 0.02, 0.17, g).rotation.x = -0.12;
    box(0.032, 0.15, 0.06, 0x2a2420, 0, -0.06, -0.13, g).rotation.x = 0.35;
    box(0.03, 0.08, 0.04, wood, 0, -0.03, 0.0, g);
  } else if (id === 'rpg7') {
    box(0.065, 0.065, 0.95, olive, 0, 0.07, -0.05, g);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 6), lambert(0x4e5a3a));
    head.rotation.x = -Math.PI / 2; head.position.set(0, 0.07, -0.65); g.add(head);
    box(0.04, 0.1, 0.04, wood, 0, -0.01, -0.15, g);
    box(0.04, 0.1, 0.04, wood, 0, -0.01, 0.08, g);
  } else {
    box(0.05, 0.07, 0.4, black, 0, 0.05, -0.1, g);
  }
  return g;
}

/** Where the barrel ends, in the weapon model's own coordinates. */
export const MUZZLE = { sig_p320: [0, 0.06, -0.15], m4a1: [0, 0.055, -0.6], ak47: [0, 0.065, -0.58], rpg7: [0, 0.07, -0.8] };

// ---------- soldiers ----------
export const THIRD_PERSON_GUN_SCALE = 1.4;

const PALETTES = {
  enemy: { cloth: 0x6f6a4c, clothDark: 0x4d4a35, wrap: 0xb39b70, skin: 0x8c6448, boots: 0x2a241c, vest: 0x3e4130 },
  player: { cloth: 0x8296a4, clothDark: 0x627683, wrap: 0x56634a, skin: 0xb08566, boots: 0x2a2620, vest: 0x46553f }
};

export function soldierModel(kind = 'enemy') {
  const c = PALETTES[kind];
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0); // tilts as a whole when falling
  box(0.34, 0.16, 0.2, c.clothDark, 0, 0.98, 0, body); // pelvis
  const torso = pivot(body, 0, 1.04, 0);
  box(0.38, 0.48, 0.22, c.cloth, 0, 0.24, 0, torso);
  const vest = box(0.42, 0.36, 0.28, c.vest, 0, 0.27, 0, torso);
  const neck = pivot(torso, 0, 0.48, 0);
  box(0.21, 0.23, 0.23, c.wrap, 0, 0.12, 0, neck);
  box(0.15, 0.07, 0.02, c.skin, 0, 0.12, -0.12, neck);
  const arm = side => {
    const sh = pivot(torso, 0.24 * side, 0.42, 0);
    box(0.1, 0.3, 0.1, c.cloth, 0, -0.15, 0, sh);
    const el = pivot(sh, 0, -0.3, 0);
    box(0.09, 0.28, 0.09, c.cloth, 0, -0.14, 0, el);
    return { sh, el };
  };
  const leg = side => {
    const hip = pivot(body, 0.1 * side, 0.94, 0);
    box(0.14, 0.44, 0.15, c.clothDark, 0, -0.22, 0, hip);
    const knee = pivot(hip, 0, -0.44, 0);
    box(0.12, 0.42, 0.13, c.clothDark, 0, -0.21, 0, knee);
    box(0.13, 0.08, 0.22, c.boots, 0, -0.44, -0.03, knee);
    return { hip, knee };
  };
  const R = arm(1), L = arm(-1), RL = leg(1), LL = leg(-1);
  const gunMount = pivot(torso, 0.15, 0.3, -0.3);
  return { root, body, torso, neck, vest, R, L, RL, LL, gunMount, gun: null, gunId: null, fall: 0 };
}

export function setSoldierWeapon(m, id) {
  if (m.gunId === id) return;
  if (m.gun) m.gunMount.remove(m.gun);
  m.gun = weaponModel(id);
  // weapons in other people's hands are drawn larger so they read at a distance
  m.gun.scale.setScalar(THIRD_PERSON_GUN_SCALE);
  m.gunId = id;
  m.gunMount.add(m.gun);
}

/**
 * Pose the soldier. a: { moving, animT, aiming, pitch, dead, deadT, downed, flinch, armour }
 */
export function poseSoldier(m, a) {
  const t = a.animT * 9;
  const swing = a.moving ? Math.sin(t) * 0.55 : 0;
  m.vest.visible = a.armour > 0;
  m.RL.hip.rotation.x = swing; m.LL.hip.rotation.x = -swing;
  m.RL.knee.rotation.x = a.moving ? -Math.max(0, -Math.sin(t)) * 0.8 : 0;
  m.LL.knee.rotation.x = a.moving ? -Math.max(0, Math.sin(t)) * 0.8 : 0;
  m.body.position.y = a.moving ? Math.abs(Math.cos(t)) * 0.04 : 0;
  const aim = a.aiming ? 1 : 0.35;
  const pitch = a.aiming ? a.pitch || 0 : -0.25;
  m.torso.rotation.x = (a.flinch || 0) * 0.4 + pitch * 0.4;
  m.R.sh.rotation.set(1.25 * aim + pitch * 0.6, 0, -0.1);
  m.R.el.rotation.set(0.5, 0, 0);
  m.L.sh.rotation.set(1.2 * aim + pitch * 0.6, 0, 0.55);
  m.L.el.rotation.set(0.7, 0, 0);
  m.gunMount.rotation.x = pitch * 0.6 + (a.aiming ? 0 : 0.5);
  if (a.downed) {
    m.body.rotation.x = 0;
    m.RL.hip.rotation.x = 1.4; m.RL.knee.rotation.x = -1.6;
    m.LL.hip.rotation.x = 0.2; m.LL.knee.rotation.x = -1.8;
    m.body.position.y = -0.45;
  }
  if (a.dead) {
    const k = Math.min(1, (a.deadT || 0) / 0.45);
    m.body.rotation.x = k * k * 1.5;
    m.body.position.y = -k * 0.05;
    m.R.sh.rotation.x = 2.6 * k; m.L.sh.rotation.x = 2.4 * k;
  } else if (!a.downed) {
    m.body.rotation.x = 0;
  }
}

// ---------- pickups ----------
export function pickupModel(pk, tex) {
  const g = new THREE.Group();
  if (pk.type === 'weapon') {
    const w = weaponModel(pk.weapon);
    w.rotation.set(0, 0, Math.PI / 2);
    w.position.y = 0.06;
    g.add(w);
  } else if (pk.type === 'ammo') {
    box(0.28, 0.16, 0.18, 0x4d5631, 0, 0.08, 0, g);
    box(0.29, 0.03, 0.19, 0xc9a43a, 0, 0.12, 0, g);
  } else if (pk.type === 'armour') {
    box(0.42, 0.42, 0.12, 0x2e3a2c, 0, 0.25, 0, g);
    box(0.3, 0.12, 0.13, 0x4a5a44, 0, 0.32, 0, g);
  } else if (pk.type === 'item') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.55), new THREE.MeshLambertMaterial({ map: tex.crate, flatShading: true }));
    crate.position.y = 0.28; g.add(crate);
    box(0.82, 0.08, 0.57, 0xe0b030, 0, 0.3, 0, g);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 30, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    beam.position.y = 15.5; g.add(beam);
  }
  return g;
}
