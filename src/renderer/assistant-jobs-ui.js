(() => {
 'use strict';
 if(!window.api?.assistantJobs)return;
 let state={revision:-1,jobs:[]};
 const accept=value=>{if(value?.revision>=state.revision&&Array.isArray(value.jobs)){state=value;document.dispatchEvent(new Event('assistant-jobs-changed'));}};
 const unsubscribe=window.api.onAssistantJobs(accept);
 void window.api.assistantJobs().then(value=>{if(value?.ok)accept(value);}).catch(()=>{});
 async function cancel(id){const result=await window.api.cancelAssistantJob({id});if(!result?.ok)throw Error(result?.error||'Job stop failed / İş durdurulamadı.');}
 window.AssistantJobsUI=Object.freeze({snapshot:()=>state,cancel});
 window.addEventListener('pagehide',()=>unsubscribe?.());
})();
