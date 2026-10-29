/** Russian integer agreement for actual collection counts, including 11–14. */
export function countForm(count:number,one:string,few:string,many:string):string {const n=Math.abs(Math.trunc(count)),last=n%10,hundred=n%100;return hundred>=11&&hundred<=14?many:last===1?one:last>=2&&last<=4?few:many;}
export const giftCount=(count:number)=>`${count} ${countForm(count,'подарок','подарка','подарков')}`;
export const availableCount=(count:number)=>`${count} ${countForm(count,'доступен','доступны','доступно')}`;
