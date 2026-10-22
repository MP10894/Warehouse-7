# Design document

The source of truth for what the game is. Update it when a decision is made, so later
sessions start from the same page. Martial's original concept is in
`docs/20261022 - Planning & Process.docx`; this file is the agreed, structured version.

Working title: not decided yet (the repository is called Warehouse 7 after the first prototype).
The game is separate from PMC Ltd.

## Vision

A co-op survival shooter for phones. One or two players are dropped into a ruined,
open level, fight their way into one of several enemy-held areas, claim it as a base,
and fortify it with salvaged supplies while ever larger enemy waves try to wipe them out.
Retro low-resolution look, quick sessions, physical gunplay: bullets travel and drop,
weapons kick, walls break.

## Core loop

1. Explore the level, fight roaming enemies, pick up weapons and ammunition they drop.
2. Clear one of the level's base areas. The first one cleared becomes your base, for good.
3. Venture out to fetch base-building items (well defended), carry them home one at a
   time, and build or improve upgrades.
4. Every upgrade makes the enemy waves come faster and harder. Survive to the end.

## Levels

- Each level has a theme that sets its map design, objects, colours and weather.
  Winning a level unlocks the next.
- Target size: about **1 minute to walk across** (roughly 250–300 m at walking speed).
- **Winning:** survive until the level timer runs out. The first test uses **5 minutes**;
  real levels will run longer.
- Buildings have up to 3 floors (ground + 2). Floors, structural columns, stairs and level
  boundaries are indestructible; ordinary walls can be destroyed.

**Level 1: ruined city, arid.** Three districts, each with one base area and
well-defended base-building items:

1. Dense urban: buildings ruined (superstructure only), partly damaged, or intact.
2. Arid outskirts: a few roads, sand dunes for elevation, rocky outcrops, scattered
   single-storey buildings.
3. Industrial: an oil refinery with many pipelines.

## Bases and building

- A player or team can hold **one base**. The first base area cleared is the base;
  the other base areas stay enemy territory.
- Enemies no longer respawn inside a cleared base area.
- A base can't be lost, but enemies can destroy everything built in it.
- Base-building items are scattered around the level. Picking one up puts it in your
  inventory and **slows you down**. You can carry **one at a time**.
- Building is contextual: a Build button appears when you're in the right spot with the
  right item.
- Upgrades can be built and then **improved** (levels to be defined):

| Upgrade | Needs | Effect |
|---|---|---|
| Open ammunition crate | Closed ammunition crate | Spawns ammunition periodically |
| First aid locker | Medical crate | Spawns health packs periodically |
| Armour locker | Armour crate | Spawns armour periodically |
| Walls | Construction crate (respawns, since walls get destroyed) | Destructible cover around the base |

## Enemies and waves

- Enemies roam the level: some stay near their spawn zones, some range further.
  They respawn periodically, except in a cleared base.
- Waves of attackers are always coming:
  - with a base, they attack the base;
  - without one, they head for the players' location.
- Waves get harder over time, and **build progress speeds up the escalation**.
- For now, difficulty varies only by **number of enemies, their weapons, and whether
  they wear armour**. A full enemy roster will come later (Enemies tab of the workbook).
- Each enemy type only carries weapons from its **Possible Weapons Equipped** list on the
  Enemies tab; the wave and group weapon weights choose among those.
- Attacking enemies' shots and explosions damage base walls and upgrades as a side effect.

## Players

- **Health:** 100 for players and enemies alike.
- **Armour:** picked up in amounts of 50–300; stacks up to **300**. Armour takes all
  damage until it reaches 0, then the rest spills into health. Armour also protects the head.
  While armour lasts, a bullet removes its *damage to armour* from armour. If armour runs
  out mid-bullet, the unused share of the bullet hits health at its *damage to health*
  rate. (Example: 10 armour left, bullet does 50 to armour and 40 to health → armour
  absorbs 20% of the bullet, health takes 80% of 40 = 32.)
- **Headshots:** ×2 damage, applied to both armour damage and health damage.
- **Health regeneration:** after **7 seconds** without taking damage, health climbs back
  to **50** over **3 seconds** (never above 50; armour never regenerates).
- **Death:** permanent in single player (the level is lost). In co-op a downed player can
  be revived by the other within **15 seconds**; if both are down, the level is lost.
- **Start:** each player starts with a pistol.

## Weapons

- Carry **up to 2 weapons**. Walking over a weapon picks it up automatically if you have
  a free slot; otherwise a Pick up button appears and swaps it with the weapon in hand.
- Dead enemies drop their weapon and some ammunition.
- **Ammunition is shared by calibre** (any 5.56 mm weapon uses the same pool).
- **Aim down sights** on every weapon.
- Attributes per weapon (Weapons tab of `data/Game Data.xlsx`, read directly by the game):
  magazine size; maximum carried ammunition (including the loaded magazine); reload time;
  damage to health; damage to armour; damage to environment; area of effect (0–100,
  where **100 = 10 m radius**); fire mode (semi or automatic); rate of fire; recoil (0–100);
  bloom (0–100); muzzle velocity; calibre; projectile (bullet or rocket); aim-down-sights zoom.
- **Recoil** kicks the camera upwards; the player pulls back down.
- **Bloom** is spread that grows the longer you fire and shrinks when you stop.
  Moving increases it.

## Ballistics

- No hit-scan. Bullets are physical objects that travel and drop.
- A global "bullet speed" factor in settings scales the sheet's muzzle velocities.
  The sheet already uses roughly half of real speeds, so the factor is **100%**.

## Destruction

- Destructible pieces use the same damage model as characters (health, then armour on
  top), without the 100/300 caps, so armoured doors or reinforced walls can be very tough.
- Destruction comes mainly from explosives and large-calibre weapons.
- Destroyed walls leave **rubble you can walk over**. Destruction only ever opens space;
  it never seals a route, so a level can't become impossible.

## Weather

- Outdoor areas can have sandstorms, rain or snowstorms, depending on the level's theme.
- Weather appears in random areas for random lengths of time, reducing visibility for
  players and enemies alike, with matching visual and sound effects.
- Weather is part of the game rules (it changes what enemies can see), so co-op players
  share the same weather.

## Art direction

- **Low-poly 3D**, PS1 style: characters at **300 triangles or fewer**, small pixelated
  textures, low-resolution rendering scaled up.
- Characters can be built from separate rigid parts (head, torso, upper and lower limbs)
  animated in code, as on the original PlayStation. That needs no skeleton or rigging,
  so placeholder models can be made in code and swapped for drawn art later.

## Controls (phone, held sideways)

- Left thumb: move. Right thumb: look. Fire (hold for automatic, tap for semi-automatic).
- Buttons: Reload, Swap weapon, Aim down sights.
- Contextual buttons: Pick up (weapon on the ground, slots full), Build (at a build spot
  with the right item), Revive (co-op).
- No crouch, jump or prone.

## Platforms and co-op

- Phone browser first, then an Android app via Capacitor. Desktop browser also works.
- **Co-op (2 players) is a launch feature.** Development starts single-player, on code
  that is co-op ready from the start (see Architecture), with networking added once the
  core game works.

## Not in scope (first version)

- Friendly NPCs (tents for allies, allied AI)
- Crouching, jumping, going prone
- Vehicles
- More than 2 players
- Competitive multiplayer (players against each other)
- Collapsing buildings or free-form destruction (only designated pieces break)

## Architecture (agreed)

- Vite + Three.js, one file per job; see README.
- **Simulation is separate from everything else.** `src/sim` is pure game rules on one
  plain world object. Input produces commands, the simulation produces events, and
  graphics, sound and HUD only read. The rules are deterministic for a given seed.
- Balance numbers live in `/data` (CSV and JSON), never hard-coded in game logic.

### How co-op works (test version, built)

1. One player hosts and gets a four-digit room code; the partner opens the same game
   link and joins with it.
2. Connection: the platform's live "room" for the play link (each player's state is
   their room presence: latest value wins, about 30 updates a second, 4 KB limit). Two
   tabs of one browser also work, for testing on one computer. No server of our own.
3. The host runs the game rules for both players and publishes a compact snapshot of
   everything that changes (people, bullets, pickups, broken walls, base walls, clock,
   recent events) every frame. The guest builds the same level from the same seed and
   copies the snapshot in.
4. The guest moves their own player on their own phone (so walking and looking feel
   instant) and sends position, aim and button presses; shooting, damage and pickups
   are decided on the host.
5. Downed players can be revived by the partner within 15 seconds; if both are down
   the level is lost.

Known limits of the test version: the guest's shots, recoil and ammo count arrive
after a short delay (one round trip); if the host leaves, the game ends for the guest;
joining a game already in progress isn't supported.

## Current build: test slice (v0.2)

A 100 × 100 m piece of Level 1 (`data/levels/slice/`) with everything in the vertical
slice: a three-storey tower with stairs and a walkable roof, a ruined concrete shell,
city and desert houses, dunes, the compound base, all four weapons from the sheet,
travelling bullets and rockets, armour, two weapon slots, enemies that guard, roam and
attack in waves, the construction crate and sandbag walls, destructible walls, and a
sandstorm zone in the north-east desert. Single player, plus a two-player co-op test (Co-op test button).

The earlier Warehouse 7 prototype (flat, Doom-style) is kept in git history under the
tag `warehouse-prototype`.

### Level engine (agreed)

- Buildings are made of 1-metre blocks, written as one text grid per floor
  (`data/levels/slice/buildings/*.txt`, guide in `data/levels/README.md`). Floors are 3 m.
- The ground is a smooth height map from `terrain.txt` (digits, one point every 4 m),
  with surface types from `ground.txt`. (Planned as an image; text turned out simpler
  to edit and keeps everything in plain files. Can switch later.)
- Walking, stairs, bullets, sight lines, path-finding and destruction all use the same
  block grid. Floors, columns and stairs are unbreakable; walls, low walls, crates and
  sandbags break into rubble.

### Data files

| File | Controls |
|---|---|
| `data/Game Data.xlsx` | Weapons tab and Enemies tab, read directly by the game |
| `data/enemies.csv` | Fallback for any enemy value the Enemies tab leaves out |
| `data/waves.csv` | Size, armour and weapon mix of each wave |
| `data/materials.csv` | Health and armour of each breakable material, and whether it leaves rubble |
| `data/settings.json` | Player, controls, camera, ballistics (bullet speed factor, recoil, bloom), waves timing, base, weather |
| `data/levels/slice/level.json` | Positions of buildings, props, base, enemies, pickups, weather zones, timer |

## Decision log

| Date | Decision |
|---|---|
| 2026-10-22 | Engine: Three.js in the browser, wrapped for Android later |
| 2026-10-22 | Sideways view: the game rotates itself when the browser stays portrait; the View button flips or turns it off |
| 2026-10-22 | Field of view aims for about 100° across, capped to avoid fisheye stretching |
| 2026-10-22 | Code split into modules; simulation kept separate so co-op can be added |
| 2026-10-22 | Game concept adopted: open levels, one claimable base, base building, escalating waves |
| 2026-10-22 | Separate game from PMC Ltd. |
| 2026-10-22 | Co-op is a launch feature; built single-player first on co-op-ready code |
| 2026-10-22 | Level size about 1 minute to cross; about 5 minutes of play per level for now |
| 2026-10-22 | One base per player/team; first cleared base area is the base; bases can't be lost |
| 2026-10-22 | Base items: in inventory, one at a time, slow the carrier. Upgrades can be improved |
| 2026-10-22 | Permadeath in single player; 15-second revive window in co-op |
| 2026-10-22 | Health 100; armour up to 300 absorbs all damage first, covers the head; headshots ×2 |
| 2026-10-22 | Two weapon slots, start with a pistol, ammunition shared by calibre, aim down sights on all weapons |
| 2026-10-22 | Area of effect scale: 100 = 10 m radius |
| 2026-10-22 | Physical bullets with drop at reduced speeds; recoil kicks the camera; bloom grows with sustained fire and movement |
| 2026-10-22 | Destruction mainly from explosives and large calibres; rubble is walkable; destruction never blocks routes |
| 2026-10-22 | No crouch, jump or prone. Friendly NPCs out of the first version |
| 2026-10-22 | Win by surviving a level timer; 5 minutes for the test level |
| 2026-10-22 | Armour spill-over rule adopted; headshot ×2 applies to armour damage too |
| 2026-10-22 | Bullet speed: real values in the sheet, global factor starting at 50% |
| 2026-10-22 | Art: low-poly 3D, 300 triangles or fewer per character |
| 2026-10-22 | Wave difficulty for now: enemy count, weapons, armour on/off |
| 2026-10-22 | Level engine: 1 m blocks, one text grid per floor; ground from a text height map |
| 2026-10-22 | The weapons workbook is the single source: `data/Weapons.xlsx`, read directly by the game (no CSV copy) |
| 2026-10-22 | Bullet speed factor set to 100%: the sheet's muzzle velocities are already about half of real |
| 2026-10-22 | RPG-7 area of effect 30 (3 m blast); Sig P320 recoil lowered to 5 |
| 2026-10-22 | Health regenerates to 50 over 3 s after 7 s without damage (difficulty was too high) |
| 2026-10-22 | Workbook renamed Game Data.xlsx with a Weapons tab and an Enemies tab |
| 2026-10-22 | Insurgents tuned on the Enemies tab: reaction 0.9 s, aim error 2° + 1.2° per 10 m, carry only AK-47 or RPG-7 |
| 2026-10-22 | In-game tuning panel and frame-rate counter for play-testing; tuned values are sent back and written into settings.json |
| 2026-10-22 | Co-op test: host-run game, snapshots over the play link's live room, guest moves locally; room codes |

## Open questions

1. **Upgrade levels.** Walls currently go to level 2 (2 blocks high). What each level of
   each upgrade does, and what it costs.
2. **Enemy roster** file (later).
3. **Name** of the game.
