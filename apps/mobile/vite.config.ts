import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('.',import.meta.url)),envDir=fileURLToPath(new URL('../..',import.meta.url));
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,envDir,'VITE_');const api=process.env.VITE_API_ORIGIN||env.VITE_API_ORIGIN||'';
 let connect="'none'";if(api){const url=new URL(api);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('VITE_API_ORIGIN must be an HTTPS origin');connect=url.origin;}
 return {root,plugins:[react(),{name:'bundled-native-csp',transformIndexHtml(html){const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`).join(' ');return [{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:`default-src 'none'; script-src 'self' ${inline}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${connect}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`},injectTo:'head-prepend'}];}}],build:{outDir:'dist',emptyOutDir:true,target:'chrome100',sourcemap:false},server:{host:'127.0.0.1'},envDir};
});
