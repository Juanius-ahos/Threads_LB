"""Cut athletes out of the campaign photos for the hero's 3D stand.

    python scripts/cutout-models.py            # all models listed below
    python scripts/cutout-models.py on-jump    # one of them

Needs: pip install "rembg[cpu]"  (the first run downloads the BiRefNet model, about 210 MB).
Writes public/models/<name>.webp (transparent) plus a preview on grey for checking the edge.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'public' / 'campaign'
OUT = ROOT / 'public' / 'models'
PREVIEW = ROOT / 'models-preview'

MODELS = ['tnf-puffer', 'nike-sprint', 'adidas-squat']   # on-jump: dark hair on a black ground, the head gets lost


def largest_parts(alpha: np.ndarray) -> np.ndarray:
    """Drop specks: keep the pixels connected to the biggest shapes."""
    from scipy import ndimage
    solid = alpha > 40
    labels, n = ndimage.label(solid)
    if n <= 1:
        return alpha
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    keep = np.isin(labels, [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.06])
    keep = ndimage.binary_dilation(keep, iterations=3)
    return np.where(keep, alpha, 0).astype(np.uint8)


def cut(name: str, session) -> None:
    im = Image.open(SRC / f'{name}.webp').convert('RGB')
    rgba = remove(im, session=session, post_process_mask=True)
    a = np.array(rgba)
    a[..., 3] = largest_parts(a[..., 3])
    out = Image.fromarray(a, 'RGBA')
    # soften the very edge a touch so it sits on dark and light grounds alike
    alpha = out.getchannel('A').filter(ImageFilter.GaussianBlur(0.6))
    out.putalpha(alpha)
    out = out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    if out.height > 1600:
        out = out.resize((round(out.width * 1600 / out.height), 1600), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    out.save(OUT / f'{name}.webp', quality=90, method=6)
    PREVIEW.mkdir(exist_ok=True)
    for tone, tag in (((40, 40, 42), 'dark'), ((200, 201, 204), 'grey')):
        bg = Image.new('RGBA', out.size, tone + (255,))
        bg.alpha_composite(out)
        bg.convert('RGB').save(PREVIEW / f'{name}-{tag}.jpg', quality=85)
    print(f'{name}: {out.size[0]}x{out.size[1]}')


if __name__ == '__main__':
    names = sys.argv[1:] or MODELS
    session = new_session('birefnet-general-lite')
    for n in names:
        cut(n, session)
