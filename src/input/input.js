// Turns touches, mouse and keyboard into one simple per-frame sample:
//   { moveX, moveY, lookX, lookY, turn, fire, ads, reload, swap, interact, grenade, strike }
// reload / swap / interact are "pressed since last frame". main.js turns the sample into
// a player command for the simulation.
export function createInput({ app, touchEl, stick, knob, buttons, view, settings }) {
  const c = settings.controls;
  const keys = {};
  let enabled = false;
  let firePulse = false, fireKey = false, fireMouse = false, fireTouch = false, adsMouse = false, adsToggle = false, mouseDown = false;
  let lookX = 0, lookY = 0;
  let pressed = { reload: false, swap: false, interact: false, grenade: false, strike: false };
  let joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let look = { id: null, lx: 0, ly: 0 };
  const locked = () => document.pointerLockElement === touchEl;
  const adsActive = () => adsMouse || adsToggle;
  let scoped = false;   // aiming through a telescopic sight: slower look (settings → controls)
  const lookScale = () => (c.look_multiplier ?? 1) * (adsActive() ? (scoped ? c.scope_look_factor ?? 0.3 : c.ads_look_factor) : 1);

  addEventListener('keydown', e => {
    if (!enabled) return;
    if (!keys[e.code]) {
      if (e.code === 'KeyR') pressed.reload = true;
      if (e.code === 'KeyQ' || e.code === 'Digit1' || e.code === 'Digit2') pressed.swap = true;
      if (e.code === 'KeyE' || e.code === 'KeyF') pressed.interact = true;
      if (e.code === 'KeyG') pressed.grenade = true;
      if (e.code === 'KeyT') pressed.strike = true;
    }
    keys[e.code] = true;
    if (e.code === 'Space') { fireKey = true; firePulse = true; e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'Space') fireKey = false;
  });
  addEventListener('contextmenu', e => e.preventDefault());

  // Mouse buttons are read from e.buttons (which buttons are held right now), not from single
  // down/up events: while one button is held, pressing or releasing the other one sends no
  // pointerdown/pointerup at all, only a pointermove. That made left-click unreliable while
  // aiming with the right button.
  function mouseButtons(e) {
    if (!enabled) return;
    const left = !!(e.buttons & 1), right = !!(e.buttons & 2);
    if (left && !fireMouse) firePulse = true;
    fireMouse = mouseDown = left;
    adsMouse = right;
  }

  touchEl.addEventListener('pointerdown', e => {
    if (!enabled) return;
    if (e.pointerType === 'mouse') {
      if (!locked()) {
        try { const r = touchEl.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* not allowed here */ }
      }
      mouseButtons(e);
      return;
    }
    app.classList.add('touch');
    e.preventDefault();
    const q = view.toLocal(e);
    if (q.x < view.localW() * 0.42 && joy.id === null) {
      joy = { id: e.pointerId, ox: q.x, oy: q.y, x: 0, y: 0 };
      stick.style.display = 'block'; stick.style.left = q.x + 'px'; stick.style.top = q.y + 'px';
      knob.style.transform = '';
    } else if (look.id === null) {
      look = { id: e.pointerId, lx: q.x, ly: q.y };
    }
  });

  touchEl.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      mouseButtons(e);
      if (!locked() && mouseDown && enabled) { lookX += e.movementX * c.mouse_look_drag * lookScale(); lookY += e.movementY * c.mouse_look_drag * lookScale(); }
      return;
    }
    const q = view.toLocal(e);
    if (e.pointerId === joy.id) {
      let dx = q.x - joy.ox, dy = q.y - joy.oy;
      const l = Math.hypot(dx, dy), m = c.joystick_radius_px;
      if (l > m) { dx = dx / l * m; dy = dy / l * m; }
      joy.x = dx / m; joy.y = dy / m;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (e.pointerId === look.id) {
      lookX += (q.x - look.lx) * c.touch_look_x * lookScale();
      lookY += (q.y - look.ly) * c.touch_look_y * lookScale();
      look.lx = q.x; look.ly = q.y;
    }
  });

  function endPointer(e) {
    if (e.pointerType === 'mouse') {
      if (e.type === 'pointercancel') { mouseDown = fireMouse = adsMouse = false; return; }
      mouseButtons(e);
      return;
    }
    if (e.pointerId === joy.id) { joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; stick.style.display = 'none'; }
    if (e.pointerId === look.id) look = { id: null, lx: 0, ly: 0 };
  }
  touchEl.addEventListener('pointerup', endPointer);
  touchEl.addEventListener('pointercancel', endPointer);

  document.addEventListener('mousemove', e => {
    if (locked()) mouseButtons(e);
    if (locked() && enabled) { lookX += e.movementX * c.mouse_look_locked * lookScale(); lookY += e.movementY * c.mouse_look_locked * lookScale(); }
  });

  // On-screen buttons. FIRE can also be dragged to aim at the same time.
  const hold = (el, on, off) => {
    let id = null, lx = 0, ly = 0;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      app.classList.add('touch');
      id = e.pointerId; const q = view.toLocal(e); lx = q.x; ly = q.y;
      el.classList.add('on'); on();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id || el !== buttons.fire) return;
      const q = view.toLocal(e);
      lookX += (q.x - lx) * c.touch_look_x * lookScale(); lookY += (q.y - ly) * c.touch_look_y * lookScale();
      lx = q.x; ly = q.y;
    });
    const up = e => { if (e.pointerId === id) { id = null; el.classList.remove('on'); off(); } };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  hold(buttons.fire, () => { fireTouch = true; firePulse = true; }, () => { fireTouch = false; });
  hold(buttons.ads, () => { adsToggle = !adsToggle; buttons.ads.classList.toggle('active', adsToggle); }, () => {});
  hold(buttons.reload, () => { pressed.reload = true; }, () => {});
  hold(buttons.swap, () => { pressed.swap = true; }, () => {});
  hold(buttons.context, () => { pressed.interact = true; }, () => {});
  // the grenade button shows on desktop too (click it, or press G), so it doesn't switch to the phone layout
  if (buttons.grenade) {
    const g = buttons.grenade;
    g.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (!enabled) return;
      pressed.grenade = true;
      g.classList.add('on'); setTimeout(() => g.classList.remove('on'), 150);
    });
  }
  // the kill streak button (the mortar round): same, or press T
  if (buttons.strike) {
    const k = buttons.strike;
    k.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (!enabled) return;
      pressed.strike = true;
      k.classList.add('on'); setTimeout(() => k.classList.remove('on'), 150);
    });
  }

  if (matchMedia('(pointer:coarse)').matches) app.classList.add('touch');

  return {
    /** The weapon in hand has a scope (so aiming down sights looks through it). */
    setScoped(on) { scoped = !!on; },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        fireKey = fireMouse = fireTouch = mouseDown = adsMouse = adsToggle = false;
        buttons.ads.classList.remove('active');
        joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; look = { id: null, lx: 0, ly: 0 };
        stick.style.display = 'none';
        for (const b of Object.values(buttons)) b.classList.remove('on');
        if (document.exitPointerLock && locked()) document.exitPointerLock();
      }
    },
    /** Read and clear this frame's input. */
    sample() {
      let moveX = joy.x, moveY = joy.y;
      if (keys.KeyW || keys.ArrowUp) moveY -= 1;
      if (keys.KeyS || keys.ArrowDown) moveY += 1;
      if (keys.KeyD) moveX += 1;
      if (keys.KeyA) moveX -= 1;
      let turn = 0;
      if (keys.ArrowLeft) turn += 1;
      if (keys.ArrowRight) turn -= 1;
      const out = {
        moveX, moveY, lookX, lookY, turn,
        fire: enabled && (firePulse || fireKey || fireMouse || fireTouch),
        ads: enabled && adsActive(),
        ...pressed
      };
      lookX = 0; lookY = 0; firePulse = false;
      pressed = { reload: false, swap: false, interact: false, grenade: false, strike: false };
      return out;
    }
  };
}
