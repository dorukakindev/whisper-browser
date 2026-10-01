#!/usr/bin/env python3
"""R334 ölü-bölge kilidi — resolve_device_and_compute (transcribe.py).

Sahte torch modülü ile CUDA mevcut/yok senaryoları sürülür:

- auto + CUDA yok → cpu + uyarı + warn_list kaydı
- auto + CUDA var → cuda
- cuda + yok → cpu'ya zorunlu düşüş + uyarı
- cpu + float16/int8_float16 → int8 (CPU'da desteklenmez)
- cpu + float32/int8 → olduğu gibi
- cuda + float16 → olduğu gibi (GPU'da geçerli)
"""

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402

PASS = []


def check(name, cond, detail=''):
    assert cond, f'{name}: {detail}'
    PASS.append(name)


def set_cuda(available):
    mod = types.ModuleType('torch')
    mod.cuda = types.SimpleNamespace(is_available=lambda: available)
    sys.modules['torch'] = mod


def restore_torch():
    sys.modules.pop('torch', None)


def t_auto_no_cuda():
    set_cuda(False)
    warns = []
    dev, ct = T.resolve_device_and_compute('auto', 'float16', warns)
    check('auto→cpu', dev == 'cpu', dev)
    check('cpu compute int8', ct == 'int8', ct)
    check('warn_list doldu', len(warns) == 1 and 'CPU' in warns[0], warns)


def t_auto_with_cuda():
    set_cuda(True)
    dev, ct = T.resolve_device_and_compute('auto', 'float16', [])
    check('auto→cuda', dev == 'cuda', dev)
    check('cuda compute korunur', ct == 'float16', ct)


def t_cuda_missing_falls_back():
    set_cuda(False)
    warns = []
    dev, ct = T.resolve_device_and_compute('cuda', 'int8_float16', warns)
    check('cuda→cpu düşüş', dev == 'cpu', dev)
    check('cpu compute int8', ct == 'int8', ct)
    check('cuda uyarısı', len(warns) == 1 and 'mevcut değil' in warns[0], warns)


def t_cpu_compute_matrix():
    set_cuda(False)
    cases = [
        ('float16', 'int8'),
        ('int8_float16', 'int8'),
        ('float32', 'float32'),
        ('int8', 'int8'),
    ]
    for given, want in cases:
        dev, ct = T.resolve_device_and_compute('cpu', given)
        check(f'cpu {given}→{want}', dev == 'cpu' and ct == want, (dev, ct))


def t_explicit_devices_passthrough():
    set_cuda(True)
    dev, ct = T.resolve_device_and_compute('cuda', 'float16')
    check('cuda+float16 korunur', (dev, ct) == ('cuda', 'float16'), (dev, ct))
    dev, ct = T.resolve_device_and_compute('cpu', 'int8')
    check('cpu+int8 korunur', (dev, ct) == ('cpu', 'int8'), (dev, ct))


if __name__ == '__main__':
    try:
        for name, fn in sorted(list(globals().items())):
            if name.startswith('t_'):
                fn()
    finally:
        restore_torch()
    print(f'test_device_deadzones: {len(PASS)} kontrol geçti')
