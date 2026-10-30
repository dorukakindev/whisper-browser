const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{registerQuitCleanup}=require('../src/quit-cleanup');
const app=new EventEmitter(),other=new EventEmitter(),calls=[];
const stopA=registerQuitCleanup(app,()=>calls.push('a'));
const stopB=registerQuitCleanup(app,()=>calls.push('b'));
assert.equal(app.listenerCount('before-quit'),1);
app.emit('before-quit');assert.deepEqual(calls,['a','b']);stopA();app.emit('before-quit');assert.deepEqual(calls,['a','b','b']);
for(let i=0;i<30;i++){const dispose=registerQuitCleanup(app,()=>{});dispose();}
assert.equal(app.listenerCount('before-quit'),1);assert.equal(other.listenerCount('before-quit'),0);
stopB();assert.equal(app.listenerCount('before-quit'),0);stopB();
const stop=registerQuitCleanup(app,()=>calls.push('new'));app.emit('before-quit');assert.equal(calls.at(-1),'new');stop();
console.log('quit-cleanup: fanout, disposal, repeated quit and owner isolation passed');

const warn=console.warn;let warnings=0;console.warn=()=>warnings++;try{const bad=registerQuitCleanup(app,()=>{throw Error('private failure')});const good=registerQuitCleanup(app,()=>calls.push('after-error'));app.emit('before-quit');assert.equal(calls.at(-1),'after-error');assert.equal(warnings,1);bad();good();}finally{console.warn=warn;}
