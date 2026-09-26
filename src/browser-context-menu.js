(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserContextMenu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Tarayıcı sayfası sağ tık menüsünün SAF modeli. main.js yalnız bu listeyi
  // Electron MenuItem'larına çevirip `id`'ye göre eylem bağlar; hangi öğenin
  // hangi bağlamda göründüğü ve etiketlerin dili burada, test edilebilir.
  //
  // Eskiden menü main.js'te sabit Türkçe bir şablondu: EN arayüzde de Türkçe
  // görünüyordu, bağlantıya/görsele sağ tıklayınca bile Geri/İleri/Yenile
  // listelenirdi, video için hiçbir öğe yoktu, yazım önerileri gösterilmezdi ve
  // "ara" her zaman Google'a giderdi.

  const LABELS = Object.freeze({
    tr: {
      back: 'Geri', forward: 'İleri', reload: 'Yenile', find: 'Sayfada bul',
      openLinkNewTab: 'Bağlantıyı yeni sekmede aç', copyLink: 'Bağlantı adresini kopyala',
      copyLinkMarkdown: 'Bağlantıyı Markdown olarak kopyala',
      openImageNewTab: 'Görseli yeni sekmede aç', saveImage: 'Görseli kaydet…',
      copyImage: 'Görseli kopyala', copyImageUrl: 'Görsel adresini kopyala',
      play: 'Oynat', pause: 'Duraklat', loop: 'Döngü', pip: 'Resim içinde resim',
      subtitles: 'Altyazı çıkar', copyMediaUrl: 'Medya adresini kopyala',
      searchSelection: (engine, text) => `${engine} ile ara: “${text}”`,
      translateSelection: 'Bu satırı çevir', copy: 'Kopyala', saveQuote: 'Alıntıyı notlara ekle',
      cut: 'Kes', paste: 'Yapıştır', selectAll: 'Tümünü seç',
      noSuggestions: 'Yazım önerisi yok', addToDictionary: 'Sözlüğe ekle',
    },
    en: {
      back: 'Back', forward: 'Forward', reload: 'Reload', find: 'Find in page',
      openLinkNewTab: 'Open link in new tab', copyLink: 'Copy link address',
      copyLinkMarkdown: 'Copy link as Markdown',
      openImageNewTab: 'Open image in new tab', saveImage: 'Save image…',
      copyImage: 'Copy image', copyImageUrl: 'Copy image address',
      play: 'Play', pause: 'Pause', loop: 'Loop', pip: 'Picture-in-picture',
      subtitles: 'Generate subtitles', copyMediaUrl: 'Copy media address',
      searchSelection: (engine, text) => `Search ${engine} for “${text}”`,
      translateSelection: 'Translate this line', copy: 'Copy', saveQuote: 'Add quote to notes',
      cut: 'Cut', paste: 'Paste', selectAll: 'Select all',
      noSuggestions: 'No spelling suggestions', addToDictionary: 'Add to dictionary',
    },
  });

  const MAX_SUGGESTIONS = 5;
  const SELECTION_PREVIEW = 32;

  function labelsFor(locale) {
    return locale === 'tr' ? LABELS.tr : LABELS.en;
  }

  function previewSelection(text) {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    return flat.length > SELECTION_PREVIEW ? `${flat.slice(0, SELECTION_PREVIEW - 1)}…` : flat;
  }

  function isWebUrl(value) {
    return /^https?:\/\//i.test(String(value || ''));
  }

  // Bitişik/baştaki/sondaki ayraçları sadeleştirir.
  function collapseSeparators(items) {
    const out = [];
    for (const item of items) {
      if (item.type === 'separator') {
        if (!out.length || out[out.length - 1].type === 'separator') continue;
      }
      out.push(item);
    }
    while (out.length && out[out.length - 1].type === 'separator') out.pop();
    return out;
  }

  /**
   * @param {object} input
   * @param {object} input.params  Electron 'context-menu' params
   * @param {boolean} input.canGoBack
   * @param {boolean} input.canGoForward
   * @param {boolean} [input.translateBusy]
   * @param {'tr'|'en'} [input.locale]
   * @param {string} [input.searchEngineLabel]
   * @returns {Array<{id?:string,type?:string,label?:string,enabled?:boolean,checked?:boolean,accelerator?:string,value?:string}>}
   */
  function buildBrowserContextMenuModel(input = {}) {
    const params = input.params || {};
    const L = labelsFor(input.locale);
    const selection = String(params.selectionText || '').trim();
    const editable = !!params.isEditable;
    const linkUrl = String(params.linkURL || '');
    const mediaType = String(params.mediaType || 'none');
    const srcUrl = String(params.srcURL || '');
    const image = mediaType === 'image' && !!srcUrl;
    const media = mediaType === 'video' || mediaType === 'audio';
    const flags = params.mediaFlags || {};
    const edit = params.editFlags || {};
    const items = [];
    const sep = () => items.push({ type: 'separator' });

    // Yazım denetimi: yalnız düzenlenebilir alanda ve yanlış yazılmış kelimede.
    const misspelled = editable ? String(params.misspelledWord || '').trim() : '';
    if (misspelled) {
      const suggestions = (Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : [])
        .map((word) => String(word || '').trim()).filter(Boolean).slice(0, MAX_SUGGESTIONS);
      if (suggestions.length) {
        for (const word of suggestions) items.push({ id: 'spell-replace', label: word, value: word });
      } else {
        items.push({ id: 'spell-none', label: L.noSuggestions, enabled: false });
      }
      items.push({ id: 'spell-add', label: L.addToDictionary, value: misspelled });
      sep();
    }

    if (linkUrl) {
      items.push({ id: 'open-link-new-tab', label: L.openLinkNewTab });
      items.push({ id: 'copy-link', label: L.copyLink });
      items.push({ id: 'copy-link-markdown', label: L.copyLinkMarkdown });
      sep();
    }

    if (image) {
      if (isWebUrl(srcUrl)) items.push({ id: 'open-image-new-tab', label: L.openImageNewTab });
      items.push({ id: 'save-image', label: L.saveImage });
      items.push({ id: 'copy-image', label: L.copyImage });
      items.push({ id: 'copy-image-url', label: L.copyImageUrl });
      sep();
    }

    if (media) {
      items.push({ id: 'media-play-pause', label: flags.isPaused === false ? L.pause : L.play });
      items.push({ id: 'media-loop', type: 'checkbox', label: L.loop,
        checked: !!flags.isLooping, enabled: flags.canLoop !== false });
      if (mediaType === 'video') {
        items.push({ id: 'media-pip', type: 'checkbox', label: L.pip,
          checked: !!flags.isShowingPictureInPicture,
          enabled: flags.canShowPictureInPicture !== false });
        items.push({ id: 'media-subtitles', label: L.subtitles });
      }
      if (isWebUrl(srcUrl)) items.push({ id: 'copy-media-url', label: L.copyMediaUrl });
      sep();
    }

    if (editable) {
      items.push({ id: 'cut', label: L.cut, enabled: !!edit.canCut });
      items.push({ id: 'copy', label: L.copy, enabled: !!edit.canCopy || !!selection });
      items.push({ id: 'paste', label: L.paste, enabled: !!edit.canPaste });
      items.push({ id: 'select-all', label: L.selectAll, enabled: edit.canSelectAll !== false });
      sep();
    } else if (selection) {
      items.push({ id: 'copy', label: L.copy });
      sep();
    }

    if (selection) {
      items.push({ id: 'search-selection',
        label: L.searchSelection(input.searchEngineLabel || 'Google', previewSelection(selection)) });
      if (!editable) {
        items.push({ id: 'translate-selection', label: L.translateSelection, enabled: !input.translateBusy });
        items.push({ id: 'save-quote', label: L.saveQuote });
      }
      sep();
    }

    // Gezinme yalnız sayfanın boş bir yerine tıklanınca (Chrome gibi): bağlantı,
    // görsel, medya, seçim veya yazı alanında gizli.
    const plainPage = !linkUrl && !image && !media && !selection && !editable;
    if (plainPage) {
      items.push({ id: 'back', label: L.back, enabled: !!input.canGoBack });
      items.push({ id: 'forward', label: L.forward, enabled: !!input.canGoForward });
      items.push({ id: 'reload', label: L.reload });
      sep();
      items.push({ id: 'find', label: L.find, accelerator: 'CmdOrCtrl+F' });
    }

    return collapseSeparators(items);
  }

  return { LABELS, buildBrowserContextMenuModel, previewSelection };
});
