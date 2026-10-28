# Rapor720 — Son grup takılmasında gerçek ses korunumu ve seçili onarım

Başlangıç `400547211f70195acf54de4c42f27557888bcd1f`; araç/test bitişi `b1bdbd1be72cd363d348e84367ba7d4448be7b73`; dal codex/voice-stall720.

Yeni ürün bugı **0**. R683/R587/R588 tarihsel son grup/cache senaryosunun mevcut kodda gerçek GPU/ses entegrasyonu genişletildi; eski kontrollü testi yeni keşif diye saymadım. Ürün motoru ve kalite eşikleri değiştirilmedi.

## Hangi hata gerçekten üretildi?

`tools/dub-stall-acceptance.py` açık opt-in, gerçek EngineSession/uret/generate_with_fallback/bounded_call/ASR/yazıcılar, kurulu nano-vLLM/VoxCPM2 ve4070SUPER kullanır. İlk cümle gerçek modelce üretilip ready cache'e yazılır. Yalnız ilk motorun son generate isteğine proxy sınırında sonsuz bekleme, ilk cancellation finally yoluna da bekleme enjekte edilir. Production30srequest sınırı ve bounded ikinci cancel aynen çalışır.

Bu **doğal nano-vLLM takılmasının veya gerçek GPUkernel/RPCdeadlock'unun yeniden üretimi değildir**. Modelin ilk/son ses üretimleri gerçektir; hata parent async iterator sınırında kontrollüdür. Model yükleme, referans kodlama, sağlıklı ses/verifier, durdurma ve yeni motor gerçek süreçlerdir. Ağ/API/kişiselprofil/anahtar yok; sentetikSAPIreferans ve ikiTürkçecümle kullanılır.

## Sonuç: teknik toparlanma geçti, ilk son-parça kalitesi geçmedi

[İlk toparlanma kabulü](STALL720_2026-10-28/acceptance.json), [ilerleme çerçeveleri](STALL720_2026-10-28/events.txt):

- İlk grup ready/ASR1.0. Takılma öncesi ve sonrası SHA256 `78f9c3db414311c0ea0890361134c10bf010c10e44440a660ed05621ad7647d2` aynı; replacement engine ilk grubu yeniden seslendirmedi.
- Tek engine_restart, toplam2gerçekmodelmotoru. Son grubun seed'i628305608→628405611; restart aynı hatalı seed'i tekrarlamadı. Ayrıca mevcut kalite yeniden denemesi628605614 ile çalıştı.
- DUB_METRICS:1cache/1yeniüretim. NihaiWAVexit0. Ölçülen106.313s model/timeout/reset/ASR/yerleştirme/kapanışı içerir; yalnız timeout süresi değildir.
- Gözlenen2GPUworker process objesi kapanmış; tümOSçocuklarının ayrı envanteri bu araçta yapılmadı.
- **Son grubun ASR0.0, review olması doğruydu.** İngilizce referansla çıkan bu aday Türkçe metni bozdu. WAV'ın oluşması kalite başarısı diye sunulmadı; ilk acceptance.complete teknik toparlanma demektir, tümgruplarready demek değildir.

## Aynı referansla yalnız sorunlu grubu onarma

`--repair-existing <bu-aracın-çıktı-klasörü>` yeni hata enjekte etmeden aynıSRT/seed/referansla yalnız `--force-groups 2` uygular. İlk WAV hash'i hem önce hem sonra kontrol edilir; üretim metrikleri1cache/1yeniolmalıdır.

[Seçili onarım kabulü](STALL720_2026-10-28/selective-repair-acceptance.json): nihaiaracın onarım yolu31.407s; ilkgruphashdeğişmedi, iki grup ready, ASR1.0/1.0. Önce bağımsız yerel prob23.766s'de de1.0/1.0bulmuştu; son kanıt nihai31.407skoşusudur. Herhangi bir referans değiştirilmedi. Bu bir başarılı örnek, tümseed/konuşmacı/dillerdeinsandoğallıkgarantisi değildir.

İlk tamfaultdenemesi teknikWAV'ıüretse de aracım generation_report'u yanlışklasörde arayıp exit1verdi. Başarı saymadım. Nihaiaraç işiylebağlıstdoutDUB_METRICSçerçevesini okur; ortakcacheklasöründeki rapora dayanmaz. Bu ürünbugıdeğil, denetimaracıhatasıydı ve tamfaultkoşusu yenilendi.

## Çalıştırma ve sınırlar

```powershell
& "<VoxCPM2>\.venv\Scripts\python.exe" tools/dub-stall-acceptance.py --run-real-gpu-stall --engine "<VoxCPM2>" --reference "<sentetik.wav>" --verify-python "<backend-python.exe>"
# Son grubu yeniden denemek (yeni stall enjekte etmez):
# Aynı komuta --repair-existing "<önceki-çıktı-klasörü>" ekle.
```

Gerekli motor/model önceden kurulu olmalı. HF_HUB_OFFLINE=1; model indirme veya ücretli sağlayıcı yok. Ses/cache aynı üretim yolu üzerinden gerçek motorun OUTPUT_ROOT altında sentetikanahtarlara yazılır; özelkanıt/WAV/log .uiprev/voice-stall altında. Kişiselcache silinmez, kullanıcıuygulamasına dokunulmaz. Ham WAV/log/özel yollar Git'e alınmadı; yalnız sentetikSRT/seçilmişJSON/çerçeve yayımlandı.

23mevcut generation_quality testi PASS, py_compile/diff PASS. Final repair branch gerçekGPU'da PASS. Yeni dependency/ayar/şema/UI yok; screenshot gerektiren değişiklik yok. start.bat/install.bat/gerçekUIiptali/YouTube/DRM/OOM/OSkapanışıveinsandinlemesi bu pakette sınanmadı. CI/tamtest beklenmedi.

[Python3.11 asyncio timeout/cancellation sözleşmesi](https://docs.python.org/3.11/library/asyncio-task.html#asyncio.wait_for) incelendi. Kurulu nano-vLLM'nin `models/voxcpm2/server.py` finally yolunda `await self.submit("cancel",seq_id)` yaptığı görüldü (465satır civarı); mevcut dub_lifecycle bounded ikinci iptal yaklaşımı buna göre sınandı. Dışkod/dependency alınmadı, installedenginekaynağı değiştirilmedi.

P045/P049/P009 kısmi: kontrollü sonistek+gerçekGPUcachekorunumu ve seçilionarım kanıtıeklendi. Doğal motor takılması,60/61ölçekliuzuniş, gerçekOOM, reset'in de başarısızlığı ve bütünUIaşamaları hâlâ ayrı. MüzikP081–P090kapsamdışı;90hedefbitmedi.
