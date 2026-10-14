"""Trace the brand logos into vector outlines for the hero's 3D stand.

    python scripts/logo-shapes.py [folder with the original logo images]

Reads white-on-black logo images, finds their outlines (with holes) and writes
public/js/logo-shapes.js: window.LOGO_SHAPES = { nike: [{ outer: [[x, y], ...], holes: [[...]] }], ... }
Coordinates are centred and scaled to a height of 1, y pointing up, ready for THREE.Shape + ExtrudeGeometry.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent
LOGOS = {
    'nike': ['Minimalist White Swoosh on Black (2).png', 'public/brand/brand-nike.png'],
    'adidas': ['Minimalist White Three-Stripe Emblem.png', 'public/brand/brand-adidas.png'],
    'on': ['Minimalist White Running Logo.png', 'public/brand/brand-on.png'],
    'tnf': ['The North Face Monochrome Logo.png', 'public/brand/brand-tnf.png'],
}


def mask_of(path: Path) -> np.ndarray:
    im = Image.open(path)
    if im.mode == 'RGBA' and im.getchannel('A').getextrema()[0] < 250:
        m = np.array(im.getchannel('A'))                 # transparent logo
    else:
        m = np.array(im.convert('L'))                    # white logo on black
    m = cv2.resize(m, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    m = cv2.GaussianBlur(m, (0, 0), 2.2)
    _, m = cv2.threshold(m, 127, 255, cv2.THRESH_BINARY)
    ys, xs = np.nonzero(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def shapes(mask: np.ndarray):
    h, w = mask.shape
    contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is None:
        return []
    hier = hier[0]
    norm = lambda c: [[round((x - w / 2) / h, 4), round((h / 2 - y) / h, 4)] for x, y in c.reshape(-1, 2)]
    simp = lambda c: cv2.approxPolyDP(c, 0.0012 * h, True)
    out = []
    for i, c in enumerate(contours):
        if hier[i][3] != -1 or cv2.contourArea(c) < (h * h) * 0.0004:
            continue                                   # holes are collected under their parent
        holes, j = [], hier[i][2]
        while j != -1:
            if cv2.contourArea(contours[j]) > (h * h) * 0.0002:
                holes.append(norm(simp(contours[j])))
            j = hier[j][0]
        out.append({'outer': norm(simp(c)), 'holes': holes, 'w': round(w / h, 4)})
    return out


result = {}
for key, candidates in LOGOS.items():
    path = next((p for p in [SRC / candidates[0], ROOT / candidates[1]] if p.exists()), None)
    result[key] = {'aspect': None, 'parts': []}
    m = mask_of(path)
    parts = shapes(m)
    result[key] = {'aspect': round(m.shape[1] / m.shape[0], 4), 'parts': [{'outer': p['outer'], 'holes': p['holes']} for p in parts]}
    print(f'{key}: {len(parts)} parts, {sum(len(p["outer"]) for p in parts)} points, from {path.name}')

js = ROOT / 'public' / 'js' / 'logo-shapes.js'
js.write_text('/* THREADS — brand logo outlines for the 3D stand (made by scripts/logo-shapes.py). */\n'
              'window.LOGO_SHAPES = ' + json.dumps(result, separators=(',', ':')) + ';\n', encoding='utf-8')
print('wrote', js, js.stat().st_size, 'bytes')
