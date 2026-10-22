# Level maps

Each level is a plain text grid. One character is one floor tile, 2 × 2 metres.
Edit the file in any text editor (Notepad is fine) and save it. While `npm run dev`
is running, the game reloads with the change.

| Symbol | Meaning |
|---|---|
| `#` | Wall, full height (4 m), blocks movement and sight |
| `R` | Pallet rack (3.2 m), blocks movement and sight |
| `C` | Stacked crates (2.4 m), blocks movement and sight |
| `c` | Single crate (1.2 m), blocks movement; you and enemies can see and shoot over it |
| `b` | Red explosive drum |
| `.` | Floor |
| `=` | Floor with yellow hazard stripes (cosmetic) |
| `P` | Player 1 start (facing east, to the right) |
| `2` | Player 2 start, used when co-op is added (treated as floor until then) |
| `E` | Enemy (insurgent) |
| `h` | Medkit |
| `a` | Ammo box |

Rules:

- The outer edge is always forced to wall, so a missing `#` on the border is harmless.
- Rows may be different lengths; short rows are padded with wall.
- Pickup symbols come from `data/pickups.csv` (`map_symbol` column), so new pickup types
  can be added there without touching code.
