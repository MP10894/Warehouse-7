"""Writes the shared art palette (assets/palette/) and a review sheet (docs/palette.png).

Colours are grouped in ramps, dark to light, taken from the placeholder art so the game
keeps its current look. Edit the RAMPS list and run again: python3 tools/make_palette.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

RAMPS = [
    ('Sand',          ['6b5a3e', '9a8259', 'c2a878', 'd9c49c', 'ece0c0']),
    ('Plaster',       ['5e5546', '857a64', 'ab9e82', 'baaa8c', 'd6cbb2']),
    ('Concrete',      ['3e3c38', '5e5b55', '7f7b73', '96928a', 'b8b4aa']),
    ('Wood',          ['3a2414', '5a3418', '7a4724', '926e40', 'b08d5a']),
    ('Khaki cloth',   ['2f3022', '4d4a35', '6f6a4c', '8c8762', 'b39b70']),
    ('Army green',    ['26301f', '3e4130', '4d5233', '6a7448', '8c9666']),
    ('Team blue',     ['2c3a44', '46586a', '627683', '8296a4', 'a8bccb']),
    ('Skin',          ['4a3020', '6e4a32', '8c6448', 'b08566', 'cfa483']),
    ('Gun metal',     ['121211', '2a2a28', '4a4a46', '6e6e68', '9a9a92']),
    ('Rust and oil',  ['2a1a12', '3d1e12', '6a3218', '9a4e26', 'c0743a']),
    ('Red',           ['3e120e', '5a1a14', '8f2a1e', 'd0452f', 'e8806a']),
    ('Yellow',        ['4a360a', '6a4e10', 'a87e1a', 'e0b030', 'ffd860']),
    ('Extras',         ['0e0d0b', 'f4f1e8', 'fff0a0', 'ffb040', 'f0e6cc']),
]
COLOURS = [(name, i, c) for name, ramp in RAMPS for i, c in enumerate(ramp)]

def main():
    root = os.path.join(os.path.dirname(__file__), '..')
    out = os.path.join(root, 'assets', 'palette')
    os.makedirs(out, exist_ok=True)
    rgb = lambda h: tuple(int(h[k:k + 2], 16) for k in (0, 2, 4))

    # GIMP palette: Blockbench (Color panel → Import palette) and most paint programs read it
    with open(os.path.join(out, 'najaf.gpl'), 'w') as f:
        f.write(f'GIMP Palette\nName: Najaf ({len(COLOURS)} colours)\nColumns: 5\n#\n')
        for name, i, c in COLOURS:
            r, g, b = rgb(c)
            f.write(f'{r:3d} {g:3d} {b:3d}\t{name} {i + 1}\n')
    # plain list, one hex colour per line
    with open(os.path.join(out, 'najaf.hex'), 'w') as f:
        f.write('\n'.join(c for _, _, c in COLOURS) + '\n')
    # one pixel per colour, 5 per row: the game and the checker read this one
    strip = Image.new('RGB', (5, len(RAMPS)))
    for j, (_, ramp) in enumerate(RAMPS):
        for i, c in enumerate(ramp):
            strip.putpixel((i, j), rgb(c))
    strip.save(os.path.join(out, 'najaf.png'))

    # review sheet
    F = '/usr/share/fonts/truetype/dejavu/'
    fb, fs = ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 20), ImageFont.truetype(F + 'DejaVuSansMono.ttf', 13)
    S, LW = 84, 170
    img = Image.new('RGB', (LW + 5 * S + 30, 70 + len(RAMPS) * (S + 6) + 10), (26, 24, 19))
    d = ImageDraw.Draw(img)
    d.text((20, 20), f'Najaf shared palette · {len(COLOURS)} colours · dark → light', font=fb, fill=(239, 230, 207))
    for j, (name, ramp) in enumerate(RAMPS):
        y = 70 + j * (S + 6)
        d.text((20, y + S // 2), name, font=fb, fill=(239, 230, 207), anchor='lm')
        for i, c in enumerate(ramp):
            x = LW + i * S
            d.rectangle([x, y, x + S - 4, y + S - 1], fill=rgb(c))
            lum = sum(rgb(c)) / 3
            d.text((x + 6, y + S - 18), '#' + c, font=fs, fill=(20, 18, 14) if lum > 120 else (235, 228, 210))
    img.save(os.path.join(root, 'docs', 'palette.png'))
    print(len(COLOURS), 'colours')


if __name__ == '__main__':
    main()
