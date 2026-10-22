// Art files from /assets replace the code-drawn placeholders (see ART_SPEC.md).
// Every file is checked against the art spec; anything that breaks a rule is skipped and
// its placeholder stays, and the reason is listed on the Art tab of the tuning panel.
// Files are packed into the game when it's built, so the single-file play link works.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const files = import.meta.glob('../../assets/{blocks,characters,weapons,items,fx}/*.{png,glb}', { query: '?art', import: 'default', eager: true });

/** What the game currently uses, filled in as files finish loading. */
export const ART = { characters: {}, weapons: {}, items: {}, hands: null, report: [], ready: false };

// Block textures: file name → [texture key in textures.js, size in pixels]
// (32 px per metre; ground 16 px per metre; see ART_SPEC.md section 3)
const BLOCKS = {
  ground: ['ground', 64], concrete: ['concrete', 64], wall: ['wall', 32], column: ['column', 32],
  lowwall: ['lowwall', 32], crate: ['crate', 32], sandbag: ['sandbag', 32], stairs: ['stairs', 32],
  rubble: ['rubble', 32], floor_tile: ['floorTile', 32]
};
const CHARACTER_PARTS = ['body', 'torso', 'vest', 'head', 'upper_arm_R', 'lower_arm_R', 'upper_arm_L', 'lower_arm_L',
  'upper_leg_R', 'lower_leg_R', 'upper_leg_L', 'lower_leg_L', 'gun_mount'];
const BUDGET = { character: 300, weapon: 300, item: 60, upgrade: 150, hands: 100 };
// weapon length in metres, from the placeholders (a model may be 50% shorter or longer)
const WEAPON_LENGTH = { sig_p320: 0.2, m4a1: 0.85, ak47: 0.88, rpg7: 1.1 };

const base = p => p.split('/').pop().replace(/\.(png|glb)$/, '');
const folder = p => p.split('/').slice(-2, -1)[0];

function triangles(obj) {
  let n = 0;
  obj.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

/** Same look as the placeholders: flat shading, sharp pixels, no colour conversion. */
function toGameMaterials(root) {
  const cache = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material;
    if (!cache.has(src)) {
      const map = src.map || null;
      if (map) {
        map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter;
        map.generateMipmaps = false; map.colorSpace = THREE.NoColorSpace; map.needsUpdate = true;
      }
      cache.set(src, new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : src.color, flatShading: true }));
    }
    o.material = cache.get(src);
  });
}

function pointOf(root, name) {
  const o = root.getObjectByName(name);
  if (!o) return null;
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  o.getWorldPosition(v);
  return [v.x, v.y, v.z];
}

function size(root) {
  const b = new THREE.Box3().setFromObject(root);
  return b.getSize(new THREE.Vector3());
}

async function loadModel(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  return new Promise((ok, fail) => new GLTFLoader().parse(buf, '', g => ok(g.scene), fail));
}

function loadImage(url) {
  return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
}

/** Load and check every art file. `tex` is the placeholder texture set from textures.js. */
export async function loadArt(tex) {
  const R = ART.report;
  const ok = (p, msg) => R.push(`✓ ${folder(p)}/${base(p)} — ${msg}`);
  const skip = (p, msg) => R.push(`✗ ${folder(p)}/${base(p)} skipped: ${msg}`);
  for (const [path, url] of Object.entries(files)) {
    const name = base(path), kind = folder(path);
    try {
      if (path.endsWith('.png')) {
        if (kind !== 'blocks') continue; // effect sprites are not used yet
        const want = BLOCKS[name];
        if (!want) { skip(path, 'not a block texture name the game knows (see ART_SPEC.md section 3)'); continue; }
        const img = await loadImage(url);
        if (img.width !== want[1] || img.height !== want[1]) { skip(path, `is ${img.width} × ${img.height} px, should be ${want[1]} × ${want[1]}`); continue; }
        const t = tex[want[0]];
        t.image = img; t.needsUpdate = true;
        ok(path, `${img.width} × ${img.height} px`);
        continue;
      }
      const root = await loadModel(url);
      toGameMaterials(root);
      const tris = triangles(root), sz = size(root);
      if (kind === 'characters') {
        const missing = CHARACTER_PARTS.filter(n => !root.getObjectByName(n));
        if (missing.length) { skip(path, `missing named parts: ${missing.join(', ')}`); continue; }
        if (tris > BUDGET.character) { skip(path, `${tris} triangles, budget ${BUDGET.character}`); continue; }
        if (sz.y < 1.5 || sz.y > 2.1) { skip(path, `is ${sz.y.toFixed(2)} m tall, should be about 1.75–1.80 m (check the export scale is 32)`); continue; }
        ART.characters[name] = root;
        ok(path, `${tris} triangles, ${sz.y.toFixed(2)} m tall`);
      } else if (kind === 'weapons') {
        const muzzle = pointOf(root, 'muzzle'), sight = pointOf(root, 'sight');
        if (!muzzle || !sight) { skip(path, `needs named points ${[!muzzle && 'muzzle', !sight && 'sight'].filter(Boolean).join(' and ')}`); continue; }
        if (tris > BUDGET.weapon) { skip(path, `${tris} triangles, budget ${BUDGET.weapon}`); continue; }
        const len = WEAPON_LENGTH[name];
        if (len && (sz.z < len * 0.5 || sz.z > len * 1.5)) { skip(path, `is ${sz.z.toFixed(2)} m long, expected about ${len} m (check the export scale is 32)`); continue; }
        ART.weapons[name] = { root, muzzle, sight, handLeft: pointOf(root, 'hand_left'), warhead: root.getObjectByName('warhead') };
        ok(path, `${tris} triangles, ${sz.z.toFixed(2)} m long`);
      } else if (kind === 'items') {
        if (name === 'player_hands') {
          if (!root.getObjectByName('hand_R') || !root.getObjectByName('hand_L')) { skip(path, 'needs parts hand_R and hand_L'); continue; }
          if (tris > BUDGET.hands) { skip(path, `${tris} triangles, budget ${BUDGET.hands}`); continue; }
          ART.hands = root;
        } else {
          const budget = name.startsWith('upgrade_') ? BUDGET.upgrade : BUDGET.item;
          if (tris > budget) { skip(path, `${tris} triangles, budget ${budget}`); continue; }
          ART.items[name] = root;
        }
        ok(path, `${tris} triangles`);
      }
    } catch (e) {
      skip(path, `could not be read (${e.message || e})`);
    }
  }
  if (!R.length) R.push('No art files yet: everything is the code-drawn placeholder art.');
  ART.ready = true;
  return ART;
}

/** Copy of a loaded model (each soldier or pickup needs its own). */
export function cloneArt(root) {
  return root.clone(true);
}
