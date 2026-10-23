"""Read only selected source intervals and emit a bounded acoustic delivery map."""
import argparse
import hashlib
import json
import subprocess
import sys
from contextlib import nullcontext
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from dub_plan import parse_srt, make_groups, read_source_bytes
from dub_quality import representative_groups
from dub_prosody import VERSION, features, delivery_rows


def source_connection(source):
    if Path(source).is_file():
        return nullcontext(source)
    url=urlparse(source)
    if url.scheme!='https' or url.hostname not in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
        raise ValueError('Unsupported source')
    import yt_dlp
    with yt_dlp.YoutubeDL({'quiet':True,'no_warnings':True,'noplaylist':True,'format':'bestaudio/best',
                          'socket_timeout':20,'retries':1,'js_runtimes':{'node':{}}}) as dl:
        info=dl.extract_info(source,download=False)
    audio_languages={str(f.get('language')).lower() for f in info.get('formats',[])
                     if f.get('acodec') not in (None,'none') and f.get('language')}
    if len(audio_languages)>1:
        # Without a selected track snapshot, do not silently analyze a dub in
        # another language. Let the user supply the exact local audio instead.
        raise ValueError('MULTIPLE_AUDIO_TRACKS')
    media=info.get('url','')
    if not media.startswith('https://'): raise ValueError('Audio unavailable')
    sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend'))
    from voice_reference import audio_relay
    headers={str(k):str(v) for k,v in (info.get('http_headers') or {}).items() if not any(c in str(k)+str(v) for c in '\r\n')}
    return audio_relay(media,headers)


def main():
    p=argparse.ArgumentParser()
    for name in ('source','srt','output','ffmpeg'): p.add_argument('--'+name,required=True)
    p.add_argument('--start',type=float);p.add_argument('--end',type=float)
    p.add_argument('--grouping',choices=('akici','cumle','satir'),default='akici')
    p.add_argument('--strength',choices=('gentle','balanced','strong'),default='balanced')
    p.add_argument('--sample',action='store_true')
    args=p.parse_args()
    data=read_source_bytes(args.srt)
    groups=make_groups(parse_srt(args.srt,data),args.start,args.end,0,args.grouping,
                       280 if args.grouping=='akici' else 250,18 if args.grouping=='akici' else 12,600)
    if args.sample: groups=representative_groups(groups)
    rows=[]; audio_hash=hashlib.sha256(); consecutive_failures=0
    with source_connection(args.source) as source:
        for i,g in enumerate(groups):
            start=g.get('source_start',g['start'])
            end=g.get('source_end',g['end'])
            duration=min(40.,(end-start)/1000)
            if duration <= 0: continue
            cmd=[args.ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-ss',str(start/1000),'-i',source,
                 '-t',str(duration),'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1']
            raw=b''; feature=None; decoded=False
            if consecutive_failures < 3:
                try:
                    r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=90,
                                     creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                    raw=r.stdout
                    complete=len(raw)/(8000*4) >= max(.6,duration-.25)
                    if r.returncode==0 and complete and len(raw)%4==0 and len(raw)<=8000*40*4+4096:
                        decoded=True
                        feature=features(np.frombuffer(raw,dtype='<f4'))
                except (OSError, subprocess.TimeoutExpired):
                    pass  # One bad excerpt must not discard earlier good analysis.
                consecutive_failures = 0 if decoded else consecutive_failures+1
            audio_hash.update(str((start,end)).encode());audio_hash.update(raw)
            rows.append({'key':','.join(map(str,g['source_ids'])),'start':g['start'],'end':g['end'],
                         'source_start':start,'source_end':end,'features':feature})
            print('DUB_PROSODY '+str(i+1)+'/'+str(len(groups)),flush=True)
    result={'version':VERSION,'sourceHash':hashlib.sha256(data).hexdigest(),'strength':args.strength,
            'timeUnit':'milliseconds','planTimeline':'packed-preview' if args.sample else 'source-video',
            'sourceTimeline':'source-video','sampledAudioHash':audio_hash.hexdigest(),
            'groups':delivery_rows(rows,args.strength)}
    target=Path(args.output); temporary=target.with_suffix('.partial.json')
    temporary.write_text(json.dumps(result,allow_nan=False),encoding='utf-8');temporary.replace(target)


if __name__=='__main__':
    try: main()
    except ValueError as error:
        if str(error)=='MULTIPLE_AUDIO_TRACKS': print('DUB_PROSODY_ERROR MULTIPLE_AUDIO_TRACKS',flush=True)
        raise
