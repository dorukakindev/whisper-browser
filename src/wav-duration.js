'use strict';
const fs = require('node:fs');
// Read only RIFF chunk headers; never load a whole chapter WAV into memory.
function wavDuration(file) {
  const fd=fs.openSync(file,'r');
  try {
    const size=fs.fstatSync(fd).size,head=Buffer.alloc(12);
    if(fs.readSync(fd,head,0,12,0)!==12 || head.toString('ascii',0,4)!=='RIFF' || head.toString('ascii',8,12)!=='WAVE')throw Error('Invalid WAV.');
    let byteRate=0,dataSize=0,offset=12;
    for(let count=0;count<128 && offset+8<=size;count++){
      const chunk=Buffer.alloc(8);if(fs.readSync(fd,chunk,0,8,offset)!==8)break;
      const name=chunk.toString('ascii',0,4),length=chunk.readUInt32LE(4),start=offset+8;
      if(length>size-start)throw Error('Incomplete WAV.');
      if(name==='fmt '){
        if(length<16)throw Error('Invalid WAV format.');
        const fmt=Buffer.alloc(16);fs.readSync(fd,fmt,0,16,start);
        if(![1,3,65534].includes(fmt.readUInt16LE(0)))throw Error('Unsupported WAV format.');
        byteRate=fmt.readUInt32LE(8);
      }
      if(name==='data')dataSize+=length;
      offset=start+length+(length%2);
    }
    const seconds=dataSize/byteRate;if(!Number.isFinite(seconds)||seconds<=0)throw Error('Empty WAV.');
    return seconds;
  } finally {fs.closeSync(fd);}
}
module.exports={wavDuration};
