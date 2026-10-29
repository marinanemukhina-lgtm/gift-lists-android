import {readReleaseConfig,validateServerMode} from '../../../../../../packages/domain/src/release-config';
import {createApiHandler} from '../../../../../../services/api/src';
import {createPgDatabase} from '../../../../../../services/api/src/pg';
export const runtime='nodejs';
export const dynamic='force-dynamic';
let handler:((request:Request)=>Promise<Response>)|undefined;
async function run(request:Request){
 if(!process.env.DATABASE_URL)return Response.json({error:'Сервер ещё не настроен. Локальные черновики доступны.',code:'not_configured'},{status:503,headers:{'Cache-Control':'no-store'}});
 try{
  const release=readReleaseConfig({demo:process.env.NEXT_PUBLIC_DEMO,apiOrigin:process.env.NEXT_PUBLIC_API_ORIGIN,publicOrigin:process.env.NEXT_PUBLIC_PUBLIC_ORIGIN,supportContact:process.env.NEXT_PUBLIC_SUPPORT_CONTACT,operatorName:process.env.NEXT_PUBLIC_OPERATOR_NAME,privacyPolicyUrl:process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL,supportUrl:process.env.NEXT_PUBLIC_SUPPORT_URL,rulesUrl:process.env.NEXT_PUBLIC_RULES_URL,rulesUpdatedAt:process.env.NEXT_PUBLIC_RULES_UPDATED_AT,rulesApproved:process.env.GIFT_RULES_APPROVED,rulesText:process.env.GIFT_RULES_TEXT,legalApproved:process.env.GIFT_LEGAL_APPROVED,privacyText:process.env.GIFT_PRIVACY_TEXT,privacyUpdatedAt:process.env.GIFT_PRIVACY_UPDATED_AT,requireLegalText:true});
  validateServerMode(process.env.DEMO_MODE,release.demo);
 }catch{return Response.json({error:'Настройки сервиса требуют проверки оператора.',code:'release_not_configured'},{status:503,headers:{'Cache-Control':'no-store'}});}
 if(!handler){const db=createPgDatabase(process.env.DATABASE_URL);const origins=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);handler=createApiHandler(db,{allowedOrigins:origins,demo:process.env.DEMO_MODE!=='false',supportContact:process.env.SUPPORT_CONTACT,trustProxy:process.env.TRUST_PROXY==='true'});}
 return handler(request);
}
export const GET=run;export const POST=run;export const PUT=run;export const DELETE=run;export const OPTIONS=run;
