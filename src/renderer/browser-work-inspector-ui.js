(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserWorkInspectorUI = api;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  function create({ document, model, snapshot, activate, retryMissing, retryChannel, openResult, resume, en = () => false, now = () => performance.now() }) {
    const host = document.getElementById('browserWorkInspector');
    if (!host) return null;
    const tabs = document.getElementById('browserWorkTabs'), detail = document.getElementById('browserWorkDetail');
    const t = (tr, eng) => en() ? eng : tr;
    const make = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text) el.textContent = text; return el; };
    const set = (el, value) => { if (el.textContent !== value) el.textContent = value; };
    const button = (text, fn) => { const el = make('button', 'btn btn-secondary btn-sm', text); el.type = 'button'; el.onclick = fn; return el; };
    const stateLabels = {
      unknown: ['bilinmiyor', 'unknown'], changed: ['kaynak değişmiş', 'source changed'], stale: ['saat güncel değil', 'clock stale'],
      ad: ['reklam; içerik saati bekliyor', 'advertisement; content clock waiting'], live: ['canlı; sabit zaman eşleşmesi doğrulanmadı', 'live; fixed time mapping unverified'],
      waiting: ['bekliyor', 'waiting'], seeking: ['atlama sürüyor', 'seeking'], verified: ['güncel saat örneği', 'current clock sample'],
      none: ['seçilmedi', 'not selected'], missing: ['dosya eksik', 'file missing'], failed: ['dosya okunamadı', 'file could not be read'],
      loaded: ['geri yüklendi', 'restored'], loading: ['yükleniyor', 'loading'], verify: ['yeniden doğrulama gerekli', 'verification required'],
      ready: ['plan hazır', 'plan ready'], running: ['çalışıyor', 'running'], refreshing: ['plan yenileniyor', 'refreshing plan'],
      'retry-wait': ['yeniden deneme bekliyor', 'retry waiting'], partial: ['kısmi', 'partial'], complete: ['tamam', 'complete'],
      cancelled: ['durduruldu', 'stopped'], error: ['hata', 'error'],
    };
    const label = state => stateLabels[state] ? t(...stateLabels[state]) : t('bilinmiyor', 'unknown');
    const stamp = seconds => { const n = Math.max(0, Number(seconds) || 0); return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, '0')}`; };
    const rows = new Map();
    const title = make('strong', 'browser-work-source'), clock = make('p', 'browser-work-clock');
    const captureHead = make('strong', ''), captureText = make('p', ''), ranges = make('ul', 'browser-work-ranges');
    const captureAction = make('div', ''), channels = [make('div', 'browser-work-channel'), make('div', 'browser-work-channel')];
    const delivery=make('div','browser-work-channel'),timing=make('p',''),availability=make('p',''),resumeBox=make('div','browser-work-channel');let deliveryKey='',resumeKey='';
    const continuity = make('p',''), quality = make('div','browser-work-channel'), revisions = make('div','browser-work-channel'), dub = make('p','');
    const reviewed=new Set(), history=new Map();let qualityKey='';
    const notices = make('p', 'browser-work-notice'); notices.setAttribute('role', 'status');
    detail.append(title, continuity, delivery, timing, availability, resumeBox, quality, revisions, dub, clock, captureHead, captureText, ranges, captureAction, ...channels, notices);
    let captureKey = '', rangeKey = '', channelKeys = ['', ''];
    function render() {
      if (!host.isConnected) return;
      set(document.getElementById('browserWorkInspectorLabel'), t('Sekmeler ve altyazı durumu', 'Tabs and subtitle status'));
      const value = snapshot();
      const changes=[];
      for(const tab of value.tabs){
        const key=JSON.stringify([tab.id,tab.mediaId||tab.mediaKey||tab.url]);
        const tracks=tab.id===value.tab?.id?value.tracks:tab.browserTracks||[];
        const previous=history.get(key)||new Map();
        for(const track of tracks){const version=JSON.stringify([track.sourceHash||'',track.sourceTrackId||'',track.revision||'',track.cueCount||0,track.sourceMismatch===true]);const old=previous.get(track.id);
          if(old&&old.version!==version)previous.set(track.id,{version,prior:old.version,label:track.label||track.language||track.id});
          else if(!old)previous.set(track.id,{version,label:track.label||track.language||track.id});
        }
        history.set(key,previous);while(history.size>32)history.delete(history.keys().next().value);
        while(previous.size>100)previous.delete(previous.keys().next().value);
        if(tab.id===value.tab?.id)for(const row of previous.values())if(row.prior)changes.push(row);
      }
      if (!host.open) return;
      const seen = new Set();
      for (const tab of value.tabs) {
        seen.add(tab.id);
        let row = rows.get(tab.id);
        if (!row) {
          const el = make('div', 'browser-work-tab'), open = button('', () => activate(tab.id)), info = make('p', '');
          el.append(open, info); row = { el, open, info }; rows.set(tab.id, row); tabs.append(el);
        }
        const active = tab.id === value.tab?.id, live = active ? value.live : tab;
        const status = model.summary(tab, { active, live, job: value.job, approvals: value.approvals?.[tab.id] });
        set(row.open, tab.title || t('Yeni sekme', 'New tab'));
        row.open.setAttribute('aria-current', active ? 'true' : 'false');
        const parts = [t('Yakalama: ', 'Capture: ') + label(status.capture)];
        if (tab.loading) parts.push(t('Sayfa yükleniyor', 'Page loading'));
        if (status.translating) parts.push(t('Altyazı çevirisi sürüyor; sekmeden ayrılmak aynı kaynağın işini durdurmaz. İçerik değişimi işi iptal eder.', 'Subtitle translation running; leaving the tab does not stop work for the same source. Changing content cancels it.'));
        else if (live.browserTranslationTrackId) parts.push(status.failed ? t('Çeviri kısmi', 'Translation partial') : tab.browserTranslationComplete ? t('Çeviri tamam', 'Translation complete') : t('Çeviri sonucu doğrulanmalı', 'Translation requires verification'));
        if (tab.browserPageTranslateBusy) parts.push(t('Sayfa çevirisi sürüyor', 'Page translation running'));
        if (tab.browserMangaBusy) parts.push(t('Manga çevirisi sürüyor', 'Manga translation running'));
        if (status.job) parts.push(t('Bu kaynağın medya işi sürüyor', 'A media job for this source is running'));
        if (status.confirmation) parts.push(t('Altyazı otomasyonu onayı bekliyor', 'Subtitle automation awaiting approval'));
        if (status.approvals?.review) parts.push(t('İncelenecek asistan kartı: ', 'Assistant cards to review: ') + status.approvals.review);
        if (status.approvals?.applying) parts.push(t('Asistan işlemi uygulanıyor', 'Assistant action applying'));
        if (status.approvals?.running) parts.push(t('Asistan yanıtı sürüyor', 'Assistant response running'));
        if (!status.approvals) parts.push(t('Asistan onay kapsamı bilinmiyor', 'Assistant approval scope unknown'));
        if (status.failed) parts.push(t('Başarısız çeviri: ', 'Failed translations: ') + status.failed);
        if (status.error) parts.push(t('Son kayıtlı hata: ', 'Last recorded error: ') + status.error);
        const source = tab.mediaId || t('Bölüm kimliği doğrulanmadı', 'Episode identity unverified');
        set(row.info, [source, ...parts].join(' · '));
      }
      for (const [id, row] of rows) if (!seen.has(id)) { row.el.remove(); rows.delete(id); }
      detail.hidden = !value.tab;
      if (!value.tab) return;
      const { tab, live, tracks, generation, owner } = value;
      // Notices belong to the inspected source, never to the next episode.
      if (detail.dataset.owner !== owner) { detail.dataset.owner = owner; set(notices, ''); }
      set(title, (tab.title || t('Etkin sekme', 'Active tab')) + ' · ' + (tab.mediaId || t('Kaynak kimliği doğrulanmadı', 'Source identity unverified')));
      const channelStates=[false,true].map(second=>model.channel(tab,second,tracks,live,generation));
      set(continuity,t('Geri dönüş: ','Return: ')+channelStates.map((r,i)=>(i+1)+': '+label(r.state)).join(' · ')
        +t(' · Konum: ',' · Position: ')+(Number.isFinite(live.browserTime)?stamp(live.browserTime):t('bilinmiyor','unknown'))
        +(live.browserPaused===true?t(' · duraklatılmış; bu görünüm oynatmayı başlatmaz.',' · paused; this view does not start playback.'):live.browserPaused===false?t(' · oynatma ayrı olarak sürüyor.',' · playback is running separately.'):t(' · oynatma doğrulanmalı.',' · playback needs verification.'))
        +t(' Site oturumu altyazı veya atlama yetkisi değildir.',' A site session is not proof of captions or seek authority.'));
      set(revisions,t('İz sürümü karşılaştırması: ','Track revision comparison: ')+(changes.length?changes.map(r=>{const describe=value=>{const [hash,source,revision,cues,mismatch]=JSON.parse(value);return [t('kaynak özeti ','source digest ')+(hash?hash.slice(0,12):'?'),t('bağlı iz ','linked track ')+(source||'?'),t('revizyon ','revision ')+(revision||'?'),String(cues)+t(' satır',' cues'),mismatch?t('uyumsuz','mismatched'):t('uyumsuzluk işareti yok','no mismatch flag')].join(' · ');};return r.label+' — '+describe(r.prior)+' → '+describe(r.version);}).join('\n'):t('Bu oturumda gözlenen eski/yeni farkı yok; önceki sürüm bilinmiyorsa tahmin edilmez.','No old/new difference observed in this session; unknown previous versions are not inferred.'))
        +(tracks.some(r=>r.sourceMismatch)?t(' Uyumsuz çeviri otomatik uygulanmaz; kaynak izini inceleyip yeniden seçin.',' Mismatched translation is not applied automatically; inspect and reselect the source track.'):''));
      const ds=value.dub||{state:'none'},dubLabels={'dub-error':['önceki ses işlemi başarısız; mevcut hata bildirimini inceleyin','previous audio action failed; inspect its error notification'],none:['bağlı ses yok','no attached audio'],'source-changed':['kaynak değişti','source changed'],hidden:['oynatıcı görünür değil','player hidden'],'file-error':['ses dosyası hatası','audio file error'],stale:['medya saati güncel değil','media clock stale'],ad:['reklam bekleniyor','waiting for advertisement'],buffering:['ses/video yükleniyor','audio/video buffering'],paused:['medya duraklatıldı','media paused'],ended:['ses sona erdi','audio ended'],outside:['seçili aralık dışında','outside selected range'],waiting:['sesin başlaması bekleniyor','waiting for audio'],playing:['ses oynuyor','audio playing']};
      set(dub,t('Dublaj: ','Dubbing: ')+t(...(dubLabels[ds.state]||['durum bilinmiyor','state unknown']))+(ds.originalMuted===null?'':t(' · kaynak sesi kapalı: ',' · original muted: ')+String(ds.originalMuted))+(ds.mutePending?t(' · kaynak sesinin geri bildirimi bekliyor',' · waiting for original audio response'):'')+(ds.ratePending?t(' · hız geri bildirimi bekliyor',' · waiting for rate response'):'')+(ds.layerFailed?t(' · yardımcı ses katmanı hatası',' · auxiliary audio layer error'):''));
      const warnings=[...(live.cues||[]).map((cue,index)=>({cue,index,secondary:false})),...(live.cues2||[]).map((cue,index)=>({cue,index,secondary:true}))].filter(r=>r.cue.qualityWarning||r.cue.qualityIssues?.length);
      const qkey=JSON.stringify([owner,warnings.map(r=>[r.secondary,r.index,r.cue.text,r.cue.qualityIssues]),en()]);
      if(qkey!==qualityKey){qualityKey=qkey;quality.replaceChildren(make('strong','',t('Kalite uyarıları: ','Quality warnings: ')+warnings.length));
        for(const row of warnings.slice(0,20)){const proof=JSON.stringify([owner,row.secondary,row.index,row.cue.text,row.cue.qualityIssues]);const line=make('p','',stamp(row.cue.start)+' · '+String(row.cue.text||'').slice(0,160)+' · '+JSON.stringify(row.cue.qualityIssues||[]).slice(0,300));
          const accept=button(reviewed.has(proof)?t('Bu oturumda incelendi','Reviewed in this session'):t('İnceledim; uyarıyı koru','Reviewed; keep warning'),()=>{if(snapshot().owner!==owner)return;reviewed.add(proof);while(reviewed.size>200)reviewed.delete(reviewed.values().next().value);accept.textContent=t('Bu oturumda incelendi','Reviewed in this session');});quality.append(line,accept);
        }
        quality.append(button(t('Satırları incele / elle düzenle','Review / edit rows manually'),()=>{if(snapshot().owner!==owner)return;const panel=document.getElementById('browserSubtitleReview');if(panel){panel.open=true;document.getElementById('browserReviewRefresh')?.click();panel.scrollIntoView?.({block:'nearest'});}}));
        const retry=document.getElementById('browserTranslationRetryFailed');if(retry&&!retry.disabled)quality.append(button(t('Başarısız çevirileri mevcut yoldan yeniden dene','Retry failed translations through the existing action'),()=>{if(snapshot().owner===owner)retry.click();}));
        quality.append(make('small','',t('İncelendi işareti oturumluktur; kalite bayrağını silmez ve doğruluk kanıtı değildir. Uyarı için desteklenen retry yoksa elle düzenleme kullanılır.','Review marks last for this session; they do not clear quality flags or prove correctness. Use manual editing when warning retry is unsupported.')));
      }
      const deliveries=value.results||[],dkey=JSON.stringify([owner,deliveries.map(r=>[r.id,r.loaded,r.reason,r.at]),en()]);
      if(deliveryKey!==dkey){deliveryKey=dkey;delivery.replaceChildren(make('strong','',t('Kayıt ve ekrana bağlama','Saved output and screen attachment')));
        for(const result of deliveries.slice(-20)){const line=make('p','',(result.job.mediaKey||'')+' · '+result.outputs.map(r=>(r.role||'?')+' '+(r.status||t('durum bilinmiyor','status unknown'))).join(' · ')+' · '+(result.loaded?t('ekrana yüklendi','attached to screen'):t('ekrana yüklenmedi: ','not attached: ')+result.reason));delivery.append(line);
          delivery.append(button(t('Kaynağa dön ve kayıtlı çıktıyı incele','Return to source and review saved output'),async()=>{try{await openResult?.(result);}catch(error){if(snapshot().owner===owner)set(notices,error.message);}}));
        }
        delivery.append(make('small','',t('İşin çıktı bildirimi dosyanın hâlâ mevcut olduğunu kanıtlamaz. Yükleme dosyayı yeniden doğrular; üretim tekrarlanmaz.','A job output receipt does not prove the file still exists. Loading revalidates the file; generation is not repeated.')));
      }
      set(timing,t('Zaman hesabı: ','Time mapping: ')+(value.timing||[]).map(r=>r.channel+': '+r.scale+' × '+t('kaynak saniyesi','source seconds')+' + '+r.offset+' s'+(r.start===null?'':' · '+r.start.toFixed(3)+' → '+r.media.toFixed(3))).join(' · ')+t('. Kanallar ayrı hesaplanır; bu açıklama yeni global düzeltme önermez.','. Channels are computed separately; this does not propose a global correction.'));
      const verifiedClock=model.clock(tab,live.mediaKey,generation,now()).state==='verified',hasText=!!(live.cues?.length||live.cues2?.length),mismatch=tracks.some(r=>r.sourceMismatch);
      set(availability,(value.offline?t('Tarayıcı çevrimdışı bildiriyor. ','Browser reports offline. '):'')+t('Erişim: ','Access: ')+(mismatch?t('alternatif/eski sürüm; aynı kaynak olduğu doğrulanmadı','alternative/old revision; same source unverified'):verifiedClock?t('güncel medya saati var; ses indirilmiş demek değildir','current media clock; this does not imply downloaded audio'):hasText?t('metin okunabilir; ses/atlama doğrulanmadı','text readable; audio/seek unverified'):t('metin ve ses erişimi doğrulanmadı','text and audio access unverified'))+t('. İndirme veya üretim kendiliğinden başlamaz.','. No download or generation starts automatically.'));
      const nearEnd=Number.isFinite(live.browserDuration)&&live.browserDuration>0&&Number.isFinite(live.browserTime)&&live.browserTime>=live.browserDuration-2;
      const rkey=JSON.stringify([owner,nearEnd,en()]);if(resumeKey!==rkey){resumeKey=rkey;resumeBox.replaceChildren();if(nearEnd){resumeBox.append(make('p','',t('Bölüm sonunda bırakılmış. Devam veya baştan başlama açık seçiminizdir; dinlendi işareti değişmez.','Left near the end. Continue or restart is your choice; listening status is unchanged.')));for(const restart of [false,true])resumeBox.append(button(restart?t('Baştan başlat','Restart'):t('Buradan devam et','Continue here'),()=>{if(snapshot().owner===owner)void resume?.(restart,owner);}));}}
      const sample = model.clock(tab, live.mediaKey, generation, now());
      set(clock, t('Medya saati: ', 'Media clock: ') + label(sample.state)
        + (sample.stream ? t(' · akış ', ' · stream ') + sample.stream : '')
        + (sample.type === 'audio' ? t(' · ses', ' · audio') : sample.type === 'video' ? t(' · video', ' · video') : '')
        + (sample.age === null ? '' : t(' · örnek yaşı ', ' · sample age ') + Math.floor(sample.age) + ' s')
        + (sample.time == null ? '' : ' · ' + stamp(sample.time))
        + t('. Altyazı zamanıyla eşleşme kanıtı değildir.', '. This does not prove subtitle time alignment.'));
      const c = live.browserCeaCapture;
      set(captureHead, t('Yakalanamayan aralıklar', 'Uncaptured intervals'));
      const known = !!c?.expectedDuration && c.planComplete === true;
      set(captureText, (c ? label(c.state) + ` · ${c.completed || 0}/${c.total || 0}` : t('CEA planı yok', 'No CEA plan'))
        + (known ? t(' · kaynak planı kapalı', ' · source plan closed') : t(' · tam kapsam bilinmiyor', ' · full coverage unknown'))
        + t('. Metindeki sessizlik eksik yakalama sayılmaz.', '. Silence in text is not a capture gap.'));
      const review = model.capture(c || {});
      const missing = c ? review.missingRanges : (tab.diagnostics?.coverage || []).flatMap(row => model.ranges(row.missingRanges)).slice(0, 100);
      const unavailable = review.unavailableRanges;
      const key = JSON.stringify([missing, unavailable, review.missingRangeCount, en()]);
      if (key !== rangeKey) {
        rangeKey = key; ranges.replaceChildren();
        for (const range of missing.slice(0, 20)) ranges.append(make('li', '', `${stamp(range.start)} – ${stamp(range.end)} · ${t('yakalanmadı', 'not captured')}`));
        for (const range of unavailable.slice(0, 10)) ranges.append(make('li', '', `${stamp(range.start)} – ${stamp(range.end)} · ${t('yayıncı parçası yok; yeniden denenemez', 'publisher gap; cannot retry')}`));
        if (!missing.length && !unavailable.length) ranges.append(make('li', '', known && c?.complete ? t('Bilinen planda eksik aktarım yok.', 'No missing transfers in the known plan.') : t('İncelenebilir aralık kanıtı yok.', 'No interval evidence to inspect.')));
        if (Math.max(missing.length, review.missingRangeCount) > 20) ranges.append(make('li', '', t('İlk 20 eksik aralık gösteriliyor; toplam ', 'First 20 missing intervals shown; total ') + Math.max(missing.length, review.missingRangeCount)));
      }
      const nextCapture = JSON.stringify([owner, review.reviewId, review.canRetryMissing, en()]);
      if (captureKey !== nextCapture) {
        captureKey = nextCapture; captureAction.replaceChildren();
        if (review.canRetryMissing && review.reviewId) captureAction.append(button(t('Yalnız eksik parçaları yeniden dene', 'Retry missing segments only'), async () => {
          try { await retryMissing({ owner, reviewId: review.reviewId, missing }); }
          catch (error) { if (snapshot().owner === owner) set(notices, error.message); }
        }));
        else captureAction.append(make('p', 'browser-work-note', t('Aralık tekrarı doğrulanmadı. Mevcut tam yakalama aracı kullanılabilir; yeniden açılışta çözücü baştan doğrulama gerektirebilir.', 'Interval retry unverified. The existing full capture tool remains available; after restart the decoder may require verification from the beginning.')));
      }
      channels.forEach((node, index) => {
        const secondary = !!index, state = model.channel(tab, secondary, tracks, live, generation);
        const nextKey = JSON.stringify([owner, state, en(), tracks.map(track => [track.id, track.updatedAt, track.sourceMismatch])]);
        if (channelKeys[index] === nextKey) return;
        channelKeys[index] = nextKey;
        const id = secondary ? live.browserLoadedTrackId2 : live.browserLoadedTrackId;
        const track = tracks.find(row => row.id === state.id || !state.id && row.id === id);
        node.replaceChildren(make('strong', '', t(secondary ? 'İkinci kanal' : 'Birinci kanal', secondary ? 'Secondary channel' : 'Primary channel') + ' · ' + label(state.state)),
          make('p', '', model.origin(track || (state.path ? { source: 'manual' } : null), en())));
        if (state.path) node.append(make('small', '', state.path.split(/[\\/]/).pop()));
        if (['failed', 'verify'].includes(state.state) && state.path) node.append(button(t('Bu kanalı yeniden doğrula ve yükle', 'Verify and reload this channel'), async () => {
          try { await retryChannel({ owner, secondary, path: state.path, id: state.id }); }
          catch (error) { if (snapshot().owner === owner) set(notices, error.message); }
        }));
        if (state.state === 'waiting') node.append(make('small', '', t('Kayıtlı iz bekleniyor; başka dil seçilmedi.', 'Waiting for the saved track; another language was not selected.')));
      });
    }
    host.addEventListener('toggle', render);
    return { render };
  }
  return { create };
});

if (typeof window === 'object' && window.BrowserWorkInspectorUI && typeof player !== 'undefined') {
  (() => {
    const owner = () => JSON.stringify([player.browserActiveTabId, currentGeneration(), player.mediaKey,
      browserTabState()?.generation, browserTabState()?.subtitleSelection, player.subPath, player.sub2Path]);
    const current = token => player.workspaceMode === 'browser' && owner() === token;
    const t = (tr, en) => window.UiLocale?.get?.() === 'en' ? en : tr;
    const fail = () => Error(t('Kaynak veya seçim değişti; yeniden inceleyin.', 'The source or selection changed; review again.'));
    const options = { document, model: window.BrowserWorkInspector,
      en: () => window.UiLocale?.get?.() === 'en',
      snapshot: () => ({ tabs: player.browserTabs, tab: browserTabState(), live: player,
        offline: typeof navigator==='object'&&navigator.onLine===false, results: window.SubtitleWorkStatus?.results?.()||[],
        timing: [false,true].map(secondary=>{const transform=browserTransformForChannel(secondary),cue=(secondary?player.cues2:player.cues)?.[0];return {channel:secondary?'2':'1',scale:transform.scale,offset:transform.offsetSeconds,start:cue?.start??null,media:cue?browserSubtitleSync.sourceToVideoTime(cue.start,transform):null};}),
        dub: window.BrowserDubAudioUI?.status?.(), tracks: player.browserTracks, generation: currentGeneration(), owner: owner(), job: state.running ? player.job : null,
        approvals: Object.fromEntries(player.browserTabs.map(tab => [tab.id, window.AssistantAgentUI?.tabStatus?.(tab.id, tab.generation, window.AssistantSourceContext?.pageKey(tab.url))])) }),
      activate: id => void activateBrowserTabAndFocus(id),
      retryMissing: async proof => {
        if (!current(proof.owner)) throw fail();
        const yes = await openAppDialog({ title: t('Eksik yakalamayı yeniden dene', 'Retry missing capture'),
          description: (browserTabState()?.title || '') + '\n' + proof.missing.slice(0, 20).map(r => `${r.start.toFixed(2)}–${r.end.toFixed(2)} s`).join('\n')
            + '\n' + t('Yalnız aynı kaynağın eksik parçaları alınır. Yeni çeviri isteği açılmaz; önceden istediğiniz bekleyen çeviri tamamlanınca sürebilir.', 'Only missing segments of the same source are fetched. No new translation is requested; a previously requested waiting translation may continue on completion.'),
          confirmLabel: t('Yeniden dene', 'Retry'), cancelLabel: t('Vazgeç', 'Cancel') });
        if (!yes) return;
        if (!current(proof.owner) || player.browserCeaCapture?.reviewId !== proof.reviewId) throw fail();
        const result = await window.api.captureFullBrowserSubtitle(player.browserActiveTabId, 'retry-missing', proof.reviewId);
        if (result?.ok !== true) throw Error(result?.error || t('Yakalama başlatılamadı.', 'Capture could not start.'));
      },
      resume: async (restart,token) => {if(!current(token))return;try{if(restart){const sought=await browserCommand('seek',0);if(sought?.ok===false)throw Error(sought.error||'Seek failed');if(!current(token))return;}await browserCommand('play');}catch(error){logLine(error.message,'warn');}},
      openResult: async receipt => {
        const job=receipt.job;
        if(job.browserTabId){const tab=player.browserTabs.find(row=>row.id===job.browserTabId&&row.mediaKey===job.mediaKey);if(!tab)throw fail();if(tab.id!==player.browserActiveTabId)await activateBrowserTabAndFocus(tab.id);if(player.workspaceMode!=='browser'||player.mediaKey!==job.mediaKey||player.browserActiveTabId!==job.browserTabId)throw fail();}
        else if(player.mediaKey!==job.mediaKey){const item=watchLibraryCache.find(row=>row.key===job.mediaKey&&['local','youtube'].includes(row.type));if(!item)throw fail();await openWatchLibraryItem(item,undefined,{seek:false});$('playerVideo')?.pause();if(player.mediaKey!==job.mediaKey)throw fail();}
        if(job.browserMediaToken&&currentBrowserWhisperAudio()?.mediaToken!==job.browserMediaToken)throw fail();
        const token=owner(),mode=player.workspaceMode,reviewCurrent=()=>player.workspaceMode===mode&&owner()===token,hashes={};
        for(const output of receipt.outputs){const read=await window.api.readSubtitle(output.path);if(!reviewCurrent())throw fail();if(!read?.ok||!read.sha256)throw Error(t('Kayıtlı çıktı okunamadı; yeniden üretim başlatılmadı.','Saved output unavailable; generation was not started.'));if(output.receiptHash&&output.receiptHash!==read.sha256)throw Error(t('Çıktı kayıt sonrasında değişmiş; eski makbuz uygulanamaz.','Output changed after recording; the old receipt cannot be applied.'));hashes[output.path]=read.sha256;}
        const yes=await openAppDialog({title:t('Kayıtlı çıktıyı yükle','Load saved output'),description:receipt.outputs.map(r=>(r.role||'?')+' · '+(r.status||'?')+(r.receiptHash?'':t(' · üretim sürümü doğrulanamadı',' · production revision unverified'))+' · '+r.path.split(/[\\/]/).pop()).join('\n'),confirmLabel:t('Doğrulanan çıktıyı yükle','Load verified output'),cancelLabel:t('Vazgeç','Cancel')});
        if(!yes)return;if(!reviewCurrent())throw fail();
        const generation=currentGeneration(),key=player.mediaKey,id=player.browserActiveTabId;
        const result=await attachCompletedJobSubtitles({outputs:receipt.outputs},{...job,generation},{force:true,expectedOutputHashes:hashes,isCancelled:()=>currentGeneration()!==generation||player.mediaKey!==key||player.browserActiveTabId!==id});
        if(!result.loaded)throw Error(result.reason||t('Yüklenemedi','Could not load'));
      },
      retryChannel: async proof => {
        if (!current(proof.owner)) throw fail();
        if (player.editing || player.cueHistoryBusy || timelineEditsPending()) throw Error(t('Önce bekleyen altyazı düzenlemesini tamamlayın.', 'Finish pending subtitle edits first.'));
        const tab = browserTabState(), generation = currentGeneration(), selection = tab.subtitleSelection;
        const track = player.browserTracks.find(row => row.id === proof.id);
        if (track?.sourceMismatch) throw fail();
        const result = await loadSubtitle(proof.path, proof.secondary, { silent: true, restoringSelection: true,
          select: true, preserveSecondary: true,
          isCancelled: () => !current(proof.owner),
          role: track?.role || (proof.secondary ? 'translation' : 'source') });
        if (staleGeneration(generation) || browserTabState() !== tab || tab.subtitleSelection !== selection) return;
        tab.subtitleRestoreResults ||= {};
        const loaded = result?.ok === true && result.loaded === true && player[proof.secondary ? 'sub2Path' : 'subPath'] === proof.path;
        tab.subtitleRestoreResults[proof.secondary ? 'secondary' : 'primary'] = { generation, path: proof.path, state: loaded ? 'loaded' : 'failed' };
        if (!loaded) throw Error(t('Dosya okunamadı; diğer kanal korundu.', 'The file could not be read; the other channel was preserved.'));
        tab.subtitleSelectionLoadingFailed = undefined;
        await restoreBrowserSubtitleSelection(tab);
      },
    };
    window.PlayerOutputReview={open:options.openResult};
    const view=window.BrowserWorkInspectorUI.create(options);
    const refresh = () => { if (player.workspaceMode === 'browser') view?.render(); };
    document.addEventListener('ui-locale-change', refresh);
    document.addEventListener('assistant-agent-changed', refresh);
    document.addEventListener('media-context-changed', refresh);
    // The panel is read-only and updates only while expanded. No telemetry,
    // filesystem access or provider requests are started by this timer.
    setInterval(refresh, 1000);
    refresh();
  })();
}
