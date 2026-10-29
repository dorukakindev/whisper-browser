'use strict';
function activity(raw){
  if(!raw||!['synthesis','verification'].includes(raw.stage)||!Number.isInteger(raw.group)||raw.group<1||raw.group>5000||!Number.isInteger(raw.attempt)||raw.attempt<1||raw.attempt>1000||!Number.isFinite(raw.elapsed)||raw.elapsed<0||raw.elapsed>86400||!Number.isFinite(raw.limit)||raw.limit<1||raw.limit>900)return null;
  return {stage:raw.stage,group:raw.group,attempt:raw.attempt,elapsed:raw.elapsed,limit:raw.limit,...(typeof raw.finished==='boolean'?{finished:raw.finished}:{})};
}
module.exports={activity};
