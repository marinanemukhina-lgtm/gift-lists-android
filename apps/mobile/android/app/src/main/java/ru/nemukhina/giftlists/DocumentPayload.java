package ru.nemukhina.giftlists;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Bounded UTF-8 document format; no Android or storage permissions involved. */
final class DocumentPayload {
 static final int MAX_BYTES=1024*1024;
 static final class TooLarge extends IOException { TooLarge(){super("Document exceeds size limit");} }
 static boolean validExport(String name,String contents){return name!=null&&name.matches("[a-zA-Z0-9_-]{1,100}\\.json")&&contents!=null&&contents.getBytes(StandardCharsets.UTF_8).length<=MAX_BYTES;}
 static String readUtf8(InputStream input) throws IOException {
  if(input==null)throw new IOException("No document input");
  ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;int total=0;
  while((count=input.read(buffer))!=-1){total+=count;if(total>MAX_BYTES)throw new TooLarge();output.write(buffer,0,count);}
  return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output.toByteArray())).toString();
 }
 private DocumentPayload(){}
}
