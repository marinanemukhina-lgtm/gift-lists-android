import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import {validateEventInput, InputError, type AdminEvent, type EventInput, type EventProfile, type Gift, type GuestSnapshot} from '../../../packages/domain/src/index';
import type {Database, SqlExecutor} from './database';
export type {Database, SqlExecutor} from './database';
export type ApiOptions = {allowedOrigins: string[]; demo?: boolean; supportContact?: string; trustProxy?: boolean; now?: () => Date};
type Owner = {id: string; device_hash: string; recovery_hash: string};
type EventRow = {id: string; owner_id: string; share_code: string; data: Omit<EventInput, 'gifts'|'version'>; published: boolean; version: number};
type Result = {status:number; body:unknown};
class Fault extends Error {constructor(public status:number, public code:string, message:string) {super(message);}}
const fail = (status:number,code:string,message:string):never => {throw new Fault(status,code,message)};
const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const equal = (a:string,b:string) => a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const secret = (value:unknown, kind:'owner'|'recovery'|'guest'):string => typeof value === 'string' && new RegExp(`^${kind}_[a-f0-9]{64}$`).test(value) ? value : fail(401,'invalid_credentials','Недействительный код доступа.');
const object = (value:unknown):Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : fail(400,'invalid_body','Ожидается объект JSON.');
const bearer = (request:Request) => secret(request.headers.get('authorization')?.replace(/^Bearer /,''), 'owner');
const code = (value:string) => /^[a-f0-9]{32}$/.test(value) ? value : fail(404,'not_found','Список не найден.');
const idKey = (request:Request) => {const key=request.headers.get('idempotency-key');return key && /^[A-Za-z0-9_-]{8,100}$/.test(key) ? key : fail(400,'idempotency_required','Нужен корректный идентификатор запроса.');};
const giftId = (value:unknown) => typeof value==='string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : fail(400,'invalid_gift','Некорректный подарок.');
async function readBody(request:Request):Promise<unknown> {
  const max=262144;
  const declared=request.headers.get('content-length');
  if(declared && (!/^\d+$/.test(declared) || Number(declared)>max))fail(413,'body_too_large','Запрос слишком большой.');
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'json_required','Нужен Content-Type application/json.');
  const reader=request.body?.getReader(); if(!reader)return {};
  const chunks:Uint8Array[]=[];let length=0;const deadline=Date.now()+10_000;
  try{for(;;){let timer:ReturnType<typeof setTimeout>|undefined;const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new Fault(408,'body_timeout','Запрос поступает слишком медленно. Повторите.'));void reader.cancel().catch(()=>{});},Math.max(0,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));const {done,value}=part;if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();fail(413,'body_too_large','Запрос слишком большой.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(400,'invalid_json','Некорректный JSON.');}
}
async function ownerFor(tx:SqlExecutor,request:Request):Promise<Owner> {
  const verifier=hash(bearer(request));
  const owner=(await tx.query<Owner>('SELECT id,device_hash,recovery_hash FROM owners WHERE device_hash=$1 FOR UPDATE',[verifier])).rows[0];
  if(!owner || !equal(owner.device_hash,verifier))fail(401,'unauthorized','Доступ отозван. Восстановите доступ кодом восстановления.');
  return owner;
}
async function eventForOwner(tx:SqlExecutor,ownerId:string,id:string):Promise<EventRow> {
  const row=(await tx.query<EventRow>('SELECT * FROM events WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,ownerId])).rows[0];
  if(!row)fail(404,'not_found','Список не найден.');return row;
}
async function eventForGuest(tx:SqlExecutor,shareCode:string):Promise<EventRow> {
  const row=(await tx.query<EventRow>('SELECT * FROM events WHERE share_code=$1 AND published=true FOR UPDATE',[code(shareCode)])).rows[0];
  if(!row)fail(404,'not_found','Список не найден или ещё не опубликован.');return row;
}
async function eventProfile(tx:SqlExecutor,row:EventRow,isPublic=false):Promise<EventProfile> {
  const gifts=(await tx.query<{data:Gift;archived:boolean;position:number}>('SELECT data,archived,position FROM gifts WHERE event_id=$1 ORDER BY position,id',[row.id])).rows;
  return {...row.data,id:row.id,slug:row.share_code,version:row.version,published:row.published,gifts:gifts.filter(g=>!isPublic||!g.archived).map(g=>({...g.data,archived:g.archived,order:g.position}))};
}
async function adminEvent(tx:SqlExecutor,row:EventRow):Promise<AdminEvent> {
  return {event:await eventProfile(tx,row),bookedIds:(await tx.query<{gift_id:string}>('SELECT gift_id FROM reservations WHERE event_id=$1 ORDER BY gift_id',[row.id])).rows.map(r=>r.gift_id)};
}
async function guestSnapshot(tx:SqlExecutor,row:EventRow,guestHash:string|null,now:()=>Date):Promise<GuestSnapshot> {
  return {event:await eventProfile(tx,row,true),reservations:(await tx.query<{gift_id:string;guest_hash:string}>('SELECT gift_id,guest_hash FROM reservations WHERE event_id=$1 ORDER BY gift_id',[row.id])).rows.map(r=>({id:r.gift_id,mine:!!guestHash&&equal(r.guest_hash,guestHash)})),fetchedAt:now().toISOString()};
}
async function receipt(tx:SqlExecutor,scope:string,key:string,requestHash:string,action:()=>Promise<Result>):Promise<Result> {
  const existing=(await tx.query<{request_hash:string;status:number;response:unknown}>('SELECT request_hash,status,response FROM operation_receipts WHERE scope=$1 AND key=$2',[scope,key])).rows[0];
  if(existing){if(!equal(existing.request_hash,requestHash))fail(409,'idempotency_conflict','Этот идентификатор уже использован для другого запроса.');return {status:existing.status,body:existing.response};}
  const count=(await tx.query<{count:string}>('SELECT count(*)::text AS count FROM operation_receipts')).rows[0];
  if(Number(count.count)>=20_000&&!scope.startsWith('deleted:'))fail(429,'capacity_reached','Демо достигло предела операций. Обратитесь к оператору.');
  const result=await action();
  await tx.query('INSERT INTO operation_receipts(scope,key,request_hash,status,response) VALUES($1,$2,$3,$4,$5::jsonb)',[scope,key,requestHash,result.status,JSON.stringify(result.body)]);
  return result;
}
async function throttle(tx:SqlExecutor,key:string,limit:number,minute:number):Promise<void> {
  const row=(await tx.query<{hits:number}>(`INSERT INTO rate_buckets(key,window_start,hits) VALUES($1,$2,1)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_buckets.window_start=$2 THEN rate_buckets.hits+1 ELSE 1 END,window_start=$2 RETURNING hits`,[hash(key),minute])).rows[0];
  if(row.hits>limit)fail(429,'rate_limited','Слишком много запросов. Подождите минуту и повторите.');
}
async function cap(tx:SqlExecutor,table:'owners'|'events'|'reports',limit:number,where=''):Promise<void> {
  const row=(await tx.query<{count:string}>(`SELECT count(*)::text AS count FROM ${table} ${where}`)).rows[0];
  if(Number(row.count)>=limit)fail(429,'capacity_reached','Демо временно достигло предела. Повторите позже.');
}

// These counters deliberately run before the operation savepoint, so rejected
// recovery guesses, conflicts and cancellations consume the same abuse budget.
async function routeLimits(tx:SqlExecutor,request:Request,path:string,raw:unknown,ip:string,minute:number):Promise<void> {
  const body=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  if(path==='/owners'&&request.method==='POST'){
    let matching=false;
    if(typeof body.deviceSecret==='string'&&typeof body.recoverySecret==='string')matching=(await tx.query('SELECT id FROM owners WHERE device_hash=$1 AND recovery_hash=$2',[hash(body.deviceSecret),hash(body.recoverySecret)])).rows.length>0;
    if(!matching)await throttle(tx,`enroll:${ip}`,5,minute);
  }
  if(path==='/owners/recover')await throttle(tx,`recover:${ip}`,10,minute);
  if(path==='/reports')await throttle(tx,`report:${ip}`,5,minute);
  if(path.startsWith('/me')){
    const rawSecret=request.headers.get('authorization')||'';
    const verifier=hash(rawSecret.replace(/^Bearer /,''));
    const owner=(await tx.query<{id:string}>('SELECT id FROM owners WHERE device_hash=$1',[verifier])).rows[0];
    const kind=request.method==='GET'?'read':'write';await throttle(tx,`owner:${kind}:${owner?.id||verifier}`,kind==='read'?300:90,minute);
  }
  const match=/^\/public\/events\/([a-f0-9]{32})\/reservations/.exec(path);
  if(match&&request.method!=='GET'){
    await throttle(tx,`guest:${hash(request.headers.get('x-guest-secret')||'missing')}`,30,minute);
    await throttle(tx,`event:${match[1]}`,240,minute);
  }
}

function errorResult(error:unknown):Result {
  if(error instanceof Fault)return {status:error.status,body:{error:error.message,code:error.code}};
  if(error instanceof InputError)return {status:400,body:{error:error.message,code:'invalid_input'}};
  const sqlCode=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
  if(sqlCode==='23505')return {status:409,body:{error:'Код уже используется. Обновите список и повторите.',code:'conflict'}};
  if(sqlCode==='23514')return {status:409,body:{error:'Подарок уже забронирован или недоступен.',code:'booking_conflict'}};
  return {status:503,body:{error:'Сервис временно недоступен. Сохранённый на устройстве черновик не потерян.',code:'service_unavailable'}};
}
/** No request-time migrations, secrets in logs, cookie authorization or cloud-specific DB APIs. */
export function createApiHandler(db:Database,options:ApiOptions):(request:Request)=>Promise<Response> {
  const now=options.now??(()=>new Date());
  const allowed=new Set(options.allowedOrigins);
  return async request => {
    const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','vary':'Origin'});
    const origin=request.headers.get('origin');
    const respond=(result:Result)=>new Response(JSON.stringify(result.body),{status:result.status,headers});
    if(origin && !allowed.has(origin))return respond({status:403,body:{error:'Источник запроса не разрешён.',code:'origin_denied'}});
    if(origin)headers.set('access-control-allow-origin',origin);
    if(request.method==='OPTIONS'){
      headers.set('access-control-allow-methods','GET,POST,PUT,DELETE,OPTIONS');
      headers.set('access-control-allow-headers','Authorization,Content-Type,Idempotency-Key,If-Match,X-Guest-Secret');
      headers.set('access-control-max-age','600');return new Response(null,{status:204,headers});
    }
    try {
      const url=new URL(request.url);const path=url.pathname.replace(/^\/api\/v1/,'');
      if(!url.pathname.startsWith('/api/v1/'))fail(404,'not_found','Маршрут не найден.');
      if(request.method==='GET'&&path==='/health')return respond({status:200,body:{ok:true,demo:options.demo??false}});
      const body=['POST','PUT'].includes(request.method)?await readBody(request):{};
      const key=request.method==='GET'?'':idKey(request);
      const requestHash=hash(JSON.stringify({method:request.method,path,body,ifMatch:request.headers.get('if-match')}));
      const ip=options.trustProxy?(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'):'untrusted';
      const minute=Math.floor(now().getTime()/60_000);
      const result=await db.transaction(async tx=>{
        // Bounded personal demo writes use one DB lock (no process-local mutex). This
        // remains correct across serverless workers. Scale by keyed locks after migration.
        await tx.query('SELECT id FROM api_lock WHERE id=1 FOR UPDATE');
        await tx.query('DELETE FROM rate_buckets WHERE window_start<$1',[minute-2]);
        await tx.query("DELETE FROM operation_receipts WHERE created_at < now()-interval '30 days'");
        await tx.query("DELETE FROM retired_credentials WHERE created_at < now()-interval '30 days'");
        await tx.query("DELETE FROM reports WHERE created_at < now()-interval '30 days'");
        await tx.query("DELETE FROM moderation_actions WHERE created_at < now()-interval '30 days'");
        try {const kind=request.method==='GET'?'read':'write';await throttle(tx,`global:${kind}`,kind==='read'?2400:1200,minute);await throttle(tx,`ip:${kind}:${ip}`,kind==='read'?600:120,minute);await routeLimits(tx,request,path,body,ip,minute);}
        catch(error){return errorResult(error);}
        await tx.query('SAVEPOINT operation');
        try {
          const result=await route(tx,request,path,body,key,requestHash,ip,minute,now);
          await tx.query('RELEASE SAVEPOINT operation');return result;
        } catch(error) {await tx.query('ROLLBACK TO SAVEPOINT operation');return errorResult(error);}
      });
      return respond(result);
    }catch(error){return respond(errorResult(error));}
  };
}
async function route(tx:SqlExecutor,request:Request,path:string,raw:unknown,key:string,requestHash:string,ip:string,minute:number,now:()=>Date):Promise<Result> {
  const method=request.method;const body=object(raw);const ok:Result={status:200,body:{ok:true}};
  if(method==='POST'&&path==='/owners'){
    const deviceHash=hash(secret(body.deviceSecret,'owner')),recoveryHash=hash(secret(body.recoverySecret,'recovery'));
    if((await tx.query('SELECT hash FROM retired_credentials WHERE hash IN ($1,$2)',[deviceHash,recoveryHash])).rows.length)fail(401,'revoked_credentials','Этот доступ отозван. Создайте новые коды.');
    const current=(await tx.query<Owner>('SELECT * FROM owners WHERE device_hash=$1 OR recovery_hash=$2 FOR UPDATE',[deviceHash,recoveryHash])).rows[0];
    if(current && (!equal(current.device_hash,deviceHash)||!equal(current.recovery_hash,recoveryHash)))fail(409,'credential_conflict','Коды уже используются. Используйте восстановление.');
    return receipt(tx,`enroll:${deviceHash}`,key,requestHash,async()=>{
      if(current)return ok;await cap(tx,'owners',100);
      await tx.query('INSERT INTO owners(id,device_hash,recovery_hash) VALUES($1,$2,$3)',[randomUUID(),deviceHash,recoveryHash]);return {status:201,body:{ok:true}};
    });
  }
  if(method==='POST'&&path==='/owners/recover'){
    const recoveryHash=hash(secret(body.recoverySecret,'recovery')),newDeviceHash=hash(secret(body.newDeviceSecret,'owner'));
    const owner=(await tx.query<Owner>('SELECT * FROM owners WHERE recovery_hash=$1 FOR UPDATE',[recoveryHash])).rows[0];
    if(!owner||!equal(owner.recovery_hash,recoveryHash))fail(401,'unauthorized','Код восстановления недействителен.');
    const oldReceipt=(await tx.query<{request_hash:string}>('SELECT request_hash FROM operation_receipts WHERE scope=$1 AND key=$2',[`recovery:${owner.id}`,key])).rows[0];
    if(oldReceipt && !equal(owner.device_hash,newDeviceHash))fail(409,'recovery_superseded','Этот запрос восстановления заменён более новым. Повторите с новым запросом.');
    if(!equal(owner.device_hash,newDeviceHash)&&(await tx.query('SELECT hash FROM retired_credentials WHERE hash=$1',[newDeviceHash])).rows.length)fail(401,'revoked_credentials','Новый код устройства уже отозван.');
    return receipt(tx,`recovery:${owner.id}`,key,requestHash,async()=>{
      if(!equal(owner.device_hash,newDeviceHash)){
        await tx.query('INSERT INTO retired_credentials(hash) VALUES($1) ON CONFLICT DO NOTHING',[owner.device_hash]);
        await tx.query('UPDATE owners SET device_hash=$1 WHERE id=$2',[newDeviceHash,owner.id]);
      }
      return ok;
    });
  }
  if(path.startsWith('/me')){
    const deviceHash=hash(bearer(request));
    if(method==='DELETE'&&path==='/me'){
      const deleted=(await tx.query<{request_hash:string;response:unknown}>('SELECT request_hash,response FROM operation_receipts WHERE scope=$1 AND key=$2',[`deleted:${deviceHash}`,key])).rows[0];
      if(deleted){if(!equal(deleted.request_hash,requestHash))fail(409,'idempotency_conflict','Запрос изменён.');return {status:200,body:deleted.response};}
    }
    const owner=await ownerFor(tx,request);
    if(method==='POST'&&path==='/me/recovery'){
      const newHash=hash(secret(body.newRecoverySecret,'recovery'));
      const previous=(await tx.query('SELECT request_hash FROM operation_receipts WHERE scope=$1 AND key=$2',[`owner:${owner.id}`,key])).rows[0];
      if(previous&&!equal(owner.recovery_hash,newHash))fail(409,'recovery_rotation_superseded','Этот запрос замены кода заменён более новым. Создайте новый код восстановления.');
      return receipt(tx,`owner:${owner.id}`,key,requestHash,async()=>{
        if(!equal(newHash,owner.recovery_hash)){
          if((await tx.query('SELECT hash FROM retired_credentials WHERE hash=$1',[newHash])).rows.length)fail(401,'revoked_credentials','Этот код восстановления отозван.');
          await tx.query('INSERT INTO retired_credentials(hash) VALUES($1) ON CONFLICT DO NOTHING',[owner.recovery_hash]);
          await tx.query('UPDATE owners SET recovery_hash=$1 WHERE id=$2',[newHash,owner.id]);
        }return ok;
      });
    }
    if(method==='DELETE'&&path==='/me'){
      const ids=(await tx.query<{id:string}>('SELECT id FROM events WHERE owner_id=$1',[owner.id])).rows.map(e=>e.id);
      for(const id of ids)await tx.query('DELETE FROM operation_receipts WHERE scope LIKE $1',[`guest:${id}:%`]);
      await tx.query('DELETE FROM operation_receipts WHERE scope IN ($1,$2,$3)',[`owner:${owner.id}`,`recovery:${owner.id}`,`enroll:${owner.device_hash}`]);
      await tx.query('INSERT INTO retired_credentials(hash) VALUES($1),($2) ON CONFLICT DO NOTHING',[owner.device_hash,owner.recovery_hash]);
      await tx.query('DELETE FROM owners WHERE id=$1',[owner.id]);
      return receipt(tx,`deleted:${deviceHash}`,key,requestHash,async()=>ok);
    }
    if(path==='/me/events'&&method==='GET'){
      const rows=(await tx.query<EventRow>('SELECT * FROM events WHERE owner_id=$1 ORDER BY created_at,id',[owner.id])).rows;
      return {status:200,body:{events:rows.map(e=>({id:e.id,slug:e.share_code,occasion:e.data.occasion,title:e.data.title,published:e.published,version:e.version}))}};
    }
    const match=/^\/me\/events\/([A-Za-z0-9_-]{1,80})$/.exec(path);
    if(match&&method==='GET')return {status:200,body:await adminEvent(tx,await eventForOwner(tx,owner.id,match[1]))};
    if((path==='/me/events'&&method==='POST')||(match&&method==='PUT')){
      const isNew=method==='POST';const input=validateEventInput(body,isNew);
      if(!isNew&&request.headers.get('if-match')!==String(input.version))fail(400,'version_required','Нужна подтверждённая версия списка.');
      const saved=await receipt(tx,`owner:${owner.id}`,key,requestHash,async()=>{
        let event:EventRow;
        if(isNew){
          const count=(await tx.query<{count:string}>('SELECT count(*)::text AS count FROM events WHERE owner_id=$1',[owner.id])).rows[0];
          if(Number(count.count)>=30)fail(429,'owner_capacity','На одном устройстве доступно до 30 списков.');
          await cap(tx,'events',200);
          const {gifts:_,version:__,...data}=input;const id=randomUUID();
          event=(await tx.query<EventRow>('INSERT INTO events(id,owner_id,share_code,data,published) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *',[id,owner.id,input.slug,JSON.stringify(data),input.published])).rows[0];
        }else{
          event=await eventForOwner(tx,owner.id,match![1]);
          if(input.version!==event.version)fail(409,'version_conflict','Список уже изменён. Сохраните черновик и загрузите актуальную версию.');
          if(input.slug!==event.share_code)fail(409,'immutable_share_code','Публичную ссылку нельзя изменить.');
          if(event.published&&!input.published)fail(409,'published_access','Опубликованный список должен оставаться доступным гостям.');
          const previous=(await tx.query<{id:string}>('SELECT id FROM gifts WHERE event_id=$1',[event.id])).rows;
          const nextIds=new Set(input.gifts.map(g=>g.id));
          if(previous.some(g=>!nextIds.has(g.id)))fail(409,'gift_removal','Сохранённый подарок нельзя удалить: используйте архив.');
          const booked=(await tx.query<{gift_id:string}>('SELECT gift_id FROM reservations WHERE event_id=$1',[event.id])).rows;
          if(booked.some(r=>input.gifts.find(g=>g.id===r.gift_id)?.archived))fail(409,'booked_gift','Сначала гость должен снять бронь с подарка.');
          const {gifts:_,version:__,...data}=input;
          event=(await tx.query<EventRow>('UPDATE events SET data=$1::jsonb,published=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING *',[JSON.stringify(data),input.published,event.id])).rows[0];
        }
        for(const gift of input.gifts){
          const existing=(await tx.query<{event_id:string}>('SELECT event_id FROM gifts WHERE id=$1',[gift.id])).rows[0];
          if(existing&&existing.event_id!==event.id)fail(409,'gift_id_conflict','Код подарка уже используется другим списком.');
          await tx.query(`INSERT INTO gifts(id,event_id,data,archived,position) VALUES($1,$2,$3::jsonb,$4,$5)
            ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,archived=EXCLUDED.archived,position=EXCLUDED.position`,[gift.id,event.id,JSON.stringify(gift),gift.archived,gift.order]);
        }
        return {status:isNew?201:200,body:{eventId:event.id}};
      });
      const eventId=(saved.body as {eventId:string}).eventId;
      return {status:saved.status,body:await adminEvent(tx,await eventForOwner(tx,owner.id,eventId))};
    }
  }
  const publicMatch=/^\/public\/events\/([a-f0-9]{32})(?:\/reservations(?:\/([A-Za-z0-9_-]{1,80}))?)?$/.exec(path);
  if(publicMatch){
    const event=await eventForGuest(tx,publicMatch[1]);
    const guestHeader=request.headers.get('x-guest-secret');const guestHash=guestHeader?hash(secret(guestHeader,'guest')):null;
    if(method==='GET'&&!path.includes('/reservations'))return {status:200,body:await guestSnapshot(tx,event,guestHash,now)};
    if((method==='POST'&&path.endsWith('/reservations'))||(method==='DELETE'&&publicMatch[2])){
      if(!guestHash)fail(401,'guest_required','Нужен код гостевого доступа.');
      const id=giftId(method==='POST'?body.giftId:publicMatch[2]);
      await receipt(tx,`guest:${event.id}:${guestHash}`,key,requestHash,async()=>{
        const gift=(await tx.query<{archived:boolean}>('SELECT archived FROM gifts WHERE id=$1 AND event_id=$2',[id,event.id])).rows[0];
        if(!gift)fail(404,'not_found','Подарок не найден.');
        const reservation=(await tx.query<{guest_hash:string}>('SELECT guest_hash FROM reservations WHERE gift_id=$1 AND event_id=$2',[id,event.id])).rows[0];
        if(method==='POST'){
          if(gift.archived)fail(409,'gift_archived','Подарок убран в архив.');
          if(reservation&&!equal(reservation.guest_hash,guestHash!))fail(409,'already_reserved','Этот подарок уже забронировал другой гость.');
          if(!reservation)await tx.query('INSERT INTO reservations(event_id,gift_id,guest_hash) VALUES($1,$2,$3)',[event.id,id,guestHash]);
        }else{
          if(reservation&&!equal(reservation.guest_hash,guestHash!))fail(403,'not_your_reservation','Можно снять только свою бронь.');
          await tx.query('DELETE FROM reservations WHERE event_id=$1 AND gift_id=$2 AND guest_hash=$3',[event.id,id,guestHash]);
        }
        return {status:200,body:{ok:true}};
      });
      return {status:200,body:await guestSnapshot(tx,event,guestHash,now)};
    }
  }
  if(method==='POST'&&path==='/reports'){
    const shareCode=typeof body.shareCode==='string'?body.shareCode:'';
    const event=await eventForGuest(tx,shareCode);
    const reason=typeof body.reason==='string'?body.reason.trim():'';
    if(reason.length<5||reason.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason))fail(400,'invalid_report','Опишите причину: от 5 до 1000 знаков.');
    return receipt(tx,`report:${hash(ip)}`,key,requestHash,async()=>{
      await cap(tx,'reports',500,"WHERE state='pending'");
      await tx.query('INSERT INTO reports(id,event_id,reason) VALUES($1,$2,$3)',[randomUUID(),event.id,reason]);return {status:201,body:{ok:true}};
    });
  }
  return fail(404,'not_found','Маршрут не найден.');
}
