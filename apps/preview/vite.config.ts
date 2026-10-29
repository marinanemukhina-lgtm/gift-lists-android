import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createApiHandler} from '../../services/api/src';
import {createPreviewDatabase} from './database';
const root=fileURLToPath(new URL('.',import.meta.url));
const project=path.resolve(root,'../..');
function integratedApi():Plugin{return {name:'gift-disposable-preview-api',apply:'serve',async configureServer(server){
 const db=await createPreviewDatabase(process.env.PREVIEW_DB_DIR||path.join(project,'.preview-data/gifts'));
 const extraOrigins=(process.env.PREVIEW_ALLOWED_ORIGINS||'').split(',').filter(Boolean).map(value=>new URL(value.trim()).origin);
 server.httpServer?.once('close',()=>{void db.close();});
 server.middlewares.use(async(req,res,next)=>{
  if(!req.url?.startsWith('/api/v1/'))return next();
  // This adapter is dev-only and serves synthetic data. Do not trust arbitrary
  // Origin as an allowlist; use request Host plus explicit managed-proxy origins.
  const host=req.headers.host||'127.0.0.1';const allowedOrigins=[`http://${host}`,`https://${host}`,...extraOrigins];
  const handler=createApiHandler(db,{allowedOrigins,demo:true,trustProxy:false});
  const headers=new Headers();for(const [key,value] of Object.entries(req.headers)){if(typeof value==='string')headers.set(key,value);else if(value)for(const item of value)headers.append(key,item);}
  const method=req.method||'GET';const init:RequestInit&{duplex?:'half'}={method,headers};if(method!=='GET'&&method!=='HEAD'&&req.headers['content-length']!=='0'){init.body=Readable.toWeb(req) as ReadableStream<Uint8Array>;init.duplex='half';}
  try{const response=await handler(new Request(new URL(req.url,`http://${host}`),init));res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));}
  catch{res.statusCode=503;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:'Локальный тестовый сервер недоступен.',code:'preview_unavailable'}));}
 });
 }};}
export default defineConfig({root,plugins:[react(),integratedApi()],server:{host:'127.0.0.1',hmr:false,fs:{allow:[project]}}});
