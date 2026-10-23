# Levels

Each level is a folder in `data/levels/` with:

| File | What it is |
|---|---|
| `level.json` | Where everything goes: buildings, props, base, enemies, pickups, weather, timer |
| `terrain.txt` | Ground height. One digit per point, points 4 m apart. Height = digit × 0.5 m (0–9 → 0–4.5 m) |
| `ground.txt` | Ground surface per 4 × 4 m square: `s` sand, `r` road, `p` paving, `g` gravel |
| `buildings/*.txt` | Building floor plans, one text grid per floor |

Coordinates are in metres: **x** runs west → east (left → right in the text files),
**z** runs north → south (top → bottom). Najaf is 256 × 256 m; the test slice is 100 × 100 m.

Najaf's files were first drafted by `tools/make_najaf.py`. Edit the files here directly
from now on (running the script again would overwrite your edits).

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
| `,` | Rubble (walkable) |
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

Simple obstacles outside buildings: `{ "type": "lowwall" | "crate", "x", "z", "w", "d", "h" }`
fills a `w` × `d` rectangle, `h` blocks high (default 1).

## Enemy groups in level.json

Each group in `enemy_groups` places a few enemies that guard or roam an area and come back
after `respawn` seconds. Optional `"type"` picks the enemy type from the Enemies tab of
`data/Game Data.xlsx`, written in lowercase with `_` for spaces: `"insurgent"` (the default),
`"militia"`, `"heavy_insurgent"`. Each type only carries weapons from its *Possible Weapons
Equipped* list; the group's `weapons` weights choose among those (a listed weapon the group
doesn't mention gets weight 1, and weight 0 rules a weapon out).
