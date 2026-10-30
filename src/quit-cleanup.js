'use strict';
// Lightweight abort-only services share one app listener. Stateful/asynchronous
// shutdown owners retain their own before-quit ordering and preventDefault logic.
const owners=new WeakMap();
function registerQuitCleanup(app, cleanup) {
 let state=owners.get(app);
 if(!state){const callbacks=new Set();const dispatch=()=>{for(const fn of [...callbacks]){try{fn();}catch{console.warn('Shutdown abort cleanup failed');}}};state={callbacks,dispatch};owners.set(app,state);app.on('before-quit',dispatch);}
 state.callbacks.add(cleanup);
 return ()=>{state.callbacks.delete(cleanup);if(!state.callbacks.size){app.removeListener('before-quit',state.dispatch);owners.delete(app);}};
}
module.exports={registerQuitCleanup};
