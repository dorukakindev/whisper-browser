(()=>{
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const safe=value=>typeof value==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w1280|w185)\/[a-zA-Z0-9._-]+$/.test(value);
  function mount(parent,item){
    if(!/^(movie|tv):[1-9]\d*$/.test(item.tmdbId||''))return;
    const button=el('button','mh-action',t('Photos','Görseller'));button.type='button';button.dataset.titleAction='gallery';button.dataset.galleryTitle=item.id;parent.append(button);
    button.onclick=()=>void open(item,button);
  }
  async function open(item,opener,suppliedRows=null){
    const dialog=el('dialog','mtd-gallery media-surface');dialog.dataset.uiUntranslated='';dialog.setAttribute('aria-label',item.title+' · '+t('Photos','Görseller'));
    const header=el('header'),heading=el('h2','',item.title),close=el('button','mh-action',t('Close','Kapat')),status=el('p','mtd-extra-status');status.setAttribute('role','status');close.type='button';close.onclick=()=>dialog.close();header.append(heading,close);
    const stage=el('div','mtd-gallery-stage'),image=el('img'),controls=el('nav','mtd-gallery-controls'),previous=el('button','mh-action',t('Previous','Önceki')),next=el('button','mh-action',t('Next','Sonraki')),counter=el('span'),thumbs=el('div','mtd-gallery-thumbs'),retry=el('button','mh-action',t('Retry','Yeniden dene'));
    for(const n of [previous,next,retry])n.type='button';image.alt='';image.width=1280;image.height=720;image.referrerPolicy='no-referrer';stage.append(image);controls.append(previous,counter,next);dialog.append(header,status,stage,controls,thumbs,retry,el('small','mtd-extra-copy','TMDB'));
    let rows=[],index=0,request=0;retry.hidden=true;previous.disabled=next.disabled=true;
    const current=()=>dialog.open&&dialog.isConnected;
    function show(at){if(!rows.length)return;index=(at+rows.length)%rows.length;status.textContent=t('Loading image…','Görsel yükleniyor…');image.src=rows[index].url;counter.textContent=(index+1)+' / '+rows.length;previous.disabled=next.disabled=rows.length<2;retry.hidden=true;drawThumbs();}
    function drawThumbs(){thumbs.replaceChildren();const start=Math.max(0,Math.min(index-5,rows.length-12));for(let i=start;i<Math.min(rows.length,start+12);i++){const b=el('button');b.type='button';b.setAttribute('aria-label',t('Image ','Görsel ')+(i+1));b.setAttribute('aria-current',String(i===index));const img=el('img');img.width=100;img.height=65;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=rows[i].thumbnail;b.append(img);b.onclick=()=>show(i);thumbs.append(b);}}
    image.onload=()=>{if(current())status.textContent=t('Use the arrows to browse.','Görseller arasında oklarla gezinebilirsin.');};
    image.onerror=()=>{if(current()){status.textContent=t('This image could not load. Try again or choose another.','Bu görsel yüklenemedi. Yeniden dene veya başka görsele geç.');retry.hidden=false;}};
    async function load(){const version=++request;retry.hidden=true;status.textContent=t('Loading photos…','Görseller alınıyor…');try{const r=suppliedRows?{ok:true,rows:suppliedRows}:await window.api.mediaCatalog({action:'metadata-images',id:item.id});if(!current()||version!==request)return;if(!r?.ok)throw Error(r?.error||t('Could not load photos.','Görseller alınamadı.'));rows=(r.rows||[]).filter(r=>safe(r.url)&&safe(r.thumbnail)).slice(0,100);if(!rows.length){status.textContent=t('No photos are available on TMDB for this title.','TMDB’de bu yapım için görsel bulunamadı.');stage.hidden=true;controls.hidden=true;return;}show(0);}catch(e){if(current()&&version===request){status.textContent=e.message;retry.hidden=false;}}}
    retry.onclick=()=>rows.length?show(index):void load();previous.onclick=()=>show(index-1);next.onclick=()=>show(index+1);
    dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowLeft'?-1:1));}});
    dialog.addEventListener('close',()=>{request++;image.removeAttribute('src');dialog.remove();requestAnimationFrame(()=>{const target=opener?.isConnected?opener:[...document.querySelectorAll('[data-gallery-title]')].find(n=>n.dataset.galleryTitle===item.id&&n.closest('dialog')?.open);if(target)target.focus({preventScroll:true});});void syncBrowserOcclusion();},{once:true});document.body.append(dialog);dialog.showModal();void syncBrowserOcclusion();close.focus();await load();
  }
  window.TitleGalleryUI=Object.freeze({mount,openSources:(item,opener,rows)=>open(item,opener,rows)});
})();
