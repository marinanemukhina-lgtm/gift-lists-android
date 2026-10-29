import {type EventInput,type Gift,type Occasion,type Theme,type ThemePreset} from './event-types';
export class InputError extends Error {}
function fail(message: string): never {throw new InputError(message)}
function record(value: unknown): Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))fail('Некорректные настройки списка.');return value as Record<string,unknown>}
function text(value: unknown,label: string,max: number,required=false): string {if(typeof value!=='string')fail(`Проверьте поле «${label}».`);const v=value.trim();if(v.length>max||(required&&!v)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail(`Проверьте поле «${label}» (до ${max} знаков).`);return v}
function oneOf<T extends string>(value: unknown,choices: readonly T[],label: string): T {if(typeof value!=='string'||!choices.includes(value as T))fail(`Проверьте поле «${label}».`);return value as T}
function url(value: unknown,label: string): string {const v=text(value,label,2048);if(!v)return '';try{const parsed=new URL(v);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||/[\r\n\t]/.test(v))fail(`В поле «${label}» нужна ссылка http или https без пароля.`)}catch{fail(`В поле «${label}» нужна ссылка http или https.`)}return v}
export function validateTheme(value: unknown): Theme {const t=record(value);const color=(v:unknown)=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)?v.toLowerCase():fail('Цвет должен быть в формате #123ABC.');return {preset:oneOf<ThemePreset>(t.preset,['garden','celebration','editorial','porcelain'],'Оформление'),accent:color(t.accent),background:color(t.background),card:color(t.card),typography:oneOf(t.typography,['serif','sans'],'Шрифт'),layout:oneOf(t.layout,['cards','list'],'Вид списка')}}
export function validateEventInput(value: unknown,isNew: boolean): EventInput {
 const v=record(value);const slug=text(v.slug,'Ссылка',64,true);if(!/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/.test(slug))fail('Ссылка: от 3 до 64 строчных латинских букв, цифр и дефисов.');
 if(!/^[a-f0-9]{32}$/.test(slug))fail('Недопустимый код публичной ссылки.');
 const date=v.date===null||v.date===''?null:text(v.date,'Дата',10,true);if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail('Укажите существующую дату.');
 if(typeof v.published!=='boolean')fail('Проверьте состояние публикации.');
 if(!isNew&&(!Number.isSafeInteger(v.version)||Number(v.version)<0))fail('Версия списка отсутствует. Обновите страницу.');
 if(!Array.isArray(v.gifts)||v.gifts.length>100)fail('В одном списке может быть до 100 подарков.');
 const seen=new Set<string>();const gifts: Gift[]=v.gifts.map((item,index)=>{const g=record(item);const id=text(g.id,'Код подарка',80,true);if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||seen.has(id))fail('Коды подарков должны быть уникальными.');seen.add(id);if(typeof g.archived!=='boolean')fail('Проверьте архив подарка.');let price:number|null=null;if(g.price!==null&&g.price!==''){if(typeof g.price!=='number'||!Number.isFinite(g.price)||g.price<0||g.price>100000000||Math.abs(g.price*100-Math.round(g.price*100))>.00001)fail('Цена: положительное число, до двух знаков после запятой.');price=g.price}
 return {id,name:text(g.name,'Название подарка',200,true),note:text(g.note,'Описание',1000),shop:text(g.shop,'Магазин',120),category:text(g.category,'Категория',80),url:url(g.url,'Ссылка на подарок'),price,photo:g.photo===null||g.photo===''?null:url(g.photo,'Ссылка на фото'),order:index,archived:g.archived};});
 const result:EventInput={slug,occasion:oneOf<Occasion>(v.occasion,['baby_birthday','child_birthday','adult_birthday','wedding'],'Повод'),title:text(v.title,'Название списка',120,true),names:text(v.names,'Имена',120),introduction:text(v.introduction,'Вступление',2000),date,theme:validateTheme(v.theme),published:v.published,version:isNew?undefined:Number(v.version),gifts};
 if(new TextEncoder().encode(JSON.stringify(result)).byteLength>262144)fail('Список слишком длинный для публикации. Сократите описания или разделите подарки на несколько списков.');
 return result;
}
