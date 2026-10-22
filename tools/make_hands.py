"""Draft first-person gloved hands for Blockbench, in a gripping pose, styled on the reference
assets/sources/reference/player_hands_views.png (tan tactical glove, grey hard knuckle plate
with four knuckle shells, grey finger guards, velcro wrist patch, grey cuff, navy sleeve).

Writes assets/sources/player_hands.bbmodel and assets/items/player_hands.glb.
Scale as for weapons: 1 Blockbench unit = 1 texture pixel = 1/256 m.

Each hand is a fist closed round a vertical bar (the pistol grip) through its origin:
back of the hand on the outside, fingers wrapped round the front (north), thumb over the
top on the inside, wrist and cuff running back (south) towards the player.

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
RIGHT = [
    ('back_and_cuff', (0.000, -0.044, -0.030), (0.040, 0.044, 0.095)),   # back of hand, wrist, cuff, sleeve end
    ('fingers',       (-0.036, -0.046, -0.056), (0.040, 0.034, -0.018)),  # four curled fingers round the front
    ('thumb',         (-0.042, 0.018, -0.046), (-0.012, 0.044, 0.024)),   # thumb over the inside of the grip
    ('knuckles',      (0.040, -0.036, -0.044), (0.052, 0.040, -0.004)),   # hard knuckle plate
]
GLOVE_END_Z = 0.040   # glove ends here; then the grey cuff
SLEEVE_Z = 0.072      # then the navy sleeve


def colour(part, x, y, z, face):
    """Colour of the glove at a point (right-hand coordinates, metres)."""
    n = rnd.random()
    tan = C['Khaki cloth'][4] if n > 0.04 else C['Khaki cloth'][3]
    if part == 'knuckles':
        if face == 'east':  # four knuckle shells, outlined
            k = (y + 0.036) / 0.076 * 4
            edge = abs(k - round(k)) < 0.12 or abs(z + 0.024) > 0.017
            return C['Gun metal'][1] if edge else (C['Gun metal'][3] if (z + 0.024) > -0.006 else C['Gun metal'][4])
        return C['Gun metal'][2]
    if part == 'back_and_cuff':
        if z >= SLEEVE_Z:
            return C['Team blue'][1] if n > 0.05 else C['Team blue'][0]
        if z >= GLOVE_END_Z:
            if abs(y) > 0.038 or abs(z - GLOVE_END_Z) < 0.003:
                return C['Team blue'][0]
            return C['Gun metal'][2] if n > 0.04 else C['Gun metal'][1]
        if face == 'east' and 0.008 < z < 0.034 and abs(y) < 0.026:  # velcro wrist patch
            return C['Gun metal'][1] if (abs(y) > 0.022 or z < 0.011 or z > 0.031) else C['Gun metal'][2]
        return tan
    if part == 'fingers':
        k = (y + 0.046) / 0.080 * 4  # four fingers stacked up the grip
        if abs(k - round(k)) < 0.1 and 0 < round(k) < 4:
            return C['Khaki cloth'][2]  # gaps between fingers
        if face == 'east' and -0.044 < z < -0.030:  # grey guards on the middle joints
            return C['Gun metal'][2]
        if face == 'north' and x > 0.0:
            return C['Gun metal'][2] if abs(x - 0.02) < 0.008 else tan
        return tan
    if part == 'thumb':
        if face in ('up', 'west') and z < -0.032:
            return C['Gun metal'][2]  # thumb tip guard
        return tan
    return tan


FACE_UV = {  # which two axes a face's texture runs along (u, v) and its size
    'north': lambda w, h, d: (w, h), 'south': lambda w, h, d: (w, h),
    'east': lambda w, h, d: (d, h), 'west': lambda w, h, d: (d, h),
    'up': lambda w, h, d: (w, d), 'down': lambda w, h, d: (w, d),
}


def build_hand(side):
    """Cubes (Blockbench units) for one hand. side = 1 right, -1 left (mirror image)."""
    cubes = []
    for name, lo, hi in RIGHT:
        if side < 0:
            lo, hi = (-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2])
        cubes.append({'name': f'{name}_{"R" if side > 0 else "L"}', 'part': name, 'side': side,
                      'from': [v * UNITS for v in lo], 'to': [v * UNITS for v in hi]})
    return cubes


def paint_face(img, ox, oy, c, face, w, h):
    lo, hi = c['from'], c['to']
    _, corners = bbmodel.FACES[face]
    tl, tr, br, bl = [[(lo, hi)[k][a] for a, k in enumerate(cr)] for cr in corners]
    for j in range(h):
        for i in range(w):
            u, v = (i + 0.5) / w, (j + 0.5) / h
            top = [tl[a] + (tr[a] - tl[a]) * u for a in range(3)]
            bot = [bl[a] + (br[a] - bl[a]) * u for a in range(3)]
            p = [(top[a] + (bot[a] - top[a]) * v) / UNITS for a in range(3)]
            # paint in right-hand coordinates, so the left hand is a true mirror image
            x = p[0] * c['side']
            f = face
            if c['side'] < 0 and face in ('east', 'west'):
                f = 'west' if face == 'east' else 'east'
            img.putpixel((ox + i, oy + j), colour(c['part'], x, p[1], p[2], f))


def write():
    groups = {'hand_R': build_hand(1), 'hand_L': build_hand(-1)}
    faces = []
    for cubes in groups.values():
        for c in cubes:
            w, h, d = (max(1, round(t - f)) for f, t in zip(c['from'], c['to']))
            for face, fn in FACE_UV.items():
                faces.append((c, face) + fn(w, h, d))
    W, x, y, row, slots = 128, 0, 0, 0, []
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
                 'from': r3(c['from']), 'to': r3(c['to']), 'autouv': 0, 'color': 2, 'origin': [0, 0, 0], 'faces': c['faces']}
            elements.append(e); kids.append(e['uuid'])
        outliner.append({'name': gname, 'origin': [0, 0, 0], 'color': 0, 'uuid': uid(), 'export': True, 'isOpen': True,
                         'locked': False, 'visibility': True, 'autouv': 0, 'children': kids})
    # side by side in Blockbench would be easier to edit, but both hands share the grip as
    # their origin, which is what the game needs
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
