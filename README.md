# Warehouse 7

A small retro first-person shooter built with [Three.js](https://threejs.org), playable in a
phone or desktop browser. It's a test bed for a larger game: clear a warehouse of ten
hostiles, using the racks for cover and the red drums as weapons.

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
| `data/levels/warehouse.txt` | The level layout ([symbol guide](data/levels/README.md)) |
| `data/enemies.csv` | Enemy health, speed, accuracy, damage, reaction times |
| `data/weapons.csv` | Damage, fire rate, spread, starting ammo |
| `data/pickups.csv` | Medkit and ammo amounts, map symbols |
| `data/settings.json` | Player speed, look sensitivity, field of view, explosions |

The CSV files open in Excel. Save them as CSV; both comma and semicolon formats work.

## How the code is organised

```
src/
  main.js        wires everything together; the game loop
  data/          loads the files in /data
  sim/           the game rules: no graphics, no input, no sound
    world.js       the game state (one plain object)
    step.js        one tick of the rules
    map.js         level grid, heights, line of sight
    physics.js     collisions and bullet ray tests
    navigation.js  enemy path-finding
    enemies.js     enemy behaviour
    combat.js      shooting, damage, explosions
    rng.js         seeded random numbers
  render/        everything you see (Three.js)
  input/         touch, mouse, keyboard
  audio/         sound effects
  ui/            menus and the HUD text
tests/           rule checks that run without a browser
```

The key rule: **`src/sim` never imports Three.js or touches the page.** Input becomes a
plain command, the simulation updates the world and reports events, and graphics, sound
and HUD only read from it. That separation is what allows two-player co-op to be added
later. See `DESIGN.md` for the plan and decisions.
