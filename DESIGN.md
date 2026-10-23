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
   **Securing it starts the level clock and the attack waves**; until then there is no time
   limit and no waves.
3. Venture out to fetch base-building items (well defended), carry them home one at a
   time, and build or improve upgrades.
4. Every upgrade makes the enemy waves come faster and harder. Hold the base until the clock
   runs out.

## Levels

- Each level has a theme that sets its map design, objects, colours and weather.
  Winning a level unlocks the next.
- Target size: about **1 minute to walk across** (roughly 250–300 m at walking speed).
- **Winning:** secure a base, then hold out until the level clock runs out. The clock only
  starts when the base is secured. The test slice uses **5 minutes**, Najaf **15**.
- Buildings have up to 3 floors (ground + 2). Floors, structural columns, stairs and level
  boundaries are indestructible; ordinary walls can be destroyed.

**Level 1: Najaf, a ruined city, arid.** Three districts, each with one base area and
well-defended base-building items:

1. Dense urban: buildings ruined (superstructure only), partly damaged, or intact.
2. Arid outskirts: a few roads, sand dunes for elevation, rocky outcrops, scattered
   single-storey buildings.
3. Industrial: an oil refinery with many pipelines.

Layout plan (agreed): [docs/NAJAF_PLAN.md](docs/NAJAF_PLAN.md) (map in
`docs/najaf_layout.png`).

## Bases and building

- A player or team can hold **one base**. The first base area cleared is the base;
  the other base areas stay enemy territory.
- Enemies no longer respawn inside a cleared base area.
- A base can't be lost, but enemies can destroy everything built in it.
- Base-building items are scattered around the level. Picking one up puts it in your
  inventory. You can carry **one at a time**. (It used to slow you down; removed on
  2026-10-23 because it slowed the game too much. `carry_speed_factor` in settings.json.)
- Building is contextual: a Build button appears when you're in the right spot with the
  right item.
- Upgrades can be built and then **improved** (levels to be defined):

| Upgrade | Needs | Effect |
|---|---|---|
| Open ammunition crate | Closed ammunition crate | Spawns ammunition periodically |
| First aid locker | Medical crate | Spawns health packs periodically |
| Armour locker | Armour crate | Spawns armour periodically |
| Walls | Construction crate (respawns, since walls get destroyed) | Destructible cover around the base |

What each level does is in `data/upgrades.csv` (one row per level; editable in Excel).
Starting values, to be tuned after play-testing:

- **Walls:** 2 levels (1 then 2 sandbags high). At the top level a construction crate
  repairs blown-up sections.
- **Ammunition supply, first aid locker, armour locker:** 3 levels each. The locker is one
  block at its build spot and keeps one pickup waiting on top of it: an ammunition box
  (refills a share of every gun you carry: 30 / 40 / 50 %), a first aid kit (+25 / 40 / 60
  health, up to full) or armour (+25 / 50 / 75). The next one appears 45 / 35 / 25 s
  after the last was taken (armour: 60 / 45 / 30 s).
- A locker can be destroyed (150 health, 60 armour). Its upgrade goes back to nothing and
  its crate starts coming back again.
- A crate is only picked up while its upgrade is below the top level, so you can't get
  stuck carrying one you can't use.
- In the base, each build spot is marked on the ground: a dashed yellow-and-black hazard
  square with an icon (sandbags, cartridges, cross, shield), and dashed lines where the
  walls go. The markings are faint, pulse while you carry the matching crate, and
  disappear once that upgrade is at its top level (wall lines come back where walls are
  blown away). Built lockers show their icon and level above them.

## Enemies and waves

- Enemies roam the level: some stay near their spawn zones, some range further.
  They respawn periodically, except in a cleared base.
- Once a base is secured, waves of attackers keep coming and attack the base. Before
  that there are no waves.
- Rhythm: the first wave comes 50 s after the base is secured. Each wave must be beaten
  (every attacker killed) before a **20-second break**, then the next, bigger wave comes.
  Building something during a break brings the next wave sooner.
- At most **20 attackers** are on the map at once; the rest of a big wave wait at the edge
  and come in as others fall. (Both numbers are in settings.json and on the tuning panel.)
- Waves get harder over time, and **build progress speeds up the escalation**.
- For now, difficulty varies only by **number of enemies, their weapons, and whether
  they wear armour**. A full enemy roster will come later (Enemies tab of the workbook).
- Each enemy type only carries weapons from its **Possible Weapons Equipped** list on the
  Enemies tab; the wave and group weapon weights choose among those.
- Attacking enemies' shots and explosions damage base walls and upgrades as a side effect.
- **Drops:** each type's *Item drop* cell on the Enemies tab (e.g. heavy insurgents:
  "Armour plate (15)"). Insurgents and heavy insurgents also sometimes drop a grenade
  (chances in settings.json → grenades → drop_chance; militia never do).
- **Suicide bomber:** carries no gun. Once he notices a player he runs straight at them at
  full speed (attack waves head for the base until a player is near), beeping faster as he
  closes in. Within his *preferred fighting distance* (1 m) he blows himself up: the
  RGD-5's blast. If he is shot dead first, his vest goes off where he falls (hurting
  anyone nearby, enemies included). He drops nothing. Bombers come in attack waves from
  wave 2 (`type_suicide_bomber` in waves.csv) and wait in a few places in Najaf.

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
  bloom (0–100); muzzle velocity; calibre; projectile (bullet, rocket or grenade); aim-down-sights zoom;
  scope magnification (empty = iron sights).
- **Scopes** (the Mk14 EBR, 4×): aiming down sights looks through the scope: a black ring
  round the lens, a thin crosshair, the gun out of sight. Look speed drops (0.3 of normal),
  and the aim drifts slightly, three times as much while walking. All on the tuning panel.
- **Grenades (RGD-5)** are a quick-use item, not a weapon slot. While you have any, a
  grenade button with the count shows under the map (desktop: G). A toss takes 0.7 s: the
  rifle dips, the left hand throws, and you can't fire, reload or swap meanwhile. The
  grenade flies at the Weapons tab's *muzzle velocity* (= throwing speed), aimed a little
  above your crosshair, bounces and rolls, and goes off **3.5 s** after the throw.
  Carry up to the tab's maximum (5). You start with none; they come from grenade pickups
  in Najaf, from insurgents and heavy insurgents, and one with each ammunition box from
  the base's ammunition supply. Timing values: settings.json → grenades.
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
- Destroyed walls leave **rubble that is decoration only**: drawn on the floor, but you walk
  straight through it, and so do enemies and bullets. Destruction only ever opens space;
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
- File rules for art (sizes, names, pivots, budgets, palette): [ART_SPEC.md](ART_SPEC.md). Art goes in
  `assets/`; missing files keep the code-drawn placeholders.
- **Lived-in streets (decoration):** every building gets its own painted plaster colour and
  a darker band along the bottom (police station white and blue, clinic white and green);
  ground floors facing a street get rolled-down shop shutters and striped awnings; windows
  get frames and wooden shutters; air-conditioning boxes, grime under the roof line, water
  tanks, satellite dishes, aerials and washing lines on roofs, and sagging wires across the
  streets; on the ground oil stains, cracks, scorch marks, tyre tracks and sand blown
  against walls. All of it is decoration only (like rubble: no collision, no effect on
  bullets or path-finding), placed by rules the same way every run, and it disappears with
  the wall it hangs on. Amount: settings.json → decor.amount, also on the tuning panel.

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

## Current build

**Test slice (v0.2).** A 100 × 100 m piece of Level 1 (`data/levels/slice/`) with everything in the vertical
slice: a three-storey tower with stairs and a walkable roof, a ruined concrete shell,
city and desert houses, dunes, the compound base, all four weapons from the sheet,
travelling bullets and rockets, armour, two weapon slots, enemies that guard, roam and
attack in waves, the construction crate and sandbag walls, destructible walls, and a
sandstorm zone in the north-east desert. Single player, plus a two-player co-op test (Co-op test button).

**Najaf, complete (v0.4).** The full 256 × 256 m map (`data/levels/najaf/`), three districts
around the crossroads where you start:

- **City** (north-west): 55 buildings of 1–3 floors (intact, damaged or ruined), the
  clinic (medical crate on its roof), the minaret, the market square, the building site
  (construction crate), and **base A, the police station**.
- **Refinery** (east): a fenced concrete pad with eight fuel tanks that blow up when a
  rocket hits them, pipe racks you can walk under, low pipe runs as cover, two cracking
  towers, the flare stack with its permanent smoke, the loading bay, the security post
  (armour crate), and **base C, the control building**.
- **Outskirts** (south and west): dunes, the dry riverbed, rock outcrops, single-storey
  houses, the gas station, the army checkpoint (ammunition crate behind sandbags), the
  quarry (second construction crate), the wrecked convoy, sandstorm zones, high dunes
  along the map edge, and **base B, the truck stop**.

65 enemies in 22 groups. The refinery and outskirts were drafted by
`tools/make_najaf_districts.py`. Pick the level on the start screen; the choice is
remembered, and in co-op the host's choice is used.

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
- A building file can be placed turned (90°, 180°, 270°) or mirrored, so a handful of
  building files make a varied city.
- When something breaks, path-finding is only worked out again around it, so big maps
  don't stutter.

### Data files

| File | Controls |
|---|---|
| `data/Game Data.xlsx` | Weapons tab and Enemies tab, read directly by the game |
| `data/enemies.csv` | Fallback for any enemy value the Enemies tab leaves out |
| `data/waves.csv` | Size, armour, enemy-type mix and weapon mix of each wave |
| `data/materials.csv` | Health and armour of each breakable material, and whether it leaves rubble |
| `data/upgrades.csv` | Each upgrade's levels: crate needed, wall height, what a locker hands out, how often, how much |
| `data/settings.json` | Player, controls (incl. aim assist), camera, ballistics (bullet speed factor, recoil, bloom), waves (first wave, break, attacker cap, how far from you waves start), base, hazards (fuel-tank blast), markers (base markings), weather |
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
| 2026-10-22 | Physical bullets with drop at reduced speeds; recoil kicks the camera (and comes back, see below); bloom grows with sustained fire and movement |
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
| 2026-10-22 | Level 1 is named **Najaf**; layout agreed: 256 × 256 m, start at the central crossroads, three base areas (police station, truck stop, control building) |
| 2026-10-22 | Upgrades have 3 levels, each costing one crate of its type; crates respawn until the matching upgrade is maxed; construction crates always respawn |
| 2026-10-22 | Najaf starts with about 60 enemies; adjust after play-testing |
| 2026-10-22 | Refinery fuel tanks explode in a wide radius when hit by an RPG; one tank exploding does not set off others |
| 2026-10-22 | Build Najaf district by district, the city first, to check the frame rate on the phone early |
| 2026-10-22 | Najaf: permanent smoke at the flare stack; 15-minute time limit; map edges are collapsed buildings, a refinery fence, high dunes and cliffs |
| 2026-10-22 | Art spec agreed: Blockbench, 32 px per metre (terrain 16), shared 65-colour palette, budgets weapons 300 / crates and pickups 60 / upgrades 150 / hands 100, gloved first-person hands |
| 2026-10-22 | Art workflow: reference picture → Claude drafts the Blockbench model → Martial refines → Claude checks |
| 2026-10-22 | Recoil returns: after you stop firing the view comes back to where you were aiming (sustained fire still climbs; bloom still spreads shots). Pulling down yourself counts towards the return |
| 2026-10-22 | Weapons and first-person hands drawn at 256 px per metre (seen close); first drawn weapon: Sig P320 from an OpenArt reference sheet |
| 2026-10-22 | First-person hands: tan tactical gloves with hard knuckle plates and grey cuffs, sleeve in the team's grey-blue |
| 2026-10-22 | First-person hands: budget raised to 300 triangles with separate fingers and thumb; forearms added and aimed at the shoulders so hands never float |
| 2026-10-22 | AK-47 drawn: real proportions, look from the OpenArt sheet |
| 2026-10-23 | The clock and the attack waves start only when a base is secured; before that the game has no time limit. Win = secure a base and hold it until the clock runs out |
| 2026-10-23 | Game Data workbook: MP5, Mk14 EBR and RPK added; Militia and Heavy Insurgent enemy types; Armour column on the Enemies tab is each type's minimum armour |
| 2026-10-23 | New enemies placed: Militia rove Najaf's streets (market, west, avenue); Heavy Insurgents guard the clinic and the building site; waves start with Militia and bring Heavy Insurgents later. MP5 placed in the street by the market, Mk14 EBR on the clinic roof |
| 2026-10-23 | Subtle aim assist while aiming down sights: within 5° of a visible enemy (60 m) the crosshair is drawn onto their chest and follows them a little. Strength and reach on the tuning panel |
| 2026-10-23 | Wave rhythm: beat a wave, 20 s break, next wave (replaces shrinking timed gaps); at most 20 attackers alive at once, the rest wait at the map edge |
| 2026-10-23 | Aiming a rifle: stock at the shoulder, eye just behind the top cover looking along it (weapons get an optional `eye` point); pistols stay at arm's length |
| 2026-10-23 | RPK drawn: real proportions (1.04 m, 75-round drum, club-foot stock, bipod folded), look from the OpenArt sheet |
| 2026-10-23 | Insurgent redrawn from an OpenArt sheet: sand head wrap and scarf, khaki tunic, olive chest rig (the armour part), olive trousers, dark boots, rolled sleeves |
| 2026-10-23 | Rubble is decoration only (no collision, nothing stands on it, bullets pass): fixes getting stuck in rubble after falling through a hole; broken walls leave rubble everywhere again |
| 2026-10-23 | Heavy Insurgent has its own model: black helmet, face scarf, bulky black vest with shoulder pads, black gloves and knee pads. Each enemy type can have its own model (`enemy_<type>.glb`) |
| 2026-10-23 | Militia has its own model: green face scarf, dark red track jacket with pushed-up sleeves, grey t-shirt, bandolier and hip pouch, grey cargo trousers, brown trainers, bare forearms; no armour |
| 2026-10-23 | Base markings: each build spot is a dashed yellow-and-black hazard square with an upgrade icon; dashed lines show where walls go. Faint until you carry the matching crate (then they pulse); gone once the upgrade is at its top level |
| 2026-10-23 | Najaf completed: refinery and outskirts districts built to the agreed layout; three base areas (police station, truck stop, control building), the first one cleared becomes yours and the others stay enemy territory; 65 enemies in 22 groups |
| 2026-10-23 | Upgrade effects (starting values, in `data/upgrades.csv`): ammunition supply, first aid locker and armour locker each have 3 levels and keep one pickup waiting on top of the locker; walls keep 2 levels. A destroyed locker loses its upgrade |
| 2026-10-23 | Fuel tanks: a rocket hit blows up the whole tank; the blast reaches 12 m from the tank wall, as strong as four rocket hits at the wall and nothing at the edge; no chain reactions (settings.json → hazards) |
| 2026-10-23 | Waves now come in from the two map-edge entry points nearest your base that are at least 60 m from any player (on the full map the furthest points meant a long walk) |
| 2026-10-23 | Co-op: the host only sends enemies within 90 m of a player (plus all attackers), so 60+ enemies fit in a message; builds and broken base pieces are sent as an ordered list so both phones stay identical |
| 2026-10-23 | Reload, swap and use buttons register on the first tap (taps waiting for the next game step instead of being dropped on fast screens) |
| 2026-10-23 | AK-47 reload shows the magazine change: rifle cants over, left hand rocks the magazine out forward and lets it fall out of view, fetches a fresh one from below, hooks it in and rocks it home; the right hand pulls the charging handle only when the gun was empty. Same reload time as before. Other weapons keep the simple dip until their models have a `magazine` part |
| 2026-10-23 | Heavy insurgents drop an armour plate (+15) when killed, read from the Enemies tab's new *Item drop* column |
| 2026-10-23 | RGD-5 grenade as a quick-use item: grenade button with count under the map, 0.7 s toss with no firing meanwhile, timed 3.5 s fuse with bounces; from map pickups, insurgent and heavy insurgent drops, and the ammunition supply; none at the start; carry up to 5 |
| 2026-10-23 | Suicide bomber: runs at players and blows up within 1 m (RGD-5 blast); his vest also goes off if he is shot dead; beeps as he closes in; in attack waves from wave 2 and placed in each Najaf district. Placeholder look: militia clothes with a tan explosive vest and a blinking light |
| 2026-10-23 | Co-op messages: when many enemies are around both players, the furthest are left out first |
| 2026-10-23 | Suicide bomber has his own model from an OpenArt sheet: red face scarf, maroon track jacket, tan explosive charges on a black harness and a belt of charges, detonator in his right hand, blinking red light on his chest |
| 2026-10-23 | Reload animations for the RPK (drum rocks out and in like the AK's magazine; charging handle only when empty) and the P320 (magazine slides out of the grip and falls, fresh one pushed home; when empty the slide stays locked back until the slide catch drops it at the end) |
| 2026-10-23 | Mk14 EBR gets a 4× scope: full-screen scope view when aiming, slower look, slight drift. Weapons tab has a new *Scope magnification* column (empty = iron sights) |
| 2026-10-23 | Carrying a crate no longer slows you down (it slowed the game too much) |
| 2026-10-23 | Mk14 EBR drawn from the side view of its OpenArt sheet: black chassis, railed handguard, 4× scope on rings, folded bipod, 20-round magazine (rocks in and out on a reload, like the AK), operating rod handle pulled on an empty reload |
| 2026-10-23 | Lived-in streets, first part: building colours, shop fronts, windows, rooftops, wires and ground marks (decoration only). Street clutter and movement (smoke, washing swaying, birds, ambient sound) next |
| 2026-10-23 | Wrecked cars and trucks will be solid cover, not decoration |

## Open questions

1. **Upgrade numbers.** Starting values are in `data/upgrades.csv`; tune after
   play-testing. Walls have 2 levels (a third could be a tougher or taller wall).
2. **Enemy roster** file (later).
3. **Name** of the game.
