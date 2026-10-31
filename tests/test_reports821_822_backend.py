"""Reports 821/822: actual output transactions and local FFmpeg clip boundaries."""
import ast
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import types
import unittest
import wave
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import transcribe as T
import media as M
import pipeline_control as P
OBS=[]

def wav(path):
    with wave.open(str(path),'wb') as handle:
        handle.setnchannels(1);handle.setsampwidth(2);handle.setframerate(16000)
        handle.writeframes(b'\0\0'*16000*4)

def arguments(root):
    tree=ast.parse((ROOT/'backend/transcribe.py').read_text(encoding='utf-8'))
    main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
    prefix=[]
    for node in main.body:
        if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='args' for t in node.targets):break
        prefix.append(node)
    scope=dict(T.__dict__);exec(compile(ast.Module(body=prefix,type_ignores=[]),'production-parser','exec'),scope)
    args=scope['parser'].parse_args(['--input',str(root/'source.wav'),'--output-dir',str(root/'out'),
        '--cache-dir',str(root/'cache'),'--device','cpu','--compute-type','int8','--formats','json',
        '--fix-timings','false','--snap-to-speech','false','--split-mode','none','--resume','false',
        '--fix-common-errors','false','--drop-repeated-hallucinations','false','--confidence-report','true'])
    args.scene_context=None;return args

class ConfidenceTests(unittest.TestCase):
    def exercise(self,cancel=False):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);args=arguments(root);wav(args.input);probability=[.2];events=[]
            class Model:
                def __init__(self,*_,**__):pass
                def transcribe(self,*_,**__):
                    word=types.SimpleNamespace(start=0.,end=1.5,word=' Kapı',probability=probability[0])
                    segment=types.SimpleNamespace(start=0.,end=2.,text='Kapı burada.',words=[word],avg_logprob=-.1,no_speech_prob=.01,compression_ratio=1.)
                    return iter([segment]),types.SimpleNamespace(language='tr',language_probability=1.,duration=4.)
            fake=types.ModuleType('faster_whisper');fake.WhisperModel=Model
            with patch.dict(sys.modules,{'faster_whisper':fake}),patch.dict(os.environ,{'WHISPER_JOB_TEMP_DIR':str(root/'owned')}),patch.object(T,'find_ffmpeg',return_value='fixture'),patch.object(T,'extract_audio',side_effect=lambda _,target,*a,**kw:wav(target)),patch.object(T,'check_vram_budget'),patch.object(T,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})),patch.object(T,'log'):
                T.transcribe(args);first=next(e for e in reversed(events) if e['type']=='done')
                report=next(Path(p) for p in first['files'] if p.endswith('.dusuk-guven.txt'))
                output=next(Path(p) for p in first['files'] if p.endswith('.json'))
                old_report=report.read_bytes();old_json=output.read_bytes();probability[0]=.99;events.clear()
                unrelated=report.with_name('other.dusuk-guven.txt');unrelated.write_text('unrelated report',encoding='utf-8')
                if cancel:
                    def probe(stage,point):
                        if stage=='write' and point=='after':raise P.PipelineCancelled(stage,point)
                    with patch.object(P,'_CANCELLATION',P.CancellationController(probe=probe)):
                        with self.assertRaises(P.PipelineCancelled):T.transcribe(args)
                    self.assertEqual(report.read_bytes(),old_report);self.assertEqual(output.read_bytes(),old_json)
                    self.assertFalse(any(e['type']=='done' for e in events))
                    OBS.append({'id':'F821-02','control':'cancel-after-output-replacement','old_report_preserved':True,'old_json_restored':True})
                else:
                    T.transcribe(args);second=next(e for e in reversed(events) if e['type']=='done')
                    self.assertFalse(report.exists());self.assertNotIn(str(report),second['files'])
                    current=json.loads(output.read_text(encoding='utf-8'))
                    self.assertEqual(current['segments'][0]['words'][0]['probability'],.99)
                    self.assertFalse(any((root/'out').glob('.whisper-output-transaction-*')))
                    OBS.append({'id':'F821-02','current_probability':.99,'obsolete_report_removed':True,'warnings':second.get('warnings')})
                self.assertEqual(unrelated.read_text(encoding='utf-8'),'unrelated report')
    def test_clean_rerun_removes_previous_low_confidence_sidecar(self):self.exercise()
    def test_cancelled_commit_preserves_previous_diagnostic_and_output(self):self.exercise(cancel=True)

class ClipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg=os.environ.get('WHISPER_TEST_FFMPEG') or str(ROOT/'backend/bin/ffmpeg.exe')
        cls.ffprobe=os.environ.get('WHISPER_TEST_FFPROBE') or str(ROOT/'backend/bin/ffprobe.exe')
        if not Path(cls.ffmpeg).is_file():
            import shutil
            cls.ffmpeg=shutil.which('ffmpeg');cls.ffprobe=shutil.which('ffprobe')
        if not cls.ffmpeg or not cls.ffprobe:raise RuntimeError('Local FFmpeg and FFprobe required for real clip integration')
    def video(self,path,seconds,color='red'):
        subprocess.run([self.ffmpeg,'-v','error','-f','lavfi','-i',f'color=c={color}:s=160x90:r=10:d={seconds}',
            '-f','lavfi','-i','sine=frequency=800:sample_rate=8000','-t',str(seconds),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',str(path)],check=True,capture_output=True,timeout=30)
    def duration(self,path):
        result=subprocess.run([self.ffprobe,'-v','error','-show_entries','format=duration','-of','json',str(path)],check=True,capture_output=True,text=True,timeout=10)
        return float(json.loads(result.stdout)['format']['duration'])
    def test_real_ytdlp_ffmpeg_range_replaces_old_target_and_changes_duration(self):
        import yt_dlp
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'Existing [clip].mp4';source=root/'source.mp4'
            self.video(target,2);self.video(source,50,'blue');before=hashlib.sha256(target.read_bytes()).hexdigest()
            class Handler(http.server.SimpleHTTPRequestHandler):
                def log_message(self,*_):pass
            server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=folder))
            worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start();events=[];seen=[]
            def extract(client,url,download=True,**kwargs):
                seen.append(client.params['outtmpl']['default'] if isinstance(client.params['outtmpl'],dict) else client.params['outtmpl'])
                return client.process_ie_result({'id':'fixture822','title':'fixture822','url':f'http://127.0.0.1:{server.server_port}/source.mp4',
                    'ext':'mp4','duration':50,'vcodec':'h264','acodec':'aac','protocol':'http'},download=download)
            try:
                with patch.object(yt_dlp.YoutubeDL,'extract_info',extract),patch.object(M,'_find_ffmpeg',return_value=self.ffmpeg),patch.object(M,'log'),patch.object(M,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})):
                    M.download_clip('https://fixture.invalid/watch',30,40,str(target))
            finally:server.shutdown();server.server_close();worker.join(timeout=5)
            after=hashlib.sha256(target.read_bytes()).hexdigest();seconds=self.duration(target)
            self.assertNotEqual(before,after);self.assertAlmostEqual(seconds,10,delta=.25)
            self.assertEqual(events[-1]['type'],'clip');self.assertEqual(events[-1]['path'],str(target))
            self.assertNotEqual(Path(seen[0]).parent,target.parent);self.assertEqual(list(root.glob('.whisper-clip-*')),[])
            OBS.append({'id':'F822-03','real_ytdlp_ffmpeg':True,'old_seconds':2,'new_seconds':seconds,'sha256_changed':before!=after,'path_is_chosen_target':True})
    def test_failed_or_cancelled_attempt_preserves_existing_real_mp4(self):
        import yt_dlp
        from yt_dlp.downloader.external import FFmpegFD
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'existing.mp4';self.video(target,2);before=target.read_bytes();events=[]
            def metadata(client,url,download=True,**kwargs):
                return client.process_ie_result({'id':'fixture822','title':'fixture822','url':'https://fixture.invalid/media.mp4','ext':'mp4','duration':50,'vcodec':'h264','acodec':'aac','protocol':'https'},download=download)
            def failed(*args,**kwargs):raise RuntimeError('CONTROLLED_DOWNLOADER_FAILURE')
            with patch.object(yt_dlp.YoutubeDL,'extract_info',metadata),patch.object(FFmpegFD,'real_download',failed),patch.object(M,'_find_ffmpeg',return_value=self.ffmpeg),patch.object(M,'log'),patch.object(M,'emit',side_effect=lambda kind,**v:events.append(kind)):
                with self.assertRaises(Exception):M.download_clip('https://fixture.invalid/watch',30,40,str(target))
            self.assertEqual(target.read_bytes(),before);self.assertNotIn('clip',events)
            def interrupted(client,*args,**kwargs):
                template=client.params['outtmpl']['default'] if isinstance(client.params['outtmpl'],dict) else client.params['outtmpl']
                Path(template.replace('%(ext)s','mp4')).write_bytes(b'partial')
                raise KeyboardInterrupt('controlled cancel')
            with patch.object(yt_dlp.YoutubeDL,'extract_info',interrupted),patch.object(M,'_find_ffmpeg',return_value=self.ffmpeg),patch.object(M,'log'):
                with self.assertRaises(KeyboardInterrupt):M.download_clip('https://fixture.invalid/watch',30,40,str(target))
            self.assertEqual(target.read_bytes(),before);self.assertEqual(self.duration(target),2)
            self.assertEqual(list(root.glob('.whisper-clip-*')),[])
            OBS.append({'id':'F822-03','failure_and_cancel_preserve_old_mp4':True,'old_duration_after_failure':2,'owned_scratch_clean':True})
    def test_old_target_reported_outside_current_staging_is_not_a_new_clip(self):
        import yt_dlp
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'previous.mp4';self.video(target,2);original=target.read_bytes();events=[]
            def old_completion(client,*_,**__):
                for hook in client.params['post_hooks']:hook(str(target))
                return {'id':'fixture','title':'fixture','filepath':str(target)}
            with patch.object(yt_dlp.YoutubeDL,'extract_info',old_completion),patch.object(M,'_find_ffmpeg',return_value=self.ffmpeg),patch.object(M,'log'),patch.object(M,'emit',side_effect=lambda kind,**v:events.append(kind)):
                with self.assertRaisesRegex(RuntimeError,'klip dosyası bulunamadı'):
                    M.download_clip('https://fixture.invalid/watch',30,40,str(target))
            self.assertEqual(target.read_bytes(),original);self.assertNotIn('clip',events)
            self.assertEqual(list(root.glob('.whisper-clip-*')),[])

if __name__=='__main__':
    result=unittest.main(exit=False)
    out=ROOT/'tmp/reports818-823/backend-test-observations.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(OBS,ensure_ascii=False,indent=2),encoding='utf-8')
    sys.exit(0 if result.result.wasSuccessful() else 1)
