(() => {
 'use strict';
 // The note dialog lives in the main window while the assistant card that opened it lives in the overlay. When the overlay is shown
 // again, focus goes back to exactly the control that opened the dialog (found again by its key if the list was re-rendered),
 // never to an arbitrary element. The return stays pending until it really took focus (the page has focus), the user takes over
 // (pointer or key), or 15 seconds passed, so a re-render or a late focus event cannot lose it.
 let pending=null;
 const clear=()=>{pending=null;};
 const restore=()=>{
  if(!pending)return;
  if(Date.now()-pending.at>15000){clear();return;}
  if(document.visibilityState==='hidden')return;
  const target=pending.key.startsWith('citation:')?[...document.querySelectorAll('[data-citation-control]')].find(node=>node.dataset.citationControl===pending.key.slice(9)&&node.isConnected&&!node.disabled):[...document.querySelectorAll('[data-note-control="open"]')].find(node=>node.dataset.noteKey===pending.key&&node.isConnected&&!node.disabled);
  if(!target)return;
  // The user had this source open when they pressed the button; a re-render may have folded it, and a control in a folded card cannot take focus.
  const card=target.closest('details');if(card&&!card.open)card.open=true;
  target.focus({preventScroll:true});
  if(document.activeElement===target&&(document.hasFocus()||!pending.waitForFocus))clear();
 };
 window.addEventListener('focus',restore);document.addEventListener('visibilitychange',restore);
 document.addEventListener('pointerdown',()=>{if(pending&&Date.now()-pending.at>400)clear();},true);
 document.addEventListener('keydown',()=>{if(pending&&Date.now()-pending.at>400)clear();},true);
 window.AssistantFocusReturn=Object.freeze({mark:key=>{pending=String(key||'')?{key:String(key),at:Date.now(),waitForFocus:true}:null;},restore,pending:()=>pending?pending.key:null});
})();
