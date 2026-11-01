'use strict';
const manifest=require('./assistant-context-manifest');
const fold=require('./text-fold').command;
// Planning is read-only. A plan never grants permission or reserves a job.
function translationChoices(owner){
 const choices=[];
 if(['page','video'].includes(owner.kind))choices.push({route:'page',tool:'translate_page'});
 if(owner.kind==='video'){
  const tracks=(owner.tracks||[]).filter(row=>row.role==='source');
  for(const track of tracks)choices.push({route:'captions',tool:'translate_captions',track_id:track.id,language:track.language,partial:track.partial===true});
  choices.push({route:'youtube-captions',tool:'probe_video_captions',requiresProbe:true});
  choices.push({route:'whisper',tool:'start_whisper',requiresExplicitWhisper:true});
 }
 return choices;
}
function ambiguousTranslation(question,owner){
 const text=fold(question).trim().replace(/[.!?]+$/u,'');
 return /^(?:(?:lütfen )?bunu (?:(?:türkçeye|ingilizceye|almancaya|fransızcaya|ispanyolcaya) )?(?:[çc]evir|[çc]evirir misin|[çc]evirebilir misin)|(?:please )?translate (?:this|it)(?: (?:to|into) (?:turkish|english|german|french|spanish))?(?: please)?)$/u.test(text)&&translationChoices(owner).length>1;
}
function build(owner,goal){
 const source=manifest.publicContext(owner),choices=translationChoices(owner).filter(row=>goal!=='dubbing'||row.route!=='page'),steps=[];
 const add=(tool,requires,note)=>steps.push({order:steps.length+1,tool,state:'planned',requires,note});
 add('get_source_context',[],'Verify this exact source and selected time range.');
 if(owner.kind==='video'){
  const attachedTranslation=goal==='dubbing'&&(owner.tracks||[]).some(row=>row.role==='translation');
  if(attachedTranslation)add('review_attached_translation',['get_source_context'],'A translated track is already attached. Verify the intended track and completeness; do not retranscribe or retranslate by default.');
  else{
   add('choose_translation_source',['get_source_context'],goal==='dubbing'?'Choose existing source captions, probed YouTube captions, or explicitly requested Whisper; web-page text is not a dubbing subtitle track.':'Choose page, existing source captions, probed YouTube captions, or explicitly requested Whisper. Never silently substitute.');
   add('translate_selected_source',['choose_translation_source'],'Create one review card with the chosen source and model; no job starts until applied.');
   add('get_job_result',['translate_selected_source'],'For a caption/audio job, inspect its exact ledger ID, completion, partial artifacts and counts. Page translation uses its actual action receipt.');
  }
  if(goal==='dubbing'){
   if(!attachedTranslation)add('use_job_subtitles',['get_job_result'],'Attach the exact complete translation; partial output needs separate explicit review.');
   add('open_voice_preparation',[attachedTranslation?'review_attached_translation':'use_job_subtitles'],'Inspect reference and readiness, then review settings. Preparation does not generate audio.');
   add('start_voice_generation',['open_voice_preparation'],'Only if the current human explicitly requested audio generation; a fresh card still requires approval.');
   add('use_generated_voice',['start_voice_generation'],'Wait for the exact full output, then offer attachment separately. Completion does not prove audio quality.');
  }
 }else if(owner.kind==='page'&&goal==='translation')add('translate_page',['get_source_context'],'Review one page translation card. This does not transcribe media.');
 else add('app_help',['get_source_context'],'This workflow is unavailable on this source; inspect available actions or open the intended video/page.');
 return {status:'completed',source,goal,translationChoices:choices,steps,execution:'plan_only',note:'Ordered dependencies only, not started, queued, ready or applied. Revalidate source and exact results before every action.'};
}
module.exports={build,translationChoices,ambiguousTranslation};
