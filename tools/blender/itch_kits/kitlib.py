"""kitlib.py - shared helpers for converting third-party itch.io kits to PSX-ready GLBs.

Runs inside headless Blender 5.2. Scale contract (ARCHITECTURE.md rule 7): 1 unit = 1 m-ish,
KayKit hero ~2.4 tall, dungeon tile 4x4, +Y up, models face +Z.  In Blender terms (Z-up) that is:
front of a model faces -Y (exported glTF +Z), origin at bottom centre unless a piece needs otherwise.

Untrusted source files are only *read* (imported) here; nothing from the archives is executed.
"""
import bpy, os, sys, json, math
from mathutils import Vector, Matrix


def args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(coll):
            try:
                coll.remove(d)
            except Exception:
                pass


def import_any(path):
    before = set(bpy.data.objects)
    ext = os.path.splitext(path)[1].lower()
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=path)
    elif ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise ValueError('unsupported ' + path)
    return [o for o in bpy.data.objects if o not in before]


def bake_and_clean(objs=None):
    """Bake every mesh's world transform into its vertices, unparent, delete non-mesh junk
    (cameras, lights, empties). Returns the remaining mesh objects."""
    objs = list(objs if objs is not None else bpy.context.scene.objects)
    # static kits: drop stray actions (some source GLBs carry leftover object animations that would
    # re-apply the old transform on depsgraph evaluation)
    for o in objs:
        if o.animation_data:
            o.animation_data_clear()
    meshes = [o for o in objs if o.type == 'MESH']
    # make mesh data single user so baking one instance does not move another
    seen = set()
    for o in meshes:
        if o.data.name in seen or o.data.users > 1:
            o.data = o.data.copy()
        seen.add(o.data.name)
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        if mw.determinant() < 0:
            o.data.flip_normals()
        o.matrix_world = Matrix.Identity(4)
        o.data.update()
    for o in objs:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()   # the glTF exporter reads evaluated (depsgraph) transforms
    return meshes


def bounds(objs):
    mn = Vector((1e18,) * 3)
    mx = Vector((-1e18,) * 3)
    for o in objs:
        if o.type != 'MESH':
            continue
        mw = o.matrix_world
        for v in o.data.vertices:
            w = mw @ v.co
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def xform(objs, M):
    for o in objs:
        o.data.transform(M)
        if M.determinant() < 0:
            o.data.flip_normals()
        o.data.update()


def repivot(objs, mode='bottom', keep_z=False, scale=1.0, extra=None):
    """Move geometry so the pivot lands at the origin, then scale uniformly.
    mode: 'bottom' (centre x/y, min z), 'top' (centre x/y, max z, for hanging pieces),
          'center' (bbox centre), 'back' (centre x, max y = back face, min z),
          'origin' (leave as is), or a Vector giving the pivot point in source units.
    keep_z: keep the source height (only recentre x/y)."""
    mn, mx = bounds(objs)
    c = (mn + mx) / 2
    if isinstance(mode, Vector):
        p = mode.copy()
    elif mode == 'bottom':
        p = Vector((c.x, c.y, mn.z))
    elif mode == 'top':
        p = Vector((c.x, c.y, mx.z))
    elif mode == 'center':
        p = c.copy()
    elif mode == 'back':
        p = Vector((c.x, mx.y, mn.z))
    elif mode == 'origin':
        p = Vector((0, 0, 0))
    else:
        raise ValueError(mode)
    if keep_z:
        p.z = 0
    M = Matrix.Scale(scale, 4) @ Matrix.Translation(-p)
    if extra is not None:
        M = extra @ M
    xform(objs, M)


def load_image(path):
    for im in bpy.data.images:
        if im.filepath and os.path.normcase(bpy.path.abspath(im.filepath)) == os.path.normcase(path):
            return im
    im = bpy.data.images.load(path)
    im.name = os.path.splitext(os.path.basename(path))[0]
    return im


_matcache = {}


def psx_material(name, img_path=None, alpha='OPAQUE', color=(1, 1, 1, 1), double_sided=False, emissive=None):
    """Plain PSX-friendly material: texture (nearest) -> base colour, metallic 0, roughness 1.
    alpha: 'OPAQUE' | 'CLIP' (exported as glTF MASK, cutoff 0.5) | 'BLEND'."""
    key = (name, img_path, alpha, tuple(color), double_sided, emissive)
    if key in _matcache and _matcache[key].name in bpy.data.materials:
        return _matcache[key]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Metallic'].default_value = 0.0
    p.inputs['Roughness'].default_value = 1.0
    try:
        p.inputs['Specular IOR Level'].default_value = 0.5  # glTF default: no KHR_materials_specular
    except Exception:
        pass
    p.inputs['Base Color'].default_value = color
    if img_path:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = load_image(img_path)
        t.interpolation = 'Closest'
        t.location = (-500, 200)
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
        if alpha == 'CLIP':
            r = nt.nodes.new('ShaderNodeMath')
            r.operation = 'ROUND'
            r.location = (-250, -100)
            nt.links.new(t.outputs['Alpha'], r.inputs[0])
            nt.links.new(r.outputs[0], p.inputs['Alpha'])
        elif alpha == 'BLEND':
            nt.links.new(t.outputs['Alpha'], p.inputs['Alpha'])
        if emissive:
            nt.links.new(t.outputs['Color'], p.inputs['Emission Color'])
            p.inputs['Emission Strength'].default_value = emissive
    m.use_backface_culling = not double_sided
    try:
        if alpha == 'BLEND':
            m.surface_render_method = 'BLENDED'
    except Exception:
        pass
    _matcache[key] = m
    return m


def set_material(objs, mat):
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)


def join(objs, name):
    objs = [o for o in objs if o.type == 'MESH']
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def cleanup_mesh(o, merge=0.0):
    """Remove unused material slots; optionally merge by distance."""
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    try:
        bpy.ops.object.material_slot_remove_unused()
    except Exception:
        pass
    if merge > 0:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=merge)
        bpy.ops.object.mode_set(mode='OBJECT')


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            n += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return n


def export_glb(path, objs, anim=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
              export_vertex_color='NONE', export_animations=anim, export_image_format='AUTO',
              export_cameras=False, export_lights=False, export_extras=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_vertex_color', None)
        bpy.ops.export_scene.gltf(**kw)
    mn, mx = bounds(objs)
    # report in glTF axes: x, y(up)=blender z, z=-blender y
    return {
        'file': path.replace('\\', '/'),
        'bytes': os.path.getsize(path),
        'tris': tri_count(objs),
        'nodes': [o.name for o in objs],
        'size': [round(mx.x - mn.x, 3), round(mx.z - mn.z, 3), round(mx.y - mn.y, 3)],
        'min': [round(mn.x, 3), round(mn.z, 3), round(-mx.y, 3)],
        'max': [round(mx.x, 3), round(mx.z, 3), round(-mn.y, 3)],
        'materials': sorted({s.material.name for o in objs for s in o.material_slots if s.material}),
    }


def save_report(path, items):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as fh:
        json.dump(items, fh, indent=1)


def snake(s):
    import re
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s)
    s = re.sub(r'[^A-Za-z0-9]+', '_', s).strip('_').lower()
    return re.sub(r'_+', '_', s)


# ---------------------------------------------------------------------------
# texture PSX-ification (delegates to tex_tool.py running under system Python + Pillow)
# ---------------------------------------------------------------------------
import subprocess, shutil

_HERE = os.path.dirname(os.path.abspath(__file__))
_texcache = {}


def _py():
    p = os.environ.get('PSX_PY') or shutil.which('python') or shutil.which('python3')
    if not p:
        raise RuntimeError('system python with Pillow not found (set PSX_PY)')
    return p


def psx_tex(src, out, max_px, box=None, opaque=False):
    key = (os.path.normcase(src), max_px, tuple(round(b, 4) for b in box) if box else None, opaque)
    if key in _texcache:
        return _texcache[key]
    cmd = [_py(), '-I', os.path.join(_HERE, 'tex_tool.py'), src, out, str(max_px)]
    if box:
        cmd += ['%.6f' % b for b in box]
    if opaque:
        cmd.append('--opaque')
    r = subprocess.run(cmd, capture_output=True, text=True)
    line = next((l for l in r.stdout.splitlines() if l.startswith('TEXJSON ')), None)
    if not line:
        raise RuntimeError('tex_tool failed: %s %s' % (r.stdout, r.stderr))
    info = json.loads(line[8:])
    _texcache[key] = info
    return info


def uv_box(objs):
    u0 = v0 = 1e9
    u1 = v1 = -1e9
    for o in objs:
        if o.type != 'MESH' or not o.data.uv_layers:
            continue
        uvl = o.data.uv_layers.active.data
        for d in uvl:
            u, v = d.uv
            u0 = min(u0, u); v0 = min(v0, v); u1 = max(u1, u); v1 = max(v1, v)
    return u0, v0, u1, v1


def remap_uvs(objs, crop_px, src_wh):
    x0, y0, x1, y1 = crop_px
    W, H = src_wh
    cw, ch = x1 - x0, y1 - y0
    for o in objs:
        if o.type != 'MESH' or not o.data.uv_layers:
            continue
        for d in o.data.uv_layers.active.data:
            u, v = d.uv
            nu = (u * W - x0) / cw
            nv = 1 - ((1 - v) * H - y0) / ch
            d.uv = (nu, nv)


def cropped_texture(objs, src, out, max_px, min_gain=0.75, opaque=False):
    """Crop the atlas `src` to the UV footprint of `objs` (if all UVs are inside 0..1 and the crop
    saves enough area) and remap their UVs; otherwise just downscale the whole atlas.
    Returns tex_tool info (with 'cropped' flag)."""
    u0, v0, u1, v1 = uv_box(objs)
    tol = 0.003
    if u0 >= -tol and v0 >= -tol and u1 <= 1 + tol and v1 <= 1 + tol and (u1 - u0) * (v1 - v0) < min_gain:
        box = (max(0, u0), max(0, v0), min(1, u1), min(1, v1))
        info = dict(psx_tex(src, out, max_px, box, opaque))
        remap_uvs(objs, info['crop_px'], info['src_wh'])
        info['cropped'] = True
        return info
    full = os.path.join(os.path.dirname(out), snake(os.path.splitext(os.path.basename(src))[0]) + '.png')
    info = dict(psx_tex(src, full, max_px, None, opaque))
    info['cropped'] = False
    return info
