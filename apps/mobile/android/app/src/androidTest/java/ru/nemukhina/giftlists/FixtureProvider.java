package ru.nemukhina.giftlists;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileNotFoundException;

/** Fixed synthetic file ONLY in test APK. No target-app files or arbitrary paths are exposed. */
public final class FixtureProvider extends ContentProvider {
    public static final Uri URI = Uri.parse("content://ru.nemukhina.giftlists.test.fixture/document");
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!URI.equals(uri)) throw new FileNotFoundException("Unknown synthetic fixture");
        return ParcelFileDescriptor.open(new File(getContext().getCacheDir(), "synthetic-document.json"), ParcelFileDescriptor.parseMode(mode));
    }
    @Override public String getType(Uri uri) { return "application/json"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) {
        return URI.equals(uri) && new File(getContext().getCacheDir(), "synthetic-document.json").delete() ? 1 : 0;
    }
}
