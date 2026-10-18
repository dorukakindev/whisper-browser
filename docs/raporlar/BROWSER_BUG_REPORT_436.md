# BROWSER_BUG_REPORT_436 — Sağ panel düğmeleri toolbar altında

**Doğrulandı/düzeltildi:** ray/daraltılmış panel ayar çekmecesinin z20 seviyesi toolbar z30 altında kalıyordu. Bu nedenle sticky geri/kapat başlığı görünmez ve tıklanamazdı. Browser settings-open panel z41 ile düzeltildi.

**Erişim eksiği düzeltildi:** browser modunda gizlenen başlık eylemleri yerine toolbar'a yan panelleri aç/kapat düğmesi eklendi. Mevcut responsive toggle davranışı korunur, aria-expanded eşlenir, TR/EN.

Windows Electron ayrı profil gerçek1366/940px, ray/geniş, kaydırılmış panel: geri/kapat hit-test, kapatma click ve yeni toolbar toggle geçti; görsel incelendi. player-ui153, locale14, DOM2, syntax/diff ve Electron bridge geçti. Genel CI kullanıcı talimatıyla incelenmedi. [Devir ve sınırlar](../devir/2026-10-16-0338.md).
