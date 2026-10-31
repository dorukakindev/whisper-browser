(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const states=new WeakMap();let sequence=0;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
 function enhance(page,item){
  states.get(page)?.();const disposers=[];
  const nav=node('nav','film-page-navigation');nav.setAttribute('aria-label',t('On this film page','Film sayfasında gezinme'));
  for(const [selector,en,tr]of [['.mtd-story,.md-page-story','Story','Konu'],['.film-review-section','Reviews & insights','Yorumlar ve analiz'],['.mtd-cast,.md-page-aside > .md-option-group','Cast & credits','Oyuncular ve bilgiler'],['.mtd-episodes','Episodes','Bölümler']]){
   const section=page.querySelector(selector);if(!section)continue;
   section.id||='film-section-'+(++sequence);const button=node('button','film-section-link',t(en,tr));button.type='button';button.setAttribute('aria-controls',section.id);
   button.onclick=event=>{const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;section.scrollIntoView({behavior:event.detail===0||reduced?'auto':'smooth',block:'start'});const heading=section.querySelector('h2,h3')||section;heading.tabIndex=-1;heading.focus({preventScroll:true});};nav.append(button);
  }
  const plot=page.querySelector('.mtd-synopsis,.md-synopsis');if(plot){
   const toggle=node('button','film-section-link film-plot-toggle');toggle.type='button';const update=()=>{plot.hidden=page.dataset.plotHidden==='true';toggle.textContent=plot.hidden?t('Show story','Konuyu göster'):t('Hide story','Konuyu gizle');toggle.setAttribute('aria-pressed',String(plot.hidden));};toggle.onclick=()=>{page.dataset.plotHidden=String(!plot.hidden);update();};update();nav.append(toggle);
  }
  const imdb=item.imdbId||item.providerId;const tmdb=/^(movie|tv):([1-9]\d*)$/.exec(item.tmdbId||'');const link=/^tt\d{7,12}$/.test(imdb||'')?'https://www.imdb.com/title/'+imdb+'/':tmdb?'https://www.themoviedb.org/'+tmdb[1]+'/'+tmdb[2]:'';
  if(link){const copy=node('button','film-section-link',t('Copy film link','Film bağlantısını kopyala'));copy.type='button';copy.onclick=async()=>{copy.disabled=true;try{const result=await window.api.copyText(link);if(result?.ok===false)throw Error(result.error||t('Could not copy','Kopyalanamadı'));copy.textContent=t('Link copied','Bağlantı kopyalandı');}catch{copy.textContent=t('Could not copy · retry','Kopyalanamadı · yeniden dene');}finally{copy.disabled=false;}};nav.append(copy);}
  const hero=page.querySelector('.mtd-hero,.md-page-hero');hero?.after(nav);
  const poster=page.querySelector('.mtd-poster,.md-detail-poster');if(poster){
   let posterDialog=null;disposers.push(()=>posterDialog?.close());
   const enlarge=node('button','film-poster-open',t('Enlarge poster','Afişi büyüt'));enlarge.type='button';enlarge.disabled=!poster.querySelector('img');enlarge.setAttribute('aria-label',item.title+' · '+t('Enlarge poster','Afişi büyüt'));poster.append(enlarge);
   const observer=new MutationObserver(()=>{enlarge.disabled=!poster.querySelector('img');if(!poster.contains(enlarge))poster.append(enlarge);});observer.observe(poster,{childList:true});disposers.push(()=>observer.disconnect(),()=>enlarge.remove());
   enlarge.onclick=()=>{
    const src=poster.querySelector('img')?.src;if(!src)return;
    const dialog=node('dialog','film-poster-dialog media-surface'),header=node('header',''),heading=node('h2','',item.title),close=node('button','mh-action',t('Close','Kapat')),image=node('img','');heading.id='film-poster-heading-'+(++sequence);dialog.setAttribute('aria-labelledby',heading.id);image.src=src;image.alt=item.title;close.type='button';close.onclick=()=>dialog.close();header.append(heading,close);dialog.append(header,image);posterDialog=dialog;document.body.append(dialog);dialog.addEventListener('close',()=>{posterDialog=null;dialog.remove();if(enlarge.isConnected)enlarge.focus({preventScroll:true});if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();},{once:true});dialog.showModal();close.focus();if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();
   };
  }
  const dispose=()=>{disposers.forEach(fn=>fn());nav.remove();page.removeEventListener('close',dispose);states.delete(page);};page.addEventListener('close',dispose,{once:true});states.set(page,dispose);
 }
 window.FilmPageEnhancements=Object.freeze({enhance});
})();
