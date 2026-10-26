# Rapor 602 — Task01 ses motoru denetiminin bağımsız doğrulaması

Başlangıç375f8cb0b4d70f5e440c29dd86d0c12a5bf7da61; dal codex/audio-audit602; ürün/test commit c889be7a9b4c632c9bc668e3e945bd39cc8fca5a.

## Alınan paket ve kanıt sınırı

`files (4).zip` SHA25664d7eb4cadfde35626d4f1bf1551fbe57823a7d354e7e80f338debeed336f027. Dış ZIP6girdi/743068açıkbayt; iç TASK-01-bf954ed0.zip145girdi/6224872açıkbayt. Traversal/boyut kontrollerinden sonra ignore edilen tmp/files4-review602 altına çıkarıldı; ZIP okuma/CRC hata vermedi. Dış rapor/JSON/matris/patch ve içerideki probe/harnessler okundu. Shell kurulum betikleri çalıştırılmadı; patch otomatik yetki sayılmadı. Snapshot bf954ed0… eski; her bulgu güncel başlangıçta ayrıca sınandı.

Bu kez dokuz runtime kökü yeniden üretildi. Node5probe doğrudan güncel kaynakta FAIL_CONFIRMED verdi. Python4probe önce Windows ağırlık adaptöründe safetensors/torch stub uyumsuzluğuna takıldı: bu ürün hatası sayılmadı. Yalnız motor/ağırlık-yükleyici sınırı açık stub yapıldı, gerçek Windows soundfile+libsndfile ve FFmpeg kullanıldı. Dokunulmamış git archive başlangıç kopyasına src/tools/backend birlikte konularak Python baseline tekrarlandı; ilk eksik backend/subtitle_text uyarlaması da ortam/probe hatası olarak ayrıldı. Sonra4gerçek baselineFAIL ve düzeltmeli4PASS doğrulandı. Kullanıcının gerçek GPU modeli/sesi/API'si kullanılmadı.

## Dokuz kök ve sonuç

| Bulgu | Başlangıç gözlemi | Uygulanan sonuç |
|---|---|---|
| F01 sıcak başlatma iptali | release beklerken cancel ok, iptal edilen işe1argv, üçüncü iş reddi, quit eskiişi bekliyor | Başlatma fazı/iptal kontrolü. cancel fazı bekler ve sonradan atanmış süreci dinamik alır; kapatma tek paylaşılan promise. Son probe:0argv,tek cancelled,üçüncü iş kabul,quit yeni işi beklemiyor. Hem keepEngine hem coldrelease yolu korunur. |
| F02 canlı host error sahipliği | error sonrası running:false,2canlı host,ilkine terminateyok | PID'li host close'a kadar tutulur,tekrar error dinlenir. Sonuç1host,ikinci start busy,ilk terminatehedefi korunur. ENOENT PID'siz kontrolü hâlâ terminal hata. |
| F03 DONE'suz close0 | sentetik iş close0başarı | Geçerli DONE yoksa host/release close0hata1; açık tanı. Normal DONE0başarı kalır. |
| F04 geç stderr | Atraceback Bstderr'ine sızıyor,A'nın nedeni yok | İş-ID'li BEGIN/END,eskiworker uyumu ve bounded drain; **ayrıca** DONE'a32768Pythonkarakter tanı kuyruğu eklenir. İlk BEGIN bile geç gelse neden stdoutüzerinden aynı DONEile gelir; yeni işle ilişkilendirilmez. JS65536UTF16sınırı ekUnicodeboyutu karşılar;stderrmarkerbuffer65536sınırlı. NativeCfileno stderr'i bu Pythonkuyruğuna girmez; bu kapsam için mutlak tümOSstderr garantisi verilmez. |
| F05 küçük ilk iş kapasitesi | kullanıcı4,tekgrupsoğukload1,sonraki11istektepeak1 | configured_concurrency ile hostkapasitesi veişkabul sayısı ayrıldı. StubVRAM20GiBsenaryosunda ilkload4,tekgrupkabul1,sonrakipeak4,hosttekdefayüklenir. GerçekGPU4×hız ölçümü değildir. OOMdüşürme iki sınırı da düşürür. |
| F06 reset hatası stall'ı maskeler | TimeoutError,WAVyok,1sahipsiz verifier | Reset herverifier'ı ayrı kapatmayı dener,kapanmayanı stuck_verifiers'ta tutar;asıl EngineStalled finally'de maskelenmez. Kapanamayan verifier varken yeniGPUhost açılmaz; sınırlı fallback tamamlanan sesleri kurtarır.8grupfixture:WAVvar,7ready+1failed,0sahipsizverifier. OS'nin gerçekten kapatamadığı süreç için kapandı iddiası yok;owned+uyarı+yenidenkapamadenemesi. |
| F07 WAV/metadata diskdolu yarışı | yenidalga,eski readymetadata;sonrakiişreadykullanıyor | Eski sidecar yeni WAV yerleşmeden geçersizleştirilir,metadata stagedwrite+replace ile yazılır;stageddosya finally temizlenir. Diskdolu enjeksiyonunda sonraki kayıt review/unavailable,eski readydeğil. Diskdoluyken tümçıktı yazılır garantisi yok. |
| F08 kesilmiş cachedWAV | record3.24sn;libsndfile1.944sn okur,valid_audioTrue,anaakıshotümhazır+ready | Teknikvalid_audio yanına kayıtlısüre/samplerate/frameeşlemesi(±1ms/2frame) eklendi. Sonuç3.24sn dosya yeniden üretilir,tümhazırmesajı yok. Geçersiz durationbool/NaN/Inf/sıfır/dizge reddedilir. Metadata yoksa cache review-only kalır. Aynısüreli keyfîbaytdeğişimini kriptografik bağlamaz. |
| F09 optionalkatman | müzik/background playreject/error tümvoiceoturumunukapatıyor | YalnızbozukkAtman failed+pause olur,epochiptaliyle geç playpromise etkisizleşir;başkakaynakseçildikteresetlenir. Voice/oturum/özgünmute korunur;EN/TRuyarı. Ana voice hatası hâlâ tümoturumu kapatıp özgün sesi geri açar. |

## Öneri patch'inden ayrılan güvenli iyileştirmeler

- İptal yalnız startPhase beklemekle bırakılmadı; fazdan sonra atanmış proc gerçekten sonlandırılır. Aynı işlemi ayrıca fire-and-forget terminate ile iki kere başlatma kaldırıldı.
- F04 BEGIN'in DONE'dan önce geleceği varsayımı yetmez. Bounded request stderr tail aynı stdoutDONEJSON'unda taşınır; ilk stderrBEGIN'den önceDONE ve geç Atraceback/Bbaşlatma kalıcıtesti eklendi. Eski framed/no-end üreten fixture'larda500msdrenaj korunur; normal yeniPythonDONEkuyruğunda ek500msbekleme yok.
- Stuckverifier varken yeniGPUyükleme engeli eklendi; yalnız listede tutup VRAMüstüne yeni doğrulayıcı/motor açılmaz.
- Süre alanındaki bozuk değerler açıkça reddedilir;metadata staged dosyası hata halinde temizlenir.

## Tekrarlanabilir kanıt ve testler

Yerel kanıt klasörleri tmp/audit602-baseline (ilkNode),tmp/audit602-baseline-real-sf (düzeltilmişWindowsadapteriylePythonbaseline),tmp/audit602-final (9sonprobe+protokol). run602/final602/py-baseline602 sürücüleri aynı incelenmiş paket probe'larını SNAPSHOT_ROOT ile çalıştırır. Başlangıçkaynak kopyası gitarchive375f8cb0'dan; kullanıcıçalışma ağacı oraya karıştırılmadı. PaketP10'un `regenerated` göstergesi önceki motorolaylarını da saydığı için baseline'dabiletruegörünür; sonuç bu göstergeye değil gerçekframe/süre veallReadyMessage'a dayandırıldı.

Kalıcı regresyonlar:
- tests/dub-engine-worker.test.js11test:liveerror/tekrarlananerror,DONE'suz0,ilkBEGIN'denönceDONEtanısı dahil.
- tests/dub-service-warm-start.test.js1test:varsayılan keepEngine yolunda release/iptal,tekterminal,0argv. İlk testkurgusunda clipmodu/terminalbeklemesi eksikti; doğru sözleşme ve gözlenenolay beklemesiyle geçti. Sırf yeşil için ürün eşiği gevşetilmedi.
- Mevcut tests/dub-service.test.js ve browser-dub-audio.test.js geçti. BirleşikNode runner14sonuç,package-integrity9kontrol geçti.
- tests/test_audio_audit602.py4; test_dub_runtime.py4; test_dub_worker_protocol.py5; test_dub_generation_quality.py20; test_dub_quality.py9 geçti. Protokoltanı32768sınırı,diskdoluykenreadydevri,gerçeklibsndfilekesilmesi ve ikinciGPUhostengeli kilitlenir.
- İncelenmiş dışpaket9probe'un tamamı sonhaldePASS; ekP05protokolmatrisiPASS(yanlışID,kodtürleri,UTF8baytparçaları,satırüstboyutkontrolleri). Üçüncütarafraporun693dosya/52başarısız/20tekrarölçümü burada aynen tekrarlandığı iddia edilmedi.
- Gerçek Windows Electron tests/electron-dub-layer602.smoke.js geçti. Kanıt .uiprev/audio-layer602-1793014471617/result.json. Gerçek HTMLAudioElement,yerelsentetikmutedWAVvebozukBlobkullanıldı;bozukmüziktevoiceplaying/sessionalive,anaWAVhatasındaoturumkapalı/originalmute=false. Playerbağlamı/muteIPCfixture'dır;gerçekYouTube/OSsesdonanımı/GPUkalitesigeçtidenmez. Bu turCSS/tasarımdeğişmediiçingörseliyileştirmeiddiasıyok.
- DeğişenJSnode--check,Pythonpy_compile,gitdiff--check geçti. Yeni bağımlılık yok;kurulum/start.bat değiştirilmedi. Tamnpmtest/uzunCI/gerçekGPU/TTS/61grupölçeği/ücretliAPI/DRMkoşulmadı;CIbeklenmedi.

## Kalan sınırlar

PaketinE10c61grupbileşimi,E11bazıaşamaenjeksiyonları,E18eşadexportyolu bu turtamamlandı sayılmaz. E14DC/impuls/çokazgürültü teknikvalid_audio'dangeçebilir;bu semantikkonuşmadetektörü değildir. EskiF04legacyişsizstderrformatındamutlaknesilmensubiyetgarantisiyok;yeniPythonprotokolüscopedsummaryilekorunur. KalıcıOSError/EPERMkapatmabaşarısızlığı kullanıcıyauyarıdır,başarısızkapandısonucuüretilmez. ÖncekiRapor601'dekiPDFsütun/sayı-anlam/I-ıaçıkları bukonudüzeltmelerlekapanmadı.

KişiselOFFLINE-MANIFEST,anaINDEX516satırıve115untracked dosya kapsam dışında. Uygulamaaçıkoturumukapatılmadı;yenikodsonrakiaçılıştakullanılır. JSONsidecaraynıalanlarlaatomikyazılır;workerDONE'aopsiyonelstderrkuyruğueklendi(geriyedönükparseruyumuvar). Kod/belgecommitlerayrıdır;normalPR/masterteslimidevirnotunda.
