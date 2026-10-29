"""Opt-in, model-free real timeline scale check (writes temporary audio)."""
import argparse
import ctypes
import gc
import json
from pathlib import Path
import sys
import tempfile
import time
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_timing import build_fixed_timeline,build_adaptive_timeline
from dub_timeline_storage import check_storage,write_audio,TimelineAudio


def peak_memory():
    if sys.platform!='win32':
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024
    class Counters(ctypes.Structure):
        _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(name,ctypes.c_size_t) for name in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage','PrivateUsage']]
    counters=Counters();counters.cb=ctypes.sizeof(counters)
    current=ctypes.windll.kernel32.GetCurrentProcess;current.restype=ctypes.c_void_p
    query=ctypes.windll.psapi.GetProcessMemoryInfo;query.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ulong]
    if not query(current(),ctypes.byref(counters),counters.cb):raise OSError('Windows memory measurement failed')
    return counters.PeakWorkingSetSize


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seconds',type=int,default=10);parser.add_argument('--sample-rate',type=int,default=48000);parser.add_argument('--directory',type=Path,required=True);args=parser.parse_args()
    assert 8<=args.seconds<=86400 and 8000<=args.sample_rate<=48000
    args.directory.mkdir(parents=True,exist_ok=True);before=peak_memory();rows=[]
    with tempfile.TemporaryDirectory(dir=args.directory,prefix='timeline-scale-') as directory:
        folder=Path(directory);check_storage(args.seconds,args.sample_rate,folder)
        part=folder/'speech.wav';wave=(.1*np.sin(2*np.pi*220*np.arange(args.sample_rate)/args.sample_rate)).astype('float32');sf.write(part,wave,args.sample_rate)
        cues=[(0,1000,'First.'),((args.seconds-1)*1000,args.seconds*1000,'Last.')]
        for mode in ['fixed','adaptive']:
            began=time.monotonic()
            if mode=='fixed':audio,timing=build_fixed_timeline(cues,[part,part],args.sample_rate,args.seconds,1,folder,log=lambda _:None)
            else:audio,timing,sync=build_adaptive_timeline(cues,[part,part],args.sample_rate,args.seconds,1,folder)
            assert len(audio)==args.seconds*args.sample_rate
            assert isinstance(audio,TimelineAudio) if args.seconds*args.sample_rate*4>8*1024*1024 else isinstance(audio,np.ndarray)
            output=folder/(mode+'.wav');write_audio(output,audio,args.sample_rate);info=sf.info(output);assert info.frames==args.seconds*args.sample_rate
            with sf.SoundFile(output) as stream:
                head=stream.read(args.sample_rate);stream.seek((args.seconds-1)*args.sample_rate);tail=stream.read(args.sample_rate)
            assert np.max(np.abs(head))>.09 and np.max(np.abs(tail))>.09
            assert not list(folder.glob('*.f32'))
            rows.append({'mode':mode,'frames':info.frames,'seconds':info.duration,'elapsedSeconds':round(time.monotonic()-began,3),'peakProcessBytes':peak_memory(),'scratchClean':True});output.unlink();del audio;gc.collect()
    result={'beforePeakBytes':before,'peakBytes':peak_memory(),'peakGrowthBytes':peak_memory()-before,'rows':rows,'temporaryDirectoryRemoved':not folder.exists()}
    print(json.dumps(result));assert result['peakGrowthBytes']<128*1024*1024,'Timeline exceeded the bounded working-memory acceptance budget'

if __name__=='__main__':main()
