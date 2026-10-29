package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withId;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import androidx.test.espresso.NoMatchingViewException;
import androidx.test.espresso.NoMatchingRootException;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import java.util.UUID;
import org.json.JSONTokener;

/** Separate online driver: does not relax the offline driver's constructor or assertions. */
final class OnlineWebRuntime implements AutoCloseable {
    private final ActivityScenario<MainActivity> scenario;
    private MainActivity activity;
    private final long started=SystemClock.elapsedRealtime();
    private long deadline=started+400000;
    private boolean cleaning=false;
    private long remaining(){return Math.max(0,deadline-SystemClock.elapsedRealtime());}
    private void requireOperationBudget(){assertTrue("Insufficient bounded operation budget; preserve cleanup reserve",remaining()>=90000);}
    void beginCleanup(){
        if(!cleaning){cleaning=true;deadline=Math.min(started+520000,SystemClock.elapsedRealtime()+120000);}
    }
    OnlineWebRuntime() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(value->activity=value);
        assertNotNull("Supported system WebView required",WebView.getCurrentWebViewPackage());
        assertTrue("WebView100 minimum",Integer.parseInt(WebView.getCurrentWebViewPackage().versionName.split("\\.")[0])>=100);
        await("online native library", "!!document.querySelector('.occasion-grid')&&!document.querySelector('.offline-notice')");
        assertTrue("Bundled HTTPS native origin only",Boolean.TRUE.equals(js("location.origin==='https://localhost'")));
        assertTrue("Synthetic demo only",Boolean.TRUE.equals(js("!!document.querySelector('.demo-notice')")));
        assertTrue("Fresh isolated library only",Boolean.TRUE.equals(js("document.querySelectorAll('.library-list button').length===0")));
    }
    Object js(String expression) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().evaluateJavascript("("+expression+")",value->{result.set(value);done.countDown();}));
        assertTrue("Native DOM evaluation timeout",done.await(Math.min(8000,remaining()),TimeUnit.MILLISECONDS));
        return new JSONTokener(result.get()).nextValue();
    }
    void await(String description,String expression) throws Exception {
        long until=SystemClock.elapsedRealtime()+Math.min(90000,remaining());
        while(SystemClock.elapsedRealtime()<until){if(Boolean.TRUE.equals(js(expression)))return;SystemClock.sleep(150);}
        fail(description+" timed out; app contents withheld");
    }
    void clickText(String text) throws Exception {
        requireOperationBudget();
        assertTrue("Expected enabled synthetic UI action",Boolean.TRUE.equals(js("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==="+JSONObject.quote(text)+"&&!x.disabled);if(!b)return false;b.click();return true;})()")));
    }
    void input(String selector,String value) throws Exception {
        assertTrue("Expected synthetic input",Boolean.TRUE.equals(js("(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSONObject.quote(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()")));
    }
    void acceptSyntheticConsent() throws Exception {
        requireOperationBudget();
        String message="Это временное личное демо. Отправляйте только вымышленные данные, без имён детей, адресов и контактов. Создать доступ и отправить список?";
        long until=SystemClock.elapsedRealtime()+Math.min(20000,remaining());
        while(SystemClock.elapsedRealtime()<until){
            try {
                onView(withText(message)).inRoot(isDialog()).check(matches(isDisplayed()));
                onView(withId(android.R.id.button1)).inRoot(isDialog()).perform(click());
                return;
            } catch(NoMatchingViewException|NoMatchingRootException notReady){SystemClock.sleep(150);}
        }
        fail("Expected exact synthetic consent dialog; no other confirmation accepted");
    }
    void run(String expression) throws Exception {
        requireOperationBudget();
        // Only boolean completion crosses into test output, never response bodies/capabilities.
        String token=JSONObject.quote(UUID.randomUUID().toString());
        js("(()=>{window.__giftOnlineToken="+token+";window.__giftOnlineResult='pending';Promise.resolve().then(()=>"+expression+").then(v=>{if(window.__giftOnlineToken==="+token+")window.__giftOnlineResult=v===true?'ok':'error';},()=>{if(window.__giftOnlineToken==="+token+")window.__giftOnlineResult='error';});return true;})()");
        await("bounded hosted operation", "window.__giftOnlineResult!=='pending'");
        assertTrue("Hosted synthetic operation failed; response withheld",Boolean.TRUE.equals(js("window.__giftOnlineResult==='ok'")));
    }
    @Override public void close(){scenario.close();}
}
