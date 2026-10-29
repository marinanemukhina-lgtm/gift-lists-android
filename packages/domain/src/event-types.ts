export type Occasion = 'baby_birthday' | 'child_birthday' | 'adult_birthday' | 'wedding';
export type ThemePreset = 'garden' | 'celebration' | 'editorial' | 'porcelain';
export type Theme = {preset: ThemePreset; accent: string; background: string; card: string; typography: 'serif' | 'sans'; layout: 'cards' | 'list'};
export type Gift = {id: string; name: string; note: string; shop: string; category: string; url: string; price: number | null; photo: string | null; order: number; archived: boolean};
export type EventProfile = {id: string; slug: string; occasion: Occasion; title: string; names: string; introduction: string; date: string | null; theme: Theme; published: boolean; version: number; gifts: Gift[]};
export type EventSummary = Pick<EventProfile, 'id' | 'slug' | 'occasion' | 'title' | 'published' | 'version'>;
export type EventInput = Omit<EventProfile, 'id' | 'version'> & {version?: number};
export type AdminEvent = {event: EventProfile; bookedIds: string[]};
export type Reservation = {id: string; mine: boolean};
export const occasionLabels: Record<Occasion, string> = {baby_birthday:'День рождения малыша',child_birthday:'Детский день рождения',adult_birthday:'День рождения',wedding:'Свадьба'};
export const themePresets: Record<ThemePreset, Theme & {label: string}> = {
  garden:{label:'Сад',preset:'garden',accent:'#45634b',background:'#f3f5ee',card:'#ffffff',typography:'serif',layout:'cards'},
  celebration:{label:'Праздник',preset:'celebration',accent:'#a33d50',background:'#fbf1f3',card:'#ffffff',typography:'sans',layout:'cards'},
  editorial:{label:'Редакция',preset:'editorial',accent:'#3c5669',background:'#f0f2f4',card:'#ffffff',typography:'sans',layout:'list'},
  porcelain:{label:'Фарфор',preset:'porcelain',accent:'#655d49',background:'#f6f5f1',card:'#ffffff',typography:'serif',layout:'cards'},
};
export function occasionDefaults(occasion: Occasion): Pick<EventProfile,'occasion'|'title'|'names'|'introduction'|'date'|'theme'> {
  const preset = {baby_birthday:'garden', child_birthday:'celebration', adult_birthday:'editorial', wedding:'porcelain'}[occasion] as ThemePreset;
  const {label: _label,...theme}=themePresets[preset];
  return {occasion,title:occasion === 'wedding' ? 'Подарки к свадьбе' : occasion === 'baby_birthday' ? 'Подарки малышу' : occasion === 'child_birthday' ? 'Детский день рождения' : 'Подарки ко дню рождения',names:'',introduction:'Выберите подарок из списка и забронируйте его, чтобы идеи не повторялись. Спасибо, что разделяете этот день с нами.',date:null,theme:{...theme}};
}
export function luminance(hex: string): number {const rgb = hex.slice(1).match(/../g)!.map(x => {const v=parseInt(x,16)/255;return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
export function contrast(a: string,b: string): number {const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (l[0]+.05)/(l[1]+.05)}
export function readableInk(background: string): string {return contrast('#000000',background)>=contrast('#ffffff',background)?'#000000':'#ffffff'}
/** Every text role is calculated against its actual surface, including arbitrary safe owner colors. */
export function themeVariables(theme: Theme): Record<string,string> {return {'--gift-accent':theme.accent,'--gift-background':theme.background,'--gift-card':theme.card,'--gift-ink':readableInk(theme.background),'--gift-card-ink':readableInk(theme.card),'--gift-accent-ink':readableInk(theme.accent),'--gift-heading-font':theme.typography==='serif'?'Georgia, "Times New Roman", serif':'Arial, Helvetica, sans-serif'}}
