"""Opt-in local production-path A/B audition. No automatic naturalness winner.

Uses existing engine/model/reference; never modifies engine files or app defaults.
All audio, caches, reference metadata and engine logs stay in a new local folder.
"""
import argparse
import contextlib
import html
import json
import multiprocessing
import os
from pathlib import Path
import time
import hashlib


def prepare_controls(folder):
    data=json.loads((Path(__file__).parent/'testdata/audition_controls.json').read_text(encoding='utf-8'))
    folder.mkdir(parents=True,exist_ok=False)
    def stamp(seconds):
        n=round(seconds*1000)
        return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
    def save(name,rows,field):
        text='\n\n'.join(f'{i+1}\n{stamp(r["start"])} --> {stamp(r["end"])}\n{r[field]}' for i,r in enumerate(rows))+'\n'
        (folder/name).write_text(text,encoding='utf-8-sig')
    for language,field in [('en','source'),('tr','translation')]:
        save('video.'+language+'.srt',data['video']['cues'],field)
    save('book.srt',data['book']['rows'],'text')
    (folder/'sources.json').write_text(json.dumps({'source':data['video']['source_url'],
        'clip_start':data['video']['video_clip_start'],'seconds':data['video']['clip_seconds'],
        'method':data['video']['translation_method']},indent=2),encoding='utf-8')


def summary(quality):
    groups = quality.get('groups', [])
    if not isinstance(groups, list) or not groups or any(not isinstance(g,dict) or g.get('status') not in ('ready','review','failed') for g in groups):
        raise ValueError('Invalid quality groups')
    return {name: sum(row.get('status') == name for row in groups)
            for name in ('ready', 'review', 'failed')} | {'total': len(groups)}


def write_player(output, rows):
    cards = []
    for i, row in enumerate(rows):
        name = row['name']
        groups=row.get('groups', {})
        status=('İnceleme gerekiyor; otomatik tanıma yanılabilir.' if groups.get('review',0) or groups.get('failed',0) or not row.get('final_waveform',{}).get('passed') else 'Bu bütünlük kontrolleri geçti; doğallığı dinleyerek karşılaştır.')
        player='<audio controls preload="none" src="'+html.escape(name+'.wav',quote=True)+'"></audio>' if (output/(name+'.wav')).is_file() else '<p>Ses dosyası üretilemedi.</p>'
        cards.append('<section><h2>Örnek '+str(i+1)+' · '+('Kitap' if row.get('narration') else 'Video')+'</h2>'+player+'<p>'+status+'</p><p>'+str(groups.get('ready',0))+' hazır · '+str(groups.get('review',0))+' inceleme · '+str(groups.get('failed',0))+' başarısız grup</p></section>')
    page = ('<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Voice audition</title><style>body{background:#111318;color:#eee;'
            'font:16px/1.7 system-ui;margin:40px auto;padding:0 24px;max-width:850px}'
            'section{border:1px solid #41454d;border-radius:16px;padding:24px;margin:20px 0}'
            'audio{width:100%}h1{color:#d5a35c}p{overflow-wrap:anywhere}</style>'
            '<h1>Voice audition / Ses karşılaştırması</h1>'
            '<p>Eksik okuma, telaffuz, ton devamlılığı, duraklar ve dinleme rahatlığını karşılaştır. '
            'Otomatik doğrulama insan kulağının yerine geçmez. '
            'Varsayılan ayarlar değiştirilmedi.</p>'+''.join(cards)+'</html>')
    (output/'listen.html').write_text(page, encoding='utf-8')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run', action='store_true')
    p.add_argument('--prepare-controls',type=Path,help='Export public/original control texts only; no GPU or media download')
    for name in ('engine', 'reference', 'transcript', 'verify-python', 'srt', 'book-srt', 'output'):
        p.add_argument('--'+name, type=Path)
    args = p.parse_args(argv)
    if args.prepare_controls:
        if args.run:p.error('Prepare controls and run are separate actions')
        prepare_controls(args.prepare_controls)
        print('Control subtitles prepared; no model was run.')
        return 0
    from accept_dub import inspect_gpu
    state = inspect_gpu()
    if not args.run or not state['ready']:
        print(json.dumps({'status': 'ready_not_run' if state['ready'] else 'blocked_gpu', **state}))
        return 0 if state['ready'] else 2
    for name in ('engine', 'reference', 'transcript', 'verify_python', 'srt', 'output'):
        if getattr(args, name) is None:
            p.error('--run requires --'+name.replace('_', '-'))
    for name in ('reference', 'transcript', 'verify_python', 'srt'):
        if not getattr(args, name).is_file():
            p.error('Input file unavailable: '+name)
    if not (args.engine/'kitap_ortak.py').is_file():
        p.error('Invalid engine')
    if args.book_srt and not args.book_srt.is_file():
        p.error('Book SRT unavailable')
    # Avoid accidental overwrite; the reference is deliberately never copied.
    args.output.mkdir(parents=True, exist_ok=False)
    os.environ.update(VOXCPM_ROOT=str(args.engine.resolve()), HF_HUB_OFFLINE='1',
                      TRANSFORMERS_OFFLINE='1')
    import altyazi_oku as reader
    from dub_runtime import EngineSession
    from accept_dub import verify_final
    import soundfile as sf
    cases = [('video-flowing', args.srt, False, 'akici', 280, 18),
             ('video-shorter', args.srt, False, 'cumle', 250, 12)]
    if args.book_srt:
        cases += [('book-flowing', args.book_srt, True, 'akici', 280, 18),
                  ('book-shorter', args.book_srt, True, 'cumle', 250, 12)]
    result = {'version': 1, 'status': 'running', 'steps': 15, 'cfg': 1.65,
              'temperature': .8, 'seed': 42, 'verification': 'detailed',
              'naturalness_winner': None, 'variants': []}
    result['model']={'id':reader.MODEL_ID,'revision':reader.MODEL_REVISION}
    result['input_sha256']={name:hashlib.sha256(source.read_bytes()).hexdigest()
                            for name,source in [('video',args.srt),('book',args.book_srt)] if source}
    result['quality_code_sha256']=hashlib.sha256((Path(__file__).parent/'dub_quality.py').read_bytes()).hexdigest()
    runtime = EngineSession()
    try:
        for name, source, narration, grouping, chars, seconds in cases:
            if not inspect_gpu()['ready'] and not runtime.server:
                raise RuntimeError('GPU became busy; no external process was stopped')
            print('START '+name, flush=True)
            began = time.monotonic()
            reader.OUTPUT_ROOT = args.output/name/'cache'
            wave = args.output/(name+'.wav')
            options = [str(source.resolve()), str(args.reference.resolve()), '--transcript',
                       str(args.transcript.resolve()), '--mode', 'hifi', '--output', str(wave.resolve()),
                       '--steps', '15', '--cfg', '1.65', '--temperature', '.8', '--seed', '42',
                       '--eszamanli', '2', '--retry', '1', '--gruplama', grouping,
                       '--grup-max-karakter', str(chars), '--grup-max-sn', str(seconds),
                       '--timing-mode', 'video', '--verification', 'detailed',
                       '--verify-python', str(args.verify_python.resolve())]
            if narration:
                options.append('--narration')
            row = {'name': name, 'narration': narration, 'grouping': grouping}
            try:
                with (args.output/(name+'.private.log')).open('w', encoding='utf-8') as log:
                    with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                        code = reader.main(options, runtime=runtime)
                row['exit_code'] = code or 0
                row['seconds'] = sf.info(wave).duration
                row['groups'] = summary(json.loads(wave.with_suffix('.quality.json').read_text(encoding='utf-8')))
                row['phases'] = json.loads(wave.with_suffix('.performance.json').read_text(encoding='utf-8'))
                expected = ' '.join(text for _, _, text in reader.parse_srt(source))
                row['final_waveform'] = verify_final(wave, args.verify_python, expected)
                row['integrity_evidence_passed']=bool(row['final_waveform'].get('passed')) and row['groups']['review']==0 and row['groups']['failed']==0 and row['exit_code']==0
                row['status'] = 'produced_needs_listening'
            except Exception as error:
                # Keep completed candidates and make the failure visible; never pick a winner.
                row.update(status='failed', error=type(error).__name__)
            row['wall_seconds'] = round(time.monotonic()-began, 3)
            result['variants'].append(row)
            (args.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            write_player(args.output, result['variants'])
            print('DONE '+name+' '+row['status']+' '+str(row['wall_seconds'])+'s', flush=True)
    finally:
        runtime.close()
    result['status'] = 'needs_listening' if all(r['status'] == 'produced_needs_listening' for r in result['variants']) else 'partial_failure'
    (args.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if result['status'] == 'needs_listening' else 3


if __name__ == '__main__':
    multiprocessing.freeze_support()
    raise SystemExit(main())
