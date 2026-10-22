# Warehouse 7: design document

The source of truth for what the game is. Update it when a decision is made, so later
sessions start from the same page.

## Vision

A short, tense, retro first-person shooter in the spirit of Doom and Duke Nukem 3D,
playable on a phone held sideways. Chunky pixels, dark industrial spaces, quick fights.
It doubles as a technical test: can a prompt-driven workflow produce a game that feels
good on a mid-range Android phone?

## Core loop

Enter a bay → spot or hear hostiles → use cover (racks, crates) and explosive drums →
clear the bay → collect health and ammo → move to the next bay. The level is won when
every hostile is down.

## Platforms and controls

- **Phone (primary):** browser now, Android app via Capacitor later. Played sideways.
  Left thumb: floating joystick to move. Right thumb: drag to look. Hold FIRE to shoot.
- **Desktop:** WASD to move, mouse to look (click to lock), hold click or Space to fire.

## Look and feel

- 3D world with flat 2D sprite enemies and pickups (Doom style).
- Rendered at about 230 pixel rows and scaled up, so pixels stay chunky on every screen.
- Lighting baked into the level per tile: warm sodium lamps in the west halls, cold
  fluorescents in the east, one red alarm lamp.
- All art is currently drawn in code. Real art will replace it (see open questions).

## Current content (v0.1)

- One level: `data/levels/warehouse.txt`.
- One enemy type: insurgent (4 health; headshots do triple damage).
- One weapon: carbine (90 rounds at start).
- Pickups: medkit (+30 health), ammo box (+30). Enemies sometimes drop ammo.
- Explosive drums that chain-react.

## Not in scope (for now)

- Jumping, crouching, reloading
- Multiple weapons
- Saving progress, menus beyond start and results
- Online multiplayer (prepared for, not built; see below)

## Architecture (agreed)

- Vite + Three.js, one file per job; see README.
- **Simulation is separate from everything else.** `src/sim` is pure game rules on one
  plain world object. Input produces commands, the simulation produces events, and
  graphics, sound and HUD only read. The rules are deterministic for a given seed.
- Balance numbers live in `/data` (CSV and JSON), never hard-coded in game logic.

### How co-op would be added later

1. One player hosts. Their game runs `stepWorld` with both players' commands.
2. The guest sends its command (movement, aim, fire) to the host every tick.
3. The host sends world snapshots and events back; the guest draws them, smoothing
   movement between updates.
4. A small WebSocket relay server (Node.js) connects the two, with a room code to join.
5. Already in place: players are a list, enemies target the nearest living player,
   path-finding leads to all players, the map has a second spawn point (`2`), events
   name which player they belong to, and the HUD and feedback only react to the
   local player.

## Decision log

| Date | Decision |
|---|---|
| 2026-10-22 | Engine: Three.js in the browser, wrapped for Android later |
| 2026-10-22 | Sideways view: the game rotates itself when the browser stays portrait; the View button flips or turns it off |
| 2026-10-22 | Field of view aims for about 100° across, capped to avoid fisheye stretching |
| 2026-10-22 | Code split into modules; simulation kept separate so two-player co-op can be added later |

## Open questions

- **Art direction:** keep 2D sprites, or move to low-poly 3D models (PS1 style)?
  Affects the asset pipeline more than the code.
- Art specifications (texture sizes, palette, file names) to be fixed before generating art.
- Tuning panel in-game for sensitivity, accuracy and speed.
