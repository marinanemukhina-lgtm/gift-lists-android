package ru.nemukhina.giftlists;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public final class DocumentPayloadTest {
 @Test public void preservesUtf8RecoveryAndDraftText() throws Exception {String value="{\"title\":\"Подарки к свадьбе\"}";assertEquals(value,DocumentPayload.readUtf8(new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8))));}
 @Test public void rejectsMalformedUtf8WithoutReplacingUserData(){assertThrows(CharacterCodingException.class,()->DocumentPayload.readUtf8(new ByteArrayInputStream(new byte[]{(byte)0xC3,(byte)0x28})));}
 @Test public void refusesOversizedImport(){assertThrows(DocumentPayload.TooLarge.class,()->DocumentPayload.readUtf8(new ByteArrayInputStream(new byte[DocumentPayload.MAX_BYTES+1])));}
 @Test public void boundsExportFilenameAndEncodedBytes(){assertTrue(DocumentPayload.validExport("gift-lists-recovery.json","{}"));assertFalse(DocumentPayload.validExport("../../owner.json","{}"));assertFalse(DocumentPayload.validExport("recovery.txt","{}"));assertFalse(DocumentPayload.validExport("draft.json","я".repeat(DocumentPayload.MAX_BYTES)));assertFalse(DocumentPayload.validExport("draft.json",null));}
}
