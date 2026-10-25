(() => {
  "use strict";
  function mount(
    parent,
    {
      id,
      chapter,
      audio,
      prose,
      outputId,
      textHash,
      call,
      t,
      isCurrent,
      navigate,
      openText,
      activeId = "",
    },
  ) {
    const el = (tag, text) => {
      const n = document.createElement(tag);
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const root = el("section"),
      controls = el("div"),
      select = el("select"),
      save = el("button", t("Save passage bookmark", "Pasaj yer imi ekle")),
      remove = el("button", t("Remove bookmark", "Yer imini kaldır")),
      text = el("button", t("Open chapter text", "Bölüm metnini aç")),
      note = el("p"),
      quote = el("p");
    root.className = "mw-bookmarks";
    controls.className = "mw-actions";
    note.className = "mw-muted";
    quote.className = "mw-bookmark-quote";
    note.setAttribute("role", "status");
    select.setAttribute(
      "aria-label",
      t("Saved audio passages", "Sesli okuma yer imleri"),
    );
    for (const button of [save, remove, text]) {
      button.type = "button";
      button.className = "mh-action";
    }
    text.hidden = true;
    quote.hidden = true;
    controls.append(select, save, remove, text);
    root.append(controls, note, quote);
    parent.append(root);
    let busy = false,
      selected = null;
    const statusLabels = {
      "audio-remapped": t("New audio", "Ses yenilendi"),
      "audio-changed": t("Audio changed", "Ses değişti"),
      "text-changed": t("Text changed", "Metin değişti"),
      "source-changed": t("Source changed", "Kaynak değişti"),
      "missing-chapter": t("Chapter missing", "Bölüm yok"),
    };
    const update = () => {
      select.disabled = busy;
      save.disabled = busy;
      remove.disabled = busy || !select.value;
      text.disabled = busy || selected?.state === "missing-chapter";
    };
    const run = (fn) => async () => {
      if (busy || !isCurrent()) return;
      busy = true;
      update();
      try {
        await fn();
      } catch (e) {
        if (isCurrent()) note.textContent = e.message;
      } finally {
        busy = false;
        if (isCurrent()) update();
      }
    };
    async function refresh(value = "") {
      const result = await call("book-mark-list", { id });
      if (!isCurrent()) return;
      select.replaceChildren();
      const first = el(
        "option",
        t("Saved audio passages", "Sesli okuma yer imleri"),
      );
      first.value = "";
      select.append(first);
      for (const mark of result.bookmarks) {
        const seconds = Math.floor(mark.position),
          time =
            Math.floor(seconds / 60) +
            ":" +
            String(seconds % 60).padStart(2, "0");
        const option = el(
          "option",
          `${mark.chapter + 1} · ${time} · ${mark.quote.slice(0, 70)}${statusLabels[mark.state] ? " · " + statusLabels[mark.state] : ""}`,
        );
        option.value = mark.id;
        select.append(option);
      }
      select.value = value;
      update();
    }
    save.onclick = run(async () => {
      if (
        audio.readyState < 1 ||
        !Number.isFinite(audio.duration) ||
        !Number.isFinite(audio.currentTime)
      )
        throw Error(
          t("Wait for the audio to load.", "Sesin yüklenmesini bekle."),
        );
      const selection = window.getSelection();
      const excerpt =
        selection &&
        prose.contains(selection.anchorNode) &&
        prose.contains(selection.focusNode)
          ? selection.toString().slice(0, 1000)
          : "";
      const result = await call("book-mark-add", {
        id,
        chapter,
        position: audio.currentTime,
        outputId,
        textHash,
        quote: excerpt,
      });
      if (!isCurrent()) return;
      await refresh(result.bookmark.id);
      note.textContent = t(
        "Passage and audio position saved.",
        "Pasaj ve ses konumu kaydedildi.",
      );
    });
    remove.onclick = run(async () => {
      await call("book-mark-remove", { id, markId: select.value });
      if (!isCurrent()) return;
      selected = null;
      text.hidden = true;
      quote.hidden = true;
      await refresh();
      note.textContent = t("Bookmark removed.", "Yer imi kaldırıldı.");
    });
    select.onchange = run(async () => {
      if (!select.value) return;
      audio.pause();
      const result = await call("book-mark-open", { id, markId: select.value });
      if (!isCurrent()) return;
      selected = result.bookmark;
      if (["exact", "audio-remapped"].includes(selected.state)) {
        await navigate(selected);
        return;
      }
      note.textContent = t(
        "The text or audio changed. The old timestamp was not applied; open the chapter to review it.",
        "Metin veya ses değişti. Eski saniye uygulanmadı; incelemek için bölüm metnini aç.",
      );
      quote.textContent = selected.quote;
      quote.hidden = !selected.quote;
      text.hidden = false;
    });
    text.onclick = run(async () => {
      if (selected) await openText(selected.chapter);
    });
    update();
    void refresh(activeId).catch((e) => {
      if (isCurrent()) note.textContent = e.message;
    });
    return root;
  }
  window.BookBookmarksUI = Object.freeze({ mount });
})();
