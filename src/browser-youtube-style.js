'use strict';

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;

function isYoutubePageUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    return ['http:', 'https:'].includes(url.protocol) && YOUTUBE_HOST_RE.test(url.hostname);
  } catch (_) { return false; }
}

const fs = require('node:fs');
const path = require('node:path');
const YOUTUBE_APPEARANCE_CSS = fs.readFileSync(path.join(__dirname, 'browser-youtube-luna.css'), 'utf8');

const YOUTUBE_HIDE_SHORTS_CSS = `
ytd-rich-shelf-renderer:has(a[href*="/shorts/"]), ytd-reel-shelf-renderer,
grid-shelf-view-model:has(a[href*="/shorts/"]),
ytd-rich-section-renderer:has(ytd-rich-shelf-renderer a[href*="/shorts/"]),
ytd-rich-section-renderer:has(ytd-reel-shelf-renderer),
ytd-rich-item-renderer:has(a[href*="/shorts/"]),
ytd-video-renderer:has(a[href*="/shorts/"]),
ytd-compact-video-renderer:has(a[href*="/shorts/"]),
ytd-grid-video-renderer:has(a[href*="/shorts/"]),
ytd-guide-entry-renderer:has(a[href*="/shorts"]),
ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]),
ytm-pivot-bar-item-renderer:has(a[href*="/shorts"]),
#endpoint[title="Shorts"], [aria-label="Shorts"] { display: none !important; }
`;

let fontCss;
function mediaFontsCss() {
  if(fontCss!==undefined)return fontCss;
  // The existing OFL fonts are embedded; no remote request or user file URL.
  const ranges={latin:'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+20AC,U+FEFF',
    'latin-ext':'U+0100-02BA,U+02BD-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+2020,U+20A0-20AB'};
  try{fontCss=Object.entries(ranges).flatMap(([subset,range])=>[400,600].map(weight=>{
    const bytes=fs.readFileSync(path.join(__dirname,'renderer','fonts','media',`ibm-plex-sans-${subset}-${weight}-normal.woff2`));
    return `@font-face{font-family:'Whisper Media Sans';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');unicode-range:${range}}`;
  })).join('\n');}catch{fontCss='';} // System fallback keeps navigation usable if a font is unavailable.
  return fontCss;
}
const YOUTUBE_LIGHT_CSS=`html{color-scheme:light !important;--wb-yt-bg:#f1ede5;--wb-yt-panel:#f7f4ed;--wb-yt-raised:#fffdf8;--wb-yt-hover:#e9e3d9;--wb-yt-line:#d1c8ba;--wb-yt-strong:#a99f91;--wb-yt-text:#28231f;--wb-yt-muted:#514a43;--wb-yt-accent:#7f4c15;--wb-yt-accent-ink:#fffaf0;--wb-yt-soft:rgba(169,104,32,.13)}`;
function youtubeStyleCss({ appearance = true, hideShorts = true, theme = 'dark' } = {}) {
  return `${appearance === true ? mediaFontsCss()+'\n'+YOUTUBE_APPEARANCE_CSS+(theme==='light'?'\n'+YOUTUBE_LIGHT_CSS:'') : ''}\n${hideShorts === true ? YOUTUBE_HIDE_SHORTS_CSS : ''}`.trim();
}

module.exports = { YOUTUBE_APPEARANCE_CSS, YOUTUBE_HIDE_SHORTS_CSS, isYoutubePageUrl, youtubeStyleCss };
