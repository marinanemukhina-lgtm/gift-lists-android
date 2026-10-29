package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.ContentResolver;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class DocumentsRuntimeTest {
    private ContentResolver resolver() {return InstrumentationRegistry.getInstrumentation().getContext().getContentResolver();}
    private void fixture(byte[] bytes) throws Exception {try(OutputStream output=resolver().openOutputStream(FixtureProvider.URI,"wt")){assertNotNull(output);output.write(bytes);}}
    private String readFixture() throws Exception {
        try(InputStream input=resolver().openInputStream(FixtureProvider.URI)){assertNotNull(input);ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] bytes=new byte[4096];int n;while((n=input.read(bytes))!=-1)output.write(bytes,0,n);return output.toString("UTF-8");}
    }
    private Instrumentation.ActivityMonitor selectedDocument() {
        Instrumentation.ActivityMonitor monitor = new Instrumentation.ActivityMonitor() {
            @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                if (Intent.ACTION_OPEN_DOCUMENT.equals(intent.getAction()) || Intent.ACTION_CREATE_DOCUMENT.equals(intent.getAction()))
                    return new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(FixtureProvider.URI));
                return null;
            }
        };
        InstrumentationRegistry.getInstrumentation().addMonitor(monitor); return monitor;
    }
    @Test public void realSystemPickerCancellationReturnsWithoutChangingDrafts() throws Exception {
        try(WebRuntime ui=new WebRuntime()) {
            int before=((Number)ui.js("document.querySelectorAll('.library-list button').length")).intValue();
            ui.begin("window.Capacitor.nativePromise('GiftDocuments','importFile',{})");
            boolean visible=false;long until=SystemClock.elapsedRealtime()+15000;
            while(SystemClock.elapsedRealtime()<until&&!visible){
                for(String line:WebRuntime.shell("dumpsys activity activities").split("\n"))
                    if(line.contains("ResumedActivity")&&line.contains("documentsui"))visible=true;
                if(!visible)SystemClock.sleep(200);
            }
            assertTrue("A real Android DocumentsUI picker must be resumed",visible);
            ui.back();
            JSONObject result=ui.result();assertEquals("ok",result.getString("state"));
            assertTrue("Picker Back must resolve cancellation",result.getJSONObject("value").getBoolean("cancelled"));
            assertEquals("Cancellation must not alter local library",before,((Number)ui.js("document.querySelectorAll('.library-list button').length")).intValue());
        }
    }
    @Test public void nativeProviderIoRoundtripAndRejectsMalformedOrOversizedFiles() throws Exception {
        // Intercepts selection only: actual native callbacks, ContentResolver I/O and UTF-8 limits run.
        // This does NOT claim manual DocumentsUI folder/filename navigation acceptance.
        Instrumentation.ActivityMonitor monitor=selectedDocument();
        try(WebRuntime ui=new WebRuntime()) {
            String payload="{\"format\":\"synthetic-only\",\"title\":\"Проверка UTF-8\"}";
            JSONObject exported=ui.nativeCall("GiftDocuments","exportFile",new JSONObject().put("name","synthetic.json").put("contents",payload));
            assertEquals("ok",exported.getString("state"));assertFalse(exported.getJSONObject("value").getBoolean("cancelled"));
            assertEquals(payload,readFixture());
            JSONObject imported=ui.nativeCall("GiftDocuments","importFile",new JSONObject());
            assertEquals("ok",imported.getString("state"));assertEquals(payload,imported.getJSONObject("value").getString("contents"));
            fixture(new byte[]{(byte)0xc3,(byte)0x28});
            assertEquals("error",ui.nativeCall("GiftDocuments","importFile",new JSONObject()).getString("state"));
            fixture(new byte[1024*1024+1]);
            assertEquals("error",ui.nativeCall("GiftDocuments","importFile",new JSONObject()).getString("state"));
            assertEquals("error",ui.nativeCall("GiftDocuments","exportFile",new JSONObject().put("name","../unsafe.json").put("contents",payload)).getString("state"));
        } finally {
            InstrumentationRegistry.getInstrumentation().removeMonitor(monitor);
            resolver().delete(FixtureProvider.URI,null,null);
        }
    }
}
