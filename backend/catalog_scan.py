"""Selected-folder inventory. No file writes, no symlink traversal."""
import json
import os
import sys
from guessit import guessit

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def scan(folder):
    rows, warnings = [], []
    def is_reparse(path):
        try:
            stat = os.stat(path, follow_symlinks=False)
            return bool(getattr(stat, 'st_file_attributes', 0) & 0x400)
        except OSError:
            return True
    def onerror(error):
        warnings.append(f'Klasör okunamadı: {getattr(error, "filename", "bilinmeyen yol")}')
    for root, dirs, files in os.walk(folder, followlinks=False, onerror=onerror):
        dirs[:] = sorted(d for d in dirs
                          if not os.path.islink(os.path.join(root, d))
                          and not is_reparse(os.path.join(root, d)))
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
    try:
        request = json.load(sys.stdin)
        folder = request.get('folder') if isinstance(request, dict) else None
        if not isinstance(folder, str) or not folder or not os.path.isdir(folder):
            raise ValueError('Taranacak klasör geçersiz.')
        print(json.dumps(scan(folder), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': str(error)[:300]}, ensure_ascii=False))
        raise SystemExit(1)
