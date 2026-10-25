(() => {
  "use strict";
  const seen = new Map(),
    key = (id, chapter) => `${id}:${chapter}`;
  function getPreview(id, chapter, text) {
    const item = seen.get(key(id, chapter));
    return item?.text === text ? { ...item.preview } : undefined;
  }
  function mount(parent, { id, chapter, input, call, t, isCurrent, isBusy }) {
    const el = (tag, text, cls) => {
      const n = document.createElement(tag);
      if (text !== undefined) n.textContent = text;
      if (cls) n.className = cls;
      return n;
    };
    const root = el("details", undefined, "mw-production-plan"),
      summary = el(
        "summary",
        t("Preview speech groups", "Konuşma gruplarını önizle"),
      ),
      intro = el(
        "p",
        t(
          "See how the current draft will be grouped, without generating audio or saving the draft. Matching text is not proof of a cache hit; voice settings and verification also matter.",
          "Taslağı kaydetmeden ve ses üretmeden güncel metnin nasıl gruplandığını gör. Aynı metin önbellek isabeti kanıtı değildir; ses ayarları ve doğrulama da etkilidir.",
        ),
        "mw-muted",
      ),
      button = el(
        "button",
        t("Build current plan", "Güncel planı hazırla"),
        "mh-action",
      ),
      status = el("p", "", "mw-muted"),
      rows = el("div", undefined, "mw-plan-groups");
    button.type = "button";
    status.setAttribute("role", "status");
    root.append(summary, intro, button, status, rows);
    parent.append(root);
    let snapshot = null,
      request = 0;
    input.addEventListener("input", () => {
      request++;
      seen.delete(key(id, chapter));
      if (snapshot !== null) {
        status.textContent = t(
          "The draft changed. Rebuild the plan before relying on these groups.",
          "Taslak değişti. Bu grupları kullanmadan önce planı yeniden hazırla.",
        );
        rows.replaceChildren();
      }
    });
    button.onclick = async () => {
      if (!isCurrent()) return;
      if (isBusy()) {
        status.textContent = t(
          "Wait for the active workflow.",
          "Çalışan işlemin bitmesini bekle.",
        );
        return;
      }
      const ticket = ++request,
        text = input.value;
      snapshot = text;
      button.disabled = true;
      status.textContent = t(
        "Planning speech groups…",
        "Konuşma grupları hazırlanıyor…",
      );
      rows.replaceChildren();
      seen.delete(key(id, chapter));
      try {
        const source = await call("book-plan-source", { id, chapter, text });
        if (!isCurrent() || ticket !== request || input.value !== text) return;
        const plan = await window.api.planDub({
          srt: source.srt,
          grouping: source.grouping,
        });
        if (!isCurrent() || ticket !== request || input.value !== text) return;
        if (!plan?.ok)
          throw Error(
            plan?.error ||
              t("Chapter planning failed.", "Bölüm planı hazırlanamadı."),
          );
        if (plan.sourceHash !== source.sourceHash)
          throw Error(
            t(
              "The source changed. Build a new plan.",
              "Kaynak değişti. Yeni plan hazırla.",
            ),
          );
        const comparison = window.BookProductionPlan.compare(
          plan.groups,
          source.previousGroups,
        );
        snapshot = text;
        seen.set(key(id, chapter), {
          text,
          preview: {
            textHash: source.textHash,
            sourceHash: source.sourceHash,
            grouping: source.grouping,
          },
        });
        while (seen.size > 30) seen.delete(seen.keys().next().value);
        status.textContent = t(
          `${comparison.rows.length} groups · ${comparison.same} matching earlier text · ${comparison.changed} new or regrouped`,
          `${comparison.rows.length} grup · ${comparison.same} öncekiyle aynı metin · ${comparison.changed} yeni veya yeniden gruplanmış`,
        );
        for (const [i, g] of comparison.rows.entries()) {
          const row = el("section", undefined, "mw-plan-group"),
            heading = el("h4", t(`Group ${i + 1}`, `Grup ${i + 1}`)),
            label = el(
              "small",
              g.unchanged
                ? t(
                    "Same text as an earlier group",
                    "Önceki bir grupla aynı metin",
                  )
                : t("New text or grouping", "Yeni metin veya gruplama"),
            ),
            textNode = el("p", g.text);
          row.dataset.groupKey = g.key;
          row.append(heading, label, textNode);
          rows.append(row);
        }
        if (comparison.previousOnly.length) {
          const old = el("details"),
            title = el(
              "summary",
              t(
                `${comparison.previousOnly.length} earlier groups without an exact match`,
                `${comparison.previousOnly.length} eski grubun tam eşleşmesi yok`,
              ),
            );
          old.append(title);
          for (const text of comparison.previousOnly) old.append(el("p", text));
          rows.append(old);
        }
      } catch (e) {
        if (isCurrent() && ticket === request) status.textContent = e.message;
      } finally {
        if (isCurrent()) button.disabled = false;
      }
    };
    return root;
  }
  window.BookProductionPlanUI = Object.freeze({ mount, getPreview });
})();
