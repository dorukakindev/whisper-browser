"""Bounded, offline EPUB/RSS/Letterboxd parsing. Never extracts archive paths."""
import base64
import csv
import io
import json
import hashlib
import os
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit


def xml(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('DTD/entity declarations are not supported.')
    return ET.fromstring(data)


def local(tag):
    return tag.rsplit('}', 1)[-1]


def text(node):
    return ''.join(node.itertext()).strip() if node is not None else ''


def first(node, name):
    return next((n for n in node.iter() if local(n.tag) == name and text(n)), None)


class Prose(HTMLParser):
    BLOCKS = frozenset('p div br h1 h2 h3 h4 h5 h6 li td th tr blockquote dt dd figcaption aside'.split())
    VOID = frozenset('br hr img meta link input source wbr area base col embed param track'.split())

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.stack = [], []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        types = set(attributes.get('epub:type', '').split())
        hidden = tag in ('head', 'title', 'script', 'style', 'noscript', 'nav') or 'noteref' in types
        suppressed = hidden or (self.stack[-1][1] if self.stack else False)
        if not suppressed and tag in self.BLOCKS:
            self.parts.append('\n\n')
        if tag not in self.VOID:
            self.stack.append((tag, suppressed))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID: self.handle_endtag(tag)

    def handle_endtag(self, tag):
        suppressed = self.stack[-1][1] if self.stack else False
        for index in range(len(self.stack)-1,-1,-1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break
        if not suppressed and tag in self.BLOCKS:
            self.parts.append('\n\n')

    def handle_data(self, data):
        if not self.stack or not self.stack[-1][1]: self.parts.append(data)

    def value(self):
        return '\n\n'.join(' '.join(p.split()) for p in ''.join(self.parts).split('\n\n') if p.strip())


def decode(data):
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16')
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return data.decode('cp1254')


def read_book(file):
    if os.path.getsize(file) > 150 * 1024 * 1024:
        raise ValueError('Book is too large (150 MB maximum).')
    name = os.path.splitext(os.path.basename(file))[0]
    ext = os.path.splitext(file)[1].lower()
    if ext == '.pdf':
        return dict(title=name, author='', format='pdf', chapters=[])
    if ext == '.txt':
        with open(file, 'rb') as source:
            data = source.read(2_000_001)
        if len(data) > 2_000_000:
            raise ValueError('Text is too large (2 MB maximum).')
        return dict(title=name, author='', format='txt', chapters=[dict(title=name, text=decode(data))])
    if ext != '.epub':
        raise ValueError('Unsupported book format.')
    with zipfile.ZipFile(file) as archive:
        infos = archive.infolist()
        if len(infos) > 5000 or sum(i.file_size for i in infos) > 150 * 1024 * 1024:
            raise ValueError('EPUB archive exceeds limits.')
        names = [i.filename for i in infos]
        if len(set(names)) != len(names):
            raise ValueError('Duplicate EPUB archive entries.')

        def read(entry, limit=3_000_000):
            info = archive.getinfo(entry)
            if info.file_size > limit or info.flag_bits & 1:
                raise ValueError('EPUB resource is too large or encrypted.')
            return archive.read(info)

        def relative(base, href):
            if urlsplit(href).scheme or href.startswith(('/', '\\')):
                raise ValueError('External EPUB resource is not supported.')
            target = posixpath.normpath(posixpath.join(base, unquote(href.split('#')[0])))
            if target == '..' or target.startswith('../') or '\\' in target:
                raise ValueError('Unsafe EPUB resource path.')
            return target

        container = xml(read('META-INF/container.xml'))
        rootfile = next((n.attrib.get('full-path') for n in container.iter() if local(n.tag) == 'rootfile'), '')
        rootfile = relative('', rootfile or '')
        package = xml(read(rootfile))
        base = posixpath.dirname(rootfile)
        manifest = {n.attrib['id']: n for n in package.iter() if local(n.tag) == 'item' and 'id' in n.attrib}
        chapters, size = [], 0
        for spine_index, ref in enumerate(n for n in package.iter() if local(n.tag) == 'itemref'):
            item = manifest.get(ref.attrib.get('idref'))
            if item is None or ref.attrib.get('linear') == 'no':
                continue
            entry = relative(base, item.attrib.get('href', ''))
            content = read(entry)
            parser = Prose()
            parser.feed(decode(content))
            prose = parser.value()
            size += len(prose)
            if size > 900_000 or len(chapters) >= 1000:
                raise ValueError('EPUB text exceeds reader limits.')
            if prose:
                chapters.append(dict(title=prose.split('\n')[0][:120], text=prose,
                                     sourceId=hashlib.sha256(entry.encode('utf-8')).hexdigest(), sourceSpineIndex=spine_index))
        if not chapters:
            raise ValueError('No readable EPUB chapters; DRM/fixed-layout books are not supported.')
        cover = ''
        cover_id = next((n.attrib.get('content') for n in package.iter() if local(n.tag) == 'meta' and n.attrib.get('name') == 'cover'), None)
        candidate = next((n for n in manifest.values() if 'cover-image' in n.attrib.get('properties', '').split()), None)
        if candidate is None:
            candidate = manifest.get(cover_id)
        if candidate is not None and candidate.attrib.get('media-type') in ('image/jpeg', 'image/png', 'image/webp'):
            entry = relative(base, candidate.attrib.get('href', ''))
            if archive.getinfo(entry).file_size <= 250_000:
                data = read(entry, 250_000)
                cover = 'data:' + candidate.attrib['media-type'] + ';base64,' + base64.b64encode(data).decode('ascii')
        return dict(title=text(first(package, 'title')) or name, author=text(first(package, 'creator')), format='epub', chapters=chapters, cover=cover)


def rss(data):
    if len(data) > 2_000_000:
        raise ValueError('Feed is too large.')
    root = xml(data)
    channel = next((n for n in root if local(n.tag) == 'channel'), root)
    entries = []
    for item in list(channel):
        if local(item.tag) not in ('item', 'entry'):
            continue
        enclosure = next((n for n in item if local(n.tag) == 'enclosure' or (local(n.tag) == 'link' and n.attrib.get('rel') == 'enclosure')), None)
        if enclosure is None:
            continue
        url = enclosure.attrib.get('url') or enclosure.attrib.get('href') or ''
        if urlsplit(url).scheme not in ('http', 'https'):
            continue
        entries.append(dict(title=text(first(item, 'title'))[:500], url=url, description=text(first(item, 'description'))[:3000], date=text(first(item, 'pubDate'))[:100]))
        if len(entries) >= 200:
            break
    if not entries:
        raise ValueError('No audio/video enclosures found in RSS/Atom feed.')
    return dict(title=text(first(channel, 'title'))[:500], episodes=entries)


def letterboxd(data, source_name=""):
    source_name = posixpath.basename(source_name.replace('\\', '/')).lower()
    if len(data) > 5_000_000:
        raise ValueError('Letterboxd CSV exceeds 5 MB.')
    reader = csv.DictReader(io.StringIO(decode(data)))
    rows = []
    for row in reader:
        title = row.get('Name') or row.get('Title')
        if not title:
            continue
        rating = row.get('Rating') or ''
        try:
            rating = float(rating) if rating else None
        except ValueError:
            rating = None
        if rating is not None and (not 0 <= rating <= 5 or rating * 2 != int(rating * 2)):
            rating = None
        # DictReader uses None for fields missing from a shortened final row.
        # Year is optional; preserve the title and other valid rows.
        year = row.get('Year') or ''
        review = row.get('Review') or row.get('review') or ''
        class ReviewText(HTMLParser):
            def __init__(self):
                super().__init__(convert_charrefs=True)
                self.parts = []
                self.skip = 0
            def handle_starttag(self, tag, attrs):
                if tag in ('script', 'style'): self.skip += 1
                elif tag in ('p', 'br', 'div'): self.parts.append('\n')
            def handle_endtag(self, tag):
                if tag in ('script', 'style') and self.skip: self.skip -= 1
            def handle_data(self, text):
                if not self.skip: self.parts.append(text)
        plain = ReviewText(); plain.feed(review[:48000])
        rows.append(dict(title=title[:500], year=year if year.isdigit() and len(year) == 4 else '', rating=rating,
                         review=''.join(plain.parts).strip()[:12000],
                         tags=[value.strip()[:100] for value in (row.get('Tags') or '').split(',') if value.strip()][:30],
                         liked=str(row.get('Liked') or '').lower() in ('yes','true','1'),
                         watchedDate=(row.get('Watched Date') or row.get('WatchedDate') or '')[:10],
                         addedDate=(row.get('Date') or '')[:10],
                         watched=source_name in ('watched.csv','diary.csv') or bool(row.get('Watched Date') or row.get('WatchedDate')),
                         uri=(row.get('Letterboxd URI') or row.get('LetterboxdURI') or '')[:2048]))
        if len(rows) > 10000:
            raise ValueError('Letterboxd CSV exceeds 10,000 titles.')
    if not rows:
        raise ValueError('No Name/Title column or no titles in CSV.')
    if source_name == 'diary.csv':
        seen = {}
        for row in rows:
            row['watchedDate'] = row['watchedDate'] or row['addedDate']
            identity = (row['title'].casefold(), row['year'], row['watchedDate'])
            row['rewatchIndex'] = seen.get(identity, 0)
            seen[identity] = row['rewatchIndex'] + 1
    return dict(rows=rows)


def letterboxd_archive(file):
    """Read selected CSV entries in memory; never extract archive paths."""
    merged = {}; reviews = {}; diary = {}
    with zipfile.ZipFile(file) as archive:
        selected = [entry for entry in archive.infolist() if posixpath.basename(entry.filename).lower() in ('ratings.csv','diary.csv','reviews.csv','watched.csv')]
        if not selected or len(selected) > 12 or sum(entry.file_size for entry in selected) > 20_000_000:
            raise ValueError('Unsupported or oversized Letterboxd ZIP.')
        priority = {'reviews.csv': 0, 'watched.csv': 1, 'diary.csv': 2, 'ratings.csv': 3}
        selected.sort(key=lambda e: (priority[posixpath.basename(e.filename).lower()], e.filename.casefold()))
        for entry in selected:
            if entry.file_size > 5_000_000 or entry.flag_bits & 1:
                raise ValueError('Oversized or encrypted Letterboxd CSV.')
            source_name = posixpath.basename(entry.filename).lower()
            for row in letterboxd(archive.read(entry), source_name)['rows']:
                if source_name == 'diary.csv':
                    identity = (row['title'].casefold(), row['year'], row['watchedDate'] or row['addedDate'])
                    count = row.get('rewatchIndex', 0)
                    diary_row = row.copy(); diary_row['rewatchIndex'] = count
                    diary_row['watchedDate'] = diary_row['watchedDate'] or diary_row['addedDate']
                    diary[(*identity, count)] = diary_row
                if row['review']:
                    review_key = (row['title'].casefold(), row['year'], row['watchedDate'], row['review'])
                    reviews[review_key] = row.copy()
                key = (row['title'].casefold(), row['year'])
                old = merged.get(key, {})
                row['review'] = row['review'] or old.get('review', '')
                row['rating'] = row['rating'] if row['rating'] is not None else old.get('rating')
                row['watchedDate'] = max(row['watchedDate'], old.get('watchedDate', ''))
                row['liked'] = row['liked'] or old.get('liked', False)
                row['watched'] = row['watched'] or old.get('watched', False)
                row['tags'] = list(dict.fromkeys([*old.get('tags', []), *row['tags']]))[:30]
                merged[key] = {**old, **row}
                if len(merged) > 10000:
                    raise ValueError('Letterboxd ZIP exceeds 10,000 titles.')
    return dict(rows=list(merged.values()), reviews=list(reviews.values())[:10000], diary=list(diary.values()) if diary else list(merged.values()))


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        action = request.get('action')
        if action == 'book':
            result = read_book(request['path'])
        elif action == 'rss':
            result = rss(base64.b64decode(request['data'], validate=True) if 'data' in request else request['text'].encode('utf-8'))
        elif action == 'letterboxd':
            if request['path'].lower().endswith('.zip'):
                result = letterboxd_archive(request['path'])
            else:
                with open(request['path'], 'rb') as source:
                    result = letterboxd(source.read(5_000_001), posixpath.basename(request['path']))
        else:
            raise ValueError('Unsupported parser action.')
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
