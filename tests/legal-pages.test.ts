import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PrivacyView,SupportView,RulesView,readWebReleaseConfig,type LegalConfig} from '../apps/web/app/legal-view';

const html=(view:typeof PrivacyView,config:LegalConfig)=>renderToStaticMarkup(createElement(view,{config}));

test('demo legal pages disclose readiness without inventing an operator or leaking configured identity',()=>{
  const config=readWebReleaseConfig({NEXT_PUBLIC_DEMO:'true'});
  const sensitive={...config,operatorName:'PRIVATE_OPERATOR_SENTINEL',supportContact:'PRIVATE_CONTACT_SENTINEL',privacyText:'PRIVATE_POLICY_SENTINEL',rulesText:'PRIVATE_RULES_SENTINEL'};
  for(const view of [PrivacyView,SupportView,RulesView]){
    const output=html(view,sensitive);
    assert.match(output,/Демонстрационный режим/);
    assert.doesNotMatch(output,/PRIVATE_|mailto:|@|example\.com|example\.org|<form/);
  }
  const privacy=html(PrivacyView,config);
  assert.match(privacy,/не утверждённая юридическая политика/);
  assert.match(privacy,/SHA-256/);
  assert.match(privacy,/IP/);
  assert.match(privacy,/резервных копий/);
  assert.match(privacy,/данными детей/);
});

test('production legal helper rejects absent or unapproved legal configuration without fallback',()=>{
  assert.throws(()=>readWebReleaseConfig({NEXT_PUBLIC_DEMO:'false'}));
  assert.throws(()=>readWebReleaseConfig({NEXT_PUBLIC_DEMO:'typo'}));
  assert.throws(()=>readWebReleaseConfig({NEXT_PUBLIC_DEMO:'false',GIFT_LEGAL_APPROVED:'true'}));
});

test('legal SSR renders approved text literally rather than injecting executable HTML',()=>{
  // Rendering fixture, not a release configuration or an invented service operator.
  const hostile='<script>alert("xss")</script><img src=x onerror=alert(1)>';
  const config:LegalConfig={demo:false,apiOrigin:'',publicOrigin:'',operatorName:hostile,
    supportContact:hostile,privacyPolicyUrl:'',supportUrl:'',privacyText:hostile,privacyUpdatedAt:'2026-10-29',rulesUrl:'',rulesText:hostile,rulesUpdatedAt:'2026-10-29'};
  for(const view of [PrivacyView,SupportView,RulesView]){
    const output=html(view,config);
    assert.doesNotMatch(output,/<script|<img|onerror="|href="javascript:/);
    assert.match(output,/&lt;script&gt;/);
    assert.doesNotMatch(output,/Демонстрационный режим|Оператор и канал поддержки ещё не утверждены/);
  }
  assert.match(html(PrivacyView,config),/<time dateTime="2026-10-29">2026-10-29<\/time>/);
});

test('rules page exposes no invented legal approval or moderation SLA in demo',()=>{
 const output=html(RulesView,readWebReleaseConfig({NEXT_PUBLIC_DEMO:'true'}));
 assert.match(output,/Правила пользовательского контента/);
 assert.match(output,/не утверждены/);
 assert.match(output,/только вымышленные данные/);
 assert.match(output,/Сообщить о нарушении/);
 assert.doesNotMatch(output,/в течение|гарантируем|автоматически удалим|вы соглашаетесь/i);
 assert.match(output,/href="\/support"/);
});
