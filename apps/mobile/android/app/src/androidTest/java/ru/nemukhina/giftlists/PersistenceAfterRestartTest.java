package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** CI force-stops the app between the seed test and this separate instrumentation process. */
@RunWith(AndroidJUnit4.class)
public final class PersistenceAfterRestartTest {
    @Test public void savedDraftAndEncryptedValueSurviveProcessDeath() throws Exception {
        try (WebRuntime ui = new WebRuntime()) {
            ui.await("persisted draft is loaded after force-stop", "document.body.innerText.includes("+JSONObject.quote(WebRuntime.TITLE)+")");
            ui.js("(()=>{[...document.querySelectorAll('.library-list button')].find(b=>b.textContent.includes("+JSONObject.quote(WebRuntime.TITLE)+")).click();return true;})()");
            ui.await("persisted editable title", "document.querySelector('#panel-event input[maxlength=\"120\"]')?.value==="+JSONObject.quote(WebRuntime.TITLE));
            JSONObject options = new JSONObject().put("prefixedKey", WebRuntime.STORE_KEY);
            JSONObject read = ui.nativeCall("SecureStorage", "internalGetItem", options);
            assertEquals("ok", read.getString("state"));
            assertTrue("Keystore decryption survived process death", WebRuntime.STORE_VALUE.equals(read.getJSONObject("value").getString("data")));
            assertEquals("ok", ui.nativeCall("SecureStorage", "internalRemoveItem", options).getString("state"));
            JSONObject removed = ui.nativeCall("SecureStorage", "internalGetItem", options);
            assertTrue("Synthetic credential was removed", removed.getJSONObject("value").isNull("data"));
        }
    }
}
