"""toboas "PSX Fantasy Pack - Nocturnal Watch" (CC0) -> /assets/models/itch/nocturnal-watch/*.glb
Usage: blender --background --factory-startup --python convert_nocturnal.py -- <extracted dir (has Models/)> <repo root>

The FBX files reference texture files that are not in the archive, so every material is rebuilt here from
the PNG/JPG that ships next to the model. Source characters are 1.8 m tall (real-world scale); the game hero
is ~2.4, so the pack gets x4/3 (BASE). A few props are modelled far too big (2 m crate, 2.4 m barrel,
4 m wall torch) and get an explicit target height instead.
"""
import bpy, os, sys, json, re
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitlib as K

src, root = K.args()[:2]
MODELS = os.path.join(src, 'Models')
OUT = os.path.join(root, 'public/assets/models/itch/nocturnal-watch')
TEXOUT = os.path.join(root, '.asset-cache/itch/kits/psx-fantasy-pack-nocturnal-watch/psx_tex')
BASE = 4.0 / 3.0

TAVERN_S = 15.0 / 11.0   # tavern kit: 2.2-unit wall pieces become exactly 3.0 m wide (4.09 m tall)
# split groups for multi-object kit files: output name -> (object names, per-output options)
HUT = {'ritual_dagger': (['DarkKnife'], dict(height=1.2)), 'crow': (['Crow'], dict(height=0.6)),
       'fish': (['Fish'], dict(maxdim=0.8)), 'cauldron': (['Cauldron'], dict(height=1.3)),
       'severed_leg': (['Foot'], dict(height=0.6)), 'rat': (['Cube'], dict(maxdim=0.9))}
TAVERN = {'wall_base': (['WallBase'], {}), 'wall_half': (['WallHalf'], {}),
          'wall_half_window': (['WallHalfWindow'], dict(keep_z=True)), 'wall_base_door': (['WallBaseDoor'], {}),
          'wall_base_window': (['WallBaseWindow'], {}), 'wall_pillar': (['WallPillar'], {}),
          'triangular_wall': (['TriangularWall'], {}), 'top_ridge': (['TopRidge'], dict(keep_z=True)),
          'roof': (['Roof'], {}), 'foundation': (['Foundation'], {}), 'door': (['Door'], {}),
          'chimney': (['Cube'], {})}
TAVERN_PROPS = {'bar': (['Bar'], {}), 'bar_stool': (['BarStool'], {}), 'beer_mug': (['BeerPint'], {}),
                'bowl': (['Bowl'], {}), 'jug': (['Cylinder'], {}), 'cheese': (['Cylinder.001'], {}),
                'bread': (['Sphere'], {}), 'wooden_spoon': (['WoodenSpoon'], {}), 'shelf': (['Shelf'], dict(pivot='back')),
                'wine_bottle': (['WineBottle'], {}), 'wine_bottle_02': (['WineBottle02'], {}),
                'lantern': (['Lantern', 'Lantern_Handle'], {}),
                'wall_lantern': (['Lantern', 'Lantern_Handle', 'Cube'], dict(pivot='back')),
                'chandelier': (['ChanedlierBase'], dict(pivot='top')), 'chain': (['Chain'], dict(pivot='top')),
                'painting': (['Painting'], dict(pivot='back'))}
JOBS = [
    dict(fbx='Bridge/Bridge.fbx', out='bridge', tex='BridgeTexture.png', max=512),
    dict(fbx='Characters/Bartender.fbx', out='npc_bartender', tex='Bartender.png', max=256, single=True),
    dict(fbx='Characters/inquisitor.fbx', out='npc_inquisitor', max=256, single=True,
         tex={'Body': 'IniquisitorTexture.png', 'Head': 'InquisitorHelmetTexture.png'}),
    dict(fbx='Characters/Maid.fbx', out='npc_maid', tex='MaidTexture.png', max=256, single=True),
    dict(fbx='Characters/Nun.fbx', out='npc_nun', tex='Nun_Texture.png', max=256, single=True),
    dict(fbx='Characters/Peasant.fbx', out='npc_peasant', tex='PeasantTexture.png', max=256, single=True,
         variants={'npc_peasant_blonde': 'PeasantBlondeTexture.png'}),
    dict(fbx='Characters/Witch.fbx', out='witch', tex='WitchTexture.png', max=512, single=True),
    dict(fbx='Church/Church.fbx', out='church', tex='ChurchTexture.png', max=512, keep=['Door']),
    dict(fbx='Church/Altar.fbx', out='church_altar', tex='ChurchPropsTexture.png', max=256, crop=True, scale=1.0),
    dict(fbx='Church/ChurchBench.fbx', out='church_bench', tex='ChurchPropsTexture.png', max=256, crop=True, scale=1.0),
    dict(fbx='Church/ChurchFence.fbx', out='church_fence', tex='ChurchPropsTexture.png', max=256, crop=True),
    dict(fbx='HutInterior/HutInterior.fbx', split=HUT, tex='HutInteriorPropsTexture.png', max=256, crop=True),
    dict(fbx='PineTree/PineTree.fbx', out='pine_tree', tex='PineTreeTexture.png', max=128),
    dict(fbx='Props/Banner.fbx', out='banner', tex='Props.png', max=256, crop=True, pivot='top'),
    dict(fbx='Props/Barrel.fbx', out='barrel', tex='Props.png', max=256, crop=True, opaque=True, height=1.4),
    dict(fbx='Props/Crate.fbx', out='crate', tex='Props.png', max=256, crop=True, opaque=True, height=1.2),
    dict(fbx='Props/Torch.fbx', out='torch', tex='Props.png', max=256, crop=True, height=1.2, pivot='back'),
    dict(fbx='SignPost/SignPost.fbx', out='signpost', tex='SignPostTexture.png', max=256),
    dict(fbx='Sword/SteelSword.fbx', out='steel_sword', tex='SteelSwordTexture.png', max=256, crop=True,
         pivot='origin', single=True),
    dict(fbx='Tavern/Tavern.fbx', split=TAVERN, prefix='tavern_', tex='TavernTexture.jpg', max=256, crop=True,
         scale=TAVERN_S),
    dict(fbx='Tavern/TavernProps.fbx', split=TAVERN_PROPS, prefix='tavern_', tex='TavernPropsTexture.png', max=256,
         crop=True, scale=TAVERN_S),
    dict(fbx='Tower/Tower.fbx', out='tower', max=512, keep=['Door'], height=30.0,
         tex={'BaseTower': 'TowerTexture.png', 'Door': 'TowerDoorTexture.png'}),
    dict(fbx='Well/Well.fbx', out='well', tex='WellTexture.png', max=256, height=3.0),
]
ONLY = set(K.args()[2:])  # optional job filter (output names / fbx basenames)


def tex_for(job, objname):
    t = job['tex']
    if isinstance(t, dict):
        return t.get(objname) or next(iter(t.values()))
    return t


def hinge_pivot(o):
    """Door node origin: bottom of the hinge edge (min end of the wider horizontal axis)."""
    mn, mx = K.bounds([o])
    if (mx.x - mn.x) >= (mx.y - mn.y):
        return Vector((mn.x, (mn.y + mx.y) / 2, mn.z))
    return Vector(((mn.x + mx.x) / 2, mn.y, mn.z))


def build(job, name, objs, report, opts=None):
    job = dict(job, **(opts or {}))
    d = os.path.dirname(job['fbx'])
    keep = [o for o in objs if o.name.split('.')[0] in job.get('keep', [])]
    rest = [o for o in objs if o not in keep]
    # scale + pivot (computed on the whole group so kept nodes stay in place)
    mn, mx = K.bounds(objs)
    scale = job.get('scale', BASE)
    if job.get('height'):
        scale = job['height'] / (mx.z - mn.z)
    elif job.get('maxdim'):
        scale = job['maxdim'] / max(mx - mn)
    K.repivot(objs, mode=job.get('pivot', 'bottom'), scale=scale, keep_z=job.get('keep_z', False))
    # textures / materials, per texture group
    groups = {}
    for o in objs:
        groups.setdefault(tex_for(job, o.name.split('.')[0] if isinstance(job['tex'], dict) else o.name), []).append(o)
    for tex, gobjs in groups.items():
        srcp = os.path.join(MODELS, d, tex)
        base = K.snake(os.path.splitext(tex)[0])
        if job.get('crop'):
            ti = K.cropped_texture(gobjs, srcp, os.path.join(TEXOUT, '%s__%s.png' % (name, base)), job['max'],
                                   opaque=job.get('opaque', False))
        else:
            ti = K.psx_tex(srcp, os.path.join(TEXOUT, '%s.png' % base), job['max'], opaque=job.get('opaque', False))
        alpha = 'CLIP' if ti['alpha'] else 'OPAQUE'
        mat = K.psx_material('%s_%s' % (name if job.get('crop') else 'nw', base), ti['out'], alpha,
                             double_sided=not job.get('single', False))
        K.set_material(gobjs, mat)
        job.setdefault('_tex', {})[tex] = ti
    nodes = []
    if rest:
        o = K.join(rest, name)
        K.cleanup_mesh(o, merge=0.0001)
        nodes.append(o)
    for k in keep:
        # give the door its own origin at the hinge so rotation.y swings it
        p = hinge_pivot(k)
        k.data.transform(Matrix.Translation(-p))
        k.location = p
        k.name = name + '_' + K.snake(k.name.split('.')[0])
        k.data.name = k.name
        nodes.append(k)
    out = os.path.join(OUT, name + '.glb')
    r = K.export_glb(out, nodes)
    r['source'] = job['fbx']
    r['scale'] = round(scale, 4)
    r['textures'] = {t: '%dx%d%s%s' % (v['w'], v['h'], ' crop' if v.get('cropped') else '', ' alpha' if v['alpha'] else '')
                     for t, v in job.get('_tex', {}).items()}
    report.append(r)
    print('OK', name, r['tris'], r['size'])
    for vname, vtex in job.get('variants', {}).items():
        ti = K.psx_tex(os.path.join(MODELS, d, vtex), os.path.join(TEXOUT, K.snake(os.path.splitext(vtex)[0]) + '.png'),
                       job['max'])
        mat = K.psx_material('nw_' + K.snake(os.path.splitext(vtex)[0]), ti['out'], 'OPAQUE',
                             double_sided=not job.get('single', False))
        for n in nodes:
            K.set_material([n], mat)
        r2 = K.export_glb(os.path.join(OUT, vname + '.glb'), nodes)
        r2['source'] = job['fbx'] + ' + ' + vtex
        r2['scale'] = round(scale, 4)
        r2['textures'] = {vtex: '%dx%d' % (ti['w'], ti['h'])}
        report.append(r2)
        print('OK', vname)


report_path = os.path.join(root, 'tools/blender/itch_kits/_reports/nocturnal-watch.json')
report = []
if ONLY and os.path.exists(report_path):
    report = [r for r in json.load(open(report_path))]
for job in JOBS:
    tag = job.get('out') or os.path.splitext(os.path.basename(job['fbx']))[0]
    if ONLY and tag not in ONLY:
        continue
    K.reset()
    K._matcache.clear()
    objs = K.import_any(os.path.join(MODELS, job['fbx']))
    meshes = K.bake_and_clean(objs)
    if 'split' in job:
        split = job['split']
        if split is None:
            split = {K.snake(o.name): ([o.name], {}) for o in meshes}
        # pristine copies so one source object can feed several outputs (e.g. lantern + wall lantern)
        pristine = {o.name: (o.data.copy(), [s.material for s in o.material_slots]) for o in meshes}
        for o in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
        for oname, spec in split.items():
            names, opts = spec if isinstance(spec, tuple) else (spec, {})
            name = job.get('prefix', '') + oname
            report = [r for r in report if not r['file'].endswith('/' + name + '.glb')]
            group = []
            for n in names:
                o = bpy.data.objects.new(n, pristine[n][0].copy())
                bpy.context.scene.collection.objects.link(o)
                group.append(o)
            build(job, name, group, report, opts)
            for o in list(bpy.context.scene.objects):
                bpy.data.objects.remove(o, do_unlink=True)
    else:
        report = [r for r in report if not r['file'].endswith('/' + job['out'] + '.glb')]
        build(job, job['out'], meshes, report)

K.save_report(report_path, report)
print('DONE', len(report))
