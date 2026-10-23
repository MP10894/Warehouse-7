"""Draft art, made in code as a starting point for Martial to refine in Blockbench:
  - assets/blocks/wall.png                       (32 x 32, tileable, 1 m of wall)
  - assets/sources/enemy_insurgent.bbmodel       (open in Blockbench)
  - assets/characters/enemy_insurgent.glb        (what the game loads)
All colours come from the shared palette (tools/make_palette.py).

    python3 tools/make_first_art.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
PX = 32  # pixels (and Blockbench units) per metre
P = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}
rnd = random.Random(7)


def noisy(ramp, i, amount=0.14):
    """Shade i of a ramp, sometimes one step lighter or darker."""
    r = rnd.random()
    if r < amount / 2: i -= 1
    elif r < amount: i += 1
    return P[ramp][max(0, min(4, i))]


# ------------------------------------------------------------------ wall.png
def make_wall():
    img = Image.new('RGB', (32, 32))
    # plastered blockwork: 4 courses of 8 px, blocks 16 px long, offset every other course
    for y in range(32):
        for x in range(32):
            course = y // 8
            off = 8 if course % 2 else 0
            mortar = y % 8 == 7 or (x + off) % 16 == 15
            c = noisy('Plaster', 2 if mortar else 3, 0.22)
            if mortar:
                c = P['Plaster'][1] if rnd.random() < 0.7 else P['Plaster'][2]
            img.putpixel((x, y), c)
    # chips and stains (wrapping round the edges keeps it tileable)
    for _ in range(6):
        cx, cy = rnd.randrange(32), rnd.randrange(32)
        for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1)][:rnd.randint(2, 5)]:
            img.putpixel(((cx + dx) % 32, (cy + dy) % 32), P['Plaster'][1])
    for _ in range(3):
        x = rnd.randrange(32)
        for y in range(rnd.randint(3, 8)):
            img.putpixel((x, (28 + y) % 32), P['Sand'][1])
    os.makedirs(os.path.join(ROOT, 'assets', 'blocks'), exist_ok=True)
    img.save(os.path.join(ROOT, 'assets', 'blocks', 'wall.png'))


# ------------------------------------------------------------------ insurgent
# cubes in metres, front faces -Z. (name, parent group, from, to, painter)
def cube(name, frm, to, paint):
    return {'name': name, 'from': frm, 'to': to, 'paint': paint}

def mirror(c, name):
    (x0, y0, z0), (x1, y1, z1) = c['from'], c['to']
    return {**c, 'name': name, 'from': [-x1, y0, z0], 'to': [-x0, y1, z1]}

arm_up = cube('upper_arm_R', [0.19, 1.16, -0.05], [0.29, 1.48, 0.05], 'sleeve')
arm_lo = cube('forearm_R', [0.195, 0.90, -0.045], [0.285, 1.17, 0.045], 'cuff')
hand = cube('hand_R', [0.20, 0.82, -0.04], [0.28, 0.905, 0.04], 'hand')
leg_up = cube('thigh_R', [0.03, 0.50, -0.075], [0.17, 0.95, 0.075], 'trousers')
leg_lo = cube('shin_R', [0.04, 0.08, -0.065], [0.16, 0.51, 0.065], 'shin')
boot = cube('boot_R', [0.035, 0.0, -0.14], [0.165, 0.09, 0.07], 'boot')

TREE = ('body', [0, 0, 0], [
    cube('pelvis', [-0.17, 0.90, -0.10], [0.17, 1.06, 0.10], 'pelvis'),
    ('torso', [0, 1.04, 0], [
        cube('chest', [-0.19, 1.04, -0.11], [0.19, 1.52, 0.11], 'shirt'),
        ('vest', [0, 1.04, 0], [
            cube('vest_body', [-0.21, 1.13, -0.14], [0.21, 1.49, 0.14], 'vest'),
            cube('pouches', [-0.15, 1.15, -0.18], [0.15, 1.26, -0.14], 'pouches'),
        ]),
        ('head', [0, 1.52, 0], [
            cube('scarf', [-0.09, 1.50, -0.09], [0.09, 1.58, 0.09], 'scarf'),
            cube('face', [-0.10, 1.56, -0.11], [0.10, 1.76, 0.11], 'face'),
            cube('headwrap', [-0.115, 1.68, -0.125], [0.115, 1.79, 0.12], 'wrap'),
        ]),
        ('upper_arm_R', [0.24, 1.46, 0], [arm_up, ('lower_arm_R', [0.24, 1.16, 0], [arm_lo, hand])]),
        ('upper_arm_L', [-0.24, 1.46, 0], [mirror(arm_up, 'upper_arm_L_box'), ('lower_arm_L', [-0.24, 1.16, 0], [mirror(arm_lo, 'forearm_L'), mirror(hand, 'hand_L')])]),
        ('gun_mount', [0.15, 1.34, -0.30], []),
    ]),
    ('upper_leg_R', [0.10, 0.94, 0], [leg_up, ('lower_leg_R', [0.10, 0.50, 0], [leg_lo, boot])]),
    ('upper_leg_L', [-0.10, 0.94, 0], [mirror(leg_up, 'thigh_L'), ('lower_leg_L', [-0.10, 0.50, 0], [mirror(leg_lo, 'shin_L'), mirror(boot, 'boot_L')])]),
])
arm_up['name'] = 'upper_arm_R_box'

FACE_ORDER = ['north', 'south', 'east', 'west', 'up', 'down']

def face_size(c, face):
    w, h, d = (round((c['to'][i] - c['from'][i]) * PX) for i in range(3))
    w, h, d = max(1, w), max(1, h), max(1, d)
    return {'north': (w, h), 'south': (w, h), 'east': (d, h), 'west': (d, h), 'up': (w, d), 'down': (w, d)}[face]


def paint(img, x0, y0, w, h, kind, face):
    """Fill one face rectangle of the texture."""
    def px(x, y, c):
        if 0 <= x < w and 0 <= y < h:
            img.putpixel((x0 + x, y0 + y), c)
    base = {'pelvis': ('Khaki cloth', 1), 'shirt': ('Khaki cloth', 2), 'vest': ('Army green', 2), 'pouches': ('Army green', 1),
            'scarf': ('Khaki cloth', 4), 'face': ('Skin', 2), 'wrap': ('Sand', 2), 'sleeve': ('Khaki cloth', 2),
            'cuff': ('Khaki cloth', 2), 'hand': ('Skin', 2), 'trousers': ('Khaki cloth', 1), 'shin': ('Khaki cloth', 1),
            'boot': ('Wood', 0)}[kind]
    ramp, i = base
    shade = {'up': 1, 'down': -1}.get(face, 0)
    for y in range(h):
        for x in range(w):
            px(x, y, noisy(ramp, i + shade))
    side = face in ('north', 'south', 'east', 'west')
    if kind == 'pelvis' and side:
        for x in range(w):
            px(x, 0, P['Gun metal'][1]); px(x, 1, P['Gun metal'][1])
        if face == 'north':
            px(w // 2, 0, P['Yellow'][2]); px(w // 2 - 1, 0, P['Yellow'][2])
    if kind == 'shirt' and face == 'north':
        for k in range(3):
            px(w // 2 - 1 + k, 0, P['Skin'][2]); px(w // 2, k, P['Skin'][2])
    if kind == 'vest' and face in ('north', 'south'):
        for y in range(h):
            px(3, y, P['Army green'][1]); px(w - 4, y, P['Army green'][1])
    if kind == 'pouches' and side:
        for x in range(w):
            px(x, 0, P['Army green'][3])
        for x in range(0, w, max(3, w // 3)):
            for y in range(h):
                px(x, y, P['Army green'][0])
    if kind in ('scarf', 'wrap') and side:
        for x in range(w):
            if (x + (1 if kind == 'wrap' else 0)) % 3 == 0:
                for y in range(h):
                    if rnd.random() < 0.6:
                        px(x, y, P['Khaki cloth' if kind == 'scarf' else 'Sand'][3 if kind == 'scarf' else 1])
    if kind == 'face':
        if face == 'north':
            for y in range(h):
                for x in range(w):
                    px(x, y, noisy('Skin', 3, 0.08))
            ey = max(1, h // 2 - 1)
            for x in range(w):  # brow shadow under the head wrap
                px(x, 0, P['Skin'][1])
            px(w // 2 - 2, ey, P['Extras'][0]); px(w // 2 + 1, ey, P['Extras'][0])
            for x in range(1, w - 1):  # short beard along the jaw
                px(x, h - 1, P['Rust and oil'][1])
            px(w // 2 - 1, h - 2, P['Rust and oil'][1]); px(w // 2, h - 2, P['Rust and oil'][1])
        elif face in ('south', 'up'):
            for y in range(h):
                for x in range(w):
                    px(x, y, noisy('Sand', 2))
        elif face in ('east', 'west'):
            for y in range(h):
                for x in range(w):
                    if (face == 'east' and x < w // 2) or (face == 'west' and x >= w // 2):
                        px(x, y, noisy('Sand', 2))
    if kind == 'cuff' and side:
        for x in range(w):
            px(x, h - 1, P['Khaki cloth'][1])
    if kind == 'shin' and side:
        for x in range(w):
            px(x, 0, P['Khaki cloth'][0])
    if kind == 'boot':
        if side:
            for x in range(w):
                px(x, h - 1, P['Extras'][0])
        if face == 'up':
            for y in range(h):
                for x in range(w):
                    px(x, y, P['Wood'][1])


def make_insurgent():
    # 1. flatten the tree and pack every face into one texture
    cubes = []
    def collect(n):
        if isinstance(n, dict):
            cubes.append(n)
        else:
            for c in n[2]:
                collect(c)
    collect(TREE)
    W = 64
    x = y = row_h = 0
    slots = []
    for c in cubes:
        for f in FACE_ORDER:
            w, h = face_size(c, f)
            if x + w > W:
                x, y, row_h = 0, y + row_h, 0
            slots.append((c, f, x, y, w, h))
            x += w; row_h = max(row_h, h)
    H = 1
    while H < y + row_h:
        H *= 2
    img = Image.new('RGB', (W, H), P['Extras'][0])
    for c, f, x, y, w, h in slots:
        paint(img, x, y, w, h, c['paint'], f)
        c.setdefault('faces', {})[f] = {'uv': [x, y, x + w, y + h], 'texture': 0}
    buf = io.BytesIO(); img.save(buf, 'PNG')

    # 2. Blockbench project
    U = lambda v: [round(a * PX, 3) for a in v]
    elements, uid = [], lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
    def outline(n):
        if isinstance(n, dict):
            e = {'name': n['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
                 'from': U(n['from']), 'to': U(n['to']), 'autouv': 0, 'color': 0, 'origin': n['_origin'], 'faces': n['faces']}
            elements.append(e)
            return e['uuid']
        name, origin, kids = n
        for k in kids:
            if isinstance(k, dict):
                k['_origin'] = U(origin)
        return {'name': name, 'origin': U(origin), 'color': 0, 'uuid': uid(), 'export': True, 'isOpen': True,
                'locked': False, 'visibility': True, 'autouv': 0, 'children': [outline(k) for k in kids]}
    tree = outline(TREE)
    tex = {'path': '', 'name': 'enemy_insurgent.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
           'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
           'width': W, 'height': H, 'uv_width': W, 'uv_height': H,
           'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'enemy_insurgent', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': W, 'height': H}, 'elements': elements, 'outliner': [tree], 'textures': [tex]}
    src_dir = os.path.join(ROOT, 'assets', 'sources')
    os.makedirs(src_dir, exist_ok=True)
    path = os.path.join(src_dir, 'enemy_insurgent.bbmodel')
    json.dump(project, open(path, 'w'), indent=1)
    img.save(os.path.join(src_dir, 'enemy_insurgent.png'))
    os.makedirs(os.path.join(ROOT, 'assets', 'characters'), exist_ok=True)
    bbmodel.to_glb(path, os.path.join(ROOT, 'assets', 'characters', 'enemy_insurgent.glb'))
    print('insurgent:', bbmodel.triangles(project), 'triangles, texture', W, 'x', H)


make_wall()
# the insurgent is now made by tools/make_insurgent.py (from its OpenArt reference)
