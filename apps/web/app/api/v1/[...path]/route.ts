import {createApiHandler} from '../../../../../../services/api/src';
import {createPgDatabase} from '../../../../../../services/api/src/pg';
export const runtime='nodejs';
export const dynamic='force-dynamic';
let handler:((request:Request)=>Promise<Response>)|undefined;
async function run(request:Request){
 if(!process.env.DATABASE_URL)return Response.json({error:'Сервер ещё не настроен. Локальные черновики доступны.',code:'not_configured'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(!handler){const db=createPgDatabase(process.env.DATABASE_URL);const origins=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);handler=createApiHandler(db,{allowedOrigins:origins,demo:process.env.DEMO_MODE!=='false',supportContact:process.env.SUPPORT_CONTACT,trustProxy:process.env.TRUST_PROXY==='true'});}
 return handler(request);
}
export const GET=run;export const POST=run;export const PUT=run;export const DELETE=run;export const OPTIONS=run;
