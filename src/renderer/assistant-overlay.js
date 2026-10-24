(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let opened = false, lastMessages = '', busy = false, pending = null;
  let suggestionKey = '', reviewing = null, snapshot={},onlyPinned=false,pins=[];
  const drafts=new Map();let conversation=null,requestSequence=0;
  const action=(name,text,meta={})=>window.assistant.action(name,text,{sourceToken:snapshot.sourceToken||'',...meta});
  const rememberDraft=()=>{if(conversation===null)return;drafts.delete(conversation);drafts.set(conversation,$('text').value);while(drafts.size>20)drafts.delete(drafts.keys().next().value);};
  $('text').addEventListener('input',rememberDraft);
  const showStatus=(message,error=false)=>{$('delivery').textContent=message;$('delivery').classList.toggle('error',error);};
  $('latest').onclick=()=>{$('log').scrollTop=$('log').scrollHeight;$('latest').hidden=true;};
  $('log').onscroll=()=>{$('latest').hidden=$('log').scrollHeight-$('log').scrollTop-$('log').clientHeight<80;};
  function renderText(node,text){
    const blocks=String(text||'').split(/(```[\s\S]*?(?:```|$))/g);
    for(const block of blocks){if(!block)continue;if(block.startsWith('```')){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=block.replace(/^```[^\n]*\n?/,'').replace(/```$/,'');pre.append(code);node.append(pre);}else{for(const line of block.split('\n')){if(!line){node.append(document.createElement('br'));continue;}const heading=/^#{1,3}\s+/.test(line),list=/^\s*[-*]\s+/.test(line);const p=document.createElement(heading?'h3':'p');if(list)p.className='answer-list';p.textContent=line.replace(/^#{1,3}\s+/,'').replace(/^\s*[-*]\s+/,'• ');node.append(p);}}}
  }
  try{const saved=JSON.parse(localStorage.getItem('assistant-pins-v1')||'[]');if(Array.isArray(saved))pins=saved.filter(x=>x&&typeof x.scope==='string'&&typeof x.text==='string').slice(-100);}catch{}
  const isPinned=row=>pins.some(p=>p.scope===snapshot.conversation&&p.text===row.text);
  const filter=()=>{
    for(const n of $('log').querySelectorAll('[data-archived]'))n.remove();
    if(onlyPinned)for(const saved of pins.filter(p=>p.scope===snapshot.conversation&&!snapshot.messages?.some(r=>r.text===p.text))){const n=document.createElement('div');n.className='message ai';n.dataset.pinned='true';n.dataset.archived='true';n.textContent=saved.text;n._searchText=saved.text;const actions=document.createElement('div');actions.className='message-actions';const copy=document.createElement('button');copy.textContent=snapshot.locale==='tr'?'Kopyala':'Copy';copy.onclick=()=>action('copy',saved.text);const remove=document.createElement('button');remove.textContent=snapshot.locale==='tr'?'Sabitlemeyi kaldır':'Unpin';remove.onclick=()=>{pins=pins.filter(p=>p!==saved);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}filter();};actions.append(copy,remove);n.append(actions);$('log').append(n);}
    let count=0;for(const n of $('log').querySelectorAll('.message')){n.hidden=!!($('find').value&&!(n._searchText||n.textContent).toLocaleLowerCase().includes($('find').value.toLocaleLowerCase()))||(onlyPinned&&n.dataset.pinned!=='true');if(!n.hidden)count++;}$('findCount').textContent=$('find').value||onlyPinned?String(count):'';};
  $('find').oninput=filter;
  $('pinned').onclick=()=>{onlyPinned=!onlyPinned;$('pinned').setAttribute('aria-pressed',String(onlyPinned));filter();};
  $('export').onclick=()=>{const content=(snapshot.messages||[]).map(r=>'## '+(r.role==='user'?'You':'Assistant')+'\n\n'+r.text).join('\n\n');if(content)action('export',content);};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&opened){event.preventDefault();$('find').focus();}});
  $('reviewCancel').onclick = () => { reviewing = null; $('review').hidden = true; };
  $('reviewConfirm').onclick = () => { if (reviewing && !busy) action(reviewing.action,reviewing.id); reviewing = null; $('review').hidden = true; };
  function toggle() { opened = !opened; $('panel').hidden = !opened; $('bubble').hidden = opened; action('toggle'); if (opened) $('text').focus(); }
  $('bubble').onclick = toggle; $('close').onclick = toggle;
  $('expand').onclick = () => action('expand');
  for (const name of ['cancel','retry']) $(name).onclick=()=>action(name);
  $('clear').onclick=()=>{reviewing={action:'clear'};$('reviewText').textContent=snapshot.locale==='tr'?'Mevcut sohbet geçmişi temizlenecek. Sabitlenen notların korunur.':'This clears the current chat history. Pinned notes are kept.';$('review').hidden=false;$('reviewConfirm').focus();};
  $('scope').onchange = () => action('scope', $('scope').value);
  function send() { const text = $('text').value.trim(); if (!text || busy || pending || snapshot.blocked) return; pending={text,id:'q-'+Date.now()+'-'+(++requestSequence),sourceToken:snapshot.sourceToken};action('send',text,{requestId:pending.id});$('send').disabled=true;showStatus(snapshot.locale==='tr'?'Soru gönderiliyor…':'Sending question…'); }
  $('form').onsubmit = event => { event.preventDefault(); send(); };
  $('text').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && opened) { event.preventDefault(); toggle(); } });
  window.assistant.subscribe(value => {
    const nextConversation=value.conversation||value.sourceToken||'';
    if(conversation!==nextConversation){rememberDraft();conversation=nextConversation;$('text').value=drafts.get(conversation)||'';pending=null;onlyPinned=false;$('pinned').setAttribute('aria-pressed','false');$('find').value='';showStatus('');}
    else if(snapshot.sourceToken&&snapshot.sourceToken!==value.sourceToken){rememberDraft();pending=null;showStatus(value.locale==='tr'?'Kaynak güncellendi; taslağın korundu.':'Source updated; your draft was kept.');}
    snapshot=value;
    const tr = value.locale === 'tr'; const t = (en, turkish) => tr ? turkish : en;
    document.documentElement.lang = tr ? 'tr' : 'en'; document.documentElement.dataset.theme = value.theme;
    $('find').placeholder=t('Search conversation','Konuşmada ara');$('find').setAttribute('aria-label',$('find').placeholder);$('pinned').textContent=t('Pinned','Sabitlenen');$('export').textContent=t('Export','Dışa aktar');
    $('sourceLabel').textContent=t('Source & model','Kaynak ve model');$('modelName').textContent=value.model||t('Your configured AI model','Ayarlı AI modelin');$('sourceDescription').textContent=value.sourceDescription||t('Only provided context is used.','Yalnız sağlanan bağlam kullanılır.');$('scope').hidden=value.transcriptScope===false;$('latest').textContent=t('Latest reply ↓','Son yanıta git ↓');
    $('title').textContent = t('Assistant', 'Asistan'); $('context').textContent = value.context || '';
    $('bubble').setAttribute('aria-label', t('Open assistant', 'Asistanı aç')); $('bubble').title = $('title').textContent;
    $('expand').title = t('Expand / restore', 'Genişlet / geri al'); $('expand').setAttribute('aria-label', $('expand').title);
    $('close').title = t('Minimize', 'Küçült'); $('close').setAttribute('aria-label', $('close').title);
    for (const [id, en, turkish] of [['send','Send','Gönder'],['cancel','Cancel','İptal'],['retry','Retry','Yeniden dene'],['clear','Clear','Temizle']]) $(id).textContent = t(en, turkish);
    $('text').placeholder = t('Ask a question…', 'Sorunu yaz…'); $('text').setAttribute('aria-label', t('Question', 'Soru'));
    [...$('scope').options].forEach((option, i) => { option.textContent = t(['Nearby','Watched','Full transcript'][i], ['Yakın satırlar','İzlenen bölüm','Tüm altyazı'][i]); });
    $('hint').textContent = value.transcriptScope===false?t('Uses your existing provider and only the selected context.','Mevcut sağlayıcını ve yalnız seçili bağlamı kullanır.'):t('Uses your existing provider and selected subtitle scope.','Mevcut sağlayıcını ve seçili altyazı kapsamını kullanır.');
    $('reviewConfirm').textContent = t('Continue', 'Devam et'); $('reviewCancel').textContent = t('Cancel','Vazgeç');
    const nextSuggestions = JSON.stringify(value.suggestions || []);
    if (nextSuggestions !== suggestionKey) {
      suggestionKey = nextSuggestions; $('suggestions').replaceChildren(); reviewing = null; $('review').hidden = true;
      for (const row of value.suggestions || []) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = row.label;
        button.onclick = () => { reviewing = {action:'suggestion',id:row.id}; $('reviewText').textContent = row.review; $('review').hidden = false; $('reviewConfirm').focus(); };
        $('suggestions').append(button);
      }
    }
    $('reviewConfirm').disabled = !!value.busy;
    busy = !!value.busy; $('send').disabled = busy || !!value.blocked || !!pending; $('clear').disabled = busy; $('cancel').hidden = !busy || value.canCancel===false; $('retry').hidden = !value.retry || busy;
    $('scope').value = value.scope || 'watched';
    if(pending && value.receipt?.id===pending.id){
      if(value.receipt.accepted && pending.sourceToken===value.sourceToken && $('text').value.trim()===pending.text){$('text').value='';rememberDraft();}
      showStatus(value.receipt.message||'',!value.receipt.accepted);pending=null;$('send').disabled=busy||!!value.blocked;
    }
    if(value.blocked&&!pending){$('delivery').dataset.blocked='true';showStatus(t('Another task is running. Your question stays in the draft.','Başka bir iş çalışıyor. Sorun taslakta kalır.'));}else if(!value.blocked&&$('delivery').dataset.blocked==='true'){$('delivery').dataset.blocked='false';if(!value.receipt?.message)showStatus('');}
    const key = JSON.stringify([value.locale, value.conversation, value.messages]);
    if (key === lastMessages) return; lastMessages = key;
    const log = $('log'), previousScroll=log.scrollTop,bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    if (!value.messages?.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('Ask about your video, subtitles, translation or the current page.', 'Video, altyazı, çeviri veya bulunduğun sayfa hakkında sor.'); log.append(empty); }
    for (const row of value.messages || []) {
      const node = document.createElement('div'); node.className = 'message ' + row.role; node._searchText=row.text;renderText(node,row.text);if(row.loading)node.classList.add('loading');if(row.error)node.classList.add('failed');node.dataset.pinned=String(isPinned(row));
      const actions=document.createElement('div');actions.className='message-actions';
      const addAction=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;actions.append(b);return b;};
      addAction(t('Copy','Kopyala'),()=>action('copy',row.text));
      const pin=addAction(isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle'),()=>{if(isPinned(row))pins=pins.filter(p=>p.scope!==value.conversation||p.text!==row.text);else pins=[...pins,{scope:value.conversation,text:row.text}].slice(-100);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}node.dataset.pinned=String(isPinned(row));pin.textContent=isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle');filter();});
      if(row.role==='user')addAction(t('Edit as new question','Yeni soru olarak düzenle'),()=>{$('text').value=row.text;rememberDraft();$('text').focus();});
      const code=[...row.text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n\n');if(code)addAction(t('Copy code','Kodu kopyala'),()=>action('copy',code));
      if(!row.loading)node.append(actions);
      if (row.links?.length) {
        const sources = document.createElement('div'); sources.className = 'sources';
        for (const link of row.links) { const button = document.createElement('button'); button.textContent = link.label; button.onclick = () => action('citation', link.id); sources.append(button); }
        node.append(sources);
      }
      log.append(node);
    }
    filter();
    if (bottom) log.scrollTop = log.scrollHeight;else log.scrollTop=previousScroll;
    $('latest').hidden=bottom;
  });
  action('ready');
})();
