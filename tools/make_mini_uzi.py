"""Draft Mini Uzi for Blockbench, built from the side view of the OpenArt sheet
assets/sources/reference/mini_uzi_views.png. The sheet drew a wire stock (unfolded); as asked,
it is left out, so the gun ends at the back of the receiver. The magazine goes up through the
pistol grip: the model's magazine runs all the way up inside the grip (hidden there), so it can
slide out of the grip on a reload like the pistol's.

Writes assets/sources/mini_uzi.bbmodel (open in Blockbench) and assets/weapons/mini_uzi.glb.

Weapons use a finer scale than the world (ART_SPEC.md section 5):
1 Blockbench unit = 1 texture pixel = 1/256 m.

    python3 tools/make_mini_uzi.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'mini_uzi_views.png')
UNITS = 256           # Blockbench units per metre for weapons
LENGTH_M = 0.36       # muzzle to the back of the receiver (the real Mini Uzi, stock folded: 0.36 m)

ref = Image.open(REF).convert('RGB')
S = ref.width / 2000  # the measurements below were taken on a 2000 px wide copy
SIDE_X0, SIDE_X1 = 50, 955                     # muzzle to the back of the receiver (2000-wide coordinates)
U = (SIDE_X1 - SIDE_X0) / (LENGTH_M * UNITS)   # reference pixels per Blockbench unit
OX, OY = 650, 470                              # top of the pistol grip (weapon origin)

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
def part(name, x0, x1, y0, y1, half=None, shade=2, xoff=0.0, lean=0, group=None, round_=False, pal=None, tex=None):
    if pal is None:
        pal = STEEL
    return {'name': name, 'img': (x0, y0, x1, y1), 'half': half, 'shade': shade, 'xoff': xoff, 'lean': lean,
            'group': group, 'round': round_, 'pal': pal, 'tex': tex}


def rnd(name, x0, x1, y0, y1, group=None, shade=2, pal=None):
    return part(name, x0, x1, y0, y1, group=group, shade=shade, round_=True, pal=pal)


SY = 318                           # line of sight: between the rear sight's ears to the front post's tip
UZI = {
    'name': 'mini_uzi', 'out': ('weapons', 'mini_uzi.glb'),
    'x0': SIDE_X0, 'x1': SIDE_X1, 'length': LENGTH_M, 'origin': (OX, OY), 'axis': 423,
    'parts': [
        part('barrel', 50, 168, 402, 445, half=2.2),
        part('barrel_nut', 165, 224, 385, 462, half=3.0),
        part('front_post', 262, 275, SY, 378, half=0.5),
        part('front_ear_left', 240, 296, 300, 378, half=0.5, xoff=-1.7),
        part('front_ear_right', 240, 296, 300, 378, half=0.5, xoff=1.7),
        part('front_body', 222, 362, 378, 498, half=4.6),
        part('receiver', 360, 902, 335, 450, half=5.0),
        part('cocking_knob', 395, 440, 300, 337, half=2.2, group='charging_handle'),
        part('lower_front', 362, 478, 450, 498, half=4.6),
        part('receiver_back', 900, 955, 377, 505, half=4.8),
        part('back_lower', 720, 902, 445, 515, half=4.6),
        part('rear_sight_base', 822, 915, 330, 347, half=2.4),
        part('rear_ear_left', 850, 882, 288, 332, half=0.5, xoff=-1.7),
        part('rear_ear_right', 850, 882, 288, 332, half=0.5, xoff=1.7),
        part('trigger_guard', 478, 588, 560, 573, half=1.3),
        part('guard_front', 478, 490, 450, 573, half=1.3),
        part('trigger', 520, 536, 505, 545, half=0.7),
        part('grip_top', 478, 718, 450, 486, half=4.0),
        part('pistol_grip', 585, 710, 484, 700, half=3.2),
        # the magazine runs up inside the grip (hidden there) so it can slide out on a reload
        part('magazine', 592, 672, 488, 838, half=2.6, group='magazine', tex=(592, 700, 672, 838)),
    ],
    'points': {
        'muzzle': (49, 423),
        'sight': (866, SY),            # between the rear sight's ears, lined up with the front post
        'eye': (1167, SY),             # a hand's width behind the rear sight
        'hand_left': (330, 500, -2.0), # under the front of the receiver
    },
    'pivots': {'magazine': (632, 488), 'charging_handle': (417, 318)},
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
        c = {**b, 'from': [b['xoff'] - h, ya, z0], 'to': [b['xoff'] + h, yb, z1], 'col': median_colour(b['tex'] or b['img'], b['pal'])}
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
        side = lambda w_, h_, c=c, q=q: sample(c['tex'] or c['img'], w_, h_, quad=None if c['tex'] else q, pal=c['pal'])
        mirror = lambda w_, h_, c=c, q=q: sample(c['tex'] or c['img'], w_, h_, mirror=True, quad=None if c['tex'] else q, pal=c['pal'])
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

    rg = random.Random(13)
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
    make(UZI)
