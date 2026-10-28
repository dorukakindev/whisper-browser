// Audio indices are relative to audio streams, matching ffmpeg -map 0:a:N.
function parseAudioStreams(data) {
  return (Array.isArray(data?.streams) ? data.streams : [])
    .filter(stream => stream && stream.codec_type === 'audio')
    .map((stream, index) => {
      const tags = stream.tags || {};
      const handler = tags.handler_name || tags.HANDLER_NAME || '';
      return { index, lang: tags.language || tags.LANGUAGE || '',
        title: tags.title || tags.TITLE || (/^SoundHandler$/i.test(handler) ? '' : handler),
        channels: stream.channels || 0, codec: stream.codec_name || '' };
    });
}
module.exports = { parseAudioStreams };
