"""Draws the Level 2 (mining site, DR Congo) layout plan: docs/kambala_layout.png. 1 m = S pixels.

    python3 docs/kolwezi_layout.py
"""
import math, random, os
from PIL import Image, ImageDraw, ImageFont

S = 4                      # pixels per metre
W = 256                    # level size in metres
M = 40                     # margin for grid labels
LEG = 600                  # legend width
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
d = ImageDraw.Draw(img)
OX, OY = M, HEAD + M
P = lambda x, z: (OX + x * S, OY + z * S)
def R(x0, z0, x1, z1): return [*P(x0, z0), *P(x1, z1)]
rnd = random.Random(5)

LATERITE = (196, 104, 70)
LAT_DARK = (160, 80, 52)
JUNGLE = (62, 104, 52)
JUNGLE_D = (40, 78, 38)
ROCK = (128, 116, 106)

# ---------------- ground ----------------
d.rectangle(R(0, 0, W, W), fill=LATERITE)
# forest: west and north-west
forest = [P(0, 0), P(122, 0), P(120, 40), P(110, 96), P(112, 128), P(96, 166), P(70, 200), P(36, 226), P(0, 236)]
d.polygon(forest, fill=JUNGLE)
# mine area: north-east, bare rock and spoil
d.polygon([P(132, 0), P(W, 0), P(W, 128), P(186, 136), P(140, 122), P(128, 70)], fill=(176, 110, 82))

# the pit: four benches (darker = deeper), 2.5 m each, floor 10 m down
CX, CZ = 196, 60
for k, (rx, rz) in enumerate([(56, 46), (46, 37), (36, 28), (26, 20), (17, 13)]):
    sh = 150 - k * 18
    d.ellipse(R(CX - rx, CZ - rz, CX + rx, CZ + rz), fill=(sh + 30, sh - 20, sh - 40), outline=(90, 60, 45), width=2)
# haul road: from the south-west rim spiralling down to the floor
haul = []
for i in range(60):
    a = math.radians(215 - i * 6.2)      # clockwise from south-west
    rf = 52 - i * 0.62
    haul.append(P(CX + math.cos(a) * rf, CZ - math.sin(a) * rf * 0.82))
d.line([P(132, 112), P(146, 104)] + haul[:1], fill=(214, 150, 110), width=7 * S, joint='curve')
d.line(haul, fill=(214, 150, 110), width=6 * S, joint='curve')
# rock walls around the north and east edges (map boundary)
d.polygon([P(150, 0), P(W, 0), P(W, 10), P(150, 6)], fill=ROCK)
d.polygon([P(W - 8, 0), P(W, 0), P(W, 136), P(W - 6, 136)], fill=ROCK)

# village ground (packed red earth, a little lighter) south-east
d.polygon([P(118, 150), P(W, 140), P(W, W), P(96, W), P(92, 200)], fill=(206, 128, 90))
# cassava fields south-west between forest and village
for x0, z0, w, h in [(18, 232, 34, 18), (58, 214, 26, 30), (60, 246, 30, 10)]:
    d.rectangle(R(x0, z0, x0 + w, z0 + h), fill=(150, 140, 70))
    for k in range(0, h, 3):
        d.line([P(x0 + 1, z0 + k + 1), P(x0 + w - 1, z0 + k + 1)], fill=(116, 120, 52), width=2)

# trees (solid trunks, breakable) and shrubs (hide you, stop nothing)
def in_forest(x, z):
    from PIL import ImageDraw as _
    return poly_contains(forest_pts, x, z)
forest_pts = [(0, 0), (122, 0), (120, 40), (110, 96), (112, 128), (96, 166), (70, 200), (36, 226), (0, 236)]
def poly_contains(pts, x, z):
    inside = False
    for (x1, z1), (x2, z2) in zip(pts, pts[1:] + pts[:1]):
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            inside = not inside
    return inside
clear = [(46, 72, 18), (128, 132, 14)]   # logging camp clearing, start junction
def cleared(x, z):
    return any(math.hypot(x - a, z - b) < r for a, b, r in clear) or abs(z - (0.42 * x + 112) * 0 - 132) < 4 and x > 40 and False
logging_road = [(128, 132), (100, 118), (74, 96), (54, 78)]
def near_road(x, z, pts, w):
    for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
        dx, dz = x2 - x1, z2 - z1
        t = max(0, min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)))
        if math.hypot(x - x1 - t * dx, z - z1 - t * dz) < w: return True
    return False
for _ in range(1200):
    x, z = rnd.uniform(4, 124), rnd.uniform(4, 236)
    if not poly_contains(forest_pts, x, z) or cleared(x, z) or near_road(x, z, logging_road, 5): continue
    if rnd.random() < 0.25:
        r = rnd.uniform(1.6, 3.2)
        d.ellipse(R(x - r, z - r, x + r, z + r), fill=JUNGLE_D, outline=(28, 56, 26))
        d.ellipse(R(x - 0.6, z - 0.6, x + 0.6, z + 0.6), fill=(92, 64, 40))
    else:
        r = rnd.uniform(0.8, 1.5)
        d.ellipse(R(x - r, z - r, x + r, z + r), fill=(96, 150, 70))

# ---------------- roads ----------------
DIRT = (226, 168, 124)
def road(pts, w, col=DIRT):
    d.line([P(*p) for p in pts], fill=col, width=int(w * S), joint='curve')
road([(128, 256), (128, 180), (128, 132)], 8)                        # main road in from the south
road([(128, 132), (146, 112)], 8)                                    # to the mine
road(logging_road, 5)                                               # logging road (forest)
road([(128, 150), (160, 170), (196, 186), (240, 196)], 6)            # village street
road([(160, 170), (166, 222), (150, 246)], 4)
road([(196, 186), (206, 230)], 4)

# ---------------- buildings ----------------
def bld(x0, z0, w, h, col, label=None, fs=None):
    d.rectangle(R(x0, z0, x0 + w, z0 + h), fill=col, outline=(50, 40, 34), width=2)
    if label: d.text(P(x0 + w / 2, z0 + h / 2), label, fill=(255, 255, 255), font=fs or f_bs, anchor='mm')
COMPANY, MUD, HUT = (176, 182, 186), (150, 92, 62), (190, 160, 96)
# village: company buildings (2 floors)
bld(176, 192, 22, 16, COMPANY, 'HQ')                  # company HQ (base C)
bld(204, 166, 16, 12, COMPANY, 'Clinic')
bld(150, 176, 18, 10, COMPANY, 'Dorm')
bld(222, 206, 14, 10, COMPANY, 'Store')
bld(140, 158, 10, 8, COMPANY)
# watch tower
d.rectangle(R(200, 196, 204, 200), fill=(110, 80, 52), outline=(30, 20, 10), width=2)
d.text(P(208, 191), 'Tower', fill=(30, 20, 10), font=f_bs)
# football pitch
d.rectangle(R(170, 220, 196, 240), fill=(170, 150, 80), outline=(240, 240, 230), width=2)
# mud houses and huts all round
for _ in range(400):
    x, z = rnd.uniform(100, 250), rnd.uniform(146, 252)
    if x < 120 and z < 190: continue
    if any(a - 3 < x < b + 3 and c - 3 < z < e + 3 for a, c, b, e in [(176, 192, 198, 208), (204, 166, 220, 178), (150, 176, 168, 186), (222, 206, 236, 216), (170, 220, 196, 240), (140, 158, 150, 166)]):
        continue
    if near_road(x, z, [(128, 256), (128, 132)], 7) or near_road(x, z, [(128, 150), (160, 170), (196, 186), (240, 196)], 6): continue
    if rnd.random() < 0.08:
        if rnd.random() < 0.5:
            d.rectangle(R(x, z, x + 7, z + 5), fill=MUD, outline=(70, 40, 30), width=2)
        else:
            d.ellipse(R(x, z, x + 5, z + 5), fill=HUT, outline=(90, 70, 30), width=2)
# forest: logging camp (base B) and sawmill
bld(40, 66, 12, 8, (126, 96, 64), 'Camp')
bld(30, 84, 8, 6, (126, 96, 64))
for k in range(4): d.rectangle(R(56 + k * 3, 66, 58 + k * 3, 78), fill=(150, 104, 60), outline=(90, 60, 30))   # log stacks
bld(84, 26, 14, 10, (126, 96, 64), 'Sawmill')
bld(14, 150, 8, 8, (126, 96, 64), 'Hunters')
bld(70, 186, 7, 5, MUD)
# mine: workshop on the pit floor (base A), site office, magazine, equipment yard
bld(188, 54, 16, 10, COMPANY, 'Workshop')
bld(150, 110, 10, 7, COMPANY, 'Office')
bld(234, 116, 10, 8, (120, 110, 100), 'Magazine')
bld(140, 76, 14, 14, (150, 130, 110), 'Yard')
# tunnel portal (blocked) on the north pit wall at floor level
d.rectangle(R(190, 38, 202, 44), fill=(60, 44, 34), outline=(20, 10, 5), width=3)
d.text(P(196, 34), 'Tunnel (blocked)', fill=(20, 10, 5), font=f_bs, anchor='mm')

# vehicles and equipment
def veh(x, z, w, h, col, label):
    d.rectangle(R(x, z, x + w, z + h), fill=col, outline=(20, 20, 20), width=2)
    d.text(P(x + w + 1, z + h / 2), label, fill=(20, 20, 20), font=f_bs, anchor='lm')
YEL = (230, 182, 40)
veh(170, 98, 10, 6, YEL, 'Haul truck')
veh(206, 70, 7, 5, YEL, 'Excavator')
veh(232, 52, 6, 4, YEL, 'Bulldozer')
veh(176, 22, 4, 4, YEL, 'Drill rig')
veh(146, 92, 8, 4, YEL, '')
veh(110, 140, 7, 3, (90, 90, 90), 'Wrecked car')
# cut rock slabs (breakable cover) in the pit
for x, z in [(182, 74), (210, 52), (176, 58), (214, 64), (198, 76), (168, 64), (224, 44), (204, 36), (160, 50), (230, 70)]:
    d.rectangle(R(x, z, x + 3, z + 2), fill=(170, 160, 150), outline=(80, 70, 60), width=2)
# blasting: detonator, charge lines on the bench faces, unstable faces
d.rectangle(R(208, 60, 211, 62), fill=(230, 40, 30), outline=(0, 0, 0), width=2)
for a0, a1, r in [(200, 250, 30), (290, 340, 40), (20, 70, 30)]:
    for a in range(a0, a1, 6):
        x, z = CX + math.cos(math.radians(a)) * r, CZ - math.sin(math.radians(a)) * r * 0.8
        d.ellipse(R(x - 1, z - 1, x + 1, z + 1), fill=(230, 40, 30))
for x, z in [(152, 42), (238, 82), (176, 24)]:
    d.polygon([P(x, z - 3), P(x + 3, z + 2), P(x - 3, z + 2)], fill=(250, 210, 0), outline=(0, 0, 0))

# boundary
d.rectangle(R(0, 0, W, W), outline=(60, 40, 30), width=10)

# ---------------- base areas ----------------
def base_area(x0, z0, x1, z1, letter):
    d.rectangle(R(x0, z0, x1, z1), outline=(30, 110, 230), width=5)
    d.ellipse(R(x0 - 6, z0 - 6, x0 + 4, z0 + 4), fill=(30, 110, 230))
    d.text(P(x0 - 1, z0 - 1), letter, fill=(255, 255, 255), font=f_b, anchor='mm')
base_area(182, 48, 212, 72, 'A')
base_area(34, 58, 64, 86, 'B')
base_area(170, 186, 208, 212, 'C')

# ---------------- crates (yellow), enemies (red), waves (arrows), start ----------------
crates = [('Ammunition', 236, 120), ('Construction', 146, 82), ('Construction', 88, 30), ('Medical', 212, 172), ('Armour', 236, 236)]
for name, x, z in crates:
    d.rectangle(R(x - 2.2, z - 2.2, x + 2.2, z + 2.2), fill=(250, 214, 40), outline=(0, 0, 0), width=2)
groups = [(196, 60, 4), (186, 84, 3), (230, 40, 2), (160, 40, 3), (236, 118, 4), (150, 112, 3), (146, 84, 3), (176, 22, 2),
          (48, 72, 4), (88, 32, 4), (24, 40, 2), (60, 128, 3), (16, 154, 2), (96, 70, 2), (40, 196, 2),
          (188, 200, 4), (212, 172, 3), (236, 234, 4), (156, 180, 3), (150, 236, 2), (228, 196, 2), (120, 210, 2), (76, 236, 2)]
for x, z, n in groups:
    for k in range(n):
        a = k * 2 * math.pi / n
        d.ellipse(R(x + math.cos(a) * 2 - 1.2, z + math.sin(a) * 2 - 1.2, x + math.cos(a) * 2 + 1.2, z + math.sin(a) * 2 + 1.2), fill=(220, 30, 30), outline=(90, 0, 0))
def arrow(x, z, dx, dz):
    x1, z1 = x + dx * 14, z + dz * 14
    d.line([P(x, z), P(x1, z1)], fill=(220, 30, 30), width=6)
    a = math.atan2(dz, dx)
    d.polygon([P(x1 + math.cos(a) * 4, z1 + math.sin(a) * 4), P(x1 + math.cos(a + 2.4) * 5, z1 + math.sin(a + 2.4) * 5), P(x1 + math.cos(a - 2.4) * 5, z1 + math.sin(a - 2.4) * 5)], fill=(220, 30, 30))
# every attack wave: rebels coming out of the jungle on the west edge (column A, rows 1-8)
for x, z, dx, dz in [(2, 16, 1, 0), (2, 56, 1, 0), (2, 100, 1, 0), (2, 140, 1, 0), (2, 180, 1, 0), (2, 220, 1, 0)]:
    arrow(x, z, dx, dz)
d.ellipse(R(124, 128, 132, 136), fill=(40, 120, 240), outline=(0, 0, 0), width=3)
d.text(P(136, 128), 'START', fill=(0, 0, 0), font=f_b)

# zone names
for txt, x, z in [('THE MINE', 214, 112), ('THE FOREST', 40, 116), ('THE VILLAGE', 214, 150)]:
    d.text(P(x, z), txt, fill=(255, 255, 255), font=f_xl, anchor='mm', stroke_width=3, stroke_fill=(40, 20, 10))

# ---------------- grid ----------------
for i in range(9):
    d.line([P(i * 32, 0), P(i * 32, W)], fill=(255, 255, 255), width=1)
    d.line([P(0, i * 32), P(W, i * 32)], fill=(255, 255, 255), width=1)
for i in range(8):
    d.text((OX + (i * 32 + 16) * S, OY - 20), 'ABCDEFGH'[i], fill=(40, 40, 40), font=f_b, anchor='mm')
    d.text((OX - 20, OY + (i * 32 + 16) * S), str(i + 1), fill=(40, 40, 40), font=f_b, anchor='mm')

d.text((M, 20), 'Level 2: Kambala mine (DR Congo) — plan, 256 m, squares 32 m', fill=(30, 30, 30), font=f_t)

# ---------------- legend ----------------
LX, LY = OX + W * S + 30, OY + 10
def li(y, draw, text):
    draw(LX, y); d.text((LX + 46, y + 2), text, fill=(30, 30, 30), font=f_m)
li(0, lambda x, y: d.rectangle([x, y, x + 34, y + 20], outline=(30, 110, 230), width=5), 'Base areas A, B, C')
li(34, lambda x, y: d.rectangle([x + 9, y, x + 27, y + 18], fill=(250, 214, 40), outline=(0, 0, 0), width=2), 'Upgrade crates')
li(68, lambda x, y: d.ellipse([x + 10, y + 2, x + 24, y + 16], fill=(220, 30, 30)), 'Enemies (about 60)')
li(102, lambda x, y: d.line([x, y + 10, x + 34, y + 10], fill=(220, 30, 30), width=6), 'Attack waves: rebels out of the forest')
li(136, lambda x, y: d.ellipse([x + 4, y, x + 30, y + 20], fill=(130, 90, 70)), 'Pit benches (darker = deeper)')
li(170, lambda x, y: d.line([x, y + 10, x + 34, y + 10], fill=(214, 150, 110), width=12), 'Haul road into the pit')
li(204, lambda x, y: d.rectangle([x + 6, y + 2, x + 28, y + 16], fill=(170, 160, 150), outline=(80, 70, 60), width=2), 'Cut rock slabs (breakable)')
li(238, lambda x, y: d.rectangle([x + 8, y + 2, x + 26, y + 16], fill=(230, 40, 30), outline=(0, 0, 0), width=2), 'Detonator (DETONATE, every 60 s)')
li(272, lambda x, y: [d.ellipse([x + k * 9, y + 6, x + k * 9 + 7, y + 13], fill=(230, 40, 30)) for k in range(4)], 'Blasting charges on the bench faces')
li(306, lambda x, y: d.polygon([(x + 17, y), (x + 30, y + 18), (x + 4, y + 18)], fill=(250, 210, 0), outline=(0, 0, 0)), 'Unstable rock face (rockets bring it down)')
li(340, lambda x, y: d.rectangle([x + 4, y + 2, x + 30, y + 18], fill=YEL, outline=(0, 0, 0), width=2), 'Mining vehicles (solid cover)')
li(374, lambda x, y: d.ellipse([x + 6, y, x + 26, y + 20], fill=JUNGLE_D, outline=(28, 56, 26)), 'Trees: solid, breakable, leave a stump')
li(408, lambda x, y: d.ellipse([x + 10, y + 3, x + 24, y + 17], fill=(96, 150, 70)), 'Shrubs: hide you, stop nothing')
li(442, lambda x, y: d.rectangle([x + 4, y + 2, x + 30, y + 18], fill=COMPANY, outline=(50, 40, 34), width=2), 'Company buildings (2 floors)')
li(476, lambda x, y: d.rectangle([x + 8, y + 2, x + 26, y + 16], fill=MUD, outline=(70, 40, 30), width=2), 'Mud houses (1 floor)')
li(510, lambda x, y: d.ellipse([x + 9, y + 1, x + 25, y + 17], fill=HUT, outline=(90, 70, 30), width=2), 'Thatched huts')
li(544, lambda x, y: d.rectangle([x + 4, y + 2, x + 30, y + 18], fill=(150, 140, 70)), 'Cassava fields')

notes = [
    'A  Pit-floor workshop: deep in the pit,',
    '   shot at from the benches above. Tough;',
    '   the detonator is next to it.',
    'B  Logging camp: a clearing in the forest,',
    '   short sight lines, enemies close in fast.',
    'C  Company HQ: two floors and the watch',
    '   tower; open streets all round.',
]
for i, t in enumerate(notes):
    d.text((LX, LY + 600 + i * 26), t, fill=(30, 30, 30), font=f_m)

img.save(os.path.join(os.path.dirname(__file__), 'kambala_layout.png'))
print('saved')
