/** Platform CSPRNG only: failure is safer than issuing predictable credentials. */
function randomHex(bytes:number):string {if(!globalThis.crypto?.getRandomValues)throw new Error('Защищённый генератор недоступен. Обновите браузер или Android System WebView.');return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('')}
export const newId=()=>randomHex(16);
export const newShareCode=()=>randomHex(16);
export const newSecret=(scope:'owner'|'recovery'|'guest')=>`${scope}_${randomHex(32)}`;
export function safeExternalUrl(value:string):string {const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||/[\r\n\t]/.test(value)||value.length>2048)throw new Error('Нужна обычная ссылка http или https без пароля.');return url.href;}
export function parseGuestLink(value:string,publicOrigin:string):string {const parsed=new URL(value);const origin=new URL(publicOrigin);if(parsed.origin!==origin.origin||parsed.search||parsed.hash||parsed.username||parsed.password)throw new Error('Откройте гостевую ссылку этого приложения.');const match=parsed.pathname.match(/^\/e\/([a-f0-9]{32})\/?$/);if(!match)throw new Error('Неверная гостевая ссылка.');return match[1];}
