"""Draft RPK for Blockbench.

The OpenArt sheet (assets/sources/reference/rpk_views.png) is in perspective, so the shape
follows the real RPK's proportions (1040 mm long, 590 mm heavy barrel, 75-round drum,
club-foot stock) and the sheet sets the look: slotted muzzle brake, reddish-brown wood with
three vents in the handguard, dark steel, round drum. The bipod is folded under the barrel.

Writes assets/sources/rpk.bbmodel (open in Blockbench) and assets/weapons/rpk.glb.
Weapons scale: 1 Blockbench unit = 1 texture pixel = 1/256 m.

    python3 tools/make_rpk.py
"""
import base64, io, json, os, random, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_palette import RAMPS
import bbmodel

ROOT = os.path.join(os.path.dirname(__file__), '..')
UNITS = 256
C = {name: [tuple(int(c[k:k + 2], 16) for k in (0, 2, 4)) for c in ramp] for name, ramp in RAMPS}
rnd = random.Random(74)

# Measured from the muzzle (d, metres, increasing towards the butt) and from the bore line
# (y, metres, up). The grip, where the right hand holds, becomes the model's origin.
GRIP_D, GRIP_Y = 0.775, -0.095
DRUM_Y = -0.137   # centre of the drum, hanging just under the receiver
# name, d from/to, y from/to, half width, material, rotation about x (degrees), pivot (d, y)
PARTS = [
    ('muzzle_brake',  0.000, 0.042, -0.013, 0.013, 0.014, 'brake', 0, None),
    ('barrel',        0.042, 0.440, -0.011, 0.011, 0.011, 'steel', 0, None),
    ('front_sight',   0.050, 0.090, -0.016, 0.024, 0.014, 'steel', 0, None),
    ('front_post',    0.064, 0.078, 0.024, 0.050, 0.010, 'steel', 0, None),
    ('bipod_clamp',   0.100, 0.130, -0.030, 0.013, 0.016, 'steel', 0, None),
    ('bipod_leg_L',   0.130, 0.420, -0.034, -0.022, 0.006, 'steel', 0, None),
    ('bipod_leg_R',   0.130, 0.420, -0.034, -0.022, 0.006, 'steel', 0, None),
    ('gas_block',     0.345, 0.385, -0.014, 0.040, 0.015, 'steel', 0, None),
    ('gas_tube',      0.385, 0.440, 0.016, 0.036, 0.010, 'steel', 0, None),
    ('upper_guard',   0.440, 0.585, 0.010, 0.044, 0.018, 'wood_upper', 0, None),
    ('lower_guard',   0.430, 0.600, -0.050, 0.010, 0.025, 'wood', 0, None),
    ('rear_sight',    0.585, 0.645, 0.010, 0.045, 0.016, 'steel', 0, None),
    ('receiver',      0.600, 0.840, -0.060, 0.012, 0.022, 'steel', 0, None),
    ('dust_cover',    0.640, 0.840, 0.012, 0.034, 0.019, 'steel_light', 0, None),
    # 75-round drum: its round faces point forwards and backwards (axis along the barrel),
    # so from the side you see its ribbed edge. Three boxes make an eight-sided disc.
    ('drum_wide',     0.598, 0.698, DRUM_Y - 0.044, DRUM_Y + 0.044, 0.075, 'drum', 0, None),
    ('drum_tall',     0.598, 0.698, DRUM_Y - 0.075, DRUM_Y + 0.075, 0.044, 'drum', 0, None),
    ('drum_core',     0.594, 0.702, DRUM_Y - 0.064, DRUM_Y + 0.064, 0.064, 'drum', 0, None),
    ('charging_lever', 0.690, 0.715, -0.004, 0.012, (0.020, 0.046), 'steel', 0, None),  # right side, pulled back on an empty reload
    ('trigger_guard', 0.705, 0.770, -0.100, -0.088, 0.008, 'steel', 0, None),
    ('trigger',       0.726, 0.736, -0.088, -0.060, 0.004, 'steel', 0, None),
    ('pistol_grip',   0.755, 0.800, -0.165, -0.058, 0.016, 'wood', -18, (0.777, -0.060)),
    ('stock_wrist',   0.840, 0.930, -0.065, 0.010, 0.019, 'wood', -5, (0.840, -0.025)),
    ('stock_butt',    0.925, 1.030, -0.155, 0.006, 0.022, 'wood', -5, (0.840, -0.025)),
    ('butt_plate',    1.030, 1.040, -0.156, 0.007, 0.023, 'butt', -5, (0.840, -0.025)),
]
to_z = lambda d: d - GRIP_D           # towards the muzzle is −z
to_y = lambda y: y - GRIP_Y
POINTS = {
    'muzzle': (0, to_y(0.0), to_z(-0.005)),
    'sight': (0, to_y(0.050), to_z(0.630)),            # the rear sight notch; the front post lines up with it
    'hand_left': (-0.012, to_y(-0.020), to_z(0.515)),  # middle of the lower handguard
    # where your eye sits when aiming: stock at the shoulder, face just behind the top cover
    'eye': (0, to_y(0.050), to_z(0.870)),
}
# parts the game moves on its own (reload): the drum rocks out forward about its front lug,
# like an AK magazine; the charging handle is pulled back on an empty reload
GROUPS = {
    'magazine': (('drum_wide', 'drum_tall', 'drum_core'), (0.598, -0.060)),
    'charging_handle': (('charging_lever',), (0.702, 0.004)),
}


def colour(mat, d, y, x, face, part):
    """Colour at a point: d from the muzzle, y from the bore, x across (metres)."""
    n = rnd.random()
    if mat in ('wood', 'wood_upper'):
        # grain streaks run along the rifle; darker on the underside
        grain = (int(y * 900 + (d * 40) % 3) % 5 == 0) or n < 0.05
        base = C['Rust and oil'][2] if face != 'up' else C['Rust and oil'][3]
        if mat == 'wood_upper' and face in ('east', 'west') and 0.462 < d < 0.565 and abs(y - 0.028) < 0.006:
            return C['Gun metal'][0] if (int((d - 0.462) / 0.021) % 2 == 0) else base  # three cooling vents
        if part == 'pistol_grip' and face in ('east', 'west'):
            return C['Rust and oil'][1] if (int(y * 300) % 2 == 0 and n < 0.4) else base
        return C['Rust and oil'][1] if grain else (C['Rust and oil'][3] if n > 0.93 else base)
    if mat == 'brake':  # slotted muzzle brake
        return C['Gun metal'][0] if (face in ('east', 'west', 'up') and int(d / 0.008) % 2 == 1 and abs(y) < 0.008) else C['Gun metal'][2]
    if mat == 'drum':
        if face in ('north', 'south'):   # the round faces: rim, ring and centre hub
            r = (x * x + (y - DRUM_Y) ** 2) ** 0.5
            if r < 0.016:
                return C['Gun metal'][3]
            if abs(r - 0.045) < 0.004 or r > 0.068:
                return C['Gun metal'][0]
            return C['Gun metal'][1]
        # the edge all round: ribs running round the drum
        k = (d - 0.594) / 0.108
        return C['Gun metal'][0] if (0.12 < k < 0.2 or 0.45 < k < 0.55 or 0.8 < k < 0.88) else C['Gun metal'][1]
    if mat == 'magazine':
        rib = face in ('east', 'west') and int(y * 140) % 3 == 0
        return C['Gun metal'][0] if rib else (C['Gun metal'][1] if n > 0.05 else C['Gun metal'][2])
    if mat == 'butt':
        return C['Gun metal'][1] if (face == 'south' and int(y * 200) % 3 == 0) else C['Gun metal'][0]
    if mat == 'steel_light':
        if face in ('east', 'west') and abs(y - 0.023) < 0.002:
            return C['Gun metal'][1]  # seam of the dust cover
        return C['Gun metal'][2] if face == 'up' else C['Gun metal'][1]
    # steel
    if part == 'receiver' and face == 'west' and 0.650 < d < 0.690 and abs(y + 0.010) < 0.006:
        return C['Gun metal'][3]  # rivets / selector area on the side you see
    return C['Gun metal'][1] if n > 0.06 else C['Gun metal'][2]


FACE_UV = {
    'north': lambda w, h, dd: (w, h), 'south': lambda w, h, dd: (w, h),
    'east': lambda w, h, dd: (dd, h), 'west': lambda w, h, dd: (dd, h),
    'up': lambda w, h, dd: (w, dd), 'down': lambda w, h, dd: (w, dd),
}


def build():
    cubes = []
    for name, d0, d1, y0, y1, half, mat, rot, pivot in PARTS:
        xo = {'bipod_leg_L': -0.011, 'bipod_leg_R': 0.011}.get(name, 0)  # the two folded legs side by side
        x0, x1 = half if isinstance(half, tuple) else (xo - half, xo + half)
        lo = [x0 * UNITS, to_y(y0) * UNITS, to_z(d0) * UNITS]
        hi = [x1 * UNITS, to_y(y1) * UNITS, to_z(d1) * UNITS]
        origin = [0, to_y(pivot[1]) * UNITS, to_z(pivot[0]) * UNITS] if pivot else [0, 0, 0]
        cubes.append({'name': name, 'mat': mat, 'rot': rot, 'origin': origin, 'from': lo, 'to': hi})
    faces = []
    for c in cubes:
        w, h, dd = (max(1, round(t - f)) for f, t in zip(c['from'], c['to']))
        for face, fn in FACE_UV.items():
            faces.append((c, face) + fn(w, h, dd))
    W, x, y, row, slots = 256, 0, 0, 0, []
    for c, face, fw, fh in sorted(faces, key=lambda t: (-t[3], -t[2])):
        if x + fw > W:
            x, y, row = 0, y + row, 0
        slots.append((c, face, x, y, fw, fh)); x += fw; row = max(row, fh)
    H = 8
    while H < y + row:
        H *= 2
    img = Image.new('RGB', (W, H), C['Gun metal'][1])
    for c, face, px0, py0, fw, fh in slots:
        lo, hi = c['from'], c['to']
        _, corners = bbmodel.FACES[face]
        tl, tr, br, bl = [[(lo, hi)[k][a] for a, k in enumerate(cr)] for cr in corners]
        for j in range(fh):
            for i in range(fw):
                u, v = (i + 0.5) / fw, (j + 0.5) / fh
                top = [tl[a] + (tr[a] - tl[a]) * u for a in range(3)]
                bot = [bl[a] + (br[a] - bl[a]) * u for a in range(3)]
                p = [(top[a] + (bot[a] - top[a]) * v) / UNITS for a in range(3)]
                img.putpixel((px0 + i, py0 + j), colour(c['mat'], p[2] + GRIP_D, p[1] + GRIP_Y, p[0], face, c['name']))
        c.setdefault('faces', {})[face] = {'uv': [px0, py0, px0 + fw, py0 + fh], 'texture': 0}
    return cubes, img


def write():
    cubes, img = build()
    uid = lambda: str(uuid.UUID(int=rnd.getrandbits(128)))
    r3 = lambda v: [round(a, 3) for a in v]
    elements = []
    for c in cubes:
        e = {'name': c['name'], 'type': 'cube', 'uuid': uid(), 'box_uv': False, 'rescale': False, 'locked': False,
             'from': r3(c['from']), 'to': r3(c['to']), 'autouv': 0, 'color': 1, 'origin': r3(c['origin']), 'faces': c['faces']}
        if c['rot']:
            e['rotation'] = [c['rot'], 0, 0]
        elements.append(e)
    group = lambda name, origin: {'name': name, 'origin': r3([v * UNITS for v in origin]), 'color': 0, 'uuid': uid(),
                                  'export': True, 'isOpen': True, 'locked': False, 'visibility': True, 'autouv': 0, 'children': []}
    grouped = {part: g for g, (parts, _) in GROUPS.items() for part in parts}
    outliner = [e['uuid'] for e in elements if e['name'] not in grouped]
    for gname, (parts, (pd, py)) in GROUPS.items():
        grp = group(gname, (0, to_y(py), to_z(pd)))
        grp['children'] = [e['uuid'] for e in elements if e['name'] in parts]
        outliner.append(grp)
    outliner += [group(n, p) for n, p in POINTS.items()]
    buf = io.BytesIO(); img.save(buf, 'PNG')
    project = {'meta': {'format_version': '4.5', 'model_format': 'free', 'box_uv': False},
               'name': 'rpk', 'model_identifier': '', 'visible_box': [1, 1, 0],
               'resolution': {'width': img.width, 'height': img.height}, 'elements': elements, 'outliner': outliner,
               'textures': [{'path': '', 'name': 'rpk.png', 'folder': '', 'namespace': '', 'id': '0', 'particle': False,
                             'render_mode': 'default', 'visible': True, 'mode': 'bitmap', 'saved': False, 'uuid': uid(),
                             'width': img.width, 'height': img.height, 'uv_width': img.width, 'uv_height': img.height,
                             'source': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}]}
    src = os.path.join(ROOT, 'assets', 'sources', 'rpk.bbmodel')
    json.dump(project, open(src, 'w'), indent=1)
    img.save(os.path.join(ROOT, 'assets', 'sources', 'rpk.png'))
    bbmodel.to_glb(src, os.path.join(ROOT, 'assets', 'weapons', 'rpk.glb'), units_per_m=UNITS)
    print(f'rpk: {bbmodel.triangles(project)} triangles, texture {img.width} x {img.height}')


if __name__ == '__main__':
    write()
