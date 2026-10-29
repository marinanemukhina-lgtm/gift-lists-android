/** Operator-only CLI. Requires the server DATABASE_URL; never expose it in a client.
 * No automatic moderation or external writes run merely by importing this module. */
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createPgDatabase} from './pg';
import type {Database} from './database';
export async function moderate(db:Database,command:string,id?:string,confirmed=false):Promise<unknown> {
  if(command==='list-reports')return (await db.query("SELECT r.id,r.event_id,r.reason,r.created_at FROM reports r WHERE r.state='pending' ORDER BY r.created_at LIMIT 100")).rows;
  if(!confirmed)throw new Error('A mutating operator action requires --confirm.');
  if(!id||!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('An exact report/list ID is required.');
  return db.transaction(async tx=>{
    await tx.query('SELECT id FROM api_lock WHERE id=1 FOR UPDATE');
    if(command==='resolve-report'){
      const changed=await tx.query("UPDATE reports SET state='resolved',resolved_at=now() WHERE id=$1 AND state='pending' RETURNING id",[id]);
      return {resolved:changed.rows.length===1};
    }
    if(command==='remove-list'){
      const exists=(await tx.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[id])).rows.length>0;
      if(!exists)return {removed:false};
      await tx.query('DELETE FROM operation_receipts WHERE scope LIKE $1 OR response ->> \'eventId\'=$2',[`guest:${id}:%`,id]);
      await tx.query('DELETE FROM events WHERE id=$1',[id]);
      await tx.query('INSERT INTO moderation_actions(event_hash,action) VALUES($1,$2)',[createHash('sha256').update(id).digest('hex'),'remove-list']);
      return {removed:true};
    }
    throw new Error('Unknown operator command.');
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [command,id,...flags]=process.argv.slice(2);const db=createPgDatabase(process.env.DATABASE_URL||'');
  moderate(db,command,id,flags.includes('--confirm')).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{process.stderr.write(error instanceof Error&&/requires --confirm|exact report|Unknown operator/.test(error.message)?error.message+'\n':'Operator command failed; connection details suppressed.\n');process.exitCode=1;}).finally(()=>db.close());
}
