# Rapor780 — Hizalama iptalinde gerçek kapanışı bekleme

## Kök neden

browser-alignment abort/timeout/çıktıtaşmasında doğrudan child.kill ve finish(error) çağırıyordu. Promise child close öncesi terminal oluyor; Windows FFmpeg torunu için süreç ağacı iptali yoktu. Üst servis iş slotunu erken bırakabilirdi. İlk repro eski modülün henüz olmayan injection parametresini varsaydığı için adaptör yanlıştı; ürün kanıtı sayılmadı. Spawn bağımlılığı doğru sarmalanınca parent9e0676d7'de abort ve overflow ikiFAIL, ikisi de childcloseöncesi settledtrue ile doğrulandı.

## Dosyalar

- `src/browser-alignment.js`: mevcut terminateProcessTree kullanılır; Windows taskkill/T, POSIX detachedprocessgroup. stopError ilk nedeni saklar, geç başarılı JSON onu ezmez. Promise ancak close olayıyla reddedilir; geçici klasör close'ta silinir. Normal JSON/cue/doğrulama limitleri korunur. spawnImpl/terminate yalnız iç test bağımlılığı olarak opsiyonel, IPCden açılmaz. Yeni bağımlılık/şema/ayar yok. Mevcut proje süreç altyapısı genişletildi, dış kod alınmadı.
- `tests/alignment-close780.test.js`: final açık dependencyinjection; abort/overflow stopbirkez,closeöncesipending/tempvar,close0ilegelensonbaşarıreddi/tempcleanup. Eski modüle redrepro için kullanılan monkeypatch finaltestte kaldırıldı.

## Kabul

4hedefliNodePASS (alignment-close780+season-cancel778). `node tests/browser-alignment.test.js` gerçek kurulu ffsubsync ile normal28cue, parça/drift ve öncedeniptal kabulü oktrue; overlapa0→1, ikierror0/0.001s. `node tests/process-lifecycle.test.js`:10PASS, hostparent/grandchild dahil. İkiJSsyntax/diffcheckPASS.

[GerçekWindows ağaç sonucu](ALIGN780_2026-10-29/result.json), [repro runner](ALIGN780_2026-10-29/tree.cjs): hizalama spawn sınırına kontrollüNodeana+torun çalıştırılır, gerçek taskkill/T kullanılır. Promise terminalinde closegözlendi, ikiPIDyok,tempyok;66ms. ChildOSclose1 iptalin normal sonucu, runnerOSexit0. Bu gerçek süreç ağacı iptalidir fakat gerçek ffsubsync→FFmpeg iptalinin kendisi veya GPU değildir. Reader/UI şekli değişmedi, yeni görselkabul yok. Kişiselstart.bat/tam npm/uzunCIbeklenmedi. Anahtar/ağ/kişiselmedya yok.

İptal sinyali verilemeyen/OSkillreddi durumunda canlı işin erken serbest kalmaması amaçlanır; bu pakette izin hatası/ikinci explicitretry UX'i ayrıca sınanmadı. P008/P047/P078 kısmi ilerleme;90hedef sürer.
