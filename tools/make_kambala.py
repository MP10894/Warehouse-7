"""First draft of Level 2, Kambala mine (docs/KAMBALA_PLAN.md): writes data/levels/kambala/.

The map stands on a plateau 13 m up, so the open pit can go 12 m down: four benches of 3 m
(13 → 10 → 7 → 4 → floor at 1 m). Bench faces are walls of rock blocks you can't walk up;
the haul road spirals down from the south-west rim to the floor. Buildings, bases, crates,
enemies and pickups as on the plan. Trees, shrubs, blasting and the mining vehicles' models
come in later stages; until then the forest is open red earth and vehicles are stand-ins.

Like Najaf, this writes the first version; after that the files in data/levels/kambala are
the source (edit them directly). Re-running this script overwrites them.

    python3 tools/make_kambala.py
    node tools/settle_spawns.mjs kambala      (then: moves enemies that landed in a wall)
"""
import json, math, os, random

OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'levels', 'kambala')
SIZE = 256
SP = 2                      # terrain point spacing (m): finer than Najaf's 4 for the benches
N = SIZE // SP + 1
PLATEAU = 13
rnd = random.Random(2026)

# ---------------------------------------------------------------- the pit
CX, CZ = 196, 60
RINGS = [(56, 46), (46, 37), (36, 28), (26, 20)]          # rim, then each bench edge
LEVELS = [PLATEAU, 10, 7, 4, 1]                           # outside the rim … floor


def ring(x, z):
    """How many pit edges (x, z) is inside: 0 = outside the pit … 4 = on the floor."""
    k = 0
    for rx, rz in RINGS:
        if ((x - CX) / rx) ** 2 + ((z - CZ) / rz) ** 2 <= 1: k += 1
        else: break
    return k


# haul road: from the south-west rim, clockwise and down to the floor
ROAD_W = 3.4                  # half width (m)
spiral = []
for i in range(241):
    t = i / 240
    a = math.radians(215 - t * 370)
    s = 0.97 - t * 0.55
    spiral.append((CX + math.cos(a) * RINGS[0][0] * s, CZ - math.sin(a) * RINGS[0][1] * s, PLATEAU - (PLATEAU - LEVELS[-1]) * t))


def road_at(x, z):
    """Nearest point of the haul road: (distance, height there)."""
    best, h = 1e9, None
    for (x1, z1, h1), (x2, z2, h2) in zip(spiral, spiral[1:]):
        dx, dz = x2 - x1, z2 - z1
        tt = max(0, min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)))
        d = math.hypot(x - x1 - tt * dx, z - z1 - tt * dz)
        if d < best: best, h = d, h1 + (h2 - h1) * tt
    return best, h


def seg_dist(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)))
    return math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz)


def near_path(x, z, pts, w):
    return any(seg_dist(x, z, a, b) < w for a, b in zip(pts, pts[1:]))


# roads on the plateau
MAIN = [(128, 256), (128, 180), (128, 132)]
TO_MINE = [(128, 132), (146, 104), (spiral[0][0], spiral[0][1])]
LOGGING = [(128, 132), (100, 118), (74, 96), (54, 78)]
VILLAGE = [(128, 150), (160, 170), (196, 186), (240, 196)]
LANES = [[(160, 170), (166, 222), (150, 246)], [(196, 186), (206, 230)]]

FOREST = [(0, 0), (122, 0), (120, 40), (110, 96), (112, 128), (96, 166), (70, 200), (36, 226), (0, 236)]
VILLAGE_AREA = [(118, 150), (256, 140), (256, 256), (96, 256), (92, 200)]


def inside(pts, x, z):
    c = False
    for (x1, z1), (x2, z2) in zip(pts, pts[1:] + pts[:1]):
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: c = not c
    return c


def bench_height(x, z):
    return LEVELS[ring(x, z)]


def gentle(x, z):
    """Small rolls in the plateau (forest and village), none near the pit."""
    if ring(x, z) or ((x - CX) / 66) ** 2 + ((z - CZ) / 56) ** 2 <= 1: return 0
    v = 0.5 * math.sin(x * 0.07 + 1.3) * math.cos(z * 0.06 - 0.4) + 0.3 * math.sin(x * 0.15 + z * 0.11)
    # the edges rise a little: hills and spoil heaps round the map
    edge = min(x, z, SIZE - x, SIZE - z)
    return v + (max(0, 10 - edge) / 10) * 3


# ---------------------------------------------------------------- terrain points
heights = [[0.0] * N for _ in range(N)]
for j in range(N):
    for i in range(N):
        x, z = i * SP, j * SP
        dr, hr = road_at(x, z) if ring(x, z) or ((x - CX) / 60) ** 2 + ((z - CZ) / 50) ** 2 <= 1 else (1e9, None)
        if dr < ROAD_W + 0.5:
            h = hr
        elif ring(x, z) or ((x - CX) / 60) ** 2 + ((z - CZ) / 50) ** 2 <= 1:
            # the lower edge of the benches around this point, so each bench stays flat
            h = min(bench_height(x + dx, z + dz) for dx in (-1.5, 0, 1.5) for dz in (-1.5, 0, 1.5))
        else:
            h = PLATEAU + gentle(x, z)
        heights[j][i] = max(0, min(17.5, round(h * 2) / 2))


def hchar(h):
    h2 = int(round(h * 2))
    return str(h2) if h2 <= 9 else chr(ord('a') + h2 - 10)


def terrain_h(x, z):
    """Height the game will see at (x, z): bilinear, like src/sim/terrain.js."""
    gx, gz = x / SP, z / SP
    i, j = int(gx), int(gz)
    fx, fz = gx - i, gz - j
    p = lambda a, b: heights[max(0, min(N - 1, b))][max(0, min(N - 1, a))]
    return (p(i, j) * (1 - fx) + p(i + 1, j) * fx) * (1 - fz) + (p(i, j + 1) * (1 - fx) + p(i + 1, j + 1) * fx) * fz


# ---------------------------------------------------------------- bench faces: rock walls
props = []
for z in range(CZ - 48, CZ + 48):
    run = None
    for x in range(CX - 58, CX + 59):
        col = None
        if 0 <= x < SIZE and 0 <= z < SIZE:
            H = bench_height(x + 0.5, z + 0.5)
            dr, _ = road_at(x + 0.5, z + 0.5)
            T = terrain_h(x + 0.5, z + 0.5)
            if dr > ROAD_W and H - T > 0.6:
                y0 = round(T)
                col = (y0, H - y0)
        if col and run and run['y0'] == col[0] and run['h'] == col[1] and run['x'] + run['w'] == x:
            run['w'] += 1
        else:
            if run: props.append({'type': 'rock', 'x': run['x'], 'z': z, 'w': run['w'], 'd': 1, 'h': run['h'], 'district': 'mine'})
            run = {'x': x, 'y0': col[0], 'h': col[1], 'w': 1} if col else None
    if run: props.append({'type': 'rock', 'x': run['x'], 'z': z, 'w': run['w'], 'd': 1, 'h': run['h'], 'district': 'mine'})

# ---------------------------------------------------------------- ground surface (4 m squares)
ground = []
for gz in range(SIZE // 4):
    row = ''
    for gx in range(SIZE // 4):
        x, z = gx * 4 + 2, gz * 4 + 2
        if ring(x, z) and road_at(x, z)[0] < ROAD_W: c = 't'
        elif ring(x, z): c = 'k'
        elif any(near_path(x, z, p, w) for p, w in [(MAIN, 4.5), (TO_MINE, 4.5), (LOGGING, 3), (VILLAGE, 3.5)] + [(l, 2.5) for l in LANES]): c = 't'
        elif inside(FOREST, x, z): c = 'j'
        else: c = 'l'
        row += c
    ground.append(row)


# ---------------------------------------------------------------- buildings
def grid(w, d, fill=' '):
    return [[fill] * w for _ in range(d)]


def walls(g, w, d, door_sides='s', windows=True):
    for z in range(d):
        for x in range(w):
            edge = x in (0, w - 1) or z in (0, d - 1)
            if not edge: g[z][x] = '.'
            elif x in (0, w - 1) and z in (0, d - 1): g[z][x] = 'X'
            else:
                along = x if z in (0, d - 1) else z
                g[z][x] = 'w' if windows and along % 3 == 1 else '#'
    for s in door_sides:
        if s == 's': g[d - 1][w // 2] = 'd'
        if s == 'n': g[0][w // 2] = 'd'
        if s == 'e': g[d // 2][w - 1] = 'd'
        if s == 'w': g[d // 2][0] = 'd'


def roof(w, d, parapet=False):
    g = grid(w, d, '.')
    if parapet:
        for z in range(d):
            for x in range(w):
                if x in (0, w - 1) or z in (0, d - 1): g[z][x] = 'l'
    return g


def text(title, floors):
    out = [f'# {title}', '# Symbol guide: data/levels/README.md', '']
    for k, g in enumerate(floors):
        out.append(f'floor {k}')
        out += [''.join(r).rstrip() or ' ' for r in g]
        out.append('')
    return '\n'.join(out)


files = {}


def company(name, w, d, floors, doors='s'):
    """Mining-company building: up to two floors, stairs to the upper floor and the roof."""
    fl = []
    for k in range(floors):
        g = grid(w, d); walls(g, w, d, doors if k == 0 else '')
        fl.append(g)
    fl.append(roof(w, d, parapet=True))
    for k in range(floors):
        z = 1 if k % 2 == 0 else d - 2
        cells = [2, 3, 4] if k % 2 == 0 else [w - 3, w - 4, w - 5]
        sym = '>' if k % 2 == 0 else '<'
        for x in cells: fl[k][z][x] = sym
    files[name] = text(f'Kambala: company building, {w} x {d} m, {floors} floor(s) + roof', fl)


company('hq.txt', 22, 16, 2, 'sw')
company('clinic.txt', 16, 12, 2, 'sw')
company('dorm.txt', 18, 10, 2, 'se')
company('store.txt', 14, 10, 1, 'n')
company('office.txt', 10, 7, 1, 'w')
company('company_small.txt', 10, 8, 1, 's')


def plain(name, w, d, title, doors='s', windows=True, flat_roof=True):
    g = grid(w, d); walls(g, w, d, doors, windows)
    fl = [g, roof(w, d)] if flat_roof else [g]
    files[name] = text(title, fl)


plain('mud_house.txt', 7, 5, 'Kambala: mud house, ground floor only')
plain('hut.txt', 5, 5, 'Kambala: thatched hut, ground floor only', windows=False)
plain('camp_hut.txt', 12, 8, 'Kambala: logging camp bunkhouse', 'se')
plain('hunters.txt', 8, 8, 'Kambala: hunters\' camp', 'e')
plain('magazine.txt', 10, 8, 'Kambala: explosives magazine (thick walls)', 's', windows=False)

# the pit-floor workshop: big doors at both ends, a raised office corner
g = grid(16, 10); walls(g, 16, 10, 'n', True)
for z in range(3, 7): g[z][0] = '.'; g[z][15] = '.'          # big vehicle doors, west and east
g[3][0] = g[6][0] = g[3][15] = g[6][15] = 'X'
for x in range(2, 5): g[1][x] = '>'
files['workshop.txt'] = text('Kambala: pit-floor workshop (base A)', [g, roof(16, 10, parapet=True)])

# open shed (sawmill): columns and a roof
g = grid(14, 10, '.')
for z in (0, 9):
    for x in (0, 4, 9, 13): g[z][x] = 'X'
for x in range(3, 11): g[5][x] = 'c' if x % 2 else '.'
files['sawmill.txt'] = text('Kambala: sawmill shed (open sides)', [g, roof(14, 10)])

# watch tower: 6 x 6, two flights of stairs inside, a lookout with low walls on top (6 m up)
t0 = [list(r) for r in ['X....X', '.>>>..', '......', '......', '......', 'X....X']]
t1 = [list(r) for r in ['X....X', '......', '......', '......', '..<<<.', 'X....X']]
t2 = [list(r) for r in ['llllll', 'l....l', 'l....l', 'l....l', 'l....l', 'llllll']]
files['tower.txt'] = text('Kambala: watch tower, stairs inside, lookout on top', [t0, t1, t2])

buildings = []


def place(file, x, z, turn=0):
    buildings.append({'file': file, 'x': x, 'z': z, **({'turn': turn} if turn else {})})


# mine
place('workshop.txt', 188, 54)
place('office.txt', 150, 110)
place('magazine.txt', 234, 114)
# forest
place('camp_hut.txt', 40, 64)
place('hut.txt', 30, 80)
place('sawmill.txt', 84, 24)
place('hunters.txt', 12, 148)
# village (company buildings and the tower)
place('hq.txt', 176, 190)
place('tower.txt', 202, 196)
place('clinic.txt', 204, 162)
place('dorm.txt', 148, 174)
place('store.txt', 222, 206)
place('company_small.txt', 138, 156)
taken = [(b['x'] - 3, b['z'] - 3, b['x'] + 30, b['z'] + 22) for b in buildings]
SIZES = {'hq.txt': (22, 16), 'tower.txt': (6, 6), 'clinic.txt': (16, 12), 'dorm.txt': (18, 10), 'store.txt': (14, 10),
         'company_small.txt': (10, 8), 'workshop.txt': (16, 10), 'office.txt': (10, 7), 'magazine.txt': (10, 8),
         'camp_hut.txt': (12, 8), 'hut.txt': (5, 5), 'sawmill.txt': (14, 10), 'hunters.txt': (8, 8), 'mud_house.txt': (7, 5)}
taken = [(b['x'] - 3, b['z'] - 3, b['x'] + SIZES[b['file']][0] + 3, b['z'] + SIZES[b['file']][1] + 3) for b in buildings]
taken += [(170, 220, 196, 240)]   # football pitch
houses = 0
for _ in range(4000):
    if houses >= 26: break
    f = 'mud_house.txt' if rnd.random() < 0.55 else 'hut.txt'
    w, d = SIZES[f]
    x, z = rnd.randint(100, 248 - w), rnd.randint(144, 250 - d)
    if not inside(VILLAGE_AREA, x, z) or (x < 120 and z < 190): continue
    if any(x - 2 < b and x + w + 2 > a and z - 2 < e and z + d + 2 > c for a, c, b, e in taken): continue
    if any(near_path(x + w / 2, z + d / 2, p, ww + 6) for p, ww in [(MAIN, 4.5), (VILLAGE, 3.5)] + [(l, 2.5) for l in LANES]): continue
    place(f, x, z, rnd.choice([0, 90, 180, 270]) if f == 'hut.txt' else rnd.choice([0, 180]))
    taken.append((x - 2, z - 2, x + w + 2, z + d + 2))
    houses += 1

# ---------------------------------------------------------------- props: cover, vehicles, stand-ins
# cut rock slabs (breakable) on the floor and benches
for x, z, w, d, h in [(182, 74, 3, 2, 2), (210, 50, 2, 3, 2), (176, 58, 3, 2, 1), (214, 66, 3, 2, 2), (198, 76, 2, 2, 1),
                      (168, 64, 2, 3, 2), (224, 44, 3, 2, 2), (204, 34, 3, 2, 1), (160, 50, 2, 3, 2), (230, 72, 3, 2, 2),
                      (186, 44, 2, 2, 1), (172, 78, 2, 2, 2), (220, 84, 3, 2, 2), (150, 64, 2, 2, 2), (240, 58, 2, 3, 2)]:
    props.append({'type': 'rockslab', 'x': x, 'z': z, 'w': w, 'd': d, 'h': h, 'district': 'mine'})
# mining vehicles (stand-ins until their models arrive): solid, unbreakable
for x, z, w, d, h, what in [(166, 96, 4, 8, 3, 'haul truck'), (206, 68, 3, 5, 2, 'excavator'), (232, 50, 3, 4, 2, 'bulldozer'),
                            (174, 20, 3, 3, 3, 'drill rig'), (146, 88, 3, 6, 2, 'loader')]:
    props.append({'type': 'metal', 'x': x, 'z': z, 'w': w, 'd': d, 'h': h, 'district': 'mine', 'note': what})
# blocked tunnel at the foot of the north wall: timber posts, a steel gate, fallen rock
props += [{'type': 'column', 'x': 190, 'z': 39, 'w': 1, 'd': 1, 'h': 4, 'district': 'mine', 'note': 'tunnel post'},
          {'type': 'column', 'x': 201, 'z': 39, 'w': 1, 'd': 1, 'h': 4, 'district': 'mine', 'note': 'tunnel post'},
          {'type': 'metal', 'x': 191, 'z': 39, 'w': 10, 'd': 1, 'h': 4, 'district': 'mine', 'note': 'tunnel gate'},
          {'type': 'rock', 'x': 189, 'z': 40, 'w': 14, 'd': 1, 'h': 1, 'district': 'mine', 'note': 'cave-in'}]
# equipment yard on the west rim: fence and stacked crates
props += [{'type': 'fence', 'x': 130, 'z': 70, 'w': 16, 'd': 1, 'district': 'mine'}, {'type': 'fence', 'x': 130, 'z': 70, 'w': 1, 'd': 14, 'district': 'mine'},
          {'type': 'fence', 'x': 130, 'z': 84, 'w': 16, 'd': 1, 'district': 'mine'},
          {'type': 'crate', 'x': 134, 'z': 74, 'w': 2, 'd': 1, 'h': 2, 'district': 'mine'}, {'type': 'crate', 'x': 140, 'z': 78, 'w': 1, 'd': 2, 'district': 'mine'}]
# logging camp: log stacks (low cover)
for k in range(4):
    props.append({'type': 'lowwall', 'x': 56 + k * 3, 'z': 66, 'w': 1, 'd': 10, 'district': 'forest', 'note': 'log stack'})
# village: low walls round the HQ yard, a wrecked car at the junction
props += [{'type': 'lowwall', 'x': 174, 'z': 188, 'w': 12, 'd': 1, 'district': 'village'},
          {'type': 'sandbag', 'x': 236, 'z': 230, 'w': 6, 'd': 1, 'district': 'village'},
          {'type': 'sandbag', 'x': 236, 'z': 230, 'w': 1, 'd': 6, 'district': 'village'},
          {'type': 'wreck', 'model': 'car', 'x': 108, 'z': 140, 'w': 2, 'd': 4, 'h': 1, 'burnt': True, 'district': 'village'}]


# ---------------------------------------------------------------- bases
def spots(x, z):
    return [{'x': x, 'z': z, 'upgrade': 'walls', 'needs': 'construction_crate'},
            {'x': x + 4, 'z': z, 'upgrade': 'ammo', 'needs': 'ammo_crate'},
            {'x': x, 'z': z + 4, 'upgrade': 'medical', 'needs': 'medical_crate'},
            {'x': x + 4, 'z': z + 4, 'upgrade': 'armour', 'needs': 'armour_crate'}]


bases = [
    {'id': 'workshop', 'name': 'Pit-floor workshop', 'district': 'mine', 'area': {'x0': 182, 'z0': 48, 'x1': 212, 'z1': 72},
     'build_spots': spots(192, 66), 'wall_plan': [{'x': 183, 'z': 49, 'w': 1, 'd': 22}, {'x': 211, 'z': 49, 'w': 1, 'd': 22}, {'x': 184, 'z': 71, 'w': 26, 'd': 1}]},
    {'id': 'logging_camp', 'name': 'Logging camp', 'district': 'forest', 'area': {'x0': 34, 'z0': 58, 'x1': 64, 'z1': 86},
     'build_spots': spots(44, 74), 'wall_plan': [{'x': 35, 'z': 59, 'w': 28, 'd': 1}, {'x': 35, 'z': 85, 'w': 28, 'd': 1}, {'x': 35, 'z': 60, 'w': 1, 'd': 25}]},
    {'id': 'company_hq', 'name': 'Company HQ', 'district': 'village', 'area': {'x0': 170, 'z0': 186, 'x1': 208, 'z1': 212},
     'build_spots': spots(180, 207), 'wall_plan': [{'x': 171, 'z': 211, 'w': 36, 'd': 1}, {'x': 207, 'z': 187, 'w': 1, 'd': 24}, {'x': 171, 'z': 187, 'w': 1, 'd': 24}]},
]
# keep build spots off the building footprints: the HQ yard is south of the building (z 206–211)


def ground_y(x, z):
    return round(terrain_h(x + 0.5, z + 0.5) * 2) / 2


# ---------------------------------------------------------------- crates
# each base has its own five crates close by (a short walk, not a climb out of the pit); once
# a base is claimed, the other bases' crates are taken away
CRATES = {
    # on the pit floor round the workshop's walls, and on the first bench above it
    'workshop': [('construction_crate', 180, 56), ('ammo_crate', 200, 46), ('medical_crate', 214, 64),
                 ('construction_crate', 203, 83), ('armour_crate', 216, 79)],
    # out in the forest round the camp, about 25 m away
    'logging_camp': [('construction_crate', 71, 67), ('ammo_crate', 62, 96), ('medical_crate', 27, 95),
                     ('construction_crate', 25, 66), ('armour_crate', 44, 51)],
    # inside the buildings round the HQ: the dorm, the huts north and south-west, the mud house, the clinic
    'company_hq': [('construction_crate', 157, 179), ('ammo_crate', 194, 170), ('medical_crate', 210, 168),
                   ('construction_crate', 149, 199), ('armour_crate', 156, 217)],
}
crate_spots = [(item, x, z) for spots_ in CRATES.values() for item, x, z in spots_]
base_items = [{'item': item, 'x': x + 0.5, 'z': z + 0.5, 'y': ground_y(x, z), 'base': b}
              for b, spots_ in CRATES.items() for item, x, z in spots_]


# ---------------------------------------------------------------- enemies
def grp(id, x, z, n, type=None, behaviour='guard', respawn=55, weapons=None, armour_chance=0.2, up=0, holds=None, radius=0):
    pts = []
    for k in range(n):
        a = k * 2 * math.pi / n + 0.3
        px, pz = round(x + math.cos(a) * 2.5), round(z + math.sin(a) * 2.5)
        pts.append({'x': px, 'z': pz, 'y': ground_y(px, pz) + up})
    g = {'id': id, **({'type': type} if type else {}), 'behaviour': behaviour, 'respawn': respawn, 'spawns': pts,
         'weapons': weapons or {'ak47': 3, 'rpg7': 1}, 'armour_chance': armour_chance, 'armour': 50}
    if holds: g['holds_base'] = holds
    if radius: g['radius'] = radius
    return g


# Kambala's own fighters (Enemies tab): militants hold the garrisons, mercenaries guard the
# crates, Khat addicts roam with Uzis, Khat berserkers charge with machetes
MILITANT = {'ak47': 2, 'galil': 1, 'fal': 1}
MERC = {'ak47': 1, 'galil': 1, 'fal': 1, 'rpk': 1}
UZI = {'mini_uzi': 1}
MACHETE = {'machete': 1}
M, MC, KA, KB = 'kambala_militant', 'kambala_mercenary', 'khat_addict', 'khat_berserker'
groups = [
    # mine
    grp('pit_floor', 196, 62, 4, M, respawn=60, weapons=MILITANT, armour_chance=0.2, holds='workshop'),
    grp('haul_road', 186, 86, 3, MC, respawn=55, weapons=MERC, armour_chance=0.2),
    grp('east_bench', 228, 42, 2, M, respawn=55, weapons=MILITANT),
    grp('west_bench', 160, 42, 3, M, respawn=55, weapons=MILITANT),
    grp('magazine', 238, 122, 4, MC, respawn=60, weapons=MERC, armour_chance=0.3),
    grp('site_office', 154, 120, 3, KA, 'roam', 55, UZI, 0, radius=10),
    grp('yard', 138, 78, 3, M, respawn=55, weapons=MILITANT),
    grp('drill_rig', 178, 26, 2, KA, respawn=60, weapons=UZI, armour_chance=0),
    # forest
    grp('logging_camp', 48, 74, 4, M, respawn=45, weapons=MILITANT, holds='logging_camp'),
    grp('sawmill', 90, 30, 4, MC, respawn=60, weapons=MERC, armour_chance=0.3),
    grp('north_trail', 24, 40, 2, KA, 'roam', 55, UZI, 0, radius=14),
    grp('forest_patrol', 60, 128, 3, KB, 'roam', 50, MACHETE, 0, radius=16),
    grp('hunters', 16, 156, 2, KA, respawn=60, weapons=UZI, armour_chance=0),
    grp('creek', 96, 70, 2, KB, 'roam', 55, MACHETE, 0, radius=12),
    grp('south_trail', 40, 196, 2, KA, 'roam', 60, UZI, 0, radius=12),
    # village
    grp('company_hq', 186, 200, 4, M, respawn=45, weapons=MILITANT, holds='company_hq'),
    grp('tower', 204, 198, 1, M, respawn=90, weapons={'fal': 1}, armour_chance=0, up=6),
    grp('clinic', 212, 168, 3, M, respawn=55, weapons=MILITANT),
    grp('security_post', 240, 234, 4, MC, respawn=60, weapons=MERC, armour_chance=0.35),
    grp('dorm', 156, 186, 3, KA, respawn=55, weapons=UZI, armour_chance=0),
    grp('pitch', 150, 236, 2, KA, 'roam', 60, UZI, 0, radius=12),
    grp('market', 228, 192, 2, M, 'roam', 55, MILITANT, 0.1, radius=10),
    grp('fields', 76, 236, 2, KB, 'roam', 60, MACHETE, 0, radius=14),
    # khat berserkers lying in wait in each zone (where Najaf has suicide bombers)
    grp('berserkers_mine', 170, 108, 2, KB, respawn=90, weapons=MACHETE, armour_chance=0),
    grp('berserkers_forest', 70, 150, 2, KB, respawn=90, weapons=MACHETE, armour_chance=0),
    grp('berserkers_village', 140, 214, 1, KB, respawn=90, weapons=MACHETE, armour_chance=0),
]

# ---------------------------------------------------------------- pickups
def pk(type, x, z, **kw):
    return {'type': type, 'x': x + 0.5, 'z': z + 0.5, 'y': ground_y(x, z), **kw}


pickups = [
    pk('weapon', 124, 128, weapon='ak47'), pk('ammo', 125, 129, calibre='7.62x39mm', amount=60),
    pk('armour', 132, 136, amount=50),
    # forest: short range guns
    pk('weapon', 62, 120, weapon='mp5'), pk('ammo', 63, 121, calibre='9mm', amount=60),
    pk('weapon', 20, 150, weapon='mini_uzi'), pk('ammo', 21, 151, calibre='9mm', amount=60),
    pk('grenade', 46, 84, amount=2), pk('armour', 92, 40, amount=50),
    # mine: long sight lines
    pk('weapon', 152, 118, weapon='mk14ebr'), pk('ammo', 153, 119, calibre='7.62x51mm', amount=40),
    pk('weapon', 230, 118, weapon='rpk'), pk('ammo', 231, 119, calibre='7.62x39mm', amount=75),
    pk('weapon', 170, 46, weapon='rpg7'), pk('ammo', 171, 47, calibre='40mm', amount=3),
    pk('grenade', 200, 70, amount=2), pk('grenade', 140, 76, amount=2), pk('armour', 214, 40, amount=50),
    # village
    pk('weapon', 160, 190, weapon='m4a1'), pk('ammo', 161, 191, calibre='5.56mm', amount=60),
    pk('weapon', 230, 200, weapon='rpg7'), pk('ammo', 231, 201, calibre='40mm', amount=3),
    pk('weapon', 214, 176, weapon='galil'), pk('ammo', 215, 177, calibre='5.56mm', amount=60),
    pk('grenade', 190, 214, amount=2), pk('grenade', 120, 214, amount=2), pk('armour', 236, 226, amount=100),
]

# ---------------------------------------------------------------- trees and undergrowth
# cells already used by buildings and props (plus a margin), so plants keep out of them
used = set()
for b in buildings:
    w, d = SIZES[b['file']]
    if b.get('turn') in (90, 270): w, d = d, w
    for z in range(b['z'] - 2, b['z'] + d + 2):
        for x in range(b['x'] - 2, b['x'] + w + 2): used.add((x, z))
for pr in props:
    for z in range(pr['z'] - 1, pr['z'] + pr.get('d', 1) + 1):
        for x in range(pr['x'] - 1, pr['x'] + pr.get('w', 1) + 1): used.add((x, z))
KEEP_CLEAR = [(128, 134, 12), (46, 72, 16), (196, 60, 20)]   # junction, logging camp clearing, pit floor
# and a ring round every pickup, crate, enemy and attack-wave entry, so none is boxed in by trees
KEEP_CLEAR += [(k['x'], k['z'], 3) for k in pickups] + [(x, z, 3) for _, x, z in crate_spots]
KEEP_CLEAR += [(sp['x'], sp['z'], 2.5) for g in groups for sp in g['spawns']] + [(3, z, 6) for z in (16, 56, 100, 140, 180, 220)]
ROADS = [(MAIN, 6), (TO_MINE, 6), (LOGGING, 4.5), (VILLAGE, 5)] + [(l, 3.5) for l in LANES]


def open_ground(x, z, extra=0):
    if (x, z) in used or not (2 <= x < SIZE - 2 and 2 <= z < SIZE - 2): return False
    # nothing inside a base area (its walls and lockers go there)
    if any(b['area']['x0'] - 1 <= x <= b['area']['x1'] + 1 and b['area']['z0'] - 1 <= z <= b['area']['z1'] + 1 for b in bases): return False
    if ring(x + 0.5, z + 0.5) or ((x - CX) / 60) ** 2 + ((z - CZ) / 50) ** 2 <= 1: return False
    if any(math.hypot(x - a, z - b) < r for a, b, r in KEEP_CLEAR): return False
    if any(near_path(x + 0.5, z + 0.5, pts, w + extra) for pts, w in ROADS): return False
    return True


FIELDS = [(18, 232, 34, 18), (58, 214, 26, 30), (60, 246, 30, 9)]   # cassava fields: no trees
for fx, fz, fw, fd in FIELDS:
    for z in range(fz - 1, fz + fd + 1):
        for x in range(fx - 1, fx + fw + 1): used.add((x, z))
flora = []
tree_at = []
# forest: trees on a loose grid about 4 m apart, jittered
for gz in range(4, SIZE - 4, 4):
    for gx in range(4, 128, 4):
        x, z = gx + rnd.randint(-1, 1), gz + rnd.randint(-1, 1)
        if not inside(FOREST, x, z) or not open_ground(x, z, 1) or rnd.random() < 0.18: continue
        flora.append({'type': 'tree', 'x': x, 'z': z, 'h': rnd.randint(5, 7), 'kind': 'broadleaf', 'district': 'forest'})
        tree_at.append((x, z))
        for zz in range(z - 1, z + 2):
            for xx in range(x - 1, x + 2): used.add((xx, zz))
# forest: patches of undergrowth, about a quarter of the open floor
for gz in range(2, SIZE - 2, 3):
    for gx in range(2, 128, 3):
        x, z = gx + rnd.randint(0, 1), gz + rnd.randint(0, 1)
        if not inside(FOREST, x, z) or rnd.random() > 0.42: continue
        w, d = rnd.randint(1, 2), rnd.randint(1, 2)
        if all(open_ground(x + i, z + j) for i in range(w) for j in range(d)):
            flora.append({'type': 'shrub', 'x': x, 'z': z, 'w': w, 'd': d, 'h': 2, 'kind': 'fern', 'district': 'forest'})
            for i in range(w):
                for j in range(d): used.add((x + i, z + j))
# village: palms and banana plants beside the huts and houses
for b in buildings:
    if b['file'] not in ('hut.txt', 'mud_house.txt'): continue
    w, d = SIZES[b['file']]
    for _ in range(3):
        side = rnd.choice(['n', 's', 'e', 'w'])
        x = b['x'] + (rnd.randint(0, w - 1) if side in 'ns' else (-3 if side == 'w' else w + 2))
        z = b['z'] + (rnd.randint(0, d - 1) if side in 'ew' else (-3 if side == 'n' else d + 2))
        if not (2 <= x < SIZE - 2 and 2 <= z < SIZE - 2) or (x, z) in used or not open_ground(x, z, 1) and (x, z) in used: continue
        if any(near_path(x + 0.5, z + 0.5, pts, ww) for pts, ww in ROADS): continue
        if rnd.random() < 0.35:
            flora.append({'type': 'tree', 'x': x, 'z': z, 'h': 6, 'kind': 'palm', 'district': 'village'})
            for zz in range(z - 1, z + 2):
                for xx in range(x - 1, x + 2): used.add((xx, zz))
        else:
            flora.append({'type': 'shrub', 'x': x, 'z': z, 'w': 1, 'd': 1, 'h': 2, 'kind': 'banana', 'district': 'village'})
            used.add((x, z))
# the mine rim: a little scrub on the plateau round the pit
for _ in range(400):
    x, z = rnd.randint(132, 252), rnd.randint(4, 136)
    if ((x - CX) / 62) ** 2 + ((z - CZ) / 52) ** 2 <= 1 or not open_ground(x, z, 1): continue
    flora.append({'type': 'shrub', 'x': x, 'z': z, 'w': 1, 'd': 1, 'h': 1, 'kind': 'fern', 'district': 'mine'})
    used.add((x, z))
    if sum(1 for f in flora if f['district'] == 'mine') >= 45: break
props += flora

# ---------------------------------------------------------------- dressing: clutter, washing, fires, crops
decor = [{'type': 'crops', 'x': fx, 'z': fz, 'w': fw, 'd': fd} for fx, fz, fw, fd in FIELDS]
clutter = []


def free_rect(x, z, w, d, extra=1):
    return all(open_ground(x + i, z + j, extra) and (x + i, z + j) not in used for i in range(w) for j in range(d))


def take(x, z, w, d):
    for j in range(z - 1, z + d + 1):
        for i in range(x - 1, x + w + 1): used.add((i, j))


def solid(model, x, z, w, d, h, where):
    clutter.append({'type': 'wreck', 'model': model, 'x': x, 'z': z, 'w': w, 'd': d, 'h': h, 'district': where})
    take(x, z, w, d)


# village: by the huts and houses, a washing line or a cooking fire; drums by the company buildings
for b in buildings:
    w, d = SIZES[b['file']]
    if b.get('turn') in (90, 270): w, d = d, w
    if b['file'] in ('hut.txt', 'mud_house.txt'):
        for _ in range(6):
            side = rnd.choice('nsew')
            if side in 'ns':
                x, z = b['x'] + rnd.randint(-1, 1), (b['z'] - 3 if side == 'n' else b['z'] + d + 2)
                x2, z2 = x + 4, z
            else:
                x, z = (b['x'] - 3 if side == 'w' else b['x'] + w + 2), b['z'] + rnd.randint(-1, 1)
                x2, z2 = x, z + 4
            if rnd.random() < 0.45:
                if all(open_ground(xx, zz) and (xx, zz) not in used for xx, zz in [(x, z), (x2, z2), ((x + x2) // 2, (z + z2) // 2)]):
                    decor.append({'type': 'washline', 'x': x + 0.5, 'z': z + 0.5, 'x2': x2 + 0.5, 'z2': z2 + 0.5})
                    take(min(x, x2), min(z, z2), abs(x2 - x) + 1, abs(z2 - z) + 1)
                    break
            elif free_rect(x, z, 2, 2):
                decor.append({'type': 'fire', 'x': x + 1.0, 'z': z + 1.0})
                take(x, z, 2, 2)
                break
    elif b['file'] in ('hq.txt', 'clinic.txt', 'dorm.txt', 'store.txt', 'company_small.txt', 'office.txt', 'magazine.txt', 'workshop.txt'):
        for _ in range(8):
            x = b['x'] + rnd.randint(-3, w + 1)
            z = rnd.choice([b['z'] - 3, b['z'] + d + 1])
            ww = rnd.randint(1, 2)
            ok = free_rect(x, z, ww, 1) if b['file'] != 'workshop.txt' else all((x + i, z) not in used and 2 <= x + i < SIZE - 2 for i in range(ww))
            if ok:
                solid('drums', x, z, ww, 1, 1, 'village' if b['z'] > 140 else 'mine')
                break
# termite mounds on open red earth
tm = 0
for _ in range(3000):
    if tm >= 18: break
    x, z = rnd.randint(6, 250), rnd.randint(6, 250)
    if inside(FOREST, x, z) or not free_rect(x, z, 1, 1, 2): continue
    solid('termite', x, z, 1, 1, 2, 'outskirts'); tm += 1
# mine rim: spoil heaps on the plateau, drill rods by the yard
sp = 0
for _ in range(3000):
    if sp >= 7: break
    w, d = rnd.randint(3, 5), rnd.randint(3, 4)
    x, z = rnd.randint(134, 250 - w), rnd.randint(4, 132 - d)
    if ((x + w / 2 - CX) / 64) ** 2 + ((z + d / 2 - CZ) / 54) ** 2 <= 1 or not free_rect(x, z, w, d, 2): continue
    solid('spoil', x, z, w, d, 2, 'mine'); sp += 1
for x, z in [(132, 88), (136, 90), (240, 104), (160, 122)]:
    if free_rect(x, z, 3, 1):
        solid('rods', x, z, 3, 1, 1, 'mine')
props += clutter

# ---------------------------------------------------------------- blasting (the signature)
def face_points(face, a0, a1, step=4.0):
    """Points along the foot of bench wall `face` (0 = rim wall … 3 = the wall above the floor),
    on the bench below it, from angle a0 to a1 (degrees, anticlockwise from east, z up the page)."""
    rx, rz = RINGS[face]
    pts, a = [], a0
    while a <= a1:
        r = math.radians(a)
        # just inside the wall: on the lower bench, 2 m from its foot
        x = CX + math.cos(r) * (rx - 2.0)
        z = CZ - math.sin(r) * (rz - 2.0)
        xi, zi = int(x), int(z)
        if ring(xi + 0.5, zi + 0.5) == face + 1:
            pts.append({'x': xi, 'z': zi, 'y': LEVELS[face + 1]})
        a += math.degrees(step / max(rx, rz))
    return pts


charges = face_points(2, 200, 250) + face_points(1, 290, 340) + face_points(2, 20, 70)
unstable = []
for face, ang in [(1, 160), (0, 340), (0, 100)]:
    pts = face_points(face, ang - 6, ang + 6, 3.0)
    mid = pts[len(pts) // 2]
    # the cracked face itself sits on the wall above the points
    r = math.radians(ang)
    unstable.append({'x': int(CX + math.cos(r) * RINGS[face][0]), 'z': int(CZ - math.sin(r) * RINGS[face][1]), 'y': LEVELS[face], 'points': pts})
DETONATOR = {'x': 207, 'z': 62}
props.append({'type': 'metal', 'x': DETONATOR['x'], 'z': DETONATOR['z'], 'w': 1, 'd': 1, 'h': 1, 'district': 'mine', 'note': 'detonator'})
blasting = {'detonator': DETONATOR, 'charges': charges, 'unstable': unstable}

level = {
    'name': 'Kambala mine', 'title': 'Kambala mine', 'subtitle': 'Level 2 · in progress', 'order': 2, 'sky': '#c8ccb4',
    'summary': 'A company mine in the Democratic Republic of Kambala: an open pit, a jungle and a mining village around a junction. Rebels come out of the forest to attack.',
    'briefing': [
        'You start at the junction. Pick a base: the workshop on the pit floor (mine, north-east), the logging camp (forest, west) or the company HQ (village, south-east).',
        'Clear its defenders and step inside. It becomes your base and the clock starts.',
        'Fetch crates and build upgrades at the marked spots. Each base has its own crates close by: round the pit floor and the first bench, out in the forest round the camp, or inside the buildings round the HQ.',
        'The rebels always come out of the jungle on the west side.'
    ],
    'goals': {'claim': 'Clear a base: pit-floor workshop (mine), logging camp (forest) or company HQ (village)',
              'fetch': 'Fetch a crate and build an upgrade at a marked spot in your base'},
    'size': SIZE, 'max_height': 28, 'time_limit': 900, 'terrain_spacing': SP,
    'player_spawns': [{'x': 126, 'z': 134, 'facing': 30}, {'x': 130, 'z': 135, 'facing': 30}],
    'buildings': buildings, 'props': props, 'base_items': base_items, 'enemy_groups': groups,
    # attack waves use Kambala's fighters in place of waves.csv's types
    'wave_types': {'insurgent': M, 'militia': KA, 'heavy_insurgent': MC, 'suicide_bomber': KB},
    # every attack wave comes out of the forest on the west edge (column A)
    'wave_spawns': [{'x': 3, 'z': z} for z in (16, 56, 100, 140, 180, 220)],
    # passing downpours anywhere, mist banks in the forest
    'pickups': pickups, 'weather_zones': [{"type": "rain", "x": 128, "z": 128, "radius": 220, "strength": 0.6, "chance_per_minute": 0.3, "min_duration": 40, "max_duration": 90}, {"type": "mist", "district": "forest", "x": 48, "z": 60, "radius": 50, "strength": 0.8, "chance_per_minute": 0.5, "min_duration": 40, "max_duration": 80}, {"type": "mist", "district": "forest", "x": 52, "z": 172, "radius": 50, "strength": 0.8, "chance_per_minute": 0.5, "min_duration": 40, "max_duration": 80}], 'bases': bases, 'decor': decor, 'music_zones': [],
    'blasting': blasting
}

os.makedirs(os.path.join(OUT, 'buildings'), exist_ok=True)
for name, t in files.items():
    open(os.path.join(OUT, 'buildings', name), 'w').write(t)
open(os.path.join(OUT, 'terrain.txt'), 'w').write('\n'.join(''.join(hchar(h) for h in row) for row in heights) + '\n')
open(os.path.join(OUT, 'ground.txt'), 'w').write('\n'.join(ground) + '\n')
json.dump(level, open(os.path.join(OUT, 'level.json'), 'w'), indent=1)
print(f'kambala: {len(buildings)} buildings ({houses} houses and huts), {len(props)} props, {sum(len(g["spawns"]) for g in groups)} enemies in {len(groups)} groups, {len(pickups)} pickups')
