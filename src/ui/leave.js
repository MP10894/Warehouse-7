// Leaving a mission: a small ✕ in the top-left corner, away from both thumbs, so it isn't
// pressed by accident. It asks first ("Leave the mission?"); a solo game pauses while the
// question shows, a co-op game carries on. Esc on a keyboard asks too.

export function createLeave({ onOpen, onStay, onLeave, coop }) {
  const btn = document.getElementById('leaveBtn');
  const box = document.getElementById('leave');
  let available = false, open = false;

  function show() {
    if (!available || open) return;
    open = true;
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    box.querySelector('p').textContent = coop()
      ? 'You will leave the co-op game; your partner carries on alone.'
      : 'Your progress in this mission will be lost.';
    box.hidden = false;
    onOpen();
  }
  function hide(leaving) {
    if (!open) return;
    open = false; box.hidden = true;
    if (leaving) onLeave(); else onStay();
  }

  // taps here must not reach the look / fire controls underneath
  for (const el of [btn, box]) for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart']) el.addEventListener(t, e => e.stopPropagation());
  btn.addEventListener('click', show);
  box.querySelector('[data-stay]').addEventListener('click', () => hide(false));
  box.querySelector('[data-leave]').addEventListener('click', () => hide(true));
  addEventListener('keydown', e => {
    if (e.code !== 'Escape' || !available) return;
    if (open) hide(false); else if (!document.pointerLockElement) show();
  });

  return {
    get isOpen() { return open; },
    /** Shown only while a mission is being played. */
    setAvailable(on) {
      available = on;
      btn.hidden = !on;
      if (!on && open) { open = false; box.hidden = true; }
    }
  };
}
