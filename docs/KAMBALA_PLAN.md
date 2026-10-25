# Kambala mine (Level 2): layout plan

Status: **agreed 2026-10-25. Stage 1 built 2026-10-25:** ground, the pit (four 3 m benches with rock walls, haul road), buildings, bases, crates, enemies, pickups, west-edge waves. **Stage 2 built:** the forest (about 1,000 trees, about 1,000 undergrowth patches, grass), palms and banana plants in the village, scrub on the mine rim. **Stage 3 built:** blasting (detonator, siren, 27 charges on three bench walls, three unstable faces; on the haul road rock falls sparsely and knee-high so it never seals the pit). Still to come: rain and mist, art and village dressing. Unlocked by winning Najaf.

Plan: [`kambala_layout.png`](kambala_layout.png). Grid squares are 32 m, labelled A–H across
and 1–8 down, as for Najaf ("move the sawmill to C2").

## Theme

A company mine in the **Democratic Republic of Congo**: red laterite earth, grey cut rock,
dark green jungle, rusting yellow mining machinery. Tropical weather instead of sandstorms.
**Name: Kambala mine.** The story: rebel fighters come out of the jungle to attack the mine.

## Size and difficulty

**256 × 256 m**, the same as Najaf (about a minute to walk across, kind to phones).
Difficulty like Najaf: about **60 enemies** in about 23 groups, the same enemy types and
weapons, six attack-wave entry points, **15 minutes** to hold once a base is claimed.

## Three zones around a junction

Players start at the **junction (E5)** where the main road comes up from the south and splits
towards the mine, the forest and the village, each 60–100 m away.

| Zone | Where | Feel | Its base area |
|---|---|---|---|
| **The mine** | north-east (E1–H4) | An open pit about 110 × 90 m, **four benches of 3 m down to a floor 12 m deep** (3 m keeps the bench walls block-aligned). A **haul road** spirals down from the south-west rim; a few stairs are cut into the bench faces as short cuts. Cut rock slabs (breakable) as cover on the benches and the floor. A haul truck, an excavator, a bulldozer and a drill rig (solid cover). On the rim: the site office, the equipment yard and the explosives magazine. At the bottom of the north wall, the **tunnel portal, blocked** by a cave-in and a steel gate. Height and long sight lines. | **A · Pit-floor workshop** (F2–G2): deep in the pit, overlooked by every bench. The hardest base to hold; the detonator is right next to it. |
| **The forest** | west (A1–D7) | Tropical jungle. **Trees are solid**: they stop people and bullets, and break under fire or explosions, leaving a **stump** (low cover). **Shrubs everywhere hide you** from enemy eyes but stop nothing (you can walk and shoot through them). A logging road, a sawmill, a hunters' camp. Short range: the MP5 and Mini Uzi are found here. Mist banks drift through. | **B · Logging camp** (B2–B3): huts and log stacks in a clearing. Enemies can creep up through the trees and shrubs. |
| **The village** | south and south-east (D5–H8) | Company buildings (ground floor and one upper floor): HQ, clinic, workers' dormitory, store. Around them about 25 **mud houses and thatched huts** (ground floor only), a football pitch, cassava fields towards the forest. A **watch tower** you can climb (stairs inside), a sniper's perch before you clear it and a lookout after. | **C · Company HQ** (F6–G7): the two-floor building beside the tower. Open streets all round. |

Map edge: rock walls and spoil heaps around the mine, an impassable wall of jungle in the
forest, hills and the company fence round the village. None of it can be crossed or broken.

## Base-building crates

As in Najaf, each sits in a defended spot outside the base areas, so whichever base you take
you have to go out for them.

| Crate | Where | Guarded by |
|---|---|---|
| Ammunition | Explosives magazine on the mine's east rim (H4) | 4 |
| Construction | Equipment yard on the mine's west rim (E3) | 3 |
| Construction | Sawmill, forest (C1) | 4 |
| Medical | Village clinic (G6) | 3 |
| Armour | Security post at the village's south-east gate (H8) | 4 |

## Enemies

About 60 at the start (red dots): the pit floor (4, the workshop garrison), the benches
and rim (about 18), the forest (about 19, many roaming among the trees), the village (about
20, including a marksman in the watch tower and the HQ garrison). Suicide bombers in each
zone, as in Najaf.

**Attack waves always come out of the forest**: six jungle trails on the **west edge (column
A, rows 1–8)**, red arrows. Rebels attacking the mine. This shapes the three bases:

- **B · Logging camp** is in the forest, so attackers reach it first and fast, through trees
  and shrubs.
- **C · Company HQ** gets them after they cross the cassava fields and village streets.
- **A · Pit-floor workshop** is furthest away (about 190 m): waves take longest to arrive, and
  come over the west rim and down the haul road, straight into the blasting zone. That
  balances the pit's tough position.

## Signature: blasting the mine

- A **detonator** (plunger box with "DANGER — BLASTING" signs) stands on the pit floor next
  to the workshop. Press **DETONATE**: a **siren** wails for about 5 seconds, then the
  **charges set along the bench faces** go off (red dots on the plan).
- The blasts kill or hurt everyone in the marked danger strips below the faces, players
  included (the siren warns you too), and **bring rock down**: the fallen rock becomes new
  breakable cover and can block the haul road or a stair until it is shot or blown apart.
- **It recharges: once every 60 seconds.** Ideal for letting an attack wave pour down the
  haul road and then blowing it.
- **Unstable rock faces** (cracked rock with warning tape, yellow triangles): an RPG or
  grenade hit brings one down onto whoever is below, like the fuel tanks in Najaf. Enemy
  rockets can do it too.

## Weather

Passing **tropical downpours** (anywhere) and **mist banks** (in the forest) cut how far
everyone sees, using the same system as Najaf's sandstorms with new rain and mist effects.

## Music

Three zones, three tracks (Martial is finding them): for example `Kambala-Mine`,
`Kambala-Forest`, `Kambala-Village`, set up like Najaf's city track.

## What has to be built (engine)

1. **Deeper terrain.** Najaf's height map only goes up to 4.5 m; the rim needs about 12 m.
   The height file gets letters for higher ground (existing levels unchanged), and the level
   height limit goes from 16 to 24 m.
2. **Trees:** a solid, breakable trunk with a canopy above; broken, it leaves a stump.
3. **Shrubs:** a new kind of block that hides you from enemy sight but stops nothing.
4. **Cut rock slabs:** a breakable rock material (materials.csv).
5. **Blasting:** detonator, charges, siren, danger strips, falling rock, 60 s recharge
   (numbers in settings.json); unstable faces set off by explosions.
6. **Rain and mist** effects for the weather zones.
7. **Red-earth look:** ground and block textures (laterite, cut rock, mud brick, corrugated
   metal, thatch), and the level's colours.

## New art (OpenArt sheets, one at a time; stand-ins until each arrives)

Tropical trees (2–3 kinds) and shrub sprites; haul truck, excavator, bulldozer, drill rig;
detonator box; tunnel portal; watch tower; block textures for laterite, rock, mud brick,
corrugated metal and thatch.

## Agreed (2026-10-25)

- Theme: a mining site in the DR Congo, red laterite earth.
- Size like Najaf; difficulty like Najaf.
- Three zones: mine (pit, blocked tunnel, rock slabs, vehicles), forest (solid breakable
  trees leaving stumps, see-through-but-hiding shrubs), village (company buildings of up to
  two floors, mud houses and huts, a watch tower).
- Mine base on the **pit floor**.
- Blasting recharges **every 60 seconds**.
- Cut rock slabs are **breakable**.
- Martial finds the music.
- Name: **Kambala mine**.
- **All attack waves come out of the forest on the west edge (A1–A8).**

## Still open

Nothing for the layout.
