"""alphainfo.py - histogram of the alpha / R / G / B channels of a few textures (read-only)."""
import sys
from PIL import Image
import numpy as np
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGBA'))
    print(p.split('/')[-1])
    for i, n in enumerate('RGBA'):
        h, _ = np.histogram(a[..., i], bins=[0, 32, 64, 96, 128, 160, 192, 224, 256])
        print('  ', n, 'mean %.1f' % a[..., i].mean(), 'hist', (h / h.sum() * 100).round(1).tolist())
