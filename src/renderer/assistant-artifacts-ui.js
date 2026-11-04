(() => {
  'use strict';
  const {h}=PlayerUiKit;
  const t=(tr,en)=>window.UiLocale?.get?.()==='tr'?tr:en;
  async function request(input) {
    const result=await window.api.assistantArtifacts(input);
    if(result?.ok)return result;
    if(result?.code==='revision-conflict')throw Error(t('Çıktı değişti. Kapatıp yeniden açın.','The output changed. Close and reopen it.'));
    throw Error(t('Çıktı işlemi tamamlanamadı.','The output operation could not be completed.'));
  }
  async function open(id) {
    const loaded=await request({action:'get',id});
    const existing=document.getElementById('assistantArtifactDialog');
    if(existing?.open){
      existing.querySelector('[role=status]').textContent=t('Önce açık çıktıyı kapatın.','Close the open output first.');
      existing.focus();return;
    }
    existing?.remove();
    if(!['dossier','timeline'].includes(loaded.doc.kind))throw Error(t('Bu çıktı türü burada açılamıyor.','This output type cannot be opened here.'));
    const origin=document.activeElement;
    const dialog=h('dialog',{id:'assistantArtifactDialog',class:'mtx-dialog media-surface pw-root',data:{uiUntranslated:''},'aria-label':loaded.doc.title});
    const status=h('p',{class:'mtx-status',role:'status'}),body=h('main',{class:'mtx-body'});
    let doc=loaded.doc, busy=false, dirty=false;
    const button=(label,fn)=>h('button',{type:'button',class:'pw-btn',text:label,on:{click:async()=>{
      if(busy)return;
      busy=true;
      try{await fn();}catch(error){status.textContent=error.message;}finally{busy=false;}
    }}});
    const close=()=>{if(dirty){status.textContent=t('Önce düzeltmeyi kaydedin veya düzenlemeyi iptal edin.','Save the correction or cancel editing first.');return;}dialog.close();};
    dialog.append(h('header',null,h('h1',{text:doc.title}),button(t('Kapat','Close'),close)),status,body);
    dialog.addEventListener('cancel',event=>{if(dirty){event.preventDefault();close();}});
    dialog.addEventListener('close',()=>{dialog.remove();origin?.focus();void syncBrowserOcclusion();},{once:true});
    async function redraw() {
      if(!dialog.open)return;
      const result=await request({action:'get',id});
      if(!dialog.open)return;
      doc=result.doc;dirty=false;status.textContent='';
      const current=result.body;
      const note=h('p',{text:t('Kaydedilen yanıttaki açık kaynak işaretlerinden oluşturuldu.','Created from explicit source citations in the saved reply.')});
      const count=h('p',{text:t('Alınmayan paragraf sayısı','Omitted paragraphs')+' · '+(current.omittedParagraphs||0)});
      const entries=current.type==='timeline'?current.nodes:current.sections.flatMap(section=>section.passages);
      const original=doc.modelBody.type==='timeline'?doc.modelBody.nodes:doc.modelBody.sections.flatMap(section=>section.passages);
      const controls=h('div',{class:'v3-runtime-controls'});
      body.replaceChildren(h('p',{text:t('Sürüm','Revision')+' '+doc.revision}),note,count);
      for(const entry of entries){
        const key=(current.type==='timeline'?'node:':'passage:')+entry.id;
        const text=current.type==='timeline'?entry.label:entry.text;
        const content=h('p',{text});
        const card=h('section',{class:'v3-section'},current.type==='timeline'?h('strong',{text:Math.floor(entry.time/60)+':'+String(Math.floor(entry.time%60)).padStart(2,'0')}):null,content);
        const user=Object.hasOwn(doc.userEdits,key);
        if(user)card.append(h('strong',{text:t('Kullanıcı düzeltmesi','User correction')}));
        const base=original.find(row=>row.id===entry.id);
        if(user)card.append(h('details',null,h('summary',{text:t('Özgün model metni','Original model text')}),h('p',{text:base.text??base.label})));
        card.append(h('details',null,h('summary',{text:t('Kaynaklar','Sources')}),
          entry.claims.map(claim=>{const source=current.evidence.find(row=>row.sourceId===claim.sourceId);return h('blockquote',null,h('strong',{text:'['+claim.passageId+']'}),h('p',{text:source?.text||claim.quote}));})));
        card.append(button(t('Düzelt','Edit'),async()=>{
          if(dirty)return;
          dirty=true;
          const input=h('textarea',{maxlength:2000,rows:5,value:text,'aria-label':t('Kullanıcı düzeltmesi','User correction')});
          const edit=h('div',{class:'v3-runtime-controls'},input);
          edit.append(button(t('Düzeltmeyi kaydet','Save correction'),async()=>{
            await request({action:'edit',id,expectedRevision:doc.revision,key,value:input.value});
            dirty=false;await redraw();
          }),button(t('Düzenlemeyi iptal et','Cancel editing'),async()=>{dirty=false;edit.remove();}));
          card.append(edit);input.focus();
        }));
        body.append(card);
      }
      controls.append(button(t('Yanıttan yenile','Refresh from reply'),async()=>{
        if(dirty)return;
        await request({action:'from-message',...current.origin,kind:doc.kind,expectedRevision:doc.revision});
        await redraw();
      }));
      if(doc.versions.length){
        const versions=h('select',{'aria-label':t('Önceki sürüm','Previous revision')},doc.versions.slice().reverse().map(version=>
          h('option',{value:version.revision,text:t('Sürüm','Revision')+' '+version.revision})));
        controls.append(versions,button(t('Sürümü geri yükle','Restore revision'),async()=>{
          if(dirty)return;
          await request({action:'restore',id,expectedRevision:doc.revision,revision:Number(versions.value)});await redraw();
        }));
      }
      for(const format of ['json','markdown','html'])controls.append(button(t('Dışa aktar','Export')+' '+format.toUpperCase(),async()=>{
        if(dirty)return;
        const exported=AssistantArtifactExport.exportArtifact({doc,format,expectedRevision:doc.revision,locale:window.UiLocale?.get?.()});
        if(!exported.ok)throw Error(t('Dışa aktarılamadı.','Export failed.'));
        const saved=await window.api.mediaHub({action:'v3-export',kind:doc.kind,format,content:exported.content});
        if(!saved?.ok)throw Error(t('Dışa aktarılamadı.','Export failed.'));
      }));
      body.append(controls);
    }
    document.body.append(dialog);dialog.showModal();void syncBrowserOcclusion();
    try{await redraw();}catch(error){status.textContent=error.message;}
  }
  window.AssistantArtifactsUI=Object.freeze({open});
})();
