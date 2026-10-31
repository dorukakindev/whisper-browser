'use strict';
const {editorMessages,semanticReviewMessages,semanticReviewAccepted}=require('./dub-editor-request');
const {safeShortening}=require('./dub-text-guard');

// One bounded edit and, when it changes source-bound text, an independent
// meaning review. A declined/failed edit never licenses altered speech.
async function editSpeech({text,seconds,context={},config,endpoint,fetch,readBuffer,requestOptions={}}) {
  async function ask(messages,review=false) {
    const response=await fetch(endpoint,{
      method:'POST',signal:AbortSignal.timeout(review?30000:45000),
      headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{})},
      body:JSON.stringify({model:config.model,temperature:review?0:0.2,max_tokens:review?200:2400,...requestOptions,messages}),
    });
    if(!response.ok)throw Object.assign(new Error(`Dublaj metni servisi: HTTP ${response.status}`),{
      code:'DUB_EDITOR_UNAVAILABLE',reason:response.status===401||response.status===403?'authentication':response.status===429?'rate_limit':'provider'});
    const data=JSON.parse((await readBuffer(response,32768)).toString('utf8'));
    const choice=data.choices?.[0],content=choice?.message?.content;
    if(choice?.finish_reason==='length')throw Object.assign(new Error('Speech editor output limit'),{reason:'output_limit'});
    if(typeof content!=='string'||!content.trim())throw Object.assign(new Error('Empty speech editor response'),{reason:'empty_reply'});
    return content.trim();
  }
  const proposed=await ask(editorMessages(text,seconds,context));
  if(!safeShortening(text,proposed,{natural:context.mode==='natural'}))
    throw Object.assign(new Error('Konuşma düzenlemesi anlam denetiminden geçmedi.'),{reason:'meaning_guard'});
  if(proposed!==text&&context.original){
    const verdict=await ask(semanticReviewMessages(text,proposed,context),true);
    if(!semanticReviewAccepted(verdict))
      throw Object.assign(new Error('Kaynak anlamı doğrulanamadı; mevcut metin korunuyor.'),{reason:'meaning_guard'});
  }
  return proposed;
}
module.exports={editSpeech};
