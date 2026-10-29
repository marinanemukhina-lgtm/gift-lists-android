package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Test-process-only DOM driver: no debug port, production test hook or network fixture. */
final class WebRuntime implements AutoCloseable {
    final ActivityScenario<MainActivity> scenario;
    private MainActivity activity;
    static final String TITLE = "OFFLINE SYNTHETIC ACCEPTANCE";
    static final String STORE_KEY = "gift-lists-v1_ci-synthetic-only";
    static final String STORE_VALUE = "synthetic-native-encryption-check-not-an-owner-secret";
    WebRuntime() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(value -> activity = value);
        assertNotNull("A system WebView provider is required", WebView.getCurrentWebViewPackage());
        int major = Integer.parseInt(WebView.getCurrentWebViewPackage().versionName.split("\\.")[0]);
        assertTrue("WebView below supported minimum100: use a reviewed updated provider; do not bypass", major >= 100);
        await("bundled native UI starts", "!!document.querySelector('.occasion-grid')");
        assertTrue("Expected truly offline device", (Boolean) js("!!document.querySelector('.offline-notice')"));
    }
    Object js(String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            activity.getBridge().getWebView().evaluateJavascript("(" + expression + ")", value -> {result.set(value); done.countDown();}));
        assertTrue("WebView evaluation timed out", done.await(8, TimeUnit.SECONDS));
        return new JSONTokener(result.get()).nextValue();
    }
    void await(String description, String expression) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 25000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (Boolean.TRUE.equals(js(expression))) return;
            SystemClock.sleep(150);
        }
        fail(description + " timed out (no application contents included)");
    }
    void clickText(String text) throws Exception {
        String quoted = JSONObject.quote(text);
        assertTrue("Expected enabled button: " + text, (Boolean) js("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===" + quoted + "&&!x.disabled);if(!b)return false;b.click();return true;})()"));
    }
    void input(String selector, String value) throws Exception {
        assertTrue("Expected input selector", (Boolean) js("(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSONObject.quote(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()"));
    }
    void begin(String expression) throws Exception {
        js("(()=>{window.__giftQa={state:'pending'};Promise.resolve(" + expression + ").then(value=>window.__giftQa={state:'ok',value},()=>window.__giftQa={state:'error'});return true;})()");
    }
    JSONObject result() throws Exception {
        await("native promise returns", "window.__giftQa&&window.__giftQa.state!=='pending'");
        return new JSONObject((String) js("JSON.stringify(window.__giftQa)"));
    }
    JSONObject nativeCall(String plugin, String method, JSONObject options) throws Exception {
        begin("window.Capacitor.nativePromise("+JSONObject.quote(plugin)+","+JSONObject.quote(method)+","+options+")");
        return result();
    }
    void screenshot(String name) throws Exception {
        String expected;
        switch(name) {
            case "offline-editor.png": expected="!!document.querySelector('#panel-event')"; break;
            case "offline-preview-cards.png": expected="document.querySelectorAll('#panel-preview .guest-preview-full .gift-card').length===4"; break;
            case "offline-preview.png": expected="!!document.querySelector('#panel-preview')"; break;
            default: throw new AssertionError("Screenshot name is not allowlisted");
        }
        String title=name.equals("offline-editor.png")?
            "document.querySelector('#panel-event input[maxlength=\"120\"]')?.value":
            "document.querySelector('#panel-preview .guest-preview-full .event-title-group h1')?.textContent";
        assertTrue("Capture only known synthetic admin screens, never access/recovery", (Boolean) js(
            "!!document.querySelector('.admin-sheet')&&("+title+")==="+JSONObject.quote(TITLE)+"&&("+expected+")"));
        String scrollTarget=name.equals("offline-preview-cards.png")?"#panel-preview .guest-preview-full .gift-grid":name.equals("offline-preview.png")?"#panel-preview .guest-preview-full":"#panel-event";
        js("(()=>{document.activeElement?.blur();document.querySelector("+JSONObject.quote(scrollTarget)+")?.scrollIntoView({block:'start'});return true;})()");
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        SystemClock.sleep(250);
        // Native screen pixels; no WebView debug hook, DOM rasterizer or app-private read.
        // Only these three fixed synthetic screenshots can be collected by the CI script.
        shell("screencap -p /data/local/tmp/gift-qa-"+name);
    }
    void back() throws Exception {shell("input keyevent 4");}
    static String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
             InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] bytes = new byte[4096]; int n;
            while ((n = input.read(bytes)) != -1 && output.size() < 262144) output.write(bytes, 0, n);
            return output.toString("UTF-8");
        }
    }
    @Override public void close() {scenario.close();}
}
