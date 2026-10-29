import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir} from 'node:fs/promises';
import type {Database,SqlExecutor} from '../../services/api/src';
/** DEV/TEST ONLY. Never imported by apps/web or services/api production code. */
export async function createPreviewDatabase(directory:string):Promise<Database&{close():Promise<void>}>{
 await mkdir(directory,{recursive:true});const pg=new PGlite(directory);await pg.waitReady;
 try{const has=(await pg.query<{name:string|null}>("SELECT to_regclass('public.schema_migrations')::text AS name")).rows[0]?.name;if(!has)await pg.exec(await readFile(new URL('../../services/api/migrations/001_initial.sql',import.meta.url),'utf8'));else{const applied=await pg.query("SELECT version FROM schema_migrations WHERE version='001_initial'");if(!applied.rows.length)throw Error('Preview schema is not supported. Choose a new disposable PREVIEW_DB_DIR.');}}
 catch(error){await pg.close();throw error;}
 const adapt=(source:{query:(sql:string,params?:unknown[])=>Promise<any>}):SqlExecutor=>({query:async(sql,params)=>{const result=await source.query(sql,params);return {rows:result.rows,rowCount:result.affectedRows}}});
 return {...adapt(pg),transaction:fn=>pg.transaction(tx=>fn(adapt(tx))),close:()=>pg.close()};
}
