"""Draft first-person gloved hands and forearms for Blockbench, in a gripping pose, styled on
the reference assets/sources/reference/player_hands_views.png (tan tactical glove, grey hard
knuckle plate with four knuckle shells, grey finger guards, velcro wrist patch, grey cuff,
sleeve in the team's grey-blue).

Writes assets/sources/player_hands.bbmodel and assets/items/player_hands.glb.
Scale as for weapons: 1 Blockbench unit = 1 texture pixel = 1/256 m.

Groups (ART_SPEC.md section 5):
  hand_R, hand_L  a fist closed round an upright grip whose centre line runs through the
                  group's pivot: back of the hand outside, four fingers wrapped round the
                  front (north), thumb over the inside, cuff running back (south).
  arm_R, arm_L    a forearm sleeve running from its pivot (the wrist) along +z (south).
                  The game points it from the wrist back towards your shoulder every frame,
                  so a hand far out on a rifle's handguard is still attached to an arm.
In Blockbench the four groups are spread out side by side so they're easy to edit; the
game puts each one where it belongs.

    python3 tools/make_hands.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
UNITS = 256
C = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}
rnd = random.Random(7)

# Right hand, metres. x: + is the back of the hand (outside), y: up the grip, z: + towards the wrist.
FINGERS = [('index', 0.020, 0.038), ('middle', 0.000, 0.018), ('ring', -0.020, -0.002), ('little', -0.038, -0.022)]
RIGHT = [
    ('back', (0.012, -0.040, -0.026), (0.030, 0.040, 0.032)),       # back of the hand
    ('palm', (-0.020, -0.040, 0.012), (0.012, 0.040, 0.032)),       # palm behind the grip
    ('knuckles', (0.030, -0.036, -0.030), (0.040, 0.038, -0.004)),  # hard knuckle plate
] + [
    (f'finger_{n}', (-0.026 if n != 'little' else -0.022, y0, -0.044 if n in ('middle', 'ring') else -0.040),
     (0.030, y1, -0.016)) for n, y0, y1 in FINGERS
] + [
    ('thumb_base', (-0.028, 0.016, -0.008), (-0.012, 0.038, 0.022)),
    ('thumb_tip', (-0.032, 0.024, -0.036), (-0.016, 0.040, -0.008)),
    ('cuff', (-0.024, -0.038, 0.032), (0.034, 0.038, 0.066)),
]
ARM = ('sleeve', (-0.034, -0.034, 0.0), (0.034, 0.034, 0.90))  # long enough to reach past your eye
WRIST = (0.005, 0.0, 0.060)  # where the forearm starts, in the hand's own coordinates


def colour(part, x, y, z, face):
    """Colour of a point (right-hand coordinates, metres)."""
    n = rnd.random()
    tan = C['Khaki cloth'][4] if n > 0.04 else C['Khaki cloth'][3]
    if part == 'knuckles':
        if face == 'east':  # four knuckle shells, outlined
            k = (y + 0.036) / 0.074 * 4
            edge = abs(k - round(k)) < 0.14 or abs(z + 0.017) > 0.011
            return C['Gun metal'][1] if edge else (C['Gun metal'][3] if z > -0.017 else C['Gun metal'][4])
        return C['Gun metal'][2]
    if part == 'back':
        if face == 'east' and 0.006 < z < 0.030 and abs(y) < 0.024:  # velcro wrist patch
            return C['Gun metal'][1] if (abs(y) > 0.020 or z < 0.009 or z > 0.027) else C['Gun metal'][2]
        return tan
    if part == 'palm':
        return C['Khaki cloth'][3] if n > 0.05 else C['Khaki cloth'][2]   # suede palm, a shade darker
    if part.startswith('finger'):
        if face in ('up', 'down'):
            return C['Khaki cloth'][2]  # the gaps between fingers read as shadow
        if face == 'north' and abs(x - 0.004) < 0.009:
            return C['Gun metal'][2]    # grey guard over the middle joint
        if x < -0.018:
            return C['Khaki cloth'][3]  # fingertips
        return tan
    if part.startswith('thumb'):
        if part == 'thumb_tip' and z < -0.026:
            return C['Gun metal'][2]
        return tan
    if part == 'cuff':
        if abs(y) > 0.033 or z > 0.062:
            return C['Team blue'][0]
        return C['Gun metal'][2] if n > 0.04 else C['Gun metal'][1]
    if part == 'sleeve':
        fold = int(z / 0.06) % 2 == 1 and abs(z % 0.06 - 0.03) < 0.004
        if fold or (face == 'down'):
            return C['Team blue'][0]
        return C['Team blue'][1] if n > 0.015 else C['Team blue'][0]
    return tan


FACE_UV = {
    'north': lambda w, h, d: (w, h), 'south': lambda w, h, d: (w, h),
    'east': lambda w, h, d: (d, h), 'west': lambda w, h, d: (d, h),
    'up': lambda w, h, d: (w, d), 'down': lambda w, h, d: (w, d),
}
# where each group sits in Blockbench (units); the game ignores this and places them itself
LAYOUT = {'hand_R': (20, 0, 0), 'hand_L': (-20, 0, 0), 'arm_R': (60, 0, -20), 'arm_L': (-60, 0, -20)}


def cubes_for(group):
    side = 1 if group.endswith('_R') else -1
    parts = [ARM] if group.startswith('arm') else RIGHT
    ox, oy, oz = LAYOUT[group]
    out = []
    for name, lo, hi in parts:
        if side < 0:
            lo, hi = (-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2])
        out.append({'name': f'{name}_{"R" if side > 0 else "L"}', 'part': name, 'side': side, 'offset': (ox, oy, oz),
                    'from': [lo[0] * UNITS + ox, lo[1] * UNITS + oy, lo[2] * UNITS + oz],
                    'to': [hi[0] * UNITS + ox, hi[1] * UNITS + oy, hi[2] * UNITS + oz]})
    return out


def paint_face(img, px0, py0, c, face, w, h):
    lo, hi = c['from'], c['to']
    _, corners = bbmodel.FACES[face]
    tl, tr, br, bl = [[(lo, hi)[k][a] for a, k in enumerate(cr)] for cr in corners]
    for j in range(h):
        for i in range(w):
            u, v = (i + 0.5) / w, (j + 0.5) / h
            top = [tl[a] + (tr[a] - tl[a]) * u for a in range(3)]
            bot = [bl[a] + (br[a] - bl[a]) * u for a in range(3)]
            p = [(top[a] + (bot[a] - top[a]) * v - c['offset'][a]) / UNITS for a in range(3)]
            # paint in right-hand coordinates, so the left side is a true mirror image
            f = face
            if c['side'] < 0 and face in ('east', 'west'):
                f = 'west' if face == 'east' else 'east'
            img.putpixel((px0 + i, py0 + j), colour(c['part'], p[0] * c['side'], p[1], p[2], f))


def write():
    groups = {g: cubes_for(g) for g in LAYOUT}
    faces = []
    for cubes in groups.values():
        for c in cubes:
            w, h, d = (max(1, round(t - f)) for f, t in zip(c['from'], c['to']))
            for face, fn in FACE_UV.items():
                faces.append((c, face) + fn(w, h, d))
    W, x, y, row, slots = 256, 0, 0, 0, []
    for c, face, fw, fh in sorted(faces, key=lambda t: -t[3]):
        if x + fw > W:
            x, y, row = 0, y + row, 0
        slots.append((c, face, x, y, fw, fh)); x += fw; row = max(row, fh)
    H = 8
    while H < y + row:
        H *= 2
    img = Image.new('RGB', (W, H), C['Khaki cloth'][3])
    for c, face, x, y, fw, fh in slots:
        paint_face(img, x, y, c, face, fw, fh)
        c.setdefault('faces', {})[face] = {'uv': [x, y, x + fw, y + fh], 'texture': 0}

    uid = lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
    r3 = lambda v: [round(a, 3) for a in v]
    elements, outliner = [], []
    for gname, cubes in groups.items():
        kids = []
        for c in cubes:
            e = {'name': c['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
                 'from': r3(c['from']), 'to': r3(c['to']), 'autouv': 0, 'color': 2, 'origin': r3(LAYOUT[gname]),
                 'faces': c['faces']}
            elements.append(e); kids.append(e['uuid'])
        outliner.append({'name': gname, 'origin': r3(LAYOUT[gname]), 'color': 0, 'uuid': uid(), 'export': True,
                         'isOpen': True, 'locked': False, 'visibility': True, 'autouv': 0, 'children': kids})
    # the wrist: an empty group inside each hand, where the forearm attaches
    for gname in ('hand_R', 'hand_L'):
        side = 1 if gname.endswith('_R') else -1
        ox, oy, oz = LAYOUT[gname]
        g = next(o for o in outliner if o['name'] == gname)
        g['children'].append({'name': 'wrist_' + gname[-1], 'origin': r3([WRIST[0] * side * UNITS + ox, WRIST[1] * UNITS + oy, WRIST[2] * UNITS + oz]),
                              'color': 0, 'uuid': uid(), 'export': True, 'isOpen': True, 'locked': False,
                              'visibility': True, 'autouv': 0, 'children': []})
    buf = io.BytesIO(); img.save(buf, 'PNG')
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'player_hands', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': W, 'height': H}, 'elements': elements, 'outliner': outliner,
               'textures': [{'path': '', 'name': 'player_hands.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
                             'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
                             'width': W, 'height': H, 'uv_width': W, 'uv_height': H,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'player_hands.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    img.save(os.path.join(ROOT, 'assets', 'sources', 'player_hands.png'))
    os.makedirs(os.path.join(ROOT, 'assets', 'items'), exist_ok=True)
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'items', 'player_hands.glb'), units_per_m=UNITS)
    print('player_hands:', bbmodel.triangles(project), 'triangles, texture', W, 'x', H)


if __name__ == '__main__':
    write()
