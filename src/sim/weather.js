// Weather zones. Sandstorms, downpours ("rain") and mist banks ("mist") start at random, last a
// random time, fade in and out, and cut how far enemies can see and how well they aim. Smoke
// zones (the refinery's flare stack) are always there and do the same within their radius.
// A zone's "strength" (default 1) scales how much it cuts sight: rain is lighter than a sandstorm.
import { rand } from './rng.js';

export function createWeather(level) {
  return (level.weather_zones || []).map((z, i) => ({ ...z, index: i, active: z.type === 'smoke', t: 0, duration: 0, intensity: z.type === 'smoke' ? 1 : 0 }));
}

export function updateWeather(world, dt) {
  const fade = world.data.settings.weather.fade_time;
  for (const z of world.weather) {
    if (z.type === 'smoke') continue; // always on
    if (!z.active) {
      if (rand(world) < (z.chance_per_minute / 60) * dt) {
        z.active = true; z.t = 0; z.duration = rand(world, z.min_duration, z.max_duration);
        world.events.push({ type: 'weather', zone: z.index, kind: z.type, on: true });
      }
      z.intensity = 0;
      continue;
    }
    z.t += dt;
    z.intensity = Math.max(0, Math.min(1, z.t / fade, (z.duration + fade - z.t) / fade));
    if (z.t >= z.duration + fade) {
      z.active = false; z.intensity = 0;
      world.events.push({ type: 'weather', zone: z.index, kind: z.type, on: false });
    }
  }
}

/** Storm or smoke strength (0–1) at a point. The edge of each zone is soft. kind: only zones of that type. */
export function stormAt(world, x, z, kind = null) {
  let best = 0;
  for (const w of world.weather || []) {
    if (!w.active || w.intensity <= 0 || (kind && w.type !== kind)) continue;
    const d = Math.hypot(x - w.x, z - w.z);
    const edge = Math.max(0, Math.min(1, (w.radius - d) / 8));
    best = Math.max(best, w.intensity * edge * (kind ? 1 : (w.strength ?? 1)));
  }
  return best;
}
