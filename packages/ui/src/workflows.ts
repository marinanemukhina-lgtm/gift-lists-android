import {ApiError,type AppPorts,type Credentials,type DraftRecord} from '../../domain/src/index';
import {eventInput,newDraft} from './model';
/** Verification precedes all local identity changes; stable local IDs avoid capacity amplification. */
async function recoverIdentityUnlocked(ports:AppPorts,recoverySecret:string):Promise<Credentials>{
 const deviceSecret=ports.platform.newSecret('owner');
 await ports.owner.recover(recoverySecret,deviceSecret,ports.platform.newId());
 const next:Credentials={deviceSecret,recoverySecret,enrolled:true};
 await ports.credentials.setOwner(next);
 for(const item of await ports.drafts.list()){
  const fresh=newDraft(ports,item.event.occasion);
  const copy:DraftRecord={...fresh,localId:item.localId,event:{...item.event,id:fresh.event.id,slug:fresh.event.slug,version:0,published:false,gifts:item.event.gifts.map((g,i)=>({...g,id:`gift_${ports.platform.newId()}`,order:i}))}};
  await ports.drafts.put(copy);
 }
 return next;
}
/** Secret and request ID are durably staged before network. Lost responses reuse both. */
async function rotateRecoveryCredentialUnlocked(ports:AppPorts,replacePending=false):Promise<Credentials>{
 let current=await ports.credentials.getOwner();if(!current?.enrolled)throw Error('Сначала сохраните список на сервере.');if(current.pendingDeletion)throw Error('Сначала завершите удаление аккаунта.');
 if(!current.pendingRecovery||replacePending){current={...current,pendingRecovery:{recoverySecret:ports.platform.newSecret('recovery'),requestId:ports.platform.newId()}};await ports.credentials.setOwner(current);}
 const pending=current.pendingRecovery!;
 await ports.owner.rotateRecovery(current.deviceSecret,pending.recoverySecret,pending.requestId);
 const next:Credentials={deviceSecret:current.deviceSecret,recoverySecret:pending.recoverySecret,enrolled:true};
 await ports.credentials.setOwner(next);return next;
}
/** Deletion receipt key survives process death; caches are cleared only after server acknowledgement. */
async function deleteIdentityUnlocked(ports:AppPorts):Promise<void>{
 let current=await ports.credentials.getOwner();if(!current?.enrolled)throw Error('На этом устройстве нет сохранённого доступа к серверу.');
 if(!current.pendingDeletion){current={...current,pendingDeletion:{requestId:ports.platform.newId()}};await ports.credentials.setOwner(current);}
 await ports.owner.deleteAccount(current.deviceSecret,current.pendingDeletion!.requestId);
 await ports.drafts.clear();await ports.credentials.clearOwner();
}
/** A local edit invalidates this sync before an awaited remote snapshot may be persisted. */
async function syncOwnerLibraryUnlocked(ports:AppPorts,isCurrent:()=>boolean):Promise<void>{
 const credentials=await ports.credentials.getOwner();if(!credentials?.enrolled||credentials.pendingDeletion||!isCurrent())return;
 const summaries=await ports.owner.list(credentials.deviceSecret),local=await ports.drafts.list();
 for(const summary of summaries){if(!isCurrent())return;const existing=local.find(r=>r.snapshot?.event.id===summary.id);if(existing&&(existing.pending||JSON.stringify(existing.event)!==JSON.stringify(existing.snapshot?.event)))continue;
  const snapshot=await ports.owner.get(credentials.deviceSecret,summary.id);
  if(!isCurrent())return;
  await ports.drafts.put({format:1,localId:existing?.localId||`server_${summary.id}`,event:snapshot.event,snapshot,updatedAt:ports.platform.now()});
 }
}
/** Once a request was sent, retries keep the same receipt key even through later HTTP denials. */
async function sendPendingDraftUnlocked(ports:AppPorts,credentials:Credentials,record:DraftRecord,firstAttempt=false):Promise<DraftRecord>{
 if(!record.pending)throw Error('Нет подготовленного запроса.');
 let result;
 try{result=await ports.owner.save(credentials.deviceSecret,record.snapshot?.event.id||null,record.pending.input,record.pending.requestId);}
 catch(error){if(firstAttempt&&error instanceof ApiError&&([400,409,413,422].includes(error.status)||(error.status===429&&['owner_capacity','capacity_reached'].includes(error.code)))){const editable={...record};delete editable.pending;await ports.drafts.put(editable);}throw error;}
 const next:DraftRecord={...record,event:result.event,snapshot:result,updatedAt:ports.platform.now()};delete next.pending;
 await ports.drafts.put(next);return next;
}
async function ensureOwnerCredentialsUnlocked(ports:AppPorts):Promise<Credentials>{
 let credentials=await ports.credentials.getOwner();
 if(!credentials){if(!await ports.platform.confirm(ports.demo?'Это временное личное демо. Отправляйте только вымышленные данные, без имён детей, адресов и контактов. Создать доступ и отправить список?':'Создать доступ для этого устройства? После публикации все, у кого есть гостевая ссылка, смогут прочитать список. Сохраните файл восстановления в разделе «Доступ».'))throw Error('Публикация отменена. Черновик остался на устройстве.');credentials={deviceSecret:ports.platform.newSecret('owner'),recoverySecret:ports.platform.newSecret('recovery'),enrolled:false};await ports.credentials.setOwner(credentials);}
 if(credentials.pendingDeletion)throw Error('Есть незавершённое удаление аккаунта. Откройте «Доступ и помощь» и повторите удаление.');
 if(!credentials.enrolled){await ports.owner.enroll(credentials,ports.platform.newId());credentials={...credentials,enrolled:true};await ports.credentials.setOwner(credentials);}return credentials;
}
async function preparePublishUnlocked(ports:AppPorts,record:DraftRecord,onPersist:(draft:DraftRecord)=>void=()=>{}):Promise<{credentials:Credentials;staged:DraftRecord}>{
 const input=record.pending?.input||eventInput(record);
 const local={...record,updatedAt:ports.platform.now()};await ports.drafts.put(local);onPersist(local);
 const credentials=await ensureOwnerCredentialsUnlocked(ports);
 const staged={...local,pending:record.pending||{requestId:ports.platform.newId(),input}};
 await ports.drafts.put(staged);onPersist(staged);return {credentials,staged};
}

// The browser adapter uses an origin-wide Web Lock; native uses one serialized identity queue.
export function recoverIdentity(ports:AppPorts,recoverySecret:string):Promise<Credentials>{return ports.credentials.withExclusive(()=>recoverIdentityUnlocked(ports,recoverySecret));}
export class IdentityActionCancelled extends Error {}
export function rotateRecoveryCredential(ports:AppPorts,replacePending=false,confirm?:(current:Credentials)=>Promise<boolean>):Promise<Credentials>{return ports.credentials.withExclusive(async()=>{if(confirm){const current=await ports.credentials.getOwner();if(!current?.enrolled)throw Error('Сначала сохраните список на сервере.');if(!await confirm(current))throw new IdentityActionCancelled('Смена кода отменена.');}return rotateRecoveryCredentialUnlocked(ports,replacePending);});}
export function deleteIdentity(ports:AppPorts,confirm?:()=>Promise<boolean>):Promise<void>{return ports.credentials.withExclusive(async()=>{const current=await ports.credentials.getOwner();if(!current?.enrolled)throw Error('На этом устройстве нет сохранённого доступа к серверу.');if(confirm&&!await confirm())throw new IdentityActionCancelled('Удаление отменено.');return deleteIdentityUnlocked(ports);});}
export function ensureOwnerCredentials(ports:AppPorts):Promise<Credentials>{return ports.credentials.withExclusive(()=>ensureOwnerCredentialsUnlocked(ports));}
/** One origin-wide capability lock prevents simultaneous first bookings from replacing each other's guest key. */
export function mutateGuestReservation(ports:AppPorts,shareCode:string,giftId:string,cancel:boolean){return ports.credentials.withExclusive(async()=>{
 if(!ports.platform.isOnline())throw Error('Нет связи. Бронь не отправлена и не отложена.');
 let secret=await ports.credentials.getGuest(shareCode);
 if(!secret){if(cancel)throw Error('Ключ вашей брони на этом устройстве недоступен. Бронь не снята.');secret=ports.platform.newSecret('guest');await ports.credentials.setGuest(shareCode,secret);}
 const requestId=ports.platform.newId();return cancel?ports.guest.cancel(shareCode,giftId,secret,requestId):ports.guest.reserve(shareCode,giftId,secret,requestId);
});}

export function syncOwnerLibrary(ports:AppPorts,isCurrent:()=>boolean):Promise<void>{return ports.credentials.withExclusive(()=>syncOwnerLibraryUnlocked(ports,isCurrent));}
export function preparePublish(ports:AppPorts,record:DraftRecord,onPersist:(draft:DraftRecord)=>void=()=>{}){return ports.credentials.withExclusive(async()=>{await requireCurrentDraft(ports,record);return preparePublishUnlocked(ports,record,onPersist);});}
export function sendPendingDraft(ports:AppPorts,credentials:Credentials,record:DraftRecord,firstAttempt=false):Promise<DraftRecord>{return ports.credentials.withExclusive(async()=>{const current=await ports.credentials.getOwner();if(current?.deviceSecret!==credentials.deviceSecret||current.pendingDeletion)throw new ApiError('Доступ изменился. Обновите списки перед сохранением.',401,'identity_changed');await requireCurrentDraft(ports,record);return sendPendingDraftUnlocked(ports,credentials,record,firstAttempt);});}
async function requireCurrentDraft(ports:AppPorts,record:DraftRecord){const stored=(await ports.drafts.list()).find(r=>r.localId===record.localId);const authority=(r:DraftRecord)=>JSON.stringify({id:r.event.id,slug:r.event.slug,snapshot:r.snapshot?{id:r.snapshot.event.id,slug:r.snapshot.event.slug,version:r.snapshot.event.version}:null,pending:r.pending?.requestId});if((!stored&&(record.snapshot||record.pending))||(stored&&authority(stored)!==authority(record)))throw new ApiError('Список или доступ изменился в другом окне. Откройте актуальную локальную версию.',409,'local_state_changed');}
/** The same lock covers credential selection, consent, server mutation and acknowledged local write. */
export function publishDraft(ports:AppPorts,record:DraftRecord,onPersist:(draft:DraftRecord)=>void=()=>{}):Promise<DraftRecord>{return ports.credentials.withExclusive(async()=>{if(!ports.platform.isOnline())throw Error('Нет связи. Сохраните список на устройстве.');await requireCurrentDraft(ports,record);const {credentials,staged}=await preparePublishUnlocked(ports,record,onPersist);const next=await sendPendingDraftUnlocked(ports,credentials,staged,!record.pending);onPersist(next);return next;});}
export function reloadOwnerDraft(ports:AppPorts,record:DraftRecord,onPersist:(draft:DraftRecord)=>void=()=>{}):Promise<DraftRecord>{return ports.credentials.withExclusive(async()=>{await requireCurrentDraft(ports,record);const credentials=await ports.credentials.getOwner();if(!credentials?.enrolled||credentials.pendingDeletion||!record.snapshot)throw new ApiError('Доступ изменился. Обновите локальные списки.',401,'identity_changed');const snapshot=await ports.owner.get(credentials.deviceSecret,record.snapshot.event.id);const next={...record,event:snapshot.event,snapshot,pending:undefined,updatedAt:ports.platform.now()};await ports.drafts.put(next);onPersist(next);return next;});}
/** Local-only fallback is allowed solely by the adapter; capable clients use the same cross-tab lock as sync. */
export function persistLocalDraft(ports:AppPorts,record:DraftRecord,onPersist:(draft:DraftRecord)=>void=()=>{}):Promise<void>{return ports.credentials.withExclusive(async()=>{await requireCurrentDraft(ports,record);await ports.drafts.put(record);onPersist(record);},{localOnly:true});}
export function removeLocalDraft(ports:AppPorts,record:DraftRecord):Promise<void>{return ports.credentials.withExclusive(async()=>{await requireCurrentDraft(ports,record);await ports.drafts.remove(record.localId);},{localOnly:true});}
