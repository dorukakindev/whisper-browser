'use strict';
const { SHOWS } = require('./fixture-podcasts');
module.exports = function proto(session) {
  session.defaultSession.protocol.handle('https', (request) => {
    const url = new URL(request.url);
    if (['images.metahub.space', 'episodes.example', 'image.tmdb.org'].includes(url.hostname)) {
      const key = url.pathname, hue = [...key].reduce((x, c) => x + c.charCodeAt(0), 0) % 360, wide = /background|episodes/.test(url.hostname + key), w = wide ? 1280 : 400, h = wide ? 720 : 600;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,12%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.35}" r="${h * 0.25}" fill="#fff" fill-opacity=".12"/></svg>`;
      return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } });
    }
    if (url.hostname === 's4.anilist.co') {
      const parts = url.pathname.split('/'), kind = parts[1], slug = (parts[2] || 'x').replace(/\.jpg$/, ''), hue = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
      const wide = kind === 'background', w = wide ? 1600 : 460, h = wide ? 520 : 690;
      const label = slug.replace(/-/g, ' ').toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,52%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},60%,16%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.72}" cy="${h * 0.3}" r="${h * 0.34}" fill="#fff" fill-opacity=".10"/><circle cx="${w * 0.2}" cy="${h * 0.9}" r="${h * 0.5}" fill="#000" fill-opacity=".2"/>${wide ? '' : `<text x="28" y="${h - 46}" font-family="Georgia,serif" font-size="34" font-weight="700" fill="#fff">${label.slice(0, 18)}</text>`}</svg>`;
      return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } });
    }
    if (url.hostname !== 'cdn.pod.example') return Response.error();
    const slug = url.pathname.split('/').pop().replace('.svg', ''), show = SHOWS.find((s) => s.slug === slug) || SHOWS[0];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${show.c1}"/><stop offset="1" stop-color="${show.c2}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="430" cy="170" r="150" fill="#fff" fill-opacity=".10"/><circle cx="170" cy="470" r="210" fill="#000" fill-opacity=".16"/><text x="44" y="520" font-family="Georgia,serif" font-size="64" fill="#fff" font-weight="700">${show.title.replace(/&/g, '&amp;')}</text><text x="44" y="565" font-family="sans-serif" font-size="26" fill="#fff" fill-opacity=".8">${show.author.replace(/&/g, '&amp;')}</text></svg>`;
    return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } });
  });
};
