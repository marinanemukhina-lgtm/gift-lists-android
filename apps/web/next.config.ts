import type {NextConfig} from 'next';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Next's temporary CJS config module does not resolve sibling TS imports reliably.
const {readReleaseConfig,validateServerMode}=require(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../packages/domain/src/release-config.ts')) as typeof import('../../packages/domain/src/release-config');
const release=readReleaseConfig({demo:process.env.NEXT_PUBLIC_DEMO,apiOrigin:process.env.NEXT_PUBLIC_API_ORIGIN,publicOrigin:process.env.NEXT_PUBLIC_PUBLIC_ORIGIN,supportContact:process.env.NEXT_PUBLIC_SUPPORT_CONTACT,operatorName:process.env.NEXT_PUBLIC_OPERATOR_NAME,privacyPolicyUrl:process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL,supportUrl:process.env.NEXT_PUBLIC_SUPPORT_URL,rulesUrl:process.env.NEXT_PUBLIC_RULES_URL,rulesUpdatedAt:process.env.NEXT_PUBLIC_RULES_UPDATED_AT,rulesApproved:process.env.GIFT_RULES_APPROVED,rulesText:process.env.GIFT_RULES_TEXT,legalApproved:process.env.GIFT_LEGAL_APPROVED,privacyText:process.env.GIFT_PRIVACY_TEXT,privacyUpdatedAt:process.env.GIFT_PRIVACY_UPDATED_AT,requireLegalText:true});
validateServerMode(process.env.DEMO_MODE,release.demo);
if(!release.demo&&process.env.NEXT_PUBLIC_LEGAL_APPROVED!=='true')throw Error('Public legal approval flag must match approved production release');
if(!release.demo&&process.env.NEXT_PUBLIC_RULES_APPROVED!=='true')throw Error('Public rules approval flag must match approved production release');
const apiConnect=release.apiOrigin;
const config:NextConfig={env:{NEXT_PUBLIC_DEMO:String(release.demo)},poweredByHeader:false,output:'standalone',outputFileTracingRoot:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),serverExternalPackages:['pg'],async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Content-Security-Policy',value:`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${apiConnect}; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`}]}];}};
export default config;
