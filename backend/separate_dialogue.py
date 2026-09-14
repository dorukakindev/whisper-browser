"""Explicit short-clip separation, JSON IPC through stdin/stdout."""
import contextlib
import json
import logging
import os
import sys


def separate(request):
    os.environ['PATH'] = request['toolDirectory'] + os.pathsep + os.environ.get('PATH', '')
    from audio_separator.separator import Separator
    separator = Separator(output_dir=request['output'], output_format='WAV',
                          model_file_dir=request['models'], log_level=logging.WARNING,
                          output_single_stem='Vocals')
    separator.load_model(model_filename='UVR_MDXNET_KARA_2.onnx')
    files = separator.separate(request['audio'])
    if not files:
        raise ValueError('Konuşma kanalı üretilemedi.')
    return {'audio': os.path.join(request['output'], files[0])}


def transcribe(request):
    from faster_whisper import WhisperModel
    model = WhisperModel(request.get('model', 'base'), device='cpu', compute_type='int8')
    segments, info = model.transcribe(request['audio'], beam_size=5, vad_filter=True,
                                      language=request.get('language') or None)
    offset = float(request['start'])
    cues = [{'start': s.start + offset, 'end': s.end + offset, 'text': s.text.strip()} for s in segments]
    return {'cues': cues, 'language': info.language}


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr):
            result = transcribe(request) if request.get('operation') == 'transcribe' else separate(request)
        print(json.dumps({'ok': True, **result}, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': 'Konuşma işlemi tamamlanamadı: ' + str(error)[:400]}, ensure_ascii=False))
