"""Offline dubbing mix/video export. No models, network or user settings are read."""
import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path


def balanced(items, op='+', empty='0'):
    if not items:
        return empty
    if len(items) == 1:
        return items[0]
    middle = len(items)//2
    a, b = balanced(items[:middle], op, empty), balanced(items[middle:], op, empty)
    return f'max({a},{b})' if op == 'max' else f'({a}+{b})'


def map_time(sync, time):
    if not sync:
        return time, 1.0
    delta = 0
    for s in sync['segments']:
        if time < s['v0']:
            return time + delta, 1.0
        if time < s['v1']:
            span = s['v1']-s['v0']
            stretch = max(1, (s['a1']-s['a0'])/span)
            x = (time-s['v0'])/span
            if sync.get('smooth'):
                return (s['a0']+span*(x+(stretch-1)*(x-math.sin(2*math.pi*x)/(2*math.pi))),
                        1+(stretch-1)*(1-math.cos(2*math.pi*x)))
            return s['a0']+(time-s['v0'])*stretch, stretch
        delta = s['a1']-s['v1']
    return time+delta, 1.0


def video_expression(sync):
    terms = []
    for s in (sync or {}).get('segments', []):
        span = s['v1']-s['v0']
        extra = max(0, (s['a1']-s['a0'])/span-1)
        if extra < .000001:
            continue
        start, stop = s['v0'], s['v1']
        x = f'(T-{start:.9f})'
        within = f'{extra:.12f}*{x}'
        if sync.get('smooth'):
            within = f'{extra:.12f}*({x}-{span:.9f}*sin(2*PI*{x}/{span:.9f})/(2*PI))'
        terms.append(f'if(lt(T,{start:.9f}),0,if(lt(T,{stop:.9f}),{within},{extra*span:.9f}))')
    return f'(T+{balanced(terms)})/TB'


def tempo_commands(sync, duration, target="warp"):
    # Commands run on INPUT timestamps before rubberband. Midpoint derivatives
    # integrate the exact smooth map without changing pitch. Bound interval
    # expansion as well as wall time to avoid large errors in dense speech.
    points = {0.0, duration}
    for s in (sync or {}).get('segments', []):
        span = s['v1']-s['v0']
        peak = max(1, (s['a1']-s['a0'])/span)*2-1
        count = max(1, math.ceil(span*max(10, peak*10)))
        if count > 200000:
            raise ValueError('Timing window is too extreme to export safely.')
        for n in range(count+1):
            points.add(s['v0']+span*n/count)
    points = sorted(p for p in points if 0 <= p <= duration)
    commands = []
    previous = None
    for a, b in zip(points, points[1:]):
        # Exact interval expansion ensures no accumulated timing drift.
        factor = (map_time(sync,b)[0]-map_time(sync,a)[0])/(b-a)
        tempo = 1/max(1,factor)
        if tempo < .01:
            raise ValueError('Timing stretch is too large to export without losing sync.')
        if previous is None or abs(previous-tempo) > 1e-7:
            commands.append(f'{a:.9f} rubberband@{target} tempo {tempo:.12f};')
        previous = tempo
    return '\n'.join(commands)


def duck_expression(rows, amount):
    terms = [f'max(0,min(1,min((t-{start:.9f})/0.08,({end+.35:.9f}-t)/0.35)))'
             for r in rows if r.get('status') != 'failed'
             for start,end in r.get('speechRanges', [[r['audioStart'],r['audioEnd']]])]
    return f'(1-{1-amount:.9f}*{balanced(terms,"max")})'


def run(command):
    def attempt(args):
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        tail = b''
        while True:
            chunk = process.stderr.read(4096)
            if not chunk:
                break
            tail = (tail+chunk)[-8000:]
        return process.wait(), tail.decode('utf-8', errors='replace')
    code, error = attempt(command)
    # Older FFmpeg releases read graphs through the legacy script option;
    # newer releases removed that option in favor of /filter_complex.
    if code and 'Unrecognized option' in error and '/filter_complex' in error:
        legacy = ['-filter_complex_script' if a == '-/filter_complex' else a for a in command]
        code, error = attempt(legacy)
    if code:
        raise RuntimeError(error.strip()[-1800:] or 'FFmpeg export failed.')


def probe(ffmpeg, file):
    ffprobe = str(Path(ffmpeg).with_name('ffprobe.exe' if os.name=='nt' else 'ffprobe')) if Path(ffmpeg).parent != Path('.') else 'ffprobe'
    result = subprocess.run([ffprobe,'-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],
                            capture_output=True,check=True,timeout=30,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    return json.loads(result.stdout)


def export(request, output, ffmpeg):
    sync = request.get('sync')
    voice_info = probe(ffmpeg,request['voice'])
    audio_duration = float(voice_info['format']['duration'])
    duration = sync['videoDuration'] if sync else audio_duration
    if sync and abs(audio_duration-sync['audioDuration']) > .15:
        raise ValueError('Voice duration does not match the timing map.')
    start = (request.get('range') or {}).get('start',0)
    args = [ffmpeg,'-nostdin','-v','error','-n']
    paths = {'voice':0}
    args += ['-i',request['voice']]
    for kind in ('background','music','ambience'):
        if request.get(kind):
            paths[kind] = len(paths)
            args += ['-i',request[kind]]
    video_index = None
    if request['kind'] != 'audio':
        info = probe(ffmpeg,request['video'])
        if not any(s['codec_type']=='video' for s in info['streams']):
            raise ValueError('Choose a video file.')
        if float(info['format']['duration'])+.1 < start+duration:
            raise ValueError('Source video is shorter than the selected dubbing range.')
        if request['kind']=='dual' and not any(s['codec_type']=='audio' for s in info['streams']):
            raise ValueError('The source video has no original audio track.')
        video_index = len(paths)
        args += ['-ss',str(start),'-t',str(duration),'-i',request['video']]
    graph = []
    mix = request['mix']
    graph.append(f'[0:a]aresample=48000,aformat=channel_layouts=stereo,volume={mix["voice"]}[voice]')
    outputs = ['[voice]']
    stretched = sync and any(s['a1']-s['a0'] > s['v1']-s['v0']+.000001 for s in sync['segments'])
    def warped(index, label):
        stem = f'[{index}:a]atrim=duration={duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo'
        if stretched:
            Path(label+'.cmd').write_text(tempo_commands(sync,duration,label),encoding='utf-8')
            stem += f",asendcmd=f={label}.cmd,rubberband@{label}=tempo=1:pitch=1"
        return stem+f',apad,atrim=duration={audio_duration}[{label}]'
    duck = duck_expression(request.get('rows',[]),mix['duckAmount']) if mix['duck'] else '1'
    for kind in ('background','music','ambience'):
        if kind not in paths:
            continue
        graph.append(warped(paths[kind],kind+'time'))
        graph.append(f'[{kind}time]volume=\'{mix[kind]}*{duck}\':eval=frame[{kind}mix]')
        outputs.append(f'[{kind}mix]')
    graph.append(''.join(outputs)+f'amix=inputs={len(outputs)}:normalize=0:duration=longest,alimiter=limit=0.95:level=0:latency=1,apad,atrim=duration={audio_duration}[mix]')
    if video_index is not None:
        graph.append(f'[{video_index}:v]setpts=PTS-STARTPTS,setpts=\'{video_expression(sync)}\',pad=ceil(iw/2)*2:ceil(ih/2)*2[vout]')
    if request['kind']=='dual':
        graph.append(warped(video_index,'original'))
    Path('filters.txt').write_text(';\n'.join(graph),encoding='utf-8')
    args += ['-/filter_complex','filters.txt']
    if video_index is not None:
        args += ['-map','[vout]','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-fps_mode','vfr']
    args += ['-map','[mix]']
    if request['kind']=='dual':
        args += ['-map','[original]','-metadata:s:a:1','title=Original','-disposition:a:1','0']
    if request['kind']=='audio':
        args += ['-c:a','pcm_s16le']
    else:
        args += ['-c:a','aac','-b:a','192k','-metadata:s:a:0','title=Turkce dublaj','-metadata:s:a:0','language=tur','-disposition:a:0','default','-movflags','+faststart']
    args += ['-t',str(audio_duration),str(output)]
    run(args)


def load_request(file):
    with Path(file).open('rb') as handle:
        data=handle.read(16_000_001)
    if len(data)>16_000_000:
        raise ValueError('Export request too large.')
    return json.loads(data.decode('utf-8'))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--request',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--ffmpeg',required=True)
    args=parser.parse_args()
    export(load_request(args.request),args.output,args.ffmpeg)


if __name__=='__main__':
    main()
