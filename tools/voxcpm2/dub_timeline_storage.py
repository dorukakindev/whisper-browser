"""Disk-backed timelines with bounded RAM and OS-owned temporary-file cleanup."""
import math
import shutil
import tempfile
from pathlib import Path
import numpy as np
import soundfile as sf

BLOCK_FRAMES = 65536


def check_storage(seconds, sr, folder):
    if not math.isfinite(seconds) or seconds <= 0 or sr <= 0:
        raise ValueError('Invalid timeline duration/sample rate.')
    # Float scratch plus final and normalized PCM16, before expensive GPU synthesis.
    needed = math.ceil(seconds * sr) * 8 + 64 * 1024 * 1024
    if shutil.disk_usage(folder).free < needed:
        raise ValueError(f'Timeline needs approximately {needed / 1024**3:.2f} GiB free disk space / Zaman cizelgesi icin yeterli bos disk alani yok.')
    return needed


class DiskTimeline:
    def __init__(self, folder=None):
        self.file = tempfile.TemporaryFile(dir=folder, prefix='dub-timeline-', suffix='.f32', buffering=0)
        self.frames = 0

    def silence(self, frames):
        frames = max(0, int(frames))
        zeros = np.zeros(min(frames, BLOCK_FRAMES), dtype=np.float32)
        while frames:
            count = min(frames, BLOCK_FRAMES)
            block = zeros[:count].tobytes()
            if self.file.write(block) != len(block):
                raise OSError('Incomplete timeline scratch write.')
            self.frames += count
            frames -= count

    def append(self, audio):
        data = np.asarray(audio, dtype=np.float32)
        if data.ndim != 1 or not np.isfinite(data).all():
            raise ValueError('Invalid timeline audio.')
        for start in range(0, len(data), BLOCK_FRAMES):
            block = data[start:start+BLOCK_FRAMES].tobytes()
            if self.file.write(block) != len(block):
                raise OSError('Incomplete timeline scratch write.')
        self.frames += len(data)

    def finish(self):
        if not self.frames:
            self.silence(1)
        result = TimelineAudio(self)
        if self.frames * 4 <= 8 * 1024 * 1024:
            copied = result[:]
            self.close()
            return copied
        return result

    def close(self):
        if self.file is not None:
            self.file.close()
            self.file = None

    def __del__(self):
        try:
            self.close()
        except OSError:
            pass


class TimelineAudio:
    """Slice-only float32 audio, avoiding even an entire mapped working set."""
    def __init__(self, storage):
        self.storage = storage
        self.frames = storage.frames

    def __len__(self):
        return self.frames

    def _bounds(self, index):
        if isinstance(index, int):
            if index < 0:
                index += self.frames
            if not 0 <= index < self.frames:
                raise IndexError(index)
            return index, index + 1, True
        start, stop, step = index.indices(self.frames)
        if step != 1:
            raise ValueError('Timeline slices must be contiguous.')
        return start, max(start, stop), False

    def __getitem__(self, index):
        start, stop, scalar = self._bounds(index)
        self.storage.file.seek(start * 4)
        result = np.frombuffer(self.storage.file.read((stop-start)*4), dtype=np.float32).copy()
        if len(result) != stop-start:
            raise OSError('Timeline scratch file was truncated.')
        return result[0] if scalar else result

    def __setitem__(self, index, audio):
        start, stop, _ = self._bounds(index)
        data = np.asarray(audio, dtype=np.float32).reshape(-1)
        if len(data) != stop-start:
            raise ValueError('Timeline slice length mismatch.')
        self.storage.file.seek(start*4)
        block = data.tobytes()
        if self.storage.file.write(block) != len(block):
            raise OSError('Incomplete timeline scratch write.')


def release_timeline(audio):
    storage = getattr(audio, 'storage', None)
    if storage is not None:
        storage.close()
        audio.storage = None


def limit_peak(audio, ceiling=.98):
    peak = max((float(np.abs(audio[i:i+BLOCK_FRAMES]).max()) for i in range(0,len(audio),BLOCK_FRAMES)), default=0.)
    if peak > ceiling:
        for i in range(0,len(audio),BLOCK_FRAMES):
            audio[i:i+BLOCK_FRAMES] *= ceiling / peak


def write_audio(file, audio, sr):
    try:
        with sf.SoundFile(str(file), 'w', samplerate=sr, channels=1, subtype='PCM_16', format='RF64' if len(audio)*2+44>=2**32 else 'WAV') as stream:
            for i in range(0,len(audio),BLOCK_FRAMES):
                stream.write(audio[i:i+BLOCK_FRAMES])
    except BaseException:
        try:
            Path(file).unlink(missing_ok=True)
        except OSError:
            pass
        raise
    finally:
        release_timeline(audio)


def pause_before_ms(rows, index):
    if not index:
        return 0
    before, current = rows[index-1], rows[index]
    return round(1000 * max(0., current['start_seconds'] - before['start_seconds'] - before['after_seconds']))


def manifest_segments(cues, takes, groups, timing):
    if not len(cues)==len(takes)==len(groups)==len(timing['groups']):
        raise ValueError('Manifest group/audio count mismatch.')
    return [{'i':i,'text':text,'start':timing['groups'][i]['start_seconds'],
             'end':timing['groups'][i]['start_seconds']+timing['groups'][i]['after_seconds'],
             **takes[i], 'pause_ms':0,
             'pause_before_ms':pause_before_ms(timing['groups'],i),
             'source_ids':groups[i]['source_ids']}
            for i,(_,_,text) in enumerate(cues)]
