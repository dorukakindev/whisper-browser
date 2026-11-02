(() => {
 'use strict';
 const handles=name=>name==='prepare_media_selection';
 const check=r=>{if(!r?.ok)throw Error(r?.error||'Media selection evidence could not be read.');return r;};
 async function execute(name,args,{guard}){
  if(!handles(name))throw Error('Media selection action unavailable.');
  guard();const engine=window.AssistantMediaSelection;if(!engine)throw Error('Media selection is unavailable. Reopen the application.');
  const query=engine.validate(args);
  // Validate before IPC. These are existing read owners, never discovery/API analysis or writes.
  const catalog=check(await window.api.mediaCatalog({action:'list'}));guard();
  const taste=check(await window.api.mediaShelf({action:'list'}));guard();
  const result=engine.prepare(catalog.items,taste.taste,query);guard();return result;
 }
 window.AssistantSelectionActions=Object.freeze({handles,execute});
})();
