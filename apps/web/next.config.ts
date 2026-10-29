import type {NextConfig} from 'next';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const apiConnect=process.env.NEXT_PUBLIC_API_ORIGIN?new URL(process.env.NEXT_PUBLIC_API_ORIGIN).origin:'';
const config:NextConfig={poweredByHeader:false,output:'standalone',outputFileTracingRoot:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),serverExternalPackages:['pg'],async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Content-Security-Policy',value:`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${apiConnect}; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`}]}];}};
export default config;
