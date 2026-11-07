(() => {
  'use strict';
  if (!window.api?.updateAssistant || !window.api.onAssistantCommand) return;
  const $ = id => document.getElementById(id);
  let timer,receipt=null,toolNotice='';const proposedActions=new Map();
  // Open result per podcast source card. The controller owns re-entry, cancellation and late-answer protection.
  let podcastController=null;
  const podcastSources=()=>podcastController??=window.AssistantPodcastSources?.createController({
    locale:()=>window.UiLocale?.get?.()||'en',mediaShelf:input=>window.api.mediaShelf(input),
    open:(row,options)=>typeof openPodcastResearchResult==='function'?openPodcastResearchResult(row,options):Promise.resolve(false),
    workspace:{key:()=>window.AssistantWorkspace?.key(),activeId:key=>window.AssistantWorkspace?.activeId(key)},onChange:()=>publish()});
  const openPodcastCitation=(linkId,card)=>void podcastSources()?.click(linkId,card);
  const commandToken=()=>{const thread=window.AssistantWorkspace?.activeId();return aiSourceScope()+(thread?'|thread:'+thread:'');};
  let nextLink = 0;
  const linkIds = new WeakMap(), links = new Map();
  let suggestionScope = '', suggestionSequence = 0;
  const suggestions = new Map();
  // Where "Go to source" leads: only contexts that have a real owner to return to.
  const sourceTarget=()=>{const ctx=window.globalAssistantContext?.()||null;if(ctx?.workspace==='podcast')return {kind:'podcast'};if(ctx?.catalogId&&ctx.type==='library-title')return {kind:'library'};return null;};
  function publish() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tr = window.UiLocale?.get?.() === 'tr';
      const selectionContext = globalAssistantContext();
      const suppliedBook=selectionContext?.chapterTextComplete?window.AssistantContextManifest.sourceText(selectionContext):null;
      const bookDescription=suppliedBook?[suppliedBook.sourceTruncated?(tr?'Kısaltılmış bölüm/sayfa metni':'Partial chapter/page text'):(tr?'Tam bölüm/sayfa metni':'Complete chapter/page text'),selectionContext.title,selectionContext.chapter,(tr?'Sağlanan karakter: ':'Characters supplied: ')+(suppliedBook.chapterText?.length||0),suppliedBook.chapterText?.slice(0,900),tr?'Kitabın diğer bölümleri ekli değil.':'Other chapters of the book are not attached.'].filter(Boolean).join('\n'):'';
      const pageContext=!selectionContext&&player.workspaceMode==='browser'&&/^https?:/i.test(player.browserPageUrl||'');
      const videoContext=pageContext&&!!currentBrowserYoutubeUrl();
      const attachedSelection=window.AssistantSourcePreview.hasAttachedSource(selectionContext);
      const podcastTranscript=selectionContext?.workspace==='podcast'&&!!selectionContext.transcript_evidence&&!selectionContext.transcript_evidence.limitations?.includes('untimed-transcript-excluded');
      const transcriptScope=podcastTranscript||!selectionContext&&(player.workspaceMode==='browser'?(typeof aiVideoRows==='function'&&aiVideoRows().length>0):(player.cues?.length>0));
      const pageTask=window.AssistantAgentUI?.status()||window.AssistantVideoCommands?.status()||window.AssistantPageCommands?.status()||window.AssistantMediaCommands?.status();
      const context = selectionContext ? (selectionContext.title || selectionContext.heading || (selectionContext.workspace === 'media-library' ? (tr?'Medya kütüphanesi':'Media library') : (tr?'Altyazı stüdyosu':'Subtitle studio')))
        : (pageContext?(player.browserPageTitle||$('playerTitle')?.textContent):$('playerTitle')?.textContent) || (tr ? 'Açık video / sayfa' : 'Current video / page');
      links.clear();
      const scope = aiSourceScope(),workspace=window.AssistantWorkspace?.snapshot(),threadId=workspace?.current?.id||'';
      const pinScope=selectionContext?JSON.stringify(['selectionContext',selectionContext.workspace,selectionContext.page,selectionContext.id,selectionContext.chapter]):window.AssistantSourceContext.conversation(player,null);
      if (scope !== suggestionScope) { suggestionScope = scope; ++suggestionSequence; }
      suggestions.clear();
      const hasSource=attachedSelection||pageContext||videoContext||transcriptScope;
      const opts = buildOptsFromUI();
      const selection = globalAssistantContext();
      const summary = selection?.workspace === 'media-selection'
        ? (tr ? 'Verilen yapım bilgilerini veya bölüm alıntısını özetle. Eserin tamamını okuduğunu ya da izlediğini iddia etme.' : 'Summarize only the provided metadata or chapter excerpt. Do not claim to have read or watched the full work.')
        : (tr ? 'Sağlanan altyazı veya sayfa bağlamını kısaca özetle; eksik kaynağı açıkça belirt.' : 'Briefly summarize the supplied subtitle or page context. State when source material is missing.');
      const filmId=selectionContext?.catalogId||selectionContext?.id||'';
      const filmContext=['library-title','discovery-title'].includes(selectionContext?.type)&&!selectionContext?.reviewAnalysis&&!filmId.startsWith('person:');
      const filmPrompts=filmContext?[
        {kind:'film-reviews',label:tr?'Yorumları değerlendir':'Discuss reviews',prompt:tr?`get_film_context aracını item_id=${JSON.stringify(filmId)} ile kullan. Kayıtlı yorum analizini kaynaklarıyla açıkla; yoksa yorum yükleme yolunu anlat. Yeni yorum veya AI analizi başlatma. Spoiler açma.`:`Use get_film_context with item_id=${JSON.stringify(filmId)}. Explain saved analysis with its evidence, or explain how to load reviews if none exist. Do not fetch or analyze new reviews or reveal spoilers.`},
        {kind:'film-fit',label:tr?'Zevkime uygun mu?':'Is it for me?',prompt:tr?`get_film_context (item_id=${JSON.stringify(filmId)}) ile yalnız kayıtlı kanıtlara göre değerlendir. Tercih veya yorum eksikse belirt; filmi izlemiş gibi davranma ve spoiler açma.`:`Use get_film_context (item_id=${JSON.stringify(filmId)}). Compare only saved evidence. State missing preferences/reviews, do not pretend to have watched the film or reveal spoilers.`},
        {kind:'film-related',label:tr?'İlgili filmleri bul':'Explore related films',prompt:tr?`find_film_alternatives aracını item_id=${JSON.stringify(filmId)} ile kullan; dönen gerçek ilişkileri açıkla. Kütüphaneye ekleme veya dosya değiştirme.`:`Use find_film_alternatives with item_id=${JSON.stringify(filmId)}. Explain returned metadata relationships; do not add library entries or modify files.`}
      ]:[];
      const entries = [...filmPrompts,{ kind:'summary', label:videoContext?(tr?'Altyazıyı özetle':'Summarize captions'):pageContext?(tr?'Sayfayı özetle':'Summarize page'):(tr?'Kaynağı özetle':'Summarize source'), prompt:summary },
        ...(pageContext&&!videoContext?[{kind:'page-translate',label:tr?'Sayfayı Türkçeye çevir':'Translate page to Turkish',prompt:'Bu sayfayı Türkçeye çevir.'}]:[]),
        ...(videoContext?[
          {kind:'video-track-translate',label:tr?'Mevcut altyazıyı çevir':'Translate captions',prompt:'Videonun mevcut altyazısını Türkçeye çevir.'},
          {kind:'video-whisper-only',label:tr?'Yalnız Whisper':'Whisper only',prompt:'Whisper ile yalnız altyazı çıkar.'},
          {kind:'video-whisper-translate',label:tr?'Whisper + çeviri':'Whisper + translation',prompt:'Whisper ile altyazı çıkar ve Türkçeye çevir.'},
        ]:[]),
        ...(['book-page','book-chapter'].includes(selectionContext?.type)?[{kind:'book-context',label:tr?'Sayfa ve ses durumunu oku':'Read page & voice status',prompt:tr?'get_book_context aracıyla yalnız açık sayfa/bölüm ve mevcut üretim durumunu oku; iş başlatma.':'Use get_book_context to read only the current page/chapter and production state; do not start a job.'}]:[]),
        ...(selectionContext?.workspace==='media-library'||['library-title','discovery-title','taste-profile'].includes(selectionContext?.type)?[{kind:'library-search',label:tr?'Kütüphanede bul':'Search library',prompt:tr?'Kütüphanemde hangi yapımlar var? Mevcut katalog aracıyla sınırlı bir örnek göster; dosyaları veya durumlarını değiştirme.':'Use the library tool to show a bounded sample of my saved titles. Do not modify files or statuses.'},{kind:'taste-evidence',label:tr?'Zevk kanıtlarımı göster':'Show taste evidence',prompt:tr?'get_taste_profile ile kayıtlı zevk kanıtlarımı göster; varsayılan ayarları kişisel tercihim sayma.':'Use get_taste_profile to show saved evidence; defaults are not my explicit preferences.'}]:[]),
        {kind:'explain',label:tr?'Daha anlaşılır açıkla':'Explain clearly',prompt:tr?'Yalnız sağlanan bağlamı sade ve anlaşılır Türkçeyle açıkla. Videoda altyazı varsa seçili kapsam içindeki konuşmayı esas al. Eksik kanıtı belirt; eser hakkında bilgi uydurma.':'Explain only the supplied context in clear language. For a captioned video use the selected transcript scope. State missing evidence; do not invent knowledge of the work.'},
        ...(transcriptScope?[{kind:'translation',label:tr?'Çeviriyi değerlendir':'Review translation',prompt:tr?'Yalnız sağlanan kaynak ve çeviri altyazılarını karşılaştır. Anlam kaybı, özel ad ve sayı sorunlarını örnekleriyle belirt. Yeterli eşleşen satır yoksa açıkça söyle. Dosyaları değiştirme; önerilerini açıkla.':'Compare only the supplied source and translated subtitles. Explain meaning loss, proper-name and numeric issues with examples. State when matching evidence is insufficient. Do not modify files; explain suggested improvements.'}]:[]),
        ...(!selectionContext&&!pageContext?[{ kind:'voice', label:tr?'Seslendirme hazırla':'Prepare voice' }]:[]), ...(!pageContext?[{ kind:'tasks', label:tr?'İşlem merkezi':'Activity' }]:[])];
      const specs = entries.filter(row=>hasSource||!['summary','explain'].includes(row.kind)).map(row => {
        const id = `${suggestionSequence}:${row.kind}`;
        suggestions.set(id, { ...row, scope });
        return { id, label:row.label, direct:['summary','explain','page-translate'].includes(row.kind), review: `${tr?'Kaynak':'Source'}: ${context}\n${['summary','explain','translation'].includes(row.kind) ? `${tr?'Model':'Model'}: ${assistantProviderSelection().model || (tr?'Mevcut AI ayarı':'Current AI setting')}\n${tr?'Seçili bağlam mevcut sağlayıcıya gönderilir.':'Selected context will be sent to your current provider.'}` : row.kind.startsWith('video-') ? (tr?'Seçili YouTube videosunda mevcut altyazı/Whisper akışı başlatılır; ilerleme burada gösterilir.':'Runs the selected YouTube caption/Whisper workflow; progress appears here.') : row.kind.startsWith('film-') ? (tr?'Açık filmin bilgileri ve gerektiğinde kayıtlı yorum/zevk kanıtları mevcut modelle değerlendirilir. Yeni yorum analizi veya kayıt değişikliği başlatılmaz.':'Uses the current film and saved review/taste evidence with the selected model. Does not start a new review analysis or change records.') : row.kind==='voice' ? (tr?'Mevcut ses penceresi açılır. SRT, referans ses ve zaman aralığını incelemeden üretim başlamaz.':'Opens the existing voice window. Review SRT, reference and time range before starting production.') : (tr?'Çalışan işleri ve kontrollerini gösterir; iş başlatmaz.':'Shows existing jobs and controls; does not start a job.')}` };
      });
      proposedActions.clear();
      const podcastLink=(id,c,result)=>{links.set(id,{podcastCitation:c});const d=window.AssistantPodcastSources.describe(c,tr),st=podcastSources()?.state(id);result.links.push({id,label:d.label,title:d.title,excerpt:c.quote,meta:d.meta,scope:d.scope,more:c.scope.more,action:d.action,usage:c.usage,state:st?.state||'',note:st?.note||''});};
      function decorate(row){
        const result={...row,role:row.role==='assistant'?'ai':row.role,loading:row.status==='streaming'||!!row.loading,error:['failed','stopped'].includes(row.status)||!!row.error};
        result.links=(row.evidence||[]).slice(0,40).map((e,index)=>{const id='e:'+threadId+':'+row.id+':'+index;links.set(id,{evidence:e});return {id,label:Math.floor(e.start/60)+':'+String(Math.floor(e.start%60)).padStart(2,'0'),excerpt:e.text,translation:e.translation||''};});
        for(const [index,e]of(row.feedEvidence||[]).entries()){const id='f:'+threadId+':'+row.id+':'+index;links.set(id,e.nodeId?{recallNodeId:e.nodeId}:{external:e.url});result.links.push({id,label:'['+e.id+'] '+e.title,excerpt:e.text});}
        for(const [index,e]of(row.pageEvidence||[]).entries()){const id='s:'+threadId+':'+row.id+':'+index;links.set(id,{pageEvidence:e});result.links.push({id,label:'['+e.id+']',excerpt:e.text});}
        for(const [index,c]of(row.citations||[]).entries()){const id='b:'+threadId+':'+row.id+':'+index;if(c.kind==='podcast'){if(window.AssistantPodcastSources)podcastLink(id,c,result);}else if(c.kind==='film-review'){links.set(id,{filmCitation:c});result.links.push({id,label:(tr?'Kaynak yorum · ':'Source review · ')+(c.author||c.title),excerpt:c.text});}else{links.set(id,{bookCitation:c});result.links.push({id,label:'['+c.id+'] '+(tr?'Sayfa ':'Page ')+c.page,excerpt:c.text});}}
        if(/Web sources:|Web kaynakları:/.test(row.text||''))for(const [index,match] of [...String(row.text).split(/Web sources:|Web kaynakları:/).at(-1).matchAll(/https?:\/\/[^\s<>]+/g)].slice(0,10).entries()){const id='w:'+threadId+':'+row.id+':'+index;links.set(id,{external:match[0]});result.links.push({id,label:match[0]});}
        result.actions=(row.actions||[]).map((action,index)=>{const id='p:'+threadId+':'+row.id+':'+index;proposedActions.set(id,action);return {id,kind:action.kind,label:action.label||'',excerpt:action.kind==='app_action'?action.summary||'':action.source?.text||'',translation:action.translation||'',...window.AssistantAgentUI?.flowInfo(action),resultStatus:action.resultStatus||'',refreshable:action.refreshable===true,resultText:action.resultText||'',live:action.proposalId&&window.AssistantAgentUI?.applyingId?.()===action.proposalId?'running':'',activity:action.kind==='app_action'&&['voice','video','subtitles','page','book','music','jobs'].includes(window.AssistantCapabilities?.get?.(action.tool)?.domain),time:action.source?.start};});
        // A source counts as cited only when the answer text carries its marker; everything else the tools found is "found, not cited".
        const markerOf=link=>{const target=links.get(link.id)||{};return target.evidence?.id||target.pageEvidence?.id||target.filmCitation?.id||target.bookCitation?.id||(/^\[([^\]\n]{1,80})\]/.exec(link.label||'')||[])[1]||'';};
        for(const link of result.links){if(link.usage)continue;const marker=markerOf(link);if(marker)link.usage=String(row.text||'').includes('['+marker+']')?'cited':'found';}
        result.basis=row.basis||null;return result;
      }
      const messages=(workspace?.current?.messages||[]).map(decorate);
      for(const node of document.querySelectorAll('#aiChatLog .ai-msg')){
        if(node._sourceScope!==scope||node._assistantMessageId||threadId&&node._assistantThreadId!==threadId)continue;
        messages.push({role:node.classList.contains('ai-msg-user')?'user':'ai',text:node.textContent,loading:node.classList.contains('is-loading'),error:node.classList.contains('ai-msg-err'),links:[...node.querySelectorAll('.ai-time-link,.ai-source-link')].slice(0,40).map(button=>{if(!linkIds.has(button))linkIds.set(button,String(++nextLink));const id=linkIds.get(button);links.set(id,button);return {id,label:button.textContent};})});
      }
      const browserPanelDocked = player.workspaceMode === 'browser'
        && !document.getElementById('playerLayer')?.classList.contains('hidden')
        && sidebarIsVisible()
        && (!player.narrowViewport || responsivePanelTakeoverActive())
        && !document.getElementById('playerSide')?.classList.contains('side-rail');
      window.api.updateAssistant({ locale: tr ? 'tr' : 'en', sourceTarget: sourceTarget(), theme: document.documentElement.dataset.theme,
        palette:Object.fromEntries(Object.entries({surface:'--bg-1',raised:'--bg-2',hover:'--bg-3',line:'--border',strong:'--border-strong',text:'--text',muted:'--text-muted',accent:'--accent'}).map(([key,token])=>[key,getComputedStyle(document.body).getPropertyValue(token).trim()])),
        sourcePreview:window.AssistantSourcePreview.build({locale:tr?'tr':'en',selection:selectionContext,page:pageContext,video:videoContext,transcript:!!transcriptScope,scope:$('aiTranscriptScope')?.value,position:player.workspaceMode==='browser'?Number(player.browserTime)||0:subtitleSourceTime(document.getElementById('playerVideo')?.currentTime||0,false),sourceLanguage:selectionContext?'':subtitleContextLanguage('source'),targetLanguage:selectionContext?'':subtitleContextLanguage('translation'),range:videoContext?currentBrowserWhisperRange():null}),
        suggestions: specs,receipt,sourceToken:commandToken(),pinScope,threads:workspace?.threads||[],activeThread:threadId,
        canRuntimeMessage:!!window.AssistantAgentUI?.status()&&!window.AssistantAgentUI?.status()?.cancelled&&window.AssistantAgentUI?.status()?.phase!=='applying',runtimeMessages:window.AssistantAgentUI?.status()?.runtimeMessages||[],jobs:window.AssistantJobsUI?.snapshot()?.jobs||[],workspaceError:workspace?.error||toolNotice,draft:workspace?.current?.draft||'',model:assistantProviderSelection().model||'',
        pageContext,videoContext,transcriptScope,blocked:!!((window.AssistantAgentUI?.busy()||window.AssistantVideoCommands?.busy()||window.AssistantPageCommands?.busy()||window.AssistantMediaCommands?.busy())&&!pageTask)||!!(player.job?.kind==='chat'&&(player.job.running||player.job.awaitingExit)),
        canCancel:!!(pageTask || aiChatPreparing?.scope===scope || (player.job?.kind==='chat'&&player.job.sourceScope===scope&&(player.job.running||player.job.awaitingExit))),
        sourceDescription:selectionContext&&!attachedSelection ? (tr?'Henüz video, kitap veya yapım seçilmedi. İçeriği hakkında soru sormak için bir kaynak aç; uygulama yardımı ve kütüphane araması kullanılabilir.':'No video, book or title is selected. Open a source to ask about its content; application help and library search are available.') : selectionContext ? [({'book-page':tr?'Açık PDF sayfası':'Current PDF page','book-chapter':tr?'Seçili kitap bölümü':'Selected book chapter','library-title':tr?'Seçili yapım bilgisi':'Selected title metadata','taste-profile':tr?'Zevk profili ve yorum örneği':'Taste profile and review sample','feed-sources':tr?'Seçili akış kaynakları':'Selected feed sources','media-tool':tr?'Açık medya aracı':'Current media tool'})[selectionContext.type]||(selectionContext.workspace==='media-library'?(tr?'Medya kütüphanesi':'Media library'):(tr?'Altyazı stüdyosu':'Subtitle studio')),selectionContext.chapter||'',(selectionContext.selectedText?((tr?'Seçili pasaj: ':'Selected passage: ')+selectionContext.selectedText):selectionContext.excerpt||selectionContext.synopsis||selectionContext.note||''),tr?'Yalnız sağlanan metin ve bilgiler kullanılır; eserin tamamı ekli değildir.':'Only supplied text and metadata are available; the full work is not attached.'].filter(Boolean).join('\n').slice(0,1400) : (pageContext&&!transcriptScope?(tr?'Açık web sayfasının okunabilen metni kullanılır. Sayfa çevirisi mevcut sayfa aracını çalıştırır. Giriş veya koruma ekranı makale içeriği sayılmaz.':'Uses readable text from the open web page. Page translation runs the existing page tool. Login or challenge screens are not article content.'):(tr?'Altyazı bağlamı kullanılır. Bu panel görüntüden video analizi yapmaz.':'Uses subtitle context. This panel does not analyze video pixels.')),
        scope: $('aiTranscriptScope')?.value,
        bottomInset: document.querySelector('.ms-dock:not(.hidden)')?.getBoundingClientRect().height || 0,
        toolbarDocked:!!document.querySelector('.sh-host .sh')||browserPanelDocked||(document.body.classList.contains('media-home-active')&&['home','discover'].includes(document.getElementById('mediaHome')?.dataset.page)&&!!document.querySelector('.mh-header .mv-assistant')),
        // Pins are read-only notes; unlike live job scopes they survive source generations.
        conversation:pinScope+(threadId?'|thread:'+threadId:''), context, busy: !!window.AssistantAgentUI?.status() || !!aiChatPreparing || !!(player.job?.kind === 'chat' && (player.job.running || player.job.awaitingExit)),
        activity: window.AssistantAgentUI?.status()?.activity || '',
        phase: window.AssistantAgentUI?.status()?.phase || 'waiting',
        retry: !!window.AssistantAgentUI?.canRetry() || !!aiChatRetryPacket && aiChatRetryPacket.scope === aiSourceScope(),
        messages: messages,
        ...(bookDescription?{sourceDescription:bookDescription}:{}),
      });
    }, 50);
  }
  async function sendQuestion(packet){
    const before=new Set(document.querySelectorAll('#aiChatLog .ai-msg'));
    const source=aiSourceScope();
    const acceptedNow=()=>{if(source!==aiSourceScope())return;const added=[...document.querySelectorAll('#aiChatLog .ai-msg-user')].filter(node=>!before.has(node)&&node._sourceScope===source);if(added.some(node=>node.textContent===String(packet.text||'').trim())){toolNotice='';receipt={id:packet.requestId,accepted:true,message:''};publish();}};
    const observer=new MutationObserver(acceptedNow);observer.observe($('aiChatLog'),{childList:true,subtree:true});
    try{await (packet.action==='web-search'?aiWebResearch:aiChatSend)(String(packet.text||'').slice(0,16000));
      const added=[...document.querySelectorAll('#aiChatLog .ai-msg')].filter(node=>!before.has(node)&&node._sourceScope===aiSourceScope());
      const accepted=added.some(node=>node.classList.contains('ai-msg-user')&&node.textContent===String(packet.text||'').trim());
      if(accepted&&source===aiSourceScope())toolNotice='';
      receipt={id:packet.requestId,accepted,message:accepted?'':(added.find(node=>node.classList.contains('ai-msg-err'))?.textContent || (window.UiLocale?.get?.()==='tr'?'Soru gönderilemedi. Metnin korundu; sağlayıcı ayarını veya çalışan işleri kontrol et.':'The question was not sent. Your draft is kept; check provider settings or running tasks.'))};
    }catch(error){receipt={id:packet.requestId,accepted:false,message:error.message};}
    finally{observer.disconnect();}
    publish();
  }
  async function applyProposal(proposal){
    if(proposal.kind==='app_action'){await window.AssistantAgentUI.apply(proposal);toolNotice='';publish();return;}
    if(globalAssistantContext())throw Error(window.UiLocale?.get?.()==='tr'?'Bu işlem için ilgili videoyu aç.':'Open the matching video first.');
    if(proposal.kind==='open_voice_preparation'){await window.MediaExperience.openVoice();return;}
    if(!Number.isFinite(proposal.source?.start)||proposal.source.start<0)throw Error('Invalid source time.');
    if(proposal.kind==='seek_to_time'){if(player.workspaceMode==='browser')await browserCommand('seek',proposal.source.start);else document.getElementById('playerVideo').currentTime=subtitleVideoTime(proposal.source.start,false);return;}
    if(proposal.kind==='preview_translation_change'){await window.api.copyText(proposal.translation);toolNotice=window.UiLocale?.get?.()==='tr'?'Öneri panoya kopyalandı. Altyazı dosyan değiştirilmedi.':'Suggestion copied. Your subtitle file was not changed.';publish();}
  }
  window.api.onAssistantCommand(packet => {
    if (!packet || typeof packet !== 'object') return;
    const scoped=['steer','followup','send','web-search','cancel','retry','clear','citation','suggestion','scope','new-thread','select-thread','rename-thread','delete-thread','branch','save-dossier','save-timeline','open-artifact','apply-tool','refresh-tool','continue-tool','settings','note'].includes(packet.action);
    if(scoped&&(!packet.sourceToken||packet.sourceToken!==commandToken())){if(['steer','followup','send','web-search'].includes(packet.action))receipt={id:packet.requestId,accepted:false,message:window.UiLocale?.get?.()==='tr'?'Kaynak değişti. Sorun gönderilmedi; metnin taslakta korundu.':'The source changed. Your question was not sent; the draft was kept.'};publish();return;}
    if (packet.action === 'copy') void window.api.copyText(String(packet.text || ''));
    else if(packet.action==='settings')void Promise.resolve().then(()=>{
      if(packet.sourceToken!==commandToken())return;
      if(!window.AppSettingsUI?.open)throw Error(window.UiLocale?.get?.()==='tr'?'Ayarlar şu anda açılamıyor.':'Settings are unavailable right now.');
      return window.AppSettingsUI.open('ai',{preserveAssistantContext:true});
    }).catch(error=>{toolNotice=error.message;publish();});
    else if (packet.action === 'export') void window.api.mediaTools({action:'assistant-export',text:packet.text}).then(r=>{if(!r?.ok)osd(r?.error||'Export failed.');else if(!r.canceled)osd(trMessage());function trMessage(){return window.UiLocale?.get?.()==='tr'?'Konuşma kaydedildi.':'Conversation saved.';}});
    else if(['new-thread','select-thread','rename-thread','delete-thread','branch'].includes(packet.action)){void window.AssistantWorkspace?.command(packet.action,packet.text).then(()=>{toolNotice='';publish();}).catch(error=>{toolNotice=error.message;publish();});}
    else if(['save-dossier','save-timeline','open-artifact'].includes(packet.action)){
      const task=packet.action==='open-artifact'?window.AssistantWorkspace.openArtifact(packet.text):window.AssistantWorkspace.artifact(packet.text,packet.action==='save-dossier'?'dossier':'timeline');
      void task.then(()=>{toolNotice='';publish();}).catch(error=>{toolNotice=error.message;publish();});
    }
    else if(packet.action==='open-source')void Promise.resolve().then(async()=>{
      if(packet.sourceToken!==commandToken())return;
      const target=sourceTarget(),tr=window.UiLocale?.get?.()==='tr';
      if(!target)throw Error(tr?'Bu bağlamın açılacak bir kaynağı yok.':'This context has no source to open.');
      const unavailable=tr?'Kaynak açılamadı.':'The source could not be opened.';
      let result;
      if(target.kind==='podcast'){
        if(window.MediaShelfUI?.isPodcastMode?.()&&window.CinemaSahne?.openShelf)result=await window.CinemaSahne.openShelf({mode:'podcast'});
        else if(window.CinemaSahne?.open)window.CinemaSahne.open({mode:'podcast'});
        else throw Error(unavailable);
      }else result=await window.MediaTitleUI.open(window.globalAssistantContext().catalogId);
      if(packet.sourceToken!==commandToken())return;
      if(result?.ok===false)throw Error(unavailable);
      toolNotice='';publish();
    }).catch(error=>{if(packet.sourceToken===commandToken()){toolNotice=error.message;publish();}});
    else if(packet.action==='continue-tool'){const proposal=proposedActions.get(packet.text);if(proposal)void window.AssistantAgentUI.continueAction(proposal).catch(error=>{toolNotice=error.message;publish();});}
    else if(packet.action==='refresh-tool'){const proposal=proposedActions.get(packet.text);if(proposal)void window.AssistantAgentUI.refresh(proposal).then(()=>{toolNotice='';publish();}).catch(error=>{toolNotice=error.message;publish();});}
    else if(packet.action==='apply-tool'){const proposal=proposedActions.get(packet.text);if(proposal)void applyProposal(proposal).catch(error=>{toolNotice=error.message;publish();});}
    else if (packet.action === 'steer' || packet.action === 'followup') {
      void window.AssistantAgentUI.message(String(packet.text||''),packet.action).then(()=>{receipt={id:packet.requestId,accepted:true,message:window.UiLocale?.get?.()==='tr'?(packet.action==='steer'?'Yönlendirme sıraya alındı.':'Geçerli yanıt bitince devam edilecek.'):(packet.action==='steer'?'Steering queued.':'Queued after the current answer.')};publish();}).catch(error=>{receipt={id:packet.requestId,accepted:false,message:error.message};publish();});
    }
    else if (packet.action === 'send' || packet.action === 'web-search') void sendQuestion(packet);
    else if (packet.action === 'cancel') {if(window.AssistantAgentUI?.status())void window.AssistantAgentUI.cancel();else if(window.AssistantVideoCommands?.status())void window.AssistantVideoCommands.cancel();else if(window.AssistantMediaCommands?.status())window.AssistantMediaCommands.cancel();else if(window.AssistantPageCommands?.status())void window.AssistantPageCommands.cancel();else if(aiChatPreparing?.scope===aiSourceScope()||player.job?.sourceScope===aiSourceScope())$('aiChatCancel')?.click();}
    else if(packet.action==='cancel-job')void window.AssistantJobsUI?.cancel(packet.text).catch(error=>{toolNotice=error.message;publish();});
    else if (packet.action === 'retry') $('aiChatRetry')?.click();
    else if (packet.action === 'clear') {
      if(window.AssistantAgentUI?.busy()||window.AssistantVideoCommands?.busy()||window.AssistantMediaCommands?.busy()||window.AssistantPageCommands?.busy()||aiChatPreparing||(player.job?.kind==='chat'&&(player.job.running||player.job.awaitingExit)))return;
      for(const node of document.querySelectorAll('#aiChatLog .ai-msg'))if(node._sourceScope===aiSourceScope())node.remove();
      if(player.chatHistoryScope===aiSourceScope()){player.chatHistory=[];player.chatHistoryScope=null;}
      if(aiChatRetryPacket?.scope===aiSourceScope())aiChatRetryPacket=null;
      if(typeof updateAiChatActions==='function')updateAiChatActions();
      window.AssistantWorkspace?.clear();
      if(!document.querySelector('#aiChatLog .ai-msg'))$('aiChatEmpty')?.classList.remove('hidden');
    }
    else if (packet.action === 'citation') {const target=links.get(packet.text);if(target?.pageEvidence){const e=target.pageEvidence,s=e.source,current=typeof browserTabState==='function'?browserTabState():null;if(!s?.tabId||s.tabId!==player.browserActiveTabId||s.pageUrl!==player.browserPageUrl||s.generation===null||current?.generation!==s.generation){toolNotice=window.UiLocale?.get?.()==='tr'?'Özgün sayfa sürümünü aç.':'Open the original page revision.';publish();}else void window.api.revealBrowserPageContext(s.tabId,e.id).then(r=>{if(!r?.ok){toolNotice=r?.error||(window.UiLocale?.get?.()==='tr'?'Kaynak paragraf bulunamadı.':'Source paragraph unavailable.');publish();}}).catch(error=>{toolNotice=error.message;publish();});}else if(target?.filmCitation)void window.AssistantFilmActions.revealCitation(target.filmCitation).catch(error=>{toolNotice=error.message;publish();});else if(target?.bookCitation)void window.BookAssistantUI.assistant.navigate(target.bookCitation).catch(error=>{toolNotice=error.message;publish();});else if(target?.podcastCitation)openPodcastCitation(packet.text,target.podcastCitation);else if(target?.recallNodeId)void window.AssistantRecallSources.reveal(target.recallNodeId).catch(error=>{toolNotice=error.message;publish();});else if(target?.external)void window.api.openExternal(target.external);else if(target?.evidence)void applyProposal({kind:'seek_to_time',source:target.evidence}).catch(error=>{toolNotice=error.message;publish();});else target?.click();}
    else if (packet.action === 'note') {const target=links.get(packet.text);if(target?.podcastCitation)void window.AssistantPodcastNoteUI?.open(target.podcastCitation);}
    else if (packet.action === 'open-activity') window.MediaExperience?.openTasks?.();
    else if (packet.action === 'suggestion') {
      const row = suggestions.get(packet.text);
      if (row?.scope !== aiSourceScope()) { publish(); return; }
      if (['summary','explain','translation','page-translate','video-track-translate','video-whisper-only','video-whisper-translate','book-context','library-search','taste-evidence'].includes(row.kind)) void aiChatSend(row.prompt);
      else if (row.kind === 'voice') window.MediaExperience?.openVoice();
      else if (row.kind === 'tasks') window.MediaExperience?.openTasks();
    }
    else if (packet.action === 'scope' && ['nearby', 'watched', 'full'].includes(packet.text)) {
      $('aiTranscriptScope').value = packet.text; $('aiTranscriptScope').dispatchEvent(new Event('change'));
    }
    publish();
  });
  const observer = new MutationObserver(publish);
  for (const id of ['aiChat', 'playerLayer', 'mediaHome', 'playerTitle']) {
    const node = $(id); if (node) observer.observe(node, { subtree: id === 'aiChat', childList: true, characterData: true, attributes: true });
  }
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const dock = document.querySelector('.ms-dock');
  if (dock) { observer.observe(dock, { attributes: true, attributeFilter: ['class'] }); new ResizeObserver(publish).observe(dock); }
  window.addEventListener('browser-panel-layout',publish);
  document.addEventListener('ui-locale-change', publish);
  document.addEventListener('media-context-changed', publish);
  document.addEventListener('assistant-workspace-changed',publish);
  document.addEventListener('assistant-agent-changed',publish);
  document.addEventListener('assistant-jobs-changed',publish);
  document.addEventListener('assistant-page-task-changed',publish);
  document.addEventListener('assistant-video-task-changed',publish);
  document.addEventListener('assistant-media-task-changed',publish);
  document.addEventListener('browser-page-translation-changed',publish);
  publish();
})();
