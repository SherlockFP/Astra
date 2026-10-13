"""glbopt.py - lossless-enough post pass for Blender-exported animated GLBs (system Python + numpy, run with -I).

    python -I glbopt.py <in.glb> [<out.glb>]            (out defaults to in: rewritten in place)

What it does (nothing else in the file is touched):
  1. shifts every animation so its first key is at t = 0 (Blender's NLA export starts clips one frame late, which
     adds a held frame to every loop),
  2. drops animation channels that are constant AND equal to the node's rest transform (static scale / translation
     channels: the node already has that value, so playback is identical),
  3. removes redundant keys with a Ramer-Douglas-Peucker pass (rotation <= 0.0008 rad, translation <= 0.4 mm,
     scale <= 0.001 error against linear interpolation of the kept keys; first and last key always kept),
  4. rewrites the buffer without the unused data.
Prints a one-line JSON summary (OPTJSON ...).
"""
import sys, json, struct, os
import numpy as np

TOL = {'rotation': 0.0008, 'translation': 0.0004, 'scale': 0.001}
EPS_REST = {'rotation': 0.0004, 'translation': 0.0002, 'scale': 0.0005}


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<III', b, 0)
    assert magic == 0x46546C67 and ver == 2
    off = 12
    js = None
    bin_ = b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', b, off)
        data = b[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(data.decode('utf8'))
        elif ctype == 0x004E4942:
            bin_ = data
        off += 8 + clen
    return js, bin_


def write_glb(path, js, bin_):
    jb = json.dumps(js, separators=(',', ':')).encode('utf8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    bin_ = bin_ + b'\0' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bin_)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A) + jb)
        f.write(struct.pack('<II', len(bin_), 0x004E4942) + bin_)


COMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_acc(js, bin_, i):
    a = js['accessors'][i]
    assert a['componentType'] == 5126 and 'sparse' not in a, 'only float, non-sparse animation accessors supported'
    bv = js['bufferViews'][a['bufferView']]
    n = COMP[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', n * 4)
    if stride == n * 4:
        arr = np.frombuffer(bin_, dtype='<f4', count=a['count'] * n, offset=off).reshape(a['count'], n)
    else:
        arr = np.stack([np.frombuffer(bin_, dtype='<f4', count=n, offset=off + k * stride) for k in range(a['count'])])
    return arr.astype(np.float64)


def rdp_keep(t, v, kind, tol):
    """Indices of keys to keep (always the first and last)."""
    n = len(t)
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        u = ((t[i + 1:j] - t[i]) / (t[j] - t[i]))[:, None]
        mid = v[i + 1:j]
        if kind == 'rotation':
            qj = v[j] if np.dot(v[i], v[j]) >= 0 else -v[j]
            q = (1 - u) * v[i] + u * qj
            q /= np.linalg.norm(q, axis=1, keepdims=True)
            d = np.abs(np.sum(q * mid, axis=1))
            err = 2 * np.arccos(np.clip(d, -1, 1))
        else:
            err = np.max(np.abs((1 - u) * v[i] + u * v[j] - mid), axis=1)
        k = int(np.argmax(err))
        if err[k] > tol:
            m = i + 1 + k
            keep[m] = True
            stack.append((i, m))
            stack.append((m, j))
    return np.nonzero(keep)[0]


def is_const(v, kind):
    if kind == 'rotation':
        d = np.abs(v @ v[0])
        return bool(np.all(2 * np.arccos(np.clip(d, -1, 1)) < 1e-4))
    return bool(np.all(np.ptp(v, axis=0) < 1e-5))


def rest_of(node, kind):
    if kind == 'rotation':
        return np.array(node.get('rotation', [0, 0, 0, 1]), float)
    if kind == 'translation':
        return np.array(node.get('translation', [0, 0, 0]), float)
    return np.array(node.get('scale', [1, 1, 1]), float)


def same_as_rest(val, rest, kind):
    if kind == 'rotation':
        return 2 * np.arccos(np.clip(abs(float(val @ rest)), -1, 1)) < EPS_REST[kind]
    return bool(np.all(np.abs(val - rest) < EPS_REST[kind]))


def optimise(js, bin_):
    new_blobs = []   # (bytes, accessor json) appended as fresh bufferViews
    cache = {}
    stats = {'channels_in': 0, 'channels_out': 0, 'keys_in': 0, 'keys_out': 0, 'shifted': 0}

    def add_acc(arr, typ, minmax=False):
        data = np.ascontiguousarray(arr.astype('<f4')).tobytes()
        key = (typ, data)
        if key in cache:
            return cache[key]
        acc = {'componentType': 5126, 'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            acc['min'] = [float(np.min(arr[:, c])) for c in range(arr.shape[1])]
            acc['max'] = [float(np.max(arr[:, c])) for c in range(arr.shape[1])]
            acc['min'] = [float(np.float32(x)) for x in acc['min']]
            acc['max'] = [float(np.float32(x)) for x in acc['max']]
        new_blobs.append((data, acc))
        idx = ('new', len(new_blobs) - 1)
        cache[key] = idx
        return idx

    for anim in js.get('animations', []):
        tmin = 1e18
        pre = []
        for ch in anim['channels']:
            s = anim['samplers'][ch['sampler']]
            t = read_acc(js, bin_, s['input'])[:, 0]
            v = read_acc(js, bin_, s['output'])
            pre.append((ch, s, t, v))
            tmin = min(tmin, float(t[0]))
        if tmin > 1e-6:
            stats['shifted'] += 1
        new_channels, new_samplers = [], []
        for ch, s, t, v in pre:
            stats['channels_in'] += 1
            stats['keys_in'] += len(t)
            kind = ch['target']['path']
            node = js['nodes'][ch['target']['node']]
            t = t - tmin
            if kind == 'rotation':
                for k in range(1, len(v)):          # hemisphere continuity
                    if np.dot(v[k - 1], v[k]) < 0:
                        v[k] = -v[k]
            if is_const(v, kind):
                if same_as_rest(v[0], rest_of(node, kind), kind):
                    continue                         # identical to the node's own transform: drop the channel
                idx = np.array([0, len(t) - 1]) if len(t) > 1 else np.array([0])
            else:
                idx = rdp_keep(t, v, kind, TOL[kind])
            tt, vv = t[idx], v[idx]
            if kind == 'rotation':
                vv = vv / np.linalg.norm(vv, axis=1, keepdims=True)
            ti = add_acc(tt[:, None], 'SCALAR', True)
            vi = add_acc(vv, 'VEC4' if kind == 'rotation' else 'VEC3')
            new_samplers.append({'input': ti, 'interpolation': 'LINEAR', 'output': vi})
            new_channels.append({'sampler': len(new_samplers) - 1, 'target': ch['target']})
            stats['channels_out'] += 1
            stats['keys_out'] += len(idx)
        anim['samplers'] = new_samplers
        anim['channels'] = new_channels

    # ---- rebuild accessors / bufferViews / bin
    old_acc = js['accessors']
    used_old = set()
    for m in js.get('meshes', []):
        for p in m['primitives']:
            used_old.update(p['attributes'].values())
            if 'indices' in p:
                used_old.add(p['indices'])
            for tgt in p.get('targets', []):
                used_old.update(tgt.values())
    for sk in js.get('skins', []):
        if 'inverseBindMatrices' in sk:
            used_old.add(sk['inverseBindMatrices'])
    for anim in js.get('animations', []):
        for s in anim['samplers']:
            for k in ('input', 'output'):
                if isinstance(s[k], int):
                    used_old.add(s[k])
    used_old = sorted(used_old)
    used_bv = set()
    for i in used_old:
        a = old_acc[i]
        if 'bufferView' in a:
            used_bv.add(a['bufferView'])
        if 'sparse' in a:
            used_bv.add(a['sparse']['indices']['bufferView'])
            used_bv.add(a['sparse']['values']['bufferView'])
    for im in js.get('images', []):
        if 'bufferView' in im:
            used_bv.add(im['bufferView'])
    used_bv = sorted(used_bv)

    out = bytearray()
    bv_map = {}
    new_bvs = []
    for i in used_bv:
        bv = dict(js['bufferViews'][i])
        data = bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        while len(out) % 4:
            out.append(0)
        bv['byteOffset'] = len(out)
        bv['buffer'] = 0
        out += data
        bv_map[i] = len(new_bvs)
        new_bvs.append(bv)
    acc_map = {}
    new_accs = []
    for i in used_old:
        a = json.loads(json.dumps(old_acc[i]))
        if 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]
        if 'sparse' in a:
            a['sparse']['indices']['bufferView'] = bv_map[a['sparse']['indices']['bufferView']]
            a['sparse']['values']['bufferView'] = bv_map[a['sparse']['values']['bufferView']]
        acc_map[i] = len(new_accs)
        new_accs.append(a)
    blob_acc = {}
    for n, (data, acc) in enumerate(new_blobs):
        while len(out) % 4:
            out.append(0)
        bv = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
        out += data
        new_bvs.append(bv)
        a = dict(acc)
        a['bufferView'] = len(new_bvs) - 1
        blob_acc[n] = len(new_accs)
        new_accs.append(a)
    # remap references
    for m in js.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
            for tgt in p.get('targets', []):
                for k in list(tgt):
                    tgt[k] = acc_map[tgt[k]]
    for sk in js.get('skins', []):
        if 'inverseBindMatrices' in sk:
            sk['inverseBindMatrices'] = acc_map[sk['inverseBindMatrices']]
    for anim in js.get('animations', []):
        for s in anim['samplers']:
            for k in ('input', 'output'):
                v = s[k]
                s[k] = blob_acc[v[1]] if isinstance(v, tuple) else acc_map[v]
    for im in js.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = bv_map[im['bufferView']]
    js['accessors'] = new_accs
    js['bufferViews'] = new_bvs
    js['buffers'] = [{'byteLength': len(out)}]
    return bytes(out), stats


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    before = os.path.getsize(src)
    js, bin_ = read_glb(src)
    if not js.get('animations'):
        print('OPTJSON ' + json.dumps({'file': src, 'note': 'no animations'}))
        return
    nb, stats = optimise(js, bin_)
    write_glb(dst, js, nb)
    stats.update({'file': dst.replace('\\', '/'), 'before': before, 'after': os.path.getsize(dst), 'animations': len(js['animations'])})
    print('OPTJSON ' + json.dumps(stats))


if __name__ == '__main__':
    main()
