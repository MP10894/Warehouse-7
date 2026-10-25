"""The player character, Dima Karpov, for Blockbench, from the OpenArt sheet
assets/sources/reference/player_views.png (left side, front and back views; his look comes from
the photo player_dima_karpov_photo.png): olive drab Gorka-style hooded jacket with darker
reinforcement panels, olive combat trousers with cargo pockets and knee pads, brown boots,
fingerless gloves, an olive plate carrier with three magazine pouches, a tool pouch, a utility
pouch and two grenades on the chest, a war belt, a dump pouch on the left hip and a holster on
the right thigh. Short dark hair, stubble, bare-headed.

The player may use 600 triangles (enemies 300; ART_SPEC.md section 4), as he is the one
character seen up close, by a co-op partner. Group names and pivots follow ART_SPEC.md
section 4 exactly (the game animates the character by turning those groups). The plate
carrier and everything on it is the `vest` group, shown only while he wears armour; under it
the jacket is painted plain.

Box sizes follow the sheet's proportions, and colours are sampled from it: front faces from
the front view, backs from the back view, sides from the side view, snapped to the shared
palette. The sheet's arms hang slightly outwards, so each arm part reads its front and back
from where that part really is in the sheet.

Writes assets/sources/player.bbmodel and assets/characters/player.glb.
Characters: 1 Blockbench unit = 1 texture pixel = 1/32 m.

    python3 tools/make_player.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
PX = 32
REF = os.path.join(ROOT, 'assets', 'sources', 'reference', 'player_views.png')
ref = Image.open(REF).convert('RGB')
K = ref.width / 2000                      # measurements below were taken on a 2000-wide copy
FEET_Y, HEAD_Y = 1098, 25                 # soles and top of the hair
S = (FEET_Y - HEAD_Y) / 1.78              # reference pixels per metre (he is 1.78 m)
FRONT_CX, SIDE_CX, BACK_CX = 985, 410, 1577

# olive cloth, skin, brown boots and leather, black straps (no team blue, no bright colours)
USE = ('Sand', 'Plaster', 'Concrete', 'Wood', 'Khaki cloth', 'Army green', 'Skin', 'Gun metal', 'Rust and oil')
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]
rnd = random.Random(7)


def nearest(c):
    return min(PAL, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)


def is_bg(c):
    return min(c) > 175 and max(c) - min(c) < 22


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


# the jacket under the plate carrier (seen when he has no armour): plain olive with the darker
# reinforcement colour as a front zip line
JACKET = nearest(sample_px(905, 330))
JACKET_DARK = nearest(sample_px(860, 440))


def painted(kind, w, h, face):
    out = []
    for j in range(h):
        row = []
        for i in range(w):
            c = JACKET
            if face == 'north' and i == w // 2:
                c = JACKET_DARK          # zip
            if rnd.random() < 0.06:
                c = nearest(tuple(max(0, v - 16) for v in c))
            row.append(c)
        out.append(row)
    return out


def flat(c, w, h):
    return [[c] * w for _ in range(h)]


# --- the character: groups with their pivots (ART_SPEC.md section 4) and boxes in metres.
# front / back: the sheet's columns (2000-wide) for that box's front / back face, where the
# default (straight below the shoulder) would miss it.
def box(name, lo, hi, paint=None, front=None, back=None):
    return {'name': name, 'from': lo, 'to': hi, 'paint': paint, 'front': front, 'back': back}


def mirror(b, name):
    (x0, y0, z0), (x1, y1, z1) = b['from'], b['to']
    flip_f = lambda r: r and (2 * FRONT_CX - r[1], 2 * FRONT_CX - r[0])
    flip_b = lambda r: r and (2 * BACK_CX - r[1], 2 * BACK_CX - r[0])
    return {**b, 'name': name, 'from': [-x1, y0, z0], 'to': [-x0, y1, z1], 'front': flip_f(b['front']), 'back': flip_b(b['back'])}


# arms (hanging; the sheet holds them a little out from the body)
up_arm = box('upper_arm_R_box', [0.18, 1.15, -0.03], [0.32, 1.445, 0.15], front=(800, 890), back=(1672, 1762))
fore = box('forearm_R', [0.19, 0.86, -0.02], [0.31, 1.17, 0.14], front=(745, 835), back=(1720, 1805))
hand = box('hand_R', [0.195, 0.68, -0.01], [0.305, 0.87, 0.12], front=(750, 825), back=(1725, 1795))
# legs: thigh with a cargo pocket and the knee pad, shin, boot shaft and sole
thigh = box('thigh_R', [0.01, 0.46, -0.10], [0.23, 0.95, 0.115])
pocket = box('cargo_pocket_R', [0.22, 0.53, -0.06], [0.255, 0.73, 0.07])
shin = box('shin_R', [0.02, 0.21, -0.09], [0.21, 0.48, 0.10])
knee = box('knee_pad_R', [0.035, 0.36, -0.125], [0.195, 0.47, -0.08])
boot = box('boot_R', [0.03, 0.07, -0.085], [0.20, 0.25, 0.105], front=(820, 925))
sole = box('sole_R', [0.025, 0.0, -0.17], [0.205, 0.08, 0.125], front=(818, 928))

TREE = ('body', [0, 0, 0], [
    box('pelvis', [-0.19, 0.78, -0.09], [0.19, 1.00, 0.15]),                 # jacket skirt, flies
    box('war_belt', [-0.20, 0.885, -0.11], [0.20, 0.955, 0.17]),
    box('dump_pouch', [-0.27, 0.77, -0.06], [-0.18, 0.95, 0.08]),            # left hip
    ('torso', [0, 1.04, 0], [
        box('chest', [-0.20, 0.99, -0.10], [0.20, 1.42, 0.17], 'jacket'),
        box('collar', [-0.14, 1.40, -0.11], [0.14, 1.48, 0.09]),
        box('hood', [-0.13, 1.40, 0.06], [0.13, 1.54, 0.19]),                # folded down behind the neck
        ('vest', [0, 1.04, 0], [
            box('plate_carrier', [-0.18, 0.97, -0.14], [0.18, 1.42, 0.20]),
            box('strap_R', [0.10, 1.41, -0.14], [0.17, 1.48, 0.20]),
            box('strap_L', [-0.17, 1.41, -0.14], [-0.10, 1.48, 0.20]),
            box('mag_pouch_1', [0.05, 0.98, -0.19], [0.125, 1.17, -0.135]),
            box('mag_pouch_2', [-0.035, 0.98, -0.19], [0.04, 1.17, -0.135]),
            box('mag_pouch_3', [-0.125, 0.98, -0.19], [-0.045, 1.17, -0.135]),
            box('side_pouch_R', [0.17, 0.98, -0.10], [0.215, 1.16, 0.12]),
            box('side_pouch_L', [-0.215, 0.98, -0.10], [-0.17, 1.16, 0.12]),
            box('tool_pouch', [0.08, 1.22, -0.17], [0.14, 1.35, -0.135]),
            box('utility_pouch', [-0.15, 1.20, -0.17], [-0.05, 1.36, -0.135]),
            box('grenade_1', [-0.165, 1.17, -0.20], [-0.11, 1.24, -0.14]),
            box('grenade_2', [-0.205, 1.00, -0.17], [-0.15, 1.12, -0.11]),
        ]),
        ('head', [0, 1.52, 0], [
            box('neck', [-0.05, 1.42, -0.07], [0.05, 1.50, 0.04]),
            box('face', [-0.095, 1.46, -0.145], [0.095, 1.70, 0.08]),
            box('nose', [-0.02, 1.54, -0.168], [0.02, 1.60, -0.145]),
            box('hair', [-0.10, 1.68, -0.155], [0.10, 1.78, 0.09]),
            box('hair_back', [-0.10, 1.56, 0.06], [0.10, 1.70, 0.10]),
            box('ear_R', [0.095, 1.57, -0.01], [0.11, 1.64, 0.03]),
            box('ear_L', [-0.11, 1.57, -0.01], [-0.095, 1.64, 0.03]),
        ]),
        ('upper_arm_R', [0.24, 1.46, 0], [up_arm, ('lower_arm_R', [0.24, 1.16, 0], [fore, hand])]),
        ('upper_arm_L', [-0.24, 1.46, 0], [mirror(up_arm, 'upper_arm_L_box'), ('lower_arm_L', [-0.24, 1.16, 0], [mirror(fore, 'forearm_L'), mirror(hand, 'hand_L')])]),
        ('gun_mount', [0.15, 1.34, -0.30], []),
    ]),
    ('upper_leg_R', [0.10, 0.94, 0], [thigh, pocket, box('holster', [0.21, 0.52, 0.0], [0.265, 0.73, 0.085]),
        ('lower_leg_R', [0.10, 0.50, 0], [shin, knee, boot, sole])]),
    ('upper_leg_L', [-0.10, 0.94, 0], [mirror(thigh, 'thigh_L'), mirror(pocket, 'cargo_pocket_L'),
        ('lower_leg_L', [-0.10, 0.50, 0], [mirror(shin, 'shin_L'), mirror(knee, 'knee_pad_L'), mirror(boot, 'boot_L'), mirror(sole, 'sole_L')])]),
])

FACES = ['north', 'south', 'east', 'west', 'up', 'down']
iy = lambda y: FEET_Y - y * S            # height (m) → reference row


def face_pixels(b, face, w, h):
    (x0, y0, z0), (x1, y1, z1) = b['from'], b['to']
    if b.get('paint') == 'jacket':
        return painted('jacket', w, h, face)
    if face == 'north':   # front view: the character's right (+x) is on the image's left
        X0, X1 = b['front'] or (FRONT_CX - x1 * S, FRONT_CX - x0 * S)
        return crop(X0, iy(y1), X1, iy(y0), w, h)
    if face == 'south':   # back view: the character's right is on the image's right
        X0, X1 = b['back'] or (BACK_CX + x0 * S, BACK_CX + x1 * S)
        return crop(X0, iy(y1), X1, iy(y0), w, h)
    if face in ('west', 'east'):   # side view (facing left): front is on the image's left
        return crop(SIDE_CX + z0 * S, iy(y1), SIDE_CX + z1 * S, iy(y0), w, h, mirror=(face == 'east'))
    # top and bottom: the colour just inside the part's top (or bottom) edge in the side view
    # (the front view would give the neck's skin to the collar and hood)
    yy = iy(y1) + 3 if face == 'up' else iy(y0) - 3
    c = sample_px(SIDE_CX + (z0 + z1) / 2 * S, yy)
    if b['name'] in ('hair', 'face', 'neck', 'nose') or 'ear' in b['name']:
        c = sample_px(FRONT_CX - (x0 + x1) / 2 * S, yy)   # head parts: front view
    return flat(JACKET if is_bg(c) else nearest(c), w, h)


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
    img = Image.new('RGB', (W, H), JACKET)
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
               'name': 'player', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': W, 'height': H}, 'elements': elements, 'outliner': [tree],
               'textures': [{'path': '', 'name': 'player.png', 'folder': '', 'namespace': '', 'id': '0',
                             'particle': False, 'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False,
                             'uuid': uid(), 'width': W, 'height': H, 'uv_width': W, 'uv_height': H,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'player.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    img.save(os.path.join(ROOT, 'assets', 'sources', 'player.png'))
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'characters', 'player.glb'))
    print('player:', len(cubes), 'boxes,', bbmodel.triangles(project), 'triangles, texture', W, 'x', H)


if __name__ == '__main__':
    write()
