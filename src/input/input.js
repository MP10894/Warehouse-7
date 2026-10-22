// Turns touches, mouse and keyboard into one simple per-frame sample:
//   { moveX, moveY, lookX, lookY, turn, fire }
// main.js turns that into a player command for the simulation.
export function createInput({ app, touchEl, stick, knob, fireBtn, view, settings }) {
  const c = settings.controls;
  const keys = {};
  let enabled = false;
  let firingKey = false, firingMouse = false, firingTouch = false, mouseDown = false;
  let lookX = 0, lookY = 0;
  let joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let look = { id: null, lx: 0, ly: 0 };
  let fireId = null;
  const locked = () => document.pointerLockElement === touchEl;

  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') { firingKey = true; e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'Space') firingKey = false;
  });
  addEventListener('contextmenu', e => e.preventDefault());

  touchEl.addEventListener('pointerdown', e => {
    if (!enabled) return;
    if (e.pointerType === 'mouse') {
      if (!locked()) {
        try { const r = touchEl.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* not allowed here */ }
      }
      mouseDown = true; firingMouse = true;
      return;
    }
    app.classList.add('touch');
    e.preventDefault();
    const q = view.toLocal(e);
    if (q.x < view.localW() * .45 && joy.id === null) {
      joy = { id: e.pointerId, ox: q.x, oy: q.y, x: 0, y: 0 };
      stick.style.display = 'block'; stick.style.left = q.x + 'px'; stick.style.top = q.y + 'px';
      knob.style.transform = '';
    } else if (look.id === null) {
      look = { id: e.pointerId, lx: q.x, ly: q.y };
    }
  });

  touchEl.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      if (!locked() && mouseDown && enabled) { lookX += e.movementX * c.mouse_look_drag; lookY += e.movementY * c.mouse_look_drag; }
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
      lookX += (q.x - look.lx) * c.touch_look_x;
      lookY += (q.y - look.ly) * c.touch_look_y;
      look.lx = q.x; look.ly = q.y;
    }
  });

  function endPointer(e) {
    if (e.pointerType === 'mouse') { mouseDown = false; firingMouse = false; return; }
    if (e.pointerId === joy.id) { joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; stick.style.display = 'none'; }
    if (e.pointerId === look.id) look = { id: null, lx: 0, ly: 0 };
  }
  touchEl.addEventListener('pointerup', endPointer);
  touchEl.addEventListener('pointercancel', endPointer);

  document.addEventListener('mousemove', e => {
    if (locked() && enabled) { lookX += e.movementX * c.mouse_look_locked; lookY += e.movementY * c.mouse_look_locked; }
  });

  fireBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    app.classList.add('touch');
    fireId = e.pointerId; firingTouch = true; fireBtn.classList.add('on');
    try { fireBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  const fireUp = e => { if (e.pointerId === fireId) { fireId = null; firingTouch = false; fireBtn.classList.remove('on'); } };
  fireBtn.addEventListener('pointerup', fireUp);
  fireBtn.addEventListener('pointercancel', fireUp);

  if (matchMedia('(pointer:coarse)').matches) app.classList.add('touch');

  return {
    setEnabled(on) {
      enabled = on;
      if (!on) {
        firingKey = firingMouse = firingTouch = mouseDown = false;
        joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; look = { id: null, lx: 0, ly: 0 };
        stick.style.display = 'none'; fireBtn.classList.remove('on');
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
      const out = { moveX, moveY, lookX, lookY, turn, fire: enabled && (firingKey || firingMouse || firingTouch) };
      lookX = 0; lookY = 0;
      return out;
    }
  };
}
