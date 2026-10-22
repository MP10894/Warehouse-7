# Warehouse 7: Art specification (draft for review)

This document says what each piece of art must look like **as a file**, so it can drop into
the game without code changes. It does not decide the artistic style beyond what
DESIGN.md already says (low-poly, PS1 look, arid ruined city).

Status: **draft**. The choices marked **▶ Choice** at the end need Martial's decision.
The numbers in the tables are taken from the placeholder art in the game today.

---

## 1. How art gets into the game

Once the asset loader is built (a one-time code change, not done yet):

1. Put a correctly named file in the `assets/` folder (names in section 9).
2. Commit and push. The next build uses it.
3. Any file that is missing keeps using the code-drawn placeholder, so art can arrive one
   piece at a time.
4. A file that breaks a rule below (wrong size, missing part name, too many triangles) is
   skipped and its placeholder is used. The tuning panel will list what was skipped and why.

Art never changes how the game plays. Hit boxes, collision and bullet paths come from the
block grid and the game rules, not from the shape of a model. A bigger enemy model is
not easier to hit.

## 2. Rules that apply to everything

| Rule | Value |
|---|---|
| Unit | 1 unit = **1 metre** |
| Up | **+Y** |
| Front | The model faces **−Z**. In Blockbench that is "north". In Blender, export as glTF with "+Y up" ticked and model the front facing **+Y** (Blender's back view). If something arrives facing backwards, it's a one-line fix. |
| 3D file format | **glTF binary (`.glb`)**, one model per file. Blockbench and Blender both export it. |
| Texture format | **PNG**, sizes in powers of two (8, 16, 32, 64, 128), embedded in the `.glb` or alongside it with the same name. |
| Texture filtering | Pixels stay sharp: the game turns off smoothing. Don't pre-blur. |
| Lighting | Don't paint strong light or shadow direction into textures. The game adds simple sun shading to models and darkens blocks under roofs itself. Gentle wear, dirt and edge darkening are fine. |
| Transparency | None, except windows' broken glass and effect sprites (section 8). |
| Animation | None inside files. Characters are animated by the game rotating named parts (section 4). |
| Materials | One texture per model (an atlas). Base colour only: no normal maps, no shine. |

## 3. World blocks (walls, floors, crates…)

The level is built from 1 m blocks. Each block type uses one tileable square texture that
repeats across the surface. **Tileable** means the left edge continues into the right edge
and the top into the bottom, with no visible seam.

| File | Used for | Today: size, metres covered | Pixels per metre today |
|---|---|---|---|
| `ground.png` | Terrain (sand, dirt) | 32 px over 4 m | 8 |
| `concrete.png` | Floors, roofs, slabs | 32 px over 2 m | 16 |
| `wall.png` | Ordinary walls (breakable) | 32 px over 1 m | 32 |
| `column.png` | Structural columns (unbreakable) | 16 px over 1 m | 16 |
| `lowwall.png` | Low walls | 32 px over 1 m | 32 |
| `crate.png` | Wooden crates (scenery) | 32 px over 1 m | 32 |
| `sandbag.png` | Sandbag walls (player-built) | 32 px over 1 m | 32 |
| `stairs.png` | Stairs (stepped stripes run across) | 16 px over 1 m | 16 |
| `rubble.png` | Rubble from destroyed walls | 16 px over 1 m | 16 |
| `floor_tile.png` | Painted marks on the ground (base build spots) | 16 px over 1 m | 16 |

The densities are mixed today because they were drawn quickly. Choice 1 below fixes one rule.

New block textures expected for Najaf (names reserved, see docs/NAJAF_PLAN.md):
`metal.png` (refinery walls and walkways), `pipe.png`, `tank.png`, `asphalt.png` (roads),
`rock.png` (outcrops), `plaster.png` (intact city houses).

## 4. Characters

A character is **separate rigid parts**, each in its own named object inside one `.glb`.
The game rotates the parts to walk, aim, fall and lie downed. There is no skeleton and
no skinning, so joints can be simple: overlapping ends hide the gaps.

**Budget: 300 triangles or fewer for the whole character, gun not included.**
(The placeholder uses about 180.)

Each part's **pivot** (its origin in the modelling tool) must sit at the joint it turns
around. Positions are in metres from the point between the feet, character facing −Z.

| Part name | Pivot (x, y, z) | What turns it | Placeholder size (w × h × d) |
|---|---|---|---|
| `pelvis` | 0, 0.98, 0 | the whole body tips over when killed | 0.34 × 0.16 × 0.20 |
| `torso` | 0, 1.04, 0 | leans with aim pitch, flinches | 0.38 × 0.48 × 0.22 |
| `vest` | 0, 1.04, 0 | shown only while the character has armour | 0.42 × 0.36 × 0.28 |
| `head` | 0, 1.52, 0 | (follows torso) | 0.21 × 0.23 × 0.23 |
| `upper_arm_R` / `upper_arm_L` | ±0.24, 1.46, 0 | shoulder | 0.10 × 0.30 × 0.10 |
| `lower_arm_R` / `lower_arm_L` | ±0.24, 1.16, 0 | elbow | 0.09 × 0.28 × 0.09 |
| `upper_leg_R` / `upper_leg_L` | ±0.10, 0.94, 0 | hip | 0.14 × 0.44 × 0.15 |
| `lower_leg_R` / `lower_leg_L` | ±0.10, 0.50, 0 | knee (boot included) | 0.12 × 0.42 × 0.13 |
| `gun_mount` (empty point) | 0.15, 1.34, −0.30 | where the weapon's grip is placed | — |

R is the character's own right (+x when facing −Z).

- Overall height about **1.75–1.80 m**. Keep within ±10 % so heads line up with headshot zones.
- Put the parts in the "standing, arms down" pose. The game raises the arms to aim.
- Files: `enemy_insurgent.glb`, `player.glb`. Later enemy types get `enemy_<type>.glb`
  with the type name from the Enemies tab.
- **Colour variants** (several insurgent outfits, partner colours in co-op) are separate
  textures for the same model: `enemy_insurgent_2.png`, `player_p2.png`, and so on.
- The player team must be **easy to tell apart from enemies at 40 m**: different
  overall value (lighter or darker) as well as hue, because the screen is low resolution.

## 5. Weapons

One `.glb` per weapon, named with the weapon id from the Weapons tab
(lowercase, spaces become `_`, hyphens dropped): `sig_p320.glb`, `m4a1.glb`, `ak47.glb`,
`rpg7.glb`.

- **Origin at the grip** (where the right hand holds it). Barrel points along **−Z**.
- Real-world size. The game scales weapons up 1.4× in other soldiers' hands so they read
  at a distance; draw them true size.
- Two named empty points:
  - `muzzle`: the end of the barrel. Bullets, flashes and smoke start here.
  - `sight`: the point your eye looks through when aiming down sights. The game lines
    this up with the centre of the screen.
- The same model is used in first person (seen close) and on soldiers (seen small), so the
  side facing the player's eye (top and right side) matters most.

| Weapon | Placeholder length | Muzzle point today | Triangles today |
|---|---|---|---|
| Sig P320 | 0.19 m | 0, 0.06, −0.15 | 24 |
| M4A1 | 0.85 m | 0, 0.055, −0.60 | 84 |
| AK-47 | 0.88 m | 0, 0.065, −0.58 | 72 |
| RPG-7 | 0.95 m (+ warhead) | 0, 0.07, −0.80 | about 55 |

The RPG-7 warhead should be a separate named part, `warhead`, so the game can hide it
between firing and reloading (not done today).

First-person **hands and arms are not drawn today**. Choice 4 below.

## 6. Pickups, crates and base upgrades

Origin at the **bottom centre**, so the object sits on the floor. Pickups on the ground
slowly turn, so all sides are seen.

| File | What | Rough size |
|---|---|---|
| `pickup_ammo.glb` | ammunition box | 0.30 × 0.16 × 0.20 |
| `pickup_armour.glb` | armour plate | 0.42 × 0.42 × 0.12 |
| `pickup_health.glb` | health pack (new) | 0.30 × 0.18 × 0.20 |
| `crate_construction.glb` | construction crate (carried) | 0.80 × 0.55 × 0.55 |
| `crate_ammo.glb` | closed ammunition crate (carried) | 0.80 × 0.55 × 0.55 |
| `crate_medical.glb` | medical crate (carried) | 0.80 × 0.55 × 0.55 |
| `crate_armour.glb` | armour crate (carried) | 0.80 × 0.55 × 0.55 |
| `upgrade_ammo_1.glb` … `_3` | open ammunition crate, levels 1 to 3 | fits in 1 × 1 × 1 m |
| `upgrade_medical_1.glb` … `_3` | first aid locker, levels 1 to 3 | fits in 1 × 2 × 1 m |
| `upgrade_armour_1.glb` … `_3` | armour locker, levels 1 to 3 | fits in 1 × 2 × 1 m |

- The four carried crates have the **same shape** and differ by colour band and symbol,
  readable at 20 m: yellow band for construction, olive with a bullet for ammunition,
  white with a red cross for medical, grey-blue with a shield for armour.
- Each upgrade level should look visibly better than the last (more stock on shelves,
  reinforced doors), because players check their base at a glance.
- Upgrades sit on 1 m block spots, so they must not stick out of their 1 m footprint.
- Triangle budget for these: see Choice 3.

## 7. Destructible look

Breakable walls, crates and sandbags show damage in three steps, as a second texture row
or separate texture: `wall_damaged.png` (cracks, chips), then rubble when destroyed.
Optional: the game falls back to darkening the block.

## 8. Effects and screen art (later, optional)

Flat sprites, PNG with transparency, kept tiny (16 or 32 px):
`fx_muzzle.png`, `fx_spark.png`, `fx_smoke.png`, `fx_explosion_<1-4>.png` (4 frames),
`fx_sand.png`. HUD icons are drawn in code and stay that way unless we decide otherwise.

## 9. Folder layout and names

```
assets/
  blocks/     ground.png, wall.png, concrete.png …   (section 3)
  characters/ enemy_insurgent.glb, player.glb …      (section 4)
  weapons/    sig_p320.glb, m4a1.glb …                (section 5)
  items/      pickup_*.glb, crate_*.glb, upgrade_*.glb (section 6)
  fx/         fx_*.png                               (section 8)
  sources/    your working files (.bbmodel, .blend). Ignored by the game.
```

Names are **lowercase**, words joined with `_`, no spaces. A wrong name means the file
is ignored and the placeholder shows. That is safe, just confusing.

## 10. Checklist before committing a piece of art

- [ ] Right folder, right name.
- [ ] 1 unit = 1 m; it looks the right size next to a 1 m grid in the tool.
- [ ] Faces −Z (north in Blockbench).
- [ ] Origin in the right place (feet, grip or bottom centre).
- [ ] Named parts and points present (characters: section 4; weapons: `muzzle`, `sight`).
- [ ] Under the triangle budget.
- [ ] Texture is a power-of-two size, matches the pixel density, and has no baked lighting.
- [ ] Looked at in the game on the phone, sideways, at play distance.

---

## ▶ Choices for Martial

1. **Pixel density.** One rule for all world textures.
   - (a) **32 px per metre** for walls, props and floors; 16 for terrain. Crisp up close. *(recommended)*
   - (b) 16 px per metre everywhere. Chunkier and more PS1-like; less drawing.
2. **Modelling tool.**
   - (a) **Blockbench**: free, made for box-built low-poly models with pixel textures,
     paints textures directly on the model, exports `.glb`. Matches the current look. *(recommended)*
   - (b) Blender: more powerful, steeper to learn.
   - (c) Bought or free asset packs, adapted to the rules above. Check the licence allows games.
3. **Triangle budgets** beyond characters (300 agreed).
   - Proposed: weapons **≤ 200** (seen close in first person), carried crates and pickups
     **≤ 60**, base upgrades **≤ 150** each.
4. **First-person hands.** Today the gun floats with no hands.
   - (a) Add simple gloved hands (two parts, ≤ 100 triangles, in `player_hands.glb`). *(recommended)*
   - (b) Keep no hands.
5. **Palette.** Keep free colour, or limit everything to one shared palette
   (for example 32–64 colours). A shared palette makes art from different sources look like
   one game. I can generate a starting palette from the current placeholder colours.
6. **Who makes the first piece.** Suggested first test: one block texture (`wall.png`) and the
   insurgent (`enemy_insurgent.glb`). That proves both paths of the loader.
