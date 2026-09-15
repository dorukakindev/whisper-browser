'use strict';

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;

function isYoutubePageUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    return ['http:', 'https:'].includes(url.protocol) && YOUTUBE_HOST_RE.test(url.hostname);
  } catch (_) { return false; }
}

const YOUTUBE_APPEARANCE_CSS = `
html, body, ytd-app {
  background: #0f0f0f !important;
  color: #f1f1f1 !important;
  font-family: Roboto, Arial, sans-serif !important;
}
ytd-masthead#masthead {
  background: rgba(15, 15, 15, .96) !important;
  border-bottom: 1px solid #272727 !important;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .34) !important;
  backdrop-filter: blur(14px) !important;
}
tp-yt-app-drawer #guide-inner-content,
ytd-mini-guide-renderer, ytd-guide-renderer {
  background: #0f0f0f !important;
  border-right: 1px solid #272727 !important;
}
ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer,
ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer,
ytd-grid-video-renderer, ytd-playlist-renderer, ytd-channel-renderer {
  border-radius: 18px !important;
}
ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer,
ytd-playlist-renderer, ytd-channel-renderer {
  transition: transform .16s ease, background-color .16s ease, box-shadow .16s ease !important;
}
ytd-rich-item-renderer:hover, ytd-video-renderer:hover,
ytd-grid-video-renderer:hover, ytd-playlist-renderer:hover, ytd-channel-renderer:hover {
  background: #181818 !important;
  box-shadow: 0 12px 30px rgba(0, 0, 0, .28) !important;
  transform: translateY(-2px) !important;
}
ytd-thumbnail, ytd-thumbnail img, yt-thumbnail-view-model,
yt-thumbnail-view-model img, #thumbnail, #thumbnail-container {
  border-radius: 16px !important;
  overflow: hidden !important;
}
#video-title, ytd-channel-name, #channel-name,
yt-formatted-string.ytd-video-renderer, yt-formatted-string.ytd-rich-grid-media {
  color: #f1f1f1 !important;
}
#metadata-line, #metadata, #description, .ytd-channel-name,
yt-formatted-string.ytd-video-meta-block { color: #aaa !important; }
ytd-searchbox #container, #search-form.ytd-searchbox, input.ytd-searchbox {
  background: #121212 !important;
  border-color: #383838 !important;
  color: #f1f1f1 !important;
}
ytd-searchbox #container { border-radius: 22px 0 0 22px !important; }
#search-icon-legacy, button.ytd-searchbox {
  background: #222 !important;
  border-color: #383838 !important;
  border-radius: 0 22px 22px 0 !important;
}
yt-chip-cloud-chip-renderer {
  background: #272727 !important;
  color: #f1f1f1 !important;
  border: 1px solid #383838 !important;
  border-radius: 12px !important;
}
yt-chip-cloud-chip-renderer[selected],
yt-chip-cloud-chip-renderer[aria-selected=true] {
  background: #f1f1f1 !important;
  color: #0f0f0f !important;
}
ytd-button-renderer a, ytd-button-renderer button,
yt-button-shape button, .yt-spec-button-shape-next { border-radius: 18px !important; }
ytd-menu-popup-renderer, tp-yt-paper-dialog, yt-sheet-view-model,
ytd-multi-page-menu-renderer {
  background: #212121 !important;
  color: #f1f1f1 !important;
  border: 1px solid #383838 !important;
  border-radius: 16px !important;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .5) !important;
}
.ytp-play-progress, .ytp-swatch-background-color { background: #f1f1f1 !important; }
ytd-rich-grid-renderer[is-default-grid] #contents.ytd-rich-grid-renderer {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 26px 18px !important;
}
ytd-rich-grid-renderer[is-default-grid] #contents.ytd-rich-grid-renderer > * {
  width: auto !important; margin: 0 !important;
}
@media (min-width: 1500px) {
  ytd-rich-grid-renderer[is-default-grid] #contents.ytd-rich-grid-renderer {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  }
}
@media (max-width: 1220px) {
  ytd-rich-grid-renderer[is-default-grid] #contents.ytd-rich-grid-renderer {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}
@media (max-width: 860px) {
  ytd-rich-grid-renderer[is-default-grid] #contents.ytd-rich-grid-renderer {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}
::-webkit-scrollbar { width: 12px !important; height: 12px !important; }
::-webkit-scrollbar-track { background: #0f0f0f !important; }
::-webkit-scrollbar-thumb {
  background: #272727 !important; border: 2px solid #0f0f0f !important; border-radius: 20px !important;
}
::-webkit-scrollbar-thumb:hover { background: #383838 !important; }
`;


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

function youtubeStyleCss({ appearance = true, hideShorts = true } = {}) {
  return `${appearance === true ? YOUTUBE_APPEARANCE_CSS : ''}\n${hideShorts === true ? YOUTUBE_HIDE_SHORTS_CSS : ''}`.trim();
}

module.exports = { YOUTUBE_APPEARANCE_CSS, YOUTUBE_HIDE_SHORTS_CSS, isYoutubePageUrl, youtubeStyleCss };
