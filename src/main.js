// Wires everything together and runs the game loop.
//
//   input ──► command ──► sim (stepWorld) ──► world state + events
//                                              │
//                     graphics, sound, HUD ◄───┘   (read-only)
//
// For co-op, a network layer would slot in between "command" and "sim": the host runs
// stepWorld with both players' commands and sends world state + events to the guest.
import { DATA } from './data/index.js';
import { createWorld } from './sim/world.js';
import { stepWorld } from './sim/step.js';
import { createView } from './render/view.js';
import { makeAssets } from './render/textures.js';
import { buildLevel } from './render/level.js';
import { createEntityViews } from './render/entities.js';
import { createEffects } from './render/effects.js';
import { createFeedback } from './render/feedback.js';
import { drawHud } from './render/hud.js';
import { createInput } from './input/input.js';
import { createAudio } from './audio/audio.js';
import { createDomHud } from './ui/dom-hud.js';
import { createScreens } from './ui/screens.js';

const LOCAL_ID = 'p1';
const S = DATA.settings;
const STEP = 1 / S.world.fixed_step_hz;
const $ = id => document.getElementById(id);

const app = $('app');
const view = createView({ app, viewCanvas: $('view'), hudCanvas: $('hud'), settings: S });
let mode = 'menu';
let startHandler = null;
const start = () => { if (startHandler) startHandler(); };
let world = newWorld();
const screens = createScreens({ view, onStart: start });

if (!view) {
  screens.showError('No WebGL', 'This browser could not start WebGL, which the game needs.');
} else {
  const assets = makeAssets();
  const level = buildLevel(view.scene, world.map, assets);
  const entities = createEntityViews(view.scene, assets, level);
  const effects = createEffects(view.scene, assets);
  const feedback = createFeedback();
  const audio = createAudio();
  const domHud = createDomHud();
  const input = createInput({ app, touchEl: $('touch'), stick: $('stick'), knob: $('knob'), fireBtn: $('fire'), view, settings: S });
  const aim = { yaw: 0, pitch: 0 };
  let acc = 0;

  const local = () => world.players.find(p => p.id === LOCAL_ID);

  function begin() {
    audio.init();
    world = newWorld();
    entities.reset(); effects.reset(); feedback.reset();
    const p = local();
    aim.yaw = p.yaw; aim.pitch = p.pitch;
    acc = 0;
    mode = 'playing';
    screens.hide();
    input.setEnabled(true);
    domHud.toast('CLEAR THE WAREHOUSE');
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }
  startHandler = begin;

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const p = local();

    if (mode === 'playing') {
      const inp = input.sample();
      aim.yaw += -inp.lookX + inp.turn * S.player.keyboard_turn_speed * dt;
      aim.pitch = Math.max(-S.controls.max_pitch, Math.min(S.controls.max_pitch, aim.pitch - inp.lookY));
      const cmd = { move: { x: inp.moveX, y: inp.moveY }, yaw: aim.yaw, pitch: aim.pitch, fire: inp.fire };
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 5) { stepWorld(world, { [LOCAL_ID]: cmd }, STEP); acc -= STEP; steps++; }
      if (steps === 5) acc = 0;

      for (const ev of world.events.splice(0)) {
        effects.handle(ev);
        audio.handle(ev, p);
        feedback.handle(ev, LOCAL_ID);
        domHud.handle(ev, LOCAL_ID);
        if (ev.type === 'status') {
          mode = world.status;
          input.setEnabled(false);
          screens.showResults(world, p);
        }
      }
    }

    feedback.update(dt, p);
    view.follow(p, feedback, dt);
    entities.sync(world, view.camera, feedback.flashing);
    effects.update(dt);
    level.animate(now, feedback.flashing);
    view.render();
    drawHud(view.hud, view.W, view.H, p, feedback, assets.weapon);
    domHud.frame(dt, world, p, feedback);
  }

  screens.showMenu(world.total);
  requestAnimationFrame(frame);
}

function newWorld() {
  return createWorld({ data: DATA, levelText: DATA.levels.warehouse, seed: (Math.random() * 1e9) | 0, playerIds: [LOCAL_ID] });
}

