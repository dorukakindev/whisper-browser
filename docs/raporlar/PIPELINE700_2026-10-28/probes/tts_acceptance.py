import os,sys,importlib.util
from pathlib import Path
root=Path(sys.argv[2]).resolve()
project=Path(sys.argv[1]).resolve()
assert os.environ.get('VOXCPM_ROOT'), 'Set VOXCPM_ROOT to the installed engine'
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_XET']='1'
sys.path.insert(0,str(project/'tools/voxcpm2'))
spec=importlib.util.spec_from_file_location('whisper_dub_acceptance',project/'tools/voxcpm2/altyazi_oku.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
mod.OUTPUT_ROOT=root/'output'
if __name__=='__main__':
 import multiprocessing
 multiprocessing.freeze_support()
 raise SystemExit(mod.main([str(root/'translated'/'Türkçe kaynak.tr.speech.srt'),str(root/'reference.wav'),'--mode','clone','--steps','15','--eszamanli','2','--gruplama','akici','--grup-max-karakter','360','--grup-max-sn','25','--range-start','2','--range-end','10','--timing-mode','video','--output',str(root/'result.wav'),'--verification','fast','--request-timeout','90']))
