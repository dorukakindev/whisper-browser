(()=>{
  'use strict';const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const failure=e=>window.MediaDiscoveryErrors?.message(e,window.UiLocale?.get?.())||e?.message||String(e);
  let active=null;
  async function open(query=''){
    if(active?.open){active.querySelector('input').focus();return;}
    const dialog=el('dialog','mhs-dialog media-surface'),header=el('header'),title=el('h2','',t('Search everywhere','Tüm kaynaklarda ara')),close=el('button','mh-action',t('Close','Kapat')),input=el('input'),results=el('div','mhs-results'),remote=el('div','mhs-remote'),status=el('p','mh-status'),online=el('button','mh-action',t('Search online films & series','Çevrimiçi film ve dizi ara'));
    dialog.dataset.uiUntranslated='';dialog.setAttribute('aria-label',title.textContent);close.type=online.type='button';close.onclick=()=>dialog.close();input.type='search';input.name='media-global-query';input.maxLength=200;input.autocomplete='off';input.value=String(query).slice(0,200);input.setAttribute('aria-label',title.textContent);status.setAttribute('role','status');header.append(title,close);dialog.append(header,input,status,results,online,el('small','mtd-extra-copy',t('Local matching does not send your search words online. The online button sends them to Cinemeta. Adding a result saves a watchlist entry, not a video.','Yerel eşleştirme arama sözcüklerini dışarı göndermez. Çevrimiçi düğmesi bunları Cinemeta’ya gönderir. Sonuç eklemek video değil izleme listesi kaydı oluşturur.')),remote);
    let data=null,version=0,onlineBusy=false,timer=null,artQueue=[],artActive=0;const current=()=>dialog.open&&dialog.isConnected;
    function error(e){if(current())status.textContent=failure(e);}
    function drawArt(slot,src){if(!current()||!slot.isConnected)return;const image=el('img');image.width=46;image.height=66;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>slot.remove();image.src=src;slot.append(image);}
    function pumpArt(){while(artActive<2&&artQueue.length){const task=artQueue.shift();if(!current()||!task.slot.isConnected)continue;artActive++;Promise.resolve(window.api.mediaCatalog({action:'poster',id:task.id})).then(r=>{if(typeof r?.image==='string'&&r.image.length<8000000&&/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(r.image))drawArt(task.slot,r.image);}).catch(()=>{}).finally(()=>{artActive--;pumpArt();});}}
    function row(parent,item,kind){const button=el('button','mhs-row'),copy=el('span');button.type='button';copy.append(el('strong','',item.title||t('Untitled','Başlıksız')),el('small','',[item.year,item.author,item.artist,item.album,kind==='remote'?t('Add to watchlist & view details','İzleneceklere ekle ve ayrıntıları aç'):''].filter(Boolean).join(' · ')));button.append(copy);parent.append(button);const slot=el('span','mhs-art');
      let art='';if(kind==='books'&&typeof item.cover==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(item.cover)&&item.cover.length<8000000)art=item.cover;
      else if(kind==='history')art=window.MediaHomeModel.thumbnail(item);
      else if(kind==='remote')try{const u=new URL(item.poster);if(u.protocol==='https:'&&!u.username&&!u.password&&['images.metahub.space','image.tmdb.org'].includes(u.hostname))art=u.href;}catch{}
      if(art){button.prepend(slot);queueMicrotask(()=>drawArt(slot,art));}else if(kind==='titles'&&item.hasPoster){button.prepend(slot);artQueue.push({slot,id:item.id});queueMicrotask(pumpArt);}
      button.onclick=async()=>{button.disabled=true;try{
        if(kind==='remote'){const r=await window.api.mediaDiscovery({action:'add',kind:item.kind,id:item.providerId});if(!current())return;if(!r?.ok)throw Object.assign(Error(r?.error||t('Could not add title.','Yapım eklenemedi.')), {errorCode:r?.errorCode});document.dispatchEvent(new Event('media-library-changed'));await window.MediaTitleUI.open(r.item.id);}
        else if(kind==='titles'){await window.MediaTitleUI.open(item.id);}
        else if(kind==='books'){dialog.close();await window.MediaShelfUI.openBook(item.id);}
        else if(kind==='music'){const r=await window.api.mediaShelf({action:'music-play',id:item.id});if(!current())return;if(!r?.ok)throw Error(r?.error||'Audio unavailable');dialog.close();await openLocalMedia(r.path);}
        else{dialog.close();await openWatchLibraryItem(item,Number(item.position)||0);}
      }catch(e){if(current())error(e);else{const notice=el('dialog','mhs-dialog media-surface'),message=el('p','',failure(e)),done=el('button','mh-action',t('Close','Kapat'));message.setAttribute('role','alert');done.type='button';done.onclick=()=>notice.close();notice.append(message,done);notice.addEventListener('close',()=>{notice.remove();void syncBrowserOcclusion();},{once:true});document.body.append(notice);notice.showModal();void syncBrowserOcclusion();}}finally{button.disabled=false;}};
    }
    function draw(){if(onlineBusy)return;artQueue=[];remote.replaceChildren();online.disabled=!input.value.trim();if(!data)return;results.replaceChildren();const groups=window.MediaSearchModel.groups(input.value,...data);let count=0;for(const group of groups){if(!group.total)continue;const section=el('section'),names={titles:t('Films & series','Filmler ve diziler'),books:t('Books','Kitaplar'),music:t('Music','Müzik'),history:t('Watch history','İzleme geçmişi')};section.append(el('h3','',names[group.kind]+' · '+group.total));if(group.total>40)section.append(el('small','mtd-extra-copy',t('First 40 matches shown. Refine your search.','İlk 40 eşleşme gösteriliyor. Aramayı daralt.')));for(const item of group.rows)row(section,item,group.kind);results.append(section);count+=group.total;}status.textContent=!input.value.trim()?t('Type a title, author or artist.','Bir başlık, yazar veya sanatçı yaz.'):count?t('Local matches: ','Yerel eşleşme: ')+count:t('No local matches. You can search online.','Yerel eşleşme yok. Çevrimiçi arayabilirsin.');}
    const subtitleResults=el('section','mhs-subtitles');results.after(subtitleResults);
    let subtitleVersion=0;
    async function searchSubtitles(){
      const request=++subtitleVersion,q=input.value.trim();subtitleResults.replaceChildren();if(q.length<2)return;
      subtitleResults.append(el('p','mh-status',t('Searching saved subtitles…','Kayıtlı altyazılar aranıyor…')));
      try{const found=await window.api.searchWatchLibrary(q);if(!current()||request!==subtitleVersion)return;
        subtitleResults.replaceChildren();const hits=found.flatMap(item=>(item.matches||[]).map(hit=>({item,hit}))).slice(0,40);
        if(hits.length&&status.textContent.includes(t('No local matches.','Yerel eşleşme yok.')))status.textContent=t('Saved subtitle matches: ','Kayıtlı altyazı eşleşmesi: ')+hits.length;
        subtitleResults.append(el('h3','',t('Saved subtitles & notes','Kayıtlı altyazılar ve notlar')));
        if(!hits.length)subtitleResults.append(el('p','mh-empty',t('No saved subtitle matches.','Kayıtlı altyazılarda eşleşme yok.')));
        for(const {item,hit} of hits){const button=el('button','mhs-row'),copy=el('span');button.type='button';copy.append(el('strong','',item.title),el('small','',String(hit.snippet||'')+' · '+Math.floor(hit.seconds/60)+':'+String(Math.floor(hit.seconds%60)).padStart(2,'0')));button.append(copy);button.onclick=async()=>{try{await openWatchLibraryItem(item,hit.seconds);dialog.close();}catch(e){if(current())error(e);}};subtitleResults.append(button);}
      }catch(e){if(current()&&request===subtitleVersion)subtitleResults.replaceChildren(el('p','mh-status',t('Saved subtitles could not be searched.','Kayıtlı altyazılar aranamadı.')));}
    }
    const passages=el('div','mhs-results');
    subtitleResults.after(passages);
    passages.before(el('small','mtd-extra-copy',t(
      'Local text: saved podcast transcripts, RSS titles and summaries, and the currently open PDF.',
      'Yerel metin: kayıtlı podcast dökümleri, RSS başlık ve özetleri, açık PDF.')));
    async function searchPassages(){
      const q=input.value.trim(), request=subtitleVersion, pdf=typeof player!=='undefined'?player.pdfReader:null;
      passages.replaceChildren();if(q.length<2)return;
      const fresh=()=>current()&&request===subtitleVersion;
      const group=async(label,lookup,show)=>{
        const section=el('section');section.append(el('h3','',label));passages.append(section);
        try{
          const rows=await lookup();
          if(!fresh())return;
          if(!rows.length)section.append(el('p','mh-empty',t('No matches in this source.','Bu kaynakta eşleşme yok.')));
          for(const row of rows){
            const button=el('button','mhs-row');button.type='button';
            button.append(el('strong','',row.title),el('small','',row.copy));
            button.onclick=async()=>{if(!fresh())return;button.disabled=true;
              try{await show(row,fresh);}catch(e){if(fresh())error(e);}
              finally{button.disabled=false;}};
            section.append(button);
          }
        }catch(e){if(fresh())section.append(el('p','mh-status',failure(e)));}
      };
      const checked=async promise=>{const result=await promise;if(!result?.ok)throw Error(result?.error||t('Source unavailable','Kaynak kullanılamıyor'));return result;};
      const podcast=action=>window.api.mediaShelf({action,query:q});
      void group(t('Podcast passages','Podcast pasajları'),async()=>{
        const r=await checked(podcast('podcast-search'));
        return r.rows.slice(0,20).map(row=>({...row,title:row.episodeTitle,copy:[row.showTitle,
          row.timed&&Number.isFinite(row.seconds)?pSecToTime(row.seconds):t('Read only','Salt okunur'),row.quote].join(' · ')}));
      },async(row,valid)=>{
        const resolve=()=>checked(window.api.mediaShelf({action:'podcast-search-resolve',query:q,token:row.token}));
        const value=(await resolve()).row;if(!valid())return;
        if(!await openPodcastResearchResult(value,{beforeSeek:resolve,isCancelled:()=>!valid()}))throw Error(t('Episode changed. Search again.','Bölüm değişti. Yeniden ara.'));
        dialog.close();
      });
      void group(t('RSS articles','RSS yazıları'),async()=>{
        const r=await checked(window.api.feedsRequest({action:'entries',kind:'article',query:q,limit:20}));
        return r.rows.map(row=>({...row,copy:[row.provenance?.map(p=>p.title).join(', '),
          row.spoiler==='marked'||row.links?.some(l=>l.state==='confirmed'&&l.watchStatus!=='completed')
            ?t('Open to review the source','Kaynağı incelemek için aç'):row.summary].filter(Boolean).join(' · ')}));
      },async(row,valid)=>{
        const r=await checked(window.api.feedsRequest({action:'entry',entryId:row.id}));
        if(!valid())return;
        if(r.entry?.revision!==row.revision)throw Error(t('Article changed. Search again.','Yazı değişti. Yeniden ara.'));
        await window.MediaHomeUI.openFeedEntry(row.id);dialog.close();
      });
      if(pdf)void group(t('Open PDF','Açık PDF'),async()=>{
        const r=await window.PdfTextSearch.search({numPages:pdf.pdf.numPages,getText:async page=>{
          const content=await (await pdf.pdf.getPage(page)).getTextContent();
          return content.items.map(i=>i.str||'').join(' ');
        }},q,{limit:20,isCurrent:()=>fresh()&&player.pdfReader===pdf});
        return r.matches.map(row=>({...row,title:document.getElementById('pdfReaderTitle').textContent,
          copy:t('Page ','Sayfa ')+row.page+' · '+row.excerpt}));
      },async row=>{
        if(player.pdfReader!==pdf||!await navigatePdfReading(pdf,row.page,{excursion:true}))throw Error(t('Document changed. Search again.','Belge değişti. Yeniden ara.'));
        dialog.close();
      });
    }
    input.oninput=()=>{subtitleVersion++;subtitleResults.replaceChildren();passages.replaceChildren();version++;onlineBusy=false;online.disabled=!input.value.trim();remote.replaceChildren();clearTimeout(timer);timer=setTimeout(()=>{draw();void searchSubtitles();void searchPassages();},200);};
    online.onclick=async()=>{const q=input.value.trim();if(!q)return;clearTimeout(timer);draw();const request=++version;onlineBusy=true;online.disabled=true;remote.replaceChildren();status.textContent=t('Searching online…','Çevrimiçi aranıyor…');const responses=await Promise.allSettled(['film','series'].map(kind=>window.api.mediaDiscovery({action:'list',kind,query:q})));if(!current()||request!==version)return;let count=0;const failed=[];for(let i=0;i<responses.length;i++){const r=responses[i].status==='fulfilled'?responses[i].value:null;if(!r?.ok){failed.push({kind:i===0?'film':'series',error:r||responses[i].reason});continue;}if(!r.rows?.length)continue;const section=el('section');section.append(el('h3','',i===0?t('Online films','Çevrimiçi filmler'):t('Online series','Çevrimiçi diziler')));for(const item of r.rows.slice(0,24)){row(section,item,'remote');count++;}remote.append(section);}status.textContent=failed.length===2?t('Online search could not be completed. Local results are kept. ','Çevrimiçi arama tamamlanamadı. Yerel sonuçlar korundu. ')+failure(failed[0].error):failed.length?t('Partial online results: ','Kısmi çevrimiçi sonuç: ')+count+' · '+(failed[0].kind==='film'?t('Films could not be loaded. ','Filmler alınamadı. '):t('Series could not be loaded. ','Diziler alınamadı. '))+failure(failed[0].error):count?t('Online matches: ','Çevrimiçi eşleşme: ')+count:t('No online matches.','Çevrimiçi eşleşme yok.');onlineBusy=false;online.disabled=false;};
    dialog.addEventListener('close',()=>{subtitleVersion++;window.api.cancelWatchLibrarySearch?.();},{once:true});
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);draw();void searchSubtitles();void searchPassages();}};
    const opener=document.activeElement;dialog.addEventListener('close',()=>{version++;artQueue=[];clearTimeout(timer);active=null;dialog.remove();if(opener?.isConnected)opener.focus();void syncBrowserOcclusion();},{once:true});document.body.append(dialog);active=dialog;dialog.showModal();void syncBrowserOcclusion();input.focus();status.textContent=t('Loading local library…','Yerel kütüphane yükleniyor…');
    const loaded=await Promise.allSettled([window.api.mediaCatalog({action:'list'}),window.api.mediaShelf({action:'list'}),window.api.listWatchLibrary()]);if(!current())return;
    const value=i=>loaded[i].status==='fulfilled'?loaded[i].value:null;data=[value(0)?.items||[],value(1)||{},Array.isArray(value(2))?value(2):[]];draw();void searchSubtitles();void searchPassages();if(loaded.some(r=>r.status==='rejected')||value(0)?.ok===false||value(1)?.ok===false)status.textContent=t('Some local sources could not load. Available results are shown.','Bazı yerel kaynaklar yüklenemedi. Erişilen sonuçlar gösteriliyor.');
  }
  window.MediaSearchUI=Object.freeze({open});
})();
