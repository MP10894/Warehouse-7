"""The automatic turret: an M134 minigun on a tripod, for Blockbench, from the OpenArt sheet
assets/sources/reference/turret_views.png (side, front and back views). The sheet's front view
drew four barrels; the model has the real six. The ammunition box hangs on the gun's right, as
in the back view.

Moving parts (src/render/models.js → turretModel): `head` turns left and right (pivot on the
post), `gun` inside it tips up and down (pivot on the trunnion), `barrels` inside that spins
round the barrel axis while firing. The tripod stays still. The gun points −z (north), like
the characters.

Colours are flat palette colours matched to the sheet (dark gun metal, olive tripod and ammo
box, grey clamps and fittings), lightly shaded so the boxes read.

Writes assets/sources/turret.bbmodel and assets/items/turret.glb.
Items: 1 Blockbench unit = 1 texture pixel = 1/32 m.

    python3 tools/make_turret.py
"""
import base64, io, json, math, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
PX = 32
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'turret_views.png')
ref = Image.open(REF).convert('RGB')
K = ref.width / 2000
rnd = random.Random(11)

USE = ('Army green', 'Khaki cloth', 'Gun metal', 'Concrete', 'Yellow', 'Wood')
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]


def nearest(c):
    return min(PAL, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)


C = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}
# the sheet's colours, matched by eye to the palette (sampling it picked up background grey)
OLIVE = C['Army green'][3]       # tripod legs, yoke
OLIVE_DARK = C['Army green'][2]  # hub collar
BOX = C['Khaki cloth'][2]        # ammunition box
BLACK = C['Gun metal'][1]        # barrels, chute, post
METAL = C['Gun metal'][2]        # gun body
GREY = C['Gun metal'][3]         # clamps, fittings
FEET = C['Army green'][1]


def shade(c, k):
    return nearest(tuple(max(0, min(255, int(v * k))) for v in c))


# ---- parts, in metres. box(name, from, to, colour, rotation=None, origin=None)
def box(name, lo, hi, col, rot=None, origin=None):
    return {'name': name, 'from': lo, 'to': hi, 'col': col, 'rot': rot, 'origin': origin}


def leg(i, ang):
    # a leg from the hub (radius 0.06 m, 0.64 m up) down to its foot (radius 0.38 m, on the ground)
    top_r, top_y, foot_r = 0.07, 0.64, 0.38
    L = math.hypot(foot_r - top_r, top_y - 0.03)
    tilt = math.degrees(math.atan2(foot_r - top_r, top_y - 0.03))
    mz, my = -(foot_r + top_r) / 2, (top_y + 0.03) / 2
    return (f'leg_{i}', [0, 0, 0], [
        box(f'leg_{i}_strut', [-0.028, my - L / 2, mz - 0.028], [0.028, my + L / 2, mz + 0.028], OLIVE, rot=[tilt, 0, 0], origin=[0, my, mz]),
        box(f'leg_{i}_foot', [-0.05, 0.0, -foot_r - 0.06], [0.05, 0.03, -foot_r + 0.04], FEET),
    ], [0, ang, 0])


barrels = []
for k in range(6):
    a = k * math.pi / 3
    cx, cy = math.cos(a) * 0.042, 1.07 + math.sin(a) * 0.042
    barrels.append(box(f'barrel_{k}', [cx - 0.012, cy - 0.012, -0.64], [cx + 0.012, cy + 0.012, -0.12], BLACK))

TREE = ('turret', [0, 0, 0], [
    *[leg(i, a) for i, a in enumerate((0, 120, 240))],
    box('hub', [-0.09, 0.60, -0.09], [0.09, 0.71, 0.09], OLIVE_DARK),
    box('post', [-0.05, 0.70, -0.05], [0.05, 0.84, 0.05], BLACK),
    ('head', [0, 0.84, 0], [
        box('yoke_base', [-0.14, 0.83, -0.09], [0.14, 0.88, 0.09], OLIVE),
        box('yoke_R', [0.11, 0.87, -0.07], [0.15, 1.08, 0.07], OLIVE),
        box('yoke_L', [-0.15, 0.87, -0.07], [-0.11, 1.08, 0.07], OLIVE),
        box('ammo_box', [0.17, 0.50, -0.13], [0.31, 0.80, 0.13], BOX),
        box('ammo_handle', [0.22, 0.80, -0.04], [0.26, 0.83, 0.04], GREY),
        box('feed_chute_up', [0.21, 0.80, 0.08], [0.25, 1.06, 0.12], BLACK),
        box('feed_chute_in', [0.08, 1.02, 0.07], [0.23, 1.06, 0.13], BLACK),
        ('gun', [0, 1.02, 0], [
            box('housing', [-0.08, 0.96, -0.12], [0.08, 1.20, 0.13], METAL),
            box('rear_plate', [-0.09, 0.97, 0.12], [0.09, 1.19, 0.15], shade(METAL, 0.8)),
            box('motor', [0.06, 1.13, -0.05], [0.12, 1.20, 0.08], GREY),
            box('sight_rail', [-0.035, 1.20, -0.20], [0.035, 1.23, 0.02], METAL),
            box('red_dot', [-0.04, 1.23, -0.17], [0.04, 1.33, -0.06], BLACK),
            box('grip_bar', [-0.21, 1.06, 0.16], [0.21, 1.10, 0.20], GREY),
            box('grip_R', [0.17, 0.99, 0.15], [0.21, 1.17, 0.23], METAL),
            box('grip_L', [-0.21, 0.99, 0.15], [-0.17, 1.17, 0.23], METAL),
            ('barrels', [0, 1.07, 0], [
                *barrels,
                box('clamp_front', [-0.07, 1.00, -0.66], [0.07, 1.14, -0.58], GREY),
                box('clamp_mid', [-0.06, 1.01, -0.40], [0.06, 1.13, -0.37], GREY),
                box('clamp_rear', [-0.07, 1.00, -0.15], [0.07, 1.14, -0.11], shade(GREY, 0.8)),
            ]),
        ]),
    ]),
])

FACES = ['north', 'south', 'east', 'west', 'up', 'down']
LIGHT = {'up': 1.15, 'north': 1.0, 'south': 0.9, 'east': 0.95, 'west': 0.95, 'down': 0.7}


def write():
    cubes = []
    def collect(n):
        if isinstance(n, dict): cubes.append(n)
        else:
            for c in n[2]: collect(c)
    collect(TREE)
    W, x, y, row, slots, sizes = 64, 0, 0, 0, [], []
    for c in cubes:
        w, h, d = (max(1, round((c['to'][i] - c['from'][i]) * PX)) for i in range(3))
        for f in FACES:
            fw, fh = {'north': (w, h), 'south': (w, h), 'east': (d, h), 'west': (d, h), 'up': (w, d), 'down': (w, d)}[f]
            sizes.append((c, f, fw, fh))
    for c, f, fw, fh in sorted(sizes, key=lambda t: -t[3]):
        if x + fw > W:
            x, y, row = 0, y + row, 0
        slots.append((c, f, x, y, fw, fh)); x += fw; row = max(row, fh)
    H = 8
    while H < y + row:
        H *= 2
    img = Image.new('RGB', (W, H), BLACK)
    for c, f, x0, y0, fw, fh in slots:
        base = shade(c['col'], LIGHT[f])
        for j in range(fh):
            for i in range(fw):
                img.putpixel((x0 + i, y0 + j), shade(base, 0.85) if rnd.random() < 0.08 else base)
        c.setdefault('faces', {})[f] = {'uv': [x0, y0, x0 + fw, y0 + fh], 'texture': 0}
    buf = io.BytesIO(); img.save(buf, 'PNG')

    U = lambda v: [round(a * PX, 3) for a in v]
    uid = lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
    elements = []
    def outline(n, parent_origin):
        if isinstance(n, dict):
            e = {'name': n['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
                 'from': U(n['from']), 'to': U(n['to']), 'autouv': 0, 'color': 0,
                 'origin': U(n['origin'] or parent_origin), 'faces': n['faces']}
            if n['rot']: e['rotation'] = n['rot']
            elements.append(e)
            return e['uuid']
        name, origin, kids = n[0], n[1], n[2]
        g = {'name': name, 'origin': U(origin), 'color': 0, 'uuid': uid(), 'export': True, 'isOpen': True,
             'locked': False, 'visibility': True, 'autouv': 0, 'children': [outline(k, origin) for k in kids]}
        if len(n) > 3: g['rotation'] = n[3]
        return g
    tree = outline(TREE, [0, 0, 0])
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'turret', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': W, 'height': H}, 'elements': elements, 'outliner': [tree],
               'textures': [{'path': '', 'name': 'turret.png', 'folder': '', 'namespace': '', 'id': '0',
                             'particle': False, 'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False,
                             'uuid': uid(), 'width': W, 'height': H, 'uv_width': W, 'uv_height': H,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'turret.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'items', 'turret.glb'))
    print('turret:', len(cubes), 'boxes,', bbmodel.triangles(project), 'triangles, texture', W, 'x', H)


if __name__ == '__main__':
    write()
