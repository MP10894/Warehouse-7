# Notes for Claude working in this repository

The owner, Martial, is design-focused and not a programmer. He tests mainly on an
Android phone held sideways, and edits CSV files in Excel and the level map in a text
editor. Explain changes in plain language.

## Before changing anything

- Read `DESIGN.md`. It holds the scope, the "not in scope" list and the decision log.
  Don't reopen settled decisions without being asked; record new ones there.
- For anything bigger than a small fix, propose the approach first and wait for a go-ahead.

## Architecture rules

- `src/sim/` is pure game logic. It must never import `three`, touch `document` or
  `window`, or use `Math.random()`. Use `rand(world, ...)` from `src/sim/rng.js` so the
  simulation stays deterministic (needed for co-op).
- All state lives in the world object from `src/sim/world.js`. Keep it plain data
  (no class instances, no functions), except `world.cache` for derived data.
- The simulation reports what happened through `world.events` (see `emit` in
  `src/sim/combat.js`). Graphics, sound and HUD react to events and read state; they
  never change the world.
- Never assume a single player. Use `world.players`; tag player-specific events with
  `playerId`; HUD and feedback only react to the local player (`LOCAL_ID` in main.js).
- Balance numbers belong in `/data`, not in code. New tunable value → add a column or a
  settings key, then read it from `world.data`.
- Visual-only randomness (particles, screen shake) may use `Math.random()` outside `src/sim`.

## Checks before committing

- `npm run test:sim`: must pass. Add a check there when adding a rule.
- `npm run build`: must succeed.
- Look at the game in a browser if anything visual or input-related changed.

## Commits

Small, focused commits with plain-English messages that describe what changed for the
player (for example "Enemies now drop ammo more often"), so Martial can follow the
history in GitHub Desktop.
