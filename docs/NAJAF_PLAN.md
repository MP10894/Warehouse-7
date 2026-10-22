# Najaf (Level 1): layout plan

Status: **layout agreed 2026-10-22**, one small question still open (end of page).

Map: [`najaf_layout.png`](najaf_layout.png). Grid squares are 32 m and labelled A–H
across and 1–8 down, so notes can say things like "move the clinic to B2".
Nothing here is built yet.

## Size

**256 × 256 m.** Walking speed is 4.6 m/s, so crossing takes about 56 seconds, in line with
the one-minute target. That is 6.5 times the area of the test slice.

## Shape: three districts around a crossroads

Players start at the **crossroads (E5)**, roughly 80–110 m (20–25 s) from each of the three
base areas. The first decision of every game is which base to go for.

| District | Where | Feel | Its base area |
|---|---|---|---|
| **Dense urban** | north-west (A1–D4) | Street grid, buildings of 1–3 floors, about a quarter ruined (columns and floors only) and many partly damaged. Close range, lots of cover, fighting across rooftops and floors. Landmarks: clinic (3 floors), minaret, market square, building site with a crane. | **A · Police station** (C2–C3): a courtyard closed on three sides. Easiest to wall off; enemies can shoot down from nearby roofs. |
| **Industrial refinery** | east (F1–H5) | Concrete pad behind a fence. Fuel tanks, pipe racks to hide behind or climb over, cracking towers, a flare stack, a loading bay. Long sight lines along the pipe corridors. | **C · Control building** (G3–G4): one solid building among tanks. Good sight lines; open on all sides. |
| **Arid outskirts** | south and west (A5–H8) | Sand dunes for high ground, a dry riverbed (wadi) for low ground, rock outcrops, a few single-storey houses, a gas station, an army checkpoint, a quarry, a wrecked convoy. Long range; sandstorms happen here. | **B · Truck stop** (B6–C7): two low buildings and parked trucks. Closest to the start and the most exposed. |

Roads: a highway enters from the south and splits at the crossroads into a city avenue
(north), a refinery access road (east) and a west road. Dirt tracks lead to the truck stop
and the army checkpoint.

## Base-building crates

Each one sits in a **defended spot**, usually with a group of guards. None is inside a
base area, so whichever base you take, you have to go out for them.

| Crate | Where | Guarded by |
|---|---|---|
| Medical | Clinic roof, urban (A1) | 4 enemies on the floors below |
| Construction | Building site, urban (D4) | 4 |
| Construction | Quarry, outskirts (A8) | 3 |
| Ammunition | Army checkpoint, outskirts (F8) | 4 behind a sandbag ring |
| Armour | Refinery security post (H1) | 4 |

**Crates respawn** at their spot after being used, **until your base's matching upgrade
reaches its top level** (level 3). Then that crate stops appearing. Construction crates
always respawn, since walls get destroyed.

**Upgrades have 3 levels. Each level costs one crate of its type**, so a fully upgraded
base takes 3 ammunition, 3 medical and 3 armour crates, plus construction crates for walls.
Each base area has **three build spots** for the upgrades (ammunition crate, first aid
locker, armour locker), plus room for walls around it.

## Enemies

- **20 groups** on the map (red dots): about 2–4 enemies each, about 60 in total at the
  start, spread across the three districts. Each base area holds a garrison of 3–4 that
  must be cleared to claim it.
- Groups respawn over time, except inside your claimed base.
- **Waves** enter at six points on the edges (red arrows), chosen far from all three bases
  so attackers cross open ground before they arrive.

## Exploding fuel tanks

**Fuel tanks explode when hit by an RPG**, with a wide blast that hurts everyone nearby,
players included, and breaks walls and upgrades in range. That makes the refinery base (C)
risky: a stray enemy rocket at a tank next to it can wreck it. Proposed starting values,
to be tuned in the data files: blast radius 12 m, damage like four RPG hits at the
centre, falling off to nothing at the edge. Bullets don't set tanks off.

## Weather

- **Sandstorm zones** over the outskirts (south-west and south-east). As in the slice,
  storms start randomly and cut how far everyone can see. The truck stop base sits inside
  one: cheaper to reach, harder to defend in a storm.
- **Flare smoke:** permanent smoke drifting from the flare stack (H2), a small area
  where sight is always short.

## How it would be built

- Same system as the test slice: buildings are text files (one grid per floor), the
  ground is a height map, scenery is placed in `level.json`. Martial can edit all of these.
- New block types needed: metal (refinery walls and walkways), pipe, tank, road, rock.
  Pipes and tanks are block-built like everything else, so bullets and movement work
  the same way. Their round look can come from art later (see ART_SPEC.md).
- Tanks and towers stay under the current 16 m height limit.
- Many urban buildings can reuse a handful of building files (rotated or mirrored) so the
  city isn't 60 hand-drawn files.

## Technical risks, to check early

1. **Phone frame rate.** 6.5 times the area means more to draw. I'd build the urban district
   first and check the fps counter on your phone before doing the rest. The fix if needed is
   to draw less in the distance (the sandy haze already hides it).
2. **Co-op message size.** The host sends every enemy's position to the partner, within a
   4 KB limit per message. 60 enemies won't fit; the fix is to send only enemies near either
   player, plus the ones that are attacking. Needed before co-op works on this map.
3. **Enemy path-finding** over a bigger map costs more. It's built to only update when the
   map changes, so it should be fine, and I'll measure it.

## Agreed (2026-10-22)

- Name: **Najaf**.
- Start in the middle, at the crossroads.
- The three base areas and their trade-offs as drawn.
- Crate positions as drawn; 3 upgrade levels; one crate per level; crates respawn until
  the matching upgrade is maxed (construction crates always).
- About 60 enemies at the start; adjust after play-testing.
- Fuel tanks explode in a wide radius when hit by an RPG.
- Permanent smoke around the flare stack.
- Time limit: **15 minutes**.
- Map edge: collapsed buildings in the city, a fence at the refinery, high dunes and cliffs
  in the outskirts. None of it can be destroyed or crossed.

## Still open

1. **Chain reactions:** should one exploding tank set off tanks next to it? The tank farm
   (F3–G3) would go up all at once.
