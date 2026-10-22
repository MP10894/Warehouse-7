// Three.js renderer, camera, pixel resolution and the sideways (landscape) mode.
import * as THREE from 'three';

// Keep colours exactly as authored (retro look, no colour-space conversion).
THREE.ColorManagement.enabled = false;

const VIEW_KEY = 'w7-view';
const VIEW_ORDER = ['cw', 'ccw', 'off'];
export const VIEW_LABEL = { cw: 'View: sideways', ccw: 'View: sideways, flipped', off: 'View: upright' };

export function createView({ app, viewCanvas, hudCanvas, settings }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: viewCanvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd9c49c, settings.world.fog_near, settings.world.fog_far);
  scene.add(new THREE.HemisphereLight(0xfff0d0, 0x6a5840, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-45, 80, 35);
  scene.add(sun);
  // nothing beyond the fog is visible, so don't draw it (saves work on big levels)
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, settings.world.fog_far + 10);
  camera.rotation.order = 'YXZ';
  const hud = hudCanvas.getContext('2d');

  let viewPref = null;
  try { viewPref = localStorage.getItem(VIEW_KEY); } catch (e) { /* storage unavailable */ }
  if (!VIEW_ORDER.includes(viewPref)) viewPref = matchMedia('(pointer:coarse)').matches ? 'cw' : 'off';
  let rotMode = 'off';
  let baseFov = 72;

  const view = { renderer, scene, camera, hud, W: 320, H: 200, zoom: 1 };

  function applyRotation() {
    const vw = innerWidth, vh = innerHeight, st = app.style;
    rotMode = viewPref !== 'off' && vh > vw ? viewPref : 'off';
    app.classList.toggle('rotated', rotMode !== 'off');
    if (rotMode === 'off') {
      st.inset = ''; st.left = st.top = st.width = st.height = st.transform = st.transformOrigin = '';
      return;
    }
    st.inset = 'auto'; st.left = '0'; st.top = '0';
    st.width = vh + 'px'; st.height = vw + 'px'; st.transformOrigin = '0 0';
    st.transform = rotMode === 'cw' ? 'rotate(90deg) translate(0,-100%)' : 'rotate(-90deg) translate(-100%,0)';
  }

  view.localW = () => rotMode === 'off' ? innerWidth : innerHeight;
  view.localH = () => rotMode === 'off' ? innerHeight : innerWidth;
  /** Convert a screen touch position into game-screen coordinates (accounts for sideways mode). */
  view.toLocal = e => {
    if (rotMode === 'cw') return { x: e.clientY, y: innerWidth - e.clientX };
    if (rotMode === 'ccw') return { x: innerHeight - e.clientY, y: e.clientX };
    return { x: e.clientX, y: e.clientY };
  };

  view.resize = () => {
    applyRotation();
    const sw = view.localW(), sh = view.localH();
    const s = Math.max(2, Math.round(sh / settings.camera.pixel_rows));
    view.W = Math.ceil(sw / s);
    view.H = Math.ceil(sh / s);
    renderer.setSize(view.W, view.H, false);
    hudCanvas.width = view.W; hudCanvas.height = view.H;
    hud.imageSmoothingEnabled = false;
    camera.aspect = view.W / view.H;
    const c = settings.camera;
    const vfov = 2 * Math.atan(Math.tan(c.target_horizontal_fov / 2 * Math.PI / 180) / camera.aspect) * 180 / Math.PI;
    baseFov = Math.max(c.min_vertical_fov, Math.min(c.max_vertical_fov, vfov));
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };

  view.viewLabel = () => VIEW_LABEL[viewPref];
  view.cycleViewPref = () => {
    viewPref = VIEW_ORDER[(VIEW_ORDER.indexOf(viewPref) + 1) % VIEW_ORDER.length];
    try { localStorage.setItem(VIEW_KEY, viewPref); } catch (e) { /* storage unavailable */ }
    view.resize();
    return VIEW_LABEL[viewPref];
  };

  /** Put the camera at the player's eyes; zoom smoothly when aiming down sights. */
  view.follow = (player, aim, zoomTarget, shake, dt) => {
    const eyeH = settings.player.eye_height;
    let eye;
    if (!player.alive) eye = Math.max(player.y + 0.3, camera.position.y - dt * 2.2);
    else if (player.downed) eye = player.y + 0.7;
    else eye = player.y + eyeH;
    const j = () => (Math.random() - 0.5) * shake * 0.12;
    camera.position.set(player.x + j(), eye + j(), player.z + j());
    camera.rotation.y = aim.yaw;
    camera.rotation.x = aim.pitch;
    camera.rotation.z = player.alive ? 0 : Math.min(0.6, camera.rotation.z + dt * 0.6);
    view.zoom += (zoomTarget - view.zoom) * Math.min(1, dt * 14);
    const fov = baseFov * view.zoom;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  };

  view.render = fp => {
    renderer.clear();
    renderer.render(scene, camera);
    if (fp) { renderer.clearDepth(); renderer.render(fp.scene, fp.camera); }
  };

  addEventListener('resize', view.resize);
  addEventListener('orientationchange', () => setTimeout(view.resize, 250));
  view.resize();
  return view;
}
