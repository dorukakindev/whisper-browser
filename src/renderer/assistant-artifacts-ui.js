/* Saved output presentation. Storage, revision checks and exports keep their existing owners. */
(() => {
  'use strict';
  const Kit=PlayerUiKit,{h}=Kit;
  const t=(tr,en)=>window.UiLocale?.get?.()==='tr'?tr:en;
  async function request(input) {
    const result=await window.api.assistantArtifacts(input);
    if(result?.ok)return result;
    if(result?.code==='revision-conflict')throw Error(t('Çıktı değişti. Kapatıp yeniden açın.','The output changed. Close and reopen it.'));
    throw Error(t('Çıktı işlemi tamamlanamadı.','The output operation could not be completed.'));
  }
  async function mediaMetadata(sourceKey,anchor) {
    let identity;try{identity=JSON.parse(sourceKey);}catch{return {};}
    if(!Array.isArray(identity))return {};
    const selection=window.MediaExperience?.context?.();
    const exactSelection=selection&&window.AssistantSourceContext?.conversation?.({},selection)===sourceKey;
    const catalogId=exactSelection&&/^catalog:/.test(selection.catalogId||'')?selection.catalogId.slice(8):null;
    const key=['player','browser'].includes(identity[0])&&typeof identity[1]==='string'?identity[1]:null;
    const fallback=exactSelection?{title:selection.title||''}:key&&key===anchor?.mediaKey?{title:anchor.title||''}:{};
    if(!key&&!catalogId)return fallback;
    if(typeof window.api.mediaCatalog!=='function')return fallback;
    try{
      const result=await window.api.mediaCatalog({action:'list'});
      const matches=(result?.ok?result.items:[]).filter(item=>{
        if(catalogId)return item.id===catalogId;
        const source=item.source;if(!source)return false;
        if(source.watchKey===key)return true;
        return source.type==='local'&&typeof mediaKeyFor==='function'&&mediaKeyFor('local',source.value)===key;
      });
      if(matches.length!==1)return fallback;
      const item=matches[0],metadata={title:item.title,year:item.year,genres:Array.isArray(item.genres)?item.genres.filter(value=>typeof value==='string'):[]};
      if(item.hasPoster){const poster=await window.api.mediaCatalog({action:'poster',id:item.id});if(poster?.ok&&/^data:image\/(?:png|jpeg|webp|avif);base64,/.test(poster.image||''))metadata.image=poster.image;}
      return metadata;
    }catch{return fallback;}
  }
  async function open(id) {
    const loaded=await request({action:'get',id});
    const existing=document.getElementById('assistantArtifactDialog');
    if(existing?.open){existing.querySelector('[role=status]').textContent=t('Önce açık çıktıyı kapatın.','Close the open output first.');existing.focus();return;}
    existing?.remove();
    if(!['dossier','timeline'].includes(loaded.doc.kind))throw Error(t('Bu çıktı türü burada açılamıyor.','This output type cannot be opened here.'));
    const origin=document.activeElement,anchor=window.PlayerWorkspaceIntegration?.snapshot?.();
    const title=t('Kaydedilen yanıt','Saved answer');
    const dialog=h('dialog',{id:'assistantArtifactDialog',class:'mtx-dialog media-surface pw-root aa-dialog',data:{uiUntranslated:''},'aria-label':title});
    const status=h('p',{class:'mtx-status aa-status',role:'status'}),body=h('main',{class:'mtx-body aa-body'});
    let doc=loaded.doc,busy=false,dirty=false,view=0,firstEditable=null;
    const metadataPromise=mediaMetadata(doc.modelBody.origin.sourceKey,anchor);
    const run=fn=>async()=>{if(busy)return;busy=true;try{await fn();}catch(error){status.textContent=error.message;}finally{busy=false;}};
    const button=(label,fn,primary=false)=>h('button',{type:'button',class:'pw-btn'+(primary?' pw-btn-primary':''),text:label,on:{click:run(fn)}});
    const guarded=fn=>run(async()=>{if(dirty){status.textContent=t('Önce düzeltmeyi kaydedin veya düzenlemeyi iptal edin.','Save the correction or cancel editing first.');return;}await fn();});
    const close=()=>{if(dirty){status.textContent=t('Önce düzeltmeyi kaydedin veya düzenlemeyi iptal edin.','Save the correction or cancel editing first.');return;}dialog.close();};
    const question=h('p',{class:'aa-question',text:doc.title,title:doc.title});
    dialog.append(h('header',{class:'aa-header'},h('div',null,h('span',{class:'aa-eyebrow',text:t('ASİSTAN · KAYITLI ÇIKTI','ASSISTANT · SAVED OUTPUT')}),h('h1',{text:title}),question),
      Kit.iconButton({icon:'close',label:t('Kapat','Close'),onClick:close})),status,body);
    dialog.addEventListener('cancel',event=>{if(dirty){event.preventDefault();close();}});
    dialog.addEventListener('close',()=>{view++;dialog.remove();origin?.focus();void syncBrowserOcclusion();},{once:true});
    async function seekSource(claim,current) {
      if(dirty){status.textContent=t('Önce düzeltmeyi kaydedin veya düzenlemeyi iptal edin.','Save the correction or cancel editing first.');return;}
      const source=current.evidence.find(row=>row.sourceId===claim.sourceId);
      if(source?.sourceKind!=='subtitle'||!Number.isFinite(source.time)){
        status.textContent=t('Bu kaynak için oynatma zamanı bulunmuyor.','This source has no playback timestamp.');return;
      }
      let identity;try{identity=JSON.parse(source.sourceKey);}catch{}
      if(Array.isArray(identity)&&(!['player','browser'].includes(identity[0])||identity[1]!==anchor?.mediaKey)){
        status.textContent=t('Kaynak veya altyazı değişti. İlgili medyayı ve altyazıyı açıp yeniden deneyin.','The source or subtitles changed. Open the matching media and subtitle track and retry.');return;
      }
      const result=await window.PlayerWorkspaceIntegration?.seekEvidence?.(source,anchor);
      if(!result?.ok){status.textContent=t('Kaynak veya altyazı değişti. İlgili medyayı ve altyazıyı açıp yeniden deneyin.','The source or subtitles changed. Open the matching media and subtitle track and retry.');return;}
      dialog.close();
    }
    function citation(claim,current) {
      const source=current.evidence.find(row=>row.sourceId===claim.sourceId);
      const label=String(current.evidence.findIndex(row=>row.sourceId===claim.sourceId)+1);
      const sourceLabel=claim.passageId||source?.id||t('Kaynak','Source');
      const stamp=Number.isFinite(source?.time)?Kit.formatClock(source.time):t('Zamansız kaynak','Untimed source');
      const content=h('span',{class:'aa-citation-preview',role:'tooltip'},h('strong',{text:stamp}),h('span',{text:source?.text||claim.quote||''}));
      const node=h('button',{type:'button',class:'aa-citation',data:{sourceId:claim.sourceId},title:sourceLabel+' · '+stamp+' · '+(source?.text||claim.quote||''),
        'aria-label':t('Kaynak ','Source ')+label+' · '+sourceLabel+' · '+stamp,on:{click:guarded(()=>seekSource(claim,current))}},label);
      return h('sup',{class:'aa-citation-wrap'},node,content);
    }
    function markdown(text,entry,current) {
      const citations=new Map(entry.claims.map(claim=>[claim.passageId,()=>citation(claim,current)]));
      const result=h('div',{class:'aa-prose'});let list=null,code=null;
      for(const line of text.split('\n')){
        if(/^```/.test(line)){if(code){code=null;}else{code=h('pre',null,h('code'));result.append(code);}list=null;continue;}
        if(code){code.firstChild.append(document.createTextNode(line+'\n'));continue;}
        const heading=/^(#{1,3})\s+(.+)$/.exec(line),bullet=/^\s*[-*]\s+(.+)$/.exec(line);
        if(bullet){if(!list){list=h('ul');result.append(list);}list.append(h('li',null,Kit.richText(bullet[1],{citations})));continue;}
        list=null;
        if(!line.trim())continue;
        result.append(h(heading?'h'+(heading[1].length+1):'p',null,Kit.richText(heading?heading[2]:line,{citations})));
      }
      return result;
    }
    function beginEdit(card,key,text) {
      if(dirty){dialog.querySelector('textarea')?.focus();return;}dirty=true;
      const input=h('textarea',{maxlength:2000,rows:5,value:text,'aria-label':t('Kullanıcı düzeltmesi','User correction')});
      const edit=h('div',{class:'aa-editor'},input,h('p',{class:'aa-edit-note',text:t('Düzeltmeler Kaydet ile saklanır. Kaynak bağlantıları korunur.','Corrections are stored with Save. Source links are preserved.')}));
      edit.append(h('div',{class:'aa-edit-actions'},button(t('Kaydet','Save'),async()=>{
        await request({action:'edit',id,expectedRevision:doc.revision,key,value:input.value});dirty=false;await redraw();
      },true),button(t('İptal','Cancel'),async()=>{dirty=false;edit.remove();})));
      card.append(edit);input.focus();
    }
    async function redraw() {
      if(!dialog.open)return;const ticket=++view;
      const result=await request({action:'get',id});if(!dialog.open||ticket!==view)return;
      const metadata=await metadataPromise;if(!dialog.open||ticket!==view)return;
      doc=result.doc;dirty=false;firstEditable=null;status.textContent='';question.textContent=doc.title;question.title=doc.title;
      const current=result.body,entries=current.type==='timeline'?current.nodes:current.sections.flatMap(section=>section.passages);
      const original=doc.modelBody.type==='timeline'?doc.modelBody.nodes:doc.modelBody.sections.flatMap(section=>section.passages);
      const omitted=current.omittedParagraphs||0;
      const meta=h('div',{class:'aa-meta'},h('span',{text:t('Yanıt · R','Answer · R')+doc.revision}),h('span',{text:current.type==='timeline'?t('Zaman çizelgesi','Timeline'):t('Kaynaklı yanıt','Sourced answer')}),
        h('span',{text:omitted?t(omitted+' kaynaksız paragraf alınmadı',omitted+' uncited paragraphs omitted'):t('Kaynaksız paragraf yok','No uncited paragraphs')}));
      const exportItems=['csv','json','markdown','html'].map(format=>({label:format.toUpperCase(),onSelect:guarded(async()=>{
        const exported=AssistantArtifactExport.exportArtifact({doc,format,expectedRevision:doc.revision,locale:window.UiLocale?.get?.()});
        if(!exported.ok)throw Error(t('Dışa aktarılamadı.','Export failed.'));
        const saved=await window.api.mediaHub({action:'v3-export',kind:doc.kind,format,content:(exported.bom?'\uFEFF':'')+exported.content});
        if(!saved?.ok)throw Error(t('Dışa aktarılamadı.','Export failed.'));
      })}));
      const versions=doc.versions.slice().reverse().map(version=>({label:t('Sürümü geri yükle · ','Restore revision · ')+version.revision,
        description:typeof version.at==='number'?new Intl.DateTimeFormat(window.UiLocale?.get?.()==='tr'?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(version.at)):'',onSelect:guarded(async()=>{
          await request({action:'restore',id,expectedRevision:doc.revision,revision:version.revision});await redraw();
        })}));
      const refresh=async()=>{
        if(dirty)return;await request({action:'from-message',...current.origin,kind:doc.kind,expectedRevision:doc.revision});await redraw();
      };
      const headerEdit=button(t('Düzenle','Edit answer'),()=>{if(dirty)dialog.querySelector('textarea')?.focus();else firstEditable?.();});
      const tools=h('div',{class:'aa-tools'},headerEdit,Kit.menuButton({label:t('Dışa aktar','Export'),icon:'external',items:exportItems}),
      Kit.menuButton({label:t('Diğer işlemler','More actions'),icon:'more',items:[{label:t('Yanıttan yenile','Refresh from reply'),onSelect:guarded(refresh)}]}),
      versions.length?Kit.menuButton({label:t('Sürümler','Versions'),icon:'clock',items:versions}):null);
      const provenance=h('div',{class:'aa-provenance'});
      if(metadata.image)provenance.append(h('img',{class:'aa-mini-film',src:metadata.image,alt:''}));
      if(metadata.title)provenance.append(h('strong',{text:metadata.title}));
      if(Number.isSafeInteger(metadata.year)&&metadata.year>=1888&&metadata.year<=2100)provenance.append(h('span',{text:String(metadata.year)}));
      const savedAt=doc.history.slice().reverse().find(row=>Number.isFinite(row.at)&&row.at>0)?.at;
      if(savedAt)provenance.append(h('time',{dateTime:new Date(savedAt).toISOString(),text:new Intl.DateTimeFormat(window.UiLocale?.get?.()==='tr'?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(savedAt))}));
      const visibleClaims=entries.filter(entry=>entry.spoiler!=='closed').flatMap(entry=>entry.claims);
      const timedClaim=visibleClaims.find(claim=>{const source=current.evidence.find(row=>row.sourceId===claim.sourceId);return source?.sourceKind==='subtitle'&&Number.isFinite(source.time);});
      if(timedClaim)provenance.append(button(t('Sahneyi aç','Open scene'),()=>seekSource(timedClaim,current)));
      body.replaceChildren(h('div',{class:'aa-toolbar'},provenance,tools),meta);
      const passages=h('div',{class:'aa-passages'});body.append(passages);
      for(const [index,entry]of entries.entries()){
        const key=(current.type==='timeline'?'node:':'passage:')+entry.id,text=current.type==='timeline'?entry.label:entry.text;
        if(entry.spoiler==='closed'){
          const hidden=h('section',{class:'aa-passage aa-hidden'},Kit.icon('shield'),h('span',{text:t('Spoiler kapalı','Spoiler hidden')}),button(t('Göster','Reveal'),async()=>{
            if(dirty)return;await request({action:'spoiler',id,expectedRevision:doc.revision,key,value:'open'});await redraw();
          }));passages.append(hidden);continue;
        }
        const card=h('section',{class:'aa-passage'},current.type==='timeline'?Kit.chip(Kit.formatClock(entry.time),'gold'):null,markdown(text,entry,current));
        const user=Object.hasOwn(doc.userEdits,key),base=original.find(row=>row.id===entry.id);
        if(user)card.append(Kit.chip(t('Kullanıcı düzeltmesi','User correction'),'gold'),Kit.accordion({title:t('Özgün model metni','Original model text'),children:h('p',{text:base?.text??base?.label??''})}));
        if(!firstEditable)firstEditable=()=>beginEdit(card,key,text);
        const actions=h('div',{class:'aa-passage-actions'},button(t('Düzelt','Edit'),()=>beginEdit(card,key,text)),button(t('Spoileri gizle','Hide spoiler'),async()=>{if(dirty)return;await request({action:'spoiler',id,expectedRevision:doc.revision,key,value:'closed'});await redraw();}));
        actions.prepend(Kit.menuButton({label:t('Kaynaklar','Sources'),icon:'list',items:entry.claims.map(claim=>{
          const source=current.evidence.find(row=>row.sourceId===claim.sourceId);
          return {label:(claim.passageId||source?.id||t('Kaynak','Source'))+' · '+(Number.isFinite(source?.time)?Kit.formatClock(source.time):t('Zamansız kaynak','Untimed source')),
            description:source?.text||claim.quote||'',onSelect:()=>citation(claim,current).querySelector('button').click()};
        })}));card.append(actions);passages.append(card);Kit.reveal(card,{duration:320,y:8,delay:Math.min(index,12)*60});
      }
      headerEdit.disabled=!firstEditable;
      const used=new Set(visibleClaims.map(claim=>claim.sourceId)),sources=current.evidence.filter(source=>used.has(source.sourceId));
      const quote=source=>{
        const block=h('blockquote',{class:'aa-source-quote'},h('p',{text:source.text}));
        const claim=visibleClaims.find(row=>row.sourceId===source.sourceId);
        if(source.sourceKind==='subtitle'&&Number.isFinite(source.time))block.append(button(Kit.formatClock(source.time)+' ↗',()=>seekSource(claim,current)));
        else block.append(h('span',{class:'aa-source-label',text:source.id}));
        return block;
      };
      if(sources.length){const quotes=h('section',{class:'aa-source-quotes','aria-label':t('Kaynak alıntıları','Source quotations')},sources.slice(0,2).map(quote));if(sources.length>2)quotes.append(Kit.accordion({title:t('Diğer kaynaklar ('+(sources.length-2)+')','More sources ('+(sources.length-2)+')'),children:sources.slice(2).map(quote)}));body.append(quotes);}
      if(metadata.genres?.length)body.append(h('div',{class:'aa-tags'},metadata.genres.map(genre=>Kit.chip(genre))));
      const copy=button(t('Yanıtı kopyala','Copy answer'),async()=>{
        if(dirty){status.textContent=t('Önce düzeltmeyi kaydedin veya düzenlemeyi iptal edin.','Save the correction or cancel editing first.');return;}
        const exported=AssistantArtifactExport.exportArtifact({doc,format:'json',expectedRevision:doc.revision,locale:window.UiLocale?.get?.()});
        if(!exported.ok)throw Error(t('Kopyalanamadı.','Copy failed.'));
        const projection=JSON.parse(exported.content).body;
        const rows=projection.type==='timeline'?projection.nodes:projection.sections.flatMap(section=>section.passages);
        const content=[projection.title,...rows.filter(row=>row.spoiler!=='closed').map(row=>projection.type==='timeline'?row.label:row.text)].filter(Boolean).join('\n\n');
        const copied=await window.api.copyText(content);if(copied===false||copied?.ok===false)throw Error(t('Kopyalanamadı.','Copy failed.'));
        status.textContent=t('Yanıt kopyalandı.','Answer copied.');
      });
      body.append(h('footer',{class:'aa-footer'},h('span',null,Kit.icon('check'),t('Yerel olarak kaydedildi','Saved locally')),copy));
    }
    document.body.append(dialog);dialog.showModal();Kit.bindDialog(dialog);void syncBrowserOcclusion();
    try{await redraw();}catch(error){status.textContent=error.message;}
  }
  window.AssistantArtifactsUI=Object.freeze({open});
})();
