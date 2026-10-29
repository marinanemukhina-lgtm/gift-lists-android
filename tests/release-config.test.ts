import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readReleaseConfig,validateServerMode} from '../packages/domain/src/release-config';
const complete={demo:'false',apiOrigin:'https://api.gift-fixture.org',publicOrigin:'https://gift-fixture.org',operatorName:'Synthetic operator for unit tests',supportContact:'support@gift-fixture.org',privacyPolicyUrl:'https://gift-fixture.org/privacy',supportUrl:'https://gift-fixture.org/support',legalApproved:'true',privacyText:'Synthetic approved policy text for unit tests only.',privacyUpdatedAt:'2026-10-29'};
test('offline default remains demo; explicit production is not hardcoded demo',()=>{
 assert.equal(readReleaseConfig({}).demo,true);assert.equal(readReleaseConfig(complete).demo,false);
 const native=readFileSync(new URL('../apps/mobile/src/native.ts',import.meta.url),'utf8');assert.doesNotMatch(native,/publicOrigin,demo:true/);assert.match(native,/demo:release.demo/);
});
test('production rejects each absent deployment or legal field',()=>{
 for(const key of ['apiOrigin','publicOrigin','operatorName','supportContact','privacyPolicyUrl','supportUrl','legalApproved'] as const)assert.throws(()=>readReleaseConfig({...complete,[key]:''}),Error,key);
 assert.throws(()=>readReleaseConfig({...complete,demo:'FALSE'}));
 assert.throws(()=>readReleaseConfig({...complete,legalApproved:'false'}));
 assert.throws(()=>readReleaseConfig({...complete,privacyText:'',requireLegalText:true}));
 assert.throws(()=>readReleaseConfig({...complete,privacyText:'TODO',requireLegalText:true}));
 assert.throws(()=>readReleaseConfig({...complete,privacyUpdatedAt:'2026-02-30',requireLegalText:true}));
});
test('configured origins reject credentials, paths, HTTP and placeholders',()=>{
 for(const apiOrigin of ['http://gift-fixture.org','https://x:y@gift-fixture.org','https://gift-fixture.org/api','https://gift-fixture.org?q=1','https://localhost','https://example.com','https://placeholder.invalid']) assert.throws(()=>readReleaseConfig({...complete,apiOrigin}));
 assert.throws(()=>readReleaseConfig({apiOrigin:'http://unsafe.org'}));
 for(const privacyPolicyUrl of ['javascript:alert(1)','https://x:y@gift-fixture.org/privacy','https://example.com/privacy'])assert.throws(()=>readReleaseConfig({...complete,privacyPolicyUrl}));
});
test('safe config exposes only enumerated public fields, not server secrets',()=>{
 const input={...complete,DATABASE_URL:'secret-not-public',requireLegalText:true};const result=readReleaseConfig(input);assert.equal(JSON.stringify(result).includes('secret-not-public'),false);
 assert.equal(result.privacyUpdatedAt,'2026-10-29');
});

test('runtime server mode rejects mismatch and malformed flags',()=>{
 assert.doesNotThrow(()=>validateServerMode(undefined,true));assert.doesNotThrow(()=>validateServerMode('false',false));
 for(const mode of ['FALSE','yes',''])assert.throws(()=>validateServerMode(mode,true));
 assert.throws(()=>validateServerMode('false',true));assert.throws(()=>validateServerMode(undefined,false));
});
test('API runtime mismatch returns a generic 503 before attempting a database connection',async()=>{
 const keys=['DATABASE_URL','DEMO_MODE','NEXT_PUBLIC_DEMO'] as const;
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.DATABASE_URL='not-a-real-connection';process.env.DEMO_MODE='false';process.env.NEXT_PUBLIC_DEMO='true';
  const {GET}=await import('../apps/web/app/api/v1/[...path]/route');
  const response=await GET(new Request('https://gift-fixture.org/api/v1/health'));
  assert.equal(response.status,503);assert.equal((await response.json()).code,'release_not_configured');
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});

test('Next freezes even an omitted default-demo flag into the compiled application',()=>{
 const config=readFileSync(new URL('../apps/web/next.config.ts',import.meta.url),'utf8');
 assert.match(config,/env:\{NEXT_PUBLIC_DEMO:String\(release.demo\)\}/);
});
