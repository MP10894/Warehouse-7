"""Draft M4A1 carbine for Blockbench, built from the lower right side view of the OpenArt sheet
assets/sources/reference/m4a1_views.png (left side, muzzle pointing left). The sheet drew three
side views instead of side, front and back, and a flat-top with a railed handguard and a
flip-up rear sight instead of a carry handle; the model follows the sheet. Widths follow the real
carbine; the front, back, top and bottom faces are plain palette colours and the sides are
sampled from the side view.

Writes assets/sources/m4a1.bbmodel (open in Blockbench) and
assets/weapons/m4a1.glb (what the game loads).

Weapons use a finer scale than the world (ART_SPEC.md section 5):
1 Blockbench unit = 1 texture pixel = 1/256 m.

    python3 tools/make_m4a1.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'm4a1_views.png')
UNITS = 256           # Blockbench units per metre for weapons
LENGTH_M = 0.80       # flash hider to butt pad, stock half out (the real M4A1: 0.76 to 0.84 m)

ref = Image.open(REF).convert('RGB')
S = ref.width / 2000  # the measurements below were taken on a 2000 px wide copy
SIDE_X0, SIDE_X1 = 823, 1975                   # flash hider to butt pad, side view (2000-wide coordinates)
U = (SIDE_X1 - SIDE_X0) / (LENGTH_M * UNITS)   # reference pixels per Blockbench unit
OX, OY = 1620, 878                             # top of the pistol grip (weapon origin) on the side view

# a black carbine with the sheet's tan barrel and rail inserts
USE = ('Gun metal', 'Concrete', 'Sand', 'Extras')
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
    part('flash_hider', 823, 915, 776, 818, 2.3, 1),
    part('barrel', 915, 1050, 784, 810, 1.6, 2),
    # front sight: the A-frame tower with two ears round the post, a brace down to the gas block
    part('front_post', 1059, 1071, 706, 760, 0.5, 2),
    part('front_ear_left', 1052, 1078, 693, 735, 0.5, 1, xoff=-1.7),
    part('front_ear_right', 1052, 1078, 693, 735, 0.5, 1, xoff=1.7),
    part('front_tower', 1052, 1078, 735, 790, 2.2, 1),
    part('front_brace', 1076, 1090, 702, 752, 1.0, 1, lean=34),
    part('gas_block', 1048, 1122, 752, 814, 2.4, 1),
    part('bayonet_lug', 1048, 1072, 812, 832, 1.2, 1),
    part('handguard', 1122, 1345, 752, 843, 6.4, 0),
    part('rail_top', 1122, 1345, 744, 752, 2.6, 1),
    part('rail_bottom', 1128, 1335, 843, 851, 2.6, 1),
    part('delta_ring', 1340, 1376, 754, 840, 6.6, 2),
    part('upper_receiver', 1374, 1662, 745, 805, 3.6, 0),
    part('lower_receiver', 1500, 1655, 803, 878, 3.0, 0),
    part('mag_well', 1390, 1502, 803, 900, 3.4, 0),
    part('trigger_guard', 1500, 1580, 905, 916, 1.4, 1),
    part('trigger', 1545, 1559, 878, 906, 0.7, 1),
    part('pistol_grip', 1588, 1652, 878, 1035, 3.6, 0, lean=46),
    part('magazine', 1390, 1495, 900, 1088, 2.9, 0, lean=-18, group='magazine'),
    part('rear_sight_base', 1562, 1620, 730, 746, 2.2, 1),   # the flip-up aperture is built in extra() below
    part('charging_handle', 1640, 1676, 746, 768, 3.0, 1, group='charging_handle'),
    part('buffer_tube', 1660, 1722, 770, 830, 3.6, 1),
    part('stock_body', 1715, 1938, 760, 822, 5.6, 0),
    part('stock_lower', 1755, 1938, 822, 905, 5.0, 0),
    part('butt_pad', 1936, 1975, 755, 945, 6.0, 0),
]
# group pivots (side-view coordinates): the magazine tips forward about the front of its well;
# the charging handle slides back on an empty reload
PIVOTS = {'magazine': (1392, 900), 'charging_handle': (1658, 757)}

to_z = lambda x: (x - OX) / U
to_y = lambda y: (OY - y) / U
POINTS = {
    'muzzle': (0, to_y(797), to_z(821)),
    'sight': (0, to_y(706), to_z(1598)),            # the rear aperture, lined up with the front post's tip
    'eye': (0, to_y(706), to_z(1790)),              # cheek on the stock, eye a hand's width behind the aperture
    'hand_left': (-2.0, to_y(848), to_z(1230)),     # under the handguard
}


import math
SIGHT_Y = 706   # the line of sight on the side view: through the rear aperture to the post tip


def extra():
    """The flip-up rear sight's aperture: a square frame with a peep hole on the line of sight
    (a plain box would block the view when aiming)."""
    out = []
    yc = to_y(SIGHT_Y)
    z0, z1 = sorted((to_z(1585), to_z(1612)))
    top, bottom = to_y(692), to_y(730)
    W, h = 2.0, 3.0      # half width of the frame; size of the hole (shows the front ears round the post)
    out.append({'name': 'rear_aperture_left', 'from': [-W, bottom, z0], 'to': [-h / 2, top, z1], 'img': (1585, 684, 1612, 730)})
    out.append({'name': 'rear_aperture_right', 'from': [h / 2, bottom, z0], 'to': [W, top, z1], 'img': (1585, 684, 1612, 730)})
    out.append({'name': 'rear_aperture_top', 'from': [-h / 2, yc + h / 2, z0], 'to': [h / 2, top, z1], 'plain': 1})
    out.append({'name': 'rear_aperture_bottom', 'from': [-h / 2, bottom, z0], 'to': [h / 2, yc - h / 2, z1], 'plain': 1})
    for c in out:
        c.setdefault('shade', 1); c.setdefault('group', None); c.setdefault('lean', 0); c.setdefault('img', None)
    return out


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
    cubes += extra()
    faces = []
    for c in cubes:
        w, hgt, d = (max(1, round(t - f)) for f, t in zip(c['from'], c['to']))
        q = c.get('quad')
        faces += [
            (c, 'west', d, hgt, (lambda w_, h_, c=c: flat('Gun metal', c['shade'], w_, h_, len(c['name']) + 5)) if c.get('plain') or not c['img']
                else (lambda w_, h_, c=c, q=q: sample(c['img'], w_, h_, quad=q))),
            (c, 'east', d, hgt, (lambda w_, h_, c=c: flat('Gun metal', c['shade'], w_, h_, len(c['name']) + 6)) if c.get('plain') or not c['img']
                else (lambda w_, h_, c=c, q=q: sample(c['img'], w_, h_, mirror=True, quad=q))),
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
    rnd = random.Random(4)
    uid = lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
    r3 = lambda v: [round(a, 3) for a in v]
    elements = []
    for c in cubes:
        e = {'name': c['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
             'from': r3(c['from']), 'to': r3(c['to']), 'autouv': 0, 'color': 1,
             'origin': r3(c.get('origin', [0, 0, 0])), 'faces': c['faces']}
        if c.get('rot'):
            e['rotation'] = [round(c['rot'], 2), 0, 0]
        elif c.get('rotv') and any(c['rotv']):
            e['rotation'] = [round(v, 2) for v in c['rotv']]
        elements.append(e)
    group = lambda name, origin, kids: {'name': name, 'origin': r3(origin), 'color': 0, 'uuid': uid(), 'export': True,
                                        'isOpen': True, 'locked': False, 'visibility': True, 'autouv': 0, 'children': kids}
    outliner = [e['uuid'] for e, c in zip(elements, cubes) if not c['group']]
    for g, (px, py) in PIVOTS.items():
        outliner.append(group(g, [0, to_y(py), to_z(px)], [e['uuid'] for e, c in zip(elements, cubes) if c['group'] == g]))
    outliner += [group(n, p, []) for n, p in POINTS.items()]
    buf = io.BytesIO(); tex.save(buf, 'PNG')
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'm4a1', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': tex.width, 'height': tex.height}, 'elements': elements, 'outliner': outliner,
               'textures': [{'path': '', 'name': 'm4a1.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
                             'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
                             'width': tex.width, 'height': tex.height, 'uv_width': tex.width, 'uv_height': tex.height,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'm4a1.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    tex.save(os.path.join(ROOT, 'assets', 'sources', 'm4a1.png'))
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'weapons', 'm4a1.glb'), units_per_m=UNITS)
    size = [round((max(c['to'][i] for c in cubes) - min(c['from'][i] for c in cubes)) / UNITS, 3) for i in range(3)]
    print(f'm4a1: {bbmodel.triangles(project)} triangles, {size} m, texture {tex.width} x {tex.height}')


if __name__ == '__main__':
    write()
