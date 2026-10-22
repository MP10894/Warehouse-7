# Levels

Each level is a folder in `data/levels/` with:

| File | What it is |
|---|---|
| `level.json` | Where everything goes: buildings, props, base, enemies, pickups, weather, timer |
| `terrain.txt` | Ground height. One digit per point, points 4 m apart. Height = digit × 0.5 m (0–9 → 0–4.5 m) |
| `ground.txt` | Ground surface per 4 × 4 m square: `s` sand, `r` road, `p` paving, `g` gravel |
| `buildings/*.txt` | Building floor plans, one text grid per floor |

Coordinates are in metres: **x** runs west → east (left → right in the text files),
**z** runs north → south (top → bottom). The test level is 100 × 100 m.

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

## Props in level.json

Simple obstacles outside buildings: `{ "type": "lowwall" | "crate", "x", "z", "w", "d", "h" }`
fills a `w` × `d` rectangle, `h` blocks high (default 1).
