(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantWorkflowSettings=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const field=(control,type,en,tr,min,max)=>({control,type,label:{en,tr},...(min!==undefined?{min,max}:{})});
 const groups={
  transcription:{
   model:field('model','string','Whisper model','Whisper modeli'),engine:field('engine','string','Engine','Motor'),language:field('language','string','Source language','Kaynak dili'),device:field('device','string','Device','Aygıt'),computeType:field('computeType','string','Precision','Hesaplama türü'),beamSize:field('beamSize','number','Beam size','Arama genişliği',1,10),splitMode:field('splitMode','string','Subtitle splitting','Altyazı bölme'),wrapMode:field('wrapMode','string','Line wrapping','Satır sarma'),maxLineWidth:field('maxLineWidth','number','Line width','Satır genişliği',20,80)},
  translation:{targetLanguage:field('translateTo','string','Target language','Hedef dil'),forSpeech:field('translateForSpeech','boolean','Translation for narration','Seslendirmeye uygun çeviri'),refine:field('translateRefine','boolean','Refine translation','Çeviriyi iyileştir'),lenient:field('translateLenient','boolean','Lenient quality gate','Esnek kalite kontrolü')},
  subtitles:{display:field('playerSubtitleDisplay','string','Subtitle display','Altyazı gösterimi'),offset:field('subOffset','number','Subtitle delay (seconds)','Altyazı gecikmesi (saniye)',-10,10),fontSize:field('subSize','number','Subtitle size','Altyazı boyutu',14,56),backgroundOpacity:field('subBgOpacity','number','Background opacity','Arka plan opaklığı',0,90),outline:field('subOutline','number','Outline','Kontur',0,100),font:field('subFont','string','Font','Yazı tipi'),bold:field('subWeight','boolean','Bold','Kalın yazı'),layout:field('subDualLayout','string','Dual subtitle layout','Çift altyazı düzeni'),secondaryOffset:field('sub2Offset','number','Secondary subtitle delay (seconds)','İkinci altyazı gecikmesi (saniye)',-60,60)},
  assistant:{flex:field('assistantFlex','boolean','DeepInfra Flex','DeepInfra Flex')}
 };

 const additional={
  "transcription": {
    "batchSize": {
      "control": "batchSize",
      "type": "number",
      "label": {
        "en": "batch Size",
        "tr": "Batch boyutu (batched/WhisperX): 16"
      },
      "min": 1,
      "max": 32
    },
    "task": {
      "control": "task",
      "type": "string",
      "label": {
        "en": "task",
        "tr": "Görev"
      }
    },
    "formats": {
      "control": "formats",
      "type": "string",
      "label": {
        "en": "formats",
        "tr": "Çıktı formatı"
      }
    },
    "bestOf": {
      "control": "bestOf",
      "type": "number",
      "label": {
        "en": "best Of",
        "tr": "Best of: 5"
      },
      "min": 1,
      "max": 10
    },
    "vadThreshold": {
      "control": "vadThreshold",
      "type": "number",
      "label": {
        "en": "vad Threshold",
        "tr": "VAD eşiği: 0.50"
      },
      "min": 0.1,
      "max": 0.9
    },
    "timingGap": {
      "control": "timingGap",
      "type": "number",
      "label": {
        "en": "timing Gap",
        "tr": "Duraksama eşiği (sn): 0.50"
      },
      "min": 0.2,
      "max": 1.5
    },
    "hardMaxChars": {
      "control": "hardMaxChars",
      "type": "number",
      "label": {
        "en": "hard Max Chars",
        "tr": "Sert karakter sınırı: 220"
      },
      "min": 80,
      "max": 320
    },
    "maxCps": {
      "control": "maxCps",
      "type": "number",
      "label": {
        "en": "max Cps",
        "tr": "Maks okuma hızı (CPS): 20"
      },
      "min": 10,
      "max": 30
    },
    "incompleteGap": {
      "control": "incompleteGap",
      "type": "number",
      "label": {
        "en": "incomplete Gap",
        "tr": "Yarım cümle boşluk sınırı (sn): 2.50"
      },
      "min": 0.5,
      "max": 4
    },
    "continuationGap": {
      "control": "continuationGap",
      "type": "number",
      "label": {
        "en": "continuation Gap",
        "tr": "Birleştirme boşluk sınırı (sn): 3.0"
      },
      "min": 0.5,
      "max": 5
    },
    "audioPreprocess": {
      "control": "audioPreprocess",
      "type": "string",
      "label": {
        "en": "audio Preprocess",
        "tr": "Ses ön-işleme (eski/gürültülü kaynak)"
      }
    },
    "temperature": {
      "control": "temperature",
      "type": "number",
      "label": {
        "en": "temperature",
        "tr": "Sıcaklık (fallback kapalıyken): 0.00"
      },
      "min": 0,
      "max": 1
    },
    "patience": {
      "control": "patience",
      "type": "number",
      "label": {
        "en": "patience",
        "tr": "Patience: 1.0"
      },
      "min": 0.5,
      "max": 3
    },
    "lengthPenalty": {
      "control": "lengthPenalty",
      "type": "number",
      "label": {
        "en": "length Penalty",
        "tr": "Length penalty: 1.0"
      },
      "min": 0.5,
      "max": 2
    },
    "repetitionPenalty": {
      "control": "repetitionPenalty",
      "type": "number",
      "label": {
        "en": "repetition Penalty",
        "tr": "Repetition penalty: 1.0"
      },
      "min": 1,
      "max": 2
    },
    "noRepeatNgramSize": {
      "control": "noRepeatNgramSize",
      "type": "number",
      "label": {
        "en": "no Repeat Ngram Size",
        "tr": "No-repeat n-gram: 0"
      },
      "min": 0,
      "max": 6
    },
    "compressionRatioThreshold": {
      "control": "compressionRatioThreshold",
      "type": "number",
      "label": {
        "en": "compression Ratio Threshold",
        "tr": "Compression ratio eşiği: 2.4"
      },
      "min": 1.5,
      "max": 4
    },
    "logProbThreshold": {
      "control": "logProbThreshold",
      "type": "number",
      "label": {
        "en": "log Prob Threshold",
        "tr": "Log-prob eşiği: -1.0"
      },
      "min": -3,
      "max": 0
    },
    "noSpeechThreshold": {
      "control": "noSpeechThreshold",
      "type": "number",
      "label": {
        "en": "no Speech Threshold",
        "tr": "No-speech eşiği: 0.60"
      },
      "min": 0.1,
      "max": 0.9
    },
    "vadMinSpeechMs": {
      "control": "vadMinSpeechMs",
      "type": "number",
      "label": {
        "en": "vad Min Speech Ms",
        "tr": "Min konuşma süresi (ms): 0"
      },
      "min": 0,
      "max": 1000
    },
    "vadMinSilenceMs": {
      "control": "vadMinSilenceMs",
      "type": "number",
      "label": {
        "en": "vad Min Silence Ms",
        "tr": "Min sessizlik süresi (ms): 2000"
      },
      "min": 100,
      "max": 3000
    },
    "vadSpeechPadMs": {
      "control": "vadSpeechPadMs",
      "type": "number",
      "label": {
        "en": "vad Speech Pad Ms",
        "tr": "Konuşma dolgusu (ms): 400"
      },
      "min": 0,
      "max": 500
    },
    "vadMaxSpeechS": {
      "control": "vadMaxSpeechS",
      "type": "number",
      "label": {
        "en": "vad Max Speech S",
        "tr": "Maks konuşma (sn, 0=sınırsız): 0"
      },
      "min": 0,
      "max": 60
    },
    "networkBudget": {
      "control": "networkBudget",
      "type": "string",
      "label": {
        "en": "network Budget",
        "tr": "networkBudget"
      }
    },
    "fixTimings": {
      "control": "fixTimings",
      "type": "boolean",
      "label": {
        "en": "fix Timings",
        "tr": "Zamanlamaları düzelt (okuma hızı / süre / boşluk)"
      }
    },
    "snapToSpeech": {
      "control": "snapToSpeech",
      "type": "boolean",
      "label": {
        "en": "snap To Speech",
        "tr": "Konuşma başlangıcına yasla (altyazı sesten önce gelmesin)"
      }
    },
    "mergeShort": {
      "control": "mergeShort",
      "type": "boolean",
      "label": {
        "en": "merge Short",
        "tr": "Kısa parçaları birleştir (flaş altyazı azaltma)"
      }
    },
    "mergeIncomplete": {
      "control": "mergeIncomplete",
      "type": "boolean",
      "label": {
        "en": "merge Incomplete",
        "tr": "Yarım kalmış cümleleri birleştir (dramatik duraksama toparlama)"
      }
    },
    "mergeContinuation": {
      "control": "mergeContinuation",
      "type": "boolean",
      "label": {
        "en": "merge Continuation",
        "tr": "Cümleleri birleştir — sonraki satıra taşan cümleyi tek blokta topla"
      }
    },
    "fixPunctuationCollapse": {
      "control": "fixPunctuationCollapse",
      "type": "boolean",
      "label": {
        "en": "fix Punctuation Collapse",
        "tr": "Noktalama çöküşünü onar (uzun videoda bozulan bölümü yeniden çevirir)"
      }
    },
    "confidenceReport": {
      "control": "confidenceReport",
      "type": "boolean",
      "label": {
        "en": "confidence Report",
        "tr": "Düşük güvenli kelime raporu (yanlış duyulmuş isimleri bulur)"
      }
    },
    "fixCommonErrors": {
      "control": "fixCommonErrors",
      "type": "boolean",
      "label": {
        "en": "fix Common Errors",
        "tr": "Yaygın hataları düzelt (tekrar eden ön ek, mikro blok, noktalama boşluğu, cümle başı)"
      }
    },
    "dropRepeatedHallucinations": {
      "control": "dropRepeatedHallucinations",
      "type": "boolean",
      "label": {
        "en": "drop Repeated Hallucinations",
        "tr": "Tekrarlayan uydurmaları yakala (dosya boyunca tekrar eden düşük güvenli metin)"
      }
    },
    "syncFixFramerate": {
      "control": "syncFixFramerate",
      "type": "boolean",
      "label": {
        "en": "sync Fix Framerate",
        "tr": "Sürüklenmeyi de düzelt (farklı framerate: başta doğru, sonda kayık)"
      }
    },
    "syncPiecewise": {
      "control": "syncPiecewise",
      "type": "boolean",
      "label": {
        "en": "sync Piecewise",
        "tr": "Kayma film boyunca değişiyorsa parçaları ayrı hizala (reklam arası / farklı kurgu)"
      }
    },
    "dedupe": {
      "control": "dedupe",
      "type": "boolean",
      "label": {
        "en": "dedupe",
        "tr": "Örtüşmeyen yakın tekrarları da temizle"
      }
    },
    "langSuffix": {
      "control": "langSuffix",
      "type": "boolean",
      "label": {
        "en": "lang Suffix",
        "tr": "Dosya adına dil kodu ekle (video.tr.srt)"
      }
    },
    "vadFilter": {
      "control": "vadFilter",
      "type": "boolean",
      "label": {
        "en": "vad Filter",
        "tr": "VAD (sessizlik filtresi)"
      }
    },
    "conditionOnPrevious": {
      "control": "conditionOnPrevious",
      "type": "boolean",
      "label": {
        "en": "condition On Previous",
        "tr": "Önceki bağlamı kullan"
      }
    },
    "temperatureFallback": {
      "control": "temperatureFallback",
      "type": "boolean",
      "label": {
        "en": "temperature Fallback",
        "tr": "Otomatik sıcaklık fallback"
      }
    },
    "qualityReport": {
      "control": "qualityReport",
      "type": "boolean",
      "label": {
        "en": "quality Report",
        "tr": "Kalite raporu (KPS / çakışma / süre özeti)"
      }
    },
    "notifyOnDone": {
      "control": "notifyOnDone",
      "type": "boolean",
      "label": {
        "en": "notify On Done",
        "tr": "İş bitince Windows bildirimi göster"
      }
    },
    "resume": {
      "control": "resume",
      "type": "boolean",
      "label": {
        "en": "resume",
        "tr": "Çökme/iptal sonrası kaldığı yerden devam et"
      }
    },
    "diarize": {
      "control": "diarize",
      "type": "boolean",
      "label": {
        "en": "diarize",
        "tr": "Konuşmacıları tanı ve etiketle (pyannote.audio)"
      }
    },
    "labelSpeakers": {
      "control": "labelSpeakers",
      "type": "boolean",
      "label": {
        "en": "label Speakers",
        "tr": "SRT/VTT'de altyazıya [SPEAKER_XX] ekle (ASS rengiyle ayırır)"
      }
    }
  },
  "cleanup": {
    "llmWorkers": {
      "control": "llmWorkers",
      "type": "number",
      "label": {
        "en": "llm Workers",
        "tr": "Paralel istek: 4"
      },
      "min": 1,
      "max": 10
    },
    "llmPostprocess": {
      "control": "llmPostprocess",
      "type": "boolean",
      "label": {
        "en": "llm Postprocess",
        "tr": "Transcribe sonrası LLM ile düzelt (sansür restore, halüsinasyon, noktalama)"
      }
    },
    "llmFixCensorship": {
      "control": "llmFixCensorship",
      "type": "boolean",
      "label": {
        "en": "llm Fix Censorship",
        "tr": "Sansürlü küfürleri restore et (f*** → fuck)"
      }
    },
    "llmFixHallucination": {
      "control": "llmFixHallucination",
      "type": "boolean",
      "label": {
        "en": "llm Fix Hallucination",
        "tr": "Halüsinasyon/uydurma kelime düzeltme"
      }
    },
    "llmFixPunctuation": {
      "control": "llmFixPunctuation",
      "type": "boolean",
      "label": {
        "en": "llm Fix Punctuation",
        "tr": "Noktalama ve birleşik kelime düzeltme"
      }
    },
    "llmFixConsistency": {
      "control": "llmFixConsistency",
      "type": "boolean",
      "label": {
        "en": "llm Fix Consistency",
        "tr": "Tutarsız özel isim yazımlarını sabitleme"
      }
    }
  },
  "translation": {
    "translateWorkers": {
      "control": "translateWorkers",
      "type": "number",
      "label": {
        "en": "translate Workers",
        "tr": "Paralel istek: 8"
      },
      "min": 1,
      "max": 10
    },
    "translateRegister": {
      "control": "translateRegister",
      "type": "string",
      "label": {
        "en": "translate Register",
        "tr": "İçerik türü (üslup)"
      }
    },
    "translateProfanity": {
      "control": "translateProfanity",
      "type": "string",
      "label": {
        "en": "translate Profanity",
        "tr": "Küfür/argo"
      }
    },
    "translateContext": {
      "control": "translateContext",
      "type": "string",
      "label": {
        "en": "translate Context",
        "tr": "Çeviri bağlamı"
      }
    },
    "translate": {
      "control": "translate",
      "type": "boolean",
      "label": {
        "en": "translate",
        "tr": "Altyazıyı çevir (kaynak dildeki dosya korunur, çeviri ayrı dosyaya yazılır)"
      }
    },
    "translateKeepSource": {
      "control": "translateKeepSource",
      "type": "boolean",
      "label": {
        "en": "translate Keep Source",
        "tr": "Kaynak dildeki altyazıyı da kaydet (kapalıysa yalnızca çeviri yazılır)"
      }
    },
    "translateCache": {
      "control": "translateCache",
      "type": "boolean",
      "label": {
        "en": "translate Cache",
        "tr": "Çeviri önbelleği (aynı satır ikinci kez gönderilmez)"
      }
    },
    "translateDedupe": {
      "control": "translateDedupe",
      "type": "boolean",
      "label": {
        "en": "translate Dedupe",
        "tr": "Yakın ve birebir aynı yinelenen cue'ları çeviriden önce tekilleştir"
      }
    },
    "dualSubtitle": {
      "control": "dualSubtitle",
      "type": "boolean",
      "label": {
        "en": "dual Subtitle",
        "tr": "Çift dilli tek dosya da yaz (<ad>.dual.srt — kaynak ve çeviri üst üste)"
      }
    }
  },
  "player": {
    "playerSpeed": {
      "control": "playerSpeed",
      "type": "string",
      "label": {
        "en": "player Speed",
        "tr": "Oynatma hızı"
      }
    },
    "playerVolume": {
      "control": "playerVolume",
      "type": "number",
      "label": {
        "en": "player Volume",
        "tr": "Ses düzeyi"
      },
      "min": 0,
      "max": 100
    },
    "playerPlaybackPolicy": {
      "control": "playerPlaybackPolicy",
      "type": "string",
      "label": {
        "en": "player Playback Policy",
        "tr": "İzleme politikası"
      }
    },
    "playerCueRepeatCount": {
      "control": "playerCueRepeatCount",
      "type": "string",
      "label": {
        "en": "player Cue Repeat Count",
        "tr": "Altyazı tekrar sayısı"
      }
    },
    "timelineZoom": {
      "control": "timelineZoom",
      "type": "string",
      "label": {
        "en": "timeline Zoom",
        "tr": "Görünüm 30 sn60 sn 2 dk5 dk Tümü"
      }
    },
    "aiTranscriptScope": {
      "control": "aiTranscriptScope",
      "type": "string",
      "label": {
        "en": "ai Transcript Scope",
        "tr": "Transkript kapsamıYakın repliklerŞu ana kadar izlenenTüm transkript"
      }
    },
    "playerAutoNext": {
      "control": "playerAutoNext",
      "type": "boolean",
      "label": {
        "en": "player Auto Next",
        "tr": "Sonraki videoya otomatik geç Seçilen klasör veya dosya sırasını kullanır"
      }
    },
    "playerWordHighlight": {
      "control": "playerWordHighlight",
      "type": "boolean",
      "label": {
        "en": "player Word Highlight",
        "tr": "Konuşulan kelimeyi vurgula Altyazının yanındaki kelime zamanlamalı JSON çıktısı varsa çalışır"
      }
    }
  },
  "browser": {
    "browserMangaTarget": {
      "control": "browserMangaTarget",
      "type": "string",
      "label": {
        "en": "browser Manga Target",
        "tr": "Manga hedefi Türkçeİngilizce AlmancaFransızca İspanyolcaİtalyanca RusçaArapça"
      }
    },
    "browserMangaFont": {
      "control": "browserMangaFont",
      "type": "string",
      "label": {
        "en": "browser Manga Font",
        "tr": "Manga yazı tipi Çizgi romanSistem Dar"
      }
    },
    "browserMangaWorkers": {
      "control": "browserMangaWorkers",
      "type": "number",
      "label": {
        "en": "browser Manga Workers",
        "tr": "Paralel istek 2"
      },
      "min": 1,
      "max": 6
    },
    "browserMangaMaxImages": {
      "control": "browserMangaMaxImages",
      "type": "number",
      "label": {
        "en": "browser Manga Max Images",
        "tr": "Azami görsel"
      },
      "min": 1,
      "max": 120
    },
    "browserMangaFontScale": {
      "control": "browserMangaFontScale",
      "type": "number",
      "label": {
        "en": "browser Manga Font Scale",
        "tr": "Manga yazısı %100"
      },
      "min": 70,
      "max": 170
    },
    "browserOverlayScale": {
      "control": "browserOverlayScale",
      "type": "number",
      "label": {
        "en": "browser Overlay Scale",
        "tr": "Altyazı boyutu %100"
      },
      "min": 65,
      "max": 180
    },
    "browserOverlayOpacity": {
      "control": "browserOverlayOpacity",
      "type": "number",
      "label": {
        "en": "browser Overlay Opacity",
        "tr": "Altyazı opaklığı %100"
      },
      "min": 20,
      "max": 100
    },
    "browserOverlayBottom": {
      "control": "browserOverlayBottom",
      "type": "number",
      "label": {
        "en": "browser Overlay Bottom",
        "tr": "Alt boşluk %7"
      },
      "min": 0,
      "max": 75
    },
    "browserOverlayGap": {
      "control": "browserOverlayGap",
      "type": "number",
      "label": {
        "en": "browser Overlay Gap",
        "tr": "İki dil arası (px)"
      },
      "min": 0,
      "max": 48
    },
    "browserOverlayWidth": {
      "control": "browserOverlayWidth",
      "type": "number",
      "label": {
        "en": "browser Overlay Width",
        "tr": "Azami genişlik %86"
      },
      "min": 40,
      "max": 98
    },
    "browserOverlayMaxLines": {
      "control": "browserOverlayMaxLines",
      "type": "number",
      "label": {
        "en": "browser Overlay Max Lines",
        "tr": "Azami satır"
      },
      "min": 1,
      "max": 6
    },
    "browserVideoBrightness": {
      "control": "browserVideoBrightness",
      "type": "number",
      "label": {
        "en": "browser Video Brightness",
        "tr": "Video parlaklığı %100"
      },
      "min": 40,
      "max": 200
    },
    "browserVideoContrast": {
      "control": "browserVideoContrast",
      "type": "number",
      "label": {
        "en": "browser Video Contrast",
        "tr": "Video kontrastı %100"
      },
      "min": 40,
      "max": 200
    },
    "browserSilenceSpeedRate": {
      "control": "browserSilenceSpeedRate",
      "type": "number",
      "label": {
        "en": "browser Silence Speed Rate",
        "tr": "Sessizlik hızı"
      },
      "min": 2,
      "max": 8
    },
    "browserSilenceThresholdDb": {
      "control": "browserSilenceThresholdDb",
      "type": "number",
      "label": {
        "en": "browser Silence Threshold Db",
        "tr": "Sessizlik eşiği (dB)"
      },
      "min": -70,
      "max": -20
    },
    "browserAudioProfile": {
      "control": "browserAudioProfile",
      "type": "string",
      "label": {
        "en": "browser Audio Profile",
        "tr": "Ses profiliKapalıGeceKonuşmaAni yüksek ses koruması"
      }
    },
    "browserPageTarget": {
      "control": "browserPageTarget",
      "type": "string",
      "label": {
        "en": "browser Page Target",
        "tr": "Sayfa çeviri hedefi Türkçeİngilizce AlmancaFransızca İspanyolcaİtalyanca RusçaArapça"
      }
    },
    "browserPageMode": {
      "control": "browserPageMode",
      "type": "string",
      "label": {
        "en": "browser Page Mode",
        "tr": "Sayfa görünümü Kaynak + çeviriKaynağın yerine çeviri"
      }
    },
    "browserSubtitleAutomation": {
      "control": "browserSubtitleAutomation",
      "type": "string",
      "label": {
        "en": "browser Subtitle Automation",
        "tr": "Altyazı otomasyonuKapalıÖnce sorOtomatik çevir"
      }
    },
    "browserPreferredSubtitleMode": {
      "control": "browserPreferredSubtitleMode",
      "type": "string",
      "label": {
        "en": "browser Preferred Subtitle Mode",
        "tr": "Çeviri sonrası görünümYalnız çeviriKaynak + çeviriYalnız kaynakKapalı"
      }
    },
    "browserSponsorMode": {
      "control": "browserSponsorMode",
      "type": "string",
      "label": {
        "en": "browser Sponsor Mode",
        "tr": "Sponsor atlamaKapalıSorOtomatik"
      }
    },
    "browserSearchEngine": {
      "control": "browserSearchEngine",
      "type": "string",
      "label": {
        "en": "browser Search Engine",
        "tr": "Arama motoru"
      }
    },
    "stCardScale": {
      "control": "stCardScale",
      "type": "number",
      "label": {
        "en": "st Card Scale",
        "tr": "Kart boyutu %100"
      },
      "min": 60,
      "max": 160
    },
    "stCardFontScale": {
      "control": "stCardFontScale",
      "type": "number",
      "label": {
        "en": "st Card Font Scale",
        "tr": "Kart yazısı %100"
      },
      "min": 75,
      "max": 150
    },
    "browserPageScope": {
      "control": "browserPageScope",
      "type": "string",
      "label": {
        "en": "browser Page Scope",
        "tr": "Çeviri alanıYazı / makaleTüm sayfaSeçili metin"
      }
    },
    "browserExportFormat": {
      "control": "browserExportFormat",
      "type": "string",
      "label": {
        "en": "browser Export Format",
        "tr": "Dışa aktarma biçimi"
      }
    },
    "browserExportTiming": {
      "control": "browserExportTiming",
      "type": "string",
      "label": {
        "en": "browser Export Timing",
        "tr": "Dışa aktarma zamanları"
      }
    },
    "browserPageExportFormat": {
      "control": "browserPageExportFormat",
      "type": "string",
      "label": {
        "en": "browser Page Export Format",
        "tr": "Dışa aktarmaTXTMarkdownHTMLJSON"
      }
    },
    "browserMangaAuto": {
      "control": "browserMangaAuto",
      "type": "boolean",
      "label": {
        "en": "browser Manga Auto",
        "tr": "Okuma sayfasını otomatik çevir"
      }
    },
    "browserMangaVertical": {
      "control": "browserMangaVertical",
      "type": "boolean",
      "label": {
        "en": "browser Manga Vertical",
        "tr": "Dikey manga metni"
      }
    },
    "browserMangaSfx": {
      "control": "browserMangaSfx",
      "type": "boolean",
      "label": {
        "en": "browser Manga Sfx",
        "tr": "SFX için ayrı stil"
      }
    },
    "browserOverlaySourceFirst": {
      "control": "browserOverlaySourceFirst",
      "type": "boolean",
      "label": {
        "en": "browser Overlay Source First",
        "tr": "Kaynak üstte, çeviri altta"
      }
    },
    "browserHideSiteCaptions": {
      "control": "browserHideSiteCaptions",
      "type": "boolean",
      "label": {
        "en": "browser Hide Site Captions",
        "tr": "Sitenin kendi altyazısını gizle"
      }
    },
    "browserRateFightback": {
      "control": "browserRateFightback",
      "type": "boolean",
      "label": {
        "en": "browser Rate Fightback",
        "tr": "Site hızı sıfırlarsa geri uygula"
      }
    },
    "browserPreservesPitch": {
      "control": "browserPreservesPitch",
      "type": "boolean",
      "label": {
        "en": "browser Preserves Pitch",
        "tr": "Hız değişince ses perdesini koru"
      }
    },
    "browserDarkMode": {
      "control": "browserDarkMode",
      "type": "boolean",
      "label": {
        "en": "browser Dark Mode",
        "tr": "Bu sayfayı koyu göster"
      }
    },
    "browserReaderAuto": {
      "control": "browserReaderAuto",
      "type": "boolean",
      "label": {
        "en": "browser Reader Auto",
        "tr": "Bu sitede okuma görünümünü otomatik aç"
      }
    },
    "browserYoutubeAppearance": {
      "control": "browserYoutubeAppearance",
      "type": "boolean",
      "label": {
        "en": "browser Youtube Appearance",
        "tr": "YouTube özel görünümünü kullan"
      }
    },
    "browserYoutubeHideShorts": {
      "control": "browserYoutubeHideShorts",
      "type": "boolean",
      "label": {
        "en": "browser Youtube Hide Shorts",
        "tr": "YouTube Shorts bölümlerini gizle"
      }
    },
    "browserNormalizeAudio": {
      "control": "browserNormalizeAudio",
      "type": "boolean",
      "label": {
        "en": "browser Normalize Audio",
        "tr": "Konuşma sesini dinamik olarak dengele"
      }
    },
    "browserSilenceSpeedEnabled": {
      "control": "browserSilenceSpeedEnabled",
      "type": "boolean",
      "label": {
        "en": "browser Silence Speed Enabled",
        "tr": "Sessizlikte hızlandır"
      }
    },
    "browserPageAuto": {
      "control": "browserPageAuto",
      "type": "boolean",
      "label": {
        "en": "browser Page Auto",
        "tr": "Bu sitedeki sayfaları otomatik çevir"
      }
    },
    "browserPageIndexEnabled": {
      "control": "browserPageIndexEnabled",
      "type": "boolean",
      "label": {
        "en": "browser Page Index Enabled",
        "tr": "Gezilen sayfa metnini yerel aramaya ekle"
      }
    },
    "browserAdblockEnabled": {
      "control": "browserAdblockEnabled",
      "type": "boolean",
      "label": {
        "en": "browser Adblock Enabled",
        "tr": "Tarayıcı reklam koruması"
      }
    },
    "browserAutoSkipAds": {
      "control": "browserAutoSkipAds",
      "type": "boolean",
      "label": {
        "en": "browser Auto Skip Ads",
        "tr": "Video reklamlarını otomatik atla"
      }
    },
    "browserPlayerResponseAdPrune": {
      "control": "browserPlayerResponseAdPrune",
      "type": "boolean",
      "label": {
        "en": "browser Player Response Ad Prune",
        "tr": "Reklamları oynatıcı yanıtından temizle (deneysel)"
      }
    },
    "browserDeArrowEnabled": {
      "control": "browserDeArrowEnabled",
      "type": "boolean",
      "label": {
        "en": "browser De Arrow Enabled",
        "tr": "DeArrow topluluk başlığı"
      }
    },
    "browserRydDislikes": {
      "control": "browserRydDislikes",
      "type": "boolean",
      "label": {
        "en": "browser Ryd Dislikes",
        "tr": "Beğenmeme sayısını göster (RYD)"
      }
    },
    "stHideShorts": {
      "control": "stHideShorts",
      "type": "boolean",
      "label": {
        "en": "st Hide Shorts",
        "tr": "Shorts kartlarını gizle"
      }
    },
    "stHideWatched": {
      "control": "stHideWatched",
      "type": "boolean",
      "label": {
        "en": "st Hide Watched",
        "tr": "İzlenen videoları gizle"
      }
    },
    "stHideLive": {
      "control": "stHideLive",
      "type": "boolean",
      "label": {
        "en": "st Hide Live",
        "tr": "Canlı yayınları gizle"
      }
    },
    "stHideTrending": {
      "control": "stHideTrending",
      "type": "boolean",
      "label": {
        "en": "st Hide Trending",
        "tr": "Ana sayfadaki Trend rayını gizle"
      }
    },
    "stAutoRelated": {
      "control": "stAutoRelated",
      "type": "boolean",
      "label": {
        "en": "st Auto Related",
        "tr": "Bitince ilgili videoya geç (radyo)"
      }
    },
    "browserAutoPip": {
      "control": "browserAutoPip",
      "type": "boolean",
      "label": {
        "en": "browser Auto Pip",
        "tr": "Sekme değişince videoyu küçük oynatıcıda sürdür"
      }
    }
  },
  "appearance": {
    "uiTheme": {
      "control": "uiTheme",
      "type": "string",
      "label": {
        "en": "ui Theme",
        "tr": "Arayüz teması"
      }
    },
    "uiLocale": {
      "control": "uiLocale",
      "type": "string",
      "label": {
        "en": "ui Locale",
        "tr": "Interface languageENTR"
      }
    }
  },
  "reader": {
    "pdfExportFormat": {
      "control": "pdfExportFormat",
      "type": "string",
      "label": {
        "en": "pdf Export Format",
        "tr": "PDF dışa aktarma biçimi"
      }
    },
    "pdfTargetLanguage": {
      "control": "pdfTargetLanguage",
      "type": "string",
      "label": {
        "en": "pdf Target Language",
        "tr": "PDF hedef dili"
      }
    }
  }
};
 for(const [name,fields] of Object.entries(additional))Object.assign(groups[name]||(groups[name]={}),fields);
 function domain(value){if(!Object.hasOwn(groups,value))throw Error('Unknown workflow domain / Bilinmeyen ayar alanı.');return groups[value];}
 function parse(name,raw){const fields=domain(name);if(typeof raw!=='string'||raw.length>2000)throw Error('Use a bounded JSON settings object.');const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).length>12)throw Error('Specify 1–12 workflow settings.');for(const [key,v] of Object.entries(value)){const f=Object.hasOwn(fields,key)?fields[key]:null;if(!f||typeof v!==f.type||f.type==='string'&&(v.length>80||/[\u0000-\u001f]/.test(v))||f.type==='number'&&(!Number.isFinite(v)||v<f.min||v>f.max))throw Error('Invalid workflow setting: '+key);}return value;}
 function summary(name,raw,locale='en',snapshot=null){
  const fields=domain(name),values=parse(name,raw),tr=locale==='tr';
  const display=(key,value)=>{
   if(typeof value==='boolean')return value?(tr?'Açık':'On'):(tr?'Kapalı':'Off');
   const choice=snapshot?.options?.[key]?.choices?.find(row=>row.value===value);
   return typeof choice?.label==='string'?choice.label.slice(0,100):String(value).slice(0,160);
  };
  const rows=Object.entries(values).map(([key,value])=>{
   const label=fields[key].label[tr?'tr':'en'];
   if(!snapshot)return label+': '+display(key,value);
   const before=snapshot.values?.[key];
   if(!Object.hasOwn(snapshot.values||{},key)||typeof before!==fields[key].type||(fields[key].type==='number'&&!Number.isFinite(before)))throw Error('Workflow setting has no valid current value: '+key);
   return before===value?null:label+': '+display(key,before)+' → '+display(key,value);
  });
  const changes=rows.filter(row=>row!==null);
  if(snapshot&&!changes.length)return tr?'İstenen ayarlar zaten etkin; değişiklik yok.':'Requested settings are already active; no changes.';
  return changes.join(snapshot?'\n':' · ')+(name==='browser'?(tr?' · Tarayıcı ayarları hemen uygulanır; otomasyon sayfa çevirisi başlatabilir.':' · Browser changes apply immediately; automation may start page translation.'):'');
 }

 return Object.freeze({groups,domain,parse,summary});
});
