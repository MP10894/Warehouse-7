# Operator: Non-Permissive Environments

A retro low-poly survival shooter built with [Three.js](https://threejs.org), playable in a
phone or desktop browser. The current build has one level, Najaf (city, refinery and outskirts, with three possible bases), picked on the menu after the title screen. Claim a base in a
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

## The game on the web (GitHub Pages) and on phones

Every push to `main` publishes the game to **https://mp10894.github.io/Warehouse-7/**
(`.github/workflows/pages.yml`): the game checks run first, and if any fail the website keeps
the previous version. You can follow each run on the repository's **Actions** tab.

- **Install on a phone:** open the address in Chrome (Android) or Safari (iPhone), then
  *Add to Home Screen* (Android: ⋮ menu → *Add to Home screen* / *Install app*; iPhone: the
  Share button → *Add to Home Screen*). It opens full screen with its own icon.
- **Updates:** nothing to reinstall. Each time the game is opened while online it loads the
  newest version; offline it starts from the copy saved on the phone (`public/sw.js`).
- **Version:** shown at the top of the start screen (e.g. `v0.2.0-5edf676`: the version in
  `package.json` and the commit it was built from).

## Co-op

On the start screen, **Co-op** lets one player host (they get a four-digit code) and the other
join with that code.

- **On the website / installed app:** the two phones connect directly to each other
  ("online (phone to phone)"); a free public service only introduces them. Both need to be
  online and on the same version — if they aren't, the lobby says so and asks both to reopen
  the game while online. Some mobile data networks block direct connections; if that happens
  a lot, the fix is a small relay server.
- **From the claude.ai play link:** the platform's live room is used instead; the partner
  needs access to the link (share it from the page's Share menu).
- **Testing on one computer:** two tabs, with `?tabs` added to the address.

Details in `DESIGN.md` → "How co-op works".

## What you can change without touching code

| File | What it controls |
|---|---|
| `data/levels/najaf/` | Najaf (Level 1): building floor plans, ground heights, where everything goes ([guide](data/levels/README.md)) |
| `assets/audio/music/` | Music, picked by file name: `Menu…` plays on the title and menus; a level's music zones (level.json → `music_zones`: track name and area) fade their track in and out as you walk in and out (Najaf: `Najaf-Urban…` in the city). .mp3 works everywhere. Volume and fade time: settings.json → `audio`, and the tuning panel |
| `assets/audio/sfx/` | Sound effects (coming next; the game's built-in synthesised sounds play until then) |
| `assets/` | Art files that replace the placeholders: rules in [ART_SPEC.md](ART_SPEC.md); Blockbench palette in `assets/palette/`; working `.bbmodel` files in `assets/sources/` |
| `data/Game Data.xlsx` | The game-data workbook. **Weapons** tab: every weapon attribute (a projectile of "grenade" makes a thrown, quick-use item; a number in *Scope magnification* gives the weapon a scope, e.g. 4 = 4×). **Enemies** tab: health, speed, sight, reaction time, aim error in degrees, bursts, ammo drops, item drops (e.g. "Armour plate (15)", "Grenade (1)"), and which weapons each enemy type can carry. Edit in Excel as normal; formulas and "2 / 5" style min / max cells are fine |
| `data/enemies.csv` | Fallback enemy values, used for anything the Enemies tab leaves out |
| `data/waves.csv` | How big and how well armed each attack wave is. `type_<enemy>` columns set the mix of enemy types (e.g. `type_militia`), `weight_<weapon>` columns the weapons |
| `data/upgrades.csv` | Base upgrades, one row per level: the crate it takes, wall height, and what a locker hands out (`resupply`, `health` or `armour`), how often (`every`, seconds after the last was taken), how much (`amount`: % of each gun's ammunition, or health / armour points), and `unlocks`: weapon ids the armoury offers from that level on (separate several with spaces) |
| `data/materials.csv` | How tough each breakable wall, crate and sandbag is |
| `data/settings.json` | Player speed, look sensitivity, field of view, recoil and bloom feel, wave timing, weather |

**While playing**, the **TUNE** button (or `T` on a keyboard) opens a tuning panel: sliders
for look sensitivity, field of view, detail, recoil, spread, enemy difficulty and wave
timing. The game pauses while it's open, changes apply instantly and are remembered on
that device, and **Copy values** gives a short list to send back so the numbers can be
written into `settings.json` for everyone. It also shows the frame rate.

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
  ui/              menus, the HUD text and the tuning panel
  net/             co-op: snapshots and the connection between two players
tests/             rule checks that run without a browser
```

The key rule: **`src/sim` never imports Three.js or touches the page.** Input becomes a
plain command, the simulation updates the world and reports events, and graphics, sound
and HUD only read from it. That separation is what allows two-player co-op to be added
later. See `DESIGN.md` for the plan and decisions.
