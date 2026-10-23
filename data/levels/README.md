# Levels

Each level is a folder in `data/levels/` with:

| File | What it is |
|---|---|
| `level.json` | Where everything goes: buildings, props, bases, enemies, pickups, crates, weather, timer |
| `terrain.txt` | Ground height. One digit per point, points 4 m apart. Height = digit × 0.5 m (0–9 → 0–4.5 m) |
| `ground.txt` | Ground surface per 4 × 4 m square: `s` sand, `r` road, `p` paving, `g` gravel, `c` concrete, `d` dirt track |
| `buildings/*.txt` | Building floor plans, one text grid per floor |

Coordinates are in metres: **x** runs west → east (left → right in the text files),
**z** runs north → south (top → bottom). Najaf is 256 × 256 m; the test slice is 100 × 100 m.

Najaf's city was first drafted by `tools/make_najaf.py`, the refinery and outskirts by
`tools/make_najaf_districts.py`. Edit the files here directly from now on. (Running
`make_najaf.py` again would overwrite everything; `make_najaf_districts.py` only replaces
the entries tagged `"district": "refinery"` or `"outskirts"` and the ground outside the city.)

## Building files

One character = 1 metre. Start each floor with a line `floor 0`, `floor 1`, … Each
floor is 3 m tall. A building is placed in `level.json` by its top-left (north-west)
corner, and the ground under it is levelled automatically.

| Symbol | Meaning |
|---|---|
| `.` | Floor (concrete slab; on floor 0 it's just the ground) |
| ` ` (space) | Nothing: a hole in the floor, or open air |
| `#` | Wall, 3 m high, **destructible** (becomes rubble) |
| `X` | Concrete column, 3 m high, **indestructible** |
| `w` | Wall with a window opening between 1 m and 2 m |
| `d` | Doorway (open, wall above head height) |
| `l` | Low wall, 1 m high (cover you can shoot over), destructible |
| `c` | Wooden crate, 1 m high, destructible |
| `,` | Rubble (decoration only: you walk straight through it) |
| `>` `<` `^` `v` | Stairs going **up** towards east, west, north or south |

Stairs: write three stair symbols in a row (`>>>`). Each one is 1 m higher than the
last, so three of them climb exactly one floor, and you step off onto the floor above
at the next square. The hole in the floor above is cut automatically.

Floors, columns and stairs never break, so a building can't collapse or block itself.

## Turning and mirroring buildings

In `level.json`, a building can be placed turned or mirrored, so one file can be reused:

```json
{ "file": "m2_damaged.txt", "x": 40, "z": 30, "turn": 90, "mirror": true }
```

`turn` is clockwise seen from above (0, 90, 180 or 270). `mirror` flips it left to right
before turning. Stairs keep working either way. `x` and `z` are still the north-west
corner of the building as it ends up on the map.

Najaf's city buildings are named by size, floors and state: `s` 8 × 7 m, `m` 10 × 9 m,
`l` 12 × 10 m, then `1`–`3` floors, then `intact`, `damaged` or `ruined`
(for example `l3_ruined.txt`).

## Props in level.json

Simple shapes outside buildings. `{ "type", "x", "z", "w", "d", "h", "y" }` fills a
`w` × `d` rectangle, `h` blocks high (default 1), starting `y` metres above the ground
(default 0; the pipe racks use `"y": 2` so you can walk under them).

| `type` | What it is |
|---|---|
| `lowwall`, `crate`, `sandbag` | Breakable cover |
| `metal` | Steel: containers, trucks, towers, supports. Unbreakable |
| `pipe` | Refinery pipework. Unbreakable |
| `rock` | Boulders. Unbreakable |
| `slab`, `column` | Concrete. Unbreakable |
| `fence` | Chain-link: nobody can walk through it, but you can see and shoot through it |
| `tank` | A fuel tank (always round): it blows up when a rocket hits it |

Round shapes: add `"shape": "cylinder"` and give `"r"` (radius) instead of `w` and `d`; `x`
and `z` are then the centre. Fuel tanks are always round: `{ "type": "tank", "x", "z", "r", "h" }`.

## Bases in level.json

`bases` lists the places that can become the player's base; the first one a player clears
and walks into is theirs for the rest of the run. Each has an `id`, a `name`, an `area`
(`x0`, `z0`, `x1`, `z1`), `build_spots` and a `wall_plan`:

- A build spot `{ "x", "z", "upgrade", "needs" }` is one 1 × 1 m square on the ground.
  `upgrade` is a row id in `data/upgrades.csv` (`walls`, `ammo`, `medical`, `armour`) and
  `needs` the crate it takes. Lockers are put on the spot itself, so leave room around it.
- `wall_plan` is a list of rectangles where sandbag walls go.

An enemy group with `"holds_base": "<base id>"` defends that base: it must be cleared to
claim it, and stops coming back once that base is yours. (A level with only one base may
use `"base": { … }` and `"holds_base": true` instead.)

`base_items` places the crates: `{ "item": "construction_crate" | "ammo_crate" |
"medical_crate" | "armour_crate", "x", "z", "y" }`. Used crates come back at the same spot.

## Weather zones in level.json

`{ "type": "sandstorm", "x", "z", "radius", "chance_per_minute", "min_duration", "max_duration" }`
starts at random. `{ "type": "smoke", "x", "z", "radius", "source": { "x", "y", "z" } }` is
always there (the flare stack's smoke); `source` is where the plume and flame are drawn.

`wave_spawns` are the map-edge points attack waves come in from: the two nearest your base
that are at least 60 m from any player are used.

## Enemy groups in level.json

Each group in `enemy_groups` places a few enemies that guard or roam an area and come back
after `respawn` seconds. Optional `"type"` picks the enemy type from the Enemies tab of
`data/Game Data.xlsx`, written in lowercase with `_` for spaces: `"insurgent"` (the default),
`"militia"`, `"heavy_insurgent"`. Each type only carries weapons from its *Possible Weapons
Equipped* list; the group's `weapons` weights choose among those (a listed weapon the group
doesn't mention gets weight 1, and weight 0 rules a weapon out).
