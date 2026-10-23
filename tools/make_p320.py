"""Draft Sig P320 for Blockbench, built from the reference sheet
assets/sources/reference/sig_p320_views.png (side, front and back views, same scale).

Writes assets/sources/sig_p320.bbmodel (open in Blockbench) and
assets/weapons/sig_p320.glb (what the game loads).

Weapons use a finer scale than the world (ART_SPEC.md section 5):
1 Blockbench unit = 1 texture pixel = 1/256 m.

    python3 tools/make_p320.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'sig_p320_views.png')
UNITS = 256           # Blockbench units per metre for weapons
LENGTH_M = 0.20       # overall length of a full-size P320 (about 203 mm)

ref = Image.open(REF).convert('RGB')
S = ref.width / 2000  # the measurements below were taken on a 2000 px wide copy
SIDE_X0, SIDE_X1 = 142 / S, 1691 / S          # muzzle to back of the slide, side view
U = (SIDE_X1 - SIDE_X0) / (LENGTH_M * UNITS)   # reference pixels per Blockbench unit
OX, OY = 1000, 700                             # the grip (weapon origin) on the side view
FRONT_CX, BACK_CX = 1413, 1765                 # centre lines of the front and back views

# a pistol is greys and blacks (plus the coloured sight dots), so only those ramps are used
USE = ('Gun metal', 'Concrete', 'Red', 'Yellow', 'Extras')
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]
NAMED = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}

# Hide the made-up lettering on the slide before sampling colours from the reference.
clean = ref.copy()
patch = clean.crop((int(560 * S), int(232 * S), int(700 * S), int(240 * S))).resize((int(240 * S), int(52 * S)))
clean.paste(patch, (int(205 * S), int(240 * S)))


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


# Boxes measured on the side view: (name, z from/to as side-view x, y from/to as side-view y,
# half-width in Blockbench units, top/bottom colour ramp). Rotation is about the grip origin.
GRIP_LEAN = 60                                   # the grip's bottom sits 60 px behind its top
GRIP_DEG = 7.5                                   # = atan(60 / 455)


def side_box(name, x0, x1, y0, y1, half, ramp, shade, group=None, rot=None, origin=None, xoff=0.0, lean=0):
    # lean: how far (reference pixels) the bottom of a slanted part sits behind its top
    quad = [(x0, y0), (x0 + lean, y1), (x1 + lean, y1), (x1, y0)] if lean else None
    return {'name': name, 'img': (x0, y0, x1, y1), 'half': half, 'ramp': ramp, 'shade': shade,
            'group': group, 'rot': rot, 'origin': origin, 'xoff': xoff, 'quad': quad}

BOXES = [
    side_box('slide_body', 125, 1140, 205, 350, 4.0, 'Gun metal', 2),
    side_box('dust_cover', 150, 470, 350, 445, 3.5, 'Gun metal', 1),
    side_box('frame', 470, 1180, 350, 470, 3.5, 'Gun metal', 1),
    side_box('guard_front', 480, 525, 470, 625, 2.0, 'Gun metal', 1),
    side_box('guard_bottom', 480, 830, 595, 635, 2.0, 'Gun metal', 1),
    side_box('trigger', 640, 700, 480, 590, 1.0, 'Gun metal', 1),
    side_box('grip', 812, 1122, 470, 925, 3.6, 'Gun metal', 1, rot=-GRIP_DEG, lean=GRIP_LEAN),
    side_box('base_plate', 800, 1080, 925, 980, 4.0, 'Gun metal', 3, rot=-GRIP_DEG),
    # the magazine inside the grip: hidden until it slides out on a reload
    side_box('mag_body', 850, 1085, 500, 925, 3.0, 'Gun metal', 1, rot=-GRIP_DEG, lean=GRIP_LEAN),
    side_box('front_sight', 150, 205, 172, 205, 1.0, 'Gun metal', 1),
    side_box('rear_sight_L', 985, 1075, 168, 205, 1.3, 'Gun metal', 1, xoff=-2.4),
    side_box('rear_sight_R', 985, 1075, 168, 205, 1.3, 'Gun metal', 1, xoff=2.4),
    side_box('takedown_lever', 550, 720, 355, 410, 0.5, 'Gun metal', 3, xoff=-4.0),
    side_box('slide_catch', 815, 905, 355, 400, 0.5, 'Gun metal', 3, xoff=-4.0),
]
GRIP_PIVOT = (967, 470)  # the grip and magazine lean back around the middle of the grip's top
# parts the game moves on its own (reload): the magazine slides out of the grip; the slide
# locks back when the pistol is empty and snaps forward when it is reloaded
GROUPS = {'magazine': ('base_plate', 'mag_body'), 'slide': ('slide_body', 'front_sight', 'rear_sight_L', 'rear_sight_R')}

# points (Blockbench units from the origin): where bullets start, where the eye looks
# through, where the left hand goes
to_z = lambda x: (x - OX) / U
to_y = lambda y: (OY - y) / U
POINTS = {
    'muzzle': (0, to_y(282), to_z(115)),
    'sight': (0, to_y(170), to_z(1030)),
    'hand_left': (-5.0, to_y(760), to_z(990)),
}


def build():
    cubes = []
    for b in BOXES:
        x0, y0, x1, y1 = b['img']
        z0, z1 = sorted((to_z(x0), to_z(x1)))
        ya, yb = sorted((to_y(y0), to_y(y1)))
        h = b['half']
        cubes.append({**b, 'from': [b['xoff'] - h, ya, z0], 'to': [b['xoff'] + h, yb, z1]})

    # texture: every face gets its own patch; sides come from the side view, front and back
    # from the front and back views, top and bottom are plain palette colour
    faces = []
    for c in cubes:
        (fx, fy, fz), (tx, ty, tz) = c['from'], c['to']
        w, hgt, d = (max(1, round(t - f)) for f, t in zip(c['from'], c['to']))
        x0, y0, x1, y1 = c['img']
        fr = (FRONT_CX - tx * U, y0, FRONT_CX - fx * U, y1)
        bk = (BACK_CX + fx * U, y0, BACK_CX + tx * U, y1)
        faces += [
            (c, 'west', d, hgt, lambda w_, h_, c=c: sample(c['img'], w_, h_, quad=c['quad'])),
            (c, 'east', d, hgt, lambda w_, h_, c=c: sample(c['img'], w_, h_, mirror=True, quad=c['quad'])),
            (c, 'north', w, hgt, lambda w_, h_, fr=fr: sample(fr, w_, h_)),
            (c, 'south', w, hgt, lambda w_, h_, bk=bk: sample(bk, w_, h_)),
            (c, 'up', w, d, lambda w_, h_, c=c: flat(c['ramp'], c['shade'], w_, h_, len(c['name']))),
            (c, 'down', w, d, lambda w_, h_, c=c: flat(c['ramp'], max(0, c['shade'] - 1), w_, h_, len(c['name']) + 1)),
        ]
    W = 128
    x = y = row = 0
    slots = []
    for c, f, w, h, fn in sorted(faces, key=lambda t: -t[3]):
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
    # a red dot on the front sight and white dots on the rear sight, as on the reference
    return cubes, tex


def write():
    cubes, tex = build()
    rnd = random.Random(320)
    uid = lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
    r3 = lambda v: [round(a, 3) for a in v]
    gpy, gpz = to_y(GRIP_PIVOT[1]), to_z(GRIP_PIVOT[0])
    elements = []
    for c in cubes:
        e = {'name': c['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
             'from': r3(c['from']), 'to': r3(c['to']), 'autouv': 0, 'color': 1,
             'origin': r3([0, gpy, gpz] if c['rot'] else [0, 0, 0]), 'faces': c['faces']}
        if c['rot']:
            e['rotation'] = [c['rot'], 0, 0]
        elements.append(e)
    group = lambda name, origin, kids: {'name': name, 'origin': r3(origin), 'color': 0, 'uuid': uid(), 'export': True,
                                        'isOpen': True, 'locked': False, 'visibility': True, 'autouv': 0, 'children': kids}
    grouped = {part: g for g, parts in GROUPS.items() for part in parts}
    outliner = [e['uuid'] for e in elements if e['name'] not in grouped]
    pivots = {'magazine': [0, gpy, gpz], 'slide': [0, to_y(205), to_z(1140)]}
    for g, parts in GROUPS.items():
        outliner.append(group(g, pivots[g], [e['uuid'] for e in elements if e['name'] in parts]))
    outliner += [group(n, p, []) for n, p in POINTS.items()]
    buf = io.BytesIO(); tex.save(buf, 'PNG')
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'sig_p320', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': tex.width, 'height': tex.height}, 'elements': elements, 'outliner': outliner,
               'textures': [{'path': '', 'name': 'sig_p320.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
                             'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
                             'width': tex.width, 'height': tex.height, 'uv_width': tex.width, 'uv_height': tex.height,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'sig_p320.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    tex.save(os.path.join(ROOT, 'assets', 'sources', 'sig_p320.png'))
    os.makedirs(os.path.join(ROOT, 'assets', 'weapons'), exist_ok=True)
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'weapons', 'sig_p320.glb'), units_per_m=UNITS)
    size = [round((max(c['to'][i] for c in cubes) - min(c['from'][i] for c in cubes)) / UNITS, 3) for i in range(3)]
    print(f'sig_p320: {bbmodel.triangles(project)} triangles, {size} m, texture {tex.width} x {tex.height}')


if __name__ == '__main__':
    write()
