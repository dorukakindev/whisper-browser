'use strict';
// Synthetic anime/manga/manhwa archive written through the real personal-collection store (no personal data).
const path = require('node:path');
const ROWS = [
  ['5114', 'anime', 'anime', 'Fullmetal Alchemist: Brotherhood', 'watching', 9, 12, 64, 'fma', 2009, ['Action', 'Drama']],
  ['1', 'anime', 'anime', 'Cowboy Bebop', 'completed', 10, 26, 26, 'bebop', 1998, ['Sci-Fi', 'Adventure']],
  ['2', 'anime', 'anime', 'Mushishi', 'planned', null, 0, 26, 'mushi', 2005, ['Mystery']],
  ['3', 'anime', 'anime', 'Frieren: Beyond Journey’s End', 'watching', 9, 8, 28, 'frieren', 2023, ['Fantasy', 'Drama']],
  ['4', 'anime', 'anime', 'Monster', 'dropped', 7, 9, 74, 'monster', 2004, ['Thriller']],
  ['5', 'anime', 'anime', 'Spy x Family', 'paused', 8, 14, 37, 'spy', 2022, ['Comedy', 'Action']],
  ['121496', 'manga', 'manhwa', 'Solo Leveling', 'watching', null, 80, 200, 'solo', 2018, ['Action', 'Fantasy']],
  ['6', 'manga', 'manga', 'Vagabond', 'watching', 10, 120, 327, 'vagabond', 1998, ['Action', 'Historical']],
  ['7', 'manga', 'manhwa', 'Tower of God', 'planned', null, 0, 600, 'tower', 2010, ['Fantasy']],
];
module.exports = function seed({ root, profile }) {
  const C = require(path.join(root, 'src/personal-collection'));
  C.merge(profile, ROWS.map(([providerId, domain, kind, title, status, rating, progress, total, slug, year, genres]) => ({
    id: `mal:${domain}:${providerId}`, providerId, provider: 'myanimelist', title, domain, kind, rating, status, progress, total,
    metadata: { title, year, genres, total, format: domain === 'anime' ? 'TV' : 'MANGA', status: 'FINISHED', cover: `https://s4.anilist.co/cover/${slug}.jpg`, banner: `https://s4.anilist.co/background/${slug}.jpg`, description: `${title} — a synthetic description used for design checks.` },
  })));
};
module.exports.ROWS = ROWS;
