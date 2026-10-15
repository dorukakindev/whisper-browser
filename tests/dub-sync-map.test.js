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
console.log('dub-sync-map: stretched speech, gaps, endpoints and invalid maps passed');
