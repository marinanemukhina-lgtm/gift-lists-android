import type {DraftRecord} from '../../domain/src';
export const LOCAL_SAVE_LABEL='Сохранить черновик';
export function onlineSaveLabel(record:DraftRecord):string{return record.pending?'Повторить запрос':record.snapshot?.event.published?'Обновить публикацию':record.event.published?'Опубликовать':'Сохранить онлайн';}
export function savedStateLabel(record:DraftRecord):string{if(record.pending)return 'Ожидает подтверждения';const same=record.snapshot&&JSON.stringify(record.event)===JSON.stringify(record.snapshot.event);return same?(record.snapshot!.event.published?'Опубликовано':'Сохранено онлайн'):'Черновик сохранён';}
