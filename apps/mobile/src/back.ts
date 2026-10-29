/** One native Back event is offered to subscribers from topmost to oldest. */
export function createBackDispatcher(dismissKeyboard:()=>boolean,minimize:()=>void){
 const callbacks:Array<()=>boolean>=[];
 return {
  subscribe(callback:()=>boolean){callbacks.push(callback);return()=>{const index=callbacks.lastIndexOf(callback);if(index>=0)callbacks.splice(index,1);};},
  dispatch(){if(dismissKeyboard())return;for(const callback of [...callbacks].reverse()){if(callback())return;}minimize();}
 };
}
