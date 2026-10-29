/** Explicit synthetic-only HTTP acceptance. No database secret required or logged. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {occasionDefaults,type EventInput} from '../../../packages/domain/src/index';
const origin=process.env.GIFT_ACCEPTANCE_ORIGIN||'';
if(process.env.GIFT_ACCEPTANCE_ISOLATED!=='yes'||!/^https:\/\/[a-z0-9.-]+$/.test(origin))throw Error('Explicit authorized HTTPS synthetic target required');
const creds=()=>({deviceSecret:`owner_${randomBytes(32).toString('hex')}`,recoverySecret:`recovery_${randomBytes(32).toString('hex')}`});
const owners=[creds(),creds()];const cleanup=new Set(owners.map(x=>x.deviceSecret));
const guests=[`guest_${randomBytes(32).toString('hex')}`,`guest_${randomBytes(32).toString('hex')}`];
const cleanupKeys=new Map<string,string>();let shareCode='';
async function call(path:string,method='GET',body?:unknown,owner?:string,guest?:string,version?:number,key:string=randomUUID()){
 const headers:Record<string,string>={origin,'idempotency-key':key};
 if(body!==undefined)headers['content-type']='application/json';if(owner)headers.authorization=`Bearer ${owner}`;if(guest)headers['x-guest-secret']=guest;if(version!==undefined)headers['if-match']=String(version);
 const r=await fetch(`${origin}/api/v1${path}`,{method,headers,body:body!==undefined?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});
 return {status:r.status,body:await r.json() as any,headers:r.headers};
}
try{
 const health=await call('/health');assert.equal(health.status,200);assert.equal(health.body.demo,true);assert.equal(health.headers.get('access-control-allow-origin'),origin);
 for(const owner of owners)assert.equal((await call('/owners','POST',owner)).status,201);
 const input:EventInput={...occasionDefaults('adult_birthday'),title:'Синтетическая онлайн-проверка',slug:randomBytes(16).toString('hex'),published:true,gifts:[{id:`gift_${randomUUID()}`,name:'Синтетический подарок',note:'',shop:'',category:'',url:'',price:null,photo:null,order:0,archived:false}]};
 const made=await call('/me/events','POST',input,owners[0].deviceSecret);assert.equal(made.status,201);const event=made.body.event;shareCode=event.slug;
 assert.equal((await call(`/me/events/${event.id}`,'GET',undefined,owners[1].deviceSecret)).status,404);
 const path=`/public/events/${event.slug}`,giftId=event.gifts[0].id;
 const race=await Promise.all(guests.map(guest=>call(`${path}/reservations`,'POST',{giftId},undefined,guest)));assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
 const winner=guests[race.findIndex(x=>x.status===200)],loser=guests[race.findIndex(x=>x.status===409)];
 assert.equal((await call(path,'GET',undefined,undefined,winner)).body.reservations[0].mine,true);
 assert.equal((await call(path,'GET',undefined,undefined,loser)).body.reservations[0].mine,false);
 assert.equal((await call(`${path}/reservations/${giftId}`,'DELETE',undefined,undefined,loser)).status,403);
 assert.equal((await call(`/me/events/${event.id}`,'PUT',{...event,title:'Синтетическая проверка сохранения'},owners[0].deviceSecret,undefined,event.version)).status,200);
 assert.equal((await call(path,'GET',undefined,undefined,winner)).body.reservations.length,1);
 assert.equal((await call(`${path}/reservations/${giftId}`,'DELETE',undefined,undefined,winner)).status,200);
 assert.equal((await call(`${path}/reservations`,'POST',{giftId},undefined,loser)).status,200);
 const fresh=creds();cleanup.add(fresh.deviceSecret);
 assert.equal((await call('/owners/recover','POST',{recoverySecret:owners[0].recoverySecret,newDeviceSecret:fresh.deviceSecret})).status,200);
 assert.equal((await call('/me/events','GET',undefined,owners[0].deviceSecret)).status,401);
 const restored=await call(`/me/events/${event.id}`,'GET',undefined,fresh.deviceSecret);assert.equal(restored.body.event.title,'Синтетическая проверка сохранения');assert.deepEqual(restored.body.bookedIds,[giftId]);
 process.stdout.write('PASS: real HTTPS/CORS; PostgreSQL persistence across requests; tenant isolation; two-client race200/409; scoped cancellation; edit preserves booking; rebook; recovery revokes old device.\n');
}catch{process.stderr.write('FAIL: synthetic online acceptance. No credential or response payload logged.\n');process.exitCode=1;}
finally{
 let bad=false;
 for(const token of cleanup){const key=cleanupKeys.get(token)||randomUUID();cleanupKeys.set(token,key);const r=await call('/me','DELETE',undefined,token,undefined,undefined,key).catch(()=>null);if(!r||![200,401].includes(r.status))bad=true;}
 if(shareCode){const gone=await call(`/public/events/${shareCode}`).catch(()=>null);if(gone?.status!==404)bad=true;}
 if(bad){process.stderr.write('FAIL: targeted cleanup needs inspection.\n');process.exitCode=1;}else process.stdout.write('PASS: targeted synthetic owner/list cleanup; public list404. Anti-abuse tombstones retain normal expiry.\n');
}
