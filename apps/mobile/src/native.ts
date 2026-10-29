import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {Network} from '@capacitor/network';
import {Share} from '@capacitor/share';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {SecureStorage} from '@aparajita/capacitor-secure-storage';
import {readReleaseConfig,type AppPorts,type PlatformActions} from '../../../packages/domain/src/index';
import {createHttpApis,createJsonDraftStore,newId,newSecret,newShareCode} from '../../../packages/client/src/index';
import {createPrivateFileStore} from './file-store';
import {createNativeCredentialStore} from './credentials';
import {createBackDispatcher} from './back';
import {validatedExternal,validatedGuestLink} from './security';
interface DocumentsPlugin{capabilities():Promise<{secureStorage:boolean}>;exportFile(options:{name:string;contents:string}):Promise<{cancelled:boolean}>;importFile():Promise<{cancelled:boolean;contents?:string}>}
const Documents=registerPlugin<DocumentsPlugin>('GiftDocuments');
let verifiedNativeStorage=false;
const assertNative=()=>{if(!verifiedNativeStorage||Capacitor.getPlatform()!=='android'||!Capacitor.isNativePlatform()||!Capacitor.isPluginAvailable('SecureStorage'))throw new Error('Защищённое хранилище Android недоступно. Доступ к публикации и бронированию закрыт; локальные списки не удалены.');};
const isMissing=(error:unknown)=>{const code=(error as {code?:string})?.code;return code==='OS-PLUG-FILE-0008'||code==='ENOENT';};
const dataDirectory='gift-data-v1';
export async function createNativePorts():Promise<AppPorts>{
 if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')throw new Error('Эта сборка предназначена для Android. Откройте веб-версию в браузере.');
 const release=readReleaseConfig({demo:import.meta.env.VITE_DEMO,apiOrigin:import.meta.env.VITE_API_ORIGIN,publicOrigin:import.meta.env.VITE_PUBLIC_ORIGIN,supportContact:import.meta.env.VITE_SUPPORT_CONTACT,operatorName:import.meta.env.VITE_OPERATOR_NAME,privacyPolicyUrl:import.meta.env.VITE_PRIVACY_POLICY_URL,supportUrl:import.meta.env.VITE_SUPPORT_URL,legalApproved:import.meta.env.VITE_LEGAL_APPROVED});
 const {publicOrigin,apiOrigin}=release;
 // Never instantiate or call the plugin's deliberately insecure web fallback.
 const capabilities=await Documents.capabilities();verifiedNativeStorage=capabilities.secureStorage===true;
 assertNative();await SecureStorage.setKeyPrefix('gift-lists-v1_');
 const credentials=createNativeCredentialStore({get:key=>SecureStorage.getItem(key),set:(key,value)=>SecureStorage.setItem(key,value),remove:key=>SecureStorage.remove(key).then(()=>{}),keys:()=>SecureStorage.keys()},assertNative);
 try{await Filesystem.mkdir({path:dataDirectory,directory:Directory.Data,recursive:true});}catch(error){const files=await Filesystem.readdir({path:dataDirectory,directory:Directory.Data});if(!files)throw error;}
 const storage=createPrivateFileStore({
  async read(path){try{const result=await Filesystem.readFile({path:`${dataDirectory}/${path}`,directory:Directory.Data,encoding:Encoding.UTF8});if(typeof result.data!=='string')throw new Error('Не удалось прочитать локальные данные.');return result.data;}catch(error){if(isMissing(error))return null;throw error;}},
  async write(path,data){await Filesystem.writeFile({path:`${dataDirectory}/${path}`,directory:Directory.Data,encoding:Encoding.UTF8,data,recursive:false});},
  async rename(from,to){await Filesystem.rename({from:`${dataDirectory}/${from}`,to:`${dataDirectory}/${to}`,directory:Directory.Data,toDirectory:Directory.Data});},
  async remove(path){try{await Filesystem.deleteFile({path:`${dataDirectory}/${path}`,directory:Directory.Data});}catch(error){if(!isMissing(error))throw error;}},
  async names(){return (await Filesystem.readdir({path:dataDirectory,directory:Directory.Data})).files.map(file=>file.name);}
 });
 let online=await Network.getStatus().then(value=>value.connected,()=>false);
 const resumeCallbacks=new Set<()=>void>(),onlineCallbacks=new Set<(value:boolean)=>void>();
 const back=createBackDispatcher(()=>{const element=document.activeElement as HTMLElement|null;if(element&&(element.tagName==='INPUT'||element.tagName==='TEXTAREA'||element.isContentEditable)){element.blur();return true;}return false;},()=>{void App.minimizeApp().catch(()=>{});});
 // Establish native listeners once; clean up partial registration and page reloads.
 const handles:PluginListenerHandle[]=[];
 const cleanup=()=>Promise.allSettled(handles.map(handle=>handle.remove()));
 try {
  handles.push(await App.addListener('backButton',()=>back.dispatch()));
  handles.push(await App.addListener('appStateChange',state=>{if(state.isActive){online=false;for(const callback of resumeCallbacks)callback();void Network.getStatus().then(value=>{online=value.connected;for(const callback of onlineCallbacks)callback(online);},()=>{online=false;for(const callback of onlineCallbacks)callback(false);});}}));
  handles.push(await Network.addListener('networkStatusChange',status=>{online=status.connected;for(const callback of onlineCallbacks)callback(online);}));
 } catch {await cleanup();throw new Error('Не удалось подключить системную навигацию Android. Перезапустите приложение.');}
 window.addEventListener('pagehide',()=>{void cleanup();},{once:true});
 const platform:PlatformActions={
  kind:'android',newId,newSecret,newShareCode,now:()=>new Date().toISOString(),isOnline:()=>online,
  async shareGuestLink(value){await Share.share({title:'Список подарков',url:validatedGuestLink(value,publicOrigin),dialogTitle:'Поделиться списком'});},
  async openExternal(value){await Browser.open({url:validatedExternal(value),presentationStyle:'fullscreen'});},
  async exportFile(name,contents){if(contents.length>1024*1024)throw new Error('Файл слишком большой.');const result=await Documents.exportFile({name,contents});if(result.cancelled)throw new Error('Сохранение файла отменено.');},
  async importFile(){const result=await Documents.importFile();return result.cancelled?null:result.contents??null;},
  async confirm(message){return window.confirm(message);},
  subscribeResume(callback){resumeCallbacks.add(callback);return()=>{resumeCallbacks.delete(callback);};},
  subscribeOnline(callback){onlineCallbacks.add(callback);return()=>{onlineCallbacks.delete(callback);};},
  subscribeBack(callback){return back.subscribe(callback);}

 };
 return {...createHttpApis(apiOrigin),credentials,drafts:createJsonDraftStore(storage),platform,publicOrigin,demo:release.demo,supportContact:release.supportContact||undefined,privacyPolicyUrl:release.privacyPolicyUrl||undefined,supportUrl:release.supportUrl||undefined};
}
