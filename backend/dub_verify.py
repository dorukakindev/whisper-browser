"""Private NDJSON speech verifier. CPU keeps the TTS GPU memory available."""
import json
import math
import re
import sys


def main():
    from faster_whisper import WhisperModel
    # Reuse the reference-transcription model if present. Do not download a
    # second model merely because a user enabled output verification.
    model = WhisperModel('small', device='cpu', compute_type='int8', local_files_only=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            language = request.get('language')
            if language is not None and (not isinstance(language, str) or not re.fullmatch(r'[a-z]{2,3}', language)):
                raise ValueError('invalid verification language')
            options = {'language': language} if language else {}
            segments, info = model.transcribe(request['path'], beam_size=3,
                condition_on_previous_text=False, vad_filter=True, **options)
            text = ' '.join(s.text.strip() for s in segments)
            result = {'text': text}
            detected = getattr(info, 'language', None)
            if isinstance(detected, str) and re.fullmatch(r'[a-z]{2,3}', detected):
                result['language'] = detected
            probability = getattr(info, 'language_probability', None)
            if isinstance(probability, (float, int)) and not isinstance(probability, bool) and math.isfinite(probability) and 0 <= probability <= 1:
                result['languageProbability'] = round(probability, 4)
            print(json.dumps(result, ensure_ascii=True), flush=True)
        except Exception:
            print(json.dumps({'error': 'verification_unavailable'}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No personal transcript, paths or native stderr in the public log.
        print(json.dumps({'error': 'verification_unavailable'}), flush=True)
        sys.exit(1)
