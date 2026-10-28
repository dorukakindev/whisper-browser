"""Opt-in real GPU/cache acceptance with an injected last-request stall.

The stall is deliberately injected at the server.generate boundary; it is not
evidence that a naturally occurring nano-vLLM hang has been reproduced.
"""
import argparse
import asyncio
import contextlib
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import secrets
import sys
import time


def selective_repair(root, args, reader, EngineSession):
    """Reproduce one explicit group repair from this tool's synthetic evidence."""
    folder = args.repair_existing.resolve()
    previous = json.loads((folder/'acceptance.json').read_text(encoding='utf-8'))
    assert previous.get('complete') is True and previous['engineCount'] == 2
    source = folder/'sentetik.srt'
    assert source.is_file() and source.stat().st_size < 8192
    assert isinstance(previous['seed'], int) and 0 < previous['seed'] <= 100000000
    original, cache = reader.uret, []
    expected = previous['preservedFirst']['sha256']

    async def observed(options, cues, paths, prompt):
        cache[:] = paths
        assert hashlib.sha256(paths[0].read_bytes()).hexdigest() == expected
        return await original(options, cues, paths, prompt)

    reader.uret = observed
    runtime, began = EngineSession(), time.monotonic()
    try:
        argv = [str(source), str(args.reference.resolve()), '--mode', 'clone', '--steps', '15',
                '--seed', str(previous['seed']), '--eszamanli', '1', '--gruplama', 'satir',
                '--request-timeout', '30', '--verification', 'detailed',
                '--verify-python', str(args.verify_python.resolve()), '--timing-mode', 'video',
                '--force-groups', '2', '--output', str(folder/'selective-repair.wav')]
        with (folder/'selective-repair.log').open('w', encoding='utf-8') as log, contextlib.redirect_stdout(log):
            code = reader.main(argv, runtime=runtime) or 0
        assert code == 0 and hashlib.sha256(cache[0].read_bytes()).hexdigest() == expected
        frames = [json.loads(line[len('DUB_METRICS '):]) for line in
                  (folder/'selective-repair.log').read_text(encoding='utf-8').splitlines() if line.startswith('DUB_METRICS ')]
        assert len(frames) == 1 and frames[0]['cached_groups'] == 1 and frames[0]['generated_groups'] == 1
        quality = json.loads((folder/'selective-repair.quality.json').read_text(encoding='utf-8'))
        result = {'exit': code, 'firstHashUnchanged': True, 'cachedGroups': 1, 'generatedGroups': 1,
                  'quality': quality, 'elapsedSeconds': round(time.monotonic()-began, 3)}
        (folder/'selective-repair-acceptance.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'exit': code, 'statuses': [g['status'] for g in quality['groups']]}), flush=True)
    finally:
        runtime.close()
        reader.uret = original


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-real-gpu-stall', action='store_true')
    parser.add_argument('--engine', required=True, type=Path)
    parser.add_argument('--reference', required=True, type=Path)
    parser.add_argument('--verify-python', required=True, type=Path)
    parser.add_argument('--repair-existing', type=Path, help='Only repair group2 of a previous synthetic acceptance; no stall injection')
    args = parser.parse_args()
    if not args.run_real_gpu_stall:
        parser.error('Explicit --run-real-gpu-stall required')
    engine = args.engine.resolve()
    for file in (engine/'kitap_ortak.py', args.reference, args.verify_python):
        if not file.is_file():
            parser.error('Required local engine/reference/verifier file is missing')
    root = Path(__file__).resolve().parents[1]
    os.environ.update(VOXCPM_ROOT=str(engine), HF_HUB_OFFLINE='1', PYTHONUTF8='1')
    sys.path.insert(0, str(root/'tools/voxcpm2'))
    import altyazi_oku as reader
    from dub_runtime import EngineSession
    from dub_quality import valid_audio
    import soundfile as sf
    from nanovllm_voxcpm import VoxCPM

    if args.repair_existing:
        selective_repair(root, args, reader, EngineSession)
        return

    output = root/'.uiprev'/'voice-stall'/f'{time.time_ns()}-{os.getpid()}'
    output.mkdir(parents=True)
    first = 'Bu ilk cümle tamamlanan sesin korunmasını kontrol ediyor.'
    last = 'Son parça yeniden denendiğinde aynı referans sesi kullanıyoruz.'
    source = output/'sentetik.srt'
    source.write_text(f'1\n00:00:00,000 --> 00:00:12,000\n{first}\n\n2\n00:00:14,000 --> 00:00:26,000\n{last}\n', encoding='utf-8-sig')
    seed = secrets.randbelow(100000000)+1
    result = {'complete': False, 'injectedFault': 'one last generate request stalls, first cancel acknowledgement stalls', 'seed': seed}
    actual_factory, actual_uret = VoxCPM.from_pretrained, reader.uret
    servers, process_objects, attempts, durable = [], [], [], {}
    active_paths = []

    class Proxy:
        def __init__(self, actual):
            self.actual = actual
            self.index = len(servers)
            servers.append(self)
        def __getattr__(self, name):
            return getattr(self.actual, name)
        async def wait_for_ready(self):
            value = await self.actual.wait_for_ready()
            process_objects.extend(worker.process for worker in self.actual.servers)
            return value
        async def generate(self, text, **kwargs):
            attempts.append({'engine': self.index, 'text': text, 'seed': kwargs.get('seed')})
            if self.index == 0 and text == last:
                assert valid_audio(active_paths[0], sf), 'first actual waveform must already be durable'
                durable['sha256'] = hashlib.sha256(active_paths[0].read_bytes()).hexdigest()
                durable['firstReadyBeforeStall'] = json.loads(active_paths[0].with_suffix('.json').read_text(encoding='utf-8')).get('status')
                try:
                    await asyncio.Event().wait()
                finally:
                    await asyncio.Event().wait()  # Acknowledgement requires the bounded second cancel.
            async for part in self.actual.generate(text, **kwargs):
                yield part

    def factory(*values, **kwargs):
        return Proxy(actual_factory(*values, **kwargs))

    async def observe_uret(options, cues, paths, prompt):
        active_paths[:] = paths
        return await actual_uret(options, cues, paths, prompt)

    runtime = EngineSession()
    VoxCPM.from_pretrained = staticmethod(factory)
    reader.uret = observe_uret
    began = time.monotonic()
    try:
        argv = [str(source), str(args.reference.resolve()), '--mode', 'clone', '--steps', '15',
                '--seed', str(seed), '--eszamanli', '1', '--gruplama', 'satir',
                '--request-timeout', '30', '--verification', 'detailed',
                '--verify-python', str(args.verify_python.resolve()), '--timing-mode', 'video',
                '--output', str(output/'recovered.wav')]
        with (output/'generation.log').open('w', encoding='utf-8') as log, contextlib.redirect_stdout(log):
            code = reader.main(argv, runtime=runtime) or 0
        assert code == 0
        assert len(servers) == 2, 'one bounded restart must create exactly one replacement engine'
        assert durable.get('sha256')
        assert hashlib.sha256(active_paths[0].read_bytes()).hexdigest() == durable['sha256'], 'completed speech must remain byte-identical'
        assert not any(row['engine'] == 1 and row['text'] == first for row in attempts), 'healthy group must not be regenerated'
        assert any(row['engine'] == 1 and row['text'] == last for row in attempts), 'same reference must generate the unfinished group'
        result.update(engineCount=len(servers), preservedFirst=durable, attempts=attempts)
        log_text = (output/'generation.log').read_text(encoding='utf-8')
        assert log_text.count('DUB_WARNING engine_restart') == 1
        # The production stdout frame is request-scoped; the engine's shared
        # cache-directory report is neither the per-run report directory nor a
        # safe source of evidence after another run has overwritten it.
        frames = [line[len('DUB_METRICS '):] for line in log_text.splitlines() if line.startswith('DUB_METRICS ')]
        assert len(frames) == 1
        metrics = json.loads(frames[0])
        assert metrics['cached_groups'] == 1 and metrics['generated_groups'] == 1
        quality = json.loads((output/'recovered.quality.json').read_text(encoding='utf-8'))
        assert len(quality['groups']) == 2
        assert valid_audio(output/'recovered.wav', sf)
        result.update(exitCode=code, engineCount=len(servers), preservedFirst=durable, attempts=attempts,
                      cachedGroups=metrics['cached_groups'], generatedGroups=metrics['generated_groups'], quality=quality)
    finally:
        runtime.close()
        VoxCPM.from_pretrained, reader.uret = actual_factory, actual_uret
        result['elapsedSeconds'] = round(time.monotonic()-began, 3)
        result['observedGpuWorkerCount'] = len(process_objects)
        result['observedGpuWorkersClosed'] = all(not proc.is_alive() for proc in process_objects)
        (output/'acceptance.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    assert result['observedGpuWorkersClosed']
    assert result['observedGpuWorkerCount'] >= 2
    result['complete'] = True
    (output/'acceptance.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'complete':True, 'output':str(output), 'elapsedSeconds':result['elapsedSeconds']}), flush=True)


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
