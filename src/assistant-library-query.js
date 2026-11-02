(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantLibraryQuery=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const specs={kind:{values:['film','series']},year:{min:1880,max:2200,integer:true},runtime_minutes:{min:0,max:10000},watch_status:{values:['unspecified','planned','watching','completed']},reaction:{values:['like','neutral','dislike']},personal_rating:{min:0,max:10,rating:true},imdb_rating:{min:0,max:10,rating:true}};
 const FIELDS=Object.keys(specs),ops=['eq','in','gte','lte'];
 const primitive={anyOf:[{type:'string',maxLength:40},{type:'number',minimum:0,maximum:10000}]};
 const PARAMETERS={type:'object',properties:{filters:{type:'object',properties:{and:{type:'array',maxItems:20,items:{type:'object',properties:{field:{type:'string',enum:FIELDS},op:{type:'string',enum:ops},value:{anyOf:[...primitive.anyOf,{type:'array',minItems:1,maxItems:20,items:primitive}]}},required:['field','op','value'],additionalProperties:false}}},required:['and'],additionalProperties:false},offset:{type:'integer',minimum:0,maximum:10000},limit:{type:'integer',minimum:1,maximum:20},snapshot_revision:{type:'string',minLength:1,maxLength:100}},required:[],additionalProperties:false};
 const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 function requireKeys(value,allowed,required=[]){if(!record(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw Error('Invalid library query arguments or filter fields.');}
 function validate(input={}){
  requireKeys(input,['filters','offset','limit','snapshot_revision']);
  const offset=input.offset===undefined?0:input.offset,limit=input.limit===undefined?20:input.limit;
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('Invalid library query offset or limit.');
  const clauses=input.filters===undefined?[]:(requireKeys(input.filters,['and'],['and']),input.filters.and);
  if(!Array.isArray(clauses)||clauses.length>20)throw Error('Invalid library query: use at most 20 AND filters.');
  const and=clauses.map(clause=>{
   requireKeys(clause,['field','op','value'],['field','op','value']);const spec=typeof clause.field==='string'&&Object.hasOwn(specs,clause.field)?specs[clause.field]:null;
   if(!spec||!ops.includes(clause.op)||spec.values&&!['eq','in'].includes(clause.op))throw Error('Unsupported library query field or operator.');
   const values=clause.op==='in'?clause.value:[clause.value];
   if(!Array.isArray(values)||!values.length||values.length>20)throw Error('Invalid library query filter value array.');
   for(const value of values)if(spec.values?!spec.values.includes(value):typeof value!=='number'||!Number.isFinite(value)||value<spec.min||value>spec.max||spec.integer&&!Number.isSafeInteger(value))throw Error('Invalid typed library query filter value.');
   return {field:clause.field,op:clause.op,value:clause.op==='in'?[...new Set(values)]:clause.value};
  });
  if(input.snapshot_revision!==undefined&&(typeof input.snapshot_revision!=='string'||!input.snapshot_revision.length||input.snapshot_revision.length>100))throw Error('Invalid library query snapshot revision.');
  return {filters:{and},offset,limit,...(input.snapshot_revision!==undefined?{snapshot_revision:input.snapshot_revision}:{})};
 }
 function numeric(value,field){
  const spec=specs[field];if(value===null||value===undefined||typeof value==='string'&&!value.trim())return null;
  if(typeof value==='string'){const text=value.trim(),pattern=spec.rating?/^\d+(?:\.\d+)?(?:\s*\/\s*10)?$/:/^\d+(?:\.\d+)?$/;if(!pattern.test(text))return null;value=Number(text.split('/')[0].trim());}
  if(typeof value!=='number'||!Number.isFinite(value)||value<spec.min||value>spec.max||spec.integer&&!Number.isSafeInteger(value)||field==='runtime_minutes'&&value<=0)return null;
  return value;
 }
 function project(row){
  const reaction=row.personalMedia?.reaction;
  return {item_id:'catalog:'+row.id,title:String(row.title||'').slice(0,200),kind:specs.kind.values.includes(row.kind)?row.kind:null,year:numeric(row.year,'year'),runtime_minutes:numeric(row.runtime,'runtime_minutes'),watch_status:specs.watch_status.values.includes(row.watchStatus)?row.watchStatus:null,reaction:specs.reaction.values.includes(reaction)?reaction:null,personal_rating:numeric(row.ratings?.personal,'personal_rating'),imdb_rating:numeric(row.ratings?.imdb,'imdb_rating')};
 }
 function evaluate(item,clauses){
  const unknown=new Set();let excluded=false;
  for(const {field,op,value}of clauses){const actual=item[field];if(actual===null){unknown.add(field);continue;}const match=op==='eq'?actual===value:op==='in'?value.includes(actual):op==='gte'?actual>=value:actual<=value;if(!match)excluded=true;}
  return {state:excluded?'excluded':unknown.size?'unknown':'match',unknown:[...unknown]};
 }
 function fingerprint(value){const text=JSON.stringify(value);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}return 'snapshot-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+text.length;}
 function query(rows,input={}){
  const args=validate(input);if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid library query catalog snapshot.');
  const projected=[],ids=new Set();let unaddressable=0;
  for(const row of rows){if(!record(row)||typeof row.id!=='string'||!/^[-\w]{1,120}$/.test(row.id)){unaddressable++;continue;}if(ids.has(row.id))throw Error('Duplicate library query identity.');ids.add(row.id);projected.push(project(row));}
  projected.sort((a,b)=>a.item_id<b.item_id?-1:a.item_id>b.item_id?1:0);
  const snapshotRevision=fingerprint([projected,unaddressable]);
  if(args.snapshot_revision!==undefined&&args.snapshot_revision!==snapshotRevision)throw Error('Library snapshot changed. Query again from offset 0.');
  const selected=[],fields=[...new Set(args.filters.and.map(row=>row.field))],missingByField=Object.fromEntries(fields.map(field=>[field,0])),unknownByField={};let unknown=0,excluded=0;
  for(const item of projected){for(const field of fields)if(item[field]===null)missingByField[field]++;const result=evaluate(item,args.filters.and);if(result.state==='match')selected.push(item);else if(result.state==='excluded')excluded++;else{unknown++;for(const field of result.unknown)unknownByField[field]=(unknownByField[field]||0)+1;}}
  const total=selected.length,nextOffset=args.offset+args.limit<total?args.offset+args.limit:null;
  return {filters:args.filters,snapshotRevision,inspected:rows.length,total,unknown,excluded,unaddressable,missingByField,unknownByField,offset:args.offset,limit:args.limit,items:selected.slice(args.offset,args.offset+args.limit),nextOffset,hasMore:nextOffset!==null,next:nextOffset===null?null:{filters:args.filters,offset:nextOffset,limit:args.limit,snapshot_revision:snapshotRevision},units:{year:'calendar year',runtime_minutes:'minutes',personal_rating:'0–10',imdb_rating:'0–10'},scope:'Saved catalog metadata and projected personal reaction only. Flat AND; unknown means no known clause excludes the row but required metadata is missing. Unaddressable IDs are counted separately. No media content or paths.'};
 }
 function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
 return Object.freeze({PARAMETERS:freeze(PARAMETERS),FIELDS:Object.freeze(FIELDS),validate,query});
});
