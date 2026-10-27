"""Pinned official CLAP audio retrieval. Local files only; no runtime pip installs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave

MODEL = 'laion/clap-htsat-unfused'
REVISION = '8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a'
WEIGHT_SHA = '1cd3c601bc4afe0fa87be3de4c13dd2cfadd249fac1e29acf74a9b296c3219bb'
WEIGHT_SIZE = 614525833
SPACE = f'{MODEL}@{REVISION}:audio-512:even6-10s-v1'


def emit(**value):
    print(json.dumps(value, ensure_ascii=False), file=sys.stderr, flush=True)


def prepare(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name in ['config.json', 'preprocessor_config.json', 'pytorch_model.bin']:
        target = directory / name
        if target.is_file() and (name != 'pytorch_model.bin' or target.stat().st_size == WEIGHT_SIZE):
            if name != 'pytorch_model.bin' or file_hash(target) == WEIGHT_SHA:
                continue
        partial = directory / (name + '.download')
        # Resume only the pinned weight file. Final size and SHA256 are mandatory.
        offset = partial.stat().st_size if name == 'pytorch_model.bin' and partial.is_file() else 0
        if offset == WEIGHT_SIZE and file_hash(partial) == WEIGHT_SHA:
            os.replace(partial, target)
            continue
        if offset >= WEIGHT_SIZE:
            partial.unlink();offset=0
        # Avoid a cached, expired signed redirect for large public LFS files.
        url = f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}?download=true&request_time={time.time_ns()}'
        req = urllib.request.Request(url, headers={'Range':f'bytes={offset}-'} if offset else {})
        with urllib.request.urlopen(req, timeout=60) as response:
            if offset and (response.status != 206 or not response.headers.get('Content-Range','').startswith(f'bytes {offset}-')):
                offset=0
            with partial.open('ab' if offset else 'wb') as output:
                read = offset
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    read += len(chunk)
                    if name == 'pytorch_model.bin':
                        emit(stage='download', completed=read, total=WEIGHT_SIZE)
        if name == 'pytorch_model.bin' and (partial.stat().st_size != WEIGHT_SIZE or file_hash(partial) != WEIGHT_SHA):
            partial.unlink(missing_ok=True)
            raise ValueError('Model checksum mismatch')
        os.replace(partial, target)
    (directory / 'READY.json').write_text(json.dumps({'model':MODEL, 'revision':REVISION, 'sha256':WEIGHT_SHA}), encoding='utf-8')
    return {'ready':True, 'model':MODEL, 'revision':REVISION, 'space':SPACE}


def file_hash(file):
    h = hashlib.sha256()
    with open(file, 'rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def windows(start, end):
    """At most six deterministic 10s windows. Never claim the whole audio was heard."""
    length = min(10.0, end - start)
    count = min(6, max(1, int((end - start + 9.999) // 10)))
    return [(start + (end-start-length)*i/max(1,count-1), length) for i in range(count)]


def valid_vectors(rows):
    import numpy as np
    x = np.asarray(rows, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] != 512 or not 1 <= len(x) <= 6 or not np.isfinite(x).all():
        raise ValueError('Invalid embedding dimensions or values')
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    if (norms < 1e-8).any():
        raise ValueError('Zero embeddings are not searchable')
    return x / norms


def rank(reference, records, excluded_id=None, exclude_artist=False):
    import numpy as np
    if reference.get('space') != SPACE:
        raise ValueError('Reference model space mismatch')
    r = valid_vectors(reference['vectors'])
    results, seen = [], {reference['hash']}
    for row in records:
        if row['id'] == excluded_id or row['hash'] in seen or row.get('space') != SPACE:
            continue
        if exclude_artist and reference.get('artist') and row.get('artist', '').casefold() == reference['artist'].casefold():
            continue
        try:
            c = valid_vectors(row['vectors'])
            similarity = np.clip(r @ c.T, -1, 1)
            i, j = np.unravel_index(np.argmax(similarity), similarity.shape)
            score = .7 * float(similarity.max(axis=1).mean()) + .3 * float(similarity[i,j])
            results.append({'id':row['id'], 'score':round(score,5), 'referenceRange':reference['segments'][i],
                            'matchedRange':row['segments'][j], 'referenceDb':reference['levels'][i], 'matchedDb':row['levels'][j],
                            'samples':len(c), 'hash':row['hash']})
        except (ValueError, KeyError, IndexError):
            continue
    results.sort(key=lambda row:(-row['score'], row['id']))
    unique = []
    for row in results:
        if row['hash'] in seen:
            continue
        seen.add(row.pop('hash'))
        unique.append(row)
    return unique[:20]


def search(request, directory):
    import numpy as np
    if not (directory / 'READY.json').is_file():
        raise ValueError('Prepare the CLAP model first / Önce CLAP modelini hazırla.')
    cache_dir = Path(request['cacheDir'])
    cache_dir.mkdir(parents=True, exist_ok=True)
    model = None
    feature_extractor = None
    cached_count = 0
    def features(row, selected=None):
        nonlocal model, feature_extractor, cached_count
        file = Path(row['path'])
        before = file.stat()
        if before.st_size > 1024**3:
            raise ValueError('Audio exceeds 1 GB')
        # Stat identifies fast reuse; content hash identifies exact duplicate audio.
        key = hashlib.sha256(json.dumps([str(file.resolve()), before.st_size, before.st_mtime_ns, selected, SPACE]).encode()).hexdigest()
        cached = cache_dir / (key + '.json')
        if cached.is_file() and cached.stat().st_size < 200000:
            try:
                data = json.loads(cached.read_text(encoding='utf-8'))
                if data['space'] == SPACE:
                    valid_vectors(data['vectors'])
                    cached_count += 1
                    return {**data, 'id':row['id'], 'artist':row.get('artist','')}
            except (ValueError, KeyError):
                pass
        duration = float(json.loads(subprocess.check_output([request['ffprobe'],'-v','error','-show_entries','format=duration','-of','json',str(file)], timeout=30, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))['format']['duration'])
        start, end = selected or [0, duration]
        if not 0 <= start < end <= duration + .05 or end-start < 1 or end-start > 1800:
            raise ValueError('Track/range must be 1 second–30 minutes')
        content_hash = file_hash(file)
        if model is None:
            emit(stage='model')
            import torch
            from transformers import ClapAudioModelWithProjection, ClapFeatureExtractor
            torch.set_num_threads(2)
            feature_extractor = ClapFeatureExtractor.from_pretrained(str(directory), local_files_only=True)
            # Official pinned weights; restricted tensor-only loader, no custom code.
            model = ClapAudioModelWithProjection.from_pretrained(str(directory), local_files_only=True, weights_only=True).eval().to('cpu')
        import torch
        vectors, segments, levels = [], [], []
        for at, length in windows(start, min(end, duration)):
            with tempfile.TemporaryDirectory(prefix='whisper-clap-') as temp:
                wav = Path(temp) / 'sample.wav'
                subprocess.run([request['ffmpeg'],'-v','error','-nostdin','-ss',str(at),'-i',str(file),'-t',str(length),'-map','0:a:0','-vn','-ac','1','-ar','48000','-c:a','pcm_s16le',str(wav)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=45,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                with wave.open(str(wav),'rb') as reader:
                    audio = np.frombuffer(reader.readframes(reader.getnframes()),dtype='<i2').astype(np.float32)/32768
                rms = float(np.sqrt(np.mean(audio**2))) if len(audio) else 0
                if len(audio)<48000 or rms<1e-5:
                    continue
                inputs = feature_extractor(audio, sampling_rate=48000, return_tensors='pt', padding='repeatpad')
                with torch.inference_mode():
                    vector = model(**inputs).audio_embeds.detach().cpu().numpy()[0]
                vectors.append(vector.tolist());segments.append([round(at,3),round(at+length,3)]);levels.append(round(20*np.log10(rms),3))
        valid_vectors(vectors)
        after = file.stat()
        if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
            raise ValueError('Audio changed during indexing')
        data={'space':SPACE,'hash':content_hash,'vectors':vectors,'segments':segments,'levels':levels}
        partial=cached.with_suffix('.tmp')
        partial.write_text(json.dumps(data,allow_nan=False),encoding='utf-8');os.replace(partial,cached)
        return {**data,'id':row['id'],'artist':row.get('artist','')}
    reference=features(request['reference'],request.get('range'))
    records,failures=[],[]
    for index,row in enumerate(request['tracks']):
        emit(stage='index',completed=index,total=len(request['tracks']),title=str(row.get('title',''))[:150])
        if row['id'] == request['reference']['id'] or Path(row['path']).resolve() == Path(request['reference']['path']).resolve():
            continue
        try:
            records.append(features(row))
        except Exception as error:
            failures.append({'id':row['id'],'error':type(error).__name__})
    emit(stage='rank',completed=len(records),total=len(request['tracks']))
    return {'model':MODEL,'revision':REVISION,'space':SPACE,'results':rank(reference,records,request['reference']['id'],request.get('excludeArtist',False)),
            'indexed':len(records),'failed':len(failures),'failures':failures[:20],'cached':cached_count,'referenceSamples':len(reference['vectors'])}


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--model-dir',required=True);parser.add_argument('--prepare',action='store_true')
    args=parser.parse_args()
    value=prepare(Path(args.model_dir)) if args.prepare else search(json.load(sys.stdin),Path(args.model_dir))
    print(json.dumps(value,ensure_ascii=False,allow_nan=False))
