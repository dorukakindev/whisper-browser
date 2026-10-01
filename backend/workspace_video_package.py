"""Stream optional videos into ZIP; never extract arbitrary archive paths."""
import json
import os
import sys
import zipfile


def _copy_bounded(source, target, limit):
    # zipfile metaverisindeki file_size beyan edilen değerdir; sahte bir arşivde
    # gerçek deflate çıktısı bundan büyük olabilir (CRC ancak akış sonunda
    # doğrulanır). Gerçek bayt sayısını sınırla — yasal girdi tam olarak
    # file_size kadar üretir, aşım = kurcalanmış metaveri.
    written = 0
    while True:
        chunk = source.read(1024 * 1024)
        if not chunk:
            break
        written += len(chunk)
        if written > limit:
            raise ValueError('Paket girdisi beyan edilen boyutu aşıyor.')
        target.write(chunk)


def _extract_entry(bundle, info, destination):
    # Temizlik yalnız bu çağrının oluşturduğu dosyayı siler: bundle.open daha
    # hedef açılmadan düşerse mevcut bir dosya silinmemeli.
    created = False
    try:
        with bundle.open(info) as source, open(destination, 'xb') as target:
            created = True
            _copy_bounded(source, target, info.file_size)
    except Exception:
        if created:
            try:
                os.remove(destination)
            except OSError:
                pass
        raise


def main(req):
    if req['action'] == 'write':
        with zipfile.ZipFile(req['output'], 'x', compression=zipfile.ZIP_STORED, allowZip64=True) as bundle:
            bundle.write(req['manifest'], 'workspace.wbp')
            for entry in req['videos']:
                if os.path.islink(entry['source']):
                    raise ValueError('Bağlantı video dosyası pakete eklenemez.')
                bundle.write(entry['source'], entry['name'])
        return {}
    with zipfile.ZipFile(req['archive'], 'r') as bundle:
        info = bundle.getinfo('workspace.wbp')
        if info.file_size > 256 * 1024 * 1024:
            raise ValueError('Paket açıklaması çok büyük.')
        if req['action'] == 'read':
            _extract_entry(bundle, info, req['manifest'])
            return {}
        if req['action'] != 'extract':
            # Bilinmeyen eylem sessizce extract dalına düşmezdi — fail-closed.
            raise ValueError(f"Desteklenmeyen paket eylemi: {req['action']!r}")
        total = 0
        missing = []
        for entry in req['videos']:
            try:
                info = bundle.getinfo(entry['name'])
            except KeyError:
                # Arşivde olmayan video atlanır; sessizce yanlış dosyaya
                # bağlanmaz — JS tarafı bunları 'missing' olarak raporlar.
                missing.append(entry['name'])
                continue
            total += info.file_size
            if total > 100 * 1024 ** 3:
                raise ValueError('Video paketi 100 GB sınırını aşıyor.')
            os.makedirs(os.path.dirname(entry['target']), exist_ok=True)
            _extract_entry(bundle, info, entry['target'])
        return {'missing': missing}


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, **main(json.load(sys.stdin))}))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)[:400]}))
