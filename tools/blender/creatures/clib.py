"""Shared helpers for the procedural PSX-style creature generator (Blender 5.x, headless).

Conventions
-----------
* Blender units = game units, Z up in Blender (exported +Y up), creatures face -Y.
* Creature's LEFT side is +X (bone suffix _l), right side is -X (_r).
* Every bone is created pointing straight up (+Z) with roll 0, so all bones share
  one rest orientation.  Animation values are written in WORLD-axis terms and
  converted to bone-local here:
      rot=(rx, ry, rz) degrees about world X (pitch, + = tip forward/down),
                                      world Y (roll,  + = tip toward +X),
                                      world Z (yaw,   + = counter-clockwise from top)
      loc=(x, y, z) world offset,  scl=(sx, sy, sz) world-axis scale.
* Meshes are rigid / gradient skinned to the armature (one skinned mesh per creature).
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

import numpy as np

FPS = 30
D2R = math.pi / 180.0


# ------------------------------------------------------------------ scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start = 0
    sc.frame_end = 60
    return sc


def mirror_name(n):
    if n is None:
        return n
    if n.endswith('_l'):
        return n[:-2] + '_r'
    if n.endswith('_r'):
        return n[:-2] + '_l'
    return n


# ------------------------------------------------------------------ parts
class Part:
    """A piece of geometry plus its skinning / texturing settings."""

    def __init__(self, verts, faces):
        self.v = [Vector(p) for p in verts]
        self.f = [tuple(f) for f in faces]
        self.bone = None        # rigid bone name
        self.wfn = None         # or weight function v -> {bone: w}
        self.tile = None        # atlas tile name
        self.tile_top = None    # tile for faces pointing up (moss, snow...)
        self.tile_bottom = None
        self.uv = 'box'         # box | cyl | cylx | cyly | face | px | py | pz
        self.mat = 'main'       # main | main2s | glow | alpha
        self.smooth = False
        self.ao = (0.8, 1.0)    # vertex colour multiplier bottom -> top of the part
        self.flip_u = False

    def copy(self):
        p = Part(self.v, self.f)
        for k, val in self.__dict__.items():
            if k not in ('v', 'f'):
                setattr(p, k, val)
        return p

    def set(self, **kw):
        for k, val in kw.items():
            setattr(self, k, val)
        return self

    def move(self, x=0.0, y=0.0, z=0.0):
        d = Vector((x, y, z))
        self.v = [v + d for v in self.v]
        return self

    def scale(self, x, y=None, z=None, pivot=(0, 0, 0)):
        y = x if y is None else y
        z = x if z is None else z
        P = Vector(pivot)
        self.v = [Vector(((v.x - P.x) * x + P.x, (v.y - P.y) * y + P.y, (v.z - P.z) * z + P.z)) for v in self.v]
        if x * y * z < 0:
            self.f = [tuple(reversed(f)) for f in self.f]
        return self

    def rot(self, x=0.0, y=0.0, z=0.0, pivot=(0, 0, 0), order='XYZ'):
        M = Euler((x * D2R, y * D2R, z * D2R), order).to_matrix()
        P = Vector(pivot)
        self.v = [M @ (v - P) + P for v in self.v]
        return self

    def deform(self, fn):
        self.v = [Vector(fn(v)) for v in self.v]
        return self

    def mirrored(self):
        p = self.copy()
        p.v = [Vector((-v.x, v.y, v.z)) for v in self.v]
        p.f = [tuple(reversed(f)) for f in self.f]
        p.bone = mirror_name(self.bone)
        if self.wfn is not None:
            orig = self.wfn
            p.wfn = lambda v, o=orig: {mirror_name(k): w for k, w in o(Vector((-v.x, v.y, v.z))).items()}
        return p

    def bbox(self):
        xs = [v.x for v in self.v]; ys = [v.y for v in self.v]; zs = [v.z for v in self.v]
        return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def sym(part):
    """Return [part, mirrored part]."""
    return [part, part.mirrored()]


def merge(*parts):
    """Merge geometry of several parts into one (settings from the first)."""
    v, f = [], []
    for p in parts:
        off = len(v)
        v += p.v
        f += [tuple(i + off for i in face) for face in p.f]
    out = parts[0].copy()
    out.v, out.f = [Vector(x) for x in v], f
    return out


# ------------------------------------------------------------------ primitives
def rings_part(rings, cap0=True, cap1=True):
    """Build a tube from a list of rings (list of points; a 1-point ring is a pole)."""
    verts, faces, idx = [], [], []
    for r in rings:
        idx.append(list(range(len(verts), len(verts) + len(r))))
        verts += [Vector(p) for p in r]
    for a, b in zip(idx[:-1], idx[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            n = len(b)
            faces += [(a[0], b[(i + 1) % n], b[i]) for i in range(n)]
        elif len(b) == 1:
            n = len(a)
            faces += [(a[i], a[(i + 1) % n], b[0]) for i in range(n)]
        else:
            n = len(a)
            faces += [(a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]) for i in range(n)]
    if cap0 and len(idx[0]) > 2:
        faces.append(tuple(reversed(idx[0])))
    if cap1 and len(idx[-1]) > 2:
        faces.append(tuple(idx[-1]))
    return Part(verts, faces)


def ring_pts(c, r, segs, sx=1.0, sy=1.0, phase=math.pi / 2, axis='z'):
    c = Vector(c)
    pts = []
    for i in range(segs):
        a = phase + 2 * math.pi * i / segs
        ca, sa = math.cos(a) * r * sx, math.sin(a) * r * sy
        if axis == 'z':
            pts.append(c + Vector((ca, sa, 0)))
        elif axis == 'y':   # ring in XZ plane (sx -> X, sy -> Z)
            pts.append(c + Vector((ca, 0, sa)))
        else:               # ring in YZ plane
            pts.append(c + Vector((0, ca, sa)))
    return pts


def lathe(profile, segs=8, sx=1.0, sy=1.0, center=(0, 0, 0), phase=math.pi / 2, vfn=None, cap0=True, cap1=True):
    """Revolve profile [(r, z), ...] around Z.  r == 0 -> pole.  vfn(ring_i, seg_i, Vector)->Vector."""
    c = Vector(center)
    rings = []
    for ri, (r, z) in enumerate(profile):
        if r <= 1e-6:
            ring = [c + Vector((0, 0, z))]
        else:
            ring = ring_pts(c + Vector((0, 0, z)), r, segs, sx, sy, phase)
        if vfn:
            ring = [Vector(vfn(ri, si, p)) for si, p in enumerate(ring)]
        rings.append(ring)
    return rings_part(rings, cap0, cap1)


def sphere(r, segs=8, rings=5, center=(0, 0, 0), sx=1.0, sy=1.0, sz=1.0, vfn=None):
    prof = [(0.0, -r)]
    for i in range(1, rings):
        th = math.pi * i / rings
        prof.append((r * math.sin(th), -r * math.cos(th)))
    prof.append((0.0, r))
    p = lathe(prof, segs, vfn=vfn)
    p.scale(sx, sy, sz)
    return p.move(*center)


def loft(sections, segs=8, phase=math.pi / 2, cap0=True, cap1=True, vfn=None):
    """Horizontal loft along Y.  sections = [(y, cx, cz, rx, rz), ...]; rx==0 -> pole."""
    rings = []
    for ri, (y, cx, cz, rx, rz) in enumerate(sections):
        if rx <= 1e-6:
            ring = [Vector((cx, y, cz))]
        else:
            ring = [Vector((cx + math.cos(phase + 2 * math.pi * i / segs) * rx, y,
                            cz + math.sin(phase + 2 * math.pi * i / segs) * rz)) for i in range(segs)]
        if vfn:
            ring = [Vector(vfn(ri, si, p)) for si, p in enumerate(ring)]
        rings.append(ring)
    return rings_part(rings, cap0, cap1)


def box(sx, sy, sz, center=(0, 0, 0), taper=(1.0, 1.0), shift=(0.0, 0.0)):
    """Box centred at center; top face scaled by taper (x, y) and shifted by shift (x, y)."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    tx, ty = taper
    bx, by = shift
    v = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
         (-hx * tx + bx, -hy * ty + by, hz), (hx * tx + bx, -hy * ty + by, hz),
         (hx * tx + bx, hy * ty + by, hz), (-hx * tx + bx, hy * ty + by, hz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return Part(v, f).move(*center)


def _from_bm(bm):
    bm.verts.index_update()
    v = [x.co.copy() for x in bm.verts]
    f = [tuple(x.index for x in face.verts) for face in bm.faces]
    return Part(v, f)


def rock(sx, sy, sz, center=(0, 0, 0), bevel=0.25, jitter=0.04, seed=0, taper=(1.0, 1.0), shift=(0, 0)):
    """Chamfered, jittered box -> chunky low-poly rock (~44 tris)."""
    p = box(sx, sy, sz, (0, 0, 0), taper, shift)
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in p.v]
    for f in p.f:
        bm.faces.new([vs[i] for i in f])
    m = min(sx, sy, sz)
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=m * bevel * 0.5,
                    segments=1, affect='EDGES', profile=0.5)
    rng = np.random.default_rng(seed)
    for v in bm.verts:
        v.co += Vector(rng.uniform(-1, 1, 3)) * jitter
    out = _from_bm(bm)
    bm.free()
    return out.move(*center)


def limb(a, b, r1, r2=None, segs=4, phase=math.pi / 4, cap=True, sx=1.0, sy=1.0, mid=None):
    """Tapered prism from point a to b (r2 == 0 -> pointy cone).  mid=[(t, r), ...] extra rings."""
    a, b = Vector(a), Vector(b)
    r2 = r1 if r2 is None else r2
    d = b - a
    L = d.length
    prof = [(r1, 0.0)]
    for t, r in (mid or []):
        prof.append((r, t * L))
    prof.append((r2, L))
    p = lathe(prof, segs, sx, sy, phase=phase, cap0=cap, cap1=cap)
    q = d.normalized().to_track_quat('Z', 'Y')
    M = q.to_matrix()
    p.v = [M @ v + a for v in p.v]
    return p


def cone(a, b, r, segs=4, phase=math.pi / 4):
    return limb(a, b, r, 0.0, segs, phase)


def crystal(a, b, r, segs=5, tip=0.3, base=0.12, phase=math.pi / 2, twist=0.0):
    """Elongated crystal shard from a (base point) to b (tip)."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    prof = [(0.0, 0.0), (r, base * L), (r * 0.92, (1 - tip) * L), (0.0, L)]
    p = lathe(prof, segs, phase=phase + twist)
    q = (b - a).normalized().to_track_quat('Z', 'Y')
    M = q.to_matrix()
    p.v = [M @ v + a for v in p.v]
    return p


def poly(points):
    """Single flat polygon (fan triangulated) e.g. wing membranes."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    faces = [(0, i, i + 1) for i in range(1, n - 1)]
    return Part(pts, faces)


def strip(points_a, points_b):
    """Quad strip between two polylines (open surface)."""
    v = [Vector(p) for p in points_a] + [Vector(p) for p in points_b]
    n = len(points_a)
    f = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
    return Part(v, f)


# ------------------------------------------------------------------ weights
def wgrad(bone_a, bone_b, axis, t0, t1):
    """Linear blend from bone_a (coord <= t0) to bone_b (coord >= t1) along axis 0/1/2."""
    def fn(v):
        t = (v[axis] - t0) / (t1 - t0)
        t = max(0.0, min(1.0, t))
        t = t * t * (3 - 2 * t)
        if t <= 0.001:
            return {bone_a: 1.0}
        if t >= 0.999:
            return {bone_b: 1.0}
        return {bone_a: 1 - t, bone_b: t}
    return fn


def wchain(bones_coords, axis):
    """Blend along a chain: [(bone, coord), ...] sorted by coord."""
    def fn(v):
        c = v[axis]
        if c <= bones_coords[0][1]:
            return {bones_coords[0][0]: 1.0}
        for (ba, ca), (bb, cb) in zip(bones_coords[:-1], bones_coords[1:]):
            if c <= cb:
                t = (c - ca) / (cb - ca)
                t = t * t * (3 - 2 * t)
                return {ba: 1 - t, bb: t} if ba != bb else {ba: 1.0}
        return {bones_coords[-1][0]: 1.0}
    return fn


# ------------------------------------------------------------------ texture / materials
def make_image(name, atlas):
    s = atlas.size
    img = bpy.data.images.new(name, s, s, alpha=True)
    img.pixels.foreach_set(np.clip(atlas.img, 0, 1).astype(np.float32).ravel())
    img.update()
    img.pack()
    return img


def _principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def _socket(node, name, kind=None, out=False):
    socks = node.outputs if out else node.inputs
    for s in socks:
        if s.name == name and (kind is None or s.type == kind):
            return s
    raise KeyError(name)


def make_material(name, img, kind='main', emit=2.0, vcol=True):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = _principled(mat)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Closest'
    tex.location = (-700, 200)
    col_out = tex.outputs['Color']
    if vcol:
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        attr.location = (-700, -100)
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.location = (-400, 150)
        _socket(mix, 'Factor', 'VALUE').default_value = 1.0
        nt.links.new(tex.outputs['Color'], _socket(mix, 'A', 'RGBA'))
        nt.links.new(attr.outputs['Color'], _socket(mix, 'B', 'RGBA'))
        col_out = _socket(mix, 'Result', 'RGBA', out=True)
    nt.links.new(col_out, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Metallic'].default_value = 0.0
    mat.use_backface_culling = kind in ('main', 'glow')
    if kind == 'glow':
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit
    if kind == 'alpha':
        nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        try:
            mat.surface_render_method = 'BLENDED'
        except Exception:
            pass
    return mat


# ------------------------------------------------------------------ mesh assembly
def _face_uv(mode, co, n, bmin, bmax, center, flip_u):
    size = bmax - bmin
    sx, sy, sz = max(size.x, 1e-6), max(size.y, 1e-6), max(size.z, 1e-6)
    out = []
    if mode == 'face':
        nn = n.normalized()
        up = Vector((0, 0, 1)) if abs(nn.z) < 0.7 else Vector((0, 1, 0))
        t = up.cross(nn).normalized()
        b = nn.cross(t).normalized()
        pu = [p.dot(t) for p in co]
        pv = [p.dot(b) for p in co]
        u0, u1, v0, v1 = min(pu), max(pu), min(pv), max(pv)
        return [((a - u0) / max(u1 - u0, 1e-6), (c - v0) / max(v1 - v0, 1e-6)) for a, c in zip(pu, pv)]
    if mode == 'box':
        ax = max(range(3), key=lambda i: abs(n[i]))
        mode = ('px', 'py', 'pz')[ax]
    for p in co:
        if mode == 'px':
            u, v = (p.y - bmin.y) / sy, (p.z - bmin.z) / sz
            if n.x < 0:
                u = 1 - u
        elif mode == 'py':
            u, v = (p.x - bmin.x) / sx, (p.z - bmin.z) / sz
            if n.y > 0:
                u = 1 - u
        elif mode == 'pz':
            u, v = (p.x - bmin.x) / sx, 1 - (p.y - bmin.y) / sy
        elif mode == 'cyl':
            ang = math.atan2(p.x - center.x, -(p.y - center.y))
            u, v = abs(ang) / math.pi, (p.z - bmin.z) / sz
        elif mode == 'cyly':   # horizontal body along Y; v=1 on the back, 0 on the belly
            ang = math.atan2(p.x - center.x, p.z - center.z)
            u, v = (p.y - bmin.y) / sy, 1 - abs(ang) / math.pi
        elif mode == 'cylx':
            ang = math.atan2(p.y - center.y, p.z - center.z)
            u, v = (p.x - bmin.x) / sx, 1 - abs(ang) / math.pi
        else:
            raise ValueError(mode)
        out.append((u, v))
    if flip_u:
        out = [(1 - u, v) for u, v in out]
    return out


def build_mesh(name, parts, atlas, materials, arm_obj, bone_names):
    """Assemble parts into a single skinned mesh object parented to arm_obj."""
    verts, faces, fpart = [], [], []
    for pi, p in enumerate(parts):
        off = len(verts)
        verts += [(v.x, v.y, max(v.z, 0.0)) for v in p.v]   # nothing below the ground plane
        for f in p.f:
            faces.append(tuple(i + off for i in f))
            fpart.append(pi)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    # consistent outward normals per part
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    groups = {}
    for fi, pi in enumerate(fpart):
        groups.setdefault(pi, []).append(bm.faces[fi])
    for pi, fl in groups.items():
        bmesh.ops.recalc_face_normals(bm, faces=fl)
    bm.to_mesh(me)
    bm.free()
    me.update()

    mat_keys = list(materials.keys())
    for k in mat_keys:
        me.materials.append(materials[k])
    uvl = me.uv_layers.new(name='UVMap')
    col = me.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')
    pbox = [p.bbox() for p in parts]
    for poly in me.polygons:
        p = parts[fpart[poly.index]]
        bmin, bmax = pbox[fpart[poly.index]]
        center = (bmin + bmax) * 0.5
        n = poly.normal
        tile, mode = p.tile, p.uv
        if p.tile_top and n.z > 0.6:
            tile, mode = p.tile_top, getattr(p, 'uv_top', None) or p.uv
        elif p.tile_bottom and n.z < -0.6:
            tile, mode = p.tile_bottom, getattr(p, 'uv_bottom', None) or p.uv
        u0, v0, u1, v1 = atlas.uv_rect(tile)
        co = [me.vertices[me.loops[li].vertex_index].co for li in poly.loop_indices]
        uvs = _face_uv(mode, co, n, bmin, bmax, center, p.flip_u)
        hz = max(bmax.z - bmin.z, 1e-6)
        for li, (u, v), c in zip(poly.loop_indices, uvs, co):
            u = min(max(u, 0.0), 1.0)
            v = min(max(v, 0.0), 1.0)
            uvl.data[li].uv = (u0 + u * (u1 - u0), v0 + v * (v1 - v0))
            a = p.ao[0] + (p.ao[1] - p.ao[0]) * (c.z - bmin.z) / hz
            col.data[li].color = (a, a, a, 1.0)
        poly.material_index = mat_keys.index(p.mat)
        poly.use_smooth = p.smooth

    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    # vertex groups
    vg = {b: obj.vertex_groups.new(name=b) for b in bone_names}
    vi = 0
    for p in parts:
        for v in p.v:
            w = p.wfn(v) if p.wfn else {p.bone: 1.0}
            for b, wt in w.items():
                if wt > 0:
                    vg[b].add([vi], wt, 'REPLACE')
            vi += 1
    obj.parent = arm_obj
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm_obj
    return obj


def tri_count(parts):
    return sum(len(f) - 2 for p in parts for f in p.f)


# ------------------------------------------------------------------ armature
def make_armature(bones, length=0.12):
    """bones: [(name, head_xyz, parent_or_None), ...]  all bones point +Z, roll 0."""
    arm = bpy.data.armatures.new('Rig')
    obj = bpy.data.objects.new('Rig', arm)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for name, head, parent in bones:
        b = arm.edit_bones.new(name)
        b.head = Vector(head)
        b.tail = Vector(head) + Vector((0, 0, length))
        b.roll = 0.0
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        eb[name] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in obj.pose.bones:
        pb.rotation_mode = 'XYZ'
    return obj


# ------------------------------------------------------------------ animation
REST = {'rot': (0.0, 0.0, 0.0), 'loc': (0.0, 0.0, 0.0), 'scl': (1.0, 1.0, 1.0)}


class Act:
    """Collects keyframes for one action in world-axis terms."""

    def __init__(self, name, frames, loop=True):
        self.name, self.n, self.loop = name, int(frames), loop
        self.ch = {}

    def key(self, f, bone, rot=None, loc=None, scl=None):
        for kind, val in (('rot', rot), ('loc', loc), ('scl', scl)):
            if val is not None:
                if isinstance(val, (int, float)):
                    val = (val, val, val)
                self.ch.setdefault((bone, kind), {})[int(round(f))] = tuple(float(x) for x in val)
        return self

    def keys(self, bone, kind, frames_vals):
        for f, val in frames_vals:
            self.key(f, bone, **{kind: val})
        return self

    def wave(self, bone, fn, step=2):
        """fn(t in [0,1]) -> dict(rot=, loc=, scl=); sampled every `step` frames incl. both ends."""
        frames = list(range(0, self.n, step)) + [self.n]
        for f in frames:
            self.key(f, bone, **fn(f / self.n))
        return self

    def pose(self, f, poses):
        """poses: {bone: dict(rot=.., loc=.., scl=..)}"""
        for b, d in poses.items():
            self.key(f, b, **d)
        return self

    def at(self, f, **bones):
        """at(10, spine=(-15, 0, 0), hips=dict(loc=(0, 0, -.1)))  -- a bare tuple means rot."""
        for b, d in bones.items():
            if isinstance(d, dict):
                self.key(f, b, **d)
            else:
                self.key(f, b, rot=d)
        return self

    def rest(self, f, *bones):
        for b in bones:
            self.key(f, b, rot=REST['rot'], loc=REST['loc'], scl=REST['scl'])
        return self


def _to_local(kind, val):
    x, y, z = val
    if kind == 'rot':
        return (x * D2R, z * D2R, -y * D2R)
    if kind == 'loc':
        return (x, z, -y)
    return (x, z, y)


_PATH = {'rot': 'rotation_euler', 'loc': 'location', 'scl': 'scale'}


def _action_fcurves(action):
    fcs = []
    try:
        for layer in action.layers:
            for st in layer.strips:
                for cb in st.channelbags:
                    fcs.extend(cb.fcurves)
        if fcs:
            return fcs
    except AttributeError:
        pass
    try:
        return list(action.fcurves)
    except AttributeError:
        return []


def commit_actions(arm_obj, acts):
    ad = arm_obj.animation_data_create()
    pbs = arm_obj.pose.bones
    for act in acts:
        action = bpy.data.actions.new(act.name)
        action.use_fake_user = True
        ad.action = action
        for pb in pbs:
            for kind in ('rot', 'loc', 'scl'):
                keys = act.ch.get((pb.name, kind))
                if not keys:
                    keys = {0: REST[kind], act.n: REST[kind]}
                else:
                    keys = dict(keys)
                    if 0 not in keys:
                        keys[0] = REST[kind]
                    if act.n not in keys and act.loop:
                        keys[act.n] = keys[0]
                for f, val in sorted(keys.items()):
                    setattr(pb, _PATH[kind], _to_local(kind, val))
                    pb.keyframe_insert(_PATH[kind], frame=f, group=pb.name)
        action.use_frame_range = True
        action.frame_start = 0
        action.frame_end = act.n
        try:
            action.use_cyclic = act.loop
        except Exception:
            pass
        for fc in _action_fcurves(action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'BEZIER'
                kp.handle_left_type = 'AUTO_CLAMPED'
                kp.handle_right_type = 'AUTO_CLAMPED'
            fc.update()
        ad.action = None
        tr = ad.nla_tracks.new()
        tr.name = act.name
        tr.strips.new(act.name, 0, action)
    # reset pose
    for pb in pbs:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def set_action(arm_obj, name, frame):
    """Preview helper: evaluate one action at a frame (NLA tracks muted)."""
    ad = arm_obj.animation_data
    for tr in ad.nla_tracks:
        tr.mute = True
    ad.action = bpy.data.actions[name]
    try:
        if ad.action_slot is None and len(ad.action.slots):
            ad.action_slot = ad.action.slots[0]
    except AttributeError:
        pass
    bpy.context.scene.frame_set(int(frame))


# ------------------------------------------------------------------ export
def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_skins=True,
        export_morph=False, export_def_bones=False, export_force_sampling=True,
        export_optimize_animation_size=True, export_frame_step=1, export_reset_pose_bones=True,
        export_rest_position_armature=True, export_image_format='AUTO', export_materials='EXPORT',
        export_vertex_color='MATERIAL', export_texcoords=True, export_normals=True,
        export_tangents=False, export_cameras=False, export_lights=False, export_extras=False,
        export_leaf_bone=False, export_anim_slide_to_zero=False)


class Creature:
    """Container returned by every creature module's build()."""

    def __init__(self, cid, bones, parts, atlas, acts, emit=2.0, meta=None):
        self.id, self.bones, self.parts, self.atlas, self.acts = cid, bones, parts, atlas, acts
        self.emit = emit
        self.meta = meta or {}


def realize(cr, out_path, vcol=True):
    """Build Blender data for a Creature and export it as GLB.  Returns stats dict."""
    reset_scene()
    arm = make_armature(cr.bones, length=cr.meta.get('bone_len', 0.12))
    img = make_image(cr.id + '_tex', cr.atlas)
    used = []
    for p in cr.parts:
        if p.mat not in used:
            used.append(p.mat)
        for t in (p.tile, p.tile_top, p.tile_bottom):
            if t is not None and t not in cr.atlas.rects:
                raise KeyError('%s: unknown tile %r' % (cr.id, t))
    order = [k for k in ('main', 'main2s', 'glow', 'alpha') if k in used]
    mats = {k: make_material('%s_%s' % (cr.id, k), img, k, cr.emit, vcol) for k in order}
    names = [b[0] for b in cr.bones]
    obj = build_mesh(cr.id, cr.parts, cr.atlas, mats, arm, names)
    commit_actions(arm, cr.acts)
    export_glb(out_path)
    return {'id': cr.id, 'tris': tri_count(cr.parts), 'bones': len(names),
            'actions': [a.name for a in cr.acts], 'materials': order}
