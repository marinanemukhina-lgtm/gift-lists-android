import type {AsyncKeyValueStore} from '../../../packages/client/src/index';
export interface PrivateFiles {read(path:string):Promise<string|null>;write(path:string,value:string):Promise<void>;rename(from:string,to:string):Promise<void>;remove(path:string):Promise<void>;names():Promise<string[]>}
const MAX_BYTES=1024*1024,MAX_KEYS=512;
const keyPattern=/^gift-(draft|guest)-[a-zA-Z0-9_.-]{1,180}$/;
function checkKey(key:string){if(!keyPattern.test(key))throw new Error('Некорректный ключ локального списка.');}
/** Serializes mutations. New bytes are complete before replacing the acknowledged file. */
export function createPrivateFileStore(files:PrivateFiles):AsyncKeyValueStore{
 let tail:Promise<unknown>=Promise.resolve();
 const serial=<T>(job:()=>Promise<T>):Promise<T>=>{const result=tail.then(job,job);tail=result.catch(()=>{});return result;};
 return {
  async get(key){checkKey(key);await tail;const current=await files.read(`${key}.json`);return current??await files.read(`${key}.backup`);},
  set(key,value){checkKey(key);if(new TextEncoder().encode(value).byteLength>MAX_BYTES)return Promise.reject(new Error('Список превышает допустимый размер на устройстве.'));return serial(async()=>{
   const names=await files.names();const keys=new Set(names.map(name=>name.replace(/\.(json|backup|pending)$/,'')));
   if(!keys.has(key)&&keys.size>=MAX_KEYS)throw new Error('Хранилище заполнено. Удалите ненужные локальные списки.');
   await files.write(`${key}.pending`,value);
   const old=await files.read(`${key}.json`);
   if(old!==null){await files.remove(`${key}.backup`);await files.rename(`${key}.json`,`${key}.backup`);}
   await files.rename(`${key}.pending`,`${key}.json`);
   await files.remove(`${key}.backup`);
  });},
  remove(key){checkKey(key);return serial(async()=>{await files.remove(`${key}.json`);await files.remove(`${key}.backup`);await files.remove(`${key}.pending`);});},
  async list(prefix){await tail;return [...new Set((await files.names()).filter(name=>/\.(json|backup)$/.test(name)).map(name=>name.replace(/\.(json|backup)$/, '')).filter(name=>name.startsWith(prefix)&&keyPattern.test(name)))].sort();}
 };
}
