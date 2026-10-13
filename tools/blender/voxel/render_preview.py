"""render_preview.py  -  headless Blender 5.2 preview passes for the voxel-PSX prototype.

Background mode only (never a window). One Blender process at a time:

  "/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
      --python tools/blender/voxel/render_preview.py -- \
      --orig ABS/characters/Knight.glb --voxel ABS/voxel/characters/Knight.glb \
      --tree ABS/voxel/nature/tree_oak_l1.glb --tree ABS/voxel/nature/tree_pine_l1.glb \
      --outdir ABS/scratch

What it does: one transparent pass per pose column (Idle, Running_A, 1H_Melee_Attack_Chop). Each pass shows only
that column's ORIGINAL / VOXEL Knight pair at the same frame; the trees appear in the last pass. Camera is an
orthographic 3/4 view (azimuth 25, elevation 12). Writes pass_<n>.png and layout.json. The labels and the
background are added by tools/blender/voxel/compose_preview.py (system Python + Pillow).

Blender is used for previews only. The voxel meshes are made by tools/voxel/voxelize_glb.py (numpy, no Blender in
the loop); docs/ART_VOXEL_PSX.md section 3.0 explains why the Remesh BLOCKS route is not used.
"""
import sys
import os
import json
import math
import argparse

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

POSES = [("Idle", 0.5), ("Running_A", 0.5), ("1H_Melee_Attack_Chop", 0.45)]
PAIR_STEP = 4.5          # metres between pose columns
PAIR_HALF = 1.1          # ORIGINAL at column_x - 1.1, VOXEL at column_x + 1.1
TREE_X = [13.5, 19.5]    # trees: oak_l1 then pine_l1
AWAY = 1000.0            # inactive items are parked this far off-frame
AZ_DEG, EL_DEG = 25.0, 12.0
ORTHO = 24.0
TARGET = Vector((10.2, 0.0, 3.6))
W, H = 2400, 1000


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="render_preview.py")
    ap.add_argument("--orig", required=True, help="original skinned GLB (Knight)")
    ap.add_argument("--voxel", required=True, help="voxel skinned GLB (Knight)")
    ap.add_argument("--tree", action="append", default=[], help="static voxel tree GLB (repeat for each tree)")
    ap.add_argument("--outdir", required=True, help="absolute folder for pass_<n>.png and layout.json")
    return ap.parse_args(argv)


def import_glb(path):
    """Import one GLB. Returns (top-level objects, armature or None, {clip name: action}) for this import only."""
    before_o = set(bpy.data.objects)
    before_a = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new_o = [o for o in bpy.data.objects if o not in before_o]
    new_a = [a for a in bpy.data.actions if a not in before_a]
    doomed = [o for o in new_o if o.name.startswith("Icosphere")]      # bone-shape artefact of the importer
    new_o = [o for o in new_o if o not in doomed]
    for o in doomed:
        bpy.data.objects.remove(o, do_unlink=True)
    rig = next((o for o in new_o if o.type == "ARMATURE"), None)
    acts = {}
    for act in new_a:
        acts.setdefault(act.name.split("|")[-1].split(".")[0], act)
    roots = [o for o in new_o if o.parent is None]
    return roots, rig, acts


def set_pose(rig, action):
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = action


def park(group, x):
    for o in group["roots"]:
        o.location.x = x + group["offset"]


def main():
    args = parse_args()
    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene

    # ---- import: one ORIGINAL and one VOXEL Knight per pose column, plus the trees
    items = []
    for p in range(len(POSES)):
        centre = p * PAIR_STEP
        o_roots, o_rig, o_acts = import_glb(args.orig)
        v_roots, v_rig, v_acts = import_glb(args.voxel)
        items.append({"kind": "orig", "col": p, "roots": o_roots, "rig": o_rig, "acts": o_acts,
                      "x": centre - PAIR_HALF, "offset": 0.0})
        items.append({"kind": "voxel", "col": p, "roots": v_roots, "rig": v_rig, "acts": v_acts,
                      "x": centre + PAIR_HALF, "offset": 0.0})
    tree_names = []
    for i, t in enumerate(args.tree):
        roots, _, _ = import_glb(t)
        tx = TREE_X[i] if i < len(TREE_X) else TREE_X[-1] + 6.0 * (i - len(TREE_X) + 1)
        items.append({"kind": "tree", "col": len(POSES) - 1, "roots": roots, "rig": None, "acts": {},
                      "x": tx, "offset": 0.0, "name": os.path.splitext(os.path.basename(t))[0]})
        tree_names.append(items[-1]["name"])

    # ---- render settings: workbench (fast), studio light, textured colour, transparent film
    try:
        sc.render.engine = "BLENDER_WORKBENCH"
    except TypeError as e:
        engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
        raise SystemExit(f"workbench engine missing: {e}; valid: {engines}")
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "TEXTURE"

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO
    cam_data.clip_start, cam_data.clip_end = 0.1, 1000.0
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    az, el = math.radians(AZ_DEG), math.radians(EL_DEG)
    cam.location = TARGET + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * 100.0
    cam.rotation_euler = (TARGET - cam.location).to_track_quat("-Z", "Y").to_euler()

    layout = {"width": W, "height": H, "passes": [], "labels": [], "title": "EFSUN voxel-PSX prototype: Knight ORIGINAL vs VOXEL (cell 0.09 m), trees oak_l1 / pine_l1"}

    for p, (pose, t) in enumerate(POSES):
        # the pose frame is taken from the ORIGINAL clip; the voxel clip has identical durations (validated)
        col_items = [it for it in items if it["kind"] in ("orig", "voxel") and it["col"] == p]
        ref_act = col_items[0]["acts"].get(pose)
        if ref_act is None:
            raise SystemExit(f"clip {pose} missing in {args.orig}; have {sorted(col_items[0]['acts'])[:12]}...")
        f0, f1 = ref_act.frame_range
        frame = int(round(f0 + t * (f1 - f0)))
        for it in items:
            if it["kind"] in ("orig", "voxel"):
                active = it["col"] == p
                if active:
                    act = it["acts"].get(pose)
                    if act is None:
                        raise SystemExit(f"clip {pose} missing for {it['kind']}")
                    set_pose(it["rig"], act)
                    if it["kind"] == "voxel" and tuple(act.frame_range) != (f0, f1):
                        print("WARN: voxel clip frame range differs", pose, act.frame_range, (f0, f1))
                it["offset"] = 0.0 if active else AWAY
            elif it["kind"] == "tree":
                active = (p == len(POSES) - 1)
                it["offset"] = 0.0 if active else AWAY
            park(it, it["x"])
        sc.frame_set(frame)
        bpy.context.view_layer.update()

        name = f"pass_{p}.png"
        sc.render.filepath = os.path.join(outdir, name)
        bpy.ops.render.render(write_still=True)
        layout["passes"].append(name)
        print("RENDERED", sc.render.filepath, "pose", pose, "frame", frame)

        # label anchors for this pass (pixel coordinates, origin top-left)
        def px(x, z):
            u, v, _ = world_to_camera_view(sc, cam, Vector((x, 0.0, z)))
            return [round(u * W, 1), round((1.0 - v) * H, 1)]
        o_x = p * PAIR_STEP - PAIR_HALF
        v_x = p * PAIR_STEP + PAIR_HALF
        layout["labels"].append({"text": "ORIGINAL", "px": px(o_x, 2.85), "col": p})
        layout["labels"].append({"text": "VOXEL", "px": px(v_x, 2.85), "col": p})
        layout["labels"].append({"text": pose, "px": px(p * PAIR_STEP, -0.55), "col": p, "kind": "pose"})

    for i, nm in enumerate(tree_names):
        tx = TREE_X[i] if i < len(TREE_X) else TREE_X[-1] + 6.0 * (i - len(TREE_X) + 1)
        height = 7.7 if "pine" in nm else 6.8
        u, v, _ = world_to_camera_view(sc, cam, Vector((tx, 0.0, height + 0.4)))
        layout["labels"].append({"text": nm + " (voxel)", "px": [round(u * W, 1), round((1.0 - v) * H, 1)], "kind": "tree"})

    with open(os.path.join(outdir, "layout.json"), "w", encoding="utf8") as f:
        json.dump(layout, f, indent=1)
    print("LAYOUT", os.path.join(outdir, "layout.json"))


if __name__ == "__main__":
    main()
