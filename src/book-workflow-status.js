(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookWorkflowStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const labels = {
    ready: ["Ready", "Hazır"],
    review: ["Needs review", "Kontrol edilmeli"],
    failed: ["Audio could not be produced", "Ses üretilemedi"],
    pending: ["Pending", "Bekliyor"],
    cancelled: ["Stopped", "Durduruldu"],
    timeout: ["Timed out", "Zaman aşımı"],
    error: ["Failed", "Başarısız"],
  };
  const stages = {
    model_load: ["Loading voice model…", "Ses modeli yükleniyor…"],
    reference: ["Preparing reference voice…", "Referans ses hazırlanıyor…"],
    plan: ["Speech groups prepared", "Konuşma grupları hazır"],
    synthesis: ["Generating speech…", "Ses üretiliyor…"],
    verification: ["Checking speech…", "Konuşma doğrulanıyor…"],
    text_edit: ["Preparing narration text…", "Seslendirme metni hazırlanıyor…"],
    placement: [
      "Placing speech on the timeline…",
      "Ses zaman çizelgesine yerleştiriliyor…",
    ],
    file_write: ["Writing audio file…", "Ses dosyası yazılıyor…"],
    normalization: ["Balancing loudness…", "Ses yüksekliği dengeleniyor…"],
    engine_restart: [
      "Restarting the voice engine; completed groups are kept…",
      "Ses motoru yeniden başlatılıyor; tamamlanan gruplar korunuyor…",
    ],
  };
  function label(code, t) {
    return Object.hasOwn(labels, code)
      ? t(...labels[code])
      : t("Unknown status", "Durum bilinmiyor");
  }
  function stage(code, t) {
    return Object.hasOwn(stages, code)
      ? t(...stages[code])
      : t("Working…", "İşleniyor…");
  }
  function terminal(event, t) {
    if (event.type === "cancelled")
      return t(
        "Stopped. Completed chapters are kept.",
        "Durduruldu. Tamamlanan bölümler korundu.",
      );
    const reason = typeof event.error === "string" ? event.error.trim() : "",
      timedOut = /\btimeout(?:error)?\b|\btimed out\b|zaman aşım/i.test(reason),
      summary = timedOut
        ? t(
            "Voice generation timed out. Completed chapters are kept.",
            "Ses üretimi zaman aşımına uğradı. Tamamlanan bölümler korundu.",
          )
        : t(
            "Voice generation failed. Completed chapters are kept.",
            "Ses üretimi başarısız oldu. Tamamlanan bölümler korundu.",
          );
    return reason ? summary + "\n" + reason : summary;
  }
  // Historical auto-generated PDF headings are presentation, not book prose.
  // Never rewrite a renamed/custom chapter or guess from its title alone.
  function pageLabels(chapter) {
    const page=chapter?.pageNumber;
    if(!Number.isSafeInteger(page)||page<1||chapter.title!==`Page / Sayfa ${page}`)return null;
    return {en:`Page ${page}`,tr:`Sayfa ${page}`};
  }
  return Object.freeze({ label, stage, terminal, pageLabels });
});
