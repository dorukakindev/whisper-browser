// Kontrollü Stremio kaynak/oynatma yanıtları (yalnız tests/ Chromium düzeneği; ürün koduna girmez).
// Gerçek eklenti, debrid hesabı, mpv veya Whisper/GPU sonucu değildir.
(() => {
  'use strict';
  const fx = window.__sx = { calls: [], mode: 'mixed' };
  const row = (id, extra) => ({ id, addonKey: 'torr', addonName: 'Torrentio', name: 'Torrentio', label: 'Torrentio', title: '', description: '', kind: 'url', playable: true, reason: '', resolution: '1080p', seeders: null, sizeBytes: null, provider: '', codec: '', hdr: '', source: '', flags: [], multiAudio: false, notWebReady: false, usesHeaders: false, bingeGroup: '', score: 60, tags: [], warns: [], audio: '', channels: '', group: '', filename: '', host: 'cdn.debrid.example', embeddedSubtitles: 0, whisperAudio: 'ready', ...extra });
  const streams = () => fx.mode === 'failed' ? [] : [
    row('s4k', { resolution: '2160p', filename: 'Night.Train.2019.2160p.WEB-DL.DV.HDR.HEVC.DDP5.1-GRP.mkv', sizeBytes: 21.4 * 2 ** 30, codec: 'hevc', hdr: 'DV', source: 'webdl', provider: 'TorBox', score: 78, tags: ['instant', 'webdl', 'dv', 'hevc'], notWebReady: true, multiAudio: true, audio: 'ddp', channels: '5.1' }),
    row('s1080', { filename: 'Night.Train.2019.1080p.BluRay.x264-GRP.mp4', sizeBytes: 9.8 * 2 ** 30, codec: 'x264', source: 'bluray', provider: 'TorBox', score: 70, tags: ['instant', 'bluray'], embeddedSubtitles: 2 }),
    row('shls', { addonKey: 'live', addonName: 'Live TV', resolution: '720p', filename: '', title: 'Night Train · adaptive', score: 48, tags: ['instant'], host: 'live.example', whisperAudio: 'adaptive' }),
    row('stor', { kind: 'torrent', resolution: '1080p', filename: 'Night.Train.2019.1080p.WEBRip.x265-RG.mkv', seeders: 412, sizeBytes: 2.1 * 2 ** 30, codec: 'x265', source: 'webrip', score: 64, tags: ['fast', 'hevc'], host: '', whisperAudio: 'torrent' }),
    row('syt', { kind: 'youtube', playable: false, reason: 'youtube', resolution: '', filename: '', title: 'Official trailer', score: 0, tags: [], host: '', whisperAudio: 'none' }),
  ];
  const groups = () => fx.mode === 'failed'
    ? [{ addonKey: 'torr', addonName: 'Torrentio', count: 0, error: { message: 'raw', code: 'EBROWSER_UNSAFE_URL' } }, { addonKey: 'live', addonName: 'Live TV', count: 0, error: { message: 'raw', code: 'TIMEOUT' } }]
    : [{ addonKey: 'torr', addonName: 'Torrentio', count: 4, error: null }, { addonKey: 'live', addonName: 'Live TV', count: 1, error: null }, { addonKey: 'slow', addonName: 'Slow addon', count: 0, error: { message: 'raw', code: 'TIMEOUT' } }];
  const key = id => 'stream:' + (id.charCodeAt(1).toString(16).repeat(64)).slice(0, 64);
  const stremio = async input => {
    fx.calls.push(input.action);
    if (input.action === 'streams') return { ok: true, token: 'tok-' + fx.mode, videoId: input.id, groups: groups(), streams: streams() };
    if (input.action === 'play') { const s = streams().find(r => r.id === input.streamId); return { ok: true, url: 'https://cdn.debrid.example/v/' + input.streamId + (s.whisperAudio === 'adaptive' ? '.m3u8' : '.mp4'), key: key(input.streamId), workKey: '', whisperAudio: s.whisperAudio, resume: null, meta: { type: 'movie', id: 'tt7000001', season: null, episode: null }, title: 'Night Train' }; }
    if (['subtitles'].includes(input.action)) return { ok: true, token: 's', subtitles: [], groups: [] };
    if (['progress-title', 'progress-save'].includes(input.action)) return { ok: true, entries: [], saved: null };
    if (input.action === 'status') return { ok: true, addons: [] };
    return { ok: true };
  };
  const previous = window.api, extra = { stremio, mediaHub: async () => ({ ok: true }), mediaTorrents: async () => ({ ok: false }) };
  window.api = new Proxy({}, { get(_, k) { if (k === 'then') return undefined; return extra[k] || previous[k]; } });
})();
