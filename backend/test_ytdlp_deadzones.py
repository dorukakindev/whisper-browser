#!/usr/bin/env python3
"""R334 ölü-bölge kilidi — download_youtube (transcribe.py:311-470).

Kapsam haritasında 45 satır ölüydü: yt_dlp yerine sahte modül enjekte
edilerek ağ bağımlılığı olmadan sözleşme kilitlenir:

- audio_lang doğrulama kapısı (regex dışı dil → warn + kapısız format)
- cookie_browser whitelist (izinli → cookiesfrombrowser; izinsiz → RuntimeError)
- hata eşlemesi ("confirm you're not a bot" / "Could not copy cookie")
- progress_hook → download_progress emit akışı
- dosya çözümlemesi: requested_downloads.filepath → uzantı taraması →
  traversal kimliği reddi (R332 _inside) → bulunamadı hatası
- ffmpeg_path → ffmpeg_location + eksik ffprobe uyarısı
"""

import os
import sys
import tempfile
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402

PASS = []


def check(name, cond, detail=''):
    assert cond, f'{name}: {detail}'
    PASS.append(name)


class FakeYDL:
    """YoutubeDL bağlamsal-ikizi; sınıf üyeleriyle sürülür."""

    instances = []
    raise_on_extract = None
    info_result = None

    def __init__(self, opts):
        self.opts = opts
        self.extracted = []
        FakeYDL.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def extract_info(self, url, download=True):
        self.extracted.append(url)
        if FakeYDL.raise_on_extract is not None:
            raise FakeYDL.raise_on_extract
        return FakeYDL.info_result


def install_fake_ytdlp():
    FakeYDL.instances = []
    FakeYDL.raise_on_extract = None
    FakeYDL.info_result = None
    mod = types.ModuleType('yt_dlp')
    mod.YoutubeDL = FakeYDL
    sys.modules['yt_dlp'] = mod


def collect():
    logs, events = [], []

    def fake_log(msg, level='info'):
        logs.append((msg, level))

    def fake_emit(kind, **kw):
        events.append((kind, kw))

    old_log, old_emit = T.log, T.emit
    T.log, T.emit = fake_log, fake_emit
    return logs, events, (old_log, old_emit)


def restore(saved):
    T.log, T.emit = saved


def t_audio_lang_gate():
    install_fake_ytdlp()
    logs, events, saved = collect()
    outdir = tempfile.mkdtemp()
    # Geçersiz dil: warn verilir ve format'a language filtresi girmez
    FakeYDL.info_result = {'id': 'v1', 'title': 'T', 'requested_downloads': [
        {'filepath': os.path.join(outdir, 'v1.webm')}]}
    open(os.path.join(outdir, 'v1.webm'), 'w').close()
    try:
        T.download_youtube('https://youtube.com/watch?v=v1', outdir,
                           audio_lang='ev"; drop')
        opts = FakeYDL.instances[0].opts
        check('gecersiz dil format filtresiz', 'language=' not in opts['format'],
              opts['format'])
        check('gecersiz dil uyarısı', any('yok sayildi' in m for m, l in logs),
              logs)
        # Geçerli dil: format'a bağlanır
        FakeYDL.instances = []
        T.download_youtube('https://youtube.com/watch?v=v1', outdir,
                           audio_lang='en-US')
        fmt = FakeYDL.instances[0].opts['format']
        check('gecerli dil formatta', 'language=en-US' in fmt, fmt)
    finally:
        restore(saved)


def t_cookie_browser_gate():
    install_fake_ytdlp()
    logs, events, saved = collect()
    outdir = tempfile.mkdtemp()
    FakeYDL.info_result = {'id': 'v1', 'title': 'T', 'requested_downloads': [
        {'filepath': os.path.join(outdir, 'v1.webm')}]}
    open(os.path.join(outdir, 'v1.webm'), 'w').close()
    try:
        T.download_youtube('https://x/v', outdir, cookie_browser='Chrome')
        check('izinli tarayıcı', FakeYDL.instances[0].opts.get('cookiesfrombrowser') == ('chrome',))
        try:
            T.download_youtube('https://x/v', outdir, cookie_browser='netscape')
            check('izinsiz tarayıcı hatası', False, 'hata yok')
        except RuntimeError as e:
            check('izinsiz tarayıcı hatası', 'Desteklenmeyen' in str(e), str(e))
    finally:
        restore(saved)


def t_error_mapping():
    install_fake_ytdlp()
    logs, events, saved = collect()
    outdir = tempfile.mkdtemp()
    try:
        FakeYDL.raise_on_extract = RuntimeError("Please confirm you’re not a bot")
        try:
            T.download_youtube('https://x/v', outdir)
            check('bot hatası', False, 'hata yok')
        except RuntimeError as e:
            check('bot hatası eşlemesi', 'oturum doğrulaması' in str(e), str(e))
        FakeYDL.raise_on_extract = RuntimeError("Could not copy Chrome cookie database")
        try:
            T.download_youtube('https://x/v', outdir)
            check('cookie hatası', False, 'hata yok')
        except RuntimeError as e:
            check('cookie hatası eşlemesi', 'cookie veritabanı' in str(e), str(e))
        # HTTP 403 → yt-dlp güncelleme rehberi (R397 canlı bulgu)
        FakeYDL.raise_on_extract = RuntimeError("unable to download video data: HTTP Error 403: Forbidden")
        try:
            T.download_youtube('https://x/v', outdir)
            check('403 hatası', False, 'hata yok')
        except RuntimeError as e:
            check('403 eşlemesi', 'yt-dlp güncellemesini' in str(e), str(e))
        # Tanınmayan hata sınıflandırıcıdan geçer — ham metin imzalı URL sızıntısı
        # yapabileceği için kullanıcıya taşınmaz (io_errors sözleşmesi).
        FakeYDL.raise_on_extract = ValueError('bilinmeyen-hata')
        try:
            T.download_youtube('https://x/v', outdir)
            check('tanınmayan hata', False, 'hata yok')
        except RuntimeError as e:
            check('tanınmayan hata', 'bilinmeyen-hata' not in str(e)
                  and 'tamamlanamadı' in str(e), str(e))
        # Boş info → anlaşılır hata
        FakeYDL.raise_on_extract = None
        FakeYDL.info_result = None
        try:
            T.download_youtube('https://x/v', outdir)
            check('boş info', False, 'hata yok')
        except RuntimeError as e:
            check('boş info', 'boş sonuç' in str(e), str(e))
    finally:
        restore(saved)


def t_progress_hook():
    install_fake_ytdlp()
    logs, events, saved = collect()
    outdir = tempfile.mkdtemp()
    FakeYDL.info_result = {'id': 'v1', 'title': 'T', 'requested_downloads': [
        {'filepath': os.path.join(outdir, 'v1.webm')}]}
    open(os.path.join(outdir, 'v1.webm'), 'w').close()
    try:
        T.download_youtube('https://x/v', outdir)
        hook = FakeYDL.instances[0].opts['progress_hooks'][0]
        hook({'status': 'downloading', 'downloaded_bytes': 50,
              'total_bytes': 200, 'speed': 9, 'eta': 7})
        hook({'status': 'finished', 'filename': 'v1.webm'})
        kinds = [k for k, _ in events]
        check('progress olayları', kinds.count('download_progress') == 2, events)
        pcts = [kw['percent'] for k, kw in events if k == 'download_progress']
        check('progress yüzde', pcts == [25.0, 100.0], pcts)
    finally:
        restore(saved)


def t_filepath_resolution():
    install_fake_ytdlp()
    logs, events, saved = collect()
    outdir = tempfile.mkdtemp()
    try:
        # requested_downloads.filepath önceliği
        real = os.path.join(outdir, 'aa.webm')
        open(real, 'w').close()
        FakeYDL.info_result = {'id': 'aa', 'title': 'Başlık X',
                               'requested_downloads': [{'filepath': real}]}
        path, title, ranged = T.download_youtube('https://x/v', outdir)
        check('filepath önceliği', os.path.abspath(path) == os.path.abspath(real), path)
        check('başlık döner', title == 'Başlık X')
        check('ranged hep False', ranged is False)
        # Uzantı taraması: requested_downloads yok, m4a dosyası var
        open(os.path.join(outdir, 'bb.m4a'), 'w').close()
        FakeYDL.info_result = {'id': 'bb', 'title': 'T2'}
        path, _, _ = T.download_youtube('https://x/v', outdir)
        check('uzantı taraması', os.path.abspath(path) == os.path.abspath(
            os.path.join(outdir, 'bb.m4a')), path)
        # Traversal kimlik: '../evil' — dosya dışarı yazılsa bile _inside reddeder
        open(os.path.join(os.path.dirname(outdir), 'evil.wav'), 'w').close()
        FakeYDL.info_result = {'id': '../evil', 'title': 'T3'}
        try:
            T.download_youtube('https://x/v', outdir)
            check('traversal red', False, 'hata yok')
        except RuntimeError as e:
            check('traversal red', 'bulunamadı' in str(e), str(e))
        os.unlink(os.path.join(os.path.dirname(outdir), 'evil.wav'))
    finally:
        restore(saved)


def t_ffmpeg_location():
    install_fake_ytdlp()
    logs, events, saved = collect()
    outdir = tempfile.mkdtemp()
    ffdir = tempfile.mkdtemp()
    ffmpeg = os.path.join(ffdir, 'ffmpeg.exe')
    open(ffmpeg, 'w').close()  # ffprobe.exe kasıtlı yok → warn
    FakeYDL.info_result = {'id': 'v1', 'title': 'T', 'requested_downloads': [
        {'filepath': os.path.join(outdir, 'v1.webm')}]}
    open(os.path.join(outdir, 'v1.webm'), 'w').close()
    try:
        T.download_youtube('https://x/v', outdir, ffmpeg_path=ffmpeg)
        check('ffmpeg_location', FakeYDL.instances[0].opts.get('ffmpeg_location') == ffdir)
        check('ffprobe uyarısı', any('ffprobe' in m and l == 'warn' for m, l in logs), logs)
    finally:
        restore(saved)


def t_clip_note_and_opts():
    install_fake_ytdlp()
    logs, events, saved = collect()
    outdir = tempfile.mkdtemp()
    FakeYDL.info_result = {'id': 'v1', 'title': 'T', 'requested_downloads': [
        {'filepath': os.path.join(outdir, 'v1.webm')}]}
    open(os.path.join(outdir, 'v1.webm'), 'w').close()
    try:
        T.download_youtube('https://x/v', outdir, clip_start=10, clip_end=20)
        check('clip notu loglanır', any('Tam ses indirilecek' in m for m, l in logs), logs)
        opts = FakeYDL.instances[0].opts
        check('noplaylist', opts['noplaylist'] is True)
        check('noprogress', opts['noprogress'] is True, 'R219: [download] NDJSON sızıntısı')
        check('node js runtime', opts['js_runtimes'].get('node') == {})
    finally:
        restore(saved)


if __name__ == '__main__':
    for name, fn in sorted(list(globals().items())):
        if name.startswith('t_'):
            fn()
    print(f'test_ytdlp_deadzones: {len(PASS)} kontrol geçti')
