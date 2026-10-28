"""Offline, short FFmpeg acceptance: clipped source, warped video and both audio tracks.

Creates authored tones/color markers only. Never reads application settings or calls a model.
"""
import argparse
from array import array
import json
import math
from pathlib import Path
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from dub_export import map_time


def run(args, **kwargs):
    result = subprocess.run([str(x) for x in args], capture_output=True, timeout=90,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[-3000:])
    return result.stdout


def pulse_wav(file, duration, points, frequency=1000):
    rate = 48000
    samples = array('h', [0]) * int(duration * rate)
    for point in points:
        for i in range(int(.12 * rate)):
            at = round(point * rate) + i
            if at < len(samples):
                fade = min(1, i / 120, (int(.12 * rate) - i) / 120)
                samples[at] = round(9000 * fade * math.sin(2 * math.pi * frequency * i / rate))
    with wave.open(str(file), 'wb') as out:
        out.setparams((1, 2, rate, len(samples), 'NONE', 'not compressed'))
        out.writeframes(samples.tobytes())


def pulse_times(ffmpeg, file, track):
    raw = run([ffmpeg, '-v', 'error', '-i', file, '-map', f'0:a:{track}', '-af',
               'bandpass=f=1000:width_type=h:w=160', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'])
    values = array('f'); values.frombytes(raw)
    windows = [math.sqrt(sum(v*v for v in values[i:i+480]) / 480)
               for i in range(0, len(values)-479, 480)]
    starts = []
    for i, level in enumerate(windows):
        if level > .035 and (not starts or i/100 - starts[-1] > .35):
            starts.append(i/100)
    return starts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    ffmpeg = args.ffmpeg.resolve(); ffprobe = ffmpeg.with_name('ffprobe.exe' if sys.platform == 'win32' else 'ffprobe')
    out = args.output_dir.resolve(); out.mkdir(parents=True, exist_ok=False)
    source_audio = out / 'original.wav'; background = out / 'background.wav'; video = out / 'source.mp4'
    points = [1.25, 3.5, 5.1]
    pulse_wav(source_audio, 10, [p+2 for p in points]); pulse_wav(background, 6, points)
    run([ffmpeg, '-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i',
         "color=c=black:s=64x48:r=25:d=10,drawbox=color=red:t=fill:enable='between(t,3.2,3.6)'",
         '-i', source_audio, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video])
    results = []
    for name in ['identity', 'linear', 'smooth']:
        folder = out / name; folder.mkdir()
        sync = None if name == 'identity' else {'version': 1, 'videoDuration': 6, 'audioDuration': 8,
                'segments': [{'v0': 1, 'v1': 3, 'a0': 1, 'a1': 5}], 'smooth': name == 'smooth'}
        duration = 6 if sync is None else 8
        voice = folder / 'voice.wav'; pulse_wav(voice, duration, [.4, 2, 5.4], 440)
        request = {'voice': str(voice), 'background': str(background), 'video': str(video), 'kind': 'dual',
                   'sync': sync, 'range': {'start': 2, 'end': 8}, 'rows': [],
                   'mix': {'voice': .2, 'background': .7, 'music': 0, 'ambience': 0, 'duck': False, 'duckAmount': .35}}
        file = folder / 'request.json'; file.write_text(json.dumps(request), encoding='utf-8')
        output = folder / 'export.mp4'
        run([sys.executable, ROOT / 'backend/dub_export.py', '--request', file, '--output', output,
             '--ffmpeg', ffmpeg], cwd=folder)
        info = json.loads(run([ffprobe, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', output]))
        audios = [s for s in info['streams'] if s['codec_type'] == 'audio']
        assert len(audios) == 2, info
        assert audios[0].get('disposition', {}).get('default') == 1
        assert audios[1].get('tags', {}).get('handler_name') == 'Original'
        assert audios[0].get('tags', {}).get('handler_name') == 'Türkçe dublaj'
        actual_duration = float(info['format']['duration']); assert abs(actual_duration-duration) < .12, (name, actual_duration)
        expected = [map_time(sync, p)[0] for p in points]
        tracks = [pulse_times(ffmpeg, output, n) for n in [0, 1]]
        for times in tracks:
            assert len(times) == len(expected), (name, times, expected)
            assert all(abs(a-b) < .2 for a, b in zip(times, expected)), (name, times, expected)
        pixels = run([ffmpeg, '-v', 'error', '-i', output, '-vf', 'fps=100,scale=1:1:flags=area',
                      '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
        red = [i/300 for i in range(0, len(pixels)-2, 3) if pixels[i] > 100 and pixels[i+1] < 80 and pixels[i+2] < 80]
        expected_red = map_time(sync, 1.2)[0]
        assert red and abs(red[0]-expected_red) < .12, (name, red[:1], expected_red)
        results.append({'case': name, 'duration': actual_duration, 'expectedDuration': duration,
                        'expectedPulseTimes': expected, 'audioPulseTimes': tracks,
                        'videoMarker': red[0], 'expectedVideoMarker': expected_red, 'audioTracks': len(audios)})
    (out / 'acceptance.json').write_text(json.dumps({'complete': True, 'syntheticMedia': True, 'results': results}, indent=2), encoding='utf-8')
    print(json.dumps({'complete': True, 'output': str(out), 'results': results}))


if __name__ == '__main__':
    main()
