// The tuning panel: sliders that change data/settings.json values while you play.
// Changes apply immediately (the game pauses while the panel is open), are remembered on
// this device, and "Copy values" produces a short list to send back so they can be
// written into settings.json for everyone.

const STORE_KEY = 'w7-tuning';

// [tab, label, settings path, min, max, step, note]
const SLIDERS = [
  ['Controls', 'Look sensitivity', 'controls.look_multiplier', 0.3, 2.5, 0.05],
  ['Controls', 'Look speed when aiming', 'controls.ads_look_factor', 0.2, 1, 0.05],
  ['Controls', 'Field of view (°)', 'camera.target_horizontal_fov', 70, 120, 1],
  ['Controls', 'Pixel rows (detail; lower = faster)', 'camera.pixel_rows', 150, 400, 10],
  ['Controls', 'Aim assist when aiming (0 = off)', 'controls.aim_assist', 0, 1, 0.05],
  ['Controls', 'Aim assist reach (°)', 'controls.aim_assist_angle_deg', 1, 12, 0.5],
  ['Player', 'Walk speed (m/s)', 'player.walk_speed', 2.5, 8, 0.1],
  ['Recoil', 'Recoil kick', 'ballistics.recoil_kick_at_100', 0, 0.15, 0.005],
  ['Recoil', 'Recoil sideways', 'ballistics.recoil_side_at_100', 0, 0.06, 0.002],
  ['Recoil', 'Recoil comes back (share, 1 = all)', 'ballistics.recoil_return', 0, 1, 0.05],
  ['Recoil', 'Comes back after (s)', 'ballistics.recoil_return_delay', 0, 0.5, 0.01],
  ['Recoil', 'Comes back speed', 'ballistics.recoil_return_speed', 2, 30, 1],
  ['Spread', 'Bloom per shot', 'ballistics.bloom_per_shot_at_100', 0, 0.04, 0.001],
  ['Spread', 'Bloom maximum', 'ballistics.bloom_max_at_100', 0, 0.2, 0.005],
  ['Spread', 'Bloom recovery speed', 'ballistics.bloom_recovery_per_second', 0.02, 0.5, 0.01],
  ['Spread', 'Spread when aiming (×)', 'ballistics.ads_spread_factor', 0.1, 1, 0.05],
  ['Recoil', 'Bullet speed (×)', 'ballistics.bullet_speed_factor', 0.3, 2, 0.05],
  ['Enemies', 'Enemy aim error (×)', 'difficulty.enemy_aim_factor', 0.3, 3, 0.05],
  ['Enemies', 'Enemy reaction time (×)', 'difficulty.enemy_reaction_factor', 0.3, 3, 0.05],
  ['Enemies', 'Enemy sight range (×)', 'difficulty.enemy_sight_factor', 0.3, 2, 0.05],
  ['Enemies', 'Enemy damage (×)', 'difficulty.enemy_damage_factor', 0.2, 2, 0.05],
  ['Player', 'Health regen up to', 'player.regen_cap', 0, 100, 5],
  ['Player', 'Regen starts after (s)', 'player.regen_delay', 1, 15, 0.5],
  ['Waves', 'First wave at (s) — next run', 'waves.first_wave_at', 10, 180, 5],
  ['Waves', 'Break after each wave (s)', 'waves.break_after_wave', 0, 90, 5],
  ['Waves', 'Most attackers on the map at once', 'waves.max_attackers_alive', 4, 40, 1],
  ['Waves', 'Building brings next wave sooner by (s)', 'waves.build_interval_cut', 0, 40, 1]
];
const TABS = ['Controls', 'Player', 'Recoil', 'Spread', 'Enemies', 'Waves', 'Art'];

const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
function setPath(o, p, v) {
  const ks = p.split('.'), last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}
const decimals = step => (String(step).split('.')[1] || '').length;

/** Apply saved tuning from this device before the game starts. */
export function applySavedTuning(settings) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { saved = {}; }
  for (const [p, v] of Object.entries(saved)) {
    try { if (typeof getPath(settings, p) === 'number') setPath(settings, p, v); } catch (e) { /* path no longer exists */ }
  }
  return saved;
}

export function createTuning({ settings, onOpen, onClose, onChange }) {
  const defaults = {};
  for (const [, , p] of SLIDERS) defaults[p] = getPath(settings, p);
  // defaults are the values from settings.json; saved ones from this device go on top
  let saved = applySavedTuning(settings);

  const panel = document.getElementById('tune');
  const button = document.getElementById('tuneBtn');
  let tab = 'Controls', open = false, showFps = true;
  let artLines = ['Art files are still loading…'];
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* not available */ } };

  function render() {
    const rows = tab === 'Art'
      ? `<p class="tart">Which art files from the assets folder the game is using (see ART_SPEC.md).</p>` + artLines.map(l => `<div class="tart${l.startsWith('✗') ? ' bad' : ''}">${esc(l)}</div>`).join('')
      : SLIDERS.filter(s => s[0] === tab).map(([, label, p, min, max, step]) => {
      const v = getPath(settings, p), changed = p in saved;
      return `<div class="trow${changed ? ' changed' : ''}">
        <label for="t_${p}">${label}</label>
        <button type="button" class="tstep" data-p="${p}" data-d="-1" aria-label="Less">−</button>
        <input type="range" id="t_${p}" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${v}">
        <button type="button" class="tstep" data-p="${p}" data-d="1" aria-label="More">+</button>
        <output>${Number(v).toFixed(decimals(step))}</output>
      </div>`;
    }).join('');
    const n = Object.keys(saved).length;
    panel.innerHTML = `
      <div class="thead"><b>Tuning</b><span>${n ? `${n} change${n === 1 ? '' : 's'} saved on this device` : 'Game paused · changes apply instantly'}</span>
        <button type="button" class="tclose" id="tClose">Resume</button></div>
      <div class="ttabs">${TABS.map(t => `<button type="button" class="ttab${t === tab ? ' on' : ''}" data-tab="${t}">${t}</button>`).join('')}</div>
      <div class="trows">${rows}</div>
      <div class="tfoot">
        <label class="tchk"><input type="checkbox" id="tFps" ${showFps ? 'checked' : ''}> Frame rate</label>
        <button type="button" id="tReset">Reset all</button>
        <button type="button" id="tCopy">Copy values</button>
      </div>
      <textarea id="tOut" readonly hidden></textarea>`;
  }

  function setValue(p, v) {
    const def = SLIDERS.find(s => s[2] === p);
    const [, , , min, max, step] = def;
    v = Math.max(min, Math.min(max, Math.round(v / step) * step));
    v = Number(v.toFixed(decimals(step)));
    setPath(settings, p, v);
    if (Math.abs(v - defaults[p]) < 1e-9) delete saved[p]; else saved[p] = v;
    save();
    onChange(p);
    const row = panel.querySelector(`input[data-p="${p}"]`);
    if (row) { row.value = v; row.parentElement.querySelector('output').textContent = v.toFixed(decimals(step)); row.parentElement.classList.toggle('changed', p in saved); }
    const head = panel.querySelector('.thead span');
    const n = Object.keys(saved).length;
    if (head) head.textContent = n ? `${n} change${n === 1 ? '' : 's'} saved on this device` : 'Game paused · changes apply instantly';
  }

  panel.addEventListener('input', e => { if (e.target.dataset.p) setValue(e.target.dataset.p, Number(e.target.value)); });
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  panel.addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
    if (t.classList.contains('tstep')) {
      const def = SLIDERS.find(s => s[2] === t.dataset.p);
      setValue(t.dataset.p, getPath(settings, t.dataset.p) + Number(t.dataset.d) * def[5]);
      return;
    }
    if (t.id === 'tClose') { api.close(); return; }
    if (t.id === 'tReset') {
      for (const p of Object.keys(saved)) setPath(settings, p, defaults[p]);
      const changed = Object.keys(saved);
      saved = {}; save();
      changed.forEach(onChange);
      render();
      return;
    }
    if (t.id === 'tCopy') {
      const lines = Object.entries(saved).map(([p, v]) => `${p} = ${v}   (was ${defaults[p]})`);
      const text = lines.length ? `Tuning values:\n${lines.join('\n')}` : 'Tuning values: no changes';
      const out = panel.querySelector('#tOut');
      out.hidden = false; out.value = text;
      const done = ok => { t.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(() => { t.textContent = 'Copy values'; }, 1800); };
      try {
        navigator.clipboard.writeText(text).then(() => done(true), () => { out.focus(); out.select(); done(false); });
      } catch (err) { out.focus(); out.select(); done(false); }
    }
  });
  panel.addEventListener('change', e => { if (e.target.id === 'tFps') { showFps = e.target.checked; onChange('fps'); } });
  button.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  button.addEventListener('click', () => (open ? api.close() : api.open()));
  addEventListener('keydown', e => { if (e.code === 'KeyT' && button.offsetParent !== null) (open ? api.close() : api.open()); });

  const api = {
    get isOpen() { return open; },
    get showFps() { return showFps; },
    open() { open = true; render(); panel.hidden = false; onOpen(); },
    close() { open = false; panel.hidden = true; onClose(); },
    setArtReport(lines) { artLines = lines; if (open && tab === 'Art') render(); },
    setAvailable(on) { button.hidden = !on; if (!on && open) api.close(); }
  };
  return api;
}
