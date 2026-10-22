// Wires everything together and runs the game loop.
//
//   input ──► command ──► sim (stepWorld) ──► world state + events
//                                              │
//                     graphics, sound, HUD ◄───┘   (read-only)
//
// For co-op, a network layer slots in between "command" and "sim": the host runs
// stepWorld with both players' commands and sends world state + events to the guest.
import { DATA } from './data/index.js';
import { createWorld } from './sim/world.js';
import { stepWorld } from './sim/step.js';
import { createView } from './render/view.js';
import { makeTextures } from './render/textures.js';
import { buildTerrain } from './render/terrain-mesh.js';
import { createBlockMeshes } from './render/blocks-mesh.js';
import { createWorldView } from './render/world-view.js';
import { createEffects } from './render/effects.js';
import { createFpWeapon } from './render/fp-weapon.js';
import { createWeatherFx } from './render/weather-fx.js';
import { createHud, createMinimap } from './render/hud.js';
import { createInput } from './input/input.js';
import { createAudio } from './audio/audio.js';
import { createDomHud } from './ui/dom-hud.js';
import { createScreens } from './ui/screens.js';
import { createTuning } from './ui/tuning.js';

const LOCAL_ID = 'p1';
const S = DATA.settings;
const STEP = 1 / S.world.fixed_step_hz;
const $ = id => document.getElementById(id);

const app = $('app');
const view = createView({ app, viewCanvas: $('view'), hudCanvas: $('hud'), settings: S });
let startHandler = null;
const screens = createScreens({ view, onStart: () => startHandler && startHandler() });
const newWorld = () => createWorld({ data: DATA, levelId: S.level, seed: (Math.random() * 1e9) | 0, playerIds: [LOCAL_ID] });

if (!view) {
  screens.showError('No WebGL', 'This browser could not start WebGL, which the game needs.');
} else {
  // tuning first: values saved on this device must be in place before the world is made
  let paused = false;
  const tuning = createTuning({
    settings: S,
    onOpen: () => { paused = true; input.setEnabled(false); },
    onClose: () => { paused = false; acc = 0; if (mode === 'playing') input.setEnabled(true); },
    onChange: path => { if (path.startsWith('camera.')) view.resize(); }
  });
  view.resize();
  let world = newWorld();
  let mode = 'menu';
  const tex = makeTextures();
  const scenery = { terrain: null, blocks: null };
  function buildScenery() {
    // the ground and buildings are rebuilt for each new run (walls may have been destroyed)
    if (scenery.terrain) view.scene.remove(scenery.terrain);
    view.scene.children.filter(c => c.userData.blocks).forEach(c => view.scene.remove(c));
    scenery.terrain = buildTerrain(view.scene, world, tex);
    scenery.blocks = createBlockMeshes(view.scene, world, tex);
  }
  buildScenery();
  const worldView = createWorldView(view.scene, tex, LOCAL_ID);
  const effects = createEffects(view.scene);
  const fp = createFpWeapon();
  const weatherFx = createWeatherFx(view.scene, S);
  const hud = createHud();
  const minimap = createMinimap($('minimap'));
  const audio = createAudio();
  const domHud = createDomHud();
  const buttons = { fire: $('fire'), ads: $('ads'), reload: $('reload'), swap: $('swap'), context: $('context') };
  const input = createInput({ app, touchEl: $('touch'), stick: $('stick'), knob: $('knob'), buttons, view, settings: S });
  const aim = { yaw: 0, pitch: 0 };
  let acc = 0, shake = 0, recoilDebt = 0;
  let fpsT = 0, fpsFrames = 0;
  const fpsEl = $('fps');
  const local = () => world.players.find(p => p.id === LOCAL_ID);

  function begin() {
    audio.init();
    world = newWorld();
    buildScenery();
    worldView.reset(); effects.reset();
    const p = local();
    aim.yaw = p.yaw; aim.pitch = 0;
    acc = 0; shake = 0; recoilDebt = 0;
    mode = 'playing';
    screens.hide();
    tuning.setAvailable(true);
    input.setEnabled(true);
    domHud.toast('SURVIVE — CLAIM A BASE');
    setTimeout(() => { $('hint').hidden = true; }, 12000);
    $('hint').hidden = false;
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }
  startHandler = begin;

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const p = local();

    if (mode === 'playing' && !paused) {
      const inp = input.sample();
      aim.yaw += -inp.lookX + inp.turn * 2.4 * dt;
      aim.pitch = Math.max(-S.controls.max_pitch, Math.min(S.controls.max_pitch, aim.pitch - inp.lookY));
      const base = { move: { x: inp.moveX, y: inp.moveY }, fire: inp.fire, ads: inp.ads };
      acc += dt;
      let steps = 0, first = true;
      while (acc >= STEP && steps < 5) {
        const cmd = { ...base, yaw: aim.yaw, pitch: aim.pitch };
        if (first) { cmd.reload = inp.reload; cmd.swap = inp.swap; cmd.interact = inp.interact; first = false; }
        stepWorld(world, { [LOCAL_ID]: cmd }, STEP);
        acc -= STEP; steps++;
        // recoil from this step's shots moves the aim before the next step
        for (const ev of world.events) {
          if (ev.type === 'shot' && ev.actorId === LOCAL_ID && !ev._applied) {
            ev._applied = true;
            aim.pitch = Math.min(S.controls.max_pitch, aim.pitch + ev.kick);
            aim.yaw += ev.side;
            recoilDebt += ev.kick;
          }
        }
      }
      if (steps === 5) acc = 0;
      // optional recoil recovery: the view drifts back down by a share of the kick
      if (S.ballistics.recoil_recovery > 0 && recoilDebt > 0) {
        const back = recoilDebt * Math.min(1, S.ballistics.recoil_recovery * 8 * dt);
        aim.pitch -= back; recoilDebt -= back;
      } else recoilDebt = 0;

      for (const ev of world.events.splice(0)) {
        effects.handle(ev, world);
        worldView.handle(ev);
        fp.handle(ev, LOCAL_ID);
        hud.handle(ev, p);
        audio.handle(ev, p);
        domHud.handle(ev, LOCAL_ID);
        if (ev.type === 'blocks') scenery.blocks.update(ev.cells || [], !!ev.rebuild);
        if (ev.type === 'explosion') shake = Math.max(shake, Math.max(0, 1 - Math.hypot(ev.x - p.x, ev.z - p.z) / 25));
        if (ev.type === 'hurt' && ev.targetId === LOCAL_ID) shake = Math.max(shake, 0.25);
        if (ev.type === 'status') {
          mode = world.status;
          input.setEnabled(false);
          tuning.setAvailable(false);
          screens.showResults(world, p);
        }
      }
    }

    shake = Math.max(0, shake - dt * 2);
    const slot = p.slots[p.active];
    const zoom = p.ads && slot ? DATA.weapons[slot.w].ads_zoom : 1;
    view.follow(p, mode === 'playing' || mode === 'menu' ? aim : aim, zoom, shake, dt);
    worldView.sync(world, dt);
    effects.update(dt);
    weatherFx.update(dt, world, view.camera);
    audio.setStorm(weatherFx.level);
    fp.update(dt, p, view.W / view.H);
    view.render(mode === 'playing' ? fp : null);
    hud.draw(view.hud, view.W, view.H, mode === 'playing' ? p : null, world, dt);
    minimap.draw(world, p, now);
    domHud.frame(dt, world, p, weatherFx.level * 0.8);

    fpsFrames++; fpsT += (now - (frame.prev || now)) / 1000; frame.prev = now;
    if (fpsT >= 0.5) {
      const fps = Math.round(fpsFrames / fpsT);
      fpsEl.hidden = !tuning.showFps;
      fpsEl.textContent = `${fps} fps · ${view.W}×${view.H}`;
      fpsEl.classList.toggle('slow', fps < 40);
      fpsT = 0; fpsFrames = 0;
    }
  }

  aim.yaw = local().yaw;
  // handle for automated browser tests
  window.__game = { get world() { return world; }, aim };
  screens.showMenu(world);
  requestAnimationFrame(frame);
}
