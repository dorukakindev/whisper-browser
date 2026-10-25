# 559 — Kitap bölümünü yeniden seslendirme

Doğrulanan hata: `media-workflows-ui.js` içindeki `generate(true)` güncel bölüm planındaki bütün grup anahtarlarını gönderiyor. `dub-service.js` ise birden çok anahtarı reddediyordu. Çok parçalı bir bölümün **Bölümü yeniden üret** işlemi bu yüzden başlayamıyordu.

Servis anlatım işlerinde en fazla 1000 grup kabul eder; normal video işlerinde tek grup sınırı korunur. Birleşik anahtar argümanı Windows komut satırı için 12000 karakterle sınırlıdır. Python tarafındaki güncel plan üyeliği denetimi korunur. Ses modeli ve kalite varsayılanları değişmedi.

Kanıt: `book-regenerate-request.test.js` gerçek UI fonksiyonunu çalıştırarak bölüm için bütün güncel anahtarları, tek grup için yalnız seçilen anahtarı ve terminal aboneliğinin temizlenmesini doğrular. `dub-service.test.js` çok gruplu anlatımı kabul, video/1001 grup/aşırı uzun argümanı ret davranışını doğrular.

Üç hedef dosyada 6 test sonucu geçti; `node --check src/dub-service.js` ve `git diff --check` temiz. Yeni UI düzeni yok. Gerçek GPU/model üretimi, kişisel `start.bat`, canlı YouTube ve CI bu turda doğrulanmadı. Bütün ses sorunlarının giderildiği iddia edilmez.
