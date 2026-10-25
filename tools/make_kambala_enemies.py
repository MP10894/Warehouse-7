"""Kambala's fighters for Blockbench, from Martial's OpenArt sheets in assets/sources/reference/:

  enemy_kambala_militant_views.png   front, left side, back: olive camo shirt with white
                                     armbands, crossed bandoliers, camo trousers with green
                                     knee patches, black belt and boots, short hair
  enemy_khat_views.png               front, front again, back: bare-chested, crossed
                                     bandoliers, camo cargo trousers, knee pads, black boots
                                     (one body for the Khat Addict and the Khat Berserker)
  enemy_kambala_mercenary_views.png  front, left side, back: black beret, beard, olive plate
                                     carrier with three magazine pouches and a bandolier, camo
                                     shirt with rolled sleeves, cargo trousers, black boots

Same skeleton as every other soldier (ART_SPEC.md section 4: the game animates the character
by turning those groups). Box sizes follow each sheet's proportions and the colours are
sampled from it: front faces from the front view, backs from the back view, sides from the
side view, all snapped to the shared palette. The Khat sheet has no side view, so its sides
come from the back view squeezed to the part's depth (skin, trousers, boots: no face on the
side of the head). Arms are painted (the sheets hold them away from the body).

The `vest` group is what the game shows while a fighter has armour left (and hides when it's
shot away): the mercenary's own plate carrier from his sheet; a plain olive one for the others
(they only wear one when a wave hands them armour).

Writes assets/sources/enemy_<type>.bbmodel and assets/characters/enemy_<type>.glb for
kambala_militant, kambala_mercenary, khat_addict and khat_berserker (the last two the same).
Characters: 1 Blockbench unit = 1 texture pixel = 1/32 m.

    python3 tools/make_kambala_enemies.py
"""
import base64, io, json, os, random, shutil, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
PX = 32
USE = ('Sand', 'Plaster', 'Wood', 'Khaki cloth', 'Army green', 'Skin', 'Gun metal', 'Yellow', 'Concrete', 'Extras')
PAL = [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for name, ramp in RAMPS if name in USE for c in ramp]
C = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}

# measurements on a 2000-wide copy of each sheet: soles, top of the head, height in metres,
# and the centre line of each view (FRONT, SIDE, BACK); SIDE None = no side view
CHARS = {
    'kambala_militant': dict(ref='enemy_kambala_militant_views.png', feet=1082, top=49, height=1.80,
                             front=459, side=1010, back=1541, sleeve='short', cuff='white'),
    'khat_addict': dict(ref='enemy_khat_views.png', feet=1106, top=36, height=1.80,
                        front=347, side=None, back=1652, sleeve='bare'),
    'kambala_mercenary': dict(ref='enemy_kambala_mercenary_views.png', feet=1088, top=39, height=1.84,
                              front=660, side=1125, back=1585, sleeve='short', cuff='rolled', beret=True),
}


def nearest(c, pal=None):
    return min(pal or PAL, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)


def is_bg(c):
    return min(c) > 185 and max(c) - min(c) < 20


def box(name, lo, hi, paint=None):
    return {'name': name, 'from': lo, 'to': hi, 'paint': paint}


def mirror(b, name):
    (x0, y0, z0), (x1, y1, z1) = b['from'], b['to']
    return {**b, 'name': name, 'from': [-x1, y0, z0], 'to': [-x0, y1, z1]}


def tree(ch):
    """The groups (ART_SPEC.md section 4 pivots) and their boxes, in metres."""
    up_arm = box('upper_arm_R_box', [0.185, 1.17, -0.055], [0.295, 1.49, 0.055], 'upper_arm')
    fore = box('forearm_R', [0.195, 0.905, -0.045], [0.285, 1.18, 0.045], 'forearm')
    hand = box('hand_R', [0.19, 0.79, -0.05], [0.29, 0.91, 0.05], 'hand')
    thigh = box('thigh_R', [0.015, 0.50, -0.095], [0.185, 0.97, 0.095])
    shin = box('shin_R', [0.025, 0.28, -0.085], [0.175, 0.52, 0.085])
    boot = box('boot_R', [0.03, 0.0, -0.15], [0.17, 0.30, 0.075])
    bare = ch['sleeve'] == 'bare'
    w = 0.21 if bare else 0.195                        # the Khat fighters are broad-chested
    if ch.get('beret'):
        vest = [box('plate_carrier', [-0.215, 1.07, -0.15], [0.215, 1.47, 0.15], 'sample'),
                box('mag_pouches', [-0.16, 1.08, -0.205], [0.16, 1.27, -0.145], 'sample')]
        head = [box('neck', [-0.07, 1.46, -0.07], [0.07, 1.55, 0.07], 'skin'),
                box('face', [-0.095, 1.54, -0.11], [0.095, 1.76, 0.10]),
                box('beret', [-0.11, 1.74, -0.125], [0.135, 1.84, 0.12])]   # pulled to his right
    else:
        vest = [box('plate_carrier', [-0.225, 1.08, -0.155], [0.225, 1.46, 0.155], 'carrier'),
                box('mag_pouches', [-0.15, 1.09, -0.20], [0.15, 1.25, -0.15], 'pouches')]
        head = [box('neck', [-0.07, 1.46, -0.07], [0.07, 1.55, 0.07], 'skin'),
                box('face', [-0.095, 1.54, -0.11], [0.095, 1.80, 0.10])]
    return ('body', [0, 0, 0], [
        box('pelvis', [-0.20, 0.90, -0.12], [0.20, 1.06, 0.12]),           # belt and trouser top
        ('torso', [0, 1.04, 0], [
            box('chest', [-w, 1.04, -0.125], [w, 1.48, 0.125], 'shirt' if ch.get('beret') else None),
            ('vest', [0, 1.04, 0], vest),
            ('head', [0, 1.52, 0], head),
            ('upper_arm_R', [0.24, 1.46, 0], [up_arm, ('lower_arm_R', [0.24, 1.16, 0], [fore, hand])]),
            ('upper_arm_L', [-0.24, 1.46, 0], [mirror(up_arm, 'upper_arm_L_box'), ('lower_arm_L', [-0.24, 1.16, 0], [mirror(fore, 'forearm_L'), mirror(hand, 'hand_L')])]),
            ('gun_mount', [0.15, 1.34, -0.30], []),
        ]),
        ('upper_leg_R', [0.10, 0.94, 0], [thigh, ('lower_leg_R', [0.10, 0.50, 0], [shin, boot])]),
        ('upper_leg_L', [-0.10, 0.94, 0], [mirror(thigh, 'thigh_L'), ('lower_leg_L', [-0.10, 0.50, 0], [mirror(shin, 'shin_L'), mirror(boot, 'boot_L')])]),
    ])


FACES = ['north', 'south', 'east', 'west', 'up', 'down']


def build(type_id, ch):
    ref = Image.open(os.path.join(ROOT, 'assets', 'sources', 'reference', ch['ref'])).convert('RGB')
    K = ref.width / 2000
    S = (ch['feet'] - ch['top']) / ch['height']
    iy = lambda y: ch['feet'] - y * S
    rnd = random.Random(7)

    def sample_px(x, y):
        return ref.getpixel((min(ref.width - 1, int(x * K)), min(ref.height - 1, int(y * K))))

    def crop0(x0, y0, x1, y1, w, h, mirror=False, pal=None):
        img = ref.crop((int(min(x0, x1) * K), int(min(y0, y1) * K), int(max(x0, x1) * K) + 1, int(max(y0, y1) * K) + 1))
        px = list(img.get_flattened_data()) if hasattr(img, "get_flattened_data") else list(img.getdata())
        solid = [c for c in px if not is_bg(c)]
        f = sorted(solid, key=sum)[len(solid) // 2] if solid else (128, 128, 128)
        img.putdata([f if is_bg(c) else c for c in px])
        img = img.resize((w, h), Image.BOX)
        if mirror:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        return [[nearest(img.getpixel((i, j)), pal) for i in range(w)] for j in range(h)]

    FX, BX, SX = ch['front'], ch['back'], ch['side']
    # skin: the middle of the face's skin-coloured pixels (not hair, eyes or beard)
    fx = ref.crop((int((FX - 0.07 * S) * K), int(iy(1.70) * K), int((FX + 0.07 * S) * K), int(iy(1.58) * K)))
    sk = sorted((c for c in (fx.get_flattened_data() if hasattr(fx, 'get_flattened_data') else fx.getdata())
                 if c[0] > c[1] > c[2] and c[0] > 70), key=sum)
    SKIN = nearest(sk[len(sk) // 2])
    SKIN_DARK = nearest(tuple(int(v * 0.8) for v in SKIN))
    # the shirt (from the wearer's left shoulder); bare-chested: the trousers (mid thigh)
    SHIRT = nearest(sample_px(FX + 0.16 * S, iy(1.40)) if ch['sleeve'] != 'bare' else sample_px(FX - 0.11 * S, iy(0.75)))
    SHIRT_DARK = nearest(tuple(int(v * 0.82) for v in SHIRT))
    CUFF = C['Extras'][1] if ch.get('cuff') == 'white' else C['Khaki cloth'][4]
    OLIVE = C['Army green']

    def paint(kind, w, h, face=''):
        out = []
        for j in range(h):
            row = []
            for i in range(w):
                n = rnd.random()
                if kind == 'upper_arm':
                    if ch['sleeve'] == 'bare':
                        c = SKIN
                    else:   # sleeve, the armband / rolled cuff, then bare arm
                        c = SHIRT if j < h - 4 else CUFF if j < h - 1 else SKIN
                        if face in ('up', 'down'): c = SHIRT if face == 'up' else SKIN   # shoulder top, elbow end
                        if c == SHIRT and n < 0.25: c = SHIRT_DARK
                elif kind in ('forearm', 'hand', 'skin'):
                    c = SKIN
                    if kind == 'hand' and j == h - 1: c = SKIN_DARK
                elif kind == 'shirt':
                    c = SHIRT_DARK if n < 0.3 else SHIRT
                elif kind == 'carrier':
                    c = OLIVE[2] if j > 0 else OLIVE[3]
                    if n < 0.08: c = OLIVE[1]
                elif kind == 'pouches':
                    c = OLIVE[1] if j < 2 else OLIVE[2]
                    if i % 5 == 0: c = OLIVE[0]
                else:
                    c = SHIRT
                if kind in ('skin', 'forearm', 'upper_arm') and c == SKIN and n < 0.12:
                    c = SKIN_DARK
                row.append(c)
            out.append(row)
        return out

    BRASS, BELT = C['Yellow'][3], C['Yellow'][1]

    def bandolier(px, w, h, x_from, x_to, y_from, y_to):
        """A belt of brass rounds drawn across a face, from (x_from, y_from) to (x_to, y_to) in pixels."""
        n = max(abs(x_to - x_from), abs(y_to - y_from))
        for t in range(n + 1):
            x = round(x_from + (x_to - x_from) * t / n); y = round(y_from + (y_to - y_from) * t / n)
            for dx, c in ((0, BRASS if t % 2 == 0 else BELT), (1, BELT)):
                if 0 <= x + dx < w and 0 <= y < h:
                    px[y][x + dx] = c
        return px

    def face_pixels(b, face, w, h):
        px = sampled(b, face, w, h)
        name = b['name']
        # the crossed bandoliers are too fine to survive sampling: draw them back in
        if face == 'north' and name == 'chest' and not ch.get('beret'):
            bandolier(px, w, h, 1, w - 2, 1, h - 3); bandolier(px, w, h, w - 2, 1, 1, h - 3)
        if face == 'north' and name == 'plate_carrier' and ch.get('beret'):
            bandolier(px, w, h, w - 3, 2, 0, h // 2 + 1)
        return px

    def sampled(b, face, w, h):
        (x0, y0, z0), (x1, y1, z1) = b['from'], b['to']
        kind = b.get('paint')
        # heads: skin, hair and beard only (dark skin otherwise snaps to khaki cloth)
        HEAD = [q for n in ('Skin', 'Wood', 'Gun metal') for q in C[n]] + [C['Extras'][1]]
        crop = (lambda *a, **k: crop0(*a, **{**k, 'pal': HEAD})) if b['name'] == 'face' else crop0
        if kind not in (None, 'sample'):
            return paint(kind, w, h, face)
        if face == 'north':   # front view: the character's right (+x) is on the image's left
            return crop(FX - x1 * S, iy(y1), FX - x0 * S, iy(y0), w, h)
        if face == 'south':   # back view: the character's right is on the image's right
            return crop(BX + x0 * S, iy(y1), BX + x1 * S, iy(y0), w, h)
        if face in ('west', 'east'):
            if SX is None:   # no side view: the back view squeezed to the part's depth
                return crop(BX + x0 * S, iy(y1), BX + x1 * S, iy(y0), w, h, mirror=(face == 'east'))
            # side view (facing left): the front is on the image's left
            return crop(SX + z0 * S, iy(y1), SX + z1 * S, iy(y0), w, h, mirror=(face == 'east'))
        # top and bottom: the middle colour of the front face's top (or bottom) row, never brass
        # (the bandolier rounds belong on the chest, not on boot tops)
        fr = crop(FX - x1 * S, iy(y1), FX - x0 * S, iy(y0), w, max(2, round((y1 - y0) * PX)))
        edge = sorted((q for q in (fr[0] if face == 'up' else fr[-1]) if q not in C['Yellow']), key=sum)
        c = edge[len(edge) // 2] if edge else SHIRT
        return [[c] * w for _ in range(h)]

    T = tree(ch)
    cubes = []
    def collect(n):
        if isinstance(n, dict): cubes.append(n)
        else:
            for c in n[2]: collect(c)
    collect(T)
    W, x, y, row, slots, sizes = 128, 0, 0, 0, [], []
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
    img = Image.new('RGB', (W, H), SHIRT)
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
    name = 'enemy_' + type_id
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': name, 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': W, 'height': H}, 'elements': elements, 'outliner': [outline(T, [0, 0, 0])],
               'textures': [{'path': '', 'name': name + '.png', 'folder': '', 'namespace': '', 'id': '0',
                             'particle': False, 'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False,
                             'uuid': uid(), 'width': W, 'height': H, 'uv_width': W, 'uv_height': H,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', name + '.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    img.save(os.path.join(ROOT, 'assets', 'sources', name + '.png'))
    glb = os.path.join(ROOT, 'assets', 'characters', name + '.glb')
    bbmodel.to_glb(src, glb)
    print(f'{type_id}: {bbmodel.triangles(project)} triangles, texture {W} x {H}')
    return glb


if __name__ == '__main__':
    for t, ch in CHARS.items():
        glb = build(t, ch)
        if t == 'khat_addict':   # the berserker is the same man with a machete
            shutil.copy(glb, os.path.join(ROOT, 'assets', 'characters', 'enemy_khat_berserker.glb'))
            print('khat_berserker: same model as khat_addict')
