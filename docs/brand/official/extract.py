"""Extract CampusSync brand assets from the supplied reference JPEG.

The C symbol is CUT OUT of the original pixels (no redrawing):
  * the three shapes are selected as connected components of the artwork,
  * each pixel's opacity is recovered by un-mixing it from the cream background
    along the line background -> ink colour (this keeps the original anti-aliased edges),
  * colour = the measured ink colour of that shape (removes JPEG speckle only).
Usage: python -I extract.py <reference.jpg> <out_dir>
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(np.float32)
H, W, _ = a.shape

border = np.concatenate([a[:20].reshape(-1, 3), a[-20:].reshape(-1, 3), a[:, :20].reshape(-1, 3), a[:, -20:].reshape(-1, 3)])
BG = np.median(border, axis=0)
dist = np.linalg.norm(a - BG, axis=2)
ink = dist > 60
lab, n = ndi.label(ink)
objs = ndi.find_objects(lab)

def comp_at_bbox(x0, y0, x1, y1):
    for i, sl in enumerate(objs, start=1):
        if sl and sl[1].start == x0 and sl[0].start == y0 and sl[1].stop == x1 and sl[0].stop == y1:
            return i
    raise SystemExit(f'component {x0,y0,x1,y1} not found')

# The three shapes of the C symbol (bboxes measured by analyze.py)
PARTS = {
    'orange_top': comp_at_bbox(87, 362, 341, 576),
    'orange_bottom': comp_at_bbox(120, 586, 321, 650),
    'plum_c': comp_at_bbox(134, 409, 303, 603),
}
report = {'source_size': [W, H], 'background': '#%02X%02X%02X' % tuple(int(round(c)) for c in BG), 'parts': {}}

ids = list(PARTS.values())
sel = np.isin(lab, ids)
others = ink & ~sel
# region that may hold anti-aliased edge pixels of the symbol, but never another shape
region = ndi.binary_dilation(sel, iterations=3) & ~ndi.binary_dilation(others, iterations=2)
# nearest symbol part for every pixel -> its ink colour
_, (iy, ix) = ndi.distance_transform_edt(~sel, return_indices=True)
nearest = lab[iy, ix]

alpha = np.zeros((H, W), np.float32)
rgb = np.zeros((H, W, 3), np.float32)
for name, cid in PARTS.items():
    px = a[lab == cid]
    core = px[np.linalg.norm(px - BG, axis=1) > 150]
    col = np.median(core, axis=0)
    report['parts'][name] = {'pixels': int((lab == cid).sum()), 'ink': '#%02X%02X%02X' % tuple(int(round(c)) for c in col)}
    m = region & (nearest == cid)
    d = BG - col
    al = ((BG - a[m]) @ d) / (d @ d)
    alpha[m] = np.clip(al, 0, 1)
    rgb[m] = col
alpha[alpha < 0.05] = 0

ys, xs = np.nonzero(alpha > 0)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
report['symbol_bbox_in_source'] = [int(x0), int(y0), int(x1), int(y1)]
cw, ch = x1 - x0, y1 - y0

# Square canvas, geometric centre of the symbol's bounding box, transparent padding (~8%)
side = int(round(max(cw, ch) * 1.16))
px0 = (side - cw) // 2; py0 = (side - ch) // 2
canvas = np.zeros((side, side, 4), np.float32)
canvas[py0:py0 + ch, px0:px0 + cw, :3] = rgb[y0:y1, x0:x1]
canvas[py0:py0 + ch, px0:px0 + cw, 3] = alpha[y0:y1, x0:x1]
native = Image.fromarray(np.dstack([canvas[..., :3], canvas[..., 3:] * 255]).round().astype(np.uint8), 'RGBA')
native.save(f'{OUT}/campussync-c-logo@1x.png', optimize=True)
report['logo_native_px'] = side
# crop box in source coordinates matching the logo canvas exactly (for the comparison)
report['logo_canvas_in_source'] = [int(x0 - px0), int(y0 - py0), int(x0 - px0 + side), int(y0 - py0 + side)]

# Hi-res: upscale the opacity map (bicubic) and re-sharpen the edge around the 50% contour.
# The 50% contour (the visible outline) is unchanged; only the blur width shrinks.
def hires(scale):
    s = side * scale
    al = Image.fromarray((canvas[..., 3] * 255).astype(np.uint8), 'L').resize((s, s), Image.BICUBIC)
    al = np.asarray(al).astype(np.float32) / 255
    al = np.clip((al - 0.5) * 2.2 + 0.5, 0, 1)
    # colour: nearest-neighbour of the per-part colour map (parts never touch, so no seams)
    lab_c = np.zeros((side, side), np.uint8)
    sub = nearest[y0:y1, x0:x1] * (alpha[y0:y1, x0:x1] > 0)
    for k, cid in enumerate(ids, start=1):
        lab_c[py0:py0 + ch, px0:px0 + cw][sub == cid] = k
    # dilate labels so colour exists wherever upscaled alpha does
    _, (jy, jx) = ndi.distance_transform_edt(lab_c == 0, return_indices=True)
    lab_c = lab_c[jy, jx]
    lab_u = np.asarray(Image.fromarray(lab_c).resize((s, s), Image.NEAREST))
    cols = [np.array([int(report['parts'][nm]['ink'][i:i + 2], 16) for i in (1, 3, 5)]) for nm in PARTS]
    out = np.zeros((s, s, 4), np.uint8)
    for k, c in enumerate(cols, start=1):
        out[lab_u == k, :3] = c
    out[..., 3] = (al * 255).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

big = hires(4)
big.save(f'{OUT}/campussync-c-logo@4x.png', optimize=True)
report['logo_4x_px'] = big.size[0]

# ---------- icons ----------
def fit(img, size, pad_frac=0.0, bg=None):
    inner = int(round(size * (1 - 2 * pad_frac)))
    sym = img.resize((inner, inner), Image.LANCZOS)
    c = Image.new('RGBA', (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    c.alpha_composite(sym, ((size - inner) // 2, (size - inner) // 2))
    return c

cream = tuple(int(round(v)) for v in BG)
for s in (16, 32, 48):
    fit(big, s).save(f'{OUT}/favicon-{s}.png')
fit(big, 48).save(f'{OUT}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
fit(big, 180, 0.06, cream).convert('RGB').save(f'{OUT}/apple-touch-icon.png')
fit(big, 192, 0.04).save(f'{OUT}/icon-192.png')
fit(big, 512, 0.04).save(f'{OUT}/icon-512.png')
fit(big, 512, 0.12, cream).save(f'{OUT}/icon-512-maskable.png')

# ---------- banner (whole artwork, tagline removed) ----------
b = a.copy()
# tagline: grey letters only, at y~755-790 between x 440 and 1160 (decorations sit outside this box)
ty0, ty1, tx0, tx1 = 750, 792, 440, 1160
tag = ink[ty0:ty1, tx0:tx1]
report['tagline_pixels_removed'] = int(tag.sum())
b[ty0:ty1, tx0:tx1] = BG
ink_b = np.linalg.norm(b - BG, axis=2) > 40
ys, xs = np.nonzero(ink_b)
m = 28
bx0, by0, bx1, by1 = max(xs.min() - m, 0), max(ys.min() - m, 0), min(xs.max() + 1 + m, W), min(ys.max() + 1 + m, H)
banner = Image.fromarray(b[by0:by1, bx0:bx1].round().astype(np.uint8), 'RGB')
banner.save(f'{OUT}/campussync-banner.png', optimize=True)
banner.save(f'{OUT}/campussync-banner.webp', quality=92, method=6)
report['banner_crop_in_source'] = [int(bx0), int(by0), int(bx1), int(by1)]
report['banner_px'] = list(banner.size)
print(json.dumps(report, indent=1))
