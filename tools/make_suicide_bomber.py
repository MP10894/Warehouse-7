"""Draft suicide bomber for Blockbench, from the OpenArt sheet
assets/sources/reference/enemy_suicide_bomber_views.png (left side, front and back views, in
that order): red face scarf, maroon track jacket, grey t-shirt, tan explosive charges on a
black harness, a belt of charges, grey cargo trousers, brown trainers, a detonator in his
right hand. Same skeleton as the other characters (ART_SPEC.md section 4).

The charges are part of the torso, not the `vest` group: the game only shows `vest` on
someone wearing armour, and the bomber's vest must always show. `bomb_light` (the red light
on his chest) blinks in the game.

Writes assets/sources/enemy_suicide_bomber.bbmodel and assets/characters/enemy_suicide_bomber.glb.
Characters: 1 Blockbench unit = 1 texture pixel = 1/32 m.

    python3 tools/make_suicide_bomber.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
PX = 32
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'enemy_suicide_bomber_views.png')
ref = Image.open(REF).convert('RGB')
K = ref.width / 2000                      # measurements below were taken on a 2000-wide copy
FEET_Y, HEAD_Y = 1059, 42                 # soles and top of the head scarf, all three views
S = (FEET_Y - HEAD_Y) / 1.78              # reference pixels per metre
FRONT_CX, SIDE_CX, BACK_CX = 1013, 355, 1690

# a bomber's clothes and gear (never team blue)
USE = ('Red', 'Army green', 'Gun metal', 'Concrete', 'Wood', 'Rust and oil', 'Khaki cloth', 'Sand', 'Plaster', 'Extras')  # no skin tones: the face is covered, and maroon would turn brown
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]
C = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}
rnd = random.Random(3)


REDS = C['Red'][:4] + C['Rust and oil'][1:3]   # the bright red of the scarf too


def nearest(c):
    # the palette has no maroon, so straight colour distance turns the jacket khaki-brown;
    # clearly reddish pixels snap to the dark reds instead
    pool = REDS if c[0] > c[1] + 50 and c[0] > c[2] + 40 and c[1] < 110 else PAL
    return min(pool, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)


def is_bg(c):
    return min(c) > 185 and max(c) - min(c) < 20


def sample_px(x, y):
    return ref.getpixel((min(ref.width - 1, int(x * K)), min(ref.height - 1, int(y * K))))


def crop(x0, y0, x1, y1, w, h, mirror=False, fill=None):
    """Region of the reference (2000-wide coords) → w x h palette pixels."""
    img = ref.crop((int(min(x0, x1) * K), int(min(y0, y1) * K), int(max(x0, x1) * K) + 1, int(max(y0, y1) * K) + 1))
    px = list(img.get_flattened_data()) if hasattr(img, 'get_flattened_data') else list(img.getdata())
    solid = [c for c in px if not is_bg(c)]
    f = fill or (sorted(solid, key=sum)[len(solid) // 2] if solid else (128, 128, 128))
    img.putdata([f if is_bg(c) else c for c in px])
    img = img.resize((w, h), Image.BOX)
    if mirror:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return [[nearest(img.getpixel((i, j))) for i in range(w)] for j in range(h)]


# colours of the parts that are painted rather than sampled
TUNIC = nearest(sample_px(1690, 300))
SLEEVE = nearest(sample_px(1690, 300))
CUFF = nearest(sample_px(812, 410))
SKIN = C['Skin'][4]
SKIN_DARK = C['Skin'][2]


def painted(kind, w, h, face):
    out = []
    for j in range(h):
        row = []
        for i in range(w):
            n = rnd.random()
            if kind == 'sleeve':
                c = SLEEVE if j < h - 2 else CUFF  # pushed-up sleeve, grey t-shirt cuff showing
            elif kind == 'detonator':
                c = C['Red'][3] if face == 'up' or (face == 'north' and j < 2) else C['Gun metal'][0]
            elif kind in ('charges', 'belt'):
                # tan explosive blocks taped together with black bands, readable from afar
                block = 5 if kind == 'charges' else 4
                band = (j in (1, h - 2)) if kind == 'charges' else (j == h // 2)
                c = C['Gun metal'][0] if band or i % block == 0 else (C['Sand'][2] if (i + j) % 7 else C['Sand'][1])
                if kind == 'charges' and face == 'north' and j < 3 and abs(i - w // 2) <= 1:
                    c = C['Gun metal'][0]                          # the detonator box in the middle
            elif kind == 'light':
                c = C['Red'][4]
            elif kind in ('forearm', 'hand'):
                c = SKIN if face != 'down' else SKIN_DARK
            else:  # tunic
                c = TUNIC
            if n < 0.06:
                c = nearest(tuple(max(0, v - 18) for v in c))
            row.append(c)
        out.append(row)
    return out


def flat(c, w, h):
    return [[c] * w for _ in range(h)]


# --- the character: groups with their pivots (ART_SPEC.md section 4) and boxes in metres
def box(name, lo, hi, paint=None):
    return {'name': name, 'from': lo, 'to': hi, 'paint': paint}

def mirror(b, name):
    (x0, y0, z0), (x1, y1, z1) = b['from'], b['to']
    return {**b, 'name': name, 'from': [-x1, y0, z0], 'to': [-x0, y1, z1]}

up_arm = box('upper_arm_R_box', [0.19, 1.17, -0.05], [0.285, 1.49, 0.05], 'sleeve')
fore = box('forearm_R', [0.198, 0.905, -0.042], [0.278, 1.18, 0.042], 'forearm')
hand = box('hand_R', [0.198, 0.80, -0.045], [0.278, 0.91, 0.045], 'hand')
detonator = box('detonator', [0.205, 0.72, -0.07], [0.27, 0.82, -0.02], 'detonator')
thigh = box('thigh_R', [0.02, 0.50, -0.09], [0.18, 0.95, 0.09])
shin = box('shin_R', [0.03, 0.10, -0.085], [0.17, 0.52, 0.085])
boot = box('shoe_R', [0.03, 0.0, -0.165], [0.175, 0.11, 0.08])

TREE = ('body', [0, 0, 0], [
    box('pelvis', [-0.18, 0.88, -0.11], [0.18, 1.06, 0.11]),
    box('charge_belt', [-0.205, 0.85, -0.14], [0.205, 0.99, 0.14], 'belt'),  # belt of charges round the waist
    ('torso', [0, 1.04, 0], [
        box('chest', [-0.19, 1.04, -0.115], [0.19, 1.47, 0.115]),  # jacket, t-shirt and harness
        box('charges', [-0.2, 1.08, -0.165], [0.2, 1.31, -0.115], 'charges'),  # the explosive charges, always shown
        box('bomb_light', [-0.04, 1.22, -0.18], [0.0, 1.26, -0.165], 'light'),
        ('vest', [0, 1.04, 0], [                                    # (armour only: bombers never wear any)
            box('vest_box', [-0.1, 1.1, -0.12], [0.1, 1.2, -0.115]),
        ]),
        ('head', [0, 1.52, 0], [
            box('neck_scarf', [-0.13, 1.40, -0.125], [0.13, 1.52, 0.125]),
            box('face', [-0.10, 1.50, -0.11], [0.10, 1.70, 0.11]),
            box('head_scarf', [-0.115, 1.67, -0.125], [0.115, 1.78, 0.12]),
        ]),
        ('upper_arm_R', [0.24, 1.46, 0], [up_arm, ('lower_arm_R', [0.24, 1.16, 0], [fore, hand, detonator])]),
        ('upper_arm_L', [-0.24, 1.46, 0], [mirror(up_arm, 'upper_arm_L_box'), ('lower_arm_L', [-0.24, 1.16, 0], [mirror(fore, 'forearm_L'), mirror(hand, 'hand_L')])]),
        ('gun_mount', [0.15, 1.34, -0.30], []),
    ]),
    ('upper_leg_R', [0.10, 0.94, 0], [thigh, ('lower_leg_R', [0.10, 0.50, 0], [shin, boot])]),
    ('upper_leg_L', [-0.10, 0.94, 0], [mirror(thigh, 'thigh_L'), ('lower_leg_L', [-0.10, 0.50, 0], [mirror(shin, 'shin_L'), mirror(boot, 'shoe_L')])]),
])

FACES = ['north', 'south', 'east', 'west', 'up', 'down']
iy = lambda y: FEET_Y - y * S            # height (m) → reference row


def face_pixels(b, face, w, h):
    (x0, y0, z0), (x1, y1, z1) = b['from'], b['to']
    kind = b.get('paint')
    if kind in ('sleeve', 'forearm', 'hand', 'detonator', 'light', 'charges', 'belt'):
        return painted(kind, w, h, face)
    if kind == 'tunic' and face != 'south':
        return painted('tunic', w, h, face)   # under the chest rig: plain tunic
    if face == 'north':   # front view: the character's right (+x) is on the image's left
        return crop(FRONT_CX - x1 * S, iy(y1), FRONT_CX - x0 * S, iy(y0), w, h)
    if face == 'south':   # back view: the character's right is on the image's right
        return crop(BACK_CX + x0 * S, iy(y1), BACK_CX + x1 * S, iy(y0), w, h)
    if face in ('west', 'east'):   # side view (facing left): front is on the image's left
        return crop(SIDE_CX + z0 * S, iy(y1), SIDE_CX + z1 * S, iy(y0), w, h, mirror=(face == 'east'))
    # top and bottom: the colour of the part's top (or bottom) edge in the front view
    yy = iy(y1) + 3 if face == 'up' else iy(y0) - 3
    c = nearest(sample_px(FRONT_CX - (x0 + x1) / 2 * S, yy))
    if is_bg(sample_px(FRONT_CX - (x0 + x1) / 2 * S, yy)):
        c = TUNIC
    return flat(c, w, h)


def write():
    cubes = []
    def collect(n):
        if isinstance(n, dict): cubes.append(n)
        else:
            for c in n[2]: collect(c)
    collect(TREE)
    W, x, y, row, slots = 128, 0, 0, 0, []
    sizes = []
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
    img = Image.new('RGB', (W, H), TUNIC)
    for c, f, x0, y0, fw, fh in slots:
        px = face_pixels(c, f, fw, fh)
        for j in range(fh):
            for i in range(fw):
                img.putpixel((x0 + i, y0 + j), px[j][i])
        c.setdefault('faces', {})[f] = {'uv': [x0, y0, x0 + fw, y0 + fh], 'texture': 0}
    buf = io.BytesIO(); img.save(buf, 'PNG')

    U = lambda v: [round(a * PX, 3) for a in v]
    uid = lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
    elements = []
    def outline(n, parent_origin):
        if isinstance(n, dict):
            e = {'name': n['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
                 'from': U(n['from']), 'to': U(n['to']), 'autouv': 0, 'color': 0, 'origin': U(parent_origin), 'faces': n['faces']}
            elements.append(e)
            return e['uuid']
        name, origin, kids = n
        return {'name': name, 'origin': U(origin), 'color': 0, 'uuid': uid(), 'export': True, 'isOpen': True,
                'locked': False, 'visibility': True, 'autouv': 0, 'children': [outline(k, origin) for k in kids]}
    tree = outline(TREE, [0, 0, 0])
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'enemy_suicide_bomber', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': W, 'height': H}, 'elements': elements, 'outliner': [tree],
               'textures': [{'path': '', 'name': 'enemy_suicide_bomber.png', 'folder': '', 'namespace': '', 'id': '0',
                             'particle': False, 'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False,
                             'uuid': uid(), 'width': W, 'height': H, 'uv_width': W, 'uv_height': H,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'enemy_suicide_bomber.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    img.save(os.path.join(ROOT, 'assets', 'sources', 'enemy_suicide_bomber.png'))
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'characters', 'enemy_suicide_bomber.glb'))
    print('suicide bomber:', bbmodel.triangles(project), 'triangles, texture', W, 'x', H)


if __name__ == '__main__':
    write()
