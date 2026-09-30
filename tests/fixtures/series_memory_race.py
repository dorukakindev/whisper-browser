"""series_memory_race worker — testlerin süreç/iş parçacığı yarışı koşması için.

Modlar:
  merge        --terms-json dosyasındaki karar kümelerini merge_many ile yazar.
  hold         .lock dosya kilidini --hold-ms kadar tutar (HELD basıp bekler).
  threads      --workers kadar iş parçacığında ayrı SeriesMemory örneği açıp
               her biri --per-worker kadar tek tek merge() çağırır.
  corrupt-mid  geçerli dosya üzerinde örnek açar, diski çöp veriyle ezer,
               merge_many'nin 0 dönüp dosyayı korumasını doğrular.
  merge-late   merge gibi ama SeriesMemory önce kurulur; --wait-file
               görününce merge_many çalışır — başlatma sonrası _save
               çarpışmasını sınar.
"""
import argparse
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend')))
from series_memory import SeriesMemory  # noqa: E402

SHOW, SRC, TGT = 'show', 'en', 'tr'


def mem_path(directory):
    return os.path.join(directory, 'series-memory', f'{SHOW}.{SRC}-{TGT}.json')


def wait_for_file(path, timeout_s=20):
    if not path:
        return
    deadline = time.time() + timeout_s
    while not os.path.exists(path):
        if time.time() > deadline:
            raise TimeoutError(f'wait-file zaman aşımı: {path}')
        time.sleep(0.01)


def patch_class_lock_timeout(seconds):
    """__init__ dahil tüm kilit alımları için sınıf seviyesinde kısa deadline."""
    orig = SeriesMemory._file_lock
    SeriesMemory._file_lock = lambda self, timeout=seconds: orig(self, timeout=timeout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--mode', required=True)
    ap.add_argument('--ep', type=int, nargs=2, default=[1, 1])
    ap.add_argument('--terms-json')
    ap.add_argument('--hold-ms', type=int, default=2000)
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--per-worker', type=int, default=30)
    ap.add_argument('--wait-file')
    a = ap.parse_args()
    path = mem_path(a.dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if 'SM_LOCK_TIMEOUT' in os.environ:
        patch_class_lock_timeout(float(os.environ['SM_LOCK_TIMEOUT']))

    if a.mode in ('merge', 'merge-late'):
        try:
            sm = SeriesMemory(path, SHOW, SRC, TGT)
            with open(a.terms_json, encoding='utf-8') as fh:
                raws = json.load(fh)
            print('READY', flush=True)
            wait_for_file(a.wait_file)
            n = sm.merge_many(raws, a.ep[0], a.ep[1])
            print(json.dumps({'merged': n}))
        except TimeoutError:
            print(json.dumps({'timeout': True}))
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({'error': str(exc)}))
        return

    if a.mode == 'hold':
        sm = SeriesMemory(path, SHOW, SRC, TGT)
        with sm._file_lock(timeout=20):
            print('HELD', flush=True)
            time.sleep(a.hold_ms / 1000.0)
        print(json.dumps({'held': a.hold_ms}))
        return

    if a.mode == 'threads':
        errors = []

        def worker(i):
            try:
                sm = SeriesMemory(path, SHOW, SRC, TGT)
                for j in range(a.per_worker):
                    sm.merge({'terms': {f'w{i}-term-{j}': f'çeviri-{i}-{j}'}},
                             a.ep[0], a.ep[1])
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc))

        pool = [threading.Thread(target=worker, args=(i,)) for i in range(a.workers)]
        for t in pool:
            t.start()
        for t in pool:
            t.join()
        data = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
        terms = data.get('terms', {}) if isinstance(data, dict) else {}
        missing = [f'w{i}-term-{j}' for i in range(a.workers)
                   for j in range(a.per_worker) if f'w{i}-term-{j}' not in terms]
        print(json.dumps({'errors': errors, 'terms': len(terms),
                          'missing': len(missing), 'missing_sample': missing[:5]}))
        return

    if a.mode == 'corrupt-mid':
        sm = SeriesMemory(path, SHOW, SRC, TGT)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write('{bozuk json')
        n = sm.merge_many([{'terms': {'X': 'Y'}}], a.ep[0], a.ep[1])
        with open(path, 'rb') as fh:
            body = fh.read().decode('utf-8', 'replace')
        print(json.dumps({'merged': n, 'body': body}))
        return

    print(json.dumps({'error': f'bilinmeyen mod {a.mode}'}))
    sys.exit(2)


if __name__ == '__main__':
    main()
