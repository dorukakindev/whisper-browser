"""Bounded, offline-only subset of Kodi NFO. No filesystem/network entity resolver."""
import json
import re
import sys
import xml.etree.ElementTree as ET

def parse_nfo(xml):
    if not isinstance(xml, str) or len(xml.encode('utf-8')) > 2_000_000:
        raise ValueError('NFO exceeds 2 MB.')
    if re.search(r'<!\s*(?:DOCTYPE|ENTITY)', xml, re.I):
        raise ValueError('NFO document types and entities are not allowed.')
    root = ET.fromstring(xml.lstrip('\ufeff'))
    if root.tag not in ('movie', 'tvshow', 'episodedetails'):
        raise ValueError('Unsupported NFO root.')
    if sum(1 for _ in root.iter()) > 5000:
        raise ValueError('NFO has too many fields.')
    def text(key, limit=4000):
        value = root.findtext(key)
        return str(value or '').strip()[:limit]
    patch = {}
    for key, source in [('title','title'),('originalTitle','originaltitle'),('synopsis','plot'),('tagline','tagline')]:
        value = text(source, 4000 if key == 'synopsis' else 500)
        if value: patch[key] = value
    year = text('year')
    if re.fullmatch(r'\d{4}',year) and 1880 <= int(year) <= 2200: patch['year'] = int(year)
    runtime = text('runtime')
    if re.fullmatch(r'\d+(?:\.\d+)?',runtime) and 0 < float(runtime) <= 10000: patch['runtime'] = float(runtime)
    for key, tag in [('genres','genre'),('directors','director')]:
        values = [str(row.text or '').strip()[:120] for row in root.findall(tag)]
        values = list(dict.fromkeys(value for value in values if value))[:30]
        if values: patch[key] = values
    ids = {}
    for row in root.findall('uniqueid'):
        kind = str(row.get('type','')).lower()
        if kind in ('imdb','tmdb'):
            value = str(row.text or '').strip()
            if kind in ids and ids[kind] != value: raise ValueError('Conflicting NFO provider identities.')
            ids[kind] = value
    imdb = ids.get('imdb') or text('imdbid') or text('id')
    if re.fullmatch(r'tt\d{7,10}',imdb): patch['imdbId'] = imdb
    tmdb = ids.get('tmdb') or text('tmdbid')
    if re.fullmatch(r'\d+',tmdb) and int(tmdb)>0: patch['tmdbId'] = ('tv:' if root.tag=='tvshow' else 'movie:')+str(int(tmdb))
    return {'patch':patch,'kind':'series' if root.tag=='tvshow' else 'film','warnings':['Episode NFO is previewed as metadata only; episode numbering is not applied.'] if root.tag=='episodedetails' else []}

if __name__ == '__main__':
    if hasattr(sys.stdin,'reconfigure'): sys.stdin.reconfigure(encoding='utf-8')
    if hasattr(sys.stdout,'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    try:
        request=json.loads(sys.stdin.read(2_100_000))
        print(json.dumps(parse_nfo(request.get('xml')),ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=False))
        sys.exit(1)
