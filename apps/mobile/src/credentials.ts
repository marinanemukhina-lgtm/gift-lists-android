import type {CredentialStore,Credentials} from '../../../packages/domain/src/index';
import {validateSecret} from './security';
export interface SecureAccess {get(key:string):Promise<unknown>;set(key:string,value:string):Promise<void>;remove(key:string):Promise<void>;keys():Promise<string[]>}
export function createNativeCredentialStore(storage:SecureAccess,assertNative:()=>void):CredentialStore{
 const guard=()=>assertNative();
 let tail:Promise<unknown>=Promise.resolve();
 const guestKey=(code:string)=>{if(!/^[a-f0-9]{32}$/.test(code))throw new Error('Некорректный адрес списка.');return `guest-${code}`;};
 const pendingValue=(value:unknown):Credentials['pendingRecovery']=>{if(value===undefined)return undefined;if(!value||typeof value!=='object')throw new Error('Повреждены данные смены кода восстановления.');const pending=value as {recoverySecret?:unknown;requestId?:unknown};if(typeof pending.requestId!=='string'||! /^[a-zA-Z0-9_-]{16,100}$/.test(pending.requestId))throw new Error('Повреждены данные смены кода восстановления.');return {recoverySecret:validateSecret('recovery',pending.recoverySecret),requestId:pending.requestId};};
 const deletionValue=(value:unknown):Credentials['pendingDeletion']=>{if(value===undefined)return undefined;if(!value||typeof value!=='object')throw new Error('Повреждены данные удаления.');const requestId=(value as {requestId?:unknown}).requestId;if(typeof requestId!=='string'||! /^[a-zA-Z0-9_-]{16,100}$/.test(requestId))throw new Error('Повреждены данные удаления.');return {requestId};};
 const ownerValue=(value:unknown):Credentials=>{if(typeof value!=='string')throw new Error('Повреждены защищённые данные доступа.');let raw:Partial<Credentials>;try{raw=JSON.parse(value);}catch{throw new Error('Повреждены защищённые данные доступа.');}return {deviceSecret:validateSecret('owner',raw.deviceSecret),recoverySecret:validateSecret('recovery',raw.recoverySecret),enrolled:raw.enrolled===true,...(raw.pendingRecovery!==undefined?{pendingRecovery:pendingValue(raw.pendingRecovery)}:{}),...(raw.pendingDeletion!==undefined?{pendingDeletion:deletionValue(raw.pendingDeletion)}:{})};};
 return {
  withExclusive<T>(operation:()=>Promise<T>):Promise<T>{guard();const result=tail.then(operation,operation);tail=result.catch(()=>{});return result;},
  async getOwner(){guard();const value=await storage.get('owner');return value===null?null:ownerValue(value);},
  async setOwner(value){guard();const normalized={deviceSecret:validateSecret('owner',value.deviceSecret),recoverySecret:validateSecret('recovery',value.recoverySecret),enrolled:value.enrolled===true,...(value.pendingRecovery!==undefined?{pendingRecovery:pendingValue(value.pendingRecovery)}:{}),...(value.pendingDeletion!==undefined?{pendingDeletion:deletionValue(value.pendingDeletion)}:{})};const text=JSON.stringify(normalized);await storage.set('owner',text);if(await storage.get('owner')!==text)throw new Error('Не удалось безопасно сохранить доступ. Публикация отменена.');},
  async clearOwner(){guard();await storage.remove('owner');},
  async getGuest(code){guard();const value=await storage.get(guestKey(code));return value===null?null:validateSecret('guest',value);},
  async setGuest(code,value){guard();validateSecret('guest',value);const key=guestKey(code);if(await storage.get(key)===null&&(await storage.keys()).filter(k=>/^guest-[a-f0-9]{32}$/.test(k)).length>=512)throw new Error('На устройстве уже сохранено 512 гостевых доступов. Новая бронь не отправлена.');await storage.set(key,value);if(await storage.get(key)!==value)throw new Error('Не удалось безопасно сохранить доступ к брони.');},
  async clearAll(){guard();for(const key of await storage.keys()){if(key==='owner'||/^guest-[a-f0-9]{32}$/.test(key))await storage.remove(key);}}
 };
}
