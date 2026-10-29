import {ApiError,type OwnerApi,type GuestApi,type AdminEvent,type EventSummary,type GuestSnapshot} from '../../domain/src';
export function createHttpApis(apiOrigin:string,transport:typeof fetch=globalThis.fetch):{owner:OwnerApi;guest:GuestApi}{
 let base=''; if(apiOrigin){const url=new URL(apiOrigin);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('API требует HTTPS.');if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('API origin должен быть обычным HTTPS-адресом без пути.');base=url.origin;}
 async function call<T>(path:string,method='GET',body?:unknown,secret?:string,requestId?:string,guest=false,version?:number):Promise<T>{
  if(!base)throw new ApiError('Сервер ещё не настроен. Черновики можно сохранять на устройстве.',503,'not_configured');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  const headers:Record<string,string>={'Accept':'application/json'};if(body!==undefined)headers['Content-Type']='application/json';if(secret)headers[guest?'X-Guest-Secret':'Authorization']=guest?secret:`Bearer ${secret}`;if(requestId)headers['Idempotency-Key']=requestId;if(version!==undefined)headers['If-Match']=String(version);
  try{const response=await transport(`${base}/api/v1${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});const data=await response.json() as T&{error?:unknown;code?:unknown};if(!response.ok)throw new ApiError(typeof data.error==='string'?data.error:'Не удалось выполнить запрос.',response.status,typeof data.code==='string'?data.code:'request_failed');return data;}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(method==='GET'?'Нет связи с сервером. Показаны последние сохранённые данные.':'Ответ сервера не получен. Результат операции пока неизвестен; проверьте соединение и повторите безопасно.',0,'network_unknown');}finally{clearTimeout(timer)}
 }
 const eventPath=(code:string)=>`/public/events/${encodeURIComponent(code)}`;
 return {owner:{
  async enroll(credentials,requestId){await call('/owners','POST',{deviceSecret:credentials.deviceSecret,recoverySecret:credentials.recoverySecret},undefined,requestId)},
  async recover(recoverySecret,newDeviceSecret,requestId){await call('/owners/recover','POST',{recoverySecret,newDeviceSecret},undefined,requestId)},
  async rotateRecovery(deviceSecret,newRecoverySecret,requestId){await call('/me/recovery','POST',{newRecoverySecret},deviceSecret,requestId)},
  async list(secret){return (await call<{events:EventSummary[]}>('/me/events','GET',undefined,secret)).events},
  get:(secret,id)=>call<AdminEvent>(`/me/events/${encodeURIComponent(id)}`,'GET',undefined,secret),
  save:(secret,id,input,requestId)=>call<AdminEvent>(id?`/me/events/${encodeURIComponent(id)}`:'/me/events',id?'PUT':'POST',input,secret,requestId,false,id?input.version:undefined),
  async deleteAccount(secret,requestId){await call('/me','DELETE',undefined,secret,requestId)},
 },guest:{
  get:(code,secret)=>call<GuestSnapshot>(eventPath(code),'GET',undefined,secret||undefined,undefined,true),
  reserve:(code,giftId,secret,requestId)=>call<GuestSnapshot>(`${eventPath(code)}/reservations`,'POST',{giftId},secret,requestId,true),
  cancel:(code,giftId,secret,requestId)=>call<GuestSnapshot>(`${eventPath(code)}/reservations/${encodeURIComponent(giftId)}`,'DELETE',undefined,secret,requestId,true),
  async report(shareCode,reason,requestId){await call('/reports','POST',{shareCode,reason},undefined,requestId)},
 }};
}
