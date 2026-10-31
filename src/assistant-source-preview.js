(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantSourcePreview=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const clean=value=>typeof value==='string'?value.replace(/\0/g,'').slice(0,160):'';
 function clock(value){const n=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;return (n>=3600?Math.floor(n/3600)+':'+String(Math.floor(n/60)%60).padStart(2,'0'):Math.floor(n/60))+':'+String(n%60).padStart(2,'0');}
 function build(input={}){
  const tr=input.locale==='tr',t=(en,turkish)=>tr?turkish:en,source=input.selection;
  if(source){
   const book=['book-page','book-chapter'].includes(source.type),selected=!!source.selectedText;
   return {summary:[book?t('Book','Kitap'):t('Selected source','Seçili kaynak'),clean(source.chapter),selected?t('Selected passage','Seçili pasaj'):book?t('Current page / chapter','Açık sayfa / bölüm'):t('Provided metadata','Sağlanan bilgiler')].filter(Boolean).join(' · '),
    detail:selected?t('Your selected passage is attached; other pages are not attached automatically.','Seçtiğin pasaj ekli; diğer sayfalar kendiliğinden eklenmez.'):t('Only the provided text is attached. The complete work is not attached.','Yalnız sağlanan metin ekli. Eserin tamamı ekli değil.')};
  }
  const transcript=input.transcript===true,video=input.video===true,scope=['full','nearby'].includes(input.scope)?input.scope:'watched';
  const position=Number.isFinite(input.position)?Math.max(0,input.position):0;
  const scopeText=scope==='full'?t('All available captions','Yüklü altyazının tamamı'):scope==='nearby'?t('Nearby captions','Yakın altyazılar')+' · '+clock(Math.max(0,position-180))+'–'+clock(position+180):t('Watched captions','İzlenen altyazılar')+' · 0:00–'+clock(position);
  const languages=[clean(input.sourceLanguage),clean(input.targetLanguage)].filter(value=>value&&!['yok','belirtilmedi','unknown','none'].includes(value));
  const summary=transcript?scopeText+(languages.length?' · '+languages.join(' → '):''):video?t('Video · no captions attached','Video · ekli altyazı yok'):input.page?t('Current web page','Açık web sayfası'):t('No text source attached','Ekli metin kaynağı yok');
  const range=input.range,validRange=video&&Number.isFinite(range?.start)&&Number.isFinite(range?.end)&&range.start>=0&&range.end>range.start;
  const detail=[transcript?t('Answers retrieve bounded excerpts from this scope; selecting all captions does not mean every line is sent.','Yanıt için bu kapsamdan sınırlı alıntılar seçilir; tüm altyazıyı seçmek her satırın gönderildiği anlamına gelmez.'):t('Source text will be checked when you send the question. Video images are not analyzed.','Soru gönderildiğinde kaynak metni okunur. Video görüntüsü analiz edilmez.'),
   validRange?t('New Whisper / translation job range: ','Yeni Whisper / çeviri işlem aralığı: ')+clock(range.start)+'–'+clock(range.end)+t('. This is separate from the question’s caption scope.','. Bu, sorunun altyazı kapsamından ayrıdır.'):''].filter(Boolean).join(' ');
  return {summary,detail};
 }
 return Object.freeze({build});
});
