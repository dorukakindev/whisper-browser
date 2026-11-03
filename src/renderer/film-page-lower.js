(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
 const views=new WeakMap();let sequence=0;
 function mount(page,item){
  const body=page.querySelector('.mtd-body,.md-page-lower');if(!body||body.querySelector('.film-dossier-overview'))return null;
  const main=body.querySelector(':scope > .mtd-main,:scope > .md-page-story'),aside=body.querySelector(':scope > .mtd-aside,:scope > .md-page-aside');if(!main||!aside)return null;
  body.classList.add('film-dossier');const overview=el('section','film-dossier-overview'),story=main.matches('.md-page-story')?main:main.querySelector('.mtd-story');
  const extras=main.querySelector('.film-extra-section'),episodes=main.querySelector('.mtd-episodes'),related=[...main.children].filter(n=>n.classList.contains('mtd-related'));
  // Move existing owners, never rebuild forms or replace handlers/drafts.
  if(extras)body.append(extras);if(episodes)body.append(episodes);for(const n of related)body.append(n);
  const oldCast=main.querySelector('.mtd-cast'),oldCredits=aside.querySelector(':scope > .md-option-group'),oldCastId=oldCast?.id||oldCredits?.id;if(oldCredits?.id)oldCredits.removeAttribute('id');
  if(oldCast){if(oldCast.previousElementSibling?.tagName==='H2')oldCast.previousElementSibling.remove();oldCast.remove();}
  aside.querySelector('.md-cast')?.remove();
  if(story)overview.append(story);overview.append(aside);body.prepend(overview);if(main!==story){for(const child of [...main.children])body.append(child);main.remove();}
  aside.classList.add('film-dossier-facts');const title=el('h2','film-facts-heading',t('Film details','Filmin künyesi')),existing=aside.querySelector(':scope > dl'),facts=existing||el('dl');
  const pairs=[[t('Release','Yapım'),[item.year,item.kind==='series'?t('Series','Dizi'):t('Film','Film')].filter(Boolean).join(' · ')],[t('Runtime','Süre'),Number(item.runtime)>0?item.runtime+' '+t('min','dakika'):'']];
  if(!existing){if(item.directors?.length)pairs.unshift([t('Director / creator','Yönetmen / yaratıcı'),item.directors.join(', ')]);if(item.originalTitle&&item.originalTitle!==item.title)pairs.push([t('Original title','Özgün adı'),item.originalTitle]);}
  for(const [label,value]of pairs)if(value)facts.append(el('dt','',label),el('dd','',String(value)));
  const options=aside.querySelector(':scope > .md-detail-options')||el('details','film-dossier-options');options.classList.add('film-dossier-options');
  if(!options.querySelector(':scope > summary'))options.append(el('summary','',t('Personal status & sources','Kişisel durum ve kaynaklar')));
  for(const child of [...aside.children])if(child!==existing&&child!==options)options.append(child);
  for(const h of options.querySelectorAll(':scope > .md-option-group > h3'))h.remove();
  const viewKey=JSON.stringify([item.id,item.providerId,item.kind,item.year]);let view=views.get(page);if(view?.key!==viewKey){view={key:viewKey,open:false};views.set(page,view);}options.open=view.open;options.addEventListener('toggle',()=>{if(options.isConnected)view.open=options.open;});options.querySelector(':scope > summary')?.addEventListener('click',()=>{view.open=!options.open;});
  aside.replaceChildren(title,facts,options);
  const names=(Array.isArray(item.cast)?item.cast:[]).filter(n=>typeof n==='string'&&n.trim()).slice(0,12),cast=el('section','film-cast-scene'),heading=el('div','film-cast-heading'),copy=el('div'),slot=el('div','film-cast-slot'),status=el('p','film-credits-status');
  cast.id=oldCastId||'film-cast-scene-'+(++sequence);copy.append(el('h2','',t('Cast & creators','Oyuncular ve yaratıcılar')));heading.append(copy);cast.append(heading,slot,status);status.setAttribute('role','status');
  if(names.length){const list=el('ul','film-cast-names');for(const name of names){const row=el('li'),avatar=el('span','film-cast-initial',name.trim().slice(0,1).toLocaleUpperCase());avatar.setAttribute('aria-hidden','true');row.append(avatar,el('span','',name));list.append(row);}slot.append(list);}else slot.append(el('p','film-credits-empty',t('Explore the credited people behind this title.','Bu yapımın oyuncularını ve yaratıcılarını incele.')));
  overview.after(cast);const credits=window.FilmContextFeatures?.bindCredits?.(page,slot);
  if(credits){const load=el('button','film-credits-load',t('Explore cast','Oyuncuları incele'));load.type='button';load.onclick=async()=>{if(load.disabled)return;load.disabled=true;cast.setAttribute('aria-busy','true');status.textContent=t('Loading credited people…','Kişi bilgileri yükleniyor…');try{const ok=await credits.load();if(!cast.isConnected)return;if(ok){load.textContent=t('Refresh cast','Oyuncuları yenile');status.textContent='';}else status.textContent=t('Credits could not be loaded. Your saved information is kept; try again.','Oyuncu bilgileri alınamadı. Kayıtlı bilgiler korundu; yeniden deneyebilirsin.');}finally{if(cast.isConnected){load.disabled=false;cast.setAttribute('aria-busy','false');}}};heading.append(load);}
  if(episodes)cast.after(episodes);
  // Overview -> credits -> review -> extras -> existing viewing and advanced tools.
  const review=body.querySelector(':scope > .mtd-review');if(review){const anchor=episodes||cast;anchor.after(review);}
  const tools=[...body.children].filter(n=>n.matches('.fw-workspace,.daily-title'));
  if(tools.length){const details=el('details','film-viewing-tools');details.append(el('summary','',t('Viewing & source tools','İzleme ve kaynak araçları')),...tools);details.open=!!view.toolsOpen;details.addEventListener('toggle',()=>{if(details.isConnected)view.toolsOpen=details.open;});details.querySelector('summary').addEventListener('click',()=>{view.toolsOpen=!details.open;});body.append(details);}
  for(const link of page.querySelectorAll('.film-section-link'))if(oldCastId&&link.getAttribute('aria-controls')===oldCastId)link.onclick=event=>{cast.scrollIntoView({behavior:event.detail===0||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});const h=cast.querySelector('h2');h.tabIndex=-1;h.focus({preventScroll:true});};
  return {dispose:()=>{}};
 }
 window.FilmPageLower=Object.freeze({mount});
})();
