(() => {
  'use strict';
  if (!window.api?.updateAssistant || !window.api.onAssistantCommand) return;
  const $ = id => document.getElementById(id);
  let timer;
  let nextLink = 0;
  const linkIds = new WeakMap(), links = new Map();
  let suggestionScope = '', suggestionSequence = 0;
  const suggestions = new Map();
  function publish() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tr = window.UiLocale?.get?.() === 'tr';
      const global = globalAssistantContext();
      const context = global ? (global.workspace === 'media-library' ? (global.heading || (tr ? 'Medya kütüphanesi' : 'Media library')) : (tr ? 'Altyazı stüdyosu' : 'Subtitle studio'))
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
        ...(selection?.workspace === 'media-selection' ? [] : [{ kind:'voice', label:tr?'Seslendirme hazırla':'Prepare voice' }]), { kind:'tasks', label:tr?'İşlem merkezi':'Activity' }];
      const specs = entries.map(row => {
        const id = `${suggestionSequence}:${row.kind}`;
        suggestions.set(id, { ...row, scope });
        return { id, label:row.label, review: `${tr?'Kaynak':'Source'}: ${context}\n${row.kind==='summary' ? `${tr?'Model':'Model'}: ${opts.translateModel || opts.llmModel || (tr?'Mevcut AI ayarı':'Current AI setting')}\n${tr?'Seçili bağlam mevcut sağlayıcıya gönderilir.':'Selected context will be sent to your current provider.'}` : row.kind==='voice' ? (tr?'Mevcut ses penceresi açılır. SRT, referans ses ve zaman aralığını incelemeden üretim başlamaz.':'Opens the existing voice window. Review SRT, reference and time range before starting production.') : (tr?'Çalışan işleri ve kontrollerini gösterir; iş başlatmaz.':'Shows existing jobs and controls; does not start a job.')}` };
      });
      window.api.updateAssistant({ locale: tr ? 'tr' : 'en', theme: document.documentElement.dataset.theme,
        suggestions: specs,
        scope: $('aiTranscriptScope')?.value,
        bottomInset: document.querySelector('.ms-dock:not(.hidden)')?.getBoundingClientRect().height || 0,
        // Pins are read-only notes; unlike live job scopes they survive source generations.
        conversation: global ? JSON.stringify(['global',global.workspace,global.page,global.id,global.chapter]) : JSON.stringify([player.workspaceMode,player.mediaKey]), context, busy: !!aiChatPreparing || !!(player.job?.kind === 'chat' && (player.job.running || player.job.awaitingExit)),
        retry: !!aiChatRetryPacket && aiChatRetryPacket.scope === aiSourceScope(),
        messages: [...document.querySelectorAll('#aiChatLog .ai-msg')].map(node => ({ role: node.classList.contains('ai-msg-user') ? 'user' : 'ai', text: node.textContent,
          links: [...node.querySelectorAll('.ai-time-link,.ai-source-link')].slice(0, 40).map(button => {
            if (!linkIds.has(button)) linkIds.set(button, String(++nextLink));
            const id = linkIds.get(button); links.set(id, button); return { id, label: button.textContent };
          }),
        })),
      });
    }, 50);
  }
  window.api.onAssistantCommand(packet => {
    if (!packet || typeof packet !== 'object') return;
    if (packet.action === 'copy') void window.api.copyText(String(packet.text || ''));
    else if (packet.action === 'export') void window.api.mediaTools({action:'assistant-export',text:packet.text}).then(r=>{if(!r?.ok)osd(r?.error||'Export failed.');else if(!r.canceled)osd(trMessage());function trMessage(){return window.UiLocale?.get?.()==='tr'?'Konuşma kaydedildi.':'Conversation saved.';}});
    else if (packet.action === 'send') void aiChatSend(String(packet.text || '').slice(0, 16000));
    else if (packet.action === 'cancel') $('aiChatCancel')?.click();
    else if (packet.action === 'retry') $('aiChatRetry')?.click();
    else if (packet.action === 'clear') $('aiChatClear')?.click();
    else if (packet.action === 'citation') links.get(packet.text)?.click();
    else if (packet.action === 'suggestion') {
      const row = suggestions.get(packet.text);
      if (row?.scope !== aiSourceScope()) { publish(); return; }
      if (row.kind === 'summary') void aiChatSend(row.prompt);
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
