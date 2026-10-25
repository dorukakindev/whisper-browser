(() => {
  "use strict";
  function mount(
    parent,
    { id, chapter, call, t, isCurrent, beforeSelect, onSelected, url },
  ) {
    const el = (tag, text, cls) => {
      const n = document.createElement(tag);
      if (text !== undefined) n.textContent = text;
      if (cls) n.className = cls;
      return n;
    };
    const root = el("details", undefined, "mw-voice-takes"),
      summary = el(
        "summary",
        t("Compare voice takes", "Ses denemelerini karşılaştır"),
      ),
      intro = el(
        "p",
        t(
          "Listen to the current and another take before choosing. Only audio for the current text can be used. Older files are kept.",
          "Seçmeden önce kullanılan sesi ve başka bir denemeyi dinle. Yalnız güncel metne ait ses kullanılabilir. Eski dosyalar korunur.",
        ),
        "mw-muted",
      ),
      actions = el("div", undefined, "mw-actions"),
      select = el("select"),
      refresh = el(
        "button",
        t("Refresh takes", "Denemeleri yenile"),
        "mh-action",
      ),
      load = el(
        "button",
        t("Load comparison", "Karşılaştırmayı aç"),
        "mh-action",
      ),
      use = el("button", t("Use this take", "Bu denemeyi kullan"), "mh-action"),
      status = el("p", "", "mw-muted"),
      players = el("div", undefined, "mw-take-players"),
      currentBox = el("section"),
      candidateBox = el("section"),
      currentAudio = el("audio"),
      candidateAudio = el("audio");
    select.setAttribute("aria-label", t("Voice take", "Ses denemesi"));
    for (const b of [refresh, load, use]) b.type = "button";
    for (const a of [currentAudio, candidateAudio]) {
      a.controls = true;
      a.preload = "metadata";
      a.onplay = () => {
        for (const other of root.closest("dialog").querySelectorAll("audio"))
          if (other !== a) other.pause();
      };
    }
    currentBox.append(
      el("h4", t("Currently used", "Kullanılan ses")),
      currentAudio,
    );
    candidateBox.append(
      el("h4", t("Comparison take", "Karşılaştırılan deneme")),
      candidateAudio,
    );
    players.append(currentBox, candidateBox);
    players.hidden = true;
    status.setAttribute("role", "status");
    actions.append(select, refresh, load, use);
    root.append(summary, intro, actions, status, players);
    parent.append(root);
    let alive = true,
      working = false,
      data = null,
      request = 0;
    const current = () => alive && isCurrent();
    const chosen = () => data?.takes.find((take) => take.id === select.value);
    const update = () => {
      const take = chosen();
      select.disabled = refresh.disabled = working;
      load.disabled = working || !take?.available;
      use.disabled =
        working || !take?.available || !take.textMatches || take.current;
    };
    const stop = () => {
      request++;
      for (const a of [currentAudio, candidateAudio]) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      players.hidden = true;
    };
    const run = (fn) => async () => {
      if (!current() || working) return;
      working = true;
      update();
      try {
        await fn();
      } catch (e) {
        if (current()) status.textContent = e.message;
      } finally {
        working = false;
        if (current()) update();
      }
    };
    async function reload() {
      stop();
      const result = await call("book-takes", { id, chapter });
      if (!current()) return;
      data = result;
      select.replaceChildren();
      for (const [i, take] of result.takes.entries()) {
        const label = [
          t(`Take ${i + 1}`, `Deneme ${i + 1}`),
          take.current ? t("current", "kullanılıyor") : "",
          !take.textMatches ? t("older text", "eski metin") : "",
          !take.available ? t("file missing", "dosya yok") : "",
          take.status === "ready"
            ? t("ready", "hazır")
            : t(
                `${take.reviewGroups} groups to review`,
                `${take.reviewGroups} grup incelenmeli`,
              ),
          take.createdAt
            ? new Date(take.createdAt).toLocaleString(t("en-GB", "tr-TR"))
            : t("earlier recording", "önceki kayıt"),
        ]
          .filter(Boolean)
          .join(" · ");
        const option = el("option", label);
        option.value = take.id;
        select.append(option);
      }
      const alternate = result.takes.find(
        (take) => !take.current && take.available && take.textMatches,
      );
      if (alternate) select.value = alternate.id;
      status.textContent = result.takes.length
        ? t(
            "Choose a take and load both recordings to compare.",
            "Bir deneme seçip karşılaştırmak için kayıtları aç.",
          )
        : t(
            "Generate this chapter to create its first take.",
            "İlk deneme için bu bölümü seslendir.",
          );
      if (result.truncated)
        status.textContent += t(
          " The 30 recently saved comparison records are listed; older files are retained.",
          " Son kaydedilen 30 karşılaştırma kaydı listelenir; eski dosyalar korunur.",
        );
      if (result.historyIncomplete)
        status.textContent += t(
          " An earlier comparison could not be indexed. Its file was not deleted; the selected audio is preserved.",
          " Önceki bir karşılaştırma kayda alınamadı. Dosyası silinmedi; seçilen ses korunuyor.",
        );
    }
    refresh.onclick = run(reload);
    root.ontoggle = () => {
      if (root.open && !data) void refresh.onclick();
      else if (!root.open) stop();
    };
    select.onchange = () => {
      stop();
      status.textContent = chosen()?.textMatches
        ? t(
            "Load the recordings to compare.",
            "Karşılaştırmak için kayıtları aç.",
          )
        : t(
            "This recording belongs to older text. You can listen, but it cannot replace the current text's audio.",
            "Bu kayıt eski metne ait. Dinleyebilirsin; güncel metnin sesi olarak seçilemez.",
          );
      update();
    };
    load.onclick = run(async () => {
      stop();
      const ticket = request,
        take = chosen(),
        active = data.takes.find((t) => t.current);
      const candidate = await call("book-take-listen", {
        id,
        chapter,
        takeId: take.id,
      });
      if (!current() || ticket !== request || !root.open) return;
      const original =
        active?.available && active.id !== take.id
          ? await call("book-take-listen", { id, chapter, takeId: active.id })
          : null;
      if (!current() || ticket !== request || !root.open) return;
      currentBox.hidden = !original;
      if (original) currentAudio.src = url(original.path);
      candidateAudio.src = url(candidate.path);
      players.hidden = false;
      status.textContent = candidate.textMatches
        ? t(
            "Only one recording plays at a time. Choosing a take keeps its quality-review status.",
            "Aynı anda tek kayıt çalar. Denemeyi seçmek kalite incelemesi durumunu değiştirmez.",
          )
        : t(
            "Older text: listening only; selection is disabled.",
            "Eski metin: yalnız dinlenebilir; seçim kapalı.",
          );
    });
    use.onclick = run(async () => {
      const takeId = select.value,
        textHash = data.textHash;
      await beforeSelect();
      if (!current()) return;
      const result = await call("book-take-select", {
        id,
        chapter,
        takeId,
        textHash,
      });
      if (!current()) return;
      stop();
      await onSelected(result.project);
    });
    update();
    return () => {
      alive = false;
      stop();
    };
  }
  window.BookVoiceTakesUI = Object.freeze({ mount });
})();
