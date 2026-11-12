(() => {
  "use strict";
  const t = (en, tr) => window.UiLocale?.get?.() === "tr" ? tr : en;
  const n = (tag, cls, text) => {
    const x = document.createElement(tag);
    x.className = cls || "";
    if (text !== void 0) x.textContent = String(text);
    return x;
  };
  const paths = { play: "M9 5l11 7-11 7Z", plus: "M12 5v14M5 12h14", heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z", dislike: "M10 15v5H7L3 10V3h12v12Zm5-12h5v10h-5", star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z", down: "m6 9 6 6 6-6", quote: "M4 7h6v6H6c0 3 1 4 3 5M14 7h6v6h-4c0 3 1 4 3 5", link: "M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4m12 0 2-2a4 4 0 0 1 6 6l-4 4" };
  Object.assign(paths, {audio:'M4 13V9a8 8 0 0 1 16 0v4M4 11H2v8h4v-8H4Zm16 0h2v8h-4v-8h2Z',book:'M4 3h14a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 13h16M8 3v13',rss:'M4 4a16 16 0 0 1 16 16M4 11a9 9 0 0 1 9 9M5 19h.01'});
  function icon(name) {
    if (["check", "like", "clock", "neutral"].includes(name)) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const path = document.createElementNS(svg.namespaceURI, "path");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.classList.add("mv-icon");
      path.setAttribute("d", {check:"M5 12l4 4L19 6",like:"M7 10v11H3V10h4Zm0 10h12l2-9h-6V5l-2-2-5 7",clock:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",neutral:"M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z"}[name]);
      svg.append(path);
      return svg;
    }
    if (!paths[name]) return window.MediaVisual.icon(name);
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"), p = document.createElementNS(s.namespaceURI, "path");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    p.setAttribute("d", paths[name]);
    s.append(p);
    return s;
  }
  function action(label, run, kind = "secondary", symbol) {
    const b = n("button", "cn-button");
    b.type = "button";
    b.dataset.kind = kind;
    b.title = label;
    b.setAttribute("aria-label", label);
    if (symbol) b.append(icon(symbol));
    if (kind !== "icon") b.append(n("span", "", label));
    b.addEventListener("click", () => Promise.resolve().then(run).catch((e) => {
      const status = b.closest(".media-title-page")?.querySelector("[role=status]") || document.getElementById("mhStatus");
      if (status) status.textContent = e.message;
    }));
    return b;
  }
  function rebutton(b, kind = "secondary", symbol) {
    if (!b) return b;
    const label = (b.textContent.trim() || b.getAttribute("aria-label") || "").replace(/^←\s*/, "");
    b.className = "cn-button";
    b.dataset.kind = kind;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.replaceChildren();
    if (symbol) b.append(icon(symbol));
    if (kind !== "icon") b.append(n("span", "", label));
    return b;
  }
  const clean = (value) => window.MediaVisual.title(value);
  const isWeb = (item) => /^(?:browser|youtube):/.test(item?.key || '') || ['browser', 'youtube'].includes(item?.type) || ['url', 'web', 'youtube', 'browser'].includes(item?.source?.type);
  // A web tab title such as "(3) YouTube" says nothing about the video; never present it as the video's name.
  const genericWebTitle = /^(?:youtube|web videosu|web video|untitled|başlıksız)?$/i;
  const titleOf = (item) => { const c = clean(item?.title); return isWeb(item) && genericWebTitle.test(String(c).trim()) ? t('Untitled web video', 'Başlıksız web videosu') : c; };
  const hostOf = (item) => {
    if (window.MediaHomeModel?.thumbnail(item)) return 'youtube.com';
    for (const value of [item?.url, item?.sourceRef, item?.key, item?.source?.value]) {
      if (typeof value !== 'string') continue;
      try { const u = new URL(value.replace(/^(?:browser|youtube):/, '')); if (/^https?:$/.test(u.protocol)) return u.hostname.replace(/^www\./, ''); } catch {}
    }
    return '';
  };
  const clock = (value) => { const s = Math.max(0, Math.floor(Number(value) || 0)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
  const ago = (stamp) => {
    const gap = Date.now() - Number(stamp); if (!stamp || !Number.isFinite(gap) || gap < 0) return '';
    const rtf = new Intl.RelativeTimeFormat(t('en', 'tr'), { numeric: 'auto' }), minutes = Math.max(1, Math.round(gap / 60000));
    if (minutes < 60) return rtf.format(-minutes, 'minute'); const hours = Math.round(minutes / 60); if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.round(hours / 24); return days < 31 ? rtf.format(-days, 'day') : '';
  };
  function fallback(host, title) {
    window.MediaVisual.art(host, title);
    host.querySelectorAll(":scope > svg,:scope > span:not(.mv-art-fallback)").forEach((x) => x.remove());
  }
  function meter(value) {
    const p = n("progress", "cn-progress");
    p.max = 100;
    p.value = value;
    return p;
  }
  function poster(item, { art, run, wide = false, progress } = {}) {
    const b = action("", run, "card");
    b.className = "cn-poster" + (wide ? " cn-wide" : "");
    b.setAttribute("aria-label", titleOf(item));
    b.dataset.homeItem = item.key || item.id || "";
    const a = art(item, "cn-poster-art");
    fallback(a, item.title);
    const web = isWeb(item);
    const youtube = item.type === 'youtube' || /^youtube:/.test(item.key || '') || !!window.MediaHomeModel?.thumbnail(item) || /(?:youtube\.com|youtu\.be)/i.test(item.source?.value || '');
    const source = youtube ? 'YouTube' : web ? 'Web' : t('Local', 'Yerel');
    const sourceMark = n('span', 'cn-source-mark');
    sourceMark.title = source;
    sourceMark.setAttribute('aria-label', source);
    sourceMark.append(icon(web || youtube ? 'media' : 'folder'));
    a.append(sourceMark);
    const rating = Number(item.rating || item.tmdbRating || item.ratings?.imdb);
    if (rating > 0) {
      const r = n("span", "cn-rating", window.MediaVisual.score(rating));
      r.prepend(icon("star"));
      a.append(r);
    }
    const p = progress?.(item);
    if (p?.duration && p.position) a.append(meter(p.percent));
    b.append(a, n("span", "cn-poster-title", titleOf(item)), n("span", "cn-poster-meta", [item.year, item.kind === "series" ? t("Series", "Dizi") : "", web && !item.year ? hostOf(item) : ""].filter(Boolean).join(" \xB7 ")));
    return b;
  }
  function shelf(title, rows, options) {
    const section = n("section", "cn-shelf"), heading = n("header", "cn-section-heading"), tools = n("div", "cn-heading-tools");
    heading.append(n("h2", "", title));
    if (options.more) tools.append(action(t("View all", "T\xFCm\xFCn\xFC g\xF6r"), options.more, "ghost"));
    heading.append(tools);
    const grid = n("div", "cn-poster-row");
    rows.slice(0, 12).forEach((item) => grid.append(poster(item, { ...options, run: () => options.open(item), wide: options.wide })));
    const rail = window.MediaVisual.rail(grid, title);
    tools.append(...rail.element.querySelectorAll(':scope > button'));
    section.append(heading, rail.element);
    return { element: section, dispose: rail.dispose };
  }
  function home(host, opts) {
    const { items, continuing, progress, art, hasArtwork, play, details, page, addFolder } = opts;
    const dispose = [], watch = opts.watch || continuing;
    host.classList.add("cn-home-content", "cv2-home");
    const key = item => item.key || item.id;
    const kind = item => window.MediaHomeModel?.medium(item) === 'web' ? 'web' : item.kind === 'series' ? 'series' : window.MediaHomeModel?.medium(item) === 'music' ? 'audio' : 'film';
    const kindLabel = item => ({web:t('Web video','Web videosu'),series:t('Series','Dizi'),audio:t('Audio','Ses'),film:t('Film','Film')})[kind(item)];
    const seen = new Set();
    const candidates = [...continuing, ...items.filter(item => item.source || hasArtwork(item))].filter(item => {
      if (seen.has(key(item))) return false;
      seen.add(key(item)); return true;
    });
    let at = Math.max(0, candidates.findIndex(item => key(item) === opts.featuredKey)), carousel;
    const hero = n('section','cn-hero cn-home-hero cv2-home-hero');
    const inner = n('div','cn-container cv2-home-inner'), copy = n('div','cn-hero-copy'), stage = n('div','cv2-home-stage');
    inner.append(copy,stage);hero.append(inner);host.append(hero);
    function draw() {
      carousel?.dispose();carousel=null;
      copy.replaceChildren();stage.replaceChildren();
      if (!candidates.length) {
        hero.classList.add('cv2-first-use');
        copy.append(n('span','cn-eyebrow',t('Your own cinema','Senin sineman')), n('h1','',t('Every story.\nOne place.','Her hikâye.\nTek bir yer.')), n('p','cn-hero-description',t('Films, web videos, listening and reading. Start with a source; keep its place, words and discoveries together.','Filmler, web videoları, dinlediklerin ve okudukların. Bir kaynakla başla; kaldığın yer, konuşmalar ve keşiflerin bir arada kalsın.')));
        const actions=n('div','cn-hero-actions');actions.append(action(t('Add media folder','Medya klasörü ekle'),addFolder,'primary','folder'), action(t('Explore titles','Yapımları keşfet'),()=>page('discover'),'ghost'));
        copy.append(actions);
        const sculpture=n('div','cv2-first-composition');sculpture.setAttribute('aria-hidden','true');
        for(const [index,label]of [t('Watch','İzle'),t('Listen','Dinle'),t('Discover','Keşfet')].entries()){const frame=n('div','cv2-first-frame',label);frame.style.setProperty('--frame',index);sculpture.append(frame);}
        stage.append(sculpture);return;
      }
      at=(at+candidates.length)%candidates.length;
      const item=candidates[at], p=progress(item);opts.onFeature?.(key(item));
      hero.dataset.medium=kind(item);
      const left=p.resume?ago(item.lastWatched):'';
      const eyebrow=n('span','cn-eyebrow', (p.resume?t('Continue your story','Kaldığın yerden'):t('From your library','Kütüphanenden'))+(left?' · '+left:''));
      const shown=titleOf(item),heading=n('h1','',shown);heading.title=shown;if(shown.length>55)heading.classList.add('cv2-title-long');
      const meta=n('div','cn-meta');
      // The kind and the real source are each named once; the stage bar below shows the host, not a third copy.
      const host=hostOf(item),source=kind(item)==='web'?(window.MediaHomeModel?.thumbnail(item)?'YouTube':host||'Web'):item.key||item.source?t('Local file','Yerel dosya'):t('In your library','Kütüphanende');
      for(const value of [kindLabel(item),source,item.year,p.duration?opts.minutes(p.duration):'',...(item.genres||[]).slice(0,2).map(window.MediaVisual.genre)])if(value)meta.append(n('span','',value));
      copy.append(eyebrow,heading,meta);
      if(item.synopsis)copy.append(n('p','cn-hero-description',item.synopsisTr||item.synopsis));
      if(p.duration){const track=n('div','cn-hero-progress');track.append(meter(p.percent),n('small','',(p.position?t('Left at ','Kaldığın yer ')+clock(p.position)+' · ':'')+opts.minutes(Math.max(0,p.duration-p.position))+' '+t('remaining','kaldı')));copy.append(track);}
      const actions=n('div','cn-hero-actions');
      actions.append(action(p.resume?t('Continue','Devam et'):!item.key&&!item.source?t('Open details','Ayrıntıları aç'):t('Play','Oynat'),()=>!item.key&&!item.source?details(item.id):play(item),'primary',!item.key&&!item.source?'media':'play'));
      if(item.id&&(item.key||item.source))actions.append(action(t('Details','Ayrıntılar'),()=>details(item.id),'ghost'));
      actions.append(action(t('Add media folder','Medya klasörü ekle'),addFolder,'ghost','folder'));copy.append(actions);
      const others=candidates.map((entry,index)=>({entry,index})).filter(row=>row.index!==at&&progress(row.entry).resume).slice(0,3);
      if(others.length){
        const next=n('nav','cv2-home-next'),row=n('div','cv2-next-row');next.setAttribute('aria-label',t('Also in progress','Devam eden diğerleri'));next.append(n('small','',t('Also in progress','Devam eden diğerleri')),row);
        for(const {entry} of others){const q=progress(entry),chip=action('',()=>entry.key||entry.source?play(entry):details(entry.id),'ghost');chip.replaceChildren();chip.className='cv2-next-chip';chip.title=titleOf(entry);chip.setAttribute('aria-label',titleOf(entry)+' · '+t('Left at ','Kaldığın yer ')+clock(q.position));chip.append(n('strong','',titleOf(entry)),n('small','',[clock(q.position),ago(entry.lastWatched)].filter(Boolean).join(' · ')),meter(q.percent));row.append(chip);}
        copy.append(next);
      }
      if(kind(item)==='web'){const bar=n('div','cv2-browser-chrome');bar.append(n('i'),n('i'),n('i'),n('span','',host||'Web'));stage.append(bar);}
      const image=art(item,'cn-hero-art cv2-home-art');fallback(image,shown);stage.append(image);
      if(window.CinemaMotion&&candidates.length>1)carousel=window.CinemaMotion.carousel(hero,{count:candidates.length,getIndex:()=>at,goTo:index=>{at=index;draw();}});
    }
    draw();dispose.push(()=>carousel?.dispose());
    const body=n('div','cn-container cn-home-shelves');host.append(body);
    const doors=n('nav','cv2-home-doors');doors.setAttribute('aria-label',t('Your media library','Medya kütüphanen'));
    for(const [route,en,tr,symbol,count]of [
      ['films','Films','Filmler','media',items.filter(i=>i.kind!=='series').length],['series','Series','Diziler','folder',items.filter(i=>i.kind==='series').length],
      ['web','Web videos','Web videoları','play',watch.filter(i=>kind(i)==='web').length],['radio','Podcast','Podcast','audio',null],['music','Music','Müzik','audio',null],['books','Books','Kitaplar','book',null],['feeds','Feeds (RSS)','Akışlar (RSS)','rss',null]
    ]){const door=action(t(en,tr),()=>page(route),'card');door.replaceChildren();door.className='cv2-home-door';door.append(icon(symbol),n('strong','',t(en,tr)),n('small','',count===null?t('Open your library','Kütüphaneni aç'):count+' '+t('items','kayıt')));doors.append(door);}
    const add=action(t('Add media','Medya ekle'),addFolder,'card','plus');add.replaceChildren(icon('plus'));add.className='cv2-home-door cv2-door-add';add.append(n('strong','',t('Add','Ekle')),n('small','',t('file · folder · source','dosya · klasör · kaynak')));doors.append(add);body.append(doors);
    function addShelf(title, rows, more, wide = false) {
      if(!rows.length)return;
      const view=shelf(title,rows,{art,progress,open:item=>item.key?play(item):details(item.id),more,wide});body.append(view.element);dispose.push(view.dispose);
    }
    addShelf(t('Continue watching & listening','İzlemeye ve dinlemeye devam et'),continuing,()=>page('recent'),true);
    const daily=n('div','cn-daily');window.MediaDailyUI?.entry(daily);body.append(daily);
    addShelf(t('Your films','Filmlerin'),items.filter(i=>i.kind!=='series'),()=>page('films'));
    addShelf(t('Your series','Dizilerin'),items.filter(i=>i.kind==='series'),()=>page('series'));
    addShelf(t('Your web notebook','Web defterin'),watch.filter(i=>kind(i)==='web').slice(0,12),()=>page('web'),true);
    const studio=n('section','cv2-home-studio'),text=n('div');text.append(n('span','cn-eyebrow',t('Studio','Stüdyo')),n('h2','',t('A closer look at every story.','Her hikâyeye daha yakından.')),n('p','',t('Read its words, listen in your language, keep your sources.','Konuşmaları oku, kendi dilinde dinle, kaynaklarını sakla.')));
    const tools=n('div','cv2-studio-actions');tools.append(action(t('Bilingual study','Çift dilli çalış'),()=>window.PodcastLinkUI.enter('bilingual'),'ghost','media'),action(t('Podcast view','Podcast görünümü'),()=>window.PodcastLinkUI.enter('podcast'),'ghost','audio'),action(t('Content network','İçerik Ağı'),()=>page('recall'),'ghost','link'));studio.append(text,tools);body.append(studio);
    return {dispose:()=>dispose.forEach(fn=>fn()),body};
  }
  function facts(card, item, extra = {}) {
    card.replaceChildren();
    const languageCode = extra.originalLanguage || item.originalLanguage;
    const originalLanguage = /^[a-z]{2}$/.test(languageCode || '')
      ? new Intl.DisplayNames([t("en", "tr")], { type: "language", fallback: "none" }).of(languageCode)
      : "";
    const pairs = [
      [t("Original language", "Özgün dil"), originalLanguage],
      [t("Director", "Y\xF6netmen"), item.directors],
      [t("Writer", "Senaryo"), extra.writers || item.writers],
      [t("Cinematography", "G\xF6r\xFCnt\xFC y\xF6netmeni"), extra.cinematographers || item.cinematographers],
      [t("Music", "M\xFCzik"), extra.composers || item.composers],
      [t("Production", "Yap\u0131m \u015Firketi"), extra.companies || item.productionCompanies],
      [t("Country", "\xDClke"), extra.countries || item.countries],
      [t("Language", "Dil"), extra.languages || item.languages],
      [t("Budget", "B\xFCt\xE7e"), extra.budget || item.budget]
    ];
    const dl = n("dl"), more = n("details", "cn-credits-more"), extraFields = n("dl");
    let count = 0;
    for (let [label, value] of pairs) {
      if (Array.isArray(value)) value = value.join(", ");
      if (typeof value === "number" && value > 0) value = new Intl.NumberFormat(t("en-US", "tr-TR"), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
      if (!value || typeof value !== "string") continue;
      const row = n("div");
      row.append(n("dt", "", label), n("dd", "", value));
      (count++ < 4 ? dl : extraFields).append(row);
    }
    card.hidden = !dl.children.length;
    card.dataset.creditCount = String(count);
    if (!card.hidden) {
      card.append(n("h2", "", t("Film credits", "Film k\xFCnyesi")), dl);
      if (extraFields.children.length) {
        more.append(n("summary", "", t("Production details", "Yap\u0131m ayr\u0131nt\u0131lar\u0131")), extraFields);
        card.append(more);
      }
    }
    if (card.isConnected) arrangeCredits(card.closest('.cn-film-page'));
  }
  function arrangeCredits(page) {
    if (!page) return;
    const card=page.querySelector('[data-cinema-credits]'),grid=page.querySelector('.cn-story-grid'),meta=page.querySelector('.cn-film-copy .cn-meta');
    if (!card||!meta) return;
    page.querySelector('.cn-credit-chips')?.remove();meta.querySelectorAll('.cn-credit-inline').forEach(x=>x.remove());
    const count = Number(card.dataset.creditCount);
    const sparse = count === 0 || (!page.querySelector('.cn-library-hero') && count < 3);
    grid?.classList.toggle('cn-sparse-credits',sparse);card.hidden=sparse;
    if(sparse&&Number(card.dataset.creditCount)){
      // Yönetmen vb. kutu/çip değil, üstteki meta satırında düz metin.
      for(const row of card.querySelectorAll('dl>div'))meta.append(n('span','cn-credit-inline',row.querySelector('dt').textContent+': '+row.querySelector('dd').textContent));
    }
  }
  function accordionRow(details,symbol,hint){
    if(!details)return;const summary=details.querySelector(':scope>summary');if(!summary||summary.dataset.cinemaHeading)return;
    summary.dataset.cinemaHeading='true';const label=n('span','cn-accordion-title');label.append(...summary.childNodes);const tail=n('span','cn-accordion-hint',hint);summary.replaceChildren(icon(symbol),label,tail,icon('down'));
  }
  const filmOwners = /* @__PURE__ */ new WeakMap();
  const filmViews = /* @__PURE__ */ new WeakMap();
  function film(page, item) {
    const viewState = filmViews.get(page) || {};
    filmViews.set(page, viewState);
    filmOwners.get(page)?.();
    const disposers = [];
    const dispose = () => {
      disposers.forEach((fn) => fn());
      page.removeEventListener("close", dispose);
      filmOwners.delete(page);
    };
    filmOwners.set(page, dispose);
    page.addEventListener("close", dispose, { once: true });
    const oldHero = page.querySelector(".mtd-hero,.md-page-hero");
    if (!oldHero) return;
    const isDiscovery = page.dataset.pageKind === "discovery", oldCopy = page.querySelector(".mtd-copy,.md-detail-copy"), oldActions = page.querySelector(".mtd-actions,.md-primary-actions");
    const primary = oldActions?.firstElementChild, poster2 = page.querySelector(".mtd-poster,.md-detail-poster"), backdrop = page.querySelector(".mtd-backdrop,.md-page-backdrop"), back = page.querySelector(".mtd-header button,.md-page-back"), manage = page.querySelector(".mtd-header button:nth-child(2)"), story = page.querySelector(".mtd-story,.md-page-story"), review = page.querySelector(".film-review-section"), cast = page.querySelector(".film-cast-scene"), extras = page.querySelector(".film-extra-section"), episodes = page.querySelector(".mtd-episodes"), status = page.querySelector(".mtd-status,.md-status");
    const navKey = isDiscovery ? page.dataset.filmNavigationPage==='stremio'?'stremio':"discover" : item.kind === "series" ? "series" : "films";
    const tabs = [...document.querySelectorAll("#mediaHome [data-home-page]")];
    const priorTabs = tabs.map(tab => tab.getAttribute("aria-current"));
    const tabValues = tabs.map(tab => tab.dataset.homePage === navKey ? "page" : "false");
    if (tabValues.includes("page")) {
      tabs.forEach((tab, i) => tab.setAttribute("aria-current", tabValues[i]));
      disposers.push(() => {
        if (tabs.every((tab, i) => tab.getAttribute("aria-current") === tabValues[i])) {
          tabs.forEach((tab, i) => priorTabs[i] === null ? tab.removeAttribute("aria-current") : tab.setAttribute("aria-current", priorTabs[i]));
        }
      });
    }
    const personalHost = page.querySelector(".md-personal-host"), personal = personalHost?.querySelector(".pm-panel") || oldCopy?.querySelector(".pm-panel"), basis = page.querySelector(".md-recommendation-basis"), membership = page.querySelector(".md-membership"), advanced = n("details", "cn-accordion"), advancedBody = n("div", "cn-advanced-body");
    advanced.append(n("summary", "", t("Viewing & sources", "\u0130zleme ve kaynaklar")), advancedBody);
    advanced.open = !!viewState.advanced;
    advanced.addEventListener("toggle", () => {
      if (advanced.isConnected) viewState.advanced = advanced.open;
    });
    advanced.querySelector("summary").addEventListener("click", event => {
      queueMicrotask(() => { if (advanced.isConnected && !event.defaultPrevented) viewState.advanced = advanced.open; });
    });
    const options = page.querySelector(".film-dossier-options,.md-detail-options");
    if (options) advancedBody.append(...[...options.children].filter((x) => x.tagName !== "SUMMARY"));
    if (isDiscovery) {
      const sourceCredits = page.querySelector(".md-page-aside > .md-option-group");
      if (sourceCredits) advancedBody.append(sourceCredits);
    }
    for (const section of page.querySelectorAll(".fw-workspace,.daily-title,.mtd-related,.mtd-feed-sources")) advancedBody.append(section);
    if (personal) advancedBody.prepend(personalHost || personal);
    const hero = n("section", "cn-hero cn-film-hero"), inner = n("div", "cn-container cn-film-hero-content"), copy = n("div", "cn-film-copy");
    if (!isDiscovery) {
      hero.classList.add("cn-library-hero");
      const hue = Array.from(item.title || "").reduce((hash, char) => (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0, 0) % 24 + 24;
      hero.style.setProperty("--cn-library-hue", hue);
      const reel = n("div", "cn-library-reel");
      reel.setAttribute("aria-hidden", "true");
      hero.prepend(reel);
      const observer = window.IntersectionObserver && new window.IntersectionObserver(([entry]) => {
        reel.classList.toggle("cn-reel-visible", entry.isIntersecting);
      });
      observer?.observe(hero);
      const visibility = () => reel.classList.toggle("cn-reel-hidden", document.hidden);
      document.addEventListener("visibilitychange", visibility);
      visibility();
      disposers.push(() => { observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); });
    }
    if (back) {
      rebutton(back, "ghost", "left");
      back.classList.add("cn-back");
      hero.append(back);
    }
    if (backdrop) {
      backdrop.className = "cn-hero-art";
      hero.prepend(backdrop);
    }
    if (poster2) {
      poster2.className = "cn-film-poster";
      fallback(poster2, item.title);
      if (!isDiscovery) {
        const mark = poster2.querySelector(".mv-art-fallback");
        if (mark) {
          const words = clean(item.title).split(/\s+/).filter(word => !/^(the|a|an)$/i.test(word));
          if (words.length) mark.textContent = words.slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase();
          if (item.year) mark.append(n("small", "cn-library-poster-year", item.year));
        }
      }
      inner.append(poster2);
    }
    if (!isDiscovery) copy.append(n("span", "cn-eyebrow", t("In your library", "Kütüphanende")));
    if (item.originalTitle && item.originalTitle !== item.title) copy.append(n("p", "cn-original", item.originalTitle));
    const title = n("h1", "", clean(item.title));
    if (!isDiscovery) {
      title.title = clean(item.title);
      if (Array.from(clean(item.title)).length > 36) title.classList.add("cn-title-long");
    }
    title.id = "mediaTitleHeading";
    copy.append(title);
    const meta = n("div", "cn-meta"), rating = window.MediaVisual.ratingOf(item);
    if (rating) {
      const r = n("span", "cn-score", `${rating.source} ${window.MediaVisual.score(rating.value)}`);
      r.prepend(icon("star"));
      meta.append(r);
    }
    for (const value of [item.year, item.runtime >= 60 ? `${Math.floor(item.runtime / 60)} ${t("h", "sa")} ${item.runtime % 60} ${t("min", "dk")}` : item.runtime > 0 ? `${item.runtime} ${t("min", "dk")}` : "", (item.genres || []).slice(0, 3).map(window.MediaVisual.genre).join(" / ")]) if (value) meta.append(n("span", "", value));
    if (isDiscovery && membership) meta.append(membership);
    copy.append(meta);
    const storyText = item.synopsisTr || item.synopsis;
    const description = isDiscovery
      ? (item.tagline?.trim() !== storyText?.trim() ? item.tagline : '')
      : item.tagline || storyText;
    const synopsis = description ? n("p", "cn-hero-description", description) : null;
    if (synopsis && !isDiscovery) copy.append(synopsis);
    const actions = n("div", "cn-hero-actions");
    if (primary) {
      rebutton(primary, "primary", isDiscovery ? "plus" : item.source || item.episodes?.some((e) => e.source) ? "play" : "folder");
      actions.append(primary);
    }
    const favorite = oldActions?.querySelector("[data-title-action=favorite]");
    if (favorite) actions.append(rebutton(favorite, "icon", "heart"));
    const rest = [...oldActions?.children || []].filter((x) => x !== primary && x !== favorite);
    const reviewAction = rest.find((x) => x.dataset.discoveryAction === "reviews");
    if (reviewAction) {
      // "Yorumlar ve analiz" alttaki sekmede zaten var; aksiyon satırında tekrarlanmaz.
      rest.splice(rest.indexOf(reviewAction), 1);
    }
    if (isDiscovery && personal) for (const [index, en, tr, symbol] of [[0, "Liked it", "Be\u011Fendim", "like"], [1, "Not for me", "Bana g\xF6re de\u011Fil", "dislike"]]) actions.append(action(t(en, tr), () => {
      advanced.open = true;
      personal.querySelectorAll(".pm-actions>button")[index]?.click();
      personal.scrollIntoView({ block: "center" });
    }, "icon", symbol));
    actions.append(action(t("Ask about this film", "Bu filmi asistana sor"), () => window.api.showAssistant(), "icon", "chat"));
    if (manage) rest.push(manage);
    if (!isDiscovery) {
      rest.push(...page.querySelectorAll(".mtd-aside > button"));
      const ratingForm = page.querySelector(".mtd-personal");
      if (ratingForm) advancedBody.append(ratingForm);
    }
    const plotToggle = page.querySelector(".film-plot-toggle");
    if (plotToggle) rest.push(plotToggle);
    if(!isDiscovery&&item.kind==='film'&&window.RecommendationHubUI&&/^tt\d{7,12}$/.test(item.imdbId||item.providerId||''))rest.push(action(t('Recommend similar','Benzerlerini öner'),()=>window.RecommendationHubUI.open({...item,providerId:item.imdbId||item.providerId}),'ghost'));
    if (window.AssistantFilmActions&&page.dataset.sourceOnly!=='true') rest.push(action(t("Compare films", "Filmleri kar\u015F\u0131la\u015Ft\u0131r"), () => window.AssistantFilmActions.openPicker(page.dataset.filmItemId), "ghost"));
    if (rest.length) {
      rest.forEach((b) => rebutton(b, "ghost"));
      const more = window.MediaVisual.overflow(rest);
      more.classList.add("cn-more");
      if (isDiscovery) actions.append(more);
      else {
        more.classList.add("cn-library-manage");
        const summary = more.querySelector("summary");
        summary.title = t("Manage title", "Yapımı yönet");
        summary.setAttribute("aria-label", summary.title);
        hero.append(more);
      }
    }
    copy.append(actions);
    if (isDiscovery) {
      if (basis) copy.append(basis);
      if (synopsis) copy.append(synopsis);
    }
    const copyPosition=page.querySelector(".cn-copy-position");if(copyPosition)copy.append(copyPosition);
    const resume = page.querySelector(".cn-library-resume");
    if (resume) copy.append(resume);
    if (personal) {
      const summary = personal.querySelector(".pm-summary")?.textContent || t("My viewing", "\u0130zleme durumum");
      const pill = action(summary, () => {
        advanced.open = true;
        personal.scrollIntoView({ block: "center", behavior: "auto" });
        (personal.querySelector('.cn-status-segments button[aria-pressed=true]')||personal.querySelector("select"))?.focus();
      }, "ghost", "down");
      pill.classList.add("cn-watch-pill");
      let libraryStatus;
      const updateStatusIcon = (trigger, value) => {
        const symbol = {completed:"check", planned:"clock", watching:"play"}[value] || "neutral";
        if (trigger.dataset.state === value) return;
        trigger.dataset.state = value;
        trigger.querySelector(".cn-status-check")?.remove();
        const mark = icon(symbol);
        mark.classList.add("cn-status-check");
        trigger.prepend(mark);
      };
      const select = personal.querySelector(".pm-watch select");
      if (!isDiscovery && select) {
        const choices = [...select.options].map(option => action(option.textContent, () => {
          const current = personal.querySelector(".pm-watch select");
          if (!current) return;
          current.value = option.value;
          current.dispatchEvent(new Event("change", { bubbles: true }));
          advanced.open = true;
          personal.scrollIntoView({ block: "center" });
        }, "ghost"));
        const menu = window.MediaVisual.overflow(choices, summary);
        menu.classList.add("cn-library-watch");
        const trigger = menu.querySelector("summary");
        const label = n("span", "", summary);
        trigger.replaceChildren(label, icon("down"));
        libraryStatus = { trigger, label };
        updateStatusIcon(trigger, select.value);
        copy.append(menu);
      } else copy.append(pill);
      const obs = new MutationObserver(() => {
        const text = personal.querySelector(".pm-summary")?.textContent;
        if (text) {
          pill.querySelector("span").textContent = text;
          pill.setAttribute("aria-label", text);
          pill.title = text;
          if (libraryStatus) {
            libraryStatus.label.textContent = text;
            libraryStatus.trigger.setAttribute("aria-label", text);
            libraryStatus.trigger.title = text;
            updateStatusIcon(libraryStatus.trigger, personal.querySelector(".pm-watch select")?.value || "unspecified");
          }
        }
      });
      obs.observe(personal, { subtree: true, childList: true, characterData: true });
      disposers.push(() => obs.disconnect());
    }
    inner.append(copy);
    hero.append(inner);
    const body = n("div", "cn-container cn-film-body"), overview = n("section", "cn-story-grid"), credits = n("aside", "cn-credits");
    credits.dataset.cinemaCredits = "";
    facts(credits, item);
    const updateCredits = event => facts(credits, item, { originalLanguage: event.detail });
    page.addEventListener("cinema-library-language", updateCredits);
    disposers.push(() => page.removeEventListener("cinema-library-language", updateCredits));
    if (story) {
      story.className = "cn-story";
      const h = story.querySelector("h2,h3");
      if (h) h.textContent = t("Story", "Hik\xE2ye");
      const heading = h?.parentElement;
      if (heading) heading.className = "cn-story-heading";
      story.querySelectorAll("button").forEach((b) => rebutton(b, "ghost"));
      const p = story.querySelector("p");
      if (p) p.className = "cn-story-text";
      const same=p&&p.textContent.trim()===String(description||'').trim();
      if(isDiscovery&&same&&p.textContent.trim().length<=95){
        p.className='cn-hero-description';copy.querySelector('.cn-hero-description')?.replaceWith(p);
        const storyActions=n('div','cn-inline-story-actions');for(const b of story.querySelectorAll('button'))storyActions.append(b);
        if(storyActions.children.length)copy.append(storyActions);story.hidden=true;
      }
      overview.append(story);
    }
    overview.append(credits);
    const source = page.querySelector(".cn-library-source");

    body.append(overview);
    if (cast) {
      cast.className = "cn-cast";
      cast.querySelector(".film-cast-heading").className = "cn-section-heading";
      cast.querySelector("h2").textContent = t("The faces of this story", "Bu hik\xE2yenin y\xFCzleri");
      const load = cast.querySelector("button");
      if (load) rebutton(load, "ghost");
      body.append(cast);
    }
    if (episodes) body.append(episodes);
    if (review) {
      review.classList.add("cn-audience");
      body.append(review);
    }
    if (extras) {
      extras.classList.add("cn-extras");
      body.append(extras);
    }
    const profile = review?.querySelector(".film-decision-profile");
    if (profile) {
      profile.classList.add("cn-accordion");
      body.append(profile);
    }
    const sources = n('section','cv2-film-sources');
    sources.append(n('h2','cn-section-heading',t('Sources & your viewing','Kaynak ve izleme durumun')));
    if (source) sources.append(source);
    sources.append(advanced);body.append(sources);
    const nav = n("nav", "cn-film-nav"), navInner = n("div", "cn-container");
    nav.setAttribute("aria-label", t("On this film page", "Film sayfas\u0131nda gezinme"));
    for (const [section, en, tr] of [[story, "Story", "Konu"], [cast, "Cast", "Oyuncular"], [review, "Reviews & analysis", "Yorumlar ve analiz"], [sources, "Sources & status", "Kaynak ve durum"], [extras, "Details", "Ayr\u0131nt\u0131lar"]]) if (section&&!section.hidden) {
      const b = action(t(en, tr), () => {
        if (section === sources) advanced.open = true;
        const stickyHeader = document.querySelector(".media-home .mh-header");
        if (stickyHeader) page.style.setProperty("--cv2-sticky-top", Math.ceil(stickyHeader.getBoundingClientRect().height) + "px");
        section.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }, "ghost");
      b.dataset.filmSection = '';
      b.addEventListener('click',()=>{navInner.querySelectorAll('[data-film-section]').forEach(node=>node.setAttribute('aria-current',String(node===b)));});
      navInner.append(b);
    }
    const copyLink = page.querySelector(".film-page-navigation button:nth-last-child(3)");
    if (copyLink && /copy|kopyala/i.test(copyLink.textContent)) navInner.append(rebutton(copyLink, "ghost", "link"));
    nav.append(navInner);
    page.className = "media-title-page cn-film-page cv2-film";
    const attribution = page.querySelector(".mtd-attribution");
    page.replaceChildren(hero, nav);
    if (status) {
      status.className = isDiscovery ? "md-status cn-status" : "cn-status";
      page.append(status);
    }
    page.append(body);
    if (attribution) body.append(attribution);
    arrangeCredits(page);
    accordionRow(advanced,'folder',t('Sources, viewing and your film journal','Kaynaklar, izleme ve film günlüğün'));
    accordionRow(profile,'heart',t('What stays with you; what to discover next','Sende kalanlar ve sıradaki keşiflerin'));
    const toolOwner=window.CinemaFilmTools?.mount(page,advancedBody,personal,actions);
    if(toolOwner)disposers.push(()=>toolOwner.dispose());
    const round4Owner=window.CinemaFilmRound4?.mount(page,advancedBody);
    if(round4Owner)disposers.push(()=>round4Owner.dispose());
    let shownProfile=profile;
    const syncProfile=()=>{
      const next=review?.querySelector('.film-decision-profile');
      if(next&&next!==shownProfile){shownProfile?.remove();shownProfile=next;next.classList.add('cn-accordion');advanced.before(next);}
      if(shownProfile)accordionRow(shownProfile,'heart',t('Genres and personal priorities','Türler ve kişisel önceliklerin'));
    };
    if(review){const watcher=new MutationObserver(syncProfile);watcher.observe(review,{childList:true,subtree:true});disposers.push(()=>watcher.disconnect());syncProfile();}
    page.dispatchEvent(new CustomEvent("cinema-film-ready", { detail: { item } }));
    const loader = cast?.querySelector("button");
    if (loader) queueMicrotask(() => {
      if (page.open && loader.isConnected) loader.click();
    });
  }
  function reviewSummary(parent, analysis, reviews) {
    const points = analysis.points || [], eligible = points.filter((p) => reviews.some((r) => r.id === p.id && !r.spoiler && r.text.includes(p.quote))), summary = n("section", "cn-analysis-summary"), lead = n("div", "cn-verdict"), insights = n("div", "cn-insights");
    lead.append(n("span", "cn-verdict-label", t("At a glance", "Bir bak\u0131\u015Fta")), n("h3", "", analysis.summary), n("p", "cn-analysis-count", reviews.length + " " + t("source reviews \xB7 selected sample", "kaynak yorum \xB7 se\xE7ili \xF6rnek")));
    const positive = eligible.filter((p) => p.kind === "praise").length, negative = eligible.filter((p) => p.kind === "criticism").length, total = positive + negative;
    if (total) {
      const split = Math.round(positive / total * 100), caption = n("div", "cn-sentiment-caption");
      caption.append(n("span", "", `${split}% ${t("praise", "\xF6vg\xFC")}`), n("span", "", `${100 - split}% ${t("criticism", "ele\u015Ftiri")}`));
      const bar = meter(split);
      bar.setAttribute("aria-label", t("Split of cited observations, not audience sentiment", "Al\u0131nt\u0131lanan g\xF6zlemlerin da\u011F\u0131l\u0131m\u0131; izleyici oylamas\u0131 de\u011Fildir"));
      lead.append(caption, bar, n("small", "", total + " " + t("cited observations, not an audience poll", "al\u0131nt\u0131lanan g\xF6zlem; izleyici anketi de\u011Fil")));
    }
    const topics = { story: t("Story", "Hik\xE2ye"), characters: t("Performances", "Oyunculuk"), pace: t("Pace", "Tempo"), visuals: t("Visual world", "G\xF6rsel d\xFCnya"), sound: t("Sound & music", "Ses ve m\xFCzik"), emotion: t("Emotion", "Duygu") };
    for (const p of eligible.slice(0, 3)) {
      const row = n("div"), copy = n("div");
      row.append(icon(p.kind === "criticism" ? "dislike" : "star"));
      copy.append(n("h4", "", topics[p.topic] || t("A viewer perspective", "Bir izleyicinin bak\u0131\u015F\u0131")));
      const text = n("p", "", p.reason);
      text.title = p.reason;
      copy.append(text);
      row.append(copy);
      insights.append(row);
    }
    summary.append(lead, insights);
    parent.prepend(summary);
    const cards = n("div", "cn-review-cards"), seen = /* @__PURE__ */ new Set();
    for (const p of eligible) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const r = reviews.find((r2) => r2.id === p.id), card = n("article", "cn-review-card"), header = n("header"), by = n("div"), meta = window.MediaToolsModel.reviewMetadata(r);
      by.append(n("strong", "", r.author || t("Unknown reviewer", "Yazar\u0131 belirtilmemi\u015F")), n("span", "cn-source-tag", "Letterboxd"));
      header.append(n("span", "cn-avatar", clean(r.author || "?").slice(0, 1)), by);
      if (meta.rating) header.append(n("span", "cn-review-rating", "\u2605 " + meta.rating + "/5"));
      const quote = n("blockquote", "", p.quote);
      quote.prepend(icon("quote"));
      const foot = n("footer"), jump = n("button", "cn-button mrv-source-jump", t("Read in context", "Yorumun i\xE7inde oku"));
      jump.type = "button";
      jump.dataset.reviewId = r.id;
      jump.dataset.quote = p.quote;
      foot.append(n("span", "", topics[p.topic] || t("Source review", "Kaynak yorum")), jump);
      card.append(header, quote, foot);
      cards.append(card);
      if (seen.size === 2) break;
    }
    if (cards.childElementCount) summary.after(cards);
    const full = n("details", "cn-accordion cn-analysis-full");
    full.append(n("summary", "", t("Full analysis & source evidence", "Tam analiz ve kaynak dayanaklar\u0131")));
    for (const node of [...parent.children]) if (node !== summary && node !== cards && !node.classList.contains("film-review-context")) full.append(node);
    parent.append(full);
  }
  window.CinemaUI = Object.freeze({ node: n, icon, action, rebutton, poster, shelf, home, film, facts, reviewSummary });
})();
