package ru.nemukhina.giftlists;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;

/** User-selected single-document import/export. No storage permission and no URI persistence. */
@CapacitorPlugin(name="GiftDocuments")
public final class GiftDocumentsPlugin extends Plugin {
    private volatile boolean pickerOpen = false;

    @PluginMethod public void capabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("secureStorage", getBridge().getPlugin("SecureStorage") != null);
        call.resolve(result);
    }

    @PluginMethod public synchronized void exportFile(PluginCall call) {
        String name = call.getString("name");
        String contents = call.getString("contents");
        if (pickerOpen) { call.reject("Дождитесь закрытия выбора файла."); return; }
        if (!DocumentPayload.validExport(name, contents)) {
            call.reject("Некорректный или слишком большой файл."); return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        pickerOpen = true;
        try { startActivityForResult(call, intent, "exportResult"); }
        catch (Exception error) { pickerOpen = false; call.reject("Не удалось открыть системное сохранение файла."); }
    }

    @PluginMethod public synchronized void importFile(PluginCall call) {
        if (pickerOpen) { call.reject("Дождитесь закрытия выбора файла."); return; }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
        pickerOpen = true;
        try { startActivityForResult(call, intent, "importResult"); }
        catch (Exception error) { pickerOpen = false; call.reject("Не удалось открыть системный выбор файла."); }
    }

    private boolean cancelled(PluginCall call, ActivityResult result) {
        if (call == null) { pickerOpen = false; return true; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            pickerOpen = false;
            JSObject output = new JSObject(); output.put("cancelled", true); call.resolve(output); return true;
        }
        return false;
    }

    @ActivityCallback private void exportResult(PluginCall call, ActivityResult result) {
        if (cancelled(call, result)) return;
        Uri uri = result.getData().getData();
        String contents = call.getString("contents");
        if (contents == null || contents.getBytes(StandardCharsets.UTF_8).length > DocumentPayload.MAX_BYTES) { pickerOpen = false; call.reject("Содержимое файла недоступно. Повторите сохранение."); return; }
        getBridge().execute(() -> {
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new java.io.IOException();
            output.write(contents.getBytes(StandardCharsets.UTF_8)); output.flush();
            JSObject response = new JSObject(); response.put("cancelled", false); call.resolve(response);
        } catch (Exception error) { call.reject("Не удалось сохранить файл. Проверьте выбранную папку и повторите."); }
        finally { pickerOpen = false; }
        });
    }

    @ActivityCallback private void importResult(PluginCall call, ActivityResult result) {
        if (cancelled(call, result)) return;
        Uri uri = result.getData().getData();
        getBridge().execute(() -> {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            String contents = DocumentPayload.readUtf8(input);
            JSObject response = new JSObject(); response.put("cancelled", false); response.put("contents", contents); call.resolve(response);
        } catch (DocumentPayload.TooLarge error) { call.reject("Файл превышает 1 МБ."); }
        catch (CharacterCodingException error) { call.reject("Файл должен быть текстом UTF-8."); }
        catch (Exception error) { call.reject("Не удалось прочитать файл. Локальные списки не изменены."); }
        finally { pickerOpen = false; }
        });
    }
}
