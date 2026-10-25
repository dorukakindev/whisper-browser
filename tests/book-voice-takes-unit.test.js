'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const takes=require('../src/book-voice-takes');
const hash=data=>createHash('sha256').update(data).digest('hex');
const digest=file=>hash(fs.readFileSync(file));
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'voice-takes-'));
try {
  const bytes=Buffer.from('synthetic audio fixture'),text='First chapter.',textHash=hash(text),id=`chapter-${textHash.slice(0,16)}-${hash(bytes).slice(0,16)}.wav`;
  fs.writeFileSync(path.join(folder,id),bytes);
  const chapter={id:'chapter',text,textHash,output:path.join(folder,id),groups:[{key:'1',status:'ready'}],voiceSettings:{steps:15}};
  takes.remember(folder,chapter,digest);
  chapter.output=null;
  assert.equal(takes.list(folder,chapter).takes[0].available,true);
  assert.equal(takes.open(folder,chapter,id,digest).path,path.join(folder,id));
  const before=JSON.stringify(chapter);
  chapter.text='Edited chapter.';
  assert.throws(()=>takes.select(folder,chapter,{takeId:id,textHash:hash(chapter.text)},digest),/older text|eski metne/);
  chapter.text=text;
  assert.equal(JSON.stringify(chapter),before,'rejected selection does not mutate other chapter fields');
  fs.writeFileSync(path.join(folder,id),'corrupted waveform');
  assert.throws(()=>takes.open(folder,chapter,id,digest),/changed|değişti/);
  assert.throws(()=>takes.open(folder,chapter,'../other.wav',digest),/Invalid|geçersiz/);
  console.log('Book voice takes preserve text identity and reject corrupted audio or path traversal');
} finally {fs.rmSync(folder,{recursive:true,force:true});}
