(() => {
  "use strict";
  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    n.className = cls || "";
    if (text !== void 0) n.textContent = text;
    return n;
  };
  const paths = { search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", more: "M5 12h.01M12 12h.01M19 12h.01", folder: "M3 6h6l2 2h10v12H3V6Z", media: "M4 4h16v16H4zM9 8l7 4-7 4z", left: "M14 6l-6 6 6 6", right: "M10 6l6 6-6 6", close: "M6 6l12 12M18 6L6 18", chat: "M20 11a8 8 0 0 1-8 8H5l-3 2V11a9 9 0 0 1 18 0ZM7 10h8M7 14h5" };
  const tr = (en, turkish) => window.UiLocale?.get?.() === "tr" ? turkish : en;
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), path = document.createElementNS(svg.namespaceURI, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("mv-icon");
    path.setAttribute("d", paths[name] || paths.media);
    svg.append(path);
    return svg;
  }
  function title(value) {
    let s = String(value || "").trim().replace(/\s*[-–|]\s*YouTube\s*$/i, "").trim();
    if (/\.(?:mkv|mp4|webm|avi|mov|mp3|m4a|flac|wav|m4b|pdf|epub)$/i.test(s)) {
      s = s.split(/[\\/]/).pop().replace(/\.[^.]+$/, "").replace(/[._]+/g, " ");
    } else if (s.includes("_")) s = s.replace(/_+/g, " ");
    s = s.replace(/\s*[-–|]\s*YouTube\s*$/i, "").replace(/^\(\d+\)\s+(?=.{3})/, "").replace(/\s+/g, " ").trim();
    return s || tr("Untitled", "Ba\u015Fl\u0131ks\u0131z");
  }
  function button(el, variant = "secondary", symbol) {
    el.classList.add("mv-button");
    el.dataset.mvVariant = variant;
    if (symbol) {
      el.prepend(icon(symbol));
      if (variant === "icon") {
        el.title = el.getAttribute("aria-label") || el.textContent;
        el.setAttribute("aria-label", el.title);
      }
    }
    return el;
  }
  function art(host, value) {
    if (!host) return;
    const clean = title(value);
    host.classList.add("mv-art");
    let hash = 0;
    for (const c of clean) hash = hash * 31 + c.codePointAt(0) >>> 0;
    host.dataset.mvTone = String(hash % 4);
    host.style.setProperty("--mv-art-hue", String(24 + hash % 25));
    if (!host.querySelector(".mv-art-fallback")) {
      const words = clean.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) || [];
      const fallback = node("span", "mv-art-fallback", words.slice(0, 2).map((s) => Array.from(s)[0]).join("").toLocaleUpperCase());
      fallback.setAttribute("aria-hidden", "true");
      host.append(fallback);
    }
    if (!host.dataset.mvBound) {
      host.dataset.mvBound = "true";
      host.addEventListener("load", (e) => {
        if (e.target.tagName === "IMG") host.dataset.mvArtState = "ready";
      }, true);
      host.addEventListener("error", (e) => {
        if (e.target.tagName === "IMG") host.dataset.mvArtState = "missing";
      }, true);
      for (const name of ["home-art-ready", "home-art-error"]) host.addEventListener(name, () => {
        art(host, clean);
        host.dataset.mvArtState = name === "home-art-ready" ? "ready" : "missing";
      });
    }
    const img = host.querySelector("img");
    host.dataset.mvArtState = img ? img.complete && img.naturalWidth ? "ready" : "pending" : "missing";
  }
  function card(el, { title: value, wide = false } = {}) {
    el.classList.add("mv-card");
    el.classList.toggle("mv-card-wide", wide);
    const heading = el.querySelector(".mh-card-title");
    if (heading) heading.textContent = title(value ?? heading.textContent);
    art(el.querySelector(".mh-art"), value ?? heading?.textContent);
    return el;
  }
  function overflow(items, label = tr("More actions", "Di\u011Fer i\u015Flemler")) {
    const d = node("details", "mv-overflow"), s = node("summary");
    s.setAttribute("aria-label", label);
    s.title = label;
    s.append(icon("more"));
    const panel = node("div", "mv-overflow-panel");
    panel.setAttribute("aria-label", label);
    panel.append(...items);
    d.append(s, panel);
    return d;
  }
  document.addEventListener("pointerdown", (e) => {
    for (const d of document.querySelectorAll(".mv-overflow[open],.mv-filter[open]")) if (!d.contains(e.target)) d.open = false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const d = e.target.closest?.(".mv-overflow[open],.mv-filter[open]");
    if (d) {
      e.preventDefault();
      e.stopPropagation();
      d.open = false;
      d.querySelector("summary").focus();
    }
  });
  function empty({ title: heading, text, actions = [] }) {
    const n = node("section", "mv-empty"), copy = node("div", "mv-empty-copy"), mark = node("span", "mv-empty-icon");
    mark.append(icon("folder"));
    mark.setAttribute("aria-hidden", "true");
    copy.append(mark, node("h2", "", heading), node("p", "", text));
    if (actions.length) {
      const line = node("div", "mv-empty-actions");
      button(actions[0], "primary");
      line.append(actions[0]);
      if (actions.length > 1) line.append(overflow(actions.slice(1), tr("Other ways to add media", "Di\u011Fer medya ekleme yollar\u0131")));
      copy.append(line);
    }
    const preview = node("div", "mv-empty-preview");
    preview.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i++) {
      const tile = node("span", "mv-preview-poster");
      tile.append(icon("media"), node("i"));
      preview.append(tile);
    }
    n.append(copy, preview);
    return n;
  }
  function sectionHeading(el) {
    el.classList.add("mv-section-heading");
    return el;
  }
  function rail(grid, label) {
    const wrap = node("div", "mv-rail"), previous = node("button", "mv-rail-prev"), next = node("button", "mv-rail-next");
    previous.type = next.type = "button";
    previous.setAttribute("aria-label", label + " \xB7 " + tr("Previous", "\xD6nceki"));
    next.setAttribute("aria-label", label + " \xB7 " + tr("Next", "Sonraki"));
    previous.append(icon("left"));
    next.append(icon("right"));
    grid.tabIndex = 0;
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", label);
    wrap.append(grid, previous, next);
    const lifetime = new AbortController();
    let observer, disposed = false;
    const update = () => {
      if (disposed || !grid.isConnected) return;
      const max = Math.max(0, grid.scrollWidth - grid.clientWidth);
      previous.hidden = grid.scrollLeft <= 2;
      next.hidden = grid.scrollLeft >= max - 2;
      wrap.dataset.more = String(max > 2);
    };
    previous.onclick = () => grid.scrollBy({ left: -grid.clientWidth * 0.8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    next.onclick = () => grid.scrollBy({ left: grid.clientWidth * 0.8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    grid.addEventListener("scroll", update, { passive: true, signal: lifetime.signal });
    queueMicrotask(() => {
      if (disposed || !grid.isConnected) return;
      observer = new ResizeObserver(update);
      observer.observe(grid);
      update();
    });
    return { element: wrap, dispose: () => {
      disposed = true;
      lifetime.abort();
      observer?.disconnect();
    } };
  }
  function filter(field) {
    const input = field.querySelector("select");
    if (!input) return field;
    const d = node("details", "mv-filter"), s = node("summary");
    const label = field.querySelector("span")?.textContent || "";
    s.append(document.createTextNode(label + " \xB7 " + (input.selectedOptions[0]?.textContent || "")));
    s.dataset.discoveryFocus = label;
    s.setAttribute("aria-label", label + " \xB7 " + (input.selectedOptions[0]?.textContent || ""));
    s.onclick = (e) => {
      if (input.disabled) e.preventDefault();
    };
    const panel = node("div", "mv-filter-panel");
    panel.append(field);
    d.append(s, panel);
    return d;
  }
  // Shared display formatting: Home, Discover and the film page show a rating the same way.
  function score(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "";
    const text = number.toFixed(1);
    return tr(text, text.replace(".", ","));
  }
  // A rating together with the source it came from, so a label can never describe another number.
  function ratingOf(item) {
    const imdb = Number(item?.rating), tmdb = Number(item?.tmdbRating), listed = Number(item?.ratings?.imdb);
    if (Number.isFinite(imdb) && imdb > 0) return { source: "IMDb", value: imdb };
    if (Number.isFinite(tmdb) && tmdb > 0) return { source: "TMDB", value: tmdb };
    if (Number.isFinite(listed) && listed > 0) return { source: "IMDb", value: listed };
    return null;
  }
  const genreNames = { Action: "Aksiyon", Adventure: "Macera", Animation: "Animasyon", Biography: "Biyografi", Comedy: "Komedi", Crime: "Suç", Documentary: "Belgesel", Drama: "Dram", Family: "Aile", Fantasy: "Fantastik", History: "Tarih", Horror: "Korku", Music: "Müzik", Musical: "Müzikal", Mystery: "Gizem", Romance: "Romantik", "Sci-Fi": "Bilim kurgu", Short: "Kısa film", Sport: "Spor", Thriller: "Gerilim", War: "Savaş", Western: "Vahşi Batı" };
  const genre = (value) => tr(value, genreNames[value] || value);
  window.MediaVisual = Object.freeze({ icon, title, button, art, card, empty, overflow, sectionHeading, rail, filter, score, ratingOf, genre });
})();
