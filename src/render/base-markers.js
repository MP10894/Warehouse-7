// Ground markings in your base once it is secured: a square with a dashed yellow-and-black
// hazard border and an icon where each upgrade is built, and dashed lines where the walls
// will go (or where wall sections have been blown away). Markings are faint until you carry
// the crate a spot needs, then they pulse. A spot whose upgrade is at its top level is
// cleared away. Built lockers get a small floating icon with their level.
// Reads the world only; sizes and opacity are in settings.json → markers.
import * as THREE from 'three';
import { makeCanvas, pixelTexture } from './textures.js';
import { terrainHeight } from '../sim/terrain.js';
import { spotUseful, maxLevel, missingWallCells } from '../sim/base.js';

const YELLOW = '#f2c21a', BLACK = '#1b1a18';

function drawIcon(g, kind, cx, cy, s) {
  g.fillStyle = YELLOW; g.strokeStyle = BLACK; g.lineWidth = Math.max(1, s / 10);
  const rr = (x, y, w, h) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, h / 2.5) : g.rect(x, y, w, h); g.fill(); g.stroke(); };
  if (kind === 'walls') {           // stacked sandbags
    const w = s * 0.42, h = s * 0.24;
    rr(cx - w - 1, cy + 1, w, h); rr(cx + 1, cy + 1, w, h); rr(cx - w / 2, cy - h, w, h);
  } else if (kind === 'ammo') {     // three cartridges
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * s * 0.28, w = s * 0.18, h = s * 0.62;
      g.beginPath();
      g.moveTo(x - w / 2, cy + h / 2); g.lineTo(x - w / 2, cy - h / 6); g.lineTo(x, cy - h / 2); g.lineTo(x + w / 2, cy - h / 6); g.lineTo(x + w / 2, cy + h / 2); g.closePath();
      g.fill(); g.stroke();
    }
  } else if (kind === 'medical') {  // cross
    const a = s * 0.22, b = s * 0.66;
    g.beginPath();
    g.moveTo(cx - a / 2, cy - b / 2); g.lineTo(cx + a / 2, cy - b / 2); g.lineTo(cx + a / 2, cy - a / 2); g.lineTo(cx + b / 2, cy - a / 2);
    g.lineTo(cx + b / 2, cy + a / 2); g.lineTo(cx + a / 2, cy + a / 2); g.lineTo(cx + a / 2, cy + b / 2); g.lineTo(cx - a / 2, cy + b / 2);
    g.lineTo(cx - a / 2, cy + a / 2); g.lineTo(cx - b / 2, cy + a / 2); g.lineTo(cx - b / 2, cy - a / 2); g.lineTo(cx - a / 2, cy - a / 2);
    g.closePath(); g.fill(); g.stroke();
  } else {                          // armour: a shield
    const w = s * 0.56, h = s * 0.66;
    g.beginPath();
    g.moveTo(cx - w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy);
    g.quadraticCurveTo(cx + w / 2, cy + h * 0.35, cx, cy + h / 2); g.quadraticCurveTo(cx - w / 2, cy + h * 0.35, cx - w / 2, cy);
    g.closePath(); g.fill(); g.stroke();
  }
}

/** The square: a dashed hazard border (diagonal yellow and black stripes) and the icon. */
function spotTexture(kind) {
  const N = 64, B = 6;
  const c = makeCanvas(N, N, g => {
    g.clearRect(0, 0, N, N);
    const stripe = (x, y) => (Math.floor((x + y) / 3) % 2 ? YELLOW : BLACK);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const inBorder = x < B || y < B || x >= N - B || y >= N - B;
      if (!inBorder) continue;
      const along = (y < B || y >= N - B) ? x : y;
      if (along % 14 >= 10) continue;   // gaps make it a dashed line
      g.fillStyle = stripe(x, y); g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = 'rgba(27,26,24,0.55)';
    g.beginPath(); g.arc(N / 2, N / 2, 15, 0, Math.PI * 2); g.fill();
    drawIcon(g, kind, N / 2, N / 2, 24);
  });
  const t = pixelTexture(c, false);
  return t;
}

/** A dash pattern for the wall lines (repeats along the line, two dashes per metre). */
function dashTexture() {
  return pixelTexture(makeCanvas(16, 4, g => {
    g.clearRect(0, 0, 16, 4);
    for (let x = 0; x < 16; x++) {
      if (x % 8 >= 5) continue;
      for (let y = 0; y < 4; y++) { g.fillStyle = Math.floor((x + y) / 2) % 2 ? YELLOW : BLACK; g.fillRect(x, y, 1, 1); }
    }
  }));
}

/** Floating badge over a built locker: the icon and one pip per level. */
function badgeTexture(kind, level, max) {
  return pixelTexture(makeCanvas(32, 40, g => {
    g.clearRect(0, 0, 32, 40);
    g.fillStyle = 'rgba(27,26,24,0.75)';
    g.beginPath(); g.arc(16, 15, 14, 0, Math.PI * 2); g.fill();
    drawIcon(g, kind, 16, 15, 20);
    const w = 6, gap = 2, x0 = 16 - (max * w + (max - 1) * gap) / 2;
    for (let i = 0; i < max; i++) {
      g.fillStyle = i < level ? YELLOW : 'rgba(27,26,24,0.75)';
      g.fillRect(Math.round(x0 + i * (w + gap)), 32, w, 5);
    }
  }), false);
}

export function createBaseMarkers(scene, settings) {
  const group = new THREE.Group();
  scene.add(group);
  const spotTex = {}, badgeTex = {};
  const dash = dashTexture();
  const lineMat = new THREE.MeshBasicMaterial({ map: dash, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
  let key = null, lastWorld = null, spots = [], lines = null, badges = [], lineVersion = -1, t = 0;

  function clear() {
    for (const s of spots) { group.remove(s.mesh); s.mesh.material.dispose(); }
    for (const b of badges) { group.remove(b.sprite); b.sprite.material.dispose(); }
    if (lines) { group.remove(lines); lines.geometry.dispose(); lines = null; }
    spots = []; badges = []; lineVersion = -1;
  }

  function build(world) {
    clear();
    const size = settings.markers?.spot_size ?? 2.2;
    for (const s of world.base.buildSpots) {
      const kind = s.upgrade;
      const tex = spotTex[kind] || (spotTex[kind] = spotTexture(kind));
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(s.x + 0.5, terrainHeight(world.terrain, s.x + 0.5, s.z + 0.5) + 0.04, s.z + 0.5);
      group.add(mesh);
      spots.push({ spot: s, mesh });
      if (kind !== 'walls') {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
        sprite.scale.set(0.55, 0.69, 1);
        sprite.position.set(s.x + 0.5, mesh.position.y + 1.55, s.z + 0.5);
        sprite.visible = false;
        group.add(sprite);
        badges.push({ spot: s, sprite, shown: '', baseY: sprite.position.y });
      }
    }
  }

  /** Dashed lines along the wall plan wherever a sandbag is missing. */
  function buildLines(world) {
    if (lines) { group.remove(lines); lines.geometry.dispose(); lines = null; }
    lineVersion = world.voxelVersion;
    const spot = world.base.buildSpots.find(s => s.upgrade === 'walls');
    if (!spot) return;
    const missing = new Set(missingWallCells(world).map(([x, z]) => `${x},${z}`));
    if (!missing.size) return;
    const pos = [], uv = [], w = 0.09;
    for (const r of world.base.wallPlan) {
      const alongX = (r.w || 1) >= (r.d || 1);
      for (let dz = 0; dz < (r.d || 1); dz++) for (let dx = 0; dx < (r.w || 1); dx++) {
        const x = r.x + dx, z = r.z + dz;
        if (!missing.has(`${x},${z}`)) continue;
        const y = terrainHeight(world.terrain, x + 0.5, z + 0.5) + 0.05;
        const q = alongX
          ? [[x, y, z + 0.5 - w], [x + 1, y, z + 0.5 - w], [x + 1, y, z + 0.5 + w], [x, y, z + 0.5 + w]]
          : [[x + 0.5 - w, y, z], [x + 0.5 + w, y, z], [x + 0.5 + w, y, z + 1], [x + 0.5 - w, y, z + 1]];
        const u0 = alongX ? x : z;
        const quv = alongX ? [[u0, 0], [u0 + 1, 0], [u0 + 1, 1], [u0, 1]] : [[u0, 0], [u0, 1], [u0 + 1, 1], [u0 + 1, 0]];
        for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...q[i]); uv.push(...quv[i]); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    lines = new THREE.Mesh(geo, lineMat);
    group.add(lines);
  }

  return {
    reset() { clear(); key = null; lastWorld = null; },
    update(world, player, dt) {
      t += dt;
      const b = world.base;
      if (world !== lastWorld) { lastWorld = world; key = null; clear(); }
      const k = b.claimed ? `${world.levelId}:${b.index}` : null;
      if (k !== key) { key = k; clear(); if (k) build(world); }
      if (!b.claimed) return;
      const faint = settings.markers?.faint_opacity ?? 0.55, speed = settings.markers?.pulse_speed ?? 4;
      const carrying = player && player.carrying ? player.carrying.item : null;
      const pulse = 0.5 + 0.5 * Math.sin(t * speed);
      let wallsWanted = false;
      for (const s of spots) {
        const useful = spotUseful(world, s.spot);
        s.mesh.visible = useful;
        const hot = useful && carrying === s.spot.needs;
        if (s.spot.upgrade === 'walls' && useful) wallsWanted = hot ? 2 : 1;
        s.mesh.material.opacity = hot ? 0.65 + 0.35 * pulse : faint;
        const sc = hot ? 1 + 0.06 * pulse : 1;
        s.mesh.scale.set(sc, sc, 1);
      }
      for (const bd of badges) {
        const up = b.upgrades[bd.spot.upgrade];
        const show = up && up.level > 0 && up.piece;
        bd.sprite.visible = !!show;
        if (!show) continue;
        const max = maxLevel(world, bd.spot.upgrade), id = `${bd.spot.upgrade}:${up.level}:${max}`;
        if (bd.shown !== id) {
          bd.sprite.material.map = badgeTex[id] || (badgeTex[id] = badgeTexture(bd.spot.upgrade, up.level, max));
          bd.sprite.material.needsUpdate = true;
          bd.shown = id;
        }
        bd.sprite.position.y = bd.baseY + Math.sin(t * 2) * 0.04;
      }
      if (lineVersion !== world.voxelVersion) buildLines(world);
      if (lines) {
        lines.visible = !!wallsWanted;
        lineMat.opacity = wallsWanted === 2 ? 0.65 + 0.35 * pulse : faint;
      }
    }
  };
}
