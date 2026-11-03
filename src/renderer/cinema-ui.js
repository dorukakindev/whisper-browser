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
  function icon(name) {
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
    b.setAttribute("aria-label", clean(item.title));
    b.dataset.homeItem = item.key || item.id || "";
    const a = art(item, "cn-poster-art");
    fallback(a, item.title);
    const rating = Number(item.rating || item.tmdbRating || item.ratings?.imdb);
    if (rating > 0) {
      const r = n("span", "cn-rating", rating.toFixed(1));
      r.prepend(icon("star"));
      a.append(r);
    }
    const p = progress?.(item);
    if (p?.duration && p.position) a.append(meter(p.percent));
    b.append(a, n("span", "cn-poster-title", clean(item.title)), n("span", "cn-poster-meta", [item.year, item.kind === "series" ? t("Series", "Dizi") : ""].filter(Boolean).join(" \xB7 ")));
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
    section.append(heading, rail.element);
    return { element: section, dispose: rail.dispose };
  }
  function home(host, opts) {
    const { items, continuing, progress, art, hasArtwork, play, details, page, addFolder } = opts, dispose = [];
    host.classList.add("cn-home-content");
    let candidates = continuing.filter(hasArtwork);
    if (!candidates.length) candidates = items.filter((i) => i.source && hasArtwork(i));
    let at = Math.max(0, candidates.findIndex((i) => (i.key || i.id) === opts.featuredKey));
    const hero = n("section", "cn-hero cn-home-hero"), inner = n("div", "cn-container cn-hero-content"), copy = n("div", "cn-hero-copy"), controls = n("div", "cn-hero-switch");
    inner.append(copy);
    hero.append(inner, controls);
    host.append(hero);
    function draw() {
      if (!candidates.length) {
        hero.hidden = true;
        return;
      }
      at = (at + candidates.length) % candidates.length;
      const item = candidates[at], p = progress(item);
      opts.onFeature(item.key || item.id);
      copy.replaceChildren(n("span", "cn-eyebrow", t("Continue your story", "Kald\u0131\u011F\u0131n yerden")), n("h1", "", clean(item.title)));
      const meta = n("div", "cn-meta");
      if (item.year) meta.append(n("span", "", item.year));
      if (p.duration) meta.append(n("span", "", opts.minutes(p.duration)));
      copy.append(meta, n("p", "cn-hero-description", item.synopsis || t("Your film, subtitles and voice tools, together.", "Filmin, altyaz\u0131lar\u0131n ve ses ara\xE7lar\u0131n bir arada.")));
      const buttons = n("div", "cn-hero-actions");
      buttons.append(action(p.resume ? t("Continue watching", "\u0130zlemeye devam et") : t("Open", "A\xE7"), () => play(item), "primary", "play"), action(item.id ? t("Details", "Ayr\u0131nt\u0131lar") : t("Add media folder", "Medya klas\xF6r\xFC ekle"), () => item.id ? details(item.id) : addFolder(), "ghost", item.id ? void 0 : "folder"));
      copy.append(buttons);
      if (p.duration) {
        const track = n("div", "cn-hero-progress");
        track.append(meter(p.percent), n("small", "", t(opts.minutes(Math.max(0, p.duration - p.position)) + " remaining", opts.minutes(Math.max(0, p.duration - p.position)) + " kald\u0131")));
        copy.append(track);
      }
      hero.querySelectorAll(":scope > .cn-hero-art").forEach((x) => x.remove());
      const a = art(item, "cn-hero-art", true);
      hero.prepend(a);
      hero.hidden = false;
      a.addEventListener("home-art-error", () => {
        if (!a.isConnected) return;
        candidates = candidates.filter((i) => i !== item);
        draw();
      }, { once: true });
      controls.replaceChildren(action(t("Previous title", "\xD6nceki i\xE7erik"), () => {
        at--;
        draw();
      }, "icon", "left"), n("span", "", `${at + 1} / ${candidates.length}`), action(t("Next title", "Sonraki i\xE7erik"), () => {
        at++;
        draw();
      }, "icon", "right"));
      controls.hidden = candidates.length < 2;
    }
    draw();
    const body = n("div", "cn-container cn-home-shelves");
    host.append(body);
    function add(title, rows, more, wide = false) {
      if (!rows.length) return;
      const r = shelf(title, rows, { art, progress, open: (i) => i.key ? play(i) : details(i.id), more, wide });
      body.append(r.element);
      dispose.push(r.dispose);
    }
    if (!candidates.length && !items.length && !continuing.length) {
      const empty = window.MediaVisual.empty({ title: t("Make room for your next story", "S\u0131radaki hik\xE2yene yer a\xE7"), text: t("Choose your media. Your films, progress and tools belong together.", "Medyan\u0131 se\xE7. Filmlerin, ilerlemen ve ara\xE7lar\u0131n bir araya gelsin."), actions: [action(t("Add media folder", "Medya klas\xF6r\xFC ekle"), addFolder, "primary", "folder")] });
      empty.classList.add("cn-empty");
      body.append(empty);
    }
    add(t("Continue watching & listening", "\u0130zlemeye ve dinlemeye devam et"), continuing, () => page("recent"), true);
    const daily = n("div", "cn-daily");
    window.MediaDailyUI?.entry(daily);
    body.append(daily);
    add(t("Your films", "Filmlerin"), items.filter((i) => i.kind !== "series"), () => page("films"));
    add(t("Your series", "Dizilerin"), items.filter((i) => i.kind === "series"), () => page("series"));
    return { dispose: () => dispose.forEach((fn) => fn()), body };
  }
  function facts(card, item, extra = {}) {
    card.replaceChildren();
    const pairs = [
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
    if (!card.hidden) {
      card.append(n("h2", "", t("Film credits", "Film k\xFCnyesi")), dl);
      if (extraFields.children.length) {
        more.append(n("summary", "", t("Production details", "Yap\u0131m ayr\u0131nt\u0131lar\u0131")), extraFields);
        card.append(more);
      }
    }
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
    const personal = oldCopy?.querySelector(".pm-panel"), advanced = n("details", "cn-accordion"), advancedBody = n("div", "cn-advanced-body");
    advanced.append(n("summary", "", t("Viewing & sources", "\u0130zleme ve kaynaklar")), advancedBody);
    advanced.open = !!viewState.advanced;
    advanced.addEventListener("toggle", () => {
      if (advanced.isConnected) viewState.advanced = advanced.open;
    });
    advanced.querySelector("summary").addEventListener("click", () => {
      viewState.advanced = !advanced.open;
    });
    const options = page.querySelector(".film-dossier-options");
    if (options) advancedBody.append(...[...options.children].filter((x) => x.tagName !== "SUMMARY"));
    for (const section of page.querySelectorAll(".fw-workspace,.daily-title,.mtd-related,.mtd-feed-sources")) advancedBody.append(section);
    if (personal) advancedBody.prepend(personal);
    const hero = n("section", "cn-hero cn-film-hero"), inner = n("div", "cn-container cn-film-hero-content"), copy = n("div", "cn-film-copy");
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
      inner.append(poster2);
    }
    if (item.originalTitle && item.originalTitle !== item.title) copy.append(n("p", "cn-original", item.originalTitle));
    const title = n("h1", "", clean(item.title));
    title.id = "mediaTitleHeading";
    copy.append(title);
    const meta = n("div", "cn-meta"), rating = item.rating || item.tmdbRating || item.ratings?.imdb;
    if (rating) {
      const r = n("span", "cn-score", `${item.tmdbRating ? "TMDB" : "IMDb"} ${Number(rating).toFixed(1)}`);
      r.prepend(icon("star"));
      meta.append(r);
    }
    for (const value of [item.year, item.runtime ? `${Math.floor(item.runtime / 60)} ${t("h", "sa")} ${item.runtime % 60} ${t("min", "dk")}` : "", (item.genres || []).slice(0, 3).join(" / ")]) if (value) meta.append(n("span", "", value));
    copy.append(meta);
    const description = item.tagline || item.synopsisTr || item.synopsis;
    if (description) copy.append(n("p", "cn-hero-description", description));
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
      actions.append(rebutton(reviewAction, "icon", "quote"));
      rest.splice(rest.indexOf(reviewAction), 1);
    }
    if (isDiscovery && personal) for (const [index, en, tr, symbol] of [[0, "Liked it", "Be\u011Fendim", "heart"], [1, "Not for me", "Bana g\xF6re de\u011Fil", "dislike"]]) actions.append(action(t(en, tr), () => {
      advanced.open = true;
      personal.querySelectorAll(".pm-actions>button")[index]?.click();
      personal.scrollIntoView({ block: "center" });
    }, "icon", symbol));
    actions.append(action(t("Ask about this film", "Bu filmi asistana sor"), () => window.api.showAssistant(), "icon", "chat"));
    if (manage) rest.push(manage);
    const plotToggle = page.querySelector(".film-plot-toggle");
    if (plotToggle) rest.push(plotToggle);
    if (window.AssistantFilmActions) rest.push(action(t("Compare films", "Filmleri kar\u015F\u0131la\u015Ft\u0131r"), () => window.AssistantFilmActions.openPicker(page.dataset.filmItemId), "ghost"));
    if (rest.length) {
      rest.forEach((b) => rebutton(b, "ghost"));
      const more = window.MediaVisual.overflow(rest);
      more.classList.add("cn-more");
      actions.append(more);
    }
    copy.append(actions);
    if (personal) {
      const summary = personal.querySelector(".pm-summary")?.textContent || t("My viewing", "\u0130zleme durumum");
      const pill = action(summary, () => {
        advanced.open = true;
        personal.scrollIntoView({ block: "center", behavior: "auto" });
        personal.querySelector("select")?.focus();
      }, "ghost", "down");
      pill.classList.add("cn-watch-pill");
      copy.append(pill);
      const obs = new MutationObserver(() => {
        const text = personal.querySelector(".pm-summary")?.textContent;
        if (text) {
          pill.querySelector("span").textContent = text;
          pill.setAttribute("aria-label", text);
          pill.title = text;
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
    if (story) {
      story.className = "cn-story";
      const h = story.querySelector("h2,h3");
      if (h) h.textContent = t("Story", "Hik\xE2ye");
      const heading = h?.parentElement;
      if (heading) heading.className = "cn-story-heading";
      story.querySelectorAll("button").forEach((b) => rebutton(b, "ghost"));
      const p = story.querySelector("p");
      if (p) p.className = "cn-story-text";
      overview.append(story);
    }
    overview.append(credits);
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
    body.append(advanced);
    const nav = n("nav", "cn-film-nav"), navInner = n("div", "cn-container");
    nav.setAttribute("aria-label", t("On this film page", "Film sayfas\u0131nda gezinme"));
    for (const [section, en, tr] of [[story, "Story", "Konu"], [cast, "Cast", "Oyuncular"], [review, "Reviews & analysis", "Yorumlar ve analiz"], [advanced, "Details", "Ayr\u0131nt\u0131lar"]]) if (section) {
      const b = action(t(en, tr), () => section.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), "ghost");
      navInner.append(b);
    }
    const copyLink = page.querySelector(".film-page-navigation button:nth-last-child(3)");
    if (copyLink && /copy|kopyala/i.test(copyLink.textContent)) navInner.append(rebutton(copyLink, "ghost", "link"));
    nav.append(navInner);
    page.className = "media-title-page cn-film-page";
    page.replaceChildren(hero, nav);
    if (status) {
      status.className = isDiscovery ? "md-status cn-status" : "cn-status";
      page.append(status);
    }
    page.append(body);
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
