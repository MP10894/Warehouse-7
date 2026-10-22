// Seeded random numbers. The state is a plain object inside the world ({ s: number }),
// so the whole world can be copied or sent over a network and stay reproducible.
export function nextRandom(state) {
  let s = state.s | 0;
  s = (s + 0x6D2B79F5) | 0;
  state.s = s;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Random number in [a, b) using the world's generator. */
export const rand = (world, a = 0, b = 1) => a + nextRandom(world.rng) * (b - a);
