(() => {
 'use strict';
 const model=window.AssistantWorkflowSettings,$=id=>document.getElementById(id),t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 let busy=false,last=null;
 function undoState(domain,values){
  const canUndo=!!last&&last.domain===domain&&JSON.stringify(values)===JSON.stringify(last.after);
  return {canUndo,undoChanges:canUndo?{...last.before}:null};
 }

 function read(domain,{offset=0}={}){const fields=model.domain(domain),values={},options={};for(const [key,f] of Object.entries(fields)){const c=$(f.control);if(!c)continue;values[key]=f.type==='boolean'?c.checked:f.type==='number'?Number(c.value):c.value;options[key]={type:f.type,label:f.label[window.UiLocale?.get?.()==='tr'?'tr':'en'],...(c.tagName==='SELECT'?{choices:[...c.options].filter(o=>!o.disabled).map(o=>({value:o.value,label:o.textContent.trim().slice(0,100)}))}:{}),...(f.type==='number'?{minimum:f.min,maximum:f.max,step:Number(c.step)||1}:{})};}const names=Object.keys(options),page=names.slice(offset,offset+16);return {domain,values,options:Object.fromEntries(page.map(k=>[k,options[k]])),offset,nextOffset:offset+16<names.length?offset+16:null,totalSettings:names.length,...(domain==='translation'?{effective:{forSpeech:values.forSpeech,refine:values.forSpeech||values.refine,lenient:!values.forSpeech&&values.lenient}}:{}),...undoState(domain,values),note:t('Only connected non-secret controls. Running and queued job snapshots are unchanged. Browser controls take effect immediately; automation can start page translation.','Yalnız bağlı gizli olmayan ayarlar. Çalışan ve kuyruktaki işlerin ayarları değişmez. Tarayıcı ayarları hemen uygulanır; otomasyon sayfa çevirisi başlatabilir.')};}
 function validate(domain,values){for(const [key,value]of Object.entries(values)){const f=model.domain(domain)[key],c=$(f.control);if(!c||c.disabled)throw Error(t('This setting is currently unavailable: ','Bu ayar şu an kullanılamıyor: ')+key);if(c.tagName==='SELECT'&&![...c.options].some(o=>o.value===value&&!o.disabled))throw Error('Unsupported setting choice: '+key);const step=Number(c.step)||1;if(f.type==='number'&&Math.abs((value-Number(c.min||0))/step-Math.round((value-Number(c.min||0))/step))>0.00001)throw Error('Setting does not match its step: '+key);}}
 function write(domain,values){for(const [key,value]of Object.entries(values)){const f=model.domain(domain)[key],c=$(f.control);if(f.type==='boolean')c.checked=value;else c.value=String(value);c.dispatchEvent(new Event('input',{bubbles:true}));c.dispatchEvent(new Event('change',{bubbles:true}));}}
 async function execute(name,args,owner,{deadline=Infinity,isCancelled=()=>false}={}){
  const stale=()=>isCancelled()||Date.now()>=deadline||!window.AssistantAppActions.current(owner),guard=()=>{if(stale())throw Error(t('The source changed.','Kaynak değişti.'));};guard();
  if(name==='get_workflow_settings')return {status:'completed',...read(args.domain,{offset:args.offset||0})};
  if(busy)throw Error(t('Another settings update is pending.','Başka bir ayar değişikliği sürüyor.'));
  const before=read(args.domain).values;
  if(name==='undo_workflow_settings'&&(!last||last.domain!==args.domain||JSON.stringify(before)!==JSON.stringify(last.after)))throw Error(t('Settings changed since the last action. Undo refused.','Son işlemden sonra ayarlar değişti. Geri alma reddedildi.'));
  const values=name==='undo_workflow_settings'?last.before:model.parse(args.domain,args.changes_json);validate(args.domain,values);
  if(name!=='undo_workflow_settings'&&Object.entries(values).every(([key,value])=>before[key]===value))return {status:'completed',...read(args.domain),note:t('Requested settings already match.','İstenen ayarlar zaten aynı.')};
  const expected={...before,...values},previousLast=last;busy=true;last=null;
  try{write(args.domain,values);if(!await saveAppSettings())throw Error(t('Settings could not be saved.','Ayarlar kaydedilemedi.'));guard();const after=read(args.domain).values;if(JSON.stringify(after)!==JSON.stringify(expected))throw Error(t('Settings changed while saving. Review them before retrying.','Kaydederken ayarlar değişti. Tekrarlamadan önce kontrol et.'));if(name!=='undo_workflow_settings'){const undoChanges=Object.fromEntries(Object.keys(values).filter(key=>before[key]!==after[key]).map(key=>[key,before[key]]));if(Object.keys(undoChanges).length)last={domain:args.domain,before:undoChanges,after};}return {status:'completed',...read(args.domain)};}
  catch(error){const now=read(args.domain).values,restore={};for(const key of Object.keys(values))if(now[key]===expected[key])restore[key]=before[key];if(Object.keys(restore).length){write(args.domain,restore);if(!await saveAppSettings())throw Error(t('Settings failed and rollback could not be saved. Review the controls.','Ayar işlemi başarısız; geri alma da kaydedilemedi. Ayarları kontrol et.'));}if(JSON.stringify(read(args.domain).values)===JSON.stringify(before))last=previousLast;throw error;}
  finally{busy=false;}
 }
 window.AssistantWorkflowActions=Object.freeze({execute,read});
})();
