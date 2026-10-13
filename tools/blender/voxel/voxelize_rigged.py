#!/usr/bin/env python
"""voxelize_rigged.py  -  voxel conversion of rigged (skinned) characters, creatures and bosses (docs/ART_VOXEL_PSX.md 3.2).

Thin entry point: runs the validated numpy engine tools/voxel/voxelize_glb.py under system Python (-I).
This is NOT a Blender script. Blender is only used for previews (render_preview.py). Flags pass through unchanged:

  python -I tools/blender/voxel/voxelize_rigged.py public/assets/models/characters/Knight.glb \
      public/assets/models/voxel/characters/Knight.glb --cell 0.09 --overlay "(Helmet|Hat|Hood)$"

Skins, joints, node names, hierarchy, TRS and all animation clips are copied untouched by the engine.
"""
import os
import subprocess
import sys

ENGINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "voxel", "voxelize_glb.py"))


def main():
    args = sys.argv[1:]
    if "--static" in args:
        sys.exit("voxelize_rigged.py is for skinned models; use voxelize_static.py for --static (props, trees, buildings)")
    if not os.path.exists(ENGINE):
        sys.exit("engine missing: " + ENGINE)
    sys.exit(subprocess.call([sys.executable, "-I", ENGINE] + args))


if __name__ == "__main__":
    main()
