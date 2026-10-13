"""PSX environment packs -> GLBs (headless Blender 5.2, ONE process for everything).

  blender --background --factory-startup --python convert_env.py -- <.asset-cache/itch/psx-env> <repo root> [trees|nature|walls ...]

  trees  : "Retro PSX tree pack" tree_pack_1.1 (44 FBX, textures next to them)  -> public/assets/models/itch/retro-psx-tree-pack/{trees,bushes}/
  nature : Elegant Crow "Retro PSX Nature Pack" (GLB geometry + per-season PNGs) -> public/assets/models/itch/retro-psx-nature-pack/{trees,bushes,grass}/
  walls  : valsekamerplant "PSX style walls & fences" (79 GLB)                  -> public/assets/models/itch/psx-walls-fences/<family>/

Untrusted sources are only imported (read) here. Every texture is PSX-ified by itch_kits/tex_tool.py (256-colour palette PNG, <=256 px,
hard alpha), materials are rebuilt: nearest sampler, metallic 0 / roughness 1, alpha MASK (cutoff 0.5) only where the texture has holes,
double sided (foliage planes, thin fences). One mesh + one material per file (walls keep one slot per source material).
Scale contract: 1 unit = 1 m, +Y up (glTF), KayKit hero ~2.4 m.
"""
import bpy, os, sys, json, re, time
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'itch_kits'))
import kitlib as K

A = K.args()
src, root = A[0], A[1]
ONLY = set(A[2:])
OUTM = os.path.join(root, 'public/assets/models/itch')
PSX = os.path.join(src, '_psx_tex')
TMP = os.path.join(src, '_tmp')
REP = os.path.join(HERE, '_reports')
os.makedirs(TMP, exist_ok=True)
T0 = time.time()


def fresh():
    K.reset()
    K._matcache.clear()


def kebab(s):
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', s)
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return re.sub(r'-+', '-', s)


def single(objs, name):
    """bake transforms, join into ONE mesh object, keep only the first UV map, drop vertex colours
    (their average is returned so it can be reported)."""
    meshes = K.bake_and_clean(objs)
    o = K.join(meshes, name)
    me = o.data
    vcol = None
    if me.color_attributes:
        acc = [0.0, 0.0, 0.0]
        n = 0
        for ca in me.color_attributes:
            for d in list(ca.data)[:400]:
                c = d.color if hasattr(d, 'color') else d.color_srgb
                acc = [acc[i] + c[i] for i in range(3)]
                n += 1
        vcol = [round(a / max(n, 1), 3) for a in acc]
    for ca in list(me.color_attributes):
        me.color_attributes.remove(ca)
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])
    # NB: do not clear the slots here: Mesh.materials.clear() resets every polygon's material_index to 0
    return o, vcol


def tex_mat(name, png_src, png_out, max_px):
    ti = K.psx_tex(png_src, png_out, max_px)
    mat = K.psx_material(name, ti['out'], 'CLIP' if ti['alpha'] else 'OPAQUE', double_sided=True)
    return mat, ti


def export(o, path, extra):
    r = K.export_glb(path, [o])
    r.update(extra)
    return r


def save(pack, rep):
    K.save_report(os.path.join(REP, pack + '.json'), rep)
    print('REPORT', pack, len(rep), 'files', sum(r['bytes'] for r in rep) // 1024, 'KB')


# =============================================================================== trees (FBX tree pack)
def do_trees():
    pack = 'retro-psx-tree-pack'
    base = os.path.join(src, 'psx-retro-style-tree-pack/x/tree_pack_1.1')
    rep = []
    for f in sorted(os.listdir(os.path.join(base, 'models'))):
        if not f.lower().endswith('.fbx'):
            continue
        stem = os.path.splitext(f)[0]
        kind = 'bushes' if stem.startswith('bush') else 'trees'
        fresh()
        o, _ = single(K.import_any(os.path.join(base, 'models', f)), stem)
        mn, mx = K.bounds([o])
        H = mx.z                      # source origin = trunk base (min z = 0)
        s = 1.2 / H if kind == 'bushes' else min(10.0, max(6.0, H * 0.64)) / H
        K.repivot([o], mode='origin', scale=s)
        mat, ti = tex_mat('%s_%s' % (pack, stem), os.path.join(base, 'textures', stem + '.png'),
                          os.path.join(PSX, pack, stem + '.png'), 128)
        K.set_material([o], mat)
        rep.append(export(o, os.path.join(OUTM, pack, kind, stem + '.glb'),
                          dict(pack=pack, kind=kind, model=stem, variant='', source='models/' + f, scale=round(s, 4),
                               pivot='trunk base (ground contact), centre of trunk',
                               textures={stem: '%dx%d%s' % (ti['w'], ti['h'], ' alpha' if ti['alpha'] else '')})))
        print('OK', pack, stem, rep[-1]['size'])
    save(pack, rep)


# =============================================================================== nature pack (Elegant Crow)
SEASONS = ['spring', 'summer', 'fall', 'winter']


def nature_models(tdir):
    """(kind, stem, [(variant, texture path rel to textures/, is_winter)]) for every model of the pack."""
    out = []
    for n in range(1, 9):
        stem = 'tree%02d' % n
        out.append(('trees', stem, [(s, 'trees/%s_%s.png' % (stem, s), s == 'winter') for s in SEASONS]))
    for n in range(1, 9):
        stem = 'bush%02d' % n
        pre = 'bush%d_' % n
        names = sorted(f[len(pre):-4] for f in os.listdir(os.path.join(tdir, 'bushes')) if f.startswith(pre))
        order = lambda v: (SEASONS.index(re.sub(r'\d+$', '', v)), v)
        out.append(('bushes', stem, [(v, 'bushes/%s%s.png' % (pre, v), v == 'winter') for v in sorted(names, key=order)]))
    for stem, tprefix in [('grass%02d' % i, 'grass') for i in range(1, 10)] + [('grass_bush', 'grass_bush'),
                                                                              ('grass_patch', 'grass_patch'),
                                                                              ('grass_patch_corner', 'grass_patch')]:
        out.append(('grass', stem, [(s, 'grass/%s_%s.png' % (tprefix, s), False) for s in SEASONS]))
    return out


def do_nature():
    pack = 'retro-psx-nature-pack'
    base = os.path.join(src, 'retro-psx-nature-pack/x/retro_nature_pack')
    mdir, tdir = os.path.join(base, 'models/glTF'), os.path.join(base, 'textures')
    rep = []

    def load(path, stem):
        fresh()
        return single(K.import_any(path), stem)[0]

    for kind, stem, variants in nature_models(tdir):
        base_glb = os.path.join(mdir, kind, stem + '.glb')
        win_glb = os.path.join(mdir, kind, stem + '_winter.glb')
        # tree02_winter.glb of the source pack is a broken 132-byte file: fall back to the summer mesh + winter texture
        has_win_mesh = os.path.exists(win_glb) and os.path.getsize(win_glb) > 1024
        s = None
        for want_winter in (False, True):
            vs = [v for v in variants if v[2] == want_winter]
            if not vs:
                continue
            path = win_glb if (want_winter and has_win_mesh) else base_glb
            o = load(path, stem)
            if s is None:
                mn, mx = K.bounds([o])
                H = mx.z
                s = {'trees': min(2.0, 10.0 / H), 'bushes': 1.5, 'grass': 0.8}[kind]
            K.repivot([o], mode='origin', scale=s)
            for var, trel, _w in vs:
                tname = kebab(os.path.splitext(os.path.basename(trel))[0])
                mat, ti = tex_mat('%s_%s' % (pack, tname), os.path.join(tdir, trel), os.path.join(PSX, pack, tname + '.png'), 256)
                K.set_material([o], mat)
                name = '%s_%s' % (stem, var)
                rep.append(export(o, os.path.join(OUTM, pack, kind, name + '.glb'),
                                  dict(pack=pack, kind=kind, model=stem, variant=var, scale=round(s, 4),
                                       source='%s/%s%s.glb + textures/%s' % (kind, stem, '_winter' if (want_winter and has_win_mesh) else '', trel),
                                       pivot='ground contact at y=0 (trunk centre)' if kind == 'trees' else 'bottom centre',
                                       textures={tname: '%dx%d%s' % (ti['w'], ti['h'], ' alpha' if ti['alpha'] else '')})))
        print('OK', pack, kind, stem, len(variants), 'variants', rep[-1]['size'])
    save(pack, rep)


# =============================================================================== walls & fences (valsekamerplant)
IMG_ALIAS = {'brick_wall': 'brick-wall', 'concrete_bare': 'concrete-bare', 'metal_bare_2': 'metal-bare',
             'stonewall': 'stone-wall', 'rooftiles2': 'roof-tiles', 'low_wooden_wall': 'low-wooden-wall',
             'plackard_wall': 'plackard-wall', 'sctucco': 'stucco', 'plastic_gate': 'plastic-gate',
             'white_picket_fence': 'white-picket-fence'}
FIX = {'wooden_fence_oen_crossed': 'wooden_fence_open_crossed', 'plackard_slab_boken': 'plackard_slab_broken',
       'brick_Wall_corner': 'brick_wall_corner'}
HINGE = {'gate', 'brick_wall_gate', 'white_picket_fence_gate', 'plastic_gate_left', 'plastic_gate_right'}
WSCALE = 1.25     # same module scale as the PSX Going Medieval pack by the same author (4 m -> 5 m)


def img_alias(img):
    n = img.name
    if n.startswith('TexturesCom_MetalVarious'):
        return 'fence-mesh'
    if n.startswith('TexturesCom_Metal_PipeRusted'):
        return 'rusted-pipe'
    return IMG_ALIAS.get(n, kebab(n))


def mat_image(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            return n.image
    return None


def dump_image(img, path):
    if os.path.exists(path):
        return
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


def do_walls():
    pack = 'psx-walls-fences'
    base = os.path.join(src, 'psx-style-walls-fences/x/Fences')
    rep = []
    for fam in sorted(os.listdir(base)):
        fdir = os.path.join(base, fam)
        if not os.path.isdir(fdir):
            continue
        for f in sorted(os.listdir(fdir)):
            if not f.lower().endswith('.glb'):
                continue
            stem = os.path.splitext(f)[0]
            name = FIX.get(stem, stem).lower()
            fresh()
            o = None
            objs = K.import_any(os.path.join(fdir, f))
            o, vcol = single(objs, name)
            mn, mx = K.bounds([o])
            c = (mn + mx) / 2
            if stem in HINGE:
                x = mn.x if abs(mn.x) <= abs(mx.x) else mx.x
                pv = Vector((x, c.y, mn.z))
                ptxt = 'hinge post edge (x=0), base; leaf extends %s X' % ('+' if x == mn.x else '-')
            elif stem == 'brick_Wall_corner':
                pv = Vector((0, 0, mn.z))
                ptxt = 'corner post centre, base; arms run to +X and -Z'
            elif stem == 'gate_handle':
                pv = c
                ptxt = 'centre (tiny hardware piece)'
            else:
                pv = Vector((c.x, c.y, mn.z))
                ptxt = 'centre, base'
            K.repivot([o], mode=pv, scale=WSCALE)
            texinfo = {}
            # replace each source material IN PLACE (keeps the polygons' material_index)
            for i in range(len(o.material_slots)):
                img = mat_image(o.material_slots[i].material)
                if img is None:
                    continue
                alias = img_alias(img)
                tmp = os.path.join(TMP, alias + '.png')
                dump_image(img, tmp)
                mat, ti = tex_mat('wf_' + alias, tmp, os.path.join(PSX, pack, alias + '.png'), 256)
                o.data.materials[i] = mat
                texinfo[alias] = '%dx%d%s' % (ti['w'], ti['h'], ' alpha' if ti['alpha'] else '')
            fdir_out = kebab(fam)
            extra = dict(pack=pack, kind=fdir_out, model=name, variant='', source='Fences/%s/%s' % (fam, f), scale=WSCALE,
                         pivot=ptxt, textures=texinfo)
            if vcol:
                extra['vertex_colour_dropped_mean'] = vcol
            rep.append(export(o, os.path.join(OUTM, pack, fdir_out, name + '.glb'), extra))
            print('OK', fam, name, rep[-1]['size'])
    save(pack, rep)


if not ONLY or 'trees' in ONLY:
    do_trees()
if not ONLY or 'nature' in ONLY:
    do_nature()
if not ONLY or 'walls' in ONLY:
    do_walls()
print('DONE %.1fs' % (time.time() - T0))
