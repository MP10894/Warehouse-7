"""Draft Mk14 EBR for Blockbench, built from the side view (top left) of the OpenArt sheet
assets/sources/reference/mk14ebr_views.png. The sheet's front and back views came out wrong,
so widths follow the real rifle and the front, back, top and bottom faces are plain
palette colours; the sides are sampled from the side view.

Writes assets/sources/mk14ebr.bbmodel (open in Blockbench) and
assets/weapons/mk14ebr.glb (what the game loads).

Weapons use a finer scale than the world (ART_SPEC.md section 5):
1 Blockbench unit = 1 texture pixel = 1/256 m.

    python3 tools/make_mk14.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'mk14ebr_views.png')
UNITS = 256           # Blockbench units per metre for weapons
LENGTH_M = 0.93       # muzzle device to butt pad, stock collapsed (the real rifle: 0.89 to 0.98 m)

ref = Image.open(REF).convert('RGB')
S = ref.width / 2000  # the measurements below were taken on a 2000 px wide copy
SIDE_X0, SIDE_X1 = 58, 1638                    # muzzle to butt pad, side view (2000-wide coordinates)
U = (SIDE_X1 - SIDE_X0) / (LENGTH_M * UNITS)   # reference pixels per Blockbench unit
OX, OY = 1250, 420                             # top of the pistol grip (weapon origin) on the side view

# a black rifle: greys and blacks, plus the yellow of the scope turret's dot
USE = ('Gun metal', 'Concrete', 'Yellow', 'Extras')
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]
NAMED = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}

clean = ref


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
    part('muzzle_device', 58, 218, 315, 362, 4.6, 1),
    part('front_sight', 218, 245, 288, 368, 1.5, 1),
    part('barrel', 245, 555, 323, 340, 2.8, 1),
    part('barrel_collar', 415, 505, 318, 345, 3.6, 1),
    part('gas_tube', 385, 555, 355, 370, 2.0, 1),
    part('handguard', 553, 940, 298, 410, 7.7, 0),
    part('receiver', 935, 1245, 290, 415, 7.2, 1),
    part('chassis_rear', 1225, 1320, 350, 410, 6.4, 0),
    part('scope_bell', 775, 895, 212, 278, 5.0, 0),
    part('scope_tube', 895, 1140, 225, 265, 3.0, 0),
    part('scope_eyepiece', 1140, 1245, 212, 272, 4.5, 0),
    part('scope_turret', 1005, 1050, 188, 250, 3.0, 1),
    part('ring_front', 940, 965, 220, 292, 3.5, 1),
    part('ring_rear', 1083, 1108, 220, 292, 3.5, 1),
    part('op_rod_handle', 1135, 1170, 290, 312, 1.5, 2, xoff=8.6, group='charging_handle'),
    part('magazine', 960, 1075, 410, 550, 3.6, 0, group='magazine'),
    part('trigger_guard', 1135, 1215, 410, 460, 1.2, 1),
    part('pistol_grip', 1230, 1290, 410, 570, 4.0, 0, lean=55),
    part('buffer_tube', 1320, 1480, 368, 392, 3.5, 1),
    part('stock_body', 1460, 1595, 360, 520, 5.0, 0),
    part('butt_pad', 1595, 1638, 355, 540, 5.5, 0),
    part('cheek_riser', 1385, 1600, 305, 332, 4.0, 0),
    part('riser_post', 1555, 1595, 325, 362, 2.0, 1),
    part('bipod_mount', 580, 660, 405, 430, 3.5, 1),
    part('bipod_legs', 340, 660, 415, 460, 3.0, 0),
]
# group pivots (side-view coordinates): the magazine rocks about its front lug, like the
# M14's real one; the operating rod handle slides back on an empty reload
PIVOTS = {'magazine': (960, 412), 'charging_handle': (1150, 300)}

to_z = lambda x: (x - OX) / U
to_y = lambda y: (OY - y) / U
POINTS = {
    'muzzle': (0, to_y(338), to_z(56)),
    'sight': (0, to_y(242), to_z(1245)),            # the scope's eyepiece, on its axis
    'eye': (0, to_y(242), to_z(1340)),              # cheek on the riser, eye behind the scope
    'hand_left': (-2.0, to_y(395), to_z(760)),      # under the handguard, in front of the bipod mount
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
    rnd = random.Random(14)
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
               'name': 'mk14ebr', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': tex.width, 'height': tex.height}, 'elements': elements, 'outliner': outliner,
               'textures': [{'path': '', 'name': 'mk14ebr.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
                             'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
                             'width': tex.width, 'height': tex.height, 'uv_width': tex.width, 'uv_height': tex.height,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'mk14ebr.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    tex.save(os.path.join(ROOT, 'assets', 'sources', 'mk14ebr.png'))
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'weapons', 'mk14ebr.glb'), units_per_m=UNITS)
    size = [round((max(c['to'][i] for c in cubes) - min(c['from'][i] for c in cubes)) / UNITS, 3) for i in range(3)]
    print(f'mk14ebr: {bbmodel.triangles(project)} triangles, {size} m, texture {tex.width} x {tex.height}')


if __name__ == '__main__':
    write()
