(() => {
  "use strict";
  function mount(parent, { input, t, isCurrent }) {
    const el = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const root = el("details", undefined, "mw-text-preparation"),
      summary = el(
        "summary",
        t("Prepare text for narration", "Seslendirme için metni hazırla"),
      ),
      intro = el(
        "p",
        t(
          "Review line-break hyphens before changing the narration text. Nothing is selected automatically; the source file stays unchanged.",
          "Satır sonunda bölünen sözcükleri seslendirmeden önce incele. Hiçbir değişiklik kendiliğinden seçilmez; kaynak dosya değişmez.",
        ),
        "mw-muted",
      ),
      actions = el("div", undefined, "mw-actions"),
      preview = el(
        "button",
        t("Preview suggestions", "Önerileri önizle"),
        "mh-action",
      ),
      apply = el(
        "button",
        t("Apply selected changes", "Seçili değişiklikleri uygula"),
        "mh-action",
      ),
      undo = el(
        "button",
        t("Undo preparation", "Hazırlamayı geri al"),
        "mh-action",
      ),
      status = el("p", "", "mw-muted"),
      rows = el("div", undefined, "mw-text-suggestions");
    for (const button of [preview, apply, undo]) button.type = "button";
    apply.disabled = true;
    undo.hidden = true;
    status.setAttribute("role", "status");
    actions.append(preview, apply, undo);
    root.append(summary, intro, actions, status, rows);
    parent.append(root);
    let snapshot = null,
      choices = {},
      previous = null,
      applied = null;
    function update() {
      const unchanged = snapshot === input.value;
      apply.disabled =
        !unchanged || !Object.values(choices).some((v) => v !== "keep");
      if (snapshot !== null && !unchanged)
        status.textContent = t(
          "The text changed. Preview suggestions again.",
          "Metin değişti. Önerileri yeniden önizle.",
        );
    }
    input.addEventListener("input", update);
    preview.onclick = () => {
      if (!isCurrent()) return;
      snapshot = input.value;
      choices = {};
      rows.replaceChildren();
      const result = window.BookTextPreparation.preview(snapshot);
      for (const suggestion of result.suggestions) {
        const row = el("section", undefined, "mw-text-suggestion"),
          context = el("p", suggestion.context, "mw-text-context"),
          comparison = el("div", undefined, "mw-text-comparison"),
          before = el(
            "pre",
            suggestion.before.replace(
              /\u00ad/g,
              t("[soft hyphen]", "[yumuşak tire]"),
            ),
          ),
          after = el("strong", suggestion.joined),
          label = el("label", t("Change", "Değişiklik")),
          choice = el("select");
        for (const [value, caption] of [
          ["keep", t("Keep original", "Özgün metni koru")],
          ["join", t("Join word", "Sözcüğü birleştir")],
          ...(!suggestion.soft
            ? [
                [
                  "hyphen",
                  t(
                    "Keep hyphen; remove line break",
                    "Tireyi koru; satır sonunu kaldır",
                  ),
                ],
              ]
            : []),
        ]) {
          const option = el("option", caption);
          option.value = value;
          choice.append(option);
        }
        choice.onchange = () => {
          choices[suggestion.id] = choice.value;
          after.textContent =
            choice.value === "hyphen"
              ? suggestion.hyphenated
              : choice.value === "keep"
                ? suggestion.before
                : suggestion.joined;
          update();
        };
        // Show exactly the default choice, not an unselected proposed rewrite.
        after.textContent = suggestion.before;
        comparison.append(before, el("span", "→"), after);
        label.append(choice);
        row.append(context, comparison, label);
        rows.append(row);
      }
      status.textContent = result.suggestions.length
        ? t(
            `${result.suggestions.length} suggestions. Choose each change before applying.`,
            `${result.suggestions.length} öneri. Uygulamadan önce değişiklikleri tek tek seç.`,
          )
        : t(
            "No eligible split words found. Capitalized words, acronyms, numbers and paragraph breaks are left unchanged.",
            "Uygun bölünmüş sözcük bulunmadı. Büyük harfle başlayan sözcükler, kısaltma, sayı ve paragraf sonları korunur.",
          );
      if (result.truncated)
        status.textContent += t(
          " Only the first 200 are shown; preview again after applying.",
          " Yalnız ilk 200 gösteriliyor; uyguladıktan sonra yeniden önizle.",
        );
      update();
    };
    apply.onclick = () => {
      if (!isCurrent()) return;
      try {
        const result = window.BookTextPreparation.apply(
          input.value,
          snapshot,
          choices,
        );
        if (!result.count) return;
        previous = input.value;
        applied = result.text;
        input.value = result.text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        snapshot = null;
        choices = {};
        rows.replaceChildren();
        apply.disabled = true;
        undo.hidden = false;
        status.textContent = t(
          `${result.count} changes applied to this draft. Save text to keep them.`,
          `${result.count} değişiklik taslağa uygulandı. Kalıcı olması için metni kaydet.`,
        );
      } catch (e) {
        status.textContent = e.message;
      }
    };
    undo.onclick = () => {
      if (!isCurrent()) return;
      if (input.value !== applied) {
        status.textContent = t(
          "The draft was edited afterwards; undo was not applied over your edits.",
          "Taslak sonradan düzenlendi; değişikliklerinin üzerine geri alma uygulanmadı.",
        );
        return;
      }
      input.value = previous;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      snapshot = null;
      choices = {};
      rows.replaceChildren();
      apply.disabled = true;
      undo.hidden = true;
      status.textContent = t(
        "Preparation undone. Save text to keep this version.",
        "Hazırlama geri alındı. Bu sürümü korumak için metni kaydet.",
      );
    };
    return root;
  }
  window.BookTextPreparationUI = Object.freeze({ mount });
})();
