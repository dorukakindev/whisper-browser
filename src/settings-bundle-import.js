'use strict';
// Stage every JSON store through its canonical validator before installing any file.
function commitSettingsBundle({entries,watchStore,watchLibrary,watchPath,noteStore,annotations,writeTransaction}) {
 const staged=[...entries];let importedNotes=0;
 if(watchLibrary){
  watchStore.loadDocument();
  const prepared=watchStore.prepareReplaceItems(watchLibrary,{restoreRemoved:true});
  staged.push({filePath:watchPath,value:prepared.document});
 }
 if(annotations){
  const prepared=noteStore.prepareImportMissing(annotations);importedNotes=prepared.count;
  staged.push({filePath:noteStore.filePath,value:prepared.document});
 }
 if(staged.length)writeTransaction(staged);
 if(watchLibrary)watchStore.resetCache();
 return {importedNotes};
}
module.exports={commitSettingsBundle};
