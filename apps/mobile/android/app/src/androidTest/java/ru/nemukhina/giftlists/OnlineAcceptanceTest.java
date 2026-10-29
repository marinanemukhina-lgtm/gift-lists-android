package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exact hosted synthetic demo only; no screenshots, credentials, response bodies or URLs logged. */
@RunWith(AndroidJUnit4.class)
public final class OnlineAcceptanceTest {
    private static final String TITLE="ONLINE SYNTHETIC ANDROID ACCEPTANCE";
    @Test public void nativePublicationHostedRaceRecoveryAndScopedCleanup() throws Exception {
        Context target=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse("Require cleared app: never operate on an existing owner",target.getSharedPreferences("WSSecureStorageSharedPreferences",Context.MODE_PRIVATE).contains("gift-lists-v1_owner"));
        try(OnlineWebRuntime ui=new OnlineWebRuntime()) {
            ui.run("(async()=>{const q=window.__giftOnline={};q.hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');q.id=()=>crypto.randomUUID();q.check=v=>{if(!v)throw Error('synthetic assertion');};q.origin='https://gift-lists-demo.vercel.app';q.call=async(path,method='GET',body,secret,id,guest=false)=>{const headers={Accept:'application/json'};if(body!==undefined)headers['Content-Type']='application/json';if(secret)headers[guest?'X-Guest-Secret':'Authorization']=guest?secret:'Bearer '+secret;if(id)headers['Idempotency-Key']=id;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(q.origin+'/api/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});return {status:r.status,body:await r.json()};}finally{clearTimeout(timer);}};q.readOwner=async()=>{const r=await window.Capacitor.nativePromise('SecureStorage','internalGetItem',{prefixedKey:'gift-lists-v1_owner'});const o=JSON.parse(r.data);q.check(/^owner_[a-f0-9]{64}$/.test(o.deviceSecret)&&/^recovery_[a-f0-9]{64}$/.test(o.recoverySecret));return o;};q.recoverId=q.id();q.deleteId=q.id();q.newOwner='owner_'+q.hex();const h=await q.call('/health');q.check(h.status===200&&h.body.ok===true&&h.body.demo===true);return true;})()");
            boolean mutationAttempted=false;
            try {
                ui.js("(()=>{document.querySelector('.occasion-choice').click();return true;})()");
                ui.await("event editor", "!!document.querySelector('#panel-event input[maxlength=\"120\"]')");
                ui.input("#panel-event input[maxlength=\"120\"]",TITLE);
                ui.js("(()=>{document.querySelector('#tab-gifts').click();return true;})()");
                ui.clickText("Добавить подарок");
                ui.await("gift editor", "!!document.querySelector('.gift-edit-fields input[maxlength=\"200\"]')");
                ui.input(".gift-edit-fields input[maxlength=\"200\"]","Синтетический подарок онлайн");
                ui.await("React accepted synthetic gift", "[...document.querySelectorAll('.gift-expand-button span')].some(e=>e.textContent==='Синтетический подарок онлайн')");
                ui.clickText("Сохранить черновик");
                ui.await("local save", "document.querySelector('.dirty-state').textContent==='Черновик сохранён'");
                mutationAttempted=true;
                ui.clickText("Сохранить онлайн");
                ui.acceptSyntheticConsent();
                ui.await("server save acknowledged", "document.querySelector('.dirty-state').textContent==='Сохранено онлайн'");
                ui.run("(async()=>{const q=window.__giftOnline;q.owner=await q.readOwner();const r=await q.call('/me/events','GET',undefined,q.owner.deviceSecret);q.check(r.status===200&&r.body.events.length===1&&r.body.events[0].title==="+JSONObject.quote(TITLE)+");q.eventId=r.body.events[0].id;return true;})()");
                ui.js("(()=>{document.querySelector('#tab-event').click();return true;})()");
                ui.await("publication toggle", "!!document.querySelector('#panel-event input[type=checkbox]')");
                ui.js("(()=>{const c=document.querySelector('#panel-event input[type=checkbox]');if(!c.checked)c.click();return true;})()");
                ui.clickText("Опубликовать");
                ui.await("publication acknowledged", "document.querySelector('.dirty-state').textContent==='Опубликовано'");
                ui.run("(async()=>{const q=window.__giftOnline;const a=await q.call('/me/events/'+q.eventId,'GET',undefined,q.owner.deviceSecret);q.check(a.status===200&&a.body.event.published===true&&a.body.event.title==="+JSONObject.quote(TITLE)+");q.code=a.body.event.slug;q.gift=a.body.event.gifts[0].id;q.path='/public/events/'+q.code;const r=await q.call(q.path);q.check(r.status===200&&r.body.event.title==="+JSONObject.quote(TITLE)+"&&r.body.reservations.length===0);return true;})()");
                ui.clickText("Открыть как гость");
                ui.await("real native guest loaded", "document.querySelector('.event-title-group h1')?.textContent==="+JSONObject.quote(TITLE)+"&&document.querySelectorAll('.gift-card').length===1&&!document.querySelector('.gift-book-button').disabled");
                ui.run("(async()=>{const q=window.__giftOnline;q.guests=['guest_'+q.hex(),'guest_'+q.hex()];q.raceIds=[q.id(),q.id()];const r=await Promise.all(q.guests.map((s,i)=>q.call(q.path+'/reservations','POST',{giftId:q.gift},s,q.raceIds[i],true)));q.check(r.filter(x=>x.status===200).length===1&&r.filter(x=>x.status===409&&x.body.code==='already_reserved').length===1);q.winner=r[0].status===200?0:1;const replay=await q.call(q.path+'/reservations','POST',{giftId:q.gift},q.guests[q.winner],q.raceIds[q.winner],true);q.check(replay.status===200);const views=await Promise.all(q.guests.map(s=>q.call(q.path,'GET',undefined,s,undefined,true)));q.check(views.every(x=>x.status===200&&x.body.reservations.length===1));q.check(views[q.winner].body.reservations[0].mine===true&&views[1-q.winner].body.reservations[0].mine===false);return true;})()");
                ui.clickText("Обновить");
                ui.await("native guest sees competing booking", "document.querySelector('.gift-book-button')?.disabled&&document.querySelector('.gift-book-button')?.textContent==='Забронировано'");
                ui.run("(async()=>{const q=window.__giftOnline;const denied=await q.call(q.path+'/reservations/'+q.gift,'DELETE',undefined,q.guests[1-q.winner],q.id(),true);q.check(denied.status===403&&denied.body.code==='not_your_reservation');const cancelled=await q.call(q.path+'/reservations/'+q.gift,'DELETE',undefined,q.guests[q.winner],q.id(),true);q.check(cancelled.status===200&&cancelled.body.reservations.length===0);return true;})()");
                ui.clickText("Обновить");
                ui.await("native guest sees cancellation", "document.querySelector('.gift-book-button')?.textContent==='Забронировать'&&!document.querySelector('.gift-book-button').disabled");
                ui.run("(async()=>{const q=window.__giftOnline;q.recoveryAttempted=true;const r=await q.call('/owners/recover','POST',{recoverySecret:q.owner.recoverySecret,newDeviceSecret:q.newOwner},undefined,q.recoverId);q.check(r.status===200);q.recovered=true;const old=await q.call('/me/events','GET',undefined,q.owner.deviceSecret);q.check(old.status===401);const fresh=await q.call('/me/events','GET',undefined,q.newOwner);q.check(fresh.status===200&&fresh.body.events.length===1&&fresh.body.events[0].id===q.eventId);return true;})()");
            } finally {
                ui.beginCleanup();
                // Credentials are durably written BEFORE enrollment is attempted. A cancelled
                // consent (no owner key) therefore cannot have created a hosted owner.
                if(mutationAttempted&&target.getSharedPreferences("WSSecureStorageSharedPreferences",Context.MODE_PRIVATE).contains("gift-lists-v1_owner")) {
                    // If a reply was lost, replay only the identical recovery/deletion request.
                    // Never enumerate unrelated owners or delete by title, time range or database query.
                    ui.run("(async()=>{const q=window.__giftOnline;if(!q.owner)q.owner=await q.readOwner();if(q.recoveryAttempted&&!q.recovered){const r=await q.call('/owners/recover','POST',{recoverySecret:q.owner.recoverySecret,newDeviceSecret:q.newOwner},undefined,q.recoverId);q.check(r.status===200);q.recovered=true;}const owner=q.recovered?q.newOwner:q.owner.deviceSecret;const d=await q.call('/me','DELETE',undefined,owner,q.deleteId);q.check(d.status===200);const denied=await q.call('/me/events','GET',undefined,owner);q.check(denied.status===401);if(q.path){const gone=await q.call(q.path);q.check(gone.status===404);}delete window.__giftOnline;return true;})()");
                }
            }
        }
    }
}
