/** Explicit, mutating acceptance runner for an operator-authorized isolated database.
 * Not included in default unit tests. No connection/credential values are printed.
 * Requires the reviewed schema already applied; creates synthetic owners and deletes
 * them in finally. Never run against legacy or customer data. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApiHandler} from '../src/index';
import {createPgDatabase} from '../src/pg';
import {occasionDefaults,type EventInput} from '../../../packages/domain/src/index';
if(process.env.GIFT_ACCEPTANCE_ISOLATED!=='yes')throw new Error('Set GIFT_ACCEPTANCE_ISOLATED=yes only for an authorized disposable/demo database.');
const db=createPgDatabase(process.env.DATABASE_URL||'');
const handler=createApiHandler(db,{allowedOrigins:[],demo:true});
const owners=Array.from({length:2},()=>({deviceSecret:`owner_${randomBytes(32).toString('hex')}`,recoverySecret:`recovery_${randomBytes(32).toString('hex')}`}));
const guests=Array.from({length:2},()=>`guest_${randomBytes(32).toString('hex')}`);
async function call(path:string,method='GET',body?:unknown,owner?:string,guest?:string,version?:number){
  const headers:Record<string,string>={'idempotency-key':randomUUID()};
  if(body)headers['content-type']='application/json';if(owner)headers.authorization=`Bearer ${owner}`;if(guest)headers['x-guest-secret']=guest;if(version!==undefined)headers['if-match']=String(version);
  const response=await handler(new Request(`https://acceptance.invalid/api/v1${path}`,{method,headers,body:body?JSON.stringify(body):undefined}));return {status:response.status,body:await response.json() as any};
}
try{
  for(const owner of owners)assert.equal((await call('/owners','POST',owner)).status,201);
  const input:EventInput={...occasionDefaults('adult_birthday'),title:'Синтетическая проверка PostgreSQL',slug:randomBytes(16).toString('hex'),published:true,gifts:[{id:`gift_${randomUUID()}`,name:'Синтетический подарок',note:'',shop:'',category:'',url:'',price:null,photo:null,order:0,archived:false}]};
  const made=await call('/me/events','POST',input,owners[0].deviceSecret);assert.equal(made.status,201);const event=made.body.event;
  assert.equal((await call(`/me/events/${event.id}`,'GET',undefined,owners[1].deviceSecret)).status,404);
  const path=`/public/events/${event.slug}/reservations`,giftId=event.gifts[0].id;
  const race=await Promise.all(guests.map(guest=>call(path,'POST',{giftId},undefined,guest)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  const winner=guests[race.findIndex(r=>r.status===200)],loser=guests[race.findIndex(r=>r.status===409)];
  assert.equal((await call(`${path}/${giftId}`,'DELETE',undefined,undefined,loser)).status,403);
  const archived={...event,gifts:[{...event.gifts[0],archived:true}]};assert.equal((await call(`/me/events/${event.id}`,'PUT',archived,owners[0].deviceSecret,undefined,1)).status,409);
  assert.equal((await call(`${path}/${giftId}`,'DELETE',undefined,undefined,winner)).status,200);
  const edits=await Promise.all(['Синтетический A','Синтетический B'].map(title=>call(`/me/events/${event.id}`,'PUT',{...event,title},owners[0].deviceSecret,undefined,1)));assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  const fresh=(await call(`/me/events/${event.id}`,'GET',undefined,owners[0].deviceSecret)).body.event;
  const archiveRace=await Promise.all([call(`/me/events/${event.id}`,'PUT',{...fresh,gifts:[{...fresh.gifts[0],archived:true}]},owners[0].deviceSecret,undefined,fresh.version),call(path,'POST',{giftId},undefined,guests[0])]);assert.deepEqual(archiveRace.map(r=>r.status).sort(),[200,409]);
  process.stdout.write('Isolated PostgreSQL acceptance passed: tenant isolation, atomic single winner, scoped cancellation, archive race, optimistic edits.\n');
}catch{process.stderr.write('Isolated PostgreSQL acceptance failed. Credential and database details suppressed.\n');process.exitCode=1;}
finally{
  let cleanupFailed=false;for(const owner of owners){const removed=await call('/me','DELETE',undefined,owner.deviceSecret).catch(()=>null);if(!removed||!([200,401].includes(removed.status)))cleanupFailed=true;}
  await db.close();if(cleanupFailed){process.stderr.write('Synthetic owner cleanup needs operator inspection.\n');process.exitCode=1;}
}
