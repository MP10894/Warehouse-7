"""Draft MP5 (MP5A2, fixed stock) for Blockbench, built from the side view (left) of the OpenArt
sheet assets/sources/reference/mp5_views.png. Widths follow the real gun (the sheet's front and
back views agree with them); the front, back, top and bottom faces are plain palette colours and
the sides are sampled from the side view. The odd metal prong the sheet drew under the front of
the handguard is left out, and the charging handle sits where the real one is: at the front of
the cocking tube, on the left.

Writes assets/sources/mp5.bbmodel (open in Blockbench) and
assets/weapons/mp5.glb (what the game loads).

Weapons use a finer scale than the world (ART_SPEC.md section 5):
1 Blockbench unit = 1 texture pixel = 1/256 m.

    python3 tools/make_mp5.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'mp5_views.png')
UNITS = 256           # Blockbench units per metre for weapons
LENGTH_M = 0.68       # muzzle to butt plate (the real MP5A2: 680 mm)

ref = Image.open(REF).convert('RGB')
S = ref.width / 2000  # the measurements below were taken on a 2000 px wide copy
SIDE_X0, SIDE_X1 = 57, 1278                    # muzzle to butt plate, side view (2000-wide coordinates)
U = (SIDE_X1 - SIDE_X0) / (LENGTH_M * UNITS)   # reference pixels per Blockbench unit
OX, OY = 745, 572                              # top of the pistol grip (weapon origin) on the side view

# a black gun: greys and blacks (the selector's small markings snap to the nearest of these)
USE = ('Gun metal', 'Concrete', 'Extras')
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]
NAMED = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}

# paint out the prong under the front of the handguard so it never ends up in a texture
clean = ref.copy()
_bg = clean.getpixel((round(30 * S), round(600 * S)))
for (bx0, by0, bx1, by1) in [(148, 500, 262, 548), (148, 476, 168, 500)]:
    clean.paste(_bg, tuple(round(v * S) for v in (bx0, by0, bx1, by1)))


def nearest(c):
    return min(PAL, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)


def is_bg(c):
    return min(c) > 190 and max(c) - min(c) < 18


def sample(box, w, h, mirror=False, quad=None):
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
    return [[nearest(img.getpixel((x, y))) for x in range(w)] for y in range(h)]


def flat(ramp, i, w, h, seed):
    r = random.Random(seed)
    cols = NAMED[ramp]
    return [[cols[max(0, min(4, i + (r.random() < 0.04) - (r.random() < 0.04)))] for _ in range(w)] for _ in range(h)]


# Boxes measured on the side view (2000-wide coordinates): name, x from/to, y from/to,
# half width in Blockbench units (1/256 m), shade for the plain faces, and optional
# x offset, lean (px the bottom sits behind the top, for the slanted grip), group
def part(name, x0, x1, y0, y1, half, shade=1, xoff=0.0, lean=0, group=None):
    return {'name': name, 'img': (x0, y0, x1, y1), 'half': half, 'shade': shade, 'xoff': xoff, 'lean': lean, 'group': group}

PARTS = [
    part('muzzle', 57, 97, 445, 476, 2.6, 1),
    part('barrel_lugs', 97, 130, 440, 481, 3.4, 1),
    # sights: split so you can look through them when aiming (a solid box would block the view)
    part('front_sight_base', 128, 168, 400, 486, 3.2, 1),
    part('front_hood_left', 128, 168, 332, 400, 0.8, 1, xoff=-2.4),
    part('front_hood_right', 128, 168, 332, 400, 0.8, 1, xoff=2.4),
    part('front_post', 140, 156, 360, 400, 0.5, 2),
    part('cocking_tube', 160, 452, 388, 421, 3.6, 1),
    part('handguard', 165, 452, 419, 516, 7.0, 0),
    part('receiver', 450, 800, 384, 492, 6.4, 1),
    part('receiver_cap', 795, 905, 376, 538, 6.0, 1),
    part('rear_sight_base', 714, 782, 372, 390, 3.2, 1),
    part('rear_drum_left', 726, 770, 343, 372, 0.8, 1, xoff=-2.6),
    part('rear_drum_right', 726, 770, 343, 372, 0.8, 1, xoff=2.6),
    part('trigger_housing', 470, 800, 490, 576, 5.4, 0),
    part('mag_well', 452, 526, 490, 562, 4.6, 1),
    part('trigger_guard', 552, 682, 628, 646, 1.4, 1),      # just the bottom bar: a box can't show the opening
    part('guard_front', 552, 570, 574, 646, 1.4, 1),
    part('trigger', 598, 616, 576, 612, 0.8, 1),
    part('pistol_grip', 718, 790, 570, 842, 4.4, 0, lean=40),
    part('magazine', 453, 520, 560, 836, 3.2, 0, lean=-72, group='magazine'),
    part('stock_front', 903, 1000, 437, 562, 5.6, 0),
    part('stock_mid', 1000, 1120, 437, 600, 5.6, 0),
    part('stock_rear', 1120, 1250, 437, 652, 5.6, 0),
    part('butt_plate', 1248, 1278, 437, 652, 6.0, 0),
    part('charging_handle', 255, 290, 378, 402, 1.6, 2, xoff=-5.4, group='charging_handle'),
]
# group pivots (side-view coordinates): the magazine swings about the top of its well; the
# charging handle slides back along the cocking tube on an empty reload
PIVOTS = {'magazine': (487, 560), 'charging_handle': (272, 390)}

to_z = lambda x: (x - OX) / U
to_y = lambda y: (OY - y) / U
POINTS = {
    'muzzle': (0, to_y(460), to_z(55)),
    'sight': (0, to_y(361), to_z(748)),             # the rear drum's aperture, just over the front post
    'eye': (0, to_y(361), to_z(1010)),              # cheek on the stock, eye a hand's width behind the drum
    'hand_left': (-2.0, to_y(512), to_z(300)),      # under the handguard
}


def build():
    cubes = []
    for b in PARTS:
        x0, y0, x1, y1 = b['img']
        z0, z1 = sorted((to_z(x0), to_z(x1 + b['lean'])))
        ya, yb = sorted((to_y(y0), to_y(y1)))
        h = b['half']
        c = {**b, 'from': [b['xoff'] - h, ya, z0], 'to': [b['xoff'] + h, yb, z1]}
        if b['lean']:
            # a slanted part is drawn as a box turned about its top; sample it along its lean
            import math
            ang = math.degrees(math.atan2(b['lean'], y1 - y0))
            c['to'][2] = to_z(x1); c['from'][2] = to_z(x0)
            c['rot'] = -ang; c['origin'] = [0, to_y(y0), to_z((x0 + x1) / 2)]
            c['quad'] = [(x0, y0), (x0 + b['lean'], y1), (x1 + b['lean'], y1), (x1, y0)]
        cubes.append(c)
    faces = []
    for c in cubes:
        w, hgt, d = (max(1, round(t - f)) for f, t in zip(c['from'], c['to']))
        q = c.get('quad')
        faces += [
            (c, 'west', d, hgt, lambda w_, h_, c=c, q=q: sample(c['img'], w_, h_, quad=q)),
            (c, 'east', d, hgt, lambda w_, h_, c=c, q=q: sample(c['img'], w_, h_, mirror=True, quad=q)),
            (c, 'north', w, hgt, lambda w_, h_, c=c: flat('Gun metal', c['shade'], w_, h_, len(c['name']))),
            (c, 'south', w, hgt, lambda w_, h_, c=c: flat('Gun metal', c['shade'], w_, h_, len(c['name']) + 2)),
            (c, 'up', w, d, lambda w_, h_, c=c: flat('Gun metal', min(4, c['shade'] + 1), w_, h_, len(c['name']) + 3)),
            (c, 'down', w, d, lambda w_, h_, c=c: flat('Gun metal', max(0, c['shade'] - 1), w_, h_, len(c['name']) + 4)),
        ]
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
    return cubes, tex


def write():
    cubes, tex = build()
    rnd = random.Random(5)
    uid = lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
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
    for g, (px, py) in PIVOTS.items():
        outliner.append(group(g, [0, to_y(py), to_z(px)], [e['uuid'] for e, c in zip(elements, cubes) if c['group'] == g]))
    outliner += [group(n, p, []) for n, p in POINTS.items()]
    buf = io.BytesIO(); tex.save(buf, 'PNG')
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'mp5', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': tex.width, 'height': tex.height}, 'elements': elements, 'outliner': outliner,
               'textures': [{'path': '', 'name': 'mp5.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
                             'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
                             'width': tex.width, 'height': tex.height, 'uv_width': tex.width, 'uv_height': tex.height,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'mp5.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    tex.save(os.path.join(ROOT, 'assets', 'sources', 'mp5.png'))
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'weapons', 'mp5.glb'), units_per_m=UNITS)
    size = [round((max(c['to'][i] for c in cubes) - min(c['from'][i] for c in cubes)) / UNITS, 3) for i in range(3)]
    print(f'mp5: {bbmodel.triangles(project)} triangles, {size} m, texture {tex.width} x {tex.height}')


if __name__ == '__main__':
    write()
