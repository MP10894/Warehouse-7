# Ruined City (working title)

A retro low-poly survival shooter built with [Three.js](https://threejs.org), playable in a
phone or desktop browser. The current build is a test slice of Level 1: claim a base in a
ruined desert city, fortify it, and survive escalating enemy waves. See `DESIGN.md`.

## Run it on your computer

You need **Node.js** once (the "LTS" version from nodejs.org). Then, in this folder:

```
npm install        # first time only: downloads Three.js and Vite
npm run dev        # starts the game at http://localhost:5173
```

Keep that window open while you play. Saving any file (code, CSV, map) reloads the game.

**On your phone:** run `npm run dev:phone` instead. It prints a "Network" address such as
`http://192.168.1.20:5173`; open that on a phone connected to the same Wi-Fi.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Makes the finished game in `dist/`, ready to upload anywhere |
| `npm run preview` | Plays the built version from `dist/` |
| `npm run test:sim` | Checks the game rules still work (no graphics needed) |

## What you can change without touching code

| File | What it controls |
|---|---|
| `data/levels/slice/` | The level: building floor plans, ground heights, where everything goes ([guide](data/levels/README.md)) |
| `data/Game Data.xlsx` | The game-data workbook (still called `Weapons.xlsx` until renamed; both names work). **Weapons** tab: every weapon attribute. **Enemies** tab (optional): enemy health, speed, sight, reaction time, aim error in degrees… Edit in Excel as normal; formulas are fine |
| `data/enemies.csv` | Fallback enemy values, used for anything the Enemies tab leaves out |
| `data/waves.csv` | How big and how well armed each attack wave is |
| `data/materials.csv` | How tough each breakable wall, crate and sandbag is |
| `data/settings.json` | Player speed, look sensitivity, field of view, recoil and bloom feel, wave timing, weather |

The CSV files open in Excel. Save them as CSV; both comma and semicolon formats work.

Other files refer to a weapon by its **id**, made from its name in the workbook: lower
case, spaces become `_`, hyphens are dropped (`Sig P320` → `sig_p320`, `RPG-7` → `rpg7`).
Renaming a weapon in the workbook changes its id, so update `waves.csv`,
`settings.json` and `level.json` to match.

## How the code is organised

```
src/
  main.js          wires everything together; the game loop
  data/            loads the files in /data
  sim/             the game rules: no graphics, no input, no sound
    world.js         creates the game state (one plain object)
    step.js          one tick of the rules
    level.js         builds the block world from the level files
    grid.js          the 1 m block grid
    terrain.js       ground heights and surfaces
    body.js          walking, stairs, falling
    ballistics.js    bullet paths, hits, line of sight
    weapons.js       firing, recoil, bloom, reload, swap, projectiles
    damage.js        armour/health damage, deaths, drops, explosions, breaking walls
    players.js       player actions, pick-ups, the context button, revive
    enemies.js       enemy behaviour and respawning
    nav.js           3D path-finding over floors and stairs
    base.js          claiming the base, carrying crates, building walls
    waves.js         attack waves
    weather.js       sandstorms
    rng.js           seeded random numbers
  render/          everything you see (Three.js)
  input/           touch, mouse, keyboard
  audio/           sound effects
  ui/              menus and the HUD text
tests/             rule checks that run without a browser
```

The key rule: **`src/sim` never imports Three.js or touches the page.** Input becomes a
plain command, the simulation updates the world and reports events, and graphics, sound
and HUD only read from it. That separation is what allows two-player co-op to be added
later. See `DESIGN.md` for the plan and decisions.
