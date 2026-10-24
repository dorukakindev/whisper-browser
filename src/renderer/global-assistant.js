(() => {
  'use strict';
  if (!window.api?.updateAssistant || !window.api.onAssistantCommand) return;
  const $ = id => document.getElementById(id);
  let timer;
  let nextLink = 0;
  const linkIds = new WeakMap(), links = new Map();
  function publish() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tr = window.UiLocale?.get?.() === 'tr';
      const global = globalAssistantContext();
      const context = global ? (global.workspace === 'media-library' ? (global.heading || (tr ? 'Medya kütüphanesi' : 'Media library')) : (tr ? 'Altyazı stüdyosu' : 'Subtitle studio'))
        : ($('playerTitle')?.textContent || (tr ? 'Açık video / sayfa' : 'Current video / page'));
      links.clear();
      window.api.updateAssistant({ locale: tr ? 'tr' : 'en', theme: document.documentElement.dataset.theme,
        scope: $('aiTranscriptScope')?.value,
        bottomInset: document.querySelector('.ms-dock:not(.hidden)')?.getBoundingClientRect().height || 0,
        context, busy: !!aiChatPreparing || !!(player.job?.kind === 'chat' && (player.job.running || player.job.awaitingExit)),
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
    if (packet.action === 'send') void aiChatSend(String(packet.text || '').slice(0, 16000));
    else if (packet.action === 'cancel') $('aiChatCancel')?.click();
    else if (packet.action === 'retry') $('aiChatRetry')?.click();
    else if (packet.action === 'clear') $('aiChatClear')?.click();
    else if (packet.action === 'citation') links.get(packet.text)?.click();
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
  publish();
})();
