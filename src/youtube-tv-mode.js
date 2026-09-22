// YouTube TV modu: YouTube'un kendi TV web uygulaması (youtube.com/tv, "leanback")
// ayrı, yalıtılmış bir pencerede TV tarayıcı kimliğiyle açılır. Giriş YouTube'un
// KENDİ akışıyla yapılır (ekranda kod → telefonda yt.be/activate); uygulama hiçbir
// OAuth istemci kimliği gömmez veya görmez (bkz. BROWSER_BUG_REPORT_94).
// Bu dosya DOM'suz ve Electron'suz saf mantıktır; main.js ve testler kullanır.
'use strict';

const TV_START_URL = 'https://www.youtube.com/tv';
const TV_PARTITION = 'persist:youtube-tv';

// YouTube masaüstü tarayıcıları youtube.com/tv'den geri çevirebilir; TV
// cihazlarının tarayıcı kimlikleri arasından biri seçilir. Biri reddedilirse
// kullanıcı ayarlardan diğerini dener.
const TV_USER_AGENTS = Object.freeze([
  Object.freeze({
    id: 'cobalt',
    label: 'Android TV (Cobalt)',
    value: 'Mozilla/5.0 (Linux; Android 12) Cobalt/25.lts.30.1034943-gold (unlike Gecko) v8/8.8.278.8-jit gles Starboard/15, Google_ATV_arm_2022/STT1.230207.005 (Google, Chromecast, Wireless) com.google.android.youtube.tv/5.30.301',
  }),
  Object.freeze({
    id: 'tizen',
    label: 'Samsung Tizen TV',
    value: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36',
  }),
  Object.freeze({
    id: 'webos',
    label: 'LG webOS TV',
    value: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager',
  }),
]);

function tvUserAgent(id) {
  return TV_USER_AGENTS.find((item) => item.id === id) || TV_USER_AGENTS[0];
}

// Üst düzey gezinme yalnız YouTube ve Google hesap sayfalarında kalır; başka
// her adres (reklam tıklaması, dış bağlantı) sistem tarayıcısına devredilir.
const ALLOWED_TV_HOSTS = [/^(?:www\.|m\.)?youtube\.com$/i, /^accounts\.google\.com$/i, /^accounts\.youtube\.com$/i,
  /^(?:www\.)?google\.com$/i, /^consent\.youtube\.com$/i, /^consent\.google\.com$/i];

function isAllowedTvNavigation(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (url.protocol === 'about:' && url.href === 'about:blank') return true;
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return ALLOWED_TV_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch (_) { return false; }
}

// youtube.com/tv adresi masaüstü sitesine yönlendirildiyse TV kimliği reddedilmiştir.
function isTvAppUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    return /^(?:www\.)?youtube\.com$/i.test(url.hostname) && /^\/tv(?:\/|$)/.test(url.pathname);
  } catch (_) { return false; }
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// TV uygulaması durumu hash yönlendirmesinde tutar: /tv#/watch?v=ID&list=…
function videoIdFromTvUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (!isTvAppUrl(url.href)) return '';
    const hash = url.hash.replace(/^#/, '');
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const fromHash = /^\/?watch(?:\/|\?|$)/.test(hash) ? new URLSearchParams(query).get('v') : '';
    const candidate = fromHash || url.searchParams.get('v') || '';
    return VIDEO_ID.test(candidate) ? candidate : '';
  } catch (_) { return ''; }
}

function watchUrlFor(videoId, seconds = 0) {
  if (!VIDEO_ID.test(String(videoId || ''))) return '';
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  return `https://www.youtube.com/watch?v=${videoId}${t ? `&t=${t}s` : ''}`;
}

module.exports = {
  TV_START_URL, TV_PARTITION, TV_USER_AGENTS, tvUserAgent,
  isAllowedTvNavigation, isTvAppUrl, videoIdFromTvUrl, watchUrlFor,
};
