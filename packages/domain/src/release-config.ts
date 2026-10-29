/** Public release configuration only. Validation is not legal approval or a network availability check. */
export type ReleaseInput={demo?:string;apiOrigin?:string;publicOrigin?:string;supportContact?:string;operatorName?:string;privacyPolicyUrl?:string;supportUrl?:string;privacyText?:string;privacyUpdatedAt?:string;rulesUrl?:string;rulesText?:string;rulesUpdatedAt?:string;rulesApproved?:string;legalApproved?:string;requireLegalText?:boolean};
export type ReleaseConfig={demo:boolean;apiOrigin:string;publicOrigin:string;supportContact:string;operatorName:string;privacyPolicyUrl:string;supportUrl:string;privacyText:string;privacyUpdatedAt:string;rulesUrl:string;rulesText:string;rulesUpdatedAt:string};
function https(value:string,field:string,originOnly:boolean,production:boolean):string{
 if(!value)return '';
 let url:URL;try{url=new URL(value);}catch{throw Error(`${field}: invalid HTTPS URL`);}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(originOnly&&url.pathname!=='/'))throw Error(`${field}: expected HTTPS ${originOnly?'origin':'URL'} without credentials, query or fragment`);
 const host=url.hostname.toLowerCase();
 if(production&&(host==='localhost'||host.endsWith('.localhost')||host==='127.0.0.1'||host==='[::1]'||/(^|\.)(example\.(com|org|net)|invalid|test)$/.test(host)))throw Error(`${field}: placeholder/local host cannot be production`);
 return originOnly?url.origin:url.href;
}
export function readReleaseConfig(input:ReleaseInput):ReleaseConfig{
 if(input.demo!==undefined&&!['','true','false'].includes(input.demo))throw Error('Demo mode must explicitly be true or false');
 const demo=input.demo!=='false',clean=(value:string|undefined)=>value?.trim()||'';
 const config:ReleaseConfig={demo,apiOrigin:https(clean(input.apiOrigin),'API origin',true,!demo),publicOrigin:https(clean(input.publicOrigin),'Public origin',true,!demo),supportContact:clean(input.supportContact),operatorName:clean(input.operatorName),privacyPolicyUrl:https(clean(input.privacyPolicyUrl),'Privacy policy',false,!demo),supportUrl:https(clean(input.supportUrl),'Support URL',false,!demo),privacyText:clean(input.privacyText),privacyUpdatedAt:clean(input.privacyUpdatedAt),rulesUrl:https(clean(input.rulesUrl),'Rules URL',false,!demo),rulesText:clean(input.rulesText),rulesUpdatedAt:clean(input.rulesUpdatedAt)};
 if(!demo){
  for(const key of ['apiOrigin','publicOrigin','supportContact','operatorName','privacyPolicyUrl','supportUrl','rulesUrl','rulesUpdatedAt'] as const)if(!config[key])throw Error(`Production configuration missing: ${key}`);
  if(input.legalApproved!=='true')throw Error('Production legal material must be explicitly approved by its operator');
  if(input.rulesApproved!=='true')throw Error('Production rules must be explicitly approved by its operator');
  const rulesDate=new Date(config.rulesUpdatedAt+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(config.rulesUpdatedAt)||!Number.isFinite(rulesDate.getTime())||rulesDate.toISOString().slice(0,10)!==config.rulesUpdatedAt)throw Error('Production rules revision date is invalid');
  for(const key of ['operatorName','supportContact'] as const)if(/\b(TODO|TBD|placeholder|example)\b|[<>]/i.test(config[key]))throw Error(`Production ${key} contains a placeholder`);
  if(config.supportContact.length>300||config.operatorName.length>300)throw Error('Operator/contact exceeds public display limit');
  if(input.requireLegalText){
   if(!config.rulesText||config.rulesText.length>60000||/^(TODO|TBD|placeholder|заполнить|правила позже)[.!\s]*$/i.test(config.rulesText))throw Error('Production rules text is missing or oversized');
   if(!config.privacyText||config.privacyText.length>60000||/^(TODO|TBD|placeholder|заполнить|политика позже)[.!\s]*$/i.test(config.privacyText))throw Error('Production privacy text is missing or oversized');
   const date=new Date(config.privacyUpdatedAt+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(config.privacyUpdatedAt)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==config.privacyUpdatedAt)throw Error('Production privacy revision date is invalid');
  }
 }
 return config;
}

/** Protect standalone server restarts from a demo/production mismatch. */
export function validateServerMode(serverMode:string|undefined,publicDemo:boolean):void{
 if(serverMode!==undefined&&!['true','false'].includes(serverMode))throw Error('DEMO_MODE must be true or false');
 if((serverMode!=='false')!==publicDemo)throw Error('Server and public demo modes must agree');
}
