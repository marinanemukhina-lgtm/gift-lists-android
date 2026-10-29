import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createApiHandler,type Database,type SqlExecutor} from '../src/index';
import {moderate} from '../src/moderate';
import {occasionDefaults,type EventInput,type AdminEvent,type GuestSnapshot} from '../../../packages/domain/src/index';
const credentials=()=>({deviceSecret:`owner_${randomBytes(32).toString('hex')}`,recoverySecret:`recovery_${randomBytes(32).toString('hex')}`});
const guest=()=>`guest_${randomBytes(32).toString('hex')}`;
const eventInput=(published=true):EventInput=>({...occasionDefaults('baby_birthday'),slug:randomBytes(16).toString('hex'),published,gifts:[{id:`gift_${randomUUID()}`,name:'Синтетический подарок',note:'',shop:'',category:'',url:'https://example.com/item',price:null,photo:null,order:0,archived:false}]});
const pg=new PGlite();
after(()=>pg.close());
async function fixture(t:test.TestContext) {
  await pg.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');await pg.exec(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  const adapt=(source:{query:(sql:string,params?:unknown[])=>Promise<any>}):SqlExecutor=>({query:async(text,values)=>{const result=await source.query(text,values);return {rows:result.rows,rowCount:result.affectedRows}}});
  const db:Database={...adapt(pg),transaction:fn=>pg.transaction(tx=>fn(adapt(tx)))};
  const handler=createApiHandler(db,{allowedOrigins:['https://demo.test','https://localhost'],demo:true,trustProxy:true});
  async function call(path:string,method='GET',body?:unknown,options:{owner?:string;guest?:string;key?:string;version?:number;origin?:string;ip?:string;raw?:string}={}){
    const headers:Record<string,string>={'x-forwarded-for':options.ip||'192.0.2.1'};
    if(body!==undefined||options.raw!==undefined)headers['content-type']='application/json';
    if(method!=='GET')headers['idempotency-key']=options.key||randomUUID();
    if(options.owner)headers.authorization=`Bearer ${options.owner}`;
    if(options.guest)headers['x-guest-secret']=options.guest;
    if(options.version!==undefined)headers['if-match']=String(options.version);
    if(options.origin)headers.origin=options.origin;
    const response=await handler(new Request(`https://demo.test/api/v1${path}`,{method,headers,body:options.raw??(body!==undefined?JSON.stringify(body):undefined)}));
    return {status:response.status,body:await response.json() as any,headers:response.headers};
  }
  async function enroll(){const owner=credentials();assert.equal((await call('/owners','POST',owner)).status,201);return owner;}
  async function create(owner:string,input=eventInput()){const response=await call('/me/events','POST',input,{owner});assert.equal(response.status,201,JSON.stringify(response.body));return response.body as AdminEvent;}
  return {pg,db,handler,call,enroll,create};
}
test('new owners are isolated; public views expose no owner, verifier or draft',async t=>{
  const f=await fixture(t);const a=await f.enroll(),b=await f.enroll();const published=await f.create(a.deviceSecret),draft=await f.create(a.deviceSecret,eventInput(false));
  assert.equal((await f.call(`/me/events/${published.event.id}`,'GET',undefined,{owner:b.deviceSecret})).status,404);
  assert.equal((await f.call('/me/events','GET',undefined,{owner:guest()})).status,401);
  assert.equal((await f.call(`/public/events/${draft.event.slug}`)).status,404);
  const list=await f.call('/me/events','GET',undefined,{owner:b.deviceSecret});assert.deepEqual(list.body.events,[]);
  const publicResult=await f.call(`/public/events/${published.event.slug}`);assert.equal(publicResult.status,200);
  const serialized=JSON.stringify(publicResult.body);for(const sensitive of [a.deviceSecret,a.recoverySecret,'owner_id','guest_hash','device_hash','recovery_hash'])assert.ok(!serialized.includes(sensitive));
  const malicious={...published.event,ownerId:(await f.pg.query<{id:string}>('SELECT id FROM owners LIMIT 1')).rows[0].id,title:'Подмена'};
  assert.equal((await f.call(`/me/events/${published.event.id}`,'PUT',malicious,{owner:b.deviceSecret,version:1})).status,404);
  assert.equal((await f.call(`/me/events/${published.event.id}`,'GET',undefined,{owner:a.deviceSecret})).body.event.title,published.event.title);
});
test('enrollment and create/save retries survive lost responses; key reuse and stale versions conflict',async t=>{
  const f=await fixture(t);const owner=credentials(),key=randomUUID();
  assert.equal((await f.call('/owners','POST',owner,{key})).status,201);
  assert.equal((await f.call('/owners','POST',owner,{key})).status,201);
  assert.equal((await f.call('/owners','POST',owner)).status,200);
  const input=eventInput(),saveKey=randomUUID();const first=await f.call('/me/events','POST',input,{owner:owner.deviceSecret,key:saveKey});const retry=await f.call('/me/events','POST',input,{owner:owner.deviceSecret,key:saveKey});assert.deepEqual(retry.body,first.body);
  assert.equal((await f.call('/me/events','POST',{...input,title:'Другой текст'},{owner:owner.deviceSecret,key:saveKey})).status,409);
  const next={...first.body.event,title:'Изменено'},updateKey=randomUUID();
  const saved=await f.call(`/me/events/${next.id}`,'PUT',next,{owner:owner.deviceSecret,key:updateKey,version:1});assert.equal(saved.body.event.version,2);
  assert.deepEqual((await f.call(`/me/events/${next.id}`,'PUT',next,{owner:owner.deviceSecret,key:updateKey,version:1})).body,saved.body);
  assert.equal((await f.call(`/me/events/${next.id}`,'PUT',next,{owner:owner.deviceSecret,version:1})).status,409);
  assert.equal((await f.pg.query('SELECT * FROM events')).rows.length,1);
});
test('recovery lost-response retry works, prior device cannot read/enroll, rotation revokes prior recovery',async t=>{
  const f=await fixture(t);const old=await f.enroll();const initial=await f.create(old.deviceSecret);const fresh=credentials(),key=randomUUID();const recovery={recoverySecret:old.recoverySecret,newDeviceSecret:fresh.deviceSecret};
  assert.equal((await f.call('/owners/recover','POST',recovery,{key})).status,200);
  assert.equal((await f.call('/owners/recover','POST',recovery,{key})).status,200);
  assert.equal((await f.call('/me/events','GET',undefined,{owner:old.deviceSecret})).status,401);
  assert.equal((await f.call('/owners','POST',old)).status,401);
  assert.equal((await f.call('/owners','POST',{deviceSecret:fresh.deviceSecret,recoverySecret:old.recoverySecret})).status,200);
  assert.equal((await f.call('/me/events','GET',undefined,{owner:fresh.deviceSecret})).body.events[0].id,initial.event.id);
  const rotationKey=randomUUID();assert.equal((await f.call('/me/recovery','POST',{newRecoverySecret:fresh.recoverySecret},{owner:fresh.deviceSecret,key:rotationKey})).status,200);
  assert.equal((await f.call('/me/recovery','POST',{newRecoverySecret:fresh.recoverySecret},{owner:fresh.deviceSecret,key:rotationKey})).status,200);
  assert.equal((await f.call('/owners/recover','POST',{recoverySecret:old.recoverySecret,newDeviceSecret:credentials().deviceSecret})).status,401);
  assert.equal((await f.call('/owners/recover','POST',{recoverySecret:fresh.recoverySecret,newDeviceSecret:credentials().deviceSecret})).status,200);
  const dbText=JSON.stringify((await f.pg.query('SELECT * FROM owners')).rows)+JSON.stringify((await f.pg.query('SELECT * FROM operation_receipts')).rows);
  for(const value of [...Object.values(old),...Object.values(fresh)])assert.ok(!dbText.includes(value));
});
test('two guests racing reserve have one winner; cancellation is scoped and retries preserve truth',async t=>{
  const f=await fixture(t);const owner=await f.enroll(),{event}=await f.create(owner.deviceSecret);const a=guest(),b=guest(),id=event.gifts[0].id,path=`/public/events/${event.slug}`,key=randomUUID();
  const [one,two]=await Promise.all([f.call(`${path}/reservations`,'POST',{giftId:id},{guest:a,key}),f.call(`${path}/reservations`,'POST',{giftId:id},{guest:b})]);
  assert.deepEqual([one.status,two.status].sort(),[200,409]);const winner=one.status===200?a:b,loser=winner===a?b:a;
  assert.equal((await f.call(`${path}/reservations/${id}`,'DELETE',undefined,{guest:loser})).status,403);
  assert.equal((await f.call(path,'GET',undefined,{guest:loser})).body.reservations[0].mine,false);
  assert.equal((await f.call(path,'GET',undefined,{guest:winner})).body.reservations[0].mine,true);
  assert.equal((await f.call(`${path}/reservations/${id}`,'DELETE',undefined,{guest:winner})).status,200);
  if(winner===a){const oldRetry=await f.call(`${path}/reservations`,'POST',{giftId:id},{guest:a,key});assert.deepEqual(oldRetry.body.reservations,[]);}
  assert.equal((await f.pg.query('SELECT * FROM reservations')).rows.length,0);
});
test('event and gift IDs cannot cross owners; cancellation cannot cross event',async t=>{
  const f=await fixture(t);const owner=await f.enroll(),other=await f.enroll(),a=await f.create(owner.deviceSecret),b=await f.create(other.deviceSecret);const token=guest();
  const p=`/public/events/${a.event.slug}`;await f.call(`${p}/reservations`,'POST',{giftId:a.event.gifts[0].id},{guest:token});
  assert.equal((await f.call(`/public/events/${b.event.slug}/reservations/${a.event.gifts[0].id}`,'DELETE',undefined,{guest:token})).status,404);
  const collision={...b.event,gifts:[a.event.gifts[0]]};
  assert.equal((await f.call(`/me/events/${b.event.id}`,'PUT',collision,{owner:other.deviceSecret,version:1})).status,409);
  assert.equal((await f.pg.query('SELECT * FROM reservations')).rows.length,1);
});
test('booking versus archive is atomic in both orderings; booked removal/unpublish fail',async t=>{
  const f=await fixture(t),owner=await f.enroll();
  for(const archiveFirst of [true,false]){
    const {event}=await f.create(owner.deviceSecret);const input={...event,gifts:event.gifts.map(g=>({...g,archived:true}))};
    const archive=()=>f.call(`/me/events/${event.id}`,'PUT',input,{owner:owner.deviceSecret,version:1});const reserve=()=>f.call(`/public/events/${event.slug}/reservations`,'POST',{giftId:event.gifts[0].id},{guest:guest()});
    const results=archiveFirst?await Promise.all([archive(),reserve()]):await Promise.all([reserve(),archive()]);
    assert.equal(results[0].status,200);assert.equal(results[1].status,409);
    const saved=(await f.call(`/me/events/${event.id}`,'GET',undefined,{owner:owner.deviceSecret})).body as AdminEvent;
    assert.equal(saved.event.gifts[0].archived,archiveFirst);assert.equal(saved.bookedIds.length,archiveFirst?0:1);
    assert.equal((await f.call(`/me/events/${event.id}`,'PUT',{...saved.event,gifts:[]},{owner:owner.deviceSecret,version:saved.event.version})).status,409);
    assert.equal((await f.call(`/me/events/${event.id}`,'PUT',{...saved.event,published:false},{owner:owner.deviceSecret,version:saved.event.version})).status,409);
  }
});
test('simultaneous optimistic edits have one winner and loser leaves no partial changes',async t=>{
  const f=await fixture(t),owner=await f.enroll(),{event}=await f.create(owner.deviceSecret);
  const results=await Promise.all(['Первый','Второй'].map(title=>f.call(`/me/events/${event.id}`,'PUT',{...event,title},{owner:owner.deviceSecret,version:1})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const state=(await f.call(`/me/events/${event.id}`,'GET',undefined,{owner:owner.deviceSecret})).body as AdminEvent;
  assert.equal(state.event.version,2);assert.equal(state.event.title,results.find(r=>r.status===200)!.body.event.title);
});
test('owner deletion removes lists, gifts, reservations, reports and content receipts; safe deletion retry',async t=>{
  const f=await fixture(t),owner=await f.enroll(),other=await f.enroll(),{event}=await f.create(owner.deviceSecret);await f.create(other.deviceSecret);const token=guest();
  await f.call(`/public/events/${event.slug}/reservations`,'POST',{giftId:event.gifts[0].id},{guest:token});
  assert.equal((await f.call('/reports','POST',{shareCode:event.slug,reason:'Тестовая жалоба для проверки удаления'})).status,201);
  const key=randomUUID();assert.equal((await f.call('/me','DELETE',undefined,{owner:owner.deviceSecret,key})).status,200);assert.equal((await f.call('/me','DELETE',undefined,{owner:owner.deviceSecret,key})).status,200);
  assert.equal((await f.call(`/public/events/${event.slug}`)).status,404);assert.equal((await f.call('/me/events','GET',undefined,{owner:owner.deviceSecret})).status,401);
  assert.equal((await f.pg.query('SELECT * FROM reservations')).rows.length,0);assert.equal((await f.pg.query('SELECT * FROM reports')).rows.length,0);assert.equal((await f.pg.query('SELECT * FROM events')).rows.length,1);
  const remaining=JSON.stringify((await f.pg.query('SELECT response FROM operation_receipts')).rows);assert.ok(!remaining.includes(event.slug));
  assert.equal((await f.call('/owners','POST',owner)).status,401);
});
test('URL/color/body/origin/date/idempotency validation rejects unsafe inputs without writes',async t=>{
  const f=await fixture(t),owner=await f.enroll();const base=eventInput();
  const variants=[{...base,theme:{...base.theme,accent:'red;display:none'}},{...base,date:'2026-02-30'},{...base,gifts:[{...base.gifts[0],url:'javascript:alert(1)'}]},{...base,gifts:[{...base.gifts[0],photo:'file:///etc/passwd'}]},{...base,gifts:[{...base.gifts[0],url:'https://user:pass@example.com'}]}];
  for(const input of variants)assert.equal((await f.call('/me/events','POST',input,{owner:owner.deviceSecret})).status,400);
  assert.equal((await f.call('/me/events','POST',base,{owner:owner.deviceSecret,origin:'https://evil.test'})).status,403);
  assert.equal((await f.call('/me/events','POST',undefined,{owner:owner.deviceSecret,raw:'{"huge":"'+'x'.repeat(262144)+'"}'})).status,413);
  assert.equal((await f.call('/me/events','POST',undefined,{owner:owner.deviceSecret,raw:'{'})).status,400);
  assert.equal((await f.call('/me/events','POST',base,{owner:owner.deviceSecret,key:'bad'})).status,400);
  assert.equal((await f.pg.query('SELECT * FROM events')).rows.length,0);
});
test('reports persist once and scoped limits do not consume unrelated owner capacity',async t=>{
  const f=await fixture(t),owner=await f.enroll(),{event}=await f.create(owner.deviceSecret);const key=randomUUID(),report={shareCode:event.slug,reason:'Синтетическая жалоба'};
  assert.equal((await f.call('/reports','POST',report,{key})).status,201);assert.equal((await f.call('/reports','POST',report,{key})).status,201);assert.equal((await f.pg.query('SELECT * FROM reports')).rows.length,1);
  for(let i=0;i<4;i++)await f.call('/reports','POST',report);
  assert.equal((await f.call('/reports','POST',report)).status,429);
  assert.equal((await f.call('/reports','POST',report,{ip:'192.0.2.2'})).status,201);
  assert.equal((await f.call('/me/events','GET',undefined,{owner:owner.deviceSecret})).status,200);
});

test('all four occasions persist editable fields and independent designs',async t=>{
  const f=await fixture(t),owner=await f.enroll();
  for(const occasion of ['baby_birthday','child_birthday','adult_birthday','wedding'] as const){
    const input={...eventInput(),...occasionDefaults(occasion),names:'Синтетический пример',date:'2027-01-23',introduction:'Свой текст',theme:{...occasionDefaults(occasion).theme,accent:'#000000',background:'#ffffff',card:'#ffeecc',layout:'list' as const}};
    const {event}=await f.create(owner.deviceSecret,input);const saved=await f.call(`/me/events/${event.id}`,'GET',undefined,{owner:owner.deviceSecret});
    assert.equal(saved.body.event.occasion,occasion);assert.equal(saved.body.event.names,input.names);assert.equal(saved.body.event.date,input.date);assert.deepEqual(saved.body.event.theme,input.theme);
  }
});
test('failed recovery attempts retain scoped throttle counters and do not consume read budget',async t=>{
  const f=await fixture(t),owner=await f.enroll();
  for(let i=0;i<10;i++)assert.equal((await f.call('/owners/recover','POST',{recoverySecret:credentials().recoverySecret,newDeviceSecret:credentials().deviceSecret})).status,401);
  assert.equal((await f.call('/owners/recover','POST',{recoverySecret:owner.recoverySecret,newDeviceSecret:credentials().deviceSecret})).status,429);
  assert.equal((await f.call('/me/events','GET',undefined,{owner:owner.deviceSecret})).status,200);
  assert.equal((await f.call('/owners/recover','POST',{recoverySecret:owner.recoverySecret,newDeviceSecret:credentials().deviceSecret},{ip:'192.0.2.20'})).status,200);
});
test('operator moderation requires explicit confirmation and really removes reported content',async t=>{
  const f=await fixture(t),owner=await f.enroll(),{event}=await f.create(owner.deviceSecret);const key=randomUUID(),input=eventInput();
  await f.call('/reports','POST',{shareCode:event.slug,reason:'Тестовая жалоба'});
  const reports=await moderate(f.db,'list-reports') as {id:string;event_id:string}[];assert.equal(reports[0].event_id,event.id);
  await assert.rejects(moderate(f.db,'remove-list',event.id),/--confirm/);
  assert.equal((await f.call(`/public/events/${event.slug}`)).status,200);
  assert.deepEqual(await moderate(f.db,'resolve-report',reports[0].id,true),{resolved:true});
  assert.deepEqual(await moderate(f.db,'remove-list',event.id,true),{removed:true});
  assert.equal((await f.call(`/public/events/${event.slug}`)).status,404);
  assert.equal((await f.pg.query('SELECT * FROM moderation_actions')).rows.length,1);
  assert.ok(!JSON.stringify((await f.pg.query('SELECT * FROM operation_receipts')).rows).includes(event.id));
});
test('stalled request bodies time out rather than holding a database operation open',async t=>{
  const f=await fixture(t);let cancelled=false;
  const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
  const request=new Request('https://demo.test/api/v1/owners',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body,duplex:'half'} as RequestInit);
  const start=Date.now();const response=await f.handler(request);assert.equal(response.status,408);assert.ok(Date.now()-start<12_000);assert.equal(cancelled,true);
  assert.equal((await f.pg.query('SELECT * FROM owners')).rows.length,0);
});
test('SQL constraints independently reject archived bookings and gift reassignment',async t=>{
  const f=await fixture(t),owner=await f.enroll(),a=await f.create(owner.deviceSecret),b=await f.create(owner.deviceSecret);const token=guest();
  await f.call(`/public/events/${a.event.slug}/reservations`,'POST',{giftId:a.event.gifts[0].id},{guest:token});
  await assert.rejects(f.pg.query('UPDATE gifts SET archived=true WHERE id=$1',[a.event.gifts[0].id]));
  await assert.rejects(f.pg.query('UPDATE gifts SET event_id=$1 WHERE id=$2',[b.event.id,a.event.gifts[0].id]));
  await f.pg.query('UPDATE gifts SET archived=true WHERE id=$1',[b.event.gifts[0].id]);
  await assert.rejects(f.pg.query('INSERT INTO reservations(event_id,gift_id,guest_hash) VALUES($1,$2,$3)',[b.event.id,b.event.gifts[0].id,'a'.repeat(64)]));
  assert.equal((await f.pg.query('SELECT * FROM reservations')).rows.length,1);
});

test('superseded recovery-code rotation replay cannot acknowledge a revoked recovery code',async t=>{
  const f=await fixture(t),owner=await f.enroll();const b=credentials().recoverySecret,c=credentials().recoverySecret,key1=randomUUID(),key2=randomUUID();
  assert.equal((await f.call('/me/recovery','POST',{newRecoverySecret:b},{owner:owner.deviceSecret,key:key1})).status,200);
  assert.equal((await f.call('/me/recovery','POST',{newRecoverySecret:c},{owner:owner.deviceSecret,key:key2})).status,200);
  const replay=await f.call('/me/recovery','POST',{newRecoverySecret:b},{owner:owner.deviceSecret,key:key1});assert.equal(replay.status,409);assert.equal(replay.body.code,'recovery_rotation_superseded');
  assert.equal((await f.call('/owners/recover','POST',{recoverySecret:b,newDeviceSecret:credentials().deviceSecret})).status,401);
  assert.equal((await f.call('/owners/recover','POST',{recoverySecret:c,newDeviceSecret:credentials().deviceSecret})).status,200);
});

test('online rehearsal: independent handlers retain booking through edit, recovery and scoped cleanup',async t=>{
  const f=await fixture(t),owner=await f.enroll(),other=await f.enroll();
  const untouched=await f.create(other.deviceSecret),{event}=await f.create(owner.deviceSecret);
  // A new handler represents another function instance: no shared handler-local cache.
  const independent=createApiHandler(f.db,{allowedOrigins:['https://demo.test'],demo:true});
  async function independentRead(token:string){
    const response=await independent(new Request(`https://demo.test/api/v1/public/events/${event.slug}`,{headers:{'x-guest-secret':token}}));
    assert.equal(response.status,200);return await response.json() as GuestSnapshot;
  }
  const guests=[guest(),guest()],path=`/public/events/${event.slug}`,giftId=event.gifts[0].id;
  const race=await Promise.all(guests.map(token=>f.call(`${path}/reservations`,'POST',{giftId},{guest:token})));
  assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
  const winner=guests[race.findIndex(x=>x.status===200)],loser=guests[race.findIndex(x=>x.status===409)];
  assert.equal((await independentRead(winner)).reservations[0].mine,true);
  assert.equal((await independentRead(loser)).reservations[0].mine,false);
  const saved=await f.call(`/me/events/${event.id}`,'PUT',{...event,title:'Синтетическая проверка сохранения'},{owner:owner.deviceSecret,version:1});
  assert.equal(saved.status,200);assert.equal((await independentRead(winner)).reservations.length,1);
  assert.equal((await f.call(`${path}/reservations/${giftId}`,'DELETE',undefined,{guest:winner})).status,200);
  assert.equal((await f.call(`${path}/reservations`,'POST',{giftId},{guest:loser})).status,200);
  assert.equal((await independentRead(loser)).reservations[0].mine,true);
  const replacement=credentials();
  assert.equal((await f.call('/owners/recover','POST',{recoverySecret:owner.recoverySecret,newDeviceSecret:replacement.deviceSecret})).status,200);
  assert.equal((await f.call('/me/events','GET',undefined,{owner:owner.deviceSecret})).status,401);
  const recovered=await f.call(`/me/events/${event.id}`,'GET',undefined,{owner:replacement.deviceSecret});
  assert.equal(recovered.body.event.title,'Синтетическая проверка сохранения');assert.deepEqual(recovered.body.bookedIds,[giftId]);
  assert.equal((await f.call('/me','DELETE',undefined,{owner:replacement.deviceSecret})).status,200);
  assert.equal((await f.call(path)).status,404);
  assert.equal((await f.call(`/me/events/${untouched.event.id}`,'GET',undefined,{owner:other.deviceSecret})).status,200);
  assert.equal((await f.pg.query('SELECT * FROM reservations')).rows.length,0);
});
