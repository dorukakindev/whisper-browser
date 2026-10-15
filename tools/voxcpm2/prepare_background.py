"""Keep an instrumental stem in original video time; no voice reference leaves disk."""
import argparse
import hashlib
import logging
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from dub_plan import parse_srt


def run(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise RuntimeError('Arka plan medya islemi basarisiz; indirme/kaynak dosyayi kontrol edin.')


def main():
    p = argparse.ArgumentParser()
    for name in ('source','srt','output','models','cache','ffmpeg','download-python'):
        p.add_argument('--'+name, required=True)
    p.add_argument('--start',type=float,default=0)
    p.add_argument('--end',type=float)
    args = p.parse_args()
    os.environ['PATH'] = str(Path(args.ffmpeg).parent) + os.pathsep + os.environ.get('PATH','')
    cues = parse_srt(args.srt)
    if not cues: raise ValueError('SRT bos.')
    end = args.end if args.end is not None else cues[-1][1]/1000+2
    if args.start < 0 or end <= args.start: raise ValueError('Gecersiz aralik.')
    cache = Path(args.cache); cache.mkdir(parents=True,exist_ok=True)
    source = args.source
    remote = urlparse(source)
    if remote.scheme:
        # A Windows drive letter is a local path, not a remote scheme.
        if not Path(source).is_file():
            if remote.scheme != 'https' or remote.hostname not in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
                raise ValueError('Yalniz secili YouTube videosu destekleniyor.')
            source_key = hashlib.sha256(source.encode()).hexdigest()[:24]
            candidates = [f for f in cache.glob(source_key+'.source.*') if f.suffix not in ('.part','.ytdl','.tmp')]
            if not candidates:
                print('DUB_BACKGROUND download',flush=True)
                run([args.download_python,'-m','yt_dlp','--ignore-config','--no-playlist','--no-progress','--no-warnings',
                     '--js-runtimes','node','--ffmpeg-location',str(Path(args.ffmpeg).parent),'--socket-timeout','30','--retries','3',
                     '-f','bestaudio','--output',str(cache/(source_key+'.source.%(ext)s')),'--',source])
                candidates = [f for f in cache.glob(source_key+'.source.*') if f.suffix not in ('.part','.ytdl')]
            if not candidates: raise ValueError('YouTube sesi indirilemedi.')
            source = str(candidates[0])
    source = Path(source)
    stat = source.stat()
    identity = (str(source.resolve()),stat.st_size,stat.st_mtime_ns,args.start,end,'UVR_MDXNET_KARA_2.onnx')
    key = hashlib.sha256(repr(identity).encode()).hexdigest()[:24]
    stem = cache/(key+'-instrumental.wav')
    if not stem.is_file():
        work = cache/key; work.mkdir(exist_ok=True)
        audio = work/'input.wav'
        print('DUB_BACKGROUND extract',flush=True)
        run([args.ffmpeg,'-nostdin','-v','error','-y','-ss',str(args.start),'-i',str(source),
             '-t',str(end-args.start),'-vn','-ac','2','-ar','44100',str(audio)])
        print('DUB_BACKGROUND separate',flush=True)
        from audio_separator.separator import Separator
        separator = Separator(output_dir=str(work),output_format='WAV',model_file_dir=args.models,
                              log_level=logging.WARNING,output_single_stem='Instrumental')
        separator.load_model(model_filename='UVR_MDXNET_KARA_2.onnx')
        files = separator.separate(str(audio))
        if not files: raise ValueError('Arka plan kanali uretilemedi.')
        generated = Path(files[0])
        if not generated.is_absolute(): generated = work/generated
        if generated.resolve().parent != work.resolve(): raise ValueError('Gecersiz arka plan ciktisi.')
        temporary = stem.with_suffix('.partial.wav')
        shutil.copy2(generated,temporary); temporary.replace(stem)
    output = Path(args.output); output.parent.mkdir(parents=True,exist_ok=True)
    temporary = output.with_suffix('.partial.wav')
    shutil.copy2(stem,temporary); temporary.replace(output)
    print('DUB_BACKGROUND ready',flush=True)


if __name__ == '__main__':
    main()
