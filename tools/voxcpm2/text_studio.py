"""Standalone Whisper Local text studio. No dependency on the old arayuz.py.

Uses the installed nano-vLLM/VoxCPM2 reader as a subprocess; never edits it.
Input, voice transcript, output and diagnostics are kept under Downloads/Sesler.
"""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def defaults():
    config = Path(os.environ.get('APPDATA', Path.home())) / 'whisper-browser' / 'dub-settings.json'
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=config)
    parser.add_argument('--engine', type=Path)
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--transcript', type=Path)
    parser.add_argument('--storage', type=Path, default=Path.home() / 'Downloads' / 'Sesler')
    args = parser.parse_args()
    try:
        saved = json.loads(args.config.read_text(encoding='utf-8-sig'))
        if not isinstance(saved, dict):
            saved = {}
    except (OSError, ValueError):
        saved = {}
    args.engine = args.engine or Path(saved.get('engine') or Path.home() / 'Desktop' / 'Ses' / 'VoxCPM2')
    args.reference = args.reference or Path(saved.get('reference') or args.engine / 'anlatici_ham.wav')
    args.transcript = args.transcript or Path(saved.get('transcript') or args.engine / 'anlatici_ham.txt')
    return args


def command(engine, reference, transcript, source, output, settings):
    """List argv only; user text and paths are never shell commands."""
    python = engine / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    motor = settings.get('motor', 'nano')
    mode = settings.get('mode', 'hifi')
    if motor not in ('nano', 'torch') or mode not in ('auto', 'hifi', 'clone'):
        raise ValueError('Invalid engine or cloning mode / Motor veya klonlama modu geçersiz.')
    reader = engine / ('nanovllm_oku.py' if motor == 'nano' else 'kitap_voxcpm.py')
    prompt = transcript.is_file() and bool(transcript.read_text(encoding='utf-8-sig').strip())
    if mode == 'hifi' and not prompt:
        raise ValueError('Hi-Fi requires an exact transcript / Hi-Fi için birebir döküm gerekli.')
    for file in (python, reader, reference, source):
        if not file.is_file():
            raise ValueError(f'Missing file / Dosya bulunamadı: {file}')
    values = {key: float(settings[key]) for key in ('steps', 'batch', 'cfg', 'temperature', 'pause')}
    if (not values['steps'].is_integer() or not 1 <= values['steps'] <= 50
            or values['batch'] not in (1, 2, 4, 8, 16)
            or not .1 <= values['cfg'] <= 5 or not .1 <= values['temperature'] <= 2
            or not 0 <= values['pause'] <= 5):
        raise ValueError('Invalid voice settings / Ses ayarları geçersiz.')
    max_chars = int(settings.get('max_chars', 600))
    preview = int(settings.get('preview_count', 2)) if settings.get('preview', False) else 0
    seed = int(settings.get('seed', 42))
    if not 200 <= max_chars <= 1200 or not 0 <= preview <= 20 or not 0 <= seed <= 2147483647:
        raise ValueError('Invalid grouping or preview settings / Gruplama veya örnek ayarı geçersiz.')
    argv = [str(python), '-u', str(reader), str(source), str(reference), '--mode', mode,
            '--steps', str(int(values['steps'])), '--cfg', str(values['cfg']),
            '--durak', str(values['pause']), '--output', str(output), '--plan', '2',
            '--max-chars', str(max_chars), '--seed', str(seed)]
    if prompt and mode != 'clone': argv += ['--transcript', str(transcript)]
    if motor == 'nano': argv += ['--eszamanli', str(int(values['batch'])), '--temperature', str(values['temperature'])]
    if preview: argv += ['--limit', str(preview)]
    for key, flag in [('normalize', '--no-norm'), ('align', '--no-align'), ('polish', '--no-polish')]:
        if settings.get(key, True) is False: argv.append(flag)
    return argv


def main():
    from text_studio_window import Studio
    Studio(defaults(), command).run()


if __name__ == '__main__':
    main()
