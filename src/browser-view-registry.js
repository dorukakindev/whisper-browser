'use strict';
// One native owner per view. Moves either complete or return to the prior owner.
function createBrowserViewRegistry(){
 const rows=new Map(),tabs=new Map();
 const live=owner=>owner&&!owner.isDestroyed?.()&&owner.contentView;
 function forget(view){const row=rows.get(view);if(!row)return false;rows.delete(view);if(tabs.get(row.tabId)===view)tabs.delete(row.tabId);view.webContents?.removeListener?.('destroyed',row.cleanup);return true;}
 function attach(tabId,view,owner){if(!view?.webContents||view.webContents.isDestroyed?.()||!live(owner))throw Error('Browser view owner unavailable.');if(rows.has(view)||tabs.has(tabId))throw Error('Browser view already owned.');owner.contentView.addChildView(view);const row={tabId,owner,cleanup:()=>forget(view)};rows.set(view,row);tabs.set(tabId,view);view.webContents.once?.('destroyed',row.cleanup);return view;}
 function move(view,from,to){const row=rows.get(view);if(!row||row.owner!==from||!live(to)||view.webContents.isDestroyed?.())return false;if(from===to)return true;try{if(live(from))from.contentView.removeChildView(view);to.contentView.addChildView(view);row.owner=to;return true;}catch(_){try{if(live(from))from.contentView.addChildView(view);}catch(__){}return false;}}
 function release(view){const row=rows.get(view);if(!row)return false;try{if(live(row.owner))row.owner.contentView.removeChildView(view);}catch(_){}forget(view);return true;}
 return {attach,move,release,forget,owns:(view,owner)=>rows.get(view)?.owner===owner,owner:view=>rows.get(view)?.owner||null,tabId:view=>rows.get(view)?.tabId||'',size:()=>rows.size};
}
module.exports={createBrowserViewRegistry};
