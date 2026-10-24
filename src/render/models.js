// Low-poly models built from boxes, PS1 style: weapons, soldiers, pickups.
// A soldier is made of rigid parts (head, torso, limbs) that are rotated to animate,
// so no skeleton or rigging is needed. Each soldier is about 250 triangles including
// the gun. Real art can replace these part by part later.
import * as THREE from 'three';
import { ART, cloneArt } from './assets.js';

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
  if (ART.weapons[id]) return cloneArt(ART.weapons[id].root);
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
  } else if (id === 'mini_uzi') {
    // compact and boxy: the magazine goes up through the grip, short barrel stub, folded stock
    box(0.045, 0.07, 0.24, black, 0, 0.05, -0.08, g);
    box(0.016, 0.016, 0.06, black, 0, 0.055, -0.23, g);
    box(0.035, 0.12, 0.045, black, 0, -0.035, 0.0, g).rotation.x = 0.1;
    box(0.025, 0.08, 0.035, grey, 0, -0.12, 0.012, g);
    box(0.012, 0.02, 0.16, grey, 0.026, 0.06, 0.06, g);
  } else if (id === 'galil') {
    // AK-like layout in black, with a wooden handguard and a curved magazine
    box(0.05, 0.075, 0.32, black, 0, 0.05, -0.08, g);
    box(0.055, 0.055, 0.2, wood, 0, 0.045, -0.32, g);
    box(0.016, 0.016, 0.2, black, 0, 0.065, -0.5, g);
    box(0.04, 0.07, 0.25, black, 0, 0.03, 0.18, g);
    box(0.03, 0.15, 0.06, black, 0, -0.06, -0.14, g).rotation.x = 0.3;
    box(0.03, 0.08, 0.04, black, 0, -0.03, 0.0, g);
  } else if (id === 'fal') {
    // long battle rifle: carry handle, straight 20-round magazine, solid stock
    box(0.05, 0.08, 0.36, black, 0, 0.05, -0.1, g);
    box(0.05, 0.06, 0.22, grey, 0, 0.045, -0.38, g);
    box(0.018, 0.018, 0.24, black, 0, 0.06, -0.6, g);
    box(0.045, 0.085, 0.3, black, 0, 0.025, 0.22, g);
    box(0.03, 0.13, 0.065, black, 0, -0.06, -0.15, g);
    box(0.02, 0.025, 0.12, black, 0, 0.11, -0.1, g);
    box(0.03, 0.08, 0.04, black, 0, -0.03, 0.0, g);
  } else {
    box(0.05, 0.07, 0.4, black, 0, 0.05, -0.1, g);
    if (id === 'mk14ebr') { box(0.035, 0.035, 0.2, black, 0, 0.12, -0.08, g); box(0.045, 0.045, 0.03, black, 0, 0.12, -0.19, g); }
  }
  return g;
}

/** Where the barrel ends, in the weapon model's own coordinates. */
export const MUZZLE = { sig_p320: [0, 0.06, -0.15], m4a1: [0, 0.055, -0.6], ak47: [0, 0.065, -0.58], rpg7: [0, 0.07, -0.8], mini_uzi: [0, 0.055, -0.26], galil: [0, 0.065, -0.6], fal: [0, 0.06, -0.72] };
export const muzzleOf = id => (ART.weapons[id] && ART.weapons[id].muzzle) || MUZZLE[id] || [0, 0, -0.5];
/** The aiming point (eye looks through it) of a drawn weapon, or null for placeholders. */
export const sightOf = id => (ART.weapons[id] && ART.weapons[id].sight) || null;
/** Where the left hand holds the weapon. */
const HAND_LEFT = { sig_p320: [-0.03, -0.01, 0.03], m4a1: [-0.01, 0.03, -0.3], ak47: [-0.01, 0.035, -0.3], rpg7: [0, -0.02, 0.08], mini_uzi: [-0.02, -0.06, -0.14], galil: [-0.01, 0.035, -0.32], fal: [-0.01, 0.03, -0.38] };
/** Where the right hand holds a placeholder weapon (drawn weapons: their origin, the grip). */
const HAND_RIGHT = { m4a1: [0, -0.04, -0.11], ak47: [0, -0.05, -0.12], rpg7: [0, -0.02, -0.15] };
export const handRightOf = id => (ART.weapons[id] ? [0, 0, 0] : HAND_RIGHT[id] || [0, 0, 0.02]);
/** Weapons whose left hand also holds an upright grip (rather than a handguard). */
export const LEFT_HAND_UPRIGHT = new Set(['sig_p320', 'rpg7']);
export const handLeftOf = id => (ART.weapons[id] && ART.weapons[id].handLeft) || HAND_LEFT[id] || [0, 0, -0.25];

/** A flying rocket: the RPG-7's warhead. */
export function rocketModel() {
  // the group's +z faces the flight direction (the renderer uses lookAt)
  const g = new THREE.Group();
  const w = ART.weapons.rpg7;
  if (w && w.warhead) {
    const r = w.warhead.clone(true);
    r.position.set(0, 0, 0); r.rotation.set(0, Math.PI, 0); // drawn pointing −z
    g.add(r);
    return g;
  }
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 6), lambert(0x4e5a3a));
  head.rotation.x = Math.PI / 2;
  g.add(head);
  return g;
}

/** A hand grenade (RGD-5): olive egg with the fuse and lever on top. Origin at its middle. */
export function grenadeModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), lambert(0x5c6440));
  body.scale.set(1, 1.15, 1);
  g.add(body);
  box(0.022, 0.025, 0.022, 0x6e6e68, 0, 0.05, 0, g);     // fuse
  box(0.012, 0.012, 0.07, 0x8a8a82, 0, 0.055, 0.02, g);  // lever
  return g;
}

/** The explosive vest a suicide bomber wears, on his torso (torso pivot at waist height). */
function bomberVest(torso) {
  const v = new THREE.Group();
  v.name = 'bomb_vest';
  const stick = 0xc8b070, tape = 0x2a2a28, wire = 0xd0452f;   // tan explosive blocks: stand out on any clothes
  box(0.42, 0.06, 0.27, tape, 0, 0.06, 0, v);                        // belt
  for (let i = 0; i < 5; i++) box(0.05, 0.2, 0.05, stick, -0.14 + i * 0.07, 0.2, -0.135, v);  // charges in front
  for (let i = 0; i < 4; i++) box(0.05, 0.2, 0.05, stick, -0.105 + i * 0.07, 0.2, 0.135, v);  // and behind
  box(0.34, 0.03, 0.06, tape, 0, 0.27, -0.135, v);                   // strapped together
  box(0.012, 0.012, 0.2, wire, 0.08, 0.33, -0.08, v);               // wires up to the trigger
  box(0.08, 0.05, 0.04, 0x3e4130, 0.08, 0.35, -0.15, v);             // detonator box
  const light = box(0.025, 0.025, 0.02, 0xff2010, 0.08, 0.385, -0.16, v);
  light.name = 'bomb_light';
  light.material = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  torso.add(v);
  return v;
}

// ---------- soldiers ----------
export const THIRD_PERSON_GUN_SCALE = 1.4;

const PALETTES = {
  enemy: { cloth: 0x6f6a4c, clothDark: 0x4d4a35, wrap: 0xb39b70, skin: 0x8c6448, boots: 0x2a241c, vest: 0x3e4130 },
  player: { cloth: 0x8296a4, clothDark: 0x627683, wrap: 0x56634a, skin: 0xb08566, boots: 0x2a2620, vest: 0x46553f }
};

/** A soldier from drawn art (characters/*.glb), using the named parts from ART_SPEC.md. */
function soldierFromArt(art) {
  const root = new THREE.Group();
  const inst = cloneArt(art);
  root.add(inst);
  const n = name => inst.getObjectByName(name);
  return {
    root, body: n('body'), torso: n('torso'), neck: n('head'), vest: n('vest'),
    R: { sh: n('upper_arm_R'), el: n('lower_arm_R') }, L: { sh: n('upper_arm_L'), el: n('lower_arm_L') },
    RL: { hip: n('upper_leg_R'), knee: n('lower_leg_R') }, LL: { hip: n('upper_leg_L'), knee: n('lower_leg_L') },
    gunMount: n('gun_mount'), gun: null, gunId: null, fall: 0
  };
}

/** kind: 'player' or 'enemy'; type: the enemy type (Enemies tab), e.g. 'heavy_insurgent'.
 *  Uses characters/enemy_<type>.glb if there is one, otherwise the insurgent's. */
export function soldierModel(kind = 'enemy', type = 'insurgent') {
  const m = soldierBase(kind, type);
  // suicide bombers: a militia-style civilian look with an explosive vest (until they get art)
  // (with drawn art the vest is part of the model; its `bomb_light` still blinks)
  if (type === 'suicide_bomber' && m.torso) m.bombVest = ART.characters.enemy_suicide_bomber ? m.root : bomberVest(m.torso);
  return m;
}

function soldierBase(kind, type) {
  const fallback = type === 'suicide_bomber' ? (ART.characters.enemy_militia || ART.characters.enemy_insurgent) : ART.characters.enemy_insurgent;
  const art = kind === 'enemy' ? (ART.characters['enemy_' + type] || fallback) : ART.characters.player;
  if (art) return soldierFromArt(art);
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
  } else if (ART.items['pickup_' + pk.type]) {
    g.add(cloneArt(ART.items['pickup_' + pk.type]));
  } else if (pk.type === 'ammo') {
    box(0.28, 0.16, 0.18, 0x4d5631, 0, 0.08, 0, g);
    box(0.29, 0.03, 0.19, 0xc9a43a, 0, 0.12, 0, g);
  } else if (pk.type === 'grenade') {
    const gr = grenadeModel(); gr.position.y = 0.05; gr.rotation.z = 1.2; g.add(gr);
  } else if (pk.type === 'health') {
    box(0.34, 0.22, 0.24, 0xe8e4da, 0, 0.11, 0, g);
    box(0.2, 0.06, 0.25, 0xc02a1e, 0, 0.12, 0, g);
    box(0.06, 0.18, 0.25, 0xc02a1e, 0, 0.12, 0, g);
  } else if (pk.type === 'resupply') {
    box(0.42, 0.24, 0.26, 0x4d5631, 0, 0.12, 0, g);
    box(0.43, 0.04, 0.27, 0xc9a43a, 0, 0.18, 0, g);
    box(0.14, 0.04, 0.06, 0x2a2a28, 0, 0.26, 0, g);
  } else if (pk.type === 'armour') {
    box(0.42, 0.42, 0.12, 0x2e3a2c, 0, 0.25, 0, g);
    box(0.3, 0.12, 0.13, 0x4a5a44, 0, 0.32, 0, g);
  } else if (pk.type === 'item') {
    const art = ART.items['crate_' + String(pk.item).replace(/_crate$/, '')];
    if (art) g.add(cloneArt(art));
    else {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.55), new THREE.MeshLambertMaterial({ map: tex.crate, flatShading: true }));
      crate.position.y = 0.28; g.add(crate);
      box(0.82, 0.08, 0.57, 0xe0b030, 0, 0.3, 0, g);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 30, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    beam.position.y = 15.5; g.add(beam);
  }
  return g;
}
