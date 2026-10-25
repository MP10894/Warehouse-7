# Warehouse 7: Art specification

This document says what each piece of art must look like **as a file**, so it can drop into
the game without code changes. It does not decide the artistic style beyond what
DESIGN.md already says (low-poly, PS1 look, arid ruined city).

Status: **agreed 2026-10-22** (decisions at the end). The asset loader is built.

---

## 1. How art gets into the game

1. Put a correctly named file in the `assets/` folder (names in section 9).
2. Commit and push. The next build of the game (and the play link) uses it.
3. Any file that is missing keeps using the code-drawn placeholder, so art can arrive one
   piece at a time.
4. A file that breaks a rule below (wrong size, missing part name, too many triangles) is
   skipped and its placeholder is used. **Tuning panel → Art tab** lists every file the
   game found, whether it is in use, and if not, why.

Art never changes how the game plays. Hit boxes, collision and bullet paths come from the
block grid and the game rules, not from the shape of a model. A bigger enemy model is
not easier to hit.

## 2. Rules that apply to everything

| Rule | Value |
|---|---|
| Tool | **Blockbench** (free), project type **Generic Model**. |
| Scale | **1 Blockbench unit = 1 texture pixel = 1/32 m** for characters, items and blocks: a 1.8 m character is about 58 units tall. **Weapons and first-person hands are 8× finer: 1 unit = 1/256 m** (section 5). |
| Pixel density | **32 pixels per metre** for everything except the terrain (16 per metre). Because 1 unit = 1 pixel, Blockbench's UV editor gives exactly this density when the texture is painted 1 : 1. |
| Up | **+Y** |
| Front | The model faces **north** in Blockbench (−Z in the game). |
| Colours | Only colours from the **shared palette** (`assets/palette/`, section 10). |
| 3D file format | **glTF binary (`.glb`)**: File → Export → Export glTF Model, with *Embed textures* on and **scale 32** (weapons and hands: **256**). One model per file. Or save the `.bbmodel` in `assets/sources/` and Claude converts it (`tools/bbmodel.py`). |
| Texture format | **PNG**, sizes in powers of two (8, 16, 32, 64, 128). One texture per model, embedded in the `.glb`. |
| Texture filtering | Pixels stay sharp: the game turns off smoothing. Don't pre-blur. |
| Lighting | Don't paint strong light or shadow direction into textures. The game adds simple sun shading to models and darkens blocks under roofs itself. Gentle wear, dirt and edge darkening are fine. |
| Transparency | None, except effect sprites (section 8). |
| Animation | None inside files. Characters are animated by the game turning named parts (section 4). |
| Materials | Base colour texture only: no normal maps, no shine. |

## 3. World blocks (walls, floors, crates…)

The level is built from 1 m blocks. Each block type uses one **tileable** square texture
that repeats across the surface: the left edge continues into the right edge and the top
into the bottom, with no visible seam. The size is fixed by how many metres the texture
covers:

| File | Used for | Covers | Size |
|---|---|---|---|
| `ground.png` | Terrain (sand, dirt; tinted by the game) | 4 × 4 m | **64 × 64** (16 px/m) |
| `concrete.png` | Floors, roofs, slabs | 2 × 2 m | **64 × 64** |
| `wall.png` | Ordinary walls (breakable) | 1 × 1 m | **32 × 32** |
| `column.png` | Structural columns (unbreakable) | 1 × 1 m | **32 × 32** |
| `lowwall.png` | Low walls | 1 × 1 m | **32 × 32** |
| `crate.png` | Wooden crates (scenery) | 1 × 1 m | **32 × 32** |
| `sandbag.png` | Sandbag walls (player-built) | 1 × 1 m | **32 × 32** |
| `stairs.png` | Stairs (stepped stripes run across) | 1 × 1 m | **32 × 32** |
| `rubble.png` | Rubble from destroyed walls | 1 × 1 m | **32 × 32** |
| `floor_tile.png` | Painted marks on the ground (base build spots) | 1 × 1 m | **32 × 32** |

Block textures are plain PNG files (any paint program; Blockbench isn't needed).

New block textures expected for Najaf (names reserved, see docs/NAJAF_PLAN.md):
`metal.png` (refinery walls and walkways), `pipe.png`, `tank.png`, `asphalt.png` (roads),
`rock.png` (outcrops), `plaster.png` (intact city houses).

## 4. Characters

A character is **separate rigid parts** in one `.glb`. In Blockbench each moving part is a
**group** (folder in the outliner) whose **pivot point** sits on the joint it turns around;
the boxes inside a group move with it. There is no skeleton and no skinning, so joints can
be simple: overlapping ends hide the gaps.

**Budget: 300 triangles or fewer for the whole character, gun not included** (a box is
12 triangles, so 25 boxes). The draft insurgent uses 228. **The player (`player.glb`, Dima
Karpov) may use 600** (about 50 boxes): he's the one character seen up close, by your co-op
partner. Reference photo: `assets/sources/reference/player_dima_karpov_photo.png`.

The groups must have exactly these names and be nested like this (boxes inside them can
have any name):

```
body                 pivot 0, 0, 0          tips over at the feet when killed
├─ (pelvis boxes)
├─ torso             pivot 0, 1.04, 0       leans with aim, flinches
│  ├─ vest           pivot 0, 1.04, 0       shown only while wearing armour
│  ├─ head           pivot 0, 1.52, 0
│  ├─ upper_arm_R    pivot 0.24, 1.46, 0    shoulder
│  │  └─ lower_arm_R pivot 0.24, 1.16, 0    elbow (hand inside)
│  ├─ upper_arm_L    pivot −0.24, 1.46, 0
│  │  └─ lower_arm_L pivot −0.24, 1.16, 0
│  └─ gun_mount      pivot 0.15, 1.34, −0.30   empty group: where the weapon's grip goes
├─ upper_leg_R       pivot 0.10, 0.94, 0    hip
│  └─ lower_leg_R    pivot 0.10, 0.50, 0    knee (boot inside)
└─ upper_leg_L       pivot −0.10, 0.94, 0
   └─ lower_leg_L    pivot −0.10, 0.50, 0
```

Pivots are in metres from the point between the feet (multiply by 32 for Blockbench
units: the shoulder is at 7.68, 46.72, 0). R is the character's own right (+x when facing
north/−Z).

- Overall height **1.75–1.80 m** (the game refuses anything outside 1.5–2.1 m, which
  usually means the export scale was wrong). Heads must line up with headshot zones.
- Pose: standing, **arms hanging down**. The game raises the arms to aim.
- Files: `enemy_insurgent.glb`, `player.glb`, and one per enemy type: `enemy_<type>.glb` with the
  type name from the Enemies tab (e.g. `enemy_heavy_insurgent.glb`, `enemy_militia.glb`,
  `enemy_suicide_bomber.glb`, which must show a clearly readable explosive vest *outside* the
  `vest` group (that group only shows on armoured enemies); a part named `bomb_light` blinks). A type
  without its own file uses the insurgent's.
- **Colour variants** (several insurgent outfits, partner colours in co-op) will be
  separate textures for the same model: `enemy_insurgent_2.png`, `player_p2.png`, and so on.
  (Not read by the game yet.)
- The player is **Dima Karpov in olive drab** (as in his reference photo), even though it is
  close to the insurgents' colours: in co-op the marker over your partner's head tells him
  apart. *Khaki cloth* and *Army green* stay the insurgents' colours.

## 5. Weapons and hands

One `.glb` per weapon, named with the weapon id from the Weapons tab
(lowercase, spaces become `_`, hyphens dropped): `sig_p320.glb`, `m4a1.glb`, `ak47.glb`,
`rpg7.glb`.

**Budget: 400 triangles** (weapons are on screen all the time; raised from 300 on 2026-10-23 so round sights and other details read properly).

**Scale: 1 Blockbench unit = 1 texture pixel = 1/256 m (256 px per metre).** A weapon in
your hands is seen far closer than any wall, so at the world's 32 px per metre a pistol
would be only 6 pixels long. At 256 it is about 50 units (and pixels) long, a rifle about
225. Export with scale 256.

- **Origin at the grip** (where the right hand holds it). Barrel points **north** (−Z).
- Real-world size. The game draws weapons 1.4× bigger in other soldiers' hands so they
  read at a distance; model them true size.
- Named **empty groups** used as points:
  - `muzzle` (required): the end of the barrel. Bullets, flashes and smoke start here.
  - `sight` (required): the point your eye looks through when aiming down sights. The
    game puts it at the centre of the screen.
  - `eye` (optional, for shouldered weapons): where the shooter's eye sits when aiming,
    with the stock against the shoulder: just behind the top cover, on the sight line. The
    game puts your eye exactly there. Without it the game holds the weapon out at arm's
    length, which suits pistols. Sight line = `sight` to the top of the front sight: keep it
    level with `eye`.
  - `hand_left` (optional): where the left hand holds it (foregrip, or the grip itself for
    the pistol). Without it the game uses a default.
  - `warhead` (RPG-7 only, a group with the warhead boxes): the game uses it as the flying
    rocket.
  - `magazine` (optional, a group with the magazine's boxes): with it, the reload shows the
    left hand taking the magazine out and putting a fresh one in. Put the group's pivot
    where the magazine rocks about: the front lug (top front) for an AK-pattern magazine or
    the RPK's drum. (Pistols drop theirs straight out of the grip instead.)
  - `charging_handle` (optional, a group): slides back 9 cm when an empty gun is reloaded;
    the right hand pulls it. Put it on the right side.
  - `slide` (optional, pistols, a group with the slide and its sights): sits locked back
    while the pistol is empty and slams forward at the end of an empty reload. A pistol's
    `magazine` group should include the part hidden inside the grip, since it slides out
    along the grip.
- The same model is used in first person (seen close) and on soldiers (seen small), so the
  side facing the player's eye (top and right side) matters most.

| Weapon | Placeholder length | Muzzle point today |
|---|---|---|
| Sig P320 | 0.19 m | 0, 0.06, −0.15 |
| M4A1 | 0.85 m | 0, 0.055, −0.60 |
| AK-47 | 0.88 m | 0, 0.065, −0.58 |
| RPG-7 | 0.95 m (+ warhead) | 0, 0.07, −0.80 |

A weapon more than 50 % shorter or longer than the placeholder is refused (usually a wrong
export scale).

**First-person hands and forearms:** `items/player_hands.glb`, **≤ 300 triangles** in all,
same 1/256 m scale. Groups:

- `hand_R`, `hand_L`: each a **fist closed round an upright grip** whose centre line runs
  through the group's pivot: back of the hand on the outside, four separate fingers wrapped
  round the front (north), thumb over the inside, cuff running back (south). `hand_L` is the
  mirror image. Inside each, an empty group `wrist_R` / `wrist_L` marks where the forearm
  starts.
- `arm_R`, `arm_L`: a forearm sleeve running from the group's pivot along south (+z),
  about 0.9 m long (it disappears past your eye).

The game puts `hand_R` on the weapon's grip (its origin) and `hand_L` on `hand_left`; on
rifles the left hand is turned a quarter turn to clamp the handguard from the side, knuckle
plate facing you. Each forearm starts at its wrist and is pointed at your shoulder every
frame, so hands never float. In Blockbench the four groups can sit anywhere (the draft
spreads them out to make editing easy).

Draft: tan tactical glove with hard knuckle plate (reference in
`assets/sources/reference/player_hands_views.png`): 10 boxes per hand (back, palm, knuckle
plate, four fingers, two-part thumb, cuff) plus one per forearm, 264 triangles.

## 6. Pickups, crates and base upgrades

Origin at the **bottom centre**, so the object sits on the floor. Pickups on the ground
slowly turn, so all sides are seen. **Budgets: pickups and crates 60 triangles (5 boxes),
upgrades 150.**

| File | What | Rough size |
|---|---|---|
| `pickup_ammo.glb` | ammunition box | 0.30 × 0.16 × 0.20 |
| `pickup_armour.glb` | armour plate | 0.42 × 0.42 × 0.12 |
| `pickup_grenade.glb` | RGD-5 grenade lying on the ground (also used for thrown ones later) | 0.08 × 0.11 × 0.08 |
| `pickup_health.glb` | first aid kit (from the first aid locker) | 0.34 × 0.22 × 0.24 |
| `pickup_resupply.glb` | ammunition box from the ammunition supply (refills every gun) | 0.42 × 0.24 × 0.26 |
| `crate_construction.glb` | construction crate (carried) | 0.80 × 0.55 × 0.55 |
| `crate_ammo.glb` | closed ammunition crate (carried) | 0.80 × 0.55 × 0.55 |
| `crate_medical.glb` | medical crate (carried) | 0.80 × 0.55 × 0.55 |
| `crate_armour.glb` | armour crate (carried) | 0.80 × 0.55 × 0.55 |
| `upgrade_ammo_1.glb` … `_3` | open ammunition crate, levels 1 to 3 | fits in 1 × 1 × 1 m |
| `upgrade_medical_1.glb` … `_3` | first aid locker, levels 1 to 3 | fits in 1 × 1 × 1 m |
| `upgrade_armour_1.glb` … `_3` | armour locker, levels 1 to 3 | fits in 1 × 1 × 1 m |

- The four carried crates have the **same shape** and differ by colour band and symbol,
  readable at 20 m: yellow band for construction, olive with a bullet for ammunition,
  white with a red cross for medical, grey-blue with a shield for armour.
- Each upgrade level should look visibly better than the last (more stock on shelves,
  reinforced doors), because players check their base at a glance.
- Upgrades sit on 1 m block spots, so they must not stick out of their footprint.
- In the game each upgrade is one 1 × 1 × 1 m block (it can be shot to pieces), and its
  pickup waits on top of it, so the models must fit that cube and have a flat top. Until
  art exists the block is drawn with a plain olive locker texture and a floating icon.
  (Changed from 1 × 2 × 1 m for the lockers on 2026-10-23, when the upgrades were built.)
- The `upgrade_*` files are not read yet; the pickups and crates are.

## 7. Destructible look

Breakable walls, crates and sandbags may show damage before they break, with a second
texture: `wall_damaged.png` (cracks, chips). Optional, not read by the game yet.

## 8. Effects and screen art (later, optional)

Flat sprites, PNG with transparency, kept tiny (16 or 32 px):
`fx_muzzle.png`, `fx_spark.png`, `fx_smoke.png`, `fx_explosion_<1-4>.png` (4 frames),
`fx_sand.png`. Not read by the game yet. HUD icons are drawn in code.

## 9. Folder layout and names

```
assets/
  blocks/     ground.png, wall.png, concrete.png …   (section 3)
  characters/ enemy_insurgent.glb, player.glb …      (section 4)
  weapons/    sig_p320.glb, m4a1.glb …                (section 5)
  items/      pickup_*.glb, crate_*.glb, upgrade_*.glb, player_hands.glb (sections 5–6)
  fx/         fx_*.png                               (section 8)
  palette/    najaf.gpl, najaf.hex, najaf.png        (section 10)
  sources/    working files (.bbmodel and their textures). Ignored by the game.
```

Names are **lowercase**, words joined with `_`, no spaces. A wrong name means the file
is ignored and the placeholder shows; the Art tab lists it as unknown.

## 10. The shared palette

65 colours in 13 ramps of 5 shades, dark to light (Sand, Plaster, Concrete, Wood, Khaki
cloth, Army green, Team blue, Skin, Gun metal, Rust and oil, Red, Yellow, and Extras:
black, white, muzzle-flash yellow, flame orange, sky). Picture: `docs/palette.png`.

- In Blockbench: Paint mode → Color panel → *Import palette* → `assets/palette/najaf.gpl`.
- In other paint programs: the same `.gpl` file (GIMP format) or the `.hex` list.
- To change it, edit `tools/make_palette.py` (or ask Claude) and it rewrites all three files.
- `tools/bbmodel.py` and the Art tab will later flag colours that aren't in the palette.

## 11. Checklist before committing a piece of art

- [ ] Right folder, right name.
- [ ] Scale: 1 unit = 1/32 m, exported with scale 32; weapons and hands 1/256 m, scale 256 (or just save the `.bbmodel` in `sources/`).
- [ ] Faces north.
- [ ] Origin in the right place (feet, grip or bottom centre).
- [ ] Named groups and points present (characters: section 4; weapons: `muzzle`, `sight`).
- [ ] Under the triangle budget.
- [ ] Texture painted 1 : 1, palette colours only, no baked lighting.
- [ ] Opened the Art tab in the game: it says ✓ for the file.
- [ ] Looked at it in the game on the phone, sideways, at play distance.

## 12. How we make art (agreed workflow)

1. **Reference**: a picture of what the piece should look like (e.g. made with OpenArt as
   front/side/back views). Check the image licence allows use in a game.
2. **Draft**: Claude builds a `.bbmodel` with the right sizes, group names, pivots and a
   rough palette texture, plus the `.glb` so it's in the game at once.
3. **Refine**: Martial opens the `.bbmodel` in Blockbench and makes it look right.
4. **Check**: Claude checks the saved file (`tools/bbmodel.py`) and converts or commits it.

**Weapon reference prompt (OpenArt).** The wording used for the Mk14 sheet; keep it the same
for every gun so the sheets match, and change only the name, the description, the "Details"
list, the length and the negative-prompt extras:

```
Prompt
Weapon reference sheet of a single stylised low-poly 3D game asset, PS1-era retro style,
chunky blocky shapes, flat colours with light pixel texture. <GUN NAME>, <one-line description>.
Three orthographic views of the same <gun> at exactly the same scale, laid out on a plain flat
light grey background, even lighting, no shadows:

1. Large full side view (left side), perfectly flat and straight-on, muzzle pointing left, the
   whole <gun> level and horizontal, filling the width of the sheet.
2. Front view, looking straight down the barrel.
3. Back view, looking straight at the butt plate.

Details to show clearly:
* <Body and stock>  * <Barrel>  * <Sights or scope>  * <Magazine>  * <Receiver>
* Accents: a few dark grey parts so the shapes read against the black.

Real proportions: about <N> cm long overall, <where the magazine sits>. Game asset reference,
clean silhouette, consistent design across all three views.

Negative prompt
perspective, three-quarter view, angled view, tilted rifle, foreshortening, camera angle,
dramatic lighting, cast shadows, background scenery, hands, person, text, letters, logos,
extra barrels, multiple rifles, cropped muzzle, cropped stock, different scale between views,
realistic photo, smooth high-poly, <parts this gun must not have>
```

The side view matters most: models can be built from it alone (the Mk14 was).

Drafts so far: `assets/blocks/wall.png`, `assets/sources/enemy_insurgent.bbmodel`
(→ `assets/characters/enemy_insurgent.glb`, rebuilt from its OpenArt sheet),
`assets/sources/enemy_heavy_insurgent.bbmodel` (→ `assets/characters/enemy_heavy_insurgent.glb`), `assets/sources/enemy_militia.bbmodel` (→ `assets/characters/enemy_militia.glb`; the palette has no maroon, so the jacket uses the dark reds), `assets/sources/enemy_suicide_bomber.bbmodel` (→ `assets/characters/enemy_suicide_bomber.glb`; charges and charge belt painted as tan blocks with black tape so they read at a distance), `assets/sources/sig_p320.bbmodel`
(→ `assets/weapons/sig_p320.glb`), `assets/sources/player_hands.bbmodel` (→ `assets/items/player_hands.glb`),
`assets/sources/ak47.bbmodel` (→ `assets/weapons/ak47.glb`; shape from the real rifle's
proportions because its reference sheet had no usable side view), `assets/sources/rpk.bbmodel`
(→ `assets/weapons/rpk.glb`; real proportions, look from its sheet), `assets/sources/mk14ebr.bbmodel` (→ `assets/weapons/mk14ebr.glb`; from the sheet's side view only, since its front and back views were wrong; 300 triangles, the full budget), `assets/sources/mp5.bbmodel` (→ `assets/weapons/mp5.glb`; from the sheet's side view, without the stray prong under the handguard; short grip, a round front sight hood (a ring of 8 turned boxes) and a drum rear sight with a peep hole you aim through; 396 triangles), `assets/sources/m4a1.bbmodel` (→ `assets/weapons/m4a1.glb`; from the lower right side view of its sheet, which drew a flat-top with a railed handguard and a flip-up rear sight; you aim through the rear aperture at the front post between its ears; 360 triangles), `assets/sources/rpg7.bbmodel` (→ `assets/weapons/rpg7.glb`; loaded with a rocket whose warhead is the `warhead` group, hidden once fired and slid back in on a reload; tube straightened onto one axis; 396 triangles) and `assets/sources/pg7v.bbmodel` (→ `assets/items/pg7v.glb`, the PG-7V rocket in flight: warhead, motor, fins; origin where the warhead meets the motor; 132 triangles, projectile budget 150), `assets/sources/fal.bbmodel` (→ `assets/weapons/fal.glb`; classic wooden FAL from its sheet's side view, with a full wooden stock in place of the skeleton stock the sheet drew; aperture rear sight; 372 triangles), `assets/sources/mini_uzi.bbmodel` (→ `assets/weapons/mini_uzi.glb`; from its sheet's side view without the wire stock the sheet drew; the magazine runs up inside the grip so it can slide out on a reload; 240 triangles), `assets/sources/galil.bbmodel` (→ `assets/weapons/galil.glb`; classic Galil AR from its sheet's upper left side view, brown wooden handguard, the real folding tube stock; 324 triangles), all with OpenArt
references in `assets/sources/reference/`.

## Decisions (2026-10-22)

1. Pixel density **32 px per metre**; terrain 16.
2. Tool: **Blockbench**.
3. Triangle budgets: characters **300** (the player **600**), weapons **400** (300 until 2026-10-23), carried crates and pickups **60**,
   base upgrades **150**, first-person hands and forearms **300** (raised from 100 on 2026-10-22
   so the hands read as hands).
4. **Simple gloved hands** in first person.
5. One **shared palette** for all art (section 10).
6. First test pieces: `wall.png` and the insurgent, drafted by Claude.
7. Weapons and first-person hands use 256 px per metre (1 unit = 1/256 m), because they are seen so close.
