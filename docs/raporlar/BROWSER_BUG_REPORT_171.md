# BROWSER_BUG_REPORT_171 — R192: transcribe.py kuyruk denetimi + renderer dev fonksiyonlar

- **Dal:** `codex/r192-deep-audit` (master `1de9826` üzerinden)
- **Tür:** derin denetim turu — doğrulanmış bug yok; ürün kodu değişmedi.
- **Kapsam:** bu turla birlikte `backend/transcribe.py` (8532 satır) **tamamı**
  raporlanmış oldu; `src/renderer/renderer.js`'in en büyük fonksiyonları okundu.

## Okunan bölgeler ve sonuç

### backend/transcribe.py — kuyruk (7597–8532)

| Bölge | İçerik | Sonuç |
|---|---|---|
| 7597–7729 | `srt_time_to_seconds`, `_SRT_TIMING`, `repair_mojibake`, `repair_cp1254_as_latin1`, `read_subtitle_text`, `parse_srt`, `parse_ass` | Sağlam. Kodlama zinciri (utf-16 BOM → utf-8-sig → cp1254 → latin-1 + mojibake/cp1254 onarımı) doğru sıralı; `parse_srt` timing-index yaklaşımı ayraçsız SRT'lerde sıra numarasını metinden ayırıyor; `parse_ass` Format satırını dinamik okuyup eksik değerli satırları atlıyor; `\h` → NBSP çevirisi var. |
| 7768–7856 | `parse_ass_cue_formats`, `cue_format_decorations`, `_decorate`, `parse_subtitle_entries` | Sağlam. `\an`/`\pos`/italik çıkarımı yalnız başlık override bloklarından; SRT'de yalnız üst-hizalama (7-9) etiketi emit ediliyor, VTT'de italic `<i>` olarak. |
| 7860–7934 | `shift_srt_entries`, `sync_output_path`, `write_srt_raw`, `build_binary_signal`, `audio_energy_signal` | Sağlam. Negatif zaman kelepçesi + min-gap, atomik yazı (`atomic_text_writer`), RMS adaptif eşik (medyan×1.5 + tepe×0.02), 60sn'lik parçalı WAV okuma (bellek güvenli). |
| 7937–8150 | `best_offset`, `FRAMERATE_RATIOS`, `best_offset_scored`, `find_sync_transform`, `_segment_score`, `_block_fit`, `refine_split_point`, `find_piecewise_offsets` | Sağlam. FFT çapraz-korelasyon normalize skorlu; %8 skor iyileşmesi şartı oran değişimini gürültüye karşı koruyor; parçalı hizalamada split-penalty (min_diff 0.25s, gain %6) gereksiz kırılmayı engelliyor; `refine_split_point` kaba sınırları blok bazında keskinleştiriyor ve parçaların boş kalmaması garanti ediliyor (`k = min(max(k, a0+1), b1)`). |
| 8153–8286 | `apply_piecewise`, `sync_subtitles` | Sağlam. Parça sınırında çakışan cue üretilemezse `None` → çağıran sabit kaymaya düşüyor ve kullanıcıya warn; üst-sınır kayması + oran değişimi ayrı warn olarak `done` olayında raporlanıyor; workdir `finally`'de temizleniyor. |
| 8288–8532 | `main()` + argparse + dispatch | Sağlam (önceki turlarda okunan kısımla tutarlı; argüman-çıkış sözleşmesi eksiksiz). |

### src/renderer/renderer.js — en büyük fonksiyonlar (R192 okuması)

| Fonksiyon | Satırlar | Sonuç |
|---|---|---|
| `runBrowserShortcut` (411) | 12042–12453 | Tüm kısayol dalları `?.`/guard'lı; Ctrl+W açık dialog varken sekme kapatmıyor; sekme indeksleme `visibleBrowserTabsInDisplayOrder` üzerinden sınır kontrollü. |
| `rank` bloğu sonu + `playerStream`/`playerQuality`/`playerAudioLang`/`playerAudioLock`/`playerDownload` dinleyicileri | 27527–27951 | URL-değişimi koruması (`mediaKeyFor` eşleşmesi) hem izleme hem indirme yolunda; `pendingAutoOpen` niyet anahtarı doğrulanıyor; ses kilidi HLS/progressive ayrımı doğru. |
| `interruptHlsStability` + video olay demeti | 21906–22051 | `waiting`/`stalled`/`loadstart`/`seeking`/`pause` kararlılık kesintisi tutarlı; seek sonrası `_abPrevT` güncellemesi A-B döngüsü tuzağını kapatıyor; `loadedmetadata`'da playbackRate geri uygulanıyor. |
| `uygula` + araç paneli + AI sohbet dinleyicileri | 21740–21905 | localStorage try'lı; sekme/gezinme roving-tab ve odak yönetimi doğru; sohbet temizleme çalışan işte engelleniyor. |
| `lt` + `renderCueList` gövdesi | 13641–13778 | 500'lük sayfalama, `cueListPageStart` kelepçesi, `escapeHtml` tutarlı; boş-durum CTA'ları (tracks/no-media/none) ayrık ve doğru devre dışı. |
| `fetchSubsWithActiveSource` + `playerProbe` | 27389–27526 | Probe sonuçları `probeSeq`+`currentGeneration`+URL-eşleşmesiyle staleness'a karşı korunuyor; `info.sourceUrl`/`videoKey` probe anındaki URL'ye bağlı. |
| `runBrowserChromeCommand` + tarayıcı düğme bağlamaları | 11668–11827 | Ayarlar-görünürken komut engeli, http açma diyaloğu tehlike niyetli, uyumluluk/izin/yakalama geçişleri disabled-while-async + hata geri-dönüşümlü. |
| `saveCueEdit` | 23536–23724 | Çok katmanlı koruma: medya/iz kimliği + `cueSignature` + revizyon çakışması + `mergeCont` belirsizliği + ASS/VTT ham-payload koruma + yazma başarısızsa bellek dokunulmuyor + undo 100 sınırlı. |
| `updatePlayerAutoSyncState` + auto-sync/`makeTransBtn`/`retranslateAllBtn` | 21144–21283 | `state.running`/`queueRunning` çift kapısı; çeviri işi önceki output'ları `previousOutputs`'a alıp hata yolunda geri yüklüyor; `translateExisting` yalnız çeviri rolü taşıyan ize bağlanıyor; `browserTrackSourceLanguage` ana ekran dil seçimini geçersiz kılıyor. |
| `updateSeekThumb` + visibility + keydown demeti | 22293–22442 | Sprite-sheet sayfa/hücre hesabı kelepçeli; `probe.onload` sheet mutasyonu sayfa kimliğine bağlı; Esc zinciri `dialog[open]` korumalı; tarayıcı kısayolları metin-alanı dostu. |
| `processNextQueueItem` | 646–785 | `persistQueueNow` başarısızsa durum geri sarılıyor; spawn öncesi iptal yarışı kapalı (`status`/`currentQueueId` yeniden doğrulama); başlatma hatasında `busy` regex'iyle duraklatma vs. hata ayrımı doğru. |

## Bulgular

Doğrulanmış bug **yok**. İncelenen tüm yüzeylerde sınır kontrolü, atomik yazma,
staleness (generation/seq) kapıları ve hata yolu temizliği mevcut. Kalan tek
açık konu PR #119 başındaki getirilemeyen "1 potential issue" Devin Review
yorumu (API 404 — inceleme kaydı başa göre anahtarlı); yeni bildirim gelirse
triage edilecek.

## Windows etkisi

Yok — ürün kodu değişmedi. Windows doğrulama turu paralel Windows Devin
oturumunda ayrıca koşuyor (çoklu hesap, Stremio indirme, start.bat+GPU,
install.bat, paketleme dışlaması, R190 yüzeyleri, DeArrow/RYD).
