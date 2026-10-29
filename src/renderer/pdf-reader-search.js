(() => {
 'use strict';
 const $=id=>document.getElementById(id),t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const panel=$('pdfFindPanel'),input=$('pdfFindText'),status=$('pdfFindStatus');if(!panel||!window.PdfTextSearch)return;
 let sequence=0,source=null,matches=[],index=-1,jumping=0;
 const visible=()=>!!window.PdfReaderExperience?.context();
 const current=(reader,request)=>request===sequence&&player.pdfReader===reader&&!panel.classList.contains('hidden')&&visible();
 function controls(){for(const id of ['pdfFindPrevious','pdfFindNext'])$(id).disabled=!matches.length;}
 function labels(){
  $('pdfFindOpen').title=t('Find in this PDF (Ctrl+F)','PDF içinde ara (Ctrl+F)');$('pdfFindOpen').setAttribute('aria-label',$('pdfFindOpen').title);
  input.placeholder=t('Search this PDF…','PDF içinde ara…');input.setAttribute('aria-label',input.placeholder);
  $('pdfFindSubmit').textContent=t('Find','Bul');$('pdfFindPrevious').setAttribute('aria-label',t('Previous match','Önceki eşleşme'));$('pdfFindNext').setAttribute('aria-label',t('Next match','Sonraki eşleşme'));
  $('pdfFindClose').setAttribute('aria-label',t('Close search','Aramayı kapat'));
 }
 function reset(){sequence++;jumping++;source=null;matches=[];index=-1;status.textContent='';$('pdfFindExcerpt').textContent='';$('pdfFindScope').textContent='';controls();}
 function close(focus=true){reset();panel.classList.add('hidden');$('pdfFindOpen').setAttribute('aria-expanded','false');if(focus&&visible())$('pdfFindOpen').focus();}
 function open(){if(!visible()||document.querySelector('dialog[open]'))return;panel.classList.remove('hidden');$('pdfFindOpen').setAttribute('aria-expanded','true');input.focus();input.select();}
 async function jump(direction){
  const reader=source,request=sequence,move=++jumping;if(!matches.length||!current(reader,request))return;
  index=(index+direction+matches.length)%matches.length;const hit=matches[index];
  status.textContent=t(`Match ${index+1} / ${matches.length} · page ${hit.page}`,`Eşleşme ${index+1} / ${matches.length} · sayfa ${hit.page}`);
  try{
   const page=$('pdfReaderPage');page.value=String(hit.page);page.dispatchEvent(new Event('change'));
   await renderPdfReaderPage(hit.page);
   if(move!==jumping||!current(reader,request))return;
   reader.pages.get(hit.page)?.article?.scrollIntoView({block:'start',behavior:'instant'});
   $('pdfFindExcerpt').textContent=hit.excerpt;
  }catch{
   if(move===jumping&&current(reader,request)){
    status.textContent=t('Could not open this match. Try another result.','Bu eşleşme açılamadı. Başka bir sonucu dene.');
    $('pdfFindExcerpt').textContent='';
   }
  }
 }
 async function search(event){
  event?.preventDefault();reset();$('pdfFindExcerpt').textContent='';const reader=player.pdfReader,request=sequence;if(!reader||!visible())return;
  const query=input.value.trim();if(query.length<2){status.textContent=t('Enter at least two characters.','En az iki karakter yaz.');return;}
  source=reader;status.textContent=t('Searching…','Aranıyor…');
  try{
   const result=await window.PdfTextSearch.search({numPages:reader.pdf.numPages,getText:async page=>{const loaded=await reader.pdf.getPage(page);if(!current(reader,request))return '';const content=await loaded.getTextContent();return content.items.map(item=>item.str||'').join(' ');} },query,{isCurrent:()=>current(reader,request),onProgress:value=>{if(current(reader,request))status.textContent=t(`Searching page ${value.scanned} / ${value.total}…`,`Sayfa ${value.scanned} / ${value.total} aranıyor…`);}});
   if(!current(reader,request)||result.cancelled)return;
   matches=result.matches;controls();
   if(matches.length)await jump(1);
   else status.textContent=t('No matches.','Eşleşme yok.');
   if(!current(reader,request))return;
   const notes=[];if(result.truncated)notes.push(t('Search limit reached; results cover only the scanned text.','Arama sınırına ulaşıldı; sonuçlar yalnız taranan metne ait.'));if(result.failedPages.length)notes.push(t(`${result.failedPages.length} pages could not be searched.`,`${result.failedPages.length} sayfa aranamadı.`));
   $('pdfFindScope').textContent=notes.join(' ');
  }catch(error){if(current(reader,request))status.textContent=t('PDF search failed: ','PDF araması başarısız: ')+error.message;}
 }
 input.oninput=()=>{reset();$('pdfFindExcerpt').textContent='';$('pdfFindScope').textContent='';};
 const navigate=direction=>void jump(direction);
 $('pdfFindForm').onsubmit=search;$('pdfFindOpen').onclick=open;$('pdfFindClose').onclick=()=>close();$('pdfFindPrevious').onclick=()=>navigate(-1);$('pdfFindNext').onclick=()=>navigate(1);
 document.addEventListener('keydown',event=>{
  if(!visible()||document.querySelector('dialog[open]'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopImmediatePropagation();open();}
  else if(event.key==='Escape'&&!panel.classList.contains('hidden')){event.preventDefault();event.stopImmediatePropagation();close();}
 },true);
 document.addEventListener('ui-locale-change',labels);labels();controls();
 window.PdfReaderSearchUI=Object.freeze({open,close,reset:()=>{close(false);input.value='';$('pdfFindExcerpt').textContent='';$('pdfFindScope').textContent='';}});
})();
