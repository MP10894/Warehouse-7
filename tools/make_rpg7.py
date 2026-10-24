"""Draft RPG-7 (loaded with a PG-7V rocket) for Blockbench, and the PG-7V rocket on its own for
flight, built from the side views of the OpenArt sheet assets/sources/reference/rpg7_views.png.
The sheet drew the tube slightly sloping; the model straightens it: every round part is centred
on one axis, with its diameter from the sheet. Round parts are boxes whose four long sides all
take the side view's colours (so the top looks right in first person). The sheet's front and
back views were muddled (wooden sticks crossing the tube), so they are not used.

Launcher parts: the loaded rocket's warhead is a group named "warhead" (hidden once fired, slid
back in on a reload). Writes assets/sources/rpg7.bbmodel → assets/weapons/rpg7.glb, and
assets/sources/pg7v.bbmodel → assets/items/pg7v.glb (the rocket in flight).

Weapons use a finer scale than the world (ART_SPEC.md section 5):
1 Blockbench unit = 1 texture pixel = 1/256 m.

    python3 tools/make_rpg7.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'rpg7_views.png')
UNITS = 256           # Blockbench units per metre for weapons
LENGTH_M = 1.31       # warhead tip to the back of the exhaust flare: a 0.95 m tube with about 0.36 m of warhead in front

ref = Image.open(REF).convert('RGB')
S = ref.width / 2000  # the measurements below were taken on a 2000 px wide copy
SIDE_X0, SIDE_X1 = 74, 1925                    # warhead tip to exhaust flare, side view (2000-wide coordinates)
U = (SIDE_X1 - SIDE_X0) / (LENGTH_M * UNITS)   # reference pixels per Blockbench unit
OX, OY = 870, 360                              # top of the trigger grip (weapon origin) on the side view

# olive warhead, black steel, orange-brown wood
USE = ('Gun metal', 'Concrete', 'Army green', 'Wood', 'Yellow', 'Rust and oil', 'Khaki cloth', 'Extras')
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]
NAMED = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}

clean = ref


def nearest(c, pal=None):
    return min(pal or PAL, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)


def is_bg(c):
    return min(c) > 190 and max(c) - min(c) < 18


def sample(box, w, h, mirror=False, quad=None, pal=None):
    """Take a region of the reference (2000-wide coordinates), shrink it to w x h and snap it to
    the palette. `quad` (4 corners: top-front, bottom-front, bottom-back, top-back) samples a
    slanted part, like the grip, along its own lean. Background pixels become the part's colour."""
    if quad:
        img = clean.transform((w * 8, h * 8), Image.QUAD, [v * S for pt in quad for v in pt], Image.NEAREST)
    else:
        x0, y0, x1, y1 = (round(v * S) for v in box)
        img = clean.crop((x0, y0, max(x1, x0 + 1), max(y1, y0 + 1)))
    px = list(img.get_flattened_data()) if hasattr(img, 'get_flattened_data') else list(img.getdata())
    solid = [c for c in px if not is_bg(c)] or [NAMED['Gun metal'][1]]
    fill = sorted(solid, key=sum)[len(solid) // 2]
    img.putdata([fill if is_bg(c) else c for c in px])
    img = img.resize((w, h), Image.BOX)
    if mirror:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return [[nearest(img.getpixel((x, y)), pal) for x in range(w)] for y in range(h)]


def flat(ramp, i, w, h, seed):
    r = random.Random(seed)
    cols = NAMED[ramp]
    return [[cols[max(0, min(4, i + (r.random() < 0.04) - (r.random() < 0.04)))] for _ in range(w)] for _ in range(h)]


import math


def ramps(*names):
    return [c for n in names for c in NAMED[n]]


# colour families, so a part's light and dark shades stay in its own colour
OLIVE = ramps('Army green', 'Gun metal', 'Yellow')
WOOD = ramps('Wood', 'Yellow', 'Rust and oil', 'Gun metal')
STEEL = ramps('Gun metal', 'Concrete', 'Extras')


def median_colour(box, pal=None):
    x0, y0, x1, y1 = (round(v * S) for v in box)
    img = clean.crop((x0, y0, max(x1, x0 + 1), max(y1, y0 + 1)))
    px = list(img.get_flattened_data()) if hasattr(img, "get_flattened_data") else list(img.getdata())
    solid = [c for c in px if not is_bg(c)] or [NAMED['Gun metal'][1]]
    return nearest(sorted(solid, key=sum)[len(solid) // 2], pal)


def flat_col(col, w, h, shade, seed, pal=None):
    r = random.Random(seed)
    k = 0.82 + 0.06 * shade
    out = []
    for _ in range(h):
        row = []
        for _ in range(w):
            j = k + (r.random() - 0.5) * 0.06
            row.append(nearest(tuple(max(0, min(255, int(v * j))) for v in col), pal))
        out.append(row)
    return out


# Each part: name, side-view box (2000-wide coordinates) x0, x1, y0, y1; 'round' parts are
# centred on the axis with the box's height as their diameter; others keep their place and
# take `half` (half width in Blockbench units). Optional xoff, lean, group, shade.
def part(name, x0, x1, y0, y1, half=None, shade=2, xoff=0.0, lean=0, group=None, round_=False, pal=None):
    if pal is None:
        pal = OLIVE if any(k in name for k in ('warhead', 'cone', 'body', 'tip', 'fins', 'motor')) else \
            WOOD if any(k in name for k in ('heat_guard', 'grip')) else STEEL
    return {'name': name, 'img': (x0, y0, x1, y1), 'half': half, 'shade': shade, 'xoff': xoff, 'lean': lean,
            'group': group, 'round': round_, 'pal': pal}


def rnd(name, x0, x1, y0, y1, group=None, shade=2, pal=None):
    return part(name, x0, x1, y0, y1, group=group, shade=shade, round_=True, pal=pal)


# ---- the launcher, loaded (side view at the top of the sheet; tube axis straightened)
LAUNCHER = {
    'name': 'rpg7', 'out': ('weapons', 'rpg7.glb'),
    'x0': 74, 'x1': 1925, 'length': LENGTH_M, 'origin': (870, 360), 'axis': 228,
    'parts': [
        # the rocket's warhead, sticking out in front of the tube
        rnd('warhead_tip', 74, 107, 201, 240, group='warhead'),
        rnd('warhead_cone_1', 107, 153, 194, 246, group='warhead'),
        rnd('warhead_cone_2', 153, 200, 182, 261, group='warhead'),
        rnd('warhead_body_1', 200, 248, 172, 272, group='warhead'),
        rnd('warhead_body_2', 248, 297, 162, 281, group='warhead'),
        rnd('warhead_max', 297, 395, 155, 291, group='warhead'),
        rnd('warhead_rear_1', 395, 454, 162, 280, group='warhead'),
        rnd('warhead_rear_2', 454, 503, 180, 266, group='warhead'),
        rnd('warhead_neck', 503, 560, 190, 260, group='warhead'),
        rnd('rocket_collar', 560, 590, 184, 267, group='warhead'),
        # tube and fittings
        rnd('tube_front', 588, 960, 192, 262),
        part('front_sight_post', 601, 615, 92, 160, half=0.6),
        part('front_sight_base', 597, 700, 155, 194, half=2.4),
        rnd('band_front', 760, 785, 188, 266, shade=3),
        rnd('band_mid', 905, 930, 188, 266, shade=3),
        part('trigger_housing', 760, 925, 262, 330, half=3.6),
        part('trigger_guard', 760, 838, 340, 352, half=1.2),
        part('trigger', 815, 830, 300, 345, half=0.7),
        part('trigger_grip', 838, 900, 330, 475, half=3.2, lean=4),
        part('rear_sight_block', 1000, 1100, 150, 194, half=2.6),
        part('rear_sight_left', 1085, 1100, 82, 120, half=0.6, xoff=-1.4),
        part('rear_sight_right', 1085, 1100, 82, 120, half=0.6, xoff=1.4),
        part('rear_sight_leaf', 1085, 1100, 120, 152, half=2.0),
        rnd('tube_middle', 960, 1140, 185, 277),
        part('second_grip', 1072, 1125, 255, 415, half=3.2),
        rnd('heat_guard', 1140, 1420, 182, 295),
        rnd('heat_guard_step', 1420, 1483, 192, 285),
        rnd('band_rear', 1483, 1500, 201, 287, shade=1),
        rnd('heat_guard_rear', 1500, 1695, 202, 282),
        rnd('collar', 1695, 1720, 207, 297),
        rnd('tube_rear', 1720, 1780, 210, 292),
        rnd('venturi', 1780, 1865, 202, 300),
        rnd('exhaust_flare', 1865, 1925, 170, 335),
    ],
    'points': {
        'muzzle': (590, 228),          # where the rocket leaves the tube
        'sight': (1092, 92),           # the rear sight's notch, lined up with the front post's tip
        'eye': (1262, 92),             # a hand's width behind the rear sight
        'hand_left': (1098, 300, -2.0),  # the second grip
    },
    'pivots': {'warhead': (590, 228)},
}

# ---- the PG-7V rocket on its own (upper of the two rocket views), for flight. It is scaled so
# its warhead matches the loaded one, and its origin is where the warhead meets the motor (the
# launcher's muzzle), so the flying rocket starts exactly where the loaded warhead was.
ROCKET = {
    'name': 'pg7v', 'out': ('items', 'pg7v.glb'),
    'scale_from': ((614, 719), (155, 291)),     # warhead width here, and in the launcher view
    'origin': (385, 666), 'axis': 666,
    'parts': [
        rnd('tip', 80, 113, 642, 677),
        rnd('fuze_band', 113, 135, 645, 682),
        rnd('cone_1', 135, 165, 637, 692),
        rnd('cone_2', 165, 200, 630, 700),
        rnd('body', 200, 240, 622, 710),
        rnd('warhead', 240, 385, 614, 719),
        rnd('motor', 385, 720, 626, 702),
        part('fins_vertical', 720, 855, 575, 740, half=0.5),
        part('fins_horizontal', 720, 855, 655, 662, half=8.0),
        rnd('nozzle', 855, 945, 620, 712),
        rnd('nozzle_ring', 945, 975, 615, 717),
    ],
    'points': {},
    'pivots': {},
}


def make(spec):
    if 'scale_from' in spec:
        (a0, a1), (b0, b1) = spec['scale_from']
        u = U * (a1 - a0) / (b1 - b0)
    else:
        u = (spec['x1'] - spec['x0']) / (spec['length'] * UNITS)
    ox, oy = spec['origin']
    tz = lambda x: (x - ox) / u
    ty = lambda y: (oy - y) / u
    axis = spec['axis']
    cubes = []
    for b in spec['parts']:
        x0, y0, x1, y1 = b['img']
        z0, z1 = sorted((tz(x0), tz(x1 + b['lean'])))
        if b['round']:
            r = (y1 - y0) / 2 / u
            ya, yb, h = ty(axis) - r, ty(axis) + r, r
        else:
            ya, yb = sorted((ty(y0), ty(y1)))
            h = b['half']
        c = {**b, 'from': [b['xoff'] - h, ya, z0], 'to': [b['xoff'] + h, yb, z1], 'col': median_colour(b['img'], b['pal'])}
        if b['lean']:
            ang = math.degrees(math.atan2(b['lean'], y1 - y0))
            c['to'][2] = tz(x1); c['from'][2] = tz(x0)
            c['rot'] = -ang; c['origin'] = [0, ty(y0), tz((x0 + x1) / 2)]
            c['quad'] = [(x0, y0), (x0 + b['lean'], y1), (x1 + b['lean'], y1), (x1, y0)]
        cubes.append(c)
    faces = []
    for c in cubes:
        w, hgt, d = (max(1, round(t - f)) for f, t in zip(c['from'], c['to']))
        q = c.get('quad')
        side = lambda w_, h_, c=c, q=q: sample(c['img'], w_, h_, quad=q, pal=c['pal'])
        mirror = lambda w_, h_, c=c, q=q: sample(c['img'], w_, h_, mirror=True, quad=q, pal=c['pal'])
        faces += [(c, 'west', d, hgt, side), (c, 'east', d, hgt, mirror),
                  (c, 'north', w, hgt, lambda w_, h_, c=c: flat_col(c['col'], w_, h_, c['shade'] - 1, len(c['name']), c['pal'])),
                  (c, 'south', w, hgt, lambda w_, h_, c=c: flat_col(c['col'], w_, h_, c['shade'] - 1, len(c['name']) + 2, c['pal'])),
                  (c, 'up', w, d, lambda w_, h_, c=c: flat_col(c['col'], w_, h_, c['shade'] + 1, len(c['name']) + 3, c['pal'])),
                  (c, 'down', w, d, lambda w_, h_, c=c: flat_col(c['col'], w_, h_, c['shade'] - 2, len(c['name']) + 4, c['pal']))]
    W = 256
    x = y = row = 0
    slots = []
    for c, f, w, h, fn in sorted(faces, key=lambda t: (-t[3], -t[2])):
        if x + w > W:
            x, y, row = 0, y + row, 0
        slots.append((c, f, x, y, w, h, fn))
        x += w; row = max(row, h)
    H = 8
    while H < y + row:
        H *= 2
    tex = Image.new('RGB', (W, H), NAMED['Gun metal'][1])
    for c, f, x, y, w, h, fn in slots:
        px = fn(w, h)
        for j in range(h):
            for i in range(w):
                tex.putpixel((x + i, y + j), px[j][i])
        c.setdefault('faces', {})[f] = {'uv': [x, y, x + w, y + h], 'texture': 0}

    rg = random.Random(7)
    uid = lambda: str(uuid.UUID(int=rg.getrandbits(128)))
    r3 = lambda v: [round(a, 3) for a in v]
    elements = []
    for c in cubes:
        e = {'name': c['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
             'from': r3(c['from']), 'to': r3(c['to']), 'autouv': 0, 'color': 1,
             'origin': r3(c.get('origin', [0, 0, 0])), 'faces': c['faces']}
        if c.get('rot'):
            e['rotation'] = [round(c['rot'], 2), 0, 0]
        elements.append(e)
    group = lambda name, origin, kids: {'name': name, 'origin': r3(origin), 'color': 0, 'uuid': uid(), 'export': True,
                                        'isOpen': True, 'locked': False, 'visibility': True, 'autouv': 0, 'children': kids}
    outliner = [e['uuid'] for e, c in zip(elements, cubes) if not c['group']]
    for g, (px_, py_) in spec['pivots'].items():
        outliner.append(group(g, [0, ty(py_), tz(px_)], [e['uuid'] for e, c in zip(elements, cubes) if c['group'] == g]))
    for n, pt in spec['points'].items():
        outliner.append(group(n, [pt[2] if len(pt) > 2 else 0, ty(pt[1]), tz(pt[0])], []))
    buf = io.BytesIO(); tex.save(buf, 'PNG')
    name = spec['name']
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': name, 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': tex.width, 'height': tex.height}, 'elements': elements, 'outliner': outliner,
               'textures': [{'path': '', 'name': name + '.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
                             'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
                             'width': tex.width, 'height': tex.height, 'uv_width': tex.width, 'uv_height': tex.height,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', name + '.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    tex.save(os.path.join(ROOT, 'assets', 'sources', name + '.png'))
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', *spec['out']), units_per_m=UNITS)
    size = [round((max(c['to'][i] for c in cubes) - min(c['from'][i] for c in cubes)) / UNITS, 3) for i in range(3)]
    print(f'{name}: {bbmodel.triangles(project)} triangles, {size} m, texture {tex.width} x {tex.height}')


if __name__ == '__main__':
    make(LAUNCHER)
    make(ROCKET)
