(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let opened = false, lastMessages = '', busy = false, pending = '';
  let suggestionKey = '', reviewing = '', snapshot={},onlyPinned=false,pins=[];
  try{const saved=JSON.parse(localStorage.getItem('assistant-pins-v1')||'[]');if(Array.isArray(saved))pins=saved.filter(x=>x&&typeof x.scope==='string'&&typeof x.text==='string').slice(-100);}catch{}
  const isPinned=row=>pins.some(p=>p.scope===snapshot.conversation&&p.text===row.text);
  const filter=()=>{
    for(const n of $('log').querySelectorAll('[data-archived]'))n.remove();
    if(onlyPinned)for(const saved of pins.filter(p=>p.scope===snapshot.conversation&&!snapshot.messages?.some(r=>r.text===p.text))){const n=document.createElement('div');n.className='message ai';n.dataset.pinned='true';n.dataset.archived='true';n.textContent=saved.text;const actions=document.createElement('div');actions.className='message-actions';const copy=document.createElement('button');copy.textContent=snapshot.locale==='tr'?'Kopyala':'Copy';copy.onclick=()=>window.assistant.action('copy',saved.text);const remove=document.createElement('button');remove.textContent=snapshot.locale==='tr'?'Sabitlemeyi kaldır':'Unpin';remove.onclick=()=>{pins=pins.filter(p=>p!==saved);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}filter();};actions.append(copy,remove);n.append(actions);$('log').append(n);}
    let count=0;for(const n of $('log').querySelectorAll('.message')){n.hidden=!!($('find').value&&!n.textContent.toLocaleLowerCase().includes($('find').value.toLocaleLowerCase()))||(onlyPinned&&n.dataset.pinned!=='true');if(!n.hidden)count++;}$('findCount').textContent=$('find').value||onlyPinned?String(count):'';};
  $('find').oninput=filter;
  $('pinned').onclick=()=>{onlyPinned=!onlyPinned;$('pinned').setAttribute('aria-pressed',String(onlyPinned));filter();};
  $('export').onclick=()=>{const content=(snapshot.messages||[]).map(r=>'## '+(r.role==='user'?'You':'Assistant')+'\n\n'+r.text).join('\n\n');if(content)window.assistant.action('export',content);};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&opened){event.preventDefault();$('find').focus();}});
  $('reviewCancel').onclick = () => { reviewing = ''; $('review').hidden = true; };
  $('reviewConfirm').onclick = () => { if (reviewing && !busy) window.assistant.action('suggestion', reviewing); reviewing = ''; $('review').hidden = true; };
  function toggle() { opened = !opened; $('panel').hidden = !opened; $('bubble').hidden = opened; window.assistant.action('toggle'); if (opened) $('text').focus(); }
  $('bubble').onclick = toggle; $('close').onclick = toggle;
  $('expand').onclick = () => window.assistant.action('expand');
  for (const action of ['clear', 'cancel', 'retry']) $(action).onclick = () => window.assistant.action(action);
  $('scope').onchange = () => window.assistant.action('scope', $('scope').value);
  function send() { const text = $('text').value.trim(); if (!text || busy || pending) return; pending = text; window.assistant.action('send', text); }
  $('form').onsubmit = event => { event.preventDefault(); send(); };
  $('text').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && opened) { event.preventDefault(); toggle(); } });
  window.assistant.subscribe(value => {
    snapshot=value;
    const tr = value.locale === 'tr'; const t = (en, turkish) => tr ? turkish : en;
    document.documentElement.lang = tr ? 'tr' : 'en'; document.documentElement.dataset.theme = value.theme;
    $('find').placeholder=t('Search conversation','Konuşmada ara');$('find').setAttribute('aria-label',$('find').placeholder);$('pinned').textContent=t('Pinned','Sabitlenen');$('export').textContent=t('Export','Dışa aktar');
    $('title').textContent = t('Assistant', 'Asistan'); $('context').textContent = value.context || '';
    $('bubble').setAttribute('aria-label', t('Open assistant', 'Asistanı aç')); $('bubble').title = $('title').textContent;
    $('expand').title = t('Expand / restore', 'Genişlet / geri al'); $('expand').setAttribute('aria-label', $('expand').title);
    $('close').title = t('Minimize', 'Küçült'); $('close').setAttribute('aria-label', $('close').title);
    for (const [id, en, turkish] of [['send','Send','Gönder'],['cancel','Cancel','İptal'],['retry','Retry','Yeniden dene'],['clear','Clear','Temizle']]) $(id).textContent = t(en, turkish);
    $('text').placeholder = t('Ask a question…', 'Sorunu yaz…'); $('text').setAttribute('aria-label', t('Question', 'Soru'));
    [...$('scope').options].forEach((option, i) => { option.textContent = t(['Nearby','Watched','Full transcript'][i], ['Yakın satırlar','İzlenen bölüm','Tüm altyazı'][i]); });
    $('hint').textContent = t('Uses your existing AI provider and subtitle context.', 'Mevcut AI sağlayıcını ve altyazı bağlamını kullanır.');
    $('reviewConfirm').textContent = t('Continue', 'Devam et'); $('reviewCancel').textContent = t('Cancel','Vazgeç');
    const nextSuggestions = JSON.stringify(value.suggestions || []);
    if (nextSuggestions !== suggestionKey) {
      suggestionKey = nextSuggestions; $('suggestions').replaceChildren(); reviewing = ''; $('review').hidden = true;
      for (const row of value.suggestions || []) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = row.label;
        button.onclick = () => { reviewing = row.id; $('reviewText').textContent = row.review; $('review').hidden = false; $('reviewConfirm').focus(); };
        $('suggestions').append(button);
      }
    }
    $('reviewConfirm').disabled = !!value.busy;
    busy = !!value.busy; $('send').disabled = busy; $('clear').disabled = busy; $('cancel').hidden = !busy; $('retry').hidden = !value.retry || busy;
    $('scope').value = value.scope || 'watched';
    if (pending) {
      if (value.messages?.some(row => row.role === 'user' && row.text === pending) && $('text').value.trim() === pending) $('text').value = '';
      pending = '';
    }
    const key = JSON.stringify([value.locale, value.conversation, value.messages]);
    if (key === lastMessages) return; lastMessages = key;
    const log = $('log'), bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    if (!value.messages?.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('Ask about your video, subtitles, translation or the current page.', 'Video, altyazı, çeviri veya bulunduğun sayfa hakkında sor.'); log.append(empty); }
    for (const row of value.messages || []) {
      const node = document.createElement('div'); node.className = 'message ' + row.role; node.textContent = row.text;node.dataset.pinned=String(isPinned(row));
      const actions=document.createElement('div');actions.className='message-actions';
      const action=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;actions.append(b);return b;};
      action(t('Copy','Kopyala'),()=>window.assistant.action('copy',row.text));
      const pin=action(isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle'),()=>{if(isPinned(row))pins=pins.filter(p=>p.scope!==value.conversation||p.text!==row.text);else pins=[...pins,{scope:value.conversation,text:row.text}].slice(-100);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}node.dataset.pinned=String(isPinned(row));pin.textContent=isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle');filter();});
      if(row.role==='user')action(t('Edit as new question','Yeni soru olarak düzenle'),()=>{$('text').value=row.text;$('text').focus();});
      const code=[...row.text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n\n');if(code)action(t('Copy code','Kodu kopyala'),()=>window.assistant.action('copy',code));
      node.append(actions);
      if (row.links?.length) {
        const sources = document.createElement('div'); sources.className = 'sources';
        for (const link of row.links) { const button = document.createElement('button'); button.textContent = link.label; button.onclick = () => window.assistant.action('citation', link.id); sources.append(button); }
        node.append(sources);
      }
      log.append(node);
    }
    filter();
    if (bottom) log.scrollTop = log.scrollHeight;
  });
  window.assistant.action('ready');
})();
