"""Headless transport for the existing, validated text_studio.command builder."""
import argparse
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', required=True, type=Path)
    args = parser.parse_args()
    if args.request.stat().st_size > 65536:
        parser.error('Text job request is too large')
    data = json.loads(args.request.read_text(encoding='utf-8'))
    from text_studio import command
    engine = Path(data['engine'])
    argv = command(engine, Path(data['reference']), Path(data['transcript']),
                   Path(data['source']), Path(data['output']), data['settings'])
    return subprocess.call(argv, cwd=engine, env=os.environ.copy())


if __name__ == '__main__':
    raise SystemExit(main())
