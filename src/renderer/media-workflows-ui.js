(() => {
  "use strict";
  const t = (en, tr) => (window.UiLocale?.get?.() === "tr" ? tr : en);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = String(text);
    return n;
  };
  const call = async (action, data = {}) => {
    const r = await window.api.mediaWorkflows({
      action,
      locale: window.UiLocale?.get?.(),
      ...data,
    });
    if (!r?.ok)
      throw Error(r?.error || t("Operation failed.", "İşlem başarısız."));
    return r;
  };
  let dialog,
    project,
    chapter = 0,
    job = null,
    selected = new Set(),
    busy = false,
    token = "",
    results = [];
  const voicePrefs = {
    profile: "quality",
    concurrency: 4,
    verification: "detailed",
  };
  function ask({
    title,
    description = "",
    inputLabel = "",
    inputValue = "",
    confirmLabel,
  }) {
    return new Promise((resolve) => {
      const d = el("dialog", "mw-confirm media-surface"),
        form = el("form"),
        h = el("h2", "", title),
        p = el("p", "", description),
        input = el("input"),
        actions = el("div", "mw-actions");
      form.method = "dialog";
      input.value = inputValue;
      input.maxLength = 300;
      let value = false;
      const cancel = el("button", "mh-action", t("Cancel", "Vazgeç")),
        ok = el(
          "button",
          "mh-action mh-primary",
          confirmLabel || t("Confirm", "Onayla"),
        );
      cancel.type = "button";
      cancel.onclick = () => d.close();
      ok.type = "submit";
      form.onsubmit = (e) => {
        e.preventDefault();
        value = inputLabel ? input.value : true;
        d.close();
      };
      form.append(h, p);
      if (inputLabel) {
        const label = el("label", "mw-setting", inputLabel);
        label.append(input);
        form.append(label);
      }
      actions.append(cancel, ok);
      form.append(actions);
      d.append(form);
      d.onclose = () => {
        d.remove();
        void syncBrowserOcclusion();
        resolve(value);
      };
      document.body.append(d);
      d.showModal();
      void syncBrowserOcclusion();
      (inputLabel ? input : cancel).focus();
    });
  }
  const drafts = new Map();
  let saveRequest = 0,
    readerRequest = 0,
    stopReviewPreview = null,
    stopTakePreview = null;
  let prefsProject = null;
  function status(message) {
    const node = dialog?.querySelector(".mw-status");
    if (node) node.textContent = message;
  }
  function button(text, fn, primary = false) {
    const n = el("button", "mh-action" + (primary ? " mh-primary" : ""), text);
    n.type = "button";
    n.onclick = async () => {
      n.disabled = true;
      try {
        await fn();
      } catch (e) {
        status(e.message);
      } finally {
        if (n.isConnected) n.disabled = false;
      }
    };
    return n;
  }
  function clearBody() {
    stopTakePreview?.();
    stopTakePreview = null;
    stopReviewPreview?.();
    stopReviewPreview = null;
    for (const a of dialog.querySelectorAll("audio")) a.pause();
    void closeReader();
    const body = dialog.querySelector(".mw-body");
    body.replaceChildren();
    return body;
  }
  function saveSelection() {
    if (project)
      void call("book-selection", {
        id: project.id,
        chapters: [...selected],
      }).catch((e) => status(e.message));
  }
  function saveDraft() {
    const input = dialog?.querySelector("textarea[data-chapter]");
    if (project && input && input.dataset.projectId === project.id) {
      const index = Number(input.dataset.chapter);
      if (
        Number.isInteger(index) &&
        index >= 0 &&
        index < project.chapters.length
      )
        drafts.set(`${project.id}:${index}`, input.value);
    }
  }
  async function saveChapter() {
    saveDraft();
    if (!project) return;
    const original = project,
      projectId = project.id,
      index = chapter;
    const key = `${projectId}:${index}`,
      text = drafts.get(key),
      input = dialog?.querySelector("textarea[data-chapter]");
    if (text !== undefined) {
      const request = ++saveRequest;
      const r = await call("book-save", {
        id: projectId,
        chapter: index,
        text,
      });
      if (project === original && request === saveRequest) project = r.project;
      // Typing or changing chapters while IPC is pending must not delete the new draft.
      if (input?.isConnected && input.value !== text)
        drafts.set(key, input.value);
      else if (drafts.get(key) === text) drafts.delete(key);
    }
  }
  function bookContext(index, text, offset = 0, selectedText = "") {
    const c = project?.chapters[index];
    if (!c || !dialog?.open) return;
    window.MediaExperience?.setContext(dialog, {
      id: `${project.id}:${index}`,
      type: "book-chapter",
      title: project.title,
      chapter: c.title,
      selectedText,
      excerpt: String(text || "").slice(
        Math.max(0, offset - 1500),
        Math.max(0, offset - 1500) + 8000,
      ),
    });
  }
  function mountBookSearch(parent) {
    const ownerId = project.id,
      box = el("section", "mw-book-search"),
      form = el("form", "mw-search-form"),
      input = el("input"),
      submit = el("button", "mh-action", t("Find passage", "Metin bul")),
      summary = el("p", "mw-muted"),
      results = el("div", "mw-search-results");
    input.type = "search";
    input.maxLength = 160;
    input.placeholder = t("Search all chapters…", "Bütün bölümlerde ara…");
    input.setAttribute(
      "aria-label",
      t("Search book text", "Kitap metninde ara"),
    );
    submit.type = "submit";
    summary.setAttribute("role", "status");
    results.setAttribute("aria-label", t("Search results", "Arama sonuçları"));
    form.append(input, submit);
    box.append(form, summary, results);
    parent.append(box);
    let sequence = 0;
    input.oninput = () => {
      sequence++;
      results.replaceChildren();
      summary.textContent = "";
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const request = ++sequence;
      saveDraft();
      results.replaceChildren();
      if (input.value.trim().length < 2) {
        summary.textContent = t(
          "Enter at least two characters.",
          "En az iki karakter yaz.",
        );
        return;
      }
      summary.textContent = t("Searching…", "Aranıyor…");
      const valid = () =>
        request === sequence && box.isConnected && project?.id === ownerId;
      const chapters = project.chapters.map((c, i) => ({
        ...c,
        text: drafts.get(`${ownerId}:${i}`) ?? c.text,
      }));
      const found = await window.BookTextSearch.search(chapters, input.value, {
        isCurrent: valid,
      });
      if (!valid() || found.cancelled) return;
      summary.textContent = found.matches.length
        ? `${found.matches.length}${found.truncated ? "+" : ""} ` +
          t(
            "matches. Open a result in the text editor.",
            "eşleşme. Sonucu metin düzenleyicide aç.",
          )
        : t("No matches.", "Eşleşme yok.");
      for (const hit of found.matches) {
        const c = chapters[hit.chapter],
          row = button(c.title + " — " + hit.excerpt, async () => {
            if (!valid()) return;
            const latest =
              drafts.get(`${ownerId}:${hit.chapter}`) ??
              project.chapters[hit.chapter].text;
            if (latest !== c.text) {
              status(
                t("Text changed; search again.", "Metin değişti; yeniden ara."),
              );
              return;
            }
            await saveChapter();
            if (project?.id !== ownerId) return;
            chapter = hit.chapter;
            await books();
            if (project?.id !== ownerId) return;
            const text = dialog?.querySelector("textarea[data-chapter]");
            if (!text) return;
            if (text.value !== c.text) {
              status(
                t("Text changed; search again.", "Metin değişti; yeniden ara."),
              );
              return;
            }
            text.focus();
            text.setSelectionRange(hit.start, hit.end);
            text.scrollIntoView({ block: "center" });
            bookContext(hit.chapter, text.value, hit.start);
          });
        row.classList.add("mw-search-hit");
        results.append(row);
      }
    };
  }
  async function books() {
    if (project && prefsProject !== project.id) {
      Object.assign(
        voicePrefs,
        {
          profile: "quality",
          concurrency: 4,
          verification: "detailed",
          referenceId: "",
        },
        project.voicePreferences || {},
      );
      prefsProject = project.id;
    }
    saveDraft();
    const body = clearBody();
    const actions = el("div", "mw-actions");
    const management = el("details", "mw-management"),
      managementBody = el("div", "mw-management-body");
    management.append(
      el("summary", "", t("Project & backup tools", "Proje ve yedek araçları")),
      managementBody,
    );
    actions.append(
      button(
        t("Import EPUB / PDF / TXT", "EPUB / PDF / TXT ekle"),
        async () => {
          if (busy) throw Error("Busy / Meşgul");
          await saveChapter();
          const r = await call("book-import");
          if (r.project) {
            project = r.project;
            chapter = 0;
            selected = new Set(project.selectedChapters || [0]);
            await books();
          }
        },
        true,
      ),
    );
    const backupAudio = el("input");
    backupAudio.type = "checkbox";
    const backupLabel = el(
      "label",
      "mw-setting",
      t(
        "Include generated audio in book backup (up to 256 MiB)",
        "Kitap yedeğine üretilen sesleri dahil et (en fazla 256 MiB)",
      ),
    );
    backupLabel.prepend(backupAudio);
    managementBody.append(
      el(
        "p",
        "mw-muted",
        t(
          "Book backup includes edited text and optional generated audio. Original books, reference voices and account keys are excluded.",
          "Kitap yedeği düzenlenmiş metinleri ve isteğe bağlı üretilen sesleri içerir. Özgün kitaplar, referans sesleri ve hesap anahtarları dahil değildir.",
        ),
      ),
      backupLabel,
      button(
        t("Back up book projects", "Kitap projelerini yedekle"),
        async () => {
          const r = await call("book-backup", {
            includeAudio: backupAudio.checked,
          });
          if (!r.canceled)
            status(
              t(
                "Book projects backed up. Original PDFs/EPUBs and reference voices are not included.",
                "Kitap projeleri yedeklendi. Özgün PDF/EPUB ve referans sesleri dahil değildir.",
              ),
            );
        },
      ),
      button(
        t("Restore book backup", "Kitap yedeğini geri yükle"),
        async () => {
          const r = await call("book-restore");
          if (!r.canceled) {
            await books();
            status(
              `${r.count} ` +
                t(
                  "projects restored as new copies.",
                  "proje yeni kopya olarak geri yüklendi.",
                ),
            );
          }
        },
      ),
    );
    const listing = await call("book-list");
    if (!dialog?.open) return;
    const choose = el("select");
    choose.setAttribute(
      "aria-label",
      t("Saved book projects", "Kayıtlı kitap projeleri"),
    );
    const placeholder = el("option", "", t("Choose a project", "Proje seç"));
    placeholder.value = "";
    choose.append(placeholder);
    for (const row of listing.projects) {
      const option = el("option", "", row.title);
      option.value = row.id;
      choose.append(option);
    }
    choose.value = project?.id || "";
    choose.disabled = busy;
    choose.onchange = async () => {
      try {
        if (busy) throw Error("Busy / Meşgul");
        await saveChapter();
        project = (await call("book-open", { id: choose.value })).project;
        chapter = 0;
        selected = new Set(project.selectedChapters || [0]);
        await books();
      } catch (e) {
        status(e.message);
      }
    };
    actions.append(choose, management);
    managementBody.append(
      button(t("Archived projects", "Arşivlenmiş projeler"), async () => {
        const r = await call("book-list", { archived: true }),
          archived = r.projects.filter((p) => p.archived);
        managementBody.querySelector(".mw-archived")?.remove();
        const list = el("div", "mw-archived");
        if (!archived.length)
          list.append(
            el(
              "p",
              "mw-muted",
              t("No archived projects.", "Arşivlenmiş proje yok."),
            ),
          );
        for (const p of archived) {
          const row = el("div", "mw-actions");
          row.append(
            el("span", "", p.title),
            button(t("Restore", "Geri al"), async () => {
              await call("book-archive", { id: p.id, archived: false });
              await books();
            }),
          );
          list.append(row);
        }
        managementBody.append(list);
      }),
    );
    body.append(actions);
    if (!project) {
      body.append(
        el(
          "p",
          "mw-muted",
          t(
            "Choose chapters, review their text, and narrate with your saved VoxCPM2 voice. Your original book stays unchanged.",
            "Bölümleri seç, metni gözden geçir ve kayıtlı VoxCPM2 sesinle okut. Özgün kitap değişmez.",
          ),
        ),
      );
      return;
    }
    const summary = el("section", "mw-summary"),
      bookCopy = el("div");
    bookCopy.append(
      el("h2", "", project.title),
      el(
        "p",
        "mw-muted",
        [
          project.author,
          `${project.chapters.length} ${t("chapters", "bölüm")}`,
          `${project.chapters.filter((c) => c.status === "ready").length} ${t("ready", "hazır")}`,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    const projectActions = el("div", "mw-actions");
    projectActions.append(
      button(t("Rename project", "Projeyi yeniden adlandır"), async () => {
        const name = await ask({
          title: t("Project name", "Proje adı"),
          inputLabel: t("Name", "Ad"),
          inputValue: project.title,
          confirmLabel: t("Save", "Kaydet"),
        });
        if (name !== false) {
          project = (await call("book-rename", { id: project.id, title: name }))
            .project;
          await books();
        }
      }),
      button(
        t("Check interrupted production", "Yarım üretimi denetle"),
        async () => {
          const r = await call("book-recover", { id: project.id });
          project = r.project;
          await books();
          status(
            `${r.recovered} ` +
              t("outputs recovered. ", "çıktı kurtarıldı. ") +
              r.notices.join(" · "),
          );
        },
      ),
      button(t("Archive project", "Projeyi arşivle"), async () => {
        if (
          await ask({
            title: t("Archive project?", "Proje arşivlensin mi?"),
            description: t(
              "Files are kept. The project can be restored from the archive.",
              "Dosyalar korunur; arşivden geri alınabilir.",
            ),
            confirmLabel: t("Archive", "Arşivle"),
          })
        ) {
          await call("book-archive", { id: project.id });
          project = null;
          await books();
        }
      }),
    );
    if (project.shelfBookId)
      projectActions.append(
        button(t("Open book library", "Kitap rafını aç"), () => {
          dialog.close();
          void window.MediaHomeUI.returnHome();
          document.querySelector('[data-home-mode="books"]')?.click();
        }),
      );
    managementBody.append(projectActions);
    if (
      typeof project.cover === "string" &&
      project.cover.length <= 350000 &&
      /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(
        project.cover,
      )
    ) {
      const cover = el("img", "mw-book-cover");
      cover.src = project.cover;
      cover.alt = "";
      cover.onerror = () => cover.remove();
      summary.append(cover);
    }
    summary.append(bookCopy);
    body.append(summary);
    const settings = el("details", "mw-voice-settings"),
      settingsTitle = el(
        "summary",
        "",
        t("Voice & production settings", "Ses ve üretim ayarları"),
      );
    settings.append(settingsTitle);
    const settingsBody = el("div", "mw-actions");
    const config = await window.api.dubConfig();
    let defaultReferenceName =
      config.reference?.split(/[\\/]/).pop() || t("Not selected", "Seçilmedi");
    const defaultLabel = () =>
      t("App default: ", "Uygulama varsayılanı: ") + defaultReferenceName;
    const referenceName = el(
      "span",
      "mw-muted",
      voicePrefs.referenceId
        ? t("Book voice: saved reference", "Bu kitabın sesi: kayıtlı referans")
        : defaultLabel(),
    );
    settingsBody.append(
      referenceName,
      button(
        t("Change app default voice", "Uygulama varsayılan sesini değiştir"),
        async () => {
          if (busy) throw Error("Busy / Meşgul");
          const r = await window.api.dubConfig("reference");
          if (r.ok) {
            defaultReferenceName = r.reference.split(/[\\/]/).pop();
            if (!voicePrefs.referenceId)
              referenceName.textContent = defaultLabel();
            status(
              t(
                "App default voice updated.",
                "Uygulama varsayılan sesi güncellendi.",
              ),
            );
          }
        },
      ),
    );
    const references = await window.api.listVoiceReferences().catch(() => null);
    if (references?.ok) {
      const saved = el("select");
      saved.setAttribute(
        "aria-label",
        t("Saved reference voices", "Kayıtlı referans sesler"),
      );
      const first = el(
        "option",
        "",
        t("Use app default voice", "Uygulama varsayılan sesini kullan"),
      );
      first.value = "";
      saved.append(first);
      for (const ref of references.references) {
        const o = el("option", "", ref.name || ref.id);
        o.value = ref.id;
        saved.append(o);
      }
      if (
        voicePrefs.referenceId &&
        !references.references.some((ref) => ref.id === voicePrefs.referenceId)
      ) {
        const missing = el(
          "option",
          "",
          t("Saved voice unavailable", "Kayıtlı ses bulunamadı"),
        );
        missing.value = voicePrefs.referenceId;
        saved.append(missing);
      }
      saved.value = voicePrefs.referenceId || "";
      if (voicePrefs.referenceId)
        referenceName.textContent =
          t("Book voice: ", "Bu kitabın sesi: ") +
          saved.selectedOptions[0].textContent;
      saved.onchange = async () => {
        const previous = voicePrefs.referenceId || "";
        try {
          if (busy) throw Error("Busy / Meşgul");
          await call("book-preferences", {
            id: project.id,
            preferences: { ...voicePrefs, referenceId: saved.value },
          });
          voicePrefs.referenceId = saved.value;
          referenceName.textContent = saved.value
            ? t("Book voice: ", "Bu kitabın sesi: ") +
              saved.selectedOptions[0].textContent
            : defaultLabel();
        } catch (e) {
          saved.value = previous;
          status(e.message);
        }
      };
      settingsBody.append(saved);
    }
    settingsBody.append(
      el(
        "p",
        "mw-muted",
        t(
          "Saved voices apply only to this book. Local voice and transcript controls change the app default used by books without a saved voice.",
          "Kayıtlı ses seçimi yalnız bu kitaba uygulanır. Yerel ses ve döküm düğmeleri, kayıtlı ses seçmeyen kitapların kullandığı uygulama varsayılanını değiştirir.",
        ),
      ),
    );
    settingsBody.append(
      button(
        t(
          "Change app default transcript",
          "Uygulama varsayılan dökümünü değiştir",
        ),
        async () => {
          if (busy) throw Error("Busy / Meşgul");
          const r = await window.api.dubConfig("transcript");
          if (!r.ok) throw Error(r.error);
          status(
            r.ready
              ? t(
                  "Reference audio and transcript are ready.",
                  "Referans ses ve döküm hazır.",
                )
              : t(
                  "Check reference audio and its exact transcript.",
                  "Referans ses ve birebir dökümünü kontrol et.",
                ),
          );
        },
      ),
    );
    for (const [key, label, options] of [
      [
        "profile",
        t("Quality", "Kalite"),
        [
          ["quality", t("Quality · 15 steps", "Kaliteli · 15 adım")],
          ["fast", t("Fast · 10 steps", "Hızlı · 10 adım")],
        ],
      ],
      [
        "concurrency",
        t("Parallel groups", "Paralel grup"),
        [
          [1, "1"],
          [2, "2"],
          [4, "4"],
          [8, "8"],
        ],
      ],
      [
        "verification",
        t("Speech check", "Konuşma kontrolü"),
        [
          ["detailed", t("Detailed", "Ayrıntılı")],
          ["balanced", t("Balanced", "Dengeli")],
          ["fast", t("Acoustic only", "Yalnız akustik")],
        ],
      ],
    ]) {
      const wrap = el("label", "mw-setting"),
        input = el("select");
      wrap.append(el("span", "", label));
      for (const [id, text] of options) {
        const o = el("option", "", text);
        o.value = id;
        input.append(o);
      }
      input.value = voicePrefs[key];
      input.onchange = () => {
        voicePrefs[key] =
          key === "concurrency" ? Number(input.value) : input.value;
        void call("book-preferences", {
          id: project.id,
          preferences: voicePrefs,
        }).catch((e) => status(e.message));
      };
      wrap.append(input);
      settingsBody.append(wrap);
    }
    settings.append(settingsBody);
    body.append(settings);
    const range = el("div", "mw-range"),
      from = el("input"),
      to = el("input");
    for (const input of [from, to]) {
      input.type = "number";
      input.min = "1";
      input.max = String(project.numPages || project.chapters.length);
      input.step = "1";
    }
    const selectedNumbers = project.chapters
      .filter((c) => selected.has(c.id))
      .map((c) => c.pageNumber || c.id + 1);
    from.value = String(
      selectedNumbers.length ? Math.min(...selectedNumbers) : 1,
    );
    to.value = String(
      selectedNumbers.length
        ? Math.max(...selectedNumbers)
        : project.numPages || project.chapters.length,
    );
    from.setAttribute(
      "aria-label",
      t("From page / chapter", "Başlangıç sayfası / bölüm"),
    );
    to.setAttribute(
      "aria-label",
      t("To page / chapter", "Bitiş sayfası / bölüm"),
    );
    range.append(
      el(
        "strong",
        "",
        project.format === "pdf"
          ? t("Page range", "Sayfa aralığı")
          : t("Chapter range", "Bölüm aralığı"),
      ),
      from,
      el("span", "", "—"),
      to,
      button(t("Select this range", "Bu aralığı seç"), () => {
        const a = Number(from.value),
          b = Number(to.value),
          max = project.numPages || project.chapters.length;
        if (
          !Number.isInteger(a) ||
          !Number.isInteger(b) ||
          a < 1 ||
          b < a ||
          b > max
        )
          throw Error(
            t("Check the page range.", "Sayfa aralığını kontrol et."),
          );
        saveDraft();
        selected = new Set(
          project.chapters
            .filter((c) => {
              const n = c.pageNumber || c.id + 1;
              return n >= a && n <= b;
            })
            .map((c) => c.id),
        );
        saveSelection();
        for (const input of dialog.querySelectorAll(".mw-chapter input"))
          input.checked = selected.has(Number(input.dataset.chapter));
        status(
          t("Selected pages / chapters: ", "Seçili sayfa / bölüm: ") +
            selected.size,
        );
      }),
    );
    body.append(range);
    mountBookSearch(body);
    const split = el("div", "mw-book"),
      list = el("aside", "mw-chapters");
    list.setAttribute("aria-label", t("Chapters", "Bölümler"));
    const all = button(t("Select all", "Tümünü seç"), () => {
      selected = new Set(project.chapters.map((c) => c.id));
      saveSelection();
      return books();
    });
    list.append(
      all,
      button(t("Clear selection", "Seçimi temizle"), () => {
        selected.clear();
        saveSelection();
        return books();
      }),
    );
    for (const c of project.chapters) {
      const row = el("div", "mw-chapter");
      const check = el("input");
      check.type = "checkbox";
      check.dataset.chapter = String(c.id);
      check.checked = selected.has(c.id);
      check.setAttribute("aria-label", `${t("Select", "Seç")}: ${c.title}`);
      check.onchange = () => {
        check.checked ? selected.add(c.id) : selected.delete(c.id);
        saveSelection();
      };
      const link = button(c.title, async () => {
        await saveChapter();
        chapter = c.id;
        await books();
      });
      link.setAttribute("aria-current", c.id === chapter ? "true" : "false");
      row.append(
        check,
        link,
        el(
          "small",
          "",
          c.status === "ready"
            ? t("Ready", "Hazır")
            : c.status === "review"
              ? t("Review", "Kontrol et")
              : t("Pending", "Bekliyor"),
        ),
      );
      list.append(row);
    }
    const edit = el("section", "mw-editor"),
      c = project.chapters[chapter];
    edit.append(el("h2", "", c.title));
    const textarea = el("textarea");
    textarea.dataset.chapter = String(chapter);
    textarea.dataset.projectId = project.id;
    textarea.value = drafts.get(`${project.id}:${chapter}`) ?? c.text;
    textarea.maxLength = 100000;
    textarea.setAttribute(
      "aria-label",
      t("Reviewed chapter text", "Gözden geçirilmiş bölüm metni"),
    );
    const draftKey = `${project.id}:${chapter}`,
      contextChapter = chapter;
    textarea.oninput = () => {
      drafts.set(draftKey, textarea.value);
      bookContext(contextChapter, textarea.value, textarea.selectionStart || 0);
    };
    window.MediaExperience?.bindPassage(
      textarea,
      ({ text, offset, selectedText }) =>
        bookContext(contextChapter, text, offset, selectedText),
    );
    edit.append(
      textarea,
      el(
        "p",
        "mw-muted",
        t(
          "Uses the dubbing engine and original reference voice. Narration keeps natural pauses, without video gaps.",
          "Dublaj motorunu ve özgün referans sesini kullanır. Anlatım, video boşlukları olmadan doğal durakları korur.",
        ),
      ),
    );
    if (project.format === "pdf")
      window.BookTextPreparationUI?.mount(edit, {
        input: textarea,
        t,
        isCurrent: () =>
          textarea.isConnected &&
          dialog?.open &&
          project?.id === textarea.dataset.projectId &&
          chapter === contextChapter,
      });
    stopTakePreview = window.BookVoiceTakesUI?.mount(edit, {
      id: project.id,
      chapter: contextChapter,
      call,
      t,
      url: pathToFileUrl,
      isCurrent: () =>
        textarea.isConnected &&
        dialog?.open &&
        project?.id === textarea.dataset.projectId &&
        chapter === contextChapter,
      beforeSelect: async () => {
        if (busy)
          throw Error(t("A workflow is running.", "Bir işlem çalışıyor."));
        await saveChapter();
      },
      onSelected: async (updated) => {
        project = updated;
        await books();
        status(
          t(
            "Voice take selected. Earlier recordings were kept.",
            "Ses denemesi seçildi. Önceki kayıtlar korundu.",
          ),
        );
      },
    });
    const exportPreview = el("section", "mw-export-preview");
    exportPreview.hidden = true;
    exportPreview.setAttribute("aria-live", "polite");
    const exportProgress = el("progress", "mw-export-progress");
    exportProgress.max = 100;
    exportProgress.value = 0;
    exportProgress.hidden = true;
    exportProgress.setAttribute(
      "aria-label",
      t("Audiobook export progress", "Sesli kitap dışa aktarma ilerlemesi"),
    );
    const buttons = el("div", "mw-actions mw-transport");
    buttons.append(
      button(t("Save text", "Metni kaydet"), saveChapter),
      button(
        t("Generate selected chapters", "Seçili bölümleri seslendir"),
        generate,
        true,
      ),
      button(t("Stop", "Durdur"), async () => {
        if (!busy && !job) return;
        stopRequested = true;
        status(
          t(
            "Stopping… waiting for the active tool to close.",
            "Durduruluyor… çalışan aracın kapanması bekleniyor.",
          ),
        );
        if (job) await window.api.cancelDub();
        else await call("cancel");
      }),
      button(t("Read & listen", "Dinle ve takip et"), () => readChapter()),
      button(
        t("Regenerate this chapter", "Bu bölümü yeniden üret"),
        async () => {
          if (busy)
            throw Error(t("A workflow is running.", "Bir işlem çalışıyor."));
          selected = new Set([chapter]);
          saveSelection();
          await generate(true);
        },
      ),
      button(t("Preview M4B export", "M4B çıktı bilgisi"), async () => {
        if (busy)
          throw Error(t("A workflow is running.", "Bir işlem çalışıyor."));
        busy = true;
        stopRequested = false;
        const previewProjectId = project.id;
        try {
          await saveChapter();
          status(t("Checking selected audio…", "Seçili sesler denetleniyor…"));
          const r = await call("book-export-preview", {
            id: previewProjectId,
            chapters: [...selected],
          });
          if (project?.id !== previewProjectId || !exportPreview.isConnected)
            return;
          const duration = (seconds) => {
            const n = Math.round(seconds);
            return `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
          };
          exportPreview.replaceChildren(
            el("h3", "", t("Selected audiobook", "Seçili sesli kitap")),
          );
          const metrics = el("dl", "mw-export-metrics");
          for (const [label, value] of [
            [t("Chapters", "Bölümler"), String(r.chapters.length)],
            [t("Total duration", "Toplam süre"), duration(r.seconds)],
            [
              t("Estimated AAC size", "Tahmini AAC boyutu"),
              `${(r.estimatedBytes / 1048576).toFixed(1)} MiB`,
            ],
            [
              t("Output-folder free space", "Çıktı klasöründeki boş alan"),
              r.freeBytes === null
                ? t("Unavailable", "Ölçülemedi")
                : `${(r.freeBytes / 1073741824).toFixed(1)} GiB`,
            ],
          ]) {
            const item = el("div");
            item.append(el("dt", "", label), el("dd", "", value));
            metrics.append(item);
          }
          const details = el("details"),
            list = el("ol");
          details.append(
            el(
              "summary",
              "",
              t("Chapter order and duration", "Bölüm sırası ve süreleri"),
            ),
          );
          for (const row of r.chapters)
            list.append(
              el("li", "", `${row.title} · ${duration(row.seconds)}`),
            );
          details.append(list);
          exportPreview.append(
            metrics,
            details,
            el(
              "p",
              "mw-muted",
              t(
                "Size is estimated at 160 kb/s AAC. The selected destination is checked again when saving.",
                "Boyut 160 kb/sn AAC için tahminidir. Kaydederken seçilen hedefin boş alanı yeniden denetlenir.",
              ),
            ),
          );
          exportPreview.hidden = false;
          exportPreview.scrollIntoView?.({
            block: "nearest",
            behavior: "auto",
          });
          status("");
        } finally {
          busy = false;
        }
      }),
      button(
        t("Export selected as M4B", "Seçilileri M4B olarak kaydet"),
        async () => {
          if (busy)
            throw Error(t("A workflow is running.", "Bir işlem çalışıyor."));
          busy = true;
          stopRequested = false;
          try {
            await saveChapter();
            status(
              t(
                "Preparing M4B… Stop cancels export.",
                "M4B hazırlanıyor… Durdur dışa aktarmayı iptal eder.",
              ),
            );
            const off = window.api.onMediaWorkflow((event) => {
              if (
                !stopRequested &&
                event.type === "progress" &&
                event.projectId === project.id &&
                String(event.text || "").startsWith("M4B:")
              ) {
                status(event.text);
                exportProgress.hidden = false;
                if (Number.isFinite(event.percent))
                  exportProgress.value = event.percent;
                else exportProgress.removeAttribute("value");
              }
            });
            try {
              const r = await call("book-export", {
                id: project.id,
                chapters: [...selected],
              });
              if (!r.canceled) {
                project = (await call("book-open", { id: project.id })).project;
                await books();
              }
              status(r.path || "");
            } finally {
              off();
              exportProgress.hidden = true;
            }
          } finally {
            busy = false;
          }
        },
      ),
    );
    if (project.audiobook)
      buttons.append(
        button(t("Listen to M4B", "M4B’yi dinle"), async () => {
          const r = await call("book-audiobook", {
            id: project.id,
            exportId: project.audiobook.id,
          });
          dialog.close();
          await openLocalMedia(r.path, 0);
        }),
      );
    if (project.shelfBookId || project.format === "pdf")
      buttons.append(
        button(t("Back to source chapter", "Kaynak bölüme dön"), async () => {
          await saveChapter();
          const previous = dialog;
          if (project.format === "pdf") {
            const source = await call("book-pdf", { id: project.id });
            await window.MediaShelfUI.openPdfPage(
              source.path,
              c.pageNumber || 1,
            );
          } else {
            const source = await call("book-source", {
              id: project.id,
              chapter,
            });
            await window.MediaShelfUI.openBook(
              source.shelfId,
              source.sourceChapter,
            );
          }
          previous?.close();
        }),
      );
    if (c.groups?.some((g) => g.status !== "ready")) {
      const review = el("details", "mw-review");
      review.open = true;
      review.append(
        el(
          "summary",
          "",
          t("Speech groups to review", "Kontrol edilecek konuşma grupları"),
        ),
        el(
          "p",
          "mw-muted",
          t(
            "After text edits, speech groups are rebuilt. Unchanged cached audio is reused when possible; old group numbers are not reused.",
            "Metni düzenlediğinde konuşma grupları yeniden kurulur. Değişmeyen önbellek sesi mümkün olduğunda kullanılır; eski grup numaraları kullanılmaz.",
          ),
        ),
      );
      const audio = el("audio");
      audio.controls = true;
      audio.preload = "metadata";
      review.append(audio);
      let end = null,
        playRequest = 0;
      const reviewProjectId = project.id,
        reviewChapter = chapter;
      stopReviewPreview = () => {
        playRequest++;
        end = null;
        audio.onloadedmetadata = null;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      };
      audio.ontimeupdate = () => {
        if (end !== null && audio.currentTime >= end) {
          audio.pause();
          end = null;
        }
      };
      for (const g of c.groups.filter((g) => g.status !== "ready")) {
        const row = el("div", "mw-review-group");
        row.append(
          el("p", "", g.text || t("Missing speech", "Eksik konuşma")),
          el("small", "", g.status),
        );
        row.append(
          button(t("Listen to group", "Grubu dinle"), async () => {
            const request = ++playRequest;
            audio.pause();
            end = null;
            if (
              !Number.isFinite(g.start) ||
              !Number.isFinite(g.end) ||
              g.start < 0 ||
              g.end <= g.start
            )
              throw Error(
                t(
                  "This group has no playable audio range.",
                  "Bu grubun dinlenebilir ses aralığı yok.",
                ),
              );
            const r = await call("book-listen", {
              id: reviewProjectId,
              chapter: reviewChapter,
            });
            if (
              request !== playRequest ||
              !audio.isConnected ||
              !dialog?.open ||
              project?.id !== reviewProjectId ||
              chapter !== reviewChapter
            )
              return;
            audio.onloadedmetadata = () => {
              if (
                request !== playRequest ||
                !audio.isConnected ||
                !dialog?.open
              )
                return;
              if (
                !Number.isFinite(audio.duration) ||
                g.start >= audio.duration
              ) {
                status(
                  t(
                    "This group has no playable audio range.",
                    "Bu grubun dinlenebilir ses aralığı yok.",
                  ),
                );
                return;
              }
              audio.currentTime = g.start;
              end = Math.min(g.end, audio.duration);
              void audio.play().catch((e) => {
                if (request === playRequest) status(e.message);
              });
            };
            audio.src = pathToFileUrl(r.path);
            audio.load();
          }),
          button(t("Edit this passage", "Bu metni düzenle"), () => {
            const index = textarea.value.indexOf(g.text || "");
            textarea.focus();
            if (index >= 0)
              textarea.setSelectionRange(index, index + (g.text || "").length);
            else
              status(
                t(
                  "The source text has changed; edit this chapter and regenerate it.",
                  "Kaynak metin değişti; bölümü düzenleyip yeniden üret.",
                ),
              );
            textarea.scrollIntoView({ block: "nearest" });
          }),
          button(
            t("Regenerate only this group", "Yalnız bu grubu yeniden üret"),
            async () => {
              if (project?.id !== reviewProjectId || chapter !== reviewChapter)
                return;
              selected = new Set([chapter]);
              await generate(false, { key: g.key, output: c.output });
            },
          ),
          button(
            t("I listened — approve this group", "Dinledim — bu grubu onayla"),
            async () => {
              const approvalProject = project.id,
                approvalChapter = chapter,
                approvalOutput = c.output;
              if (
                await ask({
                  title: t("Approve this audio?", "Bu ses onaylansın mı?"),
                  description: t(
                    "Only approve after listening. This records your acceptance; it does not mean automatic ASR passed.",
                    "Yalnız dinledikten sonra onayla. Bu, kullanıcı kabulünü kaydeder; otomatik doğrulamanın geçtiği anlamına gelmez.",
                  ),
                  confirmLabel: t("Approve", "Onayla"),
                })
              ) {
                if (
                  !dialog?.open ||
                  project?.id !== approvalProject ||
                  chapter !== approvalChapter ||
                  project.chapters[approvalChapter]?.output !== approvalOutput
                )
                  return;
                project = (
                  await call("book-approve", {
                    id: approvalProject,
                    chapter: approvalChapter,
                    key: g.key,
                  })
                ).project;
                await books();
              }
            },
          ),
        );
        review.append(row);
      }
      edit.insertBefore(review, textarea);
      textarea.style.height = "180px";
    }
    edit.append(buttons, exportProgress, exportPreview);
    split.append(list, edit);
    body.append(split);
    bookContext(chapter, textarea.value);
  }
  let readerPdfMap = null,
    readerAudioCleanup = null;
  let readerTask = null,
    readerRender = null,
    readerGeneration = 0,
    readerResize = null;
  async function readChapter(next = chapter, autoplay = false, resume = null) {
    const request = ++readerRequest,
      projectId = project?.id;
    await saveChapter();
    if (request !== readerRequest || !dialog?.open || project?.id !== projectId)
      return;
    const current = next,
      result = await call("book-listen", { id: projectId, chapter: current });
    if (request !== readerRequest || !dialog?.open || project?.id !== projectId)
      return;
    if (
      resume &&
      (result.outputId !== resume.outputId ||
        result.textHash !== resume.textHash)
    )
      throw Error(
        t(
          "Audio changed; select the bookmark again.",
          "Ses değişti; yer imini yeniden seç.",
        ),
      );
    chapter = current;
    status("");
    const body = clearBody(),
      generation = readerGeneration,
      head = el("div", "mw-reading-head");
    head.append(
      button(t("Back to editor", "Editöre dön"), async () => {
        await closeReader();
        await books();
      }),
      el(
        "h2",
        "",
        result.pageNumber
          ? t("Page ", "Sayfa ") + result.pageNumber
          : result.chapter,
      ),
    );
    const layout = el("div", "mw-reading"),
      page = el("section", "mw-pdf"),
      prose = el("article", "mw-reading-text");
    prose.tabIndex = 0;
    prose.setAttribute("aria-label", t("Narrated text", "Seslendirilen metin"));
    const audio = el("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src =
      "file:///" +
      result.path
        .replace(/\\/g, "/")
        .split("/")
        .map(encodeURIComponent)
        .join("/");
    const rows = result.groups.length
      ? result.groups
      : [{ text: project.chapters[current].text, start: 0, end: Infinity }];
    const playback = window.ReaderAudioControl.create(audio, {
      position: result.position,
      autoplay,
      isCurrent: () =>
        generation === readerGeneration && audio.isConnected && dialog?.open,
      onError: (error) => status(error.message),
      errors: {
        timeout: t(
          "Audio metadata timed out. Try this passage again.",
          "Ses bilgisi zaman aşımına uğradı. Parçayı yeniden dene.",
        ),
        unavailable: t("Audio could not be loaded.", "Ses yüklenemedi."),
        range: t(
          "This passage has no playable audio range.",
          "Bu parçanın dinlenebilir ses aralığı yok.",
        ),
      },
    });
    for (const [i, row] of rows.entries()) {
      const span = el("span", "mw-spoken", row.text + " ");
      span.dataset.spokenIndex = String(i);
      span.tabIndex = 0;
      span.title = t("Play from here", "Buradan dinle");
      span.onclick = () => {
        void playback.playFrom(row.start);
      };
      span.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          span.click();
        }
      };
      prose.append(span);
    }
    let last = -1,
      follow = true,
      lastSaved = 0;
    const persist = () => {
      if (
        audio.readyState < 1 ||
        !Number.isFinite(audio.duration) ||
        !Number.isFinite(audio.currentTime)
      )
        return Promise.resolve();
      return call("book-progress", {
        id: projectId,
        chapter: current,
        position: audio.currentTime || 0,
        outputId: result.outputId,
        textHash: result.textHash,
      }).catch((e) => {
        if (
          generation === readerGeneration &&
          dialog?.open &&
          project?.id === projectId
        )
          status(e.message);
      });
    };
    audio.onpause = persist;
    const saveInterval = () => {
      if (Date.now() - lastSaved > 10000) {
        lastSaved = Date.now();
        void persist();
      }
    };
    audio.addEventListener("timeupdate", saveInterval);
    readerAudioCleanup = () => {
      void persist();
      playback.dispose();
      audio.onpause = null;
      audio.onended = null;
      audio.ontimeupdate = null;
      audio.removeEventListener("timeupdate", saveInterval);
    };
    audio.onended = async () => {
      await persist();
      if (
        generation !== readerGeneration ||
        !audio.isConnected ||
        !dialog?.open ||
        project?.id !== projectId
      )
        return;
      const nextIndex = [...selected]
        .sort((a, b) => a - b)
        .find((i) => i > current);
      if (nextIndex !== undefined)
        try {
          await readChapter(nextIndex, true);
        } catch (e) {
          status(e.message);
        }
    };
    head.append(
      button(t("Previous page / chapter", "Önceki sayfa / bölüm"), () =>
        readChapter(Math.max(0, current - 1)),
      ),
      button(t("Next page / chapter", "Sonraki sayfa / bölüm"), () =>
        readChapter(Math.min(project.chapters.length - 1, current + 1)),
      ),
    );
    const followButton = button(
      t("Follow reading: on", "Okumayı takip et: açık"),
      () => {
        follow = !follow;
        followButton.textContent = follow
          ? t("Follow reading: on", "Okumayı takip et: açık")
          : t("Follow reading: off", "Okumayı takip et: kapalı");
      },
    );
    audio.ontimeupdate = () => {
      const i = rows.findIndex(
        (r) => audio.currentTime >= r.start && audio.currentTime < r.end,
      );
      if (i === last) return;
      prose.querySelector("[aria-current]")?.removeAttribute("aria-current");
      last = i;
      if (i >= 0) {
        const active = prose.querySelector(`[data-spoken-index="${i}"]`);
        active.setAttribute("aria-current", "true");
        if (follow)
          active.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };
    const font = el("input");
    font.type = "range";
    font.min = "16";
    font.max = "30";
    font.value = "21";
    font.setAttribute(
      "aria-label",
      t("Reading font size", "Okuma yazı boyutu"),
    );
    font.oninput = () => (prose.style.fontSize = font.value + "px");
    head.append(followButton, font);
    body.append(head, audio);
    window.BookBookmarksUI?.mount(body, {
      id: projectId,
      chapter: current,
      audio,
      prose,
      outputId: result.outputId,
      textHash: result.textHash,
      activeId: resume?.id || "",
      call,
      t,
      isCurrent: () =>
        generation === readerGeneration &&
        dialog?.open &&
        project?.id === projectId,
      navigate: async (mark) => {
        const opened = await readChapter(mark.chapter, false, mark);
        if (
          opened &&
          dialog?.open &&
          project?.id === projectId &&
          chapter === mark.chapter
        )
          status(
            mark.state === "audio-remapped"
              ? t(
                  "Audio changed: opened the matching speech group start.",
                  "Ses yenilendi: eşleşen konuşma grubunun başı açıldı.",
                )
              : t("Bookmark opened.", "Yer imi açıldı."),
          );
      },
      openText: async (target) => {
        const result = await call("book-open", { id: projectId });
        if (
          generation !== readerGeneration ||
          !dialog?.open ||
          project?.id !== projectId
        )
          return;
        project = result.project;
        chapter = target;
        await books();
      },
    });
    body.append(layout);
    layout.append(prose);
    if (resume) void playback.playFrom(resume.position);
    bookContext(current, project.chapters[current].text);
    window.MediaExperience?.bindPassage(
      prose,
      ({ text, offset, selectedText }) =>
        bookContext(current, text, offset, selectedText),
    );
    mountBookSearch(body);
    body.append(
      el(
        "p",
        "mw-muted",
        t(
          "Highlight follows verified speech groups; it is not estimated word timing. Click a passage to listen from there.",
          "Vurgu doğrulanan konuşma gruplarını izler; tahmini kelime zamanı değildir. Bir parçaya tıklayarak oradan dinleyebilirsin.",
        ),
      ),
    );
    if (project.format === "pdf") {
      layout.prepend(page);
      const isCurrentPage = () =>
        generation === readerGeneration &&
        dialog?.open &&
        project?.id === projectId &&
        page.isConnected;
      page.append(
        el(
          "p",
          "mw-muted",
          t("Loading original PDF page…", "Özgün PDF sayfası yükleniyor…"),
        ),
      );
      try {
        const source = await call("book-pdf", { id: projectId });
        if (!isCurrentPage()) return;
        const opened = await window.api.openPdf(source.path);
        if (!isCurrentPage()) return;
        if (!opened.ok) throw Error(opened.error);
        const pdfjs = await getPdfJs(),
          response = await fetch(opened.fileUrl);
        if (!isCurrentPage()) return;
        if (!response.ok) throw Error("PDF unavailable.");
        const data = new Uint8Array(await response.arrayBuffer());
        if (!isCurrentPage()) return;
        const task = pdfjs.getDocument({
          data,
          isEvalSupported: false,
          useSystemFonts: true,
        });
        readerTask = task;
        const doc = await task.promise;
        if (!isCurrentPage()) {
          await task.destroy();
          return;
        }
        const number = result.pageNumber || 1,
          p = await doc.getPage(number);
        if (!isCurrentPage()) return;
        const canvas = el("canvas"),
          controls = el("div", "mw-actions"),
          zoom = el("select");
        const pageText = await p.getTextContent();
        if (!isCurrentPage()) return;

        zoom.setAttribute("aria-label", t("PDF zoom", "PDF yakınlaştırma"));
        const fit = el("option", "", t("Fit width", "Genişliğe sığdır"));
        fit.value = "fit";
        zoom.append(fit);
        for (const scale of [0.8, 1, 1.25, 1.5, 2]) {
          const o = el("option", "", Math.round(scale * 100) + "%");
          o.value = scale;
          zoom.append(o);
        }
        zoom.value = "fit";
        let drawRequest = 0;
        const draw = async () => {
          if (!isCurrentPage()) return;
          const request = ++drawRequest;
          const previous = readerRender;
          previous?.cancel();
          try {
            await previous?.promise;
          } catch {}
          if (!isCurrentPage() || request !== drawRequest) return;
          const viewport = p.getViewport({
              scale:
                zoom.value === "fit"
                  ? Math.max(
                      0.2,
                      (page.clientWidth - 26) /
                        p.getViewport({ scale: 1 }).width,
                    )
                  : Number(zoom.value),
            }),
            ratio = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.round(viewport.width * ratio);
          canvas.height = Math.round(viewport.height * ratio);
          canvas.style.width = viewport.width + "px";
          canvas.style.height = viewport.height + "px";
          const render = p.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
            transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
          });
          readerRender = render;
          try {
            await render.promise;
            if (!isCurrentPage() || request !== drawRequest) return;
            readerPdfMap?.dispose();
            readerPdfMap = window.PdfSpokenMap?.mount(
              page,
              canvas,
              pageText.items,
              viewport,
              rows,
              audio,
              playback.playFrom,
            );
            if (readerPdfMap && readerPdfMap.matched < readerPdfMap.total)
              status(
                t(
                  "PDF highlight is shown only for exact source-text matches. Translated or edited passages may not align.",
                  "PDF vurgusu yalnız kaynak metinle tam eşleşen gruplarda gösterilir. Çevrilmiş veya düzenlenmiş metin eşleşmeyebilir.",
                ),
              );
          } catch (e) {
            if (
              isCurrentPage() &&
              request === drawRequest &&
              e.name !== "RenderingCancelledException"
            )
              status(e.message);
          }
        };
        zoom.onchange = () => void draw();
        controls.append(
          el("strong", "", t("Original page ", "Özgün sayfa ") + number),
          zoom,
        );
        page.replaceChildren(controls, canvas);
        await draw();
        if (!isCurrentPage()) return;
        readerResize = new ResizeObserver(() => {
          if (zoom.value === "fit" && page.isConnected) void draw();
        });
        readerResize.observe(page);
      } catch (e) {
        if (isCurrentPage())
          page.replaceChildren(el("p", "mw-muted", e.message));
      }
    }
    return (
      generation === readerGeneration &&
      dialog?.open &&
      project?.id === projectId
    );
  }
  async function closeReader() {
    readerRequest++;
    readerAudioCleanup?.();
    readerAudioCleanup = null;
    readerPdfMap?.dispose();
    readerPdfMap = null;
    readerGeneration++;
    readerResize?.disconnect();
    readerResize = null;
    const audio = dialog?.querySelector("audio");
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    readerRender?.cancel();
    readerRender = null;
    const task = readerTask;
    readerTask = null;
    try {
      await task?.destroy();
    } catch {}
  }
  let stopRequested = false;
  async function generate(force = false, retryGroup = null) {
    if (busy) throw Error(t("A workflow is running.", "Bir işlem çalışıyor."));
    if (!selected.size) throw Error(t("Select chapters.", "Bölüm seç."));
    busy = true;
    try {
      await saveChapter();
    } catch (error) {
      busy = false;
      throw error;
    }
    stopRequested = false;
    const projectId = project.id,
      indices = [...selected].sort((a, b) => a - b);
    try {
      for (let i = 0; i < indices.length; i++) {
        if (stopRequested) break;
        status(
          `${i + 1}/${indices.length} · ${project.chapters[indices[i]].title}`,
        );
        const prep = await call("book-prepare", {
          id: projectId,
          chapter: indices[i],
          ...(retryGroup ? { retryGroup } : {}),
        });
        const request = prep.request;
        Object.assign(request, voicePrefs);
        if (prep.replanned)
          status(
            t(
              "Text changed: rebuilding speech groups; unchanged cached audio is reused when possible.",
              "Metin değişti: konuşma grupları yeniden planlanıyor; değişmeyen önbellek sesi mümkün olduğunda kullanılır.",
            ),
          );
        if (force) {
          const plan = await window.api.planDub({
            srt: request.srt,
            grouping: request.grouping,
          });
          if (!plan?.ok)
            throw Error(
              plan?.error ||
                t("Chapter plan failed.", "Bölüm planı hazırlanamadı."),
            );
          request.forceGroups = plan.groups.map((g) => g.key);
        }
        if (stopRequested) break;
        job = request.id;
        const terminal = new Promise((resolve, reject) => {
          const off = window.api.onDubEvent((event) => {
            if (event.id !== request.id) return;
            if (event.type === "progress")
              status(
                `${i + 1}/${indices.length} · ${event.done || event.current || 0}/${event.total || "…"}`,
              );
            if (["done", "error", "cancelled"].includes(event.type)) {
              off();
              job = null;
              event.type === "done"
                ? resolve(event)
                : reject(
                    Error(
                      event.error ||
                        t(
                          "Stopped. Completed chapters are kept.",
                          "Durduruldu. Tamamlanan bölümler korundu.",
                        ),
                    ),
                  );
            }
          });
          window.api
            .startDub(request)
            .then((r) => {
              if (!r?.ok) {
                off();
                job = null;
                reject(Error(r?.error || "Voice generation failed."));
              }
            })
            .catch((e) => {
              off();
              job = null;
              reject(e);
            });
        });
        await terminal;
        const updated = (await call("book-open", { id: projectId })).project;
        if (
          !updated.chapters[indices[i]].output ||
          updated.chapters[indices[i]].status === "pending"
        )
          throw Error(
            t(
              "The chapter changed or could not be saved; completed audio remains in the voice output folder.",
              "Bölüm değişti veya kaydedilemedi; tamamlanan ses çıktı klasöründe korunuyor.",
            ),
          );
      }
      status(
        stopRequested
          ? t("Stopped.", "Durduruldu.")
          : t("Selected chapters completed.", "Seçili bölümler tamamlandı."),
      );
    } finally {
      busy = false;
      job = null;
      if (project?.id === projectId) {
        project = (await call("book-open", { id: projectId })).project;
        if (dialog?.open) await books();
      }
    }
  }
  async function seasons(kind) {
    saveDraft();
    const body = clearBody();
    body.append(
      el(
        "p",
        "mw-muted",
        kind === "sync"
          ? t(
              "Select a folder containing videos and matching same-name SRT files. Preview all changes before saving separate .aligned SRT files. Originals stay unchanged.",
              "Video ve aynı adlı SRT dosyalarını içeren klasörü seç. Ayrı .aligned SRT dosyaları kaydedilmeden önce değişiklikleri incele. Özgün dosyalar korunur.",
            )
          : t(
              "Compare episode openings and endings. Suggestions are cached by file size and modification time; playback is never skipped automatically.",
              "Bölüm başlangıçlarını ve sonlarını karşılaştır. Öneriler dosya boyutu ve değişiklik zamanıyla saklanır; otomatik atlama yapılmaz.",
            ),
      ),
    );
    const actions = el("div", "mw-actions"),
      table = el("div", "mw-results");
    body.append(actions, table);
    actions.append(
      button(
        t("Choose season folder and scan", "Sezon klasörü seç ve tara"),
        async () => {
          if (busy) throw Error("Busy / Meşgul");
          busy = true;
          const id = crypto.randomUUID(),
            off = window.api.onMediaWorkflow((e) => {
              if (e.id === id) status(`${e.stage}: ${e.done + 1}/${e.total}`);
            });
          try {
            const r = await call(
              kind === "sync" ? "batch-sync" : "season-intro",
              { id },
            );
            if (r.canceled) return;
            token = r.token || "";
            results = r.rows || [];
            selected.clear();
            table.replaceChildren();
            for (const row of results) {
              const article = el("article", "mw-result"),
                label = el("label"),
                check = el("input");
              check.type = "checkbox";
              check.disabled = row.status !== "preview";
              check.checked = !check.disabled;
              if (check.checked) selected.add(row.name);
              check.onchange = () =>
                check.checked
                  ? selected.add(row.name)
                  : selected.delete(row.name);
              if (kind === "sync") label.append(check);
              label.append(el("strong", "", row.name));
              article.append(label);
              const clock = (value) => {
                const n = Math.max(0, Number(value) || 0);
                return (
                  Math.floor(n / 60) +
                  ":" +
                  String(Math.floor(n % 60)).padStart(2, "0")
                );
              };
              if (kind === "sync") {
                const labels = {
                  preview: t("Ready to review", "İncelemeye hazır"),
                  unmatched: t(
                    "No same-name subtitle",
                    "Aynı adlı altyazı yok",
                  ),
                  ambiguous: t(
                    "Multiple video versions; choose manually",
                    "Birden çok video sürümü; elle eşleştir",
                  ),
                  error: t("Could not align", "Senkron yapılamadı"),
                };
                article.append(
                  el("p", "mw-muted", labels[row.status] || row.status),
                );
                if (row.diagnostics)
                  article.append(
                    el(
                      "p",
                      "mw-result-summary",
                      `${t("Changed cues", "Değişen satır")}: ${row.diagnostics.changedCount} · ${t("Maximum shift", "En büyük kayma")}: ${Number(row.diagnostics.maxDrift || 0).toFixed(2)} s`,
                    ),
                  );
                if (row.error) article.append(el("p", "mh-error", row.error));
                if (row.examples?.length) {
                  const preview = el("table", "mw-comparison");
                  const header = el("tr");
                  for (const text of [
                    t("Subtitle", "Altyazı"),
                    t("Before", "Önce"),
                    t("After", "Sonra"),
                  ])
                    header.append(el("th", "", text));
                  preview.append(header);
                  for (const example of row.examples) {
                    const line = el("tr");
                    line.append(
                      el("td", "", example.text),
                      el("td", "", example.before.map(clock).join(" – ")),
                      el("td", "", example.after.map(clock).join(" – ")),
                    );
                    preview.append(line);
                  }
                  article.append(preview);
                }
              } else {
                for (const [label, values] of [
                  [t("Intro", "Intro"), row.intro],
                  [t("Credits", "Jenerik"), row.credits],
                ]) {
                  const line = el("div", "mw-analysis-line");
                  line.append(el("strong", "", label));
                  if (!values?.length)
                    line.append(
                      el(
                        "span",
                        "mw-muted",
                        t(
                          "No reliable suggestion",
                          "Güvenilir öneri bulunamadı",
                        ),
                      ),
                    );
                  else
                    line.append(
                      el(
                        "span",
                        "",
                        values
                          .slice(0, 2)
                          .map((v) => clock(v.start) + " – " + clock(v.end))
                          .join(" / "),
                      ),
                    );
                  article.append(line);
                }
                article.append(
                  el(
                    "p",
                    "mw-muted",
                    t(
                      "Suggestions only. Check against the episode before skipping.",
                      "Yalnız öneridir. Atlamadan önce bölümle karşılaştır.",
                    ),
                  ),
                );
              }
              table.append(article);
            }
            status(
              r.cached
                ? t("Loaded cached suggestions.", "Kayıtlı öneriler yüklendi.")
                : t("Preview ready.", "Önizleme hazır."),
            );
          } finally {
            off();
            busy = false;
          }
        },
      ),
      button(t("Stop scan", "Taramayı durdur"), () => call("cancel")),
    );
    if (kind === "sync")
      actions.append(
        button(
          t(
            "Save selected aligned copies",
            "Seçili senkron kopyalarını kaydet",
          ),
          async () => {
            const r = await call("sync-apply", { token, names: [...selected] });
            token = "";
            status(
              t("Saved copies: ", "Kaydedilen kopya: ") + r.written.length,
            );
          },
          true,
        ),
      );
  }
  async function resourcePage() {
    saveDraft();
    const body = clearBody();
    body.append(
      el(
        "p",
        "mw-muted",
        t(
          "Snapshots do not suspend tabs or lose forms. Compare before/after opening and closing tabs or running a voice job. Values include Chromium processes, not just JavaScript heap.",
          "Ölçümler sekmeleri askıya almaz, formları kaybetmez. Sekme açıp kapatmadan veya ses işinden önce/sonra karşılaştır. Değerler yalnız JavaScript yığınını değil Chromium süreçlerini de içerir.",
        ),
      ),
    );
    let baseline = null;
    const summary = el("section", "mw-memory-summary"),
      processTable = el("table", "mw-comparison"),
      note = el("p", "mw-muted");
    const sample = async () => {
      const r = await call("resources");
      if (!summary.isConnected) return;
      const total = r.processes.reduce((sum, p) => sum + p.workingSetBytes, 0);
      if (baseline === null) baseline = total;
      summary.replaceChildren();
      for (const [label, value] of [
        [
          t("Application memory", "Uygulama belleği"),
          Math.round(total / 1048576) + " MiB",
        ],
        [
          t("Change since first sample", "İlk ölçüme göre değişim"),
          (total >= baseline ? "+" : "") +
            Math.round((total - baseline) / 1048576) +
            " MiB",
        ],
        [
          t("Cached scene sheets", "Önbellekteki sahne görselleri"),
          String(r.caches.seekSprites),
        ],
      ]) {
        const item = el("div");
        item.append(el("span", "mw-muted", label), el("strong", "", value));
        summary.append(item);
      }
      processTable.replaceChildren();
      const header = el("tr");
      header.append(
        el("th", "", t("Process", "Süreç")),
        el("th", "", t("Memory", "Bellek")),
      );
      processTable.append(header);
      const totals = new Map();
      for (const p of r.processes)
        totals.set(p.type, (totals.get(p.type) || 0) + p.workingSetBytes);
      for (const [type, bytes] of totals) {
        const row = el("tr");
        row.append(
          el("td", "", type),
          el("td", "", Math.round(bytes / 1048576) + " MiB"),
        );
        processTable.append(row);
      }
      note.textContent =
        (r.voiceBusy
          ? t("Voice job active", "Ses işi çalışıyor")
          : t(
              "Voice engine idle or released",
              "Ses motoru boşta veya bırakılmış",
            )) +
        " · " +
        new Date(r.sampledAt).toLocaleTimeString();
    };
    body.append(
      button(t("Measure again", "Yeniden ölç"), sample),
      summary,
      processTable,
      note,
    );
    await sample();
  }

  function open(tab = "books") {
    if (dialog?.open) {
      dialog.focus();
      return;
    }
    const d = el("dialog", "mw-dialog media-surface");
    dialog = d;
    d.id = "mediaWorkflowsDialog";
    d.dataset.uiUntranslated = "";
    d.setAttribute(
      "aria-label",
      t("Production workspace", "Üretim çalışma alanı"),
    );
    const header = el("header"),
      copy = el("div");
    copy.append(
      el("h1", "", t("Production workspace", "Üretim çalışma alanı")),
      el(
        "p",
        "mw-muted",
        t(
          "Your voice, chapters and season tools.",
          "Sesin, bölümlerin ve sezon araçların.",
        ),
      ),
    );
    const close = button("×", () => d.close());
    close.setAttribute("aria-label", t("Close", "Kapat"));
    header.append(copy, close);
    const nav = el("nav");
    const pages = [
      ["books", t("Audiobook", "Sesli kitap"), books],
      [
        "sync",
        t("Season subtitle sync", "Sezon altyazı senkronu"),
        () => seasons("sync"),
      ],
      [
        "intro",
        t("Intro & credits", "Intro ve jenerik"),
        () => seasons("intro"),
      ],
      ["resources", t("Memory", "Bellek"), resourcePage],
    ];
    for (const [id, label, fn] of pages) {
      const b = button(label, async () => {
        if (busy)
          throw Error(
            t(
              "Stop the current workflow first.",
              "Önce çalışan işlemi durdur.",
            ),
          );
        saveDraft();
        for (const n of nav.children)
          n.setAttribute("aria-current", String(n === b));
        await fn();
      });
      b.setAttribute("aria-current", String(id === tab));
      nav.append(b);
    }
    const signal = el("p", "mw-status");
    signal.setAttribute("role", "status");
    d.append(header, nav, signal, el("main", "mw-body"));
    d.onclose = () => {
      stopTakePreview?.();
      stopTakePreview = null;
      stopReviewPreview?.();
      stopReviewPreview = null;
      for (const a of d.querySelectorAll("audio")) a.pause();
      if (busy) {
        stopRequested = true;
        if (job) void window.api.cancelDub();
        else void call("cancel").catch(() => {});
      }
      void closeReader();
      saveDraft();
      if (dialog === d) dialog = null;
      d.remove();
      void syncBrowserOcclusion();
    };
    document.body.append(d);
    d.showModal();
    void syncBrowserOcclusion();
    close.focus();
    void pages
      .find((p) => p[0] === tab)?.[2]()
      .catch((e) => status(e.message));
  }
  window.MediaWorkflowsUI = Object.freeze({
    open,
    openProject: async (id, focus = {}) => {
      if (busy) throw Error("Busy / Meşgul");
      await saveChapter();
      const next = (await call("book-open", { id })).project;
      const target = focus.chapter ?? 0;
      if (
        !Number.isInteger(target) ||
        target < 0 ||
        target >= next.chapters.length
      )
        throw Error(t("Invalid chapter.", "Bölüm geçersiz."));
      project = next;
      chapter = target;
      selected = focus.selectChapter
        ? new Set([target])
        : new Set(project.selectedChapters || [0]);
      if (focus.selectChapter) saveSelection();
      if (dialog?.open) dialog.close();
      open();
    },
  });
})();
