"""Najaf's refinery (east) and arid outskirts (south and west), added to the city district.

Adds to data/levels/najaf/ without touching the city:
  - level.json: buildings, props, bases, enemy groups, pickups, crates and weather for the
    two new districts. Everything it adds is tagged "district": "refinery" or "outskirts",
    and running it again first removes what it added last time, so the city and any hand
    edits to it stay as they are. (Hand edits to refinery/outskirts entries are replaced.)
  - terrain.txt and ground.txt: rewritten outside the city (the city square stays as is).
  - buildings/: the new building files (refinery_*, outskirts_*).

Layout: docs/NAJAF_PLAN.md and docs/najaf_layout.png (agreed 2026-10-22).

    python3 tools/make_najaf_districts.py
"""
import json, math, os, random

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'data', 'levels', 'najaf')
SIZE, SPACING = 256, 4
CITY = 136                      # the city is x < 136 and z < 136
rnd = random.Random(77)


# ---------------------------------------------------------------- building files
def make_building(w, d, floors, state, seed, note='', doors='sew', partition=True):
    """Same rules as tools/make_najaf.py: walls, windows, doors, stairs to the roof."""
    r = random.Random(seed)
    grids = []
    for k in range(floors + 1):
        g = [[' '] * w for _ in range(d)]
        roof = k == floors
        for z in range(d):
            for x in range(w):
                edge = x in (0, w - 1) or z in (0, d - 1)
                corner = x in (0, w - 1) and z in (0, d - 1)
                if roof:
                    g[z][x] = 'l' if edge and state != 'ruined' else '.'
                elif state == 'ruined':
                    pillar = edge and ((x % 4 == 0 or x == w - 1) and (z % 4 == 0 or z == d - 1) or corner)
                    g[z][x] = 'X' if pillar else '.'
                elif not edge:
                    g[z][x] = '.'
                elif corner:
                    g[z][x] = 'X'
                else:
                    along = x if z in (0, d - 1) else z
                    g[z][x] = 'w' if along % 3 == 1 else '#'
        if not roof and state != 'ruined':
            if k == 0:
                if 's' in doors: g[d - 1][w // 2] = 'd'
                if 'n' in doors: g[0][w // 2] = 'd'
                if 'w' in doors: g[d // 2][0] = 'd'
                if 'e' in doors: g[d // 2][w - 1] = 'd'
            if partition and w >= 10 and d >= 7:
                px = w // 2
                for z in range(2, d - 2):
                    g[z][px] = '#'
                g[d // 2][px] = 'd'
        grids.append(g)
    protect = set()
    for k in range(floors):
        if k % 2 == 0:
            z, cells, entry, landing, sym = 1, [2, 3, 4], 1, 5, '>'
        else:
            z, cells, entry, landing, sym = d - 2, [w - 3, w - 4, w - 5], w - 2, w - 6, '<'
        for x in cells:
            grids[k][z][x] = sym
        grids[k][z][entry] = '.'
        grids[k + 1][z][landing] = '.'
        for x in [entry, landing, *cells]:
            for dz in (-1, 0, 1):
                protect.add((x, z + dz))
        if state != 'ruined':
            for x in [entry, landing, *cells]:
                for kk in (k, k + 1):
                    if grids[kk][z][x] in '#wd' and 0 < x < w - 1:
                        grids[kk][z][x] = '.'
    if state in ('damaged', 'ruined'):
        for k in range(1, floors + 1):
            for _ in range(1 if state == 'damaged' else 2):
                for _try in range(30):
                    hw, hd = r.randint(2, 3), r.randint(2, 3)
                    x0, z0 = r.randint(1, max(1, w - hw - 1)), r.randint(1, max(1, d - hd - 1))
                    cells = [(x, z) for x in range(x0, x0 + hw) for z in range(z0, z0 + hd)]
                    if any(c in protect for c in cells):
                        continue
                    for x, z in cells:
                        grids[k][z][x] = ' '
                        if grids[k - 1][z][x] == '.':
                            grids[k - 1][z][x] = ','
                    break
        if state == 'ruined':
            for _ in range(w * d // 8):
                x, z = r.randint(1, w - 2), r.randint(1, d - 2)
                if grids[0][z][x] == '.' and (x, z) not in protect:
                    grids[0][z][x] = ','
    lines = [f'# {note}'.rstrip(), f'# {w} x {d} m, {floors} floor{"s" if floors > 1 else ""} + roof, {state}.',
             '# Symbol guide: data/levels/README.md', '']
    for k, g in enumerate(grids):
        lines.append(f'floor {k}')
        lines += [''.join(row) for row in g]
        lines.append('')
    return '\n'.join(lines)


def canopy(w, d, note):
    """Open shelter: corner columns, roof slab 3 m up (not climbable)."""
    f0 = [[' '] * w for _ in range(d)]
    for x in (0, w - 1):
        for z in (0, d // 2, d - 1):
            f0[z][x] = 'X'
    f1 = [['.'] * w for _ in range(d)]
    out = [f'# {note}', f'# {w} x {d} m open canopy on columns. Symbol guide: data/levels/README.md', '', 'floor 0']
    out += [''.join(r) for r in f0] + ['', 'floor 1'] + [''.join(r) for r in f1] + ['']
    return '\n'.join(out)


FILES = {
    'refinery_security_post.txt': make_building(24, 12, 1, 'intact', 31, 'Refinery security post: the armour crate is inside'),
    'refinery_control.txt': make_building(14, 10, 2, 'intact', 32, 'Refinery control building (base C)'),
    'refinery_shed.txt': make_building(10, 8, 1, 'damaged', 33, 'Refinery pump shed'),
    'outskirts_diner.txt': make_building(14, 8, 1, 'intact', 41, 'Truck stop diner (base B)', doors='sn'),
    'outskirts_garage.txt': make_building(7, 8, 1, 'damaged', 42, 'Truck stop garage (base B)', partition=False),
    'outskirts_house.txt': make_building(8, 7, 1, 'intact', 43, 'Single-storey house'),
    'outskirts_house_damaged.txt': make_building(9, 7, 1, 'damaged', 44, 'Single-storey house, damaged'),
    'outskirts_house_ruined.txt': make_building(8, 8, 1, 'ruined', 45, 'Single-storey house, ruined'),
    'outskirts_checkpoint.txt': make_building(6, 6, 1, 'intact', 46, 'Army checkpoint guard post', partition=False),
    'outskirts_gas_kiosk.txt': make_building(7, 6, 1, 'damaged', 47, 'Gas station kiosk', partition=False),
    'outskirts_gas_canopy.txt': canopy(12, 8, 'Gas station canopy over the pumps'),
}

buildings, props, groups, pickups, items = [], [], [], [], []
TAG = lambda d, e: {**e, 'district': d}


def building(dist, file, x, z, turn=0):
    buildings.append(TAG(dist, {'file': file, 'x': x, 'z': z, **({'turn': turn} if turn else {})}))


def prop(dist, **p):
    props.append(TAG(dist, p))


# ================================================================ REFINERY (east)
R = 'refinery'
# fence: map edge (north and east) and the inner perimeter, with gates
def fence_line(x0, z0, x1, z1, gaps=()):
    if x0 == x1:
        z = z0
        while z <= z1:
            if any(a <= z <= b for a, b in gaps):
                z += 1; continue
            run = z
            while run <= z1 and not any(a <= run <= b for a, b in gaps):
                run += 1
            prop(R, type='fence', x=x0, z=z, w=1, d=run - z, h=3)
            z = run
    else:
        x = x0
        while x <= x1:
            if any(a <= x <= b for a, b in gaps):
                x += 1; continue
            run = x
            while run <= x1 and not any(a <= run <= b for a, b in gaps):
                run += 1
            prop(R, type='fence', x=x, z=z0, w=run - x, d=1, h=3)
            x = run

fence_line(148, 0, 148, 166, gaps=[(55, 62), (134, 146)])     # west side: gate to the city, gate on the access road
fence_line(149, 166, 255, 166, gaps=[(196, 204)])             # south side: gate to the outskirts
fence_line(149, 0, 255, 0)                                     # map edge, north
fence_line(255, 1, 255, 165)                                   # map edge, east

# pipe racks: pipes 2 m up on steel supports (walk underneath), and low pipe runs (cover)
def rack(x0, z0, x1, z1):
    if z0 == z1:   # east-west
        prop(R, type='pipe', x=x0, z=z0, w=x1 - x0 + 1, d=2, h=1, y=2)
        for x in range(x0, x1 + 1, 6):
            prop(R, type='metal', x=x, z=z0, w=1, d=1, h=2)
            prop(R, type='metal', x=x, z=z0 + 1, w=1, d=1, h=2)
    else:          # north-south
        prop(R, type='pipe', x=x0, z=z0, w=2, d=z1 - z0 + 1, h=1, y=2)
        for z in range(z0, z1 + 1, 6):
            prop(R, type='metal', x=x0, z=z, w=1, d=1, h=2)
            prop(R, type='metal', x=x0 + 1, z=z, w=1, d=1, h=2)

rack(152, 59, 252, 59)
rack(169, 4, 169, 162)
rack(171, 119, 252, 119)
rack(231, 61, 231, 162)
for x in range(172, 212, 8):
    prop(R, type='pipe', x=x, z=30, w=6, d=1, h=1)
for x, w in [(190, 6), (198, 6), (218, 5), (225, 5)]:   # gap where the road runs to the control building
    prop(R, type='pipe', x=x, z=128, w=w, d=1, h=1)
for z in range(70, 112, 9):
    prop(R, type='pipe', x=160, z=z, w=1, d=6, h=1)

# tank farm (fuel tanks blow up when a rocket hits them)
TANKS = [(188, 78, 9, 8), (212, 78, 9, 8), (188, 100, 7, 7), (245, 82, 6, 7), (245, 100, 6, 7),
         (200, 150, 8, 8), (220, 150, 6, 7), (184, 148, 5, 6)]
for cx, cz, r, h in TANKS:
    prop(R, type='tank', x=cx, z=cz, r=r, h=h)
    prop(R, type='lowwall', x=cx - 1, z=cz + r + 2, w=3, d=1)          # valve housing as cover

# cracking towers, their frame, and the flare stack
for cx, cz in [(190, 40), (198, 46)]:
    prop(R, type='metal', shape='cylinder', x=cx, z=cz, r=3.5, h=14)
for x, z in [(178, 34), (209, 34), (178, 51), (209, 51)]:
    prop(R, type='metal', x=x, z=z, w=1, d=1, h=6)
prop(R, type='metal', shape='cylinder', x=239.5, z=25.5, r=1.6, h=15)
prop(R, type='lowwall', x=236, z=29, w=7, d=1)
FLARE = {'x': 239.5, 'y': 15.5, 'z': 25.5}

# security post (armour crate) and pump sheds
building(R, 'refinery_security_post.txt', 226, 5)
building(R, 'refinery_shed.txt', 156, 20)
building(R, 'refinery_shed.txt', 180, 123)

# loading bay: containers, pallets, a parked tanker
for x, z, w, d in [(241, 128, 6, 3), (248, 128, 6, 3), (241, 140, 3, 6), (241, 154, 6, 3)]:
    prop(R, type='metal', x=x, z=z, w=w, d=d, h=3)
prop(R, type='metal', x=248, z=144, w=6, d=3, h=3)
prop(R, type='metal', x=249, z=144, w=4, d=3, h=1, y=3)     # stacked container (partly)
for x, z in [(246, 136), (250, 136), (246, 150), (251, 151)]:
    prop(R, type='crate', x=x, z=z, w=2, d=1)
prop(R, type='metal', x=236, z=150, w=3, d=9, h=3)           # tanker truck

# base C: control building
building(R, 'refinery_control.txt', 206, 94)
BASE_C = {
    'id': 'control_building', 'name': 'Control building', 'district': R,
    'area': {'x0': 200, 'z0': 88, 'x1': 226, 'z1': 114},
    'build_spots': [
        {'x': 211, 'z': 108, 'upgrade': 'walls', 'needs': 'construction_crate'},
        {'x': 203, 'z': 98, 'upgrade': 'ammo', 'needs': 'ammo_crate'},
        {'x': 222, 'z': 98, 'upgrade': 'medical', 'needs': 'medical_crate'},
        {'x': 216, 'z': 108, 'upgrade': 'armour', 'needs': 'armour_crate'}],
    'wall_plan': [
        {'x': 203, 'z': 90, 'w': 8, 'd': 1}, {'x': 216, 'z': 90, 'w': 8, 'd': 1},
        {'x': 203, 'z': 112, 'w': 8, 'd': 1}, {'x': 216, 'z': 112, 'w': 8, 'd': 1},
        {'x': 201, 'z': 92, 'w': 1, 'd': 7}, {'x': 201, 'z': 104, 'w': 1, 'd': 7},
        {'x': 224, 'z': 92, 'w': 1, 'd': 7}, {'x': 224, 'z': 104, 'w': 1, 'd': 7}]}
prop(R, type='crate', x=204, z=106, w=1, d=2)
prop(R, type='lowwall', x=219, z=93, w=3, d=1)

groups += [
    TAG(R, {'id': 'security', 'type': 'heavy_insurgent', 'behaviour': 'guard', 'respawn': 60,
            'spawns': [{'x': 229, 'z': 8, 'y': 0}, {'x': 245, 'z': 8, 'y': 0}, {'x': 232, 'z': 14, 'y': 0}, {'x': 238, 'z': 19, 'y': 0}],
            'weapons': {'ak47': 2, 'rpk': 2}, 'armour_chance': 0.4, 'armour': 50}),
    TAG(R, {'id': 'control', 'behaviour': 'guard', 'respawn': 45, 'holds_base': 'control_building',
            'spawns': [{'x': 204, 'z': 92, 'y': 0}, {'x': 222, 'z': 92, 'y': 0}, {'x': 212, 'z': 110, 'y': 0}, {'x': 210, 'z': 97, 'y': 3}],
            'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.25, 'armour': 50}),
    TAG(R, {'id': 'towers', 'behaviour': 'roam', 'respawn': 55, 'radius': 14,
            'spawns': [{'x': 184, 'z': 26}, {'x': 204, 'z': 55}, {'x': 214, 'z': 40}],
            'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.2, 'armour': 50}),
    TAG(R, {'id': 'tankfarm', 'behaviour': 'roam', 'respawn': 55, 'radius': 14,
            'spawns': [{'x': 200, 'z': 66}, {'x': 228, 'z': 90}, {'x': 178, 'z': 112}],
            'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.2, 'armour': 50}),
    TAG(R, {'id': 'loading', 'type': 'heavy_insurgent', 'behaviour': 'guard', 'respawn': 60,
            'spawns': [{'x': 246, 'z': 133, 'y': 0}, {'x': 252, 'z': 141, 'y': 0}, {'x': 245, 'z': 160, 'y': 0}],
            'weapons': {'ak47': 2, 'rpk': 1}, 'armour_chance': 0.3, 'armour': 50}),
    TAG(R, {'id': 'pipes', 'type': 'heavy_insurgent', 'behaviour': 'roam', 'respawn': 60, 'radius': 12,
            'spawns': [{'x': 176, 'z': 136}, {'x': 214, 'z': 138}],
            'weapons': {'ak47': 2, 'rpk': 1}, 'armour_chance': 0.3, 'armour': 50}),
]
items.append(TAG(R, {'item': 'armour_crate', 'x': 236.5, 'z': 10.5, 'y': 0}))
pickups += [
    TAG(R, {'type': 'weapon', 'weapon': 'rpg7', 'x': 246.5, 'z': 146.5}),
    TAG(R, {'type': 'ammo', 'calibre': '40mm', 'amount': 3, 'x': 247.5, 'z': 146.5}),
    TAG(R, {'type': 'weapon', 'weapon': 'rpk', 'x': 242.5, 'z': 12.5, 'y': 0}),
    TAG(R, {'type': 'ammo', 'calibre': '7.62x39mm', 'amount': 75, 'x': 243.5, 'z': 12.5, 'y': 0}),
    TAG(R, {'type': 'armour', 'amount': 50, 'x': 160, 'z': 24, 'y': 0}),
]

# ================================================================ OUTSKIRTS (south and west)
O = 'outskirts'
# base B: truck stop
building(O, 'outskirts_diner.txt', 56, 190)
building(O, 'outskirts_garage.txt', 56, 202)
for x in (66, 70, 74):
    prop(O, type='metal', x=x, z=203, w=2, d=6, h=3)          # trailer
    prop(O, type='metal', x=x, z=209, w=2, d=2, h=2)          # cab
BASE_B = {
    'id': 'truck_stop', 'name': 'Truck stop', 'district': O,
    'area': {'x0': 52, 'z0': 186, 'x1': 78, 'z1': 212},
    'build_spots': [
        {'x': 65, 'z': 200, 'upgrade': 'walls', 'needs': 'construction_crate'},
        {'x': 54, 'z': 199, 'upgrade': 'ammo', 'needs': 'ammo_crate'},
        {'x': 75, 'z': 194, 'upgrade': 'medical', 'needs': 'medical_crate'},
        {'x': 72, 'z': 189, 'upgrade': 'armour', 'needs': 'armour_crate'}],
    'wall_plan': [
        {'x': 54, 'z': 187, 'w': 9, 'd': 1}, {'x': 67, 'z': 187, 'w': 10, 'd': 1},
        {'x': 54, 'z': 211, 'w': 9, 'd': 1}, {'x': 67, 'z': 211, 'w': 10, 'd': 1},
        {'x': 53, 'z': 188, 'w': 1, 'd': 9}, {'x': 53, 'z': 202, 'w': 1, 'd': 9},
        {'x': 77, 'z': 188, 'w': 1, 'd': 9}, {'x': 77, 'z': 202, 'w': 1, 'd': 9}]}
prop(O, type='crate', x=62, z=199, w=1, d=1)
prop(O, type='lowwall', x=71, z=198, w=3, d=1)

# houses
HOUSES = [('outskirts_house.txt', 20, 182, 0), ('outskirts_house_damaged.txt', 32, 196, 90), ('outskirts_house.txt', 100, 215, 0),
          ('outskirts_house_ruined.txt', 112, 236, 0), ('outskirts_house.txt', 196, 238, 180), ('outskirts_house_damaged.txt', 230, 220, 0),
          ('outskirts_house_ruined.txt', 24, 218, 0), ('outskirts_house.txt', 88, 240, 90), ('outskirts_house_ruined.txt', 236, 176, 0)]
for f, x, z, t in HOUSES:
    building(O, f, x, z, t)

# gas station
building(O, 'outskirts_gas_canopy.txt', 141, 177)
building(O, 'outskirts_gas_kiosk.txt', 145, 168)
for x in (144, 148, 152):
    prop(O, type='metal', x=x, z=180, w=1, d=1, h=2)          # pumps
prop(O, type='metal', x=157, z=184, w=2, d=5, h=2)            # abandoned car

# army checkpoint: a ring of sandbags with a gap facing the road, and a guard post
CP = (172, 218, 190, 232)
for x0, z0, w, d in [(172, 218, 19, 1), (172, 232, 19, 1), (190, 219, 1, 13), (172, 219, 1, 5), (172, 228, 1, 4)]:
    prop(O, type='sandbag', x=x0, z=z0, w=w, d=d, h=1)
building(O, 'outskirts_checkpoint.txt', 178, 222)
prop(O, type='sandbag', x=183, z=229, w=3, d=1, h=1)
prop(O, type='metal', x=164, z=222, w=3, d=6, h=2)            # army truck by the gap

# quarry: a pit with rocks around the rim
QUARRY = (29, 240, 15, 12)
for x, z, w, d, h in [(12, 232, 3, 2, 2), (16, 247, 2, 3, 3), (40, 230, 3, 2, 2), (44, 246, 2, 2, 2), (26, 228, 4, 1, 1), (33, 252, 3, 1, 1)]:
    prop(O, type='rock', x=x, z=z, w=w, d=d, h=h)
prop(O, type='crate', x=30, z=238, w=2, d=1)
prop(O, type='metal', x=21, z=242, w=2, d=4, h=2)             # broken excavator

# wrecked convoy
for x, z in [(124, 228), (131, 236), (126, 244)]:
    prop(O, type='metal', x=x, z=z, w=3, d=6, h=2)
prop(O, type='metal', x=134, z=226, w=2, d=2, h=1)

# rock outcrops: boulders on top of the rocky mounds
for cx, cz, r in [(20, 140, 7), (95, 155, 6), (150, 238, 8), (205, 180, 6), (60, 238, 6), (245, 190, 5), (8, 222, 6), (178, 200, 5)]:
    for k in range(3):
        a = rnd.random() * math.pi * 2
        x, z = int(cx + math.cos(a) * r * 0.4), int(cz + math.sin(a) * r * 0.4)
        prop(O, type='rock', x=x, z=z, w=rnd.randint(1, 3), d=rnd.randint(1, 3), h=rnd.randint(1, 3))

groups += [
    TAG(O, {'id': 'truckstop', 'behaviour': 'guard', 'respawn': 45, 'holds_base': 'truck_stop',
            'spawns': [{'x': 60, 'z': 200, 'y': 1.5}, {'x': 70, 'z': 199, 'y': 1.5}, {'x': 64, 'z': 193, 'y': 1.5}, {'x': 76, 'z': 206, 'y': 1.5}],
            'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.2, 'armour': 50}),
    TAG(O, {'id': 'checkpoint', 'behaviour': 'guard', 'respawn': 55,
            'spawns': [{'x': 175, 'z': 221, 'y': 2}, {'x': 187, 'z': 221, 'y': 2}, {'x': 175, 'z': 230, 'y': 2}, {'x': 187, 'z': 230, 'y': 2}],
            'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.35, 'armour': 50}),
    TAG(O, {'id': 'quarry', 'type': 'militia', 'behaviour': 'guard', 'respawn': 55,
            'spawns': [{'x': 24, 'z': 236, 'y': 0}, {'x': 34, 'z': 244, 'y': 0}, {'x': 30, 'z': 234, 'y': 0}],
            'weapons': {'ak47': 1}, 'armour_chance': 0, 'armour': 0}),
    TAG(O, {'id': 'convoy', 'type': 'militia', 'behaviour': 'roam', 'respawn': 55, 'radius': 12,
            'spawns': [{'x': 120, 'z': 233}, {'x': 137, 'z': 242}],
            'weapons': {'ak47': 1}, 'armour_chance': 0, 'armour': 0}),
    TAG(O, {'id': 'gas', 'type': 'militia', 'behaviour': 'guard', 'respawn': 55,
            'spawns': [{'x': 143, 'z': 182, 'y': 1.5}, {'x': 155, 'z': 179, 'y': 1.5}],
            'weapons': {'ak47': 1}, 'armour_chance': 0, 'armour': 0}),
    TAG(O, {'id': 'dunes', 'behaviour': 'roam', 'respawn': 60, 'radius': 18,
            'spawns': [{'x': 226, 'z': 198}, {'x': 214, 'z': 236}],
            'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.15, 'armour': 50}),
    TAG(O, {'id': 'wadi', 'type': 'militia', 'behaviour': 'roam', 'respawn': 60, 'radius': 18,
            'spawns': [{'x': 36, 'z': 160}, {'x': 90, 'z': 168}],
            'weapons': {'ak47': 1}, 'armour_chance': 0, 'armour': 0}),
]
items += [TAG(O, {'item': 'ammo_crate', 'x': 175.5, 'z': 225.5, 'y': 0}),
          TAG(O, {'item': 'construction_crate', 'x': 30.5, 'z': 241.5, 'y': 0})]
pickups += [
    TAG(O, {'type': 'armour', 'amount': 50, 'x': 148.5, 'z': 171.5, 'y': 0}),
    TAG(O, {'type': 'ammo', 'calibre': '7.62x39mm', 'amount': 60, 'x': 122, 'z': 238}),
    TAG(O, {'type': 'ammo', 'calibre': '7.62x51mm', 'amount': 20, 'x': 181.5, 'z': 230.5, 'y': 0}),
    TAG(O, {'type': 'ammo', 'calibre': '9mm', 'amount': 60, 'x': 58.5, 'z': 205.5, 'y': 0}),
    TAG(O, {'type': 'weapon', 'weapon': 'm4a1', 'x': 99.5, 'z': 218.5, 'y': 0}),
    TAG(O, {'type': 'ammo', 'calibre': '5.56mm', 'amount': 60, 'x': 100.5, 'z': 218.5, 'y': 0}),
]
# the city's medical crate, on the clinic roof (city entries are otherwise left alone)
items.append(TAG('city-crates', {'item': 'medical_crate', 'x': 18.5, 'z': 15.5, 'y': 9}))

# city edge: collapsed concrete along the map edge north and west of the city
WAVE_IN = [(98, 3), (3, 108)]       # wave entry points on the city's edges: leave those open
def clear_of_entries(x, z):
    return all(math.hypot(x - wx, z - wz) > 9 for wx, wz in WAVE_IN)
for x in range(0, CITY, 3):
    if clear_of_entries(x + 1, 0):
        prop('city-edge', type='slab', x=x, z=0, w=3, d=1, h=rnd.randint(1, 3))
for z in range(1, CITY, 3):
    if clear_of_entries(0, z + 1):
        prop('city-edge', type='slab', x=0, z=z, w=1, d=3, h=rnd.randint(1, 3))


# ================================================================ terrain and ground
def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b
    t = max(0, min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)))
    return math.hypot(px - ax - t * (bx - ax), pz - az - t * (bz - az))

def near_line(x, z, lines, r):
    return any(seg_dist(x, z, a, b) < r for line in lines for a, b in zip(line, line[1:]))

ROADS = [[(128, 256), (128, 150)], [(128, 150), (110, 122), (100, 110)], [(128, 150), (150, 140), (172, 132), (190, 132), (212, 132), (212, 116)],
         [(128, 150), (90, 152), (40, 150), (0, 148)]]
TRACKS = [[(64, 198), (90, 178), (110, 160), (128, 150)], [(181, 225), (150, 205), (128, 195)], [(200, 166), (200, 190), (181, 218)]]
DUNES = [(30, 170, 26, 12), (40, 250, 30, 9), (120, 232, 22, 10), (225, 205, 24, 11),
         (165, 248, 26, 8), (15, 205, 12, 20), (240, 240, 16, 12), (100, 175, 14, 8)]
WADI = [(0, 150), (30, 158), (60, 168), (85, 165), (108, 178), (135, 200), (150, 214), (190, 218), (220, 232), (256, 236)]
ROCKS = [(20, 140, 7), (95, 155, 6), (150, 238, 8), (205, 180, 6), (60, 238, 6), (245, 190, 5), (8, 222, 6), (178, 200, 5)]
REFINERY = lambda x, z: x >= 146 and z <= 168
FLAT = [((48, 182, 82, 216), 1.5), ((166, 212, 196, 238), 2.0), ((136, 162, 162, 192), 1.5)]   # truck stop, checkpoint, gas station

def rect_dist(x, z, x0, z0, x1, z1):
    return math.hypot(max(x0 - x, 0, x - x1), max(z0 - z, 0, z - z1))

def height(x, z):
    if x < CITY and z < CITY:
        return 0
    if REFINERY(x, z):
        return 0
    for (x0, z0, x1, z1), h in FLAT:
        if x0 <= x <= x1 and z0 <= z <= z1:
            return h
    h = 2.0
    for cx, cz, rx, rz in DUNES:
        q = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2
        h += 6.5 * max(0, 1 - q)
    if min(seg_dist(x, z, a, b) for a, b in zip(WADI, WADI[1:])) < 10:
        h = min(h, 0.5)
    if near_line(x, z, ROADS + TRACKS, 8):
        h = min(h, 1.5)
    for cx, cz, r in ROCKS:
        if math.hypot(x - cx, z - cz) < r:
            h = max(h, 3)
    qx, qz, qrx, qrz = QUARRY
    q = ((x - qx) / qrx) ** 2 + ((z - qz) / qrz) ** 2
    if q < 1:
        h = min(h, 4.5 * max(0, q - 0.35) / 0.65)
    # slope down to the city and to the refinery pad
    d = min(rect_dist(x, z, 0, 0, CITY, CITY), rect_dist(x, z, 146, 0, SIZE, 168))
    h = min(h, d / 6)
    # high dunes and cliffs along the map edge (outside the city and the refinery)
    rim = min(x if z > CITY else 99, SIZE - z, SIZE - x if z > 168 else 99, z if CITY <= x < 146 else 99)
    if rim < 8:
        h = max(h, 4.5 - rim * 0.3)
    return h

N = SIZE // SPACING + 1
old_t = [r.rstrip('\n') for r in open(os.path.join(OUT, 'terrain.txt'))]
terrain = []
for j in range(N):
    row = ''
    for i in range(N):
        x, z = i * SPACING, j * SPACING
        if x < CITY - 4 and z < CITY - 4:
            row += old_t[j][i]               # the city as it is
        else:
            row += str(max(0, min(9, round(height(x, z) * 2))))
    terrain.append(row)

old_g = [r.rstrip('\n') for r in open(os.path.join(OUT, 'ground.txt'))]
ground = []
for j in range(SIZE // 4):
    row = ''
    for i in range(SIZE // 4):
        x, z = i * 4 + 2, j * 4 + 2
        if x < CITY - 4 and z < CITY - 4:
            row += old_g[j][i]
            continue
        c = 's'
        if REFINERY(x, z):
            c = 'c'
            if 238 <= x <= 256 and 124 <= z <= 164:
                c = 'p'                         # loading bay apron
        if near_line(x, z, TRACKS, 3.5):
            c = 'd'
        if near_line(x, z, ROADS, 4.5):
            c = 'r'
        for (x0, z0, x1, z1), _ in FLAT:
            if x0 + 2 <= x <= x1 - 2 and z0 + 2 <= z <= z1 - 2 and c == 's':
                c = 'g'
        qx, qz, qrx, qrz = QUARRY
        if ((x - qx) / qrx) ** 2 + ((z - qz) / qrz) ** 2 < 1:
            c = 'g'
        row += c
    ground.append(row)


# ================================================================ write
level = json.load(open(os.path.join(OUT, 'level.json')))
ours = lambda e: isinstance(e, dict) and e.get('district') in ('refinery', 'outskirts', 'city-crates', 'city-edge')
for key in ('buildings', 'props', 'enemy_groups', 'pickups', 'base_items', 'bases', 'weather_zones'):
    level[key] = [e for e in level.get(key, []) if not ours(e)]
level['buildings'] += buildings
level['props'] += props
level['enemy_groups'] += groups
level['pickups'] += pickups
level['base_items'] += items
level['bases'] += [BASE_B, BASE_C]
level['weather_zones'] += [{'type': 'smoke', 'district': R, 'x': 228, 'z': 42, 'radius': 16, 'source': FLARE}]
# wave entry points: city north and west edges (in streets), refinery east edge (inside the
# fence, clear of the security post), outskirts east, south and south-west
level['wave_spawns'] = [{'x': 98, 'z': 3}, {'x': 3, 'z': 108}, {'x': 250, 'z': 45}, {'x': 252, 'z': 176}, {'x': 200, 'z': 252}, {'x': 8, 'z': 250}]
level['subtitle'] = 'Level 1'
level['summary'] = 'Three districts around a crossroads: a ruined city, an oil refinery and the desert outskirts. Each has a place you can take as your base.'
level['briefing'] = [
    'You start at the crossroads. Pick a base: the police station (city, north-west), the truck stop (outskirts, south-west) or the control building (refinery, east).',
    'Clear its defenders and step inside. It becomes your base and the clock starts.',
    'Fetch crates and build upgrades at the marked spots: construction crates (walls) at the building site and the quarry, medical on the clinic roof, ammunition at the army checkpoint, armour at the refinery security post.',
    'Fuel tanks explode when a rocket hits them. Keep your distance.'
]
level['goals'] = {
    'claim': 'Clear a base: police station (city), truck stop (outskirts) or control building (refinery)',
    'fetch': 'Fetch a crate and build an upgrade at a marked spot in your base'
}
json.dump(level, open(os.path.join(OUT, 'level.json'), 'w'), indent=1)
open(os.path.join(OUT, 'terrain.txt'), 'w').write('\n'.join(terrain) + '\n')
open(os.path.join(OUT, 'ground.txt'), 'w').write('\n'.join(ground) + '\n')
for name, text in FILES.items():
    open(os.path.join(OUT, 'buildings', name), 'w').write(text)
print(f'{len(buildings)} buildings, {len(props)} props, {len(groups)} enemy groups '
      f'({sum(len(g["spawns"]) for g in groups)} enemies), {len(pickups)} pickups, {len(items)} crates')
