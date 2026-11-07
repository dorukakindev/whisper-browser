(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='en'?en:tr;
 let current=null;
 const owner=()=>window.AssistantAppActions?.snapshot?.();
 async function open(card){
  if(!window.api.assistantResearchNotes||!owner())return;
  current?.close();const origin=document.activeElement,binding=owner(),dialog=document.createElement('dialog');dialog.className='research-draft-dialog';
  const heading=document.createElement('h2');heading.id='research-draft-heading';dialog.setAttribute('aria-labelledby',heading.id);heading.textContent=card.kind==='research-draft'?t('Review your sourced draft','Kaynaklı taslağını incele'):t('Saved note & its evidence','Kayıtlı not ve dayanakları');
  const status=document.createElement('p');status.setAttribute('role','status');const body=document.createElement('div');body.className='research-draft-body';
  const bar=document.createElement('div');bar.className='research-card-actions';const close=document.createElement('button');close.textContent=t('Close','Kapat');close.onclick=()=>dialog.close();bar.append(close);dialog.append(heading,status,body,bar);document.body.append(dialog);current=dialog;
  dialog.addEventListener('close',()=>{dialog.remove();if(current===dialog)current=null;if(origin?.isConnected)origin.focus({preventScroll:true});});dialog.showModal();
  const call=async input=>{if(!window.AssistantAppActions.current(binding))return {ok:false,error:t('Conversation or source changed. Nothing was saved.','Sohbet veya kaynak değişti. Hiçbir şey kaydedilmedi.')};try{return await window.api.assistantResearchNotes({...input,id:card.draftId||card.id,owner:binding});}catch(_){return {ok:false,error:t('The app did not reply. Retry the same confirmation.','Uygulama yanıt vermedi. Aynı onayı yeniden dene.')};}};
  const result=await call({action:card.kind==='research-draft'?'get':'inspect'});if(!dialog.isConnected)return;
  if(!result?.ok){status.textContent=result.error||t('This evidence changed or expired. Search again.','Dayanak değişti veya eskidi. Yeniden ara.');return;}
  const sources=card.kind==='research-draft'?result.sources:[result.card];
  const list=document.createElement('div');list.className='research-draft-sources';
  for(const source of sources){const item=document.createElement('article'),title=document.createElement('strong'),quote=document.createElement('blockquote'),note=document.createElement('p');title.textContent=source.title;quote.textContent=source.text;note.textContent=t('Personal note: ','Kişisel not: ')+source.personalNote;item.dataset.uiUntranslated='';item.append(title,quote);if(source.translation){const translated=document.createElement('p');translated.textContent=t('Saved translation: ','Kayıtlı çeviri: ')+source.translation;item.append(translated);}item.append(note);list.append(item);}
  body.append(list);
  if(card.kind!=='research-draft'){
   const go=document.createElement('button');go.textContent=t('Open original source','Özgün kaynağı aç');bar.prepend(go);
   go.onclick=async()=>{go.disabled=true;const fresh=await call({action:'inspect'});if(!dialog.isConnected)return;if(!fresh.ok){status.textContent=fresh.error;go.disabled=false;return;}
    const a=fresh.annotation;let opened=false;try{opened=await openUnifiedLibraryResult({...a,kind:'notes',annotationId:a.id,title:a.mediaTitle,timed:fresh.card.timed,seconds:fresh.card.timed?a.start:null,url:a.mediaUrl});}catch(_){}
    if(!dialog.isConnected)return;status.textContent=opened===true?t('Source opened.','Kaynak açıldı.'):t('The source could not be confirmed. Your saved note is kept. Reopen or relink it in the library.','Kaynak doğrulanamadı. Kayıtlı notun korunuyor. Kütüphanede yeniden aç veya bağla.');go.disabled=false;};return;
  }
  status.textContent=t('AI interpretation · not saved. Review every source before confirming.','AI yorumu · kaydedilmedi. Onaydan önce dayanakları incele.');
  const editor=document.createElement('textarea');editor.value=result.draft.text;editor.maxLength=8000;editor.rows=8;editor.setAttribute('aria-label',t('Editable draft','Düzenlenebilir taslak'));body.append(editor);editor.focus();
  let preview=null,busy=false,saved=false;const previewButton=document.createElement('button'),save=document.createElement('button');previewButton.textContent=t('Preview this draft','Bu taslağı önizle');save.textContent=t('Confirm & save new note','Onayla ve yeni not kaydet');save.hidden=true;bar.prepend(previewButton,save);
  editor.oninput=()=>{preview=null;save.hidden=true;status.textContent=t('Draft changed. Preview again; nothing is saved.','Taslak değişti. Yeniden önizle; hiçbir şey kaydedilmedi.');};
  previewButton.onclick=async()=>{if(busy||saved)return;busy=true;const text=editor.value;const response=await call({action:'preview',text});busy=false;if(!dialog.isConnected)return;if(editor.value!==text)return;if(!response.ok){status.textContent=response.error;return;}preview={token:response.token,text:response.text};save.hidden=false;status.textContent=t('This exact draft will be saved as a new AI-tagged note; original notes stay unchanged.','Bu taslak yeni ve AI etiketli bir not olarak kaydedilecek; özgün notlar değişmeyecek.');};
  save.onclick=async()=>{if(busy||saved||!preview)return;busy=true;save.disabled=true;editor.readOnly=true;const response=await call({action:'save',...preview});busy=false;if(!dialog.isConnected)return;
   if(response?.ok){saved=true;save.hidden=true;previewButton.hidden=true;heading.textContent=t('Note saved','Not kaydedildi');status.textContent=t('Saved once. Reopen it in the research notebook.','Bir kez kaydedildi. Araştırma defterinde yeniden açabilirsin.');document.dispatchEvent(new CustomEvent('research-notes-changed'));}
   else{status.textContent=response.error||t('Result unknown. Retry this same confirmation.','Sonuç bilinmiyor. Aynı onayı yeniden dene.');editor.readOnly=false;save.disabled=false;}
  };
 }
 async function reveal(id,binding=owner()){
  if(!window.AssistantAppActions.current(binding))return {ok:false,error:t('Conversation changed.','Sohbet değişti.')};
  const checked=await window.api.assistantResearchNotes({action:'inspect',id,owner:binding});
  if(!checked.ok||!window.AssistantAppActions.current(binding))return {ok:false,error:checked.error||t('Evidence changed.','Dayanak değişti.')};
  const a=checked.annotation;
  try{const opened=await openUnifiedLibraryResult({...a,kind:'notes',annotationId:a.id,title:a.mediaTitle,timed:checked.card.timed,seconds:checked.card.timed?a.start:null,url:a.mediaUrl});return opened===true?{ok:true}:{ok:false,error:t('Source opening could not be confirmed. Your note is kept.','Kaynağın açıldığı doğrulanamadı. Notun korunuyor.')};}catch(_){return {ok:false,error:t('Source unavailable; reopen or relink it in the library.','Kaynak kullanılamıyor; kütüphanede yeniden aç veya bağla.')};}
 }
 window.AssistantResearchNotesUI=Object.freeze({open,reveal});
})();
