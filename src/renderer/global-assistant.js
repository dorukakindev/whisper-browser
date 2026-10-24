(() => {
  'use strict';
  if (!window.api?.updateAssistant || !window.api.onAssistantCommand) return;
  const $ = id => document.getElementById(id);
  let timer,receipt=null;
  let nextLink = 0;
  const linkIds = new WeakMap(), links = new Map();
  let suggestionScope = '', suggestionSequence = 0;
  const suggestions = new Map();
  function publish() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tr = window.UiLocale?.get?.() === 'tr';
      const global = globalAssistantContext();
      const context = global ? (global.title || global.heading || (global.workspace === 'media-library' ? (tr?'Medya kütüphanesi':'Media library') : (tr?'Altyazı stüdyosu':'Subtitle studio')))
        : ($('playerTitle')?.textContent || (tr ? 'Açık video / sayfa' : 'Current video / page'));
      links.clear();
      const scope = aiSourceScope();
      if (scope !== suggestionScope) { suggestionScope = scope; ++suggestionSequence; }
      suggestions.clear();
      const opts = buildOptsFromUI();
      const selection = globalAssistantContext();
      const summary = selection?.workspace === 'media-selection'
        ? (tr ? 'Verilen yapım bilgilerini veya bölüm alıntısını özetle. Eserin tamamını okuduğunu ya da izlediğini iddia etme.' : 'Summarize only the provided metadata or chapter excerpt. Do not claim to have read or watched the full work.')
        : (tr ? 'Sağlanan altyazı veya sayfa bağlamını kısaca özetle; eksik kaynağı açıkça belirt.' : 'Briefly summarize the supplied subtitle or page context. State when source material is missing.');
      const entries = [{ kind:'summary', label:tr?'Kaynağı özetle':'Summarize source', prompt:summary },
        {kind:'explain',label:tr?'Daha anlaşılır açıkla':'Explain clearly',prompt:tr?'Yalnız sağlanan bağlamı sade ve anlaşılır Türkçeyle açıkla. Videoda altyazı varsa seçili kapsam içindeki konuşmayı esas al. Eksik kanıtı belirt; eser hakkında bilgi uydurma.':'Explain only the supplied context in clear language. For a captioned video use the selected transcript scope. State missing evidence; do not invent knowledge of the work.'},
        ...(!global?[{kind:'translation',label:tr?'Çeviriyi değerlendir':'Review translation',prompt:tr?'Yalnız sağlanan kaynak ve çeviri altyazılarını karşılaştır. Anlam kaybı, özel ad ve sayı sorunlarını örnekleriyle belirt. Yeterli eşleşen satır yoksa açıkça söyle. Dosyaları değiştirme; önerilerini açıkla.':'Compare only the supplied source and translated subtitles. Explain meaning loss, proper-name and numeric issues with examples. State when matching evidence is insufficient. Do not modify files; explain suggested improvements.'}]:[]),
        ...(selection?.workspace === 'media-selection' ? [] : [{ kind:'voice', label:tr?'Seslendirme hazırla':'Prepare voice' }]), { kind:'tasks', label:tr?'İşlem merkezi':'Activity' }];
      const specs = entries.map(row => {
        const id = `${suggestionSequence}:${row.kind}`;
        suggestions.set(id, { ...row, scope });
        return { id, label:row.label, review: `${tr?'Kaynak':'Source'}: ${context}\n${['summary','explain','translation'].includes(row.kind) ? `${tr?'Model':'Model'}: ${opts.translateModel || opts.llmModel || (tr?'Mevcut AI ayarı':'Current AI setting')}\n${tr?'Seçili bağlam mevcut sağlayıcıya gönderilir.':'Selected context will be sent to your current provider.'}` : row.kind==='voice' ? (tr?'Mevcut ses penceresi açılır. SRT, referans ses ve zaman aralığını incelemeden üretim başlamaz.':'Opens the existing voice window. Review SRT, reference and time range before starting production.') : (tr?'Çalışan işleri ve kontrollerini gösterir; iş başlatmaz.':'Shows existing jobs and controls; does not start a job.')}` };
      });
      window.api.updateAssistant({ locale: tr ? 'tr' : 'en', theme: document.documentElement.dataset.theme,
        suggestions: specs,receipt,sourceToken:scope,model:opts.translateModel||opts.llmModel||'',
        transcriptScope:!global,blocked:!!(state.running||state.queueRunning)&&!(player.job?.kind==='chat'),
        canCancel:!!(aiChatPreparing?.scope===scope || (player.job?.kind==='chat'&&player.job.sourceScope===scope&&(player.job.running||player.job.awaitingExit))),
        sourceDescription:global ? [({'book-chapter':tr?'Seçili kitap bölümü':'Selected book chapter','library-title':tr?'Seçili yapım bilgisi':'Selected title metadata','taste-profile':tr?'Zevk profili ve yorum örneği':'Taste profile and review sample','media-tool':tr?'Açık medya aracı':'Current media tool'})[global.type]||(global.workspace==='media-library'?(tr?'Medya kütüphanesi':'Media library'):(tr?'Altyazı stüdyosu':'Subtitle studio')),global.chapter||'',global.excerpt||global.synopsis||global.note||'',tr?'Yalnız sağlanan metin ve bilgiler kullanılır; eserin tamamı ekli değildir.':'Only supplied text and metadata are available; the full work is not attached.'].filter(Boolean).join('\n').slice(0,1400) : (tr?'Açık video veya sayfa. Altyazı kapsamını aşağıdan seçebilirsin. Sayfa metni soru gönderilirken alınır; bu panel görüntüden video analizi yapmaz.':'Current video or page. Choose the subtitle scope below. Page text is collected when sending a question; this panel does not analyze video pixels.'),
        scope: $('aiTranscriptScope')?.value,
        bottomInset: document.querySelector('.ms-dock:not(.hidden)')?.getBoundingClientRect().height || 0,
        // Pins are read-only notes; unlike live job scopes they survive source generations.
        conversation: global ? JSON.stringify(['global',global.workspace,global.page,global.id,global.chapter]) : JSON.stringify([player.workspaceMode,player.mediaKey]), context, busy: !!aiChatPreparing || !!(player.job?.kind === 'chat' && (player.job.running || player.job.awaitingExit)),
        retry: !!aiChatRetryPacket && aiChatRetryPacket.scope === aiSourceScope(),
        messages: [...document.querySelectorAll('#aiChatLog .ai-msg')].filter(node=>node._sourceScope===scope).map(node => ({ role: node.classList.contains('ai-msg-user') ? 'user' : 'ai', text: node.textContent,loading:node.classList.contains('is-loading'),error:node.classList.contains('ai-msg-err'),
          links: [...node.querySelectorAll('.ai-time-link,.ai-source-link')].slice(0, 40).map(button => {
            if (!linkIds.has(button)) linkIds.set(button, String(++nextLink));
            const id = linkIds.get(button); links.set(id, button); return { id, label: button.textContent };
          }),
        })),
      });
    }, 50);
  }
  async function sendQuestion(packet){
    const before=new Set(document.querySelectorAll('#aiChatLog .ai-msg'));
    try{await aiChatSend(String(packet.text||'').slice(0,16000));
      const added=[...document.querySelectorAll('#aiChatLog .ai-msg')].filter(node=>!before.has(node)&&node._sourceScope===packet.sourceToken);
      const accepted=added.some(node=>node.classList.contains('ai-msg-user')&&node.textContent===String(packet.text||'').trim());
      receipt={id:packet.requestId,accepted,message:accepted?'':(added.find(node=>node.classList.contains('ai-msg-err'))?.textContent || (window.UiLocale?.get?.()==='tr'?'Soru gönderilemedi. Metnin korundu; sağlayıcı ayarını veya çalışan işleri kontrol et.':'The question was not sent. Your draft is kept; check provider settings or running tasks.'))};
    }catch(error){receipt={id:packet.requestId,accepted:false,message:error.message};}
    publish();
  }
  window.api.onAssistantCommand(packet => {
    if (!packet || typeof packet !== 'object') return;
    const scoped=['send','cancel','retry','clear','citation','suggestion','scope'].includes(packet.action);
    if(scoped&&(!packet.sourceToken||packet.sourceToken!==aiSourceScope())){if(packet.action==='send')receipt={id:packet.requestId,accepted:false,message:window.UiLocale?.get?.()==='tr'?'Kaynak değişti. Sorun gönderilmedi; metnin taslakta korundu.':'The source changed. Your question was not sent; the draft was kept.'};publish();return;}
    if (packet.action === 'copy') void window.api.copyText(String(packet.text || ''));
    else if (packet.action === 'export') void window.api.mediaTools({action:'assistant-export',text:packet.text}).then(r=>{if(!r?.ok)osd(r?.error||'Export failed.');else if(!r.canceled)osd(trMessage());function trMessage(){return window.UiLocale?.get?.()==='tr'?'Konuşma kaydedildi.':'Conversation saved.';}});
    else if (packet.action === 'send') void sendQuestion(packet);
    else if (packet.action === 'cancel') {if(aiChatPreparing?.scope===packet.sourceToken||player.job?.sourceScope===packet.sourceToken)$('aiChatCancel')?.click();}
    else if (packet.action === 'retry') $('aiChatRetry')?.click();
    else if (packet.action === 'clear') {
      if(aiChatPreparing||(player.job?.kind==='chat'&&(player.job.running||player.job.awaitingExit)))return;
      for(const node of document.querySelectorAll('#aiChatLog .ai-msg'))if(node._sourceScope===packet.sourceToken)node.remove();
      if(player.chatHistoryScope===packet.sourceToken){player.chatHistory=[];player.chatHistoryScope=null;}
      if(aiChatRetryPacket?.scope===packet.sourceToken)aiChatRetryPacket=null;
      if(typeof updateAiChatActions==='function')updateAiChatActions();
      if(!document.querySelector('#aiChatLog .ai-msg'))$('aiChatEmpty')?.classList.remove('hidden');
    }
    else if (packet.action === 'citation') links.get(packet.text)?.click();
    else if (packet.action === 'suggestion') {
      const row = suggestions.get(packet.text);
      if (row?.scope !== aiSourceScope()) { publish(); return; }
      if (['summary','explain','translation'].includes(row.kind)) void aiChatSend(row.prompt);
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
  publish();
})();
