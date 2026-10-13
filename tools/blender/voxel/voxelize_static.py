#!/usr/bin/env python
"""voxelize_static.py  -  voxel conversion of static models: props, buildings, weapons, kit pieces (docs/ART_VOXEL_PSX.md 3.3).

Thin entry point: runs the validated numpy engine tools/voxel/voxelize_glb.py under system Python (-I) with --static.
This is NOT a Blender script. Blender is only used for previews (render_preview.py). Flags pass through unchanged:

  python -I tools/blender/voxel/voxelize_static.py public/assets/models/gen/props/chest_wood.glb \
      public/assets/models/voxel/gen/props/chest_wood.glb --cell 0.08 --keep "flame|fire_fx|grass|flowers|vine|leaf"

Trees are NOT voxelised from their sources: the canonical set comes from tools/voxel/gen_nature.py (spec 2.2).
"""
import os
import subprocess
import sys

ENGINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "voxel", "voxelize_glb.py"))


def main():
    args = sys.argv[1:]
    if "--static" not in args:
        args = ["--static"] + args
    if not os.path.exists(ENGINE):
        sys.exit("engine missing: " + ENGINE)
    sys.exit(subprocess.call([sys.executable, "-I", ENGINE] + args))


if __name__ == "__main__":
    main()
