"""Extract one short reference clip and its matching Whisper transcript locally."""
import argparse
import math
import os
import json
import sys
import urllib.request
from urllib.parse import urlparse
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import secrets
from pathlib import Path
import subprocess
import wave


def validate_range(start, end):
    if not all(math.isfinite(v) for v in (start, end)) or start < 0 or end > 86400 or not 3 <= end - start <= 30:
        raise ValueError('Select a reference interval of 3–30 seconds.')
    return end - start


@contextmanager
def audio_relay(source, headers):
    """Serve only the resolved audio URL; preserve FFmpeg byte-range seeking."""
    token = '/' + secrets.token_hex(24)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Signed URLs and headers must never enter logs.

        def do_HEAD(self):
            self.forward(True)

        def do_GET(self):
            self.forward(False)

        def forward(self, head):
            if self.path != token:
                self.send_error(404)
                return
            request_headers = dict(headers)
            if self.headers.get('Range'):
                request_headers['Range'] = self.headers['Range']
            request = urllib.request.Request(source, headers=request_headers, method='HEAD' if head else 'GET')
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    self.send_response(response.status)
                    for key in ('Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'):
                        if response.headers.get(key):
                            self.send_header(key, response.headers[key])
                    self.end_headers()
                    if not head:
                        while True:
                            chunk = response.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass  # FFmpeg closes an old range when it seeks.
            except Exception:
                self.close_connection = True
                try:
                    self.send_error(502, 'Audio server connection failed')
                except OSError:
                    pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}{token}'
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=2)


def extract_clip(source, start, end, output, ffmpeg):
    duration = validate_range(start, end)
    headers = {}
    remote = False
    if not Path(source).is_file():
        parsed = urlparse(source)
        if parsed.scheme != 'https' or parsed.hostname not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'):
            raise ValueError('Unsupported reference source.')
        print('VOICE_REFERENCE download', flush=True)
        import yt_dlp
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'noplaylist': True,
                              'format': 'bestaudio/best', 'socket_timeout': 30,
                              'retries': 2, 'js_runtimes': {'node': {}}}) as downloader:
            info = downloader.extract_info(source, download=False)
        remote = True
        source = info.get('url') or ''
        if not source.startswith('https://'):
            raise ValueError('YouTube audio URL is unavailable.')
        for key, value in (info.get('http_headers') or {}).items():
            if not any(c in str(key) + str(value) for c in '\r\n'):
                headers[str(key)] = str(value)
    output = Path(output)
    temporary = output.with_suffix('.partial.wav')
    print('VOICE_REFERENCE extract', flush=True)
    args = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y']
    def run(input_source):
        return subprocess.run(args + ['-ss', str(start), '-i', input_source, '-t', str(duration),
                                     '-vn', '-ac', '1', '-ar', '24000', str(temporary)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=180,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if remote:
        # Python follows the same network/proxy route as yt-dlp. A local relay
        # lets FFmpeg seek selected bytes without its separate TLS/network stack.
        with audio_relay(source, headers) as local_source:
            result = run(local_source)
    else:
        result = run(source)
    if result.returncode:
        detail = result.stderr.decode('utf-8', 'replace').lower()
        if '403 forbidden' in detail or '401 unauthorized' in detail:
            raise RuntimeError('YouTube rejected the audio connection; retry or use a local video.')
        if 'connection' in detail or 'timed out' in detail or 'error number -138' in detail:
            raise RuntimeError('Audio server connection failed. Check your network or proxy.')
        raise RuntimeError('Reference audio extraction failed; the source could not be read.')
    with wave.open(str(temporary), 'rb') as audio:
        actual = audio.getnframes() / audio.getframerate()
    if actual < 3 or abs(actual - duration) > 0.25:
        raise ValueError('The selected interval is outside the available audio.')
    temporary.replace(output)


def transcribe_reference(audio, transcript):
    # Register CUDA DLLs before importing CTranslate2; start.bat also sets PATH.
    dlls = Path(__file__).parent / 'venv' / 'Lib' / 'site-packages' / 'torch' / 'lib'
    handle = os.add_dll_directory(str(dlls)) if os.name == 'nt' and dlls.is_dir() else None
    import ctranslate2
    from faster_whisper import WhisperModel
    device = 'cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
    print('VOICE_REFERENCE transcribe_' + device, flush=True)
    model = WhisperModel('small', device=device, compute_type='float16' if device == 'cuda' else 'int8')
    segments, _ = model.transcribe(str(audio), beam_size=3, vad_filter=True, condition_on_previous_text=False)
    text = ' '.join(segment.text.strip() for segment in segments).strip()
    if not text or len(text) > 8000:
        raise ValueError('No clear speech found; select a single speaker without music.')
    Path(transcript).write_text(text, encoding='utf-8')
    if handle:
        handle.close()


def main():
    parser = argparse.ArgumentParser()
    for name in ('source', 'output', 'transcript', 'ffmpeg'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--start', type=float, required=True)
    parser.add_argument('--end', type=float, required=True)
    args = parser.parse_args()
    validate_range(args.start, args.end)
    extract_clip(args.source, args.start, args.end, args.output, args.ffmpeg)
    transcribe_reference(args.output, args.transcript)
    print('VOICE_REFERENCE ready', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Only controlled, URL-free diagnostic messages cross the IPC boundary.
        message = str(error) if isinstance(error, (ValueError, RuntimeError)) else 'Reference preparation failed. Check the source and local tools.'
        if 'http://' in message or 'https://' in message:
            message = 'YouTube audio could not be retrieved. Check network access.'
        print('VOICE_REFERENCE_ERROR ' + json.dumps(message[:500]), flush=True)
        sys.exit(1)
