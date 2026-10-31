"""Publish a dubbing waveform and its authoritative sidecars as one version."""
from contextlib import contextmanager
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from pipeline_control import OutputTransaction, recover_output_transactions


@contextmanager
def staged_output(output):
    output = Path(output).absolute()
    output.parent.mkdir(parents=True, exist_ok=True)
    recover_output_transactions(output.parent)
    with tempfile.TemporaryDirectory(prefix='.dub-output-', dir=output.parent, ignore_cleanup_errors=True) as folder:
        staged = Path(folder) / output.name
        yield staged
        # Every file here was produced by this invocation, before any public
        # output changes. Keep the final basename for the external manifest writer.
        files = list(Path(folder).iterdir())
        required = {output.name, staged.with_suffix('.quality.json').name,
                    staged.with_suffix('.performance.json').name}
        if not required.issubset({file.name for file in files}):
            raise ValueError('Dubbing output bundle is incomplete.')
        if any(file.is_symlink() or not file.is_file() for file in files):
            raise ValueError('Invalid dubbing output bundle.')
        transaction = OutputTransaction(output.parent)
        try:
            for file in files:
                transaction.stage(output.parent / file.name,
                                  lambda target, source=file: os.replace(source, target))
            if not staged.with_suffix('.sync.json').name in {file.name for file in files}:
                transaction.stage_delete(output.with_suffix('.sync.json'))
            transaction.commit()
        except BaseException:
            transaction.rollback()
            raise
