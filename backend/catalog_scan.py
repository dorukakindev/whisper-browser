"""Selected-folder inventory. No file writes, no symlink traversal."""
import json
import os
import sys
from guessit import guessit


def scan(folder):
    rows, warnings = [], []
    for root, dirs, files in os.walk(folder, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not os.path.islink(os.path.join(root, d)))
        for name in sorted(files):
            full = os.path.join(root, name)
            if os.path.islink(full) or os.path.splitext(name)[1].lower() not in {'.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v', '.ts'}:
                continue
            if len(rows) >= 5000:
                warnings.append('İlk 5000 video gösteriliyor; daha küçük bir klasör seçin.')
                return {'rows': rows, 'warnings': warnings}
            info = guessit(name)
            episodes = info.get('episode', [])
            if isinstance(episodes, int):
                episodes = [episodes]
            season = info.get('season', 1)
            if isinstance(season, list):
                warnings.append(f'Birden fazla sezon: {name}; elle kontrol edin.')
                continue
            rows.append({'title': str(info.get('title') or os.path.splitext(name)[0]),
                         'year': info.get('year'), 'kind': 'series' if episodes else 'film',
                         'season': season, 'episodes': episodes, 'path': full})
    return {'rows': rows, 'warnings': warnings}


if __name__ == '__main__':
    request = json.load(sys.stdin)
    print(json.dumps(scan(request['folder']), ensure_ascii=False))
