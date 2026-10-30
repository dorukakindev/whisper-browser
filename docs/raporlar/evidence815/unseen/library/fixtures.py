from pathlib import Path
import os
import sys
import zipfile
root = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('R815_LIBRARY_OUT', Path.cwd() / '.tmp' / 'unseen815-library'))
root.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(root / 'hidden.epub', 'w') as z:
    z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', '''<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''')
    z.writestr('OPS/book.opf', '''<?xml version="1.0" encoding="UTF-8"?><package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:fixture:hidden</dc:identifier><dc:title>Hidden attribute fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-31T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>''')
    z.writestr('OPS/chapter.xhtml', '''<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><h1>Visible chapter</h1><p>Visible story sentence.</p><p hidden="hidden">EDITOR ONLY HIDDEN SENTENCE.</p><p>Visible ending.</p></body></html>''')
print(root / 'hidden.epub')
