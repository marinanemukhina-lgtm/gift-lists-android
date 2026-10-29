import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createPreviewDatabase} from '../apps/preview/database';
import {createApiHandler} from '../services/api/src';
import {createHttpApis,newSecret,newId,newShareCode} from '../packages/client/src';
import {occasionDefaults} from '../packages/domain/src';
test('dev-only file-backed PostgreSQL preview persists actual owner/public content across restart',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'gift-preview-test-'));let db=await createPreviewDatabase(directory);
 const owner={deviceSecret:newSecret('owner'),recoverySecret:newSecret('recovery')};const request=(handler:ReturnType<typeof createApiHandler>):typeof fetch=>async(url,init)=>handler(new Request(String(url),init));
 try{let api=createHttpApis('https://preview.test',request(createApiHandler(db,{allowedOrigins:['https://preview.test'],demo:true})));await api.owner.enroll(owner,newId());const saved=await api.owner.save(owner.deviceSecret,null,{...occasionDefaults('child_birthday'),slug:newShareCode(),published:true,gifts:[]},newId());await db.close();db=await createPreviewDatabase(directory);api=createHttpApis('https://preview.test',request(createApiHandler(db,{allowedOrigins:['https://preview.test'],demo:true})));assert.equal((await api.owner.list(owner.deviceSecret))[0].id,saved.event.id);assert.equal((await api.guest.get(saved.event.slug,null)).event.title,saved.event.title);}finally{await db.close();await rm(directory,{recursive:true,force:true});}
});
