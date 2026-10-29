import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApiHandler,type Database,type SqlExecutor} from '../services/api/src';
import {createHttpApis,newId,newSecret,newShareCode} from '../packages/client/src';
import {occasionDefaults,ApiError,type EventInput} from '../packages/domain/src';
test('real HTTP client contract + PostgreSQL complete two-owner/guest recovery/delete journey',async()=>{
 const pg=new PGlite();try{
 await pg.exec(await readFile(new URL('../services/api/migrations/001_initial.sql',import.meta.url),'utf8'));
 const adapt=(source:{query:(sql:string,params?:unknown[])=>Promise<any>}):SqlExecutor=>({query:async(text,values)=>{const result=await source.query(text,values);return {rows:result.rows,rowCount:result.affectedRows}}});
 const db:Database={...adapt(pg),transaction:fn=>pg.transaction(tx=>fn(adapt(tx)))};
 const handler=createApiHandler(db,{allowedOrigins:['https://demo.test'],demo:true});
 const transport:typeof fetch=async(url,init)=>handler(new Request(String(url),{...init,headers:{...init?.headers,Origin:'https://demo.test'}}));
 const api=createHttpApis('https://demo.test',transport);
 const a={deviceSecret:newSecret('owner'),recoverySecret:newSecret('recovery')},b={deviceSecret:newSecret('owner'),recoverySecret:newSecret('recovery')};
 await api.owner.enroll(a,newId());await api.owner.enroll(b,newId());
 const input:EventInput={...occasionDefaults('wedding'),slug:newShareCode(),published:true,gifts:[{id:`gift_${newId()}`,name:'Вымышленный подарок',note:'',shop:'',category:'',url:'https://example.com',price:1250,photo:null,order:0,archived:false}]};
 const key=newId(),created=await api.owner.save(a.deviceSecret,null,input,key);assert.equal(created.event.version,1);assert.equal((await api.owner.save(a.deviceSecret,null,input,key)).event.id,created.event.id);
 await assert.rejects(()=>api.owner.get(b.deviceSecret,created.event.id),e=>e instanceof ApiError&&e.status===404);
 const guest=newSecret('guest'),otherGuest=newSecret('guest'),gift=created.event.gifts[0].id,code=created.event.slug;
 assert.deepEqual((await api.guest.get(code,null)).reservations,[]);
 assert.equal((await api.guest.reserve(code,gift,guest,newId())).reservations[0].mine,true);
 assert.equal((await api.guest.get(code,otherGuest)).reservations[0].mine,false);
 await assert.rejects(()=>api.guest.cancel(code,gift,otherGuest,newId()),e=>e instanceof ApiError&&e.status===403);
 await assert.rejects(()=>api.owner.save(a.deviceSecret,created.event.id,{...created.event,gifts:created.event.gifts.map(g=>({...g,archived:true}))},newId()),e=>e instanceof ApiError&&e.status===409);
 assert.deepEqual((await api.guest.cancel(code,gift,guest,newId())).reservations,[]);
 const fresh=newSecret('owner'),recoveryKey=newId();await api.owner.recover(a.recoverySecret,fresh,recoveryKey);await api.owner.recover(a.recoverySecret,fresh,recoveryKey);
 await assert.rejects(()=>api.owner.list(a.deviceSecret),e=>e instanceof ApiError&&e.status===401);
 assert.equal((await api.owner.list(fresh)).length,1);
 const deleteKey=newId();await api.owner.deleteAccount(fresh,deleteKey);await api.owner.deleteAccount(fresh,deleteKey);
 await assert.rejects(()=>api.guest.get(code,null),e=>e instanceof ApiError&&e.status===404);
 assert.deepEqual(await api.owner.list(b.deviceSecret),[]);
 }finally{await pg.close();}
});
