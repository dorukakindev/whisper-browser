"""Salt okunur nMDB SQLite katalog önizlemesi; özel veritabanını değiştirmez."""
import argparse
import json
import sqlite3
import sys
from pathlib import Path
from urllib.parse import quote


def rows(connection, sql):
    return [dict(row) for row in connection.execute(sql).fetchall()]


def read_catalog(db_path):
    resolved = Path(db_path).expanduser().resolve(strict=True)
    if not resolved.is_file():
        raise ValueError("Veritabanı dosyası bulunamadı.")
    uri = f"file:{quote(str(resolved).replace(chr(92), '/'), safe='/:')}?mode=ro"
    connection = sqlite3.connect(uri, uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA query_only=ON")
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required = {"works", "work_legacy_links", "filmler", "media_files"}
        if not required.issubset(tables):
            raise ValueError("nMDB katalog tabloları eksik veya sürüm uyumsuz.")
        film_columns = {row[1] for row in connection.execute("PRAGMA table_info(filmler)")}
        ratings = ", ".join(f"f.{name} AS {name}" if name in film_columns else f"NULL AS {name}"
                            for name in ("imdb_puani", "lb_puani", "kisisel_puan"))
        works = rows(connection, f"""
            SELECT w.id AS work_id, w.title, w.original_title, w.year, w.kind,
                   w.imdb_id, w.tmdb_id,
                   f.izleme_durumu, f.favori, f.poster_yolu, f.konu_ozeti,
                   {ratings}
            FROM works AS w
            LEFT JOIN work_legacy_links AS link ON link.work_id = w.id
            LEFT JOIN filmler AS f ON f.id = link.legacy_film_id
            ORDER BY w.id, f.id LIMIT 20000
        """)
        media = rows(connection, """
            SELECT work_id, path, filename, is_primary
            FROM media_files ORDER BY work_id, is_primary DESC, id
            LIMIT 20000
        """)
        grouped = {}
        for work in works:
            grouped.setdefault(work["work_id"], work)
        paths = {}
        for row in media:
            paths.setdefault(row["work_id"], []).append(row)
        return {"works": [{**work, "media_files": paths.get(work_id, [])}
                          for work_id, work in grouped.items()],
                "count": len(grouped)}
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    args = parser.parse_args()
    try:
        result = read_catalog(args.db)
        print(json.dumps(result, ensure_ascii=True))
    except (OSError, sqlite3.Error, ValueError) as error:
        print(json.dumps({"error": str(error)[:300]}, ensure_ascii=True))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
