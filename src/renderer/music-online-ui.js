(()=>{
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
 function mount(root){
  let generation=0,disposed=false,playing=null;
  const api=async(op,args={})=>{const r=await window.api.musicAnalysis({action:'online',op,...args});if(!r?.ok)throw Error(r?.error||t('Catalog request failed.','Katalog isteği başarısız.'));return r;};
  const button=(label,fn,cls='ml-button')=>{const n=el('button',cls,label);n.type='button';n.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>note(e.message,true)));return n;};
  const heading=el('h2','',t('Discover beyond your library','Arşivinin dışında keşfet'));
  const description=el('p','ml-search-explanation',t('Choose the correct recording, then discover its artist radio. These are catalog recommendations; their audio has not been compared with CLAP.','Doğru kaydı seç, ardından sanatçı radyosundan keşfet. Bunlar katalog önerileridir; sesleri CLAP ile karşılaştırılmadı.'));
  const form=el('form','ml-online-search'),query=el('input');query.placeholder=t('Song and artist','Şarkı ve sanatçı');query.maxLength=200;query.setAttribute('aria-label',query.placeholder);query.required=true;
  const search=button(t('Find recording','Kaydı bul'),()=>work('search',{query:query.value}),'ml-button ml-primary');const saved=button(t('Saved discoveries','Kaydedilen keşifler'),()=>work('list'));const stop=button(t('Cancel','Durdur'),async()=>{++generation;await api('cancel');busy(false);note(t('Stopped.','Durduruldu.'));});stop.hidden=true;
  form.append(query,search,saved,stop);form.addEventListener('submit',e=>{e.preventDefault();search.click();});
  const excludeLabel=el('label','ml-exclude'),exclude=el('input');exclude.type='checkbox';exclude.checked=true;excludeLabel.append(exclude,document.createTextNode(t('Exclude the same artist','Aynı sanatçıyı dışla')));
  const status=el('p','ml-status');status.setAttribute('role','status');const player=el('audio','ml-audio');player.controls=true;player.hidden=true;player.preload='none';
  const list=el('div','ml-online-results');root.append(heading,description,form,excludeLabel,status,player,list);
  function note(text,error=false){if(disposed)return;status.textContent=text;status.classList.toggle('ml-error',error);}
  function busy(value){search.disabled=value;saved.disabled=value;query.disabled=value;stop.hidden=!value;list.querySelectorAll('button').forEach(b=>b.disabled=value);}
  async function work(op,args={}){const mine=++generation;busy(true);note(t('Loading catalog…','Katalog yükleniyor…'));try{const r=await api(op,args);if(disposed||mine!==generation)return;paint(r.results,op,r.kind);note(r.results.length?t(`${r.results.length} results · Deezer catalog`,`${r.results.length} sonuç · Deezer kataloğu`):t('No results. Try the artist and a shorter title.','Sonuç yok. Sanatçı adı ve daha kısa başlıkla dene.'));}catch(error){if(mine===generation&&!disposed)throw error;}finally{if(mine===generation)busy(false);}}
  function paint(rows,op,kind){list.replaceChildren();for(const row of rows){const item=el('article','ml-hit'),copy=el('div','ml-hit-copy');if(row.art){const image=el('img','ml-online-cover');image.src=row.art;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';item.append(image);}
   copy.append(el('h3','',row.title),el('p','',row.artist),el('small','',t('Catalog result · audio similarity unverified','Katalog sonucu · ses benzerliği doğrulanmadı')));item.append(copy);
   if(kind==='identity')item.append(button(t('Discover from this','Bununla keşfet'),()=>work('discover',{id:row.id,excludeArtist:exclude.checked})));
   item.append(button(t('Preview','Önizle'),async()=>{const mine=++generation;player.pause();const r=await api('preview',{id:row.id});if(disposed||mine!==generation)return;playing=row.id;player.src=r.url;player.hidden=false;await player.play();note(t('Preview · '+row.title,'Önizleme · '+row.title));}),button(t('Deezer page','Deezer sayfası'),()=>window.api.openExternal(row.url)),button(op==='list'?t('Remove','Kaldır'):t('Save','Kaydet'),async()=>{await api(op==='list'?'remove':'save',{id:row.id});note(t('Discovery list updated.','Keşif listesi güncellendi.'));if(op==='list')await work('list');}));list.append(item);}}
  player.addEventListener('play',()=>document.querySelectorAll('audio,video').forEach(n=>{if(n!==player)n.pause();}));player.addEventListener('error',()=>{if(playing)note(t('Preview expired or is unavailable. Click Preview to refresh.','Önizlemenin süresi doldu veya kullanılamıyor. Yenilemek için Önizle’ye tıkla.'),true);});
  root.addEventListener('music-reference',event=>{++generation;void api('cancel').catch(()=>{});query.value=[event.detail?.artist,event.detail?.title].filter(Boolean).join(' ').slice(0,200);player.pause();list.replaceChildren();busy(false);});
  root.addEventListener('music-dispose',()=>{disposed=true;++generation;void api('cancel').catch(()=>{});player.pause();player.removeAttribute('src');player.load();},{once:true});
 }
 window.MusicOnlineUI=Object.freeze({mount});
})();
