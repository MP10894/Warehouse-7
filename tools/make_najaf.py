"""First draft of the Najaf level files (city district).

This was run once to write data/levels/najaf/. From now on the text files and level.json
are the source: edit those directly. Re-running this script overwrites them.

    python3 tools/make_najaf.py
"""
import json, os, random

OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'levels', 'najaf')
SIZE = 256
SPACING = 4


# ---------------------------------------------------------------- buildings
def make_building(w, d, floors, state, seed, roof_access=True, note=''):
    """Text for a w x d building with `floors` storeys plus a roof.
    state: intact | damaged | ruined. Returns (text, floor grids)."""
    rnd = random.Random(seed)
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
            if k == 0:  # doors: south middle, east and west middle
                g[d - 1][w // 2] = 'd'
                g[d // 2][0] = 'd'
                g[d // 2][w - 1] = 'd'
            if w >= 10 and d >= 7:  # inner partition with a doorway
                px = w // 2
                for z in range(2, d - 2):
                    g[z][px] = '#'
                g[d // 2][px] = 'd'
        grids.append(g)

    # stairs: floor k climbs to floor k+1 (the last flight reaches the roof)
    protect = set()
    flights = floors if roof_access else floors - 1
    for k in range(flights):
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
        if state != 'ruined':  # a partition wall must not block the flight
            for x in [entry, landing, *cells]:
                for kk in (k, k + 1):
                    if grids[kk][z][x] in '#wd' and 0 < x < w - 1:
                        grids[kk][z][x] = '.'

    if state in ('damaged', 'ruined'):
        holes = 1 if state == 'damaged' else 2
        for k in range(1, floors + 1):
            for _ in range(holes):
                for _try in range(30):
                    hw, hd = rnd.randint(2, 3), rnd.randint(2, 3)
                    x0, z0 = rnd.randint(1, max(1, w - hw - 1)), rnd.randint(1, max(1, d - hd - 1))
                    cells = [(x, z) for x in range(x0, x0 + hw) for z in range(z0, z0 + hd)]
                    if any(c in protect for c in cells):
                        continue
                    for x, z in cells:
                        grids[k][z][x] = ' '
                        if grids[k - 1][z][x] == '.':
                            grids[k - 1][z][x] = ','
                    break
        if state == 'damaged':  # knock gaps in the upper walls
            top = floors - 1
            for _ in range(3):
                side = rnd.choice(['n', 's', 'e', 'w'])
                if side in 'ns':
                    z = 0 if side == 'n' else d - 1
                    x = rnd.randint(1, w - 3)
                    for xx in (x, x + 1):
                        if grids[top][z][xx] in '#w':
                            grids[top][z][xx] = '.'
                else:
                    x = 0 if side == 'w' else w - 1
                    z = rnd.randint(1, d - 3)
                    for zz in (z, z + 1):
                        if grids[top][zz][x] in '#w':
                            grids[top][zz][x] = '.'
        if state == 'ruined':
            for _ in range(w * d // 8):
                x, z = rnd.randint(1, w - 2), rnd.randint(1, d - 2)
                if grids[0][z][x] == '.' and (x, z) not in protect:
                    grids[0][z][x] = ','
    lines = [f'# {note}'.rstrip(), f'# {w} x {d} m, {floors} floor{"s" if floors > 1 else ""} + roof, {state}.',
             '# Symbol guide: data/levels/README.md', '']
    for k, g in enumerate(grids):
        lines.append(f'floor {k}')
        lines += [''.join(r) for r in g]
        lines.append('')
    return '\n'.join(lines), grids


SIZES = {'s': (8, 7), 'm': (10, 9), 'l': (12, 10)}
templates = {}
for si, (w, d) in SIZES.items():
    for fl in (1, 2, 3):
        for st in ('intact', 'damaged', 'ruined'):
            name = f'{si}{fl}_{st}.txt'
            seed = hash((si, fl, st)) & 0xffff if False else (ord(si) * 31 + fl * 7 + len(st))
            templates[name] = make_building(w, d, fl, st, seed, note=f'City building, size {si.upper()}')

specials = {
    'clinic.txt': make_building(18, 14, 3, 'damaged', 5, note='Clinic: the medical crate will sit on its roof'),
    'police_hq.txt': make_building(20, 8, 2, 'intact', 9, note='Police station, main block (base A)'),
    'police_wing.txt': make_building(7, 12, 1, 'damaged', 12, note='Police station, side wing (base A)'),
    'site_frame.txt': make_building(12, 10, 2, 'ruined', 21, note='Building site: unfinished concrete frame'),
}
# minaret: solid landmark, not climbable
mn = ['# Minaret: a landmark you can see from far away. Solid, not climbable.', '']
for k in range(4):
    mn += [f'floor {k}', 'XXX', 'XXX', 'XXX', '']
mn += ['floor 4', 'lll', 'l.l', 'lll', '']
specials['minaret.txt'] = ('\n'.join(mn), None)


def footprint(name, turn):
    text, grids = (templates.get(name) or specials[name])
    w = max(len(r) for g in grids for r in g) if grids else 3
    d = len(grids[0]) if grids else 3
    return (d, w) if turn in (90, 270) else (w, d)


def rot_grid(g, turn):
    """Same rotation the game applies (clockwise, seen from above)."""
    for _ in range(turn // 90):
        g = [[g[len(g) - 1 - j][i] for j in range(len(g))] for i in range(len(g[0]))]
    return g


# ---------------------------------------------------------------- city layout
rnd = random.Random(2026)
buildings = []          # level.json entries
solid = set()           # (x, z) cells used by building footprints (+1 m margin)
def place(name, x, z, turn=0):
    w, d = footprint(name, turn)
    buildings.append({'file': name, 'x': x, 'z': z, **({'turn': turn} if turn else {})})
    for xx in range(x - 1, x + w + 1):
        for zz in range(z - 1, z + d + 1):
            solid.add((xx, zz))
    return w, d

def free(x, z, w, d):
    return all((xx, zz) not in solid for xx in range(x, x + w) for zz in range(z, z + d))

# streets 8 m wide; city blocks between them
BX = [(2, 24), (32, 52), (60, 80), (88, 96), (104, 130)]
BZ = [(2, 20), (28, 48), (56, 76), (84, 104), (112, 130)]
BASE_AREA = {'x0': 60, 'z0': 56, 'x1': 80, 'z1': 76}
MARKET = (32, 84, 52, 104)
SITE = (104, 84, 130, 104)

place('clinic.txt', 4, 4)
place('police_hq.txt', 60, 56)
place('police_wing.txt', 60, 64)
for xx in range(60, 80):
    for zz in range(56, 76):
        solid.add((xx, zz))           # keep the courtyard clear
place('minaret.txt', 90, 30)
place('site_frame.txt', 106, 86)
place('site_frame.txt', 119, 90, 90)
for xx in range(MARKET[0], MARKET[2]):
    for zz in range(MARKET[1], MARKET[3]):
        solid.add((xx, zz))
for xx in range(SITE[0], SITE[2]):
    for zz in range(SITE[1], SITE[3]):
        solid.add((xx, zz))

def pick_template():
    fl = rnd.choices([1, 2, 3], [3, 4, 3])[0]
    st = rnd.choices(['intact', 'damaged', 'ruined'], [5, 3, 2.2])[0]
    return fl, st

for bx0, bx1 in BX:
    for bz0, bz1 in BZ:
        z = bz0
        while z < bz1 - 6:
            x = bx0
            row_d = 0
            while x < bx1 - 6:
                options = []
                for si in ('l', 'm', 's'):
                    for turn in (0, 90, 180, 270):
                        fl, st = pick_template()
                        name = f'{si}{fl}_{st}.txt'
                        w, d = footprint(name, turn)
                        if x + w <= bx1 and z + d <= bz1 and free(x, z, w, d):
                            options.append((name, turn, w, d))
                if not options or rnd.random() < 0.08:
                    x += 3
                    continue
                name, turn, w, d = rnd.choice(options)
                place(name, x, z, turn)
                row_d = max(row_d, d)
                x += w + rnd.choice([2, 2, 3])
            z += (row_d or 6) + 2

# ---------------------------------------------------------------- props
props = []
# market stalls and low walls
for i in range(3):
    for j in range(2):
        props.append({'type': 'crate', 'x': 35 + i * 6, 'z': 88 + j * 9, 'w': 2, 'd': 1})
props += [{'type': 'lowwall', 'x': 34, 'z': 95, 'w': 5, 'd': 1}, {'type': 'lowwall', 'x': 44, 'z': 95, 'w': 5, 'd': 1},
          {'type': 'crate', 'x': 49, 'z': 100, 'w': 1, 'd': 1, 'h': 2}]
# police courtyard cover
props += [{'type': 'crate', 'x': 70, 'z': 66, 'w': 2, 'd': 1}, {'type': 'lowwall', 'x': 74, 'z': 70, 'w': 3, 'd': 1},
          {'type': 'crate', 'x': 69, 'z': 72, 'w': 1, 'd': 1, 'h': 2}]
# building site: stacked material
props += [{'type': 'crate', 'x': 108, 'z': 99, 'w': 3, 'd': 2}, {'type': 'crate', 'x': 109, 'z': 99, 'w': 1, 'd': 1, 'h': 2},
          {'type': 'lowwall', 'x': 104, 'z': 103, 'w': 10, 'd': 1}, {'type': 'crate', 'x': 125, 'z': 86, 'w': 2, 'd': 2}]
# street barricades and wrecks
props += [{'type': 'lowwall', 'x': 26, 'z': 36, 'w': 4, 'd': 1}, {'type': 'lowwall', 'x': 40, 'z': 51, 'w': 1, 'd': 3},
          {'type': 'crate', 'x': 82, 'z': 92, 'w': 2, 'd': 1}, {'type': 'lowwall', 'x': 98, 'z': 64, 'w': 4, 'd': 1},
          {'type': 'lowwall', 'x': 10, 'z': 79, 'w': 6, 'd': 1}, {'type': 'crate', 'x': 55, 'z': 22, 'w': 1, 'd': 2},
          {'type': 'lowwall', 'x': 100, 'z': 116, 'w': 1, 'd': 4}, {'type': 'crate', 'x': 70, 'z': 107, 'w': 2, 'd': 2}]
for p in props:
    for xx in range(p['x'], p['x'] + p['w']):
        for zz in range(p['z'], p['z'] + p['d']):
            solid.add((xx, zz))

# ---------------------------------------------------------------- terrain + ground
N = SIZE // SPACING + 1
import math
dunes = [(30, 170, 26, 12), (40, 245, 30, 9), (120, 232, 22, 10), (225, 205, 24, 11),
         (165, 245, 26, 8), (15, 205, 12, 20), (240, 240, 16, 12), (100, 175, 14, 8)]
wadi = [(0, 150), (30, 158), (60, 168), (85, 165), (108, 178), (135, 200), (150, 214), (190, 218), (220, 232), (256, 236)]
def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b
    t = max(0, min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)))
    return math.hypot(px - ax - t * (bx - ax), pz - az - t * (bz - az))
ROADS = [[(128, 256), (128, 150)], [(128, 150), (110, 122), (100, 110)], [(128, 150), (190, 132)], [(128, 150), (0, 150)]]
def near_road(x, z, r):
    return any(seg_dist(x, z, a, b) < r for line in ROADS for a, b in zip(line, line[1:]))
terrain = []
for j in range(N):
    row = ''
    for i in range(N):
        x, z = i * SPACING, j * SPACING
        if x <= 136 and z <= 136:
            h = 0
        else:
            h = 2.0
            for cx, cz, rx, rz in dunes:
                q = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2
                h += 6.5 * max(0, 1 - q)
            dw = min(seg_dist(x, z, a, b) for a, b in zip(wadi, wadi[1:]))
            if dw < 10:
                h = min(h, 0.5)
            if near_road(x, z, 8):
                h = min(h, 1.5)
            # blend down towards the city
            edge = max(x - 136, z - 136)
            if edge < 20:
                h = min(h, edge / 10)
            # rocky outcrops
            for cx, cz, r in [(20, 140, 7), (95, 155, 6), (150, 238, 8), (205, 180, 6), (60, 238, 6), (245, 190, 5), (8, 222, 6), (178, 200, 5)]:
                if math.hypot(x - cx, z - cz) < r:
                    h = max(h, 6)
        row += str(max(0, min(9, round(h))))
    terrain.append(row)

ground = []
STREETS_X = [(24, 32), (52, 60), (80, 88), (96, 104)]
STREETS_Z = [(20, 28), (48, 56), (76, 84), (104, 112)]
for j in range(SIZE // 4):
    row = ''
    for i in range(SIZE // 4):
        x, z = i * 4 + 2, j * 4 + 2
        c = 's'
        if x < 132 and z < 132:
            c = 'p'
            if any(a <= x < b for a, b in STREETS_X) or any(a <= z < b for a, b in STREETS_Z):
                c = 'r'
            if x < 96 and z > 116:
                c = 'g'
        if near_road(x, z, 4.5):
            c = 'r'
        if MARKET[0] <= x < MARKET[2] and MARKET[1] <= z < MARKET[3]:
            c = 'p'
        row += c
    ground.append(row)

# ---------------------------------------------------------------- write
os.makedirs(os.path.join(OUT, 'buildings'), exist_ok=True)
used = {b['file'] for b in buildings}
for name, (text, _) in {**templates, **specials}.items():
    if name in used:
        open(os.path.join(OUT, 'buildings', name), 'w').write(text)

level = {
    'name': 'Najaf',
    'title': 'Najaf',
    'subtitle': 'Level 1 · city district only',
    'summary': 'The outskirts and the refinery are open sand for now.',
    'briefing': [
        'Head north-west from the crossroads into the city.',
        'Clear the police station courtyard. It becomes your base.',
        'Fetch the construction crate from the building site (east of the market), build walls, then hold out.'
    ],
    'goals': {
        'claim': 'Clear the police station (in the city, north-west) to claim a base',
        'fetch': 'Fetch the construction crate from the building site (east of the market)'
    },
    'size': SIZE,
    'max_height': 16,
    'time_limit': 900,
    'terrain_spacing': SPACING,
    'player_spawns': [{'x': 126, 'z': 150, 'facing': 40}, {'x': 129, 'z': 151, 'facing': 40}],
    'buildings': buildings,
    'props': props,
    'base': {
        'name': 'Police station',
        'area': BASE_AREA,
        'build_spots': [{'x': 73, 'z': 68, 'upgrade': 'walls', 'needs': 'construction_crate'}],
        'wall_plan': [
            {'x': 67, 'z': 74, 'w': 5, 'd': 1}, {'x': 74, 'z': 74, 'w': 5, 'd': 1},
            {'x': 78, 'z': 64, 'w': 1, 'd': 4}, {'x': 78, 'z': 70, 'w': 1, 'd': 3}
        ]
    },
    'base_items': [{'item': 'construction_crate', 'x': 110.5, 'z': 88.5, 'y': 3}],
    'enemy_groups': [
        {'id': 'clinic', 'behaviour': 'guard', 'respawn': 60,
         'spawns': [{'x': 7, 'z': 9, 'y': 0}, {'x': 15, 'z': 11, 'y': 3}, {'x': 18, 'z': 7, 'y': 6}, {'x': 10, 'z': 12, 'y': 9}],
         'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.3, 'armour': 50},
        {'id': 'police', 'behaviour': 'guard', 'respawn': 45, 'holds_base': True,
         'spawns': [{'x': 64, 'z': 59, 'y': 0}, {'x': 74, 'z': 60, 'y': 3}, {'x': 71, 'z': 69, 'y': 0}, {'x': 76, 'z': 72, 'y': 0}],
         'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.25, 'armour': 50},
        {'id': 'site', 'behaviour': 'guard', 'respawn': 50,
         'spawns': [{'x': 112, 'z': 101, 'y': 0}, {'x': 123, 'z': 105, 'y': 0}, {'x': 114, 'z': 93, 'y': 3}, {'x': 127, 'z': 90, 'y': 0}],
         'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.25, 'armour': 50},
        {'id': 'market', 'behaviour': 'roam', 'respawn': 50, 'radius': 14,
         'spawns': [{'x': 38, 'z': 92}, {'x': 46, 'z': 99}, {'x': 42, 'z': 86}],
         'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.15, 'armour': 50},
        {'id': 'northwest', 'behaviour': 'roam', 'respawn': 50, 'radius': 16,
         'spawns': [{'x': 28, 'z': 40}, {'x': 42, 'z': 24}, {'x': 56, 'z': 38}],
         'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.15, 'armour': 50},
        {'id': 'minaret', 'behaviour': 'roam', 'respawn': 55, 'radius': 12,
         'spawns': [{'x': 84, 'z': 40}, {'x': 92, 'z': 24}],
         'weapons': {'ak47': 1}, 'armour_chance': 0.1, 'armour': 50},
        {'id': 'avenue', 'behaviour': 'roam', 'respawn': 55, 'radius': 20,
         'spawns': [{'x': 100, 'z': 12}, {'x': 100, 'z': 44}],
         'weapons': {'ak47': 2, 'rpg7': 1}, 'armour_chance': 0.1, 'armour': 50},
        {'id': 'west', 'behaviour': 'roam', 'respawn': 55, 'radius': 18,
         'spawns': [{'x': 28, 'z': 64}, {'x': 12, 'z': 108}],
         'weapons': {'ak47': 1}, 'armour_chance': 0.1, 'armour': 50},
        {'id': 'east', 'behaviour': 'roam', 'respawn': 50, 'radius': 18,
         'spawns': [{'x': 108, 'z': 52}, {'x': 126, 'z': 66}, {'x': 116, 'z': 120}],
         'weapons': {'ak47': 3, 'rpg7': 1}, 'armour_chance': 0.2, 'armour': 50}
    ],
    'wave_spawns': [{'x': 98, 'z': 3}, {'x': 3, 'z': 112}, {'x': 252, 'z': 6}, {'x': 252, 'z': 176}, {'x': 200, 'z': 252}, {'x': 8, 'z': 250}],
    'pickups': [
        {'type': 'armour', 'amount': 50, 'x': 116, 'z': 140},
        {'type': 'weapon', 'weapon': 'ak47', 'x': 28.5, 'z': 50.5},
        {'type': 'ammo', 'calibre': '7.62x39mm', 'amount': 60, 'x': 29.5, 'z': 51.5},
        {'type': 'weapon', 'weapon': 'm4a1', 'x': 84.5, 'z': 100.5},
        {'type': 'ammo', 'calibre': '5.56mm', 'amount': 60, 'x': 85.5, 'z': 101.5},
        {'type': 'ammo', 'calibre': '9mm', 'amount': 34, 'x': 104, 'z': 128},
        {'type': 'weapon', 'weapon': 'rpg7', 'x': 56.5, 'z': 80.5},
        {'type': 'ammo', 'calibre': '40mm', 'amount': 3, 'x': 57.5, 'z': 80.5},
        {'type': 'armour', 'amount': 100, 'x': 12, 'z': 9, 'y': 9},
        {'type': 'ammo', 'calibre': '7.62x39mm', 'amount': 60, 'x': 92, 'z': 80}
    ],
    'weather_zones': [
        {'type': 'sandstorm', 'x': 60, 'z': 210, 'radius': 60, 'chance_per_minute': 0.5, 'min_duration': 30, 'max_duration': 60},
        {'type': 'sandstorm', 'x': 205, 'z': 212, 'radius': 40, 'chance_per_minute': 0.5, 'min_duration': 30, 'max_duration': 60}
    ]
}
# keep enemy and pickup spots off building footprints and props (nudge into the open)
def open_cell(x, z):
    return (int(x), int(z)) not in solid_core
solid_core = set()
for b in buildings:
    w, d = footprint(b['file'], b.get('turn', 0))
    for xx in range(b['x'], b['x'] + w):
        for zz in range(b['z'], b['z'] + d):
            solid_core.add((xx, zz))
for p in props:
    for xx in range(p['x'], p['x'] + p['w']):
        for zz in range(p['z'], p['z'] + p['d']):
            solid_core.add((xx, zz))
def nudge(obj):
    """Move a spot to the nearest open ground cell (2 m clear around it)."""
    x0, z0 = obj['x'], obj['z']
    for r in range(0, 30):
        for dx in range(-r, r + 1):
            for dz in range(-r, r + 1):
                if max(abs(dx), abs(dz)) != r:
                    continue
                x, z = int(x0) + dx, int(z0) + dz
                if all(open_cell(x + a, z + b) for a in (-1, 0, 1) for b in (-1, 0, 1)):
                    obj['x'], obj['z'] = x + (x0 - int(x0)), z + (z0 - int(z0))
                    return
    raise SystemExit(f'no open ground near {obj}')
for g in level['enemy_groups']:
    if g['behaviour'] == 'roam':
        for s in g['spawns']:
            nudge(s)
for p in level['pickups']:
    if 'y' not in p:
        nudge(p)

json.dump(level, open(os.path.join(OUT, 'level.json'), 'w'), indent=1)
open(os.path.join(OUT, 'terrain.txt'), 'w').write('\n'.join(terrain) + '\n')
open(os.path.join(OUT, 'ground.txt'), 'w').write('\n'.join(ground) + '\n')
print(len(buildings), 'buildings,', len(used), 'building files,', len(props), 'props')
