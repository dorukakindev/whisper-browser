"""Private NDJSON speech verifier. CPU keeps the TTS GPU memory available."""
import json
import sys


def main():
    from faster_whisper import WhisperModel
    # Reuse the reference-transcription model if present. Do not download a
    # second model merely because a user enabled output verification.
    model = WhisperModel('small', device='cpu', compute_type='int8', local_files_only=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            segments, _ = model.transcribe(request['path'], beam_size=3,
                condition_on_previous_text=False, vad_filter=True)
            text = ' '.join(s.text.strip() for s in segments)
            print(json.dumps({'text': text}, ensure_ascii=True), flush=True)
        except Exception:
            print(json.dumps({'error': 'verification_unavailable'}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No personal transcript, paths or native stderr in the public log.
        print(json.dumps({'error': 'verification_unavailable'}), flush=True)
        sys.exit(1)
