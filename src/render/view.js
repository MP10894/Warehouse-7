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

  const scene = new THREE.Scene();
  const FOG = 0x0b0c0a;
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, settings.world.fog_near, settings.world.fog_far);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  camera.rotation.order = 'YXZ';
  const hud = hudCanvas.getContext('2d');

  // Sideways play: when the browser stays in portrait (rotation lock, or an app that
  // won't rotate), the whole game is turned 90 degrees so the phone can be held sideways.
  let viewPref = null;
  try { viewPref = localStorage.getItem(VIEW_KEY); } catch (e) { /* storage unavailable */ }
  if (!VIEW_ORDER.includes(viewPref)) viewPref = matchMedia('(pointer:coarse)').matches ? 'cw' : 'off';
  let rotMode = 'off';

  const view = { renderer, scene, camera, hud, W: 320, H: 200 };

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
  /** Convert a screen touch position into game-screen coordinates (accounts for sideways mode). */
  view.toLocal = e => {
    if (rotMode === 'cw') return { x: e.clientY, y: innerWidth - e.clientX };
    if (rotMode === 'ccw') return { x: innerHeight - e.clientY, y: e.clientX };
    return { x: e.clientX, y: e.clientY };
  };

  view.resize = () => {
    applyRotation();
    const sw = view.localW(), sh = rotMode === 'off' ? innerHeight : innerWidth;
    const s = Math.max(2, Math.round(sh / settings.camera.pixel_rows));
    view.W = Math.ceil(sw / s);
    view.H = Math.ceil(sh / s);
    renderer.setSize(view.W, view.H, false);
    hudCanvas.width = view.W; hudCanvas.height = view.H;
    hud.imageSmoothingEnabled = false;
    camera.aspect = view.W / view.H;
    const c = settings.camera;
    const vfov = 2 * Math.atan(Math.tan(c.target_horizontal_fov / 2 * Math.PI / 180) / camera.aspect) * 180 / Math.PI;
    camera.fov = Math.max(c.min_vertical_fov, Math.min(c.max_vertical_fov, vfov));
    camera.updateProjectionMatrix();
  };

  view.viewLabel = () => VIEW_LABEL[viewPref];
  view.cycleViewPref = () => {
    viewPref = VIEW_ORDER[(VIEW_ORDER.indexOf(viewPref) + 1) % VIEW_ORDER.length];
    try { localStorage.setItem(VIEW_KEY, viewPref); } catch (e) { /* storage unavailable */ }
    view.resize();
    return VIEW_LABEL[viewPref];
  };

  /** Put the camera at the player's eyes, with bob, recoil, shake and death fall. */
  view.follow = (player, feedback, dt) => {
    const f = feedback.state;
    const eyeH = settings.player.eye_height;
    const eye = player.alive
      ? eyeH + (player.moving ? Math.sin(f.bobT * 2) * .045 : 0)
      : Math.max(.35, camera.position.y - dt * 2.2);
    const sh = f.shake > 0 ? f.shake * .15 : 0;
    const j = () => (Math.random() - .5) * sh;
    camera.position.set(player.x + j(), eye + j(), player.z + j());
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + f.recoil * .012;
    camera.rotation.z = player.alive ? 0 : Math.min(.5, camera.rotation.z + dt * .6);
  };

  view.render = () => renderer.render(scene, camera);

  addEventListener('resize', view.resize);
  addEventListener('orientationchange', () => setTimeout(view.resize, 250));
  view.resize();
  return view;
}
