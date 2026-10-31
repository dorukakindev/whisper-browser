# Bir sonraki kontrol noktası

200 maddelik hedef aktif. Önce paket01 teslimini ve ana kopya güncellemesini doğrula; tamamlananı tekrarlama. `.cursor/rules/agent-model-preference.mdc`: GPT-6.1 Sol / medium.

1. P021/P024: assistant-agent-service.js öneri oluşturma/uygulama: workflow kartlarında durum yakalama var, preference ve voice kartlarında aynı koruma yok. Manuel ayar sonrası eski kart insan seçimini ezebiliyor. İlgili önce/sonra değerleri ve duruma bağlı kimlik ekle; gizli alanlar modele açılmasın.
2. P022: dub-generator-ui.js voiceStart/start: `start_voice_generation {sample:true}` kalıcı örnek kontrolünü değiştiriyor; sonraki `{}` hâlâ örnek çalışabilir. İşe özel override üret, retained UI seçimini değiştirme. Mevcut mock fixture ile tekrar üretildi; gerçek native kabul ekle.
3. P023: forSpeech/refine/lenient etkileri ayar okumasında var, onay özetinde yok. Kullanıcının neyi değiştireceğini açık anlat.
4. P026: stale workflow proposal apply öncesi consume ediliyor. Güncel değerlerle yeni somut kart hazırlama/yeniden onay yolu sun; eski öneriyi otomatik uygulama.
5. P025: change → undo-save-fail → rollback → retry akışını geçici gerçek ayar diskiyle sına; renderer/disk aynı kalsın ve daha yeni manuel düzenleme geri alınmasın.

Kişisel main dosyaları korunur: docs/OFFLINE-MANIFEST.md, docs/raporlar/INDEX.md, silinmiş start.sh ve tüm kullanıcı untracked girdileri. Güncel ana dal temelini teslim kaydından kontrol et. Kişisel uygulamayı kapatma. API yetkisi anlamlı DeepInfra standard testleri için geniş; büyük toplu denemelerde Flex. Gizli anahtarlar hiçbir rapor/argüman/dosyaya yazılmaz.
