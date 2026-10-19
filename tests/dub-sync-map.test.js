const assert = require('node:assert/strict');
const {validate,at} = require('../src/renderer/dub-sync-map');
const map = validate({version:1,videoDuration:6,audioDuration:8,segments:[
  {v0:1,v1:3,a0:1,a1:5},{v0:4,v1:5,a0:6,a1:7}]});
assert.deepEqual(at(map,.5),{time:.5,factor:1});
assert.deepEqual(at(map,2),{time:3,factor:2});
assert.deepEqual(at(map,3.5),{time:5.5,factor:1});
assert.deepEqual(at(map,5.5),{time:7.5,factor:1});
assert.throws(()=>validate({...map,segments:[{v0:1,v1:3,a0:9,a1:10}]}));
assert.throws(()=>validate({...map,segments:[{v0:1,v1:1,a0:1,a1:2}]}));
assert.throws(()=>validate({...map,segments:[{v0:1,v1:3,a0:1,a1:NaN}]}));
const smooth = validate({...map,smooth:true});
assert.equal(smooth.smooth,true);
assert.equal(at(smooth,1).factor,1);
assert.equal(at(smooth,3).factor,1);
assert.equal(at(smooth,2).time,3);
let last = -1;
for(let time=0;time<=6;time+=.01){const row=at(smooth,time);assert.ok(row.time>last);last=row.time;assert.ok(row.factor>=1);}
const h=.00001, center=1.7;
assert.ok(Math.abs((at(smooth,center+h).time-at(smooth,center-h).time)/(2*h)-at(smooth,center).factor)<.0001,
  'smooth playback rate must be the derivative of its audio mapping');
console.log('dub-sync-map: stretched speech, gaps, endpoints and invalid maps passed');
