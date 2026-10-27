"""Bounded-memory PCM duration validation; never trust a truncated WAV header."""
import wave


def pcm_duration(file_path):
    with wave.open(str(file_path), 'rb') as handle:
        frame_bytes = handle.getsampwidth() * handle.getnchannels()
        expected = handle.getnframes()
        rate = handle.getframerate()
        if frame_bytes <= 0 or rate <= 0:
            raise ValueError('Invalid PCM WAV format.')
        received = 0
        while received < expected:
            data = handle.readframes(min(expected - received, max(1, 1048576 // frame_bytes)))
            if not data or len(data) % frame_bytes:
                raise ValueError('Truncated PCM WAV data.')
            received += len(data) // frame_bytes
        return received / rate
