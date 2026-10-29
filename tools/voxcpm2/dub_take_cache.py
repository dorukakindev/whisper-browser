"""Immutable, content-addressed raw speech takes; the live cache stays mutable."""
import hashlib
import os
from pathlib import Path
import tempfile


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def snapshot(source, root):
    source, root = Path(source), Path(root)
    root.mkdir(parents=True, exist_ok=True)
    if root.is_symlink():
        raise ValueError('Invalid take storage.')
    before = source.stat()
    temporary = None
    try:
        with source.open('rb') as incoming, tempfile.NamedTemporaryFile(dir=root, suffix='.partial', delete=False) as outgoing:
            temporary = Path(outgoing.name)
            identity = hashlib.sha256()
            size = 0
            for block in iter(lambda: incoming.read(1024 * 1024), b''):
                outgoing.write(block)
                identity.update(block)
                size += len(block)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        after = source.stat()
        if not size or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or size != before.st_size:
            raise ValueError('Speech cache changed while capturing the take.')
        key = identity.hexdigest()
        target = root / (key + '.wav')
        try:
            # Link the independent staged copy, never the live cache inode.
            os.link(temporary, target)
        except FileExistsError:
            if target.is_symlink() or not target.is_file() or digest(target) != key:
                raise ValueError('Saved take content does not match its identity.')
        return {'file': str(target), 'sha256': key, 'cache_key': source.stem}
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def capture(paths, root, valid, warning=print):
    results = []
    for source in paths:
        try:
            if not valid(source):
                results.append({'file': '', 'takeUnavailable': True})
                continue
            results.append(snapshot(source, root))
        except (OSError, ValueError):
            # Voice generation remains useful even if optional take storage fails.
            # Never publish the mutable live-cache path as an immutable take.
            results.append({'file': '', 'takeUnavailable': True})
            warning('DUB_WARNING take_snapshot_unavailable')
    return results
