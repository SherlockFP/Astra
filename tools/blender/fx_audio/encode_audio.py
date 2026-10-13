"""Encode WAV -> mono OGG Vorbis with Blender's bundled Audaspace (ffmpeg) - no system ffmpeg needed.

Run headless:
  blender --background --factory-startup --python tools/blender/fx_audio/encode_audio.py -- <jobs.json> <index.json out>

Per file: mix to mono, trim leading/trailing silence (-50 dB re. peak, 10 ms pre-roll,
60 ms tail, short fades), peak-normalise to -1 dBFS, encode Vorbis at the source rate
(48 kHz), re-decode to verify, and measure duration / active RMS for a suggested gain.
"""
import json
import math
import os
import sys

import aud
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
JOBS, INDEX = argv[0], argv[1]
jobs = json.load(open(JOBS, encoding="utf-8"))

TARGET_PEAK = 10 ** (-1 / 20)
TARGET_RMS_DB = -18.0


def db(x):
    return 20 * math.log10(max(x, 1e-9))


def active_rms(x, rate):
    win = max(1, int(rate * 0.02))
    n = len(x) // win
    if n == 0:
        return float(np.sqrt(np.mean(x ** 2)))
    frames = x[: n * win].reshape(n, win)
    r = np.sqrt(np.mean(frames ** 2, axis=1))
    gate = r.max() * 10 ** (-30 / 20)
    act = r[r > gate]
    return float(np.sqrt(np.mean(act ** 2))) if len(act) else float(r.mean())


out = []
errors = []
for j in jobs:
    try:
        s = aud.Sound(j["src"])
        rate = int(s.specs[0])
        d = s.data().astype(np.float32)
        x = d.mean(axis=1) if d.ndim == 2 else d
        src_peak = float(np.abs(x).max())
        thr = max(src_peak * 10 ** (-50 / 20), 1e-5)
        idx = np.flatnonzero(np.abs(x) > thr)
        a = max(0, int(idx[0]) - int(rate * 0.010))
        b = min(len(x), int(idx[-1]) + int(rate * 0.060))
        y = x[a:b].copy()
        fi = min(len(y) // 4, int(rate * 0.003))
        fo = min(len(y) // 4, int(rate * 0.020))
        if a > 0 and fi > 0:
            y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
        if fo > 0:
            y[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)
        g = TARGET_PEAK / max(float(np.abs(y).max()), 1e-6)
        y *= g
        rms = active_rms(y, rate)
        os.makedirs(os.path.dirname(j["dst"]), exist_ok=True)
        buf = aud.Sound.buffer(y.reshape(-1, 1), float(rate))
        buf.write(j["dst"], rate=rate, channels=aud.CHANNELS_MONO, format=aud.FORMAT_FLOAT32,
                  container=aud.CONTAINER_OGG, codec=aud.CODEC_VORBIS, bitrate=j["bitrate"])
        chk = aud.Sound(j["dst"])
        cd = chk.data()
        if cd.size == 0:
            raise RuntimeError("re-decode returned no samples")
        dur = chk.length / chk.specs[0]
        vol = 10 ** ((TARGET_RMS_DB - db(rms)) / 20)
        rec = {k: j[k] for k in ("url", "pack", "category", "name", "kind", "source")}
        rec.update({
            "durationSec": round(dur, 3),
            "bytes": os.path.getsize(j["dst"]),
            "trimmedMs": [round(a / rate * 1000), round((len(x) - b) / rate * 1000)],
            "rmsDb": round(db(rms), 1),
            "volume": round(min(2.0, max(0.25, vol)), 2),
            "sourceGainDb": round(db(g), 1),
        })
        out.append(rec)
    except Exception as e:  # keep going, report at the end
        errors.append((j["src"], repr(e)))

json.dump({"files": out, "errors": errors}, open(INDEX, "w", encoding="utf-8"), indent=1)
print("encoded", len(out), "errors", len(errors))
for e in errors:
    print("ERR", e)
