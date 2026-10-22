"""Draws the Level 1 layout proposal (docs/level1_layout.png). 1 m = S pixels."""
import math, random
from PIL import Image, ImageDraw, ImageFont

S = 4                      # pixels per metre
W = 256                    # level size in metres
M = 40                     # margin for grid labels
LEG = 560                  # legend width
HEAD = 70
IMG_W, IMG_H = M + W * S + 20 + LEG, HEAD + M + W * S + 30
F = '/usr/share/fonts/truetype/dejavu/'
f_s = ImageFont.truetype(F + 'DejaVuSans.ttf', 15)
f_m = ImageFont.truetype(F + 'DejaVuSans.ttf', 18)
f_b = ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 18)
f_bs = ImageFont.truetype(F + 'DejaVuSansCondensed-Bold.ttf', 15)
f_t = ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 30)
f_xl = ImageFont.truetype(F + 'DejaVuSansCondensed-Bold.ttf', 26)

img = Image.new('RGB', (IMG_W, IMG_H), (244, 240, 230))
ov = Image.new('RGBA', (IMG_W, IMG_H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
o = ImageDraw.Draw(ov)
OX, OY = M, HEAD + M
P = lambda x, z: (OX + x * S, OY + z * S)
def R(x0, z0, x1, z1): return [*P(x0, z0), *P(x1, z1)]
rnd = random.Random(7)

# ---------------- ground ----------------
SAND = (222, 203, 160)
d.rectangle(R(0, 0, W, W), fill=SAND)
# urban ground (packed dirt / old pavement)
d.polygon([P(0, 0), P(132, 0), P(132, 60), P(124, 130), P(70, 138), P(0, 132)], fill=(205, 194, 168))
# refinery concrete pad
d.polygon([P(150, 0), P(W, 0), P(W, 168), P(160, 168), P(146, 120)], fill=(190, 186, 174))
# dunes (outskirts): lighter blobs with ridge lines
for cx, cz, rx, rz in [(30, 170, 26, 12), (40, 245, 30, 9), (120, 232, 22, 10), (225, 205, 24, 11),
                       (165, 245, 26, 8), (15, 205, 12, 20), (240, 240, 16, 12), (100, 175, 14, 8)]:
    for k in range(4):
        sh = 236 - k * 4
        d.ellipse(R(cx - rx + k * 2, cz - rz + k, cx + rx - k * 3, cz + rz - k), fill=(sh, sh - 18, sh - 64))
    d.arc(R(cx - rx * 0.8, cz - rz * 0.6, cx + rx * 0.8, cz + rz * 0.6), 200, 340, fill=(196, 172, 122), width=2)
# wadi (dry riverbed, low ground) running SW -> E
wadi = [P(0, 150), P(30, 158), P(60, 168), P(85, 165), P(108, 178), P(135, 200), P(150, 214), P(190, 218), P(220, 232), P(W, 236)]
d.line(wadi, fill=(176, 150, 108), width=40, joint='curve')
d.line(wadi, fill=(190, 166, 122), width=20, joint='curve')
# rock outcrops
for cx, cz, r in [(20, 140, 7), (95, 155, 6), (150, 238, 8), (205, 180, 6), (60, 238, 6), (245, 190, 5), (8, 222, 6), (178, 200, 5)]:
    pts = [P(cx + math.cos(a) * r * (0.7 + rnd.random() * 0.5), cz + math.sin(a) * r * (0.7 + rnd.random() * 0.5))
           for a in [i * math.pi / 4 for i in range(8)]]
    d.polygon(pts, fill=(136, 120, 100), outline=(90, 78, 64))
# level boundary band (unbreakable: collapsed blocks / ridge / fence)
d.rectangle(R(0, 0, W, W), outline=(80, 70, 58), width=10)

# ---------------- roads ----------------
ASPH, LINE = (92, 88, 82), (200, 190, 150)
def road(pts, w):
    pp = [P(*p) for p in pts]
    d.line(pp, fill=ASPH, width=w * S, joint='curve')
    for a, b in zip(pp, pp[1:]):
        n = int(math.dist(a, b) / 16)
        for i in range(0, n, 2):
            t0, t1 = i / n, (i + 1) / n
            d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=LINE, width=2)
road([(128, W), (128, 150)], 8)                      # highway from the south
road([(128, 150), (110, 120), (100, 70), (98, 0)], 8)  # avenue north through the city
road([(128, 150), (150, 140), (172, 132), (190, 132)], 7)  # refinery access road
road([(128, 150), (90, 152), (40, 150), (0, 148)], 7)   # west road
road([(64, 198), (90, 178), (110, 160), (128, 150)], 5)  # dirt road to truck stop
road([(180, 225), (150, 205), (128, 195)], 5)          # dirt road to checkpoint
# city streets
for z in [22, 50, 80, 108]:
    d.line([P(4, z), P(122, z)], fill=(120, 114, 104), width=6 * S)
for x in [26, 52, 78]:
    d.line([P(x, 4), P(x, 128)], fill=(120, 114, 104), width=6 * S)

# ---------------- urban buildings ----------------
BASE_A = (48, 54, 74, 78)
FL = {1: (170, 156, 128), 2: (140, 126, 104), 3: (106, 94, 78)}
blocks_x = [(4, 23), (29, 49), (55, 75), (81, 95), (104, 122)]
blocks_z = [(4, 19), (25, 47), (53, 77), (83, 105), (111, 126)]
def clash(x0, z0, x1, z1, boxes):
    return any(not (x1 <= a or x0 >= c or z1 <= b or z0 >= e) for a, b, c, e in boxes)
keep_out = [(BASE_A[0] - 1, BASE_A[1] - 1, BASE_A[2] + 1, BASE_A[3] + 1), (30, 84, 50, 104), (4, 4, 23, 19)]
for bx in blocks_x:
    for bz in blocks_z:
        x = bx[0]
        while x < bx[1] - 5:
            w = rnd.randint(7, 12); w = min(w, bx[1] - x)
            z = bz[0]
            while z < bz[1] - 5:
                dd = rnd.randint(7, 12); dd = min(dd, bz[1] - z)
                box = (x, z, x + w - 1, z + dd - 1)
                if not clash(*box, keep_out) and rnd.random() < 0.85:
                    fl = rnd.choice([1, 1, 2, 2, 2, 3, 3])
                    state = rnd.random()
                    if state < 0.22:   # ruined: superstructure only
                        d.rectangle(R(*box), fill=(196, 184, 158), outline=FL[fl], width=3)
                        for cx in (box[0], box[2]):
                            for cz in (box[1], box[3]):
                                d.rectangle(R(cx - 0.7, cz - 0.7, cx + 0.7, cz + 0.7), fill=(80, 72, 60))
                    else:
                        d.rectangle(R(*box), fill=FL[fl], outline=(70, 62, 52), width=2)
                        if state < 0.5:  # partly damaged: a chunk missing
                            cx, cz = box[0] + rnd.random() * (w - 4), box[1] + rnd.random() * (dd - 4)
                            d.rectangle(R(cx, cz, cx + 3.5, cz + 3.5), fill=(196, 184, 158))
                            for _ in range(5):
                                rx, rz = cx + rnd.random() * 5 - 1, cz + rnd.random() * 5 - 1
                                d.rectangle(R(rx, rz, rx + 0.8, rz + 0.8), fill=(150, 136, 112))
                z += dd + rnd.choice([0, 1, 2])
            x += w + rnd.choice([0, 1, 2])
# market square
d.rectangle(R(31, 85, 49, 103), fill=(214, 202, 176), outline=(150, 136, 112), width=2)
for i in range(6):
    sx, sz = 33 + (i % 3) * 5.5, 88 + (i // 3) * 9
    d.rectangle(R(sx, sz, sx + 3, sz + 2), fill=(178, 92, 60))
# clinic (medical crate), 3 floors, NW corner
d.rectangle(R(5, 5, 22, 18), fill=FL[3], outline=(60, 52, 44), width=3)
d.line([P(11, 11.5), P(16, 11.5)], fill=(235, 235, 235), width=5); d.line([P(13.5, 9), P(13.5, 14)], fill=(235, 235, 235), width=5)
# minaret landmark
d.ellipse(R(86, 30, 92, 36), fill=(236, 230, 214), outline=(70, 62, 52), width=2)
# building site with crane (construction crate)
d.rectangle(R(104, 84, 121, 104), fill=(204, 190, 160), outline=(120, 108, 90), width=2)
d.line([P(108, 88), P(121, 101)], fill=(230, 170, 40), width=6); d.rectangle(R(106, 86, 110, 90), fill=(230, 170, 40))

# base A: old police station - courtyard compound
d.rectangle(R(*BASE_A), fill=(198, 188, 164))
for (x0, z0, x1, z1) in [(48, 54, 74, 58), (48, 58, 52, 78), (70, 58, 74, 70), (56, 66, 66, 72)]:
    d.rectangle(R(x0, z0, x1, z1), fill=FL[2], outline=(70, 62, 52), width=2)

# ---------------- refinery ----------------
# perimeter fence
d.line([P(150, 2), P(150, 100), P(146, 120), P(160, 166), P(254, 166)], fill=(110, 110, 104), width=3)
# pipe racks
PIPE = (82, 104, 118)
def pipes(pts, n=3):
    for k in range(n):
        off = (k - (n - 1) / 2) * 1.3
        pp = [P(x + (off if abs(pts[1][0] - pts[0][0]) < 1 else 0), z + (off if abs(pts[1][0] - pts[0][0]) >= 1 else 0)) for x, z in pts]
        d.line(pp, fill=PIPE, width=4)
pipes([(158, 60), (250, 60)]); pipes([(170, 8), (170, 160)]); pipes([(170, 120), (250, 120)])
pipes([(232, 60), (232, 160)]); pipes([(170, 30), (210, 30)], 2); pipes([(190, 132), (230, 132)], 2)
# tank farm
for cx, cz, r in [(188, 78, 9), (212, 78, 9), (188, 100, 7), (245, 82, 6), (245, 100, 6), (200, 150, 8), (220, 150, 6), (184, 148, 5)]:
    d.ellipse(R(cx - r, cz - r, cx + r, cz + r), fill=(208, 212, 212), outline=(110, 116, 118), width=3)
    d.ellipse(R(cx - r * 0.35, cz - r * 0.35, cx + r * 0.35, cz + r * 0.35), outline=(150, 156, 158), width=2)
# cracking towers
for cx, cz in [(190, 40), (198, 46)]:
    d.ellipse(R(cx - 3.5, cz - 3.5, cx + 3.5, cz + 3.5), fill=(150, 156, 160), outline=(60, 66, 70), width=3)
d.rectangle(R(178, 34, 210, 52), outline=(90, 96, 100), width=2)
# flare stack
d.ellipse(R(236, 22, 242, 28), fill=(80, 80, 80), outline=(30, 30, 30), width=2)
# security post (armour crate)
d.rectangle(R(226, 6, 250, 18), fill=(150, 146, 134), outline=(60, 58, 52), width=3)
# loading bay
d.rectangle(R(240, 128, 254, 160), fill=(170, 166, 154), outline=(80, 78, 72), width=2)
for i in range(4):
    d.rectangle(R(242, 131 + i * 7, 252, 135 + i * 7), fill=(160, 120, 70))
# base C: control building with raised walkway
BASE_C = (200, 88, 226, 114)
d.rectangle(R(*BASE_C), fill=(176, 172, 160))
d.rectangle(R(206, 94, 220, 104), fill=(120, 124, 126), outline=(50, 54, 56), width=3)

# ---------------- outskirts ----------------
BASE_B = (52, 186, 78, 212)
d.rectangle(R(*BASE_B), fill=(214, 196, 156))
d.rectangle(R(56, 190, 70, 198), fill=FL[1], outline=(70, 62, 52), width=2)    # truck stop diner
d.rectangle(R(56, 202, 62, 210), fill=FL[1], outline=(70, 62, 52), width=2)    # garage
for i in range(3):
    d.rectangle(R(66 + i * 3.6, 202, 68.5 + i * 3.6, 210), fill=(120, 110, 90))  # parked trucks
# single-storey houses scattered
for x, z in [(20, 182), (32, 196), (100, 215), (112, 236), (196, 238), (230, 220), (24, 218), (88, 240), (236, 176)]:
    w, dd = rnd.randint(6, 9), rnd.randint(6, 8)
    ruined = rnd.random() < 0.3
    d.rectangle(R(x, z, x + w, z + dd), fill=(214, 196, 156) if ruined else FL[1], outline=(110, 98, 80) if ruined else (70, 62, 52), width=3 if ruined else 2)
# gas station
d.rectangle(R(140, 176, 156, 186), fill=(200, 190, 170), outline=(90, 84, 74), width=2)
d.rectangle(R(146, 168, 152, 174), fill=FL[1], outline=(70, 62, 52), width=2)
# army checkpoint (ammo crate)
d.rectangle(R(172, 218, 190, 232), fill=(196, 182, 144), outline=(90, 96, 70), width=2)
d.line([P(172, 218), P(190, 218), P(190, 232), P(172, 232)], fill=(150, 130, 90), width=7)  # sandbag ring
d.rectangle(R(178, 222, 184, 228), fill=FL[2], outline=(60, 62, 48), width=2)
# quarry (construction crate)
d.ellipse(R(14, 228, 44, 252), fill=(180, 160, 128), outline=(110, 96, 76), width=3)
d.ellipse(R(20, 233, 38, 247), fill=(160, 140, 110))
# wrecked convoy near south entry
for i, (x, z) in enumerate([(124, 228), (131, 236), (126, 244)]):
    d.rectangle(R(x, z, x + 3, z + 6), fill=(70, 66, 58))

# ---------------- overlays: storms, bases ----------------
def hatch_ellipse(cx, cz, rx, rz, col):
    o.ellipse(R(cx - rx, cz - rz, cx + rx, cz + rz), fill=(*col, 54), outline=(*col, 210), width=3)
    x0, x1 = OX + (cx - rx) * S, OX + (cx + rx) * S
    for k in range(int(x0) - 800, int(x1), 22):
        pts = []
        for t in range(0, 801, 4):
            px, py = k + t, OY + (cz - rz) * S + t
            ex, ez = (px - OX) / S, (py - OY) / S
            if ((ex - cx) / rx) ** 2 + ((ez - cz) / rz) ** 2 <= 1:
                pts.append((px, py))
        if len(pts) > 1:
            o.line([pts[0], pts[-1]], fill=(*col, 90), width=2)
hatch_ellipse(60, 210, 64, 44, (190, 110, 40))        # sandstorm, outskirts
hatch_ellipse(205, 212, 46, 32, (190, 110, 40))       # sandstorm, south-east
hatch_ellipse(232, 52, 22, 20, (60, 60, 60))          # smoke from flare (idea)

def base(box, label, col=(30, 110, 210)):
    x0, z0, x1, z1 = box
    o.rectangle(R(x0, z0, x1, z1), fill=(*col, 40))
    # dashed border
    for (a, b) in [((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))]:
        n = int(math.dist(a, b) / 2)
        for i in range(0, n, 2):
            p0 = (a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)
            p1 = (a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n)
            o.line([P(*p0), P(*p1)], fill=(*col, 255), width=5)
    # build spots
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
for b in (BASE_A, BASE_B, BASE_C):
    base(b, '')
img = Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB')
d = ImageDraw.Draw(img)

def tag(x, z, text, font=f_bs, fill=(255, 255, 255), bg=(40, 36, 30), anchor='mm'):
    px, py = P(x, z)
    bb = d.textbbox((px, py), text, font=font, anchor=anchor)
    d.rectangle([bb[0] - 5, bb[1] - 3, bb[2] + 5, bb[3] + 3], fill=bg)
    d.text((px, py), text, font=font, fill=fill, anchor=anchor)

# base labels
tag(61, 50, 'BASE A · Police station', bg=(30, 90, 180))
tag(65, 182, 'BASE B · Truck stop', bg=(30, 90, 180))
tag(213, 84, 'BASE C · Control building', bg=(30, 90, 180))
# build spots (where upgrades go) - small white squares
for x0, z0, x1, z1 in (BASE_A, BASE_B, BASE_C):
    for i, (fx, fz) in enumerate([(0.25, 0.85), (0.5, 0.85), (0.75, 0.85)]):
        x, z = x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz
        d.rectangle(R(x - 1, z - 1, x + 1, z + 1), fill=(255, 255, 255), outline=(30, 90, 180), width=2)

# crate spots
CRATES = {'construction': (225, 175, 30), 'ammo': (110, 120, 60), 'medical': (235, 235, 235), 'armour': (90, 120, 150)}
SYM = {'construction': 'C', 'ammo': 'A', 'medical': '+', 'armour': 'R'}
def crate(x, z, kind, label=None):
    px, py = P(x, z)
    d.rectangle([px - 13, py - 13, px + 13, py + 13], fill=CRATES[kind], outline=(20, 20, 20), width=3)
    d.text((px, py), SYM[kind], font=f_b, fill=(200, 30, 30) if kind == 'medical' else (20, 20, 20), anchor='mm')
crate(13.5, 22.5, 'medical')       # clinic roof
crate(112, 108, 'construction')    # building site
crate(238, 21, 'armour')           # refinery security post
crate(181, 236, 'ammo')            # army checkpoint
crate(29, 240, 'construction')     # quarry

# enemy groups
def group(x, z, n=3):
    px, py = P(x, z)
    for i in range(n):
        a = i * 2 * math.pi / n
        qx, qy = px + math.cos(a) * 9, py + math.sin(a) * 9
        d.ellipse([qx - 6, qy - 6, qx + 6, qy + 6], fill=(205, 40, 35), outline=(80, 10, 10), width=2)
for x, z, n in [(14, 30, 4), (40, 38, 3), (88, 60, 3), (66, 92, 3), (114, 114, 4), (16, 112, 2), (100, 15, 2),
                (61, 66, 4), (213, 106, 4), (65, 205, 3),
                (232, 26, 4), (195, 62, 3), (180, 115, 3), (245, 145, 3), (210, 135, 2),
                (181, 226, 4), (29, 232, 3), (148, 182, 2), (100, 225, 2), (232, 205, 2)]:
    group(x, z, n)

# wave spawns
def spawn(x, z, ang):
    px, py = P(x, z)
    a = math.radians(ang)
    tip = (px + math.cos(a) * 26, py + math.sin(a) * 26)
    l = (px + math.cos(a + 2.5) * 14, py + math.sin(a + 2.5) * 14)
    r = (px + math.cos(a - 2.5) * 14, py + math.sin(a - 2.5) * 14)
    d.polygon([tip, l, r], fill=(205, 40, 35), outline=(255, 255, 255))
    d.line([(px - math.cos(a) * 18, py - math.sin(a) * 18), (px, py)], fill=(205, 40, 35), width=5)
for x, z, ang in [(98, 3, 90), (252, 4, 135), (253, 176, 180), (200, 253, 270), (8, 250, 300), (3, 112, 0)]:
    spawn(x, z, ang)

# player start
px, py = P(128, 152)
star = [(px + math.cos(math.radians(-90 + i * 36)) * (20 if i % 2 == 0 else 8),
         py + math.sin(math.radians(-90 + i * 36)) * (20 if i % 2 == 0 else 8)) for i in range(10)]
d.polygon(star, fill=(40, 200, 90), outline=(10, 60, 20))
tag(128, 160, 'START · Crossroads', bg=(20, 120, 60))

# district names
for x, z, t in [(38, 64, 'DENSE URBAN'), (205, 175 - 20, ''), (66, 168, ''), ]:
    pass
d.text(P(10, 128), 'DENSE URBAN', font=f_xl, fill=(70, 60, 48), anchor='lb')
d.text(P(158, 4), 'REFINERY', font=f_xl, fill=(60, 66, 72), anchor='lt')
d.text(P(196, 252), 'ARID OUTSKIRTS', font=f_xl, fill=(140, 96, 50), anchor='lb')
# landmark labels
for x, z, t in [(13.5, 3, 'Clinic (3 fl.)'), (89, 39, 'Minaret'), (40, 106, 'Market square'), (112, 81, 'Building site'),
                (194, 31, 'Cracking towers'), (239, 31, 'Flare'), (238, 4, 'Security post'), (200, 69, 'Tank farm'),
                (247, 125, 'Loading bay'), (148, 165, 'Gas station'), (181, 215, 'Army checkpoint'), (29, 226, 'Quarry'),
                (24, 160, 'Wadi (dry riverbed)'), (128, 225, 'Wrecked convoy')]:
    px, py = P(x, z)
    d.text((px, py), t, font=f_s, fill=(25, 22, 18), anchor='mm', stroke_width=3, stroke_fill=(245, 238, 222))

# grid + labels (32 m squares)
for i in range(9):
    x = OX + i * 32 * S
    d.line([(x, OY), (x, OY + W * S)], fill=(60, 50, 40), width=1)
    d.line([(OX, OY + i * 32 * S), (OX + W * S, OY + i * 32 * S)], fill=(60, 50, 40), width=1)
for i in range(8):
    d.text((OX + i * 32 * S + 64, OY - 18), 'ABCDEFGH'[i], font=f_b, fill=(40, 36, 30), anchor='mm')
    d.text((OX - 18, OY + i * 32 * S + 64), str(i + 1), font=f_b, fill=(40, 36, 30), anchor='mm')
d.rectangle([OX, OY, OX + W * S, OY + W * S], outline=(30, 26, 20), width=3)

# title
d.text((OX, 20), 'Level 1 — Ruined city, arid  ·  layout proposal v1', font=f_t, fill=(30, 26, 20), anchor='lt')

# ---------------- legend ----------------
LX, LY = OX + W * S + 40, OY
y = LY
def head(t):
    global y
    d.text((LX, y), t, font=f_b, fill=(30, 26, 20)); y += 30
def row(draw_fn, t):
    global y
    draw_fn(LX + 16, y + 11)
    d.text((LX + 44, y), t, font=f_m, fill=(40, 36, 30)); y += 30
head('Size')
d.text((LX, y), '256 × 256 m. About 56 s to walk across', font=f_m, fill=(40, 36, 30)); y += 26
d.text((LX, y), '(walk speed 4.6 m/s). Grid squares 32 m.', font=f_m, fill=(40, 36, 30)); y += 30
d.rectangle([LX, y, LX + 50 * S, y + 8], fill=(30, 26, 20)); d.rectangle([LX + 25 * S, y, LX + 50 * S, y + 8], fill=(245, 238, 222), outline=(30, 26, 20))
d.text((LX + 50 * S + 10, y + 4), '50 m', font=f_m, fill=(30, 26, 20), anchor='lm'); y += 34
head('Buildings')
for fl in (1, 2, 3):
    row(lambda x, yy, fl=fl: d.rectangle([x - 12, yy - 9, x + 12, yy + 9], fill=FL[fl], outline=(70, 62, 52), width=2), f'{fl} floor{"s" if fl > 1 else ""}')
row(lambda x, yy: d.rectangle([x - 12, yy - 9, x + 12, yy + 9], fill=(196, 184, 158), outline=FL[2], width=3), 'Ruined: columns and floors only')
row(lambda x, yy: (d.rectangle([x - 12, yy - 9, x + 12, yy + 9], fill=FL[2], outline=(70, 62, 52), width=2), d.rectangle([x, yy - 9, x + 12, yy], fill=(196, 184, 158))), 'Partly damaged')
y += 6
head('Ground')
row(lambda x, yy: d.rectangle([x - 12, yy - 6, x + 12, yy + 6], fill=ASPH), 'Road')
row(lambda x, yy: d.ellipse([x - 13, yy - 8, x + 13, yy + 8], fill=(232, 210, 165), outline=(196, 172, 122)), 'Sand dune (high ground)')
row(lambda x, yy: d.rectangle([x - 12, yy - 6, x + 12, yy + 6], fill=(176, 150, 108)), 'Wadi (low ground)')
row(lambda x, yy: d.polygon([(x - 12, yy + 7), (x - 4, yy - 9), (x + 10, yy - 5), (x + 12, yy + 8)], fill=(136, 120, 100)), 'Rock outcrop')
row(lambda x, yy: (d.ellipse([x - 11, yy - 11, x + 11, yy + 11], fill=(208, 212, 212), outline=(110, 116, 118), width=3)), 'Fuel tank')
row(lambda x, yy: [d.line([(x - 13, yy + k), (x + 13, yy + k)], fill=PIPE, width=3) for k in (-4, 0, 4)], 'Pipe rack')
y += 6
head('Game')
row(lambda x, yy: (d.rectangle([x - 13, yy - 10, x + 13, yy + 10], fill=(200, 216, 236), outline=(30, 110, 210), width=4)), 'Base area (first one cleared is yours)')
row(lambda x, yy: d.rectangle([x - 5, yy - 5, x + 5, yy + 5], fill=(255, 255, 255), outline=(30, 90, 180), width=2), 'Build spot for an upgrade')
for k, t in [('construction', 'Construction crate (respawns)'), ('ammo', 'Ammunition crate'), ('medical', 'Medical crate'), ('armour', 'Armour crate')]:
    def fn(x, yy, k=k):
        d.rectangle([x - 12, yy - 12, x + 12, yy + 12], fill=CRATES[k], outline=(20, 20, 20), width=3)
        d.text((x, yy), SYM[k], font=f_b, fill=(200, 30, 30) if k == 'medical' else (20, 20, 20), anchor='mm')
    row(fn, t)
row(lambda x, yy: [d.ellipse([x + dx - 5, yy + dy - 5, x + dx + 5, yy + dy + 5], fill=(205, 40, 35)) for dx, dy in [(-7, 4), (7, 4), (0, -6)]], 'Enemy group (guards, respawns)')
row(lambda x, yy: d.polygon([(x + 14, yy), (x - 8, yy - 10), (x - 8, yy + 10)], fill=(205, 40, 35)), 'Wave entry point')
row(lambda x, yy: d.polygon([(x + math.cos(math.radians(-90 + i * 36)) * (13 if i % 2 == 0 else 5), yy + math.sin(math.radians(-90 + i * 36)) * (13 if i % 2 == 0 else 5)) for i in range(10)], fill=(40, 200, 90)), 'Player start')
row(lambda x, yy: d.ellipse([x - 13, yy - 9, x + 13, yy + 9], fill=(226, 190, 150), outline=(190, 110, 40), width=3), 'Sandstorm zone (random)')
row(lambda x, yy: d.ellipse([x - 13, yy - 9, x + 13, yy + 9], fill=(190, 186, 176), outline=(60, 60, 60), width=3), 'Smoke from flare (idea)')

img.save('/home/claude/warehouse-7/docs/level1_layout.png', optimize=True)
print(img.size)
