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
  function renderText(node,text,streaming=false){
    if(streaming&&window.AssistantRemend?.default)text=window.AssistantRemend.default(String(text||''));
    const inline=(node,value)=>{for(const part of value.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)){if(!part)continue;let tag=part.startsWith('**')&&part.endsWith('**')?'strong':part.startsWith('`')&&part.endsWith('`')?'code':part.startsWith('*')&&part.endsWith('*')?'em':null;if(tag){const child=document.createElement(tag);child.textContent=part.slice(tag==='strong'?2:1,tag==='strong'?-2:-1);node.append(child);}else node.append(document.createTextNode(part));}};
    const blocks=String(text||'').split(/(```[\s\S]*?(?:```|$))/g);
    for(const block of blocks){if(!block)continue;if(block.startsWith('```')){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=block.replace(/^```[^\n]*\n?/,'').replace(/```$/,'');pre.append(code);node.append(pre);}else{for(const line of block.split('\n')){if(!line){node.append(document.createElement('br'));continue;}const heading=/^#{1,3}\s+/.test(line),list=/^\s*[-*]\s+/.test(line);const p=document.createElement(heading?'h3':'p');if(list)p.className='answer-list';inline(p,line.replace(/^#{1,3}\s+/,'').replace(/^\s*[-*]\s+/,'• '));node.append(p);}}}
  }
  try{const saved=JSON.parse(localStorage.getItem('assistant-pins-v1')||'[]');if(Array.isArray(saved))pins=saved.filter(x=>x&&typeof x.scope==='string'&&typeof x.text==='string').slice(-100);}catch{}
  const isPinned=row=>pins.some(p=>p.scope===(snapshot.pinScope||snapshot.conversation)&&p.text===row.text);
  const filter=()=>{
    for(const n of $('log').querySelectorAll('[data-archived]'))n.remove();
    if(onlyPinned)for(const saved of pins.filter(p=>p.scope===(snapshot.pinScope||snapshot.conversation)&&!snapshot.messages?.some(r=>r.text===p.text))){const n=document.createElement('div');n.className='message ai';n.dataset.pinned='true';n.dataset.archived='true';n.textContent=saved.text;n._searchText=saved.text;const actions=document.createElement('div');actions.className='message-actions';const copy=document.createElement('button');copy.textContent=snapshot.locale==='tr'?'Kopyala':'Copy';copy.onclick=()=>action('copy',saved.text);const remove=document.createElement('button');remove.textContent=snapshot.locale==='tr'?'Sabitlemeyi kaldır':'Unpin';remove.onclick=()=>{pins=pins.filter(p=>p!==saved);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}filter();};actions.append(copy,remove);n.append(actions);$('log').append(n);}
    let count=0;for(const n of $('log').querySelectorAll('.message')){n.hidden=!!($('find').value&&!(n._searchText||n.textContent).toLocaleLowerCase().includes($('find').value.toLocaleLowerCase()))||(onlyPinned&&n.dataset.pinned!=='true');if(!n.hidden)count++;}$('findCount').textContent=$('find').value||onlyPinned?String(count):'';};
  $('find').oninput=filter;
  $('pinned').onclick=()=>{onlyPinned=!onlyPinned;$('pinned').setAttribute('aria-pressed',String(onlyPinned));filter();};
  $('export').onclick=()=>{const content=(snapshot.messages||[]).map(r=>'## '+(r.role==='user'?'You':'Assistant')+'\n\n'+r.text).join('\n\n');if(content)action('export',content);};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&opened){event.preventDefault();$('conversationMenu').open=true;$('find').focus();}});
  $('reviewCancel').onclick = () => { reviewing = null; $('review').hidden = true; };
  $('reviewConfirm').onclick = () => { if (reviewing && !busy) action(reviewing.action,reviewing.id); reviewing = null; $('review').hidden = true; };
  let jobsKey='';
  function renderJobs(value){
    const rows=(value.jobs||[]).slice(0,6),key=JSON.stringify([value.locale,rows]);if(key===jobsKey)return;jobsKey=key;
    $('jobs').hidden=!rows.length;const tr=value.locale==='tr',active=(value.jobs||[]).filter(row=>['running','cancelling'].includes(row.state)).length;
    $('jobsLabel').textContent=(tr?'İşler':'Jobs')+(active?' · '+active+(tr?' çalışıyor':' active'):tr?' · son işlemler':' · recent');
    $('jobRows').replaceChildren();for(const row of rows){
      const item=document.createElement('div');item.className='assistant-job';
      const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
      title.textContent=({transcription:tr?'Whisper':'Whisper',translation:tr?'Çeviri':'Translation',voice:tr?'Ses üretimi':'Voice generation',reference:tr?'Referans ses':'Reference voice','legacy-chat':tr?'Eski sohbet':'Legacy chat'})[row.kind]||row.kind;
      detail.textContent=(({running:tr?'Çalışıyor':'Running',cancelling:tr?'Durduruluyor':'Stopping',completed:tr?'Tamamlandı':'Completed',failed:tr?'Başarısız — işlem kaydını aç':'Failed — open the job log',stopped:tr?'Durduruldu':'Stopped'})[row.state]||row.state)+(row.percent!==null?' · '+Math.round(row.percent)+'%':'')+(['running','cancelling'].includes(row.state)&&row.stage&&row.stage!=='starting'?' · '+(({download:tr?'İndirme':'Download',transcribe:tr?'Transkripsiyon':'Transcription',translate:tr?'Çeviri':'Translation',model_load:tr?'Model yükleniyor':'Loading model',verification:tr?'Ses kontrolü':'Voice verification',file_write:tr?'Dosya yazılıyor':'Writing file'})[row.stage]||row.stage):'');copy.append(title,detail);item.append(copy);
      if(row.percent!==null){const progress=document.createElement('progress');progress.max=100;progress.value=row.percent;progress.setAttribute('aria-label',title.textContent);copy.append(progress);}
      if(row.stopFailed){const warning=document.createElement('small');warning.textContent=tr?'Durdurma doğrulanamadı; yeniden deneyebilirsin.':'Stop was not confirmed; you can retry.';copy.append(warning);}
      if(row.cancellable){const stop=document.createElement('button');stop.type='button';stop.textContent=tr?'Durdur':'Stop';stop.onclick=()=>action('cancel-job',row.id);item.append(stop);}
      $('jobRows').append(item);
    }
  }
  function toggle() { opened = !opened; $('panel').hidden = !opened; $('bubble').hidden = opened; action('toggle'); if (opened) $('text').focus(); }
  $('bubble').onclick = toggle; $('close').onclick = toggle;
  $('expand').onclick = () => action('expand');
  for (const name of ['cancel','retry']) $(name).onclick=()=>action(name);
  $('clear').onclick=()=>{reviewing={action:'clear'};$('reviewText').textContent=snapshot.locale==='tr'?'Mevcut sohbet geçmişi temizlenecek. Sabitlenen notların korunur.':'This clears the current chat history. Pinned notes are kept.';$('conversationMenu').open=false;$('review').hidden=false;$('reviewConfirm').focus();};
  $('scope').onchange = () => action('scope', $('scope').value);
  function send(mode='send') { const text = $('text').value.trim(); if (!text || busy || pending || snapshot.blocked) return; pending={text,id:'q-'+Date.now()+'-'+(++requestSequence),sourceToken:snapshot.sourceToken};action(mode,text,{requestId:pending.id});$('send').disabled=true;showStatus(snapshot.locale==='tr'?'Soru gönderiliyor…':'Sending question…'); }
  $('webSearch').onclick=()=>send('web-search');
  $('form').onsubmit = event => { event.preventDefault(); send(); };
  $('text').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && opened) { event.preventDefault(); if($('conversationMenu').open){$('conversationMenu').open=false;$('conversationMenuLabel').focus();}else if(!$('review').hidden){$('reviewCancel').click();$('text').focus();}else toggle(); } });
  window.assistant.subscribe(value => {
    if(typeof value.opened==='boolean' && value.opened!==opened){opened=value.opened;$('panel').hidden=!opened;$('bubble').hidden=opened;if(opened){$('text').focus();window.UiMotion?.reveal($('panel'),'panel');}}
    const nextConversation=value.conversation||value.sourceToken||'';
    const firstThread=!!pending&&!snapshot.activeThread&&!!value.activeThread&&(snapshot.pinScope||snapshot.conversation)===(value.pinScope||value.conversation);
    if(firstThread){drafts.delete(conversation);conversation=nextConversation;pending.sourceToken=value.sourceToken;}
    if(conversation!==nextConversation){rememberDraft();conversation=nextConversation;$('text').value=drafts.get(conversation)||value.draft||'';pending=null;onlyPinned=false;$('pinned').setAttribute('aria-pressed','false');$('find').value='';showStatus('');}
    else if(!firstThread&&snapshot.sourceToken&&snapshot.sourceToken!==value.sourceToken){rememberDraft();pending=null;showStatus(value.locale==='tr'?'Kaynak güncellendi; taslağın korundu.':'Source updated; your draft was kept.');}
    snapshot=value;
    for(const key of ['surface','raised','hover','line','strong','text','muted','accent']){const color=value.palette?.[key];if(/^#[a-f0-9]{6}$/i.test(color||''))document.documentElement.style.setProperty('--'+key,color);else document.documentElement.style.removeProperty('--'+key);}
    const accent=value.palette?.accent;if(/^#[a-f0-9]{6}$/i.test(accent||'')){const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));document.documentElement.style.setProperty('--accent-text',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#18100b':'#ffffff');}else document.documentElement.style.removeProperty('--accent-text');
    const threadKey=JSON.stringify([value.locale,value.activeThread,value.threads]);if($('threads').dataset.key!==threadKey){$('threads').dataset.key=threadKey;$('threads').replaceChildren();for(const thread of value.threads||[]){const option=document.createElement('option');option.value=thread.id;option.textContent=thread.title;$('threads').append(option);}if(!$('threads').options.length){const option=document.createElement('option');option.textContent=value.locale==='tr'?'İlk sohbet':'First conversation';$('threads').append(option);}$('threads').value=value.activeThread||$('threads').options[0]?.value;$('threadName').value=value.threads?.find(r=>r.id===value.activeThread)?.title||'';}
    $('workspaceError').textContent=value.workspaceError||'';
    $('webSearch').textContent=value.locale==='tr'?"Web’de araştır":'Search web';$('webSearch').title=value.locale==='tr'?'Sağlayıcının web_search aracını kullanır; ek ücret olabilir.':'Uses provider web_search; additional charges may apply.';$('webSearch').disabled=!!value.busy;
    const tr = value.locale === 'tr'; const t = (en, turkish) => tr ? turkish : en;
    document.documentElement.lang = tr ? 'tr' : 'en'; document.documentElement.dataset.theme = value.theme;
    $('threads').setAttribute('aria-label',t('Conversation','Sohbet'));$('newThread').textContent=t('New','Yeni');$('threadSettings').textContent=t('Manage','Yönet');$('threadNameLabel').textContent=t('Conversation name','Sohbet adı');$('renameThread').textContent=t('Save name','Adı kaydet');$('deleteThread').textContent=t('Delete conversation','Sohbeti sil');
    $('find').placeholder=t('Search conversation','Konuşmada ara');$('find').setAttribute('aria-label',$('find').placeholder);$('pinned').textContent=t('Pinned','Sabitlenen');$('export').textContent=t('Export','Dışa aktar');
    $('sourceLabel').textContent=(value.videoContext||value.transcriptScope?t('Video & subtitles','Video ve altyazı'):value.pageContext?t('Web page','Web sayfası'):t('Selected source','Seçili kaynak'))+' · '+(value.model||t('Source & model','Kaynak ve model'));$('conversationMenuLabel').title=t('Conversation tools','Sohbet araçları');$('conversationMenuLabel').setAttribute('aria-label',$('conversationMenuLabel').title);$('modelName').textContent=value.model||t('Your configured AI model','Ayarlı AI modelin');$('sourceDescription').textContent=value.sourceDescription||t('Only provided context is used.','Yalnız sağlanan bağlam kullanılır.');$('scope').hidden=value.transcriptScope===false;$('latest').textContent=t('Latest reply ↓','Son yanıta git ↓');
    $('title').textContent = t('Assistant', 'Asistan'); $('context').textContent = value.context || '';
    $('bubble').setAttribute('aria-label', t('Open assistant', 'Asistanı aç')); $('bubble').title = $('title').textContent;
    $('expand').title = t('Expand / restore', 'Genişlet / geri al'); $('expand').setAttribute('aria-label', $('expand').title);
    $('close').title = t('Minimize', 'Küçült'); $('close').setAttribute('aria-label', $('close').title);
    for (const [id, en, turkish] of [['send','Send','Gönder'],['cancel','Cancel','İptal'],['retry','Retry','Yeniden dene'],['clear','Clear','Temizle']]) $(id).textContent = t(en, turkish);
    $('text').placeholder = t('Ask a question…', 'Sorunu yaz…'); $('text').setAttribute('aria-label', t('Question', 'Soru'));
    [...$('scope').options].forEach((option, i) => { option.textContent = t(['Nearby','Watched','Full transcript'][i], ['Yakın satırlar','İzlenen bölüm','Tüm altyazı'][i]); });
    $('hint').textContent = t('Enter to send · Shift + Enter for a new line','Enter: gönder · Shift + Enter: yeni satır');
    $('reviewConfirm').textContent = t('Continue', 'Devam et'); $('reviewCancel').textContent = t('Cancel','Vazgeç');
    const nextSuggestions = JSON.stringify(value.suggestions || []);
    if (nextSuggestions !== suggestionKey) {
      suggestionKey = nextSuggestions; $('suggestions').replaceChildren(); reviewing = null; $('review').hidden = true;
      for (const row of value.suggestions || []) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = row.label;
        button.onclick = () => { if(row.direct){if(!busy&&!snapshot.blocked)action('suggestion',row.id);return;} reviewing = {action:'suggestion',id:row.id}; $('reviewText').textContent = row.review; $('review').hidden = false; $('reviewConfirm').focus(); };
        $('suggestions').append(button);
      }
    }
    $('reviewConfirm').disabled = !!value.busy;
    busy = !!value.busy;for(const button of $('suggestions').querySelectorAll('button'))button.disabled=busy||!!value.blocked;for(const id of ['threads','newThread','renameThread','deleteThread'])$(id).disabled=busy||!!value.blocked; $('send').disabled = busy || !!value.blocked || !!pending; $('clear').disabled = busy; $('cancel').hidden = !value.canCancel; $('retry').hidden = !value.retry || busy;
    $('scope').value = value.scope || 'watched';
    if(pending && value.receipt?.id===pending.id){
      if(value.receipt.accepted && pending.sourceToken===value.sourceToken && $('text').value.trim()===pending.text){$('text').value='';rememberDraft();}
      showStatus(value.receipt.message||'',!value.receipt.accepted);pending=null;$('send').disabled=busy||!!value.blocked;
    }
    if(value.blocked&&!pending){$('delivery').dataset.blocked='true';showStatus(t('Another task is running. Your question stays in the draft.','Başka bir iş çalışıyor. Sorun taslakta kalır.'));}else if(!value.blocked&&$('delivery').dataset.blocked==='true'){$('delivery').dataset.blocked='false';if(!value.receipt?.message)showStatus('');}
    renderJobs(value);
    const key = JSON.stringify([value.locale, value.conversation, value.pageContext, value.transcriptScope, value.messages]);
    if (key === lastMessages) return; lastMessages = key;
    const log = $('log'), previousScroll=log.scrollTop,bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    if (!value.messages?.length) { const empty=document.createElement('section');empty.className='empty';const eyebrow=document.createElement('small'),heading=document.createElement('h2'),detail=document.createElement('p');eyebrow.textContent=t('YOUR SOURCE, IN FOCUS','KAYNAĞIN, ODAKTA');heading.textContent=value.videoContext?t('Your video, ready to work.','Videon hazır. Ne yapalım?'):value.pageContext?t('Read. Understand. Explore.','Oku. Anla. Keşfet.'):t('A closer look at your source.','Kaynağına birlikte bakalım.');detail.textContent=value.videoContext?t('Translate existing captions or start Whisper. The selected video range is used; progress appears in this conversation.','Mevcut altyazıyı çevir veya Whisper başlat. Seçili video aralığı kullanılır; ilerleme bu sohbette gösterilir.'):value.pageContext?t('Summarize this page, ask about its claims, or translate it directly on the page.','Bu sayfayı özetle, iddialarını sor veya doğrudan sayfanın üzerinde çevir.'):value.transcriptScope?t('Ask about the dialogue, compare translations, or revisit a scene with subtitle evidence.','Konuşmayı sor, çevirileri karşılaştır veya altyazı kanıtlarıyla bir sahneye dön.'):t('Ask about the selected text or title. Only the supplied source is used.','Seçili metni veya yapımı sor. Yalnız sağlanan kaynak kullanılır.');empty.append(eyebrow,heading,detail);log.append(empty); }
    for (const row of value.messages || []) {
      const node = document.createElement('div'); node.className = 'message ' + row.role; node._searchText=row.text;const role=document.createElement('span');role.className='message-role';role.textContent=row.role==='user'?t('YOU','SEN'):t('ASSISTANT','ASİSTAN');node.append(role);renderText(node,row.text,row.loading);if(row.loading)node.classList.add('loading');if(row.error)node.classList.add('failed');node.dataset.pinned=String(isPinned(row));
      const actions=document.createElement('div');actions.className='message-actions';
      const addAction=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;actions.append(b);return b;};
      addAction(t('Copy','Kopyala'),()=>action('copy',row.text));
      const pin=addAction(isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle'),()=>{if(isPinned(row))pins=pins.filter(p=>p.scope!==(value.pinScope||value.conversation)||p.text!==row.text);else pins=[...pins,{scope:value.pinScope||value.conversation,text:row.text}].slice(-100);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}node.dataset.pinned=String(isPinned(row));pin.textContent=isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle');filter();});
      if(row.id&&!row.loading)addAction(t('Branch from here','Buradan dallandır'),()=>action('branch',row.id));
      if(row.status==='stopped'||row.status==='failed'){const status=document.createElement('small');status.className='answer-status';status.textContent=row.status==='stopped'?t('Stopped','Durduruldu'):t('Failed — see details above','Başarısız — ayrıntılar yukarıda');node.append(status);}
      if(row.role==='user')addAction(t('Edit as new question','Yeni soru olarak düzenle'),()=>{$('text').value=row.text;rememberDraft();$('text').focus();});
      const code=[...row.text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n\n');if(code)addAction(t('Copy code','Kodu kopyala'),()=>action('copy',code));
      if(!row.loading)node.append(actions);
      if (row.links?.length) {
        const sources = document.createElement('div'); sources.className = 'sources';
        for (const link of row.links) { const button = document.createElement('button'); button.textContent = link.label; button.onclick = () => action('citation', link.id);if(link.excerpt){const card=document.createElement('div');card.className='source-card';const excerpt=document.createElement('p');excerpt.textContent=link.excerpt;card.append(button,excerpt);if(link.translation){const translated=document.createElement('small');translated.textContent=link.translation;card.append(translated);}sources.append(card);}else sources.append(button); }
        node.append(sources);
      }
      for(const proposed of row.actions||[]){
        const card=document.createElement('div');card.className='tool-card';
        const title=document.createElement('strong');title.textContent=proposed.kind==='app_action'?proposed.label||t('Application action','Uygulama işlemi'):t(({seek_to_time:'Jump to this scene',preview_translation_change:'Translation suggestion',open_voice_preparation:'Prepare voice'})[proposed.kind]||'Suggested action',({seek_to_time:'Bu sahneye git',preview_translation_change:'Çeviri önerisi',open_voice_preparation:'Sesi hazırla'})[proposed.kind]||'Önerilen işlem');
        const detail=document.createElement('p');detail.textContent=[proposed.excerpt,proposed.translation].filter(Boolean).join('\n→ ');
        const apply=document.createElement('button');
        apply.textContent=proposed.resultStatus?t(({accepted:'Accepted',completed:'Applied',failed:'Failed',stopped:'Stopped'})[proposed.resultStatus]||'Finished',({accepted:'Kabul edildi',completed:'Uygulandı',failed:'Başarısız',stopped:'Durduruldu'})[proposed.resultStatus]||'Bitti'):proposed.kind==='preview_translation_change'?t('Copy suggestion','Öneriyi kopyala'):t('Apply','Uygula');
        apply.disabled=busy||!!proposed.resultStatus;
        apply.onclick=()=>{reviewing={action:'apply-tool',id:proposed.id};$('reviewText').textContent=title.textContent+'\n'+detail.textContent+'\n'+(proposed.kind==='app_action'?t('Runs this application action on the attached source using your current settings.','Bu uygulama işlemini bağlı kaynakta mevcut ayarlarınla çalıştırır.'):t('Runs only this action. No file is modified and no voice is generated.','Yalnız bu işlem uygulanır. Dosya değişmez ve ses üretimi başlamaz.'));$('review').hidden=false;};
        card.append(title,detail,apply);
        if(proposed.resultText){const receipt=document.createElement('p');receipt.className='action-receipt';receipt.setAttribute('role','status');receipt.textContent=proposed.resultText;card.append(receipt);}
        node.append(card);
      }
      log.append(node);
    }
    filter();
    if (bottom) log.scrollTop = log.scrollHeight;else log.scrollTop=previousScroll;
    $('latest').hidden=bottom;
  });
  $('threads').onchange=()=>action('select-thread',$('threads').value);
  $('newThread').onclick=()=>action('new-thread');
  $('threadSettings').onclick=()=>{$('threadEditor').hidden=!$('threadEditor').hidden;$('threadSettings').setAttribute('aria-expanded',String(!$('threadEditor').hidden));};
  $('renameThread').onclick=()=>action('rename-thread',$('threadName').value);
  $('deleteThread').onclick=()=>{reviewing={action:'delete-thread'};$('reviewText').textContent=snapshot.locale==='tr'?'Bu sohbet kalıcı olarak silinecek. Diğer sohbetler ve sabitlenen notlar korunur.':'This conversation will be permanently deleted. Other chats and pinned notes are kept.';$('review').hidden=false;};
  document.addEventListener('click',event=>{if(!$('conversationMenu').contains(event.target))$('conversationMenu').open=false;});
  action('ready');
})();
