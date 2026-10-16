# BROWSER_BUG_REPORT_439 — Ses üretim durumu ve dinleme

1. Başlangıç IPC reddi terminal event üretmediğinde indeterminate progress durmuyordu. UI hatada0 değerine getirir; hedefli regresyon geçti.
2. Referans hazırlanırken alt controls atamaları SRT/range/plan/stüdyo düğmelerini yeniden açıyordu. Ortak işlem kilidiyle düzeltildi; hedefli busy regresyonu geçti.
3. Sonucu dinlemek için dış dosya açma gerekiyordu. Pencere içine audio önizlemesi ve Sesler klasörünü aç eklendi;20sn gerçek WAV ayrı Windows Electron profilinde readyState4 ile yüklendi, görsel kontrol edildi. Önizleme kapanışta/üretim başlangıcında/videoya uygulamada durur.

İlgili UI/service/locale/persist/DOM testleri ve syntax/diff geçti; yeni canlı GPU üretimi ve genel CI denenmedi. [Devir ve sınırlar](../devir/2026-10-16-0433.md).
