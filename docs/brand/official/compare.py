"""Side-by-side + numeric comparison of the extracted C against the source pixels."""
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
src = Image.open(SRC).convert('RGB')
x0, y0, x1, y1 = 46, 338, 382, 674           # logo canvas in source coords (from extract.py)
BG = (251, 248, 239)
orig = src.crop((x0, y0, x1, y1))
side = x1 - x0

def on_bg(rgba, size):
    c = Image.new('RGBA', (size, size), BG + (255,))
    c.alpha_composite(rgba.resize((size, size), Image.LANCZOS) if rgba.size[0] != size else rgba)
    return c.convert('RGB')

ext1 = on_bg(Image.open(f'{OUT}/campussync-c-logo@1x.png'), side)
ext4 = on_bg(Image.open(f'{OUT}/campussync-c-logo@4x.png'), side)   # 4x scaled back down to source size

o = np.asarray(orig).astype(np.float32)
bgv = np.array(BG, np.float32)
def mask(img):
    return np.linalg.norm(np.asarray(img).astype(np.float32) - bgv, axis=2) > 90
mo = mask(orig)
# ignore pixels of the neighbouring letter 'a' and decorations that live in the same crop
alpha1 = np.asarray(Image.open(f'{OUT}/campussync-c-logo@1x.png'))[..., 3] > 0
from scipy import ndimage as ndi
roi = ndi.binary_dilation(alpha1, iterations=4)
res = {}
for name, img in (('1x', ext1), ('4x_downscaled', ext4)):
    me = mask(img)
    inter = (mo & me & roi).sum(); union = ((mo | me) & roi).sum()
    diff = np.abs(np.asarray(img).astype(np.float32) - o)[roi].mean()
    res[name] = {'shape_IoU': round(float(inter / union), 4),
                 'pixels_only_in_original': int((mo & ~me & roi).sum()),
                 'pixels_only_in_extracted': int((me & ~mo & roi).sum()),
                 'mean_abs_rgb_diff_0_255': round(float(diff), 2)}
print(json.dumps(res, indent=1))

# ----- visual comparison sheet -----
S = 600
font = ImageFont.load_default(size=22)
small = ImageFont.load_default(size=16)
sheet = Image.new('RGB', (S * 3 + 80, S + 120), (255, 255, 255))
d = ImageDraw.Draw(sheet)
L = orig.resize((S, S), Image.LANCZOS)
R = ext4.resize((S, S), Image.LANCZOS) if False else on_bg(Image.open(f'{OUT}/campussync-c-logo@4x.png'), S)
# overlay: grey = both, red = only original, blue = only extracted (threshold at source size, upscaled)
me = mask(ext1)
ov = np.full((side, side, 3), 255, np.uint8)
ov[mo & me & roi] = (150, 150, 150)
ov[mo & ~me & roi] = (220, 30, 30)
ov[me & ~mo & roi] = (30, 80, 220)
OV = Image.fromarray(ov).resize((S, S), Image.NEAREST)
for i, (img, title) in enumerate(((L, 'LEFT: original C (source pixels, crop)'), (R, 'RIGHT: extracted C logo'), (OV, 'Overlay: grey = match, red/blue = differ'))):
    x = 20 + i * (S + 20)
    sheet.paste(img, (x, 60))
    d.text((x, 20), title, fill=(40, 40, 40), font=font)
d.text((20, S + 75), f"Same display size {S}px. Source crop {side}x{side}px at ({x0},{y0}). Shape IoU 1x: {res['1x']['shape_IoU']}, 4x: {res['4x_downscaled']['shape_IoU']}. Original crop also shows the edge of the 'a' and a decoration, which are not part of the logo.", fill=(80, 80, 80), font=small)
sheet.save(f'{OUT}/compare-original-vs-extracted.png')

# ----- size ladder -----
sizes = [16, 20, 32, 48, 128, 256]
ladder = Image.new('RGB', (sum(sizes) + 40 * len(sizes) + 40, 360), (255, 255, 255))
d = ImageDraw.Draw(ladder)
x = 30
big = Image.open(f'{OUT}/campussync-c-logo@4x.png')
for s in sizes:
    for row, bgc in enumerate(((250, 246, 240), (255, 255, 255))):
        tile = Image.new('RGBA', (s, s), bgc + (255,))
        src_icon = Image.open(f'{OUT}/favicon-{s}.png') if s in (16, 32, 48) else big.resize((s, s), Image.LANCZOS)
        tile.alpha_composite(src_icon.convert('RGBA'))
        ladder.paste(tile.convert('RGB'), (x, 30 + row * 160 + (128 - min(s, 128)) // 2 if s <= 128 else 30))
    d.text((x, 330), f'{s}px', fill=(60, 60, 60), font=small)
    x += s + 40
ladder.save(f'{OUT}/size-ladder.png')
