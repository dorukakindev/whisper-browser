# vendor/

Bu klasördeki dosyalar üçüncü taraf kütüphanelerdir ve **depoyla birlikte
dağıtılır** (CSP `script-src 'self'` olduğu için CDN kullanılamaz).

## hls.min.js

- Proje: [hls.js](https://github.com/video-dev/hls.js)
- Sürüm: 1.7.1
- Lisans: Apache-2.0 — tam metin: [`hls.js-LICENSE.txt`](hls.js-LICENSE.txt)

Nerede kullanılıyor: YouTube'u indirmeden izlemek için. YouTube 1080p ve üzerini
video/ses ayrı akışlar olarak verir; düz `<video>` bunları birleştiremez. hls.js,
YouTube'un HLS manifestini MSE ile birleştirip oynatır.

Güncellemek için:

```bash
npm i hls.js@<sürüm>
cp node_modules/hls.js/dist/hls.min.js src/renderer/vendor/
cp node_modules/hls.js/LICENSE src/renderer/vendor/hls.js-LICENSE.txt
```

Sürüm numarasını bu dosyada da güncelleyin.
