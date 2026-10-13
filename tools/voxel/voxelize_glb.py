#!/usr/bin/env python
"""voxelize_glb.py  -  GLB/glTF -> Voxel-PSX GLB, rig preserving.   system Python + numpy + Pillow only (no Blender needed).   Run with: python -I voxelize_glb.py ...

  python -I voxelize_glb.py IN.glb OUT.glb --cell 0.09 [--colors 24] [--weights rigid|blend] [--overlay RE] [--global-acc RE] [--scale-bone RE=f]
                            [--static] [--keep RE] [--blur N] [--shrink 1.0] [--no-variation] [--report out.json]

  --cell        voxel edge in the FILE's own units (metres of the glTF).  native_cell = game_cell / in_game_scale.
  --weights     rigid (default): every voxel follows ONE bone (its dominant one) -> cubes never shear.  blend: up to 4 bones (slimes, ooze, robes, tails).
  --overlay     regex of toggleable parts (helmets, hats, cloaks): voxelised against their own solid so hiding them reveals a complete body.
  --global-acc  regex of the bone NAMES whose rigid accessories join the world grid (default head|chest|spine|hips|neck); other accessories (held items) get their own local grid.
  --scale-bone  proportion lever, e.g. '^head$=0.85' scales everything owned by that bone around the bone origin BEFORE voxelising.
  --static      model without a skin: all non-animated mesh nodes share one world grid (props, buildings, weapons).  Nodes named in an animation, or matching the
                animated-name regex (door|lid|wheel|flame|...), keep their own local grid so game code can still move them.
  --keep        regex of nodes copied through untouched (alpha cards: flames, grass, flowers).
  --blur        box-filter radius (texels) applied to the source texture before sampling (painted textures: 1; flat swatch textures: 0).
  --no-cull-bottom  static models drop the -Y faces of their lowest voxel layer by default (they stand on the ground); this keeps them.
  --shrink      SAT box scale. 1.0 = conservative (watertight). 0.8 slims the result ~9 % but leaks on thin parts (<0.75 is unsafe).

What stays untouched : nodes (names, hierarchy, TRS), skins (joints, inverse bind matrices), animations, extras.
What is replaced     : the primitives of every voxelised mesh + their materials/textures.  Output positions are written back in the
                       original skinning space:  p_out = (sum_j w_j * W_j * IBM_j)^-1 * q   (q = voxel corner in rest-pose world space).
"""
import sys, os, re, json, struct, io, time, argparse
import numpy as np
from PIL import Image, ImageFilter

# ======================================================================================================== GLB io
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<III', b, 0)
    assert magic == 0x46546C67, 'not a .glb'
    off, js, bin_ = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', b, off)
        data = b[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A: js = json.loads(data.decode('utf8'))
        elif ctype == 0x004E4942: bin_ = data
        off += 8 + clen
    return js, bin_

def write_glb(path, js, bin_):
    jb = json.dumps(js, separators=(',', ':')).encode('utf8'); jb += b' ' * ((4 - len(jb) % 4) % 4)
    bin_ = bytes(bin_) + b'\0' * ((4 - len(bin_) % 4) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bin_)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A) + jb); f.write(struct.pack('<II', len(bin_), 0x004E4942) + bin_)


def read_any(path):
    """.glb or .gltf (+ external .bin / image files) -> (json, single binary buffer) with every image embedded as a bufferView."""
    import base64
    base = os.path.dirname(os.path.abspath(path)); out = bytearray(); offs = []
    if path.lower().endswith('.glb'): js, b0 = read_glb(path); out.extend(b0); offs = [0]
    else: js = json.load(open(path, encoding='utf8'))
    def load_uri(u):
        if u.startswith('data:'): return base64.b64decode(u.split(',', 1)[1])
        return open(os.path.join(base, u.replace('%20', ' ')), 'rb').read()
    if not path.lower().endswith('.glb'):
        for b in js.get('buffers', []):
            while len(out) % 4: out.append(0)
            offs.append(len(out)); out.extend(load_uri(b['uri']))
        for bv in js.get('bufferViews', []):
            bv['byteOffset'] = offs[bv['buffer']] + bv.get('byteOffset', 0); bv['buffer'] = 0
    for im in js.get('images', []):
        if 'uri' in im:
            data = load_uri(im.pop('uri')); mime = 'image/png' if data[1:4] == b'PNG' else 'image/jpeg'
            while len(out) % 4: out.append(0)
            js['bufferViews'].append(dict(buffer=0, byteOffset=len(out), byteLength=len(data))); out.extend(data)
            im['bufferView'] = len(js['bufferViews']) - 1; im['mimeType'] = mime
    js['buffers'] = [dict(byteLength=len(out))]
    return js, bytes(out)

def read_acc(js, bin_, i):
    a = js['accessors'][i]; dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    if 'bufferView' not in a: return np.zeros((a['count'], n), dt)
    bv = js['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0)
    if stride in (0, n * dt.itemsize): arr = np.frombuffer(bin_, dtype=dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
    else: arr = np.stack([np.frombuffer(bin_, dtype=dt, count=n, offset=off + k * stride) for k in range(a['count'])])
    arr = arr.copy()
    if a.get('normalized'): arr = np.maximum(arr.astype(np.float64) / np.iinfo(dt).max, -1.0)
    return arr

def node_local(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    t = np.array(n.get('translation', [0, 0, 0]), float); x, y, z, w = n.get('rotation', [0, 0, 0, 1]); s = np.array(n.get('scale', [1, 1, 1]), float)
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * s; M[:3, 3] = t
    return M

def world_mats(js):
    nodes = js['nodes']; parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): parent[c] = i
    cache = {}
    def g(i):
        if i not in cache: cache[i] = (g(parent[i]) @ node_local(nodes[i])) if i in parent else node_local(nodes[i])
        return cache[i]
    return [g(i) for i in range(len(nodes))], parent

# ======================================================================================================== colour helpers
def srgb2lin(c): c = np.asarray(c, float); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): c = np.clip(np.asarray(c, float), 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def q555(c):
    c = np.clip(np.round(np.asarray(c, float)), 0, 255).astype(int); c5 = c >> 3
    return ((c5 << 3) | (c5 >> 2)).astype(float)

def quantize(rgb, n):
    """rgb (K,3) 0..255 sRGB -> (palette (<=n,3), index per input). Max-min seeding keeps small distinct colours (eyes, gems)."""
    u, inv, cnt = np.unique(np.round(rgb).astype(int), axis=0, return_inverse=True, return_counts=True); inv = inv.reshape(-1)
    if len(u) <= n: return u.astype(float), inv
    w = cnt.astype(float); wt = np.sqrt([0.30, 0.59, 0.11]); X = u.astype(float) * wt
    cent = [int(np.argmax(w))]; d = ((X - X[cent[0]]) ** 2).sum(1)
    while len(cent) < n:
        k = int(np.argmax(d * (1.0 + np.log1p(w)))); cent.append(k); d = np.minimum(d, ((X - X[k]) ** 2).sum(1))
    C = X[cent].copy()
    for _ in range(14):
        a = ((X[:, None, :] - C[None]) ** 2).sum(2).argmin(1)
        for k in range(n):
            m = a == k
            if m.any(): C[k] = (X[m] * w[m, None]).sum(0) / w[m].sum()
    a = ((X[:, None, :] - C[None]) ** 2).sum(2).argmin(1)
    return C / wt, a[inv]

def vhash(ijk):
    h = (ijk[:, 0].astype(np.int64) * 73856093) ^ (ijk[:, 1].astype(np.int64) * 19349663) ^ (ijk[:, 2].astype(np.int64) * 83492791)
    h = ((h ^ (h >> 13)) * 1274126177) & 0x7fffffffffff
    return (h ^ (h >> 16)) & 0x7fffffff

# ======================================================================================================== voxel core
def tri_box_overlap(V, c, h):
    """Conservative SAT (triangle normal + 9 edge x axis tests; the 3 box axes are covered by the candidate ranges)."""
    a = V[:, 0] - c; b = V[:, 1] - c; d = V[:, 2] - c; e = [b - a, d - b, a - d]
    n = np.cross(e[0], e[1]); ok = np.abs((n * a).sum(1)) <= h * np.abs(n).sum(1)
    U = np.eye(3)
    for ei in e:
        for k in range(3):
            ax = np.cross(ei, U[k]); p0 = (a * ax).sum(1); p1 = (b * ax).sum(1); p2 = (d * ax).sum(1); r = h * np.abs(ax).sum(1)
            ok &= ~((np.minimum(np.minimum(p0, p1), p2) > r) | (np.maximum(np.maximum(p0, p1), p2) < -r))
    return ok

def make_grid(vmin, vmax, cell, centered, bias=1e-3):
    vmin = vmin + bias * cell; vmax = vmax + bias * cell
    off = np.array([0.5, 0.0, 0.5]) * cell if centered else np.zeros(3)
    org = np.floor((vmin - off) / cell) * cell + off - cell
    return org, np.ceil((vmax - org) / cell).astype(int) + 2

def voxelize(V, cell, centered=True, shrink=1.0, bias=1e-3, grid=None):
    """V (T,3,3) triangles -> dict(org, dims, pairs (tri id, voxel ijk)). Grid: voxel centres on x=0/z=0 (symmetry), y boundaries on 0 (feet on the floor)."""
    V = V + bias * cell                                   # half-open boxes: a face lying on a voxel boundary belongs to the voxel above/inside
    if grid is None: org, dims = make_grid(V.reshape(-1, 3).min(0) - bias * cell, V.reshape(-1, 3).max(0) - bias * cell, cell, centered, bias)
    else: org, dims = grid
    lo = np.clip(np.floor((V.min(1) - org) / cell).astype(int), 0, dims - 1); hi = np.clip(np.floor((V.max(1) - org) / cell).astype(int), 0, dims - 1)
    c3 = hi - lo + 1; cnt = c3.prod(1)
    if cnt.sum() > 40_000_000: raise MemoryError('voxel grid too fine (%d candidate pairs): raise --cell' % cnt.sum())
    tid = np.repeat(np.arange(len(V)), cnt); start = np.cumsum(cnt) - cnt; loc = np.arange(cnt.sum()) - np.repeat(start, cnt); cc = c3[tid]
    ox = loc // (cc[:, 1] * cc[:, 2]); rem = loc % (cc[:, 1] * cc[:, 2]); oy = rem // cc[:, 2]; oz = rem % cc[:, 2]
    ijk = lo[tid] + np.stack([ox, oy, oz], 1); centre = org + (ijk + 0.5) * cell
    ok = np.zeros(len(tid), bool)
    for s in range(0, len(tid), 400000):
        sl = slice(s, s + 400000); ok[sl] = tri_box_overlap(V[tid[sl]], centre[sl], cell / 2 * shrink)
    return dict(org=org, dims=dims, tid=tid[ok], ijk=ijk[ok], centre=centre[ok], cell=cell, V=V)

def flood_exterior(shell):
    free = ~shell; ext = np.zeros_like(shell); ext[0, 0, 0] = True
    while True:
        n = ext.copy()
        n[1:] |= ext[:-1]; n[:-1] |= ext[1:]; n[:, 1:] |= ext[:, :-1]; n[:, :-1] |= ext[:, 1:]; n[:, :, 1:] |= ext[:, :, :-1]; n[:, :, :-1] |= ext[:, :, 1:]
        n &= free
        if (n == ext).all(): return ext
        ext = n

DIRS = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
def shifted(a, d):
    out = np.zeros_like(a); ss = []; dd = []
    for k in range(3):
        if d[k] == 0: ss.append(slice(None)); dd.append(slice(None))
        elif d[k] > 0: ss.append(slice(1, None)); dd.append(slice(0, -1))
        else: ss.append(slice(0, -1)); dd.append(slice(1, None))
    out[tuple(dd)] = a[tuple(ss)]; return out

def bary_closest(V, c):
    v0 = V[:, 0]; e0 = V[:, 1] - v0; e1 = V[:, 2] - v0; dd = c - v0
    d00 = (e0 * e0).sum(1); d01 = (e0 * e1).sum(1); d11 = (e1 * e1).sum(1); d20 = (dd * e0).sum(1); d21 = (dd * e1).sum(1)
    den = d00 * d11 - d01 * d01; bad = np.abs(den) < 1e-18; den = np.where(bad, 1.0, den)
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    B = np.maximum(np.stack([1 - v - w, v, w], 1), 0); B /= np.maximum(B.sum(1, keepdims=True), 1e-12)
    dist = np.linalg.norm(c - (B[:, :, None] * V).sum(1), axis=1); dist[bad] = 1e9
    return B, dist

# ======================================================================================================== source gathering
SEMANTIC_RE = re.compile(r'eye|glow|tongue|teeth', re.I)

class Src:
    """Source GLB helper: materials, images, triangle gathering."""
    def __init__(self, js, bin_, blur=0, scale_bones=None):
        self.js, self.bin = js, bin_; self.blur = blur; self._img = {}; self.scale_bones = scale_bones or {}
        self.W, self.parent = world_mats(js)
        self.mats = []
        for m in js.get('materials', []):
            p = m.get('pbrMetallicRoughness', {}); name = m.get('name', '')
            has_tex = 'baseColorTexture' in p
            emissive = any(m.get('emissiveFactor', [0, 0, 0])) or 'emissiveTexture' in m
            if m.get('alphaMode') == 'BLEND': kind = 'blend'
            elif SEMANTIC_RE.search(name) and not has_tex: kind = 'flat'          # eyes / glow / tongue / teeth with a flat colour: keep the original material
            elif emissive and has_tex: kind = 'emissive'                           # textured emissive: own palette + emissive palette
            elif emissive: kind = 'flat'
            else: kind = 'main'
            self.mats.append(dict(factor=np.array(p.get('baseColorFactor', [1, 1, 1, 1]), float), name=name, kind=kind, mode=m.get('alphaMode', 'OPAQUE'),
                                  cutoff=m.get('alphaCutoff', 0.5), raw=m, efac=np.array(m.get('emissiveFactor', [0, 0, 0]), float)))
        self.skin_M = {}
        for si, sk in enumerate(js.get('skins', [])):
            ibm = read_acc(js, bin_, sk['inverseBindMatrices']).astype(np.float64).reshape(-1, 4, 4).transpose(0, 2, 1)
            self.skin_M[si] = np.stack([self.W[j] @ ibm[k] for k, j in enumerate(sk['joints'])])    # joint matrix at rest

    def image(self, mi, which='baseColorTexture'):
        key = (mi, which)
        if key not in self._img:
            m = self.js['materials'][mi]; ref = m.get('pbrMetallicRoughness', {}).get(which) if which == 'baseColorTexture' else m.get(which)
            if ref is None: self._img[key] = None
            else:
                im = self.js['images'][self.js['textures'][ref['index']]['source']]; bv = self.js['bufferViews'][im['bufferView']]
                raw = self.bin[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
                img = Image.open(io.BytesIO(raw)).convert('RGBA')
                if self.blur: img = img.filter(ImageFilter.BoxBlur(self.blur))
                self._img[key] = np.asarray(img)
        return self._img[key]

    def gather(self, node_i, space, g_fixed=None):
        n = self.js['nodes'][node_i]; out = []
        for pi, prim in enumerate(self.js['meshes'][n['mesh']]['primitives']):
            if prim.get('mode', 4) != 4: continue
            at = prim['attributes']; P = read_acc(self.js, self.bin, at['POSITION']).astype(np.float64)
            tri = (read_acc(self.js, self.bin, prim['indices']).reshape(-1).astype(np.int64) if 'indices' in prim else np.arange(len(P))).reshape(-1, 3)
            g = lambda k: read_acc(self.js, self.bin, at[k]).astype(np.float64) if k in at else None
            uv, J, Wt, C = g('TEXCOORD_0'), g('JOINTS_0'), g('WEIGHTS_0'), g('COLOR_0')
            if J is not None: J = J.astype(int)
            ph = np.concatenate([P, np.ones((len(P), 1))], 1)
            if space == 'skin':      # glTF: world = sum(w * W_joint * IBM) * p   (the mesh node transform cancels out)
                S = np.einsum('nk,nkij->nij', Wt, self.skin_M[n['skin']][J]); r = np.einsum('nij,nj->ni', S, ph)[:, :3]
            elif space == 'world': r = (ph @ self.W[node_i].T)[:, :3]
            else: r = P
            if self.scale_bones and ('skin' in n or g_fixed is not None):          # proportion lever: scale vertices owned by a bone around that bone's origin
                joints = self.js['skins'][0]['joints'] if 'skin' not in n else self.js['skins'][n['skin']]['joints']
                dom = J[np.arange(len(J)), Wt.argmax(1)] if (J is not None and 'skin' in n) else np.full(len(P), g_fixed if g_fixed is not None else 0)
                for jn_name, f in self.scale_bones.items():
                    for jk, jnode in enumerate(joints):
                        if re.search(jn_name, self.js['nodes'][jnode].get('name', '')):
                            m = dom == jk; piv = self.W[jnode][:3, 3]; r[m] = piv + f * (r[m] - piv)
            out.append(dict(node=node_i, prim=pi, mat=prim.get('material'), V=r[tri], UV=None if uv is None else uv[tri], J=None if J is None else J[tri],
                            W=None if Wt is None else Wt[tri], C=None if C is None else C[tri]))
        return out


# ======================================================================================================== conversion
def convert(src, dst, cell, ncolors=24, weights='rigid', global_acc=r'^(head|chest|spine|hips|neck)', static=False, keep=None, blur=0,
            shrink=1.0, variation=True, shade=(0.88, 1.0, 1.08), report=None, scale_bones=None, overlay=None, cull_bottom=None, anim_keep_re=r'door|gate|lid|hinge|wheel|flame|fire|light|crystal|ring|portal|cloth|flag|orb|spin|slot|bucket|liquid|shards|rune|cap$'):
    t0 = time.time(); js, bin_ = read_any(src); S = Src(js, bin_, blur, scale_bones); nodes = js['nodes']; W = S.W
    if cull_bottom is None: cull_bottom = bool(static)                         # props / buildings stand on the ground: the floor-contact layer's -Y faces are never seen
    skinned = [i for i, n in enumerate(nodes) if 'mesh' in n and 'skin' in n]
    rigid_all = [i for i, n in enumerate(nodes) if 'mesh' in n and 'skin' not in n]
    anim_nodes = {js['nodes'][t['target']['node']].get('name') for a in js.get('animations', []) for t in a['channels'] if 'node' in t['target']}
    keep_re = re.compile(keep) if keep else None
    passthrough = set()
    for i in rigid_all:                                   # alpha cards / particle quads / anything matching --keep stays as it is
        if keep_re and keep_re.search(nodes[i].get('name', '')): passthrough.add(i)
    skin_joint = {}
    if skinned: skin_joint = {j: k for k, j in enumerate(js['skins'][nodes[skinned[0]]['skin']]['joints'])}
    gacc = {}                                             # rigid nodes merged into the world grid (value = skin joint they hang from, or None)
    for i in rigid_all:
        if i in passthrough: continue
        p = S.parent.get(i)
        if skinned:
            if p in skin_joint and re.search(global_acc, nodes[p].get('name', ''), re.I): gacc[i] = skin_joint[p]
        elif static and nodes[i].get('name') not in anim_nodes and not re.search(anim_keep_re, nodes[i].get('name', ''), re.I): gacc[i] = None
    local_nodes = [i for i in rigid_all if i not in gacc and i not in passthrough]

    spaces = []
    gs = []
    for i in skinned: gs += S.gather(i, 'skin')
    for i, j in gacc.items():
        for g in S.gather(i, 'world', j): g['fixed_joint'] = j; gs.append(g)
    if gs:
        allV = np.concatenate([g['V'].reshape(-1, 3) for g in gs]); grid = make_grid(allV.min(0), allV.max(0), cell, True)
        ov_re = re.compile(overlay) if overlay else None
        is_ov = lambda g: ov_re is not None and ov_re.search(nodes[g['node']].get('name', '')) is not None
        base = [g for g in gs if not is_ov(g)]
        if base: spaces.append(dict(kind='world', gs=base, cell=cell, nid=None, grid=grid, tag='base'))
        for nid_ in sorted({g['node'] for g in gs if is_ov(g)}):                  # toggleable parts (helmets, hats, cloaks): own solid, so hiding them reveals a complete body
            spaces.append(dict(kind='world', gs=[g for g in gs if g['node'] == nid_], cell=cell, nid=None, grid=grid, tag='overlay'))
    for i in local_nodes:
        sc = np.linalg.norm(W[i][:3, 0]); spaces.append(dict(kind='local', gs=S.gather(i, 'local'), cell=cell / max(sc, 1e-9), nid=i))

    results = []
    for sp in spaces:
        gs = sp['gs']; T = [len(g['V']) for g in gs]
        V = np.concatenate([g['V'] for g in gs]); gid = np.repeat(np.arange(len(gs)), T)
        z = lambda k, sh: np.concatenate([g[k] if g[k] is not None else np.zeros((len(g['V']),) + sh) for g in gs])
        UV, Jt, Wt, Ct = z('UV', (3, 2)), z('J', (3, 4)).astype(int), z('W', (3, 4)), np.concatenate([g['C'] if g['C'] is not None else np.ones((len(g['V']), 3, 4)) for g in gs])
        vox = voxelize(V, sp['cell'], centered=(sp['kind'] == 'world'), shrink=shrink, grid=sp.get('grid'))
        tid, ijk, centre = vox['tid'], vox['ijk'], vox['centre']
        B, dist = bary_closest(vox['V'][tid], centre)
        sem_g = np.array([(g['mat'] is not None and S.mats[g['mat']]['kind'] in ('flat', 'emissive')) for g in gs])
        dist = np.where(sem_g[gid[tid]], dist * 0.05, dist)           # eyes / glow parts win a voxel they touch (they are tiny and sit inside bigger meshes)
        key = np.ravel_multi_index(ijk.T, vox['dims']); order = np.lexsort((dist, key)); ks = key[order]
        sel = order[np.concatenate([[True], ks[1:] != ks[:-1]])]                      # nearest triangle per shell voxel
        vt, vB, vijk = tid[sel], B[sel], ijk[sel]; vg = gid[vt]; nv = len(vt)
        rgb = np.zeros((nv, 3)); em = np.zeros((nv, 3)); alpha = np.ones(nv); grp = np.empty(nv, object); uvq = np.einsum('nk,nkc->nc', vB, UV[vt])
        for k, g in enumerate(gs):
            m = vg == k
            if not m.any(): continue
            mi = g['mat']; mf = S.mats[mi] if mi is not None else dict(factor=np.ones(4), kind='main', mode='OPAQUE', cutoff=0.5, efac=np.zeros(3))
            fac = mf['factor']; cnt = int(m.sum())
            img = S.image(mi) if (mi is not None and g['UV'] is not None) else None
            def sample(a):
                H, Wd = a.shape[:2]; px = np.floor((uvq[m, 0] % 1.0) * Wd).astype(int) % Wd; py = np.floor((uvq[m, 1] % 1.0) * H).astype(int) % H
                return a[py, px].astype(float) / 255.0
            if img is not None: tex = sample(img); col = lin2srgb(srgb2lin(tex[:, :3]) * fac[:3]); al = tex[:, 3] * fac[3]
            else: col = np.tile(lin2srgb(fac[:3]), (cnt, 1)); al = np.full(cnt, fac[3])
            if g['C'] is not None: col = col * np.clip(np.einsum('nk,nkc->nc', vB[m], Ct[vt[m]])[:, :3], 0, 1)
            rgb[m] = col * 255.0
            if mf['kind'] == 'emissive':
                eimg = S.image(mi, 'emissiveTexture')
                ecol = lin2srgb(srgb2lin(sample(eimg)[:, :3]) * np.maximum(mf['efac'], 1e-3 if not any(mf['efac']) else 0)) if eimg is not None else col
                em[m] = ecol * 255.0
            alpha[m] = np.where(al < mf['cutoff'], 0, 1) if mf['mode'] == 'MASK' else (al if mf['kind'] == 'blend' else 1.0)
            grp[m] = ('M%d' % mi) if mf['kind'] in ('flat', 'emissive', 'blend') else 'MAIN'
        joint = np.zeros(nv, int); infl = [None] * nv
        for n_ in range(nv):
            acc = {}
            for v_ in range(3):
                for kk in range(4):
                    w = Wt[vt[n_], v_, kk]
                    if w > 0: jj = int(Jt[vt[n_], v_, kk]); acc[jj] = acc.get(jj, 0.0) + w * vB[n_, v_]
            top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; tot = sum(w for _, w in top) or 1.0
            infl[n_] = [(j, w / tot) for j, w in top] if top else [(0, 1.0)]; joint[n_] = infl[n_][0][0]
            fj = gs[vg[n_]].get('fixed_joint')
            if fj is not None: joint[n_] = fj; infl[n_] = [(fj, 1.0)]
        keep_v = alpha > 0.5
        results.append(dict(kind=sp['kind'], tag=sp.get('tag'), nid=sp['nid'], vox=vox, cell=sp['cell'], ijk=vijk[keep_v], rgb=rgb[keep_v], em=em[keep_v], alpha=alpha[keep_v],
                            grp=grp[keep_v], joint=joint[keep_v], infl=[infl[i] for i in np.nonzero(keep_v)[0]],
                            part=np.array([gs[k]['node'] for k in vg])[keep_v]))

    # ---- palettes: one per group (MAIN + every emissive / blend material); flat materials keep the source material untouched --------
    groups = {}
    for r in results:
        for gname in set(r['grp']):
            groups.setdefault(gname, []).append(r)
    pal_info = {}
    for gname, rs in groups.items():
        if gname != 'MAIN' and S.mats[int(gname[1:])]['kind'] == 'flat': continue
        cols = np.concatenate([r['rgb'][r['grp'] == gname] for r in rs]); n_col = ncolors if gname == 'MAIN' else min(16, ncolors)
        pal, assign = quantize(cols, n_col); pal = q555(pal); PW = 1
        while PW < len(pal): PW *= 2
        rows = (shade[0], shade[1], shade[2], shade[1]) if variation else (1, 1, 1, 1)
        img = np.zeros((4, PW, 4), np.uint8); img[..., 3] = 255
        for ri, f in enumerate(rows):
            for k in range(len(pal)): img[ri, k, :3] = np.round(lin2srgb(np.clip(srgb2lin(pal[k] / 255.0) * f, 0, 1)) * 255)
        eimg = None
        if gname != 'MAIN' and S.mats[int(gname[1:])]['kind'] == 'emissive':
            ecols = np.concatenate([r['em'][r['grp'] == gname] for r in rs]); epal = np.zeros((len(pal), 3))
            cnt = np.bincount(assign, minlength=len(pal))
            for k in range(len(pal)): epal[k] = ecols[assign == k].mean(0) if cnt[k] else 0
            eimg = np.zeros((4, PW, 4), np.uint8); eimg[..., 3] = 255
            for ri in range(4): eimg[ri, :len(pal), :3] = q555(epal)
        if gname != 'MAIN' and S.mats[int(gname[1:])]['kind'] == 'blend':
            al = np.concatenate([r['alpha'][r['grp'] == gname] for r in rs]); img[..., 3] = int(round(float(al.mean()) * 255))
        pal_info[gname] = dict(W=PW, H=4, png=img, epng=eimg)
        off = 0
        for r in rs:
            m = r['grp'] == gname; n = int(m.sum())
            r.setdefault('pal', np.full(len(m), -1))[m] = assign[off:off + n]; off += n
    for r in results:
        r.setdefault('pal', np.full(len(r['grp']), -1)); h = vhash(r['ijk']) % 8
        r['row'] = np.where(h == 0, 0, np.where(h == 1, 2, 1)) if variation else np.ones(len(h), int)

    # ---- faces -----------------------------------------------------------------------------------------------------------------
    newdata = {}; total_faces = 0
    ov_union = None
    base_solid = None
    for r in results:
        if r.get('tag') == 'overlay':
            m_ = _mask(r['vox']['dims'], r['ijk']); m_ = ~flood_exterior(m_)
            ov_union = m_ if ov_union is None else (ov_union | m_)
        elif r.get('tag') == 'base':
            base_solid = ~flood_exterior(_mask(r['vox']['dims'], r['ijk']))
    for r in results:
        vox = r['vox']; dims = vox['dims']; org = vox['org']; c = r['cell']; ii_ = r['ijk']
        solid = ~flood_exterior(_mask(dims, ii_))
        semv = np.array([(g_ != 'MAIN' and re.search('eye', S.mats[int(g_[1:])]['name'] + nodes[int(p_)].get('name', ''), re.I) is not None) if r['kind'] == 'world' else False
                         for g_, p_ in zip(r['grp'], r['part'])])
        if r['kind'] == 'world' and semv.any():                                  # carve eye sockets: clear <=2 voxels in front (+Z) of every semantic voxel
            for rec in np.nonzero(semv)[0]:
                x_, y_, z_ = ii_[rec]
                for k_ in (1, 2):
                    if z_ + k_ < dims[2] and not (_mask_has(ii_, semv, (x_, y_, z_ + k_))): solid[x_, y_, z_ + k_] = False
        idx = -np.ones(dims, int); idx[ii_[:, 0], ii_[:, 1], ii_[:, 2]] = np.arange(len(ii_)); buckets = {}
        for d in DIRS:
            hit = np.argwhere(solid & ~shifted(solid, d))
            if not len(hit): continue
            ri = idx[hit[:, 0], hit[:, 1], hit[:, 2]]; ok = ri >= 0
            if r.get('tag') == 'overlay' and base_solid is not None:                # overlay faces that look into the body can never be seen: drop them
                nb = hit + np.array(d); ok &= ~base_solid[nb[:, 0], nb[:, 1], nb[:, 2]]
            if cull_bottom and r['kind'] == 'world' and d == (0, -1, 0) and ok.any():
                ymin = np.argwhere(solid)[:, 1].min(); ok &= hit[:, 1] > ymin
            hit, ri = hit[ok], ri[ok]
            a = [k for k in range(3) if d[k]][0]; s = d[a]; u_ax, v_ax = (a + 1) % 3, (a + 2) % 3; ctr = org + (hit + 0.5) * c
            order = [(-1, -1), (1, -1), (1, 1), (-1, 1)] if s > 0 else [(-1, -1), (-1, 1), (1, 1), (1, -1)]
            Q = []
            for su, sv in order:
                q = ctr.copy(); q[:, a] += s * c / 2; q[:, u_ax] += su * c / 2; q[:, v_ax] += sv * c / 2; Q.append(q)
            Q = np.stack(Q, 1)
            if ov_union is not None and r.get('tag') == 'base':                    # base faces inside an overlay's cells move 2% inward: no z-fight, no visible gap
                inn = ov_union[hit[:, 0], hit[:, 1], hit[:, 2]]; Q[inn, :, a] -= s * 0.02 * c
            for f in range(len(hit)):
                rec = ri[f]; part = int(r['part'][rec]) if r['kind'] == 'world' else r['nid']
                buckets.setdefault((part, r['grp'][rec]), []).append((Q[f], rec))
        for (part, gname), lst in buckets.items():
            n = len(lst); pos = np.zeros((n * 4, 3)); uvs = np.zeros((n * 4, 2)); jn = np.zeros((n * 4, 4), np.uint16); wt = np.zeros((n * 4, 4), np.float32)
            info = pal_info.get(gname); is_skin = (part in skinned)
            Mj = S.skin_M[nodes[part]['skin']] if is_skin else None
            for f, (Qf, rec) in enumerate(lst):
                ph = np.concatenate([Qf, np.ones((4, 1))], 1)
                if is_skin:
                    inf = r['infl'][rec] if weights == 'blend' else [(int(r['joint'][rec]), 1.0)]
                    Sm = sum(w * Mj[j] for j, w in inf); pos[f * 4:f * 4 + 4] = (ph @ np.linalg.inv(Sm).T)[:, :3]
                    for k_, (j, w) in enumerate(inf): jn[f * 4:f * 4 + 4, k_] = j; wt[f * 4:f * 4 + 4, k_] = w
                elif r['kind'] == 'world': pos[f * 4:f * 4 + 4] = (ph @ np.linalg.inv(W[part]).T)[:, :3]      # merged rigid accessory / static part -> its node's local space
                else: pos[f * 4:f * 4 + 4] = Qf
                if info is not None: uvs[f * 4:f * 4 + 4] = ((int(r['pal'][rec]) + 0.5) / info['W'], (int(r['row'][rec]) + 0.5) / info['H'])
            base = np.arange(n) * 4
            newdata.setdefault(part, []).append(dict(pos=pos, uv=uvs if info is not None else None, joints=jn if is_skin else None, weights=wt if is_skin else None,
                                                     idx=np.stack([base, base + 1, base + 2, base, base + 2, base + 3], 1).reshape(-1), grp=gname))
            total_faces += n
    for i in skinned + rigid_all:                         # emptied nodes keep a degenerate triangle so the node (and its name) survives
        if i not in newdata and i not in passthrough:
            is_skin = i in skinned
            newdata[i] = [dict(pos=np.zeros((3, 3)), uv=np.full((3, 2), 0.5 / 4), joints=np.zeros((3, 4), np.uint16) if is_skin else None,
                               weights=np.array([[1, 0, 0, 0]] * 3, np.float32) if is_skin else None, idx=np.array([0, 1, 2]), grp='MAIN')]
    out_js, out_bin = rebuild(js, bin_, newdata, pal_info, S)
    write_glb(dst, out_js, out_bin)
    st = dict(src=os.path.basename(src), cell=cell, voxels=int(sum(len(r['ijk']) for r in results)), faces=total_faces, tris=total_faces * 2,
              colors={k: int(len(np.unique(np.concatenate([r['pal'][r['grp'] == k] for r in groups[k]])))) for k in pal_info},
              nodes={nodes[k].get('name', str(k)): sum(len(d['idx']) // 3 for d in v) for k, v in newdata.items()}, seconds=round(time.time() - t0, 2),
              bytes=os.path.getsize(dst))
    if report: json.dump(st, open(report, 'w'), indent=1)
    return st

def _mask_has(ijk, semv, p):
    m = (ijk[:, 0] == p[0]) & (ijk[:, 1] == p[1]) & (ijk[:, 2] == p[2])
    return bool(m.any() and semv[m].any())

def _mask(dims, ijk):
    m = np.zeros(dims, bool); m[ijk[:, 0], ijk[:, 1], ijk[:, 2]] = True; return m

# ======================================================================================================== glb rebuild
def rebuild(js, bin_, newdata, pal_info, S):
    js = json.loads(json.dumps(js)); out = bytearray(); bvs = []; accs = []
    def blob(data, target=None):
        while len(out) % 4: out.append(0)
        bv = dict(buffer=0, byteOffset=len(out), byteLength=len(data))
        if target: bv['target'] = target
        out.extend(data); bvs.append(bv); return len(bvs) - 1
    def arr(a, ct, typ, target=None, mm=False):
        a = np.ascontiguousarray(a); d = dict(bufferView=blob(a.tobytes(), target), componentType=ct, count=int(a.shape[0]), type=typ)
        if mm: d['min'] = a.min(0).astype(float).tolist(); d['max'] = a.max(0).astype(float).tolist()
        accs.append(d); return len(accs) - 1
    old_map = {}
    def old(i):
        if i in old_map: return old_map[i]
        a = js['accessors'][i]; dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]; na = {k: v for k, v in a.items() if k not in ('bufferView', 'byteOffset')}
        if 'bufferView' in a:
            bv = js['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0)
            raw = bin_[off: off + a['count'] * n * dt.itemsize] if stride in (0, n * dt.itemsize) else np.stack([np.frombuffer(bin_, dtype=dt, count=n, offset=off + k * stride) for k in range(a['count'])]).tobytes()
            na['bufferView'] = blob(raw, None if stride else bv.get('target'))
        accs.append(na); old_map[i] = len(accs) - 1; return old_map[i]

    mesh_of = {i: n['mesh'] for i, n in enumerate(js['nodes']) if 'mesh' in n}
    replaced = {mesh_of[i] for i in newdata}
    for mi, mesh in enumerate(js['meshes']):
        if mi in replaced:
            prims = []
            for node_i, ds in newdata.items():
                if mesh_of[node_i] != mi: continue
                for d in ds:
                    at = {'POSITION': arr(d['pos'].astype(np.float32), 5126, 'VEC3', 34962, True)}
                    if d['uv'] is not None: at['TEXCOORD_0'] = arr(d['uv'].astype(np.float32), 5126, 'VEC2', 34962)
                    if d['joints'] is not None:
                        at['JOINTS_0'] = arr(d['joints'].astype(np.uint16), 5123, 'VEC4', 34962); at['WEIGHTS_0'] = arr(d['weights'].astype(np.float32), 5126, 'VEC4', 34962)
                    big = len(d['pos']) > 65535
                    prims.append(dict(attributes=at, indices=arr(d['idx'].astype(np.uint32 if big else np.uint16).reshape(-1, 1), 5125 if big else 5123, 'SCALAR', 34963),
                                      material=('G:' + d['grp']), mode=4))
            mesh['primitives'] = prims
        else:
            for p in mesh['primitives']:
                p['attributes'] = {k: old(v) for k, v in p['attributes'].items()}
                if 'indices' in p: p['indices'] = old(p['indices'])
    for sk in js.get('skins', []): sk['inverseBindMatrices'] = old(sk['inverseBindMatrices'])
    for an in js.get('animations', []):
        for s in an['samplers']: s['input'] = old(s['input']); s['output'] = old(s['output'])

    # materials: keep referenced originals (flat/semantic + passthrough), create palette materials for groups
    used = sorted({p['material'] for m in js['meshes'] for p in m['primitives'] if isinstance(p.get('material'), int)} |
                  {int(p['material'][3:]) for m in js['meshes'] for p in m['primitives'] if isinstance(p.get('material'), str) and p['material'].startswith('G:M') and p['material'][2:] not in pal_info})
    new_mats = [json.loads(json.dumps(js['materials'][o])) for o in used]; mat_map = {o: n for n, o in enumerate(used)}
    old_tex = js.get('textures', []); old_img = js.get('images', [])
    tex_list = []; img_list = []; samplers = js.get('samplers', []) + [dict(magFilter=9728, minFilter=9728, wrapS=33071, wrapT=33071)]; nearest = len(samplers) - 1
    tmap = {}; imap = {}
    def keep_tex(obj):
        if isinstance(obj, dict):
            if 'index' in obj and set(obj) <= {'index', 'texCoord', 'scale', 'strength', 'extensions'}:
                ti = obj['index']
                if ti not in tmap:
                    t = dict(old_tex[ti]); si = t['source']
                    if si not in imap:
                        im = dict(old_img[si]); bv = js['bufferViews'][im['bufferView']]
                        im['bufferView'] = blob(bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]); img_list.append(im); imap[si] = len(img_list) - 1
                    t['source'] = imap[si]; tex_list.append(t); tmap[ti] = len(tex_list) - 1
                obj['index'] = tmap[ti]
            for v in obj.values(): keep_tex(v)
        elif isinstance(obj, list):
            for v in obj: keep_tex(v)
    keep_tex(new_mats)
    def add_png(a):
        buf = io.BytesIO(); Image.fromarray(a, 'RGBA').save(buf, 'PNG', optimize=True)
        img_list.append(dict(bufferView=blob(buf.getvalue()), mimeType='image/png'))
        tex_list.append(dict(sampler=nearest, source=len(img_list) - 1)); return len(tex_list) - 1
    gmat = {}
    main_name = next((m['name'] for m in S.mats if m['kind'] == 'main' and m['name']), 'voxel_palette')
    for gname, info in pal_info.items():
        base = dict(name=main_name if gname == 'MAIN' else (S.mats[int(gname[1:])]['name'] or gname))
        if gname == 'MAIN': mat = dict(base, pbrMetallicRoughness=dict(baseColorTexture=dict(index=add_png(info['png'])), metallicFactor=0.0, roughnessFactor=1.0))
        else:
            src_m = json.loads(json.dumps(js['materials'][int(gname[1:])])); mat = {k: v for k, v in src_m.items() if k in ('name', 'alphaMode', 'alphaCutoff', 'doubleSided', 'emissiveFactor', 'extensions')}
            mat['pbrMetallicRoughness'] = dict(baseColorTexture=dict(index=add_png(info['png'])), metallicFactor=0.0, roughnessFactor=1.0)
            if info['epng'] is not None: mat['emissiveTexture'] = dict(index=add_png(info['epng']))
        new_mats.append(mat); gmat[gname] = len(new_mats) - 1
    for m in js['meshes']:
        for p in m['primitives']:
            mt = p.get('material')
            if isinstance(mt, str):
                g = mt[2:]; p['material'] = gmat[g] if g in gmat else mat_map[int(g[1:])]
            elif isinstance(mt, int): p['material'] = mat_map[mt]
    js['materials'] = new_mats; js['textures'] = tex_list; js['images'] = img_list; js['samplers'] = samplers
    js['accessors'] = accs; js['bufferViews'] = bvs; js['buffers'] = [dict(byteLength=len(out))]
    js.pop('extensionsRequired', None)
    return js, bytes(out)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('--cell', type=float, required=True); ap.add_argument('--colors', type=int, default=24)
    ap.add_argument('--weights', default='rigid', choices=['rigid', 'blend']); ap.add_argument('--global-acc', default=r'^(head|chest|spine|hips|neck)')
    ap.add_argument('--static', action='store_true'); ap.add_argument('--keep'); ap.add_argument('--blur', type=int, default=0); ap.add_argument('--shrink', type=float, default=1.0)
    ap.add_argument('--no-variation', action='store_true'); ap.add_argument('--report'); ap.add_argument('--no-cull-bottom', action='store_true', help='keep -Y faces of the ground layer (static models cull them by default)'); ap.add_argument('--overlay', help='REGEX of toggleable part names (helmets, hats, cloaks)'); ap.add_argument('--scale-bone', action='append', default=[], help='REGEX=factor, e.g. ^head$=0.85')
    a = ap.parse_args()
    st = convert(a.src, a.dst, a.cell, a.colors, a.weights, a.global_acc, a.static, a.keep, a.blur, a.shrink, not a.no_variation, report=a.report, overlay=a.overlay, cull_bottom=(False if a.no_cull_bottom else None), scale_bones={k.split('=')[0]: float(k.split('=')[1]) for k in a.scale_bone})
    print('STATS', json.dumps(st))
