(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  let dialog,active='ai',borrowed=[],opener;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn)=>{const n=el('button','mh-action',text);n.type='button';n.onclick=fn;return n;};
  function restore(){for(const {node,marker}of borrowed){if(marker.parentNode)marker.replaceWith(node);}borrowed=[];}
  function mask(){for(const id of ['translateApiKey','mangaApiKey','llmApiKey']){const input=document.getElementById(id);if(input)input.type='password';const toggle=document.querySelector(`[data-secret-target="${id}"]`);if(toggle){toggle.setAttribute('aria-pressed','false');const label=(toggle.getAttribute('aria-label')||'').replace(/ gizle$/i,' göster').replace(/^Hide /i,'Show ');toggle.setAttribute('aria-label',label);toggle.title=label;}}}
  function fields(parent,ids){
    const grid=el('div','settings-grid');parent.append(grid);const moved=new Set();
    for(const id of ids){const control=document.getElementById(id),node=control?.closest('.field')||control?.closest('label');if(!node||moved.has(node))continue;moved.add(node);const marker=document.createComment('settings-home:'+id);node.before(marker);borrowed.push({node,marker});grid.append(node);}
  }
  function section(parent,title,copy,ids){const box=el('section','aps-section');box.append(el('h2','',title),el('p','aps-copy',copy));if(ids)fields(box,ids);parent.append(box);return box;}
  function cleanup(current){if(dialog!==current){current.remove();return;}mask();restore();current.remove();dialog=null;void syncBrowserOcclusion();const target=opener?.isConnected?opener:document.getElementById('mhSettings');target?.focus({preventScroll:true});}
  function close(){const current=dialog;if(!current)return;current.close();cleanup(current);}
  function openStudioSection(id){close();window.MediaHomeUI?.openStudio();const control=document.getElementById(id);if(control){for(let node=control.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;control.scrollIntoView({block:'center'});control.focus({preventScroll:true});}}
  function draw(){
    if(!dialog)return;restore();dialog.replaceChildren();dialog.setAttribute('aria-label',t('Settings','Ayarlar'));
    const header=el('header','aps-header'),copy=el('div');copy.append(el('h1','',t('Settings','Ayarlar')),el('p','aps-copy',t('Your providers, your models, one workspace.','Sağlayıcıların, modellerin, tek çalışma alanı.')));const exit=button('×',close);exit.id='appSettingsClose';exit.setAttribute('aria-label',t('Close settings','Ayarları kapat'));header.append(copy,exit);dialog.append(header);
    const layout=el('div','aps-layout'),nav=el('nav','aps-nav');nav.setAttribute('aria-label',t('Settings sections','Ayar bölümleri'));layout.append(nav);dialog.append(layout);
    for(const [id,en,tr]of [['ai','Assistant & translation','Asistan ve çeviri'],['manga','Image translation','Görsel çeviri'],['cleanup','Text cleanup','Metin düzeltme'],['general','Appearance & tools','Görünüm ve araçlar']]){const item=button(t(en,tr),()=>{mask();active=id;draw();dialog.querySelector(`[data-app-settings="${id}"]`)?.focus();});item.dataset.appSettings=id;item.setAttribute('aria-current',active===id?'page':'false');nav.append(item);}
    const main=el('main','aps-content');layout.append(main);
    if(active==='ai')section(main,t('Assistant & subtitle translation','Asistan ve altyazı çevirisi'),t('The assistant and subtitle translation share this provider and model. Changing provider restores that provider’s saved key. A test request is sent only when you press its button.','Asistan ve altyazı çevirisi bu sağlayıcıyı ve modeli paylaşır. Sağlayıcı değişince o sağlayıcının kayıtlı anahtarı gelir. Test isteği yalnız düğmesine bastığında gönderilir.'),['translateEndpointPreset','translateModel','translateApiKey','translateBaseUrl','translateSavedModel','translateProbeBtn','translateTo']);
    if(active==='manga')section(main,t('Image & manga translation','Görsel ve manga çevirisi'),t('Use the shared provider or choose a separate image-capable model.','Ortak sağlayıcıyı kullanabilir veya görsel destekleyen ayrı bir model seçebilirsin.'),['mangaEndpointPreset','mangaModel','mangaApiKey','mangaBaseUrl']);
    if(active==='cleanup')section(main,t('Transcription text cleanup','Transkripsiyon metin düzeltme'),t('Optional cleanup uses its own provider. This does not replace the assistant provider above.','İsteğe bağlı metin düzeltme ayrı sağlayıcı kullanır. Asistanın yukarıdaki sağlayıcısını değiştirmez.'),['llmPostprocess','llmEndpointPreset','llmModel','llmApiKey','llmBaseUrl']);
    if(active==='general'){
      const appearance=section(main,t('Appearance','Görünüm'),t('Use the existing application theme and language settings.','Uygulamanın mevcut tema ve dil ayarlarını kullan.'),['uiTheme','uiLocale']);
      const tools=section(main,t('Whisper, voice & workspace','Whisper, ses ve çalışma alanı'),t('Open the existing detailed tools with your current settings intact.','Mevcut ayrıntılı araçları, ayarların korunarak aç.'));
      const actions=el('div','aps-shortcuts');tools.append(actions);
      actions.append(button(t('Whisper settings','Whisper ayarları'),()=>openStudioSection('model')),button(t('Translation options','Çeviri seçenekleri'),()=>openStudioSection('translate')),button(t('Voice studio','Ses stüdyosu'),()=>{close();document.getElementById('dubMainOpen')?.click();}),button(t('Backup & workspace','Yedekleme ve çalışma alanı'),()=>{close();window.MediaToolsUI?.open('backup');}));
    }
    const footer=el('footer','aps-footer'),status=el('p','aps-copy');status.id='appSettingsStatus';status.setAttribute('role','status');status.textContent=t('These are the existing settings. Changes use the same secure credential storage.','Bunlar mevcut ayarların. Değişiklikler aynı güvenli anahtar deposunu kullanır.');
    const save=button(t('Save settings','Ayarları kaydet'),async()=>{save.disabled=true;try{const ok=await saveAppSettings();if(!dialog?.open)return;status.textContent=ok?t('Settings saved.','Ayarlar kaydedildi.'):t('Could not save securely. Check the application log.','Güvenli kayıt yapılamadı. Uygulama günlüğünü kontrol et.');status.classList.toggle('aps-error',!ok);}catch{status.textContent=t('Could not save settings.','Ayarlar kaydedilemedi.');status.classList.add('aps-error');}finally{save.disabled=false;}});save.id='appSettingsSave';save.classList.add('mh-primary');footer.append(status,save);dialog.append(footer);
  }
  async function open(page='ai'){
    await initialSettingsReady;
    if(dialog?.open){dialog.focus();return;}if(dialog)cleanup(dialog);
    active=['ai','manga','cleanup','general'].includes(page)?page:'ai';opener=document.activeElement;
    const current=el('dialog','aps-dialog media-surface');current.id='appSettingsDialog';current.dataset.uiUntranslated='';dialog=current;
    current.addEventListener('close',()=>cleanup(current));
    document.body.append(current);try{draw();current.showModal();window.MediaExperience?.setContext(current,{id:'application-settings',type:'media-tool',title:t('Application settings','Uygulama ayarları'),note:'Credential input values are private and are not assistant context.'});void syncBrowserOcclusion();current.querySelector('[aria-current="page"]')?.focus();}catch(error){restore();current.remove();dialog=null;throw error;}
  }
  document.addEventListener('ui-locale-change',()=>{if(dialog?.open)draw();});
  window.AppSettingsUI=Object.freeze({open,close});
})();
