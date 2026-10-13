#!/usr/bin/env python
"""run_all.py - convert the manifest, validate every output, auto-budget, write the report (ART_VOXEL_PSX.md WP0).

    python -I tools/voxel/run_all.py --only characters/Knight.glb          one file (repeatable, fnmatch globs allowed)
    python -I tools/voxel/run_all.py --all [--jobs 2] [--remap]           every decision=voxel entry of the manifest
    python -I tools/voxel/run_all.py --list [--only PATTERN ...]          print the plan, convert nothing
    python -I tools/voxel/run_all.py --only X --out-root SCRATCH          write elsewhere (tests, previews); reports go to SCRATCH/_reports

Per file: voxelize_glb.py --cell <native cell> with the flags of the manifest, then validate_voxel_glb.py ORIG VOX.
Auto-budget: visible triangles scale with 1 / cell^2, so when they exceed budget * 1.12 the cell grows by
sqrt(tris / budget), capped at 1.25 x the base cell; at most 3 conversions per file. Still over budget = OVER_BUDGET.
A file that fails the validator is deleted from the output tree (the resolver then falls back to the original).
Status: PASS | OVER_BUDGET | FAIL. Exit code 1 if any file FAILs.

Outputs: public/assets/models/voxel/<out> (default), tools/voxel/reports/<out>.json per file,
docs/assets/voxel-report.md and .json (regenerated from every per-file report). Sources are never written.
"""
import sys, os, re, json, math, time, argparse, fnmatch, subprocess, datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_manifest as bm                                        # noqa: E402  (same folder)

REPO = bm.REPO
SRC_ROOT = bm.SRC_ROOT
DEFAULT_OUT_ROOT = os.path.join(SRC_ROOT, bm.VOX_DIR_NAME)
MANIFEST = os.path.join(HERE, 'manifest.json')
REPORT_DIR = os.path.join(HERE, 'reports')
DOCS_MD = os.path.join(REPO, 'docs', 'assets', 'voxel-report.md')
DOCS_JSON = os.path.join(REPO, 'docs', 'assets', 'voxel-report.json')
CONV = os.path.join(HERE, 'voxelize_glb.py')
VALID = os.path.join(HERE, 'validate_voxel_glb.py')
REMAP = os.path.join(HERE, 'build_remap.mjs')
TOL = 1.12
MAX_CONVERSIONS = 3
MAX_JOBS = 4


def now_iso():
    return datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')


def run(cmd):
    p = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return p.returncode, p.stdout, p.stderr


def convert(e, cell, src, dst):
    cmd = [sys.executable, '-I', CONV, src, dst, '--cell', '%.4f' % cell, '--colors', '24',
           '--weights', e['weights'], '--blur', str(e['blur'])]
    if e['overlay']:
        cmd += ['--overlay', e['overlay']]
    if e['static']:
        cmd += ['--static']
    if e['keep']:
        cmd += ['--keep', e['keep']]
    if e['no_variation']:
        cmd += ['--no-variation']
    rc, out, err = run(cmd)
    if rc != 0:
        raise RuntimeError('voxelize_glb failed (exit %d): %s' % (rc, (err or out).strip()[-600:]))
    lines = [ln for ln in out.splitlines() if ln.startswith('STATS ')]
    if not lines:
        raise RuntimeError('voxelize_glb printed no STATS line')
    return json.loads(lines[-1][6:])


def visible_tris(st, hidden):
    nodes = st.get('nodes', {})
    return st['tris'] - sum(nodes.get(n, 0) for n in hidden)


def validate(orig, vox):
    rc, out, err = run([sys.executable, '-I', VALID, orig, vox])
    info, errs = {}, []
    for ln in out.splitlines():
        s = ln.strip()
        if not s or s in ('PASS', 'FAIL'):
            continue
        if s.startswith('PASS {'):
            s = s[5:]
        if s.startswith('{'):
            try:
                info = json.loads(s)
                continue
            except ValueError:
                pass
        errs.append(s)
    if rc == 0:
        errs = []
    elif not errs:
        errs.append((err or out).strip()[-300:] or 'validator exit %d' % rc)
    return rc == 0, info, errs


def match(e, pat):
    p = pat.replace('\\', '/')
    if p.startswith('voxel/'):
        p = p[len('voxel/'):]
    names = [e['src'], bm.rel_noext(e['src']), e['out'], bm.rel_noext(e['out'])]
    return any(n == p or fnmatch.fnmatchcase(n, p) for n in names)


def select(entries, patterns, use_all):
    out = []
    for e in entries:
        if patterns and not any(match(e, p) for p in patterns):
            continue
        if not patterns and not use_all:
            continue
        if use_all and e['decision'] != 'voxel' and not patterns:
            continue
        out.append(e)
    return out


def process(e, out_root, report_dir):
    src = os.path.join(SRC_ROOT, e['src'].replace('/', os.sep))
    dst = os.path.join(out_root, e['out'].replace('/', os.sep))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    t0 = time.time()
    budget, base, cap = e['budget'], e['native_cell'], e['cell_cap']
    cell, passes, st, vis = base, [], None, None
    rec = {'src': e['src'], 'out': e['out'], 'family': e['family'], 'class': e['class'], 'decision': e['decision'],
           'scale': e['scale'], 'scale_src': e['scale_src'], 'game_cell': e['game_cell'], 'native_cell_base': base,
           'budget': budget, 'hidden_nodes': e['hidden_nodes'], 'kb_src': e['src_kb'],
           'flags': {k: e[k] for k in ('static', 'keep', 'overlay', 'blur', 'weights', 'no_variation')},
           'generated': now_iso()}
    try:
        for n in range(1, MAX_CONVERSIONS + 1):
            st = convert(e, cell, src, dst)
            vis = visible_tris(st, e['hidden_nodes'])
            passes.append({'cell': round(cell, 4), 'tris_visible': vis, 'voxels': st['voxels']})
            if vis <= budget * TOL or n == MAX_CONVERSIONS:
                break
            new = min(cap, cell * math.sqrt(vis / float(budget)))
            if new <= cell * 1.0005:
                break
            cell = round(new, 4)
        ok, info, errs = validate(src, dst)
        if not ok:
            status = 'FAIL'
        elif vis > budget * TOL:
            status = 'OVER_BUDGET'
        else:
            status = 'PASS'
        rec.update(status=status, cell_used=round(cell, 4), passes=passes, voxels=st['voxels'], faces=st['faces'],
                   tris_total=st['tris'], tris_visible=vis, budget_pct=round(100.0 * (vis / float(budget) - 1), 1),
                   colors=st['colors'], validator='PASS' if ok else 'FAIL', validator_errors=errs, validator_info=info)
        if not ok and os.path.exists(dst):
            os.remove(dst)
    except Exception as ex:                                       # converter crash: keep the original, record the error
        if os.path.exists(dst):
            os.remove(dst)
        rec.update(status='FAIL', cell_used=round(cell, 4), passes=passes, voxels=None, faces=None, tris_total=None,
                   tris_visible=None, budget_pct=None, colors=None, validator='NOT RUN', validator_errors=[str(ex)[:800]],
                   validator_info={})
    rec['kb_out'] = round(os.path.getsize(dst) / 1024) if os.path.exists(dst) else None
    rec['seconds'] = round(time.time() - t0, 2)
    rp = os.path.join(report_dir, e['out'][:-4] + '.json')
    os.makedirs(os.path.dirname(rp), exist_ok=True)
    with open(rp, 'w', encoding='utf-8') as f:
        json.dump(rec, f, indent=1, ensure_ascii=False)
    return rec


def line_for(rec):
    if rec.get('tris_visible') is None:
        return '[%s] %s  %s' % (rec['status'], rec['src'], '; '.join(rec['validator_errors'])[:300])
    return ('[%s] %s  %s  cell %.4f (base %.4f, %d pass%s)  voxels %d  visible tris %d/%d  budget %d (%+.1f%%)  '
            'validator %s  %s KB  %.1f s') % (
        rec['status'], rec['src'], rec['class'], rec['cell_used'], rec['native_cell_base'], len(rec['passes']),
        '' if len(rec['passes']) == 1 else 'es', rec['voxels'], rec['tris_visible'], rec['tris_total'], rec['budget'],
        rec['budget_pct'], rec['validator'], rec['kb_out'], rec['seconds'])


def write_reports(report_dir, md_path, json_path, entries):
    recs = []
    if os.path.isdir(report_dir):
        for root, _, files in os.walk(report_dir):
            for fn in files:
                if fn.endswith('.json'):
                    with open(os.path.join(root, fn), encoding='utf-8') as f:
                        recs.append(json.load(f))
    recs.sort(key=lambda r: r['src'])
    cnt = {}
    for r in recs:
        cnt[r['status']] = cnt.get(r['status'], 0) + 1
    fam = {}
    for e in entries:
        d = fam.setdefault(e['family'], {'voxel': 0, 'replace': 0, 'keep': 0, 'PASS': 0, 'OVER_BUDGET': 0, 'FAIL': 0})
        d[e['decision']] += 1
    byout = {r['out']: r for r in recs}
    for e in entries:
        if e['decision'] == 'voxel' and e['out'] in byout:
            fam[e['family']][byout[e['out']]['status']] += 1
    dec = {}
    for e in entries:
        dec[e['decision']] = dec.get(e['decision'], 0) + 1
    now = now_iso()
    md = ['# Voxel-PSX conversion report', '',
          'Generated by `tools/voxel/run_all.py` at %s from `tools/voxel/manifest.json` (rules: docs/ART_VOXEL_PSX.md sections 1.3, 2, 4.3).' % now, '',
          'Converted files: **%d** (PASS %d, OVER_BUDGET %d, FAIL %d). Manifest: %d sources, decisions %s.' % (
              len(recs), cnt.get('PASS', 0), cnt.get('OVER_BUDGET', 0), cnt.get('FAIL', 0), len(entries), json.dumps(dec)), '',
          '## Coverage by family', '',
          '| family | voxel | replace (nature remap) | keep | PASS | OVER_BUDGET | FAIL |', '|---|---:|---:|---:|---:|---:|---:|']
    for f in sorted(fam):
        d = fam[f]
        md.append('| %s | %d | %d | %d | %d | %d | %d |' % (f, d['voxel'], d['replace'], d['keep'], d['PASS'], d['OVER_BUDGET'], d['FAIL']))
    md += ['', '## Converted files', '',
           '| source | class | scale | game cell | native cell | cell used | passes | voxels | visible tris | budget | status | KB out | s |',
           '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|']
    for r in recs:
        if r.get('tris_visible') is None:
            md.append('| %s | %s | | | | | | | | | **%s** | | |' % (r['src'], r['class'], r['status']))
            continue
        md.append('| %s | %s | %s | %s | %.4f | %.4f | %d | %d | %d | %d | %s | %s | %.1f |' % (
            r['src'], r['class'], r['scale'], r['game_cell'], r['native_cell_base'], r['cell_used'], len(r['passes']),
            r['voxels'], r['tris_visible'], r['budget'], r['status'], r['kb_out'], r['seconds']))
    fails = [r for r in recs if r['status'] == 'FAIL']
    if fails:
        md += ['', '## Failures', '']
        for r in fails:
            md.append('- `%s`: %s' % (r['src'], '; '.join(r['validator_errors'])[:400]))
    for p, body in ((md_path, '\n'.join(md) + '\n'),):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(body)
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'generated': now, 'counts': cnt, 'coverage': fam, 'records': recs}, f, indent=1, ensure_ascii=False)
    return cnt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', action='append', default=[], help='manifest source path or glob, e.g. characters/Knight.glb')
    ap.add_argument('--all', action='store_true', help='convert every decision=voxel entry')
    ap.add_argument('--list', action='store_true', help='print the selected plan and exit')
    ap.add_argument('--jobs', type=int, default=2, help='parallel converter processes (max %d)' % MAX_JOBS)
    ap.add_argument('--out-root', default=DEFAULT_OUT_ROOT, help='output root (default public/assets/models/voxel)')
    ap.add_argument('--no-rebuild', action='store_true', help='use the manifest file as it is (no rebuild)')
    ap.add_argument('--manifest', default=MANIFEST, help='manifest file to read (with --no-rebuild); default tools/voxel/manifest.json')
    ap.add_argument('--remap', action='store_true', help='afterwards run tools/voxel/build_remap.mjs (writes src/core)')
    a = ap.parse_args()
    if not a.only and not a.all and not a.list:
        ap.error('give --only PATTERN (repeatable) or --all')

    if a.no_rebuild and os.path.exists(a.manifest):
        with open(a.manifest, encoding='utf-8') as f:
            man = json.load(f)
    else:
        man = bm.build()
        with open(MANIFEST, 'w', encoding='utf-8') as f:
            json.dump(man, f, indent=1, ensure_ascii=False)
    entries = man['entries']

    out_root = os.path.abspath(a.out_root)
    if os.path.normcase(out_root) == os.path.normcase(os.path.abspath(SRC_ROOT)):
        ap.error('--out-root must not be the source folder')
    scratch = os.path.normcase(out_root) != os.path.normcase(os.path.abspath(DEFAULT_OUT_ROOT))
    report_dir = os.path.join(out_root, '_reports') if scratch else REPORT_DIR
    md_path = os.path.join(report_dir, 'voxel-report.md') if scratch else DOCS_MD
    json_path = os.path.join(report_dir, 'voxel-report.json') if scratch else DOCS_JSON

    sel = select(entries, a.only, a.all)
    if not sel:
        print('nothing selected (patterns: %s)' % a.only)
        return 0
    skipped = [e for e in sel if e['decision'] != 'voxel']
    todo = [e for e in sel if e['decision'] == 'voxel']
    for e in skipped:
        print('[SKIP] %s  decision=%s (%s)' % (e['src'], e['decision'], e['reason']))
    if a.list:
        for e in todo:
            print('%-48s %-9s game %-7s native %-8s budget %-5s hidden %d  %s' % (
                e['src'], e['class'], e['game_cell'], e['native_cell'], e['budget'], len(e['hidden_nodes']), e['out']))
        print('%d to convert, %d skipped' % (len(todo), len(skipped)))
        return 0

    jobs = max(1, min(a.jobs, MAX_JOBS))
    recs = []
    t0 = time.time()
    if todo:
        with ThreadPoolExecutor(max_workers=jobs) as ex:
            futs = [ex.submit(process, e, out_root, report_dir) for e in todo]
            for fu in as_completed(futs):
                rec = fu.result()
                recs.append(rec)
                print(line_for(rec), flush=True)
    cnt = write_reports(report_dir, md_path, json_path, entries)
    print('RESULT: %d converted in %.1f s  PASS %d  OVER_BUDGET %d  FAIL %d  | report: %s' % (
        len(recs), time.time() - t0, sum(1 for r in recs if r['status'] == 'PASS'),
        sum(1 for r in recs if r['status'] == 'OVER_BUDGET'), sum(1 for r in recs if r['status'] == 'FAIL'), md_path))
    if a.remap and not scratch:
        rc, out, err = run(['node', REMAP])
        print(out.strip() or err.strip())
        if rc != 0:
            print('build_remap.mjs failed: ' + err.strip()[-400:])
            return 1
    return 1 if any(r['status'] == 'FAIL' for r in recs) else 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(errors='replace')
    except Exception:
        pass
    sys.exit(main())
