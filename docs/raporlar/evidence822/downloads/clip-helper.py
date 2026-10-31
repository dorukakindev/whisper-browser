"""Controlled metadata and blocked downloader entry points; real media.main and yt-dlp selection/completion."""
import os, sys, json, pathlib, atexit
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(os.environ['AUDIT822_ROOT']) / 'backend'))
import yt_dlp, media
from yt_dlp.downloader.external import FFmpegFD
from yt_dlp.downloader.http import HttpFD
calls=[]
def extract(self, url, download=True, **kwargs):
    calls.append({'type':'extract', 'requestedUrl':url,
                  'downloadRangesPresent':callable(self.params.get('download_ranges')),
                  'overwrites':self.params.get('overwrites')})
    return self.process_ie_result({'id':'fixture822','title':'fixture822','url':'https://fixture.invalid/media.mp4',
        'ext':'mp4','duration':100,'vcodec':'h264','acodec':'aac','protocol':'https'}, download=download)
def no_network(self, *args, **kwargs):
    calls.append({'type':'network_blocked'})
    raise RuntimeError('NETWORK_FORBIDDEN_BY_FIXTURE')
yt_dlp.YoutubeDL.extract_info=extract
yt_dlp.YoutubeDL.urlopen=no_network
FFmpegFD.real_download=no_network
HttpFD.real_download=no_network
@atexit.register
def trace():
    pathlib.Path(os.environ['AUDIT822_TRACE']).write_text(json.dumps({'calls':calls,'ytDlpVersion':yt_dlp.version.__version__}),encoding='utf8')
media.main()
