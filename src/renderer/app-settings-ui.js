(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  let dialog,active='ai',borrowed=[],opener,viewGeneration=0,editGeneration=0,modelsGeneration=0;
  let searchQuery = '';
  const detailState=new Map();
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn)=>{const n=el('button','mh-action',text);n.type='button';n.onclick=fn;return n;};
  function restore(){for(const {node,marker}of borrowed){if(marker.parentNode)marker.replaceWith(node);}borrowed=[];}
  function mask(){for(const id of ['translateApiKey','mangaApiKey','llmApiKey','tmdbApiKey','assistantApiKey']){const input=document.getElementById(id);if(input)input.type='password';const toggle=document.querySelector(`[data-secret-target="${id}"]`);if(toggle){toggle.setAttribute('aria-pressed','false');const label=(toggle.getAttribute('aria-label')||'').replace(/ gizle$/i,' göster').replace(/^Hide /i,'Show ');toggle.setAttribute('aria-label',label);toggle.title=label;}}}
  function localizeField(node) {
    const translate = value => window.UiLocale?.t?.(value) ?? value;
    // Only authored labels/attributes/options: never input values, model IDs or keys.
    for (const label of [...(node.matches('.field-label,label') ? [node] : []), ...node.querySelectorAll('.field-label,label')]) {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (!text.parentElement.closest('input,textarea,select,[data-ui-untranslated]')) text.nodeValue = translate(text.nodeValue);
      }
    }
    for (const item of [node, ...node.querySelectorAll('[aria-label],[title],[placeholder]')]) {
      for (const name of ['aria-label','title','placeholder']) if (item.hasAttribute(name)) item.setAttribute(name,translate(item.getAttribute(name)));
    }
    for (const select of node.querySelectorAll('select')) {
      if (['uiTheme','uiLocale'].includes(select.id) || /EndpointPreset$/.test(select.id)) {
        for (const option of select.options) option.textContent = translate(option.textContent);
      }
    }
  }
  function fields(parent,ids){
    const grid=el('div','settings-grid');parent.append(grid);const moved=new Set();
    for(const id of ids){const control=document.getElementById(id),node=control?.closest('.field')||control?.closest('label');if(!node||moved.has(node))continue;moved.add(node);localizeField(node);const marker=document.createComment('settings-home:'+id);node.before(marker);borrowed.push({node,marker});grid.append(node);}
  }
  function section(parent,title,copy,ids){const box=el('section','aps-section');box.append(el('h2','',title),el('p','aps-copy',copy));if(ids)fields(box,ids);parent.append(box);return box;}
  function advanced(parent,key,title,copy,open=false){
    const detail=el('details','aps-advanced');detail.dataset.settingsDetail=key;
    detail.open=detailState.has(key)?detailState.get(key):open;
    const heading=el('summary'),text=el('span');text.append(el('strong','',title),el('small','',copy));heading.append(text);detail.append(heading);
    const body=el('div','aps-advanced-body');detail.append(body);parent.append(detail);
    detail.addEventListener('toggle',()=>detailState.set(key,detail.open));
    return {detail,body};
  }
  function cleanup(current){if(dialog!==current){current.remove();return;}viewGeneration++;modelsGeneration++;mask();restore();current.remove();dialog=null;void syncBrowserOcclusion();const target=opener?.isConnected?opener:document.getElementById('mhSettings');target?.focus({preventScroll:true});}
  function close(){const current=dialog;if(!current)return;current.close();cleanup(current);}
  function openStudioSection(id){close();window.MediaHomeUI?.openStudio();const control=document.getElementById(id);if(control){for(let node=control.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;control.scrollIntoView({block:'center'});control.focus({preventScroll:true});}}
  function providerSnapshot(){const prefix=active==='manga'?'manga':active==='cleanup'?'llm':'translate';return {prefix,preset:$(prefix+'EndpointPreset')?.value||'',url:$(prefix+'BaseUrl')?.value.trim()||'',key:$(prefix+'ApiKey')?.value.trim()||'',model:$(prefix+'Model')?.value.trim()||''};}
  function summary(parent){
    const node=el('div','aps-provider-summary');node.id='appProviderSummary';node.setAttribute('aria-live','polite');parent.prepend(node);updateSummary();
  }
  function updateSummary(){
    const node=$('appProviderSummary');if(!node)return;node.replaceChildren();const config=providerSnapshot();
    let endpoint=config.preset==='custom'?config.url:config.preset,url;try{url=new URL(endpoint);}catch{}
    const inherited=config.preset==='inherit';
    const name=$(config.prefix+'EndpointPreset')?.selectedOptions[0]?.textContent||t('Provider','Sağlayıcı');
    const line=el('div');line.append(el('strong','',active==='ai'?t('Subtitle provider · ','Altyazı sağlayıcısı · ')+name:name),el('small','',inherited?t('Uses the shared subtitle provider','Ortak altyazı sağlayıcısını kullanır'):[config.model||t('No model selected','Model seçilmedi'),url?.hostname||t('URL required','URL gerekli')].join(' · ')));node.append(line);
    const local=url&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);const ready=inherited||!!(url&&!url.username&&!url.password&&!url.search&&!url.hash&&(url.protocol==='https:'||url.protocol==='http:'&&local)&&config.model&&(config.key||local));
    node.append(el('span','aps-setup-state',inherited?t('Shared settings · not tested here','Ortak ayar · burada test edilmedi'):ready?t('Configured · test separately','Yapılandırılmış · ayrıca test et'):t('Setup incomplete','Kurulum eksik')));
    const hint=$('appEndpointHint');if(hint){hint.replaceChildren();if(config.preset==='custom'&&url){
      if(url.username||url.password||url.search||url.hash)hint.textContent=t('Use a base URL without credentials, query parameters or fragments.','Kimlik bilgisi, sorgu parametresi veya parça içermeyen bir base URL kullan.');
      else if(/\/(chat\/completions|models)\/?$/i.test(url.pathname)){const info=el('span','',t('This looks like a request URL. Use the API base path instead.','Bu bir istek adresine benziyor. Bunun yerine API kök yolunu kullan.'));const fix=button(t('Use base URL','Base URL kullan'),()=>{const current=providerSnapshot();if(current.prefix!==config.prefix||current.url!==config.url)return;const clean=new URL(config.url);clean.pathname=clean.pathname.replace(/\/(chat\/completions|models)\/?$/i,'');$(config.prefix+'BaseUrl').value=clean.href.replace(/\/$/,'');$(config.prefix+'BaseUrl').dispatchEvent(new Event('change',{bubbles:true}));});hint.append(info,fix);}
    }}
  }
  function keyTools(parent){
    const config=providerSnapshot(),row=el('div','aps-key-actions'),remove=button(t('Remove this provider’s key','Bu sağlayıcının anahtarını kaldır'),()=>{
      const expected=providerSnapshot(),review=el('div','aps-key-review');review.setAttribute('role','group');review.append(el('p','aps-copy',t('Remove the key for the currently selected provider? Other providers are kept.','Seçili sağlayıcının anahtarı kaldırılsın mı? Diğer sağlayıcılar korunur.')));
      review.append(button(t('Keep key','Anahtarı tut'),()=>review.remove()),button(t('Remove key','Anahtarı kaldır'),()=>{const current=providerSnapshot();if(current.prefix!==expected.prefix||current.preset!==expected.preset||current.url!==expected.url||current.key!==expected.key){review.remove();return;}const input=$(config.prefix+'ApiKey');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));review.remove();remove.disabled=true;}));row.querySelector('.aps-key-review')?.remove();row.append(review);
    });remove.id='appRemoveKey';remove.disabled=!config.key;remove.title=config.key?'':t('There is no saved key for this provider.','Bu sağlayıcı için kayıtlı anahtar yok.');const keyHint=el('p','aps-copy');keyHint.id='appRemoveKeyHint';keyHint.textContent=remove.title;keyHint.hidden=!!config.key;remove.setAttribute('aria-describedby',keyHint.id);row.append(remove);parent.append(row,keyHint);
    const hint=el('div','aps-endpoint-hint');hint.id='appEndpointHint';hint.setAttribute('role','status');parent.append(hint);updateSummary();
  }
  function modelBrowser(parent){
    const box=el('section','aps-model-browser');box.append(el('h3','',t('Available models','Sağlayıcıdaki modeller')),el('p','aps-copy',t('Fetch IDs from this provider. Listing a model does not verify chat, vision or tool support. Manual model entry stays available.','Model kimliklerini bu sağlayıcıdan getir. Listede görünmesi sohbet, görsel veya araç desteğini doğrulamaz. Elle model girişi kullanılabilir.')));
    const fetchButton=button(t('Fetch models','Modelleri getir'),async()=>{
      const config=providerSnapshot(),ticket=++modelsGeneration,view=viewGeneration;fetchButton.disabled=true;status.textContent=t('Fetching model list…','Model listesi alınıyor…');
      try{const result=await window.api.listTranslationProviderModels({endpointPreset:config.preset,customBaseUrl:config.url,apiKey:config.key});
        if(ticket!==modelsGeneration||view!==viewGeneration||!dialog?.open)return;
        if(!result?.ok){status.textContent=t('Could not load models. Manual entry is available. ','Modeller alınamadı. Elle giriş yapabilirsin. ')+translationProbeMessage(result);return;}
        ids=Array.isArray(result.models)?result.models:[];filter.disabled=!ids.length;select.disabled=!ids.length;filter.value='';render();status.textContent=ids.length?t(`${ids.length} models received${result.limited?' (limited list)':''}. Select one to use it.`,`${ids.length} model alındı${result.limited?' (sınırlı liste)':''}. Kullanmak için birini seç.`):t('The provider returned no model IDs. Enter the model manually.','Sağlayıcı model kimliği döndürmedi. Modeli elle yaz.');
      }catch{if(ticket===modelsGeneration&&view===viewGeneration)status.textContent=t('Could not load models. Enter the model manually.','Modeller alınamadı. Modeli elle yaz.');}
      finally{if(fetchButton.isConnected)fetchButton.disabled=false;}
    });fetchButton.id='appFetchModels';const status=el('p','aps-copy');status.id='appModelListStatus';status.setAttribute('role','status');status.textContent=t('Fetch the model list to enable filtering and selection. You can also enter a model manually.','Filtreleme ve seçim için model listesini getir. Modeli elle de girebilirsin.');let ids=[];
    const filter=el('input');filter.type='search';filter.id='appModelFilter';filter.placeholder=t('Filter model IDs','Model kimliklerinde ara');filter.setAttribute('aria-label',filter.placeholder);filter.disabled=true;filter.setAttribute('aria-describedby',status.id);
    const select=el('select');select.id='appRemoteModels';select.setAttribute('aria-label',t('Models returned by this provider','Sağlayıcının döndürdüğü modeller'));select.disabled=true;select.setAttribute('aria-describedby',status.id);
    const render=()=>{const matches=ids.filter(id=>id.toLowerCase().includes(filter.value.toLowerCase()));select.replaceChildren(el('option','',t('Choose a model…','Model seç…')));select.options[0].value='';for(const id of matches){const option=el('option','',id);option.value=id;select.append(option);}};
    render();filter.oninput=render;select.onchange=()=>{if(!select.value)return;const input=$('translateModel');input.value=select.value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};box.append(fetchButton,status,filter,select);parent.append(box);
  }
  function changed(event){
    if(!dialog?.contains(event.target)||event.target.closest('.aps-model-browser,.aps-nav,.aps-key-review')||!event.target.id)return;
    if(event.target.id==='assistantEndpointPreset'&&event.target.value!=='inherit'){const detail=dialog.querySelector('[data-settings-detail=assistant]');if(detail)detail.open=true;}
    editGeneration++;const status=$('appSettingsStatus');if(status){status.textContent=t('Settings changed. Use Save to confirm the storage result.','Ayarlar değişti. Kayıt sonucunu doğrulamak için Kaydet’i kullan.');status.classList.remove('aps-error');}
    updateSummary();const remove=$('appRemoveKey');if(remove){remove.disabled=!providerSnapshot().key;remove.title=remove.disabled?t('There is no saved key for this provider.','Bu sağlayıcı için kayıtlı anahtar yok.'):'';const hint=$('appRemoveKeyHint');if(hint){hint.hidden=!remove.disabled;hint.textContent=remove.title;}}
    if(/(?:EndpointPreset|BaseUrl|ApiKey)$/.test(event.target.id)){modelsGeneration++;for(const id of ['appModelFilter','appRemoteModels'])if($(id))$(id).disabled=true;if($('appRemoteModels')){$('appRemoteModels').replaceChildren(el('option','',t('Fetch again for this provider','Bu sağlayıcı için yeniden getir')));}const status=$('appModelListStatus');if(status)status.textContent=t('Provider details changed. Fetch the model list again.','Sağlayıcı bilgileri değişti. Model listesini yeniden getir.');}
  }
  function settingSearchText(category) {
    const prefixes = { ai: ['assistant','translate'], manga: ['manga'], metadata: ['tmdb'], cleanup: ['llm'], general: ['uiTheme','uiLocale','voice'] }[category] || [];
    return [...document.querySelectorAll('input[id],select[id]')].filter(control => prefixes.some(prefix => control.id.startsWith(prefix)))
      .map(control => [control.closest('.field')?.textContent || '', control.getAttribute('aria-label') || '', control.getAttribute('placeholder') || ''].join(' ')).join(' ');
  }
  const searchFold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
  function draw(){
    if(!dialog)return;for(const detail of dialog.querySelectorAll('[data-settings-detail]'))detailState.set(detail.dataset.settingsDetail,detail.open);const focused=dialog.contains(document.activeElement)?document.activeElement:null;const focusId=focused?.id;const focusSection=focused?.dataset.appSettings;searchQuery=$('appSettingsSearch')?.value ?? searchQuery;viewGeneration++;modelsGeneration++;restore();dialog.replaceChildren();dialog.setAttribute('aria-label',t('Settings','Ayarlar'));
    const header=el('header','aps-header'),copy=el('div');copy.append(el('h1','',t('Settings','Ayarlar')),el('p','aps-copy',t('Your providers, your models, one workspace.','Sağlayıcıların, modellerin, tek çalışma alanı.')));const exit=button('×',close);exit.id='appSettingsClose';exit.setAttribute('aria-label',t('Close settings','Ayarları kapat'));header.append(copy,exit);dialog.append(header);
    const layout=el('div','aps-layout'),nav=el('nav','aps-nav');nav.setAttribute('aria-label',t('Settings sections','Ayar bölümleri'));layout.append(nav);dialog.append(layout);
    const find=el('input');find.type='search';find.id='appSettingsSearch';find.value=searchQuery;find.placeholder=t('Find a setting','Ayar ara');find.setAttribute('aria-label',find.placeholder);nav.append(find);
    const compactNav=el('select','aps-category-select');compactNav.id='appSettingsSection';compactNav.setAttribute('aria-label',t('Settings sections','Ayar bölümleri'));nav.append(compactNav);
    for(const [id,en,tr,terms]of [['ai','Assistant & translation','Asistan ve çeviri','api openai provider model çeviri asistan anahtar'],['manga','Image translation','Görsel çeviri','manga image görsel'],['metadata','Film info & posters','Film bilgileri ve afişler','tmdb poster afiş resim metadata film'],['cleanup','Text cleanup','Metin düzeltme','llm cleanup düzeltme'],['general','Appearance & tools','Görünüm ve araçlar','theme tema dil language voice ses whisper backup yedek']]){const item=button(t(en,tr),()=>{mask();active=id;draw();(matchMedia('(max-width:800px)').matches?$('appSettingsSection'):dialog.querySelector(`[data-app-settings="${id}"]`))?.focus();});item.dataset.appSettings=id;item.dataset.search=(en+' '+tr+' '+terms).toLocaleLowerCase();item.setAttribute('aria-current',active===id?'page':'false');nav.append(item);const option=el('option','',t(en,tr));option.value=id;compactNav.append(option);}
    compactNav.value=active;compactNav.onchange=()=>nav.querySelector(`[data-app-settings="${compactNav.value}"]`)?.click();
    const searchStatus=el('p','aps-copy');searchStatus.id='appSettingsSearchStatus';searchStatus.setAttribute('role','status');searchStatus.setAttribute('aria-live','polite');searchStatus.hidden=true;nav.insertBefore(searchStatus,compactNav);
    const noMatches=el('p','aps-copy');noMatches.id='appSettingsNoMatches';noMatches.classList.add('hidden');nav.append(noMatches);
    find.oninput=()=>{
      const query=searchFold(find.value).trim();let count=0;
      nav.dataset.searching=String(!!query);
      for(const n of nav.querySelectorAll('[data-app-settings]')){const match=searchFold(n.dataset.search).includes(query);n.classList.toggle('hidden',!match);if(match)count++;const option=[...compactNav.options].find(o=>o.value===n.dataset.appSettings);if(option)option.disabled=!match;}
      noMatches.classList.toggle('hidden',count>0);noMatches.textContent=t('No matching section. Try provider, language or posters.','Eşleşen bölüm yok. Sağlayıcı, dil veya afiş aramayı dene.');
      searchStatus.hidden=!query||!count;searchStatus.textContent=t(count+' matching sections · choose one below',count+' eşleşen bölüm · aşağıdan seç');
    };
    find.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();nav.querySelector('[data-app-settings]:not(.hidden)')?.click();}};
    const main=el('main','aps-content');layout.append(main);
    if(active==='ai'){
      $('assistantFlex').closest('.field').querySelector('.field-label').textContent=t('DeepInfra service tier','DeepInfra hizmet katmanı');$('assistantFlexLabel').textContent=t('Flex — lower cost, potentially longer wait','Flex — daha düşük maliyet, daha uzun bekleyebilir');
      for(const [id,en,tr]of [['assistantEndpointPreset','Assistant provider','Asistan sağlayıcısı'],['assistantModel','Assistant model','Asistan modeli']])$(id).closest('.field').querySelector('.field-label').textContent=t(en,tr);
      $('assistantEndpointPreset').options[0].textContent=t('Use subtitle provider','Altyazı sağlayıcısını kullan');
      const assistant=section(main,t('Assistant provider','Asistan sağlayıcısı'),t('Share the subtitle provider, or choose a separate assistant provider.','Altyazı sağlayıcısını paylaş veya asistan için ayrı bir sağlayıcı seç.'),['assistantEndpointPreset']);
      const separate=advanced(assistant,'assistant',t('Separate assistant settings','Ayrı asistan ayarları'),t('Model, API key and service tier','Model, API anahtarı ve hizmet katmanı'),$('assistantEndpointPreset').value!=='inherit');
      separate.body.append(el('p','aps-copy',t('These controls apply to a separate assistant provider. Flex can lower cost with a longer wait; turn it off for standard requests.','Bu ayarlar ayrı asistan sağlayıcısına uygulanır. Flex daha düşük maliyetle daha uzun bekletebilir; standart istek için kapat.')));fields(separate.body,['assistantModel','assistantApiKey','assistantFlex']);
      section(main,t('Subtitle translation','Altyazı çevirisi'),t('Choose the provider, model and language for subtitles. The assistant shares this only when selected above.','Altyazılar için sağlayıcı, model ve dili seç. Asistan yalnız yukarıda paylaşım seçiliyse bunları kullanır.'),['translateEndpointPreset','translateModel','translateApiKey','translateBaseUrl','translateTo']);
      summary(main);
      const tools=advanced(main,'translation-tools',t('Advanced provider tools','Gelişmiş sağlayıcı araçları'),t('Available models, connection test and key management','Model listesi, bağlantı testi ve anahtar yönetimi'));
      modelBrowser(tools.body);fields(tools.body,['translateSavedModel','translateProbeBtn']);keyTools(tools.body);
      if(searchQuery)for(const detail of main.querySelectorAll('[data-settings-detail]'))if(searchFold(detail.textContent).includes(searchFold(searchQuery).trim()))detail.open=true;
    }
    if(active==='manga')section(main,t('Image & manga translation','Görsel ve manga çevirisi'),t('Use the shared provider or choose a separate image-capable model.','Ortak sağlayıcıyı kullanabilir veya görsel destekleyen ayrı bir model seçebilirsin.'),['mangaEndpointPreset','mangaModel','mangaApiKey','mangaBaseUrl']);
    if(active==='cleanup')section(main,t('Transcription text cleanup','Transkripsiyon metin düzeltme'),t('Optional cleanup uses its own provider. This does not replace the assistant provider above.','İsteğe bağlı metin düzeltme ayrı sağlayıcı kullanır. Asistanın yukarıdaki sağlayıcısını değiştirmez.'),['llmPostprocess','llmEndpointPreset','llmModel','llmApiKey','llmBaseUrl']);
    if(active==='manga'||active==='cleanup'){summary(main);keyTools(main);}
    if(active==='metadata'){
      section(main,t('Film information & artwork','Film bilgileri ve afişler'),t('TMDB supplies matched titles, summaries, cast, seasons and posters. Save your Read Access Token or v3 API Key here. This is separate from your AI key.','TMDB eşleşen yapım, konu, oyuncu, sezon ve afiş bilgilerini sağlar. Read Access Token veya v3 API Key anahtarını buraya kaydet. AI anahtarından ayrıdır.'),['tmdbApiKey','tmdbLanguage','tmdbWatchRegion']);
      const link=button(t('Get a TMDB API credential','TMDB API anahtarı al'),()=>window.api.openExternal('https://www.themoviedb.org/settings/api'));main.append(link);const languageLabel=$('tmdbLanguage')?.closest('.field')?.querySelector('.field-label');if(languageLabel)languageLabel.textContent=t('Information language','Bilgi dili');const countryLabel=$('tmdbWatchRegion')?.closest('.field')?.querySelector('.field-label');if(countryLabel)countryLabel.textContent=t('Where to watch · country','Nerede izlenir · ülke');const countrySelect=$('tmdbWatchRegion');if(countrySelect){const names=new Intl.DisplayNames([window.UiLocale?.get?.()==='tr'?'tr':'en'],{type:'region'});for(const option of countrySelect.options)option.textContent=names.of(option.value)+' · '+option.value;}main.append(el('p','aps-copy',t('Watch availability follows this country, independently of the interface and information language.','İzleme bilgileri, arayüz ve bilgi dilinden bağımsız olarak bu ülkeyi kullanır.')));
      const missing=section(main,t('Complete missing posters','Eksik afişleri tamamla'),t('After saving your key, posters and information update automatically in the background. Titles without IDs require an exact title and, when available, year match. Review ambiguous titles below. Your ratings and progress are kept.','Anahtarını kaydedince afiş ve bilgiler arka planda otomatik güncellenir. Kimliği olmayan yapımlar için başlık ve varsa yıl birebir eşleşmelidir. Belirsiz eşleşmeleri aşağıdan seç. Puanların ve ilerlemen korunur.'));
      const job=el('div','mh-metadata');missing.append(job);window.MetadataArtworkUI?.draw(job);const updateJob=()=>{if(!job.isConnected){document.removeEventListener('metadata-job-change',updateJob);return;}window.MetadataArtworkUI?.draw(job);};document.addEventListener('metadata-job-change',updateJob);missing.append(button(t('Retry missing information','Eksik bilgileri yeniden dene'),async()=>{if(await saveAppSettings())await window.MetadataArtworkUI?.start();}));
      const filter=el('input');filter.type='search';filter.placeholder=t('Filter library titles','Kütüphane yapımlarında ara');filter.setAttribute('aria-label',filter.placeholder);missing.append(filter);
      const list=el('div','aps-metadata-list');missing.append(list);const view=viewGeneration;
      void window.api.mediaCatalog({action:'list'}).then(result=>{if(view!==viewGeneration||!dialog?.open)return;let items=(result?.items||[]).filter(row=>!row.hasPoster);
        const render=()=>{list.replaceChildren();const rows=items.filter(row=>String(row.title||'').toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()));for(const row of rows.slice(0,30)){const item=el('div','aps-metadata-row');item.append(el('span','',row.title+(row.year?' · '+row.year:'')),button(t('Match','Eşleştir'),()=>{close();void window.MediaCatalogUI.openMetadata(row.id);}));list.append(item);}if(!rows.length)list.append(el('p','aps-copy',t('No missing posters in this selection.','Bu seçimde eksik afiş yok.')));else if(rows.length>30)list.append(el('p','aps-copy',t('Showing 30 titles. Filter to narrow the list.','İlk 30 yapım gösteriliyor. Listeyi aramayla daralt.')));};filter.oninput=render;render();const update=()=>{if(!list.isConnected||view!==viewGeneration){document.removeEventListener('metadata-job-change',update);return;}void window.api.mediaCatalog({action:'list'}).then(result=>{if(list.isConnected&&result?.ok){items=result.items.filter(row=>!row.hasPoster);render();}});};document.addEventListener('metadata-job-change',update);}).catch(()=>{if(list.isConnected)list.textContent=t('Could not load the library.','Kütüphane yüklenemedi.');});
      main.append(el('p','aps-copy','This product uses the TMDB API but is not endorsed or certified by TMDB.'));
    }
    if(active==='general'){
      const appearance=section(main,t('Appearance','Görünüm'),t('Use the existing application theme and language settings.','Uygulamanın mevcut tema ve dil ayarlarını kullan.'),['uiTheme','uiLocale']);const localeLabel=el('label','aps-language-label',t('Interface language','Arayüz dili'));localeLabel.htmlFor='uiLocale';const language=appearance.querySelector('.ui-locale-control');if(language){const field=el('div','aps-language-field');language.before(field);field.append(localeLabel,language);}
      const tools=section(main,t('Whisper, voice & workspace','Whisper, ses ve çalışma alanı'),t('Open the existing detailed tools with your current settings intact.','Mevcut ayrıntılı araçları, ayarların korunarak aç.'));
      const actions=el('div','aps-shortcuts');tools.append(actions);
      actions.append(button(t('Whisper settings','Whisper ayarları'),()=>openStudioSection('model')),button(t('Translation options','Çeviri seçenekleri'),()=>openStudioSection('translate')),button(t('Voice studio','Ses stüdyosu'),()=>{close();document.getElementById('dubMainOpen')?.click();}),button(t('Backup & workspace','Yedekleme ve çalışma alanı'),()=>{close();window.MediaToolsUI?.open('backup');}));
    }
    for (const item of nav.querySelectorAll('[data-app-settings]')) item.dataset.search += ' ' + settingSearchText(item.dataset.appSettings).toLocaleLowerCase();
    const footer=el('footer','aps-footer'),status=el('p','aps-copy');status.id='appSettingsStatus';status.setAttribute('role','status');status.textContent=t('These are the existing settings. Changes use the same secure credential storage.','Bunlar mevcut ayarların. Değişiklikler aynı güvenli anahtar deposunu kullanır.');
    const save=button(t('Save settings','Ayarları kaydet'),async()=>{const edit=editGeneration,view=viewGeneration;save.disabled=true;status.textContent=t('Saving securely…','Güvenli kaydediliyor…');try{const ok=await saveAppSettings();if(!dialog?.open||view!==viewGeneration||edit!==editGeneration)return;status.textContent=ok?t('Settings saved.','Ayarlar kaydedildi.'):t('Could not save securely. Check the application log.','Güvenli kayıt yapılamadı. Uygulama günlüğünü kontrol et.');status.classList.toggle('aps-error',!ok);}catch{if(view===viewGeneration&&edit===editGeneration){status.textContent=t('Could not save settings.','Ayarlar kaydedilemedi.');status.classList.add('aps-error');}}finally{save.disabled=false;}});save.id='appSettingsSave';save.classList.add('mh-primary');footer.append(status,save);dialog.append(footer);find.oninput();if(dialog.open){const target=focused?.isConnected?focused:focusId?$(focusId):focusSection?dialog.querySelector(`[data-app-settings="${focusSection}"]`):null;if(target&&dialog.contains(target))target.focus({preventScroll:true});window.UiMotion?.reveal(main,'section');}
  }
  async function open(page='ai',{preserveAssistantContext=false}={}){
    await initialSettingsReady;
    const target=['ai','manga','metadata','cleanup','general'].includes(page)?page:'ai';
    if(dialog?.open){if(active!==target){mask();active=target;draw();}dialog.focus();dialog.querySelector('[aria-current="page"]')?.focus();return;}if(dialog)cleanup(dialog);
    active=target;opener=document.activeElement;
    const current=el('dialog','aps-dialog media-surface');current.id='appSettingsDialog';current.dataset.uiUntranslated='';dialog=current;
    current.addEventListener('close',()=>cleanup(current));
    current.addEventListener('input',changed);current.addEventListener('change',changed);
    document.body.append(current);try{draw();current.showModal();if(!preserveAssistantContext)window.MediaExperience?.setContext(current,{id:'application-settings',type:'media-tool',title:t('Application settings','Uygulama ayarları'),note:'Credential input values are private and are not assistant context.'});void syncBrowserOcclusion();current.querySelector('[aria-current="page"]')?.focus();}catch(error){restore();current.remove();dialog=null;throw error;}
  }
  document.addEventListener('ui-locale-change',()=>{if(dialog?.open)draw();});
  window.AppSettingsUI=Object.freeze({open,close});
  const railButton=$('sideAppSettings');
  function railLabel(){if(railButton)railButton.title=railButton.ariaLabel=t('Application settings','Uygulama ayarları');}
  railButton?.addEventListener('click',()=>{void open().catch(error=>logLine(error.message,'error'));});
  document.addEventListener('ui-locale-change',railLabel);railLabel();
})();
