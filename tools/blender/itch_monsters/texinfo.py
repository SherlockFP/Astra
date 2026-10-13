"""texinfo.py - print size / mode / alpha range of every PNG under the given roots (read-only).
python -I tools/blender/itch_monsters/texinfo.py <dir> [<dir> ...]"""
import sys, os
from PIL import Image
for root in sys.argv[1:]:
    for dp, dn, fn in os.walk(root):
        for f in sorted(fn):
            if f.lower().endswith('.png'):
                p = os.path.join(dp, f)
                im = Image.open(p); im.load()
                ex = None
                if 'A' in im.getbands():
                    ex = im.getchannel('A').getextrema()
                print('%-70s %s %s alpha=%s' % (os.path.relpath(p, root), im.size, im.mode, ex))
