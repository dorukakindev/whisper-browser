import os,sys,time
from pathlib import Path
from types import SimpleNamespace as NS
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent;sys.path.insert(0,str(ROOT/'backend'))
import transcribe as T
T.tempfile.tempdir=str(OUT/'system-temp');Path(T.tempfile.tempdir).mkdir(exist_ok=True)
original=T.extract_audio
def hold(*a,**kw):
 original(*a,**kw)
 print('EXTRACTED_READY',flush=True)
 time.sleep(120)
T.extract_audio=hold
T.sync_subtitles(NS(input=str(OUT/'sync-source.wav'),sync_srt=str(OUT/'sync-source.srt'),output_dir=str(OUT),sync_fix_framerate=False,sync_max_shift=60,sync_piecewise=False,language='en'))
