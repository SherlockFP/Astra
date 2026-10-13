#!/usr/bin/env python
"""build_replace.py  -  WP5 nature remap (docs/ART_VOXEL_PSX.md 2.2 and 4.3 WP5).

Steps:
  1. generate the canonical nature set (gen_nature.py, every id, plus voxel_master*.png) into public/assets/models/voxel/nature/
  2. map every source that tools/voxel/manifest.json marks decision=replace (trees, groves, bushes, rocks, cliffs, stumps,
     logs, grass, flowers, mushrooms, cacti, lilies, reeds: 487 files) to one generated model: group by name, then pick the
     id and a uniform scale k from SCALES so that the native height H_id * k is within +-25 % of the source's native height
     (manifest bbox_m[1], the same measure as Pieces.pieceSize). Tiers in pick(): floor-compliant variants first (voxel edge
     >= CELL_FLOOR 0.06 m), then sub-floor variants (tiny sources), then the closest variant (flat sources)
  3. write the k != 1 variants to nature/k<tag>/<id>.glb (same voxel grid and triangles, uniformly scaled)
  4. write tools/voxel/replace.json  { "/assets/models/<src>": "/assets/models/voxel/nature/...glb" }, the reports
     tools/voxel/reports/wp5_nature_replace.txt, wp5_nature_set.txt, wp5_nature_verify.txt, and parse-verify every nature GLB
  src/core/voxelReplace.ts is emitted by build_remap.mjs (node tools/voxel/build_remap.mjs --out-dir <dir>), not by this script

usage (repo root):  python -I tools/voxel/build_replace.py [--check]
  --check   recompute the mapping and exit 1 if replace.json differs (nothing is written)
"""
import sys, os, re, json, math, hashlib, glob, shutil, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_nature as GN   # noqa: E402  (same directory; -I ignores the cwd, so the path is inserted above)

REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
NATURE = os.path.join(REPO, 'public', 'assets', 'models', 'voxel', 'nature')
MANIFEST = os.path.join(HERE, 'manifest.json')
REPLACE = os.path.join(HERE, 'replace.json')
REPORT_DIR = os.path.join(HERE, 'reports')
REPORT = os.path.join(REPORT_DIR, 'wp5_nature_replace.txt')   # .txt: run_all.py aggregates every reports/*.json as a per-file record
SRC_PREFIX = '/assets/models/'
VOX_PREFIX = '/assets/models/voxel/nature/'
TOL = math.log(1.25)                       # +-25 % height (log space, symmetric)
SCALES = [2.0, 1.5, 1.0, 0.75, 0.6, 0.5, 1 / 3, 0.25, 0.2, 1 / 6, 1 / 8, 1 / 12]
PREFER_UNIT = 0.03                         # penalty (log units) for k != 1: unscaled canonical models win near ties
CELL_FLOOR = 0.06                          # voxel edge in metres never below this (ART_VOXEL_PSX.md 1.3: 2 virtual px at 9 m)
NEAR = 0.06                                # candidates this close to the best error share the pick (hash for variety)

# ------------------------------------------------------------------------------------------------ canonical groups (gen_nature ids)
GROUP_IDS = {
    'oak': ['tree_oak_m1', 'tree_oak_m2', 'tree_oak_l1', 'tree_oak_l2', 'tree_oak_l3'],
    'olive': ['tree_olive_l1', 'tree_oak_l1'],
    'birch': ['tree_birch_m1', 'tree_birch_l1'],
    'pine': ['tree_pine_m1', 'tree_pine_m2', 'tree_pine_l1', 'tree_pine_l2', 'tree_pine_l3'],
    'spruce': ['tree_spruce_l1', 'tree_spruce_l2'],
    'autumn': ['tree_autumn_m1', 'tree_autumn_l1', 'tree_autumn_l2'],
    'frost': ['tree_frost_l1', 'tree_frost_l2'],
    'dead': ['tree_dead_m1', 'tree_dead_l1', 'tree_dead_l2', 'tree_dead_frost_l1'],
    'swamp': ['tree_swamp_l1', 'tree_pine_l1'],
    'grove_a': ['grove_a_s', 'grove_a_m', 'grove_a_l'],
    'grove_b': ['grove_b_s', 'grove_b_m', 'grove_b_l'],
    'bush': ['bush_1', 'bush_2', 'bush_berry'],
    'bush_autumn': ['bush_autumn'],
    'bush_frost': ['bush_frost'],
    'cactus': ['cactus_tall', 'cactus_short'],
    'rock': ['rock_s1', 'rock_s2', 'rock_m1', 'rock_m2', 'rock_l1', 'rock_l2', 'rock_xl1'],
    'rock_tall': ['rock_tall_1', 'rock_tall_2', 'rock_tall_3'],
    'cliff': ['cliff_block', 'cliff_half', 'cliff_corner', 'cliff_slope', 'rock_xl1'],
    'tuft': ['tuft'],
    'flowers_red': ['flowers_r'],
    'flowers_yellow': ['flowers_y'],
    'flowers_purple': ['flowers_p'],
    'flowers': ['flowers_r', 'flowers_y', 'flowers_p'],
    'mushroom_red': ['mushroom_red'],
    'mushroom_tan': ['mushroom_tan'],
    'mushroom': ['mushroom_red', 'mushroom_tan'],
    'lily': ['lily'],
    'reeds': ['reeds'],
    'stump': ['stump'],
    'log': ['log'],
}

# itch retro-psx-tree-pack trees/treeNN.glb (table of WP5, ART_VOXEL_PSX.md 2.2)
RETRO_TREE_PACK = {}
for _ids, _grp in [([2, 13, 15, 16, 17, 20, 21, 22, 23, 24, 25, 27], 'oak'), ([18, 19, 26], 'olive'), ([35, 36], 'birch'),
                   ([4, 7, 9, 10, 11, 14], 'pine'), ([1, 3, 5, 8, 12], 'spruce'), (list(range(28, 35)), 'autumn'), ([6], 'frost')]:
    for _n in _ids: RETRO_TREE_PACK[_n] = _grp
assert len(RETRO_TREE_PACK) == 36

TREE_RE = re.compile(r'tree|pine|spruce|fir|oak|birch|trunk|palm')   # the tree-like regex of 2.2: no tree family may leak as voxel


def classify(rel):
    """Group key for a source path relative to public/assets/models (lower case inside). None = not a nature family."""
    low = rel.lower()
    name = low.rsplit('/', 1)[-1][:-4] if low.endswith('.glb') else low.rsplit('/', 1)[-1]
    m = re.match(r'^tree(\d+)$', name)
    if m and 'retro-psx-tree-pack' in low:
        return RETRO_TREE_PACK[int(m.group(1))]
    m = re.match(r'^tree(\d+)_(\w+)$', name)
    if m and 'retro-psx-nature-pack' in low:
        n, season = int(m.group(1)), m.group(2)
        if season.startswith('fall'): return 'autumn'
        if season.startswith('winter'): return 'dead' if n in (1, 3) else 'frost'   # bare winter 01 / 03, others keep leaves
        return 'birch' if n == 2 else 'oak'
    if 'cliff' in name: return 'cliff'
    if name.endswith('_cut') or 'stump' in name or 'trunk' in name: return 'stump'   # cut or standing trunks (trunk-long is a 1 m standing trunk)
    if 'log' in name: return 'log'
    if 'lily' in name: return 'lily'
    if 'waterplant' in name: return 'reeds'
    if name.startswith('trees_a'): return 'grove_a'
    if name.startswith('trees_b'): return 'grove_b'
    if 'flower' in name:
        return 'flowers_red' if 'red' in name else 'flowers_yellow' if 'yellow' in name else 'flowers_purple' if 'purple' in name else 'flowers'
    if 'mushroom' in name:
        return 'mushroom_tan' if 'tan' in name else 'mushroom_red' if 'red' in name else 'mushroom'
    if 'cactus' in name: return 'cactus'
    if 'bush' in name:
        return 'bush_autumn' if 'fall' in name else 'bush_frost' if 'winter' in name else 'bush'
    if 'grass' in name or 'plant_flat' in name or 'tuft' in name: return 'tuft'
    if 'tall' in name and ('rock' in name or 'stone' in name): return 'rock_tall'
    if 'rock' in name or 'stone' in name: return 'rock'
    if 'tree' in name or 'pine' in name or 'oak' in name or 'birch' in name:
        if 'birch' in name: return 'birch'
        if 'olive' in name: return 'olive'
        if 'dead' in name or 'bare' in name: return 'dead'
        if any(w in name for w in ('fall', 'autumn', 'orange', 'yellow')): return 'autumn'
        if any(w in name for w in ('frost', 'snow', 'winter')): return 'frost'
        if 'spruce' in name or 'fir' in name: return 'spruce'
        if 'pine' in name: return 'pine'
        return 'oak'
    return None


def pick(group_ids, H, CELL, H_src, key):
    """(id, k, err) for the source key. Tiers, in order:
    1. variants inside the +-25 % band whose voxel edge CELL_id * k stays >= CELL_FLOOR (the normal case);
    2. variants inside the band below the floor (tiny sources: a sub-floor cube is still closer to the source than a
       floor-sized cube that is far off in height);
    3. nothing in the band at all (flat sources such as lily pads, H < 0.03 m): the smallest log-error variant.
    Ties are broken by an md5 of the key (deterministic)."""
    allc = []
    for gid in group_ids:
        for k in SCALES:
            err = abs(math.log(H[gid] * k / H_src))
            allc.append((err, gid, k, CELL[gid] * k >= CELL_FLOOR - 1e-9))
    band = [c for c in allc if c[0] <= TOL + 1e-9]
    tier = [c for c in band if c[3]] or band or allc
    tier = sorted(tier, key=lambda c: (c[0] + (PREFER_UNIT if c[2] != 1.0 else 0.0), c[1], c[2]))
    near = [c for c in tier if c[0] + (PREFER_UNIT if c[2] != 1.0 else 0.0) <= tier[0][0] + (PREFER_UNIT if tier[0][2] != 1.0 else 0.0) + NEAR]
    idx = int(hashlib.md5(key.encode('utf-8')).hexdigest(), 16) % len(near)
    err, gid, k, _ = near[idx]
    return gid, k, err


def verify(root, max_tree_tris=3000):
    """Parses every generated nature GLB back (not just the generator's numbers): indices in range, finite positions,
    UV in 0..1, one palette image <= 128 px, one material 'voxel_master', tris within budget (trees <= max_tree_tris).
    Returns a list of dict(file, tris, kb, errs)."""
    import numpy as np
    import voxelize_glb as vg
    out = []
    for dp, _, fns in os.walk(root):
        for fn in sorted(fns):
            if not fn.endswith('.glb'): continue
            path = os.path.join(dp, fn); errs = []
            js, bn = vg.read_glb(path)
            tris = 0
            for n in js['nodes']:
                if 'mesh' not in n: continue
                for p in js['meshes'][n['mesh']]['primitives']:
                    P = vg.read_acc(js, bn, p['attributes']['POSITION'])
                    if not np.isfinite(P).all(): errs.append('non-finite positions')
                    idx = vg.read_acc(js, bn, p['indices']).reshape(-1)
                    if len(idx) % 3 or idx.max() >= len(P): errs.append('bad indices')
                    tris += len(idx) // 3
                    if 'TEXCOORD_0' in p['attributes']:
                        uv = vg.read_acc(js, bn, p['attributes']['TEXCOORD_0'])
                        if uv.min() < 0 or uv.max() > 1: errs.append('uv outside 0..1')
            mats = [m.get('name') for m in js.get('materials', [])]
            if mats != ['voxel_master']: errs.append('materials %s' % mats)
            if len(js.get('images', [])) != 1: errs.append('images %d' % len(js.get('images', [])))
            if fn.startswith(('tree_', 'grove_')) and tris > max_tree_tris: errs.append('tree tris %d > %d' % (tris, max_tree_tris))
            if tris > 3500: errs.append('tris %d above the 3.5k nature ceiling' % tris)
            out.append(dict(file=os.path.relpath(path, root).replace(os.sep, '/'), tris=tris, kb=round(os.path.getsize(path) / 1024, 1), errs=errs))
    return out


def tag(k):
    return {2.0: '2', 1.5: '1p5', 1.0: '1', 0.75: '0p75', 0.6: '0p6', 0.5: '0p5', 1 / 3: '0p33', 0.25: '0p25', 0.2: '0p2', 1 / 6: '0p167', 1 / 8: '0p125', 1 / 12: '0p083'}[k]


TAG_TO_K = {tag(k): k for k in SCALES}


def vox_url(gid, k):
    return VOX_PREFIX + gid + '.glb' if k == 1.0 else VOX_PREFIX + 'k' + tag(k) + '/' + gid + '.glb'


def compute(H, CELL):
    """Mapping for every manifest 'replace' source. Returns (rows, replace dict, tree-like sources kept as voxel)."""
    man = json.load(open(MANIFEST, encoding='utf-8'))
    rows, replace, kept = [], {}, []
    for e in man['entries']:
        if e['decision'] == 'replace':
            src = e['src']
            if not e.get('bbox_m'): raise SystemExit('no bbox for ' + src)
            H_src = float(e['bbox_m'][1])
            grp = classify(src)
            if grp is None: raise SystemExit('unclassified nature source: ' + src)
            gids = GROUP_IDS[grp]
            if H_src <= 0.0: H_src = 0.01
            gid, k, err = pick(gids, H, CELL, H_src, src)
            url = SRC_PREFIX + src
            replace[url] = vox_url(gid, k)
            rows.append(dict(src=src, group=grp, id=gid, k=round(k, 4), tag=tag(k), H_src=round(H_src, 4), H_out=round(H[gid] * k, 4),
                             err_pct=round(100 * (H[gid] * k / H_src - 1), 1), cell=round(CELL[gid] * k, 4),
                             within_25=bool(abs(H[gid] * k / H_src - 1) <= 0.25 + 1e-9), tris=CANON_TRIS[gid]))
        elif TREE_RE.search(e['src'].lower()) and e['decision'] != 'replace' and e.get('class') not in ('keep',):
            kept.append(dict(src=e['src'], decision=e['decision'], cls=e.get('class')))
    return rows, replace, kept


def main():
    check = '--check' in sys.argv
    tmp = tempfile.mkdtemp(prefix='wp5_check_') if check else None
    try:
        return _main(check, tmp)
    finally:
        if tmp: shutil.rmtree(tmp, ignore_errors=True)


def _main(check, tmp):
    if not check:
        os.makedirs(NATURE, exist_ok=True)
    # 1. canonical set (--check writes into a temp dir and touches nothing else)
    man_nat = GN.generate(tmp if check else NATURE, write_manifest=False, quiet=True)
    global CANON_TRIS
    CANON_TRIS = {k: v['tris'] for k, v in man_nat.items()}
    H = {k: float(v['size'][1]) for k, v in man_nat.items()}
    global CANON_CELL
    CANON_CELL = {k: float(v['cell']) for k, v in man_nat.items()}
    if not check:
        open(os.path.join(NATURE, 'manifest.json'), 'w').write(json.dumps(man_nat, indent=1))
        open(os.path.join(NATURE, 'voxel_master.png'), 'wb').write(GN.palette_png())
        open(os.path.join(NATURE, 'voxel_master_winter.png'), 'wb').write(GN.palette_png(GN.WINTER))
    # 2. mapping
    rows, replace, kept = compute(H, CANON_CELL)
    # 3. variants used by the mapping (k != 1), rebuilt from scratch so stale variants never linger
    used = sorted({(r['id'], TAG_TO_K[r['tag']]) for r in rows if r['tag'] != '1'})
    if check:
        cur = json.load(open(REPLACE, encoding='utf-8')) if os.path.exists(REPLACE) else {}
        if cur != replace:
            print('STALE tools/voxel/replace.json'); sys.exit(1)
        print('replace.json up to date (%d sources, %d variants)' % (len(replace), len(used)))
        return
    for d in glob.glob(os.path.join(NATURE, 'k*')):
        if os.path.isdir(d) and re.match(r'^k(2|1p5|0p75|0p6|0p5|0p33|0p25|0p2|0p167|0p125|0p083)$', os.path.basename(d)):
            shutil.rmtree(d)
    by_k = {}
    for gid, k in used: by_k.setdefault(k, []).append(gid)
    for k, ids in by_k.items():
        GN.generate(os.path.join(NATURE, 'k' + tag(k)), ids, scale=k, write_manifest=False, quiet=True)
    # 4. outputs
    open(REPLACE, 'w', encoding='utf-8').write(json.dumps(dict(sorted(replace.items())), indent=1) + '\n')
    tree_rows = [r for r in rows if r['group'] in ('oak', 'olive', 'birch', 'pine', 'spruce', 'autumn', 'frost', 'dead', 'swamp', 'grove_a', 'grove_b')]
    within = sum(1 for r in rows if r['within_25'])
    ver = verify(NATURE)
    ver_bad = [v for v in ver if v['errs']]
    summary = dict(sources=len(rows), within_25=within, outside_25=len(rows) - within, variants=len(used),
                   sub_floor_sources=sum(1 for r in rows if r['cell'] < CELL_FLOOR - 1e-9), verified_glb=len(ver), verify_fail=len(ver_bad),
                   variant_files=sum(len(v) for v in by_k.values()), max_tree_tris=max(r['tris'] for r in tree_rows),
                   by_group={g: sum(1 for r in rows if r['group'] == g) for g in sorted({r['group'] for r in rows})},
                   canonical_ids=len(man_nat), kept_tree_like=kept)
    os.makedirs(REPORT_DIR, exist_ok=True)
    lines = ['WP5 nature remap (tools/voxel/build_replace.py)', 'band: +-25 % native height; k = uniform scale of the canonical id', '']
    lines += ['%s: %s' % (k, json.dumps(v)) for k, v in summary.items() if k != 'kept_tree_like']
    lines += ['', 'kept tree-like sources (not replaced; voxel props or hex massifs with trees on them):']
    lines += ['  %s  %s  %s' % (kk['decision'], kk['cls'], kk['src']) for kk in kept]
    lines += ['', '	'.join(['src', 'group', 'id', 'k', 'H_src_m', 'H_out_m', 'err_pct', 'within_25', 'tris'])]
    lines += ['	'.join(str(r[c]) for c in ('src', 'group', 'id', 'tag', 'H_src', 'H_out', 'err_pct', 'within_25', 'tris')) for r in sorted(rows, key=lambda r: r['src'])]
    open(REPORT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    vlines = ['WP5 nature GLB verification (build_replace.py verify): %d files, %d with errors' % (len(ver), len(ver_bad)), '']
    vlines += ['file\ttris\tkb\terrors'] + ['%s\t%d\t%s\t%s' % (v['file'], v['tris'], v['kb'], '; '.join(v['errs']) or 'ok') for v in ver]
    open(os.path.join(REPORT_DIR, 'wp5_nature_verify.txt'), 'w', encoding='utf-8').write('\n'.join(vlines) + '\n')
    slines = ['WP5 canonical nature set (gen_nature.py): %d ids, voxel edge, native size (m), triangles' % len(man_nat), '']
    slines += ['id\tcell_m\tW_x_H_x_D_m\ttris'] + ['%s\t%s\t%s\t%d' % (k, v['cell'], 'x'.join(str(x) for x in v['size']), v['tris']) for k, v in sorted(man_nat.items())]
    open(os.path.join(REPORT_DIR, 'wp5_nature_set.txt'), 'w', encoding='utf-8').write('\n'.join(slines) + '\n')
    print(json.dumps({k: v for k, v in summary.items() if k != 'kept_tree_like'}, indent=1))
    print('kept tree-like (not replaced): %d' % len(kept))
    if ver_bad: print('VERIFY FAILURES: ' + '; '.join('%s %s' % (v['file'], v['errs']) for v in ver_bad[:10]))
    print('report: ' + REPORT)


CANON_TRIS = {}
CANON_CELL = {}
if __name__ == '__main__':
    main()
