(() => {
 'use strict';
 // Editable, source-bound note from a saved-podcast source card. Opening, editing and previewing never save;
 // saving sends only the last previewed text's token, and the main process re-verifies the exact saved source.
 if(!window.api?.assistantPodcastNote)return;
 const tr=()=>window.UiLocale?.get?.()==='tr';
 const t=(en,trText)=>tr()?trText:en;
 const part=value=>{const rows=String(value||'').split(' / ');return tr()&&rows[1]?rows[1]:rows[0];};
 const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 let active=null;
 async function open(card,{timeoutMs=20000}={}){
  if(active||!card?.locator)return false;
  const origin=document.activeElement;
  const owner=window.AssistantAppActions?.snapshot?.();
  const ownerCurrent=()=>window.AssistantAppActions?.current?.(owner)!==false;
  const ownerChanged=()=>({ok:false,code:'owner-changed',error:t('The conversation or source changed. Reopen this passage to review its note.','Sohbet veya kaynak değişti. Notunu incelemek için bu pasajı yeniden aç.')});
  const state={draftId:'',token:'',step:'loading',busy:false,closed:false,blocked:false,saved:false,sequence:0,lastPreview:'',savedText:'',created:false};
  const dialog=node('dialog','mx-dialog media-surface assistant-note-dialog');dialog.dataset.uiUntranslated='';dialog.setAttribute('aria-labelledby','assistantNoteTitle');
  const title=node('h2','',t('Save as note','Not olarak kaydet'));title.id='assistantNoteTitle';
  const source=node('p','note-source'),quote=node('blockquote','note-quote',card.quote||''),access=node('p','note-access');access.setAttribute('role','status');
  const existing=node('p','note-existing');existing.hidden=true;
  const label=node('label','',t('Your note (optional)','Notun (isteğe bağlı)')),field=document.createElement('textarea');field.rows=6;field.maxLength=8000;label.append(field);
  const preview=node('section','note-preview');preview.hidden=true;const previewTitle=node('h3','',t('What will be saved','Neler kaydedilecek')),previewText=node('pre','note-preview-text'),previewMeta=node('p','note-preview-meta');preview.append(previewTitle,previewText,previewMeta);
  const status=node('p','note-status');status.setAttribute('role','status');
  const row=node('div','note-actions'),previewButton=node('button','btn btn-secondary',t('Preview note','Notu önizle')),backButton=node('button','btn btn-secondary',t('Edit','Düzenle')),saveButton=node('button','btn btn-primary',t('Save note','Notu kaydet')),closeButton=node('button','btn btn-secondary',t('Close','Kapat'));
  for(const button of [previewButton,backButton,saveButton,closeButton])button.type='button';
  row.append(previewButton,backButton,saveButton,closeButton);
  dialog.append(title,source,quote,access,existing,label,preview,status,row);
  const describe=src=>{
   const when=src.timed?window.AssistantPodcastSources.clock(src.seconds)+'–'+window.AssistantPodcastSources.clock(src.end):t('No verified time: the note will not be linked to a moment.','Doğrulanmış zaman yok: not bir ana bağlanmayacak.');
   source.textContent=[[src.show,src.episode].filter(Boolean).join(' · '),src.role==='translation'?t('Translation','Çeviri'):t('Original','Özgün'),when].join('\n');
  };
  const render=()=>{
   const loading=state.step==='loading',editing=state.step==='edit',previewing=state.step==='preview';
   field.disabled=loading;label.hidden=previewing||state.saved;existing.hidden=existing.dataset.has!=='1'||previewing||state.saved;preview.hidden=!previewing&&!state.saved;
   previewButton.hidden=!editing;previewButton.disabled=state.busy||state.blocked;
   // After a successful save the main action is Close; Edit then means "edit the note that was just saved" and Save is gone.
   backButton.hidden=!(previewing||state.saved);backButton.disabled=state.busy;backButton.textContent=state.saved?t('Edit this note','Bu notu düzenle'):t('Edit','Düzenle');
   saveButton.hidden=!previewing||state.saved;saveButton.disabled=state.busy||state.blocked||state.saved;
   previewTitle.textContent=state.saved?t('Saved note','Kaydedilen not'):t('What will be saved','Neler kaydedilecek');
   title.textContent=state.saved?t('Note saved','Not kaydedildi'):t('Save as note','Not olarak kaydet');previewMeta.hidden=state.saved;   // the status line already says created/updated; saying it twice is noise
   closeButton.disabled=state.busy;closeButton.className=state.saved?'btn btn-primary':'btn btn-secondary';
  };
  const say=text=>{status.textContent=text;};
  async function call(action,extra={}){
   const sequence=++state.sequence;let result;
   if(!ownerCurrent())return ownerChanged();
   try{
    const pending=Promise.resolve(window.api.assistantPodcastNote({action,owner,draftId:state.draftId,...extra}));
    // A save whose answer never arrives must not lock the dialog: after the wait it is reported as unknown (the same preview can be sent again safely).
    result=action==='save'?await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve({ok:false,code:'transport',error:''}),timeoutMs))]):await pending;
   }
   catch(_){result={ok:false,code:'transport',error:''};}
   // A late answer for a closed dialog or a replaced request never changes what the user sees.
   if(state.closed||sequence!==state.sequence)return null;
   // Never present an old draft/approval as current. A dispatched save is different:
   // its actual receipt (or unknown result) must still be reported honestly.
   return action!=='save'&&!ownerCurrent()?ownerChanged():result;
  }
  function blocked(result){
   state.blocked=true;state.step=state.step==='loading'?'edit':state.step;
   access.textContent=result.code==='source-changed'?t('Source changed or removed.','Kaynak değişmiş veya silinmiş.'):result.code==='owner-changed'?t('The conversation or source changed.','Sohbet veya kaynak değişti.'):t('Source could not be checked.','Kaynak denetlenemedi.');
   say(part(result.error)||t('Nothing was saved.','Hiçbir şey kaydedilmedi.'));render();
  }
  const finish=()=>{
   if(state.closed)return;state.closed=true;
   if(state.draftId&&!state.saved)void Promise.resolve(window.api.assistantPodcastNote({action:'cancel',owner,draftId:state.draftId})).catch(()=>{});
   dialog.remove();active=null;window.syncBrowserOcclusion?.();origin?.focus?.({preventScroll:true});
  };
  closeButton.onclick=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
  dialog.addEventListener('close',finish);
  // Typing, Space and Enter belong to the field: they never reach player shortcuts.
  for(const type of ['keydown','keyup','keypress'])dialog.addEventListener(type,event=>event.stopPropagation());
  previewButton.onclick=async()=>{
   if(state.busy||state.blocked)return;state.busy=true;render();say(t('Checking the saved source…','Kayıtlı kaynak denetleniyor…'));
   const result=await call('preview',{text:field.value});state.busy=false;
   if(!result)return;
   if(!result.ok){if(result.code==='transport'){say(t('The app did not answer. Nothing was saved.','Uygulama yanıt vermedi. Hiçbir şey kaydedilmedi.'));render();}else if(['source-changed','owner-changed'].includes(result.code))blocked(result);else{say(part(result.error));render();}return;}
   state.token=result.previewToken;state.step='preview';state.lastPreview=result.note||'';describe(result.source);
   previewText.textContent=result.note||t('(no note text; only the quote is saved)','(not metni yok; yalnız alıntı kaydedilir)');
   previewMeta.textContent=result.source.existing?t('A note for this passage exists. Saving replaces its text.','Bu pasaj için bir not var. Kaydetmek metnini değiştirir.'):t('This creates one new note linked to this exact saved source.','Bu, tam bu kayıtlı kaynağa bağlı yeni bir not oluşturur.');
   say('');render();saveButton.focus();
  };
  backButton.onclick=()=>{
   if(state.busy)return;
   if(state.saved){
    // The saved note is now the note this passage has: editing it is an update, and the dialog says so.
    state.saved=false;existing.dataset.has='1';existing.textContent=t('Editing the note you just saved. Saving again replaces its text.','Az önce kaydettiğin notu düzenliyorsun. Yeniden kaydetmek metnini değiştirir.');field.value=state.savedText;
   }
   state.step='edit';state.token='';preview.hidden=true;say('');render();field.focus();
  };
  saveButton.onclick=async()=>{
   if(state.busy||state.blocked||state.saved)return;state.busy=true;render();say(t('Saving…','Kaydediliyor…'));
   const result=await call('save',{previewToken:state.token});state.busy=false;
   if(!result)return;
   if(result.ok){state.saved=true;state.savedText=state.lastPreview;state.created=result.created===true;previewMeta.textContent=result.replayed?t('This is the note that was saved earlier; nothing new was written.','Bu, daha önce kaydedilen not; yeni bir şey yazılmadı.'):result.created?t('Saved as a new note linked to this exact saved source.','Bu kayıtlı kaynağa bağlı yeni bir not olarak kaydedildi.'):t('The existing note for this passage was updated.','Bu pasajın mevcut notu güncellendi.');say(result.durable===false?t('Note saved, but the app could not confirm that it reached the disk. It is in your research notebook; check it before closing.','Not kaydedildi, ancak uygulama diske yazıldığını doğrulayamadı. Araştırma defterinde; kapatmadan önce kontrol et.'):result.replayed?t('This note was already saved; it was not saved again.','Bu not zaten kaydedilmişti; yeniden kaydedilmedi.'):result.created?t('Note saved to your research notebook.','Not araştırma defterine kaydedildi.'):t('The existing note for this passage was updated.','Bu pasajın mevcut notu güncellendi.'));render();closeButton.focus();return;}
   if(result.code==='transport'){say(t('The result is unknown: the app did not confirm the save. Press Save again (the same preview is never saved twice) or check your research notebook.','Sonuç bilinmiyor: uygulama kaydı doğrulamadı. Yeniden Kaydet’e bas (aynı önizleme iki kez kaydedilmez) veya araştırma defterini kontrol et.'));render();return;}
   if(result.pending){say(part(result.error));render();return;}
   if(['preview-outdated','target-changed'].includes(result.code)){state.step='edit';state.token='';preview.hidden=true;say(part(result.error));render();return;}
   if(['expired','cancelled'].includes(result.code)){state.blocked=true;access.textContent=t('This note draft is no longer available.','Bu not taslağı artık kullanılamıyor.');say(part(result.error)||t('Nothing was saved.','Hiçbir şey kaydedilmedi.'));render();return;}
   blocked(result);
  };
  document.body.append(dialog);active=dialog;dialog.showModal();window.syncBrowserOcclusion?.();
  access.textContent=t('Checking the saved source…','Kayıtlı kaynak denetleniyor…');describe(card.timed===undefined?{show:card.show,episode:card.episode,role:card.role,timed:false}:card);render();
  const draft=await call('draft',{locator:card.locator,draftId:undefined});
  if(!draft)return true;
  if(!draft.ok){blocked(draft);say((part(draft.error)||'')+' '+t('The quote above is kept as you saw it; nothing can be saved from it.','Yukarıdaki alıntı gördüğün gibi korunuyor; ondan kayıt yapılamaz.'));return true;}
  state.draftId=draft.draftId;state.step='edit';describe(draft.source);quote.textContent=draft.source.quote;
  access.textContent=t('Source verified just now: this exact saved text is available.','Kaynak az önce doğrulandı: bu kayıtlı metin erişilebilir.');
  if(draft.source.existing){existing.dataset.has='1';existing.hidden=false;existing.textContent=t('A note for this passage already exists. Saving replaces its text; its current text is loaded below.','Bu pasaj için zaten bir not var. Kaydetmek metnini değiştirir; mevcut metin aşağıda yüklü.');field.value=draft.source.existing.note||'';}
  render();field.focus();return true;
 }
 window.AssistantPodcastNoteUI=Object.freeze({open,isOpen:()=>!!active});
})();
