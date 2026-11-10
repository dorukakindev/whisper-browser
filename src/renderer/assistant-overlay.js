(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let opened = false, lastMessages = '', busy = false, pending = null, renderedConversation = null;
  let suggestionKey = '', reviewing = null, snapshot={},onlyPinned=false,pins=[];
  const drafts=new Map();let conversation=null,requestSequence=0;
  const openMessageActions=new Set(),openSources=new Set();
  const readingStates=new Map();
  let progressStarted=0,progressTimer=null;
  function renderProgress(value){
    const panel=$('agentProgress'),tr=value.locale==='tr';
    if(!value.busy){panel.hidden=true;progressStarted=0;clearInterval(progressTimer);progressTimer=null;return;}
    if(!progressStarted){progressStarted=Date.now();const tick=()=>{const seconds=Math.max(0,Math.floor((Date.now()-progressStarted)/1000));$('progressElapsed').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};tick();progressTimer=setInterval(tick,1000);}
    const phase=['reasoning','writing','tool','applying'].includes(value.phase)?value.phase:'waiting';
    panel.hidden=false;panel.dataset.phase=phase;
    panel.setAttribute('aria-label',tr?'Asistan etkinliği':'Assistant activity');
    $('progressLabel').textContent=value.activity||(tr?'Yanıt bekleniyor…':'Waiting for a response…');
    $('progressDetail').textContent=phase==='reasoning'?(tr?'Sağlayıcı değerlendirme sinyali gönderiyor.':'The provider is sending a reasoning signal.'):phase==='tool'?(tr?'Uygulamadaki araçlardan doğrulanmış bilgi alınıyor.':'Checking evidence through application tools.'):phase==='writing'?(tr?'Yanıt geldikçe burada görünür.':'The answer appears as it arrives.'):phase==='applying'?(tr?'İşlem sonucu doğrulanıyor.':'Verifying the application result.'):(tr?'İstek açık; istersen durdurabilirsin.':'The request is active. You can stop it at any time.');
    const stages=[...panel.querySelectorAll('[data-stage]')];const active=phase==='writing'?2:phase==='tool'||phase==='applying'?1:0;
    stages.forEach((node,i)=>{node.textContent=(tr?['Bağlantı','Araçlar','Yanıt']:['Connect','Tools','Answer'])[i];node.classList.toggle('active',i===active);});
  }
  window.addEventListener('pagehide',()=>clearInterval(progressTimer),{once:true});

  const action=(name,text,meta={})=>window.assistant.action(name,text,{sourceToken:snapshot.sourceToken||'',...meta});
  const rememberDraft=()=>{if(conversation===null)return;drafts.delete(conversation);drafts.set(conversation,$('text').value);while(drafts.size>20)drafts.delete(drafts.keys().next().value);};
  $('text').addEventListener('input',rememberDraft);
  function messageActions(key,copy){
    const tr=snapshot.locale==='tr',box=document.createElement('div'),direct=document.createElement('button'),more=document.createElement('details'),summary=document.createElement('summary'),options=document.createElement('div');
    box.className='message-actions';box.dataset.messageKey=key;direct.type='button';direct.dataset.messageControl='copy';direct.textContent=tr?'Kopyala':'Copy';direct.onclick=copy;
    more.className='message-more';more.open=openMessageActions.has(key);summary.dataset.messageControl='more';summary.title=tr?'Diğer mesaj işlemleri':'More message actions';summary.setAttribute('aria-label',summary.title);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');for(const cx of [5,12,19]){const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',String(cx));dot.setAttribute('cy','12');dot.setAttribute('r','1.5');svg.append(dot);}summary.append(svg);
    options.className='message-more-options';more.append(summary,options);box.append(direct,more);
    more.addEventListener('toggle',()=>{if(!more.isConnected)return;if(more.open)openMessageActions.add(key);else openMessageActions.delete(key);while(openMessageActions.size>100)openMessageActions.delete(openMessageActions.values().next().value);});
    more.addEventListener('keydown',event=>{if(event.key==='Escape'&&more.open){event.preventDefault();event.stopPropagation();more.open=false;openMessageActions.delete(key);summary.focus({preventScroll:true});}});
    let count=0;return {box,add(label,fn){const b=document.createElement('button');b.type='button';b.dataset.messageControl='secondary-'+count++;b.textContent=label;b.onclick=()=>{more.open=false;openMessageActions.delete(key);summary.focus({preventScroll:true});fn();if(!summary.isConnected||summary.closest('[hidden]'))$('text').focus({preventScroll:true});};options.append(b);return b;}};
  }
  const showStatus=(message,error=false)=>{$('delivery').textContent=message;$('delivery').classList.toggle('error',error);};
  $('latest').onclick=()=>{$('log').scrollTop=$('log').scrollHeight;$('latest').hidden=true;};
  $('log').onscroll=()=>{$('latest').hidden=!$('log').querySelector('.message')||$('log').scrollHeight-$('log').scrollTop-$('log').clientHeight<80;};
  // Inline [P1]-style markers in the answer become buttons that open and focus the matching source card of the SAME message.
  function linkCitations(node,row,sources,t){
    const labels=new Map(row.links.flatMap(l=>[[l.label,l],...(l.reference?[[l.reference,l]]:[])]));
    const uuid='P[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',marker='(?:[A-Za-z]\\d+|'+uuid+')',reference='(?:\\['+marker+'\\]|\\b'+uuid+'\\b)',matchMarker=new RegExp(reference);
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&!n.parentElement.closest('.sources,button,pre,code,summary,.message-actions')&&matchMarker.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
    const targets=[];while(walker.nextNode())targets.push(walker.currentNode);
    for(const textNode of targets){
      const frag=document.createDocumentFragment();
      for(const part of textNode.nodeValue.split(new RegExp('('+reference+')','g'))){
        const match=new RegExp('^\\[('+marker+')\\]$').exec(part),link=labels.get(match?match[1]:part);
        if(!link){if(part)frag.append(part);continue;}
        const b=document.createElement('button');b.type='button';b.className='cite-ref';b.textContent=link.label;b.dataset.citationControl=JSON.stringify([row.id||'message',link.id,'ref']);
        b.setAttribute('aria-label',t('Go to source ','Kaynağa git ')+link.label+(link.title?': '+link.title:''));
        b.onclick=()=>{
          const card=[...sources.querySelectorAll('[data-cite-label]')].find(c=>c.dataset.citeLabel===link.label&&c.tagName==='DETAILS')||[...sources.querySelectorAll('[data-cite-label]')].find(c=>c.dataset.citeLabel===link.label);
          if(!card)return;const group=card.closest('.source-group');if(group)group.open=true;if(card.tagName==='DETAILS')card.open=true;
          card.scrollIntoView?.({block:"nearest"});(card.querySelector('summary')||card).focus?.({preventScroll:true});card.dataset.flash='1';setTimeout(()=>{delete card.dataset.flash;},1400);
        };
        frag.append(b);
      }
      textNode.replaceWith(frag);
    }
  }
  function renderText(node,text,streaming=false){
    if(streaming&&window.AssistantRemend?.default)text=window.AssistantRemend.default(String(text||''));
    const inline=(node,value)=>{for(const part of value.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)){if(!part)continue;let tag=part.startsWith('**')&&part.endsWith('**')?'strong':part.startsWith('`')&&part.endsWith('`')?'code':part.startsWith('*')&&part.endsWith('*')?'em':null;if(tag){const child=document.createElement(tag);child.textContent=part.slice(tag==='strong'?2:1,tag==='strong'?-2:-1);node.append(child);}else node.append(document.createTextNode(part));}};
    const blocks=String(text||'').split(/(```[\s\S]*?(?:```|$))/g);
    for(const block of blocks){if(!block)continue;if(block.startsWith('```')){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=block.replace(/^```[^\n]*\n?/,'').replace(/```$/,'');pre.append(code);node.append(pre);}else{for(const line of block.split('\n')){if(!line){node.append(document.createElement('br'));continue;}const heading=/^#{1,3}\s+/.test(line),list=/^\s*[-*]\s+/.test(line),ordered=/^\s*\d+[.)]\s+/.test(line),quote=/^>\s?/.test(line);const p=document.createElement(heading?'h3':quote?'blockquote':'p');if(list||ordered)p.className='answer-list';if(ordered)p.dataset.ordered='1';if(quote)p.className='answer-quote';inline(p,line.replace(/^>\s?/,'').replace(/^#{1,3}\s+/,'').replace(/^\s*[-*]\s+/,'• '));node.append(p);}}}
  }
  try{const saved=JSON.parse(localStorage.getItem('assistant-pins-v1')||'[]');if(Array.isArray(saved))pins=saved.filter(x=>x&&typeof x.scope==='string'&&typeof x.text==='string').slice(-100);}catch{}
  const isPinned=row=>pins.some(p=>p.scope===(snapshot.pinScope||snapshot.conversation)&&p.text===row.text);
  const filter=()=>{
    for(const n of $('log').querySelectorAll('[data-archived]'))n.remove();
    if(onlyPinned)for(const [index,saved]of pins.filter(p=>p.scope===(snapshot.pinScope||snapshot.conversation)&&!snapshot.messages?.some(r=>r.text===p.text)).entries()){const n=document.createElement('div');n.className='message ai';n.dataset.pinned='true';n.dataset.archived='true';n.textContent=saved.text;n._searchText=saved.text;const actions=messageActions('archived-'+index,()=>action('copy',saved.text));actions.add(snapshot.locale==='tr'?'Sabitlemeyi kaldır':'Unpin',()=>{pins=pins.filter(p=>p!==saved);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}filter();});n.append(actions.box);$('log').append(n);}
    let count=0;for(const n of $('log').querySelectorAll('.message')){n.hidden=!!($('find').value&&!(n._searchText||n.textContent).toLocaleLowerCase().includes($('find').value.toLocaleLowerCase()))||(onlyPinned&&n.dataset.pinned!=='true');if(!n.hidden)count++;}$('findCount').textContent=$('find').value||onlyPinned?String(count):'';};
  $('find').oninput=filter;
  $('pinned').onclick=()=>{onlyPinned=!onlyPinned;$('pinned').setAttribute('aria-pressed',String(onlyPinned));filter();};
  $('export').onclick=()=>{const content=(snapshot.messages||[]).map(r=>'## '+(r.role==='user'?'You':'Assistant')+'\n\n'+r.text).join('\n\n');if(content)action('export',content);};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&opened){event.preventDefault();$('conversationMenu').open=true;$('find').focus();}});
  let reviewTrigger=null;
  function closeReview(restore=true){
    reviewing=null;$('review').hidden=true;
    if(restore){let target=reviewTrigger;if(!target?.isConnected&&target?.dataset.toolControl){const card=[...$('log').querySelectorAll('.tool-card')].find(n=>n.dataset.proposalId===target._reviewProposal);target=card?.querySelector('[data-tool-control="'+target.dataset.toolControl+'"]');}if(!target?.isConnected||target.disabled||target.closest('[hidden]'))target=$('text');if(target.closest('#suggestionMenu')&&!$('suggestionMenu').open)target=$('suggestionMenuLabel');if(target.closest('#conversationMenu')&&!$('conversationMenu').open)target=$('conversationMenuLabel');target.focus();}
    reviewTrigger=null;
  }
  function openReview(request,text,trigger=document.activeElement){
    reviewing=request;reviewTrigger=trigger;
    if(trigger?.dataset.toolControl)trigger._reviewProposal=trigger.closest('.tool-card')?.dataset.proposalId;
    $('reviewText').textContent=text;$('review').hidden=false;$('reviewText').scrollTop=0;
    $('reviewConfirm').focus({preventScroll:true});$('review').scrollIntoView?.({block:'nearest'});
  }
  $('reviewCancel').onclick=()=>closeReview();
  $('reviewConfirm').onclick=()=>{if(!reviewing||busy)return;const request=reviewing;closeReview();action(request.action,request.id);};
  let jobsKey='';
  function renderJobs(value){
    const rows=[...(value.jobs||[]).filter(row=>['running','cancelling'].includes(row.state)),...(value.jobs||[]).filter(row=>!['running','cancelling'].includes(row.state))].slice(0,6),key=JSON.stringify([value.locale,rows]);if(key===jobsKey)return;jobsKey=key;
    $('jobs').hidden=!rows.length;const tr=value.locale==='tr',active=(value.jobs||[]).filter(row=>['running','cancelling'].includes(row.state)).length;
    $('jobsLabel').textContent=(tr?'İşler':'Jobs')+(active?' · '+active+(tr?' çalışıyor':' active'):tr?' · son işlemler':' · recent');
    $('jobRows').replaceChildren();for(const row of rows){
      const item=document.createElement('div');item.className='assistant-job';item.dataset.jobId=row.id;
      const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
      title.textContent=({transcription:tr?'Whisper':'Whisper',translation:tr?'Çeviri':'Translation',voice:tr?'Ses üretimi':'Voice generation',reference:tr?'Referans ses':'Reference voice',captions:tr?'Yakalanan altyazı çevirisi':'Captured caption translation','page-translation':tr?'Sayfa çevirisi':'Page translation','caption-probe':tr?'YouTube bilgisi':'YouTube metadata','caption-download':tr?'Altyazı indirme':'Caption download','legacy-chat':tr?'Eski sohbet':'Legacy chat'})[row.kind]||row.kind;
      detail.textContent=(({running:tr?'Çalışıyor':'Running',cancelling:tr?'Durduruluyor':'Stopping',completed:tr?'Tamamlandı':'Completed',failed:tr?'Başarısız — işlem kaydını aç':'Failed — open the job log',stopped:tr?'Durduruldu':'Stopped'})[row.state]||row.state)+(row.percent!==null?' · '+Math.round(row.percent)+'%':'')+(['running','cancelling'].includes(row.state)&&row.stage&&row.stage!=='starting'?' · '+(({download:tr?'İndirme':'Download',transcribe:tr?'Transkripsiyon':'Transcription',translate:tr?'Çeviri':'Translation',translation:tr?'Çeviri':'Translation',waiting:tr?'Bekleniyor':'Waiting',model_load:tr?'Model yükleniyor':'Loading model',synthesis:tr?'Ses üretiliyor':'Generating speech',reference:tr?'Referans hazırlanıyor':'Preparing reference',delivery_analysis:tr?'Anlatım analiz ediliyor':'Analyzing delivery',extract:tr?'Ses çıkarılıyor':'Extracting audio',separate_gpu:tr?'Ortam sesi ayrılıyor · GPU':'Separating background · GPU',separate_cpu:tr?'Ortam sesi ayrılıyor · CPU':'Separating background · CPU',normalization:tr?'Ses dengeleniyor':'Normalizing audio',placement:tr?'Ses yerleştiriliyor':'Placing audio',engine_restart:tr?'Motor yeniden başlatılıyor':'Restarting engine',plan:tr?'Konuşma planı':'Speech plan',verification:tr?'Ses kontrolü':'Voice verification',file_write:tr?'Dosya yazılıyor':'Writing file'})[row.stage]||row.stage):'');copy.append(title,detail);
      if(row.activity&&['running','cancelling'].includes(row.state)){
        const a=row.activity,pulse=document.createElement('small');pulse.className='assistant-job-activity';
        pulse.textContent=tr?`Grup ${a.group} · deneme ${a.attempt} · ${a.elapsed} sn / ${a.limit} sn sınır`:`Group ${a.group} · attempt ${a.attempt} · ${a.elapsed} s / ${a.limit} s limit`;
        copy.append(pulse);
      }
      item.append(copy);
      if(row.percent!==null){const progress=document.createElement('progress');progress.max=100;progress.value=row.percent;progress.setAttribute('aria-label',title.textContent);copy.append(progress);}
      if(row.counts){const count=document.createElement('small');count.textContent=row.counts.done+' / '+row.counts.total+(row.counts.failed?' · '+row.counts.failed+(tr?' başarısız':' failed'):'');copy.append(count);}
      if(row.failureCode){const reason=document.createElement('small');reason.textContent=window.AssistantJobDiagnostics.describe(row.failureCode,value.locale);copy.append(reason);}
      if(row.result?.artifacts?.some(artifact=>artifact.partial)){const warning=document.createElement('small');warning.textContent=tr?'Kısmi altyazı çıktısı — eksik satırları kontrol et.':'Partial subtitle output — review missing lines.';copy.append(warning);}
      if(row.stopFailed){const warning=document.createElement('small');warning.textContent=tr?'Durdurma doğrulanamadı; yeniden deneyebilirsin.':'Stop was not confirmed; you can retry.';copy.append(warning);}
      if(row.cancellable){const stop=document.createElement('button');stop.type='button';stop.textContent=tr?'Durdur':'Stop';stop.onclick=()=>action('cancel-job',row.id);item.append(stop);}
      $('jobRows').append(item);
    }
  }
  function toggle() { opened = !opened; $('panel').hidden = !opened; $('bubble').hidden = opened; action('toggle'); if (opened) $('text').focus(); }
  $('bubble').onclick = toggle; $('close').onclick = toggle;
  $('expand').onclick = () => action('expand');
  $('assistantSettings').onclick = () => action('settings');
  for (const name of ['cancel','retry']) $(name).onclick=()=>action(name);
  $('clear').onclick=()=>{$('conversationMenu').open=false;openReview({action:'clear'},snapshot.locale==='tr'?'Mevcut sohbet geçmişi temizlenecek. Sabitlenen notların korunur.':'This clears the current chat history. Pinned notes are kept.',$('conversationMenuLabel'));};
  $('scope').onchange = () => action('scope', $('scope').value);
  function send(mode='send') { const text = $('text').value.trim(); if (!text || busy || pending || snapshot.blocked) return; pending={text,id:'q-'+Date.now()+'-'+(++requestSequence),sourceToken:snapshot.sourceToken};action(mode,text,{requestId:pending.id});$('send').disabled=true;showStatus(snapshot.locale==='tr'?'Soru gönderiliyor…':'Sending question…'); }
  function runtimeMessage(mode){const text=$('text').value.trim();if(!snapshot.canRuntimeMessage||pending||!text)return;if(text.length>4000){showStatus(snapshot.locale==='tr'?'Görev mesajı en fazla4000karakter olmalı.':'Task messages support up to4000characters.',true);return;}pending={text,id:'m-'+Date.now()+'-'+(++requestSequence),sourceToken:snapshot.sourceToken};action(mode,text,{requestId:pending.id});}
  $('steer').onclick=()=>runtimeMessage('steer');$('followup').onclick=()=>runtimeMessage('followup');
  $('webSearch').onclick=()=>send('web-search');
  $('form').onsubmit = event => { event.preventDefault(); send(); };
  $('text').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && opened) { event.preventDefault(); if(!$('review').hidden){$('reviewCancel').click();}else if($('suggestionMenu').open){$('suggestionMenu').open=false;$('suggestionMenuLabel').focus();}else if($('conversationMenu').open){$('conversationMenu').open=false;$('conversationMenuLabel').focus();}else toggle(); } });
  window.assistant.subscribe(value => {
    if(typeof value.opened==='boolean' && value.opened!==opened){opened=value.opened;$('panel').hidden=!opened;$('bubble').hidden=opened;if(opened){$('text').focus();window.UiMotion?.reveal($('panel'),'panel');}}
    const nextConversation=value.conversation||value.sourceToken||'';
    if(snapshot.sourceToken!==value.sourceToken){const focused=$('review').contains(document.activeElement);closeReview(false);if(focused)$('text').focus();}
    const firstThread=!!pending&&!snapshot.activeThread&&!!value.activeThread&&(snapshot.pinScope||snapshot.conversation)===(value.pinScope||value.conversation);
    if(firstThread){drafts.delete(conversation);conversation=nextConversation;pending.sourceToken=value.sourceToken;}
    if(conversation!==nextConversation){rememberDraft();conversation=nextConversation;$('text').value=drafts.get(conversation)||value.draft||'';pending=null;onlyPinned=false;$('pinned').setAttribute('aria-pressed','false');$('find').value='';showStatus('');}
    else if(!firstThread&&snapshot.sourceToken&&snapshot.sourceToken!==value.sourceToken){rememberDraft();pending=null;showStatus(value.locale==='tr'?'Kaynak güncellendi; taslağın korundu.':'Source updated; your draft was kept.');}
    snapshot=value;
    for(const key of ['surface','raised','hover','line','strong','text','muted','accent']){const color=value.palette?.[key];if(/^#[a-f0-9]{6}$/i.test(color||''))document.documentElement.style.setProperty('--'+key,color);else document.documentElement.style.removeProperty('--'+key);}
    const accent=value.palette?.accent;if(/^#[a-f0-9]{6}$/i.test(accent||'')){const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));document.documentElement.style.setProperty('--accent-text',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#18100b':'#ffffff');}else document.documentElement.style.removeProperty('--accent-text');
    const threadKey=JSON.stringify([value.locale,value.activeThread,value.threads]);if($('threads').dataset.key!==threadKey){$('threads').dataset.key=threadKey;$('threads').replaceChildren();for(const thread of value.threads||[]){const option=document.createElement('option');option.value=thread.id;option.textContent=thread.title;$('threads').append(option);}if(!$('threads').options.length){const option=document.createElement('option');option.textContent=value.locale==='tr'?'İlk sohbet':'First conversation';$('threads').append(option);}$('threads').value=value.activeThread||$('threads').options[0]?.value;$('threadName').value=value.threads?.find(r=>r.id===value.activeThread)?.title||'';}
    $('workspaceError').textContent=value.workspaceError||'';
    renderProgress(value);
    $('sourcePreview').textContent=value.sourcePreview?.summary||'';$('sourcePreviewFull').textContent=value.sourcePreview?.summary||'';$('sourceSummary').title=value.sourcePreview?.summary||'';$('sourcePreview').hidden=!value.sourcePreview?.summary;$('sourcePreviewDetail').textContent=value.sourcePreview?.detail||'';
    $('webSearch').textContent=value.locale==='tr'?"Web’de araştır":'Search web';$('webSearch').title=value.locale==='tr'?'Sağlayıcının web_search aracını kullanır; ek ücret olabilir.':'Uses provider web_search; additional charges may apply.';$('webSearch').disabled=!!value.busy;
    const tr = value.locale === 'tr'; const t = (en, turkish) => tr ? turkish : en;
    document.documentElement.lang = tr ? 'tr' : 'en'; document.documentElement.dataset.theme = value.theme;
    $('modelLabel').textContent=t('Active model','Etkin model');$('review').setAttribute('role','group');$('review').setAttribute('aria-label',t('Confirm action','İşlemi onayla'));
    $('threads').setAttribute('aria-label',t('Conversation','Sohbet'));$('newThread').textContent=t('New','Yeni');$('threadSettings').textContent=t('Manage','Yönet');$('threadNameLabel').textContent=t('Conversation name','Sohbet adı');$('renameThread').textContent=t('Save name','Adı kaydet');$('deleteThread').textContent=t('Delete conversation','Sohbeti sil');
    $('find').placeholder=t('Search conversation','Konuşmada ara');$('find').setAttribute('aria-label',$('find').placeholder);$('pinned').textContent=t('Pinned','Sabitlenen');$('export').textContent=t('Export','Dışa aktar');
    $('sourceLabel').textContent=(value.videoContext||value.transcriptScope?t('Video, subtitles & model','Video, altyazı ve model'):value.pageContext?t('Web page & model','Web sayfası ve model'):t('Source & model','Kaynak ve model'));$('assistantSettings').textContent=t('Assistant & translation settings','Asistan ve çeviri ayarları');$('conversationMenuLabel').title=t('Conversation tools','Sohbet araçları');$('conversationMenuLabel').setAttribute('aria-label',$('conversationMenuLabel').title);$('modelName').textContent=value.model||t('Your configured AI model','Ayarlı AI modelin');$('sourceDescription').textContent=value.sourceDescription||t('Only provided context is used.','Yalnız sağlanan bağlam kullanılır.');$('scope').hidden=value.transcriptScope===false;$('latest').textContent=t('Latest reply ↓','Son yanıta git ↓');
    $('title').textContent = t('Assistant', 'Asistan'); $('context').textContent = value.context || '';$('openSource').hidden=!value.sourceTarget;$('openSource').textContent=t('Go to source','Kaynağa git');$('openSource').title=t('Open the source this conversation is about','Bu sohbetin konusu olan kaynağı aç');$('openSource').onclick=()=>action('open-source','');
    $('bubble').setAttribute('aria-label', t('Open assistant', 'Asistanı aç')); $('bubble').title = $('title').textContent;
    $('expand').title = t('Expand / restore', 'Genişlet / geri al'); $('expand').setAttribute('aria-label', $('expand').title);
    $('close').title = t('Minimize', 'Küçült'); $('close').setAttribute('aria-label', $('close').title);
    for (const [id, en, turkish] of [['send','Send','Gönder'],['cancel','Cancel','İptal'],['retry','Retry','Yeniden dene'],['clear','Clear','Temizle']]) $(id).textContent = t(en, turkish);
    $('text').placeholder = t('Ask a question…', 'Sorunu yaz…'); $('text').setAttribute('aria-label', t('Question', 'Soru'));
    [...$('scope').options].forEach((option, i) => { option.textContent = t(['Nearby','Watched','Full transcript'][i], ['Yakın satırlar','İzlenen bölüm','Tüm altyazı'][i]); });
    $('hint').textContent = t('Enter to send · Shift + Enter for a new line','Enter: gönder · Shift + Enter: yeni satır');
    $('reviewConfirm').textContent = t('Continue', 'Devam et'); $('reviewCancel').textContent = t('Cancel','Vazgeç');
    $('suggestionMenuLabel').textContent=t('More suggestions','Diğer öneriler');
    const nextSuggestions = JSON.stringify(value.suggestions || []);
    if (nextSuggestions !== suggestionKey) {
      suggestionKey = nextSuggestions; $('primarySuggestion').replaceChildren();$('suggestionOptions').replaceChildren();$('suggestionMenu').open=false;const many=(value.suggestions||[]).length>1;$('suggestionMenu').hidden=!many; closeReview(false);
      for (const [index,row] of (value.suggestions || []).entries()) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = row.label;button.title=row.label;
        button.onclick = () => { $('suggestionMenu').open=false;if(index)$('suggestionMenuLabel').focus();if(row.direct){if(!busy&&!snapshot.blocked)action('suggestion',row.id);return;} openReview({action:'suggestion',id:row.id},row.review,button); };
        (index&&many?$('suggestionOptions'):$('primarySuggestion')).append(button);
      }
    }
    $('reviewConfirm').disabled = !!value.busy;
    busy = !!value.busy;$('suggestions').hidden=busy||!!value.blocked||!(value.suggestions||[]).length;if($('suggestions').hidden)$('suggestionMenu').open=false;for(const button of $('suggestions').querySelectorAll('button'))button.disabled=busy||!!value.blocked;for(const id of ['threads','newThread','renameThread','deleteThread'])$(id).disabled=busy||!!value.blocked; $('send').disabled = busy || !!value.blocked || !!pending; $('clear').disabled = busy; $('cancel').hidden = !value.canCancel; $('retry').hidden = !value.retry || busy;
    $('runtimeControls').hidden=!value.canRuntimeMessage;$('steer').textContent=t('Steer now','Yön değiştir');$('followup').textContent=t('After this answer','Bitince ekle');for(const id of ['steer','followup'])$(id).disabled=!!pending;
    const queued=(value.runtimeMessages||[]).filter(row=>row.status==='queued').length;$('runtimeMessageStatus').textContent=queued?t(`${queued} queued message(s)`,`${queued} mesaj sırada`):'';
    $('scope').value = value.scope || 'watched';$('scopeLabel').textContent=t('Context scope','Bağlam kapsamı');
    $('tools').hidden=value.transcriptScope===false;
    const podcastScope=value.sourceTarget?.kind==='podcast';
    if(podcastScope)$('sourceLabel').textContent=t('Podcast transcript & model','Podcast metni ve model');
    for(const option of $('scope').options)option.textContent=option.value==='nearby'?t('Nearby','Yakın çevre'):option.value==='watched'?(podcastScope?t('Heard so far','Bu ana kadar dinlenen'):t('Watched so far','Bu ana kadar izlenen')):(podcastScope?t('Saved transcript','Kayıtlı döküm'):t('Full transcript','Tüm döküm'));
    $('scopeHint').textContent=$('scope').value==='watched'?t('Only finished lines up to the question moment. Later speech stays outside this request.','Yalnız soru anına kadar biten satırlar. Sonraki konuşma bu isteğe eklenmez.'):$('scope').value==='nearby'?t('About three minutes around the current position.','Geçerli konumun yaklaşık üç dakika çevresi.'):t('Uses saved text. The supplied excerpt may be shortened; check the source preview.','Kayıtlı metni kullanır. Gönderilen bölüm kısaltılabilir; kaynak önizlemesini kontrol et.');
    if(pending && value.receipt?.id===pending.id){
      if(value.receipt.accepted && pending.sourceToken===value.sourceToken && $('text').value.trim()===pending.text){$('text').value='';rememberDraft();}
      showStatus(value.receipt.message||'',!value.receipt.accepted);pending=null;$('send').disabled=busy||!!value.blocked;
    }
    if(value.blocked&&!pending){$('delivery').dataset.blocked='true';showStatus(t('Another task is running. Your question stays in the draft.','Başka bir iş çalışıyor. Sorun taslakta kalır.'));}else if(!value.blocked&&$('delivery').dataset.blocked==='true'){$('delivery').dataset.blocked='false';if(!value.receipt?.message)showStatus('');}
    renderJobs(value);
    const key = JSON.stringify([value.locale, value.conversation, value.pageContext, value.videoContext, value.transcriptScope, value.sourcePreview?.attached, value.busy, value.messages]);
    if (key === lastMessages) return; lastMessages = key;
    const log = $('log'), threadChanged=renderedConversation!==value.conversation;
    if(threadChanged&&renderedConversation!=null){
      const sources=[...log.querySelectorAll('.source-card[open],.source-group[open]')].map(n=>n.dataset.sourceKey);
      const actions=[...log.querySelectorAll('.message-more[open]')].map(n=>n.closest('.message-actions').dataset.messageKey);
      readingStates.delete(renderedConversation);readingStates.set(renderedConversation,{scroll:log.scrollTop,bottom:log.scrollHeight-log.scrollTop-log.clientHeight<60,sources,actions});
      while(readingStates.size>30)readingStates.delete(readingStates.keys().next().value);
    }
    const reading=threadChanged?readingStates.get(value.conversation):null;
    const previousScroll=reading?.scroll??log.scrollTop,bottom=threadChanged?(reading?.bottom??true):log.scrollHeight-log.scrollTop-log.clientHeight<60;
    renderedConversation=value.conversation;
    const focused=document.activeElement,focusCard=log.contains(focused)?focused.closest('.tool-card'):null;
    const focusTarget=focusCard?{id:focusCard.dataset.proposalId,control:focused.dataset.toolControl}:null;
    const messageFocus=log.contains(focused)&&focused.closest('.message-actions')?{key:focused.closest('.message-actions').dataset.messageKey,control:focused.dataset.messageControl}:null;
    if(threadChanged){openMessageActions.clear();openSources.clear();for(const id of reading?.sources||[])openSources.add(id);for(const id of reading?.actions||[])openMessageActions.add(id);}else for(const more of log.querySelectorAll('.message-more[open]'))openMessageActions.add(more.closest('.message-actions').dataset.messageKey);
    if(!threadChanged)for(const source of log.querySelectorAll('.source-card,.source-group')){if(source.open)openSources.add(source.dataset.sourceKey);else openSources.delete(source.dataset.sourceKey);}
    const citationFocus=log.contains(focused)?focused.dataset.citationControl:null;
    const runFocus=log.contains(focused)?focused.dataset.runControl:null;
    log.replaceChildren();
    if (!value.messages?.length) { const empty=document.createElement('section');empty.className='empty';const heading=document.createElement('h2'),detail=document.createElement('p');heading.textContent=value.sourcePreview?.attached===false?t('How can I help?','Nasıl yardımcı olayım?'):value.videoContext?t('Your video, ready to work.','Videon hazır. Ne yapalım?'):value.pageContext?t('Read. Understand. Explore.','Oku. Anla. Keşfet.'):t('A closer look at your source.','Kaynağına birlikte bakalım.');detail.textContent=value.sourcePreview?.attached===false?t('Ask about the app or search your library. Open a video, book or title to explore its content.','Uygulama hakkında sor veya kütüphanende ara. İçeriğini incelemek için bir video, kitap veya yapım aç.'):value.videoContext?t('Translate existing captions or start Whisper. The selected video range is used; progress appears in this conversation.','Mevcut altyazıyı çevir veya Whisper başlat. Seçili video aralığı kullanılır; ilerleme bu sohbette gösterilir.'):value.pageContext?t('Summarize this page, ask about its claims, or translate it directly on the page.','Bu sayfayı özetle, iddialarını sor veya doğrudan sayfanın üzerinde çevir.'):value.transcriptScope?t('Ask about the dialogue, compare translations, or revisit a scene with subtitle evidence.','Konuşmayı sor, çevirileri karşılaştır veya altyazı kanıtlarıyla bir sahneye dön.'):t('Ask about the selected text or title. Only the supplied source is used.','Seçili metni veya yapımı sor. Yalnız sağlanan kaynak kullanılır.');empty.append(heading,detail);log.append(empty); }
    for (const [index,row] of (value.messages || []).entries()) {
      const node = document.createElement('div'); node.className = 'message ' + row.role; node._searchText=row.text;const role=document.createElement('span');role.className='message-role';role.textContent=row.role==='user'?t('YOU','SEN'):t('ASSISTANT','ASİSTAN');node.append(role);const runCard=window.AssistantRunCard?.create(row.steps,value.conversation+':'+row.id,value.locale);if(runCard)node.append(runCard);renderText(node,row.displayText??row.text,row.loading);if(row.loading)node.classList.add('loading');if(row.error)node.classList.add('failed');node.dataset.pinned=String(isPinned(row));
      const actionGroup=messageActions(row.id||'message-'+index,()=>action('copy',row.text)),actions=actionGroup.box,addAction=actionGroup.add;
      const pin=addAction(isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle'),()=>{if(isPinned(row))pins=pins.filter(p=>p.scope!==(value.pinScope||value.conversation)||p.text!==row.text);else pins=[...pins,{scope:value.pinScope||value.conversation,text:row.text}].slice(-100);try{localStorage.setItem('assistant-pins-v1',JSON.stringify(pins));}catch{}node.dataset.pinned=String(isPinned(row));pin.textContent=isPinned(row)?t('Unpin','Sabitlemeyi kaldır'):t('Pin','Sabitle');filter();});
      if(row.id&&!row.loading)addAction(t('Branch from here','Buradan dallandır'),()=>action('branch',row.id));
      if(row.role==='ai'&&row.id&&!row.loading&&row.status==='complete'){
        addAction(t('Save cited passages','Kaynaklı pasajları kaydet'),()=>action('save-dossier',row.id));
        addAction(t('Save cited timeline','Kaynaklı zaman çizelgesini kaydet'),()=>action('save-timeline',row.id));
        for(const ref of row.artifacts||[])addAction(t('Open saved output','Kayıtlı çıktıyı aç')+' · '+ref.title,()=>action('open-artifact',ref.artifactId));
      }
      if(row.status==='stopped'||row.status==='failed'){const status=document.createElement('small');status.className='answer-status';status.textContent=row.status==='stopped'?t('Stopped','Durduruldu'):t('Failed — see details above','Başarısız — ayrıntılar yukarıda');node.append(status);}
      if(row.role==='user')addAction(t('Edit as new question','Yeni soru olarak düzenle'),()=>{$('text').value=row.text;rememberDraft();$('text').focus();});
      const code=[...row.text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n\n');if(code)addAction(t('Copy code','Kodu kopyala'),()=>action('copy',code));
      if(!row.loading)node.append(actions);
      if (row.links?.length) {
        const sources = document.createElement('section'); sources.className = 'sources evidence';
        // Evidence strip: coverage at a glance as chips; the full explanation is one tap away instead of a wall of text.
        const count=usage=>row.links.filter(l=>l.usage===usage).length,cited=count('cited'),carried=count('carried'),found=count('found');
        const failedSteps=(row.steps||[]).filter(s=>['failed','blocked','unknown'].includes(s.state)).length;
        const head=document.createElement('header');head.className='evidence-head';
        const label=document.createElement('span');label.className='sources-label';label.textContent=t('Evidence','Dayanak')+' · '+row.links.length;
        const chips=document.createElement('span');chips.className='evidence-chips';
        const chip=(tone,text)=>{const c=document.createElement('span');c.className='evidence-chip';c.dataset.tone=tone;c.textContent=text;chips.append(c);};
        if(cited)chip('ok',t(cited+' cited',cited+' atıf'));
        if(carried)chip('ok',t(carried+' from an earlier search',carried+' önceki aramadan'));
        if(found)chip('muted',t(found+' found, not cited',found+' bulundu, atıfsız'));
        if(row.links.some(l=>l.more))chip('warn',t('more not read','daha fazlası okunmadı'));
        if(failedSteps)chip('bad',t(failedSteps+' check failed or unknown',failedSteps+' kontrol başarısız/bilinmiyor'));
        if(row.basis?.unverified)chip('bad',t(row.basis.unverified+' reference unverified',row.basis.unverified+' atıf doğrulanamadı'));
        head.append(label,chips);sources.append(head);
        if(cited||carried||found||row.basis?.unverified){
          const lines=[],parts=[];
          if(cited)parts.push(t(cited+' cited in the answer',cited+' yanıtta atıf yapıldı'));
          if(carried)parts.push(t(carried+' cited from an earlier search',carried+' önceki aramadan atıf'));
          if(found)parts.push(t(found+' found, not cited',found+' bulundu, atıf yok'));
          if(parts.length)lines.push(parts.join(' · '));
          if(row.links.some(l=>l.more))lines.push(t('The search shows a limited number of matches; more exist that were not read.','Arama sınırlı sayıda eşleşme gösteriyor; okunmayan daha fazlası var.'));
          if(failedSteps)lines.push(t(failedSteps+' tool check failed, was blocked or has an unknown result; those parts are not verified.',failedSteps+' araç kontrolü başarısız, engellendi veya sonucu bilinmiyor; bu kısımlar doğrulanmadı.'));
          if(row.basis?.unverified)lines.push(t(row.basis.unverified+' reference in the answer could not be verified and is not shown as a source.',row.basis.unverified+' atıf doğrulanamadı ve kaynak olarak gösterilmiyor.'));
          const more=document.createElement('details');more.className='evidence-more';const moreKey=String(row.id||index)+':coverage';more.dataset.sourceKey=moreKey;more.open=openSources.has(moreKey);
          const moreSummary=document.createElement('summary');moreSummary.dataset.citationControl=moreKey;moreSummary.textContent=t('What this covers','Neyi kapsıyor');more.append(moreSummary);
          const basis=document.createElement('p');basis.className='source-basis';basis.setAttribute('role','note');lines.forEach((line,i)=>{const part=document.createElement(i===0&&parts.length?'strong':'span');part.textContent=line;basis.append(part);});more.append(basis);
          more.addEventListener('toggle',()=>{if(!more.isConnected)return;if(more.open)openSources.add(moreKey);else openSources.delete(moreKey);});sources.append(more);
        }
        // When something is cited, found-but-uncited results sit in one disclosure so the evidence stays scannable.
        const groupKey=String(row.id||index)+':found-group',group=(cited||carried)&&found?document.createElement('details'):null;
        if(group){group.className='source-group';group.open=openSources.has(groupKey);group.dataset.sourceKey=groupKey;const groupSummary=document.createElement('summary');groupSummary.dataset.citationControl=groupKey;groupSummary.textContent=t('Found, not cited · '+found,'Bulundu, atıf yok · '+found);group.append(groupSummary);group.addEventListener('toggle',()=>{if(!group.isConnected)return;if(group.open)openSources.add(groupKey);else openSources.delete(groupKey);});}
        const usageText={cited:t('Cited','Atıf'),carried:t('Earlier search','Önceki arama'),found:t('Not cited','Atıfsız')};
        const stateText={opening:t('Opening…','Açılıyor…'),opened:t('Opened','Açıldı'),'read-only':t('Read-only','Salt okunur'),stale:t('Changed','Değişti'),unavailable:t('Unavailable','Yok'),unconfirmed:t('Unconfirmed','Doğrulanmadı'),cancelled:t('Cancelled','İptal')};
        for (const link of row.links) {
          const holder=group&&link.usage==='found'?group:sources;
          const button=document.createElement('button');button.textContent=link.label;button.dataset.citationId=link.id;button.dataset.citationControl=JSON.stringify([row.id||'message-'+index,link.id,'open']);button.onclick=()=>{if(link.research)window.AssistantFocusReturn?.mark('citation:'+button.dataset.citationControl);action('citation',link.id);};button.dataset.citeLabel=link.label;
          if(link.excerpt){
            const card=document.createElement('details'),summary=document.createElement('summary'),excerpt=document.createElement('p');
            const sourceKey=String(row.id||index)+':'+String(link.id)+':'+String(link.excerpt);card.className='source-card';card.open=openSources.has(sourceKey);card.dataset.sourceKey=sourceKey;card.dataset.citeLabel=link.label;summary.dataset.citationControl=sourceKey;
            // One scannable line: the marker used in the answer, what the source is, and its role/state.
            const marker=document.createElement('span');marker.className='cite-chip';marker.textContent=link.label;
            const title=document.createElement('span');title.className='source-title';title.textContent=link.title||'';if(link.title)title.title=link.title;
            if(link.action&&link.meta){const location=document.createElement('small');location.className='source-location';location.textContent=link.meta;title.append(location);}
            const tags=document.createElement('span');tags.className='source-tags';
            if(link.usage){const u=document.createElement('span');u.className='source-usage';u.dataset.usage=link.usage;u.textContent=usageText[link.usage];tags.append(u);}
            if(link.state){const s=document.createElement('span');s.className='source-state-chip';s.dataset.state=link.state;s.textContent=stateText[link.state];tags.append(s);}
            if(!link.usage&&!link.state){const hint=document.createElement('span');hint.className='source-excerpt-hint';hint.textContent=t('Read excerpt','Alıntıyı oku');tags.append(hint);}
            summary.append(marker,title,tags);card.dataset.usage=link.usage||'';card.dataset.state=link.state||'';card.setAttribute('aria-busy',String(link.state==='opening'));card.append(summary);
            if(link.meta||link.scope){const detail=document.createElement('small');detail.className='source-meta';detail.textContent=[link.action?null:link.meta,link.scope].filter(Boolean).join('\n');card.append(detail);}
            excerpt.textContent=link.excerpt;card.append(excerpt);
            if(link.translation){const translated=document.createElement('small');translated.textContent=link.translation;card.append(translated);}
            button.textContent=link.state==='opening'?t('Opening…','Açılıyor…'):['stale','unavailable'].includes(link.state)?t('Check again','Yeniden kontrol et'):link.action==='text'?t('Open text','Metni aç'):link.action==='seek'?t('Go to moment','Ana git'):t('Open source: ','Kaynağa git: ')+link.label;button.disabled=link.state==='opening';if(link.action)button.setAttribute('aria-label',button.textContent+': '+(link.title||link.label));
            if(link.note){const note=document.createElement('p');note.className='source-state';note.dataset.state=link.state;note.setAttribute('role','status');note.textContent=link.note;card.append(note);}
            const bar=document.createElement('div');bar.className='source-actions';bar.append(button);
            if(link.canSearchAgain&&['stale','unavailable','unconfirmed'].includes(link.state)){
              const search=document.createElement('button');search.className='source-search';search.textContent=t('Search saved text again','Kayıtlı metinlerde yeniden ara');search.onclick=()=>action('search-podcast-source',link.id);bar.append(search);
            }
            if(link.action){const noteButton=document.createElement('button');noteButton.className='source-note';noteButton.dataset.noteControl='open';noteButton.dataset.noteKey=link.id;noteButton.disabled=link.state==='opening';noteButton.textContent=t('Save as note…','Not olarak kaydet…');noteButton.setAttribute('aria-label',noteButton.textContent+': '+(link.title||link.label));noteButton.onclick=()=>{window.AssistantFocusReturn?.mark(link.id);action('note',link.id);};bar.append(noteButton);}
            card.append(bar);
            card.addEventListener('toggle',()=>{if(!card.isConnected)return;if(card.open)openSources.add(sourceKey);else openSources.delete(sourceKey);while(openSources.size>100)openSources.delete(openSources.keys().next().value);});holder.append(card);
          }else holder.append(button);
        }
        if(group)sources.append(group);
        node.append(sources);
        linkCitations(node,row,sources,t);
      }
      for(const proposed of row.actions||[]){
        const card=document.createElement('div');card.className='tool-card';card.dataset.proposalId=proposed.id;card.tabIndex=-1;
        const title=document.createElement('strong');title.textContent=proposed.kind==='app_action'?proposed.label||t('Application action','Uygulama işlemi'):t(({seek_to_time:'Jump to this scene',preview_translation_change:'Translation suggestion',open_voice_preparation:'Prepare voice'})[proposed.kind]||'Suggested action',({seek_to_time:'Bu sahneye git',preview_translation_change:'Çeviri önerisi',open_voice_preparation:'Sesi hazırla'})[proposed.kind]||'Önerilen işlem');
        const detail=document.createElement('p');detail.textContent=[proposed.excerpt,proposed.translation].filter(Boolean).join('\n→ ');
        const apply=document.createElement('button');
        apply.dataset.toolControl='apply';
        const running=proposed.live==='running';
        apply.textContent=running?t('Applying…','Uygulanıyor…'):proposed.kind==='preview_translation_change'?t('Copy suggestion','Öneriyi kopyala'):t('Apply','Uygula');
        apply.disabled=busy||running;
        apply.onclick=()=>openReview({action:'apply-tool',id:proposed.id},title.textContent+'\n'+detail.textContent+'\n'+(proposed.kind==='app_action'?t('Runs this application action on the attached source using your current settings.','Bu uygulama işlemini bağlı kaynakta mevcut ayarlarınla çalıştırır.'):t('Runs only this action. No file is modified and no voice is generated.','Yalnız bu işlem uygulanır. Dosya değişmez ve ses üretimi başlamaz.')),apply);
        const statusKey=running?'running':proposed.refreshable&&proposed.resultStatus==='failed'?'changed':proposed.resultStatus||'pending',badge=document.createElement('small');card.dataset.status=running?'running':proposed.resultStatus||'pending';badge.className='tool-status';badge.textContent=t(({pending:'Waiting for your approval',changed:'Source or settings changed',accepted:'Accepted',completed:'Applied',failed:'Failed',stopped:'Stopped',unknown:'Result unknown — not re-applied',running:'Applying now'})[statusKey]||'Finished',({pending:'Onayını bekliyor',changed:'Kaynak veya ayarlar değişti',accepted:'Kabul edildi',completed:'Uygulandı',failed:'Başarısız',stopped:'Durduruldu',unknown:'Sonuç bilinmiyor — yeniden uygulanmadı',running:'Uygulanıyor'})[statusKey]||'Bitti');
        const head=document.createElement('header');head.className='tool-head';head.append(badge,title);card.dataset.settled=proposed.resultStatus&&!running?'1':'';if(!card.dataset.settled)delete card.dataset.settled;card.append(head,detail);
        // Only a card that has not run offers Apply; a settled card shows its real result instead of a dead button.
        if(!proposed.resultStatus)card.append(apply);
        if(proposed.refreshable&&proposed.resultStatus==='failed'){
          const refresh=document.createElement('button');refresh.dataset.toolControl='refresh';refresh.className='flow-continue';
          refresh.textContent=t('Refresh from current settings','Güncel ayarlarla yenile');refresh.disabled=busy;
          refresh.title=t('Creates a new proposal for review. Does not apply settings.','İncelemek için yeni bir öneri hazırlar. Ayarları uygulamaz.');
          refresh.onclick=()=>action('refresh-tool',proposed.id);card.append(refresh);
        }
        if(proposed.canContinue){const next=document.createElement('button');next.dataset.toolControl='continue';next.className='flow-continue';next.textContent=proposed.waiting?t('Waiting for this job…','İşin bitmesi bekleniyor…'):proposed.retryable?t('Review stage retry','Adımı yeniden denemeyi incele'):proposed.partial?t('Review partial result','Kısmi sonucu incele'):t('Continue with result','Sonuçla devam et');next.disabled=busy||proposed.waiting;next.onclick=()=>action('continue-tool',proposed.id);card.append(next);}

        if(proposed.flowNote){const note=document.createElement('p');note.className='action-receipt';note.setAttribute('role','status');note.textContent=proposed.flowNote;card.append(note);}
        if(proposed.resultText){const receipt=document.createElement('p');receipt.className='action-receipt';receipt.setAttribute('role','status');receipt.textContent=proposed.resultText;card.append(receipt);}
        if(proposed.activity&&['unknown','accepted'].includes(proposed.resultStatus)){const check=document.createElement('button');check.dataset.toolControl='activity';check.className='flow-continue';check.textContent=t('Open Activity','İşlemleri aç');check.title=t('Shows the real state of running and finished jobs.','Çalışan ve biten işlerin gerçek durumunu gösterir.');check.onclick=()=>action('open-activity');card.append(check);}
        node.append(card);
      }
      log.append(node);
    }
    filter();
    window.AssistantFocusReturn?.restore();
    if(focusTarget){const card=[...log.querySelectorAll('.tool-card')].find(n=>n.dataset.proposalId===focusTarget.id);if(card&&!card.closest('[hidden]')){const button=[...card.querySelectorAll('button')].find(n=>n.dataset.toolControl===focusTarget.control&&!n.disabled);(button||card).focus({preventScroll:true});}}
    if(messageFocus&&!threadChanged){const group=[...log.querySelectorAll('.message-actions')].find(n=>n.dataset.messageKey===messageFocus.key);if(group&&!group.closest('[hidden]')){const target=[...group.querySelectorAll('[data-message-control]')].find(n=>n.dataset.messageControl===messageFocus.control),more=target?.closest('details');(more&&!more.open?more.querySelector('summary'):target)?.focus({preventScroll:true});}}
    if(runFocus&&!threadChanged)[...log.querySelectorAll('[data-run-control]')].find(n=>n.dataset.runControl===runFocus)?.focus({preventScroll:true});
    if(citationFocus&&!threadChanged)[...log.querySelectorAll('[data-citation-control]')].find(n=>n.dataset.citationControl===citationFocus)?.focus({preventScroll:true});
    if (bottom) log.scrollTop = log.scrollHeight;else log.scrollTop=previousScroll;
    $('latest').hidden=bottom||!value.messages?.length;
  });
  $('threads').onchange=()=>action('select-thread',$('threads').value);
  $('newThread').onclick=()=>action('new-thread');
  $('threadSettings').onclick=()=>{$('threadEditor').hidden=!$('threadEditor').hidden;$('threadSettings').setAttribute('aria-expanded',String(!$('threadEditor').hidden));};
  $('renameThread').onclick=()=>action('rename-thread',$('threadName').value);
  $('deleteThread').onclick=()=>openReview({action:'delete-thread'},snapshot.locale==='tr'?'Bu sohbet kalıcı olarak silinecek. Diğer sohbetler ve sabitlenen notlar korunur.':'This conversation will be permanently deleted. Other chats and pinned notes are kept.',$('deleteThread'));
  document.addEventListener('click',event=>{if(!$('conversationMenu').contains(event.target))$('conversationMenu').open=false;for(const more of $('log').querySelectorAll('.message-more[open]'))if(!more.contains(event.target)){more.open=false;openMessageActions.delete(more.closest('.message-actions').dataset.messageKey);}});
  action('ready');
})();
