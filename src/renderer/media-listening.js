(() => {
  'use strict';
  const graphs=new WeakMap();let prefs={film:'off',music:'off',voice:'dialogue'};
  const settings={night:{threshold:-32,knee:18,ratio:6,attack:.006,release:.35},dialogue:{threshold:-28,knee:20,ratio:3,attack:.008,release:.28},guard:{threshold:-14,knee:4,ratio:12,attack:.002,release:.2}};
  const video=document.getElementById('playerVideo');
  function profile(node){return node===video?prefs[/\.(?:mp3|wav|m4a|aac|flac|ogg|opus)(?:[?#]|$)/i.test(player.localPath||node.currentSrc)?'music':'film']:prefs.voice;}
  async function apply(node){
    if(!node)return;
    const key=profile(node),saved=graphs.get(node);
    if(node===video&&!window.NativePlayerUI?.active())return;
    if(node===video&&window.NativePlayerUI?.active()){if(saved){saved.source.disconnect();saved.compressor.disconnect();saved.source.connect(saved.context.destination);}const r=await window.NativePlayerUI.command('profile',key);if(!r?.ok)throw Error(r?.error||'Native listening profile could not be applied.');return;}
    // Never route a remote, non-CORS media source into WebAudio: it could become silent.
    if(/^https?:/i.test(node.currentSrc||node.src))return;
    if(!saved&&(!settings[key]||!node.currentSrc&&!node.src))return;
    let graph=saved;
    if(!graph){const context=new AudioContext();try{graph={context,source:context.createMediaElementSource(node),compressor:context.createDynamicsCompressor()};graphs.set(node,graph);}catch(error){await context.close();throw error;}}
    graph.source.disconnect();graph.compressor.disconnect();
    if(settings[key]){for(const [name,value]of Object.entries(settings[key]))graph.compressor[name].value=value;graph.source.connect(graph.compressor);graph.compressor.connect(graph.context.destination);}else graph.source.connect(graph.context.destination);
    if(!node.paused&&graph.context.state==='suspended')await graph.context.resume();
  }
  const nodes=['playerVideo','browserDubAudio','dubGeneratedPreview'].map(id=>document.getElementById(id)).filter(Boolean);
  for(const node of nodes)for(const event of ['play','loadedmetadata'])node.addEventListener(event,()=>void apply(node).catch(error=>{console.warn('Listening profile:',error.message);}));
  async function configure(value){prefs={...prefs,...value};await Promise.all(nodes.map(apply));}
  window.MediaListening=Object.freeze({configure});
  void window.api.mediaTools({action:'audio-get'}).then(r=>{if(r?.ok)return configure(r.value);}).catch(()=>{});
})();
