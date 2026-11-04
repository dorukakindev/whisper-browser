"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
test("PDF scroll keeps a fully visible selected page and updates once it leaves view",()=>{
 const source=fs.readFileSync(require.resolve("../src/renderer/renderer.js"),"utf8");
 const start=source.indexOf("root.onscroll = () => {",source.indexOf("async function openPdfReader("));
 const end=source.indexOf("\n  };",start);assert(start>0&&end>start);
 const input={value:"2"},player={pdfReader:{currentPage:2}},root={};let visible=[],changes=0;
 const context={root,player,reader:player.pdfReader,readerPagesForVisibility:()=>visible,$:()=>input,window:{PdfReaderExperience:{changed(){changes++;}}}};
 vm.runInNewContext(source.slice(start,end+5),context);
 visible=[{number:2,height:200,visible:200,top:0},{number:3,height:240,visible:240,top:220}];
 root.onscroll();assert.equal(player.pdfReader.currentPage,2);assert.equal(input.value,"2");
 visible=[{number:2,height:200,visible:30,top:-170},{number:3,height:240,visible:240,top:50}];
 root.onscroll();assert.equal(player.pdfReader.currentPage,3);assert.equal(input.value,"3");
 player.pdfReader.navigatingPage=true;visible=[{number:1,height:200,visible:200,top:0}];root.onscroll();assert.equal(player.pdfReader.currentPage,3);
 assert.equal(changes,2);
});

test("layout-driven scroll cannot switch the narrated PDF page during a view transition",()=>{
 const source=fs.readFileSync(require.resolve("../src/renderer/renderer.js"),"utf8"),start=source.indexOf("root.onscroll = () => {",source.indexOf("async function openPdfReader(")),end=source.indexOf("\n  };",start);
 const player={pdfReader:{currentPage:2,switchingView:true}},root={},input={value:"2"};let changes=0;
 vm.runInNewContext(source.slice(start,end+5),{root,player,reader:player.pdfReader,$:()=>input,readerPagesForVisibility:()=>[{number:3,height:200,visible:200,top:0}],window:{PdfReaderExperience:{changed(){changes++;}}}});
 root.onscroll();assert.equal(player.pdfReader.currentPage,2);assert.equal(changes,0);player.pdfReader.switchingView=false;root.onscroll();assert.equal(player.pdfReader.currentPage,3);assert.equal(changes,1);
});
