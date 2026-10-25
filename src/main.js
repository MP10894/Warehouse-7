// Wires everything together and runs the game loop.
//
//   input ──► command ──► sim (stepWorld) ──► world state + events
//                                              │
//                     graphics, sound, HUD ◄───┘   (read-only)
//
// Co-op: the HOST runs stepWorld with both players' commands and publishes a snapshot of
// the world every frame; the GUEST doesn't simulate, it copies the host's snapshot into
// its own world, moves its own player locally (so walking feels instant) and sends its
// command. See src/net/.
import * as THREE from 'three';
import { DATA } from './data/index.js';
import { createWorld } from './sim/world.js';
import { stepWorld } from './sim/step.js';
import { walkPlayer } from './sim/players.js';
import { createView } from './render/view.js';
import { makeTextures } from './render/textures.js';
import { loadArt } from './render/assets.js';
import { createRecoil } from './input/recoil.js';
import { createAimAssist } from './input/aim-assist.js';
import { buildTerrain } from './render/terrain-mesh.js';
import { createBlockMeshes } from './render/blocks-mesh.js';
import { createDecor } from './render/decor.js';
import { createWorldView } from './render/world-view.js';
import { createEffects } from './render/effects.js';
import { createFpWeapon } from './render/fp-weapon.js';
import { createWeatherFx } from './render/weather-fx.js';
import { createBaseMarkers } from './render/base-markers.js';
import { createHud, createMinimap } from './render/hud.js';
import { createInput } from './input/input.js';
import { createAudio } from './audio/audio.js';
import { createMusic } from './audio/music.js';
import { createDomHud } from './ui/dom-hud.js';
import { createArmoury } from './ui/armoury.js';
import { createScreens } from './ui/screens.js';
import { createTuning } from './ui/tuning.js';
import { getTransport } from './net/transport.js';
import { createHostEncoder, createGuestDecoder } from './net/snapshot.js';

/** This build's version (package version + commit), shown on the menu and checked in co-op. */
export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// As a website (GitHub Pages / the home-screen app), keep a copy for offline play and pick up
// new versions: see public/sw.js. Not inside claude.ai, and not while developing.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.claude && !import.meta.env.DEV) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

const S = DATA.settings;
const STEP = 1 / S.world.fixed_step_hz;
const $ = id => document.getElementById(id);

const app = $('app');
const view = createView({ app, viewCanvas: $('view'), hudCanvas: $('hud'), settings: S });
const handlers = { start: null, coop: null };
const screens = createScreens({ view, onStart: () => handlers.start && handlers.start(), onCoop: () => handlers.coop && handlers.coop(), onLevel: id => handlers.level && handlers.level(id) });

if (!view) {
  screens.showError('No WebGL', 'This browser could not start WebGL, which the game needs.');
} else {
  // tuning first: values saved on this device must be in place before the world is made
  let paused = false;
  const tuning = createTuning({
    settings: S,
    onOpen: () => { if (role === 'solo') paused = true; input.setEnabled(false); },
    onClose: () => { paused = false; acc = 0; if (mode === 'playing') input.setEnabled(true); },
    onChange: path => { if (path.startsWith('camera.')) view.resize(); if (path.startsWith('decor.') && scenery.decor) scenery.decor.rebuild(); if (path.startsWith('audio.')) music.refresh(); }
  });
  view.resize();

  let role = 'solo';          // 'solo' | 'host' | 'guest'
  let localId = 'p1';
  let mode = 'menu';          // 'menu' | 'lobby' | 'playing' | 'won' | 'lost'
  // the chosen level is remembered on this device; the host's choice decides in co-op
  let levelId = S.level;
  try { const saved = localStorage.getItem('w7-level'); if (saved && DATA.levels[saved]) levelId = saved; } catch (e) { /* storage unavailable */ }
  if (!DATA.levels[levelId]) levelId = Object.keys(DATA.levels)[0];
  const newWorld = (seed, ids) => createWorld({ data: DATA, levelId, seed, playerIds: ids });
  let world = newWorld((Math.random() * 1e9) | 0, ['p1']);

  const tex = makeTextures();
  const scenery = { terrain: null, blocks: null, decor: null };
  function buildScenery() {
    // the ground and buildings are rebuilt for each new run (walls may have been destroyed)
    if (scenery.terrain) view.scene.remove(scenery.terrain);
    view.scene.children.filter(c => c.userData.blocks).forEach(c => view.scene.remove(c));
    scenery.terrain = buildTerrain(view.scene, world, tex);
    scenery.blocks = createBlockMeshes(view.scene, world, tex);
    scenery.decor = createDecor(view.scene, world, S);
  }
  buildScenery();
  const worldView = createWorldView(view.scene, tex, localId);
  const effects = createEffects(view.scene);
  const fp = createFpWeapon();
  // drawn art replaces placeholders as soon as it has loaded (usually before you press Start)
  loadArt(tex).then(art => {
    worldView.reset(); fp.refresh();
    tuning.setArtReport(art.report);
    console.log('[art]\n' + art.report.join('\n'));
  });
  const weatherFx = createWeatherFx(view.scene, S);
  const markers = createBaseMarkers(view.scene, S);
  const hud = createHud();
  const minimap = createMinimap($('minimap'));
  const audio = createAudio();
  const music = createMusic(S);
  const domHud = createDomHud();
  const buttons = { fire: $('fire'), ads: $('ads'), reload: $('reload'), swap: $('swap'), context: $('context'), grenade: $('grenade') };
  const input = createInput({ app, touchEl: $('touch'), stick: $('stick'), knob: $('knob'), buttons, view, settings: S });
  const aim = { yaw: 0, pitch: 0 };
  let acc = 0, shake = 0;
  // telescopic sights: how far into the scope view we are (0–1), and the reticle's drift
  let scopeK = 0, swayT = 0;
  const aimOut = { yaw: 0, pitch: 0 };
  // taps on RELOAD, SWAP and the use button wait here until a game step takes them: on a
  // fast screen many frames have no game step, and a tap read on such a frame was lost
  const taps = { reload: false, swap: false, interact: false, grenade: false, armoury: null };
  // the armoury panel at a built ammunition supply: picking a weapon becomes a command
  const armoury = createArmoury({ root: app, onPick: w => {
    if (role === 'guest') { net.armouryN++; net.armouryW = w; } else taps.armoury = w;
  } });
  const recoil = createRecoil();
  const assist = createAimAssist();
  // a shot's kick moves the aim now; recoil.update brings it back afterwards
  const applyKick = ev => {
    const before = aim.pitch;
    aim.pitch = Math.min(S.controls.max_pitch, aim.pitch + ev.kick);
    aim.yaw += ev.side;
    recoil.kick(aim.pitch - before, ev.side, S.ballistics.recoil_return ?? 1);
  };
  let fpsT = 0, fpsFrames = 0, prevFrame = 0;
  const fpsEl = $('fps'), partnerEl = $('partner'), tagEl = $('partnerTag'), tagText = tagEl.querySelector('span');
  const tagPos = new THREE.Vector3();
  const local = () => world.players.find(p => p.id === localId) || world.players[0];

  // ---------- co-op state ----------
  const net = {
    transport: null, session: null, code: '', run: 0,
    encoder: createHostEncoder(DATA), decoder: createGuestDecoder(DATA),
    edges: { fire: 0, reload: 0, swap: 0, interact: 0, grenade: 0 }, // guest: press counters it sends
    seen: { fire: 0, reload: 0, swap: 0, interact: 0, grenade: 0 },  // host: last counters it acted on
    prevFire: false, lostAt: 0, armouryN: 0, armouryW: '', seenArmoury: 0
  };

  function enterPlay(seed, ids, level) {
    audio.init();
    if (level && DATA.levels[level]) levelId = level;
    world = newWorld(seed, ids);
    buildScenery();
    worldView.reset(); effects.reset();
    worldView.setLocal(localId);
    const p = local();
    aim.yaw = p.yaw; aim.pitch = 0;
    acc = 0; shake = 0; recoil.reset(); assist.reset();
    taps.reload = taps.swap = taps.interact = taps.grenade = false; taps.armoury = null;
    armoury.close();
    mode = 'playing';
    screens.hide();
    input.setEnabled(true);
    tuning.setAvailable(true);
    domHud.toast(role === 'solo' ? 'SURVIVE — CLAIM A BASE' : 'CO-OP — STICK TOGETHER');
    setTimeout(() => { $('hint').hidden = true; }, 12000);
    $('hint').hidden = false;
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }

  function startSolo() { role = 'solo'; localId = 'p1'; enterPlay((Math.random() * 1e9) | 0, ['p1']); }

  function hostStart() {
    net.run++;
    net.encoder.forceFull();
    // the guest's counters keep counting across runs; act only on presses from now on
    const partner = net.session.partner();
    const c = partner && partner.state && partner.state.c;
    net.seen = c ? { fire: c[5], reload: c[6], swap: c[7], interact: c[8], grenade: c[9] || 0 } : { fire: 0, reload: 0, swap: 0, interact: 0, grenade: 0 };
    net.seenArmoury = partner && partner.state && partner.state.a ? partner.state.a[0] : 0;
    const seed = (Math.random() * 1e9) | 0;
    enterPlay(seed, ['p1', 'p2']);
    net.session.set({ role: 'host', run: net.run, seed, level: levelId, started: 1 });
  }

  handlers.start = () => (role === 'host' && net.session ? hostStart() : startSolo());
  handlers.level = id => {
    if (!DATA.levels[id] || id === levelId) return;
    levelId = id;
    try { localStorage.setItem('w7-level', id); } catch (e) { /* storage unavailable */ }
    world = newWorld((Math.random() * 1e9) | 0, ['p1']);
    buildScenery(); worldView.reset();
    screens.showMenu(world);
  };

  function leaveCoop() {
    if (net.session) net.session.leave();
    net.session = null; role = 'solo'; localId = 'p1';
    partnerEl.hidden = true;
    mode = 'menu';
    input.setEnabled(false);
    tuning.setAvailable(false);
    world = newWorld((Math.random() * 1e9) | 0, ['p1']);
    buildScenery(); worldView.reset(); worldView.setLocal('p1');
    screens.showMenu(world);
  }

  /** Plain-language message for a failed online connection. */
  function coopError(e, code) {
    const type = e && e.type;
    if (type === 'peer-unavailable') return `No game found with code ${code}. Check the code, and that your partner is on the Host screen.`;
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed')
      return 'Could not reach the online service. Check your internet connection and try again.';
    if (type === 'browser-incompatible') return 'This browser can’t make phone-to-phone connections. Try Chrome or Safari.';
    return 'The connection failed. Try again.';
  }

  handlers.coop = async () => {
    audio.init();
    screens.showCoop({ transportLabel: 'connecting…', onHost: () => {}, onJoin: () => {}, onBack: () => screens.showMenu(world) });
    if (!net.transport) net.transport = await getTransport();
    const t = net.transport;
    screens.showCoop({
      transportLabel: t ? t.label : 'not available here',
      error: t ? '' : 'Co-op needs a browser that can connect. Open the game from its claude.ai link.',
      onBack: () => screens.showMenu(world),
      onHost: async () => {
        if (!t) return;
        // (online: if someone else is already using that code, pick another)
        for (let tries = 0; ; tries++) {
          net.code = String(1000 + Math.floor(Math.random() * 9000));
          try { net.session = await t.join(net.code, 'host'); break; } catch (e) {
            if (e && e.type === 'unavailable-id' && tries < 5) continue;
            screens.showCoop({ transportLabel: t.label, error: coopError(e), onHost: () => handlers.coop(), onJoin: () => handlers.coop(), onBack: () => screens.showMenu(world) });
            return;
          }
        }
        role = 'host'; localId = 'p1'; mode = 'lobby';
        net.session.set({ app: 'w7', role: 'host', run: net.run, started: 0, v: VERSION });
        screens.showLobby({ role: 'host', code: net.code, onStart: hostStart, onLeave: leaveCoop });
      },
      onJoin: async code => {
        if (!t) return;
        net.code = code;
        try { net.session = await t.join(code, 'guest'); } catch (e) {
          screens.showCoop({ transportLabel: t.label, error: coopError(e, code), onHost: () => handlers.coop(), onJoin: () => handlers.coop(), onBack: () => screens.showMenu(world) });
          return;
        }
        role = 'guest'; localId = 'p2'; mode = 'lobby';
        net.decoder.reset();
        net.run = -1;
        net.edges = { fire: 0, reload: 0, swap: 0, interact: 0, grenade: 0 };
        net.session.set({ app: 'w7', role: 'guest', run: -1, v: VERSION });
        screens.showLobby({ role: 'guest', code, onLeave: leaveCoop });
      }
    });
  };

  // ---------- host: turn the guest's room state into a command ----------
  function guestCommand(first) {
    const partner = net.session && net.session.partner();
    const st = partner && partner.state;
    if (!st || st.role !== 'guest' || st.run !== net.run || !st.c || !st.pos) return {};
    const [mx, my, yaw, pitch, flags, fireN, reloadN, swapN, interactN, grenadeN = 0] = st.c;
    const cmd = { move: { x: mx / 100, y: my / 100 }, yaw: yaw / 1000, pitch: pitch / 1000, ads: !!(flags & 2), moving: !!(flags & 4), pos: st.pos.map(v => v / 100) };
    cmd.fire = !!(flags & 1);
    if (first) {
      if (fireN > net.seen.fire) { cmd.fire = true; net.seen.fire = fireN; }
      if (reloadN > net.seen.reload) { cmd.reload = true; net.seen.reload = reloadN; }
      if (swapN > net.seen.swap) { cmd.swap = true; net.seen.swap = swapN; }
      if (interactN > net.seen.interact) { cmd.interact = true; net.seen.interact = interactN; }
      if (grenadeN > net.seen.grenade) { cmd.grenade = true; net.seen.grenade = grenadeN; }
      if (st.a && st.a[0] > net.seenArmoury) { cmd.armoury = st.a[1]; net.seenArmoury = st.a[0]; }
    }
    return cmd;
  }

  function handleEvents(p) {
    for (const ev of world.events.splice(0)) {
      if (ev.type === 'shot' && ev.actorId === localId && role === 'guest') applyKick(ev);
      effects.handle(ev, world);
      worldView.handle(ev);
      fp.handle(ev, localId);
      hud.handle(ev, p);
      audio.handle(ev, p);
      domHud.handle(ev, localId);
      if (ev.type === 'blocks') { scenery.blocks.update(ev.cells || [], !!ev.rebuild); scenery.decor.update(ev.cells || []); }
      if (ev.type === 'explosion') shake = Math.max(shake, Math.max(0, 1 - Math.hypot(ev.x - p.x, ev.z - p.z) / 25));
      if (ev.type === 'hurt' && ev.targetId === localId) shake = Math.max(shake, 0.25);
      if (ev.type === 'status' && mode === 'playing') {
        mode = ev.status;
        input.setEnabled(false);
        tuning.setAvailable(false);
        screens.showResults(world, p, role === 'solo' ? null : { role, onLeave: leaveCoop });
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (prevFrame || now)) / 1000);
    prevFrame = now;
    let p = local();

    // co-op lobby and connection status
    if (net.session) {
      const partner = net.session.partner();
      const st = partner && partner.state;
      if (partner) net.lostAt = 0; else if (!net.lostAt) net.lostAt = now;
      const lost = net.lostAt && now - net.lostAt > 3000;
      // both phones must run the same version of the game
      const otherV = st && st.v, mismatch = !!(otherV && otherV !== VERSION);
      if (mode === 'lobby' && mismatch) {
        screens.setLobbyStatus(`Your partner has a different version of the game (theirs: ${otherV}, yours: ${VERSION}). Close the game on both phones and open it again while online to update, then try again.`, false);
      } else if (mode === 'lobby') {
        if (role === 'host') screens.setLobbyStatus(st && st.role === 'guest' ? 'Partner connected. Start when ready.' : 'Waiting for your partner to join…', !!(st && st.role === 'guest'));
        else {
          screens.setLobbyStatus(st && st.role === 'host' ? 'Connected. Waiting for the host to start…' : 'Looking for the host…');
          if (st && st.role === 'host' && st.started && st.run !== net.run && typeof st.seed === 'number') {
            net.run = st.run; net.decoder.reset();
            enterPlay(st.seed, ['p1', 'p2'], st.level);
            net.session.set({ run: net.run });
            p = local();
          }
        }
      } else if (role === 'guest' && st && st.role === 'host' && st.started && st.run !== net.run && typeof st.seed === 'number') {
        // the host started another run (from the results screen)
        net.run = st.run; net.decoder.reset();
        enterPlay(st.seed, ['p1', 'p2'], st.level);
        net.session.set({ run: net.run });
        p = local();
      }
      partnerEl.hidden = mode !== 'playing';
      partnerEl.textContent = lost ? 'PARTNER: CONNECTION LOST' : `PARTNER: ${role === 'host' ? 'GUEST' : 'HOST'} CONNECTED`;
    }

    if (mode === 'playing' && !paused) {
      const inp = input.sample();
      aim.yaw += -inp.lookX + inp.turn * 2.4 * dt;
      aim.pitch = Math.max(-S.controls.max_pitch, Math.min(S.controls.max_pitch, aim.pitch - inp.lookY));
      // through a scope the aim drifts a little (more while walking): it moves where you shoot too
      swayT += dt;
      const lp = local();
      // the use button at the ammunition supply opens the armoury instead of acting in the game
      if (inp.interact && lp.context && lp.context.kind === 'armoury') { armoury.toggle(world, lp); inp.interact = false; }
      armoury.update(world, lp);
      const sw = scopeK * (S.controls.scope_sway ?? 0.003) * (lp.moving ? (S.controls.scope_sway_moving ?? 3) : 1);
      aimOut.yaw = aim.yaw + Math.sin(swayT * 0.9) * sw;
      aimOut.pitch = aim.pitch + Math.sin(swayT * 1.7) * sw * 0.6;

      if (role !== 'guest') {
        const base = { move: { x: inp.moveX, y: inp.moveY }, fire: inp.fire, ads: inp.ads };
        taps.reload ||= inp.reload; taps.swap ||= inp.swap; taps.interact ||= inp.interact; taps.grenade ||= inp.grenade;
        acc += dt;
        let steps = 0, first = true;
        while (acc >= STEP && steps < 5) {
          const cmd = { ...base, yaw: aimOut.yaw, pitch: aimOut.pitch };
          if (first) { cmd.reload = taps.reload; cmd.swap = taps.swap; cmd.interact = taps.interact; cmd.grenade = taps.grenade; cmd.armoury = taps.armoury; taps.reload = taps.swap = taps.interact = taps.grenade = false; taps.armoury = null; }
          const cmds = { [localId]: cmd };
          if (role === 'host') cmds.p2 = guestCommand(first);
          first = false;
          stepWorld(world, cmds, STEP);
          acc -= STEP; steps++;
          // recoil from this step's shots moves the aim before the next step
          for (const ev of world.events) {
            if (ev.type === 'shot' && ev.actorId === localId && !ev._applied) {
              ev._applied = true;
              applyKick(ev);
            }
          }
        }
        if (steps === 5) acc = 0;
        if (role === 'host') {
          net.encoder.record(world, world.events);
          net.session.set(net.encoder.encode(world));
        }
      } else {
        // guest: copy the host's world, move ourselves locally, send our command
        const partner = net.session && net.session.partner();
        if (partner && partner.state && partner.state.run === net.run) {
          world.events.push(...net.decoder.apply(world, partner.state, localId));
        }
        p = local();
        if (p.alive && !p.downed) {
          p.yaw = aimOut.yaw; p.pitch = aimOut.pitch; p.ads = inp.ads;
          walkPlayer(world, p, { x: inp.moveX, y: inp.moveY }, dt);
        }
        if (inp.fire && !net.prevFire) net.edges.fire++;
        net.prevFire = inp.fire;
        if (inp.reload) net.edges.reload++;
        if (inp.swap) net.edges.swap++;
        if (inp.interact) net.edges.interact++;
        if (inp.grenade) net.edges.grenade++;
        const e = net.edges;
        net.session.set({
          run: net.run,
          c: [Math.round(inp.moveX * 100), Math.round(inp.moveY * 100), Math.round(aimOut.yaw * 1000), Math.round(aimOut.pitch * 1000),
            (inp.fire ? 1 : 0) | (inp.ads ? 2 : 0) | (p.moving ? 4 : 0), e.fire, e.reload, e.swap, e.interact, e.grenade],
          pos: [Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100)],
          a: [net.armouryN, net.armouryW]
        });
      }

      handleEvents(p);
      // the view comes back down to where you were aiming once you stop firing
      recoil.update(aim, dt, S.ballistics);
      // while aiming down sights, help settle the crosshair on a nearby visible enemy
      assist.update(aim, dt, world, local(), S);
    } else if (mode === 'playing' && role === 'host' && net.session) {
      // host's tuning panel is open: the game keeps running for the guest
      acc += dt;
      while (acc >= STEP) { stepWorld(world, { p1: {}, p2: guestCommand(true) }, STEP); acc -= STEP; }
      net.encoder.record(world, world.events);
      net.session.set(net.encoder.encode(world));
      handleEvents(p);
    }

    shake = Math.max(0, shake - dt * 2);
    const slot = p.slots[p.active];
    const wdef = slot ? DATA.weapons[slot.w] : null;
    const scope = wdef && wdef.scope > 1 ? wdef.scope : 0;
    input.setScoped(!!scope);
    const scopedNow = !!scope && p.ads && p.alive && !p.downed && mode === 'playing';
    scopeK += ((scopedNow ? 1 : 0) - scopeK) * Math.min(1, dt * 12);
    if (!scopedNow && scopeK < 0.02) scopeK = 0;
    // a scope magnifies (4 = 4×); iron sights use the workbook's zoom
    const zoom = p.ads && wdef ? (scope ? 1 / scope : wdef.ads_zoom) : 1;
    // title screen without its art: the level slowly turns behind the name
    if (screens.titleShowing && !screens.hasTitleArt) { aim.yaw += dt * 0.05; aim.pitch = 0.04; }
    if (mode !== 'playing') { aimOut.yaw = aim.yaw; aimOut.pitch = aim.pitch; }
    view.follow(p, scopeK > 0 ? aimOut : aim, zoom, shake, dt);
    worldView.sync(world, dt);
    effects.update(dt);
    weatherFx.update(dt, world, view.camera);
    if (scenery.decor) scenery.decor.tick(dt, view.camera);
    markers.update(world, mode === 'playing' ? p : null, dt);
    audio.setStorm(weatherFx.level);
    music.update(dt, { menu: mode !== 'playing', world, player: mode === 'playing' ? p : null });
    fp.update(dt, p, view.W / view.H);
    // looking through the scope: the gun is out of sight, the scope picture covers the view
    view.render(mode === 'playing' && scopeK < 0.6 ? fp : null);
    hud.draw(view.hud, view.W, view.H, mode === 'playing' ? p : null, world, dt, scopeK);
    minimap.draw(world, p, now);
    domHud.frame(dt, world, p, weatherFx.level * 0.8);

    // marker above your co-op partner (also visible through walls, so you can find each other)
    const mate = role !== 'solo' && mode === 'playing' ? world.players.find(q => q.id !== localId && q.alive) : null;
    let showTag = false;
    if (mate) {
      tagPos.set(mate.x, mate.y + (mate.downed ? 1.1 : 2.05), mate.z).project(view.camera);
      if (tagPos.z < 1 && Math.abs(tagPos.x) < 1.05 && Math.abs(tagPos.y) < 1.05) {
        showTag = true;
        tagEl.style.left = `${(tagPos.x + 1) / 2 * view.localW()}px`;
        tagEl.style.top = `${(1 - tagPos.y) / 2 * view.localH()}px`;
        const d = Math.round(Math.hypot(mate.x - p.x, mate.z - p.z));
        tagText.textContent = mate.downed ? `PARTNER DOWN · ${d} m` : `PARTNER · ${d} m`;
      }
    }
    tagEl.hidden = !showTag;

    fpsFrames++; fpsT += dt;
    if (fpsT >= 0.5) {
      const fps = Math.round(fpsFrames / fpsT);
      fpsEl.hidden = !tuning.showFps || mode !== 'playing';
      fpsEl.textContent = `${fps} fps · ${view.W}×${view.H}`;
      fpsEl.classList.toggle('slow', fps < 40);
      fpsT = 0; fpsFrames = 0;
    }
  }

  aim.yaw = local().yaw;
  // handle for automated browser tests
  window.__game = { get world() { return world; }, get scenery() { return scenery; }, get music() { return music; }, audio, aim, fp, view, get role() { return role; }, get mode() { return mode; }, get code() { return net.code; } };
  // the title screen first; Start leads to the briefing and level menu
  // sound can only start after a tap or key press: the first one anywhere unlocks it, so the
  // title music starts as soon as you touch the screen
  const unlock = () => { audio.init(); music.attach(audio.context()); };
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', () => audio.pause(document.hidden));
  screens.showTitle(() => { unlock(); screens.showMenu(world); });
  requestAnimationFrame(frame);
}
