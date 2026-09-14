"""Stream optional videos into ZIP; never extract arbitrary archive paths."""
import json
import os
import shutil
import sys
import zipfile


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
            with bundle.open(info) as source, open(req['manifest'], 'xb') as target:
                shutil.copyfileobj(source, target, 1024 * 1024)
            return {}
        total = 0
        for entry in req['videos']:
            info = bundle.getinfo(entry['name'])
            total += info.file_size
            if total > 100 * 1024 ** 3:
                raise ValueError('Video paketi 100 GB sınırını aşıyor.')
            os.makedirs(os.path.dirname(entry['target']), exist_ok=True)
            with bundle.open(info) as source, open(entry['target'], 'xb') as target:
                shutil.copyfileobj(source, target, 1024 * 1024)
        return {}


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, **main(json.load(sys.stdin))}))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)[:400]}))
