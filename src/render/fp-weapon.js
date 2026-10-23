// The weapon in your hands: drawn in its own small scene on top of the world so it never
// clips into walls. Handles aiming down sights, recoil kick, reload and swap motions,
// walking sway and the muzzle flash.
import * as THREE from 'three';
import { weaponModel, muzzleOf, sightOf, handLeftOf, handRightOf, LEFT_HAND_UPRIGHT, box, grenadeModel } from './models.js';
import { ART, cloneArt } from './assets.js';
import { makeCanvas, pixelTexture } from './textures.js';

const HIP = new THREE.Vector3(0.2, -0.21, -0.5);
// with drawn art, the weapon's `sight` point is placed this far in front of the eye
const SIGHT_DISTANCE = 0.4;
const HOLDER_SCALE = 0.85;
const GLOVE = 0x4d4a35, GLOVE_DARK = 0x2f3022, SLEEVE = 0x46586a;
const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 0 → 1 between a and b (fractions of the reload), eased
const span = (u, a, b) => ease((u - a) / (b - a));
const lerp3 = (out, a, b, k) => out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);

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
  // gloved hands and forearms: drawn art (items/player_hands.glb) or simple boxes.
  // Each forearm starts at its hand's wrist and is pointed back towards your shoulder
  // every frame, so a hand out on a rifle's handguard is still attached to an arm.
  const hands = { R: new THREE.Group(), L: new THREE.Group() };
  const arms = { R: new THREE.Group(), L: new THREE.Group() };
  const wrists = { R: null, L: null };
  holder.add(hands.R, hands.L, arms.R, arms.L);
  function buildHands() {
    for (const side of ['R', 'L']) {
      const h = hands[side], a = arms[side];
      h.clear(); a.clear();
      const art = ART.hands ? cloneArt(ART.hands) : null;
      const part = art && art.getObjectByName('hand_' + side);
      if (part) {
        part.position.set(0, 0, 0); h.add(part);
        wrists[side] = part.getObjectByName('wrist_' + side);
      } else {
        // glove wrapped round the grip, with the cuff behind it
        box(0.075, 0.085, 0.085, GLOVE, 0, -0.01, 0, h);
        box(0.07, 0.075, 0.06, GLOVE_DARK, 0, -0.015, 0.065, h);
        wrists[side] = null;
      }
      if (!wrists[side]) { wrists[side] = new THREE.Object3D(); wrists[side].position.set(0, -0.01, 0.06); h.add(wrists[side]); }
      const arm = art && art.getObjectByName('arm_' + side);
      if (arm) { arm.position.set(0, 0, 0); arm.rotation.set(0, 0, 0); a.add(arm); }
      else box(0.068, 0.068, 0.9, SLEEVE, 0, 0, 0.45, a);
    }
  }
  // where the shoulders are, seen from your eye (metres: right, up, back)
  const SHOULDER = { R: new THREE.Vector3(0.34, -0.52, 0.05), L: new THREE.Vector3(-0.34, -0.52, 0.05) };
  const tmp = new THREE.Vector3();
  function placeArms() {
    holder.updateMatrixWorld(true);
    for (const side of ['R', 'L']) {
      wrists[side].getWorldPosition(tmp);
      arms[side].position.copy(holder.worldToLocal(tmp));
      arms[side].lookAt(SHOULDER[side]);
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

  const st = { ads: 0, kick: 0, flashT: 0, reload: 0, reloadDur: 1, reloadEmpty: false, swap: 0, bob: 0, throwT: 0, throwDur: 1, releaseFrac: 0.45 };
  const handLRest = new THREE.Vector3();

  // ---- grenade toss: the rifle dips, the left hand swings a grenade up and throws it ----
  const heldGrenade = grenadeModel();
  heldGrenade.visible = false;
  rig.add(heldGrenade);
  // the left hand's path in view space (metres: right, up, back): from low out of view,
  // wound up beside your head, forward to the release, follow-through, back down
  const TOSS = [
    [0.0, new THREE.Vector3(-0.2, -0.45, -0.3)],
    [0.55, new THREE.Vector3(-0.22, -0.05, -0.36)],
    [1.0, new THREE.Vector3(-0.07, 0.05, -0.62)],
    [1.5, new THREE.Vector3(-0.02, -0.13, -0.66)],
    [2.2, new THREE.Vector3(-0.2, -0.45, -0.35)]
  ];
  const tossTmp = new THREE.Vector3();
  /** Left-hand point at toss time s (in units of the release time: 1 = the release). */
  function tossPoint(s, out) {
    for (let i = 1; i < TOSS.length; i++) {
      if (s <= TOSS[i][0] || i === TOSS.length - 1) {
        const [a, pa] = TOSS[i - 1], [b, pb] = TOSS[i];
        return lerp3(out, pa, pb, ease((s - a) / (b - a)));
      }
    }
    return out.copy(TOSS[TOSS.length - 1][1]);
  }

  // ---- magazine reload (weapons whose model has a `magazine` part, e.g. the AK-47) ----
  // Fractions of the reload time: tilt the rifle, left hand takes the magazine and rocks it
  // out forward, lets it fall, fetches a fresh one from below, hooks it in and rocks it back
  // until it clicks; if the gun was empty the right hand then pulls the charging handle.
  const R = {
    mag: null, ch: null, magPos: new THREE.Vector3(), magRot: new THREE.Euler(), chPos: new THREE.Vector3(),
    handL: new THREE.Vector3(), handR: new THREE.Vector3(),
    grab: new THREE.Vector3(),            // where the left hand holds the magazine, from its pivot
    pouch: new THREE.Vector3(-0.16, -0.5, 0.12),
    v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler()
  };
  const OUT_ANGLE = 0.65;   // how far the magazine rocks forward (radians)
  function setupMagReload() {
    R.mag = gun && gun.getObjectByName('magazine');
    R.ch = gun && gun.getObjectByName('charging_handle');
    if (!R.mag) return;
    R.magPos.copy(R.mag.position); R.magRot.copy(R.mag.rotation);
    if (R.ch) R.chPos.copy(R.ch.position);
    R.handL.copy(hands.L.position); R.handR.copy(hands.R.position);
    // the left hand cups the bottom of the magazine (so you still see the magazine itself)
    R.grab.set(-0.015, -0.17, 0.045);
  }
  function restMag() {
    if (!R.mag) return;
    R.mag.position.copy(R.magPos); R.mag.rotation.copy(R.magRot); R.mag.visible = true;
    if (R.ch) R.ch.position.copy(R.chPos);
    hands.L.position.copy(R.handL); hands.R.position.copy(R.handR);
  }
  /** Pose everything for reload progress u (0–1). */
  function magReload(u, empty) {
    const v = R.v, w = R.w;
    // the rifle cants over and drops a little, so you look at the magazine well
    const tilt = span(u, 0, 0.12) * (1 - span(u, 0.86, 1));
    // (top rolls to the right, muzzle swings a little left: the left side and the well face you)
    holder.rotation.z -= tilt * 0.85; holder.rotation.y += tilt * 0.4; holder.rotation.x += tilt * 0.4;
    holder.position.y += tilt * 0.07; holder.position.x -= tilt * 0.1; holder.position.z -= tilt * 0.04;
    // magazine: angle forward, and where its pivot is
    let ang = 0, attached = false, visible = true;
    v.copy(R.magPos);
    if (u < 0.16) { ang = 0; }
    else if (u < 0.24) { ang = OUT_ANGLE * span(u, 0.16, 0.24); v.y -= 0.02 * span(u, 0.2, 0.24); attached = true; }
    else if (u < 0.4) {
      // let go: it drops away out of view, still turning
      const t = (u - 0.24) * st.reloadDur;
      ang = OUT_ANGLE + t * 2.5; v.y -= 0.02 + 4.9 * t * t; v.z -= t * 0.15; v.x -= t * 0.05;
      visible = u < 0.36;
    } else if (u < 0.46) { visible = false; }
    else if (u < 0.58) {
      // a fresh one comes up from the vest, already angled to hook in
      ang = OUT_ANGLE; attached = true;
      lerp3(v, w.copy(R.pouch).sub(R.grab), R.v.set(R.magPos.x, R.magPos.y - 0.012, R.magPos.z), span(u, 0.46, 0.58));
    } else if (u < 0.68) { ang = OUT_ANGLE * (1 - span(u, 0.58, 0.68)); v.y -= 0.012 * (1 - span(u, 0.58, 0.66)); attached = true; }
    R.mag.visible = visible;
    R.mag.position.copy(v);
    R.mag.rotation.set(R.magRot.x + ang, R.magRot.y, R.magRot.z);
    // the click: a small jolt when it seats
    if (u > 0.66 && u < 0.72) holder.position.y += Math.sin((u - 0.66) / 0.06 * Math.PI) * 0.012;

    // left hand: handguard → magazine (moving with it) → vest → back with the new one → handguard
    const L = hands.L.position;
    const onMag = out => { R.q.setFromEuler(R.mag.rotation); return out.copy(R.grab).applyQuaternion(R.q).add(R.mag.position); };
    if (u < 0.16) lerp3(L, R.handL, onMag(w), span(u, 0.06, 0.16));
    else if (attached) onMag(L);
    else if (u < 0.46) { onMag(w); lerp3(L, w.set(R.magPos.x + R.grab.x, R.magPos.y + R.grab.y - 0.04, R.magPos.z + R.grab.z), R.pouch, span(u, 0.25, 0.42)); }
    else lerp3(L, onMag(w), R.handL, span(u, 0.68, 0.8));

    // empty gun: right hand pulls the charging handle back and lets it fly forward
    hands.R.position.copy(R.handR);
    if (R.ch) R.ch.position.copy(R.chPos);
    if (empty && R.ch) {
      const at = w.set(R.chPos.x + 0.05, R.chPos.y, R.chPos.z + 0.01);
      const pull = span(u, 0.74, 0.8) * (u < 0.81 ? 1 : 0);
      const pulled = v.copy(at); pulled.z += 0.09;
      if (u > 0.68 && u < 0.92) {
        if (u < 0.74) lerp3(hands.R.position, R.handR, at, span(u, 0.68, 0.74));
        else if (u < 0.83) lerp3(hands.R.position, at, pulled, span(u, 0.74, 0.8));
        else lerp3(hands.R.position, pulled, R.handR, span(u, 0.83, 0.92));
      }
      R.ch.position.z = R.chPos.z + 0.09 * pull;
      if (u > 0.7 && u < 0.92) holder.rotation.z -= 0.12 * Math.sin(span(u, 0.7, 0.92) * Math.PI);
    }
  }

  function setWeapon(id) {
    if (id === gunId) return;
    if (gun) holder.remove(gun);
    gunId = id;
    gun = id ? weaponModel(id) : null;
    if (gun) holder.add(gun);
    R.mag = null; R.ch = null;
    const m = muzzleOf(id);
    flash.position.set(m[0], m[1], m[2] - 0.05);
    hands.R.visible = hands.L.visible = arms.R.visible = arms.L.visible = !!gun;
    const hr = handRightOf(id);
    hands.R.position.set(hr[0], hr[1], hr[2]);
    const hl = handLeftOf(id);
    hands.L.position.set(hl[0], hl[1], hl[2]);
    handLRest.copy(hands.L.position);
    // drawn hands are fists round an upright grip: on a rifle the left hand turns to clamp
    // the handguard from the side, back of the hand (and its knuckle plate) facing you
    hands.L.rotation.set(ART.hands && !LEFT_HAND_UPRIGHT.has(id) ? Math.PI / 2 : 0, 0, 0);
    const sight = sightOf(id), eye = ART.weapons[id] && ART.weapons[id].eye;
    // a rifle's stock reaches back past the sights: keep its butt a little in front of your eye
    const back = ART.weapons[id] ? (ART.weapons[id].back - (sight ? sight[2] : 0)) * HOLDER_SCALE : 0;
    const dist = Math.max(SIGHT_DISTANCE, back + 0.16);
    adsTarget = sight ? new THREE.Vector3(-sight[0] * HOLDER_SCALE, -sight[1] * HOLDER_SCALE, -dist - sight[2] * HOLDER_SCALE) : null;
    // a shouldered weapon with an `eye` point: put your eye exactly there (stock at the
    // shoulder, face behind the top cover); the stock then runs back below the view
    if (eye) adsTarget = new THREE.Vector3(-eye[0] * HOLDER_SCALE, -eye[1] * HOLDER_SCALE, -eye[2] * HOLDER_SCALE);
    setupMagReload();
  }

  return {
    scene, camera,
    /** Drawn art finished loading: rebuild the weapon and hands from it. */
    refresh() { buildHands(); const id = gunId; gunId = undefined; setWeapon(id); },
    /** For automated checks: hold the reload animation at progress u (0–1). */
    holdReload(u, empty = false) { st.reloadDur = 1e5; st.reload = (1 - u) * 1e5; st.reloadEmpty = empty; },
    handle(ev, localId) {
      if (ev.actorId !== localId) return;
      if (ev.type === 'shot') { st.kick = 1; st.flashT = 0.05; }
      else if (ev.type === 'reload') { st.reload = ev.time; st.reloadDur = ev.time; st.reloadEmpty = !!ev.empty; }
      else if (ev.type === 'swap') { st.swap = 0.4; st.reload = 0; }
      else if (ev.type === 'throw') { st.throwT = ev.time; st.throwDur = ev.time; st.releaseFrac = ev.release ? ev.release / ev.time : 0.45; }
    },
    update(dt, player, aspect) {
      camera.aspect = aspect; camera.updateProjectionMatrix();
      const slot = player && player.alive && !player.downed ? player.slots[player.active] : null;
      setWeapon(slot ? slot.w : null);
      if (!gun) return;
      st.ads += ((player.ads ? 1 : 0) - st.ads) * Math.min(1, dt * 14);
      st.kick = Math.max(0, st.kick - dt * 10);
      st.flashT -= dt; st.reload = Math.max(0, st.reload - dt); st.swap = Math.max(0, st.swap - dt);
      st.throwT = Math.max(0, st.throwT - dt);
      hands.L.position.copy(handLRest);
      heldGrenade.visible = false;
      if (player.moving) st.bob += dt * 9;
      const adsPos = adsTarget || ADS[gunId] || ADS.m4a1;
      holder.position.lerpVectors(HIP, adsPos, st.ads);
      const sway = (1 - st.ads * 0.85) * (player.moving ? 1 : 0.2);
      holder.position.x += Math.sin(st.bob * 0.5) * 0.012 * sway;
      holder.position.y += -Math.abs(Math.cos(st.bob * 0.5)) * 0.012 * sway;
      holder.position.z += st.kick * 0.05;
      holder.rotation.set(st.kick * 0.12, 0, 0);
      if (R.mag) {
        restMag();
        if (st.reload > 0) magReload(1 - st.reload / st.reloadDur, st.reloadEmpty);
      } else if (st.reload > 0) {
        const k = Math.sin(Math.PI * (1 - st.reload / st.reloadDur));
        holder.position.y -= k * 0.12; holder.rotation.x -= k * 0.5; holder.rotation.z = k * 0.4;
      }
      if (st.swap > 0) holder.position.y -= (st.swap / 0.4) * 0.3;
      if (st.throwT > 0) {
        const u = 1 - st.throwT / st.throwDur;
        // the gun drops away to the right while the left hand throws
        const dip = span(u, 0, 0.18) * (1 - span(u, 0.72, 1));
        holder.position.y -= dip * 0.1; holder.position.x += dip * 0.06; holder.rotation.x -= dip * 0.35; holder.rotation.z -= dip * 0.25;
        const s = u / Math.max(0.05, st.releaseFrac);
        tossPoint(s, tossTmp);
        if (s < 1) { heldGrenade.visible = true; heldGrenade.position.set(tossTmp.x + 0.01, tossTmp.y + 0.045, tossTmp.z - 0.02); heldGrenade.rotation.set(0.3, 0, 0.4); }
        // back in the gun's own space for the hand (the gun has moved)
        holder.updateMatrixWorld(true);
        const target = holder.worldToLocal(tossTmp.clone());
        hands.L.position.lerpVectors(handLRest, target, span(u, 0, 0.08) * (1 - span(u, 0.85, 1)));
      }
      flash.visible = st.flashT > 0;
      if (flash.visible) flash.material.rotation = Math.random() * 6;
      placeArms();
    }
  };
}
