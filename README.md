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
| `assets/audio/music/` | Music, picked by file name: `Menu…` plays on the title and menus; a level's music zones (level.json → `music_zones`: track name and area) fade their track in and out as you walk in and out (Najaf: `Najaf-Urban…` in the city). .mp3 works everywhere. Volume and fade time: settings.json → `audio` |
| `assets/audio/sfx/` + `data/sounds.csv` | Sound effects. `sounds.csv` (Excel) lists every moment that makes a sound (ammo pickup, each weapon's shot, explosions…) with the file to use (name without extension; takes named `File_1`, `File_2`… are picked at random), its volume, how far it carries (0 = only your own) and a random pitch change. A row with no file keeps the built-in synthesised sound. Each weapon has its own `reload_<weapon>` row; while a row has no file, that weapon keeps the built-in reload click |
| `assets/` | Art files that replace the placeholders: rules in [ART_SPEC.md](ART_SPEC.md); Blockbench palette in `assets/palette/`; working `.bbmodel` files in `assets/sources/` |
| `data/Game Data.xlsx` | The game-data workbook. **Weapons** tab: every weapon attribute (a projectile of "grenade" makes a thrown, quick-use item; "mortar" is a kill streak's shell; "melee" makes a hand weapon such as the machete: the enemy runs up and strikes at its rate of fire, only within `settings.json → enemy_ai.melee_reach` (1 m), and never drops it; a number in *Scope magnification* gives the weapon a scope, e.g. 4 = 4×). **Enemies** tab: health, speed, sight, reaction time, aim error in degrees, bursts, ammo drops, item drops (e.g. "Armour plate (15)", "Grenade (1)"), and which weapons each enemy type can carry. **Allies** tab: friendly units, with the Enemies tab's columns: the **Turret** (its gun is the *Turret* row on the Weapons tab). Edit in Excel as normal; formulas and "2 / 5" style min / max cells are fine |
| `data/enemies.csv` | Fallback enemy values, used for anything the Enemies tab leaves out |
| `data/waves.csv` | How big and how well armed each attack wave is. `type_<enemy>` columns set the mix of enemy types (e.g. `type_militia`), `weight_<weapon>` columns the weapons |
| `data/upgrades.csv` | Base upgrades, one row per level: the crate it takes, wall height, and what a locker hands out (`resupply`, `health` or `armour`), how often (`every`, seconds after the last was taken), how much (`amount`: % of each gun's ammunition, or health / armour points), and `unlocks`: weapon ids the armoury offers from that level on (separate several with spaces) |
| `data/killstreaks.csv` | Kill streaks, one row each: `kills` it takes (every enemy you kill counts, including with grenades, blasting, rockfall and the streaks themselves; your turret's kills don't), the `weapon` row on the Weapons tab that each round explodes like (the mortar: *Mortar*, grenade profile), how many `rounds`, over how many seconds (`duration`), how far they scatter from the laser spot (`scatter`, metres), the `countdown` before the first lands and the designator's `range`; for the gunship, `rounds` is its gun's ammunition, `duration` its time up there, and `secondary` / `secondary_rounds` its rockets (the RPG-7's profile). Only one streak is held at a time: the count keeps climbing and the best one reached is on offer. Going down loses the count and the streak. Shell drop height and speed, and the gunship's height, circle, zoom and spread: `settings.json → killstreaks`. The GUNSHIP TEST button (top left in a game) sends you up without earning it |
| `data/materials.csv` | How tough each breakable wall, crate and sandbag is |
| `data/settings.json` | Player speed, look sensitivity, field of view, recoil and bloom feel, wave timing, weather |

**While playing**, the small **✕** under the health bars (or `Esc` on a keyboard) asks
whether to leave the mission and go back to the menu. On the menu of the installed app,
**Exit** closes the game. Add `?fps` to the address to show the frame rate while testing.

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
  ui/              menus, the HUD text, the armoury and leave-mission panels
  net/             co-op: snapshots and the connection between two players
tests/             rule checks that run without a browser
```

The key rule: **`src/sim` never imports Three.js or touches the page.** Input becomes a
plain command, the simulation updates the world and reports events, and graphics, sound
and HUD only read from it. That separation is what allows two-player co-op to be added
later. See `DESIGN.md` for the plan and decisions.
