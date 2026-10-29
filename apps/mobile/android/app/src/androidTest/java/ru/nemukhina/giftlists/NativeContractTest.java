package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Run on an authorized Android runtime after signing test APKs separately. */
@RunWith(AndroidJUnit4.class)
public final class NativeContractTest {
 private static String read(InputStream input) throws Exception {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int n;while((n=input.read(bytes))!=-1){out.write(bytes,0,n);}return out.toString("UTF-8");}
 @Test public void packageHasOfflineAssetsAndNoRemoteWebView() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertEquals("ru.nemukhina.giftlists",context.getPackageName());
  try(InputStream input=context.getAssets().open("public/index.html")){assertTrue(read(input).contains("Список подарков"));}
  try(InputStream input=context.getAssets().open("capacitor.config.json")){JSONObject config=new JSONObject(read(input));assertFalse(config.getJSONObject("server").has("url"));assertFalse(config.getJSONObject("android").getBoolean("webContentsDebuggingEnabled"));}
  assertEquals(0,context.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
  PackageInfo info=context.getPackageManager().getPackageInfo(context.getPackageName(),android.content.pm.PackageManager.GET_PERMISSIONS);
  if(info.requestedPermissions!=null){assertFalse(Arrays.asList(info.requestedPermissions).contains("android.permission.READ_EXTERNAL_STORAGE"));assertFalse(Arrays.asList(info.requestedPermissions).contains("android.permission.WRITE_EXTERNAL_STORAGE"));}
 }
}
