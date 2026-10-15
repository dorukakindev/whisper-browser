"""Extract one short reference clip and its matching Whisper transcript locally."""
import argparse
import math
import os
from pathlib import Path
import subprocess
import wave


def validate_range(start, end):
    if not all(math.isfinite(v) for v in (start, end)) or start < 0 or end > 86400 or not 3 <= end - start <= 30:
        raise ValueError('Select a reference interval of 3–30 seconds.')
    return end - start


def extract_clip(source, start, end, output, ffmpeg):
    duration = validate_range(start, end)
    headers = []
    if not Path(source).is_file():
        from urllib.parse import urlparse
        parsed = urlparse(source)
        if parsed.scheme != 'https' or parsed.hostname not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'):
            raise ValueError('Unsupported reference source.')
        print('VOICE_REFERENCE download', flush=True)
        import yt_dlp
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'noplaylist': True,
                              'format': 'bestaudio/best', 'socket_timeout': 30,
                              'retries': 2, 'js_runtimes': {'node': {}}}) as downloader:
            info = downloader.extract_info(source, download=False)
        source = info.get('url') or ''
        if not source.startswith('https://'):
            raise ValueError('YouTube audio URL is unavailable.')
        for key, value in (info.get('http_headers') or {}).items():
            if not any(c in str(key) + str(value) for c in '\r\n'):
                headers.append(f'{key}: {value}\r\n')
    output = Path(output)
    temporary = output.with_suffix('.partial.wav')
    print('VOICE_REFERENCE extract', flush=True)
    args = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y']
    if headers:
        args += ['-headers', ''.join(headers)]
    args += ['-ss', str(start), '-i', source, '-t', str(duration), '-vn', '-ac', '1', '-ar', '24000', str(temporary)]
    result = subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            timeout=180, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise RuntimeError('Reference audio extraction failed.')
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
    main()
