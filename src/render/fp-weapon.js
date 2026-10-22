// The weapon in your hands: drawn in its own small scene on top of the world so it never
// clips into walls. Handles aiming down sights, recoil kick, reload and swap motions,
// walking sway and the muzzle flash.
import * as THREE from 'three';
import { weaponModel, muzzleOf, sightOf, handLeftOf, box } from './models.js';
import { ART, cloneArt } from './assets.js';
import { makeCanvas, pixelTexture } from './textures.js';

const HIP = new THREE.Vector3(0.2, -0.21, -0.5);
// with drawn art, the weapon's `sight` point is placed this far in front of the eye
const SIGHT_DISTANCE = 0.4;
const HOLDER_SCALE = 0.85;
const GLOVE = 0x4d4a35, GLOVE_DARK = 0x2f3022, SLEEVE = 0x46586a;
const ADS = { sig_p320: new THREE.Vector3(0, -0.085, -0.36), m4a1: new THREE.Vector3(0, -0.135, -0.3), ak47: new THREE.Vector3(0, -0.105, -0.3), rpg7: new THREE.Vector3(-0.09, -0.12, -0.25) };

export function createFpWeapon() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xfff1d8, 0x5a4a38, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-0.5, 1, 0.4); scene.add(sun);

  const rig = new THREE.Group();
  scene.add(rig);
  const holder = new THREE.Group();
  holder.scale.setScalar(HOLDER_SCALE);
  rig.add(holder);
  // gloved hands: drawn art (items/player_hands.glb) or simple boxes
  const hands = { R: new THREE.Group(), L: new THREE.Group() };
  holder.add(hands.R, hands.L);
  function buildHands() {
    for (const side of ['R', 'L']) {
      const h = hands[side];
      h.clear();
      if (ART.hands) {
        const part = cloneArt(ART.hands).getObjectByName('hand_' + side);
        if (part) { part.position.set(0, 0, 0); h.add(part); continue; }
      }
      // glove wrapped round the grip, with the end of the sleeve behind it
      box(0.075, 0.085, 0.085, GLOVE, 0, -0.03, 0, h);
      box(0.07, 0.075, 0.1, GLOVE_DARK, 0, -0.035, 0.085, h);
      box(0.085, 0.09, 0.12, SLEEVE, 0, -0.045, 0.19, h);
    }
  }
  buildHands();
  let adsTarget = null;
  let gun = null, gunId = null;
  const flashTex = pixelTexture(makeCanvas(16, 16, g => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8, star = Math.min(Math.abs(x - 7.5), Math.abs(y - 7.5)) < 1.5;
      if (d < (star ? 1 : 0.55) && Math.random() > d * 0.6) { g.fillStyle = d < 0.3 ? '#fff6d0' : '#ffb040'; g.fillRect(x, y, 1, 1); }
    }
  }), false);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  flash.scale.set(0.16, 0.16, 1);
  flash.visible = false;
  holder.add(flash);

  const st = { ads: 0, kick: 0, flashT: 0, reload: 0, reloadDur: 1, swap: 0, bob: 0 };

  function setWeapon(id) {
    if (id === gunId) return;
    if (gun) holder.remove(gun);
    gunId = id;
    gun = id ? weaponModel(id) : null;
    if (gun) holder.add(gun);
    const m = muzzleOf(id);
    flash.position.set(m[0], m[1], m[2] - 0.05);
    hands.R.visible = hands.L.visible = !!gun;
    hands.R.position.set(0, 0, 0.02);
    const hl = handLeftOf(id);
    hands.L.position.set(hl[0], hl[1], hl[2]);
    const sight = sightOf(id);
    adsTarget = sight ? new THREE.Vector3(-sight[0] * HOLDER_SCALE, -sight[1] * HOLDER_SCALE, -SIGHT_DISTANCE - sight[2] * HOLDER_SCALE) : null;
  }

  return {
    scene, camera,
    /** Drawn art finished loading: rebuild the weapon and hands from it. */
    refresh() { buildHands(); const id = gunId; gunId = undefined; setWeapon(id); },
    handle(ev, localId) {
      if (ev.actorId !== localId) return;
      if (ev.type === 'shot') { st.kick = 1; st.flashT = 0.05; }
      else if (ev.type === 'reload') { st.reload = ev.time; st.reloadDur = ev.time; }
      else if (ev.type === 'swap') { st.swap = 0.4; st.reload = 0; }
    },
    update(dt, player, aspect) {
      camera.aspect = aspect; camera.updateProjectionMatrix();
      const slot = player && player.alive && !player.downed ? player.slots[player.active] : null;
      setWeapon(slot ? slot.w : null);
      if (!gun) return;
      st.ads += ((player.ads ? 1 : 0) - st.ads) * Math.min(1, dt * 14);
      st.kick = Math.max(0, st.kick - dt * 10);
      st.flashT -= dt; st.reload = Math.max(0, st.reload - dt); st.swap = Math.max(0, st.swap - dt);
      if (player.moving) st.bob += dt * 9;
      const adsPos = adsTarget || ADS[gunId] || ADS.m4a1;
      holder.position.lerpVectors(HIP, adsPos, st.ads);
      const sway = (1 - st.ads * 0.85) * (player.moving ? 1 : 0.2);
      holder.position.x += Math.sin(st.bob * 0.5) * 0.012 * sway;
      holder.position.y += -Math.abs(Math.cos(st.bob * 0.5)) * 0.012 * sway;
      holder.position.z += st.kick * 0.05;
      holder.rotation.set(st.kick * 0.12, 0, 0);
      if (st.reload > 0) {
        const k = Math.sin(Math.PI * (1 - st.reload / st.reloadDur));
        holder.position.y -= k * 0.12; holder.rotation.x -= k * 0.5; holder.rotation.z = k * 0.4;
      }
      if (st.swap > 0) holder.position.y -= (st.swap / 0.4) * 0.3;
      flash.visible = st.flashT > 0;
      if (flash.visible) flash.material.rotation = Math.random() * 6;
    }
  };
}
