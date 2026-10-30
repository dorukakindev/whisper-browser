(() => {
  'use strict';
  if (!window.api?.updateAssistant || !window.api.onAssistantCommand) return;
  const $ = id => document.getElementById(id);
  let timer,receipt=null,toolNotice='';const proposedActions=new Map();
  const commandToken=()=>{const thread=window.AssistantWorkspace?.activeId();return aiSourceScope()+(thread?'|thread:'+thread:'');};
  let nextLink = 0;
  const linkIds = new WeakMap(), links = new Map();
  let suggestionScope = '', suggestionSequence = 0;
  const suggestions = new Map();
  function publish() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tr = window.UiLocale?.get?.() === 'tr';
      const selectionContext = globalAssistantContext();
      const suppliedBook=selectionContext?.chapterTextComplete?window.AssistantContextManifest.sourceText(selectionContext):null;
      const bookDescription=suppliedBook?[suppliedBook.sourceTruncated?(tr?'Kısaltılmış bölüm/sayfa metni':'Partial chapter/page text'):(tr?'Tam bölüm/sayfa metni':'Complete chapter/page text'),selectionContext.title,selectionContext.chapter,(tr?'Sağlanan karakter: ':'Characters supplied: ')+(suppliedBook.chapterText?.length||0),suppliedBook.chapterText?.slice(0,900),tr?'Kitabın diğer bölümleri ekli değil.':'Other chapters of the book are not attached.'].filter(Boolean).join('\n'):'';
      const pageContext=!selectionContext&&player.workspaceMode==='browser'&&/^https?:/i.test(player.browserPageUrl||'');
      const videoContext=pageContext&&!!currentBrowserYoutubeUrl();
      const transcriptScope=!selectionContext&&(player.workspaceMode==='browser'?(typeof aiVideoRows==='function'&&aiVideoRows().length>0):(player.cues?.length>0));
      const pageTask=window.AssistantAgentUI?.status()||window.AssistantVideoCommands?.status()||window.AssistantPageCommands?.status()||window.AssistantMediaCommands?.status();
      const context = selectionContext ? (selectionContext.title || selectionContext.heading || (selectionContext.workspace === 'media-library' ? (tr?'Medya kütüphanesi':'Media library') : (tr?'Altyazı stüdyosu':'Subtitle studio')))
        : (pageContext?(player.browserPageTitle||$('playerTitle')?.textContent):$('playerTitle')?.textContent) || (tr ? 'Açık video / sayfa' : 'Current video / page');
      links.clear();
      const scope = aiSourceScope(),workspace=window.AssistantWorkspace?.snapshot(),threadId=workspace?.current?.id||'';
      const pinScope=selectionContext?JSON.stringify(['selectionContext',selectionContext.workspace,selectionContext.page,selectionContext.id,selectionContext.chapter]):JSON.stringify([player.workspaceMode,player.mediaKey]);
      if (scope !== suggestionScope) { suggestionScope = scope; ++suggestionSequence; }
      suggestions.clear();
      const opts = buildOptsFromUI();
      const selection = globalAssistantContext();
      const summary = selection?.workspace === 'media-selection'
        ? (tr ? 'Verilen yapım bilgilerini veya bölüm alıntısını özetle. Eserin tamamını okuduğunu ya da izlediğini iddia etme.' : 'Summarize only the provided metadata or chapter excerpt. Do not claim to have read or watched the full work.')
        : (tr ? 'Sağlanan altyazı veya sayfa bağlamını kısaca özetle; eksik kaynağı açıkça belirt.' : 'Briefly summarize the supplied subtitle or page context. State when source material is missing.');
      const entries = [{ kind:'summary', label:videoContext?(tr?'Altyazıyı özetle':'Summarize captions'):pageContext?(tr?'Sayfayı özetle':'Summarize page'):(tr?'Kaynağı özetle':'Summarize source'), prompt:summary },
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
      const specs = entries.map(row => {
        const id = `${suggestionSequence}:${row.kind}`;
        suggestions.set(id, { ...row, scope });
        return { id, label:row.label, direct:['summary','explain','page-translate'].includes(row.kind), review: `${tr?'Kaynak':'Source'}: ${context}\n${['summary','explain','translation'].includes(row.kind) ? `${tr?'Model':'Model'}: ${assistantProviderSelection().model || (tr?'Mevcut AI ayarı':'Current AI setting')}\n${tr?'Seçili bağlam mevcut sağlayıcıya gönderilir.':'Selected context will be sent to your current provider.'}` : row.kind.startsWith('video-') ? (tr?'Seçili YouTube videosunda mevcut altyazı/Whisper akışı başlatılır; ilerleme burada gösterilir.':'Runs the selected YouTube caption/Whisper workflow; progress appears here.') : row.kind==='voice' ? (tr?'Mevcut ses penceresi açılır. SRT, referans ses ve zaman aralığını incelemeden üretim başlamaz.':'Opens the existing voice window. Review SRT, reference and time range before starting production.') : (tr?'Çalışan işleri ve kontrollerini gösterir; iş başlatmaz.':'Shows existing jobs and controls; does not start a job.')}` };
      });
      proposedActions.clear();
      function decorate(row){
        const result={...row,role:row.role==='assistant'?'ai':row.role,loading:row.status==='streaming'||!!row.loading,error:['failed','stopped'].includes(row.status)||!!row.error};
        result.links=(row.evidence||[]).slice(0,40).map((e,index)=>{const id='e:'+threadId+':'+row.id+':'+index;links.set(id,{evidence:e});return {id,label:Math.floor(e.start/60)+':'+String(Math.floor(e.start%60)).padStart(2,'0'),excerpt:e.text,translation:e.translation||''};});
        for(const [index,c]of(row.citations||[]).entries()){const id='b:'+threadId+':'+row.id+':'+index;links.set(id,{bookCitation:c});result.links.push({id,label:'['+c.id+'] '+(tr?'Sayfa ':'Page ')+c.page,excerpt:c.text});}
        if(/Web sources:|Web kaynakları:/.test(row.text||''))for(const [index,match] of [...String(row.text).split(/Web sources:|Web kaynakları:/).at(-1).matchAll(/https?:\/\/[^\s<>]+/g)].slice(0,10).entries()){const id='w:'+threadId+':'+row.id+':'+index;links.set(id,{external:match[0]});result.links.push({id,label:match[0]});}
        result.actions=(row.actions||[]).map((action,index)=>{const id='p:'+threadId+':'+row.id+':'+index;proposedActions.set(id,action);return {id,kind:action.kind,label:action.label||'',excerpt:action.kind==='app_action'?action.summary||'':action.source?.text||'',translation:action.translation||'',...window.AssistantAgentUI?.flowInfo(action),resultStatus:action.resultStatus||'',resultText:action.resultText||'',time:action.source?.start};});return result;
      }
      const messages=(workspace?.current?.messages||[]).map(decorate);
      for(const node of document.querySelectorAll('#aiChatLog .ai-msg')){
        if(node._sourceScope!==scope||node._assistantMessageId||threadId&&node._assistantThreadId!==threadId)continue;
        messages.push({role:node.classList.contains('ai-msg-user')?'user':'ai',text:node.textContent,loading:node.classList.contains('is-loading'),error:node.classList.contains('ai-msg-err'),links:[...node.querySelectorAll('.ai-time-link,.ai-source-link')].slice(0,40).map(button=>{if(!linkIds.has(button))linkIds.set(button,String(++nextLink));const id=linkIds.get(button);links.set(id,button);return {id,label:button.textContent};})});
      }
      window.api.updateAssistant({ locale: tr ? 'tr' : 'en', theme: document.documentElement.dataset.theme,
        palette:Object.fromEntries(Object.entries({surface:'--bg-1',raised:'--bg-2',hover:'--bg-3',line:'--border',strong:'--border-strong',text:'--text',muted:'--text-muted',accent:'--accent'}).map(([key,token])=>[key,getComputedStyle(document.body).getPropertyValue(token).trim()])),
        suggestions: specs,receipt,sourceToken:commandToken(),pinScope,threads:workspace?.threads||[],activeThread:threadId,
        jobs:window.AssistantJobsUI?.snapshot()?.jobs||[],workspaceError:workspace?.error||toolNotice,draft:workspace?.current?.draft||'',model:assistantProviderSelection().model||'',
        pageContext,videoContext,transcriptScope,blocked:!!((window.AssistantAgentUI?.busy()||window.AssistantVideoCommands?.busy()||window.AssistantPageCommands?.busy()||window.AssistantMediaCommands?.busy())&&!pageTask)||!!(player.job?.kind==='chat'&&(player.job.running||player.job.awaitingExit)),
        canCancel:!!(pageTask || aiChatPreparing?.scope===scope || (player.job?.kind==='chat'&&player.job.sourceScope===scope&&(player.job.running||player.job.awaitingExit))),
        sourceDescription:selectionContext ? [({'book-page':tr?'Açık PDF sayfası':'Current PDF page','book-chapter':tr?'Seçili kitap bölümü':'Selected book chapter','library-title':tr?'Seçili yapım bilgisi':'Selected title metadata','taste-profile':tr?'Zevk profili ve yorum örneği':'Taste profile and review sample','media-tool':tr?'Açık medya aracı':'Current media tool'})[selectionContext.type]||(selectionContext.workspace==='media-library'?(tr?'Medya kütüphanesi':'Media library'):(tr?'Altyazı stüdyosu':'Subtitle studio')),selectionContext.chapter||'',(selectionContext.selectedText?((tr?'Seçili pasaj: ':'Selected passage: ')+selectionContext.selectedText):selectionContext.excerpt||selectionContext.synopsis||selectionContext.note||''),tr?'Yalnız sağlanan metin ve bilgiler kullanılır; eserin tamamı ekli değildir.':'Only supplied text and metadata are available; the full work is not attached.'].filter(Boolean).join('\n').slice(0,1400) : (pageContext&&!transcriptScope?(tr?'Açık web sayfasının okunabilen metni kullanılır. Sayfa çevirisi mevcut sayfa aracını çalıştırır. Giriş veya koruma ekranı makale içeriği sayılmaz.':'Uses readable text from the open web page. Page translation runs the existing page tool. Login or challenge screens are not article content.'):(tr?'Altyazı bağlamı kullanılır. Bu panel görüntüden video analizi yapmaz.':'Uses subtitle context. This panel does not analyze video pixels.')),
        scope: $('aiTranscriptScope')?.value,
        bottomInset: document.querySelector('.ms-dock:not(.hidden)')?.getBoundingClientRect().height || 0,
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
    const scoped=['send','web-search','cancel','retry','clear','citation','suggestion','scope','new-thread','select-thread','rename-thread','delete-thread','branch','apply-tool','continue-tool'].includes(packet.action);
    if(scoped&&(!packet.sourceToken||packet.sourceToken!==commandToken())){if(packet.action==='send'||packet.action==='web-search')receipt={id:packet.requestId,accepted:false,message:window.UiLocale?.get?.()==='tr'?'Kaynak değişti. Sorun gönderilmedi; metnin taslakta korundu.':'The source changed. Your question was not sent; the draft was kept.'};publish();return;}
    if (packet.action === 'copy') void window.api.copyText(String(packet.text || ''));
    else if (packet.action === 'export') void window.api.mediaTools({action:'assistant-export',text:packet.text}).then(r=>{if(!r?.ok)osd(r?.error||'Export failed.');else if(!r.canceled)osd(trMessage());function trMessage(){return window.UiLocale?.get?.()==='tr'?'Konuşma kaydedildi.':'Conversation saved.';}});
    else if(['new-thread','select-thread','rename-thread','delete-thread','branch'].includes(packet.action)){void window.AssistantWorkspace?.command(packet.action,packet.text).then(()=>{toolNotice='';publish();}).catch(error=>{toolNotice=error.message;publish();});}
    else if(packet.action==='continue-tool'){const proposal=proposedActions.get(packet.text);if(proposal)void window.AssistantAgentUI.continueAction(proposal).catch(error=>{toolNotice=error.message;publish();});}
    else if(packet.action==='apply-tool'){const proposal=proposedActions.get(packet.text);if(proposal)void applyProposal(proposal).catch(error=>{toolNotice=error.message;publish();});}
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
    else if (packet.action === 'citation') {const target=links.get(packet.text);if(target?.bookCitation)void window.BookAssistantUI.assistant.navigate(target.bookCitation).catch(error=>{toolNotice=error.message;publish();});else if(target?.external)void window.api.openExternal(target.external);else if(target?.evidence)void applyProposal({kind:'seek_to_time',source:target.evidence}).catch(error=>{toolNotice=error.message;publish();});else target?.click();}
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
