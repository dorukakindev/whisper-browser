'use strict';
const Model = require('./podcast-transcript');
const { plain } = require('./feed-parser');

async function fetchPodcastTranscript(descriptor, { signal, publicPin, pinnedRequest, lookup, transport } = {}) {
  if (!Model.isSafeTranscriptUrl(descriptor?.url)) throw Object.assign(Error('Unsafe podcast transcript URL.'), { code:'EUNSAFE' });
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  let url = descriptor.url;
  for (let hop = 0; hop <= 5; hop++) {
    combined.throwIfAborted();
    const pin = await publicPin(url, { signal:combined, lookup });
    const response = await pinnedRequest(url, pin, { signal:combined, maxBytes:5 * 1024 * 1024, transport,
      headers: { Accept:'text/vtt, application/x-subrip, text/plain, text/html;q=0.7', 'Accept-Encoding':'gzip, deflate, br', 'User-Agent':'Whisper-Browser-Transcripts/1' } });
    combined.throwIfAborted();
    if ([301,302,303,307,308].includes(response.status)) {
      const next = new URL(response.headers.get('location'), url).href;
      if (hop === 5 || !Model.isSafeTranscriptUrl(next)) throw Object.assign(Error('Unsafe or excessive transcript redirect.'), { code:'EUNSAFE' });
      url = next; continue;
    }
    const classification = Model.classifyTranscriptResponse({ descriptor, status:response.status,
      contentType:response.headers.get('content-type'), byteLength:response.buffer.length,
      retryAfterSeconds:Number(response.headers.get('retry-after')) || null });
    const expectedTimedFormat = descriptor.mime === 'text/vtt' ? 'vtt'
      : ['application/x-subrip','text/srt','application/srt'].includes(descriptor.mime) ? 'srt' : null;
    const genericTimedResponse = classification.code === 'mime-mismatch' && expectedTimedFormat &&
      ['application/octet-stream','text/plain'].includes(classification.got);
    if (!classification.ok && !genericTimedResponse) return classification;
    const content = new TextDecoder('utf-8',{fatal:true}).decode(response.buffer);
    const format = Model.sniffTranscriptFormat(content);
    if (genericTimedResponse && format.format !== expectedTimedFormat) return classification;
    // Markup and arbitrary JSON remain untimed text. Neither can supply renderer HTML.
    const untimed = format.format === 'markup' || /json/i.test(descriptor.mime || '');
    return { ok:true, format:untimed?'plain':format.format, timed:untimed?'no':format.timed,
      text:format.format==='markup'?plain(content,5 * 1024 * 1024):content, descriptor:{...descriptor}, url };
  }
  throw Error('Transcript redirect limit.');
}
module.exports = { fetchPodcastTranscript };
