package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class OfflineAcceptanceTest {
    @Test public void editsSavesOfflineAndUsesRealEncryptedNativeStorage() throws Exception {
        try (WebRuntime ui = new WebRuntime()) {
            assertTrue("Four independent occasion choices", ((Number) ui.js("document.querySelectorAll('.occasion-choice').length")).intValue() == 4);
            ui.js("(()=>{document.querySelector('.occasion-choice').click();return true;})()");
            ui.await("editor is shown", "!!document.querySelector('#panel-event input[maxlength=\"120\"]')");
            ui.input("#panel-event input[maxlength=\"120\"]", WebRuntime.TITLE);
            ui.await("React accepted edit", "document.querySelector('.dirty-state').textContent==='Есть изменения'");
            ui.js("(()=>{document.querySelector('#tab-gifts').click();return true;})()");
            ui.await("gift editor is shown", "!!document.querySelector('#panel-gifts')");
            for(int i=1;i<=4;i++) {
                ui.clickText("Добавить подарок");
                ui.await("synthetic gift editor", "document.querySelectorAll('.gift-edit-item').length==="+i+"&&document.querySelector('.gift-edit-fields input[maxlength=\"200\"]')?.value===''");
                String name="Синтетический подарок "+i;
                ui.input(".gift-edit-fields input[maxlength=\"200\"]",name);
                ui.await("synthetic gift accepted", "[...document.querySelectorAll('.gift-expand-button span')].some(e=>e.textContent==="+JSONObject.quote(name)+")");
            }
            ui.clickText("Сохранить черновик");
            ui.await("local save acknowledged", "document.querySelector('.dirty-state').textContent==='Черновик сохранён'");
            assertTrue("Offline publish stays disabled", (Boolean) ui.js("[...document.querySelectorAll('button')].some(b=>b.textContent==='Сохранить онлайн'&&b.disabled)"));
            ui.js("(()=>{document.querySelector('#tab-event').click();return true;})()");
            ui.await("synthetic editor screenshot state", "!!document.querySelector('#panel-event')");
            ui.screenshot("offline-editor.png");
            ui.js("(()=>{document.querySelector('#tab-preview').click();return true;})()");
            ui.await("full preview is shown", "!!document.querySelector('#panel-preview')");
            for(int i=1;i<=4;i++)
                assertTrue("Full preview includes every synthetic gift",(Boolean)ui.js("document.querySelector('#panel-preview').innerText.includes("+JSONObject.quote("Синтетический подарок "+i)+")"));
            ui.screenshot("offline-preview.png");
            ui.screenshot("offline-preview-cards.png");
            ui.js("(()=>{document.activeElement?.blur();return true;})()");
            ui.back();
            ui.await("hardware Back returns to library", "!!document.querySelector('.occasion-grid')");
            assertTrue("Saved title visible", (Boolean) ui.js("document.body.innerText.includes("+JSONObject.quote(WebRuntime.TITLE)+")"));
            Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
            File drafts = new File(target.getFilesDir(), "gift-data-v1");
            File[] files = drafts.listFiles(); assertNotNull("Native private draft directory", files);
            boolean found = false;
            for (File file : files) {
                String text = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
                if (text.contains(WebRuntime.TITLE)) found = true;
                assertFalse("No owner secret in ordinary draft", text.contains("owner_"));
                assertFalse("No recovery secret in ordinary draft", text.contains("recovery_"));
            }
            assertTrue("Save reached actual native private filesystem", found);
            JSONObject options = new JSONObject().put("prefixedKey", WebRuntime.STORE_KEY).put("data", WebRuntime.STORE_VALUE);
            assertEquals("ok", ui.nativeCall("SecureStorage", "internalSetItem", options).getString("state"));
            JSONObject read = ui.nativeCall("SecureStorage", "internalGetItem", options);
            assertEquals("ok", read.getString("state"));
            assertTrue("Real bridge roundtrip", WebRuntime.STORE_VALUE.equals(read.getJSONObject("value").getString("data")));
            String ciphertext = target.getSharedPreferences("WSSecureStorageSharedPreferences", Context.MODE_PRIVATE).getString(WebRuntime.STORE_KEY, "");
            assertFalse("Plugin persisted encrypted material", ciphertext.isEmpty());
            assertFalse("Plaintext must not be in native preferences", ciphertext.contains(WebRuntime.STORE_VALUE));
            KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
            assertTrue("Key is held by Android Keystore", keys.containsAlias(WebRuntime.STORE_KEY));
        }
    }
}
