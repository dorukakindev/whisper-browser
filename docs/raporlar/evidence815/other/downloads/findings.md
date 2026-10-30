# Browser indirme denetimi — 1 yeni doğrulanmış kök

HEAD: 6a789329d96c4f97cdc17bd9518df0b540b13444. Ürün/test/Git değişikliği yok. DL01 P2; bulgu sayısını doldurmak için tasarım sınırı/önceki bulgu sayılmadı.

## DL01 — İndirilen M4B için gösterilen Oynatıcıda aç işlemi backend beyaz listesinde reddediliyor

Kaynak: browser-downloads.js:142–148; renderer.js:9275–9278,9302–9303; main.js:15698–15702,18183–18186; preload browserDownloads binding.

**Tekrar:** repo kökünden `node .tmp/next815-downloads/probe.cjs`; opsiyonel `R815_DOWNLOADS_OUT` farklı çıktı tabanı. Her run ayrı dizin; mevcut kanıt üzerine yazılmaz. HEAD metadata için `R815_AUDIT_HEAD` opsiyonel.

**Beklenen:** Uygulamanın MEDIA_EXTS listesinde ve renderer oynatılabilir denetiminde bulunan M4B dosyasında gösterilen açma düğmesi mevcut dosya için path döndürmeli ve yerel oynatıcı geçişini çağırmalı.

**Gözlenen:** m4b ve M4B: düğme görünür, result.ok=false, desteklenmeyen medya türü hatası, openLocalMedia çağrılmaz. m4a ve mp4 aynı zincirde ok=true ve openLocalMedia çağrılır. zip düğmesi gizlidir ve IPC reddeder.

**Kök:** browser-downloads.js bağımsız open-player uzantı regexinde m4b yok; renderer regexi ve main MEDIA_EXTS aynı uzantıyı kabul ediyor.

**Etki:** Tarayıcıdan indirilmiş sesli kitabı indirmeler panelinden uygulamanın yerel oynatıcısına açma yolu her denemede başarısızdır. Klasörde göster çalışır; elle dosya açma geçici yoludur. Dosya kaybı iddia edilmez.

**Kanıt:** probe.cjs SHA256 95e55e89082bb1b7de97639e614d096e8d0d1e796fcd485470ac8d6af3b1880f; runs/run-wxYBKi/result.json exit0. JSON mevcut dosyaların SHA256 değerlerini ve tüm karşı kontrolleri içerir. Dosya byte fixturedır; codec çözülmez. Bu nedenle ret uzantı kontrolünde kesin kanıtlanır, M4B decoder başarısı iddia edilmez.

**Önceki kapsam:** R815 önceki118 içinde B10 kitap çıktı güncelliği ve B94 backend adaptive temizlik bağımsızdır. R64-25 yetki kökü aynı olaydan sonra ayrı bir kontroldür; burada önce uzantı reddedilir. R46-10 slot ve R167 terminal resume sınırı yeniden sayılmadı. Registry içinde browser-downloads.js imzası yok; ortak main/renderer/preload kaynaklı80satır aşağıdadır. Tarihsel PASS bu invariant için kanıt diye kullanılmadı.

**Sınır:** Controlled DownloadItem EventEmitter and DOM facade; real module, IPC callback and renderer consumer unchanged. No HTTP/Electron/native save dialog/codec decode/playback, start.bat, GPU or personal profile used. Fixture bytes are not an encoded audiobook; rejection occurs before decoder.

**Dış kaynak:** Electron resmi DownloadItem belgesi (https://www.electronjs.org/docs/latest/api/download-item) güncel updated/interrupted, done terminal durumu, native save path ve resume semantiği için incelendi; dış kod/bağımlılık alınmadı.

## Kapsam matrisi

Yeni invariant: rendererin tamamlanmış M4B için gösterdiği açma yeteneği gerçek download handlerıyla aynı olmalı. Doğrulama gerçek manager+IPC callback+renderer tüketicisi, sentetik DownloadItem/DOM/disk ile sınırlıdır.

| Önceki ID | Aile | Mekanizma | Tarihsel imza | İlişki |
|---|---|---|---|---|
| N0281 | F15 | normal | 8def892bdddaf4d4ae43683a2561c8a4f052f4286306119248bbea3beda7bbf9 | Ortak kaynak, download invariantı değil |
| N0282 | F15 | bos | c09cc98b848a4f13938d2222fc4c70d78b426b7555f078d1877e3fd16f0a360a | Ortak kaynak, download invariantı değil |
| N0283 | F15 | sinir | 2d47494697cb3a7b171564302b2f8c920ed06ea3f366ac44c237b978d04f6df0 | Ortak kaynak, download invariantı değil |
| N0284 | F15 | unicode | add6c124e0a5f4a509c419418f82e955164cb49f35a5171feacc96421a993dcc | Ortak kaynak, download invariantı değil |
| N0285 | F15 | yinelenen | 566c32fa473a5b6f5f43471267418f8b78b13a1cd6c696b1c3538d3aa83b7a5b | Ortak kaynak, download invariantı değil |
| N0286 | F15 | sira | 33b30dc4d2387948857345e25ef43461ceca33fd034a1b1643ba59cb321a2f90 | Ortak kaynak, download invariantı değil |
| N0287 | F15 | iptal-oncesi | 2bd298a78cbd107d381799590f727bd3fe5278ccf7731d2c37f5506956f10557 | Ortak kaynak, download invariantı değil |
| N0288 | F15 | iptal-ortasi | ebd178a8f71ffac0478abc795597232f5be492e35d480db9895ec77965bef816 | Ortak kaynak, download invariantı değil |
| N0289 | F15 | gec-sonuc | ad477ca266b25ef7d5fcf57ae1060d86583b23a72830868a9e8bc54c820fcbfb | Ortak kaynak, download invariantı değil |
| N0290 | F15 | kaynak-degisimi | 7bca9647110d08d458de0269ec1f682f1ff2b966e37a4ddb2789426b456b4c82 | Ortak kaynak, download invariantı değil |
| N0291 | F15 | es-zamanli | e9b55deb5276d435c27975494490b9d59410c008c33af626d5fc817a9950b0be | Ortak kaynak, download invariantı değil |
| N0292 | F15 | kesik | bb3ef818f23acf887b8a0022bcb918c41e4c5f3cf97bb925ca94da972347857f | Ortak kaynak, download invariantı değil |
| N0293 | F15 | hata | 2ea803ece944accbf7506f5d3139be3e2d06fe4ae9b7e28c13798ed429859387 | Ortak kaynak, download invariantı değil |
| N0294 | F15 | timeout | 8137dbf19890ed4f6b2ea5846cae853a5ecec029133a945a25303aeaa5a9758b | Ortak kaynak, download invariantı değil |
| N0295 | F15 | yeniden-giris | eb2b401b9aaee260e707463849029dc5d698d1605f4fdf721d9937a313de6a4d | Ortak kaynak, download invariantı değil |
| N0296 | F15 | donusum | fe8c3dac9f54a0b91d2f2f3e3dffabeac0086553e87d27230ca2aa3ca5a4eb6a | Ortak kaynak, download invariantı değil |
| N0297 | F15 | yetki | 86cf473789dbbcd25d9d45ab98ae02a21feed1eea6100293e89a50db458efe1c | Ortak kaynak, download invariantı değil |
| N0298 | F15 | kaynak-butcesi | 45758f3ef352f465ba0165971ee58ae3912ddf60c804ea0b9180462dc0a6a077 | Ortak kaynak, download invariantı değil |
| N0299 | F15 | kullanici-geribildirimi | 51cd6dfc70aa3dfde590efc1ecc7fce91d1a9d70651c32261b47c88002a100a5 | Ortak kaynak, download invariantı değil |
| N0300 | F15 | birlesik-akis | b87f4d1c0ddb6b98affbc1231fecae940146c6381570cddbed96042259f0e7ac | Ortak kaynak, download invariantı değil |
| N0361 | F19 | normal | 23d37135a10a2c3307fbb9249a3e816c0519efa1d9387e0b524b0d1fe7ca73c0 | Ortak kaynak, download invariantı değil |
| N0362 | F19 | bos | 19731bb519e2636b477fdea9ba9edeeec78ef4cfcd38aaaf6fa6c4a57a8d2f83 | Ortak kaynak, download invariantı değil |
| N0363 | F19 | sinir | ea70dfa74ffbec1fc902b5c743286b90e0b14d85c772907371f748e7827541c0 | Ortak kaynak, download invariantı değil |
| N0364 | F19 | unicode | 24cec33bca54a41c73b70eaf667732ef81c1a4727be9ec31a6c176b319cf15ab | Ortak kaynak, download invariantı değil |
| N0365 | F19 | yinelenen | 3c1583e1752e9af4e6e48e3c52a1198e36a28ace625a67b4900f6856d1e7c88c | Ortak kaynak, download invariantı değil |
| N0366 | F19 | sira | 107dc3b1c4741f11b5ffb66a42ec7a6dfedb7d62f155619c715c7d73400c6644 | Ortak kaynak, download invariantı değil |
| N0367 | F19 | iptal-oncesi | b12bf1843130754c242813dfd96bd9cb8f1dfd036bfb5b5e0342286ef79a02d8 | Ortak kaynak, download invariantı değil |
| N0368 | F19 | iptal-ortasi | 937d8043c4501f44fa91e4a5d315b29bd69aff277ac6d77c281bdc8e5bf5f8bf | Ortak kaynak, download invariantı değil |
| N0369 | F19 | gec-sonuc | 77801a08805d0e0047051e30682bfecfb8570f9fc92ed3f6809cdde8a802a1bb | Ortak kaynak, download invariantı değil |
| N0370 | F19 | kaynak-degisimi | 092514eaa2d9f4f57c24d9bb00c5fc003006ead94479f11d572c9484599a1695 | Ortak kaynak, download invariantı değil |
| N0371 | F19 | es-zamanli | f88f83d60ec935632eddde506b010fda5dc8b2d80c4eec8b0a8cfa936ed846b9 | Ortak kaynak, download invariantı değil |
| N0372 | F19 | kesik | ccfaec70601cb76b5d72c0cf59155c2be2a897595cb68f5b1d87aa890c44190d | Ortak kaynak, download invariantı değil |
| N0373 | F19 | hata | 2d389ca36edbc732271d28d0a669be465739f4508dc9f5d4ff8107234b46e656 | Ortak kaynak, download invariantı değil |
| N0374 | F19 | timeout | 65f2a5c20928ff3db2301d79d3194588da1e48e5e902bc5f5740e367a9013e47 | Ortak kaynak, download invariantı değil |
| N0375 | F19 | yeniden-giris | 8ff9d0802d202945be426f4976f5e1f4dd78ab9e300891eb281f728304f5c129 | Ortak kaynak, download invariantı değil |
| N0376 | F19 | donusum | c97f84c3fc2c662c87f56d398fbf764c98cc8eaf8e48cb62623a78308b586e45 | Ortak kaynak, download invariantı değil |
| N0377 | F19 | yetki | 2f1c6211ee2da734e83c8f0e985abef7cc73f90c5354e0ed58b6561c4dadc243 | Ortak kaynak, download invariantı değil |
| N0378 | F19 | kaynak-butcesi | 2d67005901bc2ec1bb3c70fa9f636735adb418104a82fae09f17febf44ff2e92 | Ortak kaynak, download invariantı değil |
| N0379 | F19 | kullanici-geribildirimi | 7f206726b62e4695d9df0fe7784b39172c97f527f6463743f13161c4b76614bc | Ortak kaynak, download invariantı değil |
| N0380 | F19 | birlesik-akis | cc03c9ad88b5519fce0af0abc091f0963d5f5b3957e73391cc6381859ec45e51 | Ortak kaynak, download invariantı değil |
| N0861 | F44 | normal | 8f5e8b60a03e27f8ddb56e8ea5b5eaafc0a820aa20b646724f20298c5ed70505 | Ortak kaynak, download invariantı değil |
| N0862 | F44 | bos | a6d193d0ea746a8e9260621b53b751fccf5035bc07b8a4bda0f29a12195e8d26 | Ortak kaynak, download invariantı değil |
| N0863 | F44 | sinir | 4439e3bacb5b554ccb53e673632cf25000e9789fb6aa6ac15c34f30cb9de4010 | Ortak kaynak, download invariantı değil |
| N0864 | F44 | unicode | 8e9123b6cfb30fd901c02826b4b658bfa93c39ac63dbd1985d2779f0e7a5ac46 | Ortak kaynak, download invariantı değil |
| N0865 | F44 | yinelenen | 934a7daa9acf05f3dd47ba5a58c2cb7018d9c85ce44074d966be526d8f9e80ff | Ortak kaynak, download invariantı değil |
| N0866 | F44 | sira | a6832850902eacf1dde43b96c6f324ca80005932f4d218ebdd6725c5d47f61d7 | Ortak kaynak, download invariantı değil |
| N0867 | F44 | iptal-oncesi | 9abdea0d0a3b8ccbd0bb46002459eb1068ad0b863f8788e1bec1531397c44363 | Ortak kaynak, download invariantı değil |
| N0868 | F44 | iptal-ortasi | 38122e5a019ecd8c012e0a5dc5cb32029a2e2308eceb05107f36a6758994900d | Ortak kaynak, download invariantı değil |
| N0869 | F44 | gec-sonuc | aacfc2bf7c50d7fc2b5a777adcfd8fe9e52877985ebebcda8624e84867e98d6a | Ortak kaynak, download invariantı değil |
| N0870 | F44 | kaynak-degisimi | 1f7f702677c2024dba676fa3b1acd5a391e40296a8939bfe0c15684f3e1156e9 | Ortak kaynak, download invariantı değil |
| N0871 | F44 | es-zamanli | 0a6e199ea3ca324d75790ef9bfd77e17ab42cb0419618490204a9fdd49f25967 | Ortak kaynak, download invariantı değil |
| N0872 | F44 | kesik | 290714f288ed8397ded6a460d1312cea03286c94ecfe6ea39b1985c71bb4674f | Ortak kaynak, download invariantı değil |
| N0873 | F44 | hata | 9ee7ffbb06d2777f6c653998a0e5bdec0b8f253b536580fd10e86e4373333c47 | Ortak kaynak, download invariantı değil |
| N0874 | F44 | timeout | 203db3e0f11ef723e36251544f5552ba864bbd4c952afa13c8da1e217a145e7e | Ortak kaynak, download invariantı değil |
| N0875 | F44 | yeniden-giris | 08999fcaffdf914c01d28269d5fb90004301756e97e313ac3b6a8d9990c6bcb2 | Ortak kaynak, download invariantı değil |
| N0876 | F44 | donusum | 55219373ee5cb2e7e7132ac84a54daafe145c49f50044bc04b47e9e80e69c90c | Ortak kaynak, download invariantı değil |
| N0877 | F44 | yetki | 439275de7928ee2ac5c8efe9325399e69bdcc038b9c5aa8c0ac7250fffa81cfe | Ortak kaynak, download invariantı değil |
| N0878 | F44 | kaynak-butcesi | 4c110bed5d25080d56913de9ec92e726e0e09152c1369ef654192780070ece00 | Ortak kaynak, download invariantı değil |
| N0879 | F44 | kullanici-geribildirimi | 3d04e461556ce9c5495d182298348a62416c7aa88adbea04dc0f79df9a310e22 | Ortak kaynak, download invariantı değil |
| N0880 | F44 | birlesik-akis | 8c93a2955156d4dd5b48a2309d7fd9ebcb4e7a6a612d9dac60d75791c3b84679 | Ortak kaynak, download invariantı değil |
| N0941 | F48 | normal | ff539900e28e974d383e1b79973508898728bece037598c5af8f8d629bf4d31c | Ortak kaynak, download invariantı değil |
| N0942 | F48 | bos | 61fac7cd9b9536e6d70c5e3569517ccb14f0e88eb5ca620bda41efa1ccbea904 | Ortak kaynak, download invariantı değil |
| N0943 | F48 | sinir | 4846a5fa54f6276fe4dd5ff4ab2c2cd382707998cdadb20821f7e82ca78ab25d | Ortak kaynak, download invariantı değil |
| N0944 | F48 | unicode | 288d71c27987bf3b21fe1d68b5b457a2a313d89d01a4b956b80cddee69810861 | Ortak kaynak, download invariantı değil |
| N0945 | F48 | yinelenen | d11ba388b6ddcc24dc4c5e432f7c0ec85fc9c38da8cc9f51f02d94e5d4c70320 | Ortak kaynak, download invariantı değil |
| N0946 | F48 | sira | de70dade4c21821dff3f2b51b6b9bf1d41fb8d353545874c000d05ffb7887e5e | Ortak kaynak, download invariantı değil |
| N0947 | F48 | iptal-oncesi | ce925741a081b369e132ebcd359adfdce5fea24eee3556175e23c447cb940cd6 | Ortak kaynak, download invariantı değil |
| N0948 | F48 | iptal-ortasi | 5c3f86abac2fb93b79d1ae5f55ebc97fcb35e606dd0e428e3763ea2a6cdb3224 | Ortak kaynak, download invariantı değil |
| N0949 | F48 | gec-sonuc | dd3ec9b4c55e90235dc2633af4c5d3b302fdf83f83c26467414d31c817cb9b29 | Ortak kaynak, download invariantı değil |
| N0950 | F48 | kaynak-degisimi | 1c52779379538d4794093df9758dd6091f183b09986b63ee0986575193bc968f | Ortak kaynak, download invariantı değil |
| N0951 | F48 | es-zamanli | 33696490f214461f55a9e710115f8caf0ca8802c8d86714268052ec61b24c0fe | Ortak kaynak, download invariantı değil |
| N0952 | F48 | kesik | d783b795b1e6c8ca0952e7ed6891873148b16504ad1112d8744b541f4d019d09 | Ortak kaynak, download invariantı değil |
| N0953 | F48 | hata | e5b65f8318b3abfb79c90f117229db9765705bea8fc025a2bd3f2a5587dea9d2 | Ortak kaynak, download invariantı değil |
| N0954 | F48 | timeout | 428f23bc90dcf5a8e7dc729629182f97fe10ff7a826086287781e73be310e882 | Ortak kaynak, download invariantı değil |
| N0955 | F48 | yeniden-giris | 0e41696fa7b551104b57edccdf00f52c3584502ad40bb0373c91a2e02a92c0b8 | Ortak kaynak, download invariantı değil |
| N0956 | F48 | donusum | 36be1fb586cf63839ca077b2cabc3a284d0860346038e252b9a35813d48dfa01 | Ortak kaynak, download invariantı değil |
| N0957 | F48 | yetki | 61c9729dc0d44930800c5730c480629c20db4fec893b986c96c2d84f980aab6d | Ortak kaynak, download invariantı değil |
| N0958 | F48 | kaynak-butcesi | 4e9eb61ee02c747dfd378ff4864d14980fb5d1ddf7b8f33c8822f3f29cddcc77 | Ortak kaynak, download invariantı değil |
| N0959 | F48 | kullanici-geribildirimi | 9198baaa112d4f7650295d29b77587f17ba508130e1b690669743db3c7ec8060 | Ortak kaynak, download invariantı değil |
| N0960 | F48 | birlesik-akis | 1f1c77553b352ccd115beaad30a7bc835f9fcaeb9130d9ce7a65378d8dfba87a | Ortak kaynak, download invariantı değil |

## Dışlanan adaylar

- **Terminal geçmişten resume yok:** R167 belgeli gizlilik tasarımı; URL bilerek saklanmıyor.
- **Resumable interrupted/paused canlı slotları tutuyor:** R46-10 tarihsel kapsam; tekrar yeni bug değil.
- **open-player mediaFileAccess grant eksikliği:** R64-25 önceden raporlandı; bu tur yeniden sayılmadı.
- **Native save/overwrite dialogu atlanıyor:** Modül setSavePath çağırmıyor; fixture bunu throw yaparak karşı kontrol sağlıyor; native diyalog/overwrite canlı sınanmadı.
- **Destroyed native getter sızıntısı:** R476/R479 savunmaları mevcut, yeniden keşif sayılmadı.
- **İlk probe DOM satırı yok assertionı:** Probe successful open sonrası panel hidden durumunu bir sonraki case için açmıyordu; facade/probe kusuru, ürün bugı değil. Kaynak renderer render çağrısı ile görünür panel önkoşulu kuruldu.
- **Probe git spawn EPERM:** Node subprocess ortam engeli; ürün bugı değil. Probe artık child_process kullanmıyor; HEAD opsiyonel R815_AUDIT_HEAD metadata değeridir.

## Ayrı isteğe bağlı öneri

DL-G01 — Medya uzantıları için ortak yetenek tablosu: Renderer, download manager ve main MEDIA_EXTS listesinin tek tanımdan üretilmesi drift riskini azaltır; DL01in çözüm seçeneğidir, ek bug sayılmaz.
